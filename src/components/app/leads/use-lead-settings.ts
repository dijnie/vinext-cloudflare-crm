"use client";
import { useEffect, useState } from "react";
import type { LeadSettings } from "@/lib/services/leads/lead-settings-contract";
import { crmRequest } from "../record-types";
export function useLeadSettings(enabled = true) {
  const [data, setData] = useState<LeadSettings>();
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const load = () => { void crmRequest<LeadSettings>("/api/crm/lead-settings", { signal: controller.signal }).then(value => { if (!controller.signal.aborted) { setData(value); setError(false); } }).catch(() => { if (!controller.signal.aborted) setError(true); }); };
    load(); window.addEventListener("crm:invalidate", load); window.addEventListener("focus", load);
    return () => { controller.abort(); window.removeEventListener("crm:invalidate", load); window.removeEventListener("focus", load); };
  }, [enabled, revision]);
  return { data, error, reload: () => setRevision(value => value + 1) };
}
