import { and, asc, eq, or } from "drizzle-orm";
import type { AppDatabase } from "@/db/client";
import { savedView } from "@/db/schema";
import type { EntityType } from "@/crm/list-state";

export class SavedViewRepository {
  constructor(private readonly db: AppDatabase) {}
  list(entity: EntityType, ownerId: string) { return this.db.select().from(savedView).where(and(eq(savedView.entity, entity), or(eq(savedView.shared, true), eq(savedView.creatorUserId, ownerId)))).orderBy(asc(savedView.name), asc(savedView.id)); }
  owned(id: string, ownerId: string) { return this.db.select().from(savedView).where(and(eq(savedView.id, id), eq(savedView.creatorUserId, ownerId))).get(); }
  create(values: typeof savedView.$inferInsert) { return this.db.insert(savedView).values(values).returning().get(); }
  update(id: string, ownerId: string, values: Partial<typeof savedView.$inferInsert>) { return this.db.update(savedView).set({ ...values, ownerMembershipId: ownerId }).where(and(eq(savedView.id, id), eq(savedView.creatorUserId, ownerId))).returning().get(); }
  delete(id: string, ownerId: string) { return this.db.delete(savedView).where(and(eq(savedView.id, id), eq(savedView.creatorUserId, ownerId))).returning({ id: savedView.id }).get(); }
}
