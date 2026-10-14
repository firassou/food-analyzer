---
name: ui-design-system
description: Use when building or changing any UI in app/: new result sections, tiles, pages, the dock or states.
---

# UI design system: LabelSight (since 0.15.0)

Mobile first, editorial, tactile and trustworthy, with **two modes**:
- **Food**: warm oat paper (`#F7F4EE`), botanical charcoal ink, forest green (`#27624D`), soft lime for good news, peach for "worth a closer look". A restrained serif (`font-editorial`, Newsreader) for big Food headlines only. Friendly and personal.
- **Medicine Mode** (`data-mode="medicine"` on any element): restrained white, deep teal (`#156B68`), pale-teal information surfaces, warm amber cautions. No serif, no spring, no breathing, no celebration: quiet, precise, safety-first, and the disclaimer ("explains packaging, does not replace a pharmacist or doctor") is always visible.
The page root carries `data-mode` (`.mode-root`): the reader's chosen mode on the home and lists, the result's kind (medicine or not) on a result. A card can carry a mode of its own (the Medicine Mode entry on the Food home).

No indigo/purple gradients, glass, blobs, emoji icons, dense dashboards or fake charts. Radius 14px for controls (`rounded-control`), 20px for cards (`rounded-card`, or the `card` utility: warm white, hairline, soft shadow); pills (`rounded-full`) only for round icon buttons, never for text buttons or chips (`rounded-md`/`rounded-lg`).

## Tokens (`app/globals.css`)
- Colours are CSS variables that flip with the colour scheme **and the mode**, exposed as utilities: `paper` (page), `sheet` (surface), `ink`, `ink-soft`, `rule`, `accent` / `on-accent` (filled actions), `accent-soft` / `on-accent-soft` (tonal actions, chips, icon bubbles, medicine information surfaces), food accents `lime` / `on-lime` and `peach` / `peach-soft` / `on-peach`, and the verdict pairs `bad` / `bad-soft`, `warn` / `warn-soft`, `good` / `good-soft`, `mute` / `mute-soft`. Text colours pass WCAG AA on their own surfaces; the brighter hues (`bad-strong`, `warn-strong`, lime, peach) are for fills, icons and borders, never small text.
- Shape, depth and motion are tokens too: `rounded-control`, `rounded-card`, `shadow-card`, `shadow-raised`, `--ease-spring` (Food: a soft spring; Medicine: plain ease-out), `--rise-distance` (0 in Medicine Mode), `animate-breathe` (the idle capture button; off in Medicine Mode), `animate-sheet-up`, and the `stagger` utility (children enter 50 ms apart). Everything stops under reduced motion.
- **Never write `dark:` variants or raw Tailwind palette colours** (`zinc-*`, `emerald-*`): use the tokens, and dark mode follows.
- Red, amber and green mean a verdict and nothing else. The accent blue is for actions, links and the brand.
- Surfaces are separated by `ring-1 ring-rule` or by tone, not by heavy borders. Radius: 28px for sheets and cards, `rounded-3xl` for tiles, `rounded-2xl` for inner blocks, `rounded-[20px]` for dock buttons, `rounded-full` for chips and pills.
- Fonts: `font-display` (Figtree) for headings and big figures, `font-sans` (Geist) for text, `font-mono` (Geist Mono) only for the raw label text. `eyebrow` is a quiet 12px medium label, sentence case.
- Arabic uses IBM Plex Sans Arabic. In an Arabic interface it leads the font stacks (`:root:lang(ar)`), because the Latin faces' metric fallbacks would otherwise claim Arabic characters. Letter-spacing is reset under `:lang(ar)`.

## Primitives (`app/components/ui.tsx`, `app/components/result/*`)
- `Section` (a card with a tonal icon bubble, title, optional aside), `Tag` (pill), `Dot`, `Notice` (tinted, with a tone icon), `Bar`, `Spinner`, the icon set (24px, 1.8 stroke: add new icons there, never emoji), `toneClasses` / `toneText` / `dotClasses`, `cn`. Tones: `red` contains / high, `amber` may contain / medium / additive / estimate, `green` none found / low, `zinc` neutral.
- `result/bits.tsx`: `Chip`, `GeneralChip` (the amber "General information" stamp), `StatusTile` (the verdict is the colour of the whole tile), `SubLabel`, `Legend`, `InfoList`. The result sheet is built in `Content.tsx` from `result/*` panels (Marks, WaterPanel, Nutrition, Ingredients, Additives, DrinkPanel, ProfileVerdict, RawText); keep `Content.tsx` a composer, not a place for new panels.
- Don't pass a `className` that fights a primitive's own utilities (two colour or font-size utilities on one element resolve by stylesheet order, not class order). Make a small dedicated element instead.

