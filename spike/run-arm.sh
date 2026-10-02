#!/usr/bin/env bash
# Phase 2 builder spike — runs one (builder, model) arm end to end:
# clean copy -> baseline snapshot -> builder (2 attempts, +1 if smoke is the
# failing gate, fix-block on retry) -> allowlist check -> typecheck -> build
# -> check:static -> smoke.
# Writes spike/out/<arm>/result.json and copies shots/cover.png next to it.
#
# usage: run-arm.sh <arm-id> <aider|opencode|gemini-cli> <model> [nvidia]
#   4th arg "nvidia" = opencode goes through the paced NVIDIA proxy
#   (run-opencode.mjs); <model> is then the bare NIM id.
#
# Request/token accounting is best-effort, parsed from each CLI's own output
# (opencode: step_finish events; NVIDIA arm: the proxy's upstream request
# count) — a floor, not an authoritative ledger. "unknown", never a false 0.
set -uo pipefail

ARM="$1"
BUILDER="$2"         # "gemini-cli" | "aider" | "opencode"
MODEL="$3"           # model string passed to the builder
PROVIDER_MODE="${4:-}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROTO_NAME="prior-auth-tracker-v1"
PROTO_DIR="$ROOT/prototypes/$PROTO_NAME"
STARTER_DIR="$ROOT/archetypes/prior-auth-rcm"
# Snapshots of pf-engine/prompts/builder.md and fixtures/sample-brief.json:
# pf-engine is not checked out in the CI job, so ../pf-engine paths resolve to
# nothing (run 4: a 12-byte prompt).
# ponytail: manual copies, re-copy when either source changes.
BRIEF="$ROOT/${PF_BRIEF_PATH:-spike/inputs/sample-brief.json}"
PROMPT="$ROOT/spike/inputs/builder.md"
[ -s "$BRIEF" ] && [ -s "$PROMPT" ] || { echo "missing/empty spike inputs" >&2; exit 3; }
# The archetype comes from the brief; its Gate Contract addendum (contracts/archetypes/<archetype>/,
# in this repo, so CI has it) goes into the prompt between builder.md and the brief. A missing
# contract aborts the arm before any builder runs.
ARCHETYPE="$(node -e 'process.stdout.write(String(JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).archetype ?? ""))' "$BRIEF")"
ARCH_CONTRACT="$(node "$ROOT/spike/render-archetype-contract.mjs" "$ARCHETYPE")" \
  || { echo "no archetype contract for brief archetype '$ARCHETYPE' (contracts/archetypes/$ARCHETYPE/)" >&2; exit 3; }
# The kit's real API, generated from kit/src at run time (authoritative), plus kit/KIT.md as behaviour notes.
# Compiler flags = the archetype tsconfig's compilerOptions minus noEmit/paths/baseUrl (kit has no tsconfig of its
# own). ponytail: flags copied by hand, re-sync if archetypes/prior-auth-rcm/tsconfig.json changes.
KIT_MD="$ROOT/kit/KIT.md"
[ -s "$KIT_MD" ] || { echo "missing/empty kit/KIT.md" >&2; exit 3; }
KIT_DTS_DIR="$(mktemp -d)"
KIT_FILES="$(cd "$ROOT" && find kit/src \( -name '*.ts' -o -name '*.tsx' \) ! -name '*.test.*' ! -name '*.spec.*' | LC_ALL=C sort)"
(cd "$ROOT" && npx tsc $KIT_FILES --target ES2020 --useDefineForClassFields true --lib ES2020,DOM,DOM.Iterable \
  --module ESNext --skipLibCheck true --moduleResolution Bundler --resolveJsonModule true --isolatedModules true \
  --jsx react-jsx --strict true --declaration --emitDeclarationOnly --outDir "$KIT_DTS_DIR") \
  || { echo "kit declaration generation (tsc) failed" >&2; exit 3; }
