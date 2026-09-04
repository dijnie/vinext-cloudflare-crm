import type { CrmDictionary } from "@/i18n/crm-dictionary";
import type { FieldDefinition, FieldValue } from "@/fields/field-contracts";

export interface CrmRecord {
  id: string;
  name?: string; firstName?: string; lastName?: string | null;
  archivedAt?: string | null;
  company?: { id: string; name: string | null; domain?: string | null } | null;
  owner?: { membershipId: string; name: string | null; email: string | null } | null;
  contacts?: CrmRecord[]; deals?: CrmRecord[];
  fields?: Record<string, FieldValue>;
  [key: string]: unknown;
}
export interface Facet { value: string; label?: string; count: number }
export interface ListData { rows: CrmRecord[]; total: number; facets?: Record<string, Facet[]>; customFields?: FieldDefinition[]; fieldFacets?: Record<string, Facet[]>; fieldUserLabels?: Record<string, string> }
export function recordName(row: CrmRecord) { return row.name || [row.firstName, row.lastName].filter(Boolean).join(" ") || row.id; }
export function fieldLabel(key: string, labels: CrmDictionary) { return labels.labels[key as keyof CrmDictionary["labels"]] ?? key; }
export function displayValue(row: CrmRecord, key: string, locale: string, labels: CrmDictionary): string {
  if (key === "owner") return row.owner?.name || row.owner?.email || "—";
  if (key === "company") return row.company?.name || "—";
  if (key === "stage" || key === "stageId") return labels.stages[row.stageId as keyof CrmDictionary["stages"]] || "—";
  const value = row[key === "amount" ? "amountMinor" : key];
  if (value == null || value === "") return "—";
  if (key === "amount" && typeof value === "number" && typeof row.currency === "string") {
    const money = new Intl.NumberFormat(locale, { style: "currency", currency: row.currency });
    return money.format(value / 10 ** (money.resolvedOptions().maximumFractionDigits ?? 2));
  }
  if (key.endsWith("At") && typeof value === "string") return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(new Date(value));
  if (typeof value === "number") return new Intl.NumberFormat(locale).format(value);
  return typeof value === "string" ? value : "—";
}
export async function crmRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  if (!response.ok) throw new Error(String(response.status));
  return response.json() as Promise<T>;
}
export function requestError(error: unknown, labels: CrmDictionary) { return error instanceof Error ? error.message === "409" ? labels.conflict : error.message === "400" ? labels.invalid : error.message === "404" ? labels.missing : labels.error : labels.error; }
