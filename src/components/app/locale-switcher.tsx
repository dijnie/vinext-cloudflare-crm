"use client";

import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import type { AppLocale } from "@/lib/i18n/config";
import { LOCALE_COOKIE, localizedPath } from "@/lib/i18n/config";

function switchLocale(nextLocale: AppLocale) {
  const next = localizedPath(
    window.location.pathname,
    nextLocale,
    window.location.search,
  );
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${LOCALE_COOKIE}=${nextLocale}; Path=/; Max-Age=31536000; SameSite=Lax${secure}`;
  window.location.assign(`${next}${window.location.hash}`);
}

export function LocaleSwitcher({
  label,
  locale,
}: {
  label: string;
  locale: AppLocale;
}) {
  const nextLocale: AppLocale = locale === "vi" ? "en" : "vi";
  return (
    <Button
      aria-label={`${label}: ${nextLocale.toUpperCase()}`}
      className="min-h-11"
      lang={nextLocale}
      onClick={() => switchLocale(nextLocale)}
      size="sm"
      type="button"
      variant="outline"
    >
      <Languages aria-hidden="true" />
      {nextLocale.toUpperCase()}
    </Button>
  );
}

export function LocaleMenuItem({
  label,
  locale,
}: {
  label: string;
  locale: AppLocale;
}) {
  const nextLocale: AppLocale = locale === "vi" ? "en" : "vi";
  return (
    <DropdownMenuItem
      aria-label={`${label}: ${nextLocale.toUpperCase()}`}
      lang={nextLocale}
      onSelect={() => switchLocale(nextLocale)}
    >
      <Languages aria-hidden="true" />
      <span className="flex-1">{label}</span>
      <span className="text-muted-foreground">{nextLocale.toUpperCase()}</span>
    </DropdownMenuItem>
  );
}
