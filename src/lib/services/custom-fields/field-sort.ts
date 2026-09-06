import { asc, desc, eq, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { company, contact, deal, customFieldDefinition as definition } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { FieldEntity } from "./field-contracts";
import { formulaExpression } from "./formula-query";
import { isSortableFieldType } from "./field-sort-contracts";

// A fixed output alias lets ORDER BY reuse computed SQL without duplicating bindings.
const sortAlias = sql.identifier("__crm_field_sort_value");
export async function customFieldSort(db: AppDatabase, entity: FieldEntity, sort: string | undefined, direction: "asc" | "desc") {
  if (!sort?.startsWith("field:")) return null;
  const fields = await db.select().from(definition).where(eq(definition.entity, entity));
  const field = fields.find(item => item.key === sort.slice(6) && !item.archivedAt && !item.deletedAt);
  if (!field || !isSortableFieldType(field.type)) throw new HttpError(400, "validation_failed", "Field sort is unavailable");
  const recordId = sql`${{ company, contact, deal }[entity].id}`;
  const anchor = sql.raw({ company: "company_id", contact: "contact_id", deal: "deal_id" }[entity]);
  let expression: SQL;
  if (field.type === "formula") expression = formulaExpression(fields, field.key, entity, recordId);
  else {
    let stored: SQL;
    if (field.type === "number" || field.type === "rating") stored = sql`v.number_value`;
    else if (field.type === "date") stored = sql`v.date_value`;
    else if (field.type === "checkbox") stored = sql`v.boolean_value`;
    else if (field.type === "select") stored = sql`(select o.label from custom_field_option o where o.id=v.option_id and o.field_id=v.field_id)`;
    else if (field.type === "user") stored = sql`(select coalesce(nullif(u.name,''),u.email) from user u where u.id=v.user_membership_id)`;
    else if (field.type === "customer") stored = sql`(select trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) from contact c where c.id=v.customer_reference_id)`;
    else stored = sql`nullif(v.text_value,'')`;
    expression = sql`(select ${stored} from custom_field_value v where v.field_id=${field.id} and v.${anchor}=${recordId})`;
  }
  return { value: expression.as("__crm_field_sort_value"), order: [asc(sql`${sortAlias} is null`), direction === "desc" ? desc(sortAlias) : asc(sortAlias)] };
}
