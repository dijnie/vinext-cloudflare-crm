import { asc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { dealStage, dealStageCatalogRevision, operationConditionGuard } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { toIso } from "@/lib/listing/list-contract";
import { actionGuard, permissionError, permissionPredicate, requirePermission } from "../permissions/permission-policy";
import { DEAL_STAGE_IDS, dealStageMutationSchema, type DealStageCatalog, type DealStageMutation } from "./deal-stage-contracts";

export function dealStageWriteError(error: unknown): never {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (current instanceof Error && current.message.includes("deal_stage_unavailable")) {
      throw new HttpError(409, "conflict", "Deal stage is no longer available; reload before saving");
    }
    current = "cause" in current ? current.cause : null;
  }
  throw error;
}

function catalogError(error: unknown): never {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (current instanceof Error && current.message.includes("operation_conflict")) {
      throw new HttpError(409, "conflict", "Deal stages changed; reload before saving");
    }
    current = "cause" in current ? current.cause : null;
  }
  permissionError(error);
}

export class DealStageService {
  constructor(private readonly db: AppDatabase) {}

  async get(context: RequestContext): Promise<DealStageCatalog> {
    await requirePermission(this.db, context);
    const rows = await this.db.select({
      id: dealStage.id, label: dealStage.label, labelKey: dealStage.labelKey,
      closedState: dealStage.closedState, position: dealStage.position, archivedAt: dealStage.archivedAt,
      revision: dealStageCatalogRevision.revision,
      canManage: sql<number>`${permissionPredicate(context, [], true)}`,
    }).from(dealStage).innerJoin(dealStageCatalogRevision, eq(dealStageCatalogRevision.id, "stages"))
      .where(permissionPredicate(context)).orderBy(asc(dealStage.position), asc(dealStage.id));
    if (!rows.length) throw new HttpError(403, "membership_required", "Active membership is required");
    return {
      revision: rows[0]!.revision, canManage: Boolean(rows[0]!.canManage), defaultStageId: "demo-booked",
      stages: rows.map(({ revision: _revision, canManage: _canManage, archivedAt, ...stage }) => ({ ...stage, archivedAt: toIso(archivedAt) })),
    };
  }

  async mutate(context: RequestContext, input: DealStageMutation): Promise<DealStageCatalog> {
    await requirePermission(this.db, context, [], true);
    const parsed = dealStageMutationSchema.safeParse(input);
    if (!parsed.success) throw new HttpError(400, "validation_failed", "Invalid deal stage configuration");
    const mutation = parsed.data;
    const catalog = await this.get(context);
    if (catalog.revision !== mutation.revision) throw new HttpError(409, "conflict", "Deal stages changed; reload before saving");
    const stage = mutation.action === "create" ? null : catalog.stages.find(row => row.id === mutation.id);
    if (mutation.action !== "create" && !stage) throw new HttpError(400, "validation_failed", "Deal stage is invalid");
    const statements: Parameters<AppDatabase["batch"]>[0][number][] = [];
    if (mutation.action === "create") {
      const id = crypto.randomUUID();
      statements.push(this.db.insert(dealStage).values({ id, label: mutation.label, labelKey: `dealStage.${id}`, closedState: mutation.closedState, position: catalog.stages.reduce((maximum, row) => Math.max(maximum, row.position), 0) + 10 }));
    } else if (mutation.action === "relabel") {
      if (mutation.label === null && !DEAL_STAGE_IDS.some(id => id === mutation.id)) throw new HttpError(400, "validation_failed", "Custom stages require a label");
      statements.push(this.db.update(dealStage).set({ label: mutation.label }).where(eq(dealStage.id, mutation.id)));
    } else if (mutation.action === "reorder") {
      if (mutation.beforeId === mutation.id || (mutation.beforeId !== null && !catalog.stages.some(row => row.id === mutation.beforeId))) {
        throw new HttpError(400, "validation_failed", "Reorder target is invalid");
      }
      const ids = catalog.stages.map(row => row.id).filter(id => id !== mutation.id);
      ids.splice(mutation.beforeId === null ? ids.length : ids.indexOf(mutation.beforeId), 0, mutation.id);
      const positions = JSON.stringify(ids.map((id, index) => ({ id, position: (index + 1) * 10 })));
      const offset = catalog.stages.reduce((maximum, row) => Math.max(maximum, row.position), ids.length * 10) + 10;
      // Separate temporary and final sets avoid the unique-position constraint without one query per row.
      statements.push(this.db.update(dealStage).set({ position: sql`${dealStage.position} + ${offset}` }));
      statements.push(this.db.update(dealStage).set({ position: sql<number>`(SELECT json_extract(item.value, '$.position') FROM json_each(${positions}) AS item WHERE json_extract(item.value, '$.id') = ${dealStage.id})` }));
    } else {
      if (mutation.action === "archive" && mutation.id === "demo-booked") throw new HttpError(400, "validation_failed", "The default deal stage cannot be archived");
      statements.push(this.db.update(dealStage).set({ archivedAt: mutation.action === "archive" ? new Date() : null }).where(eq(dealStage.id, mutation.id)));
    }
    const authorization = actionGuard(this.db, context, [], true);
    const guardId = crypto.randomUUID();
    const begin = this.db.insert(operationConditionGuard).values({ id: guardId, authorized: sql<number>`CASE WHEN EXISTS (SELECT 1 FROM ${dealStageCatalogRevision} WHERE ${dealStageCatalogRevision.id} = 'stages' AND ${dealStageCatalogRevision.revision} = ${mutation.revision}) THEN 1 ELSE 0 END` });
    const end = this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, guardId));
    try {
      await this.db.batch([authorization.begin, begin, ...statements, end, authorization.end]);
    } catch (error) { catalogError(error); }
    return this.get(context);
  }
}
