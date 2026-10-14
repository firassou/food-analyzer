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
4. Deterministic rules may only **raise** gluten and lactose status (rank: `no_indication` < `unclear` < `likely` < `contains`), never lower it. Two exceptions: a "gluten-free" or "lactose-free" claim suppresses the raise, and **estimated** ingredients cap both at `likely_contains` (and their allergens at `may_contain`): a guess never reads as a fact.
5. Computed data wins over model claims: nutrition levels, the sugar explanation, per-100 derivation and additive codes.
6. Every user-facing uncertainty becomes a deduplicated entry in `warnings`.
7. Ingredients that weren't read on the photo are never passed off as read: `ingredient_source` is `"estimated"` (the model's `estimated_ingredients`, used only when no list was read) or `"database"` (`opts.database`, set by `lookup.ts`), and a warning says so.
8. Every sentence `normalize()` writes comes from `messages.ts` (`en`, `fr`, `ar`; `opts.locale`). English wording is pinned by the tests. The model writes its free text in the reader's language, but `name_en` and additive `name` stay English because the rules match on them; translations go in `name_local`.

## Workflow
1. Add a fixture to `app/lib/analysis/__fixtures__/<case>.txt`: the raw model text, exactly as a model would send it (fences, `<think>` and truncation included).
2. Write a failing test. Expectations live in `normalize.test.ts` (run through `analyze("<case>.txt")`, i.e. parse then normalize) or `parse.test.ts`. Add every new fixture to the "complete object for every fixture" list.
3. Make the change. Run `pnpm test`.
- After prompt changes, check that the prompt's JSON schema and `normalize`'s field aliases still match, field for field.
- Parser cases that must keep working: code fences, prose around the JSON (including bracketed prose like "[1]" before it), `<think>` blocks, Python literals (`True`/`None`/`NaN`), single-quoted strings, curly-quoted strings, `//` comments, trailing commas, and truncated output (repaired, and flagged so a "cut short" warning is added). Single-quoted output is converted only when complete; truncated single-quoted output isn't repaired.

## Kind, water, drink
- `kind` is the model's word checked against what was read: water only if it is plain (at most 2 read ingredients, sugars ≤ 0.5 g) and named or declared water; a dish only when nothing label-like was read; a drink by model, a 100 ml basis or `isDrink`.
- `water` is built only from printed values (pH 2–12, minerals 0–20 000 mg/L, else `null`); hardness and `facts` are computed (`knowledge.ts` `waterFacts`), never taken from the model. Water has no "no ingredient list" warning and no "unclear" gluten/lactose.
- Water `facts` carry a `text` (the fact), a `tip` and its `source` (`messages.ts` `waterTips` / `waterSources`). A tip must rest on a reference listed in the comment block there (WHO, EFSA, EAU, EU directives); add the reference before adding a claim, and never write one from memory or hearsay. Percentages of daily intake are computed from `DAILY`.
- A dish's nutrition comes from the model's `estimated_nutrition` only when `kind` is `dish` and no nutrition was read. It is flagged `estimated`, gets its own warning, skips the consistency checks and never produces "High in …" highlights. It is applied after `kind` is decided, so a guess can't make a photo count as a label.
- `drink` (sugar per container, colours, sweeteners, caffeine) is derived from the additive list and the net quantity.
- A barcode is kept only if its GS1 check digit holds: models misread digits, and a wrong code could match another product.

