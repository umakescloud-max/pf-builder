// Run: node --test spike/
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { snapshot, check } from "./check-allowlist.mjs";

function proto() {
  const d = mkdtempSync(path.join(tmpdir(), "al-"));
  for (const [f, c] of Object.entries({
    "package.json": JSON.stringify({ name: "x", scripts: { a: "1" }, dependencies: { react: "1" }, devDependencies: { vite: "1" } }),
    "src/App.tsx": "app", "src/nav.ts": "nav", "src/seed.ts": "seed", "src/tour.json": "[]", "src/screens/A.tsx": "a",
  })) { mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); writeFileSync(path.join(d, f), c); }
  return d;
}
const put = (d, f, c) => { mkdirSync(path.dirname(path.join(d, f)), { recursive: true }); writeFileSync(path.join(d, f), c); };
const run = (d, mutate) => {
  const base = { files: snapshot(d), packageDepKeys: JSON.stringify([["react"], ["vite"]]) };
  mutate(d);
  const r = check(d, base);
  rmSync(d, { recursive: true, force: true });
  return r;
};

test("tool artifacts of any kind are ignored by category", () => {
  const r = run(proto(), (d) => {
    for (const f of [".aider.chat.history.md", ".gitignore", ".opencode/x.json", ".futuretool/y", "opencode.json", "AGENTS.md", "node_modules/z/i.js", "dist/a.js", "stray-root.ts"]) put(d, f, "t");
  });
  assert.deepEqual(r, { forbidden: [], changed: 0 });
});
test("allowed edits count as changes but are not forbidden", () => {
  const r = run(proto(), (d) => { put(d, "src/seed.ts", "new"); put(d, "src/screens/B.tsx", "b"); });
  assert.deepEqual(r, { forbidden: [], changed: 2 });
});
test("stray src file and edits to non-allowed baseline files are forbidden", () => {
  const r = run(proto(), (d) => { put(d, "src/routes.tsx", "r"); put(d, "src/App.tsx", "edited"); });
  assert.deepEqual(r.forbidden.sort(), ["src/App.tsx", "src/routes.tsx"]);
});
test("package.json: name/scripts churn ok, a new dependency is caught", () => {
  const churn = run(proto(), (d) => put(d, "package.json", JSON.stringify({ name: "y", version: "2", scripts: {}, dependencies: { react: "9" }, devDependencies: { vite: "1" } })));
  assert.deepEqual(churn.forbidden, []);
  const added = run(proto(), (d) => put(d, "package.json", JSON.stringify({ name: "y", dependencies: { react: "1", lodash: "1" }, devDependencies: { vite: "1" } })));
  assert.deepEqual(added.forbidden, ["package.json"]);
});
