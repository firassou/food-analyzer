import React from "react";
import { cn, dotClasses, toneClasses, toneText, type Tone } from "../ui";

/** a small chip in the header: what the photo is, where the data comes from */
export function Chip({ tone, icon, children }: { tone?: Tone; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs leading-4 font-medium [&>svg]:size-3.5",
        tone ? toneClasses[tone] : "bg-accent-soft text-on-accent-soft",
      )}
    >
      {icon}
      {children}
    </span>
  );
}

/** the stamp that tells general knowledge from what was read on the label */
export function GeneralChip({ children }: { children: React.ReactNode }) {
  return <Chip tone="amber">{children}</Chip>;
}

export function SubLabel({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow mb-3 text-ink-soft">{children}</p>;
}

export function Legend({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-full", dotClasses[tone])} />
      {children}
    </span>
  );
}

export function InfoList({ title, rows }: { title: string; rows: [string, string | null][] }) {
  const filled = rows.filter((row): row is [string, string] => !!row[1]);
  if (filled.length === 0) return null;
  return (
    <div>
      <SubLabel>{title}</SubLabel>
      <dl className="overflow-hidden rounded-2xl bg-mute-soft/60 text-sm">
        {filled.map(([label, value]) => (
          <div key={label} className="flex gap-3 border-t border-rule/70 px-4 py-2.5 first:border-t-0">
            <dt className="w-28 shrink-0 text-ink-soft">{label}</dt>
            <dd dir="auto" className="min-w-0 wrap-break-word">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

interface TileProps {
  title: string;
  label: string;
  tone: Tone;
  icon?: React.ReactNode;
  hint?: string;
  onClick?: () => void;
  className?: string;
}

/** a tile of the "at a glance" grid: the verdict is the colour of the whole tile */
export function StatusTile({ title, label, tone, icon, hint, onClick, className }: TileProps) {
  const Root = onClick ? "button" : "div";
  return (
    <Root
      onClick={onClick}
      className={cn(
        "group flex min-h-28 flex-col items-start gap-3 rounded-3xl p-4 text-start transition active:scale-[0.985]",
        tone === "zinc" ? "bg-sheet ring-1 ring-rule" : toneClasses[tone],
        onClick && "cursor-pointer hover:brightness-[0.97] dark:hover:brightness-110",
        className,
      )}
    >
      <span className="flex w-full items-center gap-2">
        {icon && (
          <span aria-hidden className={cn("grid size-8 shrink-0 place-items-center rounded-xl bg-white/55 dark:bg-white/10 [&>svg]:size-4.5", tone !== "zinc" && toneText[tone])}>
            {icon}
          </span>
        )}
        <span className="eyebrow min-w-0 flex-1 text-ink-soft">{title}</span>
      </span>
      <span>
        <span className="font-display block text-xl leading-tight font-bold text-ink">{label}</span>
        {hint && <span className="mt-1 block text-xs leading-4 text-ink-soft">{hint}</span>}
      </span>
    </Root>
  );
}
