import { eq, sql, type SQL } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { dealConversion, operationConditionGuard } from "@/lib/db/schema";
import { conversionFields } from "../currencies/conversion-service";
import { RateRepository } from "../currencies/rate-repository";

export async function prepareDealConversion(db: AppDatabase, input: { id: string; amountMinor: number | null; currency: string; moneyRevision: number }, expectedDeal?: SQL) {
  const repository = new RateRepository(db), setting = await repository.setting();
  const rates = await repository.snapshot(setting.reportingCurrency);
  const fields = conversionFields(input.amountMinor,input.currency,setting.reportingCurrency,rates);
  const operationId = crypto.randomUUID();
  const guard = db.insert(operationConditionGuard).values({ id:operationId,authorized:sql<number>`case when exists(select 1 from crm_setting where id='settings' and pending_job_id is null and active_conversion_version=${setting.activeConversionVersion} and rates_revision=${setting.ratesRevision}) and (${expectedDeal ?? sql`1=1`}) then 1 else 0 end` });
  const conversion = db.insert(dealConversion).values({version:setting.activeConversionVersion,dealId:input.id,amountMinor:input.amountMinor,currency:input.currency,moneyRevision:input.moneyRevision,...fields}).onConflictDoUpdate({target:[dealConversion.version,dealConversion.dealId],set:{amountMinor:input.amountMinor,currency:input.currency,moneyRevision:input.moneyRevision,...fields}});
  return {guard,conversion,finish:db.delete(operationConditionGuard).where(eq(operationConditionGuard.id,operationId))};
}
