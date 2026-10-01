// Recursively diffs a prototype dir against its starter and reports any
// added/removed/modified file outside the builder's allowlist. Prints
// forbidden paths (space-separated) to stdout, nothing if clean.
import { readdirSync, statSync, readFileSync } from "node:fs";
import path from "node:path";

const [starterDir, protoDir] = process.argv.slice(2);
const ALLOWED = [/^src\/screens\//, /^src\/nav\.ts$/, /^src\/seed\.ts$/, /^src\/tour\.json$/];
const SKIP = new Set(["node_modules", "dist", ".git"]);

function listFiles(dir, base = dir) {
  const out = new Map();
  for (const entry of readdirSync(dir)) {
    if (SKIP.has(entry)) continue;
    const full = path.join(dir, entry);
    const rel = path.relative(base, full).split(path.sep).join("/");
    if (statSync(full).isDirectory()) {
      for (const [k, v] of listFiles(full, base)) out.set(k, v);
    } else {
      out.set(rel, full);
    }
  }
  return out;
}

const starterFiles = listFiles(starterDir);
const protoFiles = listFiles(protoDir);
const forbidden = [];

for (const [rel, full] of protoFiles) {
  const allowed = ALLOWED.some((re) => re.test(rel));
  if (!starterFiles.has(rel)) {
    if (!allowed) forbidden.push(rel); // new file outside allowlist
    continue;
  }
  if (allowed) continue; // allowed to change freely
  const same = readFileSync(full).equals(readFileSync(starterFiles.get(rel)));
  if (!same) forbidden.push(rel);
}
for (const rel of starterFiles.keys()) {
  if (!protoFiles.has(rel) && !ALLOWED.some((re) => re.test(rel))) {
    forbidden.push(`${rel} (deleted)`);
  }
}

console.log(forbidden.join(" "));
