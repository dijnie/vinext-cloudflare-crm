"use client";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { ModuleSettings } from "@/lib/services/modules/module-contracts";
import type { EntityType } from "@/lib/listing/list-state";
import { getModuleDictionary } from "@/lib/i18n/module-dictionary";
import type { AppLocale } from "@/lib/i18n/config";
import { crmRequest } from "./record-types";

const ModuleContext = createContext<{ settings: ModuleSettings; unavailable: boolean; locale: AppLocale } | null>(null);
export function ModuleProvider({ initialSettings, locale, children }: { initialSettings: ModuleSettings; locale: AppLocale; children: ReactNode }) {
  const [settings, setSettings] = useState(initialSettings);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { setSettings(initialSettings); setUnavailable(false); }, [initialSettings]);
  useEffect(() => {
    let controller: AbortController | undefined;
    const refresh = () => {
      controller?.abort(); controller = new AbortController(); const current = controller;
      void crmRequest<ModuleSettings>("/api/crm/modules", { signal: current.signal }).then(next => { if (!current.signal.aborted) { setSettings(next); setUnavailable(false); } }).catch(() => { if (!current.signal.aborted) setUnavailable(true); });
    };
    const invalidate = (event: Event) => { if ((event as CustomEvent<{ kind: string }>).detail?.kind === "modules") refresh(); };
    window.addEventListener("crm:invalidate", invalidate); window.addEventListener("focus", refresh);
    return () => { controller?.abort(); window.removeEventListener("crm:invalidate", invalidate); window.removeEventListener("focus", refresh); };
  }, []);
  return <ModuleContext.Provider value={{ settings, unavailable, locale }}>{children}</ModuleContext.Provider>;
}
export function useModules() {
  const context = useContext(ModuleContext);
  const isEnabled = (entity: EntityType | undefined) => Boolean(entity && context && !context.unavailable && context.settings.modules.find(module => module.entity === entity)?.enabled);
  return { isEnabled, labels: getModuleDictionary(context?.locale ?? "en"), unavailable: context?.unavailable ?? true };
}
export function ModuleReadOnlyBanner({ entity }: { entity: EntityType }) {
  const { isEnabled, labels, unavailable } = useModules();
  return isEnabled(entity) ? null : <p role="status" className="rounded-md border bg-muted/40 px-4 py-3 text-sm">{unavailable ? labels.error : labels.readOnly}</p>;
}
