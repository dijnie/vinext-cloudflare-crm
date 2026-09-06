import { recordTables } from "@/lib/db/record-entities";
import { authorizedWrite, requirePermission } from "../permissions/permission-policy";
import { inJsonArray } from "@/lib/db/sql-filters";
import { and, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { company, contact, deal, singletonMembership } from "@/lib/db/schema";
import type { OwnershipInput } from "@/lib/services/activities/activity-contract";
import { relationError } from "@/lib/services/shared/service-utils";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";

export class OwnershipService {
  constructor(private readonly db: AppDatabase) {}
  async assign(context: RequestContext, input: OwnershipInput) {
    await requirePermission(this.db, context, [`${input.entity}.assign`]);
    if (input.entity === "deal" && !input.ownerMembershipId) throw new HttpError(400, "validation_failed", "Deals need an owner");
    if (input.ownerMembershipId && !(await this.db.select({ id: singletonMembership.userId }).from(singletonMembership).where(and(eq(singletonMembership.userId, input.ownerMembershipId), eq(singletonMembership.status, "active"))).get())) throw new HttpError(400, "validation_failed", "Owner must be an active member");
    const table = recordTables[input.entity];
    try {
      const rows = await authorizedWrite(this.db, context, [`${input.entity}.assign`], this.db.update(table).set({ ownerMembershipId: input.ownerMembershipId, updatedAt: new Date(), ...(["lead", "product", "order"].includes(input.entity) ? { revision: sql`revision+1` } : {}) }).where(inJsonArray(table.id, input.ids)).returning({ id: table.id }));
      return { requested: input.ids.length, succeeded: rows.length, failed: input.ids.length - rows.length };
    } catch (error) { relationError(error, "Ownership relationships changed"); }
  }
}
