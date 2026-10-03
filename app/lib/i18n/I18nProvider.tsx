"use client";
import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { dirOf, LOCALE_COOKIE, numberLocale, type Locale } from "./locales";
import { MESSAGES, type Messages } from "./messages";

interface I18n {
  locale: Locale;
  /** the interface strings of the current language */
  t: Messages;
  setLocale: (locale: Locale) => void;
  /** a number in the current language's conventions */
  fmt: (n: number) => string;
  /** the name of a language ("fr" → "French" / "français" / "الفرنسية") */
  languageName: (code: string) => string;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ initialLocale, children }: { initialLocale: Locale; children: React.ReactNode }) {
  const [locale, setLocaleState] = useState(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    // the layout only renders on the server, so keep <html> in step by hand
    document.documentElement.lang = next;
    document.documentElement.dir = dirOf(next);
    document.title = MESSAGES[next].meta.title;
    document.cookie = `${LOCALE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const value = useMemo<I18n>(() => {
    const names = languageNames(locale);
    return {
      locale,
      t: MESSAGES[locale],
      setLocale,
      fmt: (n) => n.toLocaleString(numberLocale(locale), { maximumFractionDigits: n < 10 ? 2 : 1 }),
      languageName: (code) => {
        try {
          return names?.of(code) ?? code.toUpperCase();
        } catch {
          return code.toUpperCase();
        }
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside <I18nProvider>");
  return value;
}

function languageNames(locale: Locale): Intl.DisplayNames | null {
  try {
    return new Intl.DisplayNames([locale], { type: "language" });
  } catch {
    return null;
  }
}

/** fills `{name}` placeholders */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => (key in values ? String(values[key]) : match));
}

/** renders a string whose `<b>…</b>` part is emphasised */
export function rich(template: string, emphasis: (text: string) => React.ReactNode): React.ReactNode {
  return template
    .split(/<b>(.*?)<\/b>/)
    .map((part, i) => (i % 2 ? <React.Fragment key={i}>{emphasis(part)}</React.Fragment> : part));
}

/** keeps "12 g / 100 ml" in reading order inside right-to-left text */
export const ltr = (text: string) => `⁦${text}⁩`;
