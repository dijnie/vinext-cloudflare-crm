"use client";
import { useEffect, useState } from "react";
import type { AppLocale } from "@/lib/i18n/config";
import { getLeadDictionary } from "@/lib/i18n/lead-dictionary";
import { getCrmDictionary } from "@/lib/i18n/crm-dictionary";
import { crmRequest, recordName, type CrmRecord } from "../record-types";
import { RecordLink } from "../record-sheet/record-link";
import { Button } from "@/components/ui/button";
export function LeadDuplicateSuggestions({ email, phone, id, locale }: { email: string; phone: string; id?: string; locale: AppLocale }) {
  const [result, setResult] = useState<{ leads: CrmRecord[]; contacts: CrmRecord[] }>(); const [error, setError] = useState(false); const [revision, setRevision] = useState(0);
  const labels = getLeadDictionary(locale), crm = getCrmDictionary(locale);
  useEffect(() => {
    setResult(undefined); setError(false); if (!email && !phone) return;
    const controller = new AbortController(); const timer = setTimeout(() => {
      const query = new URLSearchParams({ email, phone, ...(id ? { excludeLeadId: id } : {}) });
      void crmRequest<{ leads: CrmRecord[]; contacts: CrmRecord[] }>(`/api/crm/leads/duplicates?${query}`, { signal: controller.signal }).then(value => { if (!controller.signal.aborted) setResult(value); }).catch(() => { if (!controller.signal.aborted) setError(true); });
    }, 300); return () => { clearTimeout(timer); controller.abort(); };
  }, [email, phone, id, revision]);
  if (error) return <p role="alert" className="text-sm">{crm.error}<Button type="button" variant="outline" onClick={() => setRevision(value => value + 1)}>{crm.retry}</Button></p>;
  if (!result || !result.leads.length && !result.contacts.length) return null;
  return <aside className="space-y-2 rounded-md border p-3"><h3 className="text-sm font-medium">{labels.duplicates}</h3><p className="text-xs text-muted-foreground">{labels.duplicateHelp}</p><ul className="space-y-1 text-sm">{(["leads", "contacts"] as const).flatMap(kind => result[kind].map(row => <li key={`${kind}:${row.id}`}><RecordLink entity={kind === "leads" ? "lead" : "contact"} id={row.id}>{recordName(row)}</RecordLink> · {String(row.email ?? row.phone ?? "")}</li>))}</ul></aside>;
}
