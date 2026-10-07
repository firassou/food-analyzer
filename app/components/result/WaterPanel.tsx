"use client";
import { WATER_LIMITS } from "../../lib/analysis/knowledge";
import { MINERAL_KEYS, type Water } from "../../lib/analysis/types";
import { ltr, useI18n } from "../../lib/i18n/I18nProvider";
import { Bar, cn, toneClasses } from "../ui";
import { SubLabel } from "./bits";
import { highlightMark, highlightTone } from "./tones";

/** the printed composition: pH on its scale, the mineral table, and what the values mean */
export default function WaterPanel({ water }: { water: Water }) {
  const { t, fmt } = useI18n();
  const w = t.results.water;
  const printed = MINERAL_KEYS.filter((k) => water.minerals[k] !== null);
  const largest = Math.max(1, ...printed.map((k) => water.minerals[k]!));
  const allStats: [string, string | null][] = [
    [w.ph, water.ph !== null ? fmt(water.ph) : null],
    [w.residue, water.dry_residue_mg_l !== null ? `${fmt(water.dry_residue_mg_l)} mg/L` : null],
    [w.hardness, water.hardness_mg_l !== null ? `${fmt(water.hardness_mg_l)} mg/L` : null],
  ];
  // only what is printed on the label
  const stats = allStats.filter((s): s is [string, string] => s[1] !== null);
  const { low, high } = WATER_LIMITS.ph;

  return (
    <div className="space-y-6">
      <dl className={cn("grid grid-cols-3 gap-2", stats.length === 0 && "hidden")}>
        {stats.map(([label, value]) => (
          <div key={label} className="rounded-2xl bg-mute-soft/70 p-3.5">
            <dt className="eyebrow text-ink-soft">{label}</dt>
            <dd className="font-display mt-1 text-xl leading-tight font-semibold tabular-nums">{ltr(value)}</dd>
          </div>
        ))}
      </dl>

      {water.ph !== null && (
        // the scale reads 0 → 14 left to right in every language
        <div dir="ltr" aria-hidden>
          <div className="relative h-3 rounded-full bg-mute-soft">
            <div className="absolute inset-y-0 rounded-full bg-good/35" style={{ left: `${(low / 14) * 100}%`, width: `${((high - low) / 14) * 100}%` }} />
            <div
              className="absolute top-1/2 size-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-4 border-sheet bg-accent shadow"
              style={{ left: `${(Math.min(14, Math.max(0, water.ph)) / 14) * 100}%` }}
            />
          </div>
          <div className="eyebrow mt-1.5 flex justify-between text-ink-soft tabular-nums">
            <span>0</span>
            <span>7</span>
            <span>14</span>
          </div>
        </div>
      )}

      {printed.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="eyebrow border-b border-rule text-ink-soft">
              <th className="pb-2 text-start font-medium">{w.mineral}</th>
              <th className="pb-2 text-end font-medium">{w.perLitre}</th>
            </tr>
          </thead>
          <tbody>
            {printed.map((k, i) => (
              <tr key={k} className="border-b border-rule/70 last:border-b-0">
                <td className="py-2.5">
                  <span className="font-medium">{w.minerals[k]}</span>
                  <div className="mt-1.5 max-w-56">
                    <Bar value={water.minerals[k]! / largest} tone="zinc" delay={i * 50} />
                  </div>
                </td>
                <td className="py-2.5 text-end align-top text-[13px] tabular-nums">{ltr(fmt(water.minerals[k]!))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {water.facts.length > 0 && (
        <div>
          <SubLabel>{w.meaning}</SubLabel>
          <p className="mb-4 text-xs leading-5 text-ink-soft">{w.advice}</p>
          <ul className="space-y-4">
            {water.facts.map((f) => (
              <li key={f.id} className="flex items-start gap-3 text-sm leading-6">
                <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold", toneClasses[highlightTone[f.tone]])}>
                  {highlightMark[f.tone]}
                </span>
                <span className="min-w-0">
                  <span dir="auto" className="block font-medium">
                    {f.text}
                  </span>
                  {f.tip && (
                    <span dir="auto" className="mt-0.5 block text-ink-soft">
                      {f.tip}
                    </span>
                  )}
                  {f.source && (
                    <span dir="auto" className="mt-1 block text-xs text-ink-soft/80">
                      {w.source} {f.source}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
