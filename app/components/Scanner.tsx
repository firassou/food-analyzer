"use client";
import Image from "next/image";
import { useI18n } from "../lib/i18n/I18nProvider";
import { cn } from "./ui";

/** the chosen photo; a scan line runs over it while it is being analyzed */
export default function Scanner({
  src,
  scanning,
  compact = false,
}: {
  src: string | null;
  scanning: boolean;
  /** a short strip instead of the whole photo (above the results on small screens) */
  compact?: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="relative overflow-hidden rounded-3xl bg-mute-soft ring-1 ring-rule">
      {src ? (
        <Image
          src={src}
          alt={t.scanner.alt}
          className={cn(
            "w-full transition-[max-height,filter] duration-500",
            compact ? "max-h-40 object-cover lg:max-h-[70vh] lg:object-contain" : "max-h-[46vh] object-contain lg:max-h-[70vh]",
            scanning && "saturate-50",
          )}
          width={500}
          height={300}
          style={{ height: "auto" }}
          unoptimized
        />
      ) : (
        <div className="aspect-4/3 w-full animate-pulse" />
      )}

      {scanning && (
        <>
          <div className="animate-fade-in absolute inset-0 bg-accent/10" />
          <div aria-hidden className="animate-scan absolute inset-x-0 h-0.5 bg-accent shadow-[0_0_18px_4px] shadow-accent/50" />
        </>
      )}
    </div>
  );
}
