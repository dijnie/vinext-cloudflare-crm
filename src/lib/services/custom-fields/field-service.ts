import { authorizedBatch, authorizedWrite, requirePermission } from "../permissions/permission-policy";
import { and, count, eq, isNull, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { company, contact, deal, singletonMembership, operationConditionGuard, customFieldDefinition as definition, customFieldOption as option, customFieldValue as value } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import { relationError } from "@/lib/services/shared/service-utils";
import type { RequestContext } from "@/lib/http/request-context";
import { fieldKeyFromLabel, type FieldCreateInput, type FieldDefinition, type FieldEntity, type FieldUpdateData, type FieldValue } from "./field-contracts";
import { formulaExpression } from "./formula-query";
import { formulaEvaluator, validateFormulaGraph } from "./field-formula";
import { fieldConfig, storedFieldValue } from "./field-storage";
import { moneyFieldValueSchema, fieldConfigSchema, type FieldConfig } from "./field-contracts";
import { FieldRepository, recordColumn } from "./field-repository";
import { FieldConversionService } from "./field-conversion-service";
import type { FieldType } from "./field-contracts";

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
  const conflicts = ["operation_conflict", "field_unavailable", "field_type_has_values", "field_option_unavailable", "field_option_mismatch", "field_entity_mismatch", "field_value_type_mismatch", "field_member_inactive", "field_rating_invalid", "field_rating_has_values", "field_json_value_invalid", "field_money_invalid", "field_customer_unavailable"];
  if (conflicts.some(code => detail.includes(code)) || detail.includes("check constraint failed") && /authorized\W*=\W*1/.test(detail)) conflict(message);
  relationError(error, message);
}
type DefinitionRow = typeof definition.$inferSelect;
type OptionRow = typeof option.$inferSelect;
export class FieldService {
  private readonly repository: FieldRepository;
  constructor(private readonly db: AppDatabase) { this.repository = new FieldRepository(db); }
  private guard(context: RequestContext) { return requirePermission(this.db, context); }
  private async existing(id: string, deleted = false) { const row = await this.repository.byId(id, deleted); if (!row) throw new HttpError(404, "not_found", "Field not found"); return row; }
  private serialize(row: DefinitionRow, options: OptionRow[]): FieldDefinition { return { id: row.id, entity: row.entity, key: row.key, label: row.label, type: row.type, config: fieldConfig(row.configJson), required: row.required, showOnSheet: row.showOnSheet, showOnTable: row.showOnTable, showOnFilter: row.showOnFilter, position: row.position, archivedAt: row.archivedAt?.toISOString() ?? null, options: options.filter(item => item.fieldId === row.id).map(item => ({ id: item.id, label: item.label, position: item.position, archivedAt: item.archivedAt?.toISOString() ?? null })) }; }
  async list(context: RequestContext, input: { entity: FieldEntity; includeArchived?: boolean }) { await this.guard(context); const rows = await this.repository.list(input.entity, input.includeArchived); const options = await this.repository.options(rows.map(row => row.id)); return rows.map(row => this.serialize(row, options)); }
  async byId(context: RequestContext, id: string) { await this.guard(context); const row = await this.existing(id); return this.serialize(row, await this.repository.options([id])); }
  previewConversion(context: RequestContext, id: string, type: FieldType, config: FieldConfig) { return new FieldConversionService(this.db).preview(context, id, type, config); }
  async applyConversion(context: RequestContext, id: string, token: string) { await new FieldConversionService(this.db).apply(context, id, token); return this.byId(context, id); }
  private configurationGuard(entity: FieldEntity, revision: number) {
    const id = crypto.randomUUID();
    return {
      begin: this.db.insert(operationConditionGuard).values({ id, authorized: sql<number>`case when exists (select 1 from field_configuration_revision where entity=${entity} and revision=${revision}) then 1 else 0 end` }),
      end: this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, id)),
    };
  }
  private graph(fields: DefinitionRow[], changed: { key: string; type: string; configJson: string | null; archivedAt: Date | null; deletedAt: Date | null }, strict: boolean) {
    try { validateFormulaGraph([...fields.filter(field => field.key !== changed.key), changed], changed.key, strict); }
    catch (error) { invalid(error instanceof Error ? error.message : "Invalid formula graph"); }
  }
  async create(context: RequestContext, input: FieldCreateInput) {
    await requirePermission(this.db, context, ["field.configure"]);
    if (input.options.some(item => item.id)) invalid("New options cannot provide IDs");
    this.validateOptions(input.type, input.options);
    this.validateConfig(input.type, input.config ?? {});
    const key = fieldKeyFromLabel(input.label);
    const snapshot = await this.repository.configuration(input.entity);
    const reserved = snapshot.fields;
    if (reserved.some(row => row.key === key)) conflict("Field key is already reserved");
    if (input.type === "formula" && input.required) invalid("Computed fields cannot be required inputs");
    const id = crypto.randomUUID(), now = new Date(); const { options, config, ...data } = input;
    this.graph(snapshot.fields, { key, type: input.type, configJson: config ? JSON.stringify(config) : null, archivedAt: null, deletedAt: null }, input.type === "formula");
    const configuration = this.configurationGuard(input.entity, snapshot.revision);
    try { await authorizedBatch(this.db, context, ["field.configure"], [configuration.begin, this.db.insert(definition).values({ ...data, configJson: config ? JSON.stringify(config) : null, id, key, position: await this.repository.nextPosition(input.entity), createdAt: now, updatedAt: now }), ...options.map((item, position) => this.db.insert(option).values({ id: crypto.randomUUID(), fieldId: id, label: item.label, position })), configuration.end]); } catch (error) { translateWriteError(error, "Field changed during creation"); }
    return this.byId(context, id);
  }
  private validateOptions(type: string, options: { label: string }[]) { if (["select", "multiselect"].includes(type) && options.length === 0) invalid("Select needs an option"); if (!["select", "multiselect"].includes(type) && options.length) invalid("Only select fields have options"); if (new Set(options.map(item => item.label.toLocaleLowerCase())).size !== options.length) invalid("Option labels must be unique"); }
  private validateConfig(type: string, config: FieldConfig) {
    if (!fieldConfigSchema.safeParse(config).success || type !== "rating" && config.ratingMax !== undefined || type !== "formula" && config.expression !== undefined || type === "formula" && !config.expression) invalid("Configuration is not supported for this type");
  }
  async update(context: RequestContext, id: string, input: FieldUpdateData) {
    await requirePermission(this.db, context, ["field.configure"]);
    const initial = await this.existing(id), snapshot = await this.repository.configuration(initial.entity);
    const row = snapshot.fields.find(field => field.id === id && !field.deletedAt);
    if (!row) throw new HttpError(404, "not_found", "Field not found");
    const existing = await this.repository.options([id]);
    const type = input.type ?? row.type;
    if (row.type === "formula" && type !== row.type) conflict("Computed fields cannot be converted to stored inputs");
    const config = input.config ?? (type === row.type ? fieldConfig(row.configJson) : {});
    this.validateConfig(type, config);
    if (type === "formula" && (input.required ?? row.required)) invalid("Computed fields cannot be required inputs");
    this.graph(snapshot.fields, { ...row, type, configJson: JSON.stringify(config) }, type === "formula" && (input.config?.expression !== undefined || type !== row.type));
    const configuration = this.configurationGuard(row.entity, snapshot.revision);
    if (type !== row.type && await this.repository.hasValues(id)) conflict("A field with stored values cannot change type");
    this.validateOptions(type, input.options ?? (["select", "multiselect"].includes(type) ? existing.filter(item => !item.archivedAt) : []));
    if (input.options) { const ids = input.options.flatMap(item => item.id ? [item.id] : []); if (new Set(ids).size !== ids.length || ids.some(optionId => !existing.some(item => item.id === optionId))) invalid("Option does not belong to this field"); }
    const { options, config: ignoredConfig, ...data } = input; const now = new Date();
    const mutations = [this.db.update(definition).set({ ...data, ...(input.config !== undefined || type !== row.type ? { configJson: JSON.stringify(config) } : {}), updatedAt: now }).where(and(eq(definition.id, id), isNull(definition.deletedAt)))];
    const optionWrites = options && ["select", "multiselect"].includes(type) ? [this.db.update(option).set({ archivedAt: now }).where(eq(option.fieldId, id)), ...options.map((item, position) => item.id ? this.db.update(option).set({ label: item.label, position, archivedAt: null }).where(and(eq(option.id, item.id), eq(option.fieldId, id))) : this.db.insert(option).values({ id: crypto.randomUUID(), fieldId: id, label: item.label, position }))] : [];
    try { await authorizedBatch(this.db, context, ["field.configure"], [configuration.begin, mutations[0]!, ...optionWrites, configuration.end]); } catch (error) { translateWriteError(error, "Field changed during update"); }
    return this.byId(context, id);
  }
  async reorder(context: RequestContext, input: { entity: FieldEntity; ids: string[] }) { await requirePermission(this.db, context, ["field.configure"]); const rows = await this.repository.list(input.entity, true); if (input.ids.length !== rows.length || new Set(input.ids).size !== rows.length || input.ids.some(id => !rows.some(row => row.id === id))) invalid("Order must contain all fields on this entity"); const updates = input.ids.map((id, position) => this.db.update(definition).set({ position, updatedAt: new Date() }).where(and(eq(definition.id, id), eq(definition.entity, input.entity), isNull(definition.deletedAt)))); if (updates.length) await authorizedBatch(this.db, context, ["field.configure"], [updates[0]!, ...updates.slice(1)]); return this.list(context, { entity: input.entity, includeArchived: true }); }
  private async lifecycle(context: RequestContext, id: string, action: "archive" | "restore" | "recover") { await requirePermission(this.db, context, ["field.configure"]); const row = await this.existing(id, action === "recover"); if (action === "recover" && !row.deletedAt) conflict("Field is not deleted"); await authorizedWrite(this.db, context, ["field.configure"], this.db.update(definition).set(action === "recover" ? { deletedAt: null, updatedAt: new Date() } : { archivedAt: action === "archive" ? new Date() : null, updatedAt: new Date() }).where(eq(definition.id, id))); return this.byId(context, id); }
  archive(context: RequestContext, id: string) { return this.lifecycle(context, id, "archive"); }
  restore(context: RequestContext, id: string) { return this.lifecycle(context, id, "restore"); }
  recover(context: RequestContext, id: string) { return this.lifecycle(context, id, "recover"); }
  async delete(context: RequestContext, id: string, confirmation: string) { await requirePermission(this.db, context, ["field.configure"]); const row = await this.existing(id); if (confirmation !== row.key) invalid("Confirmation must match the stable field key"); await authorizedWrite(this.db, context, ["field.configure"], this.db.update(definition).set({ deletedAt: new Date(), updatedAt: new Date() }).where(and(eq(definition.id, id), isNull(definition.deletedAt)))); return { id }; }
  async coverage(context: RequestContext, id: string) { await this.guard(context); const row = await this.existing(id); const table = row.entity === "company" ? company : row.entity === "contact" ? contact : deal; if (row.type === "formula") {
      const fields = (await this.repository.configuration(row.entity)).fields;
      const expression = formulaExpression(fields, row.key, row.entity, sql`${table.id}`);
      const result = await this.db.select({ total: count(), filled: sql<number>`coalesce(sum(case when ${expression} is not null then 1 else 0 end),0)` }).from(table).get();
      return result ?? { total: 0, filled: 0 };
    }
    const [total, filled] = await Promise.all([this.db.select({ count: count() }).from(table).get(), this.db.select({ count: count() }).from(value).where(and(eq(value.fieldId, id), sql`coalesce(${value.textValue}, ${value.numberValue}, ${value.dateValue}, ${value.booleanValue}, ${value.optionId}, ${value.userMembershipId}, ${value.jsonValue}, ${value.customerReferenceId}) is not null`)).get()]); return { total: total?.count ?? 0, filled: filled?.count ?? 0 }; }
  private async record(entity: FieldEntity, id: string) { const table = entity === "company" ? company : entity === "contact" ? contact : deal; if (!(await this.db.select({ id: table.id }).from(table).where(eq(table.id, id)).get())) throw new HttpError(404, "not_found", "Record not found"); }
  async values(context: RequestContext, input: { entity: FieldEntity; recordId: string }) { await this.guard(context); await this.record(input.entity, input.recordId); const fields = await this.repository.list(input.entity); const values = await this.repository.values(input.entity, input.recordId); const stored = Object.fromEntries(fields.map(field => { const row = values.find(item => item.fieldId === field.id); return [field.key, storedFieldValue(field.type, row)]; })) as Record<string, FieldValue>; return { ...stored, ...formulaEvaluator(fields)(stored) }; }
  async writeValues(context: RequestContext, input: { entity: FieldEntity; recordId: string; values: Record<string, FieldValue> }) {
    await requirePermission(this.db, context, [`${input.entity}.update`]); await this.record(input.entity, input.recordId); const fields = await this.repository.list(input.entity); const options = await this.repository.options(fields.map(field => field.id));
    const writes = [];
    for (const [key, raw] of Object.entries(input.values)) {
      const field = fields.find(item => item.key === key); if (!field) invalid("Unknown or archived field");
      if (field.type === "formula") invalid("Computed fields are read-only");
      const data = { jsonValue: null as string | null, customerReferenceId: null as string | null, textValue: null as string | null, numberValue: null as number | null, dateValue: null as Date | null, booleanValue: null as boolean | null, optionId: null as string | null, userMembershipId: null as string | null, updatedAt: new Date() };
      const blank = raw === null || ["multiselect", "multivalue"].includes(field.type) && Array.isArray(raw) && raw.length === 0 || typeof raw === "string" && raw.trim() === "";
      if (blank && field.required) invalid("Required field cannot be empty");
      if (!blank) {
        if (field.type === "money") {
          const parsed = moneyFieldValueSchema.safeParse(raw); if (!parsed.success) invalid("Expected currency and integer minor units");
          data.jsonValue = JSON.stringify(parsed.data);
        }
        else if (field.type === "multiselect" || field.type === "multivalue") {
          if (!Array.isArray(raw) || raw.length > 100 || raw.some(item => typeof item !== "string" || !item.trim() || item.trim().length > 2000)) invalid("Expected a bounded text array");
          const items = raw.map(item => item.trim());
          if (new Set(items).size !== items.length) invalid("Duplicate values are not allowed");
          if (field.type === "multiselect" && items.some(id => !options.some(item => item.id === id && item.fieldId === field.id && !item.archivedAt))) invalid("Invalid option");
          data.jsonValue = JSON.stringify(items);
        }
        else if (field.type === "rating") {
          if (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > (fieldConfig(field.configJson).ratingMax ?? 5)) invalid("Rating is outside the configured range");
          data.numberValue = raw;
        }
        else if (field.type === "customer") {
          if (typeof raw !== "string" || !(await this.db.select({ id: contact.id }).from(contact).where(and(eq(contact.id, raw), isNull(contact.archivedAt))).get())) invalid("Expected an active customer");
          data.customerReferenceId = raw;
        }
        else if (field.type === "number") { if (typeof raw !== "number" || !Number.isFinite(raw)) invalid("Expected number"); data.numberValue = raw; }
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
        return { id: field.id, type: field.type, required: field.required ? 1 : 0, config: field.configJson };
      });
      try {
        await authorizedBatch(this.db, context, [`${input.entity}.update`], [
          this.db.insert(operationConditionGuard).values({ id: operationId, authorized: sql<number>`case when not exists (
            select 1 from json_each(${JSON.stringify(expected)}) as wanted
            where not exists (select 1 from custom_field_definition as f
              where f.id=json_extract(wanted.value,'$.id') and f.type=json_extract(wanted.value,'$.type')
                and f.required=json_extract(wanted.value,'$.required') and f.config_json is json_extract(wanted.value,'$.config') and f.archived_at is null and f.deleted_at is null)
          ) and exists (select 1 from singleton_membership where user_id=${context.membershipId} and status='active') then 1 else 0 end` }),
          ...writes,
          this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, operationId)),
        ]);
      } catch (error) { translateWriteError(error, "Field or record changed before values were saved"); }
    }
    return this.values(context, input);
  }
}
