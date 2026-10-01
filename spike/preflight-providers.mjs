// Provider preflight. For every configured arm model it (1) checks the id is in
// the provider's live /models list (missing = that model fails, never
// substituted), (2) actually CALLS it with the real ~16KB builder prompt (listed
// != callable; a reasoning model gets 4096 tokens, never a tiny ceiling), and
// (3) surfaces any deprecation/sunset header, failing loudly if a configured
// model is deprecated within 14 days. Every response header is recorded
// verbatim (minus set-cookie). Never logs a key. Gemini is not called here.
//
// NVIDIA calls are paced 1 per 4 s and abort only on 3 CONSECUTIVE 429s. There
// is no burst test: a 20-request burst cannot measure a sequential agentic
// workload, and its 429s only ever prevented data collection.
//
// Env: PAID_MODEL (allowlisted paid OpenRouter id), ARM_A_MODEL, ARM_B_MODEL (OpenRouter :free
// ids), NVIDIA_MODEL, NVIDIA_FALLBACK_MODEL (explicitly configured, not a first-listed fallback).
// INCLUDE_PAID_ARM / INCLUDE_ARM_A / INCLUDE_ARM_B / INCLUDE_ARM_C = "true" select which arms are
// probed; an arm that is off is never called.
// Hard gate: exit 1 if no model accepts the prompt, a configured model is near deprecation, or a
// paid arm is on and OpenRouter /key usage (the spend baseline) cannot be read.
// Job outputs: or_p_ok, or_a_ok, or_b_ok, or_usage_start, nvidia_ok, nvidia_model.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";
import { isAllowed, isFree } from "./allowed-model.mjs";

const OR_BASE = process.env.PF_OPENROUTER_BASE ?? "https://openrouter.ai/api/v1"; // override is for the local smoke only
const NV_BASE = "https://integrate.api.nvidia.com/v1";
const P_MODEL = process.env.PAID_MODEL || "anthropic/claude-haiku-4.5";
const on = (n) => process.env[n] === "true";
const A_MODEL = process.env.ARM_A_MODEL || "cohere/north-mini-code:free";
const B_MODEL = process.env.ARM_B_MODEL || "poolside/laguna-s-2.1:free";
const NV_MODEL = process.env.NVIDIA_MODEL || "nvidia/nemotron-3-ultra-550b-a55b";
const NV_FALLBACK = process.env.NVIDIA_FALLBACK_MODEL || "moonshotai/kimi-k3";
const NV_PACE_MS = 4000;
const MIN_PROMPT_TOKENS = 2500; // 16KB of prompt is ~4-5k tokens; fewer means it was not received
const DEPRECATION_WINDOW_DAYS = 14;

const prompt =
  readFileSync("spike/inputs/builder.md", "utf-8") +
  "\n\n## Brief\n" +
  readFileSync("spike/inputs/sample-brief.json", "utf-8") +
  "\n\n## PREFLIGHT PROBE\nThis is a connectivity probe, not a build. Do not write code or files. Reply with exactly: OK";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const allHeaders = (h) => Object.fromEntries([...h.entries()].filter(([k]) => k.toLowerCase() !== "set-cookie"));
const problems = []; // loud failures, collected so the JSON artifact is still written

async function chat(base, key, model, content, max_tokens) {
  // Every OpenRouter call must name an allowlisted id; one paid call already slipped through a fallback.
  if (base === OR_BASE && !isAllowed(model)) throw new Error(`refusing non-allowlisted OpenRouter id ${model}`);
  const start = Date.now();
  try {
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, messages: [{ role: "user", content }], max_tokens }),
    });
    const text = await res.text();
    let body = {};
    try { body = JSON.parse(text); } catch {}
    const choice = body?.choices?.[0];
    return {
      model, status: res.status, ok: res.ok, latency_ms: Date.now() - start,
      headers: allHeaders(res.headers),
      echoed_model: body?.model ?? null,
      prompt_tokens: body?.usage?.prompt_tokens ?? null,
      completion_tokens: body?.usage?.completion_tokens ?? null,
      finish_reason: choice?.finish_reason ?? null,
      content_empty: !(choice?.message?.content ?? "").length,
      content_preview: (choice?.message?.content ?? "").slice(0, 40),
      error_body: res.ok ? undefined : text.slice(0, 1500),
    };
  } catch (e) {
    return { model, ok: false, status: null, latency_ms: Date.now() - start, error_body: String(e) };
  }
}

