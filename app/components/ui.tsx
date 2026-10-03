import React from "react";

export type Tone = "red" | "amber" | "green" | "zinc";

/** tinted surface + matching text, for tags and notices */
export const toneClasses: Record<Tone, string> = {
  red: "bg-bad-soft text-bad",
  amber: "bg-warn-soft text-warn",
  green: "bg-good-soft text-good",
  zinc: "bg-mute-soft text-mute",
};

export const toneText: Record<Tone, string> = {
  red: "text-bad",
  amber: "text-warn",
  green: "text-good",
  zinc: "text-mute",
};

export const dotClasses: Record<Tone, string> = {
  red: "bg-bad",
  amber: "bg-warn",
  green: "bg-good",
  zinc: "bg-mute",
};

export function cn(...classes: (string | false | null | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}

/**
 * One block of the result sheet, set like a printed panel: a heavy rule, a numbered
 * heading, then the content. Sections stack inside a single sheet instead of floating
 * as separate cards.
 */
export function Section({
  id,
  index,
  title,
  aside,
  flash,
  className,
  children,
}: {
  id?: string;
  /** position in the sheet, printed before the title ("03") */
  index?: number;
  title: string;
  aside?: React.ReactNode;
  /** changes on every jump to this section; replays the highlight */
  flash?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn(
        "relative scroll-mt-28 border-t-[3px] border-ink px-5 pt-4 pb-7 sm:px-7",
        className,
      )}
    >
      {flash ?
        <span
          key={flash}
          aria-hidden
          className="animate-flash pointer-events-none absolute inset-0"
        />
      : null}
      <div className="relative mb-4 flex items-baseline gap-3">
        {index !== undefined && (
          <span
            aria-hidden
            dir="ltr"
            className="eyebrow text-accent tabular-nums"
          >
            {String(index).padStart(2, "0")}
          </span>
        )}
        <h3 className="font-display text-lg leading-tight font-semibold">
          {title}
        </h3>
        {aside && (
          <div className="eyebrow ms-auto text-end text-ink-soft">{aside}</div>
        )}
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

/** a small rectangular stamp; `tone` colours it, without one it is an outline */
export function Tag({
  tone,
  className,
  children,
  ...rest
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      {...rest}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm leading-tight font-medium",
        tone ? toneClasses[tone] : "border border-rule text-ink",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Dot({ tone, className }: { tone: Tone; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "size-2 shrink-0 rounded-full",
        dotClasses[tone],
        className,
      )}
    />
  );
}

/** a note set off by a coloured bar on its leading edge */
export function Notice({
  tone,
  role = "note",
  className,
  children,
}: {
  tone: Tone;
  role?: "note" | "alert";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      role={role}
      className={cn(
        "flex gap-3 rounded-xl px-4 py-3 text-sm leading-6",
        toneClasses[tone],
        className,
      )}
    >
      <span
        aria-hidden
        className={cn(
          "mt-1 w-0.75 shrink-0 self-stretch rounded-full",
          dotClasses[tone],
        )}
      />
      <div className="min-w-0 flex-1 text-ink">{children}</div>
    </div>
  );
}

/** a horizontal meter: `value` from 0 to 1 */
export function Bar({
  value,
  tone,
  delay = 0,
}: {
  value: number;
  tone: Tone;
  delay?: number;
}) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-mute-soft">
      <div
        className={cn(
          "animate-grow h-full origin-left rounded-full rtl:origin-right",
          dotClasses[tone],
        )}
        style={{
          width: `${Math.max(0, Math.min(1, value)) * 100}%`,
          animationDelay: `${delay}ms`,
        }}
      />
    </div>
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

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

export function CameraIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M4 8a2 2 0 0 1 2-2h1.6l1.1-1.6a1 1 0 0 1 .8-.4h5a1 1 0 0 1 .8.4L16.4 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

export function ImageIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...iconProps}>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="m4.5 17 4.8-4.6a1 1 0 0 1 1.4 0L15 16.5m-1.5-1.5 1.8-1.7a1 1 0 0 1 1.4 0l3.3 3.2" />
    </svg>
  );
}

export function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  );
}

export function BarcodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} {...iconProps}>
      <path d="M4 7V5.5A1.5 1.5 0 0 1 5.5 4H7M17 4h1.5A1.5 1.5 0 0 1 20 5.5V7M20 17v1.5a1.5 1.5 0 0 1-1.5 1.5H17M7 20H5.5A1.5 1.5 0 0 1 4 18.5V17" />
      <path d="M8 8.5v7M11 8.5v7M13.5 8.5v7M16 8.5v7" />
    </svg>
  );
}
