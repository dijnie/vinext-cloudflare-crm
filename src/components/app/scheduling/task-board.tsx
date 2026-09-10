"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { AppLocale } from "@/lib/i18n/config";
import { getSchedulingDictionary } from "@/lib/i18n/scheduling-dictionary";
import type { z } from "zod";
import type {
  taskListOutputSchema,
  taskDetailOutputSchema,
} from "@/lib/services/tasks/task-contract";
import { crmRequest } from "../record-types";
type Row = z.infer<typeof taskListOutputSchema>["rows"][number];
type Detail = z.infer<typeof taskDetailOutputSchema>;
export function TaskBoard({
  locale,
  initialData,
}: {
  locale: AppLocale;
  initialData: { rows: Row[] };
}) {
  const copy = getSchedulingDictionary(locale),
    [rows, setRows] = useState(initialData.rows),
    [busy, setBusy] = useState<string>(),
    [error, setError] = useState("");
  async function act(row: Row) {
    const reason = row.completedAt
      ? window.prompt(copy.reason)?.trim()
      : undefined;
    if (row.completedAt && !reason) return;
    setBusy(row.id);
    setError("");
    try {
      const next = await crmRequest<Detail>(`/api/crm/tasks/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          action: row.completedAt ? "reopen" : "complete",
          operationKey: crypto.randomUUID(),
          expectedRevision: row.revision,
          ...(reason ? { reason } : {}),
        }),
      });
      setRows((old) => old.map((x) => (x.id === row.id ? next : x)));
    } catch {
      setError(copy.errors);
    } finally {
      setBusy(undefined);
    }
  }
  const time = (v: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(v));
  return (
    <section className="crm-page">
      <header className="crm-page-header">
        <h1 className="crm-page-title">{copy.tasks}</h1>
      </header>
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li
            key={row.id}
            className="space-y-3 rounded-xl border bg-card p-5 shadow-xs"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="font-medium">{row.subject}</h2>
              <span
                className={
                  row.overdue
                    ? "text-sm text-destructive"
                    : "text-sm text-muted-foreground"
                }
              >
                {row.completedAt
                  ? copy.completed
                  : row.overdue
                    ? copy.overdue
                    : copy.open}
              </span>
            </div>
            {row.content && (
              <p className="whitespace-pre-wrap text-sm">{row.content}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {copy.assignee}: {row.assigneeName ?? "—"}
              {row.dueAt ? ` · ${copy.dueAt}: ${time(row.dueAt)}` : ""}
              {row.overdueBreached ? ` · ${copy.lateHistory}` : ""}
            </p>
            <Button
              size="sm"
              variant="outline"
              disabled={Boolean(busy)}
              onClick={() => void act(row)}
            >
              {busy === row.id
                ? copy.loading
                : row.completedAt
                  ? copy.reopen
                  : copy.complete}
            </Button>
          </li>
        ))}
      </ul>
      {!rows.length && <p className="text-muted-foreground">{copy.noItems}</p>}
    </section>
  );
}
