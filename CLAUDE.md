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

Update a skill whenever you learn something it gets wrong.
