# Phase 2 builder spike — results

Run date: 2026-10-03. Models: P anthropic/claude-haiku-4.5, A cohere/north-mini-code:free, B poolside/laguna-s-2.1:free, C nvidia/nemotron-3-ultra-550b-a55b (or its configured fallback). Counters are floors parsed from tool output or the NVIDIA proxy; "unknown" means unreadable, never 0.

## Preflight (prompt 22256 bytes)

| Check | Model | HTTP | Accepted | prompt_tokens | finish | Deprecation headers | Error |
|---|---|---|---|---|---|---|---|

Gate: {"or_p_ok":false,"or_usage_start":"","or_a_ok":false,"or_b_ok":false,"nvidia_ok":false,"nvidia_model":"","problems":[],"pass":false}.

| Arm | Model | Result | Gate reached | Attempts | Requests (floor) | Peak tokens/req | Spend (OpenRouter /key) | Attribution | Builder data? | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| P OpenCode x OpenRouter (paid primary) | — | preflight_gate_failed | none | 0 | unknown | unknown | n/a (free or not run) | n/a (not run) | n/a | Preflight failed (no model accepted the full prompt, a configured model is near deprecation, a model is not allowlisted, or spend could not be metered); no arm ran. |
| A OpenCode x OpenRouter (free, retired) | — | preflight_gate_failed | none | 0 | unknown | unknown | n/a (free or not run) | n/a (not run) | n/a | Preflight failed (no model accepted the full prompt, a configured model is near deprecation, a model is not allowlisted, or spend could not be metered); no arm ran. |
| B Aider diff x OpenRouter (control) | — | preflight_gate_failed | none | 0 | unknown | unknown | n/a (free or not run) | n/a (not run) | n/a | Preflight failed (no model accepted the full prompt, a configured model is near deprecation, a model is not allowlisted, or spend could not be metered); no arm ran. |
| C OpenCode x NVIDIA (overflow) | — | preflight_gate_failed | none | 0 | unknown | unknown | n/a (free or not run) | n/a (not run) | n/a | Preflight failed (no model accepted the full prompt, a configured model is near deprecation, a model is not allowlisted, or spend could not be metered); no arm ran. |
| D Gemini CLI x OpenRouter (retired) | — | preflight_gate_failed | none | 0 | unknown | unknown | n/a (free or not run) | n/a (not run) | n/a | Preflight failed (no model accepted the full prompt, a configured model is near deprecation, a model is not allowlisted, or spend could not be metered); no arm ran. |
| E Aider x Gemini (retired) | — | preflight_gate_failed | none | 0 | unknown | unknown | n/a (free or not run) | n/a (not run) | n/a | Preflight failed (no model accepted the full prompt, a configured model is near deprecation, a model is not allowlisted, or spend could not be metered); no arm ran. |

Dispatch spend: no metered arm ran, $0 by construction (free ids only).


**No arm passed all gates in this run.** See per-arm detail and the uploaded logs.