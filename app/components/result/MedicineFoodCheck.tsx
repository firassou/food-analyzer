"use client";
import { checkShelf } from "../../lib/analysis/cabinet";
import { checkFoodWithMedicines } from "../../lib/analysis/foodMedicine";
import type { LabelAnalysis } from "../../lib/analysis/types";
import { useHistory } from "../../lib/client/history";
import { format, ltr, useI18n } from "../../lib/i18n/I18nProvider";
import { useScanName } from "../History";
import { cn, Dot, PillIcon, toneClasses } from "../ui";

/**
 * This product against the medicines the reader has scanned. Absent unless something stands out:
 * the app's list is short, so "nothing" is never shown as good news (the disclaimer says so).
 */
export default function MedicineFoodCheck({ result }: { result: LabelAnalysis }) {
  const { t } = useI18n();
  const entries = useHistory();
  const nameOf = useScanName();
  const shelf = checkShelf(entries).medicines.map((e) => ({ name: nameOf(e), medicine: e.result.medicine }));
  const { findings } = checkFoodWithMedicines(result, shelf);
  if (findings.length === 0) return null;
  const c = t.foodMedicine;
  const worst = findings.some((f) => f.severity === "avoid");
  return (
    <div className={cn("mt-3 rounded-3xl px-5 py-4", toneClasses[worst ? "red" : "amber"])}>
      <p className="eyebrow flex items-center gap-1.5 rtl:tracking-normal">
        <PillIcon className="size-4" />
        {c.title}
      </p>
      <p className="font-display mt-1 text-lg leading-tight font-bold rtl:leading-7">{worst ? c.avoid : c.caution}</p>
      <p className="mt-1 text-sm leading-6 opacity-90">{c.lead}</p>
      <ul className="mt-3 space-y-3">
        {findings.map((f) => (
          <li key={`${f.id}:${f.medicine}`} className="flex gap-2.5 text-sm leading-6">
            <Dot tone={f.severity === "avoid" ? "red" : "amber"} className="mt-2 shrink-0" />
            <span className="min-w-0">
              <span dir="auto" className="block font-semibold wrap-break-word">
                {f.medicine} <span className="font-normal">· {f.severity === "avoid" ? c.avoid : c.caution}</span>
              </span>
              <span dir="auto" className="block wrap-break-word opacity-90">
                {format(c.rules[f.id], { substance: ltr(f.substance) })}
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-6">{c.disclaimer}</p>
    </div>
  );
}
