// Phase 2 spike report job — reads each arm's result.json (downloaded into
// spike/out/<artifact-name>/ by actions/download-artifact), writes the
// DECISIONS.md-style results table, and stages the winning arm's cover.png +
// denial screenshot for the publish step. Winner = first arm, in spike order,
// with status "pass".
import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "spike/out";
const ARM_DIRS = ["spike-arm-1-gemini-cli", "spike-arm-2-aider-gemini", "spike-arm-3-aider-groq"];

// Why a missing result.json is missing, per arm — never guessed, only from
// facts the workflow actually knows. include_arm_3=false is the common
// case for arm 3 and must say so, not "quota_exhausted" (run 2's report
// invented that cause for an arm that was simply excluded by input).
const INCLUDE_ARM_3 = process.env.INCLUDE_ARM_3 === "true";
const ARM1_QUOTA_EXHAUSTED = process.env.ARM1_QUOTA_EXHAUSTED === "true";
const ARM2_QUOTA_EXHAUSTED = process.env.ARM2_QUOTA_EXHAUSTED === "true";

function missingReason(dir) {
  if (dir === "spike-arm-3-aider-groq" && !INCLUDE_ARM_3) {
    return { status: "excluded_by_input", detail: "Arm 3 skipped: include_arm_3 was unchecked on this dispatch." };
  }
  if (dir === "spike-arm-2-aider-gemini" && ARM1_QUOTA_EXHAUSTED) {
    return { status: "upstream_quota_exhausted", detail: "Arm 2 skipped: arm 1 reported Gemini quota_exhausted." };
  }
  if (dir === "spike-arm-3-aider-groq" && ARM2_QUOTA_EXHAUSTED) {
    return { status: "upstream_quota_exhausted", detail: "Arm 3 skipped: arm 2 reported Gemini quota_exhausted." };
  }
  return { status: "did_not_run", detail: "No result.json and no known cause — check the job's own logs." };
}

const results = ARM_DIRS.map((dir) => {
  const resultPath = path.join(OUT_DIR, dir, "result.json");
  if (!existsSync(resultPath)) {
    const { status, detail } = missingReason(dir);
    return { arm: dir, status, failing_gate: "n/a", attempts: 0, requests_issued: "unknown", peak_tokens_per_request: "unknown", detail };
  }
  return JSON.parse(readFileSync(resultPath, "utf-8"));
});

const header = "| Arm | Builder | Model | Status | Failing gate | Attempts | Requests | Peak tokens/req | Notes |\n|---|---|---|---|---|---|---|---|---|";
const rows = results.map((r) =>
  `| ${r.arm} | ${r.builder ?? "—"} | ${r.model ?? "—"} | ${r.status} | ${r.failing_gate ?? "—"} | ${r.attempts ?? 0} | ${r.requests_issued ?? 0} | ${r.peak_tokens_per_request ?? 0} | ${(r.detail ?? "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 200)} |`
);

const winner = results.find((r) => r.status === "pass");

const preflightPath = path.join(OUT_DIR, "preflight-providers.json");
let preflightSection = "";
if (existsSync(preflightPath)) {
  const pf = JSON.parse(readFileSync(preflightPath, "utf-8"));
  const pfHeader = "| Provider | OK | Status | Latency (ms) | Model echoed | Rate-limit headers |\n|---|---|---|---|---|---|";
  const pfRows = Object.entries(pf).map(
    ([name, r]) =>
      `| ${name} | ${r.ok ? "yes" : "no"} | ${r.status ?? "—"} | ${r.latency_ms ?? "—"} | ${r.model ?? "—"} | ${JSON.stringify(r.rate_limit_headers ?? {})} |`
  );
  preflightSection = ["", "## Provider preflight (one minimal completion each)", "", pfHeader, ...pfRows, ""].join("\n");
}

const table = [
  "# Phase 2 builder spike — results",
  "",
  `Run date: ${new Date().toISOString().slice(0, 10)}. Cost: arms use free-tier keys, but $0 is not verified — run 3's preflight made one ~60-token call to a paid OpenRouter model (fallback since removed).`,
  preflightSection,
  header,
  ...rows,
  "",
  winner
    ? `**Winner: ${winner.arm}** (${winner.builder} × ${winner.model}), passed all gates in ${winner.attempts} attempt(s).`
    : "**No arm passed all gates in this run.** See per-arm detail above and the uploaded attempt/gate logs.",
].join("\n");

writeFileSync("spike/DECISIONS-spike-table.md", table);
console.log(table);

if (winner) {
  const winnerDir = path.join(OUT_DIR, ARM_DIRS[results.indexOf(winner)]);
  const cover = path.join(winnerDir, "cover.png");
  if (existsSync(cover)) copyFileSync(cover, "spike/winner-cover.png");
  const pngs = existsSync(winnerDir) ? readdirSync(winnerDir).filter((f) => f.endsWith(".png")) : [];
  const denial = pngs.find((f) => /denial/i.test(f) && /1280x800/.test(f));
  if (denial) copyFileSync(path.join(winnerDir, denial), "spike/winner-denials.png");
}
