---
name: label-knowledge-rules
description: Use when adding or changing allergen keywords, false-friend exclusions, E-numbers, named additives, fortificant rules, may-contain phrases, drink detection or FSA thresholds in lib/analysis/knowledge.ts.
---

# Knowledge base rules (`app/lib/analysis/knowledge.ts`)

## Purity
- `knowledge.ts` must stay pure and client-safe: no I/O, no `fetch`, no `server-only`, no Node APIs. The only import is types from `./types`.

## Adding a term
- Latin-script terms go in `words(...)`, written in **folded** form: lowercase, accents removed, œ→oe, æ→ae, ß→ss. Matching runs on `fold(text)`, so an unfolded term (e.g. `"blé"`) silently never matches.
- Arabic terms go in `arabic(...)` (matched without Latin word boundaries).
- Cover EN, FR, ES, IT, DE and AR wherever a translation exists.

## False friends
- Before adding a keyword, check it for false friends, and add an `exclude` pattern to the rule for each one. Known traps:
  - "butter" also matches cocoa butter, shea butter, peanut butter and butternut.
  - "nut" also matches coconut, nutmeg, doughnut, nutrition and butternut.
  - "wheat" also matches buckwheat, which is gluten-free.
  - "milk" also matches coconut milk and plant "milks" (almond, oat, soy).
  - "cream" also matches cream of tartar.
- Oats alone are a separate, weaker gluten signal (`oats`, which gives "likely"), not a strong one.

## E-numbers and additives
- Store codes in canonical form: `E330`, `E500ii`, `E150d`. `canonicalENumber` must accept `E 500 (ii)`, `e500ii`, `INS 330` and similar.
- `NAMED_ADDITIVES`: map a name to its code. Use `null` when the name is an additive whose code depends on the variant (modified starch, caramel colour). A `null` means "known additive, don't trust a guessed code".
- Fortificants (vitamins, minerals such as iron, zinc, folic acid, ascorbic acid added as a vitamin) are not additives. Keep `isNutrientFortificant` in sync.
- Categories come from number ranges (colours 100s, preservatives 200s, antioxidants/acidity regulators 300s, thickeners/emulsifiers 400s, and so on).

## Other tables
- May-contain phrases: cover "may contain", "peut contenir", "traces", "puede contener", "può contenere", "kann ... enthalten", "قد يحتوي".
- DRINK regex: multilingual drink words, used to pick the 100 ml basis.
- FSA thresholds (per 100 g, halved for drinks per 100 ml) drive `levelOf`. Change them only with a cited source.

## Tests (required for every change)
- Add Vitest cases to `app/lib/analysis/knowledge.test.ts`:
  1. one positive match
  2. one false friend that must **not** match
  3. one non-English form
- Run `pnpm test`.
