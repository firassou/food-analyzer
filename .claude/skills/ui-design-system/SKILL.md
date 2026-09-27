---
name: ui-design-system
description: Use when building or changing any UI in app/: new result sections, tiles, cards, pages, drawers or states.
---

# UI design system

## Reuse primitives
- Use `app/components/ui.tsx`: `Card`, `Pill`, `Dot`, `Spinner`, `Tone`, `toneClasses`, `dotClasses`, `cn`. Don't write one-off colour classes.
- No UI component library. Icons are emoji plus a few inline SVGs.

## Tones
- `red`: contains / high
- `amber`: may contain / medium / additive
- `green` (emerald): none found / low
- `zinc`: unknown

## Visual language
- Cards: `rounded-3xl`, `border-zinc-200 dark:border-zinc-800`, `bg-white dark:bg-zinc-950`.
- Accent: an emerald→teal gradient (`bg-linear-to-r from-emerald-500 to-teal-500`).
- Emoji section icons.
- `tabular-nums` on every number.
- `dir="auto"` on label-derived text (ingredients, raw text, manufacturer), because labels can be RTL.

## Motion
- Use only the theme animations: `animate-fade-up`, `animate-fade-in`, `animate-grow`, `animate-flash`, `animate-float`, `animate-scan`, with a stagger delay prop.
- Everything must still work with reduced motion (`motion-reduce:` / `prefers-reduced-motion`): no content may depend on an animation finishing.

## New results section
- Register it in the section nav, and show it only when it has data.
- Give it a `section-<id>` anchor with `scroll-mt-32`.
- Support the flash highlight (used by tile jumps and the nav).

## Checklist before finishing
- Light and dark mode
- 360 px width with no horizontal scroll
- Keyboard focus is visible
- Empty and unknown states read clearly
- Neutral health wording (informational, not medical advice)
- Disclaimer kept
