import type { AppLocale } from "./config";
import { en } from "./dictionaries/en";
import { vi } from "./dictionaries/vi";

export type { AppLocale } from "./config";
export { isAppLocale } from "./config";

const dictionaries = { vi, en } as const;

export function getDictionary(locale: AppLocale) {
  return dictionaries[locale];
}
