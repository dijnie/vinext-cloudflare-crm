"use client";
import { useModules } from "../module-provider";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { FIELD_TYPES, type FieldDefinition, type FieldType } from "@/lib/services/custom-fields/field-contracts";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { FormSelect } from "../record-sheet/form-select";

type Preview = { token: string | null; total: number; convertible: number; rejected: number; reasons: string[]; examples: { recordId: string; reason: string }[] };
export function FieldConversionDialog({ field, labels, onClose, onConverted }: { field: FieldDefinition; labels: CrmDictionary; onClose: () => void; onConverted: () => void }) {
  const { isEnabled } = useModules();
  const moduleEnabled = isEnabled(field.entity);
  const [type, setType] = useState<FieldType>(field.type === "number" ? "rating" : field.type === "text" ? "long_text" : "text");
  const [ratingMax, setRatingMax] = useState(5);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [stale, setStale] = useState(false);
  const mounted = useRef(true);
  const pending = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (error) alert.current?.focus(); }, [error]);
  function resetPreview() { setPreview(null); setError(""); setStale(false); }
  async function request(action: "preview" | "apply") {
    if (pending.current || action === "apply" && (!preview?.token || !moduleEnabled)) return;
    pending.current = true; setBusy(true); setError("");
    try {
      const response = await fetch(`/api/crm/fields/${encodeURIComponent(field.id)}/conversion`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "apply" ? { action, token: preview!.token } : { action, type, ...(type === "rating" ? { config: { ratingMax } } : {}) }) });
      if (!response.ok) throw new Error(String(response.status));
      const result = await response.json();
      if (!mounted.current) return;
      if (action === "apply") onConverted();
      else { setPreview(result as Preview); setStale(false); }
    } catch (reason) {
      if (!mounted.current) return;
      if (reason instanceof Error && reason.message === "409") { setPreview(null); setStale(true); setError(labels.custom.conversionStale); }
      else setError(reason instanceof Error && reason.message === "400" ? labels.invalid : labels.error);
    } finally { pending.current = false; if (mounted.current) setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose(); }}><DialogContent closeLabel={labels.close} showCloseButton={!busy} className="max-h-[90svh] overflow-y-auto"><DialogTitle>{labels.custom.convert} · {field.label}</DialogTitle><DialogDescription>{labels.custom.conversionHelp}</DialogDescription>
    <form className="space-y-4" onSubmit={event => { event.preventDefault(); void request("preview"); }} aria-busy={busy}>
      <p className="text-xs text-muted-foreground">{labels.custom.type}: {labels.custom.types[field.type]}</p>
      <label className="block space-y-1 text-sm">{labels.custom.targetType}<FormSelect id="conversion-target-type" value={type} disabled={busy} onValueChange={value => { setType(value as FieldType); resetPreview(); }} options={FIELD_TYPES.map(value => ({ value, label: labels.custom.types[value], disabled: value === field.type }))} /></label>
      {type === "rating" && <label className="block space-y-1 text-sm">{labels.custom.ratingMax}<Input required type="number" min={1} max={10} step={1} value={ratingMax} disabled={busy} onChange={event => { setRatingMax(Number(event.currentTarget.value)); resetPreview(); }} /></label>}
      {error && <p ref={alert} tabIndex={-1} role="alert" className="text-xs text-destructive">{error}</p>}
      {preview && <section aria-label={labels.custom.conversionPreview} className="space-y-3 rounded-lg border p-3"><dl className="grid grid-cols-3 gap-2 text-xs"><div><dt>{labels.custom.conversionTotal}</dt><dd className="text-lg tabular-nums">{preview.total}</dd></div><div><dt>{labels.custom.conversionReady}</dt><dd className="text-lg tabular-nums">{preview.convertible}</dd></div><div><dt>{labels.custom.conversionRejected}</dt><dd className="text-lg tabular-nums">{preview.rejected}</dd></div></dl>{preview.reasons.length > 0 && <ul role="alert" className="space-y-1 text-xs text-destructive">{preview.reasons.map(reason => <li key={reason}>{labels.custom.conversionReasons[reason as keyof typeof labels.custom.conversionReasons] ?? labels.invalid}</li>)}</ul>}</section>}
      <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>{labels.cancel}</Button><Button type="submit" variant="outline" disabled={busy}>{busy ? labels.loading : stale ? labels.custom.refreshPreview : labels.custom.conversionPreview}</Button><Button type="button" disabled={busy || !moduleEnabled || !preview?.token || preview.rejected > 0} onClick={() => void request("apply")}>{labels.custom.applyConversion}</Button></div>
    </form>
  </DialogContent></Dialog>;
}
