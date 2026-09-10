import { and, eq, isNull, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { MemberService } from "@/lib/services/members/member-service";
import {
  singletonMembership,
  singletonWorkspace,
  user,
  crmSetting,
  dealStage,
  dealStageCatalogRevision,
  moduleSetting,
  fieldConfigurationRevision,
  leadSettingsRevision,
  productCategoryRevision,
  leadSource,
  leadStatus,
} from "@/lib/db/schema";
import type { RequestContext } from "@/lib/http/request-context";

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

  let workspace = claimed[0]
    ? claimed[0]
    : await db.query.singletonWorkspace.findFirst({
        where: eq(singletonWorkspace.id, SINGLETON_WORKSPACE_ID),
      });

  if (!workspace) {
    const inserted = await db
      .insert(singletonWorkspace)
      .values({
        id: SINGLETON_WORKSPACE_ID,
        slug: SINGLETON_WORKSPACE_SLUG,
        ownerUserId: userId,
        createdAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing()
      .returning({ ownerUserId: singletonWorkspace.ownerUserId });

    workspace = inserted[0]
      ? inserted[0]
      : await db.query.singletonWorkspace.findFirst({
          where: eq(singletonWorkspace.id, SINGLETON_WORKSPACE_ID),
        });

    if (!workspace) {
      throw new Error("Singleton workspace could not be initialized");
    }
  }

  // Seed baseline configuration for the first user
  if (workspace.ownerUserId === userId) {
    await db.batch([
      db.insert(crmSetting).values({
        id: "settings",
        reportingCurrency: "USD",
        createdAt: now,
        updatedAt: now,
      }).onConflictDoNothing(),
      db.insert(dealStageCatalogRevision).values({
        id: "stages",
        revision: 0,
      }).onConflictDoNothing(),
      db.insert(dealStage).values([
        { id: "demo-booked", labelKey: "dealStage.demoBooked", position: 10, closedState: "open" },
        { id: "qualified-to-buy", labelKey: "dealStage.qualifiedToBuy", position: 20, closedState: "open" },
        { id: "unqualified-to-buy", labelKey: "dealStage.unqualifiedToBuy", position: 30, closedState: "lost" },
        { id: "decision-maker-bought-in", labelKey: "dealStage.decisionMakerBoughtIn", position: 40, closedState: "open" },
        { id: "contract-sent", labelKey: "dealStage.contractSent", position: 50, closedState: "open" },
        { id: "closed-won", labelKey: "dealStage.closedWon", position: 60, closedState: "won" },
        { id: "closed-lost", labelKey: "dealStage.closedLost", position: 70, closedState: "lost" },
      ]).onConflictDoNothing(),
      db.insert(moduleSetting).values([
        { entity: "company", enabled: true, revision: 0, updatedAt: now },
        { entity: "contact", enabled: true, revision: 0, updatedAt: now },
        { entity: "deal", enabled: true, revision: 0, updatedAt: now },
        { entity: "lead", enabled: true, revision: 0, updatedAt: now },
        { entity: "product", enabled: true, revision: 0, updatedAt: now },
        { entity: "order", enabled: true, revision: 0, updatedAt: now },
        { entity: "contract", enabled: true, revision: 0, updatedAt: now },
        { entity: "review", enabled: true, revision: 0, updatedAt: now },
      ]).onConflictDoNothing(),
      db.insert(fieldConfigurationRevision).values([
        { entity: "company", revision: 0 },
        { entity: "contact", revision: 0 },
        { entity: "deal", revision: 0 },
      ]).onConflictDoNothing(),
      db.insert(leadSettingsRevision).values({
        id: "settings",
        revision: 0,
      }).onConflictDoNothing(),
      db.insert(leadSource).values([
        { id: "manual", labelKey: "leadSource.manual", position: 10 },
      ]).onConflictDoNothing(),
      db.insert(leadStatus).values([
        { id: "new", labelKey: "leadStatus.new", position: 10, meaning: "working", requiresReason: false },
        { id: "contacted", labelKey: "leadStatus.contacted", position: 20, meaning: "working", requiresReason: false },
        { id: "nurturing", labelKey: "leadStatus.nurturing", position: 30, meaning: "working", requiresReason: false },
        { id: "unqualified", labelKey: "leadStatus.unqualified", position: 40, meaning: "rejected", requiresReason: true },
        { id: "converted", labelKey: "leadStatus.converted", position: 50, meaning: "converted", requiresReason: false },
      ]).onConflictDoNothing(),
      db.insert(productCategoryRevision).values({
        id: "categories",
        revision: 0,
      }).onConflictDoNothing(),
    ]);
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
