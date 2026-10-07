"use client";
import type { Additive, Ingredient, LabelAnalysis } from "../../lib/analysis/types";
import { format, useI18n } from "../../lib/i18n/I18nProvider";
import { cn, Dot, toneClasses, type Tone } from "../ui";
import { SubLabel } from "./bits";
import { capitalize, confidenceLevel } from "./tones";

export function AllergenGroup({ title, tone, items }: { title: string; tone: Tone; items: LabelAnalysis["allergens"] }) {
  const { t } = useI18n();
  return (
    <div>
      <SubLabel>{title}</SubLabel>
      <ul className="space-y-2">
        {items.map((a) => (
          <li
            key={a.id}
            className={cn("flex flex-col gap-1.5 rounded-2xl px-4 py-3 sm:flex-row sm:items-center sm:gap-4", toneClasses[tone])}
          >
            <span className="flex shrink-0 items-center gap-2 sm:w-44">
              <Dot tone={tone} />
              <span className="font-semibold text-ink">{t.results.allergenNames[a.id] ?? a.name}</span>
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

export function IngredientPill({
  ingredient: ing,
  translation,
  additive,
  onAdditive,
}: {
  ingredient: Ingredient;
  /** the name in the reader's language, when the label is in another one */
  translation: string | null;
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
      format(t.results.ingredients.allergensTitle, { list: ing.allergens.map((a) => t.results.allergenNames[a]).join(", ") })
    : null,
    additive ? `${additive.code} · ${additive.name_local ?? additive.name}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const className = cn(
    "inline-flex items-center gap-2 rounded-2xl px-3.5 py-2 text-start text-sm",
    tone ? toneClasses[tone] : "bg-mute-soft",
  );
  const content = (
    <span className="flex flex-col leading-tight">
      <span dir="auto" className={cn(tone && "font-medium text-ink")}>
        {ing.name}
      </span>
      {translation && (
        <span dir="auto" className="text-xs text-ink-soft">
          {translation}
        </span>
      )}
    </span>
  );
  return (
    <li>
      {additive ?
        <button onClick={() => onAdditive(additive)} title={title || undefined} className={cn(className, "transition active:scale-[0.97]")}>
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
export function EstimatedIngredient({ ingredient: ing, translation }: { ingredient: Ingredient; translation: string | null }) {
  const { t } = useI18n();
  const flagged = ing.allergens.length > 0 || ing.gluten;
  const level = ing.confidence ?? "medium";
  return (
    <li className="flex items-center gap-3 border-t border-rule/70 py-3 first:border-t-0 first:pt-0">
      <Dot tone={flagged ? "red" : "zinc"} className={cn(!flagged && "opacity-0")} />
      <span className="min-w-0 flex-1 leading-tight">
        <span dir="auto" className="text-sm font-medium">
          {capitalize(translation ?? ing.name)}
        </span>
        {flagged && <span className="block text-xs text-bad">{ing.allergens.map((a) => t.results.allergenNames[a]).join(", ")}</span>}
      </span>
      <span
        className="flex shrink-0 items-center gap-2"
        title={`${t.results.dish.confidence}: ${t.results.dietary.confidenceLevel[level]}`}
      >
        <span className="eyebrow text-ink-soft">{t.results.dietary.confidenceLevel[level]}</span>
        <span aria-hidden className="flex gap-0.5">
          {[1, 2, 3].map((n) => (
            <span key={n} className={cn("h-3 w-1.5 rounded-full", n <= confidenceLevel[level] ? "bg-accent" : "bg-mute-soft")} />
          ))}
        </span>
      </span>
    </li>
  );
}
