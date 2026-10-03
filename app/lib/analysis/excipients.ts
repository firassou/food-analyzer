// Excipients "with known effect": inactive ingredients of a medicine that some
// patients need to know about. The list and the patient wording (messages.ts) follow
// the European Commission / EMA guideline "Excipients in the labelling and package
// leaflet of medicinal products for human use" and its annex (EMA/CHMP/302620/2017).
// Pure and client-safe, like knowledge.ts. Terms are matched on fold(text).

import { fold } from "./knowledge";
import type { ExcipientId } from "./types";

interface ExcipientRule {
  id: ExcipientId;
  match: RegExp;
  /** a match inside these is not this excipient */
  exclude?: RegExp;
}

const word = (terms: string) => new RegExp(`(?<![\\p{L}])(?:${terms})(?![\\p{L}])`, "u");

// order matters only for display: the gluten-related ones come first
const RULES: ExcipientRule[] = [
  { id: "wheat_starch", match: /(?<![\p{L}])(wheat starch|amidon de (ble|froment)|almidon de trigo|amido di (grano|frumento)|weizenstarke)(?![\p{L}])|نشا القمح|نشاء القمح/u },
  {
    // starch with no plant named: usually maize or potato, but the source isn't stated
    id: "starch_unspecified",
    match: /(?<![\p{L}])(starch|amidon|almidon|amido|starke)(?![\p{L}])|نشا|نشاء/u,
    exclude:
      /(?<![\p{L}])((maize|corn|potato|rice|tapioca|pea|wheat) starch|amidon (de|d') ?(mais|pomme de terre|riz|tapioca|pois|ble|froment)|almidon de (maiz|patata|papa|arroz|trigo)|amido di (mais|patata|riso|grano|frumento)|(mais|kartoffel|reis|weizen)starke|sodium starch glycolate|carboxymethylamidon)(?![\p{L}])|نشا (الذرة|البطاطا|البطاطس|الأرز|القمح)|نشاء (الذرة|البطاطا|البطاطس|الأرز|القمح)/u,
  },
  { id: "lactose", match: /(?<![\p{L}])(lactose|lactosa|lattosio|laktose)(?![\p{L}])|لاكتوز/u },
  { id: "sugars", match: /(?<![\p{L}])(sucrose|saccharose|sacarosa|saccarosio|glucose|dextrose|invert sugar|sucre inverti|sirop de (glucose|saccharose))(?![\p{L}])|سكروز|سكر القصب|غلوكوز|جلوكوز/u },
  { id: "fructose_sorbitol", match: /(?<![\p{L}])(fructose|sorbitol|e ?420)(?![\p{L}\d])|فركتوز|سوربيتول/u },
  { id: "aspartame", match: /(?<![\p{L}])(aspartame?|aspartamo|e ?951)(?![\p{L}\d])|أسبارتام|اسبارتام/u },
  { id: "peanut_oil", match: /(?<![\p{L}])(arachis oil|peanut oil|huile d'arachide|aceite de cacahuete|olio di arachidi|erdnussol)(?![\p{L}])|زيت الفول السوداني/u },
  { id: "soya", match: /(?<![\p{L}])(soya|soja|soy|soybean)(?![\p{L}])|صويا/u },
  { id: "sesame_oil", match: /(?<![\p{L}])(sesame oil|huile de sesame|aceite de sesamo|olio di sesamo|sesamol)(?![\p{L}])|زيت السمسم/u },
  { id: "sulphites", match: /(?<![\p{L}])(((meta)?bi)?sul(ph|f)ites?|sul(ph|f)ur dioxide|anhydride sulfureux|e ?22[0-8])(?![\p{L}\d])|كبريتيت|ميتابيسلفيت/u },
  { id: "azo_colours", match: /(?<![\p{L}])(tartrazine|sunset yellow|jaune orange s|azorubine|carmoisine|amaranth|ponceau 4r|rouge cochenille a|brilliant black|noir brillant|e ?(102|110|122|123|124|151))(?![\p{L}\d])|تارترازين/u },
  { id: "parabens", match: /(?<![\p{L}])((methyl|ethyl|propyl|butyl)[ -]?parabens?|parabens?|parahydroxybenzoates? (de|d')?.{0,12}|(methyl|ethyl|propyl) parahydroxybenzoates?|e ?21[4-9])(?![\p{L}\d])|بارابين/u },
  { id: "benzoates", match: /(?<![\p{L}])(benzoic acid|acide benzoique|(sodium|potassium) benzoate|benzoate de (sodium|potassium)|e ?21[0-3])(?![\p{L}\d])|بنزوات/u },
  { id: "benzyl_alcohol", match: word("benzyl alcohol|alcool benzylique|alcohol bencilico|alcol benzilico|benzylalkohol") },
  {
    id: "alcohol",
    match: /(?<![\p{L}])(ethanol|alcohol|alcool|alcol|alkohol)(?![\p{L}])|إيثانول|كحول/u,
    // other "alcohols" that aren't drinking alcohol
    exclude: /(?<![\p{L}])((benzyl|cetyl|stearyl|cetostearyl|polyvinyl|isopropyl) alcohol|alcool (benzylique|cetylique|stearylique|cetostearylique|polyvinylique|isopropylique)|sans alcool|alcohol[- ]free)(?![\p{L}])/u,
  },
  { id: "propylene_glycol", match: /(?<![\p{L}])(propylene ?glycol|propilenglicol|glicole propilenico|e ?1520)(?![\p{L}\d])/u },
  // effervescent tablets carry a lot of sodium (bicarbonate / carbonate) by design
  { id: "effervescent_sodium", match: /(?<![\p{L}])(effervescent|effervescente?s?|efervescentes?|brausetabletten?)(?![\p{L}])|فوار/u },
];

/** the notable excipients named in a medicine's composition text, with the words that matched */
export function findExcipients(text: string): { id: ExcipientId; matched: string }[] {
  const out: { id: ExcipientId; matched: string }[] = [];
  let folded = fold(text);
  for (const rule of RULES) {
    const searchable = rule.exclude ? folded.replace(new RegExp(rule.exclude.source, "gu"), " ") : folded;
    const m = rule.match.exec(searchable);
    if (!m) continue;
    out.push({ id: rule.id, matched: m[0].trim() });
    // wheat starch must not be reported again as "starch, source not stated"
    if (rule.id === "wheat_starch") folded = folded.replace(new RegExp(rule.match.source, "gu"), " ");
  }
  return out;
}