# Paths in the headers are relative to kit/ (tsc's rootDir is kit/src).
KIT_API="$(cd "$KIT_DTS_DIR" && find . -name '*.d.ts' | LC_ALL=C sort | sed 's|^\./||' | while IFS= read -r f; do printf '// file: src/%s\n' "$f"; cat "$f"; done)"
[ -n "$KIT_API" ] || { echo "kit declaration generation produced no .d.ts files" >&2; exit 3; }
OUT_DIR="$ROOT/spike/out/$ARM"
mkdir -p "$OUT_DIR"
# Outside the prototype dir, so the builder can never touch it.
BASELINE="$ROOT/.pf/baseline.json"

RESULT="$OUT_DIR/result.json"

requests="unknown"
peak_tokens="unknown"
quota_exhausted=false
groq_reject=""
provider_error=""
rate_limited=""
builder_outcome=""   # opencode supervisor verdict, or builder_timeout on exit 124
builder_detail=""
# Paid OpenRouter ids are metered against OpenRouter /key (spend.mjs): before and after every attempt,
# and after every step inside the supervisor. PF_SPEND_START is the key's usage when the dispatch began.
metered=false
arm_usage_start=""
last_usage=""

log() { echo "[$ARM] $*"; }
json_str() { node -e 'process.stdout.write(JSON.stringify(require("fs").readFileSync(0,"utf8").trim()))'; }
usd_delta() { [ -n "$1" ] && [ -n "$2" ] && node -e 'console.log(Math.round((+process.argv[1] - +process.argv[2]) * 1e6) / 1e6)' "$1" "$2" || echo null; }
json_num_or_unknown() { [ "$1" = "unknown" ] && echo '"unknown"' || echo "$1"; }

reset_prototype() {
  rm -rf "$PROTO_DIR"
  mkdir -p "$ROOT/prototypes"
  cp -r "$STARTER_DIR" "$PROTO_DIR"
  # The starter's package.json "name" must not collide with the archetype's own
  # workspace entry — npm refuses two workspaces with the same name.
  node -e "
    const fs = require('node:fs');
    const p = '$PROTO_DIR/package.json';
    const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
    pkg.name = '$PROTO_NAME';
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
  "
  # Pre-install the archetype's deps so the builder never has a reason to touch package.json.
  (cd "$ROOT" && npm install --no-audit --no-fund >/dev/null 2>&1) || true
  # The brief's design.palette (a preset name) becomes src/theme.ts. Before the baseline snapshot, so the
  # generated theme is part of the baseline and the builder still may not change it.
  local palette
  palette="$(node -e 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).design?.palette;process.stdout.write(typeof p==="string"?p:"")' "$BRIEF")"
  (cd "$ROOT" && npm run --silent theme:gen -- --preset "$palette" --write "$PROTO_DIR") \
    || { echo "theme-gen failed for brief design.palette '$palette' (unknown preset or contrast failure)" >&2; exit 3; }
  # Baseline AFTER the rename/install and BEFORE any builder runs.
  node "$ROOT/spike/check-allowlist.mjs" snapshot "$PROTO_DIR" "$BASELINE"
}

