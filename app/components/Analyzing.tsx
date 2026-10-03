"use client";
import { useEffect, useState } from "react";
import { useI18n } from "../lib/i18n/I18nProvider";
import { cn, Spinner } from "./ui";

export default function Analyzing() {
  const { t } = useI18n();
  const steps = t.analyzing.steps;
  const stepCount = steps.length;
  const [step, setStep] = useState(0);

  useEffect(() => {
    // the request has no real progress, so advance steadily and hold on the last step
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, stepCount - 1)), 2200);
    return () => clearInterval(timer);
  }, [stepCount]);

  return (
    <div aria-live="polite" className="animate-fade-up overflow-hidden rounded-[28px] border border-rule bg-sheet">
      <div className="border-t-[3px] border-ink px-5 pt-4 pb-6 sm:px-7">
        <p className="font-display text-lg font-semibold">{t.analyzing.title}</p>
        <ol className="mt-4">
          {steps.map((label, i) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-3 border-t border-rule py-3 text-sm transition-colors duration-500 first:border-t-0",
                i === step ? "font-medium text-ink" : i < step ? "text-ink-soft" : "text-ink-soft/50",
              )}
            >
              <span dir="ltr" className="eyebrow w-5 tabular-nums">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="flex-1">{label}</span>
              <span className="grid size-5 place-items-center">
                {i < step ? (
                  <svg viewBox="0 0 20 20" className="animate-fade-in size-4 text-good" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
                  </svg>
                ) : i === step ? (
                  <Spinner className="text-accent" />
                ) : null}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
