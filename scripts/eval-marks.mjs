// Does the model read the pharmacist's pen marks? Runs synthetic boxes (drawn here, so the
// right answer is known) and any real photos in samples/marks/ through a running server.
//
//   pnpm dev            # in another terminal, with a provider key in .env.local
//   pnpm eval:marks     # BASE_URL=http://localhost:3000 by default
//
// Real photos: samples/marks/<anything>__<answer>.jpg, where <answer> is "none", "any1" (one line
// across the box: once a day), or morning-midday-evening ("1-0-1", "2-0-1", "1-1-1"). They are
// git-ignored: they are pictures of someone's medicine. Exit code 1 when a case is wrong.
import { createRequire } from "node:module";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const sharp = createRequire(root + "package.json")("sharp");
const BASE = process.env.BASE_URL ?? "http://localhost:3000";

const BLUE = "#10208a";
const pen = `stroke="${BLUE}" stroke-width="9" stroke-linecap="round" fill="none"`;
const box = (marks) => `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">
<rect width="1200" height="800" fill="#d8d4cc"/>
<g transform="rotate(-2 600 400)">
<rect x="120" y="100" width="960" height="600" rx="8" fill="#f7f7f5" stroke="#999" stroke-width="3"/>
<rect x="120" y="100" width="960" height="150" fill="#1d6fb8"/>
<text x="170" y="205" font-family="Arial" font-weight="700" font-size="92" fill="#fff">PARADOL</text>
<text x="170" y="330" font-family="Arial" font-size="54" fill="#222">Paracetamol 500 mg</text>
<text x="170" y="400" font-family="Arial" font-size="40" fill="#222">16 comprimés pelliculés</text>
<text x="170" y="470" font-family="Arial" font-size="30" fill="#444">Voie orale — Boîte de 16</text>
<rect x="170" y="520" width="420" height="120" fill="#e8f1fa" stroke="#1d6fb8"/>
<text x="190" y="560" font-family="Arial" font-size="26" fill="#1d6fb8">Lire la notice avant emploi</text>
<text x="190" y="600" font-family="Arial" font-size="24" fill="#444">Lot 24A113 · EXP 11/2027</text>
${marks}
</g></svg>`;
const stroke = (x, y) => `<path d="M${x} ${y} L${x + 5} ${y + 70}" ${pen}/>`;

const synthetic = [
  ["synthetic: no marks", "", "none"],
  ["synthetic: one line across the box", `<path d="M150 650 C400 520 800 330 1050 150" ${pen}/>`, "any1"],
  ["synthetic: one stroke at each end", stroke(185, 420) + stroke(1000, 600), "1-0-1"],
  ["synthetic: three strokes in a row", stroke(700, 540) + stroke(800, 545) + stroke(900, 540), "1-1-1"],
  ["synthetic: two, then one", stroke(700, 530) + stroke(730, 531) + stroke(950, 540), "2-0-1"],
];

const expected = (answer) =>
  answer === "none" ? null
  : answer === "any1" ? { morning: 0, midday: 0, evening: 0, anytime: 1 }
  : Object.fromEntries(["morning", "midday", "evening"].map((k, i) => [k, Number(answer.split("-")[i])]).concat([["anytime", 0]]));

const cases = [];
for (const [name, marks, answer] of synthetic) {
  const image = await sharp(Buffer.from(box(marks))).blur(0.6).jpeg({ quality: 85 }).toBuffer();
  cases.push({ name, image, answer });
}
try {
  for (const file of (await readdir(root + "samples/marks")).filter((f) => /__(none|any1|\d(\.5)?-\d(\.5)?-\d(\.5)?)\.(jpe?g|png|webp)$/i.test(f))) {
    cases.push({ name: `real: ${file}`, image: await readFile(root + "samples/marks/" + file), answer: file.match(/__(.+)\.\w+$/)[1] });
  }
} catch {
  // no real photos yet
}

const health = await fetch(`${BASE}/api/analyze`).then((r) => r.json()).catch(() => null);
if (!health?.ok) {
  console.error(`No analyzer at ${BASE}: start \`pnpm dev\` with a provider key in .env.local.`);
  process.exit(2);
}

const same = (got, want) => (want === null ? got === null : !!got && ["morning", "midday", "evening", "anytime"].every((k) => (got[k] ?? 0) === want[k]));
const rows = [];
for (const c of cases) {
  const form = new FormData();
  form.append("image", new Blob([c.image]), "box.jpg");
  form.append("lang", "en");
  let marks = null;
  let model = "-";
  let note = "";
  try {
    const res = await fetch(`${BASE}/api/analyze`, { method: "POST", body: form, signal: AbortSignal.timeout(170_000) });
    const data = await res.json();
    if (data.ok) {
      marks = data.result.medicine?.marks ?? null;
      model = data.meta.model;
    } else note = data.error;
  } catch (e) {
    note = String(e);
  }
  const want = expected(c.answer);
  const ok = !note && same(marks, want);
  rows.push({ case: c.name, want: c.answer, got: note ? "error" : marks ? `${marks.morning}-${marks.midday}-${marks.evening}${marks.anytime ? ` any${marks.anytime}` : ""}` : "none", confidence: marks?.confidence ?? "-", ok, model, note });
  console.log(`${ok ? "PASS" : "FAIL"}  ${c.name}  want ${c.answer}  got ${rows.at(-1).got} (${rows.at(-1).confidence}, ${model})${note ? "  " + note : ""}`);
}
const passed = rows.filter((r) => r.ok).length;
console.log(`\n${passed}/${rows.length} read correctly`);
await writeFile(root + "samples/.last-marks-eval.json", JSON.stringify({ at: new Date().toISOString(), rows }, null, 2));
process.exit(passed === rows.length ? 0 : 1);
