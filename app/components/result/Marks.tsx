"use client";
import { useState } from "react";
import type { DoseMarks } from "../../lib/analysis/types";
import { format, ltr, useI18n } from "../../lib/i18n/I18nProvider";
import { cn, MinusIcon, PencilIcon, PlusIcon, toneClasses, type Tone } from "../ui";
import { Chip, SubLabel } from "./bits";

type Dose = Pick<DoseMarks, "morning" | "midday" | "evening" | "anytime" | "duration" | "note">;

const STEP = 0.5;
const MAX_UNITS = 6;

/** strokes as drawn on a box: a whole unit is a long stroke, a half a short one */
function Strokes({ count, slant = false }: { count: number; slant?: boolean }) {
  return (
    <span aria-hidden dir="ltr" className="flex h-9 items-end gap-1.5">
      {Array.from({ length: Math.floor(count) }, (_, i) => (
        <span key={i} className={cn("h-9 w-1 rounded-full bg-accent", slant && "rotate-12")} />
      ))}
      {count % 1 !== 0 && <span className={cn("h-4 w-1 rounded-full bg-accent", slant && "rotate-12")} />}
      {count === 0 && <span className="mb-4 h-0.5 w-4 rounded-full bg-rule" />}
    </span>
  );
}

/**
 * The pharmacist's pen marks, redrawn, and the way to set them yourself: a photo can miss
 * ink, and a reading of handwriting can be wrong, so the reader always has the last word.
 */
export function DoseMarksPanel({
  marks,
  onChange,
}: {
  marks: DoseMarks | null;
  /** saves the reader's own entry; `null` removes the marks */
  onChange?: (dose: Dose | null) => void;
}) {
  const { t, fmt } = useI18n();
  const med = t.results.medicine;
  const [editing, setEditing] = useState(false);

  if (editing && onChange) {
    return (
      <DoseEditor
        start={marks}
        onCancel={() => setEditing(false)}
        onSave={(dose) => {
          onChange(dose);
          setEditing(false);
        }}
      />
    );
  }

  if (!marks) {
    return onChange ?
        <div className="rounded-2xl bg-mute-soft/70 p-4">
          <p className="text-sm leading-6 text-ink-soft">{med.noMarks}</p>
          <button
            onClick={() => setEditing(true)}
            className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition active:scale-[0.98]"
          >
            <PlusIcon className="size-4.5" />
            {med.addMarks}
          </button>
        </div>
      : null;
  }

  const times: [string, number][] = [
    [med.morning, marks.morning],
    [med.midday, marks.midday],
    [med.evening, marks.evening],
  ];
  // results saved before "anytime" existed don't have it
  const anytime = marks.anytime ?? 0;
  const timed = marks.morning + marks.midday + marks.evening;
  return (
    <div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <p className="font-display min-w-0 flex-1 text-base font-semibold">{med.marksTitle}</p>
        {marks.source === "you" && <Chip icon={<PencilIcon />}>{med.setByYou}</Chip>}
        {onChange && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex h-11 items-center gap-1.5 rounded-full bg-mute-soft px-4 text-sm font-medium transition hover:bg-rule active:scale-[0.97]"
          >
            <PencilIcon className="size-4" />
            {med.editMarks}
          </button>
        )}
      </div>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{marks.source === "you" ? med.editorHint : med.marksText}</p>

      {anytime > 0 && (
        // one line across the box: so many a day, at no set time
        <div className="mt-3 flex items-center gap-4 rounded-2xl bg-mute-soft/70 px-4 py-4">
          <Strokes count={anytime} slant />
          <span className="font-display text-3xl leading-none font-bold tabular-nums">{ltr(fmt(anytime))}</span>
          <span className="min-w-0">
            <span className="block font-medium">{med.anytime}</span>
            <span className="block text-sm leading-5 text-ink-soft">{med.anytimeHint}</span>
          </span>
        </div>
      )}
      {(timed > 0 || anytime === 0) && (
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {times.map(([label, count]) => (
            <div
              key={label}
              className={cn("flex flex-col items-center rounded-2xl bg-mute-soft/70 px-2 py-4", count === 0 && "text-ink-soft/60")}
            >
              <dt className="eyebrow">{label}</dt>
              <dd className="mt-3 flex flex-col items-center">
                <Strokes count={count} />
                <span className="font-display mt-2 text-3xl leading-none font-bold tabular-nums">{ltr(fmt(count))}</span>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {timed > 0 && <span className="font-medium">{format(med.perDay, { count: ltr(fmt(timed + anytime)) })}</span>}
        {marks.duration && (
          <span className="text-ink-soft">
            {med.duration} <span dir="auto">{marks.duration}</span>
          </span>
        )}
        {marks.note && (
          <span className="text-ink-soft">
            {med.written}: <span dir="auto">“{marks.note}”</span>
          </span>
        )}
      </p>
    </div>
  );
}

function Stepper({ label, hint, value, onChange }: { label: string; hint?: string; value: number; onChange: (v: number) => void }) {
  const { t, fmt } = useI18n();
  const med = t.results.medicine;
  const button = "grid size-11 place-items-center rounded-full bg-sheet ring-1 ring-rule transition active:scale-95 disabled:opacity-35";
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="font-medium">{label}</p>
        {hint && <p className="text-xs leading-4 text-ink-soft">{hint}</p>}
      </div>
      <button
        type="button"
        className={button}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - STEP))}
        aria-label={format(med.fewer, { label })}
      >
        <MinusIcon className="size-4.5" />
      </button>
      <span aria-live="polite" className="font-display w-9 text-center text-2xl font-bold tabular-nums">
        {ltr(fmt(value))}
      </span>
      <button
        type="button"
        className={button}
        disabled={value >= MAX_UNITS}
        onClick={() => onChange(Math.min(MAX_UNITS, value + STEP))}
        aria-label={format(med.more, { label })}
      >
        <PlusIcon className="size-4.5" />
      </button>
    </div>
  );
}

