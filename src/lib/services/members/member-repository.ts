import { and, asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "@/lib/db/database";
import {
  activityVisibility,
  company,
  contact,
  customFieldValue,
  deal,
  lead,
  product,
  leadCollaborator,
  memberOperationGuard,
  savedView,
  session,
  singletonMembership,
  singletonWorkspace,
  user,
} from "@/lib/db/schema";

export class MemberRepository {
  constructor(private readonly db: AppDatabase) {}

  list() {
    return this.db
      .select({
        membershipId: singletonMembership.userId,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: singletonMembership.role,
        status: singletonMembership.status,
        createdAt: singletonMembership.createdAt,
      })
      .from(singletonMembership)
      .innerJoin(user, eq(user.id, singletonMembership.userId))
      .orderBy(
        asc(singletonMembership.createdAt),
        asc(singletonMembership.userId),
      );
  }

  findActive(membershipId: string) {
    return this.db.query.singletonMembership.findFirst({
      where: and(
        eq(singletonMembership.userId, membershipId),
        eq(singletonMembership.status, "active"),
      ),
    });
  }

  async hasOwnedDeals(membershipId: string): Promise<boolean> {
    const row = await this.db
      .select({ id: deal.id })
      .from(deal)
      .where(eq(deal.ownerMembershipId, membershipId))
      .limit(1);
    return row.length > 0;
  }

  async changeRole(
    actorMembershipId: string,
    targetMembershipId: string,
    role: "owner" | "member",
  ): Promise<boolean> {
    const result = await this.db.run(sql`
      UPDATE singleton_membership
         SET role = ${role}, updated_at = ${Date.now()}
       WHERE user_id = ${targetMembershipId}
         AND status = 'active'
         AND EXISTS (
           SELECT 1 FROM singleton_membership AS actor
            WHERE actor.user_id = ${actorMembershipId}
              AND actor.role = 'owner'
              AND actor.status = 'active'
         )
    `);
    return result.meta.changes === 1;
  }

  async restore(
    actorMembershipId: string,
    targetMembershipId: string,
  ): Promise<boolean> {
    const result = await this.db.run(sql`
      UPDATE singleton_membership
         SET role = 'member', status = 'active', updated_at = ${Date.now()}
       WHERE user_id = ${targetMembershipId}
         AND status = 'revoked'
         AND EXISTS (
           SELECT 1 FROM singleton_membership AS actor
            WHERE actor.user_id = ${actorMembershipId}
              AND actor.role = 'owner'
              AND actor.status = 'active'
         )
    `);
    return result.meta.changes === 1;
  }

  async remove(
    actorMembershipId: string,
    targetMembershipId: string,
    replacementMembershipId: string | null,
  ): Promise<boolean> {
    const replacement = replacementMembershipId;
    const now = Date.now();
    const operationId = crypto.randomUUID();
    const dealOwnershipUpdate = replacement
      ? this.db
          .update(deal)
          .set({ ownerMembershipId: replacement, updatedAt: new Date(now) })
          .where(eq(deal.ownerMembershipId, targetMembershipId))
      : this.db
          .update(deal)
          .set({ updatedAt: new Date(now) })
          .where(sql`0 = 1`);
    const results = await this.db.batch([
      this.db.insert(memberOperationGuard).values({
        id: operationId,
        authorized: sql<number>`(
          SELECT CASE WHEN EXISTS (
            SELECT 1 FROM singleton_membership AS actor
             WHERE actor.user_id = ${actorMembershipId}
               AND actor.role = 'owner'
               AND actor.status = 'active'
          ) AND EXISTS (
            SELECT 1 FROM singleton_membership AS target
             WHERE target.user_id = ${targetMembershipId} AND target.status = 'active'
          ) AND (${replacement} IS NULL OR EXISTS (
            SELECT 1 FROM singleton_membership AS next_owner
             WHERE next_owner.user_id = ${replacement} AND next_owner.status = 'active'
               AND next_owner.user_id != ${targetMembershipId}
          )) THEN 1 ELSE 0 END
        )`,
      }),
      this.db
        .update(company)
        .set({ ownerMembershipId: replacement, updatedAt: new Date(now) })
        .where(eq(company.ownerMembershipId, targetMembershipId)),
      this.db
        .update(contact)
        .set({ ownerMembershipId: replacement, updatedAt: new Date(now) })
        .where(eq(contact.ownerMembershipId, targetMembershipId)),
      dealOwnershipUpdate,
      this.db.update(product).set({ ownerMembershipId: replacement, revision: sql`${product.revision}+1`, updatedAt: new Date(now) }).where(eq(product.ownerMembershipId, targetMembershipId)),
      this.db.update(lead).set({ ownerMembershipId: replacement, revision: sql`${lead.revision}+1`, updatedAt: new Date(now) }).where(eq(lead.ownerMembershipId, targetMembershipId)),
      this.db.delete(leadCollaborator).where(eq(leadCollaborator.membershipId, targetMembershipId)),
      this.db
        .update(customFieldValue)
        .set({ userMembershipId: replacement, updatedAt: new Date(now) })
        .where(eq(customFieldValue.userMembershipId, targetMembershipId)),
      this.db
        .delete(activityVisibility)
        .where(eq(activityVisibility.membershipId, targetMembershipId)),
      this.db
        .update(savedView)
        .set({ ownerMembershipId: null, updatedAt: new Date(now) })
        .where(eq(savedView.ownerMembershipId, targetMembershipId)),
      this.db.delete(session).where(eq(session.userId, targetMembershipId)),
      this.db
        .update(singletonWorkspace)
        .set({
          ownerUserId: sql<string>`(
            SELECT candidate.user_id
              FROM singleton_membership AS candidate
             WHERE candidate.status = 'active'
               AND candidate.role = 'owner'
               AND candidate.user_id != ${targetMembershipId}
             ORDER BY CASE WHEN candidate.user_id = ${actorMembershipId} THEN 0 ELSE 1 END,
                      candidate.created_at,
                      candidate.user_id
             LIMIT 1
          )`,
          updatedAt: new Date(now),
        })
        .where(eq(singletonWorkspace.ownerUserId, targetMembershipId)),
      this.db
        .update(singletonMembership)
        .set({ status: "revoked", updatedAt: new Date(now) })
        .where(
          and(
            eq(singletonMembership.userId, targetMembershipId),
            eq(singletonMembership.status, "active"),
          ),
        ),
      this.db
        .delete(memberOperationGuard)
        .where(eq(memberOperationGuard.id, operationId)),
    ]);
    // D1 includes rows removed by branch-cleanup triggers in the change count.
    return (results.at(-2)?.meta.changes ?? 0) > 0;
  }
}
