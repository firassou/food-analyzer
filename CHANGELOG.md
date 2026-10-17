# Changelog

The version in `package.json` is the one shown at the bottom of the app. Versions follow
[semantic versioning](https://semver.org): while the app is in `0.x`, a new feature raises the
middle number and a fix raises the last one. Each release is a git tag (`v0.8.1`).

## 0.17.0 — 2026-10-17
- **A new look, "Verdant Glass"**: emerald and teal on cool slate, with a soft green glow at the top of every screen, in light and dark. Medicine Mode keeps its own calm, clinical teal. The home has a new headline, a gradient scan button and a greeting chip.
- **New icons and a new app icon**: one consistent icon family throughout, and a new LabelSight mark (scan brackets around a check) for the home screen, the browser tab and the installed app.
- **Smoother motion**: screens fade and rise into place, cards and result sections appear as you scroll, buttons respond to your pointer, and the home cards lift and glow on hover. Medicine Mode only fades, with no lift or scale. Everything is off with reduced motion.
- **Glass surfaces**: the top bar, the bottom dock, the section tabs and the watchlist sheet are frosted, and the sheet blurs the page behind it.
- Printing or saving a result as PDF still shows every section.

## 0.16.0 — 2026-10-14
- **Health conditions** in the watchlist (haemophilia and other bleeding disorders, diabetes, high blood pressure, coeliac disease, kidney disease, stomach ulcer, asthma, G6PD deficiency, pregnancy, liver disease), found by any of their names in English, French or Arabic. Every medicine, food, drink and water, and the medicines on My shelf, are checked against them by fixed rules with their sources: "Avoid, ask your doctor or pharmacist" or "Check with your doctor or pharmacist", never "safe". A condition the search doesn't know (say "bipolar") can be named by the AI, only if you tap "Understand with AI": it is matched to the list, or saved under its usual name ("Bipolar disorder") as a condition the app's rules don't check, which Ask AI can still take into account. Just that text is sent, you confirm before anything is saved, and text that names no health condition is not saved at all. The status of every scan, the shelf-mode badges and the better choices take the conditions into account too.
- **Medicines are checked against their official product information**, not against a short list: the contraindications (4.3), warnings (4.4) and pregnancy section (4.6) of the summary of product characteristics published by the French medicines agency (base de données publique des médicaments), fetched for every medicine scanned. A condition named in the contraindications reads "Avoid", in the warnings "Check", and the official sentence is quoted as published, with a link to it. A brand not sold in France uses a French medicine with the same single active substance and strength, and says so. A contraindication that only applies together with another medicine (an ACE inhibitor with aliskiren in diabetes) reads "Check", not "Avoid". A condition the medicine treats isn't warned about by the precautions written for the people it treats. Conditions outside the list are found in the same text by their French name. When no official information is found, the result says the medicine couldn't be checked, never "nothing found". Medicines scanned earlier get it in the background.
- **Two medicines together are checked against their official product information** too: section 4.5 (Interactions) of each one is searched for the other's active substance and for the family it belongs to, as the French interaction thesaurus names them ("Anticoagulants oraux", "IEC", "AINS"…). The regulator's own level is shown (contraindicated, not recommended, precautions for use, to take into account) with the sentence quoted as published and a link to it. When the level depends on the dose (aspirin with an anticoagulant), every level is quoted and the card says it depends on the dose. The app's short list of well-known interactions is only used when the official texts say nothing about the pair, and "nothing stood out" says which of the two was checked.
- The home's lead now cycles through what you can photograph: a **label**, a **drink**, a **dish**.

## 0.15.0 — 2026-10-14
- The app is now **LabelSight**, with a new design: a warm oat page, botanical charcoal, forest green with lime and peach accents, an editorial serif for food headlines, tighter shapes, soft shadows and a quiet, coherent motion system (all of it off with reduced motion). Dark mode is re-tinted to match. Saved scans and settings carry over.
- **Medicine Mode**: a place of its own, in deep teal on restrained white, with no playful motion and its disclaimer always in view. Choosing it tells the AI the photo is probably a medicine (it still says when it isn't). A medicine result always opens in Medicine Mode, led by its active ingredient, then how it is taken, the cautions and "Ask a pharmacist before combining".
- A new home: a greeting, "Know what works for your body.", one obvious scan button (with upload and barcode beside it), your watchlist, your recent scans with their status, and the way into Medicine Mode.
- Food results open with a verdict for your watchlist: "A good fit", "Worth a closer look" or "Not a match for your watchlist". Without a watchlist, the allergens on the label come first. Then why it matters, the details, and the notes on the reading.
- History is a screen of its own: search, filters (food, medicines, allergy alerts), dates and a status for every scan.
- "My profile" is now "My watchlist", edited in a bottom sheet that says how it shapes every result.
- The analyzing card reveals its steps one by one.

## 0.14.0 — 2026-10-14
- One pen line drawn across a medicine box is read as "1 a day" again. A real box with one diagonal line and a handwritten price was read as morning, midday and evening by Gemini Flash-Lite (the fallback model when Gemini Flash is busy). The model now works through the handwriting step by step (what it saw, its layout, the count) and sets prices and other figures aside. When a reading contradicts itself (a line across the box read as times of day), no dose is shown at all, only a note saying it can be read two ways and to ask the pharmacist: a wrong number is worse than none. A dose written in figures or words is never rewritten. An uncertain reading is labelled as such on screen and in what Ask AI is told.
- A translated sentence must keep every number of the original (a dose can't change in translation), and translations are never shared between visitors.
- Switching the language turns the result on screen into that language by itself, without analyzing the photo again: the app's own sentences are rebuilt at once, the AI's text (summary, usual dose, cautions…) is translated once and kept with the scan, so going back costs nothing. Your dose and your conversation stay as they are. Saved scans follow too.
- The same photo picked again opens its saved result instead of asking the AI again. A photo that only looks like a saved scan asks first: a new box can carry another dose in pen.
- Fewer, shorter notes on a medicine, shown together in one card; at most 3 cautions, 4 groups who shouldn't take it and 4 common side effects. Ask AI answers medicine questions like a clinical pharmacist: direct, and it asks a short question when the answer depends on something it doesn't know instead of assuming. Its "General information" stamp appears once per answer.
- The analysis screen no longer talks about food labels only: it reads food, drinks and medicines.
- Correcting your dose, adding a composition photo or analyzing again no longer restarts a treatment's countdown on the shelf (it counted from the last save instead of the day of the scan), and scans saved before "any time" doses existed no longer show "NaN a day".
- The home button has a name for screen readers on narrow phones.

## 0.13.2 — 2026-10-08
- Next.js is updated to 16.3.8, which fixes six security advisories published against 16.3.6 (one high: server-side request forgery in image optimization; the rest moderate or low). The audit step in CI had started failing because of them.

## 0.13.1 — 2026-10-08
- Version bump only: no changes to the app.

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
