#!/usr/bin/env bash
# Gemini CLI speaks only Google's API, so "Gemini CLI x OpenRouter" needs a
# translator: LiteLLM proxy exposes /v1beta/models/*:generateContent and routes
# every model name the CLI sends (it varies by CLI version, incl. utility
# calls) to ONE explicit OpenRouter :free id. Docs:
# https://docs.litellm.ai/docs/tutorials/litellm_gemini_cli
# Smoke-tests the translation before the CLI starts, so a proxy failure is
# attributed to the harness (exit 4), not to the builder.
set -uo pipefail
OUT="$1"; mkdir -p "$OUT"
MODEL="${OPENROUTER_MODEL:?}"
case "$MODEL" in *:free) ;; *) echo "refusing non-:free OpenRouter id $MODEL" >&2; exit 3;; esac
KEY="sk-pf-$(openssl rand -hex 12)"   # throwaway proxy key, never a provider key

cat >"$OUT/proxy-config.yaml" <<YAML
model_list:
  - model_name: "*"
    litellm_params:
      model: openrouter/$MODEL
      api_key: os.environ/OPENROUTER_API_KEY
litellm_settings:
  drop_params: true
general_settings:
  master_key: $KEY
YAML

litellm --config "$OUT/proxy-config.yaml" --port 4000 >"$OUT/proxy.log" 2>&1 &
for _ in $(seq 1 60); do
  curl -sf http://localhost:4000/health/liveliness >/dev/null && break
  sleep 2
done
curl -sf http://localhost:4000/health/liveliness >/dev/null || { echo "proxy did not come up" >&2; tail -30 "$OUT/proxy.log" >&2; exit 4; }

smoke() {  # $1 = model name the CLI might send
  curl -s -w '\nHTTP %{http_code}\n' -X POST "http://localhost:4000/v1beta/models/$1:generateContent" \
    -H "x-goog-api-key: $KEY" -H 'Content-Type: application/json' \
    -d '{"contents":[{"role":"user","parts":[{"text":"Reply with exactly: OK"}]}],"generationConfig":{"maxOutputTokens":1024}}'
}
for m in gemini-3-flash-preview gemini-2.5-flash-lite; do
  r="$(smoke "$m")"; echo "== smoke $m"; echo "$r" | head -c 1200; echo; echo "$r" | tail -n 1
done | tee "$OUT/proxy-smoke.log"
grep -q '^HTTP 200' "$OUT/proxy-smoke.log" && ! grep -q '^HTTP [^2]' "$OUT/proxy-smoke.log" || { echo "proxy smoke test failed (harness)" >&2; exit 4; }

# gemini-cli 0.62.0 maps GOOGLE_GEMINI_BASE_URL to auth type "gateway", which its own
# headless validateAuthMethod rejects ("Invalid auth method selected", run 6 dispatch 1).
# Pinning gemini-api-key keeps the base-URL override and passes validation.
mkdir -p "$HOME/.gemini"
echo '{"security":{"auth":{"selectedType":"gemini-api-key"}}}' >"$HOME/.gemini/settings.json"

echo "GOOGLE_GEMINI_BASE_URL=http://localhost:4000" >>"$GITHUB_ENV"
echo "GEMINI_API_KEY=$KEY" >>"$GITHUB_ENV"
echo "PROXY_LOG=$PWD/$OUT/proxy.log" >>"$GITHUB_ENV"
echo "PROXY_LOG_OFFSET=$(wc -l <"$OUT/proxy.log")" >>"$GITHUB_ENV"
