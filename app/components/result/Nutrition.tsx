"use client";
import { glutenLikelihood, LEVEL_THRESHOLDS } from "../../lib/analysis/knowledge";
import type { Confidence, LabelAnalysis, Level, NutrientKey, Nutrients, Presence } from "../../lib/analysis/types";
import { format, ltr, useI18n } from "../../lib/i18n/I18nProvider";
import { Bar, cn, Dot, Notice, Tag, toneText } from "../ui";
import { levelTone, presenceTone } from "./tones";

// labels come from the dictionary (results.nutrition.rows / .meters)
const tableRows: {
  key: Exclude<NutrientKey, "energy_kj" | "energy_kcal"> | "energy";
  sub?: boolean;
  unit: string;
}[] = [
  { key: "energy", unit: "" },
  { key: "fat_g", unit: "g" },
  { key: "saturated_fat_g", sub: true, unit: "g" },
  { key: "carbohydrates_g", unit: "g" },
  { key: "sugars_g", sub: true, unit: "g" },
  { key: "fiber_g", unit: "g" },
  { key: "protein_g", unit: "g" },
  { key: "salt_g", unit: "g" },
  { key: "sodium_mg", unit: "mg" },
];

const meters = [
  { key: "fat", nutrient: "fat_g" },
  { key: "saturated_fat", nutrient: "saturated_fat_g" },
  { key: "sugars", nutrient: "sugars_g" },
  { key: "salt", nutrient: "salt_g" },
] as const;

/** one sugar cube, in grams */
export const SUGAR_CUBE_G = 4;

function cellValue(n: Nutrients | null, key: NutrientKey | "energy", unit: string, fmt: (n: number) => string): string | null {
  if (!n) return null;
  if (key === "energy") {
    const parts = [n.energy_kj !== null && `${fmt(n.energy_kj)} kJ`, n.energy_kcal !== null && `${fmt(n.energy_kcal)} kcal`].filter(
      Boolean,
    );
    return parts.length ? parts.join(" / ") : null;
  }
  const v = n[key];
  return v === null ? null : `${fmt(v)} ${unit}`;
}

