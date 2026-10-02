# Phase 2 reference build

First known-good builder output: passed every gate (typecheck, build, check:static, smoke).

- Run: GitHub Actions `Phase 2 builder spike`, run id **36956622415** (dispatch 14), 2026-10-02
- Builder: OpenCode 1.18.31, model `openrouter/anthropic/claude-haiku-4.5`
- Attempts: 3 (1 typecheck failure, 2 smoke failure, 3 clean); 111 requests
- Spend: $0.6871
- Source: `artifacts/36956622415/spike-arm-p-opencode-openrouter-paid/evidence/workspace`
- Brief: `pf-builder/spike/inputs/sample-brief.json`; prompt: `pf-engine/prompts/builder.md` at pf-engine `b15a2ad`; gates at pf-builder `33220a0`

Baseline for every later phase. Do not edit. It has no `node_modules`; it must sit two levels below `pf-builder` (alias `@kit` -> `../../kit/src`) to build.
