"use client";
import { motion } from "framer-motion";
import { RotatingSentence } from "./RotatingWord";
import { useMemo, useSyncExternalStore } from "react";
import { isEmptyProfile } from "../lib/analysis/profile";
import type { HistoryEntry } from "../lib/client/history";
import { useHistory } from "../lib/client/history";
import { type Mode, setMode } from "../lib/client/mode";
import { useProfile } from "../lib/client/profile";
import { format, useI18n } from "../lib/i18n/I18nProvider";
import { dateLocale } from "../lib/i18n/locales";
import { Stagger, usePress } from "../lib/motion";
import { scanStatus, ScanThumb, StatusPill, useScanName } from "./scans";
import {
  ArrowLeftIcon,
  BarcodeIcon,
  CameraIcon,
  ChevronIcon,
  ImageIcon,
  InfoIcon,
  Notice,
  PencilIcon,
  PillIcon,
  PlusIcon,
  ShelfIcon,
} from "./ui";

export interface HomeActions {
  onCamera: () => void;
  onUpload: () => void;
  onBarcode: () => void;
  onOpen: (entry: HistoryEntry) => void;
  onHistory: () => void;
  onShelf: () => void;
  onWatchlist: () => void;
}

/** the part of the day, on the device only: the server renders a plain greeting */
function useGreeting(): "morning" | "afternoon" | "evening" | "any" {
  return useSyncExternalStore(
    () => () => undefined,
    () => {
      const h = new Date().getHours();
      return h < 5 ? "evening" : h < 12 ? "morning" : h < 18 ? "afternoon" : "evening";
    },
    () => "any",
  );
}

/**
 * The first screen. Food mode leads with one obvious action (the camera), the reader's
 * watchlist and their latest scans; Medicine Mode is a quieter screen of its own.
 */
export default function Home({ mode, attention, error, ...actions }: HomeActions & { mode: Mode; attention: number; error: string | null }) {
  return mode === "medicine" ?
      <MedicineHome attention={attention} error={error} {...actions} />
    : <FoodHome attention={attention} error={error} {...actions} />;
}

function FoodHome({ attention, error, onCamera, onUpload, onBarcode, onOpen, onHistory, onShelf, onWatchlist }: HomeActions & { attention: number; error: string | null }) {
  const { t } = useI18n();
  const h = t.home;
  const greeting = useGreeting();
  const press = usePress();
  return (
    <section className="mx-auto max-w-2xl lg:grid lg:max-w-5xl lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-12">
      <Stagger>
        <p className="glass inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-medium text-ink-soft"><span aria-hidden className="size-1.5 rounded-full bg-accent shadow-[0_0_10px_2px] shadow-accent/60" />{h.greeting[greeting]}</p>
        <h1 className="font-display mt-3 bg-linear-to-br from-ink from-40% to-accent bg-clip-text text-[2.5rem] leading-[1.05] font-semibold tracking-[-0.035em] text-balance text-transparent sm:text-6xl rtl:leading-snug">{h.title}</h1>
        <RotatingSentence text={h.lead} template={h.leadRotating} things={h.leadThings} className="mt-4 max-w-md text-base leading-7 text-ink-soft" />

        <div className="mt-8">
          <motion.button
            {...press}
            onClick={onCamera}
            className="animate-breathe flex h-16 w-full items-center justify-center gap-3 rounded-control bg-brand px-6 text-lg font-semibold text-on-accent shadow-raised transition-[filter] hover:brightness-110 sm:w-auto sm:min-w-72"
          >
            <CameraIcon className="size-6" />
            {h.scan}
          </motion.button>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:gap-3">
            <SecondaryAction icon={<ImageIcon className="size-5" />} onClick={onUpload}>
              {h.upload}
            </SecondaryAction>
            <SecondaryAction icon={<BarcodeIcon className="size-5" />} onClick={onBarcode}>
              {h.barcode}
            </SecondaryAction>
          </div>
          {/* dropping and pasting need a mouse and a keyboard */}
          <p className="mt-4 hidden text-sm text-ink-soft lg:[@media(hover:hover)_and_(pointer:fine)]:block">
            {t.uploader.hint}{" "}
            <kbd dir="ltr" className="rounded-md bg-mute-soft px-1.5 py-0.5 font-mono text-xs">
              Ctrl V
            </kbd>
          </p>
        </div>

        {attention > 0 && <ShelfBanner count={attention} onClick={onShelf} />}
        {error && (
          <Notice tone="red" role="alert" className="mt-6">
            {error}
          </Notice>
        )}
      </Stagger>

      <Stagger className="mt-10 space-y-3 lg:mt-0">
        <Watchlist onEdit={onWatchlist} />
        <RecentScans onOpen={onOpen} onAll={onHistory} />
        <MedicineEntry />
      </Stagger>
    </section>
  );
}

