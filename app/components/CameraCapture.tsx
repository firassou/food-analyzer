"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useI18n } from "../lib/i18n/I18nProvider";
import { CloseIcon, Spinner } from "./ui";

type State = "starting" | "live" | "denied" | "unavailable";

/**
 * Full-screen viewfinder for devices without a native camera app (laptops, desktops).
 * The stream is stopped whenever the dialog closes, so the camera light goes off.
 */
export default function CameraCapture({
  onCapture,
  onClose,
  onChooseFile,
}: {
  onCapture: (file: File) => void;
  onClose: () => void;
  onChooseFile: () => void;
}) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const shutterRef = useRef<HTMLButtonElement>(null);
  const [state, setState] = useState<State>("starting");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let closed = false;
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        // the rear camera when there is one, at a resolution that keeps small print legible
        video: { facingMode: { ideal: "environment" }, width: { ideal: 2560 }, height: { ideal: 1440 } },
      })
      .then((s) => {
        if (closed) return s.getTracks().forEach((track) => track.stop());
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        void video.play().catch(() => {});
        setState("live");
        shutterRef.current?.focus();
      })
      .catch((error: unknown) => {
        if (closed) return;
        const name = error instanceof DOMException ? error.name : "";
        setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "unavailable");
      });
    return () => {
      closed = true;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // the page behind must not scroll under the viewfinder
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const capture = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")?.drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) onCapture(new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }));
      },
      "image/jpeg",
      0.92,
    );
  };

  const failed = state === "denied" || state === "unavailable";

  // on <body>: an animated or transformed ancestor would otherwise trap the fixed overlay
  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.camera.title}
      className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black text-white"
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="font-display min-w-0 flex-1 truncate text-base font-semibold">{t.camera.title}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label={t.camera.close}
          title={t.camera.close}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 transition hover:bg-white/20 focus-visible:outline-white"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden">
        <video ref={videoRef} playsInline muted className="size-full object-contain" />
        {state === "live" && (
          <>
            {/* framing guide */}
            {[
              "left-6 top-6 border-l-2 border-t-2 rounded-tl-xl",
              "right-6 top-6 border-r-2 border-t-2 rounded-tr-xl",
              "left-6 bottom-6 border-l-2 border-b-2 rounded-bl-xl",
              "right-6 bottom-6 border-r-2 border-b-2 rounded-br-xl",
            ].map((corner) => (
              <span key={corner} aria-hidden className={`pointer-events-none absolute size-8 border-white ${corner}`} />
            ))}
            <p className="pointer-events-none absolute inset-x-6 bottom-8 mx-auto w-fit max-w-full rounded-full bg-black/60 px-4 py-1.5 text-center text-xs backdrop-blur">
              {t.camera.tip}
            </p>
          </>
        )}
        {state === "starting" && (
          <p className="absolute flex items-center gap-2 text-sm text-white/70">
            <Spinner /> {t.camera.starting}
          </p>
        )}
        {failed && (
          <div role="alert" className="absolute mx-6 flex max-w-sm flex-col items-center gap-4 text-center">
            <p className="text-sm leading-6 text-white/85">{state === "denied" ? t.camera.denied : t.camera.unavailable}</p>
            <button
              type="button"
              onClick={onChooseFile}
              className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/85 active:scale-[0.98]"
            >
              {t.uploader.choosePhoto}
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-center px-4 py-5">
        <button
          ref={shutterRef}
          type="button"
          onClick={capture}
          disabled={state !== "live"}
          aria-label={t.camera.capture}
          title={t.camera.capture}
          className="grid size-18 place-items-center rounded-full border-4 border-white/80 transition hover:border-white focus-visible:outline-white active:scale-95 disabled:opacity-30"
        >
          <span className="size-13 rounded-full bg-white" />
        </button>
      </div>
    </div>,
    document.body,
  );
}
