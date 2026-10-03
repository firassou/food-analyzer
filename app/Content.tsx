"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, cn, Dot, dotClasses, Pill, Tone, toneClasses } from "./components/ui";
import { LEVEL_THRESHOLDS } from "./lib/analysis/knowledge";
import { format, ltr, rich, useI18n } from "./lib/i18n/I18nProvider";
import type {
  Additive,
  AnalyzeMeta,
  Ingredient,
  LabelAnalysis,
  Level,
  NutrientKey,
  Nutrients,
  Presence,
} from "./lib/analysis/types";

type SectionId =
  | "overview"
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

const confidenceWidth = { low: "33%", medium: "66%", high: "100%" };

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

function cellValue(
  n: Nutrients | null,
  key: NutrientKey | "energy",
  unit: string,
  fmt: (n: number) => string,
): string | null {
  if (!n) return null;
  if (key === "energy") {
    const parts = [
      n.energy_kj !== null && `${fmt(n.energy_kj)}\u00a0kJ`,
      n.energy_kcal !== null && `${fmt(n.energy_kcal)}\u00a0kcal`,
    ].filter(Boolean);
    return parts.length ? parts.join(" / ") : null;
  }
  const v = n[key];
  return v === null ? null : `${fmt(v)}\u00a0${unit}`;
}

