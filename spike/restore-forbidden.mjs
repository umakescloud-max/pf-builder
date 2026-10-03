// Retry restore: puts every forbidden file back to the post-theme:gen baseline, byte for byte.
//   node restore-forbidden.mjs <protoDir> <baselineJson> <baselineSrcDir>
// prints {"restored": [...], "remaining": [...]}; remaining is the allowlist verdict AFTER restoring, so [] means clean.
// check-allowlist.mjs stores hashes only; the content comes from <baselineSrcDir>, a copy of src/ and package.json
// that run-arm.sh takes right after the snapshot. A forbidden path that is in the baseline but outside that copy
// (e.g. vite.config.ts) cannot be restored and stays in "remaining". A forbidden path that is not in the baseline
// (a new file) is deleted.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { check } from "./check-allowlist.mjs";

export function restore(protoDir, baseline, baselineSrcDir) {
  const restored = [];
  for (const entry of check(protoDir, baseline).forbidden) {
    const rel = entry.replace(/ \(deleted\)$/, "");
    if (rel in baseline.files) {
      const copy = path.join(baselineSrcDir, rel);
      if (!existsSync(copy)) continue;
      mkdirSync(path.dirname(path.join(protoDir, rel)), { recursive: true });
      copyFileSync(copy, path.join(protoDir, rel));
    } else rmSync(path.join(protoDir, rel), { force: true });
    restored.push(rel);
  }
  return { restored, remaining: check(protoDir, baseline).forbidden };
}

if (process.argv[1]?.endsWith("restore-forbidden.mjs")) {
  const [protoDir, baselinePath, baselineSrcDir] = process.argv.slice(2);
  if (!protoDir || !baselinePath || !baselineSrcDir) {
    console.error("usage: restore-forbidden.mjs <protoDir> <baselineJson> <baselineSrcDir>");
    process.exit(64);
  }
  console.log(JSON.stringify(restore(protoDir, JSON.parse(readFileSync(baselinePath, "utf-8")), baselineSrcDir)));
}
