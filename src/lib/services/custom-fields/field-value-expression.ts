import { recordAnchorNames } from "@/lib/db/record-entities";
import { recordTables } from "@/lib/db/record-entities";
import { sql, type SQL } from "drizzle-orm";
import { company, contact, deal, type customFieldDefinition } from "@/lib/db/schema";
import type { FieldEntity } from "./field-contracts";
import { formulaExpression } from "./formula-query";

export type StoredFieldDefinition = typeof customFieldDefinition.$inferSelect;

/** Reference identity is retained for predicates; only display sorting resolves labels. */
export function fieldValueExpression(fields: StoredFieldDefinition[], field: StoredFieldDefinition, entity: FieldEntity, displayReferences = false): SQL {
  const recordId = sql`${recordTables[entity].id}`;
  if (field.type === "formula") return formulaExpression(fields, field.key, entity, recordId);
  const anchor = sql.raw(recordAnchorNames[entity]);
  let stored: SQL;
  if (field.type === "number" || field.type === "rating") stored = sql`v.number_value`;
  else if (field.type === "date") stored = sql`v.date_value`;
  else if (field.type === "checkbox") stored = sql`v.boolean_value`;
  else if (field.type === "select") stored = displayReferences ? sql`(select o.label from custom_field_option o where o.id=v.option_id and o.field_id=v.field_id)` : sql`v.option_id`;
  else if (field.type === "user") stored = displayReferences ? sql`(select coalesce(nullif(u.name,''),u.email) from user u where u.id=v.user_membership_id)` : sql`v.user_membership_id`;
  else if (field.type === "customer") stored = displayReferences ? sql`(select trim(coalesce(c.first_name,'') || ' ' || coalesce(c.last_name,'')) from contact c where c.id=v.customer_reference_id)` : sql`v.customer_reference_id`;
  else if (["money", "multiselect", "multivalue", "file"].includes(field.type)) stored = sql`v.json_value`;
  else stored = sql`nullif(v.text_value,'')`;
  return sql`(select ${stored} from custom_field_value v where v.field_id=${field.id} and v.${anchor}=${recordId})`;
}
