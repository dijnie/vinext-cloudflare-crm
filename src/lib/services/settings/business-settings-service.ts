import { eq, sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { crmSetting, operationConditionGuard } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { defaultSecurityLogger, type SecurityLogger } from "@/lib/http/security-logging";
import { actionGuard, permissionError, permissionPredicate, requirePermission } from "../permissions/permission-policy";
import { businessDate, businessDayBounds } from "./business-time";
import { businessSettingsInputSchema, type BusinessSettings, type BusinessSettingsInput } from "./business-settings-contracts";

export class BusinessSettingsService {
  constructor(private readonly db: AppDatabase, private readonly logger: SecurityLogger = defaultSecurityLogger) {}

  async get(context: RequestContext, now = new Date()): Promise<BusinessSettings> {
    await requirePermission(this.db, context);
    const row = await this.db.select({ timeZone: crmSetting.timeZone, countryCode: crmSetting.countryCode, revision: crmSetting.calendarRevision, canManage: sql<number>`${permissionPredicate(context, [], true)}` }).from(crmSetting).where(eq(crmSetting.id, "settings")).get();
    if (!row) throw new HttpError(503, "internal_error", "Business settings unavailable");
    const today = businessDate(now, row.timeZone);
    const { start, end } = businessDayBounds(today, row.timeZone);
    return { ...row, canManage: Boolean(row.canManage), today, dayStartsAt: start.toISOString(), dayEndsAt: end.toISOString() };
  }

  async update(context: RequestContext, raw: BusinessSettingsInput): Promise<BusinessSettings> {
    await requirePermission(this.db, context, [], true);
    const parsed = businessSettingsInputSchema.safeParse(raw);
    if (!parsed.success) throw new HttpError(400, "validation_failed", "Invalid business settings");
    const input = parsed.data, conditionId = crypto.randomUUID();
    const guard = actionGuard(this.db, context, [], true);
    try {
      await this.db.batch([
        guard.begin,
        this.db.insert(operationConditionGuard).values({ id: conditionId, authorized: sql<number>`CASE WHEN EXISTS (SELECT 1 FROM crm_setting WHERE id='settings' AND calendar_revision=${input.revision}) THEN 1 ELSE 0 END` }),
        this.db.update(crmSetting).set({ timeZone: input.timeZone, countryCode: input.countryCode, calendarRevision: sql`${crmSetting.calendarRevision} + 1`, updatedAt: new Date() }).where(eq(crmSetting.id, "settings")),
        this.db.delete(operationConditionGuard).where(eq(operationConditionGuard.id, conditionId)),
        guard.end,
      ]);
    } catch (error) {
      if ((String(error) + (error instanceof Error ? String(error.cause) : "")).includes("operation_conflict")) throw new HttpError(409, "conflict", "Calendar settings changed; reload before saving");
      permissionError(error);
    }
    this.logger({ code: "business.calendar_updated", requestId: context.requestId, method: "SERVICE", outcome: "succeeded" });
    return this.get(context);
  }
}
