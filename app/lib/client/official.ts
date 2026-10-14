// Medicines without their official product information (saved before the analysis fetched it, or
// whose lookup failed or found nothing) get it here, in the background: what was read on the box
// goes to /api/official, and the answer is kept with the scan. Each is asked at most once a visit.

import type { OfficialInfo, OfficialResponse } from "../analysis/official";
import type { LabelAnalysis } from "../analysis/types";
import { savedScans, updateScan } from "./history";

const CLIENT_TIMEOUT_MS = 40_000;
/** asked once per visit */
const tried = new Set<string>();

/** a medicine with a substance read but no official product information yet (or one read before its interactions were) */
export const lacksOfficial = (r: LabelAnalysis) => r.kind === "medicine" && !r.official?.interactions && (r.medicine?.active.length ?? 0) > 0;

export async function fetchOfficial(r: LabelAnalysis, signal: AbortSignal): Promise<OfficialInfo | null> {
  const response = await fetch("/api/official", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: r.product.name,
      strengths: r.medicine?.active.map((a) => a.strength).filter(Boolean) ?? [],
      form: r.medicine?.form ?? null,
      substances: r.medicine?.active.map((a) => a.name_local ?? a.name) ?? [],
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
  });
  const data = (await response.json().catch(() => null)) as OfficialResponse | null;
  if (!data?.ok) throw new Error(data ? data.code : `status ${response.status}`);
  return data.official;
}

/** fills in every saved medicine that lacks it, one at a time; `onFilled` hears about each */
export async function backfillOfficial(signal: AbortSignal, onFilled: (id: string, official: OfficialInfo) => void) {
  for (const entry of savedScans()) {
    if (signal.aborted) return;
    if (!lacksOfficial(entry.result) || tried.has(entry.id)) continue;
    tried.add(entry.id);
    try {
      const official = await fetchOfficial(entry.result, signal);
      // the scan as it is now: it may have been translated or corrected meanwhile
      const current = savedScans().find((e) => e.id === entry.id);
      if (!current || signal.aborted) continue;
      if (!official) continue;
      updateScan(entry.id, { result: { ...current.result, official } });
      onFilled(entry.id, official);
    } catch {
      // offline or the database is down: the result says "not checked" until the next visit
    }
  }
}
