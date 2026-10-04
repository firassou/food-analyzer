# Food Analyzer

An AI food-label analyzer, built for phones. Take (or choose, drop, paste) a photo and get a single-page breakdown, in English, French or Arabic:

- **A food label**, in any language: allergens, gluten and lactose status, nutrition with traffic-light levels, ingredients, additives (E-numbers), dates, storage, manufacturer and the raw label text.
- **A drink**: sugar per 100 ml and in the whole container, colourants, sweeteners, caffeine, then the rest.
- **A bottled water**: the printed mineral composition, pH on its scale, dry residue, computed hardness, and what the values mean against EU reference levels. No gluten or allergen sections.
- **A dish with no label** (a slice of cake): an estimate of its ingredients with a confidence for each, and the allergens that are therefore likely. Always marked as an estimate.
- **A medicine** (box, blister, bottle or leaflet): the active substance and strength, the excipients with the official patient notes for the ones that matter (wheat starch, lactose, aspartame, sulphites…), gluten, general information about the substance (what it's for, usual dose, who shouldn't take it, cautions, side effects), and the dose a pharmacist marked on the box by hand, when there is one.
- **A medicine whose excipients aren't on the photo** (they rarely are on the front of the box): they are looked up in the French public medicines database (the official summary of product characteristics), and the result says so. If the medicine isn't found, the analysis is shown as it is, with an optional "Add a photo of the composition" button that merges a second photo into the same result.
- **For you** (optional): a profile kept on the device (allergens, lactose, sugar, vegetarian, vegan, halal). With one, every result opens with a verdict for that profile; without one the app works exactly the same. No account, nothing is sent.
- **Two medicines together**: pick two scanned medicines to check for the same active substance in both, two of the same family, or a well-known serious interaction.
- **A barcode**: scanned with the camera (Chrome on Android and desktop) or typed, it is looked up in Open Food Facts without any photo.
- **A product whose ingredient list can't be read**: it is looked up in [Open Food Facts](https://world.openfoodfacts.org) by barcode or name, and the result says so. If that fails, the app asks for a photo of the whole product.

**The LLM is never trusted blindly.** A vision model reads the label. Its reply is parsed leniently and mapped onto a strict schema, then a deterministic, multilingual knowledge base (EN, FR, ES, IT, DE, AR) cross-checks and corrects it. The API always returns a complete, well-typed object.

## Stack

Next.js 16 (App Router), React 19, TypeScript (strict), Tailwind CSS v4, `sharp` for server-side image processing, and the `openai` package as a client for OpenAI-compatible providers (Gemini, Groq, OpenRouter, Hugging Face router, NVIDIA NIM). Unit tests use Vitest.

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

Set these in `.env.local` (see `.env.example`). At least one provider key is required; providers without a key are skipped.

| Variable             | Default                                                | Purpose                                         |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------- |
| `GEMINI_API_KEY`     | none                                                   | Google AI Studio key (free tier)                |
| `GROQ_API_KEY`       | none                                                   | Groq key (free tier)                            |
| `OPENROUTER_API_KEY` | none                                                   | OpenRouter key (free `:free` models)            |
| `HF_TOKEN`           | none                                                   | Hugging Face router key (monthly credits)       |
| `NVIDIA_API_KEY`     | none                                                   | NVIDIA NIM key                                  |
| `PROVIDER_ORDER`     | `huggingface,nvidia,gemini,groq,openrouter`            | order the providers are tried in                |
| `GEMINI_MODEL`       | `gemini-3.8-flash,gemini-3.5-flash-lite`               | Gemini model(s), comma-separated                |
| `GROQ_MODEL`         | `qwen/qwen3.8-27b`                                     | Groq model(s)                                   |
| `OPENROUTER_MODEL`   | `google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free`     | OpenRouter model(s)                             |
| `HF_MODEL`           | `Qwen/Qwen3-VL-30B-A3B-Instruct`                       | primary HF model(s)                             |
| `HF_FALLBACK_MODELS` | `Qwen/Qwen3-VL-235B-A22B-Instruct`                     | HF fallbacks (set empty to disable)             |
| `NVIDIA_MODEL`       | `google/gemma-4-31b-it`                                | NVIDIA model(s)                                 |
| `PRODUCT_LOOKUP`     | on                                                     | `off` disables the Open Food Facts and medicines-database lookups |

### Free setup

