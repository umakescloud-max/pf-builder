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

ARM="$1"            # arm id, e.g. "gemini-cli", "aider-gemini", "aider-groq"
BUILDER="$2"         # "gemini-cli" | "aider"
MODEL="$3"           # model string passed to the builder
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROTO_NAME="prior-auth-tracker-v1"
PROTO_DIR="$ROOT/prototypes/$PROTO_NAME"
STARTER_DIR="$ROOT/archetypes/prior-auth-rcm"
BRIEF="$ROOT/../pf-engine/fixtures/sample-brief.json"
PROMPT="$ROOT/../pf-engine/prompts/builder.md"
OUT_DIR="$ROOT/spike/out/$ARM"
mkdir -p "$OUT_DIR"

RESULT="$OUT_DIR/result.json"

requests=0
peak_tokens=0
quota_exhausted=false
groq_reject=""

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
}

# Scans a log for best-effort request/token signals and known Groq/Gemini
# rejection patterns. Updates the shared counters above.
scan_log() {
  local log_file="$1"
  local n
  n=$(grep -ocE 'Tokens:|tokens? (sent|received|used)' "$log_file" 2>/dev/null || echo 0)
  [ "$n" -gt "$requests" ] && requests=$n
  local tok
  tok=$(grep -oP '[0-9]+(?=[kK]? tokens)' "$log_file" 2>/dev/null | sort -n | tail -1)
  [ -n "$tok" ] && [ "$tok" -gt "$peak_tokens" ] 2>/dev/null && peak_tokens=$tok
  if grep -qiE 'RESOURCE_EXHAUSTED|429|quota exceeded|rate.?limit exceeded' "$log_file"; then
    quota_exhausted=true
  fi
  if grep -qiE '413|payload too large|tokens per minute|tpm|TPD|tokens per day' "$log_file"; then
    groq_reject="$(grep -iE '413|payload too large|tokens per minute|tpm|TPD|tokens per day' "$log_file" | head -1)"
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
  if [ "$BUILDER" = "gemini-cli" ]; then
    gemini -p "$prompt_text" --yolo >"$log_file" 2>&1
  else
    echo "$prompt_text" >"$OUT_DIR/attempt-$attempt-prompt.txt"
    aider --message-file "$OUT_DIR/attempt-$attempt-prompt.txt" \
      --model "$MODEL" --yes-always --no-stream --no-pretty \
      --no-check-update --no-analytics >"$log_file" 2>&1
  fi
  local exit_code=$?
  popd >/dev/null
  scan_log "$log_file"
  return $exit_code
}

check_allowlist() {
  node "$ROOT/spike/check-allowlist.mjs" "$STARTER_DIR" "$PROTO_DIR"
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
  "requests_issued": $requests,
  "peak_tokens_per_request": $peak_tokens,
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
    if [ -n "$groq_reject" ]; then
      write_result "provider_rejected" "none" "$attempt" "$groq_reject"
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
      write_result "gate_failed" "$gate" "$attempt" "$(tail -c 4000 "$OUT_DIR/gate-$gate.log" 2>/dev/null || echo 'see gate log')"
      exit 0
    fi

    fix_block="The $gate gate failed. Fix only this — do not refactor or touch anything else:
$(tail -c 4000 "$OUT_DIR/gate-$gate.log" 2>/dev/null || echo 'see gate log')"
    attempt=$((attempt + 1))
  done
}

main
