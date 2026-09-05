import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { LocaleSwitcher } from "@/components/crm/locale-switcher";
import { isAppLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/get-dictionary";

export default async function AuthLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isAppLocale(locale)) notFound();
  const dictionary = getDictionary(locale);
  return <main className="relative flex min-h-screen items-center justify-center bg-muted/40 px-5 py-14"><div className="absolute right-5 top-5"><LocaleSwitcher label={dictionary.common.language} locale={locale} /></div>{children}</main>;
}
