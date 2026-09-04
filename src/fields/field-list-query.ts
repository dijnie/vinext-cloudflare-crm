import { and, asc, eq, isNull, or, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { company, contact, deal, customFieldDefinition as definition, customFieldOption as option, customFieldValue as value, user, singletonMembership } from "@/db/schema";
import type { EntityType } from "@/crm/list-state";
import { inJsonArray } from "@/crm/sql-filters";
import { HttpError } from "@/server/http-errors";

const tables = { company, contact, deal };
const anchors = { company: value.companyId, contact: value.contactId, deal: value.dealId };
type Filters = Record<string, string[]>;
type Scalar = string | number | boolean | null;

export async function validateFieldFilters(db: AppDatabase, entity: EntityType, filters: Filters) {
  const keys = Object.entries(filters).filter(([, values]) => values.length).map(([key]) => key);
  if (!keys.length) return;
  const rows = await db.select({ key: definition.key }).from(definition).where(and(eq(definition.entity, entity), isNull(definition.archivedAt), sql`${definition}.deleted_at is null`, eq(definition.showOnFilter, true), inJsonArray(definition.type, ["select", "user"]), inJsonArray(definition.key, keys)));
  if (rows.length !== keys.length) throw new HttpError(400, "validation_failed", "Field filter is unavailable");
}

export function fieldFilterConditions(entity: EntityType, filters: Filters): SQL[] {
  return Object.entries(filters).filter(([, values]) => values.length).map(([key, selected]) => sql`exists (
    select 1 from ${value} inner join ${definition} on ${definition.id} = ${value.fieldId}
    where ${anchors[entity]} = ${tables[entity].id} and ${definition.entity} = ${entity}
    and ${definition.key} = ${key} and ${definition.archivedAt} is null and ${definition}.deleted_at is null
    and ${definition.showOnFilter} = 1 and (
      (${definition.type} = 'select' and ${inJsonArray(value.optionId, selected)}) or
      (${definition.type} = 'user' and ${inJsonArray(value.userMembershipId, selected)})
    ))`);
}

export async function fieldListData(db: AppDatabase, entity: EntityType, ids: string[], facetWhere: SQL) {
  const definitions = await db.select().from(definition).where(and(eq(definition.entity, entity), isNull(definition.archivedAt), sql`${definition}.deleted_at is null`)).orderBy(asc(definition.position), asc(definition.id));
  const definitionIds = definitions.map(field => field.id);
  const options = definitionIds.length ? await db.select().from(option).where(inJsonArray(option.fieldId, definitionIds)).orderBy(asc(option.position), asc(option.id)) : [];
  const customFields = definitions.map(field => ({ id: field.id, entity: field.entity, key: field.key, label: field.label, type: field.type, required: field.required, showOnSheet: field.showOnSheet, showOnTable: field.showOnTable, showOnFilter: field.showOnFilter, position: field.position, archivedAt: null, options: options.filter(item => item.fieldId === field.id).map(item => ({ id: item.id, label: item.label, position: item.position, archivedAt: item.archivedAt?.toISOString() ?? null })) }));
  const byId = new Map(definitions.map(field => [field.id, field]));
  const values = ids.length && definitionIds.length ? await db.select().from(value).where(and(inJsonArray(anchors[entity], ids), inJsonArray(value.fieldId, definitionIds))) : [];
  const memberIds = [...new Set(values.flatMap(row => row.userMembershipId ? [row.userMembershipId] : []))];
  const members = memberIds.length ? await db.select({ id: user.id, name: user.name, email: user.email }).from(user).where(inJsonArray(user.id, memberIds)) : [];
  const fieldUserLabels = Object.fromEntries(members.map(member => [member.id, member.name || member.email]));
  const fieldsByRecord: Record<string, Record<string, Scalar>> = {};
  for (const row of values) {
    const field = byId.get(row.fieldId)!;
    const recordId = row.companyId ?? row.contactId ?? row.dealId!;
    const scalar = field.type === "number" ? row.numberValue : field.type === "date" ? row.dateValue?.toISOString() ?? null : field.type === "checkbox" ? row.booleanValue : field.type === "select" ? row.optionId : field.type === "user" ? row.userMembershipId : row.textValue;
    (fieldsByRecord[recordId] ??= {})[field.key] = scalar;
  }
  const fieldFacets: Record<string, { value: string; label: string; count: number }[]> = {};
  const filterIds = definitions.filter(field => field.showOnFilter && ["select", "user"].includes(field.type)).map(field => field.id);
  if (filterIds.length) {
    const rows = await db.select({ fieldId: value.fieldId, optionId: value.optionId, memberId: value.userMembershipId, label: sql<string>`coalesce(${option.label}, ${user.name}, '')`, count: sql<number>`count(*)` }).from(value)
      .innerJoin(tables[entity], eq(anchors[entity], tables[entity].id))
      .leftJoin(option, eq(option.id, value.optionId)).leftJoin(user, eq(user.id, value.userMembershipId)).leftJoin(singletonMembership, eq(singletonMembership.userId, value.userMembershipId))
      .where(and(facetWhere, inJsonArray(value.fieldId, filterIds), or(and(sql`${value.optionId} is not null`, isNull(option.archivedAt)), and(sql`${value.userMembershipId} is not null`, eq(singletonMembership.status, "active")))))
      .groupBy(value.fieldId, value.optionId, value.userMembershipId, option.label, user.name).orderBy(asc(value.fieldId), asc(option.label), asc(user.name)).limit(2000);
    for (const row of rows) { const key = byId.get(row.fieldId)!.key; (fieldFacets[key] ??= []).push({ value: row.optionId ?? row.memberId!, label: row.label, count: row.count }); }
  }
  return { customFields, fieldsByRecord, fieldFacets, fieldUserLabels };
}
