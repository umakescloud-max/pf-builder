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
  const res = await fetch(
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": key },
      body: JSON.stringify({ contents: [{ parts: [{ text: "Reply with exactly: OK" }] }] }),
    }
  );
  const body = await res.json().catch(() => ({}));
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
  return { ok: res.ok && text.length > 0, status: res.status, model: "gemini-flash-latest", rate_limit_headers: pickHeaders(res.headers), content_preview: text.slice(0, 40) };
}

async function checkOpenAICompat(name, baseUrl, keyEnv, model) {
  const key = process.env[keyEnv];
  if (!key) return { ok: false, error: `${keyEnv} not set` };
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 10 }),
  });
  const body = await res.json().catch(() => ({}));
  const text = body?.choices?.[0]?.message?.content ?? "";
  const echoedModel = body?.model ?? null;
  return {
    ok: res.ok && text.length > 0,
    status: res.status,
    model: echoedModel ?? model,
    rate_limit_headers: pickHeaders(res.headers),
    content_preview: text.slice(0, 40),
    error: res.ok ? undefined : JSON.stringify(body).slice(0, 300),
  };
}

const results = {
  gemini: await timed(checkGemini),
  groq: await timed(() => checkOpenAICompat("groq", "https://api.groq.com/openai/v1", "GROQ_API_KEY", "openai/gpt-oss-120b")),
  nvidia: await timed(() => checkOpenAICompat("nvidia", "https://integrate.api.nvidia.com/v1", "NVIDIA_API_KEY", "qwen/qwen2.5-coder-32b-instruct")),
  openrouter: await timed(() => checkOpenAICompat("openrouter", "https://openrouter.ai/api/v1", "OPENROUTER_API_KEY", "openai/gpt-oss-120b:free")),
};

console.log("Provider preflight results (no key values logged):");
for (const [name, r] of Object.entries(results)) {
  console.log(`  ${name}: ok=${r.ok} status=${r.status ?? "n/a"} latency_ms=${r.latency_ms} model=${r.model ?? "n/a"} rate_limit_headers=${JSON.stringify(r.rate_limit_headers ?? {})}${r.error ? ` error=${r.error}` : ""}`);
}

import { writeFileSync, mkdirSync } from "node:fs";
mkdirSync("spike/out", { recursive: true });
writeFileSync("spike/out/preflight-providers.json", JSON.stringify(results, null, 2));

if (!results.gemini.ok) {
  console.error("::error::Gemini preflight failed — this blocks arms 1 and 2, which both depend on it. Groq/NVIDIA/OpenRouter failures are informational only and do not fail this job.");
  process.exit(1);
}
