"use client";
import type { HistoryEntry } from "../lib/client/history";
import type { Level, LevelKey, Presence } from "../lib/analysis/types";
import { format, ltr, useI18n } from "../lib/i18n/I18nProvider";
import { ScanThumb, useScanName } from "./History";
import { cn, Dot, Notice, Tag, Tone, toneText } from "./ui";

const levelTone: Record<Level, Tone> = { low: "green", medium: "amber", high: "red" };
const presenceTone: Record<Presence, Tone> = { contains: "red", likely_contains: "amber", no_indication: "green", unclear: "zinc" };

// the four nutrients with a front-of-pack level: for these, lower is the one to note
const LEVEL_ROWS: { key: LevelKey; nutrient: "fat_g" | "saturated_fat_g" | "sugars_g" | "salt_g" }[] = [
  { key: "fat", nutrient: "fat_g" },
  { key: "saturated_fat", nutrient: "saturated_fat_g" },
  { key: "sugars", nutrient: "sugars_g" },
  { key: "salt", nutrient: "salt_g" },
];

/** two saved scans, row against row */
export default function Compare({ a, b, onBack }: { a: HistoryEntry; b: HistoryEntry; onBack: () => void }) {
  const { t, fmt } = useI18n();
  const c = t.compare;
  const nameOf = useScanName();
  const pair = [a, b] as const;
  const unitOf = (e: HistoryEntry) => (e.result.sugar.basis === "100ml" ? "ml" : "g");
  const sameBasis = a.result.sugar.basis === b.result.sugar.basis;

  const dash = <span className="text-ink-soft">—</span>;

  return (
    <div className="animate-fade-up">
      <button onClick={onBack} className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-full text-sm font-medium text-accent">
        <span aria-hidden className="inline-block rtl:-scale-x-100">
          ←
        </span>
        {c.back}
      </button>
      <article className="overflow-hidden rounded-[28px] border border-rule bg-sheet">
        <div className="border-t-[3px] border-ink px-5 pt-5 pb-6 sm:px-7">
          <h2 className="font-display text-2xl font-bold">{c.title}</h2>
          {!sameBasis && (
            <Notice tone="amber" className="mt-4">
              {c.differentBasis}
            </Notice>
          )}
          <table className="mt-4 w-full table-fixed">
            <thead>
              <tr className="border-b-2 border-ink align-bottom">
                <td />
                {pair.map((e) => (
                  <th key={e.id} scope="col" className="pe-2 pb-3 text-start font-normal last:pe-0">
                    <ScanThumb entry={e} className="size-14" />
                    <span dir="auto" className="font-display mt-2 block text-[15px] leading-tight font-semibold wrap-break-word">
                      {nameOf(e)}
                    </span>
                    <span className="eyebrow mt-1 block text-ink-soft">
                      {t.kinds[e.result.kind]}
                      {(e.result.nutrition?.estimated || e.result.ingredient_source === "estimated") && ` · ${c.estimated}`}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <Row a={a} b={b} label={c.energy}>
                {(e) => {
                  const kcal = e.result.nutrition?.per_100?.energy_kcal;
                  return kcal != null ? (
                    <span className="font-mono tabular-nums">
                      {ltr(`${fmt(kcal)} kcal`)}
                      <span className="block text-xs text-ink-soft">{format(c.per100, { unit: unitOf(e) })}</span>
                    </span>
                  ) : (
                    dash
                  );
                }}
              </Row>
              {LEVEL_ROWS.map(({ key, nutrient }) => (
                <Row a={a} b={b} key={key} label={t.results.nutrition.meters[key]}>
                  {(e, other) => {
                    const value = e.result.nutrition?.per_100?.[nutrient];
                    if (value == null) return dash;
                    const level = e.result.nutrition?.levels[key];
                    const rival = other.result.nutrition?.per_100?.[nutrient];
                    return (
                      <span>
                        <span className={cn("font-mono tabular-nums", level && toneText[levelTone[level]])}>{ltr(`${fmt(value)} g`)}</span>
                        {level && <span className="block text-xs text-ink-soft">{t.results.level[level]}</span>}
                        {/* only where the two are measured the same way */}
                        {sameBasis && rival != null && value < rival && (
                          <Tag tone="green" className="mt-1 px-1.5 py-0.5 text-xs">
                            {c.lower}
                          </Tag>
                        )}
                      </span>
                    );
                  }}
                </Row>
              ))}
              <Row a={a} b={b} label={c.additives}>
                {(e) =>
                  e.result.ingredients.length === 0 ? (
                    <span className="text-ink-soft">{c.unknown}</span>
                  ) : e.result.additives.length ? (
                    <span>
                      <span className="font-mono tabular-nums text-warn">{e.result.additives.length}</span>
                      <span dir="ltr" className="block text-xs text-ink-soft">
                        {e.result.additives
                          .map((x) => x.code)
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                  ) : (
                    <span className="text-good">{c.none}</span>
                  )
                }
              </Row>
              <Row a={a} b={b} label={c.allergens}>
                {(e) =>
                  e.result.allergens.length ? (
                    <span className="flex flex-wrap gap-1">
                      {e.result.allergens.map((x) => (
                        <Tag key={x.id} tone={x.presence === "contains" ? "red" : "amber"} className="px-1.5 py-0.5 text-xs">
                          {t.results.allergenNames[x.id]}
                        </Tag>
                      ))}
                    </span>
                  ) : (
                    <span className={e.result.ingredients.length ? "text-good" : "text-ink-soft"}>
                      {e.result.ingredients.length ? c.none : c.unknown}
                    </span>
                  )
                }
              </Row>
              <Row a={a} b={b} label={c.gluten}>
                {(e) =>
                  e.result.kind === "water" ? (
                    dash
                  ) : (
                    <span className={cn("inline-flex items-center gap-1.5", toneText[presenceTone[e.result.gluten.status]])}>
                      <Dot tone={presenceTone[e.result.gluten.status]} />
                      {t.results.presence[e.result.gluten.status]}
                    </span>
                  )
                }
              </Row>
            </tbody>
          </table>
        </div>
        <footer className="border-t border-rule px-5 py-5 text-xs leading-5 text-ink-soft sm:px-7">{t.results.disclaimer}</footer>
      </article>
    </div>
  );
}

/** one line of the comparison: the same question asked of each product */
function Row({
  a,
  b,
  label,
  children,
}: {
  a: HistoryEntry;
  b: HistoryEntry;
  label: string;
  children: (entry: HistoryEntry, other: HistoryEntry) => React.ReactNode;
}) {
  return (
    <tr className="border-b border-rule align-top">
      <th scope="row" className="eyebrow w-[26%] py-3 pe-2 text-start font-medium text-ink-soft">
        {label}
      </th>
      <td className="w-[37%] py-3 pe-2 text-sm">{children(a, b)}</td>
      <td className="w-[37%] py-3 text-sm">{children(b, a)}</td>
    </tr>
  );
}
