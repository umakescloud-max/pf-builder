// Allowlist checker, correct by construction (no per-tool exclusion list).
//
//   node check-allowlist.mjs snapshot <protoDir> <baselineJson>   before the builder runs
//   node check-allowlist.mjs check    <protoDir> <baselineJson>   after; prints JSON
//
// check evaluates ONLY (a) files present in the baseline and (b) new files
// under src/. Everything else — dotfiles/dot-dirs at the root, node_modules,
// build output, whatever a tool or the harness drops at the root — is out of
// scope by category, so a new builder CLI never needs a new exclusion.
// package.json is compared by parsed dependency keys only.
//
// check prints {"forbidden": [...], "changed": <n>}; "changed" counts every
// in-scope difference (allowed or not), so callers can tell "builder did nothing".
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";

const ALLOWED = [/^src\/screens\//, /^src\/nav\.ts$/, /^src\/seed\.ts$/, /^src\/tour\.json$/];

// Relative path -> sha256 for every file, skipping node_modules (any depth) and
// dot-entries at the root (the baseline records the starter as it is, so
// tool-created root dotfiles never enter the comparison).
export function snapshot(dir) {
  const out = {};
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      if (d === dir && e.name.startsWith(".")) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) walk(full);
      else out[path.relative(dir, full).split(path.sep).join("/")] = createHash("sha256").update(readFileSync(full)).digest("hex");
    }
  })(dir);
  return out;
}

const depKeys = (raw) => {
  const p = JSON.parse(raw);
  return JSON.stringify([Object.keys(p.dependencies ?? {}).sort(), Object.keys(p.devDependencies ?? {}).sort()]);
};

export function check(dir, baseline) {
  const now = snapshot(dir);
  const forbidden = [];
  let changed = 0;
  const isAllowed = (rel) => ALLOWED.some((re) => re.test(rel));
  for (const [rel, hash] of Object.entries(baseline.files)) {
    if (rel === "package.json") {
      // Keys only: name/version/scripts churn is not a violation, a new dependency is.
      if (!(rel in now) || depKeys(readFileSync(path.join(dir, rel), "utf-8")) !== baseline.packageDepKeys) {
        forbidden.push(rel);
        changed++;
      }
    } else if (!(rel in now)) {
      changed++;
      if (!isAllowed(rel)) forbidden.push(`${rel} (deleted)`);
    } else if (now[rel] !== hash) {
      changed++;
      if (!isAllowed(rel)) forbidden.push(rel);
    }
  }
  for (const rel of Object.keys(now)) {
    if (rel in baseline.files || !rel.startsWith("src/")) continue;
    changed++;
    if (!isAllowed(rel)) forbidden.push(rel);
  }
  return { forbidden, changed };
}

if (process.argv[1]?.endsWith("check-allowlist.mjs")) {
  const [mode, dir, baselinePath] = process.argv.slice(2);
  if (mode === "snapshot") {
    const files = snapshot(dir);
    mkdirSync(path.dirname(baselinePath), { recursive: true });
    writeFileSync(baselinePath, JSON.stringify({ files, packageDepKeys: depKeys(readFileSync(path.join(dir, "package.json"), "utf-8")) }, null, 2));
  } else if (mode === "check") {
    console.log(JSON.stringify(check(dir, JSON.parse(readFileSync(baselinePath, "utf-8")))));
  } else {
    console.error("usage: check-allowlist.mjs snapshot|check <protoDir> <baselineJson>");
    process.exit(64);
  }
}
