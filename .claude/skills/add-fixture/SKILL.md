---
name: add-fixture
description: Capture a new model output as a test fixture and write the failing test for it. Use when a real photo produced a wrong or surprising result.
---

# Adding a fixture

1. Get the raw model text exactly as sent (fences, `<think>`, truncation included). Never include personal data from a real photo: change names, batch numbers and addresses.
2. Save it as `app/lib/analysis/__fixtures__/<case>.txt` (kebab-case, says what is special: `fr-peut-contenir.txt`).
3. In `normalize.test.ts` (or `parse.test.ts` for a parser case) add the failing expectation through `analyze("<case>.txt")`, and add the file to the "complete object for every fixture" list.
4. Run `pnpm test` and watch it fail for the right reason, then fix `parse.ts` / `normalize.ts` / `knowledge.ts` following `normalize-invariants`.
5. Do not commit a sample photo of a real product's packaging that you don't own the rights to; fixtures are text.
