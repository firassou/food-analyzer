---
name: verify-app
description: Use after any change, and before saying a step is done: build, lint, test and check the app in a browser.
---

# Verify the app

1. Run `pnpm lint`, `pnpm test` and `pnpm build`. All three must pass.
2. Run `pnpm dev` (needs `.env.local`, see `.env.example`), then:
   - Health check: `curl -s localhost:3000/api/analyze | jq`
   - Analyze a sample: `curl -s -F image=@samples/<file>.jpg localhost:3000/api/analyze | jq '.result.warnings, .meta'`
   - `next dev` refuses to start while another dev server runs from this directory: reuse that one (it hot-reloads; its logs are in `.next/dev/logs/next-development.log`).
   - To test a different model chain without editing `.env.local`, run a production server with env overrides, e.g. `pnpm build && HF_TOKEN= NVIDIA_MODEL=moonshotai/kimi-k3 PORT=3100 pnpm start`. Process env wins over `.env.local`.
   - Error paths: a non-image renamed `.jpg` → 415 `unsupported_image`; a 13 MB body → 413; no `image` field → 400; 13 requests from one `x-forwarded-for` in a minute → 429.
   - Shell gotchas here: `rm` is aliased to `rm -i` (use `\rm -f`), and `pkill -f "<text>"` also kills the shell running it; use `pkill -f "[n]ext start"` or kill by PID.
3. Keep a `samples/` folder of label photos covering the main cases:
   - an EU biscuit with may-contain
   - a US Nutrition Facts panel
   - a French or Arabic label
   - a drink per 100 ml
   - a blurry photo
   - a non-label photo
   - still missing: a bottled water, a dish with no label, a front-of-pack shot (for the product lookup)
4. In the browser, walk through: landing → take / choose / drop / paste (analysis starts by itself) → cancel → results nav, scroll-spy, tile jumps and additive links → error state → not-a-label → each kind (label, drink, water, dish, unreadable product) → language switch (English, French, Arabic right-to-left) → dark mode → mobile width (360 px).
   - No browser tool is needed: drive `/usr/bin/google-chrome` with `playwright-core` installed in a scratch folder, and stub `**/api/analyze` with results made by `normalize()` from the fixtures to see every kind without spending model quota. Check the console for errors and `scrollWidth > clientWidth` for horizontal overflow.
   - Language: `curl -H "Accept-Language: ar" localhost:3000 | grep -o '<html[^>]*>'` should show `lang="ar" dir="rtl"`; a `lang` cookie wins. `-F lang=fr` on the analyze call returns French text.
5. Report what you actually verified, and say plainly what you skipped (for example, no API key, so there was no live analysis).
