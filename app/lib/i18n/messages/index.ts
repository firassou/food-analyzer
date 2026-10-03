import type { Locale } from "../locales";
import { ar } from "./ar";
import { en, type Messages } from "./en";
import { fr } from "./fr";

export type { Messages };

export const MESSAGES: Record<Locale, Messages> = { en, fr, ar };
