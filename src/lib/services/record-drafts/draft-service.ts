import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { operationConditionGuard, recordDraft } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { actionGuard, authorizedWrite, requirePermission } from "../permissions/permission-policy";
import type { DraftEntity } from "./draft-contracts";

export function draftPredicate(context: RequestContext, entity: DraftEntity, id: string) {
  return sql`EXISTS (SELECT 1 FROM record_draft WHERE id=${id} AND entity=${entity} AND user_id=${context.userId} AND consumed_at IS NULL AND expires_at > unixepoch('subsec') * 1000)`;
}

export class DraftService {
  constructor(private readonly db: AppDatabase) {}

  async create(context: RequestContext, input: { entity: DraftEntity }) {
    const createdAt = new Date();
    const draft = { id: crypto.randomUUID(), entity: input.entity, userId: context.userId, createdAt, expiresAt: new Date(createdAt.getTime() + 86_400_000) };
    await authorizedWrite(this.db, context, [`${input.entity}.create`], this.db.insert(recordDraft).values(draft));
    return { id: draft.id, entity: draft.entity, expiresAt: draft.expiresAt.toISOString() };
  }

  async prepareConsumption(context: RequestContext, entity: DraftEntity, draftId: string) {
    const permissions = [`${entity}.create` as const];
    await requirePermission(this.db, context, permissions);
    const predicate = draftPredicate(context, entity, draftId);
    const available = await this.db.get<{ available: number }>(sql`SELECT (${predicate}) AS available`);
    if (!available?.available) throw new HttpError(409, "conflict", "Creation reservation is unavailable or expired");
    const permission = actionGuard(this.db, context, permissions);
    const conditionId = crypto.randomUUID();
    const guard = {
      begin: this.db.insert(operationConditionGuard).values({ id: conditionId, authorized: sql<number>`CASE WHEN (${predicate}) THEN 1 ELSE 0 END` }),
      end: this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, conditionId)),
    };
    const consume = this.db.update(recordDraft).set({ consumedAt: sql`unixepoch('subsec') * 1000` }).where(eq(recordDraft.id, draftId));
    // Both statements belong to the caller's base-record/custom-value transaction.
    // A consumed reservation must never be committed separately from that record.
    return {
      recordId: draftId,
      before: [permission.begin, guard.begin],
      after: [consume, guard.end, permission.end],
    };
  }
}

export function translateDraftError(error: unknown): never {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (current instanceof Error && current.message.includes("operation_conflict")) throw new HttpError(409, "conflict", "Creation reservation changed before the operation completed");
    current = "cause" in current ? current.cause : null;
  }
  throw error;
}
