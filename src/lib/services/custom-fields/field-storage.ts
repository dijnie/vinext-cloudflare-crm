import type { customFieldValue } from "@/lib/db/schema";
import { fieldConfigSchema, type FieldConfig, type FieldType, type FieldValue } from "./field-contracts";

export function fieldConfig(raw: string | null): FieldConfig {
  if (!raw) return {};
  try { const parsed = fieldConfigSchema.safeParse(JSON.parse(raw)); return parsed.success ? parsed.data : {}; }
  catch { return {}; }
}
export function storedFieldValue(type: FieldType, row: typeof customFieldValue.$inferSelect | undefined): FieldValue {
  if (!row) return null;
  if (["money", "multiselect", "multivalue", "file"].includes(type)) return row.jsonValue === null ? null : JSON.parse(row.jsonValue) as FieldValue;
  if (type === "customer") return row.customerReferenceId;
  if (type === "number" || type === "rating") return row.numberValue;
  if (type === "date") return row.dateValue?.toISOString() ?? null;
  if (type === "checkbox") return row.booleanValue;
  if (type === "select") return row.optionId;
  if (type === "user") return row.userMembershipId;
  return row.textValue;
}
