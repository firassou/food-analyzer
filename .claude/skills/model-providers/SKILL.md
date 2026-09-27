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

## Provider status (checked 2026-09-27)
- The HF free tier runs out of monthly credits quickly (402 → `quota`, so the chain skips to NVIDIA).
- NVIDIA `google/gemma-4-31b-it` sometimes doesn't answer at all, not even a text-only prompt within 60 s. `moonshotai/kimi-k3` accepts images and works, but it's slow (19–40 s to first token, 25–95 s total), so it can hit the 35 s first-token watchdog. `meta/llama-4-maverick-*` and `qwen/qwen3.5-397b-a17b` are end-of-life (410); `gemma-3-12b-it`, `kimi-k2.6` and `phi-3-vision` return 404 for this account.
- HF credits are account-wide: once depleted, **every** router model returns 402, whichever provider serves it. Switching models doesn't help; wait for the monthly reset, buy credits, or use another token.
- To list HF vision models with live providers, prices and first-token latency: `curl -H "Authorization: Bearer $HF_TOKEN" https://router.huggingface.co/v1/models | jq '.data[] | select(.architecture.input_modalities | index("image"))'`. None are free.
- The user prefers an HF-only chain (NVIDIA disabled in `.env.local`): `Qwen/Qwen3-VL-30B-A3B-Instruct` → `google/gemma-4-26B-A4B-it` → `Qwen/Qwen3-VL-235B-A22B-Instruct`.
- To probe a model directly, stream one small vision request with the `openai` client and log time-to-first-token (count `reasoning_content` deltas too).

## Debugging
- In dev, `meta.trace` and the error `trace` list each attempt (target, outcome, duration).
- Check the `[analyze]` server logs.
- `curl localhost:3000/api/analyze` (GET) shows which providers are configured.

## Anthropic provider (B9)
- Load the global `claude-api` skill first.
