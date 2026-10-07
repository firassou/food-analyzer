"use client";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n/I18nProvider";

// Chrome's install prompt event isn't in TypeScript's DOM library.
interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Offers to add the app to the home screen where the browser lets a page ask
 * (Chrome and Edge). Shows nothing elsewhere: on iPhone the way in is Share →
 * "Add to Home Screen", which a page can't trigger.
 */
export default function InstallButton() {
  const { t } = useI18n();
  const [prompt, setPrompt] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      // keep the browser's own mini-bar away: the button below asks instead
      e.preventDefault();
      setPrompt(e as InstallPromptEvent);
    };
    const onInstalled = () => setPrompt(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (!prompt) return null;
  return (
    <div className="animate-fade-up mt-8 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-3xl bg-sheet p-4 ring-1 ring-rule">
      <p className="min-w-0 flex-1 basis-48 text-sm leading-6 text-ink-soft">{t.install.hint}</p>
      <button
        onClick={async () => {
          await prompt.prompt();
          // the event can only be used once
          setPrompt(null);
        }}
        className="h-11 shrink-0 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition hover:brightness-110 active:scale-[0.98]"
      >
        {t.install.button}
      </button>
    </div>
  );
}
