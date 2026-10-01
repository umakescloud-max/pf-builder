// Run: node --test spike/run-opencode.test.mjs   (uses a stub in place of opencode)
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { spawnSync, spawn } from "node:child_process";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "oc-"));
const stub = path.join(dir, "stub.mjs");
writeFileSync(path.join(dir, "prompt.txt"), "do it");
writeFileSync(stub, `
import { readFileSync } from "node:fs";
const mode = process.env.STUB_MODE;
const sf = (reason) => console.log(JSON.stringify({ type: "step_finish", part: { reason, tokens: { total: 100, input: 90, output: 10 } } }));
const idle = () => setInterval(() => {}, 1000);
if (mode === "complete") { sf("tool-calls"); sf("stop"); setTimeout(() => process.exit(0), 50); }
else if (mode === "finish-error") { sf("error"); idle(); }
else if (mode === "hang") idle();
else if (mode === "error-hang") { console.log(JSON.stringify({ type: "error", error: { name: "APIError", data: { message: "finish_reason error" } } })); idle(); }
else if (mode === "ratelimit-error") { console.log(JSON.stringify({ type: "error", error: { data: { message: "429 Too Many Requests" } } })); idle(); }
else if (mode === "loop") setInterval(() => sf("tool-calls"), 20);
else if (mode === "slow-chatter") setInterval(() => console.log(JSON.stringify({ type: "step_start" })), 50);
else if (mode === "nvidia1") {
  const base = JSON.parse(readFileSync(process.env.OPENCODE_CONFIG, "utf-8")).provider["nvidia-paced"].options.baseURL;
  await fetch(base + "/chat/completions", { method: "POST", body: "{}" }).then((r) => r.text());
  sf("stop"); idle();
}
else if (mode === "nvidia") {
  const base = JSON.parse(readFileSync(process.env.OPENCODE_CONFIG, "utf-8")).provider["nvidia-paced"].options.baseURL;
  for (let i = 0; i < 10; i++) await fetch(base + "/chat/completions", { method: "POST", body: "{}" }).then((r) => r.text());
  idle();
}
`);

function run(model, mode, env = {}, extra = []) {
  const result = path.join(dir, `r-${mode}-${Math.random()}.json`);
  const r = spawnSync(process.execPath, [path.resolve("spike/run-opencode.mjs"), "--model", model, "--prompt-file", path.join(dir, "prompt.txt"), "--log", path.join(dir, "a.log"), "--result", result, ...extra], {
    env: { ...process.env, OPENCODE_BIN: process.execPath, OPENCODE_BIN_ARGS: JSON.stringify([stub]), STUB_MODE: mode, PF_SILENCE_MS: "400", PF_GRACE_MS: "200", PF_TIMEOUT_MS: "20000", ...env },
    timeout: 30000,
  });
  assert.equal(r.status, 0, String(r.stderr));
  return JSON.parse(readFileSync(result, "utf-8"));
}

