// Which country the reader is in, so that "better choices" are products they can actually buy.
// Pure and client-safe. The browser doesn't know the country, so it is inferred (the time zone says
// where the device is, the language says where the reader comes from) and the reader can override it.

/** time zone → country, for the zones people use here; anything else falls back to the language's region */
const ZONES: Record<string, string> = {
  "Africa/Tunis": "TN", "Africa/Algiers": "DZ", "Africa/Casablanca": "MA", "Africa/Cairo": "EG", "Africa/Tripoli": "LY",
  "Africa/Lagos": "NG", "Africa/Johannesburg": "ZA", "Africa/Nairobi": "KE", "Africa/Dakar": "SN", "Africa/Abidjan": "CI",
  "Africa/Accra": "GH", "Africa/Addis_Ababa": "ET",
  "Europe/Paris": "FR", "Europe/London": "GB", "Europe/Berlin": "DE", "Europe/Madrid": "ES", "Europe/Rome": "IT",
  "Europe/Brussels": "BE", "Europe/Amsterdam": "NL", "Europe/Zurich": "CH", "Europe/Lisbon": "PT", "Europe/Dublin": "IE",
  "Europe/Vienna": "AT", "Europe/Stockholm": "SE", "Europe/Oslo": "NO", "Europe/Copenhagen": "DK", "Europe/Helsinki": "FI",
  "Europe/Warsaw": "PL", "Europe/Prague": "CZ", "Europe/Budapest": "HU", "Europe/Athens": "GR", "Europe/Istanbul": "TR",
  "Europe/Moscow": "RU", "Europe/Kyiv": "UA", "Europe/Kiev": "UA", "Europe/Bucharest": "RO", "Europe/Luxembourg": "LU",
  "Asia/Riyadh": "SA", "Asia/Dubai": "AE", "Asia/Qatar": "QA", "Asia/Kuwait": "KW", "Asia/Baghdad": "IQ", "Asia/Beirut": "LB",
  "Asia/Amman": "JO", "Asia/Damascus": "SY", "Asia/Jerusalem": "IL", "Asia/Tehran": "IR", "Asia/Muscat": "OM", "Asia/Bahrain": "BH",
  "Asia/Kolkata": "IN", "Asia/Calcutta": "IN", "Asia/Karachi": "PK", "Asia/Dhaka": "BD", "Asia/Jakarta": "ID",
  "Asia/Kuala_Lumpur": "MY", "Asia/Singapore": "SG", "Asia/Bangkok": "TH", "Asia/Manila": "PH", "Asia/Tokyo": "JP",
  "Asia/Seoul": "KR", "Asia/Shanghai": "CN", "Asia/Hong_Kong": "HK",
  "America/New_York": "US", "America/Chicago": "US", "America/Denver": "US", "America/Los_Angeles": "US", "America/Phoenix": "US",
  "America/Toronto": "CA", "America/Vancouver": "CA", "America/Montreal": "CA", "America/Mexico_City": "MX",
  "America/Sao_Paulo": "BR", "America/Argentina/Buenos_Aires": "AR", "America/Bogota": "CO", "America/Santiago": "CL", "America/Lima": "PE",
  "Australia/Sydney": "AU", "Australia/Melbourne": "AU", "Pacific/Auckland": "NZ",
};

/** the countries offered in the picker: every one the zone table knows */
export const COUNTRIES: string[] = [...new Set(Object.values(ZONES))].sort();

export const isCountry = (v: unknown): v is string => typeof v === "string" && /^[A-Z]{2}$/.test(v);

export const countryFromTimeZone = (zone: string | undefined | null): string | null => (zone ? ZONES[zone] ?? null : null);

/** the region of the first language that has one: "fr-TN" → TN ("fr" alone says nothing) */
export function countryFromLanguages(languages: readonly string[]): string | null {
  for (const tag of languages) {
    const region = tag.split("-").find((part, i) => i > 0 && /^[A-Za-z]{2}$/.test(part));
    if (region && isCountry(region.toUpperCase())) return region.toUpperCase();
  }
  return null;
}

/** the zone first (it says where the device is), then the language's region; null when neither tells */
export function detectCountry(zone: string | undefined | null, languages: readonly string[]): string | null {
  return countryFromTimeZone(zone) ?? countryFromLanguages(languages);
}

/**
 * The tag Open Food Facts uses for a country ("TN" → "en:tunisia"), from the English name of
 * the region. Null when the name can't be turned into a tag.
 */
export function countryTag(code: string, englishName: string | undefined): string | null {
  if (!isCountry(code) || !englishName) return null;
  const slug = englishName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug ? `en:${slug}` : null;
}
