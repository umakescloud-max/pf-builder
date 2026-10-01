// Run: node --test spike/allowed-model.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { isAllowed, isFree } from "./allowed-model.mjs";

test("allowlist: the paid builder and :free ids pass; everything else is refused", () => {
  for (const ok of ["anthropic/claude-haiku-4.5", "openrouter/anthropic/claude-haiku-4.5", "cohere/north-mini-code:free", "openrouter/poolside/laguna-s-2.1:free"])
    assert.ok(isAllowed(ok), ok);
  for (const bad of ["anthropic/claude-sonnet-4.5", "anthropic/claude-haiku-4.5:nitro", "anthropic/claude-haiku-4.5 ", "openai/gpt-6.1-sol-pro", "anthropic/claude-haiku-4.5:free-ish", "", undefined])
    assert.ok(!isAllowed(bad), String(bad));
  assert.ok(isFree("x/y:free") && !isFree("anthropic/claude-haiku-4.5"));
});
test("CLI exit codes: 0 allowed, 3 refused", () => {
  const run = (id) => spawnSync(process.execPath, ["spike/allowed-model.mjs", id]).status;
  assert.equal(run("openrouter/anthropic/claude-haiku-4.5"), 0);
  assert.equal(run("anthropic/claude-opus-4.1"), 3);
});
