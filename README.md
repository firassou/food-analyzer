# Food Checker

An AI food-label analyzer. Upload (or paste) a photo of a packaged food label in any language, and get a single-page breakdown of allergens, gluten and lactose status, nutrition with traffic-light levels, ingredients, additives (E-numbers), dates, storage, manufacturer and the raw label text.

**The LLM is never trusted blindly.** A vision model reads the label. Its reply is parsed leniently and mapped onto a strict schema, then a deterministic, multilingual knowledge base (EN, FR, ES, IT, DE, AR) cross-checks and corrects it. The API always returns a complete, well-typed object.

## Stack

Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, `sharp` for server-side image processing, and the `openai` package as a client for OpenAI-compatible providers (Hugging Face router, NVIDIA NIM). Unit tests use Vitest.

## Setup

```bash
pnpm install
cp .env.example .env.local   # then add at least one key
pnpm dev                     # http://localhost:3000
```

| Command      | What it does                         |
| ------------ | ------------------------------------ |
| `pnpm dev`   | development server                   |
| `pnpm build` | production build                     |
| `pnpm start` | serve the production build           |
| `pnpm lint`  | ESLint                               |
| `pnpm test`  | Vitest unit tests (parse, knowledge, normalize, server) |

## Environment variables

Set these in `.env.local`. At least one provider key is required.

| Variable             | Default                              | Purpose                                                 |
| -------------------- | ------------------------------------ | ------------------------------------------------------- |
| `HF_TOKEN`           | none                                 | Hugging Face router key (primary provider)              |
| `NVIDIA_API_KEY`     | none                                 | NVIDIA NIM key (second, independent provider)           |
| `HF_MODEL`           | `Qwen/Qwen3-VL-30B-A3B-Instruct`     | primary HF model(s), comma-separated                    |
| `HF_FALLBACK_MODELS` | `Qwen/Qwen3-VL-235B-A22B-Instruct`   | HF fallbacks, comma-separated (set empty to disable)    |
| `NVIDIA_MODEL`       | `google/gemma-4-31b-it`              | NVIDIA model(s), comma-separated                        |

Models are tried in this order: HF primary, HF fallbacks, then NVIDIA. `GET /api/analyze` shows which providers and models are configured, without exposing secrets.

## Architecture

```
 Browser                                   Server (route handler, Node)
 ───────                                   ─────────────────────────────
 pick / drop / paste photo
   │
   ▼
 lib/client/prepareImage.ts                app/api/analyze/route.ts
 EXIF-rotate, ≤2000 px, JPEG 0.9  ──POST──▶  rate limit (RateLimiter) → size checks → multipart "image"
                                              │
                                              ▼
                                           lib/server/image.ts
                                           magic-byte sniff, sharp: rotate → ≤1600 px →
                                           flatten → normalise → mozjpeg 88 → data URL
                                              │
                                              ▼
                                           lib/server/analyze.ts  ◀── lib/server/models.ts
                                           for each target (HF → HF fallbacks → NVIDIA):   target chain,
                                             stream with watchdog (first token 35 s,       error → FailureKind
                                             idle 20 s, 115 s total budget)
                                             complete JSON → done
                                             truncated → keep best as fallback, continue
                                             auth/quota → skip the provider
                                              │
                                              ▼
                                           lib/analysis/parse.ts      lenient JSON + truncation repair
                                           lib/analysis/normalize.ts  any shape → complete LabelAnalysis
                                              └─ lib/analysis/knowledge.ts  allergens, false friends,
                                                 E-numbers, fortificants, FSA thresholds, may-contain
                                              │
 app/page.tsx (state machine)  ◀──JSON────────┘
 app/Content.tsx (results)
```

- `app/lib/analysis/` is pure and shared by client and server. `app/lib/server/` is server-only.
- Deterministic rules may only **raise** gluten and lactose status; a "gluten-free" or "lactose-free" claim is the only thing that suppresses a raise. Computed data (nutrition levels, per-100 derivation, additive codes, the sugar explanation) wins over model claims.
- Time budget: server deadline 115 s < route `maxDuration` 120 s < client timeout 150 s.
- Rate limiting sits behind a `RateLimiter` interface (`app/lib/server/rateLimit.ts`). The default in-memory limiter allows 12 requests per minute per IP, per server instance. It keys on `x-forwarded-for`, which is only trustworthy behind a proxy that sets it, so treat it as a cost guard, not a security boundary.

