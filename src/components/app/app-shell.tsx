"use client";

import {
  Asleep,
  Building,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dashboard,
  Document,
  Light,
  Logout,
  Menu,
  Partnership,
  Report,
  Settings,
  ShoppingCart,
  Star,
  Task,
  Ticket,
  UserAvatar,
  UserMultiple,
} from "@carbon/icons-react";
import Link from "next/link";
import {usePathname,useRouter} from "next/navigation";
import {type MouseEvent,type ReactNode,useEffect,useState,useTransition} from "react";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogTitle,DialogTrigger} from "@/components/ui/dialog";
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuLabel,DropdownMenuSeparator,DropdownMenuTrigger} from "@/components/ui/dropdown-menu";
import {authClient} from "@/lib/auth/auth-client";
import type {AppLocale} from "@/lib/i18n/config";
import type {AppDictionary} from "@/lib/i18n/dictionary";
import {getAccessDictionary} from "@/lib/i18n/access-dictionary";
import {getB2bDictionary} from "@/lib/i18n/b2b-dictionary";
import {getBusinessSettingsDictionary} from "@/lib/i18n/business-settings-dictionary";
import {getCatalogDictionary} from "@/lib/i18n/catalog-dictionary";
import {getCrmDictionary} from "@/lib/i18n/crm-dictionary";
import {getCurrencyDictionary} from "@/lib/i18n/currency-dictionary";
import {getDealStageDictionary} from "@/lib/i18n/deal-stage-dictionary";
import {getLayoutDictionary} from "@/lib/i18n/layout-dictionary";
import {getLeadDictionary} from "@/lib/i18n/lead-dictionary";
import {getOrderDictionary} from "@/lib/i18n/order-dictionary";
import {getReportDictionary} from "@/lib/i18n/report-dictionary";
import {getSchedulingDictionary} from "@/lib/i18n/scheduling-dictionary";
import {getShellInterfaceDictionary} from "@/lib/i18n/shell-interface-dictionary";
import {cn} from "@/lib/utils";
import {DealStageRefreshStatus} from "./deal-stage-provider";
import {LocaleMenuItem} from "./locale-switcher";
import {useModules} from "./module-provider";
import {NavigationSkeleton} from "./navigation-skeleton";
import {RecordSheetHost} from "./record-sheet/record-sheet-host";
import {NotificationCenter} from "./scheduling/notification-center";
import {ShellLogo} from "./shell-logo";
import {useCrmInvalidation} from "./use-crm-invalidation";

type NavItem={href:string;label:string;icon:typeof Dashboard;match?:string};
type NavGroup={label:string;items:NavItem[]};

