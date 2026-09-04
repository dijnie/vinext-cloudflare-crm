"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef } from "react";

interface CompanyListProps {
  companies: Array<{ id: string; name: string }>;
  labels: { empty: string; open: string; close: string };
}

export function CompanyList({ companies, labels }: CompanyListProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedId = searchParams.get("record");
  const selected = companies.find((company) => company.id === selectedId);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const openButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousSelectedId = useRef<string | null>(null);

  useEffect(() => {
    if (selectedId) {
      closeButtonRef.current?.focus();
    } else if (previousSelectedId.current) {
      openButtonRefs.current.get(previousSelectedId.current)?.focus();
    }
    previousSelectedId.current = selectedId;
  }, [selectedId]);

  function setRecord(recordId?: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (recordId) next.set("record", recordId);
    else next.delete("record");
    const query = next.toString();
    router.push(query ? `?${query}` : "?");
  }

  if (companies.length === 0) return <p>{labels.empty}</p>;

  return (
    <div className="grid gap-4 md:grid-cols-[1fr_20rem]">
      <ul className="space-y-2">
        {companies.map((company) => (
          <li className="rounded border p-4" key={company.id}>
            <span>{company.name}</span>{" "}
            <button
              aria-controls="company-detail-sheet"
              aria-expanded={selectedId === company.id}
              className="underline"
              onClick={() => setRecord(company.id)}
              ref={(element) => {
                if (element) openButtonRefs.current.set(company.id, element);
                else openButtonRefs.current.delete(company.id);
              }}
              type="button"
            >
              {labels.open}
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <aside
          aria-labelledby="company-detail-title"
          className="rounded border p-4"
          id="company-detail-sheet"
          onKeyDown={(event) => {
            if (event.key === "Escape") setRecord();
          }}
          role="dialog"
        >
          <h2 className="font-semibold" id="company-detail-title">
            {selected.name}
          </h2>
          <button
            className="mt-4 underline"
            onClick={() => setRecord()}
            ref={closeButtonRef}
            type="button"
          >
            {labels.close}
          </button>
        </aside>
      ) : null}
    </div>
  );
}