# Counters always; regex classification only for builders without their own
# verdict (opencode's supervisor classifies from the JSON stream, and a regex
# over an agent transcript full of source code would false-positive).
scan_log() {
  local log_file="$1"
  local parsed
  parsed=$(node "$ROOT/spike/scan-usage.mjs" "$log_file" "$BUILDER" 2>/dev/null)
  local n tok
  n=$(echo "$parsed" | cut -d' ' -f1)
  tok=$(echo "$parsed" | cut -d' ' -f2)
  if [ "$n" != "unknown" ]; then
    if [ "$requests" = "unknown" ]; then requests=$n; else requests=$((requests + n)); fi
  fi
  if [ "$tok" != "unknown" ] && { [ "$peak_tokens" = "unknown" ] || [ "$tok" -gt "$peak_tokens" ] 2>/dev/null; }; then
    peak_tokens=$tok
  fi
  [ "$BUILDER" = "opencode" ] && return
  # Daily quota is terminal for that provider; a per-minute limit is not.
  if grep -qE 'PerDay|TerminalQuotaError|exhausted your daily quota|free-models-per-day' "$log_file"; then
    quota_exhausted=true
  elif grep -qE 'RESOURCE_EXHAUSTED|"code": ?429|quota exceeded|rate.?limit exceeded|RateLimitError|RetryableQuotaError' "$log_file"; then
    rate_limited="$(grep -E 'quotaId|Quota exceeded for metric|[Rr]ate limit' "$log_file" | head -2 | tr '\n' ' ')"
  fi
  # Auth / permission / model-not-found / finish_reason:error are terminal for
  # the arm: the builder did no (trustworthy) work, and the same model is not retried.
  local perr_re='PERMISSION_DENIED|UNAUTHENTICATED|AuthenticationError|NotFoundError|"code": ?(401|402|403|404)|Payment Required|[Mm]odel .{0,80}(not found|does not exist)|is not found for API version|No endpoints found|finish_reason.{0,40}error'
  if grep -qE "$perr_re" "$log_file"; then
    provider_error="$(grep -E "$perr_re|\"message\"" "$log_file" | head -3 | tr '\n' ' ')"
    tail -c 4000 "$log_file" >"$OUT_DIR/raw-provider-error.txt"
  fi
  # Request-size rejection only on explicit phrases (a bare '413' matched stack-trace line numbers).
  local size_re='Request too large|Limit [0-9]+, Requested [0-9]+|payload too large|HTTP 413|status(Code)?[": =]+413|context_length_exceeded|maximum context length'
  if grep -qiE "$size_re" "$log_file"; then
    groq_reject="$(grep -iE "$size_re" "$log_file" | head -1)"
  fi
}

