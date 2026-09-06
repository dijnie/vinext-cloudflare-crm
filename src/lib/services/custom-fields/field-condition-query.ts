import { eq, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { customFieldDefinition as definition } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { FieldEntity } from "./field-contracts";
import { isValidFieldCriterion, type FieldCriterion } from "./field-filter-contracts";
import { fieldValueExpression } from "./field-value-expression";

const comparison = { eq: "=", neq: "<>", gt: ">", gte: ">=", lt: "<", lte: "<=" } as const;
export async function fieldConditionQuery(db: AppDatabase, entity: FieldEntity, criteria: FieldCriterion[]): Promise<SQL[]> {
  if (!criteria.length) return [];
  const fields = await db.select().from(definition).where(eq(definition.entity, entity));
  return criteria.map(criterion => {
    const field = fields.find(item => item.key === criterion.key && !item.archivedAt && !item.deletedAt && item.showOnFilter);
    if (!field || !isValidFieldCriterion(field.type, criterion)) throw new HttpError(400, "validation_failed", "Field condition is unavailable or invalid");
    const expression = fieldValueExpression(fields, field, entity);
    const { operator, value } = criterion;
    if (operator === "empty" || operator === "not_empty") {
      if (field.type === "multiselect" || field.type === "multivalue") return operator === "empty" ? sql`coalesce(json_array_length(${expression}),0)=0` : sql`json_array_length(${expression})>0`;
      return operator === "empty" ? sql`${expression} is null` : sql`${expression} is not null`;
    }
    if (operator === "contains") return field.type === "multiselect" || field.type === "multivalue"
      ? sql`exists(select 1 from json_each(${expression}) item where item.value=${value})`
      : sql`instr(${expression},${value})>0`;
    if (field.type === "date" && typeof value === "string" && value.includes("T")) return sql`${expression} ${sql.raw(comparison[operator])} ${Date.parse(value)}`;
    if (field.type === "date") {
      const start = Date.parse(`${value}T00:00:00.000Z`), end = start + 86400000;
      if (operator === "eq") return sql`${expression} between ${start} and ${end - 1}`;
      if (operator === "neq") return sql`${expression} not between ${start} and ${end - 1}`;
      return operator === "gt" ? sql`${expression} >= ${end}` : operator === "gte" ? sql`${expression} >= ${start}` : operator === "lt" ? sql`${expression} < ${start}` : sql`${expression} < ${end}`;
    }
    const operation = sql.raw(comparison[operator]);
    if (field.type === "money" && value && typeof value === "object") return sql`json_extract(${expression},'$.currency')=${value.currency} and json_extract(${expression},'$.amountMinor') ${operation} ${value.amountMinor}`;
    return sql`${expression} ${operation} ${typeof value === "boolean" ? Number(value) : value}`;
  });
}
