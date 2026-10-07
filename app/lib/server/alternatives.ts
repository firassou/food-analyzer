import "server-only";
import {
  type AlternativesResponse,
  CANDIDATES_SENT,
  countryTagOf,
  isGrade,
  mainCategory,
  pickAlternatives,
} from "../analysis/alternatives";
import type { Locale } from "../i18n/locales";
import { off } from "./offClient";
import { FIELDS, fromDatabase, parseProduct } from "./lookup";

const API = "https://world.openfoodfacts.org";
/** enough popular products to find a few good ones in, small enough for a free public API */
const SEARCH_SIZE = 40;

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

  const data = (await off.getJson(
    {
      key: `product:${code}`,
      url: `${API}/api/v2/product/${code}.json?fields=code,categories_tags,nutriscore_grade,nutriments`,
    },
    signal,
  )) as {
    product?: {
      categories_tags?: unknown;
      nutriscore_grade?: unknown;
      nutriments?: { sugars_100g?: unknown };
    };
  } | null;
  const product = data?.product;
  const own = product
    ? {
        category: mainCategory(product.categories_tags),
        grade: isGrade(product.nutriscore_grade)
          ? product.nutriscore_grade
          : null,
        sugar:
          typeof product.nutriments?.sugars_100g === "number"
            ? product.nutriments.sugars_100g
            : null,
      }
    : null;
  if (!own?.category) return null;

  const search = (await off.getJson(
    {
      key: `search:${own.category}|${countryTag}`,
      search: true,
      url:
        `${API}/api/v2/search?categories_tags=${encodeURIComponent(own.category)}&countries_tags=${encodeURIComponent(countryTag)}` +
        `&fields=${FIELDS},nutriscore_grade&sort_by=popularity_key&page_size=${SEARCH_SIZE}`,
    },
    signal,
  )) as { products?: unknown } | null;
  const hits: unknown[] = Array.isArray(search?.products)
    ? search.products
    : [];

  // the grade filter in the query isn't reliable on the public API: ranking is done here
  const picked = pickAlternatives(
    { code, grade: own.grade, sugar: own.sugar },
    hits,
    CANDIDATES_SENT,
  );
  const byCode = new Map(hits.map((h) => [(h as { code?: unknown }).code, h]));
  const items = picked.flatMap((c) => {
    const found = parseProduct(byCode.get(c.code), locale);
    return found ? [{ ...c, result: fromDatabase(found, locale) }] : [];
  });
  return {
    ok: true,
    category: own.category,
    country,
    own: { grade: own.grade, sugar: own.sugar },
    items,
  };
}
