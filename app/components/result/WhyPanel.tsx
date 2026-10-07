"use client";
import type { LabelAnalysis } from "../../lib/analysis/types";
import { useI18n } from "../../lib/i18n/I18nProvider";
import { ChevronIcon, InfoIcon } from "../ui";
import { capitalize } from "./tones";

/**
 * The reasons behind the tiles, in the label's own terms: the gluten evidence, where each
 * allergen came from, why the sugar level is what it is, what each additive is for. Nothing is
 * new here (it is all in the result already); this gathers it under one question so a verdict
 * can be checked in a few seconds, and a wrong one can be spotted.
 */
export default function WhyPanel({ result }: { result: LabelAnalysis }) {
  const { t } = useI18n();
  const r = t.results;
  const w = t.why;
  const groups: { title: string; lines: string[] }[] = [];

  if (result.gluten.status !== "unclear" && result.gluten.evidence.length > 0) {
    groups.push({ title: `${r.tiles.gluten} · ${r.presence[result.gluten.status]}`, lines: result.gluten.evidence });
  }
  const allergens = result.allergens.filter((a) => a.sources.length > 0);
  if (allergens.length > 0) {
    groups.push({
      title: r.sections.allergens,
      lines: allergens.map((a) => `${r.allergenNames[a.id] ?? a.name}: ${a.sources.join(", ")}`),
    });
  }
  if (result.sugar.explanation && result.kind !== "medicine") groups.push({ title: r.tiles.sugar, lines: [result.sugar.explanation] });
  const additives = result.additives.filter((a) => a.purpose || a.explanation);
  if (additives.length > 0) {
    groups.push({
      title: r.tiles.additives,
      lines: additives.map(
        (a) => `${[a.code, capitalize(a.name_local ?? a.name)].filter(Boolean).join(" ")}: ${a.purpose ?? a.explanation}`,
      ),
    });
  }
  if (groups.length === 0) return null;

  return (
    <details className="group rounded-3xl bg-sheet ring-1 ring-rule">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-5 py-3 select-none sm:px-7 [&::-webkit-details-marker]:hidden">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-on-accent-soft">
          <InfoIcon className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="font-display block text-base font-semibold">{w.title}</span>
          <span className="block text-xs leading-4 text-ink-soft">{w.lead}</span>
        </span>
        <ChevronIcon className="size-5 shrink-0 text-ink-soft transition-transform group-open:rotate-90 rtl:-scale-x-100 rtl:group-open:-rotate-90" />
      </summary>
      <div className="space-y-5 px-5 pt-1 pb-5 sm:px-7">
        {groups.map((g) => (
          <div key={g.title}>
            <p className="eyebrow mb-2 font-semibold text-ink-soft">{g.title}</p>
            <ul className="space-y-1.5">
              {g.lines.map((line, i) => (
                <li key={i} dir="auto" className="flex gap-2.5 text-sm leading-6">
                  <span aria-hidden className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0 wrap-break-word">{line}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </details>
  );
}
