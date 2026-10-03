// Supported interface languages. Shared by client and server: keep it free of
// runtime dependencies.

export const LOCALES = ["en", "fr", "ar"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";
/** remembers a language picked by hand; without it the device language is followed */
export const LOCALE_COOKIE = "lang";

/** each language in its own script, for the switcher */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: "English",
  fr: "Français",
  ar: "العربية",
};

export const isLocale = (v: unknown): v is Locale => LOCALES.includes(v as Locale);

export const dirOf = (locale: Locale): "ltr" | "rtl" => (locale === "ar" ? "rtl" : "ltr");

/** number formatting: Arabic keeps Western digits, as food labels do */
export const numberLocale = (locale: Locale): string => (locale === "fr" ? "fr" : "en");

/** best supported language for an Accept-Language header ("fr-TN,fr;q=0.9,ar;q=0.8") */
export function matchLocale(acceptLanguage: string | null | undefined): Locale {
  if (!acceptLanguage) return DEFAULT_LOCALE;
  const ranked = acceptLanguage
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim().match(/^q=([\d.]+)$/)?.[1]).find(Boolean);
      return { lang: tag.toLowerCase().split("-")[0], q: q === undefined ? 1 : Number(q), index };
    })
    .filter((x) => x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  return ranked.map((x) => x.lang).find(isLocale) ?? DEFAULT_LOCALE;
}