run_builder() {
  local attempt="$1" fix_block="$2"
  local log_file="$OUT_DIR/attempt-$attempt.log"
  local prompt_file="$OUT_DIR/attempt-$attempt-prompt.txt"
  local prompt_text
  prompt_text="$(sed "s|<repo-name>|$PROTO_NAME|g" "$PROMPT")"$'\n\n## Archetype Contract\n'"$(printf '%s' "$ARCH_CONTRACT" | sed "s|<repo-name>|$PROTO_NAME|g")"$'\n\n## Kit API (generated from kit source — authoritative)\n'"These declarations are the kit's real exported API. Use only props, types, values and functions that appear here. If KIT.md disagrees with these declarations, the declarations win."$'\n'"$KIT_API"$'\n\n## Kit Behaviour\n'"$(sed "s|<repo-name>|$PROTO_NAME|g" "$KIT_MD")"$'\n\n## Brief\n'"$(cat "$BRIEF")"
  if [ -n "$fix_block" ]; then
    prompt_text="$prompt_text"$'\n\n## Fix block (attempt '"$attempt"$')\n'"$fix_block"
  fi
  builder_outcome=""
  builder_detail=""

  pushd "$PROTO_DIR" >/dev/null
  local exit_code=0
  if [ "$BUILDER" = "gemini-cli" ]; then
    GEMINI_CLI_TRUST_WORKSPACE=true timeout 1200 gemini -p "$prompt_text" --yolo --output-format json >"$log_file" 2>&1
    exit_code=$?
  elif [ "$BUILDER" = "opencode" ]; then
    printf '%s' "$prompt_text" >"$prompt_file"
    # The supervisor owns the 20 min ceiling, the 300 s silence rule and the
    # request cap, and never trusts opencode's exit code (it can hang forever).
    local paced=""
    [ "$PROVIDER_MODE" = "nvidia" ] && paced="--paced-nvidia"
    node "$ROOT/spike/run-opencode.mjs" --model "$MODEL" --prompt-file "$prompt_file" --log "$log_file" --result "$OUT_DIR/attempt-$attempt-opencode.json" $paced
    builder_outcome=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(r.outcome)' "$OUT_DIR/attempt-$attempt-opencode.json" 2>/dev/null || echo builder_hung)
    builder_detail=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(r.detail)' "$OUT_DIR/attempt-$attempt-opencode.json" 2>/dev/null)
  else
    printf '%s' "$prompt_text" >"$prompt_file"
    # prototypes/ is gitignored in pf-builder and aider skips gitignored files,
    # so give the prototype its own throwaway repo (removed again below).
    # --edit-format diff is pinned: left to infer from the model id, aider picks
    # whole-file for unknown models and re-emits the entire app every response.
    [ -d .git ] || { git init -q && git add -A && git -c user.name=pf -c user.email=pf@example.invalid commit -qm start; }
    timeout 1200 aider --message-file "$prompt_file" --model "$MODEL" --weak-model "$MODEL" --edit-format diff \
      --yes-always --no-stream --no-pretty --no-auto-commits --no-gitignore --no-check-update --no-analytics \
      src/screens/*.tsx src/nav.ts src/seed.ts src/tour.json >"$log_file" 2>&1
    exit_code=$?
  fi
  rm -rf .git
  popd >/dev/null
  # timeout(1) exits 124 on expiry; that is a ran-but-did-not-finish verdict.
  if [ "$exit_code" -eq 124 ]; then builder_outcome="builder_timeout"; builder_detail="timeout 1200s expired"; fi
  scan_log "$log_file"
  if [ "$BUILDER" = "opencode" ]; then
    local pr
    pr=$(node -e 'const r=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));console.log(r.proxy_requests)' "$OUT_DIR/attempt-$attempt-opencode.json" 2>/dev/null)
    case "$pr" in ''|unknown) ;; *) requests=$pr ;; esac   # proxy count includes 429 retries
    grep -qE 'PerDay|free-models-per-day' <<<"$builder_detail" && quota_exhausted=true
  fi
  # Gemini CLI via the LiteLLM proxy: the proxy log is the only request ledger.
  if [ -n "${PROXY_LOG:-}" ] && [ -f "$PROXY_LOG" ]; then
    local total n_proxy
    total=$(wc -l <"$PROXY_LOG")
    n_proxy=$(tail -n +$((${PROXY_LOG_OFFSET:-0} + 1)) "$PROXY_LOG" | grep -cE 'POST /v1beta/models/[^ ]*[gG]enerateContent')
    PROXY_LOG_OFFSET=$total
    proxy_requests=$((${proxy_requests:-0} + n_proxy))
    [ "$proxy_requests" -gt 0 ] && requests=$proxy_requests
  fi
}

# Prints the allowlist verdict as JSON {"forbidden":[...],"changed":n}.
check_allowlist() { node "$ROOT/spike/check-allowlist.mjs" check "$PROTO_DIR" "$BASELINE"; }
json_field() { node -e 'const r=JSON.parse(process.argv[1]);const v=r[process.argv[2]];console.log(Array.isArray(v)?v.join(" "):v)' "$1" "$2"; }

builder_version() { { opencode --version || aider --version || gemini --version; } 2>/dev/null | head -1; }

write_result() {
  local status="$1" gate="$2" attempts="$3" detail="$4"
  cat >"$RESULT" <<JSON
{
  "arm": "$ARM",
  "builder": "$BUILDER",
  "model": "$MODEL",
  "status": "$status",
  "failing_gate": "$gate",
  "attempts": $attempts,
  "requests_issued": $(json_num_or_unknown "$requests"),
  "peak_tokens_per_request": $(json_num_or_unknown "$peak_tokens"),
  "quota_exhausted": $quota_exhausted,
  "spend_usd": $(usd_delta "$last_usage" "$arm_usage_start"),
  "dispatch_spend_usd": $(usd_delta "$last_usage" "${PF_SPEND_START:-}"),
  "node_version": "$(node -v)",
  "builder_version": $(builder_version | json_str),
  "groq_reject_reason": $( [ -n "$groq_reject" ] && printf '%s' "$groq_reject" | json_str || echo null ),
  "detail": $(printf '%s' "$detail" | json_str)
}
JSON
  log "result: $status ($gate)"
}

# Aborts the arm (result written, exit 0) at the spend ceiling, or when usage cannot be read (fail closed).
spend_check() {  # $1 = label, $2 = attempts so far
  $metered || return 0
  local out code
  out="$(node "$ROOT/spike/spend.mjs" 2>"$OUT_DIR/spend-check.err")"; code=$?
  if [ "$code" -eq 0 ] || [ "$code" -eq 7 ]; then
    last_usage="$(node -e 'console.log(JSON.parse(process.argv[1]).usage)' "$out")"
    [ -n "$arm_usage_start" ] || arm_usage_start="$last_usage"
    log "spend ($1): $out"
  fi
  case "$code" in
    0) ;;
    7) write_result "spend_ceiling" "none" "$2" "Spend ceiling reached ($1): $out"; exit 0;;
    *) write_result "spend_check_failed" "none" "$2" "Cannot meter spend ($1): $(tr '\n' ' ' <"$OUT_DIR/spend-check.err" 2>/dev/null)"; exit 0;;
  esac
}

# What the builder (and the report) see of a failed gate. A Playwright log ends with the numbered failure
# blocks; the tail shows only the last test, so start at failure 1 and keep the head. Other gates: the tail.
gate_feedback() {
  # Playwright: the numbered failure blocks (the tail shows only the last test). tsc: the head (first errors
  # first). Anything else: the tail.
  if grep -q '^  1) ' "$1" 2>/dev/null; then sed -n '/^  1) /,$p' "$1" | head -c 6000
  elif [ "$2" = "typecheck" ]; then head -c 5000 "$1" 2>/dev/null || echo 'see gate log'
  else tail -c 4000 "$1" 2>/dev/null || echo 'see gate log'; fi
}

# Prints "pass" or the space-separated failing gates. typecheck and check:static are independent, so both
# always run and a builder sees every failure at once (dispatch 8/9: one gate per attempt needed 3 attempts).
# build needs a clean typecheck; smoke needs everything else clean.
run_gates() {
  local failed=""
  pushd "$PROTO_DIR" >/dev/null
  npm run --silent typecheck >"$OUT_DIR/gate-typecheck.log" 2>&1 || failed="typecheck"
  [ -n "$failed" ] || npm run --silent build >"$OUT_DIR/gate-build.log" 2>&1 || { [ -n "$failed" ] || failed="build"; }
  popd >/dev/null
  (cd "$ROOT" && npm run --silent check:static -- "$PROTO_DIR" "$STARTER_DIR") >"$OUT_DIR/gate-check-static.log" 2>&1 || failed="$failed check:static"
  if [ -z "$failed" ]; then
    (cd "$ROOT" && PROTOTYPE_DIR="$PROTO_DIR" BRIEF_PATH="$BRIEF" npm run --silent smoke) >"$OUT_DIR/gate-smoke.log" 2>&1 || failed="smoke"
  fi
  failed="${failed# }"
  echo "${failed:-pass}"
}

# Feedback for every failing gate named in $1.
all_feedback() {
  local g
  for g in $1; do printf '### %s\n%s\n\n' "$g" "$(gate_feedback "$OUT_DIR/gate-${g//:/-}.log" "$g")"; done
}

main() {
  log "node $(node -v); builder $BUILDER $(builder_version); model $MODEL"
  # Config guards happen at the call site: a bad id aborts the arm, never reaches a provider.
  # Allowlist lives in allowed-model.mjs: the paid builder plus any id ending :free.
  case "$MODEL" in openrouter/*)
    node "$ROOT/spike/allowed-model.mjs" "$MODEL" 2>"$OUT_DIR/allowlist.err" || { write_result "config_error" "none" 0 "refusing non-allowlisted OpenRouter model $MODEL: $(cat "$OUT_DIR/allowlist.err")"; exit 0; }
    case "$MODEL" in *:free) ;; *) metered=true;; esac;;
  esac
  if [ "$BUILDER" = "opencode" ]; then
    case "$MODEL" in *[gG]emini*|google/*) write_result "config_error" "none" 0 "OpenCode must never run against Gemini ($MODEL)"; exit 0;; esac
  fi

  reset_prototype
  local attempt=1 fix_block="" max_attempts=2

  while [ "$attempt" -le "$max_attempts" ]; do
    spend_check "before attempt $attempt" "$((attempt - 1))"
    log "attempt $attempt: running $BUILDER ($MODEL)"
    run_builder "$attempt" "$fix_block"
    cp -r "$PROTO_DIR/src" "$OUT_DIR/workspace-attempt-$attempt" 2>/dev/null || true
    spend_check "after attempt $attempt" "$attempt"

    if [ "$quota_exhausted" = true ]; then
      write_result "quota_exhausted" "none" "$attempt" "Provider daily quota exhausted — stop and resume next day, do not cut this run short. $builder_detail"
      exit 2  # distinct exit code: workflow halts the shared-pool arms, not just this one
    fi
    # An empty attempt (the provider returned zero output tokens twice for one step) gets the second attempt.
    if [ "$builder_outcome" = "empty_step_after_retry" ]; then
      if [ "$attempt" -ge "$max_attempts" ]; then write_result "$builder_outcome" "none" "$attempt" "$builder_detail"; exit 0; fi
      fix_block="Your previous attempt ended before finishing. Inspect the current files in src/ and complete the work."
      attempt=$((attempt + 1)); continue
    fi
    # Supervisor / timeout verdicts. None of these are retried: a retry would
    # spend another request budget against the same stall (or same provider error).
    # Exception: a spent request cap says nothing about the files. If any changed (dispatch 6: all 8 written
    # by step 35 of 40), judge them at the gates and let attempt 2 finish the job. No change stays terminal.
    if [ "$builder_outcome" = "builder_request_cap" ] && [ "$(json_field "$(check_allowlist)" changed)" != "0" ]; then
      log "request cap hit with files changed: continuing to allowlist and gates"
      builder_outcome=""
    fi
    case "$builder_outcome" in
      builder_timeout|builder_hung|builder_request_cap|provider_error|provider_rate_limited|spend_ceiling|config_error)
        write_result "$builder_outcome" "none" "$attempt" "$builder_detail"
        exit 0;;
    esac
    if [ -n "$provider_error" ]; then
      write_result "provider_error" "none" "$attempt" "$provider_error"
      exit 0
    fi
    if [ -n "$groq_reject" ]; then
      write_result "provider_rejected" "none" "$attempt" "$groq_reject"
      exit 0
    fi

    local verdict forbidden changed
    verdict="$(check_allowlist)"
    forbidden="$(json_field "$verdict" forbidden)"
    changed="$(json_field "$verdict" changed)"

    # Builder produced nothing: gates would just fail on the untouched starter and blame the wrong party.
    if [ "$changed" = "0" ] && [ "$attempt" -eq 1 ] && [ "$BUILDER" = "opencode" ]; then
      fix_block="Your previous attempt changed no files. Build the app now: write the files the brief requires."
      attempt=$((attempt + 1)); continue
    fi
    if [ "$changed" = "0" ]; then
      if [ -n "$rate_limited" ]; then
        write_result "provider_rate_limited" "none" "$attempt" "Builder made no changes; rate limit: $rate_limited"
      else
        write_result "builder_no_changes" "none" "$attempt" "Builder exited without changing any file. Log tail: $(tail -c 600 "$OUT_DIR/attempt-$attempt.log" | tr '\n' ' ')"
      fi
      exit 0
    fi

    if [ -n "$forbidden" ]; then
      if [ "$attempt" -ge "$max_attempts" ]; then
        write_result "touched_forbidden" "allowlist" "$attempt" "Builder edited files outside the allowlist: $forbidden"
        exit 0
      fi
      fix_block="You edited files outside the allowed set. Undo any change to these paths and redo your work using only src/screens/, src/nav.ts, src/seed.ts, src/tour.json: $forbidden"
      attempt=$((attempt + 1))
      continue
    fi

    local gate
    gate="$(run_gates)"
    if [ "$gate" = "pass" ]; then
      mkdir -p "$ROOT/shots"
      cp "$ROOT/shots"/*.png "$OUT_DIR/" 2>/dev/null || true
      cp "$PROTO_DIR/cover.png" "$OUT_DIR/cover.png" 2>/dev/null || true
      write_result "pass" "none" "$attempt" "All gates passed."
      exit 0
    fi

    # Smoke only runs once typecheck/build/check:static are clean. Whoever gets that far earns one more attempt.
    [ "$gate" = "smoke" ] && max_attempts=3

    if [ "$attempt" -ge "$max_attempts" ]; then
      write_result "gate_failed" "${gate// /,}" "$attempt" "$(all_feedback "$gate")"
      exit 0
    fi

    fix_block="These gates failed: ${gate// /, }. Fix only what is listed, do not refactor or touch anything else:
$(all_feedback "$gate")"
    attempt=$((attempt + 1))
  done
}

main
