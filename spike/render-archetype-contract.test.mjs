// Run: node --test spike/render-archetype-contract.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { renderContract } from "./render-archetype-contract.mjs";

test("prior-auth-rcm renders with every placeholder filled from roles.json", () => {
  const out = renderContract("prior-auth-rcm");
  assert.ok(!out.includes("{{"));
  assert.ok(out.includes("tracker-table-row-<id>") && out.includes("denial-row-<id>") && out.includes("case=<id>"));
});
test("CLI: unknown archetype exits 3 with a message", () => {
  const r = spawnSync(process.execPath, ["spike/render-archetype-contract.mjs", "no-such-archetype"], { encoding: "utf8" });
  assert.equal(r.status, 3);
  assert.match(r.stderr, /no roles\.json for archetype "no-such-archetype"/);
});
