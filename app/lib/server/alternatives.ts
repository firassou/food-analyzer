import "server-only";
import {
  type AlternativesResponse,
  CANDIDATES_SENT,
  countryTagOf,
  type Grade,
  isGrade,
  mainCategory,
  pickAlternatives,
} from "../analysis/alternatives";
import type { Locale } from "../i18n/locales";
import { FIELDS, fromDatabase, parseProduct } from "./lookup";

const API = "https://world.openfoodfacts.org";
const USER_AGENT = "FoodAnalyzer/0.1 (https://github.com/firassou/food-analyzer)";
const TIMEOUT_MS = 7000;
/** enough popular products to find a few good ones in, small enough for a free public API */
const SEARCH_SIZE = 40;

/** the public search answers 503 under load and limits a client to a handful of searches a minute */
const RETRY_AFTER_MS = 700;
const CACHE_MS = 60 * 60 * 1000;
const CACHE_MAX = 200;

/** a small, expiring, bounded cache: one entry per product or per category-and-country */
class Cache<T> {
  private map = new Map<string, { at: number; value: T }>();
  get(key: string): T | undefined {
    const hit = this.map.get(key);
    return hit && Date.now() - hit.at <= CACHE_MS ? hit.value : undefined;
  }
  set(key: string, value: T) {
    if (this.map.size >= CACHE_MAX) this.map.delete(this.map.keys().next().value!);
    this.map.set(key, { at: Date.now(), value });
  }
}
const products = new Cache<{ category: string | null; grade: Grade | null; sugar: number | null } | null>();
const searches = new Cache<unknown[]>();

async function getJson(url: string, signal: AbortSignal, retry = true): Promise<unknown> {
  try {
    return await getJsonOnce(url, signal);
  } catch (error) {
    if (!retry || signal.aborted) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
    return getJson(url, signal, false);
  }
}

async function getJsonOnce(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
  });
  if (res.status === 404) return null;
  // the search is sometimes switched off for load: an HTML error page, not JSON
  if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) throw new Error(`Open Food Facts answered ${res.status}`);
  return res.json();
}

/**
 * Popular products of the same (most specific) category, sold in the reader's country, with a
 * better Nutri-Score than this one, from Open Food Facts. Null when the product, its category or
 * the country isn't known there. Which of them suit the reader's allergies and diet is decided
 * on their device: the profile is never sent here.
 */
export async function findAlternatives(
  code: string,
  country: string,
  locale: Locale,
  signal: AbortSignal,
): Promise<Extract<AlternativesResponse, { ok: true }> | null> {
  const countryTag = countryTagOf(country);
  if (!countryTag) return null;

  let own = products.get(code);
  if (own === undefined) {
    const data = (await getJson(`${API}/api/v2/product/${code}.json?fields=code,categories_tags,nutriscore_grade,nutriments`, signal)) as {
      product?: { categories_tags?: unknown; nutriscore_grade?: unknown; nutriments?: { sugars_100g?: unknown } };
    } | null;
    const product = data?.product;
    own =
      product ?
        {
          category: mainCategory(product.categories_tags),
          grade: isGrade(product.nutriscore_grade) ? product.nutriscore_grade : null,
          sugar: typeof product.nutriments?.sugars_100g === "number" ? product.nutriments.sugars_100g : null,
        }
      : null;
    products.set(code, own);
  }
  if (!own?.category) return null;

  const key = `${own.category}|${countryTag}`;
  let hits = searches.get(key);
  if (!hits) {
    const search = (await getJson(
      `${API}/api/v2/search?categories_tags=${encodeURIComponent(own.category)}&countries_tags=${encodeURIComponent(countryTag)}` +
        `&fields=${FIELDS},nutriscore_grade&sort_by=popularity_key&page_size=${SEARCH_SIZE}`,
      signal,
    )) as { products?: unknown } | null;
    hits = Array.isArray(search?.products) ? search.products : [];
    searches.set(key, hits);
  }

  // the grade filter in the query isn't reliable on the public API: ranking is done here
  const picked = pickAlternatives({ code, grade: own.grade, sugar: own.sugar }, hits, CANDIDATES_SENT);
  const byCode = new Map(hits.map((h) => [(h as { code?: unknown }).code, h]));
  const items = picked.flatMap((c) => {
    const found = parseProduct(byCode.get(c.code), locale);
    return found ? [{ ...c, result: fromDatabase(found, locale) }] : [];
  });
  return { ok: true, category: own.category, country, own: { grade: own.grade, sugar: own.sugar }, items };
}
