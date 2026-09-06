import { recordTables } from "@/lib/db/record-entities";
import { FieldRepository } from "./field-repository";
import { assertQueryLimits } from "@/lib/db/query-limits";
import { and, asc, eq, isNull, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { crmFile, company, contact, deal, customFieldDefinition as definition, customFieldOption as option, customFieldValue as value, user, singletonMembership } from "@/lib/db/schema";
import type { EntityType } from "@/lib/listing/list-state";
import { inJsonArray } from "@/lib/db/sql-filters";
import { alias } from "drizzle-orm/sqlite-core";
import { formulaEvaluator } from "./field-formula";
import { fieldConfig, storedFieldValue } from "./field-storage";
import type { FieldValue } from "./field-contracts";
import { HttpError } from "@/lib/http/http-errors";

const tables = recordTables;
const anchors = { company: value.companyId, contact: value.contactId, deal: value.dealId, lead: value.leadId };
type Filters = Record<string, string[]>;
const customer = alias(contact, "field_customer");

export async function validateFieldFilters(db: AppDatabase, entity: EntityType, filters: Filters) {
  const keys = Object.entries(filters).filter(([, values]) => values.length).map(([key]) => key);
  if (!keys.length) return;
  const rows = await db.select({ key: definition.key }).from(definition).where(and(eq(definition.entity, entity), isNull(definition.archivedAt), sql`${definition}.deleted_at is null`, eq(definition.showOnFilter, true), inJsonArray(definition.type, ["select", "user", "multiselect", "customer"]), inJsonArray(definition.key, keys)));
  if (rows.length !== keys.length) throw new HttpError(400, "validation_failed", "Field filter is unavailable");
}

export function fieldFilterConditions(entity: EntityType, filters: Filters): SQL[] {
  const selected = Object.fromEntries(Object.entries(filters).filter(([, values]) => values.length));
  if (!Object.keys(selected).length) return [];
  // Bind the complete filter map once so many filters can accompany computed sorts.
  return [sql`not exists (
    select 1 from json_each(${JSON.stringify(selected)}) wanted
    where not exists (
      select 1 from ${value} inner join ${definition} on ${definition.id}=${value.fieldId}
      where ${anchors[entity]}=${tables[entity].id} and ${definition.entity}=${entity}
        and ${definition.key}=wanted.key and ${definition.archivedAt} is null and ${definition}.deleted_at is null
        and ${definition.showOnFilter}=1 and (
          (${definition.type}='select' and exists (select 1 from json_each(wanted.value) chosen where chosen.value=${value.optionId})) or
          (${definition.type}='user' and exists (select 1 from json_each(wanted.value) chosen where chosen.value=${value.userMembershipId})) or
          (${definition.type}='customer' and exists (select 1 from json_each(wanted.value) chosen where chosen.value=${value.customerReferenceId})) or
          (${definition.type}='multiselect' and exists (select 1 from json_each(${value.jsonValue}) actual
            inner join json_each(wanted.value) chosen on chosen.value=actual.value))
        )
    )
  )`];
}

export async function fieldListData(db: AppDatabase, entity: EntityType, ids: string[], facetWhere: SQL) {
  const definitions = await db.select().from(definition).where(and(eq(definition.entity, entity), isNull(definition.archivedAt), sql`${definition}.deleted_at is null`)).orderBy(asc(definition.position), asc(definition.id));
  const definitionIds = definitions.map(field => field.id);
  const filterIds = definitions.filter(field => field.showOnFilter && ["select", "user", "multiselect", "customer"].includes(field.type)).map(field => field.id);
  const facetQuery = db.select({
    fieldId: value.fieldId,
    choiceId: sql<string>`choice.value`,
    label: sql<string>`coalesce(${option.label}, ${user.name}, trim(coalesce(${customer.firstName}, '') || ' ' || coalesce(${customer.lastName}, '')))`,
    count: sql<number>`count(*)`,
  }).from(value).innerJoin(definition, eq(definition.id, value.fieldId))
    .innerJoin(tables[entity], eq(anchors[entity], tables[entity].id))
    .innerJoin(sql`json_each(case when ${definition.type}='multiselect' then ${value.jsonValue}
      else json_array(coalesce(${value.optionId},${value.userMembershipId},${value.customerReferenceId})) end) as choice`, sql`1=1`)
    .leftJoin(option, sql`${option.id}=choice.value and ${definition.type} in ('select','multiselect')`)
    .leftJoin(user, sql`${user.id}=choice.value and ${definition.type}='user'`)
    .leftJoin(singletonMembership, eq(singletonMembership.userId, user.id))
    .leftJoin(customer, sql`${customer.id}=choice.value and ${definition.type}='customer'`)
    .where(and(facetWhere, inJsonArray(value.fieldId, filterIds), sql`(
      (${definition.type} in ('select','multiselect') and ${option.id} is not null and ${option.archivedAt} is null)
      or (${definition.type}='user' and ${singletonMembership.status}='active')
      or (${definition.type}='customer' and ${customer.id} is not null and ${customer.archivedAt} is null))`))
    .groupBy(sql`1`, sql`2`, sql`3`).orderBy(sql`1`, sql`3`).limit(2000);
  if (filterIds.length) assertQueryLimits(facetQuery);
  const [[options, values], facetRows] = await Promise.all([
    definitionIds.length ? db.batch([
      db.select().from(option).where(inJsonArray(option.fieldId, definitionIds)).orderBy(asc(option.position), asc(option.id)),
      db.select().from(value).where(and(inJsonArray(anchors[entity], ids), inJsonArray(value.fieldId, definitionIds))),
    ]) : Promise.resolve([[], []] as [typeof option.$inferSelect[], typeof value.$inferSelect[]]),
    filterIds.length ? facetQuery : Promise.resolve([]),
  ]);
  const calendar = await new FieldRepository(db).calendar(definitions);
  const customFields = definitions.map(field => ({ id: field.id, entity: field.entity, key: field.key, label: field.label, type: field.type, config: fieldConfig(field.configJson), ...(field.type === "date" && fieldConfig(field.configJson).dateTime ? { calendar } : {}), required: field.required, showOnSheet: field.showOnSheet, showOnTable: field.showOnTable, showOnFilter: field.showOnFilter, position: field.position, archivedAt: null, options: options.filter(item => item.fieldId === field.id).map(item => ({ id: item.id, label: item.label, position: item.position, archivedAt: item.archivedAt?.toISOString() ?? null })) }));
  const fileFieldIds = new Set(definitions.filter(field => field.type === "file").map(field => field.id));
  const attachmentIds = [...new Set(values.flatMap(row => fileFieldIds.has(row.fieldId) && row.jsonValue ? JSON.parse(row.jsonValue) as string[] : []))];
  const attachments = attachmentIds.length ? await db.select({ id: crmFile.id, name: crmFile.fileName }).from(crmFile).where(and(inJsonArray(crmFile.id, attachmentIds), eq(crmFile.status, "ready"))) : [];
  const fieldFileLabels = Object.fromEntries(attachments.map(item => [item.id, item.name]));
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
    const recordId = row.companyId ?? row.contactId ?? row.dealId ?? row.leadId!;
    const scalar = storedFieldValue(field.type, row);
    (fieldsByRecord[recordId] ??= {})[field.key] = scalar;
  }
  const compute = formulaEvaluator(definitions);
  for (const id of ids) { const values = fieldsByRecord[id] ?? {}; fieldsByRecord[id] = { ...values, ...compute(values) }; }
  const fieldFacets: Record<string, { value: string; label: string; count: number }[]> = {};
  for (const row of facetRows) { const key = byId.get(row.fieldId)!.key; (fieldFacets[key] ??= []).push({ value: row.choiceId, label: row.label, count: row.count }); }
  return { customFields, fieldsByRecord, fieldFacets, fieldFileLabels, fieldUserLabels, fieldCustomerLabels };
}
