"use client";
import { useMemo, useState } from "react";
import { fold } from "../lib/analysis/knowledge";
import { clearHistory, removeScan, useHistory, type HistoryEntry } from "../lib/client/history";
import { useProfile } from "../lib/client/profile";
import { format, useI18n } from "../lib/i18n/I18nProvider";
import { dateLocale } from "../lib/i18n/locales";
import { scanStatus, ScanThumb, StatusPill, useScanName } from "./scans";
import { ArrowLeftIcon, CloseIcon, cn } from "./ui";

type Filter = "all" | "food" | "medicine" | "alerts";

/**
 * Text as a search compares it: Latin accents folded, and the Arabic variants a reader
 * doesn't type the same way every time (harakat, tatweel, alef forms, ta marbuta, alef maqsura)
 */
const searchable = (s: string) =>
  fold(s)
    .replace(/[\u064B-\u0652\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");

/**
 * Every saved scan, newest first: search by name or brand, filter by kind or by allergy
 * alerts (the scans the watchlist flagged, or that declare allergens), open one again,
 * remove it, or pick two to compare.
 */
export default function HistoryScreen({
  onBack,
  onOpen,
  onCompare,
}: {
  onBack: () => void;
  onOpen: (entry: HistoryEntry) => void;
  onCompare: (a: HistoryEntry, b: HistoryEntry) => void;
}) {
  const { t, locale } = useI18n();
  const h = t.history;
  const s = t.historyScreen;
  const entries = useHistory();
  const profile = useProfile();
  const nameOf = useScanName();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const dates = useMemo(() => new Intl.DateTimeFormat(dateLocale(locale), { day: "numeric", month: "short", year: "numeric" }), [locale]);

  const shown = entries.filter((e) => {
    if (filter === "food" && e.result.kind === "medicine") return false;
    if (filter === "medicine" && e.result.kind !== "medicine") return false;
    if (filter === "alerts") {
      const status = scanStatus(e, profile);
      if (status !== "avoid" && status !== "check" && status !== "contains") return false;
    }
    const q = searchable(query.trim());
    return !q || searchable(`${nameOf(e)} ${e.result.product.brand ?? ""} ${e.result.product.category ?? ""}`).includes(q);
  });
  const chosen = picked.map((id) => entries.find((e) => e.id === id)).filter((e): e is HistoryEntry => !!e);
  const toggle = (id: string) =>
    // a third pick replaces the older of the two
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id].slice(-2)));
  const stopPicking = () => {
    setPicking(false);
    setPicked([]);
  };

  return (
    <section aria-labelledby="history-title" className="animate-fade-up">
      <div className="flex items-center gap-2">
        <button
          onClick={onBack}
          aria-label={s.back}
          title={s.back}
          className="grid size-11 shrink-0 place-items-center rounded-control transition hover:bg-mute-soft"
        >
          <ArrowLeftIcon className="size-5 rtl:-scale-x-100" />
        </button>
        <h1 id="history-title" className="font-display flex-1 text-2xl font-semibold">
          {s.title}
        </h1>
        {entries.length > 0 &&
          (picking ?
            <button onClick={stopPicking} className="h-11 rounded-control px-4 text-sm font-medium text-ink-soft hover:bg-mute-soft hover:text-ink">
              {t.actions.cancel}
            </button>
          : <>
              {entries.length > 1 && (
                <button onClick={() => setPicking(true)} className="h-11 rounded-control bg-accent-soft px-4 text-sm font-semibold text-on-accent-soft transition hover:brightness-95">
                  {h.compare}
                </button>
              )}
              <button onClick={clearHistory} className="h-11 rounded-control px-3 text-sm font-medium text-ink-soft hover:bg-mute-soft hover:text-ink">
                {h.clear}
              </button>
            </>)}
      </div>

      {entries.length === 0 ?
        <p className="card mt-6 px-5 py-6 text-sm leading-6 text-ink-soft">{s.empty}</p>
      : <>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={s.search}
            aria-label={s.search}
            dir="auto"
            className="mt-5 h-12 w-full rounded-control bg-sheet px-4 text-base shadow-card ring-1 ring-rule placeholder:text-ink-soft focus-visible:outline-2 focus-visible:outline-accent"
          />
          <div role="group" aria-label={s.filterLabel} className="scrollbar-none -mx-4 mt-3 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            {(["all", "food", "medicine", "alerts"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  "h-11 shrink-0 rounded-control px-4 text-sm font-medium whitespace-nowrap transition",
                  filter === f ? "bg-ink text-paper" : "bg-sheet text-ink-soft ring-1 ring-rule hover:text-ink",
                )}
              >
                {s.filters[f]}
              </button>
            ))}
          </div>
          {picking && <p className="pt-4 text-sm text-ink-soft">{h.pick}</p>}

          {shown.length === 0 ?
            <p className="mt-6 text-sm text-ink-soft">{s.noMatch}</p>
          : <ul className="card mt-4 divide-y divide-rule overflow-hidden">
              {shown.map((entry) => {
                const name = nameOf(entry);
                const on = picked.includes(entry.id);
                const status = scanStatus(entry, profile);
                return (
                  <li key={entry.id} className="flex items-center gap-1 pe-1 transition hover:bg-mute-soft/60">
                    <button
                      onClick={() => (picking ? toggle(entry.id) : onOpen(entry))}
                      aria-label={picking ? undefined : format(h.open, { name })}
                      aria-pressed={picking ? on : undefined}
                      className="flex min-w-0 flex-1 items-center gap-3 p-3 text-start"
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
                      <ScanThumb entry={entry} className="size-14 rounded-xl" />
                      <span className="min-w-0 flex-1">
                        <span dir="auto" className="block truncate text-[15px] font-medium">
                          {name}
                        </span>
                        <span className="eyebrow mt-0.5 block text-ink-soft">
                          {t.kinds[entry.result.kind]} · {dates.format(entry.at)}
                        </span>
                        {status && (
                          <span className="mt-1.5 block">
                            <StatusPill status={status} />
                          </span>
                        )}
                      </span>
                    </button>
                    {!picking && (
                      <button
                        onClick={() => removeScan(entry.id)}
                        aria-label={format(h.remove, { name })}
                        title={format(h.remove, { name })}
                        className="grid size-11 shrink-0 place-items-center rounded-control text-ink-soft transition hover:bg-mute-soft hover:text-ink"
                      >
                        <CloseIcon className="size-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          }

          {picking && (
            <button
              disabled={chosen.length !== 2}
              onClick={() => {
                onCompare(chosen[0], chosen[1]);
                stopPicking();
              }}
              className="mt-4 h-12 w-full rounded-control bg-brand text-sm font-semibold text-on-accent transition active:scale-[0.99] disabled:opacity-35"
            >
              {h.compareNow}
            </button>
          )}
        </>
      }
    </section>
  );
}
