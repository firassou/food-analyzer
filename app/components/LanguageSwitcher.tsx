"use client";
import { useI18n } from "../lib/i18n/I18nProvider";
import { isLocale, LOCALE_NAMES, LOCALES } from "../lib/i18n/locales";

/** a native select under a compact button: the platform's own picker, in very little header space */
export default function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();
  return (
    <label className="relative inline-flex h-11 items-center gap-1.5 rounded-full bg-mute-soft px-4 text-ink transition focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent hover:bg-rule">
      <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3Z" />
      </svg>
      <span aria-hidden className="text-sm font-medium uppercase">
        {locale}
      </span>
      <select
        aria-label={t.header.language}
        value={locale}
        onChange={(e) => {
          if (isLocale(e.target.value)) setLocale(e.target.value);
        }}
        className="absolute inset-0 size-full cursor-pointer opacity-0"
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {LOCALE_NAMES[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
