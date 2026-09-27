---
name: nextjs16-conventions
description: Use before writing or changing any Next.js code (routes, layouts, config, next/image, next/font, route handlers, metadata). This project runs Next 16, which differs from older versions.
---

# Next.js 16 + Tailwind v4 conventions

## Read the docs first
- Before touching an API, read the relevant guide in `node_modules/next/dist/docs/` (App Router docs are under `01-app/`) and follow any deprecation notices. Don't rely on memory of older Next versions.
  - Find a guide quickly: `grep -rl "<topic>" node_modules/next/dist/docs/01-app | head`.
- Versions: `next` 16.3.x, `react` 19.2.x, TypeScript strict, pnpm.

## Project conventions
- App Router only (`app/`). No `pages/`.
- Route handlers (`app/api/**/route.ts`) use web `Request`/`Response` objects. Export `maxDuration` where a handler can run long (`app/api/analyze/route.ts`).
- Server-only modules (`app/lib/server/*`) start with `import "server-only"`. Modules in `app/lib/analysis/` are shared with the client and must never import server code.
- `"use client"` goes only on interactive components (`app/page.tsx`, `app/Content.tsx`, `app/components/*`), never on `layout.tsx`.
- Layouts use the global `LayoutProps<"/">` type helper (no import needed): `export default function RootLayout({ children }: LayoutProps<"/">)`.
- Fonts are loaded with `next/font/google` (Geist, Geist Mono) and exposed as the CSS variables `--font-geist-sans` / `--font-geist-mono`, which are mapped to `--font-sans` / `--font-mono` in `@theme inline`.
- `sharp` is on Next's default `serverExternalPackages` list, so `next.config.ts` needs no entry for it.
- Path alias: `@/*` maps to the repo root.

## Tailwind v4 conventions
- Config is CSS-first in `app/globals.css`: `@import "tailwindcss"`, `@theme` / `@theme inline`, `@utility`, `@custom-variant`. PostCSS uses `@tailwindcss/postcss`. There is **no** `tailwind.config.js`.
- Use v4 class names: `bg-linear-to-r` (not `bg-gradient-to-r`), `wrap-break-word` (not `break-words`), `size-*`, `aspect-4/3`, spacing-scale values like `h-130`.
- Every non-standard utility must be defined in `globals.css`. For example, `scrollbar-none` is defined with `@utility`.
- Animations (`fade-up`, `fade-in`, `grow`, `flash`, `float`, `scan`) are `--animate-*` theme tokens with their `@keyframes` in `@theme`.
