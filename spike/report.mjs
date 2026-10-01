// Phase 2 spike report job — reads each arm's result.json (downloaded into
// spike/out/<artifact-name>/ by actions/download-artifact), writes the
// DECISIONS.md-style table, and stages the winning arm's cover.png + denials
// screenshot. Winner = first arm, in priority order, with status "pass".
// "Attribution" is a mechanical first guess from the status (provider vs
// harness vs builder) — the human write-up checks it against the logs.
import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "spike/out";
const ARMS = [
  { dir: "spike-arm-1-aider-openrouter", label: "1 Aider x OpenRouter" },
  { dir: "spike-arm-2-gemini-cli-openrouter", label: "2 Gemini CLI x OpenRouter (litellm proxy)" },
  { dir: "spike-arm-3-aider-nvidia", label: "3 Aider x NVIDIA" },
  { dir: "spike-arm-4-aider-gemini", label: "4 Aider x Gemini (control)" },
];
const env = process.env;

// Why a missing result.json is missing — only from facts the workflow knows.
function missingReason(dir) {
  if (env.PREFLIGHT_RESULT && env.PREFLIGHT_RESULT !== "success")
    return ["preflight_gate_failed", "No provider accepted the full prompt; no arm ran."];
  if (dir === ARMS[0].dir && env.OPENROUTER_OK !== "true")
    return ["skipped_preflight", "OpenRouter did not accept the full prompt in preflight."];
  if (dir === ARMS[1].dir) {
    if (env.OPENROUTER_OK !== "true") return ["skipped_preflight", "OpenRouter did not accept the full prompt in preflight."];
    if (env.ARM1_QUOTA_EXHAUSTED === "true") return ["skipped_quota", "Arm 1 exhausted the shared OpenRouter daily budget."];
    if (env.ARM2_HARNESS_ERROR === "true") return ["harness_error", "LiteLLM proxy failed to start or its Gemini-format smoke test failed (see proxy.log / proxy-smoke.log)."];
  }
  if (dir === ARMS[2].dir && env.NVIDIA_ARM !== "true")
    return ["skipped_preflight", "NVIDIA did not meet the include rule (full prompt accepted and a clean burst)."];
  if (dir === ARMS[3].dir && env.INCLUDE_GEMINI_CONTROL !== "true")
    return ["excluded_by_input", "include_gemini_control was unchecked."];
  return ["did_not_run", "No result.json and no known cause — check the job's own logs."];
}

const ATTRIBUTION = {
  pass: "—",
  gate_failed: "builder (verify gate log)",
  touched_forbidden: "builder",
  builder_no_changes: "unclear — builder or harness (read log)",
  quota_exhausted: "provider limit",
  rate_limited: "provider limit",
  provider_error: "provider/config (read log)",
  provider_rejected: "provider limit",
  harness_error: "harness",
};
const attribution = (s) => ATTRIBUTION[s] ?? (s.startsWith("skipped") || s.startsWith("excluded") || s === "preflight_gate_failed" ? "n/a (not run)" : "unknown");

const results = ARMS.map(({ dir, label }) => {
  const p = path.join(OUT_DIR, dir, "result.json");
  if (existsSync(p)) return { ...JSON.parse(readFileSync(p, "utf-8")), label };
  const [status, detail] = missingReason(dir);
  return { label, status, failing_gate: "n/a", attempts: 0, requests_issued: "unknown", peak_tokens_per_request: "unknown", detail };
});

const clean = (t) => String(t ?? "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 220);
const header = "| Arm | Model | Status | Attribution | Failing gate | Attempts | Requests (floor) | Peak tokens/req | Notes |\n|---|---|---|---|---|---|---|---|---|";
const rows = results.map((r) =>
  `| ${r.label} | ${r.model ?? "—"} | ${r.status} | ${attribution(r.status)} | ${r.failing_gate ?? "—"} | ${r.attempts ?? 0} | ${r.requests_issued ?? "unknown"} | ${r.peak_tokens_per_request ?? "unknown"} | ${clean(r.detail)} |`
);
const winner = results.find((r) => r.status === "pass");

// Preflight: headline only. Full verbatim headers live in the spike-preflight artifact.
let pfSection = "";
const pfPath = path.join(OUT_DIR, "preflight-providers.json");
if (existsSync(pfPath)) {
  const pf = JSON.parse(readFileSync(pfPath, "utf-8"));
  const line = (name, r) => `| ${name} | ${r.model} | ${r.status ?? "—"} | ${r.accepted ?? r.callable ?? "—"} | ${r.prompt_tokens ?? "—"} | ${r.finish_reason ?? "—"} | ${clean(r.error_body ?? "").slice(0, 120)} |`;
  const pfRows = [
    ...(pf.openrouter.full_prompt ?? []).map((r) => line("OpenRouter full prompt", r)),
    ...(pf.nvidia.full_prompt ? [line("NVIDIA full prompt", pf.nvidia.full_prompt)] : []),
    ...(pf.nvidia.callable ?? []).map((r) => line("NVIDIA callable?", r)),
  ];
  pfSection = [
    "", `## Extended preflight (prompt ${pf.prompt_bytes} bytes)`, "",
    "| Check | Model | HTTP | Accepted/callable | prompt_tokens | finish | Error |", "|---|---|---|---|---|---|---|", ...pfRows, "",
    `NVIDIA burst: ${JSON.stringify(pf.nvidia.burst?.status_counts ?? "n/a")}. Gate: ${JSON.stringify(pf.gate)}.`, "",
  ].join("\n");
}

const table = [
  "# Phase 2 builder spike — run 6 results",
  "",
  `Run date: ${new Date().toISOString().slice(0, 10)}. OpenRouter model: ${env.OPENROUTER_MODEL}. Counters are floors parsed from tool output (or the proxy log); "unknown" means unreadable, never 0.`,
  pfSection,
  header,
  ...rows,
  "",
  winner ? `**Winner: ${winner.label}** (${winner.model}), passed all gates in ${winner.attempts} attempt(s).` : "**No arm passed all gates in this run.** See per-arm detail and the uploaded logs.",
].join("\n");

writeFileSync("spike/DECISIONS-spike-table.md", table);
console.log(table);

if (winner) {
  const winnerDir = path.join(OUT_DIR, ARMS[results.indexOf(winner)].dir);
  const cover = path.join(winnerDir, "cover.png");
  if (existsSync(cover)) copyFileSync(cover, "spike/winner-cover.png");
  const pngs = existsSync(winnerDir) ? readdirSync(winnerDir).filter((f) => f.endsWith(".png")) : [];
  const denial = pngs.find((f) => /denial/i.test(f) && /1280x800/.test(f));
  if (denial) copyFileSync(path.join(winnerDir, denial), "spike/winner-denials.png");
}
