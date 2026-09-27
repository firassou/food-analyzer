---
name: verify-app
description: Use after any change, and before saying a step is done: build, lint, test and check the app in a browser.
---

# Verify the app

1. Run `pnpm lint`, `pnpm test` and `pnpm build`. All three must pass.
2. Run `pnpm dev` (needs `.env.local`, see `.env.example`), then:
   - Health check: `curl -s localhost:3000/api/analyze | jq`
   - Analyze a sample: `curl -s -F image=@samples/<file>.jpg localhost:3000/api/analyze | jq '.result.warnings, .meta'`
3. Keep a `samples/` folder of label photos covering the main cases:
   - an EU biscuit with may-contain
   - a US Nutrition Facts panel
   - a French or Arabic label
   - a drink per 100 ml
   - a blurry photo
   - a non-label photo
4. In the browser (use the global `run` skill), walk through: landing → drop, paste and replace → analyze → cancel → results nav, scroll-spy, tile jumps and additive links → error state → not-a-label → dark mode → mobile width (360 px).
5. Report what you actually verified, and say plainly what you skipped (for example, no API key, so there was no live analysis).
