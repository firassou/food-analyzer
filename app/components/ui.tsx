import React from "react";

export type Tone = "red" | "amber" | "green" | "zinc";

export const toneClasses: Record<Tone, string> = {
  red: "bg-red-50 text-red-700 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900",
  amber:
    "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900",
  green:
    "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:ring-emerald-900",
  zinc: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-300 dark:ring-zinc-800",
};

export const dotClasses: Record<Tone, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500",
  green: "bg-emerald-500",
  zinc: "bg-zinc-400",
};

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

export function Card({
  id,
  title,
  icon,
  aside,
  flash,
  delay = 0,
  className,
  children,
}: {
  id?: string;
  title?: string;
  icon?: string;
  aside?: React.ReactNode;
  /** changes on every jump to this card; replays the highlight pulse */
  flash?: number;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      style={{ animationDelay: `${delay * 70}ms` }}
      className={cn(
        "animate-fade-up relative scroll-mt-32 rounded-3xl border border-zinc-200 bg-white p-5 shadow-sm transition-[border-color,box-shadow] duration-500 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950",
        !!flash && "border-emerald-400 dark:border-emerald-600",
        className,
      )}
    >
      {flash ? (
        <span
          key={flash}
          aria-hidden
          className="animate-flash pointer-events-none absolute inset-0 rounded-3xl"
        />
      ) : null}
      {title && (
        <div className="mb-4 flex items-center gap-3">
          {icon && (
            <span
              aria-hidden
              className="grid size-9 shrink-0 place-items-center rounded-xl bg-zinc-100 text-base dark:bg-zinc-900"
            >
              {icon}
            </span>
          )}
          <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
            {title}
          </h3>
          {aside && (
            <div className="ms-auto text-end text-xs text-zinc-500 dark:text-zinc-400">
              {aside}
            </div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pill({
  tone,
  className,
  children,
}: {
  tone: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-sm ring-1 ring-inset",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone }: { tone: Tone }) {
  return (
    <span className={cn("size-2 shrink-0 rounded-full", dotClasses[tone])} />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg
      className={cn("size-4 animate-spin", className)}
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="4"
      />
      <path
        d="M22 12a10 10 0 0 0-10-10"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </svg>
  );
}
