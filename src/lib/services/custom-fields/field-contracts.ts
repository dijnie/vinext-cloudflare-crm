import { z } from "zod";
import { CURRENCY_CODES, MAX_AMOUNT_MINOR } from "../currencies/currency-catalog";

export const FIELD_TYPES = ["text", "long_text", "number", "date", "checkbox", "select", "url", "email", "phone", "user", "money", "multiselect", "multivalue", "rating", "customer"] as const;
export const fieldEntitySchema = z.enum(["company", "contact", "deal"]);
export const fieldTypeSchema = z.enum(FIELD_TYPES);
export type FieldEntity = z.infer<typeof fieldEntitySchema>;
export type FieldType = z.infer<typeof fieldTypeSchema>;
export const fieldConfigSchema = z.object({ ratingMax: z.number().int().min(1).max(10).optional() }).strict();
export type FieldConfig = z.infer<typeof fieldConfigSchema>;
export const moneyFieldValueSchema = z.object({ amountMinor: z.number().int().min(0).max(MAX_AMOUNT_MINOR), currency: z.enum(CURRENCY_CODES) }).strict();
export const fieldValueSchema = z.union([z.string().max(50000), z.number().finite(), z.boolean(), z.array(z.string().min(1).max(2000)).max(100), moneyFieldValueSchema, z.null()]);
export type FieldValue = z.infer<typeof fieldValueSchema>;
export const fieldValuesSchema = z.record(z.string().min(1).max(100), fieldValueSchema);
const optionInput = z.object({ id: z.string().min(1).max(100).optional(), label: z.string().trim().min(1).max(200) }).strict();
const settings = {
  label: z.string().trim().min(1).max(200), type: fieldTypeSchema, config: fieldConfigSchema.optional(),
  options: z.array(optionInput).max(100), required: z.boolean(), showOnSheet: z.boolean(), showOnTable: z.boolean(), showOnFilter: z.boolean(),
};
export const fieldCreateInputSchema = z.object({ ...settings, entity: fieldEntitySchema, options: settings.options.default([]), required: settings.required.default(false), showOnSheet: settings.showOnSheet.default(true), showOnTable: settings.showOnTable.default(false), showOnFilter: settings.showOnFilter.default(false) }).strict();
export const fieldUpdateDataSchema = z.object(settings).partial().strict();
export const fieldPatchInputSchema = z.discriminatedUnion("action", [z.object({ action: z.literal("update"), data: fieldUpdateDataSchema }).strict(), z.object({ action: z.literal("archive") }).strict(), z.object({ action: z.literal("restore") }).strict(), z.object({ action: z.literal("recover") }).strict()]);
export const fieldReorderInputSchema = z.object({ entity: fieldEntitySchema, ids: z.array(z.string().min(1).max(100)).min(1).max(500).refine(ids => new Set(ids).size === ids.length) }).strict();
export const fieldListInputSchema = z.object({ entity: fieldEntitySchema, includeArchived: z.enum(["true", "false"]).default("false").transform(value => value === "true") });
export const fieldRecordInputSchema = z.object({ entity: fieldEntitySchema, recordId: z.string().min(1).max(100) }).strict();
export const fieldValuesInputSchema = fieldRecordInputSchema.extend({ values: fieldValuesSchema.refine(values => Object.keys(values).length <= 100) });
export const fieldDeleteInputSchema = z.object({ password: z.string().min(1).max(1000), confirmation: z.string().min(1).max(100) }).strict();
export const fieldDefinitionSchema = z.object({ id: z.string(), entity: fieldEntitySchema, key: z.string(), label: z.string(), type: fieldTypeSchema, config: fieldConfigSchema.optional(), required: z.boolean(), showOnSheet: z.boolean(), showOnTable: z.boolean(), showOnFilter: z.boolean(), position: z.number(), archivedAt: z.string().nullable(), options: z.array(z.object({ id: z.string(), label: z.string(), position: z.number(), archivedAt: z.string().nullable() })) });
export type FieldDefinition = z.infer<typeof fieldDefinitionSchema>;
export type FieldCreateInput = z.infer<typeof fieldCreateInputSchema>;
export type FieldUpdateData = z.infer<typeof fieldUpdateDataSchema>;
export function fieldKeyFromLabel(label: string) {
  const key = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^([0-9])/, "f_$1").slice(0, 60) || "field";
  return new Set(["id", "createdat", "updatedat", "fields", "owner", "ownerid", "new", "__proto__", "constructor", "prototype"]).has(key) ? `${key}_field` : key;
}
