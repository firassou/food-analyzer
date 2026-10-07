// Saved scans for the tests, built from the analysis fixtures with the app's own normalizer,
// so a test opens a real-shaped result without calling any AI provider.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { normalize } from "../app/lib/analysis/normalize";
import { parseModelJson } from "../app/lib/analysis/parse";
import type { LabelAnalysis } from "../app/lib/analysis/types";

export const HISTORY_KEY = "food-analyzer:history:v2";

const raw = (fixture: string): Record<string, unknown> =>
  parseModelJson(readFileSync(join(process.cwd(), "app/lib/analysis/__fixtures__", fixture), "utf8"))!.value as Record<string, unknown>;

export interface Seed {
  id: string;
  result: LabelAnalysis;
}

/** a fixture's result, with fields of the raw model answer replaced (`patch` is merged shallowly) */
export function fromFixture(id: string, fixture: string, patch: Record<string, unknown> = {}): Seed {
  return { id, result: normalize({ ...raw(fixture), ...patch }) };
}

/** a medicine made up here: a name, substances and (optionally) pen marks and a printed expiry */
export function medicine(id: string, name: string, active: string[], extra: { marks?: Record<string, unknown>; expiration?: string } = {}): Seed {
  return {
    id,
    result: normalize({
      kind: "medicine",
      label_detected: true,
      image_quality: "good",
      language: "en",
      product: { name },
      medicine: { active: active.map((a) => ({ name: a })), marks: extra.marks ?? null, uses: ["pain"] },
      dates: { expiration: extra.expiration ?? null },
    }),
  };
}

export const entry = (seed: Seed, minutesAgo = 0) => ({
  id: seed.id,
  at: Date.now() - minutesAgo * 60_000,
  thumb: null,
  result: seed.result,
  meta: { model: "test", provider: "test", attempts: 1, duration_ms: 1200, locale: "en" },
});

export const history = (...seeds: Seed[]) => JSON.stringify(seeds.map((s, i) => entry(s, i)));

/** "MM/YYYY" for a month this many months from now (0 = this month) */
export function monthsFromNow(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + n, 1);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
}
