"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Bar, CameraIcon, cn, Dot, dotClasses, Notice, Section, Spinner, Tag, Tone, toneClasses, toneText } from "./components/ui";
import { needsExcipients } from "./lib/analysis/medicine";
import { glutenLikelihood, LEVEL_THRESHOLDS, WATER_LIMITS } from "./lib/analysis/knowledge";
import { format, ltr, rich, useI18n } from "./lib/i18n/I18nProvider";
import { MINERAL_KEYS } from "./lib/analysis/types";
import type {
  Additive,
  AnalyzeMeta,
  Confidence,
  HighlightTone,
  Ingredient,
  LabelAnalysis,
  Level,
  Medicine,
  NutrientKey,
  Nutrients,
  Presence,
  Water,
  WaterFactId,
} from "./lib/analysis/types";

type SectionId =
  | "overview"
  | "dose"
  | "medicine"
  | "cautions"
  | "water"
  | "drink"
  | "allergens"
  | "dietary"
  | "nutrition"
  | "ingredients"
  | "additives"
  | "details"
  | "raw";

const presenceTone: Record<Presence, Tone> = {
  contains: "red",
  likely_contains: "amber",
  no_indication: "green",
  unclear: "zinc",
};

const levelTone: Record<Level | "unknown", Tone> = {
  low: "green",
  medium: "amber",
  high: "red",
  unknown: "zinc",
};

const highlightTone: Record<HighlightTone, Tone> = { positive: "green", neutral: "zinc", caution: "amber" };
const highlightMark: Record<HighlightTone, string> = { positive: "✓", neutral: "–", caution: "!" };

const confidenceLevel: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };


// labels come from the dictionary (results.nutrition.rows / .meters)
const tableRows: {
  key: Exclude<NutrientKey, "energy_kj" | "energy_kcal"> | "energy";
  sub?: boolean;
  unit: string;
}[] = [
  { key: "energy", unit: "" },
  { key: "fat_g", unit: "g" },
  { key: "saturated_fat_g", sub: true, unit: "g" },
  { key: "carbohydrates_g", unit: "g" },
  { key: "sugars_g", sub: true, unit: "g" },
  { key: "fiber_g", unit: "g" },
  { key: "protein_g", unit: "g" },
  { key: "salt_g", unit: "g" },
  { key: "sodium_mg", unit: "mg" },
];

const meters = [
  { key: "fat", nutrient: "fat_g" },
  { key: "saturated_fat", nutrient: "saturated_fat_g" },
  { key: "sugars", nutrient: "sugars_g" },
  { key: "salt", nutrient: "salt_g" },
] as const;

/** one sugar cube, in grams */
const SUGAR_CUBE_G = 4;

function cellValue(
  n: Nutrients | null,
  key: NutrientKey | "energy",
  unit: string,
  fmt: (n: number) => string,
): string | null {
  if (!n) return null;
  if (key === "energy") {
    const parts = [
      n.energy_kj !== null && `${fmt(n.energy_kj)} kJ`,
      n.energy_kcal !== null && `${fmt(n.energy_kcal)} kcal`,
    ].filter(Boolean);
    return parts.length ? parts.join(" / ") : null;
  }
  const v = n[key];
  return v === null ? null : `${fmt(v)} ${unit}`;
}