function MedicineHome({ attention, error, onCamera, onUpload, onOpen, onHistory, onShelf }: HomeActions & { attention: number; error: string | null }) {
  const { t } = useI18n();
  const m = t.medicineHome;
  const medicines = useHistory().filter((e) => e.result.kind === "medicine");
  return (
    <section className="mx-auto max-w-2xl lg:grid lg:max-w-5xl lg:grid-cols-[1.1fr_1fr] lg:items-start lg:gap-12">
      <div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-lg bg-accent-soft px-2.5 py-1 text-sm font-semibold text-on-accent-soft">
            <PillIcon className="size-4" />
            {m.eyebrow}
          </span>
          <button
            onClick={() => setMode("food")}
            className="ms-auto inline-flex min-h-11 items-center gap-1.5 rounded-control px-3 text-sm font-medium text-ink-soft transition hover:bg-mute-soft hover:text-ink"
          >
            <ArrowLeftIcon className="size-4 rtl:-scale-x-100" />
            {m.back}
          </button>
        </div>
        <h1 className="font-display mt-5 text-[2.1rem] leading-tight font-semibold tracking-tight text-balance sm:text-5xl">{m.title}</h1>
        <p className="mt-3 max-w-md text-base leading-7 text-ink-soft">{m.lead}</p>

        <div className="mt-5 flex gap-3 rounded-card border border-accent/25 bg-accent-soft/60 px-4 py-3.5 text-sm leading-6 text-ink">
          <InfoIcon className="mt-0.5 size-5 shrink-0 text-accent" />
          <p>{m.disclaimer}</p>
        </div>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:gap-3">
          <button
            onClick={onCamera}
            className="flex h-14 items-center justify-center gap-3 rounded-control bg-brand px-6 text-base font-semibold text-on-accent transition hover:brightness-110 active:scale-[0.99]"
          >
            <CameraIcon className="size-6" />
            {m.scan}
          </button>
          <SecondaryAction icon={<ImageIcon className="size-5" />} onClick={onUpload}>
            {m.upload}
          </SecondaryAction>
        </div>
        {attention > 0 && <ShelfBanner count={attention} onClick={onShelf} />}
        {error && (
          <Notice tone="red" role="alert" className="mt-6">
            {error}
          </Notice>
        )}
      </div>

      <div className="mt-10 space-y-3 lg:mt-0">
        <div className="card card-lift px-5 py-5">
          <div className="flex items-center gap-2">
            <h2 className="font-display flex-1 text-lg font-semibold">{m.yours}</h2>
            {medicines.length > 0 && <SeeAll onClick={onHistory} />}
          </div>
          {medicines.length === 0 ?
            <p className="mt-2 text-sm leading-6 text-ink-soft">{m.empty}</p>
          : <ScanList entries={medicines.slice(0, 4)} onOpen={onOpen} />}
          {medicines.length > 1 && (
            <button
              onClick={onShelf}
              className="mt-3 flex min-h-11 w-full items-center gap-2 rounded-control bg-mute-soft px-4 text-start text-sm font-semibold transition hover:bg-rule"
            >
              <ShelfIcon className="size-5 shrink-0 text-accent" />
              <span className="flex-1">{m.together}</span>
              <ChevronIcon className="size-4 shrink-0 text-ink-soft rtl:-scale-x-100" />
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function SecondaryAction({ icon, onClick, children }: { icon: React.ReactNode; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      {...usePress()}
      onClick={onClick}
      className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-sheet px-4 text-sm font-semibold text-ink shadow-card ring-1 ring-rule transition-colors hover:bg-mute-soft sm:px-5"
    >
      <span className="text-accent">{icon}</span>
      {children}
    </motion.button>
  );
}

function SeeAll({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button onClick={onClick} className="inline-flex min-h-11 items-center gap-1 rounded-control px-2 text-sm font-medium text-accent hover:bg-accent-soft">
      {t.home.seeAll}
      <ChevronIcon className="size-4 rtl:-scale-x-100" />
    </button>
  );
}

function ShelfBanner({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      onClick={onClick}
      className="mt-6 flex w-full items-center gap-3 rounded-card bg-warn-soft px-4 py-3.5 text-start text-sm text-ink transition hover:brightness-95 active:scale-[0.99]"
    >
      <ShelfIcon className="size-5 shrink-0 text-warn" />
      <span className="min-w-0 flex-1 font-medium">{format(t.shelf.banner, { count })}</span>
      <span className="shrink-0 font-semibold text-warn">{t.shelf.bannerOpen}</span>
    </button>
  );
}

/** what the reader avoids, at a glance: it is what every verdict is about */
function Watchlist({ onEdit }: { onEdit: () => void }) {
  const { t } = useI18n();
  const h = t.home;
  const profile = useProfile();
  const empty = isEmptyProfile(profile);
  const items = [
    ...profile.allergens.map((id) => t.results.allergenNames[id]),
    ...(profile.lactose ? [t.profile.lactose] : []),
    ...(profile.sugar ? [t.profile.sugar] : []),
    ...profile.diets.map((d) => t.profile.diets[d]),
  ];
  return (
    <div className="card card-lift px-5 py-5">
      <div className="flex items-center gap-2">
        <h2 className="font-display flex-1 text-lg font-semibold">{h.watchlist}</h2>
        {!empty && (
          <button onClick={onEdit} className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium text-accent hover:bg-accent-soft">
            <PencilIcon className="size-4" />
            {h.watchlistEdit}
          </button>
        )}
      </div>
      {empty ?
        <>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{h.watchlistEmpty}</p>
          <button
            onClick={onEdit}
            className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-control bg-accent-soft px-4 text-sm font-semibold text-on-accent-soft transition hover:brightness-95"
          >
            <PlusIcon className="size-4" />
            {h.watchlistAdd}
          </button>
        </>
      : <>
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {items.map((item) => (
              <li key={item} className="rounded-lg bg-lime-soft px-2.5 py-1 text-sm font-medium text-on-lime">
                {item}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs leading-5 text-ink-soft">{h.watchlistSet}</p>
        </>
      }
    </div>
  );
}

function RecentScans({ onOpen, onAll }: { onOpen: (e: HistoryEntry) => void; onAll: () => void }) {
  const { t } = useI18n();
  const entries = useHistory();
  if (entries.length === 0) return null;
  return (
    <div className="card card-lift px-5 py-5">
      <div className="flex items-center gap-2">
        <h2 className="font-display flex-1 text-lg font-semibold">{t.home.recent}</h2>
        <SeeAll onClick={onAll} />
      </div>
      <ScanList entries={entries.slice(0, 3)} onOpen={onOpen} />
    </div>
  );
}

/** a few saved scans: thumbnail, name, kind and date, and the verdict for the reader's watchlist */
export function ScanList({ entries, onOpen }: { entries: HistoryEntry[]; onOpen: (e: HistoryEntry) => void }) {
  const { t, locale } = useI18n();
  const nameOf = useScanName();
  const profile = useProfile();
  const dates = useMemo(() => new Intl.DateTimeFormat(dateLocale(locale), { day: "numeric", month: "short" }), [locale]);
  return (
    <ul className="mt-2 -mx-2">
      {entries.map((entry) => {
        const name = nameOf(entry);
        const status = scanStatus(entry, profile);
        return (
          <li key={entry.id}>
            <button
              onClick={() => onOpen(entry)}
              aria-label={format(t.history.open, { name })}
              className="flex w-full items-center gap-3 rounded-control p-2 text-start transition hover:bg-mute-soft/70"
            >
              <ScanThumb entry={entry} className="size-12 rounded-xl" />
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-[15px] font-medium">
                  {name}
                </span>
                <span className="eyebrow mt-0.5 block text-ink-soft">
                  {t.kinds[entry.result.kind]} · {dates.format(entry.at)}
                </span>
              </span>
              {status && <StatusPill status={status} />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** the door to Medicine Mode, in its own colours: a different place, not a category */
function MedicineEntry() {
  const { t } = useI18n();
  const h = t.home;
  return (
    <div data-mode="medicine" className="card card-lift px-5 py-5">
      <div className="flex items-start gap-4">
        <span aria-hidden className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-on-accent-soft">
          <PillIcon className="size-6" />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold">{h.medicineTitle}</h2>
          <p className="mt-1 text-sm leading-6 text-ink-soft">{h.medicineText}</p>
          <button
            onClick={() => {
              setMode("medicine");
              window.scrollTo({ top: 0 });
            }}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-control bg-brand px-4 text-sm font-semibold text-on-accent transition hover:brightness-110"
          >
            {h.medicineOpen}
            <ChevronIcon className="size-4 rtl:-scale-x-100" />
          </button>
        </div>
      </div>
    </div>
  );
}
