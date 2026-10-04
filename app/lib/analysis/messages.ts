// The sentences normalize.ts writes itself (warnings, evidence, sugar explanation,
// computed highlights), in every interface language. English is the reference:
// its wording is pinned by normalize.test.ts.
// Shared by client and server: keep it free of runtime dependencies.

import type { Locale } from "../i18n/locales";
import type { AllergenId, ExcipientId, LevelKey, MineralKey, WaterFactId } from "./types";
import { ALLERGEN_NAMES } from "./types";

/** values a water remark may quote */
export interface WaterValues {
  ph: number | null;
  residue: number | null;
  hardness: number | null;
  minerals: Record<MineralKey, number | null>;
}

type Unit = "g" | "ml";
type Threshold = { low: number; high: number };

export interface AnalysisMessages {
  allergenNames: Record<AllergenId, string>;
  warnings: {
    nutritionDropped: string;
    nutritionInconsistent: (issues: string[]) => string;
    reconstructed: string;
    notALabel: string;
    poorQuality: string;
    fairQuality: string;
    noIngredients: string;
    cutShort: string;
    /** the model answered, but never with a structured reading */
    unstructured: string;
    /** a packaged product whose ingredient list couldn't be read or found */
    needProductPhoto: string;
    /** ingredients guessed from a photo of the food itself */
    estimatedDish: string;
    /** the usual ingredients of a recognised product, recalled by the model */
    estimatedProduct: string;
    database: (product: string) => string;
    /** the whole result comes from the database (barcode scan) */
    databaseScan: (product: string) => string;
    /** calories and nutrients guessed for a dish */
    estimatedNutrition: string;
    /** a medicine's uses, dose and cautions come from the model's general knowledge */
    medicineGeneral: string;
    medicineNoActive: string;
    medicineNoExcipients: string;
    medicineDatabase: (product: string) => string;
    /** the pharmacist's pen marks are a reading, not the prescription itself */
    medicineMarks: string;
    medicineMarksUnclear: string;
  };
  issues: { sugarsOverCarbs: string; saturatesOverFat: string; macrosOver100: string; energyMismatch: string };
  evidence: {
    ingredient: (name: string) => string;
    glutenDeclared: string;
    glutenMayContain: string;
    glutenFree: string;
    milkDeclared: string;
    milkMayContain: string;
    lactoseFree: string;
  };
  sources: { mayContain: string; declared: string; listed: string };
  water: Record<WaterFactId, (v: WaterValues) => string>;
  /**
   * What each remark means for the person drinking the water, in plain words. Every tip
   * rests on the published guidance named in `waterSources`; don't add one from memory.
   */
  waterTips: Record<WaterFactId, (v: WaterValues) => string>;
  /** where each tip comes from, shown under it */
  waterSources: Record<WaterFactId, string>;
  /**
   * What a medicine's excipient means for the patient. The wording follows the EMA annex
   * on excipients (see excipients.ts); don't add or soften a statement from memory.
   */
  excipients: Record<ExcipientId, string>;
  excipientSources: { ema: string; pack: string };
  /** keyed by English class names: those of knowledge.ts `additiveCategory`, plus the ones models write anyway */
  categories: Record<string, string>;
  sugar: {
    high: (value: number, unit: Unit, t: Threshold) => string;
    low: (value: number, unit: Unit, t: Threshold) => string;
    medium: (value: number, unit: Unit, t: Threshold) => string;
    notPrinted: string;
    /** in place of the threshold sentence when the sugar figure is itself a guess */
    estimated: string;
  };
  highlights: {
    high: (nutrient: LevelKey, value: number | null, unit: Unit) => string;
    lowSugars: (value: number | null, unit: Unit) => string;
  };
}

// ---------------------------------------------------------------- water: reference values and sources
//
// The tips below are tied to published guidance, not general knowledge:
// - WHO, Guidelines for drinking-water quality (4th ed.): nitrate 50 mg/L to protect bottle-fed
//   infants from methaemoglobinaemia; fluoride 1.5 mg/L (dental fluorosis above it); no health-based
//   value for pH, hardness, chloride or sulphate (sulphate: laxative effect at high levels).
// - WHO, Calcium and magnesium in drinking-water: public health significance (2009): no convincing
//   evidence that hard water harms health; it contributes to calcium and magnesium intake.
// - WHO, Guideline: sodium intake for adults and children (2012): under 2 g of sodium a day.
// - EFSA dietary reference values: calcium 950 mg/day (adults from 25), magnesium 350 mg/day (men;
//   300 for women). EU Scientific Committee on Food: upper level of 250 mg/day for magnesium from
//   supplements, water and fortified foods (mild diarrhoea above it).
// - European Association of Urology, Urolithiasis guidelines: people who form stones should drink
//   2.5–3 L a day and keep a normal calcium intake of 1–1.2 g a day; restricting calcium isn't advised.
// - Directive 2009/54/EC (mineral-water mentions) and 2003/40/EC (fluoride notice above 1.5 mg/L).
// - Enamel begins to demineralise below a pH of about 5.5 (the "critical pH" of dental erosion).
const DAILY = { calcium: 950, magnesium: 350, sodium: 2000 } as const;

/** what a litre gives, as a share of the daily reference, in whole percent */
const share = (mgPerLitre: number | null, daily: number) => Math.round(((mgPerLitre ?? 0) / daily) * 100);

const sources = (
  who: string,
  hardness: string,
  sodium: string,
  efsa: string,
  stones: string,
  eu: string,
  dental: string,
): Record<WaterFactId, string> => ({
  ph_neutral: eu,
  ph_acidic: dental,
  ph_alkaline: who,
  ph_sparkling: dental,
  mineral_very_low: eu,
  mineral_low: eu,
  mineral_medium: eu,
  mineral_high: eu,
  hardness_soft: hardness,
  hardness_medium: hardness,
  hardness_hard: hardness,
  hardness_very_hard: hardness,
  low_sodium: sodium,
  sodium_rich: sodium,
  calcium_rich: `${efsa} · ${stones}`,
  magnesium_rich: efsa,
  bicarbonate_rich: eu,
  sulphate_rich: who,
  chloride_rich: who,
  fluoride_present: who,
  fluoride_high: who,
  nitrate_low: who,
  nitrate_high: who,
});

const SOURCES_EN = sources(
  "WHO, Guidelines for drinking-water quality",
  "WHO, Calcium and magnesium in drinking-water",
  "WHO, sodium intake guideline",
  "EFSA, dietary reference values",
  "European Association of Urology, urolithiasis guidelines",
  "EU rules on drinking and mineral waters",
  "Dental erosion research (critical pH of enamel)",
);
const SOURCES_FR = sources(
  "OMS, Directives de qualité pour l'eau de boisson",
  "OMS, Calcium et magnésium dans l'eau de boisson",
  "OMS, recommandation sur l'apport en sodium",
  "EFSA, valeurs nutritionnelles de référence",
  "Association européenne d'urologie, recommandations sur la lithiase",
  "Règles européennes sur les eaux de boisson et les eaux minérales",
  "Recherche sur l'érosion dentaire (pH critique de l'émail)",
);
const SOURCES_AR = sources(
  "منظمة الصحة العالمية، دلائل جودة مياه الشرب",
  "منظمة الصحة العالمية، الكالسيوم والمغنيسيوم في مياه الشرب",
  "منظمة الصحة العالمية، إرشادات مدخول الصوديوم",
  "الهيئة الأوروبية لسلامة الأغذية، القيم الغذائية المرجعية",
  "الجمعية الأوروبية لجراحة المسالك البولية، إرشادات حصى الكلى",
  "القواعد الأوروبية لمياه الشرب والمياه المعدنية",
  "أبحاث تآكل الأسنان (الرقم الهيدروجيني الحرج للمينا)",
);

