import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { company, contact, deal, customFieldDefinition as definition, customFieldOption as option, customFieldValue as value, user, singletonMembership } from "@/lib/db/schema";
import type { EntityType } from "@/lib/listing/list-state";
import { inJsonArray } from "@/lib/db/sql-filters";
import { alias } from "drizzle-orm/sqlite-core";
import { formulaEvaluator } from "./field-formula";
import { fieldConfig, storedFieldValue } from "./field-storage";
import type { FieldValue } from "./field-contracts";
import { HttpError } from "@/lib/http/http-errors";

const tables = { company, contact, deal };
const anchors = { company: value.companyId, contact: value.contactId, deal: value.dealId };
type Filters = Record<string, string[]>;
const customer = alias(contact, "field_customer");

export async function validateFieldFilters(db: AppDatabase, entity: EntityType, filters: Filters) {
  const keys = Object.entries(filters).filter(([, values]) => values.length).map(([key]) => key);
  if (!keys.length) return;
  const rows = await db.select({ key: definition.key }).from(definition).where(and(eq(definition.entity, entity), isNull(definition.archivedAt), sql`${definition}.deleted_at is null`, eq(definition.showOnFilter, true), inJsonArray(definition.type, ["select", "user", "multiselect", "customer"]), inJsonArray(definition.key, keys)));
  if (rows.length !== keys.length) throw new HttpError(400, "validation_failed", "Field filter is unavailable");
}

export function fieldFilterConditions(entity: EntityType, filters: Filters): SQL[] {
  return Object.entries(filters).filter(([, values]) => values.length).map(([key, selected]) => sql`exists (
    select 1 from ${value} inner join ${definition} on ${definition.id} = ${value.fieldId}
    where ${anchors[entity]} = ${tables[entity].id} and ${definition.entity} = ${entity}
    and ${definition.key} = ${key} and ${definition.archivedAt} is null and ${definition}.deleted_at is null
    and ${definition.showOnFilter} = 1 and (
      (${definition.type} = 'select' and ${inJsonArray(value.optionId, selected)}) or
      (${definition.type} = 'user' and ${inJsonArray(value.userMembershipId, selected)}) or
      (${definition.type} = 'customer' and ${inJsonArray(value.customerReferenceId, selected)}) or
      (${definition.type} = 'multiselect' and exists (select 1 from json_each(${value.jsonValue}) selected where ${inJsonArray(sql`selected.value`, selected)}))
    ))`);
}

export async function fieldListData(db: AppDatabase, entity: EntityType, ids: string[], facetWhere: SQL) {
  const definitions = await db.select().from(definition).where(and(eq(definition.entity, entity), isNull(definition.archivedAt), sql`${definition}.deleted_at is null`)).orderBy(asc(definition.position), asc(definition.id));
  const definitionIds = definitions.map(field => field.id);
  const filterIds = definitions.filter(field => field.showOnFilter && ["select", "user", "multiselect", "customer"].includes(field.type)).map(field => field.id);
  const [[options, values], facetRows] = await Promise.all([
    definitionIds.length ? db.batch([
      db.select().from(option).where(inJsonArray(option.fieldId, definitionIds)).orderBy(asc(option.position), asc(option.id)),
      db.select().from(value).where(and(inJsonArray(anchors[entity], ids), inJsonArray(value.fieldId, definitionIds))),
    ]) : Promise.resolve([[], []] as [typeof option.$inferSelect[], typeof value.$inferSelect[]]),
    filterIds.length ? db.all<{ fieldId: string; choiceId: string; label: string; count: number }>(sql`
      select ${value.fieldId} as fieldId, choice.value as choiceId,
        coalesce(${option.label}, ${user.name}, trim(coalesce(${customer.firstName}, '') || ' ' || coalesce(${customer.lastName}, ''))) as label,
        count(*) as count
      from ${value} inner join ${definition} on ${definition.id}=${value.fieldId}
      inner join ${tables[entity]} on ${anchors[entity]}=${tables[entity].id}
      cross join json_each(case when ${definition.type}='multiselect' then ${value.jsonValue}
        else json_array(coalesce(${value.optionId},${value.userMembershipId},${value.customerReferenceId})) end) as choice
      left join ${option} on ${option.id}=choice.value and ${definition.type} in ('select','multiselect')
      left join ${user} on ${user.id}=choice.value and ${definition.type}='user'
      left join ${singletonMembership} on ${singletonMembership.userId}=${user.id}
      left join contact as field_customer on ${customer.id}=choice.value and ${definition.type}='customer'
      where ${facetWhere} and ${inJsonArray(value.fieldId, filterIds)} and (
        (${definition.type} in ('select','multiselect') and ${option.id} is not null and ${option.archivedAt} is null)
        or (${definition.type}='user' and ${singletonMembership.status}='active')
        or (${definition.type}='customer' and ${customer.id} is not null and ${customer.archivedAt} is null))
      group by 1, 2, 3 order by 1, 3 limit 2000
    `) : Promise.resolve([]),
  ]);
  const customFields = definitions.map(field => ({ id: field.id, entity: field.entity, key: field.key, label: field.label, type: field.type, config: fieldConfig(field.configJson), required: field.required, showOnSheet: field.showOnSheet, showOnTable: field.showOnTable, showOnFilter: field.showOnFilter, position: field.position, archivedAt: null, options: options.filter(item => item.fieldId === field.id).map(item => ({ id: item.id, label: item.label, position: item.position, archivedAt: item.archivedAt?.toISOString() ?? null })) }));
  const byId = new Map(definitions.map(field => [field.id, field]));
  const memberIds = [...new Set(values.flatMap(row => row.userMembershipId ? [row.userMembershipId] : []))];
  const members = memberIds.length ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inJsonArray(user.id, memberIds)) : [];
  const fieldUserLabels = Object.fromEntries(members.map(member => [member.id, member.name || member.email]));
  const customerIds = [...new Set(values.flatMap(row => row.customerReferenceId ? [row.customerReferenceId] : []))];
  const customers = customerIds.length ? await db.select({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName }).from(contact).where(inJsonArray(contact.id, customerIds)) : [];
  const fieldCustomerLabels = Object.fromEntries(customers.map(item => [item.id, [item.firstName, item.lastName].filter(Boolean).join(" ")]));
  const fieldsByRecord: Record<string, Record<string, FieldValue>> = {};
  for (const row of values) {
    const field = byId.get(row.fieldId)!;
    const recordId = row.companyId ?? row.contactId ?? row.dealId!;
    const scalar = storedFieldValue(field.type, row);
    (fieldsByRecord[recordId] ??= {})[field.key] = scalar;
  }
  const compute = formulaEvaluator(definitions);
  for (const id of ids) { const values = fieldsByRecord[id] ?? {}; fieldsByRecord[id] = { ...values, ...compute(values) }; }
  const fieldFacets: Record<string, { value: string; label: string; count: number }[]> = {};
  for (const row of facetRows) { const key = byId.get(row.fieldId)!.key; (fieldFacets[key] ??= []).push({ value: row.choiceId, label: row.label, count: row.count }); }
  return { customFields, fieldsByRecord, fieldFacets, fieldUserLabels, fieldCustomerLabels };
}
