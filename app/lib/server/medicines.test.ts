import { afterEach, describe, expect, it, vi } from "vitest";
import { normalize } from "../analysis/normalize";
import { completeMedicine, findMedicine, parseExcipients, parseInteractions, parseOfficialSections, pickEntry, pickGeneric, wantedMedicine } from "./medicines";

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
      brand: {
        name: "DOLIPRANE 500 mg, gélule",
        excipients: "Contenu de la gélule : Amidon de blé, Lactose monohydraté",
        url: "https://base-donnees-publique.medicaments.gouv.fr/medicament/5/extrait",
      },
      // a page without 4.3, and no single substance read to look a generic up by
      official: null,
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

// the page's own markup, as published (bullets in the Symbol font, entities, a heading per section)
const SAFETY_PAGE = `<p class="AmmAnnexeTitre2"><a name="RcpIndicTherap"><span>4.1. Indications thérapeutiques</span></a></p>
<p class=AmmCorpsTexte>Traitement de la fi&egrave;vre.</p>
<p class="AmmAnnexeTitre2"><a name="RcpContreindications"><span id='4.3._Contre-indications'>4.3. Contre-indications</span></a></p>
<p class=AmmCorpsTexte><a name="_Toc1">Ce m&eacute;dicament est contre-indiqu&eacute; dans les situations suivantes:</a></p>
<p class=AmmListePuces1><span style='font-family: Symbol'>·<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp;&nbsp;</span></span>insuffisance h&eacute;patique s&eacute;v&egrave;re,</p>
<p class="AmmAnnexeTitre2"><a name="RcpMisesEnGarde">4.4. Mises en garde</a></p><p>Prudence chez l&#8217;asthmatique.</p>
<p class="AmmAnnexeTitre2"><a name="RcpInteractionsMed">4.5. Interactions</a></p><p>Aucune.</p>
<p class="AmmAnnexeTitre2"><a name="RcpFertGrossAllait">4.6. Grossesse</a></p><p>Contre-indiqu&eacute; au 3e trimestre.</p>
<p class="AmmAnnexeTitre2"><a name="RcpConduite">4.7. Conduite</a></p>`;

describe("parseOfficialSections", () => {
  it("reads 4.1, 4.3, 4.4 and 4.6 as paragraphs, without headings, bullets or entities", () => {
    expect(parseOfficialSections(SAFETY_PAGE)).toEqual({
      indications: ["Traitement de la fièvre."],
      contraindications: ["Ce médicament est contre-indiqué dans les situations suivantes:", "insuffisance hépatique sévère,"],
      warnings: ["Prudence chez l’asthmatique."],
      pregnancy: ["Contre-indiqué au 3e trimestre."],
      interactions: [{ level: null, with: "", text: "Aucune." }],
      complete: true,
    });
  });
  it("finds a section by its numbered heading when the page lacks its anchor, and stops at the next heading", () => {
    // the side menu repeats the headings before the document: it must not be taken for the section
    const menu = `<p class=AmmEntete>Résumé</p><ul><li><a href="#4.6._Fertilit">4.6. Fertilité, grossesse et allaitement</a></li></ul>`;
    const page = menu + SAFETY_PAGE.replace('<a name="RcpFertGrossAllait">', '<a name="_Toc9">').replace('<a name="RcpInteractionsMed">', '<a name="_Toc8">');
    const sections = parseOfficialSections(page)!;
    expect(sections.pregnancy).toEqual(["Contre-indiqué au 3e trimestre."]);
    // 4.5 isn't read as part of 4.4
    expect(sections.warnings).toEqual(["Prudence chez l’asthmatique."]);
  });
  it("is null for a page without them", () => {
    expect(parseOfficialSections(PAGE)).toBeNull();
  });
});

it("keeps a list's sub-items with their item", () => {
  const page = `<p class="AmmAnnexeTitre2"><a name="RcpContreindications">4.3. Contre-indications</a></p>
<p class=AmmListePuces1>· Insuffisance hépatique sévère,</p>
<p class=AmmListePuces1>· En cas d'association avec les médicaments suivants :</p>
<p class=AmmListePuces2>o l'acide acétylsalicylique :</p>
<p class=AmmListePuces3>§ en cas d'antécédent d'ulcère gastro-duodénal,</p>
<p class=AmmListePuces1>· Allaitement.</p>
<p class="AmmAnnexeTitre2"><a name="RcpMisesEnGarde">4.4. Mises en garde</a></p><p>Rien.</p>`;
  expect(parseOfficialSections(page)?.contraindications).toEqual([
    "Insuffisance hépatique sévère,",
    "En cas d'association avec les médicaments suivants : l'acide acétylsalicylique : en cas d'antécédent d'ulcère gastro-duodénal,",
    "Allaitement.",
  ]);
});

