// The sentences normalize.ts writes itself (warnings, evidence, sugar explanation,
// computed highlights), in every interface language. English is the reference:
// its wording is pinned by normalize.test.ts.
// Shared by client and server: keep it free of runtime dependencies.

import type { Locale } from "../i18n/locales";
import type { AllergenId, LevelKey, MineralKey, WaterFactId } from "./types";
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
  /** keyed by English class names: those of knowledge.ts `additiveCategory`, plus the ones models write anyway */
  categories: Record<string, string>;
  sugar: {
    high: (value: number, unit: Unit, t: Threshold) => string;
    low: (value: number, unit: Unit, t: Threshold) => string;
    medium: (value: number, unit: Unit, t: Threshold) => string;
    notPrinted: string;
  };
  highlights: {
    high: (nutrient: LevelKey, value: number | null, unit: Unit) => string;
    lowSugars: (value: number | null, unit: Unit) => string;
  };
}

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
  categories: {},
  sugar: {
    high: (v, unit, t) =>
      `${v} g of sugars per 100 ${unit}, above the ${t.high} g “high” threshold used on UK front-of-pack labels.`,
    low: (v, unit, t) =>
      `${v} g of sugars per 100 ${unit}, at or below the ${t.low} g “low” threshold used on UK front-of-pack labels.`,
    medium: (v, unit, t) =>
      `${v} g of sugars per 100 ${unit}, between the ${t.low} g “low” and ${t.high} g “high” thresholds used on UK front-of-pack labels.`,
    notPrinted: "No sugar value per 100 g/ml is printed on the visible label.",
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
