import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LOCALES, type Locale } from "../i18n/locales";
import { withExcipients, withUserMarks } from "./medicine";
import { normalize, type NormalizeOptions } from "./normalize";
import { parseModelJson } from "./parse";
import { PREVIOUS_WARNINGS } from "./messages";
import { relocalize } from "./relocalize";
import type { LabelAnalysis } from "./types";

const FIXTURES = readdirSync(new URL("./__fixtures__/", import.meta.url)).filter((f) => f.endsWith(".txt"));

function raw(name: string) {
  const parsed = parseModelJson(readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8"));
  if (!parsed) throw new Error(`fixture ${name} did not parse`);
  return parsed;
}

/** translated names depend on the translation, not on normalize: left out of the comparison */
const withoutNames = (r: LabelAnalysis) =>
  JSON.parse(
    JSON.stringify(r, (k, v) => (k === "name_local" ? null : v)),
  ) as LabelAnalysis;

const same = (s: string) => s;
const pairs = LOCALES.flatMap((from) => LOCALES.filter((to) => to !== from).map((to) => [from, to] as [Locale, Locale]));

describe("relocalize", () => {
  // The model's free text is the same raw text in both runs, so a lookup that returns it
  // unchanged isolates what matters: every sentence normalize writes comes out exactly as
  // normalize would have written it in the other language.
  it.each(FIXTURES.flatMap((f) => pairs.map(([from, to]) => [f, from, to])))("%s: %s → %s matches normalizing in that language", (f, from, to) => {
    const { value, repaired } = raw(f);
    const before = normalize(value, { repaired, locale: from as Locale });
    const direct = normalize(value, { repaired, locale: to as Locale });
    const { result } = relocalize(before, from as Locale, to as Locale, same);
    expect(withoutNames(result)).toEqual(withoutNames(direct));
  });

  it("rebuilds the sentences of a database entry and of the reader's own dose", () => {
    const database: NormalizeOptions["database"] = { name: "ANSM", product: "PARACALM 500 mg, comprimé", url: "https://example.org/m/1" };
    const fr = withUserMarks(
      withExcipients(normalize(raw("medicine.txt").value, { locale: "fr" }), { ingredients: ["amidon de maïs"], raw_text: null }, "fr", database),
      { morning: 1, midday: 0, evening: 0, anytime: 0, duration: null, note: null },
      "fr",
    );
    const en = withUserMarks(
      withExcipients(normalize(raw("medicine.txt").value, { locale: "en" }), { ingredients: ["amidon de maïs"], raw_text: null }, "en", database),
      { morning: 1, midday: 0, evening: 0, anytime: 0, duration: null, note: null },
      "en",
    );
    expect(relocalize(fr, "fr", "en", same).result.warnings).toEqual(en.warnings);
  });

  it("lists the model's free text it has no translation for, and uses the translations it gets", () => {
    const ar = normalize(raw("medicine-line-and-price.txt").value, { locale: "ar" });
    const first = relocalize(ar, "ar", "en", () => undefined);
    expect(first.missing).toEqual(expect.arrayContaining(["أقراص تيربينافين 250 مجم.", "الجرعة المعتادة للبالغين هي 250 مجم مرة واحدة يومياً."]));
    // what normalize wrote is already English, with no translation at all
    expect(first.result.warnings[0]).toMatch(/hard to read: don't rely on this reading/);
    expect(first.result.medicine?.active[0].name_local).toBeNull();

    const known = new Map(first.missing.map((s) => [s, `EN(${s})`]));
    const second = relocalize(ar, "ar", "en", (s) => known.get(s));
    expect(second.missing).toEqual([]);
    expect(second.result.summary).toBe("EN(أقراص تيربينافين 250 مجم.)");
    expect(second.result.medicine?.typical_dose).toBe("EN(الجرعة المعتادة للبالغين هي 250 مجم مرة واحدة يومياً.)");
    // the reading itself never goes through a translation
    expect(second.result.medicine?.marks).toEqual(ar.medicine?.marks);
  });

  it("rebuilds a warning a scan saved before it was reworded, and the app's own note on the marks", () => {
    const old = normalize(raw("medicine.txt").value, { locale: "fr" });
    old.warnings = old.warnings.map((w) => (w.startsWith("Les traits au stylo") ? PREVIOUS_WARNINGS.fr.medicineMarks![0] : w));
    const en = normalize(raw("medicine.txt").value, { locale: "en" });
    expect(relocalize(old, "fr", "en", same).result.warnings).toEqual(en.warnings);
    // a typed dose removes the marks warning in its old wording too
    expect(withUserMarks(old, { morning: 1, midday: 0, evening: 0, anytime: 0, duration: null, note: null }, "fr").warnings.some((w) => w.includes("stylo"))).toBe(false);

    const unsure = normalize({ kind: "medicine", image_quality: "good", medicine: { active: ["x"], marks: { layout: "across", morning: 1, evening: 1 } } }, { locale: "ar" });
    expect(relocalize(unsure, "ar", "en", same).result.medicine?.marks?.note).toMatch(/can be read two ways/);
  });

  it("asks for nothing when the language doesn't change", () => {
    const r = normalize(raw("eu-biscuit.txt").value);
    expect(relocalize(r, "en", "en", () => undefined)).toEqual({ result: r, missing: [] });
  });
});
