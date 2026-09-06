import { getCatalogDictionary } from "@/lib/i18n/catalog-dictionary";
import { leadChoiceLabel } from "@/lib/i18n/lead-dictionary";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";
import type { FieldDefinition, FieldValue } from "@/lib/services/custom-fields/field-contracts";
import { formatMinor } from "@/lib/services/currencies/currency-catalog";

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
export interface ListData { rows: CrmRecord[]; total: number; facets?: Record<string, Facet[]>; customFields?: FieldDefinition[]; fieldFacets?: Record<string, Facet[]>; fieldUserLabels?: Record<string, string>; fieldCustomerLabels?: Record<string, string>; fieldFileLabels?: Record<string, string> }
export function recordName(row: CrmRecord) { return row.name || [row.firstName, row.lastName].filter(Boolean).join(" ") || row.id; }
export function fieldLabel(key: string, labels: CrmDictionary) { return labels.labels[key as keyof CrmDictionary["labels"]] ?? key; }
export function displayValue(row: CrmRecord, key: string, locale: string, labels: CrmDictionary): string {
  if (key === "kind") return getCatalogDictionary(locale === "vi" ? "vi" : "en")[row.kind as "product" | "service" | "package"] ?? "—";
  if (key === "category" || key === "categoryId") return typeof row.categoryLabel === "string" ? row.categoryLabel : "—";
  if (key === "priceMinor" && typeof row.priceMinor === "number" && typeof row.currency === "string") return formatMinor(row.priceMinor, row.currency, locale);
  if (["source", "sourceId", "status", "statusId"].includes(key)) { const prefix = key.startsWith("source") ? "source" : "status"; return leadChoiceLabel({ id: String(row[`${prefix}Id`] ?? ""), label: typeof row[`${prefix}Label`] === "string" ? row[`${prefix}Label`] as string : null }, locale === "vi" ? "vi" : "en"); }
  if (key === "collaboratorMembershipIds" && Array.isArray(row[key])) return (row[key] as string[]).map(id => (row.collaboratorLabels as Record<string, string> | undefined)?.[id] ?? id).join(", ") || "—";
  if (key === "owner") return row.owner?.name || row.owner?.email || "—";
  if (key === "company") return row.company?.name || "—";
  if (key === "stage" || key === "stageId") return typeof row.stageLabel === "string" ? row.stageLabel : labels.stages[row.stageId as keyof CrmDictionary["stages"]] || String(row.stageId ?? "—");
  const value = row[key === "amount" ? "amountMinor" : key];
  if (value == null || value === "") return "—";
  if (key === "amount" && typeof value === "number" && typeof row.currency === "string") {
    return formatMinor(value, row.currency, locale);
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
