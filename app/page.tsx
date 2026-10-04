"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Content from "./Content";
import Analyzing from "./components/Analyzing";
import BarcodeScanner from "./components/BarcodeScanner";
import Compare from "./components/Compare";
import History from "./components/History";
import InstallButton from "./components/InstallButton";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { usePhotoPicker } from "./components/PhotoPicker";
import ProfileSheet, { ProfileButton } from "./components/ProfileSheet";
import Scanner from "./components/Scanner";
import Together from "./components/Together";
import { BarcodeIcon, CameraIcon, cn, ImageIcon, Notice, Spinner } from "./components/ui";
import { makeThumb, newScanId, saveScan, useHistory, type HistoryEntry } from "./lib/client/history";
import { ImagePrepError, prepareImage } from "./lib/client/prepareImage";
import { addExcipientPhoto } from "./lib/analysis/medicine";
import type { AnalyzeErrorCode, AnalyzeMeta, AnalyzeResponse, LabelAnalysis } from "./lib/analysis/types";
import { format, rich, useI18n } from "./lib/i18n/I18nProvider";
import type { Locale } from "./lib/i18n/locales";
import type { Messages } from "./lib/i18n/messages";

type Status = "preparing" | "analyzing" | "done" | "error";

/** an error is kept as a code so it follows the interface language; server text is the English fallback */
type AppError =
  | { kind: "client"; key: "notImage" | "inputTooLarge" | "heic" | "damaged" | "timeout" | "network" }
  | { kind: "status"; status: number }
  | { kind: "server"; code: AnalyzeErrorCode; message: string };

class AnalysisFailure extends Error {
  constructor(public detail: AppError) {
    super(detail.kind);
  }
}

function errorText(error: AppError, t: Messages, locale: Locale): string {
  if (error.kind === "client") return t.errors[error.key];
  if (error.kind === "status")
    return error.status === 413 ? t.errors.server.too_large : format(t.errors.unexpected, { status: error.status });
  // the server's own English sentence is the most specific one
  return locale === "en" ? error.message : (t.errors.server[error.code] ?? error.message);
}

/** what a result came from, so it can be fetched again (in another language, or after an error) */
type Source = { type: "photo"; image: Blob } | { type: "barcode"; code: string };

/** the browser gives up a little after the server's own time budget */
const CLIENT_TIMEOUT_MS = 150_000;