1. Create free keys: [Google AI Studio](https://aistudio.google.com/apikey), [Groq](https://console.groq.com/keys) and [OpenRouter](https://openrouter.ai/settings/keys). None needs a card.
2. Put them in `.env.local` with `PROVIDER_ORDER=gemini,groq,openrouter`.
3. `curl localhost:3000/api/analyze` should list the three providers.

Free tiers are rate-limited per minute and per day, and Gemini's free tier may use requests to improve Google's products. The chain handles limits: a model that answers "rate limited", "out of quota" or "bad key" is skipped instantly (it doesn't use up one of the 4 attempts), put on a cooldown (the provider's `Retry-After`, else 1 minute, or 30 s for an overloaded 503; 1 hour for quota or bad keys, for the whole provider), and later requests go straight to the next model. Models on cooldown are still tried last if nothing else works. `GET /api/analyze` shows the chain in order.

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
                                           for each target (PROVIDER_ORDER, cooling last): target chain,
                                             stream with watchdog (first token 35 s,       error → FailureKind
                                             idle 20 s, 115 s total budget)
                                             complete JSON → done
                                             truncated → keep best as fallback, continue
                                             limit/bad key → instant skip + cooldown
                                              │
                                              ▼
                                           lib/analysis/parse.ts      lenient JSON + truncation repair
                                           lib/analysis/normalize.ts  any shape → complete LabelAnalysis
                                              └─ lib/analysis/knowledge.ts  allergens, false friends,
                                                 E-numbers, fortificants, FSA thresholds, may-contain
                                              │
                                           lib/server/lookup.ts       recognised product, no readable
                                              │                       ingredient list → Open Food Facts
 app/page.tsx (state machine)  ◀──JSON────────┘                       → normalize() again, marked "database"
 app/Content.tsx (results)
```

- **Languages.** `app/lib/i18n/`: the interface follows the device (`Accept-Language`) until a language is picked in the header (cookie `lang`). Arabic is right-to-left. The request carries `lang`; the model writes its free text in it and `normalize()` writes its own sentences from `app/lib/analysis/messages.ts`. Everything the rules match on stays English, so the checks behave the same in every language.
- **Photo.** "Take a photo" opens the native camera on phones and an in-page viewfinder elsewhere; the photo is analyzed as soon as it is picked.
- **Estimates and lookups are never passed off as a reading.** `ingredient_source` says whether the list was read on the `label`, came from the `database`, or is `estimated`. Estimated ingredients can make an allergen "may contain" and gluten or lactose "likely" at most, and a warning always says where the list came from.
- **History and comparison.** Scans are saved in the browser (`localStorage`, newest 30, with a small thumbnail) through `app/lib/client/history.ts`, which guards every storage access. Nothing is stored on the server. Two saved scans can be compared side by side.
- **Installable.** `app/manifest.ts` and the icons in `public/icons/` let the app be added to a phone's home screen. There is no service worker, so it still needs a connection.
- **Gluten likelihood.** The gluten bar shows how likely gluten is (`glutenLikelihood` in `knowledge.ts`: "no indication" is always 0 %; for "likely" and "contains" the verdict sets the range and the confidence moves it within it), not how confident the reading is. It is a reading of the evidence, not a measured amount.
- **Dish nutrition** is the model's rough figure for a typical recipe (`nutrition.estimated: true`), with a warning; it is never turned into "high in…" statements.
- **Water tips.** Each water remark has a `text` (the fact, with figures), a `tip` (what it means for the person drinking it) and a `source`. Tips rest on published guidance listed at the top of the water block in `messages.ts` (WHO drinking-water guidelines and sodium guideline, EFSA reference intakes, EAU urolithiasis guidelines, EU mineral-water rules) and work out what a litre gives against the daily reference. They correct common myths rather than repeat them: calcium in water is not presented as a cause of kidney stones, because the guidance says the opposite.
- **Medicines.** Three kinds of information are kept apart. *Read on the pack*: name, active substance, form, excipients, dates. *Computed*: gluten and the "excipients with known effect" (`app/lib/analysis/excipients.ts`), whose patient wording follows the EMA annex on excipients (EMA/CHMP/302620/2017). *General, from the model*: uses, usual dose, who shouldn't take it, cautions and side effects; these are dropped unless an active substance was identified, are labelled "general information" on screen, and come with a warning that the prescribed dose is the one to follow. The pharmacist's pen marks (strokes for morning / midday / evening, as drawn on boxes in Tunisia) are read into `medicine.marks`, limited to 0–6 units in halves, never deduced from the usual dose, and always shown with a warning that it is a reading to confirm. A medicine is never sent to the food database.
- **Medicine excipient lookup** (`app/lib/server/medicines.ts`). Free-tier models can't search the web (Gemini's search tool is not included in the free quota), and excipients recalled from a model's memory differ from one model to the next, so the lookup goes to an official source instead: base-donnees-publique.medicaments.gouv.fr. Only the medicine's name is sent. The entry must have the same brand and the same strength, and the pharmaceutical form must single it out; otherwise nothing is used. The list goes through the same excipient and gluten rules, is marked `ingredient_source: "database"`, and carries a warning that a box made for another country can differ. A second photo of the composition (`addExcipientPhoto` in `app/lib/analysis/medicine.ts`) replaces it and is never required.
- **Profile** (`app/lib/analysis/profile.ts`, stored by `app/lib/client/profile.ts`). The verdict is computed on the device from the normalized result: allergens, gluten, lactose and sugar level as already established, plus short ingredient rules for the diets. "Avoid" needs a listed ingredient; a source the label doesn't state (gelatine or E471 for halal, rennet for vegetarian) is only "check", and a halal / vegan claim on the pack answers those doubts. An estimate never goes beyond "check", and unread ingredients give "not checked", never "nothing found".
- **Medicines together** (`app/lib/analysis/interactions.ts`). Rules only: substances are matched across spellings and salts, then against a short list of families and long-established interactions of the kind every formulary lists. It was written from general pharmacology knowledge and has not been checked line by line against a formulary; it is far from complete, and the screen says that finding nothing is not a green light.
- **Product lookup** sends only the barcode or the product's name and brand to Open Food Facts, never the photo. A barcode is used only if its check digit holds, and a name match must be the same product, not merely a similar one.

- `app/lib/analysis/` is pure and shared by client and server. `app/lib/server/` is server-only.
- Deterministic rules may only **raise** gluten and lactose status; a "gluten-free" or "lactose-free" claim is the only thing that suppresses a raise. Computed data (nutrition levels, per-100 derivation, additive codes, the sugar explanation) wins over model claims.
- Time budget: server deadline 115 s < route `maxDuration` 120 s < client timeout 150 s.
- Rate limiting sits behind a `RateLimiter` interface (`app/lib/server/rateLimit.ts`). The default in-memory limiter allows 12 requests per minute per IP, per server instance. It keys on `x-forwarded-for`, which is only trustworthy behind a proxy that sets it, so treat it as a cost guard, not a security boundary.

## API

### `POST /api/analyze`

`multipart/form-data` with the photo in an `image` (or `file`) field, up to 12 MB. The format is detected from the file's bytes; the declared MIME type is ignored. An optional `lang` field (`en`, `fr` or `ar`; default `en`) sets the language of the analysis text.

```ts
type AnalyzeResponse =
  | { ok: true; result: LabelAnalysis; meta: AnalyzeMeta }
  | { ok: false; error: string; code: AnalyzeErrorCode; trace?: string[] };

interface AnalyzeMeta { model: string; provider: string; attempts: number; duration_ms: number; locale: "en" | "fr" | "ar"; trace?: string[] }
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
  kind: "label" | "water" | "drink" | "dish" | "medicine" | "other";
  product: { name; brand; category; quantity; barcode: string | null };
  summary: string | null; highlights: { tone: "positive" | "neutral" | "caution"; text: string }[];
  ingredients: { name; name_en; name_local; percent; confidence; e_number; allergens: AllergenId[]; gluten; dairy }[];
  ingredient_source: "label" | "database" | "estimated";
  database: { name; product; url } | null;
  allergens: { id: AllergenId; name; presence: "contains" | "may_contain"; declared; sources: string[] }[];
  gluten: { status: Presence; confidence: "high" | "medium" | "low"; evidence: string[] };
  lactose: { status: Presence; evidence: string[] };
  additives: { code; name; name_local; category; purpose; explanation }[];
  nutrition: { basis: "100g" | "100ml"; serving_size; per_100; per_100_calculated; per_serving;
               estimated: boolean;   // true for a dish: a rough figure, not read from a label
               levels: Record<"fat" | "saturated_fat" | "sugars" | "salt", "low" | "medium" | "high" | null> } | null;
  water: { minerals: Record<MineralKey, number | null>; dry_residue_mg_l; ph; sparkling; hardness_mg_l;
           facts: { id; tone; text; tip; source }[] } | null;                       // bottled water only
  drink: { volume_ml; sugar_per_container_g; colours: string[]; sweeteners: string[]; caffeine } | null;
  medicine: { form; active: { name; name_local; strength }[];
              marks: { morning; midday; evening; anytime; duration; note; confidence } | null;   // pharmacist's pen marks
              uses: string[]; typical_dose; how_to_take; not_for: string[]; warnings: string[]; side_effects: string[];  // general
              excipients: { id; matched; note; source }[] } | null;   // computed; the excipient list itself is in `ingredients`
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

### `GET /api/product?code=<barcode>&lang=<en|fr|ar>`

Barcode lookup, no model involved. Returns the same `AnalyzeResponse`, built from the Open Food Facts entry and run through the same checks (`ingredient_source: "database"`). `400 bad_request` for digits that aren't a valid barcode (the check digit is verified), `404 not_found` for an unknown product, `502 upstream_unavailable` if the database can't be reached, `503 not_configured` when `PRODUCT_LOOKUP=off`.

## Tests and samples

- `pnpm test` runs Vitest over `app/**/*.test.ts`. The normalizer tests replay raw model outputs from `app/lib/analysis/__fixtures__/` (truncated JSON, Python literals, a US per-serving panel, a French "peut contenir" label, Arabic, a drink, a bottled water, a dish with no label, a non-label photo, a may-contain sentence glued to an ingredient). `lookup.test.ts` covers the product lookup with a stubbed `fetch`; `locales.test.ts` checks language matching and that the French and Arabic dictionaries keep every placeholder.
- `samples/` holds real label photos for manual and API checks: a French yogurt with "peut contenir", an Arabic/French cola (per 100 ml), a multilingual chocolate bar with may-contain, a multilingual biscuit pack, a blurry photo and a non-label photo.

## Disclaimer

Results are AI-extracted from a photo and may contain mistakes. They are informational, not medical or dietary advice. For a medicine, the dose to follow is the one your doctor or pharmacist gave you, and the package leaflet is the reference. Always check the packaging if you have allergies or dietary restrictions.