/** the traffic-light meters and the printed table */
export function NutritionPanel({ result }: { result: LabelAnalysis }) {
  const { t, fmt } = useI18n();
  const r = t.results;
  const { nutrition, sugar, kind } = result;
  const unit = sugar.basis === "100ml" ? "ml" : "g";
  return (
    <>
      {nutrition?.per_100 && meters.some((m) => nutrition.per_100![m.nutrient] !== null) && (
        // only the nutrients that are printed; they share the row whatever their number
        <div className="mb-6 flex flex-wrap gap-2">
          {meters
            .filter((m) => nutrition.per_100![m.nutrient] !== null)
            .map((m, i) => (
              <LevelMeter
                key={m.key}
                label={r.nutrition.meters[m.key]}
                value={nutrition.per_100![m.nutrient]}
                level={nutrition.levels[m.key]}
                threshold={LEVEL_THRESHOLDS[nutrition.basis][m.key]}
                delay={i}
              />
            ))}
        </div>
      )}

      {nutrition && (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="eyebrow border-b border-rule text-ink-soft">
                <th className="pb-2 text-start font-medium">{r.nutrition.nutrient}</th>
                {nutrition.per_100 && (
                  <th className="pb-2 text-end font-medium">
                    {format(r.nutrition.per100, { unit })}
                    {nutrition.per_100_calculated && (
                      <span className="block text-[10px] font-normal" title={r.nutrition.calculatedHint}>
                        {r.nutrition.calculated}
                      </span>
                    )}
                  </th>
                )}
                {nutrition.per_serving && <th className="pb-2 ps-4 text-end font-medium">{r.nutrition.perServing}</th>}
              </tr>
            </thead>
            <tbody>
              {tableRows.map((row) => {
                const a = cellValue(nutrition.per_100, row.key, row.unit, fmt);
                const b = cellValue(nutrition.per_serving, row.key, row.unit, fmt);
                if (!a && !b) return null;
                return (
                  <tr key={row.key} className="border-b border-rule/70 last:border-b-0">
                    <td className={cn("py-2.5", row.sub ? "ps-4 text-ink-soft" : "font-medium")}>{r.nutrition.rows[row.key]}</td>
                    {nutrition.per_100 && <td className="py-2.5 text-end text-[13px] tabular-nums">{a ? ltr(a) : "—"}</td>}
                    {nutrition.per_serving && <td className="py-2.5 ps-4 text-end text-[13px] tabular-nums">{b ? ltr(b) : "—"}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {sugar.explanation && kind !== "drink" && (
        <Notice tone={levelTone[sugar.level]} className="mt-5">
          {sugar.level !== "unknown" && <span className="font-semibold">{r.nutrition.sugarLevel[sugar.level]} </span>}
          <span dir="auto">{sugar.explanation}</span>
        </Notice>
      )}
    </>
  );
}

function LevelMeter({
  label,
  value,
  level,
  threshold,
  delay,
}: {
  label: string;
  value: number | null;
  level: Level | null;
  threshold: { low: number; high: number };
  delay: number;
}) {
  const { t, fmt } = useI18n();
  const tone = levelTone[level ?? "unknown"];
  return (
    <div
      className="min-w-[calc(50%-0.25rem)] flex-1 rounded-2xl bg-mute-soft/70 p-3.5"
      title={format(t.results.nutrition.thresholds, { low: fmt(threshold.low), high: fmt(threshold.high) })}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow text-ink-soft">{label}</span>
        <span className={cn("eyebrow font-semibold", toneText[tone])}>
          {level ? t.results.level[level] : t.results.nutrition.notAvailable}
        </span>
      </div>
      <p className="font-display mt-1 mb-2.5 text-xl font-semibold tabular-nums">{value !== null ? ltr(`${fmt(value)} g`) : "—"}</p>
      <Bar value={value == null ? 0 : value / (threshold.high * 1.4)} tone={tone} delay={150 + delay * 80} />
    </div>
  );
}

/** the gluten verdict, how likely it is, and the evidence behind it */
export function GlutenPanel({ status, confidence, evidence }: { status: Presence; confidence: Confidence; evidence: string[] }) {
  const { t, fmt } = useI18n();
  const d = t.results.dietary;
  const tone = presenceTone[status];
  const likelihood = glutenLikelihood(status, confidence);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="eyebrow text-ink-soft">{d.likelihood}</p>
          <p className={cn("font-display mt-1 text-5xl leading-none font-bold tabular-nums", tone !== "zinc" && toneText[tone])}>
            {likelihood !== null ? ltr(`${fmt(Math.round(likelihood * 100))} %`) : d.unknown}
          </p>
        </div>
        <Tag tone={tone}>
          <Dot tone={tone} />
          {t.results.presence[status]}
        </Tag>
      </div>
      <div className="mt-5">
        <Bar value={likelihood ?? 0} tone={tone} />
        <div dir="ltr" aria-hidden className="eyebrow mt-1.5 flex justify-between text-ink-soft tabular-nums rtl:flex-row-reverse">
          <span>0 %</span>
          <span>100 %</span>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-soft">
        {d.confidence}: <span className="font-medium text-ink">{d.confidenceLevel[confidence]}</span> · {d.likelihoodHint}
      </p>
      {evidence.length > 0 ?
        <ul className="mt-3 space-y-1 text-sm leading-6 text-ink-soft">
          {evidence.map((e, i) => (
            <li key={i} dir="auto" className="flex gap-2">
              <span aria-hidden>–</span>
              {e}
            </li>
          ))}
        </ul>
      : <p className="mt-3 text-sm leading-6 text-ink-soft">
          {status === "unclear" ? t.results.dietary.unclear : t.results.dietary.noEvidence}
        </p>
      }
    </div>
  );
}
