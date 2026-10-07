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
 * One block of the result sheet: a surface of its own with an icon, a title and what
 * belongs to it. Blocks stack with a gap, so the sheet reads as a few clear parts.
 */
export function Section({
  id,
  title,
  icon,
  aside,
  flash,
  className,
  children,
}: {
  id?: string;
  title: string;
  /** a 24px line icon from this file, shown in a tonal bubble before the title */
  icon?: React.ReactNode;
  aside?: React.ReactNode;
  /** changes on every jump to this section; replays the highlight */
  flash?: number;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      id={id}
      className={cn("relative scroll-mt-32 overflow-hidden rounded-[28px] bg-sheet px-5 pt-5 pb-6 ring-1 ring-rule sm:px-7", className)}
    >
      {flash ?
        <span key={flash} aria-hidden className="animate-flash pointer-events-none absolute inset-0" />
      : null}
      <div className="relative mb-5 flex items-center gap-3">
        {icon && (
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-2xl bg-accent-soft text-on-accent-soft [&>svg]:size-5">
            {icon}
          </span>
        )}
        <h3 className="font-display min-w-0 flex-1 text-xl leading-tight font-semibold text-balance">{title}</h3>
        {aside && <div className="eyebrow shrink-0 text-end text-ink-soft">{aside}</div>}
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}

/** a small pill; `tone` colours it, without one it is neutral */
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
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm leading-tight font-medium",
        tone ? toneClasses[tone] : "bg-mute-soft text-ink",
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

function NoticeIcon({ tone }: { tone: Tone }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={cn("mt-0.5 size-5 shrink-0", toneText[tone])} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {tone === "red" ?
        <path d="M12 8v5m0 3.5h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      : tone === "amber" ?
        <path d="M12 8v5m0 3.5h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />
      : tone === "green" ?
        <path d="m8 12.5 2.8 2.8L16.5 9.5M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />
      : <path d="M12 11v5m0-8.5h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />}
    </svg>
  );
}

/** a note: a tinted surface with a small icon for its tone */
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
        "flex gap-3 rounded-2xl px-4 py-3.5 text-sm leading-6",
        toneClasses[tone],
        className,
      )}
    >
      <NoticeIcon tone={tone} />
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
    <div className="h-2 overflow-hidden rounded-full bg-mute-soft">
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

/* ---- icons: 24px, 1.8 stroke, drawn for this app ---- */

const icon = (paths: React.ReactNode) =>
  function Icon({ className }: { className?: string }) {
    return (
      <svg className={className} {...iconProps} strokeWidth={1.8}>
        {paths}
      </svg>
    );
  };

