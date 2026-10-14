"use client";
import { type ConditionFinding, type ConditionId, RULE_SOURCES } from "../../lib/analysis/conditions";
import type { ProfileFinding } from "../../lib/analysis/profile";
import type { OfficialFinding } from "../../lib/analysis/official";
import { checkEveryone, checkPerson, type PersonVerdict } from "../../lib/analysis/profiles";
import type { LabelAnalysis } from "../../lib/analysis/types";
import { switchProfilePerson, useProfile, useProfileBook } from "../../lib/client/profile";
import { format, isolate, ltr, useI18n } from "../../lib/i18n/I18nProvider";
import { usePersonName } from "../ProfileSheet";
import { cn, Dot, PencilIcon } from "../ui";
import { GeneralChip } from "./bits";

const verdictTone = { avoid: "red", check: "amber", ok: "green", unchecked: "zinc" } as const;

/** the verdict's surface and title colour: friendly lime and peach for food, quieter tones for a medicine */
const verdictLook = {
  avoid: { food: "bg-bad-soft", medicine: "bg-bad-soft", title: "text-bad" },
  check: { food: "bg-peach-soft", medicine: "bg-warn-soft", title: "" },
  ok: { food: "bg-lime-soft", medicine: "bg-good-soft", title: "" },
  unchecked: { food: "bg-mute-soft", medicine: "bg-mute-soft", title: "" },
} as const;

type Line = { level: "avoid" | "check" } & ({ watch: ProfileFinding } | { health: ConditionFinding } | { official: OfficialFinding });

