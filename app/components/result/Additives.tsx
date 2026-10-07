"use client";
import type { Additive } from "../../lib/analysis/types";
import { format, useI18n } from "../../lib/i18n/I18nProvider";
import { cn, SparkleIcon } from "../ui";
import { capitalize } from "./tones";

/** anchor id: coded additives are linked from ingredient pills; code-less ones get their index so ids stay unique */
export const additiveId = (a: Pick<Additive, "code" | "name">, index?: number) =>
  a.code ? `additive-${a.code.toLowerCase()}` : `additive-${index ?? 0}-${a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

/** what each additive is for, with a button that asks the AI about that one */
export function AdditiveList({
  additives,
  highlighted,
  onAsk,
}: {
  additives: Additive[];
  /** the id of the additive just jumped to from an ingredient */
  highlighted?: string;
  /** asks the AI about an additive; without it (a scan that can't be chatted about) the button is left out */
  onAsk?: (a: Additive) => void;
}) {
  const { t } = useI18n();
  return (
    <ul className="grid gap-3 md:grid-cols-2">
      {additives.map((a, i) => {
        const id = additiveId(a, i);
        const name = capitalize(a.name_local ?? a.name);
        return (
          <li
            key={id}
            id={id}
            className={cn(
              "flex scroll-mt-32 flex-col rounded-2xl bg-mute-soft/60 p-4 transition-shadow duration-500",
              highlighted === id && "ring-2 ring-accent",
            )}
          >
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
              {a.code && (
                <span dir="ltr" className="rounded-full bg-warn-soft px-2.5 py-0.5 text-xs font-semibold text-warn">
                  {a.code}
                </span>
              )}
              <span dir="auto" className="font-display text-base font-semibold">
                {name}
              </span>
            </div>
            {a.category && (
              <p dir="auto" className="eyebrow mt-1.5 text-ink-soft">
                {a.category}
              </p>
            )}
            {a.purpose && (
              <p dir="auto" className="mt-2.5 text-sm leading-6">
                <span className="font-medium">{t.results.additives.purpose}</span> {a.purpose}
              </p>
            )}
            {a.explanation && (
              <p dir="auto" className="mt-1 text-sm leading-6 text-ink-soft">
                {a.explanation}
              </p>
            )}
            {onAsk && (
              <button
                onClick={() => onAsk(a)}
                aria-label={format(t.ask.buttonFor, { name })}
                className="mt-3 inline-flex min-h-10 items-center gap-2 self-start rounded-full bg-accent-soft px-4 text-sm font-semibold text-on-accent-soft transition hover:brightness-95 active:scale-[0.97]"
              >
                <SparkleIcon className="size-4" />
                {t.ask.button}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
