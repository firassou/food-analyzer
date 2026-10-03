"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Content from "./Content";
import Uploader from "./components/Uploader";
import Scanner from "./components/Scanner";
import Analyzing from "./components/Analyzing";
import LanguageSwitcher from "./components/LanguageSwitcher";
import { cn, Spinner } from "./components/ui";
import { ImagePrepError, prepareImage } from "./lib/client/prepareImage";
import type { AnalyzeErrorCode, AnalyzeMeta, AnalyzeResponse, LabelAnalysis } from "./lib/analysis/types";
import { format, rich, useI18n } from "./lib/i18n/I18nProvider";
import type { Locale } from "./lib/i18n/locales";
import type { Messages } from "./lib/i18n/messages";

type Status = "preparing" | "ready" | "analyzing" | "done" | "error";

/** in the order of `features` in the dictionaries */
const FEATURE_ICONS = ["⚠️", "🧪", "📊"];

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

/** the browser gives up a little after the server's own time budget */
const CLIENT_TIMEOUT_MS = 150_000;

export default function Home() {
  const { t, locale, languageName } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<Blob | null>(null);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("ready");
  const [result, setResult] = useState<{ result: LabelAnalysis; meta: AnalyzeMeta } | null>(null);
  const [failure, setFailure] = useState<AppError | null>(null);
  // bumps on every new file/reset so stale async work is ignored
  const requestId = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const cancelInFlight = () => {
    inFlight.current?.abort();
    inFlight.current = null;
  };

  // free the preview's object URL when it's replaced or the page unmounts
  useEffect(() => {
    return () => {
      if (imageSrc) URL.revokeObjectURL(imageSrc);
    };
  }, [imageSrc]);
  useEffect(() => () => inFlight.current?.abort(), []);

  const selectFile = useCallback(async (f: File) => {
    const id = ++requestId.current;
    cancelInFlight();
    setFailure(null);
    setResult(null);
    setFile(f);
    setUpload(null);
    setImageSrc(null);
    setStatus("preparing");
    try {
      const prepared = await prepareImage(f);
      if (id !== requestId.current) {
        URL.revokeObjectURL(prepared.previewUrl);
        return;
      }
      setUpload(prepared.blob);
      setImageSrc(prepared.previewUrl);
      setStatus("ready");
    } catch (e) {
      if (id !== requestId.current) return;
      setFile(null);
      setStatus("ready");
      setFailure({ kind: "client", key: e instanceof ImagePrepError ? e.code : "damaged" });
    }
  }, []);

  const reset = () => {
    requestId.current++;
    cancelInFlight();
    setFile(null);
    setUpload(null);
    setImageSrc(null);
    setResult(null);
    setFailure(null);
    setStatus("ready");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelAnalysis = () => {
    requestId.current++;
    cancelInFlight();
    setStatus("ready");
  };

  const analyze = async () => {
    if (!upload) return;
    const id = ++requestId.current;
    cancelInFlight();
    const controller = new AbortController();
    inFlight.current = controller;
    setStatus("analyzing");
    setFailure(null);
    setResult(null);
    // on small screens the results are below the image; bring them into view
    if (window.innerWidth < 1024) {
      requestAnimationFrame(() =>
        resultsRef.current?.scrollIntoView({ behavior: "smooth" }),
      );
    }
    try {
      const r = await analyzeImage(upload, controller.signal, locale);
      if (id !== requestId.current) return;
      setResult(r);
      setStatus("done");
    } catch (e) {
      if (id !== requestId.current) return;
      setFailure(e instanceof AnalysisFailure ? e.detail : { kind: "client", key: "network" });
      setStatus("error");
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  };

  // paste an image from the clipboard anywhere on the page
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = Array.from(e.clipboardData?.files ?? []).find((f) =>
        f.type.startsWith("image/"),
      );
      if (f) {
        e.preventDefault();
        selectFile(f);
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [selectFile]);

  const analyzing = status === "analyzing";
  const error = failure && errorText(failure, t, locale);
  // the result's text stays in the language it was analyzed in
  const resultLocale = status === "done" && result ? (result.meta.locale ?? "en") : locale;

  return (
    <div className="relative flex flex-1 flex-col overflow-x-clip bg-zinc-50 dark:bg-black">
      {/* ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-130 bg-[radial-gradient(60%_60%_at_50%_0%,rgb(16_185_129/0.14),transparent)] dark:bg-[radial-gradient(60%_60%_at_50%_0%,rgb(16_185_129/0.18),transparent)]"
      />

      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/70 backdrop-blur-lg dark:border-zinc-800/70 dark:bg-black/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <button
            onClick={reset}
            className="flex min-w-0 items-center gap-2.5 font-semibold tracking-tight text-zinc-900 dark:text-zinc-100"
          >
            <Logo />
            <span className="truncate">Food Analyzer</span>
          </button>
          <div className="ms-auto flex items-center gap-1">
            {file && (
              <button
                onClick={reset}
                className="animate-fade-in rounded-xl px-3 py-1.5 text-sm font-medium whitespace-nowrap text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100"
              >
                {t.header.newScan}
              </button>
            )}
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 lg:py-14">
        {!file ? (
          <section className="mx-auto max-w-2xl">
            <div className="animate-fade-up text-center">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-300">
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                </span>
                {t.hero.badge}
              </span>
              <h1 className="mt-5 text-4xl font-semibold tracking-tight text-balance text-zinc-900 sm:text-5xl dark:text-zinc-50">
                {rich(t.hero.title, (word) => (
                  <span className="bg-linear-to-r from-emerald-500 to-teal-500 bg-clip-text text-transparent">
                    {word}
                  </span>
                ))}
              </h1>
              <p className="mx-auto mt-4 max-w-lg text-base leading-7 text-pretty text-zinc-600 sm:text-lg dark:text-zinc-400">
                {t.hero.lead}
              </p>
            </div>

            <div
              className="animate-fade-up mt-10"
              style={{ animationDelay: "120ms" }}
            >
              <Uploader onFile={selectFile} />
              {error && <ErrorBanner message={error} />}
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-3">
              {t.features.map((f, i) => (
                <div
                  key={f.title}
                  style={{ animationDelay: `${240 + i * 80}ms` }}
                  className="animate-fade-up rounded-2xl border border-zinc-200 bg-white/70 p-4 backdrop-blur transition hover:-translate-y-0.5 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-950/70"
                >
                  <span className="text-xl" aria-hidden>
                    {FEATURE_ICONS[i]}
                  </span>
                  <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    {f.title}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
                    {f.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,380px)_minmax(0,1fr)] lg:gap-10">
            <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
              <Scanner src={imageSrc} file={file} scanning={analyzing} />

              <div className="flex gap-2">
                <button
                  onClick={analyze}
                  disabled={analyzing || !upload}
                  className={cn(
                    "inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-linear-to-r from-emerald-500 to-teal-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-emerald-600/25 transition",
                    "hover:shadow-xl hover:shadow-emerald-600/30 hover:brightness-110 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-70",
                  )}
                >
                  {analyzing ? (
                    <>
                      <Spinner /> {t.actions.analyzing}
                    </>
                  ) : status === "preparing" ? (
                    <>
                      <Spinner /> {t.actions.preparing}
                    </>
                  ) : status === "done" ? (
                    t.actions.analyzeAgain
                  ) : (
                    t.actions.analyze
                  )}
                </button>
                {analyzing ? (
                  <button
                    onClick={cancelAnalysis}
                    className="rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300 dark:hover:bg-zinc-900"
                  >
                    {t.actions.cancel}
                  </button>
                ) : (
                  <Uploader onFile={selectFile} compact />
                )}
              </div>

              {error && status !== "error" && <ErrorBanner message={error} />}
            </aside>

            <div ref={resultsRef} className="min-w-0 scroll-mt-20">
              {status === "analyzing" && <Analyzing />}
              {status === "done" && result && resultLocale !== locale && (
                <div
                  role="note"
                  className="animate-fade-up mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-zinc-200 bg-white p-4 text-sm text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-400"
                >
                  <span>
                    🌐 {format(t.status.otherLanguage, { language: languageName(resultLocale) })}
                  </span>
                  <button
                    onClick={analyze}
                    className="font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
                  >
                    {t.status.translate}
                  </button>
                </div>
              )}
              {status === "done" && result && <Content result={result.result} meta={result.meta} />}
              {status === "error" && (
                <div className="animate-fade-up rounded-3xl border border-red-200 bg-red-50 p-6 dark:border-red-900 dark:bg-red-950/30">
                  <p className="font-semibold text-red-800 dark:text-red-200">
                    {t.status.failed}
                  </p>
                  <p className="mt-1 text-sm wrap-break-word text-red-700 dark:text-red-300">
                    {error}
                  </p>
                  <button
                    onClick={analyze}
                    className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700 active:scale-[0.98]"
                  >
                    {t.actions.tryAgain}
                  </button>
                </div>
              )}
              {(status === "ready" || status === "preparing") && (
                <div className="animate-fade-up flex h-full min-h-64 flex-col items-center justify-center rounded-3xl border-2 border-dashed border-zinc-200 p-8 text-center dark:border-zinc-800">
                  <span className="animate-float text-4xl" aria-hidden>
                    🔍
                  </span>
                  <p className="mt-4 font-semibold text-zinc-900 dark:text-zinc-100">
                    {t.status.readyTitle}
                  </p>
                  <p className="mt-1 max-w-xs text-sm text-zinc-500 dark:text-zinc-400">
                    {rich(t.status.readyText, (label) => (
                      <b>{label}</b>
                    ))}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="animate-fade-up mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
    >
      {message}
    </p>
  );
}

function Logo() {
  return (
    <span className="grid size-8 place-items-center rounded-xl bg-linear-to-br from-emerald-500 to-teal-600 text-white shadow-md shadow-emerald-600/30">
      <svg
        viewBox="0 0 24 24"
        className="size-4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
      </svg>
    </span>
  );
}

// functions
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
    if (e instanceof DOMException && e.name === "TimeoutError")
      throw new AnalysisFailure({ kind: "client", key: "timeout" });
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new AnalysisFailure({ kind: "client", key: "network" });
  }

  const data = (await response.json().catch(() => null)) as AnalyzeResponse | null;
  if (data?.ok) return { result: data.result, meta: data.meta };
  if (data && !data.ok) throw new AnalysisFailure({ kind: "server", code: data.code, message: data.error });
  throw new AnalysisFailure({ kind: "status", status: response.status });
}
