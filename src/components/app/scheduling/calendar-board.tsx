"use client";

import {Temporal} from "@js-temporal/polyfill";
import {CalendarDays,ChevronLeft,ChevronRight,Plus} from "lucide-react";
import {useEffect,useMemo,useState} from "react";
import type {z} from "zod";
import {Button} from "@/components/ui/button";
import {Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {Input} from "@/components/ui/input";
import type {AppLocale} from "@/lib/i18n/config";
import {getSchedulingDictionary} from "@/lib/i18n/scheduling-dictionary";
import type {appointmentListOutputSchema,appointmentRowSchema} from "@/lib/services/appointments/appointment-contract";
import {localDateTime,resolveLocalDateTime} from "@/lib/services/custom-fields/field-datetime";
import {cn} from "@/lib/utils";
import {crmRequest} from "../record-types";

type Row=z.infer<typeof appointmentListOutputSchema>["rows"][number];
type Detail=z.infer<typeof appointmentRowSchema>;
type View="day"|"week"|"month";
type Scope="mine"|"all";
const START_HOUR=7,END_HOUR=18,HOUR_HEIGHT=72;
const statusStyle={
 scheduled:{event:"border-blue-400 bg-blue-50 text-blue-950",dot:"bg-blue-500"},
 completed:{event:"border-emerald-400 bg-emerald-50 text-emerald-950",dot:"bg-emerald-500"},
 cancelled:{event:"border-red-400 bg-red-50 text-red-950",dot:"bg-red-400"},
} as const;
const plainDate=(value:string)=>Temporal.PlainDate.from(value);
const addDays=(value:string,days:number)=>plainDate(value).add({days}).toString();
const startOfWeek=(value:string)=>addDays(value,1-plainDate(value).dayOfWeek);
const startOfMonth=(value:string)=>plainDate(value).with({day:1}).toString();
const localToday=(timeZone:string)=>Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate().toString();

function rangeFor(view:View,anchor:string){
 if(view==="day")return{start:anchor,end:addDays(anchor,1)};
 if(view==="week"){const start=startOfWeek(anchor);return{start,end:addDays(start,7)};}
 const start=startOfWeek(startOfMonth(anchor));return{start,end:addDays(start,42)};
}
function instantAt(day:string,time:string,timeZone:string){return resolveLocalDateTime(`${day}T${time}`,timeZone)[0]?.instant;}
function instantRange(view:View,anchor:string,timeZone:string){const range=rangeFor(view,anchor);return{from:instantAt(range.start,"00:00",timeZone),to:instantAt(range.end,"00:00",timeZone)};}
function localParts(value:string,timeZone:string){const local=localDateTime(value,timeZone);return{day:local.slice(0,10),minutes:Number(local.slice(11,13))*60+Number(local.slice(14,16))};}
function formatDate(value:string,locale:AppLocale,options:Intl.DateTimeFormatOptions){return new Intl.DateTimeFormat(locale,{...options,timeZone:"UTC"}).format(new Date(`${value}T12:00:00Z`));}
function dayName(value:string,locale:AppLocale,width:"short"|"long"="short"){return formatDate(value,locale,{weekday:width});}
function periodLabel(view:View,anchor:string,locale:AppLocale){
 if(view==="day")return formatDate(anchor,locale,{dateStyle:"long"});
 if(view==="month")return formatDate(startOfMonth(anchor),locale,{month:"long",year:"numeric"});
 const start=startOfWeek(anchor),end=addDays(start,6);
 return `${formatDate(start,locale,{day:"numeric",month:"short"})} – ${formatDate(end,locale,{day:"numeric",month:"short",year:"numeric"})}`;
}
function moveAnchor(view:View,anchor:string,direction:-1|1){const current=plainDate(anchor);return current.add(view==="day"?{days:direction}:view==="week"?{weeks:direction}:{months:direction}).toString();}
function eventTime(value:string,locale:AppLocale,timeZone:string){return new Intl.DateTimeFormat(locale,{hour:"2-digit",minute:"2-digit",hour12:false,timeZone}).format(new Date(value));}

function TimeGrid({days,rows,locale,timeZone,today,onSelect}:{days:string[];rows:Row[];locale:AppLocale;timeZone:string;today:string;onSelect:(row:Row)=>void}){
 const hours=Array.from({length:END_HOUR-START_HOUR+1},(_,index)=>START_HOUR+index),height=(END_HOUR-START_HOUR)*HOUR_HEIGHT;
 return <div className="overflow-x-auto" data-calendar-view={days.length===1?"day":"week"}><div className={cn("min-w-[860px]",days.length===1&&"min-w-[520px]")}>
  <div className="grid border-b bg-background" style={{gridTemplateColumns:`52px repeat(${days.length}, minmax(0, 1fr))`}}><div/>{days.map(day=><div key={day} className={cn("border-l px-2 py-3 text-center",day===today&&"border-t-2 border-t-blue-500 pt-2.5")}><div className={cn("text-sm font-semibold tabular-nums",day===today&&"text-blue-600")}>{plainDate(day).day}/{plainDate(day).month}</div><div className={cn("mt-0.5 text-xs text-muted-foreground",day===today&&"text-blue-500")}>{dayName(day,locale,"long")}</div></div>)}</div>
  <div className="grid" style={{gridTemplateColumns:`52px repeat(${days.length}, minmax(0, 1fr))`}}>
   <div className="relative border-r" style={{height}}>{hours.map(hour=><span key={hour} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{top:(hour-START_HOUR)*HOUR_HEIGHT}}>{String(hour).padStart(2,"0")}:00</span>)}</div>
   {days.map(day=><div key={day} className="relative border-r bg-[repeating-linear-gradient(to_bottom,var(--border)_0,var(--border)_1px,transparent_1px,transparent_36px)] last:border-r-0" style={{height}}>
    {rows.filter(row=>localParts(row.startsAt,timeZone).day===day).map(row=>{const start=localParts(row.startsAt,timeZone).minutes,end=localParts(row.endsAt,timeZone).minutes,visibleStart=Math.max(start,START_HOUR*60),visibleEnd=Math.min(end,END_HOUR*60);if(visibleEnd<=visibleStart)return null;const top=(visibleStart-START_HOUR*60)/60*HOUR_HEIGHT,eventHeight=Math.max(30,(visibleEnd-visibleStart)/60*HOUR_HEIGHT);return <button key={row.id} type="button" onClick={()=>onSelect(row)} className={cn("absolute inset-x-1 z-10 overflow-hidden rounded-md border-l-4 px-2 py-1 text-left text-[11px] shadow-sm transition hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",statusStyle[row.status].event)} style={{top,height:eventHeight}} title={row.subject}><span className="font-medium tabular-nums">{eventTime(row.startsAt,locale,timeZone)}</span><span className="ml-1.5 font-semibold">{row.subject}</span></button>})}
   </div>)}
  </div>
 </div></div>;
}

