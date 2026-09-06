"use client";

import { useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { localDateTime, resolveLocalDateTime } from "@/lib/services/custom-fields/field-datetime";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import { FormSelect } from "../record-sheet/form-select";

export function FieldDateTimeEditor({ id, value, timeZone, labels, onChange, required, disabled }: { id: string; value: string | null; timeZone: string; labels: CrmDictionary; onChange: (value: string | null) => void; required?: boolean; disabled?: boolean }) {
  const [draft, setDraft] = useState(() => value ? localDateTime(value, timeZone) : "");
  const [candidates, setCandidates] = useState(() => value ? resolveLocalDateTime(localDateTime(value, timeZone), timeZone) : []);
  const [chosen, setChosen] = useState(() => value ? new Date(value).toISOString() : "");
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function invalid(message: string) { setError(message); input.current?.setCustomValidity(message); }
  function change(local: string) {
    setDraft(local); setChosen(""); setCandidates([]);
    if (!local) { invalid(""); onChange(null); return; }
    try {
      const next = resolveLocalDateTime(local, timeZone); setCandidates(next);
      if (!next.length) { invalid(labels.custom.dateTimeGap); return; }
      if (next.length > 1) { invalid(labels.custom.dateTimeOverlap); return; }
      invalid(""); setChosen(next[0]!.instant); onChange(next[0]!.instant);
    } catch { invalid(labels.custom.dateTimeInvalid); }
  }
  return <div className="space-y-2"><Input ref={input} id={id} type="datetime-local" step="0.001" required={required} disabled={disabled} value={draft} aria-invalid={Boolean(error) || undefined} aria-describedby={`${id}-zone${error ? ` ${id}-error` : ""}`} onChange={event => change(event.currentTarget.value)} /><p id={`${id}-zone`} className="break-words text-xs text-muted-foreground">{labels.custom.timeZone}: {timeZone}</p>
    {candidates.length > 1 && <label className="block space-y-1 text-xs">{labels.custom.dateTimeOffset}<FormSelect id={`${id}-offset`} required disabled={disabled} value={chosen} placeholder={labels.custom.chooseOffset} onValueChange={instant => { setChosen(instant); invalid(""); onChange(instant); }} options={candidates.map(candidate => ({ value: candidate.instant, label: candidate.offset }))} /></label>}
    {error && <p id={`${id}-error`} role="alert" className="text-xs text-destructive">{error}</p>}
  </div>;
}
