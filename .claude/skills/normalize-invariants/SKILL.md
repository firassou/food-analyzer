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
1. Add a fixture to `app/lib/analysis/__fixtures__/<case>.txt`: the raw model text, exactly as a model would send it (fences, `<think>` and truncation included).
2. Write a failing test. Expectations live in `normalize.test.ts` (run through `analyze("<case>.txt")`, i.e. parse then normalize) or `parse.test.ts`. Add every new fixture to the "complete object for every fixture" list.
3. Make the change. Run `pnpm test`.
- After prompt changes, check that the prompt's JSON schema and `normalize`'s field aliases still match, field for field.
- Parser cases that must keep working: code fences, prose around the JSON (including bracketed prose like "[1]" before it), `<think>` blocks, Python literals (`True`/`None`/`NaN`), single-quoted strings, curly-quoted strings, `//` comments, trailing commas, and truncated output (repaired, and flagged so a "cut short" warning is added). Single-quoted output is converted only when complete; truncated single-quoted output isn't repaired.

## Rules that are easy to get wrong
- Gluten escalates to "contains" for a strong gluten ingredient or a **declared** gluten allergen, never for "gluten is contains in the allergen map": oats alone put it there too, and oats only mean "likely".
- A compound ingredient (a bracketed list, or "x: a, b") gets no name-implied E-number and no untrusted model allergens. Its additives are found per part.
- Ambiguous additives (code `null`: modified starch, caramel colour) are deduplicated by kind (`additiveKey`), not by exact wording.
- Models glue the "may contain" sentence onto the last ingredient ("ferments. Peut contenir des traces de fruits à coque…"). Ingredient keyword detection runs on the name with `mayContainStatements` removed; allergens found in those sentences become may-contain (fixture `fr-yogurt-traces.txt`).
- An allergen the model lists in both `declared` and `may_contain` is treated as may-contain; a real ingredient keyword still raises it to "contains".
- Allergen sources are filled in ("Declared on the label" / "Listed on the label") at the very end, after the gluten rule may have added an allergen.
- `normalize()` wraps its body in a try/catch that falls back to `normalize({})`. That is a last resort, not a licence to skip guards.
