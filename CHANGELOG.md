# Changelog

The version in `package.json` is the one shown at the bottom of the app. Versions follow
[semantic versioning](https://semver.org): while the app is in `0.x`, a new feature raises the
middle number and a fix raises the last one. Each release is a git tag (`v0.8.1`).

## 0.10.0 — 2026-10-04
- Ask AI: below a result you can ask follow-up questions about the product or its ingredients. Answers rest on what was read on the label, and anything from general knowledge is stamped as such. The conversation is kept with the scan in your history.

## 0.9.0 — 2026-10-04
- Two medicines can be checked together: the same active substance in both, two medicines of the same family, and a short list of well-known serious interactions.
- Optional personal profile (allergens, lactose, sugar, vegetarian, vegan, halal), kept on the device only. With a profile, every result opens with what it means for you. The app works the same without one.
- The app shows its version.

## 0.8.1 — 2026-10-04
- Fixed a type error that broke the production build.

## 0.8.0 — 2026-10-04
- Whatever wasn't found is left out instead of being shown as "unknown".

## 0.7.0 — 2026-10-04
- One pen line across a medicine box is read as "once a day, no set time".

## 0.6.0 — 2026-10-04
- A medicine's missing excipients are looked up in the French public medicines database.
- Optional second photo of the composition, merged into the same result.

## 0.5.0 — 2026-10-04
- Medicines: active substance, usual dose, cautions, excipient notes, gluten, and the pharmacist's pen marks.

## 0.4.1 — 2026-10-04
- "No indication" of gluten always shows 0 %.

## 0.4.0 — 2026-10-04
- Gluten likelihood, scan history, comparing two products, barcode scanning, installable app, estimated calories for dishes, tips for bottled water.

## 0.3.0 — 2026-10-04
- Water, drink and dish modes, product lookup in Open Food Facts, mobile-first redesign.

## 0.2.0 — 2026-10-03
- English, French and Arabic interface; taking a photo with the camera.

## 0.1.0 — 2026-09-27
- First version: reading a food label photo into ingredients, allergens, gluten, additives and nutrition, with deterministic cross-checks.
