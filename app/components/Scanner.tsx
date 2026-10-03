"use client";
import Image from "next/image";
import { useI18n } from "../lib/i18n/I18nProvider";
import { cn } from "./ui";

export default function Scanner({
  src,
  file,
  scanning,
}: {
  src: string | null;
  file: File | null;
  scanning: boolean;
}) {
  const { t } = useI18n();
  return (
    <div className="animate-fade-up rounded-3xl border border-zinc-200 bg-white p-2 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="relative overflow-hidden rounded-2xl bg-zinc-100 dark:bg-zinc-900">
        {src ? (
          <Image
            src={src}
            alt={t.scanner.alt}
            className={cn(
              "max-h-[60vh] w-full object-contain transition duration-700",
              scanning && "scale-[1.02] saturate-50",
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
            <div className="animate-fade-in absolute inset-0 bg-emerald-500/10" />
            <div
              className="animate-scan absolute inset-x-0 h-[3px] bg-emerald-400 shadow-[0_0_24px_6px] shadow-emerald-400/60"
              aria-hidden
            />
            {/* corner brackets */}
            {[
              "left-3 top-3 border-l-2 border-t-2 rounded-tl-lg",
              "right-3 top-3 border-r-2 border-t-2 rounded-tr-lg",
              "left-3 bottom-3 border-l-2 border-b-2 rounded-bl-lg",
              "right-3 bottom-3 border-r-2 border-b-2 rounded-br-lg",
            ].map((c) => (
              <span
                key={c}
                aria-hidden
                className={cn(
                  "animate-fade-in absolute size-6 border-emerald-400",
                  c,
                )}
              />
            ))}
          </>
        )}
      </div>

      {file && (
        <div className="flex items-center gap-2 px-3 pt-3 pb-1 text-xs text-zinc-500 dark:text-zinc-400">
          <span dir="auto" className="truncate font-medium text-zinc-700 dark:text-zinc-300">
            {file.name}
          </span>
          <span dir="ltr" className="ms-auto shrink-0 tabular-nums">
            {formatSize(file.size)}
          </span>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