function MonthGrid({rows,anchor,locale,timeZone,today,onSelect}:{rows:Row[];anchor:string;locale:AppLocale;timeZone:string;today:string;onSelect:(row:Row)=>void}){
 const monthStart=startOfMonth(anchor),gridStart=startOfWeek(monthStart),days=Array.from({length:42},(_,index)=>addDays(gridStart,index));
 return <div className="overflow-x-auto" data-calendar-view="month"><div className="min-w-[760px]"><div className="grid grid-cols-7 border-b bg-muted/25">{days.slice(0,7).map(day=><div key={day} className="border-r px-3 py-2 text-center text-xs font-medium text-muted-foreground last:border-r-0">{dayName(day,locale)}</div>)}</div><div className="grid grid-cols-7">{days.map(day=>{const dayRows=rows.filter(row=>localParts(row.startsAt,timeZone).day===day),outside=plainDate(day).month!==plainDate(monthStart).month;return <div key={day} className="min-h-28 border-b border-r p-1.5"><span className={cn("ml-1 inline-flex size-6 items-center justify-center rounded-full text-xs tabular-nums",outside&&"text-muted-foreground/50",day===today&&"bg-blue-600 text-white")}>{plainDate(day).day}</span><div className="mt-1 space-y-1">{dayRows.slice(0,3).map(row=><button key={row.id} type="button" onClick={()=>onSelect(row)} className={cn("block w-full truncate rounded border-l-2 px-1.5 py-1 text-left text-[11px]",statusStyle[row.status].event)}>{eventTime(row.startsAt,locale,timeZone)} · {row.subject}</button>)}{dayRows.length>3&&<p className="px-1 text-[10px] text-muted-foreground">+{dayRows.length-3}</p>}</div></div>})}</div></div></div>;
}

