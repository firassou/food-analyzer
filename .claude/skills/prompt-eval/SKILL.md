---
name: prompt-eval
description: Regression-check the model pipeline before and after changing prompt.ts, models, providers or normalize. Runs the sample photos and the pen-mark cases against a running dev server.
disable-model-invocation: true
---

# Prompt / model regression check

Spends real provider quota (one call per photo), so run it on purpose, not on every edit. It also runs weekly in CI (`.github/workflows/eval.yml`) when a provider key is set as a repository secret.

1. A dev server must be running (`pnpm dev`; reuse the one already running, see `verify-app`). `curl -s localhost:3000/api/analyze | jq` must say `"ok": true`.
2. `pnpm eval:samples`: posts every photo in `samples/` and checks what its name promises (`non-label-table.jpg` is `kind: other`, the chocolate lists may-contain traces, the cola is a drink…). It prints what changed since the last run (`samples/.last-eval.json`, git-ignored) even when a check still passes.
3. `pnpm eval:marks`: draws medicine boxes with known pen marks (and reads real photos dropped in `samples/marks/`, named `<anything>__<answer>.jpg`, see its README) and compares the reading with the answer. Known weakness: one short stroke at each end of a box (1-0-1) is often read as "one line, once a day". The reader can correct marks in the app, so this is reported, not blocking.
4. A regression in `eval:samples` blocks the change. A flaky provider (`rate_limited`, `timeout`) is rerun once, then reported as flaky, not as a regression.
5. Real photos in `samples/marks/` are pictures of someone's medicine: never commit them (they are git-ignored).
