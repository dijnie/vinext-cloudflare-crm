import { and, asc, eq, gt, lt, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { customFieldDefinition as definition, customFieldValue as value, fieldConversionPreview as preview, fieldConversionGuard as conversion, fieldValueRevision, operationConditionGuard } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { authorizedBatch, requirePermission } from "../permissions/permission-policy";
import { fieldConfigSchema, fieldTypeSchema, type FieldConfig, type FieldType } from "./field-contracts";
import type { ConversionPreview } from "./field-conversion-contracts";
import { conversionColumns, conversionRejection, supportsConversion } from "./field-conversion-values";
import { validateFormulaGraph } from "./field-formula";
import { FieldRepository } from "./field-repository";
import { storedFieldValue } from "./field-storage";

function stale(): never { throw new HttpError(409, "conflict", "Field changed or preview expired; preview the conversion again"); }
function translate(error: unknown): never {
  if (error instanceof HttpError) throw error;
  let cause: unknown = error;
  while (cause && typeof cause === "object") {
    if (cause instanceof Error && /operation_conflict|field_\w+|constraint failed/i.test(cause.message)) stale();
    cause = "cause" in cause ? cause.cause : null;
  }
  throw error;
}

export class FieldConversionService {
  private repository: FieldRepository;
  constructor(private db: AppDatabase) { this.repository = new FieldRepository(db); }

  async preview(context: RequestContext, id: string, type: FieldType, config: FieldConfig): Promise<ConversionPreview> {
    await requirePermission(this.db, context, ["field.configure"]);
    const initial = await this.repository.byId(id);
    if (!initial) throw new HttpError(404, "not_found", "Field not found");
    const snapshot = await this.repository.configuration(initial.entity);
    const field = snapshot.fields.find(item => item.id === id && !item.deletedAt);
    if (!field) stale();
    const revisions = await this.db.select().from(fieldValueRevision).where(eq(fieldValueRevision.fieldId, id)).get();
    if (!revisions) stale();
    const result: ConversionPreview = { token: null, total: 0, convertible: 0, rejected: 0, reasons: [], examples: [] };
    let blocked: string | null = null;
    if (field.archivedAt) blocked = "inactive_field";
    else if (!supportsConversion(field.type, type)) blocked = "unsupported_conversion";
    else if (!fieldConfigSchema.safeParse(config).success || config.expression !== undefined || type !== "date" && config.dateTime !== undefined || type !== "rating" && config.ratingMax !== undefined) blocked = "invalid_configuration";
    if (!blocked) {
      try { validateFormulaGraph(snapshot.fields.map(item => item.id === id ? { ...item, type, configJson: JSON.stringify(config) } : item), field.key, false); }
      catch { blocked = "formula_dependency"; }
    }
    if (blocked) result.reasons.push(blocked);
    let cursor: string | null = null;
    while (true) {
      const rows = await this.db.select().from(value).where(and(eq(value.fieldId, id), cursor === null ? undefined : gt(value.id, cursor))).orderBy(asc(value.id)).limit(100);
      for (const row of rows) {
        result.total++;
        const reason = blocked ?? conversionRejection(field.type, type, config, storedFieldValue(field.type, row));
        if (reason) {
          result.rejected++;
          if (!result.reasons.includes(reason)) result.reasons.push(reason);
          if (result.examples.length < 5) result.examples.push({ recordId: row.companyId ?? row.contactId ?? row.dealId!, reason });
        } else result.convertible++;
      }
      if (rows.length < 100) break;
      cursor = rows.at(-1)!.id;
    }
    const token = crypto.randomUUID(), guardId = crypto.randomUUID(), now = Date.now();
    const snapshotPredicate = sql`exists(select 1 from field_configuration_revision where entity=${field.entity} and revision=${snapshot.revision}) and exists(select 1 from field_value_revision where field_id=${id} and revision=${revisions.revision})`;
    try {
      await authorizedBatch(this.db, context, ["field.configure"], [
        this.db.insert(operationConditionGuard).values({ id: guardId, authorized: sql<number>`case when ${snapshotPredicate} then 1 else 0 end` }),
        this.db.delete(preview).where(lt(preview.expiresAt, now)),
        this.db.delete(preview).where(and(eq(preview.fieldId, id), eq(preview.userId, context.userId))),
        ...(!blocked && result.rejected === 0 ? [this.db.insert(preview).values({ id: token, fieldId: id, userId: context.userId, sourceType: field.type, targetType: type, configJson: JSON.stringify(config), configurationRevision: snapshot.revision, valueRevision: revisions.revision, expiresAt: now + 15 * 60 * 1000 })] : []),
        this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, guardId)),
      ]);
    } catch (error) { translate(error); }
    if (!blocked && result.rejected === 0) result.token = token;
    return result;
  }

  async apply(context: RequestContext, id: string, token: string) {
    await requirePermission(this.db, context, ["field.configure"]);
    const row = await this.db.select().from(preview).where(and(eq(preview.id, token), eq(preview.fieldId, id), eq(preview.userId, context.userId))).get();
    if (!row || row.expiresAt <= Date.now()) stale();
    const source = fieldTypeSchema.parse(row.sourceType), target = fieldTypeSchema.parse(row.targetType);
    if (!supportsConversion(source, target)) stale();
    const guardId = crypto.randomUUID();
    try {
      await authorizedBatch(this.db, context, ["field.configure"], [
        this.db.insert(operationConditionGuard).values({ id: guardId, authorized: sql<number>`case when exists (
          select 1 from field_conversion_preview p
          join custom_field_definition f on f.id=p.field_id
          join field_configuration_revision c on c.entity=f.entity
          join field_value_revision v on v.field_id=f.id
          where p.id=${token} and p.field_id=${id} and p.user_id=${context.userId} and p.expires_at>${Date.now()}
          and f.type=p.source_type and f.archived_at is null and f.deleted_at is null
          and c.revision=p.configuration_revision and v.revision=p.value_revision
          and p.source_type=${source} and p.target_type=${target} and p.config_json=${row.configJson}
        ) then 1 else 0 end` }),
        this.db.insert(conversion).values({ fieldId: id, sourceType: source, targetType: target }),
        this.db.update(definition).set({ type: target, configJson: row.configJson, updatedAt: new Date() }).where(eq(definition.id, id)),
        this.db.update(value).set(conversionColumns(source, target)).where(eq(value.fieldId, id)),
        this.db.delete(conversion).where(eq(conversion.fieldId, id)),
        this.db.delete(preview).where(eq(preview.fieldId, id)),
        this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, guardId)),
      ]);
    } catch (error) { translate(error); }
  }
}