export function AppShell({children,dictionary,locale,role,slug,user}:{children:ReactNode;dictionary:AppDictionary;locale:AppLocale;role:"owner"|"member";slug:string;user?:{name:string;email:string;image?:string|null}}){
  useCrmInvalidation();
  const modules=useModules(),pathname=usePathname(),router=useRouter();
  const base=`/${locale}/${slug}`,crm=getCrmDictionary(locale),currency=getCurrencyDictionary(locale),copy=getShellInterfaceDictionary(locale),scheduling=getSchedulingDictionary(locale);
  const inSettings=pathname.startsWith(`${base}/settings`);
  const [open,setOpen]=useState(false),[sidebarCollapsed,setSidebarCollapsed]=useState(false),[settingsOpen,setSettingsOpen]=useState(inSettings),[signOutError,setSignOutError]=useState(false),[navigationPending,startNavigation]=useTransition(),[dark,setDark]=useState(false);
  useEffect(()=>setDark(document.documentElement.classList.contains("dark")),[]);
  useEffect(()=>{if(inSettings)setSettingsOpen(true)},[inSettings]);
  const settings=[{href:`${base}/settings/currencies`,label:currency.currencies},{href:`${base}/settings/general`,label:getBusinessSettingsDictionary(locale).title},...(role==="owner"?[
    {href:`${base}/settings/catalog`,label:getCatalogDictionary(locale).categories},
    {href:`${base}/settings/leads`,label:getLeadDictionary(locale).title},
    {href:`${base}/settings/lead-conversion`,label:getLeadDictionary(locale).mapping},
    {href:`${base}/settings/deal-stages`,label:getDealStageDictionary(locale).title},
    {href:`${base}/settings/layouts`,label:getLayoutDictionary(locale).title},
    {href:`${base}/settings/modules`,label:modules.labels.title},
    {href:`${base}/settings/members`,label:dictionary.navigation.members},
    {href:`${base}/settings/access`,label:getAccessDictionary(locale).title},
    {href:`${base}/settings/operations`,label:locale==="vi"?"Tích hợp và vận hành":"Integrations and operations"},
  ]:[])];
  const moduleLabel=(entity:"product"|"order"|"lead"|"company"|"contact"|"deal"|"contract"|"review",label:string)=>`${label}${modules.isEnabled(entity)?"":` · ${modules.labels.disabled}`}`;
  const groups:NavGroup[]=[
    {label:copy.overviewGroup,items:[{href:base,label:currency.dashboard,icon:Dashboard}]},
    {label:copy.salesGroup,items:[
      {href:`${base}/leads`,label:moduleLabel("lead",crm.lead),icon:UserMultiple},
      {href:`${base}/deals`,label:moduleLabel("deal",crm.deal),icon:Partnership},
      {href:`${base}/orders`,label:moduleLabel("order",crm.order),icon:ShoppingCart},
    ]},
    {label:copy.customersGroup,items:[
      {href:`${base}/companies`,label:moduleLabel("company",dictionary.navigation.companies),icon:Building},
      {href:`${base}/contacts`,label:moduleLabel("contact",crm.contact),icon:UserMultiple},
    ]},
    {label:copy.operationsGroup,items:[
      {href:`${base}/products`,label:moduleLabel("product",crm.product),icon:Building},
      {href:`${base}/inventory`,label:getOrderDictionary(locale).inventory,icon:Building},
      {href:`${base}/calendar`,label:scheduling.calendar,icon:Calendar},
      {href:`${base}/tasks`,label:scheduling.tasks,icon:Task},
      {href:`${base}/tickets`,label:scheduling.tickets,icon:Ticket},
    ]},
    {label:copy.insightsGroup,items:[
      {href:`${base}/contracts`,label:moduleLabel("contract",getB2bDictionary(locale).contracts),icon:Document},
      {href:`${base}/reviews`,label:moduleLabel("review",getB2bDictionary(locale).reviews),icon:Star},
      {href:`${base}/reports`,label:getReportDictionary(locale).title,icon:Report},
    ]},
    {label:copy.manageGroup,items:[{href:settings[0]!.href,match:`${base}/settings`,label:copy.settings,icon:Settings}]},
  ];
  const isActive=(href:string)=>pathname===href||(href!==base&&pathname.startsWith(`${href}/`));
  function navigate(event:MouseEvent<HTMLAnchorElement>,href:string){if(event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey)return;event.preventDefault();setOpen(false);if(pathname!==href)startNavigation(()=>router.push(href))}
  function toggleSettings(event:MouseEvent<HTMLButtonElement>,compact:boolean){
    const menu=event.currentTarget.parentElement;
    if(compact){setSidebarCollapsed(false);setSettingsOpen(true)}
    else setSettingsOpen(value=>!value);
    if(compact||!settingsOpen)requestAnimationFrame(()=>menu?.scrollIntoView({block:"start"}));
  }
  async function signOut(){setSignOutError(false);try{const {error}=await authClient.signOut();if(error)setSignOutError(true);else router.push(`/${locale}/sign-in`)}catch{setSignOutError(true)}}
  function toggleTheme(){const next=!document.documentElement.classList.contains("dark");document.documentElement.classList.toggle("dark",next);try{localStorage.setItem("crm-theme",next?"dark":"light")}catch{}setDark(next)}
  const initials=user?.name.split(" ").map(part=>part[0]).filter(Boolean).slice(0,2).join("").toUpperCase();

  const navigation=(mobile=false)=>{
    const compact=sidebarCollapsed&&!mobile;
    return <nav aria-label={crm.navigation} className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
      <div className="space-y-5">{groups.map(group=><section key={group.label}><h2 className={cn("mb-1.5 px-2 text-[11px] font-medium text-muted-foreground",compact&&"sr-only")}>{group.label}</h2><div className="space-y-0.5">{group.items.map(({href,match,label,icon:Icon})=>match===`${base}/settings`?<div key={href}>
        <button type="button" title={compact?label:undefined} aria-expanded={settingsOpen&&!compact} onClick={event=>toggleSettings(event,compact)} className={cn("flex h-11 w-full cursor-pointer items-center gap-3 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",compact&&"justify-center",inSettings&&"bg-muted font-medium text-foreground")}><Icon className="size-4 shrink-0"/><span className={cn("min-w-0 flex-1 truncate text-left",compact&&"sr-only")}>{label}</span>{!compact&&(settingsOpen?<ChevronDown className="size-4 shrink-0"/>:<ChevronRight className="size-4 shrink-0"/>)}</button>
        {settingsOpen&&!compact&&<div className="ml-4 mt-1 space-y-0.5 border-l pl-3">{settings.map(item=><Link key={item.href} prefetch={false} href={item.href} aria-current={isActive(item.href)?"page":undefined} onClick={event=>navigate(event,item.href)} className={cn("flex min-h-9 items-center rounded-lg px-3 py-2 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground",isActive(item.href)&&"bg-muted font-medium text-foreground")}>{item.label}</Link>)}</div>}
      </div>:<Link key={href} prefetch={false} href={href} title={compact?label:undefined} aria-current={isActive(match??href)?"page":undefined} onClick={event=>navigate(event,href)} onMouseEnter={()=>router.prefetch(href)} onFocus={()=>router.prefetch(href)} className={cn("flex h-9 items-center gap-3 rounded-lg px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",compact&&"justify-center",isActive(match??href)&&"bg-muted font-medium text-foreground")}><Icon className="size-4 shrink-0"/><span className={cn("min-w-0 truncate",compact&&"sr-only")}>{label}</span></Link>)}</div></section>)}</div>
    </nav>;
  };

  return <div className="isolate flex h-svh min-h-0 overflow-hidden bg-[#f8f8f8] dark:bg-background">
    <a className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-background focus:p-3" href="#main-content">{crm.skip}</a>
    <aside className={cn("hidden shrink-0 flex-col border-r bg-sidebar md:flex",sidebarCollapsed?"w-16":"w-[260px]")}>
      <Link prefetch={false} href={base} onClick={event=>navigate(event,base)} aria-label={copy.home} className={cn("flex h-[58px] shrink-0 items-center gap-3 border-b px-5",sidebarCollapsed&&"justify-center px-0")}>
        <ShellLogo className="size-6 shrink-0 text-[#f48120]"/>{!sidebarCollapsed&&<span className="min-w-0"><span className="block truncate text-sm font-semibold">{dictionary.common.appName}</span><span className="block max-w-44 truncate text-xs text-muted-foreground">{user?.email??copy.workspace}</span></span>}
      </Link>
      {navigation()}
      <div className="border-t p-2"><Button type="button" variant="ghost" className={cn("h-11 w-full justify-start gap-3 text-muted-foreground",sidebarCollapsed&&"justify-center px-0")} aria-label={sidebarCollapsed?copy.expandSidebar:copy.collapseSidebar} aria-expanded={!sidebarCollapsed} onClick={()=>setSidebarCollapsed(value=>!value)}>{sidebarCollapsed?<ChevronRight/>:<ChevronLeft/>}<span className={cn(sidebarCollapsed&&"sr-only")}>{sidebarCollapsed?copy.expandSidebar:copy.collapseSidebar}</span></Button></div>
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex h-[58px] shrink-0 items-center gap-2 border-b bg-[#f8f8f8] px-4 dark:bg-background">
        <Dialog onOpenChange={setOpen} open={open}><DialogTrigger asChild><Button aria-label={dictionary.navigation.openMenu} className="md:hidden" size="icon" type="button" variant="ghost"><Menu/></Button></DialogTrigger><DialogContent className="bottom-0 left-0 top-0 flex h-svh w-[280px] max-w-[88vw] translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-sidebar p-0 md:hidden" closeLabel={dictionary.navigation.closeMenu}><DialogTitle className="flex h-[58px] items-center gap-3 border-b px-5 text-sm"><ShellLogo className="size-6 text-[#f48120]"/>{dictionary.common.appName}</DialogTitle>{navigation(true)}</DialogContent></Dialog>
        <Link prefetch={false} className="flex items-center gap-2 md:hidden" href={base} aria-label={copy.home} onClick={event=>navigate(event,base)}><ShellLogo className="size-5 text-[#f48120]"/><span className="text-sm font-semibold">{dictionary.common.appName}</span></Link>
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {signOutError&&<p className="max-w-48 text-xs text-destructive" role="alert">{dictionary.auth.signOutError}</p>}
          <NotificationCenter locale={locale} base={base}/>
          <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={copy.account}><span className="flex size-7 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-medium">{user?.image?<img alt={user.name} src={user.image} className="size-full object-cover"/>:initials||<UserAvatar size={20}/>}</span></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="min-w-64"><DropdownMenuLabel><span className="block truncate text-sm font-medium">{user?.name??copy.account}</span><span className="block truncate font-normal text-muted-foreground">{user?.email}</span></DropdownMenuLabel><DropdownMenuSeparator/><LocaleMenuItem label={dictionary.common.language} locale={locale}/><DropdownMenuItem onSelect={event=>{event.preventDefault();toggleTheme()}}>{dark?<Light/>:<Asleep/>}{dark?copy.light:copy.dark}</DropdownMenuItem><DropdownMenuSeparator/><DropdownMenuItem onSelect={()=>void signOut()}><Logout/>{dictionary.auth.signOut}</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </header>
      <main aria-busy={navigationPending} className="flex min-h-0 min-w-0 flex-1 flex-col overflow-auto px-4 py-6 sm:px-6 md:px-8 md:py-9" id="main-content" tabIndex={-1}>
        {inSettings&&<nav aria-label={copy.settings} className="-mx-4 -mt-6 mb-6 flex shrink-0 gap-1 overflow-x-auto border-b bg-background px-3 py-2 sm:-mx-6 sm:px-5 md:hidden">{settings.map(item=><Link key={item.href} prefetch={false} href={item.href} aria-current={isActive(item.href)?"page":undefined} onClick={event=>navigate(event,item.href)} className={cn("shrink-0 rounded-lg px-3 py-2 text-sm text-muted-foreground",isActive(item.href)&&"bg-muted font-medium text-foreground")}>{item.label}</Link>)}</nav>}
        <DealStageRefreshStatus/>
        {navigationPending&&<NavigationSkeleton label={crm.loading}/>}
        <div className="mx-auto flex min-h-0 min-w-0 w-full max-w-[1600px] flex-1 flex-col [&>div]:w-full" hidden={navigationPending} inert={navigationPending} style={navigationPending?{display:"none"}:undefined}>{children}</div>
      </main>
    </div>
    <RecordSheetHost locale={locale}/>
  </div>;
}
