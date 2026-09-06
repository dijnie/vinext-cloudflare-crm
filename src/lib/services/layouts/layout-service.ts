import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { recordLayout } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import type { FieldEntity } from "../custom-fields/field-contracts";
import { FieldRepository } from "../custom-fields/field-repository";
import { FieldService } from "../custom-fields/field-service";
import { actionGuard, permissionError, permissionPredicate, requirePermission } from "../permissions/permission-policy";
import { layoutCatalog } from "./layout-catalog";
import { layoutEntrySchema, layoutIdentity, layoutUpdateSchema, type LayoutEntry, type LayoutSettings, type LayoutUpdate } from "./layout-contracts";

export class LayoutService {
  constructor(private readonly db: AppDatabase) {}
  private async snapshot(context: RequestContext, entity: FieldEntity) {
    const repository = new FieldRepository(this.db);
    const configuration = await repository.configuration(entity);
    const definitions = await new FieldService(this.db).list(context, { entity });
    const row = await this.db.select({ entity: recordLayout.entity, revision: recordLayout.revision, fieldsJson: recordLayout.fieldsJson, canManage: sql<number>`${permissionPredicate(context, [], true)}` }).from(recordLayout).where(and(eq(recordLayout.entity, entity), permissionPredicate(context))).get();
    if (!row) throw new HttpError(403, "membership_required", "Layout is unavailable");
    const stored = row.fieldsJson === "null" ? [] : layoutEntrySchema.array().parse(JSON.parse(row.fieldsJson));
    const catalog = layoutCatalog(entity, definitions);
    return { row, stored, catalog, definitions, configurationRevision: configuration.revision };
  }
  async get(context: RequestContext, input: { entity: FieldEntity }): Promise<LayoutSettings> {
    await requirePermission(this.db, context);
    const { row, stored, catalog, definitions } = await this.snapshot(context, input.entity);
    const byIdentity = new Map(catalog.map(field => [layoutIdentity(field), field]));
    const seen = new Set<string>();
    const fields = [...stored, ...catalog].flatMap(entry => {
      const identity = layoutIdentity(entry), field = byIdentity.get(identity);
      if (!field || seen.has(identity)) return [];
      seen.add(identity);
      return [{ ...field, visible: field.required && field.surfaces.includes("create") ? true : entry.visible }];
    });
    return { entity: row.entity, revision: row.revision, configured: row.fieldsJson !== "null", canManage: Boolean(row.canManage), fields, definitions };
  }
  async update(context: RequestContext, raw: LayoutUpdate): Promise<LayoutSettings> {
    await requirePermission(this.db, context, [], true);
    const parsed = layoutUpdateSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, "validation_failed", "Invalid layout");
    const input = parsed.data;
    const { row, stored, catalog, configurationRevision } = await this.snapshot(context, input.entity);
    if (row.revision !== input.revision) throw new HttpError(409, "conflict", "Layout changed; reload before saving");
    const active = new Map(catalog.map(field => [layoutIdentity(field), field]));
    const identities = input.fields.map(layoutIdentity);
    if (new Set(identities).size !== identities.length || identities.length !== active.size || identities.some(identity => !active.has(identity))) throw new HttpError(400, "validation_failed", "Layout must contain every active field exactly once");
    if (input.fields.some(entry => !entry.visible && active.get(layoutIdentity(entry))!.required)) throw new HttpError(400, "validation_failed", "Required creation fields must remain visible");
    // Refill active slots in requested order, leaving archived identities in place.
    const pending = [...input.fields];
    const merged: LayoutEntry[] = stored.map(entry => active.has(layoutIdentity(entry)) ? pending.shift() : entry).filter((entry): entry is LayoutEntry => Boolean(entry));
    merged.push(...pending);
    const guard = actionGuard(this.db, context, [], true);
    try {
      const [, updated] = await this.db.batch([guard.begin, this.db.update(recordLayout).set({ fieldsJson: JSON.stringify(merged), revision: sql`${recordLayout.revision}+1`, updatedAt: new Date() }).where(and(eq(recordLayout.entity, input.entity), eq(recordLayout.revision, input.revision), sql`exists (select 1 from field_configuration_revision where entity=${input.entity} and revision=${configurationRevision})`)).returning({ entity: recordLayout.entity }), guard.end]);
      if (!updated.length) throw new HttpError(409, "conflict", "Layout or field definitions changed; reload before saving");
    } catch (error) { permissionError(error); }
    return this.get(context, { entity: input.entity });
  }
}
