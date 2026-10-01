// Extended provider preflight (run 6). Replaces the local run: for OpenRouter
// and NVIDIA it sends the REAL builder prompt (builder.md + brief, ~16KB — the
// exact text run-arm.sh gives a builder), not a ping, because "does the
// provider accept a real prompt at all" is what killed Groq. Records every
// response header verbatim (minus set-cookie) so limits are measured, not
// documented. Never logs a key. Gemini is the control arm only and is not
// called here (20 req/day; every preflight call would spend the arm's budget).
//
// Hard gate: exit 1 unless at least one provider accepts the full prompt.
// Job outputs (GITHUB_OUTPUT): openrouter_ok, nvidia_ok, nvidia_arm.
import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from "node:fs";

const OR_BASE = "https://openrouter.ai/api/v1";
const NV_BASE = "https://integrate.api.nvidia.com/v1";
const OR_MODEL = process.env.OPENROUTER_MODEL || "poolside/laguna-s-2.1:free";
// Informational full-prompt probes (arms only use OR_MODEL). Never substituted.
const OR_EXTRA = ["cohere/north-mini-code:free", "qwen/qwen3.8-27b:free"].filter((m) => m !== OR_MODEL);
const NV_MODEL = "nvidia/nemotron-3-super-120b-a12b";
const NV_PROBE = ["nvidia/nemotron-3-ultra-550b-a55b", "moonshotai/kimi-k3", "z-ai/glm-5.3", "openai/gpt-oss-20b"];
const NV_BURST = 15; // 1 full + 4 probes + 15 burst = 20 NVIDIA chat requests total
const MIN_PROMPT_TOKENS = 2500; // 16KB of prompt is ~4-5k tokens; fewer means it was not received

const prompt =
  readFileSync("spike/inputs/builder.md", "utf-8") +
  "\n\n## Brief\n" +
  readFileSync("spike/inputs/sample-brief.json", "utf-8") +
  "\n\n## PREFLIGHT PROBE\nThis is a connectivity probe, not a build. Do not write code or files. Reply with exactly: OK";

const allHeaders = (h) => Object.fromEntries([...h.entries()].filter(([k]) => k.toLowerCase() !== "set-cookie"));

