"use client";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { cleanTurns, MAX_QUESTION_CHARS, splitAnswer } from "../lib/analysis/ask";
import { type AskContext, buildAskContext, hasPersonalContext } from "../lib/analysis/askContext";
import { checkShelf } from "../lib/analysis/cabinet";
import type { AnalyzeErrorCode, AskResponse, ChatTurn, LabelAnalysis } from "../lib/analysis/types";
import { setAskPersonal, useAskPersonal } from "../lib/client/askPersonal";
import { saveChat, useHistory } from "../lib/client/history";
import { useProfile } from "../lib/client/profile";
import { SPEECH_LANG, speechSupported, startSpeech } from "../lib/client/speech";
import { useI18n } from "../lib/i18n/I18nProvider";
import type { Messages } from "../lib/i18n/messages";
import { MicIcon, Notice, SendIcon, SparkleIcon, Spinner } from "./ui";
import { GeneralChip } from "./result/bits";

// must stay above the server's deadline and maxDuration (60 s) in api/ask/route.ts
const CLIENT_TIMEOUT_MS = 75_000;

class AskFailure extends Error {
  constructor(public code: AnalyzeErrorCode | "network" | "timeout" | "status") {
    super(code);
  }
}

/** what the question is about: one scanned product, or the medicines on the shelf */
type Subject = { result: LabelAnalysis } | { cabinet: LabelAnalysis[] };

async function ask(question: string, history: ChatTurn[], subject: Subject, lang: string, signal: AbortSignal, context?: AskContext): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, history, ...subject, lang, context }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") throw new AskFailure("timeout");
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new AskFailure("network");
  }
  const data = (await response.json().catch(() => null)) as AskResponse | null;
  if (data?.ok) return data.answer;
  throw new AskFailure(data && !data.ok ? data.code : "status");
}

function errorText(code: AskFailure["code"], t: Messages): string {
  if (code === "network" || code === "timeout") return t.errors[code];
  if (code === "status") return t.errors.server.internal;
  return t.errors.server[code];
}

/**
 * Follow-up questions about the scanned product. The conversation is kept with the saved
 * scan (see `saveChat`). The answer is text from the model: what it says about the product
 * is told apart from general knowledge, which carries the amber stamp.
 */
