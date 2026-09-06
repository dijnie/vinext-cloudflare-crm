import { asc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { leadSource, leadStatus, leadSettingsRevision, operationConditionGuard } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { toIso } from "@/lib/listing/list-contract";
import { actionGuard, permissionPredicate, requirePermission } from "../permissions/permission-policy";
import { leadWriteError } from "./lead-service";
import { leadSettingsMutationSchema, type LeadSettings, type LeadSettingsMutation } from "./lead-settings-contract";
export class LeadSettingsService {
  constructor(private readonly db: AppDatabase) { }
  async get(context: RequestContext): Promise<LeadSettings> {
    await requirePermission(this.db, context);
    const [sources, statuses, revisions] = await this.db.batch([
      this.db.select().from(leadSource).where(permissionPredicate(context)).orderBy(asc(leadSource.position), asc(leadSource.id)),
      this.db.select().from(leadStatus).where(permissionPredicate(context)).orderBy(asc(leadStatus.position), asc(leadStatus.id)),
      this.db.select({ revision: leadSettingsRevision.revision, canManage: sql<number>`${permissionPredicate(context, [], true)}` }).from(leadSettingsRevision).where(eq(leadSettingsRevision.id, "settings")),
    ]);
    const revision = revisions[0];
    if (!sources.length || !statuses.length || !revision) throw new HttpError(403, "membership_required", "Active membership is required");
    return { revision: revision.revision, canManage: Boolean(revision.canManage), defaultSourceId: "manual", defaultStatusId: "new", sources: sources.map(row => ({ ...row, archivedAt: toIso(row.archivedAt) })), statuses: statuses.map(row => ({ ...row, archivedAt: toIso(row.archivedAt) })) };
  }
  async mutate(context: RequestContext, input: LeadSettingsMutation): Promise<LeadSettings> {
    await requirePermission(this.db, context, [], true);
    const parsed = leadSettingsMutationSchema.safeParse(input);
    if (!parsed.success) throw new HttpError(400, "validation_failed", "Lead configuration is invalid");
    const mutation = parsed.data, catalog = await this.get(context);
    if (catalog.revision !== mutation.revision) throw new HttpError(409, "conflict", "Lead configuration changed; reload before saving");
    const rows = mutation.kind === "source" ? catalog.sources : catalog.statuses;
    const table = mutation.kind === "source" ? leadSource : leadStatus;
    const statements: Parameters<AppDatabase["batch"]>[0][number][] = [];
    if (mutation.action === "create") {
      if (mutation.kind === "source" && (mutation.meaning !== undefined || mutation.requiresReason !== undefined)) throw new HttpError(400, "validation_failed", "Sources do not have status rules");
      const id = crypto.randomUUID(), values = { id, label: mutation.label, labelKey: `lead${mutation.kind === "source" ? "Source" : "Status"}.${id}`, position: Math.max(0, ...rows.map(row => row.position)) + 10 };
      if (mutation.kind === "source") statements.push(this.db.insert(leadSource).values(values));
      else {
        const meaning = mutation.meaning ?? "working";
        if (meaning !== "rejected" && mutation.requiresReason) throw new HttpError(400, "validation_failed", "Only rejected statuses require a reason");
        statements.push(this.db.insert(leadStatus).values({ ...values, meaning, requiresReason: mutation.requiresReason ?? false }));
      }
    } else {
      const row = rows.find(row => row.id === mutation.id);
      if (!row) throw new HttpError(400, "validation_failed", "Lead choice is invalid");
      if (mutation.action === "relabel") {
        const seeded = mutation.kind === "source" ? ["manual"] : ["new", "contacted", "nurturing", "unqualified", "converted"];
        if (mutation.label === null && !seeded.includes(mutation.id)) throw new HttpError(400, "validation_failed", "Custom choices require a label");
        statements.push(this.db.update(table).set({ label: mutation.label }).where(eq(table.id, mutation.id)));
      } else if (mutation.action === "reason") {
        const status = catalog.statuses.find(row => row.id === mutation.id)!;
        if (status.meaning !== "rejected") throw new HttpError(400, "validation_failed", "Only rejected statuses support reason rules");
        statements.push(this.db.update(leadStatus).set({ requiresReason: mutation.requiresReason }).where(eq(leadStatus.id, mutation.id)));
      } else if (mutation.action === "reorder") {
        if (mutation.beforeId === mutation.id || mutation.beforeId !== null && !rows.some(row => row.id === mutation.beforeId)) throw new HttpError(400, "validation_failed", "Reorder target is invalid");
        const ids = rows.map(row => row.id).filter(id => id !== mutation.id);
        ids.splice(mutation.beforeId === null ? ids.length : ids.indexOf(mutation.beforeId), 0, mutation.id);
        const positions = JSON.stringify(ids.map((id, index) => ({ id, position: (index + 1) * 10 })));
        const offset = Math.max(ids.length * 10, ...rows.map(row => row.position)) + 10;
        statements.push(this.db.update(table).set({ position: sql`${table.position}+${offset}` }));
        statements.push(this.db.update(table).set({ position: sql<number>`(select json_extract(item.value,'$.position') from json_each(${positions}) item where json_extract(item.value,'$.id')=${table.id})` }));
      } else {
        if (mutation.action === "archive" && (mutation.kind === "source" && mutation.id === "manual" || mutation.kind === "status" && ["new", "converted"].includes(mutation.id))) throw new HttpError(400, "validation_failed", "Protected default choices cannot be archived");
        statements.push(this.db.update(table).set({ archivedAt: mutation.action === "archive" ? new Date() : null }).where(eq(table.id, mutation.id)));
      }
    }
    const auth = actionGuard(this.db, context, [], true), id = crypto.randomUUID();
    try { await this.db.batch([auth.begin, this.db.insert(operationConditionGuard).values({ id, authorized: sql<number>`case when exists(select 1 from ${leadSettingsRevision} where ${leadSettingsRevision.id}='settings' and ${leadSettingsRevision.revision}=${mutation.revision}) then 1 else 0 end` }), ...statements, this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, id)), auth.end]); } catch (error) { leadWriteError(error); }
    return this.get(context);
  }
}
