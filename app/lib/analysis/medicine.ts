// Completing a medicine whose excipients weren't on the photo: from an official
// database entry (server) or from a second photo of the composition (client).
// Pure and client-safe. Everything goes back through normalize(), so the excipient
// notes and the gluten check are computed the same way as for a single photo.

import type { Locale } from "../i18n/locales";
import { analysisMessages } from "./messages";
import { normalize, type NormalizeOptions } from "./normalize";
import type { LabelAnalysis } from "./types";

/** a medicine that was identified but whose composition isn't in view */
export function needsExcipients(r: LabelAnalysis): boolean {
  return r.kind === "medicine" && (r.ingredients.length === 0 || r.ingredient_source !== "label");
}

/**
 * The medicine in `result` with the given excipient list. What was read on the first
 * photo (name, substance, pen marks, general information) is kept as it is.
 */
export function withExcipients(
  result: LabelAnalysis,
  excipients: { ingredients: unknown; raw_text: string | null },
  locale: Locale,
  database?: NormalizeOptions["database"],
): LabelAnalysis {
  const completed = normalize(
    {
      label_detected: true,
      kind: "medicine",
      image_quality: result.image_quality,
      language: result.language,
      product: result.product,
      ingredients: excipients.ingredients,
      // a baseline the rules can only raise: the list is complete now
      gluten: { status: "no_indication", confidence: "medium", evidence: [] },
      lactose: { status: "no_indication", evidence: [] },
      medicine: result.medicine,
      summary: result.summary,
      highlights: result.highlights,
      claims: result.claims,
      certifications: result.certifications,
      dates: result.dates,
      storage: result.storage,
      manufacturer: result.manufacturer,
      origin: result.origin,
      raw_text: [result.raw_text, excipients.raw_text].filter(Boolean).join("\n") || null,
    },
    { locale, database },
  );
  // the new list answers these; every other warning of the first reading still stands
  const w = analysisMessages(locale).warnings;
  const answered = new Set([w.medicineNoExcipients, w.estimatedProduct]);
  const stale = (warning: string) => answered.has(warning) || (result.database && warning.includes(result.database.product));
  for (const warning of result.warnings)
    if (!stale(warning) && !completed.warnings.includes(warning)) completed.warnings.push(warning);
  return completed;
}

/**
 * Adds the excipients read on a second photo (the composition side of the box, or the
 * leaflet) to a medicine. Null when that photo shows no excipient list.
 */
export function addExcipientPhoto(result: LabelAnalysis, photo: LabelAnalysis, locale: Locale): LabelAnalysis | null {
  if (photo.ingredients.length === 0 || photo.ingredient_source !== "label") return null;
  return withExcipients(
    {
      ...result,
      // the second photo may show what the first one lacked
      medicine: result.medicine && {
        ...result.medicine,
        form: result.medicine.form ?? photo.medicine?.form ?? null,
        active: result.medicine.active.length ? result.medicine.active : (photo.medicine?.active ?? []),
        marks: result.medicine.marks ?? photo.medicine?.marks ?? null,
      },
    },
    {
      ingredients: photo.ingredients.map((i) => ({ name: i.name, name_en: i.name_en, name_local: i.name_local, e_number: i.e_number })),
      raw_text: photo.raw_text,
    },
    locale,
  );
}
