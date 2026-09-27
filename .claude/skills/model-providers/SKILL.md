---
name: model-providers
description: Use when adding, removing or reordering AI providers or models, changing timeouts, or debugging failed or slow analyses in lib/server/models.ts and analyze.ts.
---

# Model providers

Files: `app/lib/server/models.ts` (target chain, `FailureKind`, error classification), `app/lib/server/analyze.ts` (streaming, watchdog, fallback orchestration), `app/api/analyze/route.ts`.

## Target chain
- Ordered, built from env vars: `HF_TOKEN` + `HF_MODEL` (default `Qwen/Qwen3-VL-30B-A3B-Instruct`), then `HF_FALLBACK_MODELS` (default `Qwen/Qwen3-VL-235B-A22B-Instruct`), then `NVIDIA_API_KEY` + `NVIDIA_MODEL` (default `google/gemma-4-31b-it`). Model lists are comma-separated.
- All providers are OpenAI-compatible and go through the `openai` package. Clients use `maxRetries: 0`, because retrying means moving to the next target.

## Every new provider must
- map its errors onto the existing `FailureKind`s (via `classify`)
- stream through the shared watchdog (first-token, idle and hard-deadline timers), where reasoning deltas count as progress
- respect the outer abort signal (client cancel or disconnect)
- have its env vars documented in `README.md` and `.env.example`

## Time budget
- Don't change the budget constants without updating the client timeout in `app/page.tsx` and `maxDuration` in the route. The ordering must hold: **server deadline < route `maxDuration` < client timeout**. The reference values are a deadline of 115 s, a `maxDuration` of 120 and a client timeout of 150 s, with first token 35 s, idle 20 s and a minimum attempt of 12 s.
- Skip a fallback attempt when the remaining budget is below the minimum attempt time.

## Debugging
- In dev, `meta.trace` and the error `trace` list each attempt (target, outcome, duration).
- Check the `[analyze]` server logs.
- `curl localhost:3000/api/analyze` (GET) shows which providers are configured.

## Anthropic provider (B9)
- Load the global `claude-api` skill first.
