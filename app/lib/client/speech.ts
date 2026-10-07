// Dictating a question. The browser's own speech recognition does the work (Chrome and Safari
// have it, Firefox doesn't, so the button only appears where it exists). Note for the privacy
// line in the UI: in Chrome the audio is processed by the browser vendor's speech service, not by
// this app, which never receives it: only the text that comes back.

interface Alternative {
  transcript: string;
}
interface ResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: Alternative };
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ResultList }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionConstructor = new () => Recognition;

const constructorOf = (): RecognitionConstructor | null => {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

export const speechSupported = () => constructorOf() !== null;

/** the language tag each interface language listens in */
export const SPEECH_LANG = { en: "en-US", fr: "fr-FR", ar: "ar-TN" } as const;

/**
 * Starts listening; `onText` gets the transcript so far (it grows while the person speaks).
 * Returns a function that stops it. `onEnd` fires once however it ends (silence, error, stop).
 */
export function startSpeech(lang: string, onText: (text: string) => void, onEnd: () => void): () => void {
  const Ctor = constructorOf();
  if (!Ctor) {
    onEnd();
    return () => undefined;
  }
  const recognition = new Ctor();
  recognition.lang = lang;
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onresult = (event) => {
    let text = "";
    for (let i = 0; i < event.results.length; i++) text += event.results[i][0].transcript;
    onText(text.trim());
  };
  recognition.onend = onEnd;
  recognition.onerror = onEnd;
  try {
    recognition.start();
  } catch {
    onEnd();
  }
  return () => {
    try {
      recognition.stop();
    } catch {
      // already stopped
    }
  };
}
