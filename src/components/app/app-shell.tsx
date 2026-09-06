"use client";
import { getCatalogDictionary } from "@/lib/i18n/catalog-dictionary";
import { getLeadDictionary } from "@/lib/i18n/lead-dictionary";
import { getOrderDictionary } from "@/lib/i18n/order-dictionary";
import { getSchedulingDictionary } from "@/lib/i18n/scheduling-dictionary";
import { getB2bDictionary } from "@/lib/i18n/b2b-dictionary";
import { DealStageRefreshStatus } from "./deal-stage-provider";
import { getDealStageDictionary } from "@/lib/i18n/deal-stage-dictionary";
import { getLayoutDictionary } from "@/lib/i18n/layout-dictionary";

import Building from "@carbon/icons-react/es/Building";
import Dashboard from "@carbon/icons-react/es/Dashboard";
import Partnership from "@carbon/icons-react/es/Partnership";
import Settings from "@carbon/icons-react/es/Settings";
import UserMultiple from "@carbon/icons-react/es/UserMultiple";
import UserAvatar from "@carbon/icons-react/es/UserAvatar";
import ShoppingCart from "@carbon/icons-react/es/ShoppingCart";
import Menu from "@carbon/icons-react/es/Menu";
import Logout from "@carbon/icons-react/es/Logout";
import Light from "@carbon/icons-react/es/Light";
import Asleep from "@carbon/icons-react/es/Asleep";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { type MouseEvent, type ReactNode, useEffect, useState, useTransition } from "react";
import { authClient } from "@/lib/auth/auth-client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import type { AppLocale } from "@/lib/i18n/config";
import type { AppDictionary } from "@/lib/i18n/dictionary";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getBusinessSettingsDictionary } from "@/lib/i18n/business-settings-dictionary";
import { getAccessDictionary } from "@/lib/i18n/access-dictionary";
import { getCurrencyDictionary } from "@/lib/i18n/currency-dictionary";
import { getShellInterfaceDictionary } from "@/lib/i18n/shell-interface-dictionary";
import { cn } from "@/lib/utils";
import { LocaleSwitcher } from "./locale-switcher";
import { RecordSheetHost } from "./record-sheet/record-sheet-host";
import { useCrmInvalidation } from "./use-crm-invalidation";
import { NavigationSkeleton } from "./navigation-skeleton";
import { useModules } from "./module-provider";
import { ShellLogo } from "./shell-logo";
import { NotificationCenter } from "./scheduling/notification-center";
import { Calendar, Task, Ticket, Document, Star } from "@carbon/icons-react";

