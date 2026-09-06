import { and, asc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { accessGrant, accessProfile, branch, branchSetting, memberBranch, membershipAccess, operationConditionGuard, singletonMembership, user } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { defaultSecurityLogger, type SecurityLogger } from "@/lib/http/security-logging";
import { DEFAULT_PROFILE_ID, PERMISSIONS, accessMutationSchema, type AccessMutation, type AccessSettings, type Permission } from "./access-contracts";
import { actionGuard, permissionError, requirePermission } from "./permission-policy";

function accessError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  const message = String(error) + (error instanceof Error ? String(error.cause) : "");
  if (/operation_conflict|branch_in_use|UNIQUE constraint|FOREIGN KEY constraint/i.test(message)) throw new HttpError(409, "conflict", "This item changed, is in use or its name already exists");
  if (/branch_assignment_invalid/i.test(message)) throw new HttpError(400, "validation_failed", "Branch assignment is unavailable");
  permissionError(error);
}

export class AccessService {
  constructor(private readonly db: AppDatabase, private readonly logger: SecurityLogger = defaultSecurityLogger) {}

  async settings(context: RequestContext): Promise<AccessSettings> {
    await requirePermission(this.db, context, [], true);
    const [profiles, grants, branches, setting, members, assignments] = await Promise.all([
      this.db.select().from(accessProfile).orderBy(asc(accessProfile.name)),
      this.db.select().from(accessGrant),
      this.db.select().from(branch).orderBy(asc(branch.name)),
      this.db.select().from(branchSetting).where(eq(branchSetting.id, "settings")).get(),
      this.db.select({ membershipId: singletonMembership.userId, name: user.name, role: singletonMembership.role, status: singletonMembership.status, profileId: membershipAccess.profileId }).from(singletonMembership).innerJoin(user, eq(user.id, singletonMembership.userId)).innerJoin(membershipAccess, eq(membershipAccess.membershipId, singletonMembership.userId)).orderBy(asc(user.name)),
      this.db.select().from(memberBranch),
    ]);
    return {
      profiles: profiles.map(p => ({ id: p.id, name: p.name, isDefault: p.id === DEFAULT_PROFILE_ID, grants: grants.filter(g => g.profileId === p.id && PERMISSIONS.includes(g.permission as Permission)).map(g => g.permission as Permission) })),
      branches: branches.map(b => ({ id: b.id, name: b.name, archivedAt: b.archivedAt?.toISOString() ?? null, isDefault: b.id === setting?.defaultBranchId })),
      members: members.map(m => ({ ...m, branchIds: assignments.filter(a => a.membershipId === m.membershipId).map(a => a.branchId), primaryBranchId: assignments.find(a => a.membershipId === m.membershipId && a.isPrimary)?.branchId ?? null })),
    };
  }

  async mutate(context: RequestContext, raw: AccessMutation): Promise<AccessSettings> {
    await requirePermission(this.db, context, [], true);
    const parsed = accessMutationSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, "validation_failed", "Invalid access settings");
    const input = parsed.data, now = new Date();
    const writes: Parameters<AppDatabase["batch"]>[0][number][] = [];
    const targetPredicate = input.action === "assign-profile" || input.action === "assign-branches"
      ? sql`EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=${input.membershipId} AND status='active')`
      : input.action === "update-profile" || input.action === "delete-profile"
        ? sql`EXISTS (SELECT 1 FROM access_profile WHERE id=${input.id})`
        : "id" in input ? sql`EXISTS (SELECT 1 FROM branch WHERE id=${input.id})` : sql`1=1`;
    const guard = actionGuard(this.db, context, [], true);
    const conditionId = crypto.randomUUID();
    const condition = this.db.insert(operationConditionGuard).values({ id: conditionId, authorized: sql<number>`CASE WHEN ${targetPredicate} THEN 1 ELSE 0 END` });
    if (input.action === "create-profile" || input.action === "update-profile") {
      const id = input.action === "create-profile" ? crypto.randomUUID() : input.id;
      if (id === DEFAULT_PROFILE_ID) throw new HttpError(409, "conflict", "The compatibility profile is immutable");
      if (input.action === "update-profile") await this.profileExists(id);
      writes.push(input.action === "create-profile"
        ? this.db.insert(accessProfile).values({ id, name: input.name, createdAt: now, updatedAt: now })
        : this.db.update(accessProfile).set({ name: input.name, updatedAt: now }).where(eq(accessProfile.id, id)));
      writes.push(this.db.delete(accessGrant).where(eq(accessGrant.profileId, id)));
      for (const permission of input.grants) writes.push(this.db.insert(accessGrant).values({ profileId: id, permission }));
    } else if (input.action === "delete-profile") {
      if (input.id === DEFAULT_PROFILE_ID) throw new HttpError(409, "conflict", "The compatibility profile is immutable");
      await this.profileExists(input.id);
      writes.push(this.db.delete(accessProfile).where(eq(accessProfile.id, input.id)));
    } else if (input.action === "assign-profile") {
      await this.profileExists(input.profileId);
      await this.activeMember(input.membershipId);
      writes.push(this.db.update(membershipAccess).set({ profileId: input.profileId }).where(and(eq(membershipAccess.membershipId, input.membershipId), sql`EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=${input.membershipId} AND status='active')`)));
    } else if (input.action === "assign-branches") {
      await this.activeMember(input.membershipId);
      writes.push(this.db.delete(memberBranch).where(eq(memberBranch.membershipId, input.membershipId)));
      for (const branchId of input.branchIds) writes.push(this.db.insert(memberBranch).values({ membershipId: input.membershipId, branchId, isPrimary: branchId === input.primaryBranchId }));
    } else if (input.action === "create-branch") {
      writes.push(this.db.insert(branch).values({ id: crypto.randomUUID(), name: input.name, createdAt: now, updatedAt: now }));
    } else {
      if (!(await this.db.select({ id: branch.id }).from(branch).where(eq(branch.id, input.id)).get())) throw new HttpError(404, "not_found", "Branch not found");
      if (input.action === "set-default-branch") writes.push(this.db.update(branchSetting).set({ defaultBranchId: input.id }).where(eq(branchSetting.id, "settings")));
      else writes.push(this.db.update(branch).set(input.action === "rename-branch" ? { name: input.name, updatedAt: now } : { archivedAt: input.action === "archive-branch" ? now : null, updatedAt: now }).where(eq(branch.id, input.id)));
    }
    try { await this.db.batch([guard.begin, condition, ...writes, this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, conditionId)), guard.end]); } catch (error) { accessError(error); }
    this.logger({ code: `access.${input.action}`, requestId: context.requestId, method: "SERVICE", outcome: "succeeded" });
    return this.settings(context);
  }

  private async profileExists(id: string) {
    if (!(await this.db.select({ id: accessProfile.id }).from(accessProfile).where(eq(accessProfile.id, id)).get())) throw new HttpError(404, "not_found", "Profile not found");
  }
  private async activeMember(id: string) {
    if (!(await this.db.select({ id: singletonMembership.userId }).from(singletonMembership).where(and(eq(singletonMembership.userId, id), eq(singletonMembership.status, "active"))).get())) throw new HttpError(404, "not_found", "Active member not found");
  }
}
