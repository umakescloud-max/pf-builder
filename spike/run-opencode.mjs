// One OpenCode attempt, supervised. Run from the prototype directory:
//   node run-opencode.mjs --model <provider/model> --prompt-file <f> --log <f> --result <f> [--paced-nvidia]
//
// `opencode run` never exits after a fatal non-retryable provider error on the
// first stream (reported Aug 2026), so the exit code is NOT the completion
// signal. The --format json stream is: terminal event = step_finish whose
// reason is not "tool-calls" (observed v1.18.31: reason "stop"), or an error
// event. Silence for 300 s with no terminal event = builder_hung; 20 min total
// = builder_timeout; 40 steps without finishing = builder_request_cap.
//
// With --paced-nvidia, `--model` is the bare NIM id and calls go through a local
// proxy that spaces upstream requests 4 s apart and aborts the arm on 3
// CONSECUTIVE 429s (provider_rate_limited). Burst 429s alone never abort. The proxy buffers each
// upstream response; a 200 with no content and no tool call (whatever the reasoning-token count) and no error is logged raw (<log>.raw-empty.jsonl,
// also echoed as RAW_EMPTY_RESPONSE) and retried once; a second empty ends the attempt as
// empty_step_after_retry.
//
// Paid OpenRouter models (anything not ending :free) are metered: after every step the supervisor
// reads OpenRouter /key and aborts as spend_ceiling once usage - PF_SPEND_START >= PF_SPEND_CEILING
// (default 2.00 USD). run-arm.sh also checks before and after each attempt; this closes the gap inside one.
//
// Writes {outcome, steps, peak_tokens, proxy_requests, detail} to --result and
// always exits 0 (the outcome is the signal). Outcomes: completed |
// builder_timeout | builder_hung | builder_request_cap | provider_error |
// provider_rate_limited | empty_step_after_retry | spend_ceiling | config_error. Thresholds are env-overridable for tests.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { appendFileSync, createWriteStream, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { bareId, isAllowed, isFree } from "./allowed-model.mjs";
import { readUsage } from "./spend.mjs";

const arg = (n) => { const i = process.argv.indexOf(`--${n}`); return i < 0 ? undefined : process.argv[i + 1]; };
const model = arg("model"), promptFile = arg("prompt-file"), logFile = arg("log"), resultFile = arg("result");
const paced = process.argv.includes("--paced-nvidia");
const env = process.env;
const TIMEOUT_MS = +(env.PF_TIMEOUT_MS ?? 20 * 60_000);
const SILENCE_MS = +(env.PF_SILENCE_MS ?? 300_000);
const REQ_CAP = +(env.PF_REQ_CAP ?? 40);
const PACE_MS = +(env.PF_PACE_MS ?? 4000);
const COOLDOWN_MS = +(env.PF_COOLDOWN_MS ?? 20_000); // after a 429, OpenCode retries land after this, not 4 s later
const GRACE_MS = +(env.PF_GRACE_MS ?? 15_000); // after a terminal event, let it exit on its own
const NV_UPSTREAM = env.PF_NVIDIA_UPSTREAM ?? "https://integrate.api.nvidia.com";

const rawLog = logFile.replace(/\.log$/, ".raw-empty.jsonl");
const SPEND_START = env.PF_SPEND_START === undefined || env.PF_SPEND_START === "" ? NaN : Number(env.PF_SPEND_START);
const SPEND_CEILING = Number(env.PF_SPEND_CEILING ?? 2);
const metered = /^openrouter\//.test(model ?? "") && !isFree(model);
const state = { cost: 0, emptySteps: 0, emptyRecovered: 0, outcome: null, detail: "", steps: 0, peak: 0, proxyRequests: 0, sawTokens: false };
const finish = (outcome, detail) => { if (!state.outcome) { state.outcome = outcome; state.detail = detail; } };

