import type { OfficialInfo } from "../types";

/** an official product information that names no condition, for tests to fill (4.3 and 4.4 are never empty on a real page) */
export const OFFICIAL: OfficialInfo = {
  source: "Base de données publique des médicaments",
  product: "X",
  url: "https://base-donnees-publique.medicaments.gouv.fr/medicament/1/extrait",
  match: "brand",
  indications: [],
  contraindications: ["Hypersensibilité à la substance active ou à l’un des excipients mentionnés à la rubrique 6.1."],
  warnings: ["Respecter la posologie indiquée."],
  pregnancy: [],
  complete: true,
};
