"use client";
import React, { useRef, useState } from "react";
import { useI18n } from "../lib/i18n/I18nProvider";
import CameraCapture from "./CameraCapture";
import { cn } from "./ui";

export default function Uploader({
  onFile,
  compact = false,
}: {
  onFile: (file: File) => void;
  compact?: boolean;
}) {
  const { t } = useI18n();
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
    // allow re-selecting the same file
    if (fileRef.current) fileRef.current.value = "";
    if (cameraRef.current) cameraRef.current.value = "";
  };

  const takePhoto = () => {
    // phones and tablets: the native camera app (focus, flash, full resolution) reads small
    // print best. Elsewhere `capture` is ignored, so open the webcam in the page instead.
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch || !navigator.mediaDevices?.getUserMedia) cameraRef.current?.click();
    else setCameraOpen(true);
  };

  const inputs = (
    <>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,.heic,.heif"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => pick(e.target.files)}
      />
      {cameraOpen && (
        <CameraCapture
          onCapture={(file) => {
            setCameraOpen(false);
            onFile(file);
          }}
          onClose={() => setCameraOpen(false)}
          onChooseFile={() => {
            setCameraOpen(false);
            fileRef.current?.click();
          }}
        />
      )}
    </>
  );

  if (compact) {
    const button =
      "inline-flex items-center justify-center rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900";
    return (
      <>
        {inputs}
        <button type="button" onClick={takePhoto} aria-label={t.uploader.retake} title={t.uploader.retake} className={button}>
          <CameraIcon className="size-5" />
        </button>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          aria-label={t.uploader.replace}
          title={t.uploader.replace}
          className={button}
        >
          <UploadIcon className="size-5" />
        </button>
      </>
    );
  }

  return (
    <div
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
        "relative flex flex-col items-center justify-center gap-5 rounded-3xl border-2 border-dashed px-6 py-10 text-center transition-all duration-300 sm:py-14",
        dragging
          ? "scale-[1.02] border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30"
          : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-950",
      )}
    >
      {inputs}
      <button
        type="button"
        onClick={takePhoto}
        className={cn(
          "group inline-flex w-full max-w-xs items-center justify-center gap-3 rounded-2xl bg-linear-to-br from-emerald-500 to-teal-600 px-6 py-4 text-base font-semibold text-white shadow-lg shadow-emerald-500/30 transition",
          "hover:shadow-xl hover:shadow-emerald-600/30 hover:brightness-110 focus-visible:ring-4 focus-visible:ring-emerald-500/30 focus-visible:outline-none active:scale-[0.98]",
        )}
      >
        <CameraIcon className="size-6 transition-transform duration-300 group-hover:scale-110" />
        {dragging ? t.uploader.dropHere : t.uploader.takePhoto}
      </button>
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:border-emerald-400 hover:bg-emerald-50/40 focus-visible:ring-4 focus-visible:ring-emerald-500/20 focus-visible:outline-none active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/20"
      >
        <UploadIcon className="size-4" />
        {t.uploader.choosePhoto}
      </button>
      {/* dropping and pasting need a mouse and keyboard */}
      <p className="hidden text-sm text-zinc-500 sm:block dark:text-zinc-400">
        {t.uploader.hint}{" "}
        <kbd
          dir="ltr"
          className="rounded-md border border-zinc-300 bg-zinc-50 px-1.5 py-0.5 font-mono text-xs dark:border-zinc-700 dark:bg-zinc-900"
        >
          Ctrl V
        </kbd>
      </p>
    </div>
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

export function CameraIcon({ className }: { className?: string }) {
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
      <path d="M4 8a2 2 0 0 1 2-2h1.5l1.2-1.8A1 1 0 0 1 9.5 4h5a1 1 0 0 1 .8.2L16.5 6H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}