const en: AnalysisMessages = {
  allergenNames: ALLERGEN_NAMES,
  warnings: {
    nutritionDropped: "Some nutrition values were unreadable or impossible and were left out.",
    nutritionInconsistent: (issues) =>
      `Some nutrition values look inconsistent (${issues.join("; ")}). Double-check them on the pack.`,
    reconstructed: "The ingredient list was reconstructed from the label text.",
    notALabel:
      "This photo doesn't look like a food label. For best results, photograph the ingredient list or nutrition table up close.",
    poorQuality:
      "The label was hard to read, so some details may be missing or inaccurate. A sharper, closer photo will help.",
    fairQuality: "Parts of the label were hard to read. Double-check key numbers against the pack.",
    noIngredients: "No ingredient list was readable, so allergen, gluten and additive checks are incomplete.",
    cutShort: "The analysis was cut short; some sections may be incomplete.",
    unstructured:
      "The AI couldn't produce a structured reading of this photo. Try a sharper, well-lit photo of the ingredient list or nutrition table.",
    needProductPhoto:
      "The ingredient list couldn't be read, so allergen, gluten and additive checks are incomplete. Take a photo of the whole product, with its name and barcode visible, so it can be looked up.",
    estimatedDish:
      "These ingredients are an estimate from the look of the food, not read from a label. The real recipe may differ: don't rely on this if you have allergies.",
    estimatedProduct:
      "The ingredient list wasn't readable. These are the usual ingredients of this product as recalled by the AI: check them on the pack.",
    database: (product) =>
      `The ingredient list wasn't readable on the photo. It was completed from the Open Food Facts entry “${product}”: check that it matches your pack.`,
    databaseScan: (product) =>
      `This comes from the Open Food Facts entry “${product}”, a community database, not from a photo of your pack: check it against the label.`,
    estimatedNutrition:
      "The calories and nutrients are a rough estimate for a typical recipe and portion of this dish. The real figures can differ a lot.",
    medicineGeneral:
      "The uses, usual dose and cautions below are general information about the active substance, written by an AI. They can be wrong and may not apply to you. Your dose is the one your doctor or pharmacist gave you: follow it, and read the leaflet.",
    medicineNoActive:
      "The active substance couldn't be read, so no general information is shown. Photograph the side of the box that names the substance and its strength.",
    medicineNoExcipients:
      "The excipients aren't on this photo and weren't found in the official medicines database, so gluten and other sensitive ingredients couldn't be checked. If that matters to you, add a photo of the composition (on the side of the box or in the leaflet).",
    medicineDatabase: (product) =>
      `The excipients weren't on the photo. They come from the official French medicines database, entry “${product}”. A box made for another country can differ: the leaflet in your box has the final word.`,
    medicineMarks:
      "The pen marks on the box were read by an AI. If this reading doesn't match what your doctor or pharmacist told you, follow what they told you and ask them to confirm.",
    medicineMarksUnclear:
      "The pen marks on the box were hard to read: don't rely on this reading, ask your pharmacist.",
  },
  issues: {
    sugarsOverCarbs: "sugars exceed carbohydrates",
    saturatesOverFat: "saturates exceed total fat",
    macrosOver100: "macronutrients add up to more than 100 g",
    energyMismatch: "energy doesn't match the macronutrients",
  },
  evidence: {
    ingredient: (name) => `Ingredient: ${name}`,
    glutenDeclared: "Gluten declared as an allergen",
    glutenMayContain: "“May contain” gluten statement",
    glutenFree: "Labelled gluten-free",
    milkDeclared: "Milk declared as an allergen",
    milkMayContain: "“May contain” milk statement",
    lactoseFree: "Labelled lactose-free",
  },
  sources: {
    mayContain: "“May contain” statement",
    declared: "Declared on the label",
    listed: "Listed on the label",
  },
  water: {
    ph_neutral: (v) => `pH ${v.ph}: within the 6.5–9.5 range set for drinking water in the EU.`,
    ph_acidic: (v) => `pH ${v.ph}: more acidic than the 6.5–9.5 range set for drinking water in the EU.`,
    ph_alkaline: (v) => `pH ${v.ph}: more alkaline than the 6.5–9.5 range set for drinking water in the EU.`,
    ph_sparkling: (v) => `pH ${v.ph}: acidic, which is normal for sparkling water (dissolved carbon dioxide).`,
    mineral_very_low: (v) => `Very low mineral content: ${v.residue} mg/L of dry residue (under 50).`,
    mineral_low: (v) => `Low mineral content: ${v.residue} mg/L of dry residue (up to 500).`,
    mineral_medium: (v) => `Medium mineral content: ${v.residue} mg/L of dry residue (500 to 1500).`,
    mineral_high: (v) => `Rich in mineral salts: ${v.residue} mg/L of dry residue (above 1500).`,
    hardness_soft: (v) => `Soft water: hardness of about ${v.hardness} mg/L as calcium carbonate.`,
    hardness_medium: (v) => `Moderately hard water: hardness of about ${v.hardness} mg/L as calcium carbonate.`,
    hardness_hard: (v) => `Hard water: hardness of about ${v.hardness} mg/L as calcium carbonate.`,
    hardness_very_hard: (v) => `Very hard water: hardness of about ${v.hardness} mg/L as calcium carbonate.`,
    low_sodium: (v) => `Low in sodium: ${v.minerals.sodium} mg/L (under 20), the level for a low-sodium diet claim.`,
    sodium_rich: (v) => `Contains sodium: ${v.minerals.sodium} mg/L (above 200).`,
    calcium_rich: (v) => `Contains calcium: ${v.minerals.calcium} mg/L (above 150).`,
    magnesium_rich: (v) => `Contains magnesium: ${v.minerals.magnesium} mg/L (above 50).`,
    bicarbonate_rich: (v) => `Contains bicarbonate: ${v.minerals.bicarbonate} mg/L (above 600).`,
    sulphate_rich: (v) => `Contains sulphate: ${v.minerals.sulphate} mg/L (above 200).`,
    chloride_rich: (v) => `Contains chloride: ${v.minerals.chloride} mg/L (above 200).`,
    fluoride_present: (v) => `Contains fluoride: ${v.minerals.fluoride} mg/L (above 1).`,
    fluoride_high: (v) =>
      `Fluoride ${v.minerals.fluoride} mg/L (above 1.5): EU rules require a notice that it isn't suitable for regular use by infants and children under 7.`,
    nitrate_low: (v) => `Low in nitrate: ${v.minerals.nitrate} mg/L (10 or less).`,
    nitrate_high: (v) => `Nitrate ${v.minerals.nitrate} mg/L: above the 50 mg/L EU limit.`,
  },
  waterTips: {
    ph_neutral: () => "Right where drinking water should be. Nothing to think about.",
    ph_acidic: (v) =>
      (v.ph ?? 7) < 5.5
        ? "Quite acidic. It's safe to drink, but tooth enamel starts to soften below about pH 5.5, so it's kinder to your teeth with meals than sipped all day."
        : "A little on the acidic side. It's safe to drink; you may just notice a sharper taste.",
    ph_alkaline: () => "More alkaline than usual. It's safe to drink and can taste a little flat or bitter. Your stomach acid neutralises it, so it doesn't change your body's own pH.",
    ph_sparkling: () => "That's the bubbles: dissolved carbon dioxide makes any fizzy water a little acidic. Perfectly normal, and far gentler on teeth than sodas or juices.",
    mineral_very_low: () => "A very light water with almost no minerals and a neutral taste. It hydrates just as well, but adds next to nothing to your mineral intake.",
    mineral_low: () => "A light, everyday water. Easy to drink all day long.",
    mineral_medium: () => "A fair amount of minerals. Fine for every day, with a taste you can notice.",
    mineral_high: () => "A heavily mineralised water with a strong taste. Enjoy it, but look at the sodium, sulphate and fluoride lines below before making it your only water.",
    hardness_soft: () => "Soft water: a gentle taste, and no limescale in the kettle.",
    hardness_medium: () => "Middle of the road. Nothing to worry about.",
    hardness_hard: () => "Hard water. No harm to health has been shown from drinking it, and its calcium and magnesium count towards your intake. It does leave limescale in kettles.",
    hardness_very_hard: () => "Very hard water. Still no harm to health has been shown from drinking it; expect a fuller taste and plenty of limescale in the kettle.",
    low_sodium: () => "Very little salt in here. A good pick if you watch your blood pressure or eat low-salt.",
    sodium_rich: (v) =>
      `Salty for a water: one litre brings about ${share(v.minerals.sodium, DAILY.sodium)} % of the 2 g of sodium adults are advised to stay under each day. If you have high blood pressure, heart or kidney disease, or were told to cut down on salt, keep it for now and then.`,
    calcium_rich: (v) =>
      `One litre gives about ${share(v.minerals.calcium, DAILY.calcium)} % of the calcium an adult needs in a day, which is good for bones. About kidney stones: calcium in water isn't the cause, and people who form stones are advised to drink plenty and keep a normal calcium intake rather than cut it. If your doctor has given you a calcium limit, follow that.`,
    magnesium_rich: (v) =>
      `One litre gives about ${share(v.minerals.magnesium, DAILY.magnesium)} % of an adult's daily magnesium. Above roughly 250 mg a day from water and supplements, magnesium can loosen the bowels. If you have kidney disease, ask your doctor first.`,
    bicarbonate_rich: () => "Rich in bicarbonate, which many people find easy on the stomach after a meal. These waters are often high in sodium too, so check that line.",
    sulphate_rich: () => "High in sulphate, which can have a laxative effect, more so if you're not used to it. Not a good choice for preparing baby bottles.",
    chloride_rich: () => "Plenty of chloride, which gives the water a slightly salty taste. Not a health concern in itself.",
    fluoride_present: () => "Contains fluoride, which helps protect teeth against decay. If you already use fluoride toothpaste, you don't need to seek out more.",
    fluoride_high: () => "A lot of fluoride. Don't use it for babies or as young children's everyday water: over the years teeth are forming, too much fluoride can mottle them.",
    nitrate_low: () => "Barely any nitrate: one of the things to look for in a water for baby bottles.",
    nitrate_high: () => "Too much nitrate. Never use it for baby bottles: in bottle-fed infants nitrate can reduce the blood's ability to carry oxygen.",
  },
  waterSources: SOURCES_EN,
  excipients: {
    wheat_starch:
      "Wheat starch: this medicine contains only very low levels of gluten and is regarded as gluten-free, so it is very unlikely to cause problems if you have coeliac disease. If you have a wheat allergy (which is different from coeliac disease), you should not take it.",
    starch_unspecified:
      "Starch, with no source named. It is usually maize or potato starch, which contain no gluten, but the pack doesn't say. If you have coeliac disease or a wheat allergy, ask the pharmacist which starch it is.",
    lactose:
      "Contains lactose. If your doctor has told you that you have an intolerance to some sugars, contact them before taking this medicine.",
    sugars:
      "Contains sugar (sucrose or glucose). If your doctor has told you that you have an intolerance to some sugars, contact them before taking it. In syrups the amount can matter if you have diabetes.",
    fructose_sorbitol:
      "Contains sorbitol or fructose. If you (or your child) have hereditary fructose intolerance or an intolerance to some sugars, talk to your doctor before taking it.",
    aspartame:
      "Contains aspartame, a source of phenylalanine. It may be harmful if you have phenylketonuria (PKU).",
    peanut_oil:
      "Contains arachis (peanut) oil. Do not use it if you are allergic to peanut or soya.",
    soya:
      "Contains soya. Do not use it if you are allergic to peanut or soya.",
    sesame_oil:
      "Contains sesame oil, which may rarely cause severe allergic reactions.",
    sulphites:
      "Contains sulphites, which may rarely cause severe allergic reactions and difficulty breathing.",
    azo_colours:
      "Contains an azo colouring agent, which may cause allergic reactions.",
    parabens:
      "Contains parabens (parahydroxybenzoates), which may cause allergic reactions, possibly delayed.",
    benzoates:
      "Contains benzoic acid or a benzoate. It may increase jaundice (yellowing of the skin and eyes) in newborn babies up to 4 weeks old.",
    benzyl_alcohol:
      "Contains benzyl alcohol. It must not be given to newborn babies, and shouldn't be used for more than a week in children under 3 unless a doctor advises it. Ask your doctor or pharmacist if you are pregnant or breast-feeding, or have liver or kidney disease.",
    alcohol:
      "Contains alcohol (ethanol). The amount is usually small, but mention it to your doctor or pharmacist for a child, during pregnancy or breast-feeding, or if you have liver disease, epilepsy or alcohol dependence.",
    propylene_glycol:
      "Contains propylene glycol. For a baby under 4 weeks, a child under 5, during pregnancy or breast-feeding, or with liver or kidney disease, check with a doctor or pharmacist first.",
    effervescent_sodium:
      "Effervescent tablets usually contain a lot of sodium. Take it into account if you are on a low-salt diet or have high blood pressure, heart or kidney disease.",
  },
  excipientSources: { ema: "EMA, excipients in the labelling and package leaflet", pack: "The composition as printed on the pack" },
  categories: {},
  sugar: {
    high: (v, unit, t) =>
      `${v} g of sugars per 100 ${unit}, above the ${t.high} g “high” threshold used on UK front-of-pack labels.`,
    low: (v, unit, t) =>
      `${v} g of sugars per 100 ${unit}, at or below the ${t.low} g “low” threshold used on UK front-of-pack labels.`,
    medium: (v, unit, t) =>
      `${v} g of sugars per 100 ${unit}, between the ${t.low} g “low” and ${t.high} g “high” thresholds used on UK front-of-pack labels.`,
    notPrinted: "No sugar value per 100 g/ml is printed on the visible label.",
    estimated: "A rough figure for a typical recipe of this dish, not a measured one.",
  },
  highlights: {
    high: (nutrient, value, unit) =>
      `High in ${{ fat: "fat", saturated_fat: "saturated fat", sugars: "sugars", salt: "salt" }[nutrient]} (${value} g per 100 ${unit})`,
    lowSugars: (value, unit) => `Low in sugars (${value} g per 100 ${unit})`,
  },
};

