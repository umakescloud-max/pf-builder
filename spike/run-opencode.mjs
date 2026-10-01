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
// CONSECUTIVE 429s (provider_rate_limited). Burst 429s alone never abort.
//
// Writes {outcome, steps, peak_tokens, proxy_requests, detail} to --result and
// always exits 0 (the outcome is the signal). Outcomes: completed |
// builder_timeout | builder_hung | builder_request_cap | provider_error |
// provider_rate_limited | config_error. Thresholds are env-overridable for tests.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createWriteStream, readFileSync, writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";

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

const state = { outcome: null, detail: "", steps: 0, peak: 0, proxyRequests: 0, sawTokens: false };
const finish = (outcome, detail) => { if (!state.outcome) { state.outcome = outcome; state.detail = detail; } };

// Every OpenRouter id carries :free; OpenCode never runs against Gemini.
if (/^openrouter\//.test(model ?? "") && !model.endsWith(":free")) finish("config_error", `refusing non-:free OpenRouter model ${model}`);
if (/gemini|^google\//i.test(model ?? "")) finish("config_error", `OpenCode must never run against Gemini (${model})`);

let proxy;
if (!state.outcome && paced) {
  let nextSlot = 0, consecutive429 = 0;
  proxy = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const now = Date.now();
    const at = Math.max(now, nextSlot);
    nextSlot = at + PACE_MS;
    if (at > now) await new Promise((r) => setTimeout(r, at - now));
    if (++state.proxyRequests > REQ_CAP) { finish("builder_request_cap", `more than ${REQ_CAP} upstream requests`); res.writeHead(503).end(); return stop(); }
    try {
      const up = await fetch(NV_UPSTREAM + req.url, {
        method: req.method,
        headers: { "content-type": req.headers["content-type"] ?? "application/json", accept: req.headers.accept ?? "*/*", authorization: `Bearer ${env.NVIDIA_API_KEY}` },
        body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks),
      });
      if (up.status === 429) {
        const ra = up.headers.get("retry-after"), body = (await up.clone().text().catch(() => "")).slice(0, 400);
        nextSlot = Math.max(nextSlot, Date.now() + Math.min(COOLDOWN_MS, 60_000, ra ? +ra * 1000 || COOLDOWN_MS : COOLDOWN_MS));
        if (++consecutive429 >= 3) { finish("provider_rate_limited", `3 consecutive 429s from NVIDIA (retry-after: ${ra ?? "none"}; body: ${body}; ${state.steps} step(s) finished)`); stop(); }
      } else consecutive429 = 0;
      const h = Object.fromEntries([...up.headers].filter(([k]) => !["content-encoding", "content-length", "transfer-encoding", "connection"].includes(k)));
      res.writeHead(up.status, h);
      up.body ? Readable.fromWeb(up.body).pipe(res) : res.end();
    } catch (e) { res.writeHead(502).end(String(e)); }
  });
  await new Promise((r) => proxy.listen(0, "127.0.0.1", r));
}

let child, lastOut = Date.now(), silenceT, hardT, graceT;
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
      const t = ev.part?.tokens;
      if (t) { state.sawTokens = true; state.peak = Math.max(state.peak, t.total ?? (t.input ?? 0) + (t.output ?? 0)); }
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
writeFileSync(resultFile, JSON.stringify({
  outcome: state.outcome, detail: state.detail, steps: state.steps,
  peak_tokens: state.sawTokens ? state.peak : "unknown",
  proxy_requests: paced ? state.proxyRequests : "unknown",
}));
process.exit(0);
