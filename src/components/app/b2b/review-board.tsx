"use client";
import { useState } from "react";
import type { z } from "zod";
import type {
  reviewListOutputSchema,
  reviewRowSchema,
} from "@/lib/services/reviews/review-contracts";
import type { AppLocale } from "@/lib/i18n/config";
import { getB2bDictionary } from "@/lib/i18n/b2b-dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModuleReadOnlyBanner, useModules } from "../module-provider";
import { crmRequest } from "../record-types";
type Row = z.infer<typeof reviewRowSchema>;
type Choice = { id: string; name: string };
export function ReviewBoard({
  locale,
  initialData,
  companies,
  contacts,
}: {
  locale: AppLocale;
  initialData: z.infer<typeof reviewListOutputSchema>;
  companies: Choice[];
  contacts: Choice[];
}) {
  const c = getB2bDictionary(locale),
    modules = useModules(),
    enabled = modules.isEnabled("review"),
    choices = [
      ...companies.map((x) => ({
        ...x,
        value: `company:${x.id}`,
        kind: c.company,
      })),
      ...contacts.map((x) => ({
        ...x,
        value: `contact:${x.id}`,
        kind: c.contact,
      })),
    ];
  const [rows, setRows] = useState(initialData.rows),
    [customer, setCustomer] = useState(choices[0]?.value ?? ""),
    [content, setContent] = useState(""),
    [rating, setRating] = useState(5),
    [tags, setTags] = useState(""),
    [showArchived, setShowArchived] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function reload(archived: boolean) {
    setBusy(true);
    try {
      const next = await crmRequest<z.infer<typeof reviewListOutputSchema>>(
        `/api/crm/reviews?archived=${archived}`,
      );
      setRows(next.rows);
      setShowArchived(archived);
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    const [kind, id] = customer.split(":");
    setBusy(true);
    setError("");
    try {
      const row = await crmRequest<Row>("/api/crm/reviews", {
        method: "POST",
        body: JSON.stringify({
          source: "manual",
          eventId: crypto.randomUUID(),
          ...(kind === "contact" ? { contactId: id } : { companyId: id }),
          content,
          rating,
          tags: tags
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      });
      setRows((items) => [row, ...items]);
      setContent("");
      setTags("");
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }
  async function update(row: Row, changes: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const next = await crmRequest<Row>(`/api/crm/reviews/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({ expectedRevision: row.revision, ...changes }),
      });
      if ("archived" in changes)
        setRows((items) => items.filter((item) => item.id !== row.id));
      else
        setRows((items) =>
          items.map((item) => (item.id === next.id ? next : item)),
        );
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }
  async function edit(row: Row) {
    const next = window.prompt(c.content, row.content);
    if (!next) return;
    const nextRating = window.prompt(c.rating, row.rating.toString());
    if (nextRating === null) return;
    const nextTags = window.prompt(c.tags, row.tags.join(", "));
    if (nextTags === null) return;
    await update(row, {
      content: next,
      rating: Number(nextRating),
      tags: nextTags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    });
  }
  return (
    <section className="mx-auto w-full max-w-5xl space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-medium">{c.reviews}</h1>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void reload(!showArchived)}
        >
          {showArchived ? c.showActive : c.showArchived}
        </Button>
      </div>
      <ModuleReadOnlyBanner entity="review" />
      {!showArchived && (
        <form
          className="grid gap-2 rounded-md border p-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <select
            required
            aria-label={c.customer}
            className="rounded-md border bg-background px-3"
            value={customer}
            onChange={(event) => setCustomer(event.target.value)}
            disabled={!enabled}
          >
            {choices.map((x) => (
              <option key={x.value} value={x.value}>
                {x.kind}: {x.name}
              </option>
            ))}
          </select>
          <Input
            className="md:col-span-2"
            required
            placeholder={c.content}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            disabled={!enabled}
          />
          <select
            aria-label={c.rating}
            className="rounded-md border bg-background px-3"
            value={rating}
            onChange={(event) => setRating(Number(event.target.value))}
            disabled={!enabled}
          >
            {[5, 4, 3, 2, 1].map((x) => (
              <option key={x} value={x}>
                {x}/5
              </option>
            ))}
          </select>
          <Input
            className="md:col-span-3"
            placeholder={c.tags}
            value={tags}
            onChange={(event) => setTags(event.target.value)}
            disabled={!enabled}
          />
          <Button disabled={!enabled || busy || !choices.length}>
            {c.create}
          </Button>
        </form>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <ul className="space-y-3">
        {rows.map((row) => (
          <li key={row.id} className="rounded-md border p-4">
            <div className="flex justify-between">
              <strong>
                {"★".repeat(row.rating)}
                {"☆".repeat(5 - row.rating)}
              </strong>
              <span className="text-xs text-muted-foreground">
                {c.source}: {row.source}
              </span>
            </div>
            <p className="mt-2">{row.content}</p>
            {row.tags.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                {row.tags.join(" · ")}
              </p>
            )}
            <div className="mt-3 space-x-2 text-right">
              <Button
                size="sm"
                variant="outline"
                disabled={!enabled || busy || showArchived}
                onClick={() => void edit(row)}
              >
                {c.edit}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!enabled || busy}
                onClick={() => void update(row, { archived: !showArchived })}
              >
                {showArchived ? c.restore : c.archive}
              </Button>
            </div>
          </li>
        ))}
      </ul>
      {!rows.length && <p>{c.empty}</p>}
    </section>
  );
}
