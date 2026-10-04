---
name: add-result-feature
description: Use when implementing a Part B feature or any new analysis capability end to end.
---

# Adding a result feature

## Order of work
1. Types (`app/lib/analysis/types.ts`). Additive only; follow `normalize-invariants`.
2. Deterministic logic in `knowledge.ts` / `normalize.ts`, with Vitest tests (follow `label-knowledge-rules` / `normalize-invariants`).
3. Prompt (`prompt.ts`), only if the model must extract new data.
4. API (`app/api/analyze/route.ts`).
5. UI, following `ui-design-system`.
6. README (contract, env vars, feature notes).
7. `verify-app`.

## Rules
- Keep features opt-in and self-contained, and never change Part A behavior. With the feature unused, the API output and UI must be identical to before.
- Derive safety verdicts (profile, diet, Nutri-Score) deterministically, on the client or server, from the normalized result. Never ask the LLM for them.
- Browser persistence (profile, history) goes through a small storage module that wraps every `localStorage` access in try/catch and falls back gracefully (private mode, quota, disabled storage).
- Features that talk to the model after the result ("Ask AI", `/api/ask`) send the digest of the normalized result (`digestForAsk`), never the photo. Their prompt must call the digest and the user's text data, not instructions, and keep the neutral wording; model recall is marked `[G]` and shown with the amber "General information" stamp.