/** French prints decimals with a comma */
const n = (v: number | null) => String(v).replace(".", ",");

const fr: AnalysisMessages = {
  allergenNames: {
    gluten: "Gluten",
    milk: "Lait",
    eggs: "Œufs",
    peanuts: "Arachides",
    tree_nuts: "Fruits à coque",
    soy: "Soja",
    sesame: "Sésame",
    fish: "Poisson",
    crustaceans: "Crustacés",
    molluscs: "Mollusques",
    celery: "Céleri",
    mustard: "Moutarde",
    sulphites: "Sulfites",
    lupin: "Lupin",
  },
  warnings: {
    nutritionDropped: "Certaines valeurs nutritionnelles étaient illisibles ou impossibles et ont été ignorées.",
    nutritionInconsistent: (issues) =>
      `Certaines valeurs nutritionnelles semblent incohérentes (${issues.join(" ; ")}). Vérifiez-les sur l'emballage.`,
    reconstructed: "La liste des ingrédients a été reconstituée à partir du texte de l'étiquette.",
    notALabel:
      "Cette photo ne ressemble pas à une étiquette alimentaire. Pour un meilleur résultat, photographiez de près la liste des ingrédients ou le tableau nutritionnel.",
    poorQuality:
      "L'étiquette était difficile à lire : certains détails peuvent manquer ou être inexacts. Une photo plus nette et plus proche aidera.",
    fairQuality:
      "Certaines parties de l'étiquette étaient difficiles à lire. Vérifiez les chiffres importants sur l'emballage.",
    noIngredients:
      "Aucune liste d'ingrédients n'était lisible : les vérifications des allergènes, du gluten et des additifs sont incomplètes.",
    cutShort: "L'analyse a été interrompue ; certaines sections peuvent être incomplètes.",
    unstructured:
      "L'IA n'a pas pu produire une lecture structurée de cette photo. Essayez une photo plus nette et bien éclairée de la liste des ingrédients ou du tableau nutritionnel.",
    needProductPhoto:
      "La liste des ingrédients n'a pas pu être lue : les vérifications des allergènes, du gluten et des additifs sont incomplètes. Photographiez le produit en entier, avec son nom et son code-barres visibles, pour qu'il puisse être recherché.",
    estimatedDish:
      "Ces ingrédients sont une estimation d'après l'aspect de l'aliment, et non lus sur une étiquette. La vraie recette peut différer : ne vous y fiez pas en cas d'allergie.",
    estimatedProduct:
      "La liste des ingrédients était illisible. Voici les ingrédients habituels de ce produit, de mémoire de l'IA : vérifiez-les sur l'emballage.",
    database: (product) =>
      `La liste des ingrédients était illisible sur la photo. Elle a été complétée à partir de la fiche Open Food Facts « ${product} » : vérifiez qu'elle correspond à votre produit.`,
    databaseScan: (product) =>
      `Ces informations viennent de la fiche Open Food Facts « ${product} », une base communautaire, et non d'une photo de votre produit : comparez-les avec l'étiquette.`,
    estimatedNutrition:
      "Les calories et les nutriments sont une estimation approximative pour une recette et une portion typiques de ce plat. Les valeurs réelles peuvent être très différentes.",
    medicineGeneral:
      "Les indications, la dose habituelle et les précautions ci-dessous sont des informations générales sur la substance active, rédigées par une IA. Elles peuvent être fausses et ne pas s'appliquer à vous. Votre dose est celle que votre médecin ou votre pharmacien vous a donnée : suivez-la, et lisez la notice.",
    medicineNoActive:
      "La substance active n'a pas pu être lue : aucune information générale n'est affichée. Photographiez le côté de la boîte qui indique la substance et son dosage.",
    medicineNoExcipients:
      "Les excipients ne figurent pas sur cette photo et n'ont pas été trouvés dans la base officielle des médicaments : le gluten et les autres ingrédients sensibles n'ont pas pu être vérifiés. Si c'est important pour vous, ajoutez une photo de la composition (sur le côté de la boîte ou dans la notice).",
    medicineDatabase: (product) =>
      `Les excipients ne figuraient pas sur la photo. Ils viennent de la base de données publique des médicaments (France), fiche « ${product} ». Une boîte fabriquée pour un autre pays peut être différente : la notice de votre boîte fait foi.`,
    medicineMarks:
      "Les traits au stylo sur la boîte ont été lus par une IA. Si cette lecture ne correspond pas à ce que votre médecin ou votre pharmacien vous a dit, suivez ce qu'ils vous ont dit et demandez-leur de confirmer.",
    medicineMarksUnclear:
      "Les traits au stylo sur la boîte étaient difficiles à lire : ne vous fiez pas à cette lecture, demandez à votre pharmacien.",
  },
  issues: {
    sugarsOverCarbs: "les sucres dépassent les glucides",
    saturatesOverFat: "les acides gras saturés dépassent les matières grasses totales",
    macrosOver100: "les macronutriments totalisent plus de 100 g",
    energyMismatch: "l'énergie ne correspond pas aux macronutriments",
  },
  evidence: {
    ingredient: (name) => `Ingrédient : ${name}`,
    glutenDeclared: "Gluten déclaré comme allergène",
    glutenMayContain: "Mention « peut contenir » du gluten",
    glutenFree: "Étiqueté sans gluten",
    milkDeclared: "Lait déclaré comme allergène",
    milkMayContain: "Mention « peut contenir » du lait",
    lactoseFree: "Étiqueté sans lactose",
  },
  sources: {
    mayContain: "Mention « peut contenir »",
    declared: "Déclaré sur l'étiquette",
    listed: "Indiqué sur l'étiquette",
  },
  water: {
    ph_neutral: (v) => `pH ${n(v.ph)} : dans la plage de 6,5 à 9,5 fixée pour l'eau potable dans l'UE.`,
    ph_acidic: (v) => `pH ${n(v.ph)} : plus acide que la plage de 6,5 à 9,5 fixée pour l'eau potable dans l'UE.`,
    ph_alkaline: (v) => `pH ${n(v.ph)} : plus alcalin que la plage de 6,5 à 9,5 fixée pour l'eau potable dans l'UE.`,
    ph_sparkling: (v) => `pH ${n(v.ph)} : acide, ce qui est normal pour une eau gazeuse (gaz carbonique dissous).`,
    mineral_very_low: (v) => `Très faiblement minéralisée : ${n(v.residue)} mg/L de résidu sec (moins de 50).`,
    mineral_low: (v) => `Faiblement minéralisée : ${n(v.residue)} mg/L de résidu sec (jusqu'à 500).`,
    mineral_medium: (v) => `Moyennement minéralisée : ${n(v.residue)} mg/L de résidu sec (de 500 à 1500).`,
    mineral_high: (v) => `Riche en sels minéraux : ${n(v.residue)} mg/L de résidu sec (plus de 1500).`,
    hardness_soft: (v) => `Eau douce : dureté d'environ ${n(v.hardness)} mg/L en carbonate de calcium.`,
    hardness_medium: (v) => `Eau moyennement dure : dureté d'environ ${n(v.hardness)} mg/L en carbonate de calcium.`,
    hardness_hard: (v) => `Eau dure : dureté d'environ ${n(v.hardness)} mg/L en carbonate de calcium.`,
    hardness_very_hard: (v) => `Eau très dure : dureté d'environ ${n(v.hardness)} mg/L en carbonate de calcium.`,
    low_sodium: (v) =>
      `Pauvre en sodium : ${n(v.minerals.sodium)} mg/L (moins de 20), le seuil de la mention « convient pour un régime pauvre en sodium ».`,
    sodium_rich: (v) => `Sodique : ${n(v.minerals.sodium)} mg/L de sodium (plus de 200).`,
    calcium_rich: (v) => `Calcique : ${n(v.minerals.calcium)} mg/L de calcium (plus de 150).`,
    magnesium_rich: (v) => `Magnésienne : ${n(v.minerals.magnesium)} mg/L de magnésium (plus de 50).`,
    bicarbonate_rich: (v) => `Bicarbonatée : ${n(v.minerals.bicarbonate)} mg/L de bicarbonates (plus de 600).`,
    sulphate_rich: (v) => `Sulfatée : ${n(v.minerals.sulphate)} mg/L de sulfates (plus de 200).`,
    chloride_rich: (v) => `Chlorurée : ${n(v.minerals.chloride)} mg/L de chlorures (plus de 200).`,
    fluoride_present: (v) => `Fluorée : ${n(v.minerals.fluoride)} mg/L de fluor (plus de 1).`,
    fluoride_high: (v) =>
      `Fluor ${n(v.minerals.fluoride)} mg/L (plus de 1,5) : la réglementation européenne impose la mention « ne convient pas aux nourrissons et aux enfants de moins de 7 ans pour une consommation régulière ».`,
    nitrate_low: (v) => `Pauvre en nitrates : ${n(v.minerals.nitrate)} mg/L (10 ou moins).`,
    nitrate_high: (v) => `Nitrates ${n(v.minerals.nitrate)} mg/L : au-dessus de la limite européenne de 50 mg/L.`,
  },
  waterTips: {
    ph_neutral: () => "Pile là où une eau de boisson doit être. Rien à signaler.",
    ph_acidic: (v) =>
      (v.ph ?? 7) < 5.5
        ? "Assez acide. Vous pouvez la boire, mais l'émail des dents commence à se fragiliser en dessous d'un pH d'environ 5,5 : mieux vaut la boire pendant les repas que la siroter toute la journée."
        : "Légèrement acide. Vous pouvez la boire ; vous remarquerez peut-être un goût plus vif.",
    ph_alkaline: () => "Plus alcaline que d'habitude. Vous pouvez la boire ; elle peut avoir un goût un peu plat ou amer. L'acidité de l'estomac la neutralise : elle ne change pas le pH de votre corps.",
    ph_sparkling: () => "Ce sont les bulles : le gaz carbonique dissous rend toute eau gazeuse un peu acide. Tout à fait normal, et bien plus doux pour les dents que les sodas ou les jus.",
    mineral_very_low: () => "Une eau très légère, presque sans minéraux, au goût neutre. Elle hydrate tout aussi bien, mais n'apporte presque rien en minéraux.",
    mineral_low: () => "Une eau légère, pour tous les jours. Facile à boire toute la journée.",
    mineral_medium: () => "Une bonne dose de minéraux. Convient au quotidien, avec un goût qui se remarque.",
    mineral_high: () => "Une eau très minéralisée, au goût marqué. Avant d'en faire votre seule eau, regardez les lignes sodium, sulfates et fluor ci-dessous.",
    hardness_soft: () => "Eau douce : goût léger, et pas de calcaire dans la bouilloire.",
    hardness_medium: () => "Dans la moyenne. Rien à signaler.",
    hardness_hard: () => "Eau dure. Aucun effet néfaste sur la santé n'a été démontré, et son calcium et son magnésium comptent dans vos apports. Elle laisse en revanche du calcaire dans les bouilloires.",
    hardness_very_hard: () => "Eau très dure. Aucun effet néfaste sur la santé n'a été démontré non plus ; attendez-vous à un goût plus prononcé et à beaucoup de calcaire dans la bouilloire.",
    low_sodium: () => "Très peu de sel. Un bon choix si vous surveillez votre tension ou mangez peu salé.",
    sodium_rich: (v) =>
      `Salée pour une eau : un litre apporte environ ${share(v.minerals.sodium, DAILY.sodium)} % des 2 g de sodium qu'il est conseillé aux adultes de ne pas dépasser par jour. En cas d'hypertension, de maladie du cœur ou des reins, ou de régime pauvre en sel, gardez-la pour de temps en temps.`,
    calcium_rich: (v) =>
      `Un litre apporte environ ${share(v.minerals.calcium, DAILY.calcium)} % du calcium dont un adulte a besoin par jour, ce qui est bon pour les os. Pour les calculs rénaux : le calcium de l'eau n'en est pas la cause, et l'on conseille aux personnes qui en font de boire beaucoup et de garder un apport normal en calcium plutôt que de le réduire. Si votre médecin vous a fixé une limite de calcium, suivez-la.`,
    magnesium_rich: (v) =>
      `Un litre apporte environ ${share(v.minerals.magnesium, DAILY.magnesium)} % du magnésium quotidien d'un adulte. Au-delà d'environ 250 mg par jour venant de l'eau et des compléments, le magnésium peut accélérer le transit. En cas de maladie rénale, demandez d'abord l'avis de votre médecin.`,
    bicarbonate_rich: () => "Riche en bicarbonates, que beaucoup trouvent agréables pour la digestion après un repas. Ces eaux sont souvent riches en sodium aussi : vérifiez cette ligne.",
    sulphate_rich: () => "Riche en sulfates, qui peuvent avoir un effet laxatif, surtout sans habitude. À éviter pour préparer les biberons.",
    chloride_rich: () => "Beaucoup de chlorures, qui donnent à l'eau un goût légèrement salé. Sans conséquence pour la santé en soi.",
    fluoride_present: () => "Contient du fluor, qui aide à protéger les dents des caries. Avec un dentifrice fluoré, inutile d'en chercher davantage.",
    fluoride_high: () => "Beaucoup de fluor. Ne l'utilisez pas pour les bébés ni comme eau de tous les jours des jeunes enfants : pendant les années où les dents se forment, un excès de fluor peut les tacher.",
    nitrate_low: () => "Presque pas de nitrates : l'un des critères à regarder pour l'eau des biberons.",
    nitrate_high: () => "Trop de nitrates. Ne l'utilisez jamais pour les biberons : chez le nourrisson, les nitrates peuvent réduire la capacité du sang à transporter l'oxygène.",
  },
  waterSources: SOURCES_FR,
  excipients: {
    wheat_starch:
      "Amidon de blé : ce médicament ne contient qu'une très faible teneur en gluten et est considéré comme « sans gluten » ; il est donc très peu susceptible de poser problème en cas de maladie cœliaque. Si vous êtes allergique au blé (ce qui est différent de la maladie cœliaque), vous ne devez pas le prendre.",
    starch_unspecified:
      "Amidon, sans origine précisée. Il s'agit le plus souvent d'amidon de maïs ou de pomme de terre, sans gluten, mais l'emballage ne le dit pas. En cas de maladie cœliaque ou d'allergie au blé, demandez au pharmacien de quel amidon il s'agit.",
    lactose:
      "Contient du lactose. Si votre médecin vous a informé d'une intolérance à certains sucres, contactez-le avant de prendre ce médicament.",
    sugars:
      "Contient du sucre (saccharose ou glucose). Si votre médecin vous a informé d'une intolérance à certains sucres, contactez-le avant de le prendre. Dans les sirops, la quantité peut compter en cas de diabète.",
    fructose_sorbitol:
      "Contient du sorbitol ou du fructose. Si vous (ou votre enfant) présentez une intolérance héréditaire au fructose ou une intolérance à certains sucres, parlez-en à votre médecin avant de le prendre.",
    aspartame:
      "Contient de l'aspartam, source de phénylalanine. Peut être dangereux en cas de phénylcétonurie.",
    peanut_oil:
      "Contient de l'huile d'arachide. Ne l'utilisez pas si vous êtes allergique à l'arachide ou au soja.",
    soya:
      "Contient du soja. Ne l'utilisez pas si vous êtes allergique à l'arachide ou au soja.",
    sesame_oil:
      "Contient de l'huile de sésame, qui peut dans de rares cas provoquer des réactions allergiques sévères.",
    sulphites:
      "Contient des sulfites, qui peuvent dans de rares cas provoquer des réactions allergiques sévères et une gêne respiratoire.",
    azo_colours:
      "Contient un colorant azoïque, qui peut provoquer des réactions allergiques.",
    parabens:
      "Contient des parabènes (parahydroxybenzoates), qui peuvent provoquer des réactions allergiques, éventuellement retardées.",
    benzoates:
      "Contient de l'acide benzoïque ou un benzoate. Peut accentuer la jaunisse (jaunissement de la peau et des yeux) chez les nouveau-nés jusqu'à 4 semaines.",
    benzyl_alcohol:
      "Contient de l'alcool benzylique. Il ne doit pas être donné aux nouveau-nés, ni utilisé plus d'une semaine chez l'enfant de moins de 3 ans sans avis médical. Demandez conseil à votre médecin ou à votre pharmacien si vous êtes enceinte, si vous allaitez ou en cas de maladie du foie ou des reins.",
    alcohol:
      "Contient de l'alcool (éthanol). La quantité est en général faible, mais signalez-le à votre médecin ou à votre pharmacien pour un enfant, pendant la grossesse ou l'allaitement, ou en cas de maladie du foie, d'épilepsie ou de dépendance à l'alcool.",
    propylene_glycol:
      "Contient du propylène glycol. Pour un bébé de moins de 4 semaines, un enfant de moins de 5 ans, pendant la grossesse ou l'allaitement, ou en cas de maladie du foie ou des reins, demandez d'abord l'avis d'un médecin ou d'un pharmacien.",
    effervescent_sodium:
      "Les comprimés effervescents contiennent en général beaucoup de sodium. Tenez-en compte en cas de régime pauvre en sel, d'hypertension ou de maladie du cœur ou des reins.",
  },
  excipientSources: { ema: "EMA, excipients dans l'étiquetage et la notice", pack: "La composition telle qu'imprimée sur l'emballage" },
  categories: {
    Colour: "Colorant",
    Preservative: "Conservateur",
    "Antioxidant / acidity regulator": "Antioxydant / correcteur d'acidité",
    "Thickener, stabiliser or emulsifier": "Épaississant, stabilisant ou émulsifiant",
    "Acidity regulator / anti-caking agent": "Correcteur d'acidité / antiagglomérant",
    "Flavour enhancer": "Exhausteur de goût",
    "Glazing agent, gas or sweetener": "Agent d'enrobage, gaz ou édulcorant",
    "Modified starch": "Amidon modifié",
    "Other additive": "Autre additif",
    Color: "Colorant",
    Emulsifier: "Émulsifiant",
    Stabiliser: "Stabilisant",
    Stabilizer: "Stabilisant",
    Thickener: "Épaississant",
    "Gelling agent": "Gélifiant",
    Sweetener: "Édulcorant",
    Antioxidant: "Antioxydant",
    Acid: "Acidifiant",
    Acidifier: "Acidifiant",
    "Acidity regulator": "Correcteur d'acidité",
    "Raising agent": "Poudre à lever",
    "Anti-caking agent": "Antiagglomérant",
    "Glazing agent": "Agent d'enrobage",
    Humectant: "Humectant",
    Flavouring: "Arôme",
    Flavoring: "Arôme",
  },
  sugar: {
    high: (v, unit, t) =>
      `${n(v)} g de sucres pour 100 ${unit}, au-dessus du seuil « élevé » de ${n(t.high)} g utilisé sur les étiquettes en face avant au Royaume-Uni.`,
    low: (v, unit, t) =>
      `${n(v)} g de sucres pour 100 ${unit}, au niveau ou en dessous du seuil « faible » de ${n(t.low)} g utilisé sur les étiquettes en face avant au Royaume-Uni.`,
    medium: (v, unit, t) =>
      `${n(v)} g de sucres pour 100 ${unit}, entre les seuils « faible » (${n(t.low)} g) et « élevé » (${n(t.high)} g) utilisés sur les étiquettes en face avant au Royaume-Uni.`,
    notPrinted: "Aucune teneur en sucres pour 100 g/ml n'est imprimée sur la partie visible de l'étiquette.",
    estimated: "Valeur approximative pour une recette typique de ce plat, non mesurée.",
  },
  highlights: {
    high: (nutrient, value, unit) =>
      `Riche en ${{ fat: "matières grasses", saturated_fat: "acides gras saturés", sugars: "sucres", salt: "sel" }[nutrient]} (${n(value)} g pour 100 ${unit})`,
    lowSugars: (value, unit) => `Pauvre en sucres (${n(value)} g pour 100 ${unit})`,
  },
};