export default function Home() {
  const { t, locale, languageName } = useI18n();
  // a scan is on screen: being made, shown, or failed
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [comparing, setComparing] = useState<[HistoryEntry, HistoryEntry] | null>(null);
  const [status, setStatus] = useState<Status>("preparing");
  const [result, setResult] = useState<{ result: LabelAnalysis; meta: AnalyzeMeta } | null>(null);
  const [failure, setFailure] = useState<AppError | null>(null);
  // an optional second photo (a medicine's composition) being read into the result on screen
  const [adding, setAdding] = useState<"working" | "none" | null>(null);
  const [dragging, setDragging] = useState(false);
  // bumps on every new file/reset so stale async work is ignored
  const requestId = useRef(0);
  const scanId = useRef("");
  const thumb = useRef<string | null>(null);
  const inFlight = useRef<AbortController | null>(null);

  const cancelInFlight = () => {
    inFlight.current?.abort();
    inFlight.current = null;
  };

  // free the preview's object URL when it's replaced or the page unmounts
  useEffect(() => {
    return () => {
      if (imageSrc?.startsWith("blob:")) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);
  useEffect(() => () => inFlight.current?.abort(), []);

  // `scanId` names the scan in the history: analyzing the same photo again replaces its entry
  const run = useCallback(async (from: Source, lang: Locale, scanId: string) => {
    const id = ++requestId.current;
    cancelInFlight();
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus("analyzing");
    setFailure(null);
    setResult(null);
    setAdding(null);
    try {
      const r = from.type === "photo" ? await analyzeImage(from.image, controller.signal, lang) : await lookupBarcode(from.code, controller.signal, lang);
      if (id !== requestId.current) return;
      setResult(r);
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
      // remember anything that is about a food; a photo of something else isn't worth keeping
      if (r.result.kind !== "other") {
        thumb.current = from.type === "photo" ? await makeThumb(from.image) : null;
        saveScan({ id: scanId, at: Date.now(), thumb: thumb.current, result: r.result, meta: r.meta });
      }
    } catch (e) {
      if (id !== requestId.current) return;
      setFailure(e instanceof AnalysisFailure ? e.detail : { kind: "client", key: "network" });
      setStatus("error");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, []);

  // a photo is analyzed as soon as it is picked: one tap from camera to result
  const selectFile = useCallback(
    async (f: File) => {
      const id = ++requestId.current;
      cancelInFlight();
      setFailure(null);
      setResult(null);
      setComparing(null);
      setOpen(true);
      setSource(null);
      setImageSrc(null);
      setStatus("preparing");
      window.scrollTo({ top: 0 });
      try {
        const prepared = await prepareImage(f);
        if (id !== requestId.current) {
          URL.revokeObjectURL(prepared.previewUrl);
          return;
        }
        const from: Source = { type: "photo", image: prepared.blob };
        scanId.current = newScanId();
        setSource(from);
        setImageSrc(prepared.previewUrl);
        void run(from, locale, scanId.current);
      } catch (e) {
        if (id !== requestId.current) return;
        setOpen(false);
        setFailure({ kind: "client", key: e instanceof ImagePrepError ? e.code : "damaged" });
      }
    },
    [locale, run],
  );

  const picker = usePhotoPicker(selectFile);

  // A medicine's excipients are rarely on the front of the box. A second photo of the
  // composition is read and merged into the result on screen, which stays as it is
  // if that photo can't be read: this step is never required.
  const addExcipients = useCallback(
    async (f: File) => {
      if (!result) return;
      const id = requestId.current;
      cancelInFlight();
      const controller = new AbortController();
      inFlight.current = controller;
      setAdding("working");
      try {
        const prepared = await prepareImage(f);
        URL.revokeObjectURL(prepared.previewUrl);
        const lang = result.meta.locale ?? "en";
        const photo = await analyzeImage(prepared.blob, controller.signal, lang);
        if (id !== requestId.current) return;
        const merged = addExcipientPhoto(result.result, photo.result, lang);
        if (!merged) return setAdding("none");
        setResult({ result: merged, meta: result.meta });
        setAdding(null);
        saveScan({ id: scanId.current, at: Date.now(), thumb: thumb.current, result: merged, meta: result.meta });
      } catch {
        if (id === requestId.current) setAdding("none");
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    },
    [result],
  );
  const excipientPicker = usePhotoPicker(addExcipients);

  // a scanned (or typed) barcode: no photo, the product comes straight from the database
  const selectBarcode = useCallback(
    (code: string) => {
      setScanning(false);
      setComparing(null);
      setOpen(true);
      setImageSrc(null);
      const from: Source = { type: "barcode", code };
      scanId.current = newScanId();
      setSource(from);
      window.scrollTo({ top: 0 });
      void run(from, locale, scanId.current);
    },
    [locale, run],
  );
  const closeScanner = useCallback(() => setScanning(false), []);

  const openSaved = (entry: HistoryEntry) => {
    requestId.current++;
    cancelInFlight();
    scanId.current = entry.id;
    thumb.current = entry.thumb;
    setAdding(null);
    setFailure(null);
    setSource(null);
    setImageSrc(entry.thumb);
    setResult({ result: entry.result, meta: entry.meta });
    setStatus("done");
    setOpen(true);
    window.scrollTo({ top: 0 });
  };

  const reset = () => {
    requestId.current++;
    cancelInFlight();
    setOpen(false);
    setComparing(null);
    setSource(null);
    setImageSrc(null);
    setResult(null);
    setFailure(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const analyze = () => {
    if (source) void run(source, locale, scanId.current);
  };

  // paste an image from the clipboard anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith("image/"));
      if (f) {
        e.preventDefault();
        selectFile(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectFile]);

  // the other medicines scanned on this device, to check the one on screen with
  const history = useHistory();
  const shownEntry = result ? history.find((e) => e.result === result.result) : undefined;
  const otherMedicines = shownEntry?.result.kind === "medicine" ? history.filter((e) => e.result.kind === "medicine" && e !== shownEntry).slice(0, 6) : [];

  const busy = open && (status === "preparing" || status === "analyzing");
  // a saved scan has no photo to send again
  const canRedo = !!source;
  const error = failure && errorText(failure, t, locale);
  const hasPhoto = !!imageSrc || source?.type === "photo" || status === "preparing";
  // the result's text stays in the language it was analyzed in
  const resultLocale = status === "done" && result ? (result.meta.locale ?? "en") : locale;

  return (
    <div
      className="relative flex flex-1 flex-col"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        // dragleave also fires when the pointer moves over the page's own children
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const f = e.dataTransfer.files?.[0];
        if (f) selectFile(f);
      }}
    >
      {picker.elements}
      {excipientPicker.elements}
      {scanning && <BarcodeScanner onCode={selectBarcode} onClose={closeScanner} />}
      {editingProfile && <ProfileSheet onClose={() => setEditingProfile(false)} />}

      <header className="sticky top-0 z-30 border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <button onClick={reset} className="flex min-w-0 items-center gap-2.5 rounded-lg">
            <Logo />
            <span dir="ltr" className="font-display truncate text-[17px] font-bold tracking-tight">
              Food Analyzer
            </span>
          </button>
          <div className="ms-auto flex items-center gap-2">
            <ProfileButton onClick={() => setEditingProfile(true)} />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="pb-dock mx-auto w-full max-w-5xl flex-1 px-4 pt-7 sm:px-6 sm:pt-12">
        {comparing ? (
          <div className="mx-auto max-w-2xl">
            {comparing.every((e) => e.result.kind === "medicine") ? (
              // two medicines aren't compared, they are checked together
              <Together a={comparing[0]} b={comparing[1]} onBack={() => setComparing(null)} />
            ) : (
              <Compare a={comparing[0]} b={comparing[1]} onBack={() => setComparing(null)} />
            )}
          </div>
        ) : !open ? (
          <section className="mx-auto max-w-xl">
            <p className="animate-fade-up eyebrow text-accent">{t.hero.badge}</p>
            <h1 className="animate-fade-up font-display mt-3 text-[2.6rem] leading-[1.02] font-bold tracking-tight text-balance sm:text-6xl">
              {rich(t.hero.title, (word) => (
                <span className="relative inline-block">
                  {/* a highlighter stroke under the word */}
                  <span aria-hidden className="absolute inset-x-[-0.06em] bottom-[0.1em] h-[0.32em] -skew-x-6 rounded-sm bg-accent/25" />
                  <span className="relative">{word}</span>
                </span>
              ))}
            </h1>
            <p className="animate-fade-up mt-4 max-w-md text-base leading-7 text-ink-soft" style={{ animationDelay: "60ms" }}>
              {t.hero.lead}
            </p>

            {error && (
              <Notice tone="red" role="alert" className="animate-fade-up mt-6">
                {error}
              </Notice>
            )}

            <ol className="animate-fade-up mt-9 border-t-[3px] border-ink" style={{ animationDelay: "120ms" }}>
              {t.modes.map((mode, i) => (
                <li key={mode.title} className="flex gap-4 border-b border-rule py-4">
                  <span aria-hidden dir="ltr" className="eyebrow pt-1 text-accent tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <p className="font-display text-lg leading-tight font-semibold">{mode.title}</p>
                    <p className="mt-1 text-sm leading-6 text-ink-soft">{mode.text}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/* dropping and pasting need a mouse and a keyboard */}
            <p className="mt-5 hidden text-sm text-ink-soft [@media(pointer:fine)]:block">
              {t.uploader.hint}{" "}
              <kbd dir="ltr" className="rounded-md border border-rule bg-sheet px-1.5 py-0.5 font-mono text-xs">
                Ctrl V
              </kbd>
            </p>

            <History onOpen={openSaved} onCompare={(a, b) => setComparing([a, b])} />
            <InstallButton />
          </section>
        ) : (
          <div className={cn("grid gap-4", hasPhoto ? "lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10" : "mx-auto max-w-2xl")}>
            <aside className="lg:sticky lg:top-20 lg:self-start">
              {hasPhoto && <Scanner src={imageSrc} scanning={busy} compact={!busy} />}
              {status === "done" && canRedo && (
                <button
                  onClick={analyze}
                  className="mt-2 inline-flex h-10 items-center rounded-full px-1 text-sm font-medium text-accent underline underline-offset-4"
                >
                  {t.actions.analyzeAgain}
                </button>
              )}
            </aside>

            <div className="min-w-0">
              {busy &&
                (source?.type === "barcode" ? (
                  <p aria-live="polite" className="animate-fade-up flex items-center gap-3 rounded-[28px] border border-rule bg-sheet px-5 py-6 text-sm font-medium">
                    <Spinner className="text-accent" />
                    {t.barcode.looking}
                    <span dir="ltr" className="eyebrow ms-auto text-ink-soft">
                      {source.code}
                    </span>
                  </p>
                ) : (
                  <Analyzing />
                ))}
              {status === "done" && result && resultLocale !== locale && (
                <Notice tone="zinc" className="animate-fade-up mb-3">
                  {format(t.status.otherLanguage, { language: languageName(resultLocale) })}{" "}
                  {canRedo && (
                    <button onClick={analyze} className="font-medium text-accent underline underline-offset-4">
                      {t.status.translate}
                    </button>
                  )}
                </Notice>
              )}
              {status === "done" && result && (
                <Content
                  result={result.result}
                  meta={result.meta}
                  onTakePhoto={picker.takePhoto}
                  onAddExcipients={excipientPicker.takePhoto}
                  onEditProfile={() => setEditingProfile(true)}
                  otherMedicines={otherMedicines}
                  onCheckWith={shownEntry ? (other) => setComparing([shownEntry, other]) : undefined}
                  adding={adding}
                />
              )}
              {status === "error" && (
                <div role="alert" className="animate-fade-up overflow-hidden rounded-[28px] border border-rule bg-sheet">
                  <div className="border-t-[3px] border-bad px-5 pt-5 pb-6 sm:px-7">
                    <p className="font-display text-xl font-bold">{t.status.failed}</p>
                    <p className="mt-2 text-sm leading-6 wrap-break-word text-ink-soft">{error}</p>
                    {/* an unknown barcode won't be found by asking again */}
                    {canRedo && !(failure?.kind === "server" && failure.code === "not_found") && (
                      <button
                        onClick={analyze}
                        className="mt-4 inline-flex h-11 items-center rounded-full bg-ink px-5 text-sm font-semibold text-paper transition active:scale-[0.98]"
                      >
                        {t.actions.tryAgain}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
        {/* which version this is: see CHANGELOG.md */}
        <p dir="ltr" className="eyebrow mt-10 text-center text-ink-soft/70">
          Food Analyzer v{process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </main>

      {/* Dock: the one primary action, where the thumb is */}
      <div className="bottom-safe pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4">
        <div className="pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-full border border-rule bg-sheet/95 p-2 shadow-[0_12px_40px_-12px_rgb(0_0_0/0.4)] backdrop-blur">
          {busy ? (
            <>
              <p className="flex min-w-0 flex-1 items-center gap-3 ps-4 text-sm font-medium" aria-live="polite">
                <Spinner className="shrink-0 text-accent" />
                <span className="truncate">{status === "preparing" ? t.actions.preparing : t.actions.analyzing}</span>
              </p>
              <button
                onClick={reset}
                className="h-12 shrink-0 rounded-full border border-rule px-5 text-sm font-semibold transition hover:border-ink active:scale-[0.98]"
              >
                {t.actions.cancel}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={picker.takePhoto}
                className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2 rounded-full bg-accent px-3 text-[15px] font-semibold text-on-accent transition hover:brightness-110 active:scale-[0.98]"
              >
                <CameraIcon className="size-6 shrink-0" />
                <span className="truncate">{open ? t.uploader.retake : t.uploader.takePhoto}</span>
              </button>
              <button
                onClick={picker.choosePhoto}
                aria-label={open ? t.uploader.replace : t.uploader.choosePhoto}
                title={open ? t.uploader.replace : t.uploader.choosePhoto}
                className="grid size-12 shrink-0 place-items-center rounded-full border border-rule transition hover:border-ink active:scale-[0.98]"
              >
                <ImageIcon className="size-5" />
              </button>
              <button
                onClick={() => setScanning(true)}
                aria-label={t.dock.scan}
                title={t.dock.scan}
                className="grid size-12 shrink-0 place-items-center rounded-full border border-rule transition hover:border-ink active:scale-[0.98]"
              >
                <BarcodeIcon className="size-5" />
              </button>
            </>
          )}
        </div>
      </div>

      {dragging && (
        <div className="animate-fade-in pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-[28px] border-2 border-dashed border-accent bg-paper/90">
          <p className="font-display text-2xl font-bold text-accent">{t.uploader.dropHere}</p>
        </div>
      )}
    </div>
  );
}

/** a label with its printed lines */
function Logo() {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-ink text-paper">
      <svg viewBox="0 0 24 24" className="size-4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path d="M5 7h14M5 12h9M5 17h12" />
      </svg>
    </span>
  );
}

async function lookupBarcode(
  code: string,
  signal: AbortSignal,
  locale: Locale,
): Promise<{ result: LabelAnalysis; meta: AnalyzeMeta }> {
  let response: Response;
  try {
    response = await fetch(`/api/product?code=${code}&lang=${locale}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new AnalysisFailure({ kind: "client", key: "timeout" });
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new AnalysisFailure({ kind: "client", key: "network" });
  }
  const data = (await response.json().catch(() => null)) as AnalyzeResponse | null;
  if (data?.ok) return { result: data.result, meta: data.meta };
  if (data && !data.ok) throw new AnalysisFailure({ kind: "server", code: data.code, message: data.error });
  throw new AnalysisFailure({ kind: "status", status: response.status });
}

async function analyzeImage(
  image: Blob,
  signal: AbortSignal,
  locale: Locale,
): Promise<{ result: LabelAnalysis; meta: AnalyzeMeta }> {
  const formData = new FormData();
  formData.append("image", image, "label.jpg");
  // the language the summary, warnings and explanations are written in
  formData.append("lang", locale);

  let response: Response;
  try {
    response = await fetch("/api/analyze", {
      method: "POST",
      body: formData,
      signal: AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new AnalysisFailure({ kind: "client", key: "timeout" });
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new AnalysisFailure({ kind: "client", key: "network" });
  }

  const data = (await response.json().catch(() => null)) as AnalyzeResponse | null;
  if (data?.ok) return { result: data.result, meta: data.meta };
  if (data && !data.ok) throw new AnalysisFailure({ kind: "server", code: data.code, message: data.error });
  throw new AnalysisFailure({ kind: "status", status: response.status });
}