export function AppShell({ children, dictionary, locale, role, slug, user }: {
  children: ReactNode; dictionary: AppDictionary; locale: AppLocale; role: "owner" | "member"; slug: string;
  user?: { name: string; email: string; image?: string | null };
}) {
  useCrmInvalidation();
  const modules = useModules();
  const pathname = usePathname(); const router = useRouter();
  const [open, setOpen] = useState(false); const [signOutError, setSignOutError] = useState(false);
  const [navigationPending, startNavigation] = useTransition();
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.classList.contains("dark")); }, []);
  const base = `/${locale}/${slug}`; const crm = getCrmDictionary(locale); const currency = getCurrencyDictionary(locale); const copy = getShellInterfaceDictionary(locale);
  const settings = [{ href: `${base}/settings/currencies`, label: currency.currencies }, { href: `${base}/settings/general`, label: getBusinessSettingsDictionary(locale).title }, ...(role === "owner" ? [{ href: `${base}/settings/catalog`, label: getCatalogDictionary(locale).categories }, { href: `${base}/settings/leads`, label: getLeadDictionary(locale).title }, { href: `${base}/settings/lead-conversion`, label: getLeadDictionary(locale).mapping }, { href: `${base}/settings/deal-stages`, label: getDealStageDictionary(locale).title }, { href: `${base}/settings/layouts`, label: getLayoutDictionary(locale).title }, { href: `${base}/settings/modules`, label: modules.labels.title },{ href: `${base}/settings/members`, label: dictionary.navigation.members }, { href: `${base}/settings/access`, label: getAccessDictionary(locale).title }] : [])];
  const links = [
    { href: base, label: currency.dashboard, icon: Dashboard },
    { href: `${base}/products`, label: `${crm.product}${modules.isEnabled("product") ? "" : ` · ${modules.labels.disabled}`}`, icon: Building },
    { href: `${base}/orders`, label: `${crm.order}${modules.isEnabled("order") ? "" : ` · ${modules.labels.disabled}`}`, icon: ShoppingCart },
    { href: `${base}/inventory`, label: getOrderDictionary(locale).inventory, icon: Building },
    { href: `${base}/calendar`, label: getSchedulingDictionary(locale).calendar, icon: Calendar },
    { href: `${base}/tasks`, label: getSchedulingDictionary(locale).tasks, icon: Task },
    { href: `${base}/tickets`, label: getSchedulingDictionary(locale).tickets, icon: Ticket },
    { href: `${base}/leads`, label: `${crm.lead}${modules.isEnabled("lead") ? "" : ` · ${modules.labels.disabled}`}`, icon: UserMultiple },
    { href: `${base}/companies`, label: `${dictionary.navigation.companies}${modules.isEnabled("company") ? "" : ` · ${modules.labels.disabled}`}`, icon: Building },
    { href: `${base}/contacts`, label: `${crm.contact}${modules.isEnabled("contact") ? "" : ` · ${modules.labels.disabled}`}`, icon: UserMultiple },
    { href: `${base}/deals`, label: `${crm.deal}${modules.isEnabled("deal") ? "" : ` · ${modules.labels.disabled}`}`,  icon: Partnership },
    { href: `${base}/contracts`, label: `${getB2bDictionary(locale).contracts}${modules.isEnabled("contract") ? "" : ` · ${modules.labels.disabled}`}`, icon: Document },
    { href: `${base}/reviews`, label: `${getB2bDictionary(locale).reviews}${modules.isEnabled("review") ? "" : ` · ${modules.labels.disabled}`}`, icon: Star },
    { href: settings[0].href, match: `${base}/settings`, label: copy.settings, icon: Settings },
  ];
  const inSettings = pathname.startsWith(`${base}/settings`);
  const isActive = (href: string) => pathname === href || href !== base && pathname.startsWith(`${href}/`);
  function navigate(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); setOpen(false); if (pathname !== href) startNavigation(() => router.push(href));
  }
  async function signOut() {
    setSignOutError(false);
    try { const { error } = await authClient.signOut(); if (error) setSignOutError(true); else router.push(`/${locale}/sign-in`); }
    catch { setSignOutError(true); }
  }
  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    try { localStorage.setItem("crm-theme", next ? "dark" : "light"); } catch { /* The active theme still works when storage is unavailable. */ }
    setDark(next);
  }
  const initials = user?.name.split(" ").map(part => part[0]).filter(Boolean).slice(0, 2).join("").toUpperCase();
  return <TooltipProvider delayDuration={100}><div className="isolate flex h-svh min-h-0 flex-col overflow-hidden bg-background">
    <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-background focus:p-3" href="#main-content">{crm.skip}</a>
    <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
      <Dialog onOpenChange={setOpen} open={open}><DialogTrigger asChild><Button aria-label={dictionary.navigation.openMenu} className="md:hidden" size="icon" type="button" variant="ghost"><Menu /></Button></DialogTrigger><DialogContent className="bottom-0 left-0 top-0 flex h-svh w-64 max-w-[85vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none p-0 md:hidden" closeLabel={dictionary.navigation.closeMenu}><DialogTitle className="border-b px-4 py-4 text-sm">{crm.navigation}</DialogTitle><nav aria-label={crm.navigation} className="flex flex-col gap-1 p-2">{links.map(({ href, match, label, icon: Icon }) => <Button asChild key={href} variant="ghost" className={cn("justify-start gap-3 text-muted-foreground", isActive(match ?? href) && "bg-muted text-foreground")}><Link prefetch={false} href={href} aria-current={isActive(match ?? href) ? "page" : undefined} onClick={event => navigate(event, href)}><Icon />{label}</Link></Button>)}</nav></DialogContent></Dialog>
      <Link prefetch={false} className="hidden size-8 shrink-0 items-center justify-center md:flex" href={base} aria-label={copy.home} onClick={event => navigate(event, base)}><ShellLogo className="size-5" /></Link>
      <span className="mx-1 hidden h-5 md:block" aria-hidden="true" /><span className="min-w-0 truncate text-sm font-medium">{dictionary.common.appName}</span>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        {signOutError && <p className="max-w-48 text-xs text-destructive" role="alert">{dictionary.auth.signOutError}</p>}
        <div className="[&_button]:min-h-0 [&_button]:h-8 [&_button]:border-transparent"><LocaleSwitcher label={dictionary.common.language} locale={locale} /></div>
        <NotificationCenter locale={locale} base={base} />
        <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={copy.account}><span className="flex size-7 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium">{user?.image ? <img alt={user.name} src={user.image} className="size-full object-cover" /> : initials || <UserAvatar size={20} />}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-56"><DropdownMenuLabel className="flex items-center gap-2"><UserAvatar size={16} /><span className="max-w-64 truncate">{user?.email ?? copy.account}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem onSelect={event => { event.preventDefault(); toggleTheme(); }}>{dark ? <Light /> : <Asleep />}{dark ? copy.light : copy.dark}</DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => void signOut()}><Logout />{dictionary.auth.signOut}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </header>
    <div className="flex min-h-0 flex-1">
      <nav aria-label={crm.navigation} className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r py-3 md:flex">{links.map(({ href, match, label, icon: Icon }) => <Tooltip key={href}><TooltipTrigger asChild><Button asChild variant="ghost" size="icon" className={cn("text-muted-foreground", isActive(match ?? href) && "bg-muted text-foreground hover:bg-muted")}><Link prefetch={false} href={href} aria-current={isActive(match ?? href) ? "page" : undefined} onClick={event => navigate(event, href)} onMouseEnter={() => router.prefetch(href)} onFocus={() => router.prefetch(href)}><Icon /><span className="sr-only">{label}</span></Link></Button></TooltipTrigger><TooltipContent side="right">{label}</TooltipContent></Tooltip>)}</nav>
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:flex-row">
        {inSettings && <aside className="shrink-0 border-b md:w-56 md:border-b-0 md:border-r"><nav aria-label={copy.settings} className="flex gap-1 overflow-x-auto p-2 md:flex-col md:gap-0.5 md:p-3">{settings.map(({ href, label }) => <Button asChild key={href} variant="ghost" className={cn("shrink-0 justify-start px-3 font-normal text-muted-foreground", isActive(href) && "bg-muted text-foreground hover:bg-muted")}><Link prefetch={false} href={href} aria-current={isActive(href) ? "page" : undefined} onClick={event => navigate(event, href)}>{label}</Link></Button>)}</nav></aside>}
        <main aria-busy={navigationPending} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto p-4 md:p-6" id="main-content" tabIndex={-1}>
          <DealStageRefreshStatus />
          {navigationPending && <NavigationSkeleton label={crm.loading} />}
          <div className="flex min-h-0 min-w-0 flex-1 flex-col [&>div]:w-full" hidden={navigationPending} inert={navigationPending} style={navigationPending ? { display: "none" } : undefined}>{children}</div>
        </main>
      </div>
    </div>
    <RecordSheetHost locale={locale} />
  </div></TooltipProvider>;
}
