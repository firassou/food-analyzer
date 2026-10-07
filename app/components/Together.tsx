"use client";
import { checkTogether, type TogetherFinding } from "../lib/analysis/interactions";
import type { HistoryEntry } from "../lib/client/history";
import { format, useI18n } from "../lib/i18n/I18nProvider";
import { ScanThumb, useScanName } from "./History";
import { Notice } from "./ui";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** two saved medicines checked against each other: same substance, same family, known interactions */
export default function Together({ a, b, onBack }: { a: HistoryEntry; b: HistoryEntry; onBack: () => void }) {
  const { t } = useI18n();
  const c = t.together;
  const nameOf = useScanName();
  const check = checkTogether(a.result.medicine, b.result.medicine);

  const textOf = (f: TogetherFinding) => {
    const [x, y] = f.substances.map(capitalize);
    if (f.type === "duplicate") return f.paracetamol ? c.duplicateParacetamol : format(c.duplicate, { a: x });
    if (f.type === "same_family") return format(c.sameFamily, { a: x, b: y, family: c.families[f.family] });
    return format(c.interactions[f.id], { a: x, b: y });
  };

  return (
    <div className="animate-fade-up">
      <button onClick={onBack} className="mb-3 inline-flex h-11 items-center gap-1.5 rounded-full bg-mute-soft px-4 text-sm font-medium transition hover:bg-rule">
        <span aria-hidden className="inline-block rtl:-scale-x-100">
          ←
        </span>
        {t.compare.back}
      </button>
      <article className="overflow-hidden rounded-[28px] bg-sheet ring-1 ring-rule">
        <div className="px-5 pt-6 pb-6 sm:px-7">
          <h2 className="font-display text-2xl font-bold">{c.title}</h2>
          <p className="mt-1.5 text-sm leading-6 text-ink-soft">{c.lead}</p>

          <ul className="mt-5 grid grid-cols-2 gap-2">
            {[a, b].map((e) => (
              <li key={e.id} className="min-w-0 rounded-2xl bg-mute-soft/70 p-3.5">
                <ScanThumb entry={e} className="size-14" />
                <span dir="auto" className="font-display mt-2 block text-[15px] leading-tight font-semibold wrap-break-word">
                  {nameOf(e)}
                </span>
                {(e.result.medicine?.active.length ?? 0) > 0 && (
                  <span dir="auto" className="mt-1 block text-sm leading-5 wrap-break-word text-ink-soft">
                    {e.result.medicine!.active.map((s) => capitalize(s.name_local ?? s.name)).join(" + ")}
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-5 space-y-2">
            {!check.checked ? (
              <Notice tone="zinc">{c.unchecked}</Notice>
            ) : check.findings.length === 0 ? (
              <Notice tone="zinc">
                <span className="block font-semibold">{c.none}</span>
                {c.noneText}
              </Notice>
            ) : (
              check.findings.map((f, i) => (
                <Notice key={i} tone={f.severity === "avoid" ? "red" : "amber"}>
                  <span className="block font-semibold">{f.severity === "avoid" ? c.avoid : c.caution}</span>
                  <span dir="auto">{textOf(f)}</span>
                </Notice>
              ))
            )}
          </div>
        </div>
        <footer className="border-t border-rule/70 px-5 py-5 text-xs leading-5 text-ink-soft sm:px-7">{c.disclaimer}</footer>
      </article>
    </div>
  );
}
