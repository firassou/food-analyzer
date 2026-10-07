// Regression check on the photos in samples/: does the whole pipeline still decide what each one is?
// Spends one provider call per photo, so run it on purpose (before and after changing the prompt,
// the models or normalize), not on every edit.
//
//   pnpm dev && pnpm eval:samples        # BASE_URL=http://localhost:3000 by default
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

// what the file name promises; a check returns an error text, or null when it holds
const checks = {
  "non-label-table.jpg": (r) => (r.kind === "other" ? null : `expected kind "other", got "${r.kind}"`),
  "drink-cola-ar-fr.jpg": (r) => (r.kind === "drink" ? null : `expected kind "drink", got "${r.kind}"`),
  "chocolate-may-contain-multilingual.jpg": (r) =>
    r.kind === "label" && r.allergens.some((a) => a.presence === "may_contain") ? null : "expected a label with may-contain traces",
  "fr-yogurt-peut-contenir.jpg": (r) => (r.allergens.some((a) => a.presence === "may_contain") ? null : "expected may-contain traces"),
  "biscuit-multilingual-dz.jpg": (r) => (r.kind === "label" && r.ingredients.length > 0 ? null : "expected a label with ingredients"),
  "blurry-yogurt.jpg": (r) => (r.kind !== "other" ? null : 'a blurry yogurt shouldn\'t be "other"'),
};

const health = await fetch(`${BASE}/api/analyze`).then((r) => r.json()).catch(() => null);
if (!health?.ok) {
  console.error(`No analyzer at ${BASE}: start \`pnpm dev\` with a provider key in .env.local.`);
  process.exit(2);
}

const record = {};
let failed = 0;
for (const [file, check] of Object.entries(checks)) {
  const form = new FormData();
  form.append("image", new Blob([await readFile(`${root}samples/${file}`)]), file);
  form.append("lang", "en");
  let note = "";
  let result = null;
  try {
    const data = await (await fetch(`${BASE}/api/analyze`, { method: "POST", body: form, signal: AbortSignal.any([AbortSignal.timeout(170_000)]) })).json();
    if (data.ok) result = data.result;
    else note = data.error;
  } catch (e) {
    note = String(e);
  }
  const problem = result ? check(result) : `no result: ${note}`;
  if (problem) failed++;
  record[file] = result && {
    kind: result.kind,
    name: result.product.name,
    declared: result.allergens.filter((a) => a.presence === "contains").map((a) => a.id),
    traces: result.allergens.filter((a) => a.presence === "may_contain").map((a) => a.id),
    gluten: result.gluten.status,
    additives: result.additives.map((a) => a.code),
    warnings: result.warnings.length,
  };
  console.log(`${problem ? "FAIL" : "PASS"}  ${file}${problem ? `  ${problem}` : ""}`);
}

// what changed since the last run, so a reading that moved is seen even when its check still passes
const lastFile = `${root}samples/.last-eval.json`;
const last = await readFile(lastFile, "utf8").then(JSON.parse).catch(() => null);
if (last) {
  for (const file of Object.keys(record)) {
    if (JSON.stringify(last[file]) !== JSON.stringify(record[file])) console.log(`changed  ${file}\n  was ${JSON.stringify(last[file])}\n  now ${JSON.stringify(record[file])}`);
  }
}
await writeFile(lastFile, JSON.stringify(record, null, 2));
console.log(`\n${Object.keys(checks).length - failed}/${Object.keys(checks).length} as expected`);
process.exit(failed ? 1 : 0);
