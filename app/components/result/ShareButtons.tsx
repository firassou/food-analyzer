"use client";
import { useState } from "react";
import type { LabelAnalysis } from "../../lib/analysis/types";
import { format, useI18n } from "../../lib/i18n/I18nProvider";
import { PrinterIcon, ShareIcon } from "../ui";

/**
 * What goes into a shared message: the product, what was found, nothing about the reader
 * (no profile, no verdict "for you"), and the same disclaimer the sheet carries.
 */
export function shareText(result: LabelAnalysis, t: ReturnType<typeof useI18n>["t"], name: string): string {
  const r = t.results;
  const lines = [name];
  if (result.product.brand) lines.push(result.product.brand);
  if (result.summary) lines.push("", result.summary);
  const declared = result.allergens.filter((a) => a.presence === "contains").map((a) => r.allergenNames[a.id] ?? a.name);
  if (declared.length) lines.push("", `${r.allergens.contains}: ${declared.join(", ")}`);
  if (result.gluten.status !== "unclear" && result.kind !== "water") lines.push(`${r.tiles.gluten}: ${r.presence[result.gluten.status]}`);
  if (result.additives.length) lines.push(`${r.tiles.additives}: ${result.additives.map((a) => a.code ?? a.name).join(", ")}`);
  lines.push("", r.disclaimer);
  return lines.join("\n");
}

/** share the result as text (the device's share sheet, else the clipboard) or save it as a PDF through the print dialog */
export default function ShareButtons({ result, name }: { result: LabelAnalysis; name: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const share = async () => {
    const text = shareText(result, t, name);
    const title = format(t.share.title, { name });
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title, text });
        return;
      }
      await navigator.clipboard.writeText(`${title}\n\n${text}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // the share sheet was dismissed, or the clipboard is unavailable: nothing to do
    }
  };
  const button =
    "inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold ring-1 ring-rule transition hover:bg-mute-soft active:scale-[0.98]";
  return (
    <>
      <button onClick={share} className={button}>
        <ShareIcon className="size-4.5" />
        <span aria-live="polite">{copied ? t.share.copied : t.share.button}</span>
      </button>
      <button onClick={() => window.print()} className={`${button} print:hidden`}>
        <PrinterIcon className="size-4.5" />
        {t.share.pdf}
      </button>
    </>
  );
}