describe("parseInteractions", () => {
  it("reads the thesaurus layout: a level per heading, an entry per '+' line with the text under it", () => {
    const page = `<p class="AmmAnnexeTitre2"><a name="RcpInteractionsMed">4.5. Interactions</a></p>
<p class=AmmAnnexeTitre3>Risque lié à l'hyperkaliémie</p>
<p class=AmmCorpsTexte>Certains médicaments favorisent une hyperkaliémie.</p>
<p class=AmmAnnexeTitre3>Associations déconseillées</p>
<p class=AmmCorpsTexte>(Voir rubrique 4.4)</p>
<p class=AmmCorpsTexteGras>+ Anticoagulants oraux</p>
<p class=AmmCorpsTexte>Augmentation du risque hémorragique.</p>
<p class=AmmCorpsTexte>Si l'association ne peut être évitée, surveillance étroite.</p>
<p class=AmmAnnexeTitre3>Associations faisant l'objet de précautions d&rsquo;emploi</p>
<p class=AmmCorpsTexteGras>+Diurétiques :</p>
<p class=AmmCorpsTexte>Insuffisance rénale aiguë chez le patient à risque.</p>
<p class="AmmAnnexeTitre2"><a name="RcpFertGrossAllait">4.6. Grossesse</a></p>`;
    expect(parseInteractions(page)).toEqual({
      interactions: [
        { level: null, with: "", text: "Certains médicaments favorisent une hyperkaliémie." },
        { level: "not_recommended", with: "", text: "(Voir rubrique 4.4)" },
        { level: "not_recommended", with: "Anticoagulants oraux", text: "Augmentation du risque hémorragique. Si l'association ne peut être évitée, surveillance étroite." },
        { level: "precaution", with: "Diurétiques", text: "Insuffisance rénale aiguë chez le patient à risque." },
      ],
      complete: true,
    });
  });
});

describe("pickGeneric", () => {
  const GENERICS = [
    entry("IBUPROFENE ALMUS 200 mg, comprimé pelliculé", 1),
    entry("IBUPROFENE ARROW 400 mg, comprimé pelliculé", 2),
    entry("IBUPROFENE ARROW 5 %, gel", 3),
    entry("IBUPROFENE/PSEUDOEPHEDRINE ARROW 200 mg/30 mg, comprimé", 4),
    entry("LITHIUM CARBONICUM BOIRON, degré de dilution compris entre 2CH et 30CH", 5),
  ];
  const want = (strengths: string[], form: string | null = null) => ({ name: "Brufen", strengths, form });
  it("takes a generic of the same single substance and strength", () => {
    expect(pickGeneric("ibuprofene", want(["400 mg"], "film-coated tablets"), GENERICS)?.value).toBe("IBUPROFENE ARROW 400 mg, comprimé pelliculé");
  });
  it("never another strength, a combination, a homeopathic dilution, or a guess without a strength", () => {
    expect(pickGeneric("ibuprofene", want(["600 mg"]), GENERICS)).toBeNull();
    expect(pickGeneric("ibuprofene", want([]), GENERICS)).toBeNull();
    expect(pickGeneric("pseudoephedrine", want(["30 mg"]), GENERICS)).toBeNull();
    expect(pickGeneric("lithium", want(["250 mg"]), GENERICS)).toBeNull();
  });
  it("never another unit, and never a gel for a tablet or the other way round", () => {
    const list = [entry("PARACETAMOL ARROW 1 g, comprimé", 1), entry("KETOPROFENE ARROW 2,5 %, gel", 2), entry("KETOPROFENE ARROW 100 mg, comprimé", 3)];
    expect(pickGeneric("paracetamol", want(["1 mg"]), list)).toBeNull();
    expect(pickGeneric("paracetamol", want(["1 g"], "tablets"), list)?.value).toBe("PARACETAMOL ARROW 1 g, comprimé");
    expect(pickGeneric("ketoprofene", want(["2.5 %"], "comprimé"), list)).toBeNull();
    expect(pickGeneric("ketoprofene", want(["2,5 %"]), list)?.value).toBe("KETOPROFENE ARROW 2,5 %, gel");
  });
});
