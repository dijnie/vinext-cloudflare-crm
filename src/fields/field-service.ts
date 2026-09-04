import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { company, contact, deal, singletonMembership, memberOperationGuard, customFieldDefinition as definition, customFieldOption as option, customFieldValue as value } from "@/db/schema";
import { HttpError } from "@/server/http-errors";
import { relationError } from "@/crm/service-utils";
import type { RequestContext } from "@/server/request-context";
import { fieldKeyFromLabel, type FieldCreateInput, type FieldDefinition, type FieldEntity, type FieldUpdateData, type FieldValue } from "./field-contracts";
import { FieldRepository, recordColumn } from "./field-repository";

function invalid(message: string): never { throw new HttpError(400, "validation_failed", message); }
function conflict(message: string): never { throw new HttpError(409, "conflict", message); }
function translateWriteError(error: unknown, message: string): never {
  const messages: string[] = [];
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (current instanceof Error) messages.push(current.message.toLowerCase());
    current = "cause" in current ? current.cause : null;
  }
  const detail = messages.join(" ");
  const conflicts = ["field_unavailable", "field_type_has_values", "field_option_unavailable", "field_option_mismatch", "field_entity_mismatch", "field_value_type_mismatch", "field_member_inactive"];
  if (conflicts.some(code => detail.includes(code)) || detail.includes("check constraint failed") && /authorized\W*=\W*1/.test(detail)) conflict(message);
  relationError(error, message);
}
type DefinitionRow = typeof definition.$inferSelect;
type OptionRow = typeof option.$inferSelect;
export class FieldService {
  private readonly repository: FieldRepository;
  constructor(private readonly db: AppDatabase) { this.repository = new FieldRepository(db); }
  private async guard(context: RequestContext) {
    if (!context.userId || !context.membershipId || !(await this.db.select({ id: singletonMembership.userId }).from(singletonMembership).where(and(eq(singletonMembership.userId, context.membershipId), eq(singletonMembership.status, "active"))).get())) throw new HttpError(403, "membership_required", "Active membership required");
  }
  private async existing(id: string, deleted = false) { const row = await this.repository.byId(id, deleted); if (!row) throw new HttpError(404, "not_found", "Field not found"); return row; }
  private serialize(row: DefinitionRow, options: OptionRow[]): FieldDefinition { return { id: row.id, entity: row.entity, key: row.key, label: row.label, type: row.type, required: row.required, showOnSheet: row.showOnSheet, showOnTable: row.showOnTable, showOnFilter: row.showOnFilter, position: row.position, archivedAt: row.archivedAt?.toISOString() ?? null, options: options.filter(item => item.fieldId === row.id).map(item => ({ id: item.id, label: item.label, position: item.position, archivedAt: item.archivedAt?.toISOString() ?? null })) }; }
  async list(context: RequestContext, input: { entity: FieldEntity; includeArchived?: boolean }) { await this.guard(context); const rows = await this.repository.list(input.entity, input.includeArchived); const options = await this.repository.options(rows.map(row => row.id)); return rows.map(row => this.serialize(row, options)); }
  async byId(context: RequestContext, id: string) { await this.guard(context); const row = await this.existing(id); return this.serialize(row, await this.repository.options([id])); }
  async create(context: RequestContext, input: FieldCreateInput) {
    await this.guard(context);
    if (input.options.some(item => item.id)) invalid("New options cannot provide IDs");
    this.validateOptions(input.type, input.options);
    const key = fieldKeyFromLabel(input.label);
    const reserved = await this.db.select({ key: definition.key }).from(definition).where(eq(definition.entity, input.entity));
    if (reserved.some(row => row.key === key)) conflict("Field key is already reserved");
    const id = crypto.randomUUID(), now = new Date(); const { options, ...data } = input;
    try { await this.db.batch([this.db.insert(definition).values({ ...data, id, key, position: await this.repository.nextPosition(input.entity), createdAt: now, updatedAt: now }), ...options.map((item, position) => this.db.insert(option).values({ id: crypto.randomUUID(), fieldId: id, label: item.label, position }))]); } catch (error) { translateWriteError(error, "Field changed during creation"); }
    return this.byId(context, id);
  }
  private validateOptions(type: string, options: { label: string }[]) { if (type === "select" && options.length === 0) invalid("Select needs an option"); if (type !== "select" && options.length) invalid("Only select fields have options"); if (new Set(options.map(item => item.label.toLocaleLowerCase())).size !== options.length) invalid("Option labels must be unique"); }
  async update(context: RequestContext, id: string, input: FieldUpdateData) {
    await this.guard(context); const row = await this.existing(id); const existing = await this.repository.options([id]);
    const type = input.type ?? row.type;
    if (type !== row.type && await this.repository.hasValues(id)) conflict("A field with stored values cannot change type");
    this.validateOptions(type, input.options ?? (type === "select" ? existing.filter(item => !item.archivedAt) : []));
    if (input.options) { const ids = input.options.flatMap(item => item.id ? [item.id] : []); if (new Set(ids).size !== ids.length || ids.some(optionId => !existing.some(item => item.id === optionId))) invalid("Option does not belong to this field"); }
    const { options, ...data } = input; const now = new Date();
    const mutations = [this.db.update(definition).set({ ...data, updatedAt: now }).where(and(eq(definition.id, id), isNull(definition.deletedAt)))];
    const optionWrites = options && type === "select" ? [this.db.update(option).set({ archivedAt: now }).where(eq(option.fieldId, id)), ...options.map((item, position) => item.id ? this.db.update(option).set({ label: item.label, position, archivedAt: null }).where(and(eq(option.id, item.id), eq(option.fieldId, id))) : this.db.insert(option).values({ id: crypto.randomUUID(), fieldId: id, label: item.label, position }))] : [];
    try { await this.db.batch([mutations[0]!, ...optionWrites]); } catch (error) { translateWriteError(error, "Field changed during update"); }
    return this.byId(context, id);
  }
  async reorder(context: RequestContext, input: { entity: FieldEntity; ids: string[] }) { await this.guard(context); const rows = await this.repository.list(input.entity, true); if (input.ids.length !== rows.length || new Set(input.ids).size !== rows.length || input.ids.some(id => !rows.some(row => row.id === id))) invalid("Order must contain all fields on this entity"); const updates = input.ids.map((id, position) => this.db.update(definition).set({ position, updatedAt: new Date() }).where(and(eq(definition.id, id), eq(definition.entity, input.entity), isNull(definition.deletedAt)))); if (updates.length) await this.db.batch([updates[0]!, ...updates.slice(1)]); return this.list(context, { entity: input.entity, includeArchived: true }); }
  private async lifecycle(context: RequestContext, id: string, action: "archive" | "restore" | "recover") { await this.guard(context); const row = await this.existing(id, action === "recover"); if (action === "recover" && !row.deletedAt) conflict("Field is not deleted"); await this.db.update(definition).set(action === "recover" ? { deletedAt: null, updatedAt: new Date() } : { archivedAt: action === "archive" ? new Date() : null, updatedAt: new Date() }).where(eq(definition.id, id)); return this.byId(context, id); }
  archive(context: RequestContext, id: string) { return this.lifecycle(context, id, "archive"); }
  restore(context: RequestContext, id: string) { return this.lifecycle(context, id, "restore"); }
  recover(context: RequestContext, id: string) { return this.lifecycle(context, id, "recover"); }
  async delete(context: RequestContext, id: string, confirmation: string) { await this.guard(context); const row = await this.existing(id); if (confirmation !== row.key) invalid("Confirmation must match the stable field key"); await this.db.update(definition).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(definition.id, id), isNull(definition.deletedAt))); return { id }; }
  async coverage(context: RequestContext, id: string) { await this.guard(context); const row = await this.existing(id); const table = row.entity === "company" ? company : row.entity === "contact" ? contact : deal; const [total, filled] = await Promise.all([this.db.select({ count: count() }).from(table).get(), this.db.select({ count: count() }).from(value).where(and(eq(value.fieldId, id), sql`coalesce(${value.textValue}, ${value.numberValue}, ${value.dateValue}, ${value.booleanValue}, ${value.optionId}, ${value.userMembershipId}) is not null`)).get()]); return { total: total?.count ?? 0, filled: filled?.count ?? 0 }; }
  private async record(entity: FieldEntity, id: string) { const table = entity === "company" ? company : entity === "contact" ? contact : deal; if (!(await this.db.select({ id: table.id }).from(table).where(eq(table.id, id)).get())) throw new HttpError(404, "not_found", "Record not found"); }
  async values(context: RequestContext, input: { entity: FieldEntity; recordId: string }) { await this.guard(context); await this.record(input.entity, input.recordId); const fields = await this.repository.list(input.entity); const values = await this.repository.values(input.entity, input.recordId); return Object.fromEntries(fields.map(field => { const row = values.find(item => item.fieldId === field.id); return [field.key, !row ? null : field.type === "date" ? row.dateValue?.toISOString() ?? null : field.type === "number" ? row.numberValue : field.type === "checkbox" ? row.booleanValue : field.type === "select" ? row.optionId : field.type === "user" ? row.userMembershipId : row.textValue]; })) as Record<string, FieldValue>; }
  async writeValues(context: RequestContext, input: { entity: FieldEntity; recordId: string; values: Record<string, FieldValue> }) {
    await this.guard(context); await this.record(input.entity, input.recordId); const fields = await this.repository.list(input.entity); const options = await this.repository.options(fields.map(field => field.id));
    const writes = [];
    for (const [key, raw] of Object.entries(input.values)) {
      const field = fields.find(item => item.key === key); if (!field) invalid("Unknown or archived field");
      const data = { textValue: null as string | null, numberValue: null as number | null, dateValue: null as Date | null, booleanValue: null as boolean | null, optionId: null as string | null, userMembershipId: null as string | null, updatedAt: new Date() };
      const blank = raw === null || typeof raw === "string" && raw.trim() === "";
      if (blank && field.required) invalid("Required field cannot be empty");
      if (!blank) {
        if (field.type === "number") { if (typeof raw !== "number" || !Number.isFinite(raw)) invalid("Expected number"); data.numberValue = raw; }
        else if (field.type === "checkbox") { if (typeof raw !== "boolean") invalid("Expected boolean"); data.booleanValue = raw; }
        else { if (typeof raw !== "string") invalid("Expected text"); const text = raw.trim();
          if (field.type === "date") { if (!/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z)?$/.test(text) || !Number.isFinite(Date.parse(text)) || new Date(text).toISOString().slice(0, 10) !== text.slice(0, 10)) invalid("Expected ISO date"); data.dateValue = new Date(text); }
          else if (field.type === "select") { if (!options.some(item => item.fieldId === field.id && item.id === text && !item.archivedAt)) invalid("Invalid option"); data.optionId = text; }
          else if (field.type === "user") { if (!(await this.db.select({ id: singletonMembership.userId }).from(singletonMembership).where(and(eq(singletonMembership.userId, text), eq(singletonMembership.status, "active"))).get())) invalid("Expected active member"); data.userMembershipId = text; }
          else { if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) invalid("Expected email"); if (field.type === "url") { try { if (!["https:", "http:"].includes(new URL(text).protocol)) invalid("Expected HTTP URL"); } catch { invalid("Expected URL"); } } data.textValue = text; }
        }
      }
      const column = recordColumn(input.entity);
      writes.push(blank ? this.db.delete(value).where(and(eq(value.fieldId, field.id), eq(value[column], input.recordId))) : this.db.insert(value).values({ ...data, id: crypto.randomUUID(), fieldId: field.id, [column]: input.recordId }).onConflictDoUpdate({ target: [value.fieldId, value[column]], set: data }));
    }
    if (writes.length) {
      const operationId = crypto.randomUUID();
      const expected = Object.keys(input.values).map(key => {
        const field = fields.find(item => item.key === key)!;
        return { id: field.id, type: field.type, required: field.required ? 1 : 0 };
      });
      try {
        await this.db.batch([
          this.db.insert(memberOperationGuard).values({ id: operationId, authorized: sql<number>`case when not exists (
            select 1 from json_each(${JSON.stringify(expected)}) as wanted
            where not exists (select 1 from custom_field_definition as f
              where f.id=json_extract(wanted.value,'$.id') and f.type=json_extract(wanted.value,'$.type')
                and f.required=json_extract(wanted.value,'$.required') and f.archived_at is null and f.deleted_at is null)
          ) and exists (select 1 from singleton_membership where user_id=${context.membershipId} and status='active') then 1 else 0 end` }),
          ...writes,
          this.db.delete(memberOperationGuard).where(eq(memberOperationGuard.id, operationId)),
        ]);
      } catch (error) { translateWriteError(error, "Field or record changed before values were saved"); }
    }
    return this.values(context, input);
  }
}
