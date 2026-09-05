import type { FieldDefinition, FieldValue } from "@/modules/fields/field-contracts";
import type { CrmDictionary } from "@/i18n/crm-dictionary";

export function customFieldValue(field: FieldDefinition, value: FieldValue | undefined, locale: string, labels: CrmDictionary, userLabels?: Record<string, string>): string {
  if (value == null || value === "") return "—";
  if (field.type === "checkbox") return value ? labels.custom.yes : labels.custom.no;
  if (field.type === "select") return field.options.find(option => option.id === value)?.label ?? String(value);
  if (field.type === "user") return userLabels?.[String(value)] ?? String(value);
  if (field.type === "number" && typeof value === "number") return new Intl.NumberFormat(locale).format(value);
  if (field.type === "date" && typeof value === "string") { const date = new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone: "UTC" }).format(date); }
  return String(value);
}
