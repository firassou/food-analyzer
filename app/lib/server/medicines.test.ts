import { afterEach, describe, expect, it, vi } from "vitest";
import { normalize } from "../analysis/normalize";
import { completeMedicine, findMedicine, parseExcipients, pickEntry, wantedMedicine } from "./medicines";

const entry = (value: string, id = 1) => ({ value, url: `/medicament/${id}/extrait` });
const DOLIPRANE = [
  entry("CODOLIPRANE 500 mg/30 mg, comprimé", 1),
  entry("DOLIPRANE 1000 mg, comprimé", 2),
  entry("DOLIPRANE 500 mg, comprimé", 3),
  entry("DOLIPRANE 500 mg, comprimé effervescent", 4),
  entry("DOLIPRANE 500 mg, gélule", 5),
  entry("DOLIPRANETABS 500 mg, comprimé pelliculé", 6),
];
const SPASFON = [entry("SPASFON LYOC 80 mg, lyophilisat oral"), entry("SPASFON, comprimé enrobé"), entry("SPASFON, suppositoire")];
const pick = (name: string | null, strengths: string[], form: string | null, list = DOLIPRANE) =>
  pickEntry({ name, strengths, form }, list)?.value ?? null;

const PAGE = `<h3><a name="RcpListeExcipients">6.1. Liste des excipients</a></h3>
<p class=AmmCorpsTexte>Contenu de la g&eacute;lule :</p><p class=AmmCorpsTexte>Amidon de bl&eacute;</p><p class=AmmCorpsTexte>Lactose&nbsp;monohydrat&#233;.</p>
<h3><a name="RcpIncompatibilites">6.2. Incompatibilités</a></h3><p>Sans objet.</p>`;

afterEach(() => vi.unstubAllGlobals());

describe("pickEntry", () => {
  it("needs the same brand and the same strength; the form decides", () => {
    expect(pick("Doliprane 500 mg", ["500 mg"], "comprimés")).toBe("DOLIPRANE 500 mg, comprimé");
    expect(pick("DOLIPRANE", ["500 mg"], "effervescent tablets")).toBe("DOLIPRANE 500 mg, comprimé effervescent");
    expect(pick("Doliprane 500 mg gélules", [], null)).toBe("DOLIPRANE 500 mg, gélule");
    expect(pick("Doliprane", ["1000 mg"], null)).toBe("DOLIPRANE 1000 mg, comprimé");
  });
  it("gives nothing when it can't tell which product it is", () => {
    expect(pick("Doliprane", ["500 mg"], null)).toBeNull(); // tablet, effervescent or capsule?
    expect(pick("Doliprane", ["300 mg"], "comprimé")).toBeNull(); // no such strength
    expect(pick("Doliprane", [], "comprimé")).toBeNull(); // which strength?
    expect(pick("Efferalgan 500 mg", [], "comprimé")).toBeNull();
    expect(pick(null, ["500 mg"], "comprimé")).toBeNull();
    expect(pick("Spasfon", [], null, SPASFON)).toBeNull();
  });
  it("matches a medicine sold without a strength in its name", () => {
    expect(pick("Spasfon", [], "comprimés enrobés", SPASFON)).toBe("SPASFON, comprimé enrobé");
    expect(pick("Spasfon Lyoc", ["80 mg"], null, SPASFON)).toBe("SPASFON LYOC 80 mg, lyophilisat oral");
  });
});

describe("parseExcipients", () => {
  it("reads section 6.1 as a list", () => {
    expect(parseExcipients(PAGE)).toBe("Contenu de la gélule : Amidon de blé, Lactose monohydraté");
  });
  it("gives null without a list", () => {
    expect(parseExcipients("<p>nothing here</p>")).toBeNull();
    expect(parseExcipients(PAGE.replace(/<p class.*<\/p>/, "<p>Sans objet.</p>"))).toBeNull();
  });
});

describe("findMedicine + completeMedicine", () => {
  const photo = normalize({
    kind: "medicine",
    product: { name: "Doliprane 500 mg" },
    medicine: { form: "gélules", active: [{ name: "paracetamol", strength: "500 mg" }] },
  });

  it("looks the name up, fetches the entry and completes the result", async () => {
    const fetchMock = vi.fn(async (url: string | URL) =>
      String(url).includes("/api/") ? new Response(JSON.stringify(DOLIPRANE)) : new Response(PAGE),
    );
    vi.stubGlobal("fetch", fetchMock);
    const found = await findMedicine(wantedMedicine(photo), new AbortController().signal);
    expect(found).toEqual({
      name: "DOLIPRANE 500 mg, gélule",
      excipients: "Contenu de la gélule : Amidon de blé, Lactose monohydraté",
      url: "https://base-donnees-publique.medicaments.gouv.fr/medicament/5/extrait",
    });
    expect(String(fetchMock.mock.calls[0][0])).toContain("startBy=doliprane");
    const done = completeMedicine(photo, found!, "en");
    expect(done.ingredient_source).toBe("database");
    expect(done.database?.product).toBe("DOLIPRANE 500 mg, gélule");
    expect(done.medicine?.excipients.map((e) => e.id)).toEqual(["wheat_starch", "lactose"]);
    expect(done.gluten.status).toBe("contains");
  });
  it("gives null for an unknown medicine, without fetching a page", async () => {
    const fetchMock = vi.fn(async () => new Response("[]"));
    vi.stubGlobal("fetch", fetchMock);
    expect(await findMedicine({ name: "Zzzunknownix 20 mg", strengths: [], form: null }, new AbortController().signal)).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("throws on a database error, for the caller to ignore", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("down", { status: 500 })));
    await expect(findMedicine({ name: "Doliprane", strengths: [], form: null }, new AbortController().signal)).rejects.toThrow();
  });
});
