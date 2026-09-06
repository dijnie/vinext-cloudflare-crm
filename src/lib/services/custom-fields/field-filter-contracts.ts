import { z } from "zod";
import { moneyFieldValueSchema, type FieldType } from "./field-contracts";

const operators = ["eq", "neq", "gt", "gte", "lt", "lte", "contains", "empty", "not_empty"] as const;
export type FieldFilterOperator = typeof operators[number];
const criterionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
  operator: z.enum(operators),
  value: z.union([z.string().min(1).max(255), z.number().finite(), z.boolean(), moneyFieldValueSchema]).optional(),
}).strict().superRefine((criterion, context) => {
  const empty = criterion.operator === "empty" || criterion.operator === "not_empty";
  if (empty ? criterion.value !== undefined : criterion.value === undefined) context.addIssue({ code: "custom", path: ["value"], message: "Operator and value do not match" });
});
export const fieldCriteriaSchema = z.array(criterionSchema).max(20);
export type FieldCriterion = z.infer<typeof criterionSchema>;
export const fieldCriteriaQuerySchema = z.preprocess(value => {
  if (typeof value !== "string" || value.length > 12000) return value;
  try { return JSON.parse(value); } catch { return value; }
}, fieldCriteriaSchema).default([]);

export function fieldFilterOperators(type: FieldType): readonly FieldFilterOperator[] {
  const empty = ["empty", "not_empty"] as const;
  if (["number", "rating", "formula", "date", "money"].includes(type)) return ["eq", "neq", "gt", "gte", "lt", "lte", ...empty];
  if (type === "multiselect" || type === "multivalue") return ["contains", ...empty];
  if (["text", "long_text", "email", "url", "phone"].includes(type)) return ["eq", "neq", "contains", ...empty];
  return ["eq", "neq", ...empty];
}

export function isValidFieldCriterion(type: FieldType, criterion: FieldCriterion): boolean {
  if (!criterionSchema.safeParse(criterion).success || !fieldFilterOperators(type).includes(criterion.operator)) return false;
  if (criterion.operator === "empty" || criterion.operator === "not_empty") return true;
  const value = criterion.value;
  if (["number", "rating", "formula"].includes(type)) return typeof value === "number" && Number.isFinite(value);
  if (type === "checkbox") return typeof value === "boolean";
  if (type === "money") return moneyFieldValueSchema.safeParse(value).success;
  if (type === "date") return typeof value === "string" && z.iso.date().safeParse(value).success;
  return typeof value === "string" && value.length > 0;
}
