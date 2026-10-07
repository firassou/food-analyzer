"use client";
import { checkProfile, type ProfileFinding } from "../../lib/analysis/profile";
import { checkEveryone } from "../../lib/analysis/profiles";
import type { LabelAnalysis } from "../../lib/analysis/types";
import { switchProfilePerson, useProfile, useProfileBook } from "../../lib/client/profile";
import { format, useI18n } from "../../lib/i18n/I18nProvider";
import { usePersonName } from "../ProfileSheet";
import { cn, Dot, PencilIcon, toneClasses } from "../ui";

const verdictTone = { avoid: "red", check: "amber", ok: "green", unchecked: "zinc" } as const;

/** what the result means for the reader's own profile; nothing without a profile */
export default function ProfileVerdict({ result, onEdit }: { result: LabelAnalysis; onEdit?: () => void }) {
  const { t } = useI18n();
  const profile = useProfile();
  const several = useProfileBook().profiles.length > 1;
  const nameOf = usePersonName();
  const check = checkProfile(result, profile);
  if (!check) return null;
  const v = t.profile.verdict;
  const tone = verdictTone[check.status];
  const lineOf = (f: ProfileFinding) =>
    f.topic.type === "allergen" ? format(v.allergen[f.level], { name: t.results.allergenNames[f.topic.id].toLowerCase() })
    : f.topic.type === "lactose" ? v.lactose[f.level]
    : f.topic.type === "sugar" ? v.sugar
    : (f.level === "avoid" ? v.dietAvoid : v.dietCheck)[f.topic.diet];
  const note =
    check.status === "unchecked" ? v.uncheckedText
    : check.status === "ok" ? v.okText
    : result.kind === "medicine" ? v.medicineText
    : result.ingredient_source === "estimated" ? v.estimatedText
    : null;
  return (
    <div className={cn("mt-5 rounded-3xl px-5 py-4", toneClasses[tone])}>
      <p className="eyebrow opacity-80">{several ? format(v.eyebrowFor, { name: nameOf(profile) }) : v.eyebrow}</p>
      <p className="font-display mt-1 text-xl leading-tight font-bold">{v.title[check.status]}</p>
      {check.findings.length > 0 && (
        <ul className="mt-3 space-y-2">
          {check.findings.map((f, i) => (
            <li key={i} className="flex gap-2.5 text-sm leading-6">
              <Dot tone={f.level === "avoid" ? "red" : "amber"} className="mt-2 shrink-0" />
              <span className="min-w-0">
                <span className="font-semibold">{lineOf(f)}</span>
                {f.because.length > 0 ?
                  <span dir="auto" className="block wrap-break-word opacity-80">
                    {f.because.join(" · ")}
                  </span>
                : f.topic.type === "diet" && f.level === "check" && <span className="block opacity-80">{v.sourceNotStated}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {note && <p className="mt-3 text-sm leading-6 opacity-90">{note}</p>}
      {onEdit && (
        <button
          onClick={onEdit}
          className="mt-3 inline-flex min-h-10 items-center gap-1.5 text-sm font-medium underline underline-offset-4"
        >
          <PencilIcon className="size-4" />
          {t.profile.edit}
        </button>
      )}
    </div>
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
    <div className="mt-3 rounded-3xl bg-mute-soft/60 px-5 py-4">
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
