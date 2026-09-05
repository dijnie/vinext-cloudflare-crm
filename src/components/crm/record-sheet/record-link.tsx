"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { changeListState, type EntityType } from "@/modules/crm/list-state";

export function RecordLink({ entity, id, children }: { entity: EntityType; id: string; children: ReactNode }) {
  const pathname = usePathname();
  const search = useSearchParams();
  return <Link className="font-medium text-primary underline-offset-4 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring" href={`${pathname}?${changeListState(new URLSearchParams(search.toString()), { recordType: entity, recordId: id, tab: "details" })}`} scroll={false} data-record-link={id} onClick={(event) => {
    if (!search.get("recordId") && !event.metaKey && !event.ctrlKey) window.dispatchEvent(new CustomEvent("crm:record-trigger", { detail: event.currentTarget }));
  }}>{children}</Link>;
}