test("completed: terminal step_finish, counters parsed", () => {
  const r = run("openrouter/cohere/north-mini-code:free", "complete");
  assert.deepEqual([r.outcome, r.steps, r.peak_tokens], ["completed", 2, 100]);
});
test("builder_hung: silent stream, no terminal event (the never-exits case)", () => {
  assert.equal(run("openrouter/x/y:free", "hang").outcome, "builder_hung");
});
test("error event is terminal even though the process never exits", () => {
  assert.equal(run("openrouter/x/y:free", "error-hang").outcome, "provider_error");
  assert.equal(run("openrouter/x/y:free", "ratelimit-error").outcome, "provider_rate_limited");
});
test("finish_reason error is provider_error, not completion", () => {
  assert.equal(run("openrouter/x/y:free", "finish-error").outcome, "provider_error");
});
test("builder_request_cap", () => {
  const r = run("openrouter/x/y:free", "loop", { PF_REQ_CAP: "5" });
  assert.deepEqual([r.outcome, r.steps], ["builder_request_cap", 5]);
});
test("builder_timeout is distinct from builder_hung", () => {
  assert.equal(run("openrouter/x/y:free", "slow-chatter", { PF_TIMEOUT_MS: "600", PF_SILENCE_MS: "60000" }).outcome, "builder_timeout");
});
test("config_error: non-:free OpenRouter id and Gemini never reach the CLI", () => {
  assert.equal(run("openrouter/openai/gpt-6.1-sol-pro", "complete").outcome, "config_error");
  assert.equal(run("google/gemini-flash-latest", "complete").outcome, "config_error");
});
test("NVIDIA proxy: 3 consecutive 429s abort as provider_rate_limited, requests were paced", async () => {
  const hits = [];
  const up = createServer((req, res) => { hits.push(Date.now()); res.writeHead(429).end('{"status":429}'); });
  await new Promise((r) => up.listen(0, "127.0.0.1", r));
  const result = path.join(dir, "r-nv.json");
  const child = spawn(process.execPath, [path.resolve("spike/run-opencode.mjs"), "--model", "nvidia/nemotron-3-ultra-550b-a55b", "--prompt-file", path.join(dir, "prompt.txt"), "--log", path.join(dir, "b.log"), "--result", result, "--paced-nvidia"], {
    env: { ...process.env, OPENCODE_BIN: process.execPath, OPENCODE_BIN_ARGS: JSON.stringify([stub]), STUB_MODE: "nvidia", PF_NVIDIA_UPSTREAM: `http://127.0.0.1:${up.address().port}`, PF_PACE_MS: "150", PF_COOLDOWN_MS: "300", PF_SILENCE_MS: "60000", NVIDIA_API_KEY: "k" },
  });
  await new Promise((r) => child.on("close", r));
  up.close();
  const r = JSON.parse(readFileSync(result, "utf-8"));
  assert.equal(r.outcome, "provider_rate_limited");
  assert.equal(hits.length, 3);
  assert.ok(hits[1] - hits[0] >= 120 && hits[2] - hits[1] >= 120, `unpaced: ${hits}`);
});

// ---- empty-step handling: zero-output 200 is logged raw and retried once ----
const sse = (...chunks) => chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join("") + "data: [DONE]\n\n";
const EMPTY = sse({ choices: [{ delta: { role: "assistant" }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 900, completion_tokens: 0, total_tokens: 900 } });
const TOOL = sse({ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: "bash", arguments: "{}" } }] }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: "tool_calls" }], usage: { completion_tokens: 12 } });

async function runEmpty(responses) {
  const hits = [];
  const up = createServer((req, res) => {
    hits.push(Date.now());
    const body = responses[Math.min(hits.length - 1, responses.length - 1)];
    res.writeHead(200, { "content-type": "text/event-stream", "x-request-id": "rid-" + hits.length }).end(body);
  });
  await new Promise((r) => up.listen(0, "127.0.0.1", r));
  const result = path.join(dir, `r-e-${Math.random()}.json`), log = path.join(dir, `e-${Math.random()}.log`);
  const child = spawn(process.execPath, [path.resolve("spike/run-opencode.mjs"), "--model", "moonshotai/kimi-k3", "--prompt-file", path.join(dir, "prompt.txt"), "--log", log, "--result", result, "--paced-nvidia"], {
    env: { ...process.env, OPENCODE_BIN: process.execPath, OPENCODE_BIN_ARGS: JSON.stringify([stub]), STUB_MODE: "nvidia1", PF_NVIDIA_UPSTREAM: `http://127.0.0.1:${up.address().port}`, PF_PACE_MS: "10", PF_SILENCE_MS: "60000", PF_GRACE_MS: "200", NVIDIA_API_KEY: "k" },
  });
  await new Promise((r) => child.on("close", r));
  up.close();
  let raw = [];
  try { raw = readFileSync(log.replace(/\.log$/, ".raw-empty.jsonl"), "utf-8").trim().split("\n").map((l) => JSON.parse(l)); } catch {}
  return { r: JSON.parse(readFileSync(result, "utf-8")), hits: hits.length, raw };
}