/** what the result means for the reader's own profile and health conditions; nothing without either */
export default function ProfileVerdict({ result, onEdit }: { result: LabelAnalysis; onEdit?: () => void }) {
  const { t } = useI18n();
  const profile = useProfile();
  const several = useProfileBook().profiles.length > 1;
  const nameOf = usePersonName();
  const check = checkPerson(result, profile);
  if (!check) return null;
  const v = t.profile.verdict;
  const h = v.health;
  // present only when the person has health conditions the rules know
  const health = check.conditions;
  const look = verdictLook[check.status];
  const isMedicine = result.kind === "medicine";
  const lineOf = (f: ProfileFinding) =>
    f.topic.type === "allergen" ? format(v.allergen[f.level], { name: t.results.allergenNames[f.topic.id].toLowerCase() })
    : f.topic.type === "lactose" ? v.lactose[f.level]
    : f.topic.type === "sugar" ? v.sugar
    : (f.level === "avoid" ? v.dietAvoid : v.dietCheck)[f.topic.diet];
  const title =
    check.status === "avoid" ? ([...(health ?? []), ...(check.official ?? [])].some((f) => f.level === "avoid") ? h.titleAvoid : v.title.avoid)
    : check.status === "check" ? (check.findings.length === 0 ? h.titleCheck : v.title.check)
    : check.status === "ok" && health ? h.titleOk
    : v.title[check.status];
  const note =
    // a medicine read but whose official product information wasn't found
    check.status === "unchecked" ? (health ? (isMedicine && result.medicine?.active.length ? h.uncheckedMedicineText : h.uncheckedText) : v.uncheckedText)
    : check.status === "ok" ? (health ? (isMedicine ? h.okMedicineText : h.okText) : v.okText)
    // a guessed dish keeps saying so next to the health note
    : health?.length ? (result.kind !== "medicine" && result.ingredient_source === "estimated" ? `${h.note} ${v.estimatedText}` : h.note)
    : result.kind === "medicine" ? v.medicineText
    : result.ingredient_source === "estimated" ? v.estimatedText
    : null;
  // one list, "avoid" first whichever check it comes from
  const lines: Line[] = [
    ...check.findings.map((f): Line => ({ level: f.level, watch: f })),
    ...(health ?? []).map((f): Line => ({ level: f.level, health: f })),
    ...(check.official ?? []).map((f): Line => ({ level: f.level, official: f })),
  ].sort((a, b) => Number(b.level === "avoid") - Number(a.level === "avoid"));
  return (
    <div className={cn("animate-fade-up mt-5 rounded-xl px-5 py-4 text-ink", isMedicine ? look.medicine : look.food)}>
      <p className="eyebrow text-ink-soft">{several ? format(v.eyebrowFor, { name: isolate(nameOf(profile)) }) : health ? h.eyebrow : v.eyebrow}</p>
      <p className={cn("mt-1 text-2xl leading-tight rtl:leading-snug", isMedicine ? "font-display font-semibold" : "font-editorial font-medium", look.title)}>{title}</p>
      {lines.length > 0 && (
        <ul className="mt-3 space-y-2">
          {lines.map((line, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-6">
              <Dot tone={line.level === "avoid" ? "red" : "amber"} className="mt-2 shrink-0" />
              {"watch" in line ?
                <span className="min-w-0">
                  <span className="font-semibold">{lineOf(line.watch)}</span>
                  {line.watch.because.length > 0 ?
                    <span dir="auto" className="block wrap-break-word text-ink-soft">
                      {line.watch.because.join(" · ")}
                    </span>
                  : line.watch.topic.type === "diet" && line.watch.level === "check" && <span className="block opacity-80">{v.sourceNotStated}</span>}
                </span>
              : "health" in line ? <ConditionLine finding={line.health} conditions={profile.conditions} />
              : <OfficialLine finding={line.official} />}
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-3 text-sm leading-6 text-ink-soft">{note}</p>}
      <OfficialSourceLink check={check} />
      {onEdit && (
        <button
          onClick={onEdit}
          className="-ms-2 mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-control px-2 text-sm font-medium underline underline-offset-4"
        >
          <PencilIcon className="size-4" />
          {t.profile.edit}
        </button>
      )}
    </div>
  );
}

/** one health-condition finding: what was found, for which condition, how serious, and where the rule comes from */
export function ConditionLine({ finding: f, conditions }: { finding: ConditionFinding; conditions?: ConditionId[] }) {
  const { t, locale } = useI18n();
  const h = t.profile.verdict.health;
  // codes and acronyms stay left-to-right inside an Arabic sentence
  const sources = new Intl.ListFormat(locale, { type: "unit" }).format(RULE_SOURCES[f.ruleId].map((id) => (/^[\x20-\x7E]+$/.test(h.sources[id]) ? ltr(h.sources[id]) : h.sources[id])));
  return (
    <span className="min-w-0">
      <span className="font-semibold">{h.rules[f.ruleId]}</span>
      <span className="block text-ink-soft">
        {t.profile.conditions.names[f.condition]} · {f.level === "avoid" ? h.avoid : h.check}
      </span>
      {f.because.length > 0 && (
        <span dir="auto" className="block wrap-break-word text-ink-soft">
          {f.because.join(" · ")}
        </span>
      )}
      {/* paracetamol is itself a question in liver disease */}
      {f.ruleId === "bleeding_nsaid" && !conditions?.includes("liver_disease") && (
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <GeneralChip>{t.ask.general}</GeneralChip>
          <span>{h.paracetamol}</span>
        </span>
      )}
      <span className="mt-0.5 block text-xs leading-5 text-ink-soft">{format(h.source, { source: sources })}</span>
    </span>
  );
}

/** what a medicine's official product information says about one condition, quoted as published */
export function OfficialLine({ finding: f }: { finding: OfficialFinding }) {
  const { t } = useI18n();
  const h = t.profile.verdict.health;
  return (
    <span className="min-w-0">
      <span className="font-semibold">{h.officialSection[f.section]}</span>
      <span className="block text-ink-soft">
        {f.condition ? t.profile.conditions.names[f.condition] : <bdi>{f.other}</bdi>} · {f.level === "avoid" ? h.avoid : h.check}
      </span>
      {/* the regulator's words, in French, as published: never translated or reworded */}
      <span className="mt-1 block border-s-2 border-current/25 ps-2.5">
        <span lang="fr" dir="ltr" className="block text-start italic wrap-break-word">
          «&nbsp;{f.quote}&nbsp;»
        </span>
      </span>
    </span>
  );
}

/** where the quotes come from, with a link to the published document */
export function OfficialSourceLink({ check }: { check: Pick<PersonVerdict, "officialSource" | "official" | "status"> }) {
  const { t } = useI18n();
  const h = t.profile.verdict.health;
  const source = check.officialSource;
  if (!source || (!check.official?.length && check.status !== "ok")) return null;
  const product = ltr(source.product);
  return (
    <p className="mt-2 text-xs leading-5 text-ink-soft">
      <a href={source.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
        {format(source.match === "substance" ? h.officialGeneric : h.officialFrom, { product })}
      </a>
      {check.official?.length ? ` ${h.quotedFrench}` : null}
    </p>
  );
}

/** one line per person with a profile, once a phone is shared; a tap makes that person the active one */
export function EveryoneVerdict({ result }: { result: LabelAnalysis }) {
  const { t } = useI18n();
  const book = useProfileBook();
  const nameOf = usePersonName();
  const people = checkEveryone(result, book);
  if (book.profiles.length < 2 || people.length < 2) return null;
  const v = t.profile.verdict;
  return (
    <div className="mt-3 rounded-xl bg-mute-soft/60 px-5 py-4">
      <p className="eyebrow text-ink-soft">{v.everyone}</p>
      <ul className="mt-2 divide-y divide-rule">
        {people.map(({ person, check }) => (
          <li key={person.id}>
            <button
              onClick={() => switchProfilePerson(person.id)}
              aria-current={person.id === book.active}
              className="flex min-h-11 w-full items-center gap-3 py-2 text-start"
            >
              <Dot tone={verdictTone[check.status]} className="shrink-0" />
              <span dir="auto" title={nameOf(person)} className={cn("min-w-0 flex-1 truncate text-sm", person.id === book.active ? "font-semibold" : "font-medium")}>
                {nameOf(person)}
              </span>
              <span className="text-sm text-ink-soft">{v.everyoneStatus[check.status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
