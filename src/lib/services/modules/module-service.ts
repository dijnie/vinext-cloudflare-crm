import { and, asc, eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { moduleSetting } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { actionGuard, permissionError, permissionPredicate, requirePermission } from "../permissions/permission-policy";
import { moduleUpdateInputSchema, type ModuleSettings, type ModuleUpdateInput } from "./module-contracts";

export class ModuleService {
  constructor(private readonly db: AppDatabase) {}
  async get(context: RequestContext): Promise<ModuleSettings> {
    await requirePermission(this.db, context);
    const rows = await this.db.select({ entity: moduleSetting.entity, enabled: moduleSetting.enabled, revision: moduleSetting.revision, canManage: sql<number>`${permissionPredicate(context, [], true)}` }).from(moduleSetting).where(permissionPredicate(context)).orderBy(asc(moduleSetting.entity));
    if (rows.length !== 3) throw new HttpError(403, "membership_required", "Active membership is required");
    return { canManage: Boolean(rows[0]!.canManage), modules: rows.map(({ entity, enabled, revision }) => ({ entity, enabled, revision })) };
  }
  async update(context: RequestContext, input: ModuleUpdateInput): Promise<ModuleSettings> {
    await requirePermission(this.db, context, [], true);
    const parsed = moduleUpdateInputSchema.safeParse(input);
    if (!parsed.success) throw new HttpError(400, "validation_failed", "Invalid module settings");
    const guard = actionGuard(this.db, context, [], true);
    try {
      const [, rows] = await this.db.batch([guard.begin, this.db.update(moduleSetting).set({ enabled: parsed.data.enabled, revision: sql`${moduleSetting.revision}+1`, updatedAt: new Date() }).where(and(eq(moduleSetting.entity, parsed.data.entity), eq(moduleSetting.revision, parsed.data.revision))).returning({ entity: moduleSetting.entity }), guard.end]);
      if (!rows.length) throw new HttpError(409, "conflict", "Module settings changed; reload before saving");
    } catch (error) { permissionError(error); }
    return this.get(context);
  }
}
