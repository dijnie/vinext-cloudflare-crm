"use client";
import { pushListQuery } from "../list-navigation";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { changeListState, type EntityType } from "@/modules/crm/list-state";

export function RecordLink({ entity, id, children }: { entity: EntityType; id: string; children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <a className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" href={`${pathname}?${changeListState(new URLSearchParams(search.toString()), { recordType: entity, recordId: id, tab: "details" })}`} data-record-link={id} onClick={(event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || (event.currentTarget.target && event.currentTarget.target !== "_self")) return;
    event.preventDefault();
    if (!search.get("recordId")) window.dispatchEvent(new CustomEvent("crm:record-trigger", { detail: event.currentTarget }));
    pushListQuery(event.currentTarget.href);
  }}>{children}</a>;
}
