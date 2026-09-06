"use client";
import { useState } from "react";
import type { z } from "zod";
import type {
  contractListOutputSchema,
  contractDetailSchema,
} from "@/lib/services/contracts/contract-contracts";
import type { AppLocale } from "@/lib/i18n/config";
import { getB2bDictionary } from "@/lib/i18n/b2b-dictionary";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModuleReadOnlyBanner, useModules } from "../module-provider";
import { crmRequest } from "../record-types";

type Row = z.infer<typeof contractListOutputSchema>["rows"][number];
type Detail = z.infer<typeof contractDetailSchema>;
type Choice = { id: string; name: string; companyId?: string | null };
type Props = {
  locale: AppLocale;
  initialData: { rows: Row[] };
  companies: Choice[];
  contacts: Choice[];
  deals: Choice[];
  orders: Choice[];
  owners: Choice[];
};

export function ContractBoard({
  locale,
  initialData,
  companies,
  contacts,
  deals,
  orders,
  owners,
}: Props) {
  const c = getB2bDictionary(locale),
    modules = useModules(),
    enabled = modules.isEnabled("contract");
  const [rows, setRows] = useState(initialData.rows),
    [details, setDetails] = useState<Record<string, Detail>>({});
  const [name, setName] = useState(""),
    [companyId, setCompany] = useState(companies[0]?.id ?? ""),
    [contactId, setContact] = useState(""),
    [dealId, setDeal] = useState(""),
    [orderId, setOrder] = useState("");
  const [ownerMembershipId, setOwner] = useState(owners[0]?.id ?? ""),
    [value, setValue] = useState(""),
    [currency, setCurrency] = useState("VND"),
    [effectiveAt, setEffectiveAt] = useState(""),
    [expiresAt, setExpiresAt] = useState("");
  const [showArchived, setShowArchived] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const replace = (next: Detail) => {
    setRows((items) =>
      items.map((item) => (item.id === next.id ? next : item)),
    );
    setDetails((items) => ({ ...items, [next.id]: next }));
  };
  async function reload(archived: boolean) {
    setBusy(true);
    setError("");
    try {
      const next = await crmRequest<{ rows: Row[] }>(
        `/api/crm/contracts?status=all&archived=${archived}&limit=100`,
      );
      setRows(next.rows);
      setShowArchived(archived);
      setDetails({});
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    setBusy(true);
    setError("");
    try {
      const row = await crmRequest<Detail>("/api/crm/contracts", {
        method: "POST",
        body: JSON.stringify({
          operationKey: crypto.randomUUID(),
          name,
          companyId,
          ownerMembershipId,
          contactId: contactId || null,
          dealId: dealId || null,
          orderId: orderId || null,
          valueMinor: value ? Number(value) : null,
          currency,
          ...(effectiveAt
            ? {
                effectiveAt: new Date(`${effectiveAt}T00:00:00Z`).toISOString(),
              }
            : {}),
          ...(expiresAt
            ? { expiresAt: new Date(`${expiresAt}T00:00:00Z`).toISOString() }
            : {}),
          parties: [
            { companyId, role: "customer" },
            ...(contactId ? [{ contactId, role: "contact" }] : []),
          ],
        }),
      });
      setRows((items) => [row, ...items]);
      setDetails((items) => ({ ...items, [row.id]: row }));
      setName("");
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }
  async function command(row: Row, payload: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const next = await crmRequest<Detail>(`/api/crm/contracts/${row.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          operationKey: crypto.randomUUID(),
          expectedRevision: row.revision,
          reason: "Updated from contract workspace",
          ...payload,
        }),
      });
      if (payload.action === "archive" || payload.action === "restore")
        setRows((items) => items.filter((item) => item.id !== row.id));
      else replace(next);
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }
  async function open(row: Row) {
    if (details[row.id]) {
      setDetails((items) => {
        const next = { ...items };
        delete next[row.id];
        return next;
      });
      return;
    }
    setBusy(true);
    try {
      const detail = await crmRequest<Detail>(`/api/crm/contracts/${row.id}`);
      setDetails((items) => ({ ...items, [row.id]: detail }));
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }
  async function edit(row: Row) {
    const nextName = window.prompt(c.name, row.name);
    if (!nextName) return;
    const nextCompany = window.prompt(c.company, row.companyId);
    if (!nextCompany) return;
    const nextContact = window.prompt(c.contact, row.contactId ?? "");
    if (nextContact === null) return;
    const nextDeal = window.prompt(c.deal, row.dealId ?? "");
    if (nextDeal === null) return;
    const nextOrder = window.prompt(c.order, row.orderId ?? "");
    if (nextOrder === null) return;
    const nextOwner = window.prompt(c.owner, row.ownerMembershipId);
    if (!nextOwner) return;
    const nextValue = window.prompt(c.value, row.valueMinor?.toString() ?? "");
    if (nextValue === null) return;
    const nextCurrency = window.prompt(c.currency, row.currency);
    if (!nextCurrency) return;
    const nextEffective = window.prompt(c.effective, row.effectiveAt ?? "");
    if (nextEffective === null) return;
    const nextExpires = window.prompt(c.expires, row.expiresAt ?? "");
    if (nextExpires === null) return;
    const reason = window.prompt(c.reason, "");
    if (!reason) return;
    await command(row, {
      action: "update",
      reason,
      name: nextName,
      companyId: nextCompany,
      contactId: nextContact || null,
      dealId: nextDeal || null,
      orderId: nextOrder || null,
      ownerMembershipId: nextOwner,
      valueMinor: nextValue ? Number(nextValue) : null,
      currency: nextCurrency,
      effectiveAt: nextEffective || null,
      expiresAt: nextExpires || null,
    });
  }
  async function upload(row: Row, file: File) {
    setBusy(true);
    setError("");
    try {
      await crmRequest(`/api/crm/contracts/${row.id}/documents`, {
        method: "POST",
        headers: {
          "Content-Type": "application/octet-stream",
          "x-file-name": encodeURIComponent(file.name),
        },
        body: file,
      });
      const detail = await crmRequest<Detail>(`/api/crm/contracts/${row.id}`);
      replace(detail);
    } catch {
      setError(c.error);
    } finally {
      setBusy(false);
    }
  }
  const transitions = (status: Row["status"]): Row["status"][] =>
    status === "draft"
      ? ["active", "terminated"]
      : status === "active"
        ? ["completed", "terminated", "expired"]
        : [];
  const companyContacts = contacts.filter(
      (item) => !item.companyId || item.companyId === companyId,
    ),
    companyDeals = deals.filter(
      (item) => !item.companyId || item.companyId === companyId,
    ),
    companyOrders = orders.filter(
      (item) => !item.companyId || item.companyId === companyId,
    );
  return (
    <section className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-medium">{c.contracts}</h1>
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void reload(!showArchived)}
        >
          {showArchived ? c.showActive : c.showArchived}
        </Button>
      </div>
      <ModuleReadOnlyBanner entity="contract" />
      {!showArchived && (
        <form
          className="grid gap-2 rounded-md border p-4 md:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <Input
            required
            placeholder={c.name}
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={!enabled}
          />
          <select
            required
            aria-label={c.company}
            className="rounded-md border bg-background px-3"
            value={companyId}
            onChange={(event) => setCompany(event.target.value)}
            disabled={!enabled}
          >
            {companies.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            required
            aria-label={c.owner}
            className="rounded-md border bg-background px-3"
            value={ownerMembershipId}
            onChange={(event) => setOwner(event.target.value)}
            disabled={!enabled}
          >
            {owners.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <Input
            inputMode="numeric"
            placeholder={c.value}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            disabled={!enabled}
          />
          <select
            aria-label={c.contact}
            className="rounded-md border bg-background px-3"
            value={contactId}
            onChange={(event) => setContact(event.target.value)}
            disabled={!enabled}
          >
            <option value="">{c.noContact}</option>
            {companyContacts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            aria-label={c.deal}
            className="rounded-md border bg-background px-3"
            value={dealId}
            onChange={(event) => setDeal(event.target.value)}
            disabled={!enabled}
          >
            <option value="">{c.noDeal}</option>
            {companyDeals.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <select
            aria-label={c.order}
            className="rounded-md border bg-background px-3"
            value={orderId}
            onChange={(event) => setOrder(event.target.value)}
            disabled={!enabled}
          >
            <option value="">{c.noOrder}</option>
            {companyOrders.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <div className="flex gap-2">
            <Input
              className="w-24"
              aria-label={c.currency}
              value={currency}
              maxLength={3}
              onChange={(event) =>
                setCurrency(event.target.value.toUpperCase())
              }
              disabled={!enabled}
            />
            <Button
              disabled={!enabled || busy || !companies.length || !owners.length}
            >
              {c.create}
            </Button>
          </div>
          <Input
            type="date"
            aria-label={c.effective}
            value={effectiveAt}
            onChange={(event) => setEffectiveAt(event.target.value)}
            disabled={!enabled}
          />
          <Input
            type="date"
            aria-label={c.expires}
            value={expiresAt}
            onChange={(event) => setExpiresAt(event.target.value)}
            disabled={!enabled}
          />
        </form>
      )}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left">
              <th className="p-3">{c.name}</th>
              <th>{c.value}</th>
              <th>{c.status}</th>
              <th>{c.document}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr className="border-b align-top last:border-0" key={row.id}>
                <td className="p-3">
                  <button
                    className="font-medium underline-offset-4 hover:underline"
                    onClick={() => void open(row)}
                  >
                    {row.name}
                  </button>
                  {details[row.id] && (
                    <div className="mt-3 space-y-2 text-xs font-normal">
                      <p>
                        {c.effective}: {row.effectiveAt?.slice(0, 10) ?? "—"} ·{" "}
                        {c.expires}: {row.expiresAt?.slice(0, 10) ?? "—"}
                      </p>
                      <p>
                        {c.parties}:{" "}
                        {details[row.id].parties.map((p) => p.role).join(", ")}
                      </p>
                      <p>
                        {c.history}:{" "}
                        {details[row.id].versions
                          .map((v) => `v${v.version}: ${v.reason}`)
                          .join(" · ")}
                      </p>
                      {details[row.id].documents.map((file) => (
                        <p key={file.id}>
                          <a
                            className="underline"
                            href={`/api/crm/contracts/documents/${file.id}/download`}
                          >
                            {file.name}
                          </a>{" "}
                          ({file.size} B)
                        </p>
                      ))}
                    </div>
                  )}
                </td>
                <td>
                  {row.valueMinor?.toLocaleString(locale) ?? "—"} {row.currency}
                </td>
                <td>
                  <span>{c.statuses[row.status]}</span>
                  {transitions(row.status).length > 0 && (
                    <select
                      aria-label={c.status}
                      className="ml-2 rounded border bg-background"
                      defaultValue=""
                      disabled={!enabled || busy || showArchived}
                      onChange={(event) =>
                        event.target.value &&
                        void command(row, {
                          action: "status",
                          status: event.target.value,
                        })
                      }
                    >
                      <option value="">…</option>
                      {transitions(row.status).map((status) => (
                        <option key={status} value={status}>
                          {c.statuses[status]}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td>
                  <Input
                    className="max-w-56"
                    type="file"
                    disabled={!enabled || busy || showArchived}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void upload(row, file);
                    }}
                  />
                </td>
                <td className="space-x-2 whitespace-nowrap p-3 text-right">
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
                    disabled={
                      !enabled ||
                      busy ||
                      (!showArchived && row.status === "active")
                    }
                    onClick={() =>
                      void command(row, {
                        action: showArchived ? "restore" : "archive",
                      })
                    }
                  >
                    {showArchived ? c.restore : c.archive}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!rows.length && <p>{c.empty}</p>}
    </section>
  );
}