/** anchor id: coded additives are linked from ingredient pills; code-less ones get their index so ids stay unique */
const additiveId = (a: Pick<Additive, "code" | "name">, index?: number) =>
  a.code ? `additive-${a.code.toLowerCase()}` : `additive-${index ?? 0}-${a.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Content({
  result,
  meta,
}: {
  result: LabelAnalysis;
  meta?: AnalyzeMeta;
}) {
  if (!result.label_detected) return <NotALabel result={result} />;
  return <Results result={result} meta={meta} />;
}

function Results({
  result,
  meta,
}: {
  result: LabelAnalysis;
  meta?: AnalyzeMeta;
}) {
  const { t, fmt, languageName } = useI18n();
  const r = t.results;
  const {
    product,
    nutrition,
    ingredients,
    allergens,
    additives,
    gluten,
    lactose,
    sugar,
  } = result;

  // ---- derived data ----
  const additiveByCode = new Map(
    additives.filter((a) => a.code).map((a) => [a.code!, a]),
  );
  const contains = allergens.filter((a) => a.presence === "contains");
  const mayContain = allergens.filter((a) => a.presence === "may_contain");
  const tags = [product.category, product.quantity].filter(
    (t): t is string => !!t,
  );
  const hasNutrition = !!nutrition || !!sugar.explanation;
  const unit = sugar.basis === "100ml" ? "ml" : "g";
  // free text is in the language the photo was analyzed in, which the interface may since have left
  const analysisLocale = meta?.locale ?? "en";
  const labelLanguage = result.language?.slice(0, 2) ?? null;
  const translated = !!labelLanguage && labelLanguage !== analysisLocale;
  const translationOf = (i: Ingredient) =>
    analysisLocale === "en" ? i.name_en
    : translated ? (i.name_local ?? i.name_en)
    : (i.name_local ?? null);

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
  const hasDetails =
    result.certifications.length > 0 ||
    result.claims.length > 0 ||
    Object.values(details).some((rows) => rows.some(([, v]) => v));

  const sections: { id: SectionId; label: string }[] = [
    { id: "overview", label: r.sections.overview },
    { id: "allergens", label: r.sections.allergens },
    { id: "dietary", label: r.sections.dietary },
    ...(hasNutrition ? [{ id: "nutrition" as const, label: r.sections.nutrition }] : []),
    ...(ingredients.length ?
      [{ id: "ingredients" as const, label: r.sections.ingredients }]
    : []),
    ...(additives.length ?
      [{ id: "additives" as const, label: r.sections.additives }]
    : []),
    ...(hasDetails ? [{ id: "details" as const, label: r.sections.details }] : []),
    ...(result.raw_text ? [{ id: "raw" as const, label: r.sections.raw }] : []),
  ];
  const sectionKey = sections.map((s) => s.id).join();

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
    flashTimer.current = setTimeout(() => setFlash(null), 1800);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const flashFor = (id: string) => (flash?.id === id ? flash.n : undefined);

  // scroll-spy: the active section is the last one whose top has passed under the sticky nav
  useEffect(() => {
    const ids = sectionKey.split(",") as SectionId[];
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(`section-${id}`);
        if (el && el.getBoundingClientRect().top <= 160) current = id;
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

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Section nav */}
      <nav
        ref={navRef}
        aria-label={r.nav}
        className="animate-fade-in sticky top-14 z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b border-zinc-200/70 bg-zinc-50/90 px-4 py-2.5 backdrop-blur-lg scrollbar-none sm:mx-0 sm:rounded-2xl sm:border sm:px-2 dark:border-zinc-800/70 dark:bg-black/85"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            data-id={s.id}
            onClick={() => goTo(sid(s.id))}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-300",
              active === s.id ?
                "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Overview */}
      <header
        id={sid("overview")}
        className="animate-fade-up relative scroll-mt-32 overflow-hidden rounded-3xl bg-linear-to-br from-emerald-500 via-emerald-600 to-teal-700 p-6 text-white shadow-xl shadow-emerald-600/20 sm:p-8"
      >
        <div
          aria-hidden
          className="animate-float absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -left-10 size-48 rounded-full bg-teal-300/20 blur-2xl"
        />
        <div className="relative">
          {product.brand && (
            <p className="text-xs font-semibold tracking-[0.2em] text-emerald-100 uppercase">
              {product.brand}
            </p>
          )}
          <h2
            dir="auto"
            className="mt-1.5 text-2xl leading-tight font-semibold text-balance sm:text-3xl"
          >
            {product.name ?? product.category ?? r.fallbackName}
          </h2>
          {(tags.length > 0 || translated) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t}
                  dir="auto"
                  className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur"
                >
                  {t}
                </span>
              ))}
              {translated && (
                <span className="rounded-full bg-black/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
                  🌐 {format(r.labelIn, { language: languageName(labelLanguage) })}
                </span>
              )}
            </div>
          )}
          {result.summary && (
            <p
              dir="auto"
              className="mt-5 border-t border-white/20 pt-4 text-sm leading-6 text-emerald-50 sm:text-[15px] sm:leading-7"
            >
              {result.summary}
            </p>
          )}
          {result.highlights.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {result.highlights.map((h) => (
                <li
                  key={h.text}
                  className="flex items-start gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15"
                >
                  <span aria-hidden className="shrink-0">
                    {h.tone === "caution" ?
                      "⚠"
                    : h.tone === "positive" ?
                      "✓"
                    : "•"}
                  </span>
                  <span dir="auto">{h.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {result.warnings.length > 0 && (
        <div
          role="note"
          className="animate-fade-up flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <span aria-hidden>ⓘ</span>
          <ul className="space-y-1">
            {result.warnings.map((w) => (
              <li key={w} dir="auto">
                {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Key indicators */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatusTile
          delay={1}
          title={r.tiles.gluten}
          label={r.presence[gluten.status]}
          tone={presenceTone[gluten.status]}
          hint={
            gluten.status === "unclear" ?
              r.tiles.notEnoughInfo
            : r.tiles.confidence[gluten.confidence]
          }
          onClick={() => goTo(sid("dietary"))}
        />
        <StatusTile
          delay={2}
          title={r.tiles.lactose}
          label={r.presence[lactose.status]}
          tone={presenceTone[lactose.status]}
          onClick={() => goTo(sid("dietary"))}
        />
        <StatusTile
          delay={3}
          title={r.tiles.sugar}
          label={r.level[sugar.level]}
          tone={levelTone[sugar.level]}
          hint={
            sugar.per_100 !== null ?
              ltr(`${fmt(sugar.per_100)} g / 100 ${unit}`)
            : undefined
          }
          onClick={hasNutrition ? () => goTo(sid("nutrition")) : undefined}
        />
        <StatusTile
          delay={4}
          title={r.tiles.allergens}
          label={
            contains.length ? format(r.tiles.found, { count: contains.length })
            : ingredients.length ?
              r.tiles.noneFound
            : r.tiles.unknown
          }
          tone={
            contains.length ? "red"
            : mayContain.length ?
              "amber"
            : ingredients.length ?
              "green"
            : "zinc"
          }
          hint={
            mayContain.length ? format(r.tiles.mayContain, { count: mayContain.length }) : undefined
          }
          onClick={() => goTo(sid("allergens"))}
        />
        <StatusTile
          delay={5}
          className="col-span-2 sm:col-span-1"
          title={r.tiles.additives}
          label={
            additives.length ? format(r.tiles.found, { count: additives.length })
            : ingredients.length ?
              r.tiles.noneFound
            : r.tiles.unknown
          }
          tone={
            additives.length ? "amber"
            : ingredients.length ?
              "green"
            : "zinc"
          }
          onClick={
            additives.length ? () => goTo(sid("additives"))
            : ingredients.length ?
              () => goTo(sid("ingredients"))
            : undefined
          }
        />
      </div>

      {/* Allergens */}
      <Card
        id={sid("allergens")}
        flash={flashFor(sid("allergens"))}
        title={r.sections.allergens}
        icon="⚠️"
        delay={2}
      >
        {allergens.length === 0 ?
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {ingredients.length ?
              r.allergens.none
            : r.allergens.unreadable}
          </p>
        : <div className="space-y-5">
            {contains.length > 0 && (
              <AllergenGroup title={r.allergens.contains} tone="red" items={contains} />
            )}
            {mayContain.length > 0 && (
              <AllergenGroup
                title={r.allergens.mayContain}
                tone="amber"
                items={mayContain}
              />
            )}
          </div>
        }
      </Card>

      {/* Gluten & lactose */}
      <Card
        id={sid("dietary")}
        flash={flashFor(sid("dietary"))}
        title={r.sections.dietary}
        icon="🌾"
        delay={3}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DietaryPanel
            title={r.tiles.gluten}
            status={gluten.status}
            evidence={gluten.evidence}
          >
            <div className="mt-3">
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>{r.dietary.confidence}</span>
                <span>{r.dietary.confidenceLevel[gluten.confidence]}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="animate-grow h-full origin-left rounded-full bg-emerald-500 rtl:origin-right"
                  style={{ width: confidenceWidth[gluten.confidence] }}
                />
              </div>
            </div>
          </DietaryPanel>
          <DietaryPanel
            title={r.tiles.lactose}
            status={lactose.status}
            evidence={lactose.evidence}
          />
        </div>
      </Card>

      {/* Nutrition */}
      {hasNutrition && (
        <Card
          id={sid("nutrition")}
          flash={flashFor(sid("nutrition"))}
          title={r.nutrition.title}
          icon="📊"
          delay={4}
          aside={
            nutrition?.serving_size && (
              <>
                {r.nutrition.serving}
                <br />
                <span dir="auto" className="font-medium text-zinc-700 dark:text-zinc-300">
                  {nutrition.serving_size}
                </span>
              </>
            )
          }
        >
          {nutrition?.per_100 && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
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
                  <tr className="text-start text-xs tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                    <th className="pb-2 text-start font-medium">{r.nutrition.nutrient}</th>
                    {nutrition.per_100 && (
                      <th className="pb-2 text-end font-medium">
                        {format(r.nutrition.per100, { unit })}
                        {nutrition.per_100_calculated && (
                          <span
                            className="block text-[10px] font-normal normal-case"
                            title={r.nutrition.calculatedHint}
                          >
                            {r.nutrition.calculated}
                          </span>
                        )}
                      </th>
                    )}
                    {nutrition.per_serving && (
                      <th className="pb-2 ps-4 text-end font-medium">
                        {r.nutrition.perServing}
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {tableRows.map((row) => {
                    const a = cellValue(nutrition.per_100, row.key, row.unit, fmt);
                    const b = cellValue(
                      nutrition.per_serving,
                      row.key,
                      row.unit,
                      fmt,
                    );
                    if (!a && !b) return null;
                    return (
                      <tr
                        key={row.key}
                        className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      >
                        <td
                          className={cn(
                            "py-2.5",
                            row.sub ?
                              "ps-4 text-zinc-500 dark:text-zinc-400"
                            : "font-medium text-zinc-900 dark:text-zinc-100",
                          )}
                        >
                          {r.nutrition.rows[row.key]}
                        </td>
                        {nutrition.per_100 && (
                          <td className="py-2.5 text-end tabular-nums">
                            {a ? ltr(a) : "—"}
                          </td>
                        )}
                        {nutrition.per_serving && (
                          <td className="py-2.5 ps-4 text-end tabular-nums">
                            {b ? ltr(b) : "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sugar.explanation && (
            <div
              className={cn(
                "mt-5 flex gap-3 rounded-2xl p-4 text-sm ring-1 ring-inset",
                toneClasses[levelTone[sugar.level]],
              )}
            >
              <span aria-hidden>🍬</span>
              <p>
                {sugar.level !== "unknown" && (
                  <span className="font-semibold">
                    {r.nutrition.sugarLevel[sugar.level]}{" "}
                  </span>
                )}
                <span dir="auto">{sugar.explanation}</span>
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Ingredients */}
      {ingredients.length > 0 && (
        <Card
          id={sid("ingredients")}
          flash={flashFor(sid("ingredients"))}
          title={r.sections.ingredients}
          icon="🥣"
          delay={5}
          aside={format(r.ingredients.count, { count: ingredients.length })}
        >
          <ol className="flex flex-wrap gap-2">
            {ingredients.map((ing, i) => (
              <IngredientPill
                key={`${i}-${ing.name}`}
                ingredient={ing}
                translation={translationOf(ing)}
                index={i}
                additive={
                  ing.e_number ? additiveByCode.get(ing.e_number) : undefined
                }
                onAdditive={(a) => goTo(additiveId(a))}
              />
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <Legend tone="red">{r.ingredients.legendAllergen}</Legend>
            <Legend tone="amber">{r.ingredients.legendAdditive}</Legend>
          </div>
        </Card>
      )}

      {/* Additives */}
      {additives.length > 0 && (
        <Card
          id={sid("additives")}
          flash={flashFor(sid("additives"))}
          title={r.sections.additives}
          icon="🧪"
          delay={6}
          aside={format(r.tiles.found, { count: additives.length })}
        >
          <ul className="grid gap-3 md:grid-cols-2">
            {additives.map((a, i) => {
              const id = additiveId(a, i);
              return (
                <li
                  key={id}
                  id={id}
                  className={cn(
                    "scroll-mt-32 rounded-2xl border p-4 transition-all duration-500",
                    flash?.id === id ?
                      "border-amber-400 bg-amber-50/60 shadow-lg shadow-amber-500/10 dark:border-amber-600 dark:bg-amber-950/30"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {a.code && (
                      <span className="rounded-lg bg-amber-100 px-2 py-0.5 font-mono text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                        {a.code}
                      </span>
                    )}
                    <span dir="auto" className="font-medium text-zinc-900 dark:text-zinc-100">
                      {capitalize(a.name_local ?? a.name)}
                    </span>
                  </div>
                  {a.category && (
                    <p dir="auto" className="mt-2 text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                      {a.category}
                    </p>
                  )}
                  {a.purpose && (
                    <p dir="auto" className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <span className="font-medium">{r.additives.purpose}</span> {a.purpose}
                    </p>
                  )}
                  {a.explanation && (
                    <p dir="auto" className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                      {a.explanation}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Details */}
      {hasDetails && (
        <div
          id={sid("details")}
          className="grid scroll-mt-32 gap-5 sm:grid-cols-2"
        >
          <InfoCard title={r.details.dates} icon="📅" rows={details.dates} delay={7} flash={flashFor(sid("details"))} />
          <InfoCard
            title={r.details.storage}
            icon="❄️"
            rows={details.storage}
            delay={7}
            flash={flashFor(sid("details"))}
          />
          <InfoCard
            title={r.details.manufacturer}
            icon="🏭"
            rows={details.manufacturer}
            delay={8}
            flash={flashFor(sid("details"))}
          />
          {(result.certifications.length > 0 || result.claims.length > 0) && (
            <Card title={r.details.claims} icon="🏅" delay={8} flash={flashFor(sid("details"))}>
              <div className="flex flex-wrap gap-2">
                {result.certifications.map((c) => (
                  <Pill key={`cert-${c}`} tone="green">
                    {c}
                  </Pill>
                ))}
                {result.claims.map((c) => (
                  <Pill key={`claim-${c}`} tone="zinc">
                    {c}
                  </Pill>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Raw text */}
      {result.raw_text && <RawText id={sid("raw")} text={result.raw_text} flash={flashFor(sid("raw"))} />}

      <p className="px-4 pt-2 text-center text-xs leading-5 text-zinc-400 dark:text-zinc-600">
        {r.disclaimer}
        {meta && (
          <span className="mt-1 block tabular-nums">
            {format(r.duration, { seconds: fmt(Math.round(meta.duration_ms / 100) / 10) })}
          </span>
        )}
      </p>
    </div>
  );
}

/** in the order of `results.notALabel.tips` in the dictionaries */
const TIP_ICONS = ["📦", "💡", "🔍"];

function NotALabel({ result }: { result: LabelAnalysis }) {
  const { t } = useI18n();
  const n = t.results.notALabel;
  return (
    <div className="animate-fade-up flex flex-col items-center rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <span className="animate-float text-5xl" aria-hidden>
        🔎
      </span>
      <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        {n.title}
      </h2>
      {result.product.name && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          {rich(format(n.looksLike, { name: result.product.name }), (name) => (
            <b dir="auto">{name}</b>
          ))}
        </p>
      )}
      {result.summary && (
        <p dir="auto" className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          {result.summary}
        </p>
      )}
      <ul className="mt-6 grid w-full max-w-md gap-2 text-start text-sm text-zinc-600 dark:text-zinc-400">
        {n.tips.map((tip, i) => (
          <li
            key={tip}
            className="flex gap-3 rounded-xl bg-zinc-50 px-4 py-2.5 dark:bg-zinc-900"
          >
            <span aria-hidden>{TIP_ICONS[i]}</span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AllergenGroup({
  title,
  tone,
  items,
}: {
  title: string;
  tone: Tone;
  items: LabelAnalysis["allergens"];
}) {
  const { t } = useI18n();
  return (
    <div>
      <SubLabel>{title}</SubLabel>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="flex shrink-0 items-center gap-2 sm:w-40">
              <Pill tone={tone} className="font-medium">
                {t.results.allergenNames[a.id] ?? a.name}
              </Pill>
              {a.declared && (
                <span className="text-[11px] font-medium text-zinc-400 uppercase">
                  {t.results.allergens.declared}
                </span>
              )}
            </span>
            <span
              dir="auto"
              className="text-sm text-zinc-500 dark:text-zinc-400"
            >
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
  const tone: Tone =
    flagged ? "red"
    : additive ? "amber"
    : "zinc";
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
  const content = (
    <>
      <span className="me-1.5 text-xs tabular-nums opacity-50">
        {index + 1}
      </span>
      <span className="flex flex-col text-start leading-tight">
        <span dir="auto">{ing.name}</span>
        {translation && (
          <span dir="auto" className="text-xs opacity-60">
            {translation}
          </span>
        )}
      </span>
    </>
  );
  return (
    <li
      className="animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
    >
      {additive ?
        <button
          onClick={() => onAdditive(additive)}
          title={title || undefined}
          className={cn(
            "inline-flex items-center rounded-2xl px-3 py-1.5 text-sm ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
            toneClasses[tone],
          )}
        >
          {content}
          <span aria-hidden className="ms-1.5 inline-block opacity-60 rtl:-scale-x-100">
            ↗
          </span>
        </button>
      : <span
          title={title || undefined}
          className={cn(
            "inline-flex items-center rounded-2xl px-3 py-1.5 text-sm ring-1 ring-inset",
            toneClasses[tone],
          )}
        >
          {content}
        </span>
      }
    </li>
  );
}

function StatusTile({
  title,
  label,
  tone,
  hint,
  onClick,
  delay = 0,
  className,
}: {
  title: string;
  label: string;
  tone: Tone;
  hint?: string;
  onClick?: () => void;
  delay?: number;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      style={{ animationDelay: `${delay * 60}ms` }}
      className={cn(
        "group animate-fade-up relative flex flex-col items-start justify-start rounded-2xl p-4 text-start ring-1 ring-inset transition-all duration-300",
        toneClasses[tone],
        onClick &&
          "cursor-pointer hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none active:translate-y-0 active:scale-[0.98]",
        className,
      )}
    >
      <p className="text-xs font-medium tracking-wide uppercase opacity-70">
        {title}
      </p>
      <p className="mt-1 flex items-center gap-2 font-semibold">
        <Dot tone={tone} />
        {label}
      </p>
      {hint && <p className="mt-1 text-xs opacity-70">{hint}</p>}
      {onClick && (
        <span
          aria-hidden
          className="absolute end-3.5 top-3.5 text-sm opacity-0 transition-all duration-300 group-hover:translate-y-0.5 group-hover:opacity-60"
        >
          ↓
        </span>
      )}
    </Tag>
  );
}

function DietaryPanel({
  title,
  status,
  evidence,
  children,
}: {
  title: string;
  status: Presence;
  evidence: string[];
  children?: React.ReactNode;
}) {
  const { t } = useI18n();
  const tone = presenceTone[status];
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </span>
        <Pill tone={tone} className="text-xs font-medium">
          <Dot tone={tone} />
          <span className="ms-1.5">{t.results.presence[status]}</span>
        </Pill>
      </div>
      {children}
      {evidence.length > 0 ?
        <ul className="mt-3 list-disc space-y-1 ps-5 text-sm text-zinc-600 dark:text-zinc-400">
          {evidence.map((e, i) => (
            <li key={i} dir="auto">
              {e}
            </li>
          ))}
        </ul>
      : <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">
          {status === "unclear" ?
            t.results.dietary.unclear
          : t.results.dietary.noEvidence}
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
  const pct =
    value == null ? 0 : Math.min(100, (value / (threshold.high * 1.4)) * 100);

  return (
    <div
      className="animate-fade-up rounded-2xl bg-zinc-50 p-3.5 dark:bg-zinc-900/60"
      style={{ animationDelay: `${delay * 80}ms` }}
      title={format(t.results.nutrition.thresholds, { low: fmt(threshold.low), high: fmt(threshold.high) })}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold uppercase",
            {
              red: "text-red-600 dark:text-red-400",
              amber: "text-amber-600 dark:text-amber-400",
              green: "text-emerald-600 dark:text-emerald-400",
              zinc: "text-zinc-400",
            }[tone],
          )}
        >
          {level ? t.results.level[level] : t.results.nutrition.notAvailable}
        </span>
      </div>
      <p className="mt-1 text-lg font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
        {value !== null ? ltr(`${fmt(value)} g`) : "—"}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={cn("animate-grow h-full origin-left rounded-full rtl:origin-right", dotClasses[tone])}
          style={{ width: `${pct}%`, animationDelay: `${200 + delay * 80}ms` }}
        />
      </div>
    </div>
  );
}

function InfoCard({
  title,
  icon,
  rows,
  delay,
  flash,
}: {
  title: string;
  icon: string;
  rows: [string, string | null][];
  delay: number;
  flash?: number;
}) {
  const filled = rows.filter((r): r is [string, string] => !!r[1]);
  if (filled.length === 0) return null;
  return (
    <Card title={title} icon={icon} delay={delay} flash={flash}>
      <dl className="space-y-2.5 text-sm">
        {filled.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-28 shrink-0 text-zinc-500 dark:text-zinc-400">
              {label}
            </dt>
            <dd
              dir="auto"
              className="min-w-0 wrap-break-word text-zinc-900 dark:text-zinc-100"
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function RawText({ id, text, flash }: { id: string; text: string; flash?: number }) {
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
    <Card
      id={id}
      flash={flash}
      title={t.results.raw.title}
      icon="📝"
      delay={9}
      aside={
        <button
          onClick={copy}
          className="rounded-lg px-2.5 py-1 font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          {copied ? t.results.raw.copied : t.results.raw.copy}
        </button>
      }
    >
      <div className="relative">
        <pre
          dir="auto"
          className={cn(
            "overflow-hidden font-mono text-xs leading-5 whitespace-pre-wrap text-zinc-600 transition-[max-height] duration-500 dark:text-zinc-400",
            open || !long ? "max-h-[2000px]" : "max-h-24",
          )}
        >
          {text}
        </pre>
        {!open && long && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-white dark:from-zinc-950" />
        )}
      </div>
      {long && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-3 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          {open ? t.results.raw.showLess : t.results.raw.showAll}
        </button>
      )}
    </Card>
  );
}

function SubLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "mb-2.5 text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400",
        className,
      )}
    >
      {children}
    </p>
  );
}

function Legend({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <Dot tone={tone} />
      {children}
    </span>
  );
}