// Only allowlisted OpenRouter ids (see allowed-model.mjs); OpenCode never runs against Gemini.
if (/^openrouter\//.test(model ?? "") && !isAllowed(model)) finish("config_error", `refusing non-allowlisted OpenRouter model ${bareId(model)}`);
if (metered && !state.outcome && (!env.OPENROUTER_API_KEY || !Number.isFinite(SPEND_START))) finish("config_error", "paid model without OPENROUTER_API_KEY and PF_SPEND_START: spend cannot be metered");
if (/gemini|^google\//i.test(model ?? "")) finish("config_error", `OpenCode must never run against Gemini (${model})`);
// DeepSeek direct (deepseek/<id>): unmetered by design. None of the OpenRouter checks above apply (they match the
// openrouter/ prefix only); no spend.mjs, no ceiling. Cost is computed from reported tokens when the result is written.
const deepseek = /^deepseek\//.test(model ?? "");
if (deepseek && !env.DEEPSEEK_API_KEY) finish("config_error", "deepseek model without DEEPSEEK_API_KEY");
const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

// One step = one chat-completions request. An empty step (HTTP 200, no error, no content and
// no tool call) is logged raw and retried once. Reasoning alone does not make a step non-empty:
// dispatch 5 returned 32 reasoning tokens, no content, no tool call, and the old detector
// (which counted reasoning) logged nothing.
function inspect(buf) {
  const text = buf.toString("utf-8"), chunks = [];
  if (/^\s*(data:|event:|:)/.test(text)) {
    for (const line of text.split("\n")) {
      const d = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (d && d !== "[DONE]") try { chunks.push(JSON.parse(d)); } catch {}
    }
  } else try { chunks.push(JSON.parse(text)); } catch {}
  let produced = false, reasoning = false, finish = null, usage = null, error = null;
  for (const c of chunks) {
    usage = c.usage ?? usage; error = c.error ?? error;
    for (const ch of c.choices ?? []) {
      const d = ch.delta ?? ch.message ?? {};
      if (d.content || d.tool_calls?.length) produced = true;
      if (d.reasoning_content || d.reasoning) reasoning = true;
      finish = ch.finish_reason ?? finish;
    }
  }
  return { finish, usage, reasoning, empty: !error && !produced };
}
const isEmpty = (r) => r.status === 200 && inspect(r.buf).empty;
function logEmpty(reqBody, r, retry) {
  const { finish, usage, reasoning } = inspect(r.buf);
  let req = {};
  try { const j = JSON.parse(reqBody); req = { model: j.model, messages: j.messages?.length, tools: j.tools?.length, tool_choice: j.tool_choice, max_tokens: j.max_tokens, stream: j.stream, request_bytes: reqBody.length, last_role: j.messages?.at(-1)?.role }; } catch {}
  const rec = { at: new Date().toISOString(), upstream_request: state.proxyRequests, is_retry: retry, status: r.status, finish_reason: finish, usage, reasoning_seen: reasoning, headers: r.allHeaders, request: req, body_bytes: r.buf.length, body: r.buf.toString("utf-8").slice(0, 20_000) };
  appendFileSync(rawLog, JSON.stringify(rec) + "\n");
  console.log("RAW_EMPTY_RESPONSE " + JSON.stringify(rec));
  state.emptySteps++;
}

let proxy;
if (!state.outcome && paced) {
  let nextSlot = 0, consecutive429 = 0;
  // Paced upstream call; resolves {status, headers, allHeaders, buf}, or null once the request cap is hit.
  const upstream = async (req, body) => {
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + PACE_MS;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
    if (++state.proxyRequests > REQ_CAP) { finish("builder_request_cap", `more than ${REQ_CAP} upstream requests`); stop(); return null; }
    const up = await fetch(NV_UPSTREAM + req.url, {
      method: req.method,
      headers: { "content-type": req.headers["content-type"] ?? "application/json", accept: req.headers.accept ?? "*/*", authorization: `Bearer ${env.NVIDIA_API_KEY}` },
      body: ["GET", "HEAD"].includes(req.method) ? undefined : body,
    });
    const buf = Buffer.from(await up.arrayBuffer());
    if (up.status === 429) {
      const ra = up.headers.get("retry-after"), text = buf.toString("utf-8").slice(0, 400);
      nextSlot = Math.max(nextSlot, Date.now() + Math.min(COOLDOWN_MS, 60_000, ra ? +ra * 1000 || COOLDOWN_MS : COOLDOWN_MS));
      if (++consecutive429 >= 3) { finish("provider_rate_limited", `3 consecutive 429s from NVIDIA (retry-after: ${ra ?? "none"}; body: ${text}; ${state.steps} step(s) finished)`); stop(); }
    } else consecutive429 = 0;
    const allHeaders = Object.fromEntries(up.headers);
    const headers = Object.fromEntries(Object.entries(allHeaders).filter(([k]) => !["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k)));
    return { status: up.status, headers, allHeaders, buf };
  };
  proxy = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = Buffer.concat(chunks);
    try {
      let r = await upstream(req, body);
      if (r && isEmpty(r)) {
        logEmpty(body, r, false);
        r = await upstream(req, body); // the one retry
        if (r && isEmpty(r)) {
          logEmpty(body, r, true);
          const { finish: f, usage } = inspect(r.buf);
          finish("empty_step_after_retry", `step ${state.steps + 1}: HTTP 200 with no content and no tool call twice in a row (finish_reason ${f}; usage ${JSON.stringify(usage)}; ${r.buf.length} body bytes); raw in ${path.basename(rawLog)}`);
          res.writeHead(502).end(); return stop();
        }
        if (r) state.emptyRecovered++;
      }
      if (!r) { res.writeHead(503).end(); return; }
      res.writeHead(r.status, r.headers).end(r.buf);
    } catch (e) { res.writeHead(502).end(String(e)); }
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
}

let child, lastOut = Date.now(), silenceT, hardT, graceT, spendBusy = false;
async function checkSpend() {
  if (!metered || spendBusy || state.outcome) return;
  spendBusy = true;
  try {
    const spent = (await readUsage(env.OPENROUTER_API_KEY, 1)) - SPEND_START;
    if (spent >= SPEND_CEILING) { finish("spend_ceiling", `spent ${spent.toFixed(4)} USD >= ceiling ${SPEND_CEILING} after ${state.steps} step(s)`); stop(); }
  } catch {} // a missed poll is not fatal; run-arm.sh's before/after checks fail closed
  spendBusy = false;
}
function stop() {
  clearInterval(silenceT); clearTimeout(hardT);
  if (child && child.exitCode === null) { try { process.platform === "win32" ? child.kill() : process.kill(-child.pid, "SIGKILL"); } catch {} }
}

if (!state.outcome) {
  const spawnEnv = { ...env, OPENCODE_DISABLE_AUTOUPDATE: "1" };
  let useModel = model;
  if (paced) {
    const cfg = path.join(tmpdir(), `pf-opencode-${process.pid}.json`);
    writeFileSync(cfg, JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      provider: { "nvidia-paced": {
        npm: "@ai-sdk/openai-compatible", name: "NVIDIA (paced)",
        options: { baseURL: `http://127.0.0.1:${proxy.address().port}/v1`, apiKey: "pf-local" },
        models: { [model]: { name: model, limit: { context: 128000, output: 16384 } } },
      } },
    }));
    spawnEnv.OPENCODE_CONFIG = cfg;
    useModel = `nvidia-paced/${model}`;
  }
  if (deepseek) {
    // Inline provider, same mechanism as nvidia-paced. The key is an OpenCode env reference, so it is never written to disk.
    const id = model.slice("deepseek/".length);
    const cfg = path.join(tmpdir(), `pf-opencode-${process.pid}.json`);
    writeFileSync(cfg, JSON.stringify({
      $schema: "https://opencode.ai/config.json",
      provider: { deepseek: {
        npm: "@ai-sdk/openai-compatible", name: "DeepSeek (direct)",
        options: { baseURL: "https://api.deepseek.com", apiKey: "{env:DEEPSEEK_API_KEY}" },
        models: { [id]: { name: id, limit: { context: 1000000, output: 32768 } } },
      } },
    }));
    spawnEnv.OPENCODE_CONFIG = cfg;
  }
  const bin = env.OPENCODE_BIN ?? "opencode";
  const binArgs = env.OPENCODE_BIN_ARGS ? JSON.parse(env.OPENCODE_BIN_ARGS) : [];
  child = spawn(bin, [...binArgs, "run", "--auto", "--model", useModel, "--format", "json", readFileSync(promptFile, "utf-8")], {
    env: spawnEnv, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"],
  });
  const out = createWriteStream(logFile), err = createWriteStream(logFile.replace(/\.log$/, ".stderr.log"));
  child.stderr.pipe(err);
  child.stdout.pipe(out);

  let buf = "";
  const onEvent = (ev) => {
    if (ev.type === "step_finish") {
      state.steps++;
      state.cost += ev.part?.cost ?? 0;
      checkSpend();
      const t = ev.part?.tokens;
      if (t) { state.sawTokens = true; state.peak = Math.max(state.peak, t.total ?? (t.input ?? 0) + (t.output ?? 0)); }
      if (t) { usage.input += t.input ?? 0; usage.output += (t.output ?? 0) + (t.reasoning ?? 0); usage.cacheRead += t.cache?.read ?? 0; usage.cacheWrite += t.cache?.write ?? 0; }
      const reason = ev.part?.reason;
      if (reason === "error") { finish("provider_error", `step_finish reason=error: ${JSON.stringify(ev).slice(0, 1500)}`); graceT = setTimeout(stop, GRACE_MS); }
      else if (reason && reason !== "tool-calls") { finish("completed", `step_finish reason=${reason}`); graceT = setTimeout(stop, GRACE_MS); }
      else if (state.steps >= REQ_CAP) { finish("builder_request_cap", `${state.steps} steps without a terminal event`); stop(); }
    } else if (ev.type === "error") {
      const raw = JSON.stringify(ev.error ?? ev).slice(0, 1500);
      finish(/\b429\b|rate.?limit|too many requests/i.test(raw) ? "provider_rate_limited" : "provider_error", `error event: ${raw}`);
      graceT = setTimeout(stop, GRACE_MS);
    }
  };
  child.stdout.on("data", (d) => {
    lastOut = Date.now();
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith("{")) continue;
      try { onEvent(JSON.parse(line)); } catch {}
    }
  });

  silenceT = setInterval(() => {
    if (!state.outcome && Date.now() - lastOut > SILENCE_MS) {
      finish("builder_hung", `no stream output for ${SILENCE_MS / 1000}s and no terminal event (${state.steps} step(s) finished before the silence)`);
      stop();
    }
  }, Math.min(5000, Math.max(50, SILENCE_MS / 4)));
  hardT = setTimeout(() => { finish("builder_timeout", `exceeded ${TIMEOUT_MS / 60000} min (${state.steps} step(s) finished)`); stop(); }, TIMEOUT_MS);

  await new Promise((r) => child.on("close", r));
  clearTimeout(graceT);
  stop();
  // Process exited with no terminal event and nothing else decided it: do not
  // infer success or failure from the exit code.
  finish("builder_hung", `process exited (code ${child.exitCode}) before any terminal event; ${state.steps} step(s) finished`);
}

proxy?.close();
// DeepSeek FLASH cost per 1M USD, off-peak: miss 0.15, hit 0.003, out 0.60; peak (weekdays 01-04 and 06-10 UTC) doubles.
// OpenCode does not expose DeepSeek's cache hit/miss split (cache.read stays 0), so unless it reports one, all input is
// priced at the miss rate and the figure is an upper bound. The API's returned model id is not in OpenCode's events.
let deepseekUsage;
if (deepseek) {
  const now = new Date(), d = now.getUTCDay(), h = now.getUTCHours();
  const peak = d >= 1 && d <= 5 && ((h >= 1 && h < 4) || (h >= 6 && h < 10));
  const split = usage.cacheRead > 0;
  const hit = split ? usage.cacheRead : 0, miss = split ? usage.input + usage.cacheWrite : usage.input;
  const cost = ((miss * 0.15 + hit * 0.003 + usage.output * 0.6) / 1e6) * (peak ? 2 : 1);
  deepseekUsage = { tokens: { hit, miss, completion: usage.output }, peak_window: peak, cost_usd: Number(cost.toFixed(6)),
    cost_basis: split ? "reported cache split" : "upper bound: cache hit/miss not exposed, all input at the miss rate",
    model_id_returned: "not exposed by OpenCode events" };
  console.log("DEEPSEEK_USAGE " + JSON.stringify(deepseekUsage));
}
writeFileSync(resultFile, JSON.stringify({
  outcome: state.outcome, detail: state.detail, steps: state.steps,
  peak_tokens: state.sawTokens ? state.peak : "unknown",
  proxy_requests: paced ? state.proxyRequests : "unknown",
  empty_steps: state.emptySteps, empty_recovered: state.emptyRecovered,
  opencode_cost_usd: state.cost, // OpenCode's own estimate; OpenRouter /key is the authoritative spend
  ...(deepseekUsage ? { deepseek: deepseekUsage } : {}),
}));
process.exit(0);