export default function AskAi({
  scanId,
  result,
  cabinet,
  persist,
  initialChat,
  request,
}: {
  scanId: string;
  /** the scanned product the questions are about… */
  result?: LabelAnalysis;
  /** …or the medicines on the shelf, when the conversation is about all of them */
  cabinet?: LabelAnalysis[];
  /** where the conversation is kept; by default with the saved scan `scanId` */
  persist?: (turns: ChatTurn[]) => void;
  initialChat?: ChatTurn[];
  /** a question asked from elsewhere on the sheet (an additive's "Ask AI"): sent once per `n` */
  request?: { text: string; n: number } | null;
}) {
  const { t, locale } = useI18n();
  const a = t.ask;
  const shelf = !!cabinet;
  const medicine = shelf || result?.kind === "medicine";
  const suggestions =
    shelf ? a.suggestionsShelf
    : medicine ? a.suggestionsMedicine
    : a.suggestions;
  // what the reader may tell the AI about themselves: only offered for one product, only when there is something to tell
  const profile = useProfile();
  const entries = useHistory();
  const personalOn = useAskPersonal();
  const shelfMedicines = checkShelf(entries).medicines.map((e) => ({ name: e.result.product.name ?? e.result.product.category ?? "medicine", medicine: e.result.medicine }));
  const canPersonalise = !!result && !cabinet && hasPersonalContext(profile, shelfMedicines);
  const save = persist ?? ((turns: ChatTurn[]) => saveChat(scanId, turns));
  const subject: Subject | null =
    cabinet ? { cabinet }
    : result ? { result }
    : null;
  const [turns, setTurns] = useState<ChatTurn[]>(() => cleanTurns(initialChat));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AskFailure["code"] | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  // dictation: only where the browser can do it; what is heard goes into the box to be read before it is sent
  const canSpeak = useSyncExternalStore(
    () => () => undefined,
    speechSupported,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const stopListening = useRef<(() => void) | null>(null);
  const toggleListening = () => {
    if (listening) {
      stopListening.current?.();
      return;
    }
    setListening(true);
    stopListening.current = startSpeech(SPEECH_LANG[locale], setDraft, () => {
      stopListening.current = null;
      setListening(false);
    });
  };
  const log = useRef<HTMLDivElement>(null);

  useEffect(
    () => () => {
      inFlight.current?.abort();
      stopListening.current?.();
    },
    [],
  );

  const send = async (raw: string) => {
    const question = raw.trim();
    if (!question || pending || !subject) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true);
    setFailure(null);
    setDraft("");
    const asked: ChatTurn[] = [...turns, { role: "user", text: question }];
    setTurns(asked);
    try {
      const context = canPersonalise && personalOn && result ? buildAskContext(result, profile, shelfMedicines) : undefined;
      const answer = await ask(question, turns, subject, locale, controller.signal, context);
      const next: ChatTurn[] = [...asked, { role: "assistant", text: answer }];
      setTurns(next);
      save(next);
      requestAnimationFrame(() => log.current?.lastElementChild?.scrollIntoView({ block: "nearest", behavior: "smooth" }));
    } catch (e) {
      if (controller.signal.aborted) return;
      // an unanswered question isn't kept: it goes back to the box to be sent again
      setTurns(turns);
      setDraft(question);
      setFailure(e instanceof AskFailure ? e.code : "network");
    } finally {
      if (inFlight.current === controller) {
        inFlight.current = null;
        setPending(false);
      }
    }
  };

  // a question from another part of the sheet is asked as if it had been typed here
  const handled = useRef(0);
  useEffect(() => {
    if (!request || request.n === handled.current) return;
    handled.current = request.n;
    void send(request.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `send` is rebuilt every render; only a new request should fire it
  }, [request]);

  const clear = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    setPending(false);
    setFailure(null);
    setTurns([]);
    save([]);
  };

  return (
    <div>
      <p className="text-sm leading-6 text-ink-soft">
        {shelf ?
          a.introShelf
        : medicine ?
          a.introMedicine
        : a.intro}
      </p>

      {turns.length > 0 && (
        <div ref={log} role="log" aria-live="polite" className="mt-4 space-y-4">
          {turns.map((turn, i) =>
            turn.role === "user" ?
              <div key={i} className="flex flex-col items-end gap-1">
                <span className="eyebrow text-ink-soft">{a.you}</span>
                <p
                  dir="auto"
                  className="max-w-[85%] rounded-3xl rounded-ee-lg bg-accent px-4 py-2.5 text-[15px] leading-6 wrap-break-word text-on-accent"
                >
                  {turn.text}
                </p>
              </div>
            : <div key={i} className="flex flex-col items-start gap-1">
                <span className="eyebrow inline-flex items-center gap-1.5 text-ink-soft">
                  <SparkleIcon className="size-3.5 text-accent" />
                  {a.answer}
                </span>
                <div className="w-full max-w-[94%] space-y-3 rounded-3xl rounded-es-lg bg-mute-soft/70 px-4 py-3.5">
                  {splitAnswer(turn.text).map((block, j) => (
                    <div key={j}>
                      {block.general && (
                        <span title={a.generalHint} className="mb-1.5 inline-flex">
                          <GeneralChip>{a.general}</GeneralChip>
                        </span>
                      )}
                      <p dir="auto" className="text-[15px] leading-7 wrap-break-word">
                        {block.text}
                      </p>
                    </div>
                  ))}
                </div>
              </div>,
          )}
          {pending && (
            <div className="flex items-center gap-2 text-sm text-ink-soft" role="status">
              <Spinner /> {a.thinking}
            </div>
          )}
        </div>
      )}

      {turns.length === 0 && (
        <ul className="mt-4 flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                disabled={pending}
                onClick={() => send(s)}
                className="inline-flex min-h-11 items-center gap-2 rounded-full bg-sheet px-4 py-2 text-start text-sm font-medium ring-1 ring-rule transition hover:bg-accent-soft hover:text-on-accent-soft hover:ring-accent focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.98] disabled:opacity-50"
              >
                <SparkleIcon className="size-4 shrink-0 text-accent" />
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}

      {failure && (
        <Notice tone="red" role="alert" className="mt-4">
          {errorText(failure, t)}
        </Notice>
      )}

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={MAX_QUESTION_CHARS}
          dir="auto"
          enterKeyHint="send"
          autoComplete="off"
          placeholder={
            shelf ? a.placeholderShelf
            : medicine ?
              a.placeholderMedicine
            : a.placeholder
          }
          aria-label={
            shelf ? a.placeholderShelf
            : medicine ?
              a.placeholderMedicine
            : a.placeholder
          }
          className="h-12 min-w-0 flex-1 rounded-full bg-mute-soft px-5 text-base placeholder:text-ink-soft focus-visible:outline-2 focus-visible:outline-accent"
        />
        {canSpeak && (
          <button
            type="button"
            onClick={toggleListening}
            aria-pressed={listening}
            aria-label={listening ? a.micListening : a.mic}
            title={listening ? a.micListening : a.mic}
            className={
              listening ?
                "relative grid size-12 shrink-0 place-items-center rounded-full bg-bad-soft text-bad ring-2 ring-bad transition active:scale-[0.96]"
              : "grid size-12 shrink-0 place-items-center rounded-full bg-mute-soft transition hover:bg-rule active:scale-[0.96]"
            }
          >
            {listening && <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-bad/25" />}
            <MicIcon className="relative size-5" />
          </button>
        )}
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          aria-label={a.send}
          title={a.send}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-accent text-on-accent transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent hover:brightness-110 active:scale-[0.96] disabled:opacity-50"
        >
          {pending ?
            <Spinner />
          : <SendIcon className="size-5 rtl:-scale-x-100" />}
        </button>
      </form>

      {canPersonalise && (
        <button
          type="button"
          role="switch"
          aria-checked={personalOn}
          aria-labelledby="ask-personal-label"
          aria-describedby="ask-personal-hint"
          onClick={() => setAskPersonal(!personalOn)}
          className="mt-3 flex min-h-11 w-full items-start gap-3 rounded-2xl bg-mute-soft/60 p-3.5 text-start transition hover:bg-mute-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span
            aria-hidden
            className={`relative mt-0.5 h-7 w-12 shrink-0 rounded-full transition ${personalOn ? "bg-accent" : "bg-sheet ring-2 ring-ink-soft ring-inset"}`}
          >
            <span className={`absolute top-1 size-5 rounded-full transition-all ${personalOn ? "start-6 bg-on-accent" : "start-1 bg-ink-soft"}`} />
          </span>
          <span className="min-w-0">
            <span id="ask-personal-label" className="block text-sm font-medium">
              {a.personal}
            </span>
            <span id="ask-personal-hint" className="mt-0.5 block text-xs leading-5 text-ink-soft rtl:leading-6">
              {a.personalHint}
            </span>
          </span>
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-xs leading-5 text-ink-soft">{medicine ? a.disclaimerMedicine : a.disclaimer}{canSpeak && ` ${a.micNote}`}</p>
        {turns.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="min-h-11 text-xs font-medium text-accent underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-accent"
          >
            {a.clear}
          </button>
        )}
      </div>
    </div>
  );
}
