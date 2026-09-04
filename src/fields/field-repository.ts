import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { inJsonArray } from "@/crm/sql-filters";
import type { AppDatabase } from "@/db/client";
import { customFieldDefinition as definition, customFieldOption as option, customFieldValue as value } from "@/db/schema";
import type { FieldEntity } from "./field-contracts";

export class FieldRepository {
  constructor(readonly db: AppDatabase) {}
  list(entity: FieldEntity, includeArchived = false) { return this.db.select().from(definition).where(and(eq(definition.entity, entity), isNull(definition.deletedAt), includeArchived ? undefined : isNull(definition.archivedAt))).orderBy(asc(definition.position), asc(definition.id)); }
  byId(id: string, includeDeleted = false) { return this.db.select().from(definition).where(and(eq(definition.id, id), includeDeleted ? undefined : isNull(definition.deletedAt))).get(); }
  options(ids: string[]) { return ids.length ? this.db.select().from(option).where(inJsonArray(option.fieldId, ids)).orderBy(asc(option.position), asc(option.id)) : Promise.resolve([]); }
  values(entity: FieldEntity, recordId: string) { return this.db.select().from(value).where(eq(value[recordColumn(entity)], recordId)); }
  async hasValues(id: string) { return Boolean(await this.db.select({ id: value.id }).from(value).where(eq(value.fieldId, id)).get()); }
  async nextPosition(entity: FieldEntity) { const row = await this.db.select({ position: sql<number>`coalesce(max(${definition.position}), -1) + 1` }).from(definition).where(eq(definition.entity, entity)).get(); return row?.position ?? 0; }
}
export function recordColumn(entity: FieldEntity) { return entity === "company" ? "companyId" : entity === "contact" ? "contactId" : "dealId"; }
