"use client";
import { useMemo, useState } from "react";
import { checkShelf, datedEntries } from "../lib/analysis/cabinet";
import { type Course, coursesOf } from "../lib/analysis/course";
import type { Expiry } from "../lib/analysis/expiry";
import { loadShelfChat, saveShelfChat, useHistory, type HistoryEntry } from "../lib/client/history";
import { disableReminders, enableReminders, useReminderState } from "../lib/client/reminders";
import { format, useI18n } from "../lib/i18n/I18nProvider";
import { dateLocale } from "../lib/i18n/locales";
import AskAi from "./AskAi";
import { ScanThumb, useScanName } from "./History";
import { togetherText } from "./Together";
import { ArrowLeftIcon, BellIcon, cn, Notice, PillIcon, Section, ShelfIcon, SparkleIcon, toneClasses, type Tone } from "./ui";

const statusTone: Record<Expiry["status"], Tone> = { expired: "red", soon: "amber", later: "zinc" };

/** "My shelf": every saved scan's date, every medicine checked against every other, and a chat about the medicines */
export default function Shelf({ onBack, onOpen }: { onBack: () => void; onOpen: (entry: HistoryEntry) => void }) {
  const { t, locale } = useI18n();
  const s = t.shelf;
  const entries = useHistory();
  const nameOf = useScanName();
  const [now] = useState(() => new Date());
  const dated = useMemo(() => datedEntries(entries, now), [entries, now]);
  const shelf = useMemo(() => checkShelf(entries), [entries]);
  const courses = useMemo(() => coursesOf(shelf.medicines, now), [shelf, now]);
  const [initialChat] = useState(loadShelfChat);

  const month = useMemo(() => new Intl.DateTimeFormat(dateLocale(locale), { month: "long", year: "numeric" }), [locale]);
  const day = useMemo(() => new Intl.DateTimeFormat(dateLocale(locale), { day: "numeric", month: "short", year: "numeric" }), [locale]);

  const whenText = (e: Expiry) =>
    e.status === "expired" ? s.expired
    : e.days === 0 ? s.today
    : e.days === 1 ? s.tomorrow
    : e.status === "soon" ? format(s.daysLeft, { count: e.days })
    : format(s.until, { date: (e.precision === "month" ? month : day).format(e.end) });

  return (
    <div className="animate-fade-up space-y-3">
      <button
        onClick={onBack}
        className="inline-flex h-11 items-center gap-1.5 rounded-full bg-mute-soft px-4 text-sm font-medium transition hover:bg-rule"
      >
        <ArrowLeftIcon className="size-4 rtl:-scale-x-100" />
        {t.compare.back}
      </button>

      <div className="rounded-[28px] bg-sheet px-5 py-6 ring-1 ring-rule sm:px-7">
        <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-accent-soft text-on-accent-soft">
          <ShelfIcon className="size-6" />
        </span>
        <h2 className="font-display mt-4 text-3xl leading-tight font-bold">{s.title}</h2>
        <p className="mt-1.5 text-sm leading-6 text-ink-soft">{s.lead}</p>
        {entries.length === 0 && <p className="mt-4 text-sm leading-6 text-ink-soft">{s.empty}</p>}
      </div>

      {entries.length > 0 && (
        <>
          <Section title={s.dates} icon={<BellIcon />}>
            {dated.length === 0 ?
              <p className="text-sm leading-6 text-ink-soft">{s.datesEmpty}</p>
            : <ul className="space-y-1">
                {dated.map(({ entry, expiry }) => (
                  <DateRow key={entry.id} entry={entry} expiry={expiry} name={nameOf(entry)} when={whenText(expiry)} onOpen={onOpen} />
                ))}
              </ul>
            }
            <Reminders />
          </Section>

          {courses.length > 0 && (
            <Section title={s.courses} icon={<PillIcon />}>
              <ul className="space-y-1">
                {courses.map((course) => (
                  <CourseRow key={course.entry.id} course={course} name={nameOf(course.entry)} onOpen={onOpen} />
                ))}
              </ul>
              <p className="mt-3 text-xs leading-5 text-ink-soft rtl:leading-6">{s.coursesNote}</p>
            </Section>
          )}

          <Section title={s.medicines} icon={<PillIcon />} aside={shelf.compared > 0 && format(s.compared, { count: shelf.compared })}>
            {shelf.medicines.length < 2 ?
              <p className="text-sm leading-6 text-ink-soft">{s.medicinesNone}</p>
            : shelf.pairs.length === 0 ?
              <Notice tone="green">{format(s.nothing, { count: shelf.medicines.length })}</Notice>
            : <ul className="space-y-3">
                {shelf.pairs.map((pair) => (
                  <li key={`${pair.a.id}-${pair.b.id}`} className="rounded-2xl bg-mute-soft/60 p-4">
                    <p dir="auto" className="font-display text-base font-semibold">
                      {nameOf(pair.a)}{" "}
                      <span aria-hidden className="text-ink-soft">
                        +
                      </span>{" "}
                      {nameOf(pair.b)}
                    </p>
                    <div className="mt-2.5 space-y-2">
                      {pair.findings.map((f, i) => (
                        <Notice key={i} tone={f.severity === "avoid" ? "red" : "amber"}>
                          <span className="block font-semibold">{f.severity === "avoid" ? t.together.avoid : t.together.caution}</span>
                          <span dir="auto">{togetherText(f, t.together)}</span>
                        </Notice>
                      ))}
                    </div>
                  </li>
                ))}
              </ul>
            }
            {shelf.unread > 0 && <p className="mt-3 text-xs leading-5 text-ink-soft">{format(s.unread, { count: shelf.unread })}</p>}
            {shelf.medicines.length >= 2 && <p className="mt-3 text-xs leading-5 text-ink-soft">{t.together.disclaimer}</p>}
          </Section>

          {shelf.medicines.length > 0 && (
            <Section title={s.ask} icon={<SparkleIcon />}>
              <AskAi scanId="shelf" cabinet={shelf.medicines.map((m) => m.result)} initialChat={initialChat} persist={saveShelfChat} />
            </Section>
          )}
        </>
      )}
    </div>
  );
}

