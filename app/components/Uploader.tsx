"use client";
import React, { useRef, useState } from "react";
import { cn } from "./ui";

export default function Uploader({
  onFile,
  compact = false,
}: {
  onFile: (file: File) => void;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
    // allow re-selecting the same file
    if (inputRef.current) inputRef.current.value = "";
  };

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*,.heic,.heif"
      className="sr-only"
      onChange={(e) => pick(e.target.files)}
    />
  );

  if (compact) {
    return (
      <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900">
        {input}
        <UploadIcon className="size-4" />
        Replace
      </label>
    );
  }

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // dragleave also fires when the pointer moves over the zone's own children
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        pick(e.dataTransfer.files);
      }}
      className={cn(
        "group relative flex cursor-pointer flex-col items-center justify-center gap-4 rounded-3xl border-2 border-dashed px-6 py-12 text-center transition-all duration-300 sm:py-16",
        "focus-within:ring-4 focus-within:ring-emerald-500/20",
        dragging
          ? "scale-[1.02] border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
          : "border-zinc-300 bg-white hover:border-emerald-400 hover:bg-emerald-50/40 dark:border-zinc-700 dark:bg-zinc-950 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/20",
      )}
    >
      {input}
      <span
        className={cn(
          "grid size-16 place-items-center rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30 transition-transform duration-300 group-hover:-translate-y-1 group-hover:rotate-3",
          dragging && "-translate-y-1 rotate-3",
        )}
      >
        <UploadIcon className="size-7" />
      </span>
      <div>
        <p className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
          {dragging ? "Drop it here" : "Drop a label photo or click to browse"}
        </p>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          Any photo · JPEG, PNG, WebP, HEIC… · or paste with{" "}
          <kbd className="rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900">
            Ctrl V
          </kbd>
        </p>
      </div>
    </label>
  );
}

export function UploadIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 16V4m0 0L7 9m5-5 5 5" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}