test("empty step: logged raw, retried once, retry recovers -> attempt continues", async () => {
  const { r, hits, raw } = await runEmpty([EMPTY, TOOL]);
  assert.equal(hits, 2);
  assert.equal(raw.length, 1);
  assert.deepEqual([raw[0].status, raw[0].finish_reason, raw[0].usage.completion_tokens, raw[0].is_retry, raw[0].headers["x-request-id"]], [200, "stop", 0, false, "rid-1"]);
  assert.match(raw[0].body, /\[DONE\]/);
  assert.deepEqual([r.empty_steps, r.empty_recovered, r.outcome], [1, 1, "completed"]); // stub then reports its own stop
});
test("empty step twice: exactly one retry, then empty_step_after_retry with both raw bodies", async () => {
  const { r, hits, raw } = await runEmpty([EMPTY]);
  assert.equal(hits, 2);
  assert.deepEqual(raw.map((x) => x.is_retry), [false, true]);
  assert.equal(r.outcome, "empty_step_after_retry");
  assert.equal(r.proxy_requests, 2);
});
// dispatch 5: 32 reasoning tokens, no content, no tool call, finish stop. Must count as empty.
const REASONING_ONLY = sse({ choices: [{ delta: { role: "assistant", reasoning_content: "hmm" }, finish_reason: null }] }, { choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10944, completion_tokens: 32, completion_tokens_details: { reasoning_tokens: 32 }, total_tokens: 10976 } });
const REASONING_ONLY_JSON = JSON.stringify({ choices: [{ message: { role: "assistant", content: "", reasoning_content: "hmm" }, finish_reason: "stop" }], usage: { completion_tokens: 32 } });
test("reasoning>0, content=0, no tool call: empty, raw-logged, retried once (SSE and JSON bodies)", async () => {
  for (const body of [REASONING_ONLY, REASONING_ONLY_JSON]) {
    const { r, hits, raw } = await runEmpty([body, TOOL]);
    assert.equal(hits, 2);
    assert.equal(raw.length, 1);
    assert.deepEqual([raw[0].finish_reason, raw[0].usage.completion_tokens, raw[0].reasoning_seen, raw[0].is_retry], ["stop", 32, true, false]);
    assert.deepEqual([r.empty_steps, r.empty_recovered], [1, 1]);
  }
  const twice = await runEmpty([REASONING_ONLY]);
  assert.equal(twice.hits, 2);
  assert.equal(twice.r.outcome, "empty_step_after_retry");
  assert.equal(twice.raw.length, 2);
});
test("a non-empty response and an error body are never treated as empty", async () => {
  assert.equal((await runEmpty([TOOL])).hits, 1);
  assert.equal((await runEmpty([sse({ error: { message: "boom" } })])).hits, 1);
});

// ---- paid model: allowlist + spend ceiling ----
const HAIKU = "openrouter/anthropic/claude-haiku-4.5";
test("paid allowlisted model without a spend baseline is a config_error (never runs unmetered)", () => {
  const r = run(HAIKU, "complete", { OPENROUTER_API_KEY: "", PF_SPEND_START: "" });
  assert.equal(r.outcome, "config_error");
  assert.match(r.detail, /cannot be metered/);
});
test("spend ceiling: /key usage - start >= ceiling aborts mid-attempt as spend_ceiling", async () => {
  let usage = 10;
  const or = createServer((req, res) => { usage += 0.6; res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: { usage } })); });
  await new Promise((r) => or.listen(0, "127.0.0.1", r));
  const result = path.join(dir, "r-spend.json");
  const child = spawn(process.execPath, [path.resolve("spike/run-opencode.mjs"), "--model", HAIKU, "--prompt-file", path.join(dir, "prompt.txt"), "--log", path.join(dir, "s.log"), "--result", result], {
    env: { ...process.env, OPENCODE_BIN: process.execPath, OPENCODE_BIN_ARGS: JSON.stringify([stub]), STUB_MODE: "loop", PF_REQ_CAP: "50", PF_SILENCE_MS: "60000", OPENROUTER_API_KEY: "k", PF_SPEND_START: "10", PF_SPEND_CEILING: "2", PF_OPENROUTER_BASE: `http://127.0.0.1:${or.address().port}` },
  });
  await new Promise((r) => child.on("close", r));
  or.close();
  const r = JSON.parse(readFileSync(result, "utf-8"));
  assert.equal(r.outcome, "spend_ceiling");
  assert.match(r.detail, /ceiling 2/);
});