async function chat(base, key, model, content, max_tokens) {
  // Every OpenRouter call must name an explicit :free id; one paid call already slipped through a fallback.
  if (base === OR_BASE && !model.endsWith(":free")) throw new Error(`refusing non-:free OpenRouter id ${model}`);
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

const accepted = (r) => r.ok && (r.prompt_tokens === null || r.prompt_tokens >= MIN_PROMPT_TOKENS);

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

const out = { prompt_bytes: Buffer.byteLength(prompt), openrouter: {}, nvidia: {} };

// ---- OpenRouter ----
const orKey = process.env.OPENROUTER_API_KEY;
if (!orKey) {
  out.openrouter.error = "OPENROUTER_API_KEY not set";
} else {
  out.openrouter.key_before = await orKeyInfo(orKey);
  const listRes = await fetch(`${OR_BASE}/models`, { headers: { Authorization: `Bearer ${orKey}` } }).catch(() => null);
  const live = listRes?.ok ? ((await listRes.json().catch(() => ({})))?.data ?? []) : null;
  const liveIds = live?.map((m) => m.id) ?? null;
  const calls = [];
  for (const model of [OR_MODEL, ...OR_EXTRA]) {
    const meta = live?.find((m) => m.id === model);
    if (liveIds && !meta) {
      calls.push({ model, ok: false, accepted: false, error_body: "requested :free id not in live /models — provider fails, no substitution" });
      continue;
    }
    const r = await chat(OR_BASE, orKey, model, prompt, 4096);
    r.accepted = accepted(r);
    r.context_length = meta?.context_length ?? null;
    r.pricing = meta?.pricing ?? null;
    calls.push(r);
  }
  out.openrouter.full_prompt = calls;
  out.openrouter.ping = await chat(OR_BASE, orKey, OR_MODEL, "Reply with exactly: OK", 1024);
  out.openrouter.key_after = await orKeyInfo(orKey);
  out.openrouter.primary_model = OR_MODEL;
  out.openrouter.primary_accepted = calls[0].accepted === true;
}

// ---- NVIDIA ----
const nvKey = process.env.NVIDIA_API_KEY;
let nvBurst429 = 0;
if (!nvKey) {
  out.nvidia.error = "NVIDIA_API_KEY not set";
} else {
  const full = await chat(NV_BASE, nvKey, NV_MODEL, prompt, 4096);
  full.accepted = accepted(full);
  out.nvidia.full_prompt = full;
  out.nvidia.callable = [];
  for (const model of NV_PROBE) {
    const r = await chat(NV_BASE, nvKey, model, "Reply with exactly: OK", 1024);
    r.callable = r.ok;
    out.nvidia.callable.push(r);
  }
  // Concurrent burst: finds whether a 429 appears and what it names (RPM / daily / token cap).
  const burst = await Promise.all(Array.from({ length: NV_BURST }, () => chat(NV_BASE, nvKey, NV_MODEL, "Reply with exactly: OK", 64)));
  nvBurst429 = burst.filter((r) => r.status === 429).length;
  out.nvidia.burst = {
    requests: NV_BURST,
    status_counts: burst.reduce((a, r) => ((a[r.status ?? "err"] = (a[r.status ?? "err"] ?? 0) + 1), a), {}),
    first_429_body: burst.find((r) => r.status === 429)?.error_body ?? null,
    first_headers: burst[0].headers,
    last_headers: burst[burst.length - 1].headers,
    note: `${NV_BURST} concurrent requests; a ceiling above that is a lower bound only (burst cap ~20 requests total).`,
  };
  out.nvidia.chat_requests_total = 1 + NV_PROBE.length + NV_BURST;
}

const orOk = out.openrouter.primary_accepted === true;
const nvOk = out.nvidia.full_prompt?.accepted === true;
// "Real headroom" = full prompt accepted and the whole burst got through without a 429.
const nvArm = nvOk && nvBurst429 === 0 && out.nvidia.burst?.status_counts?.["200"] === NV_BURST;
out.gate = { openrouter_ok: orOk, nvidia_ok: nvOk, nvidia_arm: nvArm, pass: orOk || nvOk };

mkdirSync("spike/out", { recursive: true });
writeFileSync("spike/out/preflight-providers.json", JSON.stringify(out, null, 2));
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `openrouter_ok=${orOk}\nnvidia_ok=${nvOk}\nnvidia_arm=${nvArm}\n`);
}

console.log(`Prompt bytes: ${out.prompt_bytes}`);
for (const r of out.openrouter.full_prompt ?? []) console.log(`  openrouter full-prompt ${r.model}: status=${r.status} accepted=${r.accepted} prompt_tokens=${r.prompt_tokens} finish=${r.finish_reason} empty=${r.content_empty} err=${r.error_body ?? ""}`.slice(0, 600));
if (out.nvidia.full_prompt) {
  const f = out.nvidia.full_prompt;
  console.log(`  nvidia full-prompt ${f.model}: status=${f.status} accepted=${f.accepted} prompt_tokens=${f.prompt_tokens} err=${f.error_body ?? ""}`.slice(0, 600));
  for (const r of out.nvidia.callable) console.log(`  nvidia probe ${r.model}: status=${r.status} callable=${r.callable} err=${(r.error_body ?? "").slice(0, 160)}`);
  console.log(`  nvidia burst: ${JSON.stringify(out.nvidia.burst.status_counts)}`);
}
console.log(`Gate: ${JSON.stringify(out.gate)}`);
if (!out.gate.pass) {
  console.error("::error::No provider accepted the full ~16KB builder prompt. Arms must not run — stop and report.");
  process.exit(1);
}
