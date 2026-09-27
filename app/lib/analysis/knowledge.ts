// Deterministic food knowledge used to cross-check (never replace) the model.
// Everything here is pure and safe to import from client components:
// no I/O, no server imports. See .claude/skills/label-knowledge-rules.

import type { AllergenId, Basis, Level, LevelKey } from "./types";

/** lowercase, strip accents (é→e, œ→oe, ß→ss); non-Latin scripts untouched */
export function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // recompose Arabic letters (أ, آ) that NFD split into base + hamza/madda
    .normalize("NFC");
}

// Latin-script terms (in folded form) match on a word start; the optional tail allows plurals.
function words(...terms: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}])(?:${terms.join("|")})(?:s|es|en)?(?![\\p{L}])`, "u");
}
// German builds compounds (Weizenmehl, Milchschokolade, Haselnüsse): these terms
// only need a word start, so they match as the first part of a compound.
function prefixes(...terms: string[]): RegExp {
  return new RegExp(`(?<![\\p{L}])(?:${terms.join("|")})`, "u");
}
// Arabic: substring match (no case, and word boundaries don't help with clitics).
function arabic(...terms: string[]): RegExp {
  return new RegExp(terms.join("|"), "u");
}

export interface Rule {
  match: RegExp[];
  /** phrases removed before matching (false friends) */
  exclude?: RegExp;
}

const GLUTEN_FREE =
  /gluten[\s-]?free|sans gluten|sin gluten|senza glutine|glutenfrei|خال[يٍ]? من (ال)?(غلوتين|جلوتين)/u;
const LACTOSE_FREE =
  /lactose[\s-]?free|sans lactose|sin lactosa|senza lattosio|laktosefrei|خال[يٍ]? من (ال)?لاكتوز/u;

export const ALLERGEN_RULES: Record<AllergenId, Rule> = {
  gluten: {
    match: [
      words(
        "wheat", "whole ?wheat", "spelt", "kamut", "khorasan", "barley", "rye",
        "oat", "oatmeal", "triticale", "malt", "malted", "semolina", "durum", "farina",
        "couscous", "bulgh?ur", "freekeh", "seitan", "einkorn", "emmer",
        "gluten", "ble", "froment", "epeautre", "orge", "seigle", "avoine",
        "semoule", "trigo", "cebada", "centeno", "avena", "frumento", "orzo",
        "segale", "farro", "grano duro",
      ),
      prefixes("weizen", "gerste", "roggen", "hafer", "dinkel"),
      arabic("قمح", "شعير", "شوفان", "سميد", "جلوتين", "غلوتين", "برغل"),
    ],
    exclude: new RegExp(
      `buckwheat|sarrasin|ble noir|trigo sarraceno|grano saraceno|buchweizen|${GLUTEN_FREE.source}`,
      "u",
    ),
  },
  milk: {
    match: [
      words(
        "milk", "lactose", "whey", "casein", "caseinate", "cream", "butter",
        "buttermilk", "cheese", "yogh?urt", "ghee", "curd", "lactalbumin",
        "lactoglobulin", "lait", "lactoserum", "beurre", "creme", "fromage",
        "yaourt", "caseine", "babeurre", "leche", "suero de leche",
        "mantequilla", "nata", "queso", "latte", "burro", "panna", "formaggio",
        "siero di latte", "quark", "mozzarella", "parmesan", "cheddar", "ricotta",
        "mascarpone",
      ),
      prefixes("milch", "vollmilch", "magermilch", "sahne", "kase", "molke", "butter", "rahm", "joghurt"),
      arabic("حليب", "لبن", "زبدة", "جبن", "قشدة", "مصل اللبن", "لاكتوز"),
    ],
    exclude: new RegExp(
      [
        "(cocoa|cacao|shea|peanut|nut|almond|kakao)[\\s-]?butter",
        "beurre de (cacao|karite|cacahuete)",
        "manteca de cacao",
        "burro di cacao",
        "kakaobutter",
        "butter ?beans?",
        "(coconut|almond|soy|soya|oat|rice|cashew) (milk|cream)",
        "lait (de coco|d'amande|de soja|d'avoine|de riz)",
        "leche de (coco|almendra|soja|avena)",
        "bean ?curd",
        "cream of tartar",
        "creme de tartre",
        "butternut",
        LACTOSE_FREE.source,
        "لبنان|لبناني", // Lebanon / Lebanese
      ].join("|"),
      "u",
    ),
  },
  eggs: {
    match: [
      words(
        "egg", "egg yolk", "egg white", "albumen", "ovalbumin", "lysozyme",
        "mayonnaise", "oeuf", "huevo", "uovo", "uova", "eiweiss",
      ),
      // not "eiweiss" as a prefix: Eiweiß also means "protein" in nutrition tables
      prefixes("vollei", "eigelb", "huhnerei", "huhnereiweiss"),
      arabic("بيض"),
    ],
    // "white" in Arabic (أبيض / بيضاء) contains the substring بيض
    exclude: /eggplant|أبيض|ابيض|بيضاء/u,
  },
  peanuts: {
    match: [
      words("peanut", "groundnut", "arachide", "cacahuete", "cacahuate", "mani", "arachidi"),
      prefixes("erdnuss"),
      arabic("فول (ال)?سوداني", "فستق عبيد"),
    ],
  },
  tree_nuts: {
    match: [
      words(
        "almond", "hazelnut", "walnut", "cashew", "pecan", "brazil nut",
        "pistachio", "macadamia", "nut", "praline", "marzipan", "amande",
        "noisette", "noix", "cajou", "pistache", "almendra", "avellana", "nuez",
        "anacardo", "pistacho", "mandorla", "mandorle", "nocciola", "nocciole",
        "noce", "anacardi", "pistacchio", "fruits a coque", "fruit a coque",
        "frutos de cascara", "frutos secos", "frutta a guscio",
      ),
      prefixes("mandel", "haselnuss", "walnuss", "pistazie", "cashewkern", "schalenfruchte"),
      arabic("لوز", "بندق", "جوز", "فستق حلبي", "كاجو"),
    ],
    exclude:
      /coconut|noix de coco|nuez de coco|noce di cocco|kokosnuss|nutmeg|noix de muscade|nuez moscada|noce moscata|muskatnuss|peanut|ground ?nut|butternut|doughnut|donut|nutrition|nutrient|chestnut|chataigne|castagna|جوز الهند|جوزة الطيب/u,
  },
  soy: {
    match: [
      words("soy", "soya", "soybean", "edamame", "tofu", "miso", "tempeh"),
      prefixes("soja"),
      arabic("صويا"),
    ],
  },
  sesame: {
    match: [
      words("sesame", "tahini", "tahina", "sesamo", "gomasio"),
      prefixes("sesam"),
      arabic("سمسم", "طحينة", "طحينية"),
    ],
  },
  fish: {
    match: [
      words(
        "fish", "anchovy", "anchovies", "tuna", "salmon", "cod", "sardine",
        "mackerel", "haddock", "hake", "pollock", "trout", "poisson", "anchois",
        "thon", "saumon", "cabillaud", "maquereau", "pescado", "atun", "pesce",
        "tonno", "acciughe", "lachs",
      ),
      prefixes("fisch", "thunfisch"),
      arabic("سمك", "تونة", "سردين", "أنشوفة"),
    ],
  },
  crustaceans: {
    match: [
      words(
        "crustacean", "shrimp", "prawn", "crab", "lobster", "crayfish",
        "langoustine", "krill", "crevette", "crabe", "homard", "langouste",
        "gamba", "camaron", "gambero", "gamberi", "garnele", "krebs",
      ),
      arabic("جمبري", "روبيان", "قريدس", "سلطعون", "كركند"),
    ],
  },
  molluscs: {
    match: [
      words(
        "mollusc", "mollusk", "mussel", "oyster", "clam", "squid", "octopus",
        "scallop", "snail", "cuttlefish", "moule", "huitre", "calmar", "poulpe",
        "escargot", "seiche", "mejillon", "ostra", "calamar", "pulpo", "cozze",
        "vongole", "calamari", "muschel", "tintenfisch",
      ),
      arabic("محار", "حبار", "أخطبوط", "بلح البحر"),
    ],
  },
  celery: {
    match: [words("celery", "celeriac", "celeri", "apio", "sedano"), prefixes("sellerie"), arabic("كرفس")],
  },
  mustard: {
    match: [words("mustard", "moutarde", "mostaza", "senape"), prefixes("senf"), arabic("خردل", "مستردة")],
  },
  sulphites: {
    match: [
      words(
        "sulphite", "sulfite", "metabisulphite", "metabisulfite", "bisulphite",
        "bisulfite", "disulphite", "disulfite", "sulphur dioxide",
        "sulfur dioxide", "anhydride sulfureux", "solfiti", "sulfitos",
      ),
      /(?<![\p{L}\d])(?:e|ins)[\s-]?22[0-8](?!\d)/u,
      arabic("كبريتيت", "ثاني أكسيد الكبريت"),
    ],
  },
  lupin: {
    match: [words("lupin", "lupine", "lupino", "altramuz", "altramuces"), prefixes("lupinen")],
  },
};

const excludeAll = (rule: Rule) => (rule.exclude ? new RegExp(rule.exclude.source, "gu") : null);
const EXCLUDES = Object.fromEntries(
  (Object.keys(ALLERGEN_RULES) as AllergenId[]).map((id) => [id, excludeAll(ALLERGEN_RULES[id])]),
) as Record<AllergenId, RegExp | null>;

/** folded text with the rule's false friends blanked out */
function stripFalseFriends(text: string, id: AllergenId): string {
  const t = fold(text);
  const ex = EXCLUDES[id];
  return ex ? t.replace(ex, " ") : t;
}

export function matchesRule(text: string, id: AllergenId): boolean {
  const t = stripFalseFriends(text, id);
  return ALLERGEN_RULES[id].match.some((re) => re.test(t));
}

export function detectAllergens(text: string): AllergenId[] {
  return (Object.keys(ALLERGEN_RULES) as AllergenId[]).filter((id) => matchesRule(text, id));
}

// Oats only "likely" contain gluten (cross-contamination / avenin).
const OAT_ONLY = /(?<![\p{L}])(?:(?:oat|oatmeal|avoine|avena)(?:s|es|en)?(?![\p{L}])|hafer)|شوفان/u;
const STRONG_GLUTEN = words(
  "wheat", "whole ?wheat", "spelt", "kamut", "khorasan", "barley", "rye", "malt", "malted",
  "semolina", "durum", "couscous", "bulgh?ur", "seitan", "gluten", "ble", "froment",
  "epeautre", "orge", "seigle", "semoule", "trigo", "cebada", "centeno", "frumento",
  "segale", "triticale", "farro", "einkorn", "emmer",
);
const STRONG_GLUTEN_DE = prefixes("weizen", "gerste", "roggen", "dinkel");
const STRONG_GLUTEN_AR = /قمح|شعير|سميد|غلوتين|جلوتين|برغل/u;

/** "strong" = wheat/barley/rye…, "oats" = only oats, null = no gluten source */
export function glutenSignal(text: string): "strong" | "oats" | null {
  if (!matchesRule(text, "gluten")) return null;
  const t = stripFalseFriends(text, "gluten");
  if (STRONG_GLUTEN.test(t) || STRONG_GLUTEN_DE.test(t) || STRONG_GLUTEN_AR.test(t)) return "strong";
  return OAT_ONLY.test(t) ? "oats" : "strong";
}

export function isDairy(text: string): boolean {
  return matchesRule(text, "milk");
}

export function mentionsGlutenFree(text: string): boolean {
  return GLUTEN_FREE.test(fold(text));
}

export function mentionsLactoseFree(text: string): boolean {
  return LACTOSE_FREE.test(fold(text));
}

// ---------------------------------------------------------------- drinks

const DRINK =
  /(?<![\p{L}])(drink|beverage|juice|soda|water|nectar|lemonade|cola|tea|coffee|smoothie|milk ?shake|syrup|boisson|jus|bebida|refresco|getrank|saft|bevanda|succo)s?(?![\p{L}])|مشروب|عصير/u;
/** foods whose names contain a drink word ("rich tea biscuits", "water crackers") */
const NOT_DRINK =
  /(?<![\p{L}])(biscuit|cookie|cracker|cake|bar|wafer|biscotti|galette|gateau|keks|chocolate|candy|sweet|jelly|jelli|gummy|gummies)s?(?![\p{L}])/u;

/** a product category/name that is sold by volume (nutrition per 100 ml) */
export function isDrink(text: string): boolean {
  const t = fold(text);
  return DRINK.test(t) && !NOT_DRINK.test(t);
}

// ---------------------------------------------------------------- E-numbers

const E_NUMBER_SOURCE =
  "(?<![\\p{L}\\d])(?:e|ins)[\\s-]?(\\d{3,4})([a-j](?![\\p{L}]))?(?:\\s?\\(?\\s?(iv|v|vi|i{1,3})\\s?\\)?(?![\\p{L}]))?";
export const E_NUMBER_RE = new RegExp(E_NUMBER_SOURCE, "giu");

/** canonical form: E + digits + lowercase letter + lowercase roman, e.g. E500ii, E150d */
export function canonicalENumber(raw: string): string | null {
  if (typeof raw !== "string") return null;
  const m = new RegExp(E_NUMBER_SOURCE, "iu").exec(raw.trim());
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 100 || n > 1599) return null;
  return `E${m[1]}${(m[2] ?? "").toLowerCase()}${(m[3] ?? "").toLowerCase()}`;
}

export function findENumbers(text: string): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(new RegExp(E_NUMBER_SOURCE, "giu"))) {
    const code = canonicalENumber(m[0]);
    if (code) out.add(code);
  }
  return [...out];
}

export function additiveCategory(code: string): string | null {
  const n = Number(code.match(/\d+/)?.[0]);
  if (!n) return null;
  if (n < 200) return "Colour";
  if (n < 300) return "Preservative";
  if (n < 400) return "Antioxidant / acidity regulator";
  if (n < 500) return "Thickener, stabiliser or emulsifier";
  if (n < 600) return "Acidity regulator / anti-caking agent";
  if (n < 700) return "Flavour enhancer";
  if (n >= 900 && n < 1000) return "Glazing agent, gas or sweetener";
  if (n >= 1400 && n < 1500) return "Modified starch";
  return "Other additive";
}

// Common additives; used only to fill gaps the model left.
export const E_NUMBERS: Record<string, string> = {
  E100: "Curcumin", E101: "Riboflavin", E102: "Tartrazine",
  E104: "Quinoline yellow", E110: "Sunset yellow FCF", E120: "Carmine",
  E122: "Azorubine", E124: "Ponceau 4R", E129: "Allura red AC",
  E131: "Patent blue V", E133: "Brilliant blue FCF", E140: "Chlorophylls",
  E141: "Copper chlorophylls", E150a: "Plain caramel",
  E150b: "Caustic sulphite caramel", E150c: "Ammonia caramel",
  E150d: "Sulphite ammonia caramel", E153: "Vegetable carbon",
  E160a: "Carotenes", E160b: "Annatto", E160c: "Paprika extract",
  E162: "Beetroot red", E163: "Anthocyanins", E170: "Calcium carbonate",
  E171: "Titanium dioxide", E172: "Iron oxides", E200: "Sorbic acid",
  E202: "Potassium sorbate", E210: "Benzoic acid", E211: "Sodium benzoate",
  E220: "Sulphur dioxide", E223: "Sodium metabisulphite",
  E224: "Potassium metabisulphite", E250: "Sodium nitrite",
  E251: "Sodium nitrate", E252: "Potassium nitrate", E260: "Acetic acid",
  E262: "Sodium acetates", E270: "Lactic acid", E280: "Propionic acid",
  E281: "Sodium propionate", E282: "Calcium propionate",
  E290: "Carbon dioxide", E296: "Malic acid", E297: "Fumaric acid",
  E300: "Ascorbic acid", E301: "Sodium ascorbate",
  E306: "Tocopherol-rich extract", E307: "Alpha-tocopherol",
  E310: "Propyl gallate", E316: "Sodium erythorbate",
  E319: "TBHQ", E320: "BHA", E321: "BHT", E322: "Lecithins",
  E325: "Sodium lactate", E326: "Potassium lactate", E327: "Calcium lactate",
  E330: "Citric acid", E331: "Sodium citrates", E332: "Potassium citrates",
  E333: "Calcium citrates", E334: "Tartaric acid", E336: "Potassium tartrates",
  E338: "Phosphoric acid", E339: "Sodium phosphates",
  E340: "Potassium phosphates", E341: "Calcium phosphates",
  E385: "Calcium disodium EDTA", E392: "Rosemary extract",
  E400: "Alginic acid", E401: "Sodium alginate", E406: "Agar",
  E407: "Carrageenan", E410: "Locust bean gum", E412: "Guar gum",
  E414: "Gum arabic", E415: "Xanthan gum", E418: "Gellan gum",
  E420: "Sorbitol", E422: "Glycerol", E440: "Pectins",
  E450: "Diphosphates", E451: "Triphosphates", E452: "Polyphosphates",
  E460: "Cellulose", E461: "Methyl cellulose",
  E466: "Carboxymethyl cellulose", E471: "Mono- and diglycerides of fatty acids",
  E472e: "DATEM", E475: "Polyglycerol esters of fatty acids",
  E476: "Polyglycerol polyricinoleate (PGPR)",
  E481: "Sodium stearoyl-2-lactylate", E482: "Calcium stearoyl-2-lactylate",
  E491: "Sorbitan monostearate", E500: "Sodium carbonates",
  E500ii: "Sodium bicarbonate", E501: "Potassium carbonates",
  E503: "Ammonium carbonates", E503ii: "Ammonium bicarbonate",
  E504: "Magnesium carbonates", E507: "Hydrochloric acid",
  E508: "Potassium chloride", E509: "Calcium chloride",
  E516: "Calcium sulphate", E524: "Sodium hydroxide",
  E535: "Sodium ferrocyanide", E551: "Silicon dioxide",
  E575: "Glucono-delta-lactone", E621: "Monosodium glutamate",
  E627: "Disodium guanylate", E631: "Disodium inosinate",
  E635: "Disodium 5'-ribonucleotides", E901: "Beeswax",
  E903: "Carnauba wax", E904: "Shellac", E920: "L-cysteine",
  E938: "Argon", E941: "Nitrogen", E942: "Nitrous oxide",
  E950: "Acesulfame K", E951: "Aspartame", E952: "Cyclamates",
  E954: "Saccharin", E955: "Sucralose", E960: "Steviol glycosides",
  E961: "Neotame", E965: "Maltitol", E966: "Lactitol", E967: "Xylitol",
  E968: "Erythritol", E1404: "Oxidised starch", E1412: "Distarch phosphate",
  E1414: "Acetylated distarch phosphate", E1420: "Acetylated starch",
  E1422: "Acetylated distarch adipate",
  E1442: "Hydroxypropyl distarch phosphate",
  E1450: "Starch sodium octenyl succinate", E1520: "Propylene glycol",
};

/** dictionary name for a code; falls back from E500ii → E500 (roman suffix), never from E150d → E150 */
export function additiveName(code: string): string | null {
  if (E_NUMBERS[code]) return E_NUMBERS[code];
  const withoutRoman = code.replace(/(?<=\d[a-j]?)(iv|vi|v|i{1,3})$/, "");
  return E_NUMBERS[withoutRoman] ?? null;
}

// ---------------------------------------------------------------- nutrition levels

// UK FSA front-of-pack thresholds (per 100 g / 100 ml).
// A value is "low" at or below `low`, "high" above `high`, otherwise "medium".
export const LEVEL_THRESHOLDS: Record<Basis, Record<LevelKey, { low: number; high: number }>> = {
  "100g": {
    fat: { low: 3, high: 17.5 },
    saturated_fat: { low: 1.5, high: 5 },
    sugars: { low: 5, high: 22.5 },
    salt: { low: 0.3, high: 1.5 },
  },
  "100ml": {
    fat: { low: 1.5, high: 8.75 },
    saturated_fat: { low: 0.75, high: 2.5 },
    sugars: { low: 2.5, high: 11.25 },
    salt: { low: 0.3, high: 0.75 },
  },
};

export function levelOf(value: number | null, t: { low: number; high: number }): Level | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (value > t.high) return "high";
  if (value > t.low) return "medium";
  return "low";
}

// ---------------------------------------------------------------- named additives

// Named additives (folded) → E-number. `null` means "an additive, but the code
// depends on the exact variant", so a model-guessed code is not trusted.
export const NAMED_ADDITIVES: [RegExp, string | null][] = [
  [/sodium (hydrogen )?bicarbonate|bicarbonate of soda|baking soda|bicarbonate de (sodium|soude)|hydrogenocarbonate de sodium/, "E500ii"],
  [/sodium carbonates?(?! ?\()|carbonates? de sodium/, "E500"],
  [/ammonium (hydrogen )?bicarbonate|bicarbonate d'ammonium|hydrogenocarbonate d'ammonium/, "E503ii"],
  [/ammonium carbonates?|carbonates? d'ammonium/, "E503"],
  [/potassium (hydrogen )?bicarbonate/, "E501ii"],
  [/lecithins?|lecithine/, "E322"],
  [/mixed tocopherols|tocopherols?(?! acetate)|extrait riche en tocopherols/, "E306"],
  [/acesulfame[\s-]?(k|potassium)/, "E950"],
  [/monosodium glutamate|\bmsg\b|glutamate monosodique/, "E621"],
  [/steviol glycosides?|stevia|glycosides de steviol/, "E960"],
  [/\bcarmines?\b|cochineal|\bcarmin\b/, "E120"],
  [/gum arabic|acacia gum|gomme (arabique|d'acacia)/, "E414"],
  [/carob (bean )?gum|locust bean gum|gomme de caroube/, "E410"],
  [/guar gum|gomme de guar|gomme guar/, "E412"],
  [/xanthan( gum)?|gomme xanthane/, "E415"],
  [/\bpectins?\b|pectine/, "E440"],
  [/(di|tri)?sodium phosphates?|phosphates? de sodium/, "E339"],
  [/(di)?sodium diphosphate|diphosphates?/, "E450"],
  [/calcium phosphates?/, "E341"],
  [/acide citrique/, "E330"],
  [/acide ascorbique/, "E300"],
  [/acide lactique/, "E270"],
  [/sorbate de potassium/, "E202"],
  [/benzoate de sodium/, "E211"],
  [/citrates? de sodium|sodium citrates?|trisodium citrate/, "E331"],
  [/beta[\s-]?carotene|\bcarotenes?\b/, "E160a"],
  [/titanium dioxide|dioxyde de titane/, "E171"],
  [/mono[\s-]?(and|et)[\s-]?di[\s-]?glycerides|mono- ?et diglycerides/, "E471"],
  [/modified (corn |maize |potato |tapioca |wheat |rice )?starch|amidon (de \w+ )?modifie|amidon transforme/, null],
  [/caramel (colou?r|color)|colorant ?: ?caramel|caramel colouring/, null],
];

// Names of dictionary entries, matched as whole words (plural optional).
const DICTIONARY_PATTERNS: [RegExp, string][] = Object.entries(E_NUMBERS).map(([code, name]) => {
  const escaped = fold(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/s$/, "");
  return [new RegExp(`(?<![\\p{L}])${escaped}s?(?![\\p{L}])`, "u"), code];
});

/**
 * The E-number implied by an additive's name. Returns `undefined` when the name
 * isn't a known additive, `null` when it is one but the exact code is ambiguous.
 */
export function codeForName(name: string): string | null | undefined {
  if (typeof name !== "string" || !name) return undefined;
  const t = fold(name);
  for (const [re, code] of NAMED_ADDITIVES) if (re.test(t)) return code;
  for (const [re, code] of DICTIONARY_PATTERNS) if (re.test(t)) return code;
  return undefined;
}

/** vitamins/minerals added for fortification are nutrients, not additives */
export function isNutrientFortificant(name: string): boolean {
  return /^(iron|reduced iron|ferrous \w+|ferric \w+|niacin|nicotinamide|thiamine?( mononitrate| hydrochloride)?|riboflavin(?! colour)|folic acid|folate|vitamin [a-k]\d*|vitamine [a-k]\d*|zinc( \w+)?|calcium carbonate|iodine|potassium iodide|cholecalciferol|pyridoxine( hydrochloride)?|cyanocobalamin)$/.test(
    fold(name).replace(/\s*\(.*\)\s*/g, "").trim(),
  );
}

// ---------------------------------------------------------------- precautionary statements

const MAY_CONTAIN =
  /(may (also )?contain|may be present|traces? of|produced in a (facility|factory|plant)|made in a (facility|factory)|manufactured (in|on) .{0,40}(that|which) (also )?(handles|processes|uses)|peut contenir|traces? eventuelles|traces? de|fabrique dans un atelier|puede contener|trazas de|kann spuren|spuren von|kann .{0,30}enthalten|puo contenere|tracce di|قد يحتوي|آثار)[^.\n;]*/giu;

/** the precautionary ("may contain …") sentences of a label text, folded */
export function mayContainStatements(text: string): string[] {
  return [...fold(text).matchAll(MAY_CONTAIN)].map((m) => m[0].trim());
}
