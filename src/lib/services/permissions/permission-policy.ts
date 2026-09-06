import { moduleWritePredicate } from "../modules/module-policy";
import { eq, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { actionOperationGuard } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import type { Permission } from "./access-contracts";

export function permissionPredicate(context: RequestContext, permissions: readonly Permission[] = [], ownerOnly = false): SQL {
  return sql`EXISTS (SELECT 1 FROM singleton_membership AS actor
    WHERE actor.user_id = ${context.membershipId} AND actor.user_id = ${context.userId} AND actor.status = 'active'
    AND (${moduleWritePredicate(permissions)}) AND ${ownerOnly ? sql`actor.role = 'owner'` : sql`(actor.role = 'owner' OR NOT EXISTS (
      SELECT 1 FROM json_each(${JSON.stringify(permissions)}) AS wanted WHERE NOT EXISTS (
        SELECT 1 FROM membership_access AS assignment JOIN access_grant AS grant ON grant.profile_id = assignment.profile_id
        WHERE assignment.membership_id = actor.user_id AND grant.permission = wanted.value
      )))`})`;
}

export async function requirePermission(db: AppDatabase, context: RequestContext, permissions: readonly Permission[] = [], ownerOnly = false) {
  const result = await db.get<{ allowed: number }>(sql`SELECT ${permissionPredicate(context, permissions, ownerOnly)} AS allowed`);
  if (!result?.allowed) throw new HttpError(403, ownerOnly ? "owner_required" : permissions.length ? "permission_required" : "membership_required", "Current membership does not permit this operation");
}

// This guard cannot activate the separate membership-cleanup exception in field triggers.
export function actionGuard(db: AppDatabase, context: RequestContext, permissions: readonly Permission[] = [], ownerOnly = false, predicate: SQL = sql`1 = 1`) {
  const id = crypto.randomUUID();
  return {
    begin: db.insert(actionOperationGuard).values({ id, authorized: sql<number>`CASE WHEN (${permissionPredicate(context, permissions, ownerOnly)}) AND (${predicate}) THEN 1 ELSE 0 END` }),
    end: db.delete(actionOperationGuard).where(eq(actionOperationGuard.id, id)),
  };
}

export function permissionError(error: unknown): never {
  let current: unknown = error;
  while (current && typeof current === "object") {
    if (current instanceof Error && current.message.includes("action_permission_required")) throw new HttpError(403, "permission_required", "Permission changed before the operation completed");
    current = "cause" in current ? current.cause : null;
  }
  throw error;
}

export async function authorizedWrite<T extends Parameters<AppDatabase["batch"]>[0][number]>(db: AppDatabase, context: RequestContext, permissions: readonly Permission[], statement: T) {
  const guard = actionGuard(db, context, permissions);
  try {
    const [, result] = await db.batch([guard.begin, statement, guard.end]);
    return result;
  } catch (error) { permissionError(error); }
}

export function preparedStatement(db: AppDatabase, statement: { toSQL(): { sql: string; params: unknown[] } }) {
  const query = statement.toSQL();
  return db.$client.prepare(query.sql).bind(...query.params);
}

export async function authorizedBatch(db: AppDatabase, context: RequestContext, permissions: readonly Permission[], statements: Parameters<AppDatabase["batch"]>[0]) {
  const guard = actionGuard(db, context, permissions);
  try { await db.batch([guard.begin, ...statements, guard.end]); }
  catch (error) { permissionError(error); }
}
