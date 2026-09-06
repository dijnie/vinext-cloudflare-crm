"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MAX_FILE_BYTES, MAX_FIELD_FILES } from "@/lib/services/files/file-contracts";
import type { EntityType } from "@/lib/listing/list-state";
import type { FieldDefinition, FieldValue } from "@/lib/services/custom-fields/field-contracts";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";

export type FileFieldContext = { entity: EntityType; recordId: string };
type FileMetadata = { id: string; name: string; size: number; uploadedAt: string };

export function FileFieldEditor({ id, field, value, onChange, labels, disabled, context }: {
  id: string; field: FieldDefinition; value: FieldValue; onChange: (value: FieldValue) => void;
  labels: CrmDictionary; disabled?: boolean; context?: FileFieldContext;
}) {
  const ids = Array.isArray(value) ? value : [];
  const [metadata, setMetadata] = useState<Record<string, FileMetadata | null>>({});
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const upload = useRef<AbortController | null>(null);
  const idsKey = JSON.stringify(ids);
  useEffect(() => () => upload.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    for (const attachmentId of JSON.parse(idsKey) as string[]) {
      if (Object.hasOwn(metadata, attachmentId)) continue;
      void fetch(`/api/crm/files/${encodeURIComponent(attachmentId)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
        .then(async response => { if (!response.ok) throw new Error(); return await response.json() as FileMetadata; })
        .then(file => setMetadata(previous => ({ ...previous, [attachmentId]: file })))
        .catch(() => { if (!controller.signal.aborted) setMetadata(previous => ({ ...previous, [attachmentId]: null })); });
    }
    return () => controller.abort();
    // Metadata is a cache; only selection changes require a new request.
  }, [idsKey]);
  const validity = uploading ? labels.custom.fileUploading : error || (field.required && !ids.length ? labels.custom.fileRequired : "");
  useEffect(() => { input.current?.setCustomValidity(validity); }, [validity]);

  async function uploadFiles(files: File[]) {
    if (!context || disabled || upload.current || !files.length) return;
    if (ids.length + files.length > MAX_FIELD_FILES || files.some(file => file.size > MAX_FILE_BYTES)) { setError(labels.custom.fileLimit); return; }
    const controller = new AbortController(); upload.current = controller;
    setError(""); setUploading(true);
    input.current?.setCustomValidity(labels.custom.fileUploading);
    try {
      const uploaded: FileMetadata[] = [];
      for (const file of files) {
        const query = new URLSearchParams({ ...context, fieldId: field.id });
        const response = await fetch(`/api/crm/files?${query}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) }, body: file, signal: controller.signal });
        if (!response.ok) throw new Error();
        const ready = await response.json() as FileMetadata;
        uploaded.push(ready);
        if (!controller.signal.aborted) {
          setMetadata(previous => ({ ...previous, [ready.id]: ready }));
          onChange([...ids, ...uploaded.map(file => file.id)]);
        }
      }
    } catch { if (!controller.signal.aborted) setError(labels.custom.fileError); }
    finally { upload.current = null; if (!controller.signal.aborted) setUploading(false); }
  }

  return <div className="min-w-0 space-y-2" aria-busy={uploading}>
    <Input ref={input} id={id} type="file" multiple disabled={disabled || !context} aria-disabled={uploading || undefined} aria-invalid={Boolean(validity) || undefined} aria-describedby={`${id}-help${error ? ` ${id}-error` : ""}`} className="min-w-0 w-full text-xs" onClick={event => { if (uploading) event.preventDefault(); }} onChange={event => { const files = Array.from(event.currentTarget.files ?? []); event.currentTarget.value = ""; void uploadFiles(files); }} />
    <p id={`${id}-help`} className="text-xs text-muted-foreground">{context ? labels.custom.fileHelp : labels.custom.fileContextMissing}</p>
    {uploading && <p role="status" className="text-xs">{labels.custom.fileUploading}</p>}
    {error && <div id={`${id}-error`} role="alert" className="space-y-1 text-xs text-destructive"><p>{error}</p><Button type="button" variant="outline" size="sm" disabled={disabled || uploading} onClick={() => setError("")}>{labels.custom.fileDismiss}</Button></div>}
    {ids.length > 0 && <ul className="space-y-2">{ids.map(attachmentId => {
      const file = metadata[attachmentId];
      return <li key={attachmentId} className="min-w-0 rounded-md border p-2 text-xs">
        <p className="break-all font-medium">{file?.name ?? (Object.hasOwn(metadata, attachmentId) ? labels.custom.fileUnavailable : labels.loading)}</p>
        {file && <p className="text-muted-foreground">{(file.size / 1024).toFixed(1)} KiB</p>}
        <details className="mt-1 text-muted-foreground"><summary className="cursor-pointer">{labels.custom.fileId}</summary><p className="select-all break-all">{attachmentId}</p></details>
        <div className="mt-1 flex flex-wrap items-center gap-2">{file && <a className="rounded-sm text-primary underline focus-visible:outline focus-visible:outline-2" href={`/api/crm/files/${encodeURIComponent(attachmentId)}/download`} download={file.name}>{labels.custom.fileDownload}</a>}<Button type="button" variant="ghost" size="sm" disabled={disabled || uploading} aria-label={`${labels.custom.fileRemove}: ${file?.name ?? attachmentId}`} onClick={() => onChange(ids.filter(item => item !== attachmentId))}>{labels.custom.fileRemove}</Button></div>
      </li>;
    })}</ul>}
  </div>;
}
