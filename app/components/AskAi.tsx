"use client";
import { useEffect, useRef, useState } from "react";
import { cleanTurns, MAX_QUESTION_CHARS, splitAnswer } from "../lib/analysis/ask";
import type { AnalyzeErrorCode, AskResponse, ChatTurn, LabelAnalysis } from "../lib/analysis/types";
import { saveChat } from "../lib/client/history";
import { useI18n } from "../lib/i18n/I18nProvider";
import type { Messages } from "../lib/i18n/messages";
import { cn, Notice, Spinner, toneClasses } from "./ui";

// must stay above the server's deadline and maxDuration (60 s) in api/ask/route.ts
const CLIENT_TIMEOUT_MS = 75_000;

class AskFailure extends Error {
  constructor(public code: AnalyzeErrorCode | "network" | "timeout" | "status") {
    super(code);
  }
}

async function ask(
  question: string,
  history: ChatTurn[],
  result: LabelAnalysis,
  lang: string,
  signal: AbortSignal,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch("/api/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question, history, result, lang }),
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
  initialChat,
}: {
  scanId: string;
  result: LabelAnalysis;
  initialChat?: ChatTurn[];
}) {
  const { t, locale } = useI18n();
  const a = t.ask;
  const [turns, setTurns] = useState<ChatTurn[]>(() => cleanTurns(initialChat));
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AskFailure["code"] | null>(null);
  const inFlight = useRef<AbortController | null>(null);
  const log = useRef<HTMLDivElement>(null);

  useEffect(() => () => inFlight.current?.abort(), []);

  const send = async (raw: string) => {
    const question = raw.trim();
    if (!question || pending) return;
    const controller = new AbortController();
    inFlight.current = controller;
    setPending(true);
    setFailure(null);
    setDraft("");
    const asked: ChatTurn[] = [...turns, { role: "user", text: question }];
    setTurns(asked);
    try {
      const answer = await ask(question, turns, result, locale, controller.signal);
      const next: ChatTurn[] = [...asked, { role: "assistant", text: answer }];
      setTurns(next);
      saveChat(scanId, next);
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

  const clear = () => {
    inFlight.current?.abort();
    inFlight.current = null;
    setPending(false);
    setFailure(null);
    setTurns([]);
    saveChat(scanId, []);
  };

  return (
    <div>
      <p className="text-sm leading-6 text-ink-soft">{a.intro}</p>

      {turns.length > 0 && (
        <div ref={log} role="log" aria-live="polite" className="mt-4 space-y-4">
          {turns.map((turn, i) =>
            turn.role === "user" ?
              <div key={i} className="flex flex-col items-end gap-1">
                <span className="eyebrow text-ink-soft">{a.you}</span>
                <p dir="auto" className="max-w-[85%] rounded-2xl rounded-ee-md bg-ink px-4 py-2.5 text-[15px] leading-6 wrap-break-word text-paper">
                  {turn.text}
                </p>
              </div>
            : <div key={i} className="flex flex-col items-start gap-1">
                <span className="eyebrow text-ink-soft">{a.answer}</span>
                <div className="w-full max-w-[92%] space-y-2 rounded-2xl rounded-es-md border border-rule px-4 py-3">
                  {splitAnswer(turn.text).map((block, j) => (
                    <div key={j}>
                      {block.general && (
                        <span title={a.generalHint} className={cn("eyebrow mb-1 inline-flex rounded-md px-2 py-1", toneClasses.amber)}>
                          {a.general}
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
          {a.suggestions.map((s) => (
            <li key={s}>
              <button
                type="button"
                disabled={pending}
                onClick={() => send(s)}
                className="min-h-11 rounded-full border border-rule px-4 py-2 text-start text-sm transition hover:border-ink focus-visible:outline-2 focus-visible:outline-accent active:scale-[0.98] disabled:opacity-50"
              >
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
          placeholder={a.placeholder}
          aria-label={a.placeholder}
          className="h-11 min-w-0 flex-1 rounded-full border border-rule bg-paper px-4 text-base placeholder:text-ink-soft focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button
          type="submit"
          disabled={pending || !draft.trim()}
          className="inline-flex h-11 shrink-0 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent active:scale-[0.98] disabled:opacity-50"
        >
          {pending && <Spinner />}
          {a.send}
        </button>
      </form>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <p className="min-w-0 flex-1 text-xs leading-5 text-ink-soft">{a.disclaimer}</p>
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