export function CalendarBoard({locale,timeZone,calendarRevision,initialData}:{locale:AppLocale;timeZone:string;calendarRevision:number;initialData:{rows:Row[]}}){
 const copy=getSchedulingDictionary(locale),today=useMemo(()=>localToday(timeZone),[timeZone]);
 const [anchor,setAnchor]=useState(today),[view,setView]=useState<View>("week"),[scope,setScope]=useState<Scope>("mine"),[rows,setRows]=useState(initialData.rows),[selected,setSelected]=useState<Row|null>(null),[createOpen,setCreateOpen]=useState(false),[subject,setSubject]=useState(""),[starts,setStarts]=useState(""),[ends,setEnds]=useState(""),[busy,setBusy]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(""),[pending,setPending]=useState(false);
 useEffect(()=>{const range=instantRange(view,anchor,timeZone);if(!range.from||!range.to)return;const controller=new AbortController();setLoading(true);const query=new URLSearchParams({from:range.from,to:range.to,scope,limit:"200"});crmRequest<{rows:Row[]}>(`/api/crm/appointments?${query}`,{signal:controller.signal}).then(data=>setRows(data.rows)).catch(reason=>{if(!(reason instanceof DOMException&&reason.name==="AbortError"))setError(copy.errors)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)});return()=>controller.abort()},[anchor,copy.errors,scope,timeZone,view]);
 const visibleDays=view==="day"?[anchor]:Array.from({length:7},(_,index)=>addDays(startOfWeek(anchor),index));
 function openCreate(){const day=view==="week"?(visibleDays.includes(today)?today:visibleDays[0]!):anchor;setSubject("");setStarts(`${day}T09:00`);setEnds(`${day}T10:00`);setError("");setPending(false);setCreateOpen(true)}
 async function create(acknowledgeConflict=false){setBusy(true);setError("");try{const startCandidates=resolveLocalDateTime(starts,timeZone),endCandidates=resolveLocalDateTime(ends,timeZone);if(startCandidates.length!==1||endCandidates.length!==1)throw new Error("ambiguous_local_time");const row=await crmRequest<Detail>("/api/crm/appointments",{method:"POST",body:JSON.stringify({operationKey:crypto.randomUUID(),calendarRevision,subject,startsAt:startCandidates[0]!.instant,endsAt:endCandidates[0]!.instant,participantMembershipIds:[],reminderEnabled:true,reminderOffsetMinutes:15,acknowledgeConflict})});setRows(old=>[...old.filter(item=>item.id!==row.id),row].sort((a,b)=>a.startsAt.localeCompare(b.startsAt)));setCreateOpen(false);setPending(false)}catch(reason){if(reason instanceof Error&&reason.message==="409"){setPending(true);setError(copy.conflict)}else setError(copy.errors)}finally{setBusy(false)}}
 async function command(row:Row,action:"complete"|"cancel"){const reason=action==="cancel"?window.prompt(copy.reason)?.trim():undefined;if(action==="cancel"&&!reason)return;setBusy(true);setError("");try{const next=await crmRequest<Detail>(`/api/crm/appointments/${row.id}`,{method:"PATCH",body:JSON.stringify({action,...reason?{reason}:{},operationKey:crypto.randomUUID(),expectedRevision:row.revision})});setRows(old=>old.map(item=>item.id===row.id?next:item));setSelected(next)}catch{setError(copy.errors)}finally{setBusy(false)}}
 return <section aria-busy={loading} className="w-full overflow-hidden rounded-xl border bg-background shadow-sm">
  <header className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5"><div><h1 className="text-lg font-semibold">{copy.appointments}</h1><p className="mt-0.5 text-xs text-muted-foreground">{copy.calendarSubtitle}</p></div><Button onClick={openCreate}><Plus data-icon="inline-start"/>{copy.newAppointment}</Button></header>
  <div className="grid gap-3 border-b px-4 py-3 md:grid-cols-[1fr_auto_1fr] md:items-center"><label className="flex items-center gap-2 text-xs font-medium"><span>{copy.assignment}</span><select aria-label={copy.assignment} value={scope} onChange={event=>setScope(event.target.value as Scope)} className="h-8 rounded-md border bg-background px-2 text-xs"><option value="mine">{copy.mine}</option><option value="all">{copy.all}</option></select><span role="status" className="font-normal text-muted-foreground">{loading?copy.loading:""}</span></label><div className="flex flex-wrap items-center justify-center gap-2"><div className="inline-flex rounded-md bg-muted p-0.5" aria-label={copy.calendarView}>{(["day","week","month"] as View[]).map(item=><button key={item} type="button" aria-pressed={view===item} onClick={()=>setView(item)} className={cn("rounded px-3 py-1.5 text-xs text-muted-foreground transition",view===item&&"bg-background font-medium text-foreground shadow-sm")}>{copy[item]}</button>)}</div><Button type="button" size="icon-sm" variant="ghost" aria-label={copy.previousPeriod} onClick={()=>setAnchor(value=>moveAnchor(view,value,-1))}><ChevronLeft/></Button><p className="min-w-44 text-center text-xs font-semibold capitalize">{periodLabel(view,anchor,locale)}</p><Button type="button" size="icon-sm" variant="ghost" aria-label={copy.nextPeriod} onClick={()=>setAnchor(value=>moveAnchor(view,value,1))}><ChevronRight/></Button></div><div className="flex justify-end"><Button type="button" variant="outline" size="sm" onClick={()=>setAnchor(today)}><CalendarDays data-icon="inline-start"/>{copy.today}</Button></div></div>
  <div className="relative">{view==="month"?<MonthGrid rows={rows} anchor={anchor} locale={locale} timeZone={timeZone} today={today} onSelect={setSelected}/>:<TimeGrid days={visibleDays} rows={rows} locale={locale} timeZone={timeZone} today={today} onSelect={setSelected}/>}</div>
  <footer className="sticky bottom-0 z-20 flex flex-wrap items-center justify-center gap-5 border-t bg-background/95 px-4 py-3 text-[11px] text-muted-foreground backdrop-blur">{(["scheduled","completed","cancelled"] as const).map(status=><span key={status} className="flex items-center gap-1.5"><span className={cn("size-2.5 rounded-full",statusStyle[status].dot)}/>{copy[status]}</span>)}</footer>
  <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent closeLabel={copy.cancel}><DialogHeader><DialogTitle>{copy.newAppointment}</DialogTitle><DialogDescription>{copy.createAppointmentDescription}</DialogDescription></DialogHeader><form className="grid gap-4" onSubmit={event=>{event.preventDefault();void create(false)}}><label className="space-y-1.5 text-sm">{copy.subject}<Input required autoFocus value={subject} onChange={event=>setSubject(event.target.value)}/></label><div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1.5 text-sm">{copy.startsAt}<Input required type="datetime-local" value={starts} onChange={event=>setStarts(event.target.value)}/></label><label className="space-y-1.5 text-sm">{copy.endsAt}<Input required type="datetime-local" value={ends} onChange={event=>setEnds(event.target.value)}/></label></div>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter><Button type="button" variant="outline" onClick={()=>setCreateOpen(false)}>{copy.cancel}</Button>{pending&&<Button type="button" variant="outline" disabled={busy} onClick={()=>void create(true)}>{copy.allowConflict}</Button>}<Button disabled={busy}>{copy.create}</Button></DialogFooter></form></DialogContent></Dialog>
  <Dialog open={Boolean(selected)} onOpenChange={open=>{if(!open)setSelected(null)}}><DialogContent closeLabel={copy.cancel}>{selected&&<><DialogHeader><DialogTitle>{selected.subject}</DialogTitle><DialogDescription>{copy.appointmentDetails}</DialogDescription></DialogHeader><dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm"><dt className="text-muted-foreground">{copy.startsAt}</dt><dd>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone}).format(new Date(selected.startsAt))}</dd><dt className="text-muted-foreground">{copy.endsAt}</dt><dd>{new Intl.DateTimeFormat(locale,{dateStyle:"medium",timeStyle:"short",timeZone}).format(new Date(selected.endsAt))}</dd><dt className="text-muted-foreground">{copy.status}</dt><dd className="flex items-center gap-2"><span className={cn("size-2.5 rounded-full",statusStyle[selected.status].dot)}/>{copy[selected.status]}</dd></dl>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}{selected.status==="scheduled"&&<DialogFooter><Button variant="outline" disabled={busy} onClick={()=>void command(selected,"cancel")}>{copy.cancel}</Button><Button disabled={busy} onClick={()=>void command(selected,"complete")}>{copy.complete}</Button></DialogFooter>}</>}</DialogContent></Dialog>
 </section>
}