function DoseEditor({ start, onSave, onCancel }: { start: DoseMarks | null; onSave: (dose: Dose | null) => void; onCancel: () => void }) {
  const { t } = useI18n();
  const med = t.results.medicine;
  const [dose, setDose] = useState<Dose>({
    morning: start?.morning ?? 0,
    midday: start?.midday ?? 0,
    evening: start?.evening ?? 0,
    anytime: start?.anytime ?? 0,
    duration: start?.duration ?? null,
    // the model's description of the strokes belongs to its reading, not to the reader's entry
    note: null,
  });
  const set = (k: "morning" | "midday" | "evening" | "anytime") => (v: number) => setDose((d) => ({ ...d, [k]: v }));
  const empty = dose.morning + dose.midday + dose.evening + dose.anytime === 0;
  return (
    <div className="rounded-2xl bg-mute-soft/70 p-4">
      <p className="font-display text-base font-semibold">{med.editorTitle}</p>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{med.editorHint}</p>
      <div className="mt-2 divide-y divide-rule/70">
        <Stepper label={med.morning} value={dose.morning} onChange={set("morning")} />
        <Stepper label={med.midday} value={dose.midday} onChange={set("midday")} />
        <Stepper label={med.evening} value={dose.evening} onChange={set("evening")} />
        <Stepper label={med.anytimeShort} value={dose.anytime} onChange={set("anytime")} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onSave(empty ? null : dose)}
          className="inline-flex h-11 items-center rounded-full bg-accent px-6 text-sm font-semibold text-on-accent transition active:scale-[0.98]"
        >
          {med.save}
        </button>
        <button
          onClick={onCancel}
          className="inline-flex h-11 items-center rounded-full px-4 text-sm font-medium text-ink-soft transition hover:bg-rule/60"
        >
          {t.actions.cancel}
        </button>
        {start && (
          <button
            onClick={() => onSave(null)}
            className="ms-auto inline-flex h-11 items-center rounded-full px-4 text-sm font-medium text-bad transition hover:bg-bad-soft"
          >
            {med.remove}
          </button>
        )}
      </div>
    </div>
  );
}

/** a titled list of the model's general statements about a medicine; renders nothing when empty */
export function GeneralList({
  title,
  items,
  mark = "–",
  tone = "zinc",
  className,
}: {
  title: string;
  items: string[];
  mark?: string;
  tone?: Tone;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={className}>
      <SubLabel>{title}</SubLabel>
      <ul className="space-y-2.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-3 text-sm leading-6">
            <span
              aria-hidden
              className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold", toneClasses[tone])}
            >
              {mark}
            </span>
            <span dir="auto">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
