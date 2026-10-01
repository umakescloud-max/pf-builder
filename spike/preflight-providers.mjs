// Fires one minimal completion at each of the four registered providers and
// logs status/latency/model-echo/rate-limit headers — never the key itself.
// Gemini is a hard gate (the spike's two arms depend on it); Groq, NVIDIA and
// OpenRouter are informational only, for Phase 3 fallback selection.
const RATE_LIMIT_HEADER = /ratelimit|retry-after/i;

function pickHeaders(headers) {
  const out = {};
  for (const [k, v] of headers.entries()) {
    if (RATE_LIMIT_HEADER.test(k)) out[k] = v;
  }
  return out;
}

async function timed(fn) {
  const start = Date.now();
  try {
    const res = await fn();
    return { ...res, latency_ms: Date.now() - start };
  } catch (e) {
    return { ok: false, error: String(e), latency_ms: Date.now() - start };
  }
}

async function checkGemini() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return { ok: false, error: "GEMINI_API_KEY not set" };
  // 5xx (e.g. 503 "high demand") is transient, not an auth/key verdict: retry.
  let res;
  for (let i = 0; i < 4; i++) {
    res = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-goog-api-key": key },
        body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly: OK" }] }] }),
      }
    );
    if (res.status < 500) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
  const body = await res.json().catch(() => ({}));
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return {
    ok: res.ok && text.length > 0,
    status: res.status,
    model: "gemini-flash-latest",
    rate_limit_headers: pickHeaders(res.headers),
    content_preview: text.slice(0, 40),
    // Full body on failure: run 2's 403 was never diagnosable from the
    // truncated log line alone, despite arm 2 proving the same key works.
    error: res.ok && text.length > 0 ? undefined : JSON.stringify(body).slice(0, 500),
  };
}

// GET /v1/models; the requested id must be in the live list or the provider
// fails (no fallback to some other model). Listed != callable either: run 3
// listed NVIDIA's 01-ai/yi-large, which then 404'd "Function not found for
// account" — so the chat call below is still the real test.
async function listModels(baseUrl, key) {
  try {
    const res = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) return null;
    const body = await res.json().catch(() => ({}));
    return (body?.data ?? []).map((m) => m.id).filter(Boolean);
  } catch {
    return null;
  }
}

async function checkOpenAICompat(name, baseUrl, keyEnv, requestedModel) {
  const key = process.env[keyEnv];
  if (!key) return { ok: false, error: `${keyEnv} not set` };
  const live_ids = await listModels(baseUrl, key);
  const model = requestedModel;
  if (live_ids && !live_ids.includes(requestedModel)) {
    console.log(`  ${name}: requested model ${requestedModel} is not in /models; live ids: ${live_ids.join(", ")}`);
    return { ok: false, model, requested_model: requestedModel, live_ids, error: `requested model ${requestedModel} not in live /models list` };
  }
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    // max_tokens is generous: reasoning models (e.g. Groq's gpt-oss) spend
    // part of the budget on hidden reasoning tokens before emitting content
    // — 10 was clipping content to empty on an otherwise-200 response.
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 60 }),
  });
  const body = await res.json().catch(() => ({}));
  const choice = body?.choices?.[0];
  const text = choice?.message?.content ?? choice?.text ?? "";
  const echoedModel = body?.model ?? null;
  return {
    ok: res.ok && text.length > 0,
    status: res.status,
    model: echoedModel ?? model,
    requested_model: requestedModel,
    live_ids,
    rate_limit_headers: pickHeaders(res.headers),
    content_preview: text.slice(0, 40),
    error: res.ok && text.length > 0 ? undefined : JSON.stringify(body).slice(0, 300),
  };
}

const results = {
  gemini: await timed(checkGemini),
  groq: await timed(() => checkOpenAICompat("groq", "https://api.groq.com/openai/v1", "GROQ_API_KEY", "openai/gpt-oss-120b")),
  nvidia: await timed(() => checkOpenAICompat("nvidia", "https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY", "nvidia/nemotron-3-super-120b-a12b")),
  openrouter: await timed(() => checkOpenAICompat("openrouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "nvidia/nemotron-3-super-120b-a12b:free")),
};

console.log("Provider preflight results (no key values logged):");
for (const [name, r] of Object.entries(results)) {
  const modelNote = r.requested_model && r.requested_model !== r.model ? ` (requested=${r.requested_model})` : "";
  console.log(`  ${name}: ok=${r.ok} status=${r.status ?? "n/a"} latency_ms=${r.latency_ms} model=${r.model ?? "n/a"}${modelNote} rate_limit_headers=${JSON.stringify(r.rate_limit_headers ?? {})}${r.error ? ` error=${r.error}` : ""}`);
}

import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("spike/out", { recursive: true });
writeFileSync("spike/out/preflight-providers.json", JSON.stringify(results, null, 2));

if (!results.gemini.ok) {
  console.error("::error::Gemini preflight failed — this blocks arms 1 and 2, which both depend on it. Groq/NVIDIA/OpenRouter failures are informational only and do not fail this job.");
  process.exit(1);
}
