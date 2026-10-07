# Changelog

The version in `package.json` is the one shown at the bottom of the app. Versions follow
[semantic versioning](https://semver.org): while the app is in `0.x`, a new feature raises the
middle number and a fix raises the last one. Each release is a git tag (`v0.8.1`).

## 0.13.0 — 2026-10-07
- A printed date such as `25-10-26` is read as 25 October 2026, not 26 October 2025. Models rewrote it year-first and the shelf flagged it as expired; the label's own text now wins, including for scans saved earlier.
- Ask AI gives practical advice instead of refusing it (for foods, medicines and the shelf), and a switch under the question box can share what you avoid, the medicines you scanned and what the app's rules found for the product, so the answer fits you. Off by default.
- A card on a food or drink that stands out against a medicine you scanned: caffeine and ciprofloxacin or levothyroxine, calcium or iron and some antibiotics, dairy and tetracycline, grapefruit and some statins, alcohol and metronidazole or sedatives, potassium chloride and blood-pressure medicines. A short list; finding nothing shows nothing.
- When several people share the phone, a result shows the verdict for each of them.
- "Treatments" on the shelf: how many days of a treatment are left, from the duration the pharmacist wrote on the box.
- Shelf mode: point the camera along a supermarket shelf and every barcode in view gets a badge for your profile (Chrome). A tap opens the product.
- The allergen rules are measured against about 2,100 real Open Food Facts products in CI. That found missing Italian soy ("soia") and several fish, shellfish and mollusc names in Italian, Spanish, French and German, and a French scallop ("noix de Saint-Jacques") read as a nut.
- CI generates Next's route types before type-checking and uses current action versions.

## 0.12.1 — 2026-10-07
- Better choices cope with Open Food Facts being slow or down: answers are kept an hour and an older one is still used while the service is failing, identical requests are sent once, the service is left alone for 30 seconds after an error, and searches stay under its rate limit.
- `pnpm audit` is clean again: the dev-only `braces` advisory (no patched release exists) is gone because the Next.js lint plugin's glob library is replaced by `tinyglobby`, which does the one thing it needs.

## 0.12.0 — 2026-10-07
- My shelf: every date printed on your scans, soonest first, with a badge and an optional reminder when the app opens; every medicine you scanned checked against every other; and a chat about your medicines together.
- "Why these results?" under the tiles lists what was found on the label behind each verdict.
- Several people can share one phone, each with their own allergens and diet.
- Share a result as text, or save it as a PDF.
- A microphone button dictates your question to Ask AI, where the browser supports it.
- Better choices: products of the same category with a better Nutri-Score and less sugar, from Open Food Facts, that are sold in your country and leave out anything you avoid (allergies, gluten, lactose, diet). The section only appears when there is something to suggest. Pick your country in your profile if it isn't detected right.
- The app opens offline and shows your saved scans.
- A stricter security policy with a nonce for every page, and rate limits that can be shared between servers (Upstash Redis, optional).
- The "drop a photo or paste" hint is only shown on a desktop with a mouse.
- Behind the scenes: browser smoke tests, a CI workflow, weekly evaluations of the sample photos and pen marks.

## 0.11.0 — 2026-10-07
- A new look: a calmer, more modern design (new colours, type, icons, rounded surfaces, tonal tiles, a redesigned home screen) and a new logo, favicon and app icons. The headline's last word now rotates through food, medicine, drinks, dishes and water.
- Ask AI works for medicines too: ask what it is for, side effects, interactions, food or alcohol, a missed dose. Answers are general information about the substance, always marked, and never tell you to change your dose.
- Every additive has its own "Ask AI" button that asks about that additive.
- The pharmacist's pen marks can be corrected or added by you (morning, midday, evening, any time). Your entry replaces the AI's reading and is labelled as yours.
- Security: cross-site requests to the API are refused, request bodies are capped while they are read, rate limits no longer trust a client-written `X-Forwarded-For` and a shared ceiling holds even then, security headers and a Content-Security-Policy are set, API answers are never cached, the public health check no longer lists models, and `sharp` was updated to a patched version.

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
