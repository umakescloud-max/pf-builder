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
