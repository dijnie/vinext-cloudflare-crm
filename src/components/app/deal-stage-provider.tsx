"use client";
import { Button } from "@/components/ui/button";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { DealStageCatalog } from "@/lib/services/deals/deal-stage-contracts";
import type { AppLocale } from "@/lib/i18n/config";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { getDealStageDictionary } from "@/lib/i18n/deal-stage-dictionary";
import { crmRequest } from "./record-types";
const Context = createContext<{ catalog: DealStageCatalog; locale: AppLocale; unavailable: boolean; refresh: () => void } | null>(null);
export function DealStageProvider({ initialCatalog, locale, children }: { initialCatalog: DealStageCatalog; locale: AppLocale; children: ReactNode }) {
  const [catalog, setCatalog] = useState(initialCatalog); const [unavailable, setUnavailable] = useState(false);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => { setCatalog(initialCatalog); setUnavailable(false); }, [initialCatalog]);
  const refresh = useCallback(() => { controller.current?.abort(); const next = new AbortController(); controller.current = next; void crmRequest<DealStageCatalog>("/api/crm/deal-stages", { signal: next.signal }).then(value => { if (!next.signal.aborted) { setCatalog(value); setUnavailable(false); } }).catch(() => { if (!next.signal.aborted) setUnavailable(true); }); }, []);
  useEffect(() => { const invalidate = (event: Event) => { if ((event as CustomEvent<{ kind: string }>).detail?.kind === "stages") refresh(); }; window.addEventListener("crm:invalidate", invalidate); window.addEventListener("focus", refresh); return () => { controller.current?.abort(); window.removeEventListener("crm:invalidate", invalidate); window.removeEventListener("focus", refresh); }; }, [refresh]);
  return <Context.Provider value={{ catalog, locale, unavailable, refresh }}>{children}</Context.Provider>;
}
export function useDealStages() {
  const context = useContext(Context); const legacy = getCrmDictionary(context?.locale ?? "en").stages;
  const all = context?.catalog.stages ?? [];
  const label = (id: string) => all.find(stage => stage.id === id)?.label ?? legacy[id as keyof typeof legacy] ?? id;
  const options = (current?: string) => all.filter(stage => !stage.archivedAt || stage.id === current).map(stage => ({ value: stage.id, label: `${label(stage.id)}${stage.archivedAt ? ` · ${getCrmDictionary(context?.locale ?? "en").archived}` : ""}`, disabled: Boolean(stage.archivedAt) }));
  return { all, label, options, unavailable: context?.unavailable ?? true, refresh: context?.refresh ?? (() => {}), defaultStageId: context?.catalog.defaultStageId ?? "demo-booked", labels: getDealStageDictionary(context?.locale ?? "en") };
}

export function DealStageRefreshStatus() {
  const stages = useDealStages();
  return stages.unavailable ? <div role="alert" className="mb-3 rounded-md border p-3 text-sm">{stages.labels.unavailable}<Button className="ml-2" type="button" variant="outline" size="sm" onClick={stages.refresh}>{stages.labels.reload}</Button></div> : null;
}
