import type { RequestContext } from "@/lib/http/request-context";
import { authorizedWrite } from "../permissions/permission-policy";
import { and, asc, eq, or, sql, getTableColumns } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { savedView, savedViewDefault } from "@/lib/db/schema";
import type { EntityType } from "@/lib/listing/list-state";

export class SavedViewRepository {
  constructor(private readonly db: AppDatabase) {}
  private projection(userId: string) { return { ...getTableColumns(savedView), isDefault: sql<number>`exists (select 1 from saved_view_default where user_id=${userId} and view_id=${savedView.id} and entity=${savedView.entity})` }; }
  preferred(entity: EntityType, userId: string) { return this.db.select(this.projection(userId)).from(savedView).innerJoin(savedViewDefault, and(eq(savedViewDefault.viewId, savedView.id), eq(savedViewDefault.entity, savedView.entity))).where(and(eq(savedViewDefault.userId, userId), eq(savedView.entity, entity), or(eq(savedView.shared, true), eq(savedView.creatorUserId, userId)))).get(); }
  visible(id: string, entity: EntityType, userId: string) { return this.db.select(this.projection(userId)).from(savedView).where(and(eq(savedView.id, id), eq(savedView.entity, entity), or(eq(savedView.shared, true), eq(savedView.creatorUserId, userId)))).get(); }
  async setPreferred(entity: EntityType, viewId: string | null, context: RequestContext) {
    if (viewId === null) await authorizedWrite(this.db, context, [], this.db.delete(savedViewDefault).where(and(eq(savedViewDefault.userId, context.userId), eq(savedViewDefault.entity, entity))));
    else await authorizedWrite(this.db, context, [], this.db.insert(savedViewDefault).values({ userId: context.userId, entity, viewId }).onConflictDoUpdate({ target: [savedViewDefault.userId, savedViewDefault.entity], set: { viewId } }));
  }
  list(entity: EntityType, ownerId: string) { return this.db.select(this.projection(ownerId)).from(savedView).where(and(eq(savedView.entity, entity), or(eq(savedView.shared, true), eq(savedView.creatorUserId, ownerId)))).orderBy(asc(savedView.name), asc(savedView.id)); }
  owned(id: string, ownerId: string) { return this.db.select().from(savedView).where(and(eq(savedView.id, id), eq(savedView.creatorUserId, ownerId))).get(); }
  async create(values: typeof savedView.$inferInsert, context: RequestContext) { const rows = await authorizedWrite(this.db, context, ["view.create"], this.db.insert(savedView).values(values).returning()); return rows[0]!; }
  async update(id: string, ownerId: string, values: Partial<typeof savedView.$inferInsert>, context: RequestContext) { const rows = await authorizedWrite(this.db, context, ["view.update"], this.db.update(savedView).set({ ...values, ownerMembershipId: ownerId }).where(and(eq(savedView.id, id), eq(savedView.creatorUserId, ownerId))).returning(this.projection(ownerId))); return rows[0]; }
  async delete(id: string, ownerId: string, context: RequestContext) { const rows = await authorizedWrite(this.db, context, ["view.delete"], this.db.delete(savedView).where(and(eq(savedView.id, id), eq(savedView.creatorUserId, ownerId))).returning({ id: savedView.id })); return rows[0]; }
}
