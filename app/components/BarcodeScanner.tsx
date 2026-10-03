"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { barcodeDigits } from "../lib/analysis/knowledge";
import { useI18n } from "../lib/i18n/I18nProvider";
import { CloseIcon, Spinner } from "./ui";

// The Shape Detection API isn't in TypeScript's DOM library yet.
interface DetectedBarcode {
  rawValue: string;
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e", "itf"];
const SCAN_EVERY_MS = 250;

const detectorClass = () =>
  (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;

type State = "starting" | "live" | "manual";

/**
 * Reads a product barcode with the camera where the browser can (Chrome on Android
 * and on desktop); everywhere else, and whenever the camera fails, the digits can be
 * typed. Only codes whose check digit holds are accepted.
 */
export default function BarcodeScanner({ onCode, onClose }: { onCode: (code: string) => void; onClose: () => void }) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  // no detector in this browser: straight to typing, without asking for the camera
  const [state, setState] = useState<State>(() => (detectorClass() ? "starting" : "manual"));
  const [typed, setTyped] = useState("");
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    const Detector = detectorClass();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let busy = false;
    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } } })
      .then((s) => {
        if (closed) return s.getTracks().forEach((track) => track.stop());
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        void video.play().catch(() => {});
        setState("live");
        const detector = new Detector({ formats: FORMATS });
        timer = setInterval(async () => {
          if (busy || closed || !video.videoWidth) return;
          busy = true;
          try {
            for (const found of await detector.detect(video)) {
              const code = barcodeDigits(found.rawValue);
              if (code && !closed) {
                closed = true;
                onCode(code);
                return;
              }
            }
          } catch {
            // a frame that can't be read: try the next one
          } finally {
            busy = false;
          }
        }, SCAN_EVERY_MS);
      })
      .catch(() => {
        if (!closed) setState("manual");
      });
    return () => {
      closed = true;
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onCode]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    // the page behind must not scroll under the scanner
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const code = barcodeDigits(typed);
    if (code) onCode(code);
    else setInvalid(true);
  };

  // on <body>: an animated or transformed ancestor would otherwise trap the fixed overlay
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t.barcode.title} className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="font-display min-w-0 flex-1 truncate text-base font-semibold">{t.barcode.title}</p>
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
        {state !== "manual" && <video ref={videoRef} playsInline muted className="size-full object-cover" />}
        {state === "live" && (
          <>
            {/* the reading window: wide and short, like a barcode */}
            <div aria-hidden className="pointer-events-none absolute inset-x-8 top-1/2 h-36 -translate-y-1/2 rounded-2xl border-2 border-white shadow-[0_0_0_100vmax_rgb(0_0_0/0.45)]">
              <div className="animate-scan absolute inset-x-0 h-0.5 bg-white/80" />
            </div>
            <p className="pointer-events-none absolute inset-x-6 bottom-6 mx-auto w-fit max-w-full rounded-full bg-black/60 px-4 py-1.5 text-center text-xs backdrop-blur">
              {t.barcode.tip}
            </p>
          </>
        )}
        {state === "starting" && (
          <p className="absolute flex items-center gap-2 text-sm text-white/70">
            <Spinner /> {t.camera.starting}
          </p>
        )}
        {state === "manual" && <p className="mx-6 max-w-sm text-center text-sm leading-6 text-white/85">{t.barcode.unsupported}</p>}
      </div>

      <form onSubmit={submit} className="px-4 pt-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        <label htmlFor="barcode-digits" className="eyebrow text-white/70">
          {t.barcode.manual}
        </label>
        <div className="mt-2 flex gap-2">
          <input
            id="barcode-digits"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            autoFocus={state === "manual"}
            placeholder="3017620422003"
            value={typed}
            onChange={(e) => {
              setTyped(e.target.value.replace(/[^\d\s-]/g, "").slice(0, 20));
              setInvalid(false);
            }}
            aria-invalid={invalid}
            aria-describedby={invalid ? "barcode-error" : undefined}
            className="h-12 min-w-0 flex-1 rounded-full border border-white/25 bg-white/10 px-5 font-mono text-base tracking-wider text-white placeholder:text-white/30 focus-visible:outline-white"
          />
          <button
            type="submit"
            disabled={!typed.trim()}
            className="h-12 shrink-0 rounded-full bg-white px-5 text-sm font-semibold text-black transition hover:bg-white/85 active:scale-[0.98] disabled:opacity-40"
          >
            {t.barcode.submit}
          </button>
        </div>
        {invalid && (
          <p id="barcode-error" role="alert" className="mt-2 text-sm text-[#ff9c8a]">
            {t.barcode.invalid}
          </p>
        )}
      </form>
    </div>,
    document.body,
  );
}
