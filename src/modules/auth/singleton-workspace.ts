import { and, eq, isNull, sql } from "drizzle-orm";

import type { AppDatabase } from "@/db/client";
import {
  singletonMembership,
  singletonWorkspace,
  user,
} from "@/db/schema";
import { MemberService } from "@/modules/members/member-service";
import type { RequestContext } from "@/server/request-context";

export const SINGLETON_WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
export const SINGLETON_WORKSPACE_SLUG = "crm";

export type SingletonRole = "owner" | "member";

export class MembershipRevokedError extends Error {
  constructor() {
    super("Membership is revoked");
    this.name = "MembershipRevokedError";
  }
}

export async function reconcileSingletonMembership(
  db: AppDatabase,
  userId: string,
): Promise<SingletonRole> {
  const existing = await db.query.singletonMembership.findFirst({
    where: eq(singletonMembership.userId, userId),
  });
  if (existing?.status === "revoked") {
    throw new MembershipRevokedError();
  }
  if (existing?.status === "active") {
    return existing.role;
  }

  const now = new Date();
  const claimed = await db
    .update(singletonWorkspace)
    .set({ ownerUserId: userId, updatedAt: now })
    .where(
      and(
        eq(singletonWorkspace.id, SINGLETON_WORKSPACE_ID),
        isNull(singletonWorkspace.ownerUserId),
      ),
    )
    .returning({ ownerUserId: singletonWorkspace.ownerUserId });

  const workspace = claimed[0]
    ? claimed[0]
    : await db.query.singletonWorkspace.findFirst({
        where: eq(singletonWorkspace.id, SINGLETON_WORKSPACE_ID),
      });
  if (!workspace) {
    throw new Error("Singleton workspace is not initialized");
  }

  const role: SingletonRole =
    workspace.ownerUserId === userId ? "owner" : "member";
  await db
    .insert(singletonMembership)
    .values({ userId, role, status: "active", createdAt: now, updatedAt: now })
    .onConflictDoNothing({ target: singletonMembership.userId });

  const membership = await db.query.singletonMembership.findFirst({
    where: eq(singletonMembership.userId, userId),
  });
  if (!membership || membership.status === "revoked") {
    throw new MembershipRevokedError();
  }
  return membership.role;
}

export async function changeSingletonRole(
  db: AppDatabase,
  actorUserId: string,
  targetUserId: string,
  role: SingletonRole,
): Promise<boolean> {
  const service = new MemberService(db);
  try {
    await service.changeRole(
      {
        userId: actorUserId,
        membershipId: actorUserId,
        role: "owner",
        requestId: crypto.randomUUID(),
      } as RequestContext,
      targetUserId,
      role,
    );
    return true;
  } catch {
    return false;
  }
}

export async function revokeSingletonMembership(
  db: AppDatabase,
  actorUserId: string,
  targetUserId: string,
): Promise<boolean> {
  const service = new MemberService(db);
  try {
    await service.remove(
      {
        userId: actorUserId,
        membershipId: actorUserId,
        role: "owner",
        requestId: crypto.randomUUID(),
      } as RequestContext,
      targetUserId,
    );
    return true;
  } catch {
    return false;
  }
}

export async function findUserByNormalizedEmail(
  db: AppDatabase,
  email: string,
) {
  return db.query.user.findFirst({ where: eq(user.email, email) });
}
