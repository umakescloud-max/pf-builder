// Run: node --test spike/
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, cpSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { snapshot, check } from "./check-allowlist.mjs";
import { restore } from "./restore-forbidden.mjs";

const put = (d, f, c) => { mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); writeFileSync(path.join(d, f), c); };

test("restore: edited, deleted and new forbidden files go back to the baseline; allowed edits stay", () => {
  const d = mkdtempSync(path.join(tmpdir(), "rf-"));
  const copy = mkdtempSync(path.join(tmpdir(), "rf-src-"));
  put(d, "package.json", JSON.stringify({ name: "x", dependencies: { react: "1" }, devDependencies: { vite: "1" } }));
  for (const [f, c] of Object.entries({ "src/theme.ts": "theme", "src/main.tsx": "main", "src/seed.ts": "seed", "vite.config.ts": "vite" })) put(d, f, c);
  const base = { files: snapshot(d), packageDepKeys: JSON.stringify([["react"], ["vite"]]) };
  cpSync(path.join(d, "src"), path.join(copy, "src"), { recursive: true });
  copyFileSync(path.join(d, "package.json"), path.join(copy, "package.json"));

  put(d, "src/theme.ts", "edited");
  rmSync(path.join(d, "src/main.tsx"));
  put(d, "src/extra.tsx", "x");
  put(d, "src/seed.ts", "allowed edit");
  put(d, "package.json", JSON.stringify({ name: "x", dependencies: { react: "1", lodash: "1" }, devDependencies: { vite: "1" } }));
  assert.equal(check(d, base).forbidden.length, 4);

  const r = restore(d, base, copy);
  assert.deepEqual(r.remaining, []);
  assert.equal(readFileSync(path.join(d, "src/theme.ts"), "utf-8"), "theme");
  assert.equal(readFileSync(path.join(d, "src/main.tsx"), "utf-8"), "main");
  assert.equal(existsSync(path.join(d, "src/extra.tsx")), false);
  assert.equal(readFileSync(path.join(d, "src/seed.ts"), "utf-8"), "allowed edit");

  // A baseline file outside the content copy cannot be restored: it stays reported.
  put(d, "vite.config.ts", "edited");
  assert.deepEqual(restore(d, base, copy).remaining, ["vite.config.ts"]);
  rmSync(d, { recursive: true, force: true });
  rmSync(copy, { recursive: true, force: true });
});
