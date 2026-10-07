// Saves a snapshot of Open Food Facts products (ingredient text + the allergens and traces the
// database lists for it) to app/lib/analysis/__fixtures__/off-corpus.json. The rules in
// knowledge.ts are measured against it, offline, by knowledge.off.test.ts.
//
//   node scripts/fetch-off-corpus.mjs [perLanguage=400] [languages=en,fr,es,it,de,ar]
//
// With a list of languages, only those are fetched again and the rest of the snapshot is kept.
//
// OFF allows about 10 searches a minute, so this takes a few minutes. Run it on purpose; the
// snapshot is committed.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PER_LANG = Number(process.argv[2] ?? 400);
const ALL = { en: "english", fr: "french", es: "spanish", it: "italian", de: "german", ar: "arabic" };
const wanted = (process.argv[3] ?? Object.keys(ALL).join(",")).split(",").filter((l) => l in ALL);
const LANGS = Object.fromEntries(wanted.map((l) => [l, ALL[l]]));
const file = fileURLToPath(new URL("../app/lib/analysis/__fixtures__/off-corpus.json", import.meta.url));
const UA = "food-analyzer-corpus/1.0 (https://github.com/firassou/food-analyzer)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function page(lang, n) {
  const q = new URLSearchParams({
    action: "process",
    json: "1",
    page_size: "100",
    page: String(n),
    sort_by: "unique_scans_n",
    tagtype_0: "languages",
    tag_contains_0: "contains",
    tag_0: LANGS[lang],
    fields: `code,ingredients_text_${lang},allergens_tags,traces_tags`,
  });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(`https://world.openfoodfacts.org/cgi/search.pl?${q}`, { headers: { "User-Agent": UA } }).catch(() => null);
    if (res?.ok) return (await res.json()).products ?? [];
    await sleep(15000);
  }
  return [];
}

// the languages not fetched this time are kept as they were
const kept = process.argv[3] ? await readFile(file, "utf8").then((t) => JSON.parse(t).products.filter((p) => !(p.lang in LANGS))).catch(() => []) : [];
const out = [...kept];
for (const lang of Object.keys(LANGS)) {
  const seen = new Set();
  for (let n = 1; seen.size < PER_LANG && n <= 12; n++) {
    const products = await page(lang, n);
    if (products.length === 0) break;
    for (const p of products) {
      const text = String(p[`ingredients_text_${lang}`] ?? "").replace(/\s+/g, " ").trim();
      if (text.length < 15 || text.length > 1500 || seen.has(p.code)) continue;
      seen.add(p.code);
      out.push({ code: p.code, lang, text, allergens: p.allergens_tags ?? [], traces: p.traces_tags ?? [] });
    }
    console.log(`${lang}: ${seen.size}`);
    await sleep(7000);
  }
}
await writeFile(file, JSON.stringify({ fetched: new Date().toISOString().slice(0, 10), products: out }));
console.log(`wrote ${out.length} products`);
