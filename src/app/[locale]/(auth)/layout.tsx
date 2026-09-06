import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AuthShell } from "@/components/app/auth/auth-shell";
import { isAppLocale } from "@/lib/i18n/config";
import { getDictionary } from "@/lib/i18n/get-dictionary";

export default async function AuthLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  return <AuthShell locale={locale} dictionary={getDictionary(locale)}>{children}</AuthShell>;
}