/** a medicine whose pharmacist's note gave a duration: how long it still runs, counted from the scan */
function CourseRow({ course, name, onOpen }: { course: Course<HistoryEntry>; name: string; onOpen: (e: HistoryEntry) => void }) {
  const { t } = useI18n();
  const s = t.shelf;
  const tone = course.status === "finished" ? "zinc" : course.left <= 1 ? "amber" : "green";
  const when =
    course.status === "finished" ? s.finished
    : course.status === "last_day" ? s.lastDay
    : course.left === 1 ? s.oneDayLeft
    : course.left === 2 ? s.leftTwo
    : course.left <= 10 ? format(s.leftFew, { count: course.left })
    : format(s.leftMany, { count: course.left });
  return (
    <li>
      <button
        onClick={() => onOpen(course.entry)}
        className="flex w-full items-center gap-3 rounded-2xl p-2 text-start transition hover:bg-mute-soft/70"
      >
        <ScanThumb entry={course.entry} className="size-12" />
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-[15px] font-medium">
            {name}
          </span>
          <span className="eyebrow mt-0.5 block text-ink-soft rtl:leading-5 rtl:tracking-normal">
            <span dir="auto">{course.raw}</span>
            {course.perDay > 0 && <> · {format(s.perDay, { count: course.perDay })}</>}
          </span>
        </span>
        <span className={cn("shrink-0 rounded-full px-3 py-1 text-xs font-semibold", tone === "zinc" ? "bg-mute-soft text-ink-soft" : toneClasses[tone])}>{when}</span>
      </button>
    </li>
  );
}

function DateRow({
  entry,
  expiry,
  name,
  when,
  onOpen,
}: {
  entry: HistoryEntry;
  expiry: Expiry;
  name: string;
  when: string;
  onOpen: (e: HistoryEntry) => void;
}) {
  const { t } = useI18n();
  const tone = statusTone[expiry.status];
  return (
    <li>
      <button
        onClick={() => onOpen(entry)}
        className="flex w-full items-center gap-3 rounded-2xl p-2 text-start transition hover:bg-mute-soft/70"
      >
        <ScanThumb entry={entry} className="size-12" />
        <span className="min-w-0 flex-1">
          <span dir="auto" className="block truncate text-[15px] font-medium">
            {name}
          </span>
          <span className="eyebrow mt-0.5 block text-ink-soft">
            {expiry.kind === "expiration" ? t.shelf.expires : t.shelf.bestBefore} · <span dir="auto">{expiry.raw}</span>
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1 text-xs font-semibold",
            tone === "zinc" ? "bg-mute-soft text-ink-soft" : toneClasses[tone],
          )}
        >
          {when}
        </span>
      </button>
    </li>
  );
}

/** opt-in notification when the app is opened with something expired or about to be */
function Reminders() {
  const { t } = useI18n();
  const s = t.shelf;
  const state = useReminderState();
  if (state === "unsupported") return <p className="mt-5 text-xs leading-5 text-ink-soft">{s.remindersUnsupported}</p>;
  const on = state === "on";
  const blocked = state === "blocked";
  return (
    <div className="mt-5 flex flex-wrap items-center gap-3 rounded-2xl bg-mute-soft/60 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{s.reminders}</p>
        <p className="mt-0.5 text-xs leading-5 text-ink-soft">{blocked ? s.remindersBlocked : s.remindersText}</p>
      </div>
      <button
        disabled={blocked}
        aria-pressed={on}
        onClick={() => (on ? disableReminders() : void enableReminders())}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition active:scale-[0.98] disabled:opacity-50",
          on ? "bg-accent-soft text-on-accent-soft ring-1 ring-accent" : "bg-accent text-on-accent",
        )}
      >
        <BellIcon className="size-4.5" />
        {on ? s.remindersOn : s.remindersOff}
      </button>
    </div>
  );
}
