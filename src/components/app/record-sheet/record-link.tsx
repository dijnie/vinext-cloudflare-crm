"use client";
import { pushListQuery } from "../list-navigation";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { changeListState, type EntityType } from "@/lib/listing/list-state";

export function RecordLink({ entity, id, children }: { entity: EntityType; id: string; children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <a className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" href={`${pathname}?${changeListState(new URLSearchParams(search.toString()), { recordType: entity, recordId: id, tab: "details" })}`} data-record-link={id} onClick={(event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.currentTarget.target && event.currentTarget.target !== "_self")) return;
    event.preventDefault();
    if (!search.get("recordId")) window.dispatchEvent(new CustomEvent("crm:record-trigger", { detail: event.currentTarget }));
    const parent = window.location.href;
    const previous = window.history.state?.crmRecordTrail;
    const trail = Array.isArray(previous) ? previous.filter((value: unknown): value is { href: string; position: number } => Boolean(value) && typeof value === "object" && typeof (value as { href?: unknown }).href === "string" && Number.isInteger((value as { position?: unknown }).position)) : [];
    const position = Number.isInteger(window.history.state?.crmRecordPosition) ? window.history.state.crmRecordPosition as number : 0;
    const nested = Boolean(search.get("recordId") && (search.get("recordId") !== id || search.get("recordType") !== entity));
    pushListQuery(event.currentTarget.href);
    if (nested) {
      window.history.replaceState({ ...window.history.state, crmRecordPosition: position + 1, crmRecordTrail: [...trail, { href: parent, position }] }, "", window.location.href);
      window.dispatchEvent(new Event("crm:record-nested"));
    } else if (!search.get("recordId")) {
      window.history.replaceState({ ...window.history.state, crmRecordPosition: 0, crmRecordTrail: [] }, "", window.location.href);
      window.dispatchEvent(new Event("crm:record-nested"));
    }

  }}>{children}</a>;
}
