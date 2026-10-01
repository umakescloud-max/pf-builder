// Run: node --test spike/spend.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";

async function spend(env, handler) {
  const srv = createServer(handler);
  await new Promise((r) => srv.listen(0, "127.0.0.1", r));
  const child = spawn(process.execPath, ["spike/spend.mjs"], { env: { ...process.env, PF_OPENROUTER_BASE: `http://127.0.0.1:${srv.address().port}`, OPENROUTER_API_KEY: "k", ...env } });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  const code = await new Promise((r) => child.on("close", r));
  srv.close();
  return { code, out };
}
const key = (usage) => (req, res) => res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ data: { usage } }));

test("under the ceiling: exit 0 and spent = usage - start", async () => {
  const { code, out } = await spend({ PF_SPEND_START: "3.5", PF_SPEND_CEILING: "2" }, key(4.25));
  assert.equal(code, 0);
  assert.equal(JSON.parse(out).spent, 0.75);
});
test("at or over the ceiling: exit 7", async () => {
  assert.equal((await spend({ PF_SPEND_START: "1", PF_SPEND_CEILING: "2" }, key(3))).code, 7);
  assert.equal((await spend({ PF_SPEND_START: "1", PF_SPEND_CEILING: "2" }, key(9))).code, 7);
});
test("fails closed (exit 8): unreadable usage, missing baseline", async () => {
  assert.equal((await spend({ PF_SPEND_START: "1" }, (req, res) => res.writeHead(500).end("{}"))).code, 8);
  assert.equal((await spend({ PF_SPEND_START: "" }, key(1))).code, 8);
});
