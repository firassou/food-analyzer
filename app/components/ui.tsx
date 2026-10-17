import React from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, ArrowLeftRight, Bell, Camera, Candy, ChartNoAxesColumn, Check, ChevronRight, Clock, Droplet, Flame, FlaskConical, Globe,
  HeartPulse, Image as ImageGlyph, Info, LibraryBig, List, Milk, Mic, Minus, Pencil, Pill, Plus, Printer, ScanBarcode, ScrollText, Send,
  Share2, Sparkles, Trash2, TriangleAlert, Type, User, UtensilsCrossed, Wheat, X, type LucideIcon,
} from "lucide-react";
import { useIsMedicine } from "../lib/motion";

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
  const medicine = useIsMedicine();
  return (
    <motion.section
      id={id}
      initial={{ opacity: 0, y: medicine ? 0 : 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -6% 0px" }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={cn("card relative scroll-mt-32 overflow-hidden px-5 pt-5 pb-6 sm:px-7", className)}
    >
      {flash ?
        <span key={flash} aria-hidden className="animate-flash pointer-events-none absolute inset-0" />
      : null}
      <div className="relative mb-5 flex items-center gap-3">
        {icon && (
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-on-accent-soft [&>svg]:size-5">
            {icon}
          </span>
        )}
        <h3 className="font-display min-w-0 flex-1 text-lg leading-tight font-semibold text-balance sm:text-xl">{title}</h3>
        {aside && <div className="eyebrow shrink-0 text-end text-ink-soft">{aside}</div>}
      </div>
      <div className="relative">{children}</div>
    </motion.section>
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
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-sm leading-tight font-medium",
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
        "flex gap-3 rounded-xl px-4 py-3.5 text-sm leading-6",
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

/* ---- icons: Lucide, at one weight, so every glyph in the app belongs to one family ---- */

const lucide =
  (Glyph: LucideIcon) =>
  function Icon({ className }: { className?: string }) {
    return <Glyph className={className} strokeWidth={1.75} aria-hidden />;
  };

export const CameraIcon = lucide(Camera);
export const ImageIcon = lucide(ImageGlyph);
export const CloseIcon = lucide(X);
export const BarcodeIcon = lucide(ScanBarcode);
export const SparkleIcon = lucide(Sparkles);
export const WheatIcon = lucide(Wheat);
export const SugarIcon = lucide(Candy);
export const AlertIcon = lucide(TriangleAlert);
export const FlaskIcon = lucide(FlaskConical);
export const FlameIcon = lucide(Flame);
export const DropIcon = lucide(Droplet);
export const PillIcon = lucide(Pill);
export const ListIcon = lucide(List);
export const InfoIcon = lucide(Info);
export const ClockIcon = lucide(Clock);
export const ChartIcon = lucide(ChartNoAxesColumn);
export const TextIcon = lucide(Type);
export const BottleIcon = lucide(Milk);
export const PlateIcon = lucide(UtensilsCrossed);
export const LabelIcon = lucide(ScrollText);
export const ChevronIcon = lucide(ChevronRight);
export const CheckIcon = lucide(Check);
export const PlusIcon = lucide(Plus);
export const MinusIcon = lucide(Minus);
export const PencilIcon = lucide(Pencil);
export const GlobeIcon = lucide(Globe);
export const UserIcon = lucide(User);
export const SendIcon = lucide(Send);
export const TrashIcon = lucide(Trash2);
export const ArrowLeftIcon = lucide(ArrowLeft);
export const ShelfIcon = lucide(LibraryBig);
export const BellIcon = lucide(Bell);
export const ShareIcon = lucide(Share2);
export const MicIcon = lucide(Mic);
export const PrinterIcon = lucide(Printer);
export const SwapIcon = lucide(ArrowLeftRight);
export const HeartIcon = lucide(HeartPulse);
