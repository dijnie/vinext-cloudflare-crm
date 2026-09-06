import { formatMinor } from "@/lib/services/currencies/currency-catalog";
import type { FieldDefinition, FieldValue } from "@/lib/services/custom-fields/field-contracts";
import type { CrmDictionary } from "@/lib/i18n/crm-dictionary";

export function customFieldValue(field: FieldDefinition, value: FieldValue | undefined, locale: string, labels: CrmDictionary, userLabels?: Record<string, string>, customerLabels?: Record<string, string>): string {
  if (value == null || value === "") return "—";
  if (field.type === "money" && typeof value === "object" && !Array.isArray(value)) return formatMinor(value.amountMinor, value.currency, locale);
  if (field.type === "multiselect" && Array.isArray(value)) return value.map(id => { const option = field.options.find(item => item.id === id); return option ? `${option.label}${option.archivedAt ? ` · ${labels.archived}` : ""}` : labels.missing; }).join(", ") || "—";
  if (field.type === "multivalue" && Array.isArray(value)) return value.join(", ") || "—";
  if (field.type === "rating" && typeof value === "number") return `${value} / ${field.config?.ratingMax ?? 5}`;
  if (field.type === "customer") return customerLabels?.[String(value)] ?? labels.missing;
  if (field.type === "checkbox") return value ? labels.custom.yes : labels.custom.no;
  if (field.type === "select") return field.options.find(option => option.id === value)?.label ?? String(value);
  if (field.type === "user") return userLabels?.[String(value)] ?? String(value);
  if (field.type === "number" && typeof value === "number") return new Intl.NumberFormat(locale).format(value);
  if (field.type === "date" && typeof value === "string") { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date); }
  return String(value);
}