/** anchor id: coded additives are linked from ingredient pills; code-less ones get their index so ids stay unique */
const additiveId = (a: Pick<Additive, "code" | "name">, index?: number) =>
  a.code ? `additive-${a.code.toLowerCase()}` : `additive-${index ?? 0}-${a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Content({
  result,
  meta,
  onTakePhoto,
  onAddExcipients,
  adding = null,
}: {
  result: LabelAnalysis;
  meta?: AnalyzeMeta;
  /** opens the camera, for results that ask for another photo */
  onTakePhoto?: () => void;
  /** opens the camera for an optional photo of a medicine's composition, merged into this result */
  onAddExcipients?: () => void;
  /** that photo is being read ("working") or showed no excipient list ("none") */
  adding?: "working" | "none" | null;
}) {
  // nothing about a food: neither a label, a product, nor an estimate
  const empty =
    result.kind === "other" ||
    (!result.label_detected && result.ingredients.length === 0 && !result.product.name && !result.medicine);
  if (empty) return <NotALabel result={result} />;
  return <Results result={result} meta={meta} onTakePhoto={onTakePhoto} onAddExcipients={onAddExcipients} adding={adding} />;
}

function Results({
  result,
  meta,
  onTakePhoto,
  onAddExcipients,
  adding,
}: {
  result: LabelAnalysis;
  meta?: AnalyzeMeta;
  onTakePhoto?: () => void;
  onAddExcipients?: () => void;
  adding: "working" | "none" | null;
}) {
  const { t, fmt, languageName } = useI18n();
  const r = t.results;
  const { kind, product, nutrition, ingredients, allergens, additives, gluten, sugar, water, drink, medicine } = result;
  const med = t.results.medicine;

  // ---- derived data ----
  const additiveByCode = new Map(additives.filter((a) => a.code).map((a) => [a.code!, a]));
  const contains = allergens.filter((a) => a.presence === "contains");
  const mayContain = allergens.filter((a) => a.presence === "may_contain");
  const tags = [product.category, product.quantity].filter((x): x is string => !!x);
  const isWater = kind === "water";
  const estimated = result.ingredient_source === "estimated";
  const hasNutrition = !!nutrition || (!!sugar.explanation && kind !== "drink");
  const unit = sugar.basis === "100ml" ? "ml" : "g";
  // free text is in the language the photo was analyzed in, which the interface may since have left
  const analysisLocale = meta?.locale ?? "en";
  const labelLanguage = result.language?.slice(0, 2) ?? null;
  const translated = !!labelLanguage && labelLanguage !== analysisLocale;
  const translationOf = (i: Ingredient) =>
    analysisLocale === "en" ? i.name_en
    : translated || estimated ? (i.name_local ?? i.name_en)
    : (i.name_local ?? null);
  // a packaged product whose ingredient list is still missing or only recalled
  const needsProductPhoto = (kind === "label" || kind === "drink") && (ingredients.length === 0 || estimated);
  // a medicine whose excipients weren't read on the photo: a second photo can add them, if the user wants
  const canAddExcipients = needsExcipients(result) && !!onAddExcipients;

  const details = {
    dates: [
      [r.details.bestBefore, result.dates.best_before],
      [r.details.useBy, result.dates.expiration],
      [r.details.produced, result.dates.production],
      [r.details.lot, result.dates.lot],
    ],
    storage: [
      [r.details.temperature, result.storage.temperature],
      [r.details.instructions, result.storage.instructions],
    ],
    manufacturer: [
      [r.details.name, result.manufacturer.name],
      [r.details.address, result.manufacturer.address],
      [r.details.country, result.manufacturer.country],
      [r.details.origin, result.origin],
    ],
  } satisfies Record<string, [string, string | null][]>;
  const marks = [...result.certifications, ...result.claims];
  const hasDetails = marks.length > 0 || Object.values(details).some((rows) => rows.some(([, v]) => v));

  // what the sheet contains depends on what was photographed; the order is the reading order
  const shown: Record<Exclude<SectionId, "overview">, boolean> = {
    dose: !!medicine && (!!medicine.marks || !!medicine.typical_dose || !!medicine.how_to_take),
    medicine: !!medicine && (medicine.active.length > 0 || medicine.uses.length > 0 || !!medicine.form),
    cautions: !!medicine && (medicine.not_for.length > 0 || medicine.warnings.length > 0 || medicine.side_effects.length > 0),
    water: isWater,
    drink: kind === "drink",
    // a medicine's excipients get their own notes; the food-allergen list would only repeat them
    allergens: !isWater && !medicine,
    dietary: !isWater,
    nutrition: hasNutrition,
    ingredients: ingredients.length > 0 || (medicine?.excipients.length ?? 0) > 0,
    additives: additives.length > 0,
    details: hasDetails,
    raw: !!result.raw_text,
  };
  const order: Exclude<SectionId, "overview">[] =
    kind === "dish" ? ["ingredients", "allergens", "dietary", "nutrition", "additives", "details", "raw"]
    : kind === "drink" ? ["drink", "nutrition", "additives", "ingredients", "allergens", "dietary", "details", "raw"]
    : kind === "medicine" ? ["dose", "medicine", "cautions", "ingredients", "dietary", "nutrition", "additives", "details", "raw"]
    : ["water", "allergens", "dietary", "nutrition", "ingredients", "additives", "details", "raw"];
  const visible = order.filter((id) => shown[id]);
  const numberOf = (id: SectionId) => visible.indexOf(id as (typeof visible)[number]) + 1;
  const titles: Record<SectionId, string> = {
    overview: r.sections.overview,
    dose: med.dose,
    medicine: med.about,
    cautions: med.cautions,
    water: r.water.title,
    drink: r.drink.title,
    allergens: estimated && kind === "dish" ? r.dish.allergens : r.sections.allergens,
    dietary: r.sections.dietary,
    nutrition: r.sections.nutrition,
    ingredients: medicine ? med.excipients : estimated ? r.dish.ingredients : r.sections.ingredients,
    additives: r.sections.additives,
    details: r.sections.details,
    raw: r.sections.raw,
  };
  const sections: SectionId[] = ["overview", ...visible];
  const sectionKey = sections.join();

  // ---- navigation / highlight ----
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const [active, setActive] = useState<SectionId>("overview");
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1500);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const flashFor = (id: string) => (flash?.id === id ? flash.n : undefined);

  // scroll-spy: the active section is the last one whose top has passed under the sticky nav
  useEffect(() => {
    const ids = sectionKey.split(",") as SectionId[];
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(`section-${id}`);
        if (el && el.getBoundingClientRect().top <= 140) current = id;
      }
      setActive(atBottom ? ids[ids.length - 1] : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sectionKey]);

  // keep the active chip visible in the horizontally scrolling nav
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!nav || !chip) return;
    nav.scrollTo({
      left: chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2,
      behavior: "smooth",
    });
  }, [active]);

  const sid = (id: SectionId) => `section-${id}`;
  /** where a tile leads: the section, when it is on the sheet */
  const jump = (id: Exclude<SectionId, "overview">) => (shown[id] ? id : undefined);
  const head = (id: Exclude<SectionId, "overview">) => ({
    id: sid(id),
    index: numberOf(id),
    title: titles[id],
    flash: flashFor(sid(id)),
  });
  const found = (count: number) => format(r.tiles.found, { count });

  // ---- at a glance: what matters most for this kind of photo ----
  const factOf = (...ids: WaterFactId[]) => water?.facts.find((f) => ids.includes(f.id));
  const waterTile = (title: string, value: string | null, fact: Water["facts"][number] | undefined): Tile => ({
    title,
    label: value ?? r.water.notPrinted,
    tone: fact ? highlightTone[fact.tone] : "zinc",
    hint: fact ? r.water.short[fact.id as keyof typeof r.water.short] : undefined,
    target: jump("water"),
  });
  const glutenTile: Tile = {
    title: r.tiles.gluten,
    label: r.presence[gluten.status],
    tone: presenceTone[gluten.status],
    hint: gluten.status === "unclear" ? r.tiles.notEnoughInfo : r.tiles.confidence[gluten.confidence],
    target: jump("dietary"),
  };
  const kcal = nutrition?.per_serving?.energy_kcal ?? nutrition?.per_100?.energy_kcal ?? null;
  const caloriesTile: Tile = {
    title: r.dish.calories,
    label: kcal !== null ? ltr(`≈ ${fmt(kcal)} kcal`) : r.tiles.unknown,
    tone: "zinc",
    hint: kcal === null ? undefined : nutrition?.per_serving?.energy_kcal != null ? r.dish.perPortion : r.dish.per100,
    target: jump("nutrition"),
  };
  const sugarTile: Tile = {
    title: r.tiles.sugar,
    label: r.level[sugar.level],
    tone: levelTone[sugar.level],
    hint: sugar.per_100 !== null ? ltr(`${fmt(sugar.per_100)} g / 100 ${unit}`) : undefined,
    target: jump(kind === "drink" ? "drink" : "nutrition"),
  };
  const allergenTile: Tile = {
    title: titles.allergens,
    label:
      contains.length ? found(contains.length)
      : estimated && mayContain.length ? found(mayContain.length)
      : ingredients.length ? r.tiles.noneFound
      : r.tiles.unknown,
    tone:
      contains.length ? "red"
      : mayContain.length ? "amber"
      : ingredients.length ? "green"
      : "zinc",
    hint: contains.length || !estimated ? (mayContain.length ? format(r.tiles.mayContain, { count: mayContain.length }) : undefined) : undefined,
    target: jump("allergens"),
  };
  const countTile = (title: string, count: number, target: Exclude<SectionId, "overview">): Tile => ({
    title,
    label: count ? found(count) : ingredients.length ? r.tiles.noneFound : r.tiles.unknown,
    tone: count ? "amber" : ingredients.length ? "green" : "zinc",
    target: count ? jump(target) : jump("ingredients"),
  });
  const additiveTile = countTile(r.tiles.additives, additives.length, "additives");

  const tiles: Tile[] =
    isWater ?
      [
        waterTile(r.water.ph, water?.ph != null ? ltr(fmt(water.ph)) : null, factOf("ph_neutral", "ph_acidic", "ph_alkaline", "ph_sparkling")),
        waterTile(
          r.water.mineralContent,
          water?.dry_residue_mg_l != null ? ltr(`${fmt(water.dry_residue_mg_l)} mg/L`) : null,
          factOf("mineral_very_low", "mineral_low", "mineral_medium", "mineral_high"),
        ),
        waterTile(
          r.water.hardness,
          water?.hardness_mg_l != null ? ltr(`${fmt(water.hardness_mg_l)} mg/L`) : null,
          factOf("hardness_soft", "hardness_medium", "hardness_hard", "hardness_very_hard"),
        ),
        waterTile(
          r.water.sodium,
          water?.minerals.sodium != null ? ltr(`${fmt(water.minerals.sodium)} mg/L`) : null,
          factOf("low_sodium", "sodium_rich"),
        ),
      ]
    : kind === "drink" ?
      [
        sugarTile,
        countTile(r.drink.colours, drink?.colours.length ?? 0, "drink"),
        countTile(r.drink.sweeteners, drink?.sweeteners.length ?? 0, "drink"),
        additiveTile,
        allergenTile,
        glutenTile,
      ]
    : kind === "dish" ? [allergenTile, glutenTile, caloriesTile]
    : medicine ?
      [
        {
          title: med.active,
          label: medicine.active.length ? medicine.active.map((a) => capitalize(a.name_local ?? a.name)).join(" + ") : med.notRead,
          tone: "zinc",
          hint: medicine.active.map((a) => a.strength).filter(Boolean).join(" + ") || undefined,
          target: jump("medicine"),
        },
        ...(medicine.marks ?
          [
            {
              title: med.marked,
              label: ltr([medicine.marks.morning, medicine.marks.midday, medicine.marks.evening].map(fmt).join(" · ")),
              tone: "zinc" as const,
              hint: `${med.morning} · ${med.midday} · ${med.evening}`,
              target: jump("dose"),
            },
          ]
        : []),
        glutenTile,
        { ...countTile(med.toNote, medicine.excipients.length, "ingredients"), target: jump("ingredients") },
      ]
    : [glutenTile, sugarTile, allergenTile, additiveTile];

  const blocks: Record<Exclude<SectionId, "overview">, React.ReactNode> = {
    dose: medicine && (
      <Section {...head("dose")}>
        <div className="space-y-6">
          {medicine.marks && <DoseMarksPanel marks={medicine.marks} />}
          {(medicine.typical_dose || medicine.how_to_take) && (
            <div>
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <p className="eyebrow text-ink-soft">{med.typicalDose}</p>
                <Stamp tone="amber">{med.general}</Stamp>
              </div>
              {medicine.typical_dose && (
                <p dir="auto" className="text-[15px] leading-7">
                  {medicine.typical_dose}
                </p>
              )}
              {medicine.how_to_take && (
                <p dir="auto" className="mt-2 text-sm leading-6 text-ink-soft">
                  <span className="font-medium text-ink">{med.howToTake}: </span>
                  {medicine.how_to_take}
                </p>
              )}
              <p className="mt-3 text-sm font-medium">{med.yourDose}</p>
            </div>
          )}
        </div>
      </Section>
    ),

    medicine: medicine && (
      <Section {...head("medicine")}>
        <dl>
          {medicine.active.map((a) => (
            <div key={a.name} className="flex items-baseline gap-4 border-b border-rule py-3 first:pt-0">
              <dt className="eyebrow w-28 shrink-0 text-ink-soft">{med.active}</dt>
              <dd className="min-w-0 flex-1">
                <span dir="auto" className="font-display block text-lg leading-tight font-semibold">
                  {capitalize(a.name_local ?? a.name)}
                </span>
                {a.strength && <span className="mt-0.5 block font-mono text-sm text-ink-soft tabular-nums">{ltr(a.strength)}</span>}
              </dd>
            </div>
          ))}
          {medicine.form && (
            <div className="flex items-baseline gap-4 border-b border-rule py-3 first:pt-0">
              <dt className="eyebrow w-28 shrink-0 text-ink-soft">{med.form}</dt>
              <dd dir="auto" className="text-sm">
                {medicine.form}
              </dd>
            </div>
          )}
        </dl>
        {medicine.uses.length > 0 && <GeneralList title={med.uses} items={medicine.uses} className="mt-5" />}
      </Section>
    ),

    cautions: medicine && (
      <Section {...head("cautions")} aside={<Stamp tone="amber">{med.general}</Stamp>}>
        <div className="space-y-6">
          <GeneralList title={med.notFor} items={medicine.not_for} mark="!" tone="red" />
          <GeneralList title={med.warnings} items={medicine.warnings} mark="!" tone="amber" />
          <GeneralList title={med.sideEffects} items={medicine.side_effects} />
        </div>
      </Section>
    ),

    water: (
      <Section {...head("water")}>
        {water ?
          <WaterPanel water={water} />
        : <Notice tone="zinc">{r.water.noComposition}</Notice>}
      </Section>
    ),

    drink: (
      <Section {...head("drink")}>
        <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
          <p className="font-display text-5xl leading-none font-bold tabular-nums">
            {sugar.per_100 !== null ? ltr(`${fmt(sugar.per_100)} g`) : "—"}
          </p>
          <div className="pb-1">
            <p className="eyebrow text-ink-soft">
              {r.drink.sugars} · {r.drink.per100}
            </p>
            <Tag tone={levelTone[sugar.level]} className="mt-1">
              <Dot tone={levelTone[sugar.level]} />
              {sugar.per_100 !== null ? r.level[sugar.level] : r.drink.unknown}
            </Tag>
          </div>
        </div>
        {sugar.per_100 !== null && (
          <div className="mt-4">
            <Bar value={sugar.per_100 / (LEVEL_THRESHOLDS["100ml"].sugars.high * 1.4)} tone={levelTone[sugar.level]} />
          </div>
        )}
        {drink?.sugar_per_container_g != null && drink.volume_ml !== null && (
          <p className="mt-4 text-sm leading-6">
            <span className="font-medium">
              {format(r.drink.perContainer, {
                grams: fmt(drink.sugar_per_container_g),
                volume: ltr(drink.volume_ml >= 1000 ? `${fmt(drink.volume_ml / 1000)} L` : `${fmt(drink.volume_ml)} ml`),
              })}
            </span>
            {drink.sugar_per_container_g >= SUGAR_CUBE_G && (
              <span className="text-ink-soft">
                {" "}
                · {format(r.drink.cubes, { count: Math.round(drink.sugar_per_container_g / SUGAR_CUBE_G) })}
              </span>
            )}
          </p>
        )}
        {sugar.explanation && (
          <p dir="auto" className="mt-2 text-sm leading-6 text-ink-soft">
            {sugar.explanation}
          </p>
        )}
        <dl className="mt-5 border-t border-rule">
          {(
            [
              [r.drink.colours, drink?.colours ?? []],
              [r.drink.sweeteners, drink?.sweeteners ?? []],
            ] as const
          ).map(([label, names]) => (
            <div key={label} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule py-3">
              <dt className="eyebrow w-28 shrink-0 text-ink-soft">{label}</dt>
              <dd className="flex min-w-0 flex-1 flex-wrap gap-1.5">
                {names.length ?
                  names.map((name) => (
                    <Tag key={name} tone="amber" dir="auto">
                      {capitalize(name)}
                    </Tag>
                  ))
                : <span className="text-sm text-ink-soft">{ingredients.length ? r.drink.none : r.drink.unknown}</span>}
              </dd>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-rule py-3">
            <dt className="eyebrow w-28 shrink-0 text-ink-soft">{r.drink.caffeine}</dt>
            <dd className="text-sm">
              {drink?.caffeine ?
                <Tag tone="amber">{r.drink.present}</Tag>
              : <span className="text-ink-soft">{ingredients.length ? r.drink.none : r.drink.unknown}</span>}
            </dd>
          </div>
        </dl>
      </Section>
    ),

    allergens: (
      <Section {...head("allergens")}>
        {allergens.length === 0 ?
          <p className="text-sm leading-6 text-ink-soft">{ingredients.length ? r.allergens.none : r.allergens.unreadable}</p>
        : <div className="space-y-6">
            {contains.length > 0 && <AllergenGroup title={r.allergens.contains} tone="red" items={contains} />}
            {mayContain.length > 0 && (
              <AllergenGroup title={estimated ? r.dish.likely : r.allergens.mayContain} tone="amber" items={mayContain} />
            )}
          </div>
        }
      </Section>
    ),

    dietary: (
      <Section {...head("dietary")}>
        <GlutenPanel status={gluten.status} confidence={gluten.confidence} evidence={gluten.evidence} />
        {/* in a medicine, wheat starch means gluten is present but at a very low level: say so next to the verdict */}
        {medicine?.excipients
          .filter((e) => e.id === "wheat_starch" || e.id === "starch_unspecified")
          .map((e) => (
            <Notice key={e.id} tone="amber" className="mt-4">
              <span dir="auto" className="block">
                {e.note}
              </span>
              <span dir="auto" className="mt-1 block text-xs text-ink-soft/80">
                {med.source} {e.source}
              </span>
            </Notice>
          ))}
      </Section>
    ),

    nutrition: (
      <Section
        {...head("nutrition")}
        title={nutrition?.estimated ? r.dish.nutrition : r.nutrition.title}
        aside={
          nutrition?.serving_size && (
            <>
              {r.nutrition.serving} · <span dir="auto">{nutrition.serving_size}</span>
            </>
          )
        }
      >
        {nutrition?.per_100 && (
          <div className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-rule bg-rule sm:grid-cols-4">
            {meters.map((m, i) => (
              <LevelMeter
                key={m.key}
                label={r.nutrition.meters[m.key]}
                value={nutrition.per_100![m.nutrient]}
                level={nutrition.levels[m.key]}
                threshold={LEVEL_THRESHOLDS[nutrition.basis][m.key]}
                delay={i}
              />
            ))}
          </div>
        )}

        {nutrition && (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="eyebrow border-b-2 border-ink text-ink-soft">
                  <th className="pb-2 text-start font-medium">{r.nutrition.nutrient}</th>
                  {nutrition.per_100 && (
                    <th className="pb-2 text-end font-medium">
                      {format(r.nutrition.per100, { unit })}
                      {nutrition.per_100_calculated && (
                        <span className="block text-[10px] font-normal normal-case" title={r.nutrition.calculatedHint}>
                          {r.nutrition.calculated}
                        </span>
                      )}
                    </th>
                  )}
                  {nutrition.per_serving && <th className="pb-2 ps-4 text-end font-medium">{r.nutrition.perServing}</th>}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  const a = cellValue(nutrition.per_100, row.key, row.unit, fmt);
                  const b = cellValue(nutrition.per_serving, row.key, row.unit, fmt);
                  if (!a && !b) return null;
                  return (
                    <tr key={row.key} className="border-b border-rule">
                      <td className={cn("py-2.5", row.sub ? "ps-4 text-ink-soft" : "font-medium")}>
                        {r.nutrition.rows[row.key]}
                      </td>
                      {nutrition.per_100 && (
                        <td className="py-2.5 text-end font-mono text-[13px] tabular-nums">{a ? ltr(a) : "—"}</td>
                      )}
                      {nutrition.per_serving && (
                        <td className="py-2.5 ps-4 text-end font-mono text-[13px] tabular-nums">{b ? ltr(b) : "—"}</td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {sugar.explanation && kind !== "drink" && (
          <Notice tone={levelTone[sugar.level]} className="mt-5">
            {sugar.level !== "unknown" && <span className="font-semibold">{r.nutrition.sugarLevel[sugar.level]} </span>}
            <span dir="auto">{sugar.explanation}</span>
          </Notice>
        )}
      </Section>
    ),

    ingredients: (
      <Section {...head("ingredients")} aside={ingredients.length > 0 && format(r.ingredients.count, { count: ingredients.length })}>
        {medicine && medicine.excipients.length > 0 && (
          <div className="mb-6">
            <SubLabel>{med.toKnow}</SubLabel>
            <ul className="space-y-2">
              {medicine.excipients.map((e) => (
                <li key={e.id}>
                  <Notice tone={e.id === "wheat_starch" || e.id === "starch_unspecified" ? "amber" : "zinc"}>
                    <span dir="auto" className="block font-medium">
                      {capitalize(e.matched)}
                    </span>
                    <span dir="auto" className="block text-ink-soft">
                      {e.note}
                    </span>
                    <span dir="auto" className="mt-1 block text-xs text-ink-soft/80">
                      {med.source} {e.source}
                    </span>
                  </Notice>
                </li>
              ))}
            </ul>
          </div>
        )}
        {estimated ?
          <ol>
            {ingredients.map((ing, i) => (
              <EstimatedIngredient key={`${i}-${ing.name}`} ingredient={ing} translation={translationOf(ing)} />
            ))}
          </ol>
        : <ol className="flex flex-wrap gap-1.5">
            {ingredients.map((ing, i) => (
              <IngredientPill
                key={`${i}-${ing.name}`}
                ingredient={ing}
                translation={translationOf(ing)}
                index={i}
                additive={ing.e_number ? additiveByCode.get(ing.e_number) : undefined}
                onAdditive={(a) => goTo(additiveId(a))}
              />
            ))}
          </ol>
        }
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
          <Legend tone="red">{r.ingredients.legendAllergen}</Legend>
          {!estimated && <Legend tone="amber">{r.ingredients.legendAdditive}</Legend>}
        </div>
      </Section>
    ),

    additives: (
      <Section {...head("additives")} aside={found(additives.length)}>
        <ul className="grid gap-x-8 md:grid-cols-2">
          {additives.map((a, i) => {
            const id = additiveId(a, i);
            return (
              <li
                key={id}
                id={id}
                className={cn(
                  "scroll-mt-28 border-t border-rule py-4 transition-colors duration-500 first:border-t-0 md:nth-2:border-t-0",
                  flash?.id === id && "bg-accent/10",
                )}
              >
                <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                  {a.code && (
                    <span dir="ltr" className="rounded-md bg-warn-soft px-1.5 py-0.5 font-mono text-xs font-semibold text-warn">
                      {a.code}
                    </span>
                  )}
                  <span dir="auto" className="font-medium">
                    {capitalize(a.name_local ?? a.name)}
                  </span>
                </div>
                {a.category && (
                  <p dir="auto" className="eyebrow mt-2 text-ink-soft">
                    {a.category}
                  </p>
                )}
                {a.purpose && (
                  <p dir="auto" className="mt-2 text-sm leading-6">
                    <span className="font-medium">{r.additives.purpose}</span> {a.purpose}
                  </p>
                )}
                {a.explanation && (
                  <p dir="auto" className="mt-1 text-sm leading-6 text-ink-soft">
                    {a.explanation}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </Section>
    ),

    details: (
      <Section {...head("details")}>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <InfoList title={r.details.dates} rows={details.dates} />
          <InfoList title={r.details.storage} rows={details.storage} />
          <InfoList title={r.details.manufacturer} rows={details.manufacturer} />
          {marks.length > 0 && (
            <div>
              <SubLabel>{r.details.claims}</SubLabel>
              <div className="flex flex-wrap gap-1.5">
                {result.certifications.map((c) => (
                  <Tag key={`cert-${c}`} tone="green" dir="auto">
                    {c}
                  </Tag>
                ))}
                {result.claims.map((c) => (
                  <Tag key={`claim-${c}`} dir="auto">
                    {c}
                  </Tag>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    ),

    raw: result.raw_text ? <RawText {...head("raw")} text={result.raw_text} /> : null,
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Section nav */}
      <nav
        ref={navRef}
        aria-label={r.nav}
        className="animate-fade-in scrollbar-none sticky top-14 z-20 -mx-4 flex gap-1.5 overflow-x-auto bg-paper/90 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0"
      >
        {sections.map((id) => (
          <button
            key={id}
            data-id={id}
            onClick={() => goTo(sid(id))}
            aria-current={active === id ? "true" : undefined}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium whitespace-nowrap transition-colors duration-200",
              active === id ? "border-ink bg-ink text-paper" : "border-rule text-ink-soft hover:border-ink hover:text-ink",
            )}
          >
            {titles[id]}
          </button>
        ))}
      </nav>

      <article className="animate-fade-up overflow-hidden rounded-[28px] border border-rule bg-sheet">
        {/* Overview */}
        <header id={sid("overview")} className="scroll-mt-28 px-5 pt-6 pb-6 sm:px-7 sm:pt-7">
          <div className="flex flex-wrap items-center gap-1.5">
            <Stamp>{t.kinds[kind]}</Stamp>
            {estimated && <Stamp tone="amber">{r.source.estimated}</Stamp>}
            {result.database && <Stamp tone="zinc">{format(r.source.database, { name: result.database.name })}</Stamp>}
            {translated && <Stamp tone="zinc">{format(r.labelIn, { language: languageName(labelLanguage) })}</Stamp>}
          </div>
          {product.brand && (
            <p dir="auto" className="eyebrow mt-5 text-ink-soft">
              {product.brand}
            </p>
          )}
          <h2
            dir="auto"
            className={cn("font-display text-[1.75rem] leading-[1.1] font-bold text-balance sm:text-4xl", product.brand ? "mt-1" : "mt-5")}
          >
            {product.name ?? product.category ?? r.fallbackName}
          </h2>
          {tags.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-x-2 text-sm text-ink-soft">
              {tags.map((x, i) => (
                <span key={x} dir="auto">
                  {i > 0 && <span aria-hidden>· </span>}
                  {x}
                </span>
              ))}
            </p>
          )}
          {result.summary && (
            <p dir="auto" className="mt-4 text-[15px] leading-7 text-ink-soft">
              {result.summary}
            </p>
          )}
          {result.highlights.length > 0 && (
            <ul className="mt-4 space-y-2">
              {result.highlights.map((h) => (
                <li key={h.text} className="flex items-start gap-2.5 text-sm leading-6">
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md text-xs font-bold",
                      toneClasses[highlightTone[h.tone]],
                    )}
                  >
                    {highlightMark[h.tone]}
                  </span>
                  <span dir="auto">{h.text}</span>
                </li>
              ))}
            </ul>
          )}

          {/* nothing the analysis is unsure about is hidden */}
          {(result.warnings.length > 0 || needsProductPhoto || canAddExcipients || result.database) && (
            <div className="mt-5 space-y-2">
              {result.warnings.map((w) => (
                <Notice key={w} tone="amber">
                  <span dir="auto">{w}</span>
                  {result.database && w.includes(result.database.product) && (
                    <a
                      href={result.database.url}
                      target="_blank"
                      rel="noreferrer"
                      className="ms-1 font-medium text-accent underline underline-offset-2"
                    >
                      {r.source.viewEntry}
                    </a>
                  )}
                </Notice>
              ))}
              {needsProductPhoto && onTakePhoto && (
                // the warning above says why; this is the way out
                <button
                  onClick={onTakePhoto}
                  className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition active:scale-[0.98]"
                >
                  <CameraIcon className="size-5" />
                  {r.retake.button}
                </button>
              )}
              {canAddExcipients && (
                // optional: the result stands without it
                <div className="space-y-2">
                  {adding === "none" && (
                    <Notice tone="zinc">
                      <span role="status">{med.addPhotoNone}</span>
                    </Notice>
                  )}
                  <button
                    onClick={onAddExcipients}
                    disabled={adding === "working"}
                    className="inline-flex min-h-11 items-center gap-2 rounded-full border border-rule px-5 py-2 text-start text-sm font-semibold text-ink transition active:scale-[0.98] disabled:opacity-70"
                  >
                    {adding === "working" ? <Spinner className="text-accent" /> : <CameraIcon className="size-5 shrink-0 text-accent" />}
                    <span>
                      {adding === "working" ? med.addPhotoWorking : med.addPhoto}
                      {adding !== "working" && <span className="ms-2 eyebrow text-ink-soft">{med.optional}</span>}
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        {/* At a glance */}
        <div className="grid grid-cols-2 gap-px border-t border-rule bg-rule sm:grid-cols-3">
          {tiles.map(({ target, ...tile }, i) => (
            <StatusTile
              key={tile.title}
              {...tile}
              onClick={target ? () => goTo(sid(target)) : undefined}
              // the last tile fills its row instead of leaving a hole (2 columns, 3 from `sm`)
              className={
                i === tiles.length - 1 ?
                  cn(tiles.length % 2 === 1 && "col-span-2", ["sm:col-span-1", "sm:col-span-3", "sm:col-span-2"][tiles.length % 3])
                : undefined
              }
            />
          ))}
        </div>

        {visible.map((id) => (
          <React.Fragment key={id}>{blocks[id]}</React.Fragment>
        ))}

        <footer className="border-t border-rule px-5 py-5 text-xs leading-5 text-ink-soft sm:px-7">
          {r.disclaimer}
          {meta && (
            <span className="eyebrow mt-2 block tabular-nums">
              {format(r.duration, { seconds: fmt(Math.round(meta.duration_ms / 100) / 10) })}
            </span>
          )}
        </footer>
      </article>
    </div>
  );
}

function NotALabel({ result }: { result: LabelAnalysis }) {
  const { t } = useI18n();
  const n = t.results.notALabel;
  return (
    <article className="animate-fade-up overflow-hidden rounded-[28px] border border-rule bg-sheet">
      <div className="border-t-[3px] border-ink px-5 pt-5 pb-7 sm:px-7">
        <h2 className="font-display text-2xl leading-tight font-bold text-balance">{n.title}</h2>
        {result.product.name && (
          <p className="mt-3 text-sm leading-6 text-ink-soft">
            {rich(format(n.looksLike, { name: result.product.name }), (name) => (
              <b dir="auto" className="text-ink">
                {name}
              </b>
            ))}
          </p>
        )}
        {result.summary && (
          <p dir="auto" className="mt-3 text-sm leading-6 text-ink-soft">
            {result.summary}
          </p>
        )}
        {result.warnings.length > 0 && (
          <div className="mt-4 space-y-2">
            {result.warnings.map((w) => (
              <Notice key={w} tone="amber">
                <span dir="auto">{w}</span>
              </Notice>
            ))}
          </div>
        )}
        <ol className="mt-6">
          {n.tips.map((tip, i) => (
            <li key={tip} className="flex gap-4 border-t border-rule py-3 text-sm leading-6">
              <span aria-hidden dir="ltr" className="eyebrow pt-1 text-accent tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              {tip}
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

/** the pharmacist's pen marks, redrawn: strokes and a number for each time of day */
function DoseMarksPanel({ marks }: { marks: NonNullable<Medicine["marks"]> }) {
  const { t, fmt } = useI18n();
  const med = t.results.medicine;
  const times: [string, number][] = [
    [med.morning, marks.morning],
    [med.midday, marks.midday],
    [med.evening, marks.evening],
  ];
  const total = marks.morning + marks.midday + marks.evening;
  return (
    <div>
      <p className="font-display text-base font-semibold">{med.marksTitle}</p>
      <p className="mt-1 text-sm leading-6 text-ink-soft">{med.marksText}</p>
      <dl className="mt-3 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-rule bg-rule">
        {times.map(([label, count]) => (
          <div key={label} className={cn("flex flex-col items-center bg-sheet px-2 py-4", count === 0 && "text-ink-soft/60")}>
            <dt className="eyebrow">{label}</dt>
            {/* the strokes as drawn on the box; a half unit is a short stroke */}
            <dd className="mt-3 flex flex-col items-center">
              <span aria-hidden dir="ltr" className="flex h-9 items-end gap-1.5">
                {Array.from({ length: Math.floor(count) }, (_, i) => (
                  <span key={i} className="h-9 w-1 rounded-full bg-accent" />
                ))}
                {count % 1 !== 0 && <span className="h-4 w-1 rounded-full bg-accent" />}
                {count === 0 && <span className="mb-4 h-0.5 w-4 rounded-full bg-rule" />}
              </span>
              <span className="font-display mt-2 text-3xl leading-none font-bold tabular-nums">{ltr(fmt(count))}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {total > 0 && <span className="font-medium">{format(med.perDay, { count: ltr(fmt(total)) })}</span>}
        {marks.duration && (
          <span className="text-ink-soft">
            {med.duration} <span dir="auto">{marks.duration}</span>
          </span>
        )}
        {marks.note && (
          <span className="text-ink-soft">
            {med.written}: <span dir="auto">“{marks.note}”</span>
          </span>
        )}
      </p>
    </div>
  );
}

/** a titled list of the model's general statements about a medicine; renders nothing when empty */
function GeneralList({
  title,
  items,
  mark = "–",
  tone = "zinc",
  className,
}: {
  title: string;
  items: string[];
  mark?: string;
  tone?: Tone;
  className?: string;
}) {
  if (items.length === 0) return null;
  return (
    <div className={className}>
      <SubLabel>{title}</SubLabel>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-sm leading-6">
            <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-md text-xs font-bold", toneClasses[tone])}>
              {mark}
            </span>
            <span dir="auto">{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** the printed composition: pH on its scale, the mineral table, and what the values mean */
function WaterPanel({ water }: { water: Water }) {
  const { t, fmt } = useI18n();
  const w = t.results.water;
  const printed = MINERAL_KEYS.filter((k) => water.minerals[k] !== null);
  const largest = Math.max(1, ...printed.map((k) => water.minerals[k]!));
  const stats: [string, string | null][] = [
    [w.ph, water.ph !== null ? fmt(water.ph) : null],
    [w.residue, water.dry_residue_mg_l !== null ? `${fmt(water.dry_residue_mg_l)} mg/L` : null],
    [w.hardness, water.hardness_mg_l !== null ? `${fmt(water.hardness_mg_l)} mg/L` : null],
  ];
  const { low, high } = WATER_LIMITS.ph;

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-rule bg-rule">
        {stats.map(([label, value]) => (
          <div key={label} className="bg-sheet p-3.5">
            <dt className="eyebrow text-ink-soft">{label}</dt>
            <dd className={cn("mt-1 font-display leading-tight font-semibold tabular-nums", value ? "text-xl" : "text-sm text-ink-soft")}>
              {value ? ltr(value) : w.notPrinted}
            </dd>
          </div>
        ))}
      </dl>

      {water.ph !== null && (
        // the scale reads 0 → 14 left to right in every language
        <div dir="ltr" aria-hidden>
          <div className="relative h-2.5 rounded-full bg-mute-soft">
            <div
              className="absolute inset-y-0 rounded-full bg-good/35"
              style={{ left: `${(low / 14) * 100}%`, width: `${((high - low) / 14) * 100}%` }}
            />
            <div
              className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-sheet bg-ink"
              style={{ left: `${(Math.min(14, Math.max(0, water.ph)) / 14) * 100}%` }}
            />
          </div>
          <div className="eyebrow mt-1.5 flex justify-between text-ink-soft tabular-nums">
            <span>0</span>
            <span>7</span>
            <span>14</span>
          </div>
        </div>
      )}

      {printed.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="eyebrow border-b-2 border-ink text-ink-soft">
              <th className="pb-2 text-start font-medium">{w.mineral}</th>
              <th className="pb-2 text-end font-medium">{w.perLitre}</th>
            </tr>
          </thead>
          <tbody>
            {printed.map((k, i) => (
              <tr key={k} className="border-b border-rule">
                <td className="py-2.5">
                  <span className="font-medium">{w.minerals[k]}</span>
                  <div className="mt-1.5 max-w-56">
                    <Bar value={water.minerals[k]! / largest} tone="zinc" delay={i * 50} />
                  </div>
                </td>
                <td className="py-2.5 text-end align-top font-mono text-[13px] tabular-nums">{ltr(fmt(water.minerals[k]!))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {water.facts.length > 0 && (
        <div>
          <SubLabel>{w.meaning}</SubLabel>
          <p className="mb-4 text-xs leading-5 text-ink-soft">{w.advice}</p>
          <ul className="space-y-4">
            {water.facts.map((f) => (
              <li key={f.id} className="flex items-start gap-2.5 text-sm leading-6">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-md text-xs font-bold",
                    toneClasses[highlightTone[f.tone]],
                  )}
                >
                  {highlightMark[f.tone]}
                </span>
                <span className="min-w-0">
                  <span dir="auto" className="block font-medium">
                    {f.text}
                  </span>
                  {f.tip && (
                    <span dir="auto" className="mt-0.5 block text-ink-soft">
                      {f.tip}
                    </span>
                  )}
                  {f.source && (
                    <span dir="auto" className="mt-1 block text-xs text-ink-soft/80">
                      {w.source} {f.source}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AllergenGroup({ title, tone, items }: { title: string; tone: Tone; items: LabelAnalysis["allergens"] }) {
  const { t } = useI18n();
  return (
    <div>
      <SubLabel>{title}</SubLabel>
      <ul>
        {items.map((a) => (
          <li key={a.id} className="flex flex-col gap-1.5 border-t border-rule py-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-baseline sm:gap-4">
            <span className="flex shrink-0 items-center gap-2 sm:w-44">
              <Tag tone={tone}>
                <Dot tone={tone} />
                {t.results.allergenNames[a.id] ?? a.name}
              </Tag>
              {a.declared && <span className="eyebrow text-ink-soft">{t.results.allergens.declared}</span>}
            </span>
            <span dir="auto" className="text-sm leading-6 text-ink-soft">
              {a.sources.join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IngredientPill({
  ingredient: ing,
  translation,
  index,
  additive,
  onAdditive,
}: {
  ingredient: Ingredient;
  /** the name in the reader's language, when the label is in another one */
  translation: string | null;
  index: number;
  additive?: Additive;
  onAdditive: (a: Additive) => void;
}) {
  const { t } = useI18n();
  const flagged = ing.allergens.length > 0 || ing.gluten;
  const tone: Tone | undefined =
    flagged ? "red"
    : additive ? "amber"
    : undefined;
  const title = [
    ing.allergens.length ?
      format(t.results.ingredients.allergensTitle, {
        list: ing.allergens.map((a) => t.results.allergenNames[a]).join(", "),
      })
    : null,
    additive ? `${additive.code} · ${additive.name_local ?? additive.name}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const className = cn(
    "inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-start text-sm",
    tone ? toneClasses[tone] : "border border-rule",
  );
  const content = (
    <>
      <span dir="ltr" className="font-mono text-[11px] tabular-nums opacity-55">
        {index + 1}
      </span>
      <span className="flex flex-col leading-tight">
        <span dir="auto" className={cn(tone && "text-ink")}>
          {ing.name}
        </span>
        {translation && (
          <span dir="auto" className="text-xs text-ink-soft">
            {translation}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li>
      {additive ?
        <button onClick={() => onAdditive(additive)} title={title || undefined} className={cn(className, "transition active:scale-[0.98]")}>
          {content}
          <span aria-hidden className="inline-block opacity-60 rtl:-scale-x-100">
            ↗
          </span>
        </button>
      : <span title={title || undefined} className={className}>
          {content}
        </span>
      }
    </li>
  );
}

/** one guessed ingredient: a row, with how sure the guess is */
function EstimatedIngredient({ ingredient: ing, translation }: { ingredient: Ingredient; translation: string | null }) {
  const { t } = useI18n();
  const flagged = ing.allergens.length > 0 || ing.gluten;
  const level = ing.confidence ?? "medium";
  return (
    <li className="flex items-center gap-3 border-t border-rule py-2.5 first:border-t-0 first:pt-0">
      <Dot tone={flagged ? "red" : "zinc"} className={cn(!flagged && "opacity-0")} />
      <span className="min-w-0 flex-1 leading-tight">
        <span dir="auto" className="text-sm font-medium">
          {capitalize(translation ?? ing.name)}
        </span>
        {flagged && (
          <span className="block text-xs text-bad">
            {ing.allergens.map((a) => t.results.allergenNames[a]).join(", ")}
          </span>
        )}
      </span>
      <span
        className="flex shrink-0 items-center gap-2"
        title={`${t.results.dish.confidence}: ${t.results.dietary.confidenceLevel[level]}`}
      >
        <span className="eyebrow text-ink-soft">{t.results.dietary.confidenceLevel[level]}</span>
        <span aria-hidden className="flex gap-0.5">
          {[1, 2, 3].map((n) => (
            <span key={n} className={cn("h-3 w-1.5 rounded-full", n <= confidenceLevel[level] ? "bg-ink" : "bg-mute-soft")} />
          ))}
        </span>
      </span>
    </li>
  );
}

interface TileProps {
  title: string;
  label: string;
  tone: Tone;
  hint?: string;
  onClick?: () => void;
  className?: string;
}

/** a tile before it is wired up: `target` is the section it jumps to */
type Tile = Omit<TileProps, "onClick" | "className"> & { target?: Exclude<SectionId, "overview"> };

function StatusTile({ title, label, tone, hint, onClick, className }: TileProps) {
  const Root = onClick ? "button" : "div";
  return (
    <Root
      onClick={onClick}
      className={cn(
        "group flex min-h-24 flex-col items-start bg-sheet p-4 text-start transition-colors",
        onClick && "cursor-pointer hover:bg-mute-soft/60 active:bg-mute-soft",
        className,
      )}
    >
      <span className="eyebrow text-ink-soft">{title}</span>
      <span className="mt-2 flex items-center gap-2">
        <Dot tone={tone} className="size-2.5" />
        <span className={cn("font-display text-lg leading-tight font-semibold", tone !== "zinc" && toneText[tone])}>{label}</span>
      </span>
      {hint && <span className="mt-1 text-xs text-ink-soft">{hint}</span>}
    </Root>
  );
}

/** the gluten verdict, how likely it is, and the evidence behind it */
function GlutenPanel({ status, confidence, evidence }: { status: Presence; confidence: Confidence; evidence: string[] }) {
  const { t, fmt } = useI18n();
  const d = t.results.dietary;
  const tone = presenceTone[status];
  const likelihood = glutenLikelihood(status, confidence);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
        <div>
          <p className="eyebrow text-ink-soft">{d.likelihood}</p>
          <p className={cn("font-display mt-1 text-4xl leading-none font-bold tabular-nums", tone !== "zinc" && toneText[tone])}>
            {likelihood !== null ? ltr(`${fmt(Math.round(likelihood * 100))} %`) : d.unknown}
          </p>
        </div>
        <Tag tone={tone}>
          <Dot tone={tone} />
          {t.results.presence[status]}
        </Tag>
      </div>
      <div className="mt-4">
        <Bar value={likelihood ?? 0} tone={tone} />
        <div dir="ltr" aria-hidden className="eyebrow mt-1.5 flex justify-between text-ink-soft tabular-nums rtl:flex-row-reverse">
          <span>0 %</span>
          <span>100 %</span>
        </div>
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-soft">
        {d.confidence}: <span className="font-medium text-ink">{d.confidenceLevel[confidence]}</span> · {d.likelihoodHint}
      </p>
      {evidence.length > 0 ?
        <ul className="mt-3 space-y-1 text-sm leading-6 text-ink-soft">
          {evidence.map((e, i) => (
            <li key={i} dir="auto" className="flex gap-2">
              <span aria-hidden>–</span>
              {e}
            </li>
          ))}
        </ul>
      : <p className="mt-3 text-sm leading-6 text-ink-soft">
          {status === "unclear" ? t.results.dietary.unclear : t.results.dietary.noEvidence}
        </p>
      }
    </div>
  );
}

