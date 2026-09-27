"use client";
import { useEffect, useState } from "react";
import { cn, Spinner } from "./ui";

const STEPS = [
  "Reading the label",
  "Extracting ingredients",
  "Parsing nutrition facts",
  "Checking allergens & gluten",
  "Looking up additives",
  "Writing the summary",
];

export default function Analyzing() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    // the request has no real progress, so advance steadily and hold on the last step
    const t = setInterval(
      () => setStep((s) => Math.min(s + 1, STEPS.length - 1)),
      2200,
    );
    return () => clearInterval(t);
  }, []);

  return (
    <div className="flex flex-col gap-4" aria-live="polite">
      <div className="animate-fade-up rounded-3xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400">
          Analyzing your label…
        </p>
        <ol className="mt-4 space-y-2.5">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-3 text-sm transition-all duration-500",
                i < step && "text-zinc-500 dark:text-zinc-500",
                i === step && "font-medium text-zinc-900 dark:text-zinc-100",
                i > step && "text-zinc-300 dark:text-zinc-700",
              )}
            >
              <span className="grid size-5 place-items-center">
                {i < step ? (
                  <svg
                    viewBox="0 0 20 20"
                    className="animate-fade-in size-5 text-emerald-500"
                    fill="currentColor"
                    aria-hidden
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.7-9.3a1 1 0 0 0-1.4-1.4L9 10.6 7.7 9.3a1 1 0 0 0-1.4 1.4l2 2a1 1 0 0 0 1.4 0l4-4Z"
                    />
                  </svg>
                ) : i === step ? (
                  <Spinner className="text-emerald-500" />
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </span>
              {label}
            </li>
          ))}
        </ol>
      </div>

      {[28, 20, 36].map((h, i) => (
        <div
          key={i}
          style={{ animationDelay: `${(i + 1) * 90}ms` }}
          className="animate-fade-up rounded-3xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <div className="animate-pulse space-y-3">
            <div className="h-4 w-1/3 rounded-full bg-zinc-200 dark:bg-zinc-800" />
            <div
              className="rounded-2xl bg-zinc-100 dark:bg-zinc-900"
              style={{ height: h * 4 }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
