export const APP_LOCALES = ["vi", "en"] as const;
export const DEFAULT_LOCALE = "vi";
export const LOCALE_COOKIE = "crm_locale";

export type AppLocale = (typeof APP_LOCALES)[number];

export function isAppLocale(value: string | undefined): value is AppLocale {
  return APP_LOCALES.includes(value as AppLocale);
}

export function localeFromPath(pathname: string): AppLocale | null {
  const segment = pathname.split("/")[1];
  return isAppLocale(segment) ? segment : null;
}

export function savedLocale(value: string | undefined): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

export function canonicalWorkspacePath(locale: AppLocale, slug: string, search = "", suffix = "/companies"): string {
  return `/${locale}/${slug}${suffix}${search}`;
}

export function localizedPath(pathname: string, locale: AppLocale, search = ""): string {
  const segments = pathname.split("/");
  if (isAppLocale(segments[1])) segments[1] = locale;
  else segments.splice(1, 0, locale);
  return `${segments.join("/") || `/${locale}`}${search}`;
}