// finish_reason "error" with HTTP 200 is a provider failure, not an acceptance.
const accepted = (r) => r.ok && r.finish_reason !== "error" && (r.prompt_tokens === null || r.prompt_tokens >= MIN_PROMPT_TOKENS);

// Surface deprecation/sunset headers; flag a configured model that is gone or going within the window.
function deprecation(provider, r) {
  const found = Object.entries(r.headers ?? {}).filter(([k]) => /deprecat|sunset/i.test(k));
  r.deprecation_headers = Object.fromEntries(found);
  for (const [k, v] of found) {
    const t = Date.parse(v);
    if (Number.isNaN(t)) { console.log(`::warning::${provider} ${r.model}: unparsable ${k} header "${v}"`); continue; }
    const days = (t - Date.now()) / 86_400_000;
    console.log(`  ${provider} ${r.model}: ${k}=${v} (${days.toFixed(1)} days)`);
    if (days < DEPRECATION_WINDOW_DAYS) problems.push(`${provider} model ${r.model} is deprecated within ${DEPRECATION_WINDOW_DAYS} days (${k}: ${v})`);
  }
}

async function liveModels(base, key) {
  const res = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${key}` } }).catch(() => null);
  return res?.ok ? ((await res.json().catch(() => ({})))?.data ?? []) : null;
}

async function orKeyInfo(key) {
  const out = {};
  for (const [name, path] of [["key", "/key"], ["credits", "/credits"]]) {
    try {
      const res = await fetch(OR_BASE + path, { headers: { Authorization: `Bearer ${key}` } });
      const body = await res.json().catch(() => ({}));
      if (body?.data) delete body.data.label; // label embeds a key prefix
      out[name] = { status: res.status, headers: allHeaders(res.headers), body };
    } catch (e) {
      out[name] = { error: String(e) };
    }
  }
  return out;
}

// One NVIDIA call, paced; retries only on 429 and gives up after 3 in a row.
let lastNv = 0;
async function nvChat(key, model, content, max_tokens) {
  let r;
  for (let i = 0; i < 3; i++) {
    const wait = lastNv + NV_PACE_MS - Date.now();
    if (wait > 0) await sleep(wait);
    lastNv = Date.now();
    r = await chat(NV_BASE, key, model, content, max_tokens);
    if (r.status !== 429) return r;
  }
  r.classification = "provider_rate_limited";
  return r;
}

const out = { prompt_bytes: Buffer.byteLength(prompt), openrouter: {}, nvidia: {} };

// ---- OpenRouter: arms A and B ----
const orKey = process.env.OPENROUTER_API_KEY;
const orOk = {};
const orArms = [["p", P_MODEL, on("INCLUDE_PAID_ARM")], ["a", A_MODEL, on("INCLUDE_ARM_A")], ["b", B_MODEL, on("INCLUDE_ARM_B")]].filter(([, , included]) => included);
let usageStart = "";
if (orArms.length === 0) {
  out.openrouter.skipped = "no OpenRouter arm is on";
} else if (!orKey) {
  out.openrouter.error = "OPENROUTER_API_KEY not set";
} else {
  out.openrouter.key_before = await orKeyInfo(orKey);
  const usage = out.openrouter.key_before.key?.body?.data?.usage;
  if (typeof usage === "number") usageStart = String(usage);
  else if (orArms.some(([, m]) => !isFree(m))) problems.push("OpenRouter /key usage unreadable: the spend ceiling cannot be enforced, so the paid arm must not run");
  const live = await liveModels(OR_BASE, orKey);
  out.openrouter.full_prompt = [];
  for (const [arm, model] of orArms.map(([a, m]) => [a, m])) {
    if (!isAllowed(model)) {
      out.openrouter.full_prompt.push({ model, ok: false, accepted: false, error_body: "not allowlisted (config error) - never called" });
      problems.push(`OpenRouter model ${model} is not allowlisted (config error)`);
      orOk[arm] = false;
      continue;
    }
    const meta = live?.find((m) => m.id === model);
    if (!live || !meta) {
      out.openrouter.full_prompt.push({ model, ok: false, accepted: false, error_body: live ? "requested id not in live /models — fails, no substitution" : "could not read /models" });
      orOk[arm] = false;
      continue;
    }
    if (meta.expiration_date) {
      const days = (Date.parse(meta.expiration_date) - Date.now()) / 86_400_000;
      if (days < DEPRECATION_WINDOW_DAYS) problems.push(`OpenRouter model ${model} expires ${meta.expiration_date}`);
    }
    // Same model, same prompt: upstream shared-pool 429s are transient, so wait and re-ask (3 tries, 25 s apart). No substitution.
    let r = await chat(OR_BASE, orKey, model, prompt, 4096);
    for (let i = 0; i < 2 && r.status === 429; i++) { await sleep(25_000); r = await chat(OR_BASE, orKey, model, prompt, 4096); }
    r.accepted = accepted(r);
    r.context_length = meta.context_length ?? null;
    r.pricing = meta.pricing ?? null;
    if (!isFree(model) && Number(meta.pricing?.prompt) === 0) problems.push(`${model}: expected a paid model but /models lists it at zero prompt price`);
    r.expiration_date = meta.expiration_date ?? null;
    deprecation("OpenRouter", r);
    out.openrouter.full_prompt.push(r);
    orOk[arm] = r.accepted === true;
  }
  out.openrouter.key_after = await orKeyInfo(orKey);
}

// ---- NVIDIA: arm C. Configured model first, then the configured fallback. ----
const nvKey = process.env.NVIDIA_API_KEY;
let nvModel = "";
if (!on("INCLUDE_ARM_C")) {
  out.nvidia.skipped = "arm C is off";
} else if (!nvKey) {
  out.nvidia.error = "NVIDIA_API_KEY not set";
} else {
  const live = await liveModels(NV_BASE, nvKey);
  out.nvidia.full_prompt = [];
  for (const model of [NV_MODEL, NV_FALLBACK]) {
    if (!live || !live.some((m) => m.id === model)) {
      out.nvidia.full_prompt.push({ model, ok: false, accepted: false, error_body: live ? "id not in live /models — fails, no substitution" : "could not read /models" });
      continue;
    }
    const r = await nvChat(nvKey, model, prompt, 4096);
    r.accepted = accepted(r);
    deprecation("NVIDIA", r);
    out.nvidia.full_prompt.push(r);
    if (r.accepted) { nvModel = model; break; }
  }
  out.nvidia.chosen_model = nvModel || null;
}

out.gate = { or_p_ok: orOk.p === true, or_usage_start: usageStart, or_a_ok: orOk.a === true, or_b_ok: orOk.b === true, nvidia_ok: nvModel !== "", nvidia_model: nvModel, problems };
out.gate.pass = (out.gate.or_p_ok || out.gate.or_a_ok || out.gate.or_b_ok || out.gate.nvidia_ok) && problems.length === 0;

mkdirSync("spike/out", { recursive: true });
writeFileSync("spike/out/preflight-providers.json", JSON.stringify(out, null, 2));
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `or_p_ok=${out.gate.or_p_ok}\nor_usage_start=${usageStart}\nor_a_ok=${out.gate.or_a_ok}\nor_b_ok=${out.gate.or_b_ok}\nnvidia_ok=${out.gate.nvidia_ok}\nnvidia_model=${nvModel}\n`);
}

console.log(`Prompt bytes: ${out.prompt_bytes}`);
for (const r of [...(out.openrouter.full_prompt ?? []), ...(out.nvidia.full_prompt ?? [])]) {
  console.log(`  ${r.model}: status=${r.status} accepted=${r.accepted} prompt_tokens=${r.prompt_tokens} finish=${r.finish_reason} empty=${r.content_empty} err=${r.error_body ?? ""}`.slice(0, 600));
}
console.log(`Gate: ${JSON.stringify(out.gate)}`);
for (const p of problems) console.error(`::error::${p}`);
if (!out.gate.pass) {
  console.error("::error::Preflight failed (no provider accepted the full prompt, or a configured model is near deprecation). Arms must not run — stop and report.");
  process.exit(1);
}
