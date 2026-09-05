"use client";

import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/i18n/config";
import { LOCALE_COOKIE, localizedPath } from "@/i18n/config";

export function LocaleSwitcher({ label, locale }: { label: string; locale: AppLocale }) {
  const nextLocale: AppLocale = locale === "vi" ? "en" : "vi";
  function switchLocale() {
    const next = localizedPath(window.location.pathname, nextLocale, window.location.search);
    const secure = window.location.protocol === "https:" ? "; Secure" : "";
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
    window.location.assign(`${next}${window.location.hash}`);
  }
  return <Button aria-label={`${label}: ${nextLocale.toUpperCase()}`} className="min-h-11" lang={nextLocale} onClick={switchLocale} size="sm" type="button" variant="outline"><Languages aria-hidden="true" />{nextLocale.toUpperCase()}</Button>;
}
