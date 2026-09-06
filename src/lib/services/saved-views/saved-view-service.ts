import { requirePermission } from "../permissions/permission-policy";
import type { Permission } from "../permissions/access-contracts";
import type { z } from "zod";
import type { AppDatabase } from "@/lib/db/database";
import type { savedView } from "@/lib/db/schema";
import type { EntityType } from "@/lib/listing/list-state";
import { relationError } from "@/lib/services/shared/service-utils";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { savedViewCreateSchema, savedViewUpdateSchema, validateSavedViewState } from "./saved-view-contracts";
import { SavedViewRepository } from "./saved-view-repository";

export class SavedViewService {
  private readonly repository: SavedViewRepository;
  constructor(private readonly db: AppDatabase) { this.repository = new SavedViewRepository(db); }
  private guard(context: RequestContext, permissions: Permission[] = []) { return requirePermission(this.db, context, permissions); }
  private state(entity: EntityType, input: unknown) { try { return validateSavedViewState(entity, input); } catch { throw new HttpError(400, "validation_failed", "Saved view state is invalid"); } }
  private serialize(row: typeof savedView.$inferSelect, userId: string) {
    // Stored state is validated before any caller can apply it to a list query.
    let state;
    try { state = validateSavedViewState(row.entity, JSON.parse(row.stateJson)); } catch { throw new HttpError(409, "conflict", "Stored saved view needs repair"); }
    return { id: row.id, entity: row.entity, name: row.name, shared: row.shared, state, mine: row.creatorUserId === userId, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
  }
  async list(context: RequestContext, entity: EntityType) { await this.guard(context); return (await this.repository.list(entity, context.userId)).map(row => this.serialize(row, context.userId)); }
  async create(context: RequestContext, input: z.infer<typeof savedViewCreateSchema>) {
    await this.guard(context, ["view.create"]); const state = this.state(input.entity, input.state); const now = new Date();
    try { const row = await this.repository.create({ id: crypto.randomUUID(), entity: input.entity, name: input.name, shared: input.shared, stateJson: JSON.stringify(state), creatorUserId: context.userId, ownerMembershipId: context.userId, createdAt: now, updatedAt: now }, context); return this.serialize(row, context.userId); } catch (error) { relationError(error, "Saved view name already exists"); }
  }
  async update(context: RequestContext, id: string, input: z.infer<typeof savedViewUpdateSchema>) {
    await this.guard(context, ["view.update"]); const existing = await this.repository.owned(id, context.userId); if (!existing) throw new HttpError(404, "not_found", "Saved view not found");
    const state = input.state ? this.state(existing.entity, input.state) : undefined;
    try { const row = await this.repository.update(id, context.userId, { ...(input.name !== undefined ? { name: input.name } : {}), ...(input.shared !== undefined ? { shared: input.shared } : {}), ...(state ? { stateJson: JSON.stringify(state) } : {}), updatedAt: new Date() }, context); if (!row) throw new HttpError(404, "not_found", "Saved view not found"); return this.serialize(row, context.userId); } catch (error) { relationError(error, "Saved view name already exists"); }
  }
  async delete(context: RequestContext, id: string) { await this.guard(context, ["view.delete"]); const row = await this.repository.delete(id, context.userId, context); if (!row) throw new HttpError(404, "not_found", "Saved view not found"); return row; }
}