export const SparkleIcon = icon(<path d="M12 3.5c.6 4.4 2.1 5.9 6.5 6.5-4.4.6-5.9 2.1-6.5 6.5-.6-4.4-2.1-5.9-6.5-6.5 4.4-.6 5.9-2.1 6.5-6.5ZM18.5 15.5c.3 1.9.9 2.5 2.5 2.8-1.6.3-2.2.9-2.5 2.7-.3-1.8-.9-2.4-2.5-2.7 1.6-.3 2.2-.9 2.5-2.8Z" />);
export const WheatIcon = icon(<path d="M12 21V9m0 0c0-2 1-3.5 2.5-4.5.3 2-.4 3.6-2.5 4.5Zm0 0c0-2-1-3.5-2.5-4.5-.3 2 .4 3.6 2.5 4.5Zm0 5c0-2 1-3.5 2.5-4.5.3 2-.4 3.6-2.5 4.5Zm0 0c0-2-1-3.5-2.5-4.5-.3 2 .4 3.6 2.5 4.5Zm0 4.5c0-2 1-3.5 2.5-4.5.3 2-.4 3.6-2.5 4.5Zm0 0c0-2-1-3.5-2.5-4.5-.3 2 .4 3.6 2.5 4.5Z" />);
export const SugarIcon = icon(<path d="M4 9.5 11 6l7 3.5v7L11 20l-7-3.5v-7Zm0 0 7 3.5m0 0 7-3.5M11 13v7m3.5-12.5 5-2" />);
export const AlertIcon = icon(<path d="M12 9v4.5m0 3.5h.01M10.3 3.9 2.6 17.4A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3.1L13.7 3.9a2 2 0 0 0-3.4 0Z" />);
export const FlaskIcon = icon(<path d="M9.5 3.5h5M10.5 3.5v5.2L5.2 17.5A2 2 0 0 0 7 20.5h10a2 2 0 0 0 1.8-3l-5.3-8.8V3.5M8 14.5h8" />);
export const FlameIcon = icon(<path d="M12 21c3.9 0 6.5-2.6 6.5-6.1 0-2.8-1.6-4.6-3-6.2-.9-1-1.6-2-1.7-3.7-3.2 1.6-4.8 4.5-4.8 6.7-.9-.5-1.4-1.3-1.5-2.3-1.3 1.3-2 3-2 4.9C5.5 18.4 8.1 21 12 21Z" />);
export const DropIcon = icon(<path d="M12 3.5s6 6.1 6 10.6a6 6 0 1 1-12 0C6 9.600 12 3.500 12 3.500Zm-2.500 10.800a2.700 2.700 0 0 0 2.500 2.400" />);
export const PillIcon = icon(<path d="m10.2 20 9.8-9.8a4.100 4.100 0 0 0-5.800-5.800L4.400 14.200A4.100 4.100 0 0 0 10.200 20ZM9.300 9.300l5.400 5.400" />);
export const ListIcon = icon(<path d="M9 6.5h11M9 12h11M9 17.5h11M4.500 6.500h.01M4.500 12h.01M4.500 17.500h.01" />);
export const InfoIcon = icon(<path d="M12 11v5.500m0-8.500h.01M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />);
export const ClockIcon = icon(<path d="M12 7.500V12l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z" />);
export const ChartIcon = icon(<path d="M5 20V11m5 9V4m5 16v-6m5 6H3" />);
export const TextIcon = icon(<path d="M5 7V5.500h14V7M12 5.500v13m-2.500 0h5" />);
export const BottleIcon = icon(<path d="M10 3h4v3l1.500 2.500v10.500a2 2 0 0 1-2 2h-3a2 2 0 0 1-2-2V8.500L10 6V3ZM8.500 12.500h7" />);
export const PlateIcon = icon(<path d="M12 5.500a6.500 6.500 0 1 0 0 13 6.500 6.500 0 0 0 0-13Zm0 3.500a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM3 4v6.500M5 4v6.500M4 10.500V20M21 4c-1.500 1-2.500 3-2.500 5.500V13H21V4Zm0 9v7" />);
export const LabelIcon = icon(<path d="M5 3.500h14v17H5v-17Zm3.500 4.500h7m-7 3.500h7m-7 3.500h4" />);
export const ChevronIcon = icon(<path d="m9 6 6 6-6 6" />);
export const CheckIcon = icon(<path d="m5 12.500 4.500 4.500L19 7.500" />);
export const PlusIcon = icon(<path d="M12 5v14M5 12h14" />);
export const MinusIcon = icon(<path d="M5 12h14" />);
export const PencilIcon = icon(<path d="m4 20 1-4.500L16.500 4a2.100 2.100 0 0 1 3 3L8 18.500 4 20Zm9-13.500 3.500 3.500" />);
export const GlobeIcon = icon(<path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM3 12h18M12 3c2.500 2.600 3.800 5.600 3.800 9s-1.300 6.400-3.800 9c-2.500-2.600-3.800-5.600-3.800-9S9.500 5.600 12 3Z" />);
export const UserIcon = icon(<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8.500c.6-3.800 3.400-6 7-6s6.400 2.200 7 6" />);
export const SendIcon = icon(<path d="M4.500 12 20 4.500 15.500 20l-3.800-6.200L4.500 12Zm7.200 1.800L20 4.500" />);
export const TrashIcon = icon(<path d="M5 7h14M10 7V4.500h4V7m-7 0 .8 12.500h8.400L17 7M10 11v5m4-5v5" />);
export const ArrowLeftIcon = icon(<path d="M19 12H5m6-6-6 6 6 6" />);
