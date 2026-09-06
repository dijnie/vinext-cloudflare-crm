import { asc, desc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { customFieldDefinition as definition } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { FieldEntity } from "./field-contracts";
import { fieldValueExpression } from "./field-value-expression";
import { isSortableFieldType } from "./field-sort-contracts";

// A fixed output alias lets ORDER BY reuse computed SQL without duplicating bindings.
const sortAlias = sql.identifier("__crm_field_sort_value");
export async function customFieldSort(db: AppDatabase, entity: FieldEntity, sort: string | undefined, direction: "asc" | "desc") {
  if (!sort?.startsWith("field:")) return null;
  const fields = await db.select().from(definition).where(eq(definition.entity, entity));
  const field = fields.find(item => item.key === sort.slice(6) && !item.archivedAt && !item.deletedAt);
  if (!field || !isSortableFieldType(field.type)) throw new HttpError(400, "validation_failed", "Field sort is unavailable");
  const expression = fieldValueExpression(fields, field, entity, true);
  return { value: expression.as("__crm_field_sort_value"), order: [asc(sql`${sortAlias} is null`), direction === "desc" ? desc(sortAlias) : asc(sortAlias)] };
}
