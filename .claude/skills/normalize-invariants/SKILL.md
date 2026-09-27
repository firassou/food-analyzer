---
name: normalize-invariants
description: Use before editing lib/analysis/normalize.ts, parse.ts, types.ts or the model prompt: anything that shapes the LabelAnalysis result.
---

# Normalization invariants

Files: `app/lib/analysis/types.ts` (contract), `prompt.ts` (SYSTEM_PROMPT / USER_PROMPT), `parse.ts` (lenient JSON extraction and truncation repair), `normalize.ts` (any output → a complete `LabelAnalysis`), `knowledge.ts` (deterministic cross-checks).

## Hard invariants
1. `normalize()` never throws, whatever the input: garbage, partial data, the wrong shape or wrong types. Guard every access and coerce every value.
2. Every field is always present. "Unknown" is `null`, `[]` or `"unclear"`, never `undefined` or a missing key.
3. The API contract only ever gains fields. When types change, update `types.ts`, the prompt schema, `normalize`, the UI and the README together.
4. Deterministic rules may only **raise** gluten and lactose status (rank: `no_indication` < `unclear` < `likely` < `contains`), never lower it. A "gluten-free" or "lactose-free" claim is the only exception: it suppresses the raise.
5. Computed data wins over model claims: nutrition levels, the sugar explanation, per-100 derivation and additive codes.
6. Every user-facing uncertainty becomes a deduplicated entry in `warnings`.

## Workflow
1. Add a fixture to `app/lib/analysis/__fixtures__/`: the raw model text, plus what you expect `normalize` to produce.
2. Write a failing test (`parse.test.ts` / `normalize.test.ts`).
3. Make the change. Run `pnpm test`.
- After prompt changes, check that the prompt's JSON schema and `normalize`'s field aliases still match, field for field.
- Parser cases that must keep working: code fences, prose around the JSON, Python literals (`True`/`None`, single quotes), trailing commas, truncated output (repaired, and flagged so a "cut short" warning is added).