function LevelMeter({
  label,
  value,
  level,
  threshold,
  delay,
}: {
  label: string;
  value: number | null;
  level: Level | null;
  threshold: { low: number; high: number };
  delay: number;
}) {
  const { t, fmt } = useI18n();
  const tone = levelTone[level ?? "unknown"];
  return (
    <div
      className="bg-sheet p-3.5"
      title={format(t.results.nutrition.thresholds, { low: fmt(threshold.low), high: fmt(threshold.high) })}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="eyebrow text-ink-soft">{label}</span>
        <span className={cn("eyebrow", toneText[tone])}>{level ? t.results.level[level] : t.results.nutrition.notAvailable}</span>
      </div>
      <p className="mt-1 mb-2 font-display text-xl font-semibold tabular-nums">{value !== null ? ltr(`${fmt(value)} g`) : "—"}</p>
      <Bar value={value == null ? 0 : value / (threshold.high * 1.4)} tone={tone} delay={150 + delay * 80} />
    </div>
  );
}

function InfoList({ title, rows }: { title: string; rows: [string, string | null][] }) {
  const filled = rows.filter((row): row is [string, string] => !!row[1]);
  if (filled.length === 0) return null;
  return (
    <div>
      <SubLabel>{title}</SubLabel>
      <dl className="text-sm">
        {filled.map(([label, value]) => (
          <div key={label} className="flex gap-3 border-t border-rule py-2 first:border-t-0 first:pt-0">
            <dt className="w-28 shrink-0 text-ink-soft">{label}</dt>
            <dd dir="auto" className="min-w-0 wrap-break-word">
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function RawText({
  id,
  index,
  title,
  text,
  flash,
}: {
  id: string;
  index: number;
  title: string;
  text: string;
  flash?: number;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const long = text.length > 280 || text.split("\n").length > 4;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard can be unavailable (insecure context); nothing to do
    }
  };

  return (
    <Section
      id={id}
      index={index}
      title={title}
      flash={flash}
      aside={
        <button onClick={copy} className="eyebrow rounded-md px-2 py-1 text-accent transition hover:bg-mute-soft active:scale-95">
          {copied ? t.results.raw.copied : t.results.raw.copy}
        </button>
      }
    >
      <div className="relative">
        <pre
          dir="auto"
          className={cn(
            "overflow-hidden font-mono text-xs leading-5 whitespace-pre-wrap text-ink-soft transition-[max-height] duration-500",
            open || !long ? "max-h-[2000px]" : "max-h-24",
          )}
        >
          {text}
        </pre>
        {!open && long && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-sheet" />}
      </div>
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="mt-3 text-sm font-medium text-accent underline underline-offset-4">
          {open ? t.results.raw.showLess : t.results.raw.showAll}
        </button>
      )}
    </Section>
  );
}

/** a small printed stamp in the sheet's header: what the photo is, where the data comes from */
function Stamp({ tone, children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("eyebrow inline-flex items-center rounded-md px-2 py-1", tone ? toneClasses[tone] : "border border-accent text-accent")}>
      {children}
    </span>
  );
}

function SubLabel({ children }: { children: React.ReactNode }) {
  return <p className="eyebrow mb-2.5 text-ink-soft">{children}</p>;
}

function Legend({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn("size-2.5 rounded-sm", dotClasses[tone])} />
      {children}
    </span>
  );
}
