"use client";

import { Building2, ChartNoAxesCombined, Coins, LogOut, Menu, Users } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ReactNode, useState } from "react";

import { authClient } from "@/modules/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { AppLocale } from "@/i18n/config";
import type { AppDictionary } from "@/i18n/dictionary";
import { cn } from "@/lib/utils";

import { LocaleSwitcher } from "./locale-switcher";
import { getCrmDictionary } from "@/i18n/crm-dictionary";
import { RecordSheetHost } from "./record-sheet/record-sheet-host";
import { getCurrencyDictionary } from "@/i18n/currency-dictionary";

export function AppShell({ children, dictionary, locale, role, slug }: { children: ReactNode; dictionary: AppDictionary; locale: AppLocale; role: "owner" | "member"; slug: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [signOutError, setSignOutError] = useState(false);
  const base = `/${locale}/${slug}`;
  const crmLabels = getCrmDictionary(locale);
  const currencyLabels = getCurrencyDictionary(locale);
  const links = [
    { href: base, label: currencyLabels.dashboard, icon: ChartNoAxesCombined },
    { href: `${base}/companies`, label: dictionary.navigation.companies, icon: Building2 },
    { href: `${base}/contacts`, label: crmLabels.contact, icon: Users },
    { href: `${base}/deals`, label: crmLabels.deal, icon: Building2 },
    ...(role === "owner" ? [{ href: `${base}/settings/members`, label: dictionary.navigation.members, icon: Users }] : []),
    { href: `${base}/settings/currencies`, label: currencyLabels.currencies, icon: Coins },
  ];

  async function signOut() {
    setSignOutError(false);
    const { error } = await authClient.signOut();
    if (error) setSignOutError(true);
    else router.push(`/${locale}/sign-in`);
  }

  const navigation = <nav aria-label={crmLabels.navigation} className="space-y-1 p-3">{links.map(({ href, label, icon: Icon }) => <Link aria-current={pathname === href || href !== base && pathname.startsWith(`${href}/`) ? "page" : undefined} className={cn("flex min-h-11 items-center gap-3 rounded-md px-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground", (pathname === href || href !== base && pathname.startsWith(`${href}/`)) && "bg-accent text-primary")} href={href} key={href} onClick={() => setOpen(false)}><Icon aria-hidden="true" />{label}</Link>)}</nav>;

  return <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-muted/30">
    <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-background focus:p-3" href="#main-content">{crmLabels.skip}</a>
    <header className="flex h-14 shrink-0 items-center gap-3 border-b bg-background px-4 md:px-6">
      <Dialog onOpenChange={setOpen} open={open}><DialogTrigger asChild><Button aria-label={dictionary.navigation.openMenu} className="md:hidden" size="icon" type="button" variant="ghost"><Menu /></Button></DialogTrigger><DialogContent className="bottom-0 left-0 top-0 h-dvh w-72 max-w-[85vw] translate-x-0 translate-y-0 content-start rounded-none p-0 md:hidden" closeLabel={dictionary.navigation.closeMenu}><DialogTitle className="border-b p-4 text-base">{dictionary.common.appName}</DialogTitle>{navigation}</DialogContent></Dialog>
      <Link className="flex items-center gap-2 font-semibold text-primary" href={base}><span className="grid size-8 place-items-center rounded-md bg-primary text-sm text-primary-foreground">C</span>{dictionary.common.appName}</Link>
      <div className="ml-auto flex items-center gap-2">{signOutError ? <p className="text-sm text-destructive" role="alert">{dictionary.auth.signOutError}</p> : null}<LocaleSwitcher label={dictionary.common.language} locale={locale} /><Button aria-label={dictionary.auth.signOut} className="min-h-11" onClick={signOut} size="sm" type="button" variant="ghost"><LogOut aria-hidden="true" /><span className="hidden sm:inline">{dictionary.auth.signOut}</span></Button></div>
    </header>
    <div className="flex min-h-0 flex-1">
      <aside className="hidden w-56 shrink-0 border-r bg-background md:block">{navigation}</aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-auto p-4 md:p-6" id="main-content" tabIndex={-1}>{children}</main>
    </div>
    <RecordSheetHost locale={locale} />
  </div>;
}
