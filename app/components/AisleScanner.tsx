"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AisleBook, aisleVerdict, type AisleVerdict, fitBox } from "../lib/analysis/aisle";
import { barcodeDigits } from "../lib/analysis/knowledge";
import { isEmptyProfile } from "../lib/analysis/profile";
import type { AnalyzeResponse } from "../lib/analysis/types";
import { useProfile } from "../lib/client/profile";
import { useI18n } from "../lib/i18n/I18nProvider";
import { ltr } from "../lib/i18n/I18nProvider";
import { cn, CloseIcon, Spinner, toneClasses, type Tone } from "./ui";

// The Shape Detection API isn't in TypeScript's DOM library yet.
interface DetectedBarcode {
  rawValue: string;
  boundingBox: { x: number; y: number; width: number; height: number };
}
interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<DetectedBarcode[]>;
}
type BarcodeDetectorConstructor = new (options: { formats: string[] }) => BarcodeDetectorLike;

const FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];
const SCAN_EVERY_MS = 300;
/** a barcode that left the frame keeps its badge this long, so it doesn't flicker */
const KEEP_MS = 900;
/** half the widest badge, to keep a badge for a code at the edge of the frame inside it */
const HALF_BADGE = 88;

const detectorClass = () => (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector ?? null;

const verdictTone: Record<AisleVerdict, Tone> = { avoid: "red", check: "amber", ok: "green", unchecked: "zinc", plain: "zinc" };

interface Badge {
  code: string;
  x: number;
  y: number;
}

/**
 * Shelf mode: the camera looks along a shelf and every barcode in view gets a badge for the active
 * profile, from the product database and the same checks as everywhere else (no photo, no model).
 * Needs a browser that can read barcodes; a tap on a badge opens that product.
 */
export default function AisleScanner({ onOpen, onClose }: { onOpen: (code: string) => void; onClose: () => void }) {
  const { t, locale } = useI18n();
  const a = t.aisle;
  const profile = useProfile();
  const videoRef = useRef<HTMLVideoElement>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  // one book for the life of the scanner; it is changed from the timer and read when a badge is drawn
  const [book] = useState(() => new AisleBook());
  const [supported] = useState(() => !!detectorClass() && !!navigator.mediaDevices?.getUserMedia);
  const [live, setLive] = useState(false);
  const [cameraFailed, setCameraFailed] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  // read by the timer, which must not restart the camera when the language changes
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);
  const [badges, setBadges] = useState<Badge[]>([]);
  // a lookup finished: show it
  const [, setAnswered] = useState(0);

  useEffect(() => {
    const Detector = detectorClass();
    if (!Detector || !navigator.mediaDevices?.getUserMedia) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let closed = false;
    let busy = false;
    const aborts = new AbortController();
    const lastSeen = new Map<string, { x: number; y: number; at: number }>();

    const lookUp = async (code: string) => {
      try {
        const res = await fetch(`/api/product?code=${code}&lang=${localeRef.current}`, { signal: aborts.signal });
        const data = (await res.json().catch(() => null)) as AnalyzeResponse | null;
        if (data?.ok) book.done(code, data.result);
        else if (data && !data.ok && data.code === "not_found") book.done(code, null);
        else book.failed(code, Date.now(), res.status === 429);
      } catch {
        if (!aborts.signal.aborted) book.failed(code, Date.now());
      }
      if (!closed) setAnswered((n) => n + 1);
    };

    navigator.mediaDevices
      .getUserMedia({ audio: false, video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 } } })
      .then((s) => {
        if (closed) return s.getTracks().forEach((track) => track.stop());
        stream = s;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = s;
        void video.play().catch(() => {});
        setLive(true);
        const detector = new Detector({ formats: FORMATS });
        timer = setInterval(async () => {
          const view = viewRef.current;
          if (busy || closed || !video.videoWidth || !view) return;
          busy = true;
          try {
            const now = Date.now();
            for (const found of await detector.detect(video)) {
              const code = barcodeDigits(found.rawValue);
              if (!code) continue;
              const box = fitBox(found.boundingBox, { width: video.videoWidth, height: video.videoHeight }, { width: view.clientWidth, height: view.clientHeight });
              const x = Math.min(Math.max(box.x + box.width / 2, HALF_BADGE), Math.max(view.clientWidth - HALF_BADGE, HALF_BADGE));
              const y = Math.min(Math.max(box.y + box.height / 2, 28), Math.max(view.clientHeight - 28, 28));
              lastSeen.set(code, { x, y, at: now });
              book.see(code, now);
            }
            for (const [code, seen] of lastSeen) if (now - seen.at > KEEP_MS) lastSeen.delete(code);
            setBadges([...lastSeen].map(([code, seen]) => ({ code, x: seen.x, y: seen.y })));
            for (let code = book.next(now); code; code = book.next(now)) void lookUp(code);
          } catch {
            // a frame that can't be read: try the next one
          } finally {
            busy = false;
          }
        }, SCAN_EVERY_MS);
      })
      .catch(() => {
        if (!closed) setCameraFailed(true);
      });
    return () => {
      closed = true;
      aborts.abort();
      clearInterval(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [book]);

  // focus moves into the scanner, and back to what opened it when it closes
  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  const labelOf = (code: string): { tone: Tone; label: string; name: string | null } => {
    const entry = book.get(code);
    if (!entry || entry.state === "queued" || entry.state === "loading") return { tone: "zinc", label: a.looking, name: null };
    if (entry.state === "missing") return { tone: "zinc", label: a.missing, name: null };
    if (entry.state === "error" || !entry.result) return { tone: "zinc", label: a.later, name: null };
    const verdict = aisleVerdict(entry.result, profile);
    const name = entry.result.product.name ?? entry.result.product.category;
    return { tone: verdictTone[verdict], label: verdict === "plain" ? (name ?? a.looking) : t.profile.verdict.everyoneStatus[verdict], name: verdict === "plain" ? null : name };
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={a.title} className="animate-fade-in fixed inset-0 z-50 flex flex-col bg-black text-white">
      <div className="flex items-center gap-3 px-4 py-3">
        <p className="font-display min-w-0 flex-1 truncate text-base font-semibold">{a.title}</p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t.camera.close}
          title={t.camera.close}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-white/10 transition hover:bg-white/20 focus-visible:outline-white"
        >
          <CloseIcon className="size-5" />
        </button>
      </div>

      <div ref={viewRef} className="relative min-h-0 flex-1 overflow-hidden">
        {supported && <video ref={videoRef} playsInline muted className="size-full object-cover" />}
        {!supported && <p className="mx-6 mt-10 max-w-sm text-center text-sm leading-6 text-white/85">{a.unsupported}</p>}
        {supported && cameraFailed && <p role="alert" className="mx-6 mt-10 max-w-sm text-center text-sm leading-6 text-white/85">{a.cameraFailed}</p>}
        {supported && !live && !cameraFailed && (
          <p className="absolute inset-0 grid place-items-center text-sm text-white/70">
            <span className="flex items-center gap-2">
              <Spinner /> {t.camera.starting}
            </span>
          </p>
        )}
        {badges.map((b) => {
          const { tone, label, name } = labelOf(b.code);
          // a screen reader hears the product (or its code) with the verdict
          const spoken = name ? `${label}: ${name}` : label === a.looking || label === a.missing || label === a.later ? `${ltr(b.code)}: ${label}` : label;
          return (
            <button
              key={b.code}
              type="button"
              onClick={() => onOpen(b.code)}
              style={{ left: b.x, top: b.y }}
              aria-label={spoken}
              className={cn(
                "absolute min-h-11 min-w-11 max-w-[11rem] -translate-x-1/2 -translate-y-1/2 rounded-2xl px-3 py-1.5 text-start text-xs font-semibold shadow-lg ring-2 ring-white/50 transition-[left,top,transform] duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white active:scale-[0.97] rtl:leading-6",
                tone === "zinc" ? "bg-white text-black" : toneClasses[tone],
              )}
            >
              <span dir="auto" className="block truncate">
                {label}
              </span>
              {name && (
                <span dir="auto" className="block truncate font-normal opacity-90">
                  {name}
                </span>
              )}
            </button>
          );
        })}
        {live && (
          <p className="pointer-events-none absolute inset-x-6 bottom-6 mx-auto w-fit max-w-full rounded-2xl bg-black/65 px-4 py-2 text-center text-xs leading-5 backdrop-blur rtl:leading-6">
            {isEmptyProfile(profile) ? a.noProfile : a.tip}
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
}
