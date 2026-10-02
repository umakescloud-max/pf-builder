// Phase 2 spike report job — reads each arm's result.json (downloaded into
// spike/out/<artifact-name>/ by actions/download-artifact), writes the
// DECISIONS.md-style table, and stages the winning arm's cover.png + denials
// screenshot. Winner = first arm, in priority order (A, B, C), with status "pass".
//
// Attribution is exactly one of harness / builder / provider / config / unknown,
// derived mechanically from the status. A status that did not reach the gates
// produced NO builder data, and the table says so: a harness or provider
// failure must never read as a statement about a model.
import { readFileSync, writeFileSync, existsSync, readdirSync, copyFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = "spike/out";
const ARMS = [
  { dir: "spike-arm-p-opencode-openrouter-paid", label: "P OpenCode x OpenRouter (paid primary)" },
  { dir: "spike-arm-a-opencode-openrouter", label: "A OpenCode x OpenRouter (free, retired)" },
  { dir: "spike-arm-b-aider-openrouter", label: "B Aider diff x OpenRouter (control)" },
  { dir: "spike-arm-c-opencode-nvidia", label: "C OpenCode x NVIDIA (overflow)" },
  { dir: "spike-arm-d-gemini-cli-openrouter", label: "D Gemini CLI x OpenRouter (retired)" },
  { dir: "spike-arm-e-aider-gemini", label: "E Aider x Gemini (retired)" },
];
const env = process.env;
const D = { p: ARMS[0].dir, a: ARMS[1].dir, b: ARMS[2].dir, c: ARMS[3].dir, d: ARMS[4].dir, e: ARMS[5].dir };

// Why a missing result.json is missing — only from facts the workflow knows.
function missingReason(dir) {
  if (env.PREFLIGHT_RESULT && env.PREFLIGHT_RESULT !== "success")
    return ["preflight_gate_failed", "Preflight failed (no model accepted the full prompt, a configured model is near deprecation, a model is not allowlisted, or spend could not be metered); no arm ran."];
  if (dir === D.p) {
    if (env.INCLUDE_PAID_ARM !== "true") return ["excluded_by_input", "include_paid_arm was off."];
    if (env.OR_P_OK !== "true") return ["skipped_preflight", "Arm P's model did not pass preflight (not allowlisted, not listed, or rejected the prompt)."];
  }
  if (dir === D.a && env.INCLUDE_ARM_A !== "true") return ["excluded_by_input", "include_arm_a was off (retired: dispatch-1 builder verdict)."];
  if (dir === D.a && env.OR_A_OK !== "true") return ["skipped_preflight", "Arm A's OpenRouter model did not pass preflight."];
  if (dir === D.b) {
    if (env.INCLUDE_ARM_B !== "true") return ["excluded_by_input", "include_arm_b was off (dispatch 5 runs arm C only)."];
    if (env.OR_B_OK !== "true") return ["skipped_preflight", "Arm B's OpenRouter model did not pass preflight."];
    if (env.ARM_A_QUOTA_EXHAUSTED === "true") return ["skipped_quota", "Arm A exhausted the shared OpenRouter daily budget."];
  }
  if (dir === D.c && env.INCLUDE_ARM_C !== "true") return ["excluded_by_input", "include_arm_c was off (free-tier builder selection deferred; kimi-k3 unresolved)."];
  if (dir === D.c && env.NVIDIA_OK !== "true") return ["skipped_preflight", "No NVIDIA model passed preflight."];
  if (dir === D.d) {
    if (env.INCLUDE_GEMINI_CLI_ARM !== "true") return ["excluded_by_input", "include_gemini_cli_arm was off (retired arm)."];
    if (env.ARM_D_HARNESS_ERROR === "true") return ["harness_error", "LiteLLM proxy failed to start or its Gemini-format smoke test failed (see proxy.log)."];
  }
  if (dir === D.e && env.INCLUDE_GEMINI_CONTROL !== "true") return ["excluded_by_input", "include_gemini_control was off (retired arm)."];
  return ["did_not_run", "No result.json and no known cause — check the job's own logs."];
}

const ATTRIBUTION = {
  pass: "n/a",
  gate_failed: "builder",
  touched_forbidden: "builder",
  builder_no_changes: "unknown",
  empty_step_after_retry: "unknown",
  builder_timeout: "unknown",
  builder_hung: "unknown",
  builder_request_cap: "unknown",
  quota_exhausted: "provider",
  provider_rate_limited: "provider",
  provider_error: "provider",
  provider_rejected: "provider",
  config_error: "config",
  spend_ceiling: "config",
  spend_check_failed: "harness",
  harness_error: "harness",
};
const NOT_RUN = (s) => s.startsWith("skipped") || s.startsWith("excluded") || s === "preflight_gate_failed";
const attribution = (s) => ATTRIBUTION[s] ?? (NOT_RUN(s) ? "n/a (not run)" : "unknown");
// Builder data exists only when the builder's output was actually evaluated.
const hasBuilderData = (s) => ["pass", "gate_failed", "touched_forbidden"].includes(s);

const results = ARMS.map(({ dir, label }) => {
  const p = path.join(OUT_DIR, dir, "result.json");
  if (existsSync(p)) return { ...JSON.parse(readFileSync(p, "utf-8")), label };
  const [status, detail] = missingReason(dir);
  return { label, status, failing_gate: "n/a", attempts: 0, requests_issued: "unknown", peak_tokens_per_request: "unknown", detail };
});

const clean = (t) => String(t ?? "").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 220);
const gateReached = (r) => (r.status === "pass" ? "all gates" : r.status === "gate_failed" ? r.failing_gate : r.status === "touched_forbidden" ? "allowlist" : "none");
const usd = (v) => (typeof v === "number" ? `$${v.toFixed(4)}` : "n/a (free or not run)");
const header = "| Arm | Model | Result | Gate reached | Attempts | Requests (floor) | Peak tokens/req | Spend (OpenRouter /key) | Attribution | Builder data? | Notes |\n|---|---|---|---|---|---|---|---|---|---|---|";
const rows = results.map((r) =>
  `| ${r.label} | ${r.model ?? "—"} | ${r.status} | ${gateReached(r)} | ${r.attempts ?? 0} | ${r.requests_issued ?? "unknown"} | ${r.peak_tokens_per_request ?? "unknown"} | ${usd(r.spend_usd)} | ${attribution(r.status)} | ${NOT_RUN(r.status) ? "n/a" : hasBuilderData(r.status) ? "yes" : "NONE"} | ${clean(r.detail)} |`
);
const winner = results.find((r) => r.status === "pass");
const noData = results.filter((r) => !NOT_RUN(r.status) && !hasBuilderData(r.status));

