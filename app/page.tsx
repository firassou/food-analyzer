"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import Content from "./Content";
import Analyzing from "./components/Analyzing";
import AisleScanner from "./components/AisleScanner";
import BarcodeScanner from "./components/BarcodeScanner";
import Compare from "./components/Compare";
import HistoryScreen from "./components/History";
import HomeScreen from "./components/Home";
import InstallButton from "./components/InstallButton";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { usePhotoPicker } from "./components/PhotoPicker";
import ProfileSheet, { ProfileButton } from "./components/ProfileSheet";
import Scanner from "./components/Scanner";
import Shelf from "./components/Shelf";
import Together from "./components/Together";
import { BarcodeIcon, CameraIcon, ClockIcon, cn, ImageIcon, Notice, ShelfIcon, Spinner } from "./components/ui";
import { matchPhoto, type PhotoPrint } from "./lib/client/fingerprint";
import { backfillOfficial, lacksOfficial } from "./lib/client/official";
import { findScan, makeThumb, newScanId, savedScans, saveScan, updateScan, useHistory, type HistoryEntry, type Phrase } from "./lib/client/history";
import { ImagePrepError, prepareImage } from "./lib/client/prepareImage";
import { type Mode, useMode } from "./lib/client/mode";
import { translateResult } from "./lib/client/translate";
import { attentionCount, datedEntries } from "./lib/analysis/cabinet";
import { addExcipientPhoto, withUserMarks } from "./lib/analysis/medicine";
import { remindIfDue } from "./lib/client/reminders";
import type { AnalyzeErrorCode, AnalyzeMeta, AnalyzeResponse, LabelAnalysis } from "./lib/analysis/types";
import { format, rich, useI18n } from "./lib/i18n/I18nProvider";
import { Float, MotionRoot, PageView, PressButton } from "./lib/motion";
import { dateLocale, type Locale } from "./lib/i18n/locales";
import type { Messages } from "./lib/i18n/messages";

/** "similar": the photo looks like a saved scan, and the reader decides whether to analyze it */
type Status = "preparing" | "similar" | "analyzing" | "done" | "error";

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
type Source = { type: "photo"; image: Blob; print?: PhotoPrint } | { type: "barcode"; code: string };

/** the browser gives up a little after the server's own time budget */
const CLIENT_TIMEOUT_MS = 150_000;

