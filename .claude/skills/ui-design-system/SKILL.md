---
name: ui-design-system
description: Use when building or changing any UI in app/: new result sections, tiles, pages, the dock or states.
---

# UI design system: "the label, re-typeset"

Mobile first. The result reads like a printed spec sheet: warm paper, ink, heavy and hairline rules, mono small caps, one cobalt accent. No gradients, glass, emoji icons or floating card stacks.

## Tokens (`app/globals.css`)
- Colours are CSS variables that flip with the colour scheme, exposed as utilities: `paper` (page), `sheet` (surface), `ink`, `ink-soft`, `rule`, `accent` / `on-accent`, and the verdict pairs `bad` / `bad-soft`, `warn` / `warn-soft`, `good` / `good-soft`, `mute` / `mute-soft`.
- **Never write `dark:` variants or raw Tailwind palette colours** (`zinc-*`, `emerald-*`): use the tokens, and dark mode follows.
- Red, amber and green mean a verdict and nothing else. The accent is for actions, section numbers and links.
- Fonts: `font-display` (Bricolage Grotesque) for headings and big figures, `font-sans` (Geist) for text, `font-mono` (Geist Mono) for numbers and codes. `eyebrow` is the mono small-caps utility for labels, column heads and section numbers.
- Arabic uses IBM Plex Sans Arabic. In an Arabic interface it leads the font stacks (`:root:lang(ar)`), because the Latin faces' metric fallbacks would otherwise claim Arabic characters. Letter-spacing is reset under `:lang(ar)`.

## Primitives (`app/components/ui.tsx`)
- `Section` (numbered panel with a heavy top rule), `Tag`, `Dot`, `Notice`, `Bar`, `Spinner`, icons, `toneClasses` / `toneText` / `dotClasses`, `cn`. Tones: `red` contains / high, `amber` may contain / medium / additive / estimate, `green` none found / low, `zinc` unknown / neutral.
- Don't pass a `className` that fights a primitive's own utilities (two colour or font-size utilities on one element resolve by stylesheet order, not class order). Make a small dedicated element instead (`Stamp` in `Content.tsx`).

## Layout
- One sheet (`rounded-[28px] border border-rule bg-sheet`) holds the whole result; sections stack inside it, divided by rules. Grids of facts use `gap-px bg-rule` with `bg-sheet` cells for hairlines.
- The dock (fixed, bottom, thumb reach) carries the one primary action: take a photo. Leave room for it with `pb-dock`. Touch targets are at least 44 px.
- From `lg`, the photo sits in a sticky left column.

## Storage and overlays
- Saved scans go through `app/lib/client/history.ts` only (guarded `localStorage`, read with `useSyncExternalStore`). Bump the key's version when `LabelAnalysis` changes in a way old entries can't satisfy.
- The camera and the barcode scanner are full-screen dialogs portalled to `<body>`; both stop their stream on close and close on Escape.
- Don't declare a component inside another component's render (the React compiler lint rejects it): lift it out and pass props.

## Languages and direction
- Every visible string comes from `app/lib/i18n/messages/{en,fr,ar}.ts` through `useI18n()`. `en.ts` is the source of truth and its type forces the others to match. Use `format()` for `{placeholders}` and `rich()` for `<b>` emphasis. Remove strings that are no longer shown.
- Use logical utilities only: `ms-*`/`me-*`, `ps-*`/`pe-*`, `text-start`/`text-end`, `start-*`/`end-*`; `rtl:` for the rare flip (bar origin, arrows).
- Wrap figures with units in `ltr()` ("12 g / 100 ml"), and give a numeric scale `dir="ltr"`.
- `dir="auto"` on anything that comes from the label or from the analysis (names, summary, warnings, evidence): it can be in another language than the interface.

## Motion
- Theme animations only: `animate-fade-up`, `animate-fade-in`, `animate-grow`, `animate-flash`, `animate-scan`. Everything must work with reduced motion; no content may depend on an animation finishing.
- Anything `fixed` that opens from inside the page (the camera) is portalled to `<body>`: an animated ancestor would trap it.

## Medicines
- Anything from the model's general knowledge carries the amber "General information" stamp; what was read on the pack and what was computed don't. Keep that distinction visible in any new medicine UI.
- The pen marks are redrawn as strokes with a number under each time of day; never present them as the prescription itself.

## New results section
- Add it to `shown`, `order`, `titles` and `blocks` in `Content.tsx`; it is numbered and listed in the nav automatically, and shown only when it has data.
- Tiles carry a `target` section, not a closure (the React compiler lint rejects render-time closures over refs).

## Checklist before finishing
- Light and dark mode; English, French and Arabic
- 360 px width with no horizontal scroll
- Keyboard focus is visible
- Empty and unknown states read clearly; every warning is shown
- Neutral health wording (informational, not medical advice)
- Disclaimer kept
