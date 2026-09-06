import type { RequestContext } from "@/lib/http/request-context";
import { authorizedWrite } from "../permissions/permission-policy";
import { and, asc, eq, or } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { savedView } from "@/lib/db/schema";
import type { EntityType } from "@/lib/listing/list-state";

export class SavedViewRepository {
  constructor(private readonly db: AppDatabase) {}
  list(entity: EntityType, ownerId: string) { return this.db.select().from(savedView).where(and(eq(savedView.entity, entity), or(eq(savedView.shared, true), eq(savedView.creatorUserId, ownerId)))).orderBy(asc(savedView.name), asc(savedView.id)); }
  owned(id: string, ownerId: string) { return this.db.select().from(savedView).where(and(eq(savedView.id, id), eq(savedView.creatorUserId, ownerId))).get(); }
  async create(values: typeof savedView.$inferInsert, context: RequestContext) { const rows = await authorizedWrite(this.db, context, ["view.create"], this.db.insert(savedView).values(values).returning()); return rows[0]!; }
  async update(id: string, ownerId: string, values: Partial<typeof savedView.$inferInsert>, context: RequestContext) { const rows = await authorizedWrite(this.db, context, ["view.update"], this.db.update(savedView).set({ ...values, ownerMembershipId: ownerId }).where(and(eq(savedView.id, id), eq(savedView.creatorUserId, ownerId))).returning()); return rows[0]; }
  async delete(id: string, ownerId: string, context: RequestContext) { const rows = await authorizedWrite(this.db, context, ["view.delete"], this.db.delete(savedView).where(and(eq(savedView.id, id), eq(savedView.creatorUserId, ownerId))).returning({ id: savedView.id })); return rows[0]; }
}
