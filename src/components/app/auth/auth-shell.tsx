import type { ReactNode } from "react";
import Link from "next/link";
import type { AppDictionary } from "@/lib/i18n/dictionary";
import type { AppLocale } from "@/lib/i18n/config";
import { getShellInterfaceDictionary } from "@/lib/i18n/shell-interface-dictionary";
import { LocaleSwitcher } from "../locale-switcher";
import { ShellLogo } from "../shell-logo";
import { AuthShader } from "./auth-shader";

export function AuthShell({ children, locale, dictionary }: { children: ReactNode; locale: AppLocale; dictionary: AppDictionary }) {
  const copy = getShellInterfaceDictionary(locale);
  return <main className="dark grid min-h-svh bg-background text-foreground lg:grid-cols-[minmax(0,1fr)_minmax(420px,520px)]">
    <section className="relative hidden min-h-svh overflow-hidden bg-muted p-8 lg:flex lg:flex-col lg:justify-between xl:p-12">
      <AuthShader />
      <Link className="relative flex w-fit" href={`/${locale}/sign-in`} aria-label={copy.home}><ShellLogo className="size-5" /></Link>
      <div className="relative flex max-w-lg flex-col gap-8"><div className="flex flex-col gap-4"><p className="font-mono text-xs uppercase text-muted-foreground">{dictionary.common.appName}</p><h1 className="max-w-[14ch] text-balance text-5xl font-semibold leading-[1.17]">{copy.tagline}</h1></div></div>
      <p className="relative font-mono text-xs text-muted-foreground">{dictionary.common.appName}</p>
    </section>
    <section className="flex min-h-svh flex-col bg-background px-6 py-8 sm:px-10 lg:px-14">
      <div className="flex justify-end"><div className="[&_button]:h-8 [&_button]:min-h-0"><LocaleSwitcher label={dictionary.common.language} locale={locale} /></div></div>
      <div className="flex flex-1 items-center justify-center py-12"><div className="flex w-full max-w-sm flex-col gap-8">{children}</div></div>
    </section>
  </main>;
}
