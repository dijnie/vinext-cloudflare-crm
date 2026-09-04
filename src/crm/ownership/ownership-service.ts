import { inJsonArray } from "@/crm/sql-filters";
import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { company, contact, deal, singletonMembership } from "@/db/schema";
import type { OwnershipInput } from "@/crm/contracts/activity-contract";
import { relationError } from "@/crm/service-utils";
import { HttpError } from "@/server/http-errors";
import type { RequestContext } from "@/server/request-context";

export class OwnershipService {
  constructor(private readonly db: AppDatabase) {}
  async assign(context: RequestContext, input: OwnershipInput) {
    if (!context.membershipId || !context.userId) throw new HttpError(403, "membership_required", "Active membership is required");
    if (input.entity === "deal" && !input.ownerMembershipId) throw new HttpError(400, "validation_failed", "Deals need an owner");
    if (input.ownerMembershipId && !(await this.db.select({ id: singletonMembership.userId }).from(singletonMembership).where(and(eq(singletonMembership.userId, input.ownerMembershipId), eq(singletonMembership.status, "active"))).get())) throw new HttpError(400, "validation_failed", "Owner must be an active member");
    const table = input.entity === "company" ? company : input.entity === "contact" ? contact : deal;
    try {
      const rows = await this.db.update(table).set({ ownerMembershipId: input.ownerMembershipId, updatedAt: new Date() }).where(inJsonArray(table.id, input.ids)).returning({ id: table.id });
      return { requested: input.ids.length, succeeded: rows.length, failed: input.ids.length - rows.length };
    } catch (error) { relationError(error, "Ownership relationships changed"); }
  }
}
