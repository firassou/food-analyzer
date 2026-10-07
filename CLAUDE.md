@AGENTS.md

# Food Analyzer

AI food-label analyzer. The spec lives in `PROMPT.md`. The LLM is never trusted blindly: its output is parsed leniently, normalized onto a strict schema and cross-checked by a deterministic knowledge base.

Commands: `pnpm dev`, `pnpm lint`, `pnpm test`, `pnpm build`.

## Project skills (`.claude/skills/`): invoke the matching one before every step it covers

- `nextjs16-conventions`: before writing or changing any Next.js / Tailwind v4 code (routes, layouts, config, fonts, metadata).
- `label-knowledge-rules`: when changing allergen keywords, false friends, E-numbers, additives, fortificants, may-contain phrases, drink detection or FSA thresholds in `app/lib/analysis/knowledge.ts`.
- `normalize-invariants`: before editing `normalize.ts`, `parse.ts`, `types.ts` or the model prompt.
- `model-providers`: when changing AI providers/models or timeouts, or when debugging failed/slow analyses (`app/lib/server/models.ts`, `analyze.ts`).
- `ui-design-system`: when building or changing any UI in `app/`.
- `verify-app`: after any change, before calling a step done (lint, test, build, browser check).
- `add-result-feature`: when implementing a Part B feature or any new analysis capability end to end.
- `add-locale-string`: for any new user-facing text (it must exist in en, fr and ar).
- `add-fixture`: when a real photo produced a wrong or surprising result.
- `prompt-eval` (user-only): regression check on `samples/` before and after changing the prompt, models or normalize.
- `release` (user-only): gates, version bump, changelog and tag.

Project agents (`.claude/agents/`): `label-safety-reviewer` after any change to allergen, gluten, additive, excipient, medicine or interaction rules; `i18n-rtl-reviewer` after UI changes. Hooks (`.claude/settings.json`): edits to `.env*` and generated files are blocked, and a turn that leaves a type error is sent back (`tsc --noEmit`).

Update a skill whenever you learn something it gets wrong.