## Medicines
- `kind: "medicine"` is the model's call (`kind`, or a `medicine` object naming an active substance). Excipients are the `ingredients`; they are only ever read, never recalled.
- `medicine.excipients` (notes) are computed by `excipients.ts` from the composition text; wording and source live in `messages.ts` and follow the EMA annex. Add a rule only for an excipient that annex lists, with a false-friend test (cetyl "alcohol" isn't ethanol, a sulphate isn't a sulphite, maize starch isn't "starch, source not stated").
- The model's general fields (uses, typical dose, not for, warnings, side effects) are dropped when no active substance was identified, and always come with the `medicineGeneral` warning.
- One pen line across the box means "1 a day, no set time" (`marks.anytime`). The model also counts the `strokes`; a count of 1 forces `anytime: 1` and zero for the times of day, because models read a line's two ends as "morning and evening" (seen live, 2 runs of 3, on a real box with one diagonal line). More units than strokes → confidence "low".
- The model also reports what it `seen` (each piece of handwriting, `length` long/short) and the `layout` (`across`/`row`/`figures`/`words`, matched exactly: "line of strokes" is not "across"). **A reading that contradicts itself shows no dose**: all units 0, the model's note or `marksConflict` ("can be read two ways… ask your pharmacist"), confidence "low". A wrong number is worse than none in either direction (a halved antibiotic, a tripled antifungal). Contradictions: `across` with times of day; or times of day beside a listed long line with fewer short marks than doses (seen live 2026-10-14: Gemini Flash-Lite read one diagonal line with a hooked end plus a handwritten price as 1-1-1, while listing "one long line"). A long signature or underline beside a real row of strokes changes nothing.
- A dose written in `figures` or `words` is never redrawn from strokes or lines; it is only doubted ("low") next to a long line nobody accounted for, or when the strokes don't add up. The strokes-1 rule doesn't apply to it. `across` with no units → `anytime: 1`, "low". Fixture `medicine-line-and-price.txt`.
- Zero units with a note is "no dose read", never "take nothing": the panel shows only the note, and the tile is left out. A "low" reading carries an "Uncertain reading" chip, and Ask AI is told the marks are uncertain (or typed by the reader).
- A warning reworded: keep its old sentence in `messages.ts` `PREVIOUS_WARNINGS` and match with `isWarning()`, so saved scans keep working (typed dose, relocalize, `withExcipients`).
- Handwritten prices, dates and codes are never dose marks: the prompt sends them to `note`.

## Other languages (relocalize.ts)
- A result is shown in another interface language without a new analysis: `relocalize()` rebuilds every sentence normalize writes from `messages.ts` (walking both tables, plus the value-built ones: sugar, levels, nutrition issues, database entries, water facts, excipient notes, allergen names), and only the model's free text goes through `/api/translate`. Its test checks, for every fixture and language pair, that normalizing in A then relocalizing to B equals normalizing in B. A new sentence in `messages.ts` built from values needs a line in `catalog()`, or it will be sent to the translator.
- Marks, names the rules match on (`name_en`, additive `name`, active `name`), codes and quotes from the pack are never translated.
- `medicine.marks` (pen marks) are clamped to 0–6 units in halves; all zeros with no note is `null` ("no marks"), never "take nothing". They always add a warning; low confidence adds the stronger one.
- A medicine gets no sugar note, no drink or water block, and is never looked up in Open Food Facts.
- Missing excipients are completed through `withExcipients()` (`app/lib/analysis/medicine.ts`), which re-runs `normalize()`: from the French public medicines database (`server/medicines.ts`, `opts.database` → `medicineDatabase` warning) or from a second photo (`addExcipientPhoto`, client side). Both are optional: a failed lookup or an unreadable second photo leaves the result untouched. `pickEntry` must stay strict (same brand, same strength, form decides, ties → null): a wrong product's excipients are worse than none.

## Rules that are easy to get wrong
- Gluten escalates to "contains" for a strong gluten ingredient or a **declared** gluten allergen, never for "gluten is contains in the allergen map": oats alone put it there too, and oats only mean "likely".
- A compound ingredient (a bracketed list, or "x: a, b") gets no name-implied E-number and no untrusted model allergens. Its additives are found per part.
- Ambiguous additives (code `null`: modified starch, caramel colour) are deduplicated by kind (`additiveKey`), not by exact wording.
- Models glue the "may contain" sentence onto the last ingredient ("ferments. Peut contenir des traces de fruits à coque…"). Ingredient keyword detection runs on the name with `mayContainStatements` removed; allergens found in those sentences become may-contain (fixture `fr-yogurt-traces.txt`).
- An allergen the model lists in both `declared` and `may_contain` is treated as may-contain; a real ingredient keyword still raises it to "contains".
- Allergen sources are filled in ("Declared on the label" / "Listed on the label") at the very end, after the gluten rule may have added an allergen.
- `normalize()` wraps its body in a try/catch that falls back to `normalize({})`. That is a last resort, not a licence to skip guards.
