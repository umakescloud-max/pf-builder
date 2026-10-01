#!/usr/bin/env bash
# Phase 2 builder spike — runs one (builder, model) arm end to end:
# clean copy -> builder (up to 2 attempts, fix-block on retry) -> allowlist
# diff -> typecheck -> build -> check:static -> smoke. Writes spike/result.json
# and copies shots/cover.png into spike/out/ for the report job to pick up.
#
# Request/token accounting is best-effort, parsed from each CLI's own stdout —
# neither Aider nor Gemini CLI exposes a structured per-call usage API here,
# so counts are a floor, not an authoritative ledger. Good enough to compare
# arms against each other, documented as such in DECISIONS.md.
set -uo pipefail

ARM="$1"            # arm id, e.g. "aider-openrouter", "gemini-cli-openrouter", "aider-nvidia", "aider-gemini"
BUILDER="$2"         # "gemini-cli" | "aider"
MODEL="$3"           # model string passed to the builder
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# Every OpenRouter call must be an explicit :free id; a paid call already slipped through once.
case "$MODEL" in openrouter/*:free|openrouter/*) case "$MODEL" in *:free) ;; *) echo "refusing non-:free OpenRouter model $MODEL" >&2; exit 3;; esac;; esac
PROTO_NAME="prior-auth-tracker-v1"
PROTO_DIR="$ROOT/prototypes/$PROTO_NAME"
STARTER_DIR="$ROOT/archetypes/prior-auth-rcm"
# Snapshots of pf-engine/prompts/builder.md and fixtures/sample-brief.json:
# pf-engine is not checked out in the CI job, so the old ../pf-engine paths
# resolved to nothing and every builder got an empty prompt (run 4: 12 bytes).
# ponytail: manual copies, re-copy when either source changes.
BRIEF="$ROOT/spike/inputs/sample-brief.json"
PROMPT="$ROOT/spike/inputs/builder.md"
[ -s "$BRIEF" ] && [ -s "$PROMPT" ] || { echo "missing/empty spike inputs" >&2; exit 3; }
OUT_DIR="$ROOT/spike/out/$ARM"
mkdir -p "$OUT_DIR"

RESULT="$OUT_DIR/result.json"

requests="unknown"
peak_tokens="unknown"
quota_exhausted=false
groq_reject=""
provider_error=""
rate_limited=""

log() { echo "[$ARM] $*"; }

reset_prototype() {
  rm -rf "$PROTO_DIR"
  mkdir -p "$ROOT/prototypes"
  cp -r "$STARTER_DIR" "$PROTO_DIR"
  # The starter's package.json "name" must not collide with the archetype's
  # own workspace entry — npm refuses to resolve two workspaces with the
  # same name. check-static.ts already expects this (it deletes "name"
  # before diffing), this just does the actual rename.
  node -e "
    const fs = require('node:fs');
    const p = '$PROTO_DIR/package.json';
    const pkg = JSON.parse(fs.readFileSync(p, 'utf-8'));
    pkg.name = '$PROTO_NAME';
    fs.writeFileSync(p, JSON.stringify(pkg, null, 2) + '\n');
  "
  # Pre-install the archetype's own deps into the workspace so the builder
  # never has a reason to touch package.json itself (run 2's arm 2 flagged
  # touched_forbidden on it for exactly this).
  (cd "$ROOT" && npm install --no-audit --no-fund >/dev/null 2>&1) || true
}

# Scans a log for best-effort request/token signals and known Groq/Gemini
# rejection patterns. Updates the shared counters above.
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
  # Daily quota is terminal for that provider; a per-minute limit is not.
  # Gemini CLI's 429 text has no quotaId (run 5: "limit: 20" was labelled
  # per-minute) but names the class itself: TerminalQuotaError / "exhausted
  # your daily quota" = daily, RetryableQuotaError = per-minute. OpenRouter
  # names "free-models-per-day" / "free-models-per-min".
  if grep -qE 'PerDay|TerminalQuotaError|exhausted your daily quota|free-models-per-day' "$log_file"; then
    quota_exhausted=true
  elif grep -qE 'RESOURCE_EXHAUSTED|"code": ?429|quota exceeded|rate.?limit exceeded|RateLimitError|RetryableQuotaError' "$log_file"; then
    rate_limited="$(grep -E 'quotaId|Quota exceeded for metric|[Rr]ate limit' "$log_file" | head -2 | tr '
' ' ')"
  fi
  # Auth / permission / model-not-found are terminal: the builder never did
  # any work, so running the gates on the untouched starter would report a
  # meaningless gate failure (run 3, arm 2: two 403s, then "check:static").
  if grep -qE 'PERMISSION_DENIED|UNAUTHENTICATED|AuthenticationError|NotFoundError|"code": ?(401|402|403|404)|Payment Required|[Mm]odel .{0,80}(not found|does not exist)|is not found for API version|No endpoints found' "$log_file"; then
    provider_error="$(grep -E 'PERMISSION_DENIED|UNAUTHENTICATED|AuthenticationError|NotFoundError|"code": ?(401|402|403|404)|Payment Required|[Mm]odel .{0,80}(not found|does not exist)|is not found for API version|No endpoints found|"message"' "$log_file" | head -3 | tr '\n' ' ')"
  fi
  # Request-size rejection only on explicit phrases (the old bare '413'/'tpm'
  # also matched stack-trace line numbers).
  local size_re='Request too large|Limit [0-9]+, Requested [0-9]+|payload too large|HTTP 413|status(Code)?[": =]+413|context_length_exceeded|maximum context length'
  if grep -qiE "$size_re" "$log_file"; then
    groq_reject="$(grep -iE "$size_re" "$log_file" | head -1)"
  fi
}

run_builder() {
  local attempt="$1" fix_block="$2"
  local log_file="$OUT_DIR/attempt-$attempt.log"
  local prompt_text
  prompt_text="$(cat "$PROMPT")"$'\n\n## Brief\n'"$(cat "$BRIEF")"
  if [ -n "$fix_block" ]; then
    prompt_text="$prompt_text"$'\n\n## Fix block (attempt '"$attempt"$')\n'"$fix_block"
  fi

  pushd "$PROTO_DIR" >/dev/null
  # 20-minute ceiling per attempt: a hung free endpoint must not eat the job.
  if [ "$BUILDER" = "gemini-cli" ]; then
    GEMINI_CLI_TRUST_WORKSPACE=true timeout 1200 gemini -p "$prompt_text" --yolo --output-format json >"$log_file" 2>&1
  else
    echo "$prompt_text" >"$OUT_DIR/attempt-$attempt-prompt.txt"
    # prototypes/ is gitignored in pf-builder, and aider skips gitignored
    # files, so give the prototype its own repo (removed again below).
    # The editable allowlist is passed explicitly so aider never has to ask
    # for files; --weak-model/--no-auto-commits stop it spending extra
    # requests on commit messages with some other model.
    [ -d .git ] || { git init -q && git add -A && git -c user.name=pf -c user.email=pf@example.invalid commit -qm start; }
    timeout 1200 aider --message-file "$OUT_DIR/attempt-$attempt-prompt.txt"       --model "$MODEL" --weak-model "$MODEL" --yes-always --no-stream --no-pretty       --no-auto-commits --no-gitignore --no-check-update --no-analytics       src/screens/*.tsx src/nav.ts src/seed.ts src/tour.json >"$log_file" 2>&1
  fi
  local exit_code=$?
  rm -rf .git
  popd >/dev/null
  scan_log "$log_file"
  # Gemini CLI via the LiteLLM proxy: the proxy log is the only request
  # ledger (the CLI's JSON stats name models, not requests). A floor: litellm
  # internal retries are not visible. Overrides the CLI-log count.
  if [ -n "${PROXY_LOG:-}" ] && [ -f "$PROXY_LOG" ]; then
    local total n_proxy
    total=$(wc -l <"$PROXY_LOG")
    n_proxy=$(tail -n +$((${PROXY_LOG_OFFSET:-0} + 1)) "$PROXY_LOG" | grep -cE 'POST /v1beta/models/[^ ]*[gG]enerateContent')
    PROXY_LOG_OFFSET=$total
    proxy_requests=$((${proxy_requests:-0} + n_proxy))
    [ "$proxy_requests" -gt 0 ] && requests=$proxy_requests
  fi
  return $exit_code
}

check_allowlist() {
  node "$ROOT/spike/check-allowlist.mjs" "$STARTER_DIR" "$PROTO_DIR"
}

json_num_or_unknown() {
  [ "$1" = "unknown" ] && echo '"unknown"' || echo "$1"
}

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
  "groq_reject_reason": $( [ -n "$groq_reject" ] && printf '%s' "$groq_reject" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read().strip()))' || echo null ),
  "detail": $(printf '%s' "$detail" | python3 -c 'import json,sys;print(json.dumps(sys.stdin.read().strip()))')
}
JSON
  log "result: $status ($gate)"
}

run_gates() {
  # Order: typecheck -> build -> check:static -> smoke. Returns the name of
  # the first failing gate on stdout, or "pass" plus nothing.
  pushd "$PROTO_DIR" >/dev/null
  if ! npm run --silent typecheck >"$OUT_DIR/gate-typecheck.log" 2>&1; then
    popd >/dev/null; echo "typecheck"; return
  fi
  if ! npm run --silent build >"$OUT_DIR/gate-build.log" 2>&1; then
    popd >/dev/null; echo "build"; return
  fi
  popd >/dev/null

  if ! npm run --silent check:static -- "$PROTO_DIR" "$STARTER_DIR" >"$OUT_DIR/gate-check-static.log" 2>&1; then
    echo "check:static"; return
  fi

  if ! PROTOTYPE_DIR="$PROTO_DIR" npm run --silent smoke >"$OUT_DIR/gate-smoke.log" 2>&1; then
    echo "smoke"; return
  fi

  echo "pass"
}

main() {
  reset_prototype
  local attempt=1 fix_block=""

  while [ "$attempt" -le 2 ]; do
    log "attempt $attempt: running $BUILDER ($MODEL)"
    run_builder "$attempt" "$fix_block"

    if [ "$quota_exhausted" = true ]; then
      write_result "quota_exhausted" "none" "$attempt" "Gemini quota exhausted mid-spike — stop and resume next day, do not cut this run short."
      exit 2  # distinct exit code: workflow should halt the whole spike, not just this arm
    fi
    if [ -n "$provider_error" ]; then
      write_result "provider_error" "none" "$attempt" "$provider_error"
      exit 0
    fi
    if [ -n "$groq_reject" ]; then
      write_result "provider_rejected" "none" "$attempt" "$groq_reject"
      exit 0
    fi

    # Builder produced nothing (couldn't start, rate-limited out, empty reply):
    # gates would just fail on the untouched starter and blame the wrong party.
    if diff -rq --exclude=node_modules --exclude=dist --exclude=.git --exclude='.aider*' --exclude=package.json         "$STARTER_DIR" "$PROTO_DIR" >/dev/null 2>&1; then
      if [ -n "$rate_limited" ]; then
        write_result "rate_limited" "none" "$attempt" "Builder made no changes; per-minute rate limit: $rate_limited"
      else
        write_result "builder_no_changes" "none" "$attempt" "Builder exited without changing any file. Log tail: $(tail -c 600 "$OUT_DIR/attempt-$attempt.log" | tr '
' ' ')"
      fi
      exit 0
    fi

    local forbidden
    forbidden="$(check_allowlist)"
    if [ -n "$forbidden" ]; then
      if [ "$attempt" -eq 2 ]; then
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

    if [ "$attempt" -eq 2 ]; then
      write_result "gate_failed" "$gate" "$attempt" "$(tail -c 4000 "$OUT_DIR/gate-${gate//:/-}.log" 2>/dev/null || echo 'see gate log')"
      exit 0
    fi

    fix_block="The $gate gate failed. Fix only this — do not refactor or touch anything else:
$(tail -c 4000 "$OUT_DIR/gate-${gate//:/-}.log" 2>/dev/null || echo 'see gate log')"
    attempt=$((attempt + 1))
  done
}

main