export default function Home() {
  const { t, locale, languageName } = useI18n();
  // a scan is on screen: being made, shown, or failed
  const [open, setOpen] = useState(false);
  const [source, setSource] = useState<Source | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [aisle, setAisle] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  // the mode the reader is in: how the app looks, and what a new photo is taken as
  const mode = useMode();
  const modeRef = useRef<Mode>(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  const [comparing, setComparing] = useState<[HistoryEntry, HistoryEntry] | null>(null);
  const [status, setStatus] = useState<Status>("preparing");
  const [result, setResult] = useState<{ result: LabelAnalysis; meta: AnalyzeMeta } | null>(null);
  const [failure, setFailure] = useState<AppError | null>(null);
  // an optional second photo (a medicine's composition) being read into the result on screen
  const [adding, setAdding] = useState<"working" | "none" | null>(null);
  const [dragging, setDragging] = useState(false);
  // the saved scan a new photo looks like (status "similar"), or that an identical photo reopened
  const [lookalike, setLookalike] = useState<HistoryEntry | null>(null);
  const [reused, setReused] = useState(false);
  // the interface language the result on screen failed to be translated into, and a way to try again
  const [translateFailed, setTranslateFailed] = useState<Locale | null>(null);
  const [translateTry, setTranslateTry] = useState(0);
  // translations of a result that isn't saved (a photo of something else) live as long as it is on screen
  const unsavedPhrases = useRef<Phrase[]>([]);
  // bumps on every new file/reset so stale async work is ignored
  const requestId = useRef(0);
  const scanId = useRef("");
  // the same id as state, because the page renders from it (a ref can't be read while rendering)
  const [shownScanId, setShownScanId] = useState("");
  const startScan = useCallback((id: string) => {
    scanId.current = id;
    setShownScanId(id);
  }, []);
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
    setReused(false);
    setTranslateFailed(null);
    unsavedPhrases.current = [];
    try {
      const r =
        from.type === "photo" ?
          await analyzeImage(from.image, controller.signal, lang, modeRef.current)
        : await lookupBarcode(from.code, controller.signal, lang);
      if (id !== requestId.current) return;
      setResult(r);
      setStatus("done");
      window.scrollTo({ top: 0, behavior: "smooth" });
      // remember anything that is about a food; a photo of something else isn't worth keeping
      if (r.result.kind !== "other") {
        thumb.current = from.type === "photo" ? await makeThumb(from.image) : null;
        // a new reading replaces the old one's translations, which no longer match its text
        saveScan({
          id: scanId,
          at: Date.now(),
          thumb: thumb.current,
          result: r.result,
          meta: r.meta,
          phrases: [],
          ...(from.type === "photo" && from.print && { photo: from.print }),
        });
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
      setShelfOpen(false);
      setHistoryOpen(false);
      setOpen(true);
      setSource(null);
      setImageSrc(null);
      setLookalike(null);
      setReused(false);
      setStatus("preparing");
      window.scrollTo({ top: 0 });
      try {
        const prepared = await prepareImage(f);
        if (id !== requestId.current) {
          URL.revokeObjectURL(prepared.previewUrl);
          return;
        }
        const from: Source = { type: "photo", image: prepared.blob, print: prepared.print };
        setSource(from);
        setImageSrc(prepared.previewUrl);
        // a photo already analyzed isn't sent to the AI again
        const match = matchPhoto(prepared.print, savedScans());
        if (match?.kind === "same") {
          showSaved(match.entry);
          setReused(true);
          return;
        }
        if (match?.kind === "similar") {
          // a look-alike may be a new box with another dose in pen: the reader decides
          setLookalike(match.entry);
          setStatus("similar");
          return;
        }
        startScan(newScanId());
        void run(from, locale, scanId.current);
      } catch (e) {
        if (id !== requestId.current) return;
        setOpen(false);
        setFailure({ kind: "client", key: e instanceof ImagePrepError ? e.code : "damaged" });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showSaved only sets state
    [locale, run, startScan],
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

  // the reader's own dose replaces what the photo showed (or adds what it missed), and is kept with the scan
  const changeMarks = useCallback(
    (dose: Parameters<typeof withUserMarks>[1]) => {
      if (!result) return;
      const next = withUserMarks(result.result, dose, result.meta.locale ?? "en");
      setResult({ result: next, meta: result.meta });
      saveScan({ id: scanId.current, at: Date.now(), thumb: thumb.current, result: next, meta: result.meta });
    },
    [result],
  );

  // a scanned (or typed) barcode: no photo, the product comes straight from the database
  const selectBarcode = useCallback(
    (code: string) => {
      setScanning(false);
      setComparing(null);
      setShelfOpen(false);
      setHistoryOpen(false);
      setOpen(true);
      setImageSrc(null);
      const from: Source = { type: "barcode", code };
      startScan(newScanId());
      setSource(from);
      window.scrollTo({ top: 0 });
      void run(from, locale, scanId.current);
    },
    [locale, run, startScan],
  );
  const closeScanner = useCallback(() => setScanning(false), []);
  const closeAisle = useCallback(() => setAisle(false), []);
  const openAisle = useCallback(() => {
    setScanning(false);
    setAisle(true);
  }, []);
  // a badge was tapped: that product opens as if its barcode had been scanned
  const openFromAisle = useCallback(
    (code: string) => {
      setAisle(false);
      selectBarcode(code);
    },
    [selectBarcode],
  );

  /** a saved scan on screen; the photo it came from stays the source when it was just picked again */
  function showSaved(entry: HistoryEntry) {
    startScan(entry.id);
    thumb.current = entry.thumb;
    setAdding(null);
    setFailure(null);
    setReused(false);
    setLookalike(null);
    setTranslateFailed(null);
    unsavedPhrases.current = [];
    setResult({ result: entry.result, meta: entry.meta });
    setStatus("done");
    setOpen(true);
    window.scrollTo({ top: 0 });
  }

  const openSaved = (entry: HistoryEntry) => {
    requestId.current++;
    cancelInFlight();
    setShelfOpen(false);
    setHistoryOpen(false);
    setSource(null);
    setImageSrc(entry.thumb);
    showSaved(entry);
  };

  // the photo looked like a saved scan, and the reader wants it analyzed after all
  const analyzeLookalike = () => {
    if (source?.type !== "photo") return;
    setLookalike(null);
    startScan(newScanId());
    void run(source, locale, scanId.current);
  };

  const reset = () => {
    requestId.current++;
    cancelInFlight();
    setOpen(false);
    setComparing(null);
    setShelfOpen(false);
    setHistoryOpen(false);
    setSource(null);
    setImageSrc(null);
    setResult(null);
    setFailure(null);
    setLookalike(null);
    setReused(false);
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
  // medicines saved before their official product information was fetched get it, once, in the background
  const needsOfficial = history.some((e) => lacksOfficial(e.result));
  useEffect(() => {
    if (!needsOfficial) return;
    const controller = new AbortController();
    void backfillOfficial(controller.signal, (id, official) => {
      if (id === scanId.current) setResult((shown) => shown && { ...shown, result: { ...shown.result, official } });
    });
    return () => controller.abort();
  }, [needsOfficial]);
  // what has expired or is about to, across everything saved: the shelf's badge and the reminder
  const [today] = useState(() => new Date());
  const attention = useMemo(() => attentionCount(datedEntries(history, today)), [history, today]);
  const reminderText = format(t.shelf.notifyBody, { count: attention });
  useEffect(() => {
    void remindIfDue(attention, t.meta.title, reminderText);
  }, [attention, reminderText, t.meta.title]);
  const shownEntry = result ? history.find((e) => e.result === result.result) : undefined;
  const otherMedicines =
    shownEntry?.result.kind === "medicine" ? history.filter((e) => e.result.kind === "medicine" && e !== shownEntry).slice(0, 6) : [];

  const busy = open && (status === "preparing" || status === "analyzing");
  // a saved scan has no photo to send again
  const canRedo = !!source;
  const error = failure && errorText(failure, t, locale);
  const hasPhoto = !!imageSrc || source?.type === "photo" || status === "preparing";
  // A result follows the interface language: what the app wrote is rebuilt on the spot, and the
  // model's own text is translated once (kept with the scan), without reading the photo again.
  const resultLocale = status === "done" && result ? (result.meta.locale ?? "en") : locale;
  const translating = resultLocale !== locale && translateFailed !== locale;
  useEffect(() => {
    if (!translating || !result) return;
    const controller = new AbortController();
    const id = requestId.current;
    const scan = scanId.current;
    const from = result.meta.locale ?? "en";
    const saved = findScan(scan);
    translateResult(result.result, from, locale, saved ? (saved.phrases ?? []) : unsavedPhrases.current, controller.signal)
      .then(({ result: next, phrases }) => {
        if (controller.signal.aborted || id !== requestId.current) return;
        const meta = { ...result.meta, locale };
        setResult({ result: next, meta });
        if (saved) updateScan(scan, { result: next, meta, phrases });
        else unsavedPhrases.current = phrases;
      })
      .catch(() => {
        if (!controller.signal.aborted && id === requestId.current) setTranslateFailed(locale);
      });
    return () => controller.abort();
  }, [translating, result, locale, translateTry]);

  // a medicine on screen is always shown in Medicine Mode, and any other result in Food mode
  const shownMode: Mode = open && status === "done" && result ? (result.result.kind === "medicine" ? "medicine" : "food") : mode;

  return (
    <MotionRoot mode={shownMode}>
    <div
      data-mode={shownMode}
      className="mode-root relative flex flex-1 flex-col"
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
      {scanning && <BarcodeScanner onCode={selectBarcode} onClose={closeScanner} onAisle={openAisle} />}
      {aisle && <AisleScanner onOpen={openFromAisle} onClose={closeAisle} />}
      {editingProfile && <ProfileSheet onClose={() => setEditingProfile(false)} />}

      <header className="sticky top-0 z-30 border-b border-ink/5 bg-paper/70 backdrop-blur-xl backdrop-saturate-150 print:hidden">
        <div className="mx-auto flex h-16 max-w-5xl items-center gap-3 px-4 sm:px-6">
          <button onClick={reset} className="-ms-1 flex min-w-0 items-center gap-3 rounded-2xl p-1">
            <Logo />
            {/* hidden from sight on a narrow phone, but still the button's name */}
            <span dir="ltr" className="font-display sr-only truncate text-lg font-semibold tracking-tight min-[430px]:not-sr-only">
              LabelSight
            </span>
          </button>
          <div className="ms-auto flex items-center gap-2">
            {history.length > 0 && (
              <button
                onClick={() => {
                  setHistoryOpen(true);
                  setShelfOpen(false);
                  setComparing(null);
                  window.scrollTo({ top: 0 });
                }}
                aria-label={t.historyScreen.title}
                title={t.historyScreen.title}
                className="grid size-11 place-items-center rounded-full bg-mute-soft transition hover:bg-rule"
              >
                <ClockIcon className="size-5" />
              </button>
            )}
            {history.length > 0 && (
              <button
                onClick={() => {
                  setHistoryOpen(false);
                  setShelfOpen(true);
                  setComparing(null);
                  window.scrollTo({ top: 0 });
                }}
                aria-label={t.shelf.open}
                title={t.shelf.open}
                className="relative grid size-11 place-items-center rounded-full bg-mute-soft transition hover:bg-rule"
              >
                <ShelfIcon className="size-5" />
                {attention > 0 && (
                  <span
                    aria-hidden
                    className="absolute -end-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full border-2 border-paper bg-bad px-1 text-[10px] leading-4 font-bold text-white"
                  >
                    {attention}
                  </span>
                )}
              </button>
            )}
            <ProfileButton onClick={() => setEditingProfile(true)} />
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="pb-dock mx-auto w-full max-w-5xl flex-1 px-4 pt-7 sm:px-6 sm:pt-12">
        <AnimatePresence mode="wait" initial={false}>
        <PageView key={shelfOpen ? "shelf" : comparing ? "compare" : historyOpen ? "history" : !open ? "home" : "result"}>
        {shelfOpen ?
          <div className="mx-auto max-w-2xl">
            <Shelf onBack={() => setShelfOpen(false)} onOpen={openSaved} />
          </div>
        : comparing ?
          <div className="mx-auto max-w-2xl">
            {comparing.every((e) => e.result.kind === "medicine") ?
              // two medicines aren't compared, they are checked together
              <Together a={comparing[0]} b={comparing[1]} onBack={() => setComparing(null)} />
            : <Compare a={comparing[0]} b={comparing[1]} onBack={() => setComparing(null)} />}
          </div>
        : historyOpen ?
          <div className="mx-auto max-w-2xl">
            <HistoryScreen
              onBack={() => setHistoryOpen(false)}
              onOpen={openSaved}
              onCompare={(a, b) => {
                setHistoryOpen(false);
                setComparing([a, b]);
              }}
            />
          </div>
        : !open ?
          <>
            <HomeScreen
              mode={mode}
              attention={attention}
              error={error}
              onCamera={picker.takePhoto}
              onUpload={picker.choosePhoto}
              onBarcode={() => setScanning(true)}
              onOpen={openSaved}
              onHistory={() => {
                setHistoryOpen(true);
                window.scrollTo({ top: 0 });
              }}
              onShelf={() => {
                setShelfOpen(true);
                window.scrollTo({ top: 0 });
              }}
              onWatchlist={() => setEditingProfile(true)}
            />
            <div className="mx-auto max-w-2xl">
              <InstallButton />
            </div>
          </>
        : <div className={cn("grid gap-4", hasPhoto ? "lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)] lg:gap-10" : "mx-auto max-w-2xl")}>
            <aside className="lg:sticky lg:top-20 lg:self-start">
              {hasPhoto && <Scanner src={imageSrc} scanning={busy} compact={!busy} />}
              {status === "done" && canRedo && (
                <button
                  onClick={analyze}
                  className="mt-2 inline-flex h-11 items-center rounded-control px-1 text-sm font-medium text-accent underline underline-offset-4"
                >
                  {t.actions.analyzeAgain}
                </button>
              )}
            </aside>

            <div className="min-w-0">
              {busy &&
                (source?.type === "barcode" ?
                  <p
                    aria-live="polite"
                    className="animate-fade-up flex items-center gap-3 rounded-card bg-sheet px-5 py-6 text-sm font-medium ring-1 ring-rule"
                  >
                    <Spinner className="text-accent" />
                    {t.barcode.looking}
                    <span dir="ltr" className="eyebrow ms-auto tabular-nums text-ink-soft">
                      {source.code}
                    </span>
                  </p>
                : <Analyzing />)}
              {status === "similar" && lookalike && (
                <Lookalike entry={lookalike} onOpen={() => showSaved(lookalike)} onAnalyze={analyzeLookalike} />
              )}
              {status === "done" && result && reused && (
                <Notice tone="zinc" className="animate-fade-up mb-3">
                  {t.duplicate.reused}
                </Notice>
              )}
              {status === "done" && result && resultLocale !== locale && (
                <Notice tone="zinc" className="animate-fade-up mb-3">
                  {translating ?
                    <span role="status" className="inline-flex items-center gap-2">
                      <Spinner className="text-accent" />
                      {t.status.translating}
                    </span>
                  : <>
                      {format(t.status.translateFailed, { language: languageName(resultLocale) })}{" "}
                      <button
                        onClick={() => {
                          setTranslateFailed(null);
                          setTranslateTry((n) => n + 1);
                        }}
                        className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4"
                      >
                        {t.status.retryTranslate}
                      </button>
                    </>
                  }
                </Notice>
              )}
              {status === "done" && result && (
                <Content
                  result={result.result}
                  meta={result.meta}
                  onTakePhoto={picker.takePhoto}
                  onAddExcipients={excipientPicker.takePhoto}
                  onEditProfile={() => setEditingProfile(true)}
                  onMarksChange={changeMarks}
                  onOpenBarcode={selectBarcode}
                  otherMedicines={otherMedicines}
                  onCheckWith={shownEntry ? (other) => setComparing([shownEntry, other]) : undefined}
                  adding={adding}
                  ask={{ scanId: shownScanId, chat: history.find((e) => e.id === shownScanId)?.chat }}
                />
              )}
              {status === "error" && (
                <div role="alert" className="animate-fade-up overflow-hidden rounded-card bg-bad-soft ring-1 ring-bad/20">
                  <div className="px-5 pt-5 pb-6 sm:px-7">
                    <p className="font-display text-xl font-bold">{t.status.failed}</p>
                    <p className="mt-2 text-sm leading-6 wrap-break-word text-ink-soft">{error}</p>
                    {/* an unknown barcode won't be found by asking again */}
                    {canRedo && !(failure?.kind === "server" && failure.code === "not_found") && (
                      <button
                        onClick={analyze}
                        className="mt-4 inline-flex h-11 items-center rounded-control bg-ink px-5 text-sm font-semibold text-paper transition active:scale-[0.98]"
                      >
                        {t.actions.tryAgain}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        }
        </PageView>
        </AnimatePresence>
        {/* which version this is: see CHANGELOG.md */}
        <p dir="ltr" className="eyebrow mt-10 text-center text-ink-soft/70 tabular-nums">
          LabelSight v{process.env.NEXT_PUBLIC_APP_VERSION}
        </p>
      </main>

      {/* Dock: the one primary action, where the thumb is */}
      <div
        className={cn("bottom-safe pointer-events-none fixed inset-x-0 z-40 flex justify-center px-4 print:hidden", !open && "hidden")}
      >
        <Float className="glass pointer-events-auto flex w-full max-w-md items-center gap-2 rounded-card p-2">
          {busy ?
            <>
              <p className="flex min-w-0 flex-1 items-center gap-3 ps-4 text-sm font-medium" aria-live="polite">
                <Spinner className="shrink-0 text-accent" />
                <span className="truncate">{status === "preparing" ? t.actions.preparing : t.actions.analyzing}</span>
              </p>
              <PressButton
                onClick={reset}
                className="h-14 shrink-0 rounded-control bg-mute-soft px-6 text-sm font-semibold transition-colors hover:bg-rule"
              >
                {t.actions.cancel}
              </PressButton>
            </>
          : <>
              <PressButton
                onClick={picker.takePhoto}
                className="flex h-14 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-control bg-brand px-3 text-[15px] font-semibold text-on-accent transition-[filter] hover:brightness-110"
              >
                <CameraIcon className="size-6 shrink-0" />
                <span className="truncate">{open ? t.uploader.retake : t.uploader.takePhoto}</span>
              </PressButton>
              <PressButton
                onClick={picker.choosePhoto}
                aria-label={open ? t.uploader.replace : t.uploader.choosePhoto}
                title={open ? t.uploader.replace : t.uploader.choosePhoto}
                className="grid size-14 shrink-0 place-items-center rounded-control bg-mute-soft transition-colors hover:bg-rule"
              >
                <ImageIcon className="size-5" />
              </PressButton>
              <PressButton
                onClick={() => setScanning(true)}
                aria-label={t.dock.scan}
                title={t.dock.scan}
                className="grid size-14 shrink-0 place-items-center rounded-control bg-mute-soft transition-colors hover:bg-rule"
              >
                <BarcodeIcon className="size-5" />
              </PressButton>
            </>
          }
        </Float>
      </div>

      {dragging && (
        <div className="animate-fade-in pointer-events-none fixed inset-3 z-50 grid place-items-center rounded-card border-2 border-dashed border-accent bg-paper/90">
          <p className="font-display text-2xl font-bold text-accent">{t.uploader.dropHere}</p>
        </div>
      )}
    </div>
    </MotionRoot>
  );
}

/** the new photo looks like a scan already saved: open that one, or analyze this one */
function Lookalike({ entry, onOpen, onAnalyze }: { entry: HistoryEntry; onOpen: () => void; onAnalyze: () => void }) {
  const { t, locale } = useI18n();
  const d = t.duplicate;
  // an older scan says which year, or "14 October" reads as last week
  const thisYear = new Date(entry.at).getFullYear() === new Date().getFullYear();
  const date = new Intl.DateTimeFormat(dateLocale(locale), { day: "numeric", month: "long", ...(!thisYear && { year: "numeric" }) }).format(entry.at);
  const name = entry.result.product.name ?? entry.result.product.category ?? t.kinds[entry.result.kind];
  return (
    <section aria-labelledby="lookalike-title" className="animate-fade-up rounded-card bg-sheet px-5 py-6 ring-1 ring-rule sm:px-7">
      <div aria-live="polite" className="flex items-center gap-4">
        {entry.thumb && (
          // eslint-disable-next-line @next/next/no-img-element -- a data URL kept in the browser
          <img src={entry.thumb} alt="" className="size-16 shrink-0 rounded-2xl object-cover ring-1 ring-rule" />
        )}
        <div className="min-w-0">
          <p id="lookalike-title" className="font-display text-lg font-semibold">
            {d.title}
          </p>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            {rich(format(d.text, { name: `<b>${name}</b>`, date }), (text) => (
              <b dir="auto" className="text-ink">
                {text}
              </b>
            ))}
          </p>
        </div>
      </div>
      {entry.result.kind === "medicine" && <p className="mt-3 text-sm leading-6 text-ink-soft">{d.medicineHint}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={onOpen}
          className="inline-flex h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-on-accent transition active:scale-[0.98]"
        >
          {d.open}
        </button>
        <button
          onClick={onAnalyze}
          className="inline-flex h-11 items-center rounded-control bg-mute-soft px-5 text-sm font-semibold transition hover:bg-rule active:scale-[0.98]"
        >
          {d.analyze}
        </button>
      </div>
    </section>
  );
}

/** a leaf inside a scanner's corner marks: the same mark as the app icon */
function Logo() {
  return (
    <svg viewBox="0 0 64 64" className="size-9 shrink-0 drop-shadow-[0_4px_10px_color-mix(in_srgb,var(--glow)_45%,transparent)]" aria-hidden>
      <defs>
        <linearGradient id="ls-logo" x1="6" y1="4" x2="58" y2="60" gradientUnits="userSpaceOnUse">
          <stop stopColor="#10b981" />
          <stop offset="1" stopColor="#0f766e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="18" fill="url(#ls-logo)" />
      <g fill="none" stroke="#fff" strokeWidth="4.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 24v-5a5 5 0 0 1 5-5h5M40 14h5a5 5 0 0 1 5 5v5M50 40v5a5 5 0 0 1-5 5h-5M24 50h-5a5 5 0 0 1-5-5v-5" strokeOpacity=".7" />
        <path d="m22.5 33 7 7 12.5-14.5" strokeWidth="5.2" />
      </g>
    </svg>
  );
}

async function lookupBarcode(code: string, signal: AbortSignal, locale: Locale): Promise<{ result: LabelAnalysis; meta: AnalyzeMeta }> {
  let response: Response;
  try {
    response = await fetch(`/api/product?code=${encodeURIComponent(code)}&lang=${locale}`, { signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]) });
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

async function analyzeImage(image: Blob, signal: AbortSignal, locale: Locale, mode: Mode = "food"): Promise<{ result: LabelAnalysis; meta: AnalyzeMeta }> {
  const formData = new FormData();
  formData.append("image", image, "label.jpg");
  // the language the summary, warnings and explanations are written in
  formData.append("lang", locale);
  // taken in Medicine Mode: a hint for the model, which still says what the photo really shows
  if (mode === "medicine") formData.append("mode", "medicine");

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
