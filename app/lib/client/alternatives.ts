// Better choices for the product on screen: fetched quietly when it opens, and shown only when
// something is left. They are products sold in the reader's country (no country, no suggestions),
// and the reader's profile decides on the device which of them are fit to suggest: the profile is
// never sent anywhere.

import { useEffect, useMemo, useState } from "react";
import { type AlternativesResponse, MAX_ALTERNATIVES } from "../analysis/alternatives";
import { checkProfile } from "../analysis/profile";
import { useI18n } from "../i18n/I18nProvider";
import { useCountry } from "./country";
import { useProfile } from "./profile";

type Found = Extract<AlternativesResponse, { ok: true }>;

/** the suggestions that fit this reader, or null while there are none (loading, nothing found, an error, no country) */
export function useAlternatives(barcode: string | null, enabled: boolean): Found | null {
  const { locale } = useI18n();
  const country = useCountry();
  const profile = useProfile();
  const key = enabled && barcode && country ? `${barcode}|${country}|${locale}` : null;
  const [loaded, setLoaded] = useState<{ key: string; data: Found } | null>(null);

  useEffect(() => {
    if (!key || !barcode || !country) return;
    const controller = new AbortController();
    fetch(`/api/alternatives?code=${barcode}&country=${country}&lang=${locale}`, {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000)]),
    })
      .then((res) => res.json() as Promise<AlternativesResponse>)
      .then((data) => {
        if (!controller.signal.aborted && data.ok) setLoaded({ key, data });
      })
      .catch(() => {
        // nothing to suggest: the section simply isn't there
      });
    return () => controller.abort();
  }, [key, barcode, country, locale]);

  return useMemo(() => {
    if (!key || loaded?.key !== key) return null;
    // "ok" means nothing the reader avoids was found; with no profile everything is fit
    const fit = loaded.data.items.filter((item) => {
      const check = checkProfile(item.result, profile);
      return !check || check.status === "ok";
    });
    return fit.length > 0 ? { ...loaded.data, items: fit.slice(0, MAX_ALTERNATIVES) } : null;
  }, [loaded, key, profile]);
}
