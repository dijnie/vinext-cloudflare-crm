"use client";
import { useEffect, useState } from "react";
import type { EntityType } from "@/lib/listing/list-state";
import { DEFAULT_LAYOUT_KEYS } from "@/lib/services/layouts/layout-catalog";
import { layoutIdentity, type LayoutSettings, type LayoutSurface } from "@/lib/services/layouts/layout-contracts";
import { crmRequest } from "../record-types";

export function visibleLayoutFields(layout: LayoutSettings, surface: LayoutSurface) {
  const fields = layout.fields.filter(field => field.surfaces.includes(surface) && (field.visible || surface === "create" && field.required));
  if (layout.configured) return fields;
  const defaults = DEFAULT_LAYOUT_KEYS[layout.entity][surface];
  const order = fields.map(layoutIdentity);
  return [...fields].sort((a, b) => {
    const position = (field: typeof a) => field.kind === "builtin" ? defaults.indexOf(field.key) : defaults.length + order.indexOf(layoutIdentity(field));
    return position(a) - position(b);
  });
}
export function useRecordLayout(entity: EntityType, initialLayout?: LayoutSettings) {
  const [layout, setLayout] = useState<LayoutSettings | null>(() => initialLayout?.entity === entity ? initialLayout : null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (revision === 0 && initialLayout?.entity === entity) { setLayout(initialLayout); setError(false); return; }
    const controller = new AbortController(); setLayout(previous => previous?.entity === entity ? previous : null); setError(false);
    void crmRequest<LayoutSettings>(`/api/crm/layouts?entity=${entity}`, { signal: controller.signal }).then(data => { if (!controller.signal.aborted) setLayout(data); }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [entity, initialLayout, revision]);
  return { layout, error, reload: () => setRevision(value => value + 1) };
}