/** Arabic prose reads better with Arabic unit names than with Latin ones mid-sentence */
const arUnit = (unit: Unit) => (unit === "ml" ? "مل" : "غ");

const ar: AnalysisMessages = {
  allergenNames: {
    gluten: "الغلوتين",
    milk: "الحليب",
    eggs: "البيض",
    peanuts: "الفول السوداني",
    tree_nuts: "المكسّرات",
    soy: "الصويا",
    sesame: "السمسم",
    fish: "السمك",
    crustaceans: "القشريات",
    molluscs: "الرخويات",
    celery: "الكرفس",
    mustard: "الخردل",
    sulphites: "الكبريتيت",
    lupin: "الترمس",
  },
  warnings: {
    nutritionDropped: "بعض القيم الغذائية كانت غير مقروءة أو غير ممكنة فتم استبعادها.",
    nutritionInconsistent: (issues) =>
      `بعض القيم الغذائية تبدو غير متسقة (${issues.join("؛ ")}). تحقق منها على العبوة.`,
    reconstructed: "أُعيد تكوين قائمة المكوّنات من نص الملصق.",
    notALabel:
      "هذه الصورة لا تبدو ملصقًا غذائيًّا. للحصول على أفضل نتيجة، صوّر قائمة المكوّنات أو جدول القيم الغذائية عن قرب.",
    poorQuality: "كانت قراءة الملصق صعبة، لذا قد تكون بعض التفاصيل ناقصة أو غير دقيقة. صورة أوضح وأقرب ستساعد.",
    fairQuality: "بعض أجزاء الملصق كانت صعبة القراءة. تحقق من الأرقام المهمة على العبوة.",
    noIngredients:
      "لم تكن قائمة المكوّنات مقروءة، لذا فإن فحوص مسببات الحساسية والغلوتين والمضافات غير مكتملة.",
    cutShort: "انقطع التحليل قبل اكتماله؛ قد تكون بعض الأقسام ناقصة.",
    unstructured:
      "لم يتمكن الذكاء الاصطناعي من قراءة هذه الصورة قراءة منظَّمة. جرّب صورة أوضح وجيدة الإضاءة لقائمة المكوّنات أو جدول القيم الغذائية.",
    needProductPhoto:
      "تعذّرت قراءة قائمة المكوّنات، لذا فإن فحوص مسببات الحساسية والغلوتين والمضافات غير مكتملة. صوّر المنتج كاملًا بحيث يظهر اسمه والرمز الشريطي ليتسنّى البحث عنه.",
    estimatedDish:
      "هذه المكوّنات تقدير من شكل الطعام وليست مقروءة من ملصق. قد تختلف الوصفة الحقيقية، فلا تعتمد عليها إذا كانت لديك حساسية.",
    estimatedProduct:
      "لم تكن قائمة المكوّنات مقروءة. هذه هي المكوّنات المعتادة لهذا المنتج كما يتذكّرها الذكاء الاصطناعي، فتحقق منها على العبوة.",
    database: (product) =>
      `لم تكن قائمة المكوّنات مقروءة في الصورة، فاستُكملت من صفحة «${product}» في قاعدة بيانات Open Food Facts. تأكد من أنها تطابق منتجك.`,
    databaseScan: (product) =>
      `هذه المعلومات من صفحة «${product}» في Open Food Facts، وهي قاعدة بيانات تشاركية، وليست من صورة لمنتجك: قارنها بالملصق.`,
    estimatedNutrition:
      "السعرات والعناصر الغذائية تقدير تقريبي لوصفة وحصة نموذجيتين من هذا الطبق، وقد تختلف القيم الحقيقية كثيرًا.",
    medicineGeneral:
      "دواعي الاستعمال والجرعة المعتادة والتحذيرات أدناه معلومات عامة عن المادة الفعّالة كتبها ذكاء اصطناعي. قد تكون خاطئة وقد لا تنطبق عليك. جرعتك هي التي حدّدها لك طبيبك أو الصيدلي: التزم بها واقرأ النشرة.",
    medicineNoActive:
      "تعذّرت قراءة المادة الفعّالة، لذا لا تُعرض أي معلومات عامة. صوّر جانب العلبة الذي يذكر المادة وتركيزها.",
    medicineNoExcipients:
      "السواغات غير ظاهرة في هذه الصورة ولم نجدها في قاعدة البيانات الرسمية للأدوية، لذا تعذّر التحقق من الغلوتين والمكوّنات الحساسة الأخرى. إن كان ذلك يهمّك فأضف صورة للتركيبة (على جانب العلبة أو في النشرة).",
    medicineDatabase: (product) =>
      `السواغات لم تكن ظاهرة في الصورة، وقد أُخذت من قاعدة البيانات الرسمية للأدوية في فرنسا، صفحة «${product}». قد تختلف العلبة المصنوعة لبلد آخر: النشرة الموجودة في علبتك هي المرجع.`,
    medicineMarks:
      "الخطوط المرسومة بالقلم على العلبة قرأها ذكاء اصطناعي. إذا لم تطابق هذه القراءة ما قاله لك طبيبك أو الصيدلي فاتبع ما قالاه واطلب منهما التأكيد.",
    medicineMarksUnclear:
      "الخطوط المرسومة بالقلم على العلبة كانت صعبة القراءة: لا تعتمد على هذه القراءة واسأل الصيدلي.",
  },
  issues: {
    sugarsOverCarbs: "السكريات تتجاوز الكربوهيدرات",
    saturatesOverFat: "الدهون المشبعة تتجاوز إجمالي الدهون",
    macrosOver100: "مجموع المغذيات الكبرى يتجاوز 100 غ",
    energyMismatch: "الطاقة لا تتوافق مع المغذيات الكبرى",
  },
  evidence: {
    ingredient: (name) => `مكوّن: ${name}`,
    glutenDeclared: "الغلوتين مصرَّح به كمسبب للحساسية",
    glutenMayContain: "عبارة «قد يحتوي على» الغلوتين",
    glutenFree: "مكتوب عليه خالٍ من الغلوتين",
    milkDeclared: "الحليب مصرَّح به كمسبب للحساسية",
    milkMayContain: "عبارة «قد يحتوي على» الحليب",
    lactoseFree: "مكتوب عليه خالٍ من اللاكتوز",
  },
  sources: {
    mayContain: "عبارة «قد يحتوي على»",
    declared: "مصرَّح به على الملصق",
    listed: "مذكور على الملصق",
  },
  water: {
    ph_neutral: (v) => `الرقم الهيدروجيني ${v.ph}: ضمن المجال 6.5–9.5 المحدد لمياه الشرب في الاتحاد الأوروبي.`,
    ph_acidic: (v) => `الرقم الهيدروجيني ${v.ph}: أكثر حموضة من المجال 6.5–9.5 المحدد لمياه الشرب في الاتحاد الأوروبي.`,
    ph_alkaline: (v) => `الرقم الهيدروجيني ${v.ph}: أكثر قلوية من المجال 6.5–9.5 المحدد لمياه الشرب في الاتحاد الأوروبي.`,
    ph_sparkling: (v) => `الرقم الهيدروجيني ${v.ph}: حمضي، وهذا طبيعي في المياه الغازية (ثاني أكسيد الكربون المذاب).`,
    mineral_very_low: (v) => `تمعدن ضعيف جدًّا: ${v.residue} ملغ/ل من البقايا الجافة (أقل من 50).`,
    mineral_low: (v) => `تمعدن ضعيف: ${v.residue} ملغ/ل من البقايا الجافة (حتى 500).`,
    mineral_medium: (v) => `تمعدن متوسط: ${v.residue} ملغ/ل من البقايا الجافة (من 500 إلى 1500).`,
    mineral_high: (v) => `غنية بالأملاح المعدنية: ${v.residue} ملغ/ل من البقايا الجافة (أكثر من 1500).`,
    hardness_soft: (v) => `ماء يسير: العسرة نحو ${v.hardness} ملغ/ل مقدَّرة بكربونات الكالسيوم.`,
    hardness_medium: (v) => `ماء متوسط العسرة: العسرة نحو ${v.hardness} ملغ/ل مقدَّرة بكربونات الكالسيوم.`,
    hardness_hard: (v) => `ماء عسر: العسرة نحو ${v.hardness} ملغ/ل مقدَّرة بكربونات الكالسيوم.`,
    hardness_very_hard: (v) => `ماء شديد العسرة: العسرة نحو ${v.hardness} ملغ/ل مقدَّرة بكربونات الكالسيوم.`,
    low_sodium: (v) => `قليل الصوديوم: ${v.minerals.sodium} ملغ/ل (أقل من 20)، وهو حدّ عبارة «مناسب لحمية قليلة الصوديوم».`,
    sodium_rich: (v) => `يحتوي على الصوديوم: ${v.minerals.sodium} ملغ/ل (أكثر من 200).`,
    calcium_rich: (v) => `يحتوي على الكالسيوم: ${v.minerals.calcium} ملغ/ل (أكثر من 150).`,
    magnesium_rich: (v) => `يحتوي على المغنيسيوم: ${v.minerals.magnesium} ملغ/ل (أكثر من 50).`,
    bicarbonate_rich: (v) => `يحتوي على البيكربونات: ${v.minerals.bicarbonate} ملغ/ل (أكثر من 600).`,
    sulphate_rich: (v) => `يحتوي على الكبريتات: ${v.minerals.sulphate} ملغ/ل (أكثر من 200).`,
    chloride_rich: (v) => `يحتوي على الكلوريد: ${v.minerals.chloride} ملغ/ل (أكثر من 200).`,
    fluoride_present: (v) => `يحتوي على الفلورايد: ${v.minerals.fluoride} ملغ/ل (أكثر من 1).`,
    fluoride_high: (v) =>
      `الفلورايد ${v.minerals.fluoride} ملغ/ل (أكثر من 1.5): تفرض القواعد الأوروبية التنبيه إلى أنه غير مناسب للاستهلاك المنتظم للرضّع والأطفال دون 7 سنوات.`,
    nitrate_low: (v) => `قليل النترات: ${v.minerals.nitrate} ملغ/ل (10 أو أقل).`,
    nitrate_high: (v) => `النترات ${v.minerals.nitrate} ملغ/ل: أعلى من الحد الأوروبي البالغ 50 ملغ/ل.`,
  },
  waterTips: {
    ph_neutral: () => "في المكان الصحيح تمامًا لماء الشرب. لا شيء يستدعي القلق.",
    ph_acidic: (v) =>
      (v.ph ?? 7) < 5.5
        ? "حمضي بوضوح. شربه آمن، لكن مينا الأسنان تبدأ بالضعف تحت رقم هيدروجيني يقارب 5.5، لذا فالأرفق بأسنانك أن تشربه مع الوجبات لا أن ترتشفه طوال اليوم."
        : "حمضي قليلًا. شربه آمن، وقد تلاحظ فقط طعمًا أكثر حدّة.",
    ph_alkaline: () => "أكثر قلوية من المعتاد. شربه آمن، وقد يكون طعمه باهتًا أو مرًّا قليلًا. حمض المعدة يعادله، فهو لا يغيّر الرقم الهيدروجيني لجسمك.",
    ph_sparkling: () => "السبب هو الفقاعات: ثاني أكسيد الكربون المذاب يجعل أي ماء غازي حمضيًّا قليلًا. أمر طبيعي تمامًا، وهو ألطف بالأسنان كثيرًا من المشروبات الغازية المحلّاة والعصائر.",
    mineral_very_low: () => "ماء خفيف جدًّا يكاد يخلو من المعادن وطعمه محايد. يروي العطش كغيره، لكنه لا يضيف شيئًا يُذكر إلى حاجتك من المعادن.",
    mineral_low: () => "ماء خفيف لكل يوم. سهل الشرب طوال اليوم.",
    mineral_medium: () => "كمية معقولة من المعادن. مناسب لكل يوم، وطعمه ملحوظ.",
    mineral_high: () => "ماء غني جدًّا بالمعادن وطعمه قوي. قبل أن تجعله ماءك الوحيد، انظر إلى أسطر الصوديوم والكبريتات والفلورايد أدناه.",
    hardness_soft: () => "ماء يسير: طعم خفيف، ولا ترسّبات كلسية في الغلاية.",
    hardness_medium: () => "في الوسط. لا شيء يستدعي القلق.",
    hardness_hard: () => "ماء عسر. لم يثبت أي ضرر صحي من شربه، وما فيه من كالسيوم ومغنيسيوم يُحسب من حاجتك اليومية. لكنه يترك ترسّبات كلسية في الغلاية.",
    hardness_very_hard: () => "ماء شديد العسرة. لم يثبت كذلك أي ضرر صحي من شربه؛ توقّع طعمًا أوضح وترسّبات كلسية كثيرة في الغلاية.",
    low_sodium: () => "ملح قليل جدًّا. خيار جيد إذا كنت تراقب ضغط الدم أو تتبع حمية قليلة الملح.",
    sodium_rich: (v) =>
      `مالح بالنسبة إلى ماء: اللتر الواحد يعطي نحو ${share(v.minerals.sodium, DAILY.sodium)}% من 2 غ من الصوديوم التي يُنصح البالغون بعدم تجاوزها يوميًّا. إذا كان لديك ارتفاع في ضغط الدم أو مرض في القلب أو الكلى، أو طُلب منك تقليل الملح، فاجعله لبعض الأحيان فقط.`,
    calcium_rich: (v) =>
      `اللتر الواحد يعطي نحو ${share(v.minerals.calcium, DAILY.calcium)}% من الكالسيوم الذي يحتاجه البالغ في اليوم، وهذا مفيد للعظام. أما حصى الكلى: فكالسيوم الماء ليس سببها، ويُنصح من تتكوّن لديهم الحصى بالإكثار من شرب الماء والحفاظ على كمية طبيعية من الكالسيوم لا بتقليله. وإذا حدّد لك طبيبك مقدارًا من الكالسيوم فالتزم به.`,
    magnesium_rich: (v) =>
      `اللتر الواحد يعطي نحو ${share(v.minerals.magnesium, DAILY.magnesium)}% من حاجة البالغ اليومية من المغنيسيوم. فوق نحو 250 ملغ يوميًّا من الماء والمكمّلات قد يليّن المغنيسيوم الأمعاء. إذا كان لديك مرض في الكلى فاستشر طبيبك أولًا.`,
    bicarbonate_rich: () => "غني بالبيكربونات، ويجده كثيرون مريحًا للمعدة بعد الأكل. هذه المياه تكون غالبًا غنية بالصوديوم أيضًا، فتحقق من ذلك السطر.",
    sulphate_rich: () => "كبريتات مرتفعة، وقد يكون لها أثر مليّن، خصوصًا إذا لم تكن معتادًا عليها. ليس خيارًا جيدًا لتحضير رضّاعات الأطفال.",
    chloride_rich: () => "كلوريد كثير، يعطي الماء طعمًا مالحًا قليلًا. لا يشكّل في ذاته مشكلة صحية.",
    fluoride_present: () => "يحتوي على الفلورايد الذي يساعد على حماية الأسنان من التسوّس. إذا كنت تستعمل معجونًا بالفلورايد فلا حاجة إلى المزيد.",
    fluoride_high: () => "فلورايد كثير. لا تستعمله للرضّع ولا كماء يومي للأطفال الصغار: في سنوات تكوّن الأسنان قد تترك الزيادة منه بقعًا عليها.",
    nitrate_low: () => "نترات تكاد لا تُذكر: من الأمور التي يُنظر إليها عند اختيار ماء لرضّاعات الأطفال.",
    nitrate_high: () => "نترات أكثر من اللازم. لا تستعمله أبدًا لرضّاعات الأطفال: عند الرضّع قد تُضعف النترات قدرة الدم على حمل الأكسجين.",
  },
  waterSources: SOURCES_AR,
  excipients: {
    wheat_starch:
      "نشا القمح: هذا الدواء يحتوي على كمية ضئيلة جدًّا من الغلوتين ويُعدّ «خاليًا من الغلوتين»، لذا يُستبعد جدًّا أن يسبّب مشكلة إذا كنت مصابًا بالداء البطني (السيلياك). إذا كانت لديك حساسية من القمح (وهي تختلف عن الداء البطني) فلا يجوز أن تتناوله.",
    starch_unspecified:
      "نشا دون ذكر مصدره. يكون غالبًا نشا الذرة أو البطاطا وهما خاليان من الغلوتين، لكن العلبة لا تذكر ذلك. إذا كنت مصابًا بالداء البطني أو بحساسية القمح فاسأل الصيدلي عن نوع النشا.",
    lactose:
      "يحتوي على اللاكتوز. إذا أخبرك طبيبك بأن لديك عدم تحمّل لبعض السكريات فاتصل به قبل تناول هذا الدواء.",
    sugars:
      "يحتوي على سكر (سكروز أو غلوكوز). إذا أخبرك طبيبك بأن لديك عدم تحمّل لبعض السكريات فاتصل به قبل تناوله. في الأشربة قد تكون الكمية مهمة إذا كنت مصابًا بالسكري.",
    fructose_sorbitol:
      "يحتوي على السوربيتول أو الفركتوز. إذا كان لديك (أو لدى طفلك) عدم تحمّل وراثي للفركتوز أو عدم تحمّل لبعض السكريات فتحدّث إلى طبيبك قبل تناوله.",
    aspartame:
      "يحتوي على الأسبارتام، وهو مصدر للفينيل ألانين. قد يكون ضارًّا إذا كنت مصابًا ببيلة الفينيل كيتون.",
    peanut_oil:
      "يحتوي على زيت الفول السوداني. لا تستعمله إذا كانت لديك حساسية من الفول السوداني أو الصويا.",
    soya:
      "يحتوي على الصويا. لا تستعمله إذا كانت لديك حساسية من الفول السوداني أو الصويا.",
    sesame_oil:
      "يحتوي على زيت السمسم، وقد يسبّب في حالات نادرة تفاعلات تحسسية شديدة.",
    sulphites:
      "يحتوي على الكبريتيت، وقد يسبّب في حالات نادرة تفاعلات تحسسية شديدة وصعوبة في التنفس.",
    azo_colours:
      "يحتوي على ملوّن آزوي قد يسبّب تفاعلات تحسسية.",
    parabens:
      "يحتوي على البارابين (باراهيدروكسي بنزوات)، وقد يسبّب تفاعلات تحسسية ربما تكون متأخرة.",
    benzoates:
      "يحتوي على حمض البنزويك أو أحد أملاحه. قد يزيد اليرقان (اصفرار الجلد والعينين) عند حديثي الولادة حتى عمر 4 أسابيع.",
    benzyl_alcohol:
      "يحتوي على الكحول البنزيلي. لا يجوز إعطاؤه لحديثي الولادة، ولا يُستعمل أكثر من أسبوع للأطفال دون 3 سنوات إلا بمشورة الطبيب. استشر طبيبك أو الصيدلي إذا كنتِ حاملًا أو مرضعًا أو كان لديك مرض في الكبد أو الكلى.",
    alcohol:
      "يحتوي على الكحول (الإيثانول). الكمية صغيرة في العادة، لكن أخبر طبيبك أو الصيدلي إذا كان الدواء لطفل، أو أثناء الحمل أو الرضاعة، أو إذا كان لديك مرض في الكبد أو صرع أو إدمان على الكحول.",
    propylene_glycol:
      "يحتوي على البروبيلين غليكول. للرضيع دون 4 أسابيع، أو الطفل دون 5 سنوات، أو أثناء الحمل أو الرضاعة، أو عند وجود مرض في الكبد أو الكلى، استشر الطبيب أو الصيدلي أولًا.",
    effervescent_sodium:
      "الأقراص الفوّارة تحتوي عادةً على كمية كبيرة من الصوديوم. خذ ذلك في الحسبان إذا كنت تتبع حمية قليلة الملح أو كان لديك ارتفاع في ضغط الدم أو مرض في القلب أو الكلى.",
  },
  excipientSources: { ema: "وكالة الأدوية الأوروبية، السواغات في الملصق والنشرة", pack: "التركيبة كما هي مطبوعة على العلبة" },
  categories: {
    Colour: "ملوّن",
    Preservative: "مادة حافظة",
    "Antioxidant / acidity regulator": "مضاد أكسدة / منظّم حموضة",
    "Thickener, stabiliser or emulsifier": "مثخّن أو مثبّت أو مستحلب",
    "Acidity regulator / anti-caking agent": "منظّم حموضة / مانع تكتّل",
    "Flavour enhancer": "معزّز نكهة",
    "Glazing agent, gas or sweetener": "مادة ملمّعة أو غاز أو مُحلٍّ",
    "Modified starch": "نشا معدَّل",
    "Other additive": "مادة مضافة أخرى",
    Color: "ملوّن",
    Emulsifier: "مستحلب",
    Stabiliser: "مثبّت",
    Stabilizer: "مثبّت",
    Thickener: "مثخّن",
    "Gelling agent": "مادة مهلِّمة",
    Sweetener: "مُحلٍّ",
    Antioxidant: "مضاد أكسدة",
    Acid: "محمِّض",
    Acidifier: "محمِّض",
    "Acidity regulator": "منظّم حموضة",
    "Raising agent": "مادة رافعة",
    "Anti-caking agent": "مانع تكتّل",
    "Glazing agent": "مادة ملمّعة",
    Humectant: "مرطّب",
    Flavouring: "منكّه",
    Flavoring: "منكّه",
  },
  sugar: {
    high: (v, unit, t) =>
      `${v} غ من السكريات لكل 100 ${arUnit(unit)}، أي أعلى من عتبة «مرتفع» البالغة ${t.high} غ المعتمدة في الملصقات الأمامية البريطانية.`,
    low: (v, unit, t) =>
      `${v} غ من السكريات لكل 100 ${arUnit(unit)}، أي عند عتبة «منخفض» البالغة ${t.low} غ المعتمدة في الملصقات الأمامية البريطانية أو دونها.`,
    medium: (v, unit, t) =>
      `${v} غ من السكريات لكل 100 ${arUnit(unit)}، أي بين عتبتي «منخفض» (${t.low} غ) و«مرتفع» (${t.high} غ) المعتمدتين في الملصقات الأمامية البريطانية.`,
    notPrinted: "لا توجد قيمة للسكريات لكل 100 غ/مل مطبوعة على الجزء الظاهر من الملصق.",
    estimated: "قيمة تقريبية لوصفة نموذجية من هذا الطبق وليست مقيسة.",
  },
  highlights: {
    high: (nutrient, value, unit) =>
      `نسبة مرتفعة من ${{ fat: "الدهون", saturated_fat: "الدهون المشبعة", sugars: "السكريات", salt: "الملح" }[nutrient]} (${value} غ لكل 100 ${arUnit(unit)})`,
    lowSugars: (value, unit) => `نسبة منخفضة من السكريات (${value} غ لكل 100 ${arUnit(unit)})`,
  },
};

const MESSAGES: Record<Locale, AnalysisMessages> = { en, fr, ar };

/** an additive class in the reader's language; models often answer with the English class even when asked not to */
export function localCategory(m: AnalysisMessages, category: string | null): string | null {
  if (!category) return category;
  const wanted = category.trim().toLowerCase();
  const key = Object.keys(m.categories).find((k) => k.toLowerCase() === wanted);
  return key ? m.categories[key] : category;
}

/** unknown or missing locales fall back to English */
export function analysisMessages(locale: unknown): AnalysisMessages {
  return typeof locale === "string" && Object.hasOwn(MESSAGES, locale) ? MESSAGES[locale as Locale] : en;
}