## API

### `POST /api/analyze`

`multipart/form-data` with the photo in an `image` (or `file`) field, up to 12 MB. The format is detected from the file's bytes; the declared MIME type is ignored.

```ts
type AnalyzeResponse =
  | { ok: true; result: LabelAnalysis; meta: AnalyzeMeta }
  | { ok: false; error: string; code: AnalyzeErrorCode; trace?: string[] };

interface AnalyzeMeta { model: string; provider: string; attempts: number; duration_ms: number; trace?: string[] }
```

`trace` (one line per model attempt) is included only in development.

| Status | `code`                  | When                                                     |
| ------ | ----------------------- | -------------------------------------------------------- |
| 200    | none                    | success (including "not a label": `label_detected: false`) |
| 400    | `bad_request`           | not multipart, or no image field                          |
| 413    | `too_large`             | over 12 MB                                                |
| 415    | `unsupported_image`     | not a readable image                                      |
| 429    | `rate_limited`          | too many requests from this client                        |
| 499    | `bad_request`           | the client cancelled                                      |
| 502    | `upstream_auth`, `upstream_quota`, `upstream_unavailable` | provider key rejected, credits exhausted, or provider down |
| 503    | `not_configured`, `rate_limited` | no provider key, or providers are rate-limiting   |
| 504    | `timeout`               | no model answered in time                                 |
| 500    | `internal`              | unexpected error                                          |

`LabelAnalysis` (full definition in [`app/lib/analysis/types.ts`](app/lib/analysis/types.ts)). Every field is always present; unknown values are `null`, `[]` or `"unclear"`.

```ts
interface LabelAnalysis {
  label_detected: boolean; image_quality: "good" | "fair" | "poor"; language: string | null;
  product: { name; brand; category; quantity: string | null };
  summary: string | null; highlights: { tone: "positive" | "neutral" | "caution"; text: string }[];
  ingredients: { name; name_en; percent; e_number; allergens: AllergenId[]; gluten; dairy }[];
  allergens: { id: AllergenId; name; presence: "contains" | "may_contain"; declared; sources: string[] }[];
  gluten: { status: Presence; confidence: "high" | "medium" | "low"; evidence: string[] };
  lactose: { status: Presence; evidence: string[] };
  additives: { code; name; category; purpose; explanation }[];
  nutrition: { basis: "100g" | "100ml"; serving_size; per_100; per_100_calculated; per_serving;
               levels: Record<"fat" | "saturated_fat" | "sugars" | "salt", "low" | "medium" | "high" | null> } | null;
  sugar: { level: "low" | "medium" | "high" | "unknown"; per_100; basis; explanation };
  claims: string[]; certifications: string[];
  dates: { best_before; expiration; production; lot };
  storage: { instructions; temperature };
  manufacturer: { name; address; country };
  origin: string | null; raw_text: string | null; warnings: string[];
}
type Presence = "contains" | "likely_contains" | "no_indication" | "unclear";
// AllergenId: the EU 14 (gluten, milk, eggs, peanuts, tree_nuts, soy, sesame, fish,
// crustaceans, molluscs, celery, mustard, sulphites, lupin)
```

Example:

```bash
curl -F image=@samples/fr-yogurt-peut-contenir.jpg localhost:3000/api/analyze | jq '.result.allergens, .meta'
```

### `GET /api/analyze`

Health check: `{ ok, providers, models }`.

## Tests and samples

- `pnpm test` runs Vitest over `app/**/*.test.ts`. The normalizer tests replay raw model outputs from `app/lib/analysis/__fixtures__/` (truncated JSON, Python literals, a US per-serving panel, a French "peut contenir" label, Arabic, a drink, a non-label photo, a may-contain sentence glued to an ingredient).
- `samples/` holds real label photos for manual and API checks: a French yogurt with "peut contenir", an Arabic/French cola (per 100 ml), a multilingual chocolate bar with may-contain, a multilingual biscuit pack, a blurry photo and a non-label photo.

## Disclaimer

Results are AI-extracted from a photo and may contain mistakes. They are informational, not medical or dietary advice. Always check the packaging if you have allergies or dietary restrictions.
