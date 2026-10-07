---
name: add-locale-string
description: Add or change a user-facing string. Use for any new text in app/: it must exist in en, fr and ar.
---

# Adding a string

1. Add the key to `app/lib/i18n/messages/en.ts` (the source of truth), under the section it belongs to.
2. Add the same key, same shape, to `fr.ts` and `ar.ts`. The `Messages` type fails the build if one is missing; `locales.test.ts` fails if a `{placeholder}` or `<b>` differs or a string is empty. Arabic is real Arabic, never a copy of the English.
3. Use it as `const { t } = useI18n()` → `t.section.key`. Placeholders go through `format(text, { name })`; emphasis through `rich()`.
4. Numbers, codes and units that must stay left-to-right go through `ltr()`.
5. Sentences written by `normalize()` live in `messages.ts` (analysis), not here.
6. `pnpm test` and `pnpm exec tsc --noEmit`. Then ask the `i18n-rtl-reviewer` agent to look at the UI that uses it.