// Preflight: headline only. Full verbatim headers live in the spike-preflight artifact.
let pfSection = "";
const pfPath = path.join(OUT_DIR, "preflight-providers.json");
if (existsSync(pfPath)) {
  const pf = JSON.parse(readFileSync(pfPath, "utf-8"));
  const line = (name, r) => `| ${name} | ${r.model} | ${r.status ?? "—"} | ${r.accepted ?? "—"} | ${r.prompt_tokens ?? "—"} | ${r.finish_reason ?? "—"} | ${clean(JSON.stringify(r.deprecation_headers ?? {}))} | ${clean(r.error_body ?? "").slice(0, 120)} |`;
  const pfRows = [
    ...(pf.openrouter?.full_prompt ?? []).map((r) => line("OpenRouter full prompt", r)),
    ...(pf.nvidia?.full_prompt ?? []).map((r) => line("NVIDIA full prompt", r)),
  ];
  pfSection = [
    "", `## Preflight (prompt ${pf.prompt_bytes} bytes)`, "",
    "| Check | Model | HTTP | Accepted | prompt_tokens | finish | Deprecation headers | Error |", "|---|---|---|---|---|---|---|---|", ...pfRows, "",
    `Gate: ${JSON.stringify(pf.gate)}.`, "",
  ].join("\n");
}

const table = [
  "# Phase 2 builder spike — results",
  "",
  `Run date: ${new Date().toISOString().slice(0, 10)}. Models: P ${env.PAID_MODEL}, A ${env.ARM_A_MODEL}, B ${env.ARM_B_MODEL}, C ${env.NVIDIA_MODEL} (or its configured fallback). Counters are floors parsed from tool output or the NVIDIA proxy; "unknown" means unreadable, never 0.`,
  pfSection,
  header,
  ...rows,
  "",
  (() => {
    const reads = results.map((r) => r.dispatch_spend_usd).filter((v) => typeof v === "number");
    return reads.length
      ? `**Dispatch spend: $${Math.max(...reads).toFixed(4)}** (OpenRouter /key usage at the last arm check minus usage at dispatch start; includes the preflight probe; ceiling $${env.PF_SPEND_CEILING ?? "2.00"}).`
      : "Dispatch spend: no metered arm ran, $0 by construction (free ids only).";
  })(),
  "",
  noData.length
    ? `**No builder data from: ${noData.map((r) => r.label).join("; ")}.** Those arms never reached a gate, so nothing about those models is concluded from this run.`
    : "",
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

// Red when no arm passed, so a green check means a green gate. The table is already written above.
process.exitCode = winner ? 0 : 1;