## Layout
- The result is a stack of separate surfaces with a 12px gap: header card, optional "check with" card, a grid of tiles, then one `Section` per topic. A sticky pill nav (tonal selected state) follows the scroll.
- The home screen is a two-column hero from `lg` (headline, calls to action and the rotating word on the left, a bento of what it reads on the right) and one column below.
- The dock (fixed, bottom, thumb reach) carries the one primary action on a phone and whenever a scan is open; on the desktop home the same actions sit under the headline. Leave room for it with `pb-dock`. Touch targets are at least 44 px (`h-11`).
- From `lg`, the photo sits in a sticky left column.
- The headline's last word rotates (`RotatingWord`): it is paused for reduced motion and for a hidden tab, and screen readers get the list once.

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
- Theme animations only: `animate-fade-up`, `animate-fade-in`, `animate-grow`, `animate-flash`, `animate-scan`, `animate-word-in`, `animate-word-out`. Everything must work with reduced motion; no content may depend on an animation finishing.
- Anything `fixed` that opens from inside the page (the camera) is portalled to `<body>`: an animated ancestor would trap it.

## Medicines
- Anything from the model's general knowledge carries the amber "General information" stamp; what was read on the pack and what was computed don't. Keep that distinction visible in any new medicine UI.
- The pen marks are redrawn as strokes with a number under each time of day; never present them as the prescription itself. The reader can always correct or add their own dose (`DoseMarksPanel`, `withUserMarks`): their entry replaces the reading, is labelled "Entered by you" and removes the "an AI read this" warnings.

## New results section
- Add it to `shown`, `order`, `titles`, `sectionIcons` and `blocks` in `Content.tsx`; it is listed in the nav automatically, and shown only when it has data.
- Tiles carry a `target` section, not a closure (the React compiler lint rejects render-time closures over refs).

## Checklist before finishing
- Light and dark mode; English, French and Arabic
- 360 px width with no horizontal scroll
- Keyboard focus is visible
- Empty and unknown states read clearly; every warning is shown
- Neutral health wording (informational, not medical advice)
- Disclaimer kept

## Nothing found → nothing shown
- The user asked (2026-10-04) for no "Unknown", "Unclear", "Not printed" or "—" anywhere on the sheet. A tile with nothing to say sets `empty: true` and is filtered out; a section whose content is unknown is left out of `shown`; rows and meters render only the values that exist (flex rows, so any count fills the width).
- What is missing is explained once, by the warnings in the header (one amber card with a list, not a stack of notices), with the way to get it (another photo). Don't add a placeholder for a missing value in a new section.

## Profile and medicine check
- The profile is optional everywhere: no prompt to create one, no feature that requires it. `ProfileVerdict` renders nothing without a profile.
- A medical or dietary verdict never says "safe". The watchlist verdicts are "A good fit" (always with "nothing on your watchlist was found in what was read… check the pack yourself"), "Worth a closer look" and "Not a match for your watchlist"; the empty interaction state is "nothing stood out" with the reminder that the list is short. Never hide an allergen warning inside a list: without a watchlist, the label's allergens lead the result.

## Ask AI
- Last section (`ask`), shown whenever `Content` gets an `ask` prop (the page always passes the scan's id). Other parts of the sheet can put a question to it (`askAbout` in `Content.tsx`: the additives' "Ask AI" button): it is sent as if typed. Medicines get their own intro, suggestions and a prompt that answers like a clinical pharmacist: practical advice, a short question instead of an assumption when the answer depends on something unknown, general knowledge always marked `[G]` (the stamp shows once per medicine answer, not on every paragraph), and the prescriber named once, where a change of treatment is concerned. Chat lives in `components/AskAi.tsx`; conversations are stored on the history entry through `saveChat` only. An unanswered question goes back into the input, never into the saved chat.

## Shelf, people, share, dictation, alternatives
- "My shelf" is a screen of its own (`Shelf.tsx`, opened from the header button, closed by any scan, the logo or Back). It shares `togetherText` with the two-medicine screen: one sentence per finding, never rewritten.
- Several people: `usePersonName()` is how a profile is called in the interface (typed name, else "Me" / "Person 2"); the header button shows the active person's initial once there are two or more.
- Anything that appears only where the browser supports it (dictation, notifications, share sheet) is feature-detected through `useSyncExternalStore` or at the click, never in an effect that sets state, and has a fallback or is left out.
- Anything that calls a free public database on the reader's behalf (better choices) is fetched quietly, cached on the server, and simply absent when it finds nothing or can't be reached: no empty state, no error. Anything suggested to the reader is filtered on the device by their profile and must be available in their country; the profile is never sent.
- Print: chrome carries `print:hidden`; the sheet prints on white with cards kept whole.
