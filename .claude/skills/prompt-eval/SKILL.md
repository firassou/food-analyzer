---
name: prompt-eval
description: Regression-check the model pipeline on the photos in samples/ before and after changing prompt.ts, models, providers or normalize. Compares warnings, kind and key fields with the last saved run.
disable-model-invocation: true
---

# Prompt / model regression check

Spends real provider quota (one call per photo), so run it on purpose, not on every edit.

1. A dev server must be running (`pnpm dev`; reuse the one already running, see `verify-app`). `curl -s localhost:3000/api/analyze | jq` must say `"ok": true`.
2. For each `samples/*.jpg`, post it and keep a compact record (never the raw model text):
   `curl -s -F image=@samples/<f>.jpg -F lang=en localhost:3000/api/analyze | jq '{f: "<f>", ok, kind: .result.kind, name: .result.product.name, allergens: [.result.allergens[]|select(.presence=="contains")|.id], gluten: .result.gluten.status, additives: [.result.additives[].code], warnings: .result.warnings, ms: .meta.duration_ms}'`
3. Save the records to `samples/.last-eval.json` (git-ignored; create the ignore line if missing) and diff them with the previous file if there is one.
4. Report per photo: same / changed, and for every change whether it is an improvement or a regression against what the photo's file name says (`non-label-table.jpg` must be `kind: other`; `chocolate-may-contain-multilingual.jpg` must list may-contain traces; `drink-cola-ar-fr.jpg` must be `kind: drink`).
5. A regression blocks the change. A flaky provider (`rate_limited`, `timeout`) is rerun once, then reported as flaky, not as a regression.
