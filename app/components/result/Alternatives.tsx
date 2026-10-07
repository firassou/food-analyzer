"use client";
import { useMemo } from "react";
import type { AlternativesResponse, Grade } from "../../lib/analysis/alternatives";
import { isEmptyProfile } from "../../lib/analysis/profile";
import { useProfile } from "../../lib/client/profile";
import { format, ltr, useI18n } from "../../lib/i18n/I18nProvider";
import { cn, toneClasses, type Tone } from "../ui";

const gradeTone: Record<Grade, Tone> = { a: "green", b: "green", c: "amber", d: "red", e: "red" };

const readable = (category: string) => category.replace(/^en:/, "").replace(/-/g, " ");

/**
 * Products of the same category with a better Nutri-Score, sold where the reader is, that don't
 * contain what they avoid. Only rendered when there is at least one. What is shown is only what the
 * open database says (name, brand, its Nutri-Score, sugars), and the category it matched is named.
 */
export default function Alternatives({
  data,
  unit,
  onOpen,
}: {
  data: Extract<AlternativesResponse, { ok: true }>;
  unit: "g" | "ml";
  onOpen: (code: string) => void;
}) {
  const { t, locale } = useI18n();
  const a = t.alternatives;
  const profile = useProfile();
  const country = useMemo(() => new Intl.DisplayNames(locale, { type: "region" }).of(data.country) ?? data.country, [locale, data.country]);
  return (
    <div>
      <p className="text-sm leading-6 text-ink-soft">
        {format(a.lead, { country })} <span dir="auto" className="font-medium text-ink">({readable(data.category)})</span>
        {!isEmptyProfile(profile) && ` ${a.fitsProfile}`}
      </p>
      <ul className="mt-4 space-y-2">
        {data.items.map((c) => (
          <li key={c.code}>
            <button onClick={() => onOpen(c.code)} className="flex w-full items-center gap-3 rounded-2xl bg-mute-soft/60 p-3 text-start transition hover:bg-mute-soft active:scale-[0.99]">
              <span aria-hidden className={cn("font-display grid size-10 shrink-0 place-items-center rounded-xl text-lg font-bold uppercase", toneClasses[gradeTone[c.grade]])}>
                {c.grade}
              </span>
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-[15px] font-medium">
                  {c.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-ink-soft">
                  {[c.brand, c.sugar !== null ? ltr(format(unit === "ml" ? a.sugarMl : a.sugar, { sugar: String(Math.round(c.sugar * 10) / 10) })) : null].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold text-accent">{a.open}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs leading-5 text-ink-soft">{a.source}</p>
    </div>
  );
}
