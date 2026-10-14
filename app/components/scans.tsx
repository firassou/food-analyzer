"use client";
// What a saved scan looks like in a list: its name, its picture, and its short status.
import Image from "next/image";
import type { Profile } from "../lib/analysis/profile";
import { checkPerson } from "../lib/analysis/profiles";
import type { HistoryEntry } from "../lib/client/history";
import { useI18n } from "../lib/i18n/I18nProvider";
import { cn } from "./ui";

/** the name a scan goes by in lists */
export function useScanName() {
  const { t } = useI18n();
  return (e: HistoryEntry) => e.result.product.name ?? e.result.product.category ?? t.kinds[e.result.kind];
}

/** the photo of a saved scan, or a mark standing in for a barcode scan */
export function ScanThumb({ entry, className }: { entry: HistoryEntry; className?: string }) {
  return entry.thumb ? (
    <Image src={entry.thumb} alt="" width={96} height={96} unoptimized className={cn("shrink-0 rounded-2xl object-cover ring-1 ring-rule", className)} />
  ) : (
    <span aria-hidden className={cn("grid shrink-0 place-items-center rounded-2xl bg-mute-soft text-ink-soft", className)}>
      <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M5 6v12M9 6v12M12.5 6v12M16 6v12M19 6v12" />
      </svg>
    </span>
  );
}

export type ScanStatus = "avoid" | "check" | "ok" | "contains";

/** a scan's short status: the verdict for the watchlist and health conditions, else whether it declares allergens */
export function scanStatus(entry: HistoryEntry, profile: Profile): ScanStatus | null {
  const check = checkPerson(entry.result, profile);
  if (check && check.status !== "unchecked") return check.status;
  if (!check && entry.result.allergens.some((a) => a.presence === "contains")) return "contains";
  return null;
}

const pillTone: Record<ScanStatus, string> = {
  avoid: "bg-bad-soft text-bad",
  check: "bg-peach-soft text-on-peach",
  ok: "bg-good-soft text-good",
  contains: "bg-warn-soft text-warn",
};

export function StatusPill({ status }: { status: ScanStatus }) {
  const { t } = useI18n();
  return <span className={cn("shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold", pillTone[status])}>{t.historyScreen.status[status]}</span>;
}
