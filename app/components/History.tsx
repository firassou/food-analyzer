"use client";
import Image from "next/image";
import { useMemo, useState } from "react";
import { clearHistory, removeScan, useHistory, type HistoryEntry } from "../lib/client/history";
import { format, useI18n } from "../lib/i18n/I18nProvider";
import { dateLocale } from "../lib/i18n/locales";
import { CloseIcon, cn } from "./ui";

/** the name a scan goes by in lists */
export function useScanName() {
  const { t } = useI18n();
  return (e: HistoryEntry) => e.result.product.name ?? e.result.product.category ?? t.results.fallbackName;
}

/** the photo of a saved scan, or a mark standing in for a barcode scan */
export function ScanThumb({ entry, className }: { entry: HistoryEntry; className?: string }) {
  return entry.thumb ? (
    <Image src={entry.thumb} alt="" width={96} height={96} unoptimized className={cn("shrink-0 rounded-xl border border-rule object-cover", className)} />
  ) : (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-xl border border-rule bg-mute-soft text-ink-soft", className)}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 6v12M9 6v12M12.5 6v12M16 6v12M19 6v12" />
      </svg>
    </span>
  );
}

/**
 * Saved scans on the home screen: open one again, remove it, or pick two to compare.
 * Renders nothing until there is something to show.
 */
export default function History({
  onOpen,
  onCompare,
}: {
  onOpen: (entry: HistoryEntry) => void;
  onCompare: (a: HistoryEntry, b: HistoryEntry) => void;
}) {
  const { t, locale } = useI18n();
  const entries = useHistory();
  const nameOf = useScanName();
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const dates = useMemo(() => new Intl.DateTimeFormat(dateLocale(locale), { day: "numeric", month: "short" }), [locale]);

  if (entries.length === 0) return null;
  const h = t.history;
  const chosen = picked.map((id) => entries.find((e) => e.id === id)).filter((e): e is HistoryEntry => !!e);

  const toggle = (id: string) =>
    // a third pick replaces the older of the two
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));
  const stopPicking = () => {
    setPicking(false);
    setPicked([]);
  };

  return (
    <section aria-label={h.title} className="mt-10">
      <div className="flex items-center gap-2 border-b-[3px] border-ink pb-2">
        <h2 className="font-display flex-1 text-lg font-semibold">{h.title}</h2>
        {picking ? (
          <button onClick={stopPicking} className="eyebrow h-9 rounded-full px-3 text-ink-soft hover:text-ink">
            {t.actions.cancel}
          </button>
        ) : (
          <>
            {entries.length > 1 && (
              <button onClick={() => setPicking(true)} className="eyebrow h-9 rounded-full border border-rule px-3 text-accent transition hover:border-accent">
                {h.compare}
              </button>
            )}
            <button onClick={clearHistory} className="eyebrow h-9 rounded-full px-3 text-ink-soft hover:text-ink">
              {h.clear}
            </button>
          </>
        )}
      </div>
      {picking && <p className="pt-3 text-sm text-ink-soft">{h.pick}</p>}

      <ul>
        {entries.map((entry) => {
          const name = nameOf(entry);
          const on = picked.includes(entry.id);
          return (
            <li key={entry.id} className="flex items-center gap-1 border-b border-rule">
              <button
                onClick={() => (picking ? toggle(entry.id) : onOpen(entry))}
                aria-label={picking ? undefined : format(h.open, { name })}
                aria-pressed={picking ? on : undefined}
                className="flex min-w-0 flex-1 items-center gap-3 py-3 text-start"
              >
                {picking && (
                  <span
                    aria-hidden
                    className={cn(
                      "grid size-6 shrink-0 place-items-center rounded-md border-2 text-xs font-bold transition-colors",
                      on ? "border-accent bg-accent text-on-accent" : "border-rule",
                    )}
                  >
                    {on && "✓"}
                  </span>
                )}
                <ScanThumb entry={entry} className="size-12" />
                <span className="min-w-0 flex-1">
                  <span dir="auto" className="block truncate text-[15px] font-medium">
                    {name}
                  </span>
                  <span className="eyebrow mt-0.5 block text-ink-soft">
                    {t.kinds[entry.result.kind]} · {dates.format(entry.at)}
                  </span>
                </span>
              </button>
              {!picking && (
                <button
                  onClick={() => removeScan(entry.id)}
                  aria-label={format(h.remove, { name })}
                  title={format(h.remove, { name })}
                  className="grid size-11 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-mute-soft hover:text-ink"
                >
                  <CloseIcon className="size-4" />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {picking && (
        <button
          disabled={chosen.length !== 2}
          onClick={() => {
            onCompare(chosen[0], chosen[1]);
            stopPicking();
          }}
          className="mt-4 h-12 w-full rounded-full bg-ink text-sm font-semibold text-paper transition active:scale-[0.99] disabled:opacity-35"
        >
          {h.compareNow}
        </button>
      )}
    </section>
  );
}
