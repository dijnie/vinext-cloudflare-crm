import { and, asc, eq, sql } from "drizzle-orm";

import type { AppDatabase } from "@/lib/db/database";
import {
  activityVisibility,
  appointment,
  appointmentParticipant,
  company,
  contract,
  contractVersion,
  contact,
  customFieldValue,
  deal,
  lead,
  product,
  salesOrder,
  leadCollaborator,
  memberOperationGuard,
  notification,
  savedView,
  session,
  singletonMembership,
  singletonWorkspace,
  taskRecord,
  ticket,
  ticketCollaborator,
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
    const schedulingReplacement = replacement ?? actorMembershipId;
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
      this.db.insert(contractVersion).select(
        this.db
          .select({
            contractId: contract.id,
            version: sql<number>`${contract.revision} + 1`.as("version"),
            snapshotJson: sql<string>`json_object(
            'id', ${contract.id}, 'name', ${contract.name}, 'companyId', ${contract.companyId},
            'contactId', ${contract.contactId}, 'dealId', ${contract.dealId}, 'orderId', ${contract.orderId},
            'valueMinor', ${contract.valueMinor}, 'currency', ${contract.currency},
            'effectiveAt', CASE WHEN ${contract.effectiveAt} IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', ${contract.effectiveAt} / 1000.0, 'unixepoch') END,
            'expiresAt', CASE WHEN ${contract.expiresAt} IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', ${contract.expiresAt} / 1000.0, 'unixepoch') END,
            'ownerMembershipId', ${schedulingReplacement}, 'status', ${contract.status},
            'creatorUserId', ${contract.creatorUserId}, 'revision', ${contract.revision} + 1,
            'archivedAt', CASE WHEN ${contract.archivedAt} IS NULL THEN NULL ELSE strftime('%Y-%m-%dT%H:%M:%fZ', ${contract.archivedAt} / 1000.0, 'unixepoch') END,
            'createdAt', strftime('%Y-%m-%dT%H:%M:%fZ', ${contract.createdAt} / 1000.0, 'unixepoch'),
            'updatedAt', strftime('%Y-%m-%dT%H:%M:%fZ', ${now} / 1000.0, 'unixepoch'),
            'parties', json((SELECT coalesce(json_group_array(json_object(
              'companyId', party.company_id, 'contactId', party.contact_id, 'role', party.role
            )), '[]') FROM contract_party AS party WHERE party.contract_id = ${contract.id}))
          )`.as("snapshot_json"),
            reason:
              sql<string>`'Owner reassigned because member access was revoked'`.as(
                "reason",
              ),
            actorId: sql<string>`${actorMembershipId}`.as("actor_id"),
            createdAt: sql<Date>`${now}`.as("created_at"),
          })
          .from(contract)
          .where(eq(contract.ownerMembershipId, targetMembershipId)),
      ),
      this.db
        .update(contract)
        .set({
          ownerMembershipId: schedulingReplacement,
          revision: sql`${contract.revision}+1`,
          updatedAt: new Date(now),
        })
        .where(eq(contract.ownerMembershipId, targetMembershipId)),
      this.db
        .update(product)
        .set({
          ownerMembershipId: replacement,
          revision: sql`${product.revision}+1`,
          updatedAt: new Date(now),
        })
        .where(eq(product.ownerMembershipId, targetMembershipId)),
      this.db
        .update(lead)
        .set({
          ownerMembershipId: replacement,
          revision: sql`${lead.revision}+1`,
          updatedAt: new Date(now),
        })
        .where(eq(lead.ownerMembershipId, targetMembershipId)),
      this.db
        .update(salesOrder)
        .set({
          ownerMembershipId: replacement,
          revision: sql`${salesOrder.revision}+1`,
          updatedAt: new Date(now),
        })
        .where(eq(salesOrder.ownerMembershipId, targetMembershipId)),
      this.db
        .update(taskRecord)
        .set({
          assigneeMembershipId: replacement,
          revision: sql`${taskRecord.revision}+1`,
          updatedAt: new Date(now),
        })
        .where(eq(taskRecord.assigneeMembershipId, targetMembershipId)),
      this.db
        .insert(appointmentParticipant)
        .select(
          this.db
            .select({
              appointmentId: appointment.id,
              membershipId: sql<string>`${schedulingReplacement}`.as(
                "membership_id",
              ),
            })
            .from(appointment)
            .where(eq(appointment.organizerMembershipId, targetMembershipId)),
        )
        .onConflictDoNothing(),
      this.db
        .update(appointment)
        .set({
          organizerMembershipId: sql<string>`CASE WHEN ${appointment.organizerMembershipId}=${targetMembershipId} THEN ${schedulingReplacement} ELSE ${appointment.organizerMembershipId} END`,
          revision: sql`${appointment.revision}+1`,
          updatedAt: new Date(now),
        })
        .where(
          sql`${appointment.organizerMembershipId}=${targetMembershipId} OR EXISTS(SELECT 1 FROM appointment_participant p WHERE p.appointment_id=${appointment.id} AND p.membership_id=${targetMembershipId})`,
        ),
      this.db
        .delete(appointmentParticipant)
        .where(eq(appointmentParticipant.membershipId, targetMembershipId)),
      this.db
        .update(ticket)
        .set({
          assigneeMembershipId: replacement,
          revision: sql`${ticket.revision}+1`,
          updatedAt: new Date(now),
        })
        .where(eq(ticket.assigneeMembershipId, targetMembershipId)),
      this.db
        .delete(ticketCollaborator)
        .where(eq(ticketCollaborator.membershipId, targetMembershipId)),
      this.db
        .update(notification)
        .set({ state: "cancelled", updatedAt: new Date(now) })
        .where(eq(notification.recipientMembershipId, targetMembershipId)),
      this.db
        .delete(leadCollaborator)
        .where(eq(leadCollaborator.membershipId, targetMembershipId)),
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
