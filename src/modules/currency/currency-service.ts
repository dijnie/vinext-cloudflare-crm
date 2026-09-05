import { and, asc, eq, gt, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { crmSetting, currencyJob, deal, dealConversion, exchangeRate, memberOperationGuard, singletonMembership } from "@/db/schema";
import { HttpError } from "@/server/http-errors";
import type { RequestContext } from "@/server/request-context";
import { CURRENCIES, CURRENCY_CODES } from "./currency-catalog";
import { currencyCodeSchema, currencyJobSchema, rateSchema, type CurrencyMutation, type CurrencySettings } from "./currency-contracts";
import { canonicalRate, conversionFields, type FrozenRates } from "./conversion-service";
import { RateRepository } from "./rate-repository";

const frozenRatesSchema = z.record(z.string(), z.object({ rate: rateSchema, asOf: z.iso.datetime(), source: z.enum(["identity", "manual", "fetched"]) }).strict());
export function currencyError(error: unknown): never {
  if (error instanceof HttpError) throw error;
  const message = String(error) + (error instanceof Error ? String(error.cause) : "");
  if (/currency_job_pending|deal_money_revision_conflict|member_operation_guard_authorized_check|CHECK constraint failed: authorized/i.test(message)) throw new HttpError(409, "conflict", "Currency operation changed or is busy");
  throw error;
}
export class CurrencyService {
  private readonly rates: RateRepository;
  constructor(private readonly db: AppDatabase) { this.rates = new RateRepository(db); }
  private async guard(context: RequestContext, owner = false) {
    const member = await this.db.select().from(singletonMembership).where(and(eq(singletonMembership.userId, context.membershipId), eq(singletonMembership.status, "active"))).get();
    if (!context.userId || !member) throw new HttpError(403, "membership_required", "Active membership required");
    if (owner && member.role !== "owner") throw new HttpError(403, "owner_required", "Owner required");
  }
  private operation(context: RequestContext, predicate: SQL) {
    const id = crypto.randomUUID();
    return { begin: this.db.insert(memberOperationGuard).values({ id, authorized: sql<number>`case when (${predicate}) and exists(select 1 from singleton_membership where user_id=${context.membershipId} and status='active' and role='owner') then 1 else 0 end` }), end: this.db.delete(memberOperationGuard).where(eq(memberOperationGuard.id, id)) };
  }
  async settings(context: RequestContext, baseCurrency?: string): Promise<CurrencySettings> {
    await this.guard(context); const setting = await this.rates.setting();
    const base = currencyCodeSchema.parse(baseCurrency ?? setting.reportingCurrency);
    const [rows, job, excluded] = await Promise.all([
      this.rates.list(base),
      setting.pendingJobId ? this.db.select().from(currencyJob).where(eq(currencyJob.id, setting.pendingJobId)).get() : undefined,
      this.db.$client.prepare(`SELECT d.currency, count(*) AS count FROM deal d LEFT JOIN deal_conversion c ON c.deal_id=d.id AND c.version=? AND c.money_revision=d.money_revision WHERE d.archived_at IS NULL AND d.amount_minor IS NOT NULL AND (c.base_amount_minor IS NULL OR c.base_currency IS NULL OR c.base_currency!=?) GROUP BY d.currency`).bind(setting.activeConversionVersion, setting.reportingCurrency).all<{currency: string; count: number}>(),
    ]);
    const effective = new Map<string, typeof rows[number]>();
    for (const row of rows.filter(row => row.source === "fetched").concat(rows.filter(row => row.source === "manual"))) if (CURRENCY_CODES.includes(row.quoteCurrency as typeof CURRENCY_CODES[number])) effective.set(row.quoteCurrency, row);
    return {
      reportingCurrency: currencyCodeSchema.parse(setting.reportingCurrency), activeVersion: setting.activeConversionVersion, canManage: context.role === "owner", catalog: CURRENCIES,
      rates: [...effective.values()].map(row => ({ baseCurrency: base, currency: currencyCodeSchema.parse(row.quoteCurrency), rate: row.rate, asOf: row.asOf.toISOString(), source: row.source, overriding: row.source === "manual" && rows.some(other => other.quoteCurrency === row.quoteCurrency && other.source === "fetched") })).sort((a,b) => a.currency.localeCompare(b.currency)),
      unconverted: { count: excluded.results.reduce((total,row) => total + row.count, 0), currencies: excluded.results.map(row => row.currency).sort() },
      job: job ? currencyJobSchema.parse(job) : null,
    };
  }
  async mutate(context: RequestContext, input: CurrencyMutation): Promise<CurrencySettings> {
    await this.guard(context, true);
    try {
      if (input.action === "resume") await this.resume(context, input.jobId);
      else if (input.action === "cancel") await this.cancel(context, input.jobId);
      else if (input.action === "fill_missing") await this.start(context, "fill_missing");
      else if (input.action === "set_reporting_currency") await this.start(context, "rerate", input.currency);
      else {
        const setting = await this.rates.setting();
        if (input.currency === input.baseCurrency) throw new HttpError(400, "validation_failed", "Identity rate is always one");
        const op = this.operation(context, sql`exists(select 1 from crm_setting where id='settings' and pending_job_id is null and rates_revision=${setting.ratesRevision})`);
        const now = new Date();
        const mutation = input.action === "remove_manual_rate"
          ? this.db.delete(exchangeRate).where(this.rates.manual(input.baseCurrency, input.currency))
          : this.db.insert(exchangeRate).values({ id: crypto.randomUUID(), baseCurrency: input.baseCurrency, quoteCurrency: input.currency, rate: canonicalRate(input.rate), source: "manual", asOf: now, createdAt: now, updatedAt: now }).onConflictDoUpdate({ target: [exchangeRate.baseCurrency, exchangeRate.quoteCurrency, exchangeRate.source], set: { rate: canonicalRate(input.rate), asOf: now, updatedAt: now } });
        await this.db.batch([op.begin, mutation, this.db.update(crmSetting).set({ ratesRevision: sql`${crmSetting.ratesRevision}+1`, updatedAt: now }).where(eq(crmSetting.id, "settings")), op.end]);
        if (input.action === "set_manual_rate" && input.baseCurrency === setting.reportingCurrency) await this.start(context, "fill_missing");
      }
    } catch (error) { currencyError(error); }
    return this.settings(context, "baseCurrency" in input ? input.baseCurrency : undefined);
  }
  async start(context: RequestContext, kind: "rerate" | "fill_missing", target?: string) {
    await this.guard(context, true); const setting = await this.rates.setting();
    const targetCurrency = currencyCodeSchema.parse(target ?? setting.reportingCurrency);
    if (kind === "rerate" && targetCurrency === setting.reportingCurrency) return;
    const id = crypto.randomUUID(), now = new Date(); const rates = await this.rates.snapshot(targetCurrency, now);
    const op = this.operation(context, sql`exists(select 1 from crm_setting where id='settings' and pending_job_id is null and active_conversion_version=${setting.activeConversionVersion} and rates_revision=${setting.ratesRevision})`);
    await this.db.batch([
      op.begin,
      this.db.insert(currencyJob).values({ id, kind, targetCurrency, expectedVersion: setting.activeConversionVersion, targetVersion: kind === "rerate" ? id : setting.activeConversionVersion, ratesJson: JSON.stringify(rates), total: sql`(select count(*) from deal)`, status: "pending", createdAt: now, updatedAt: now }),
      this.db.update(crmSetting).set({ pendingJobId: id, updatedAt: now }).where(eq(crmSetting.id, "settings")), op.end,
    ]);
  }
  async resume(context: RequestContext, id: string) {
    await this.guard(context, true);
    const job = await this.db.select().from(currencyJob).where(eq(currencyJob.id, id)).get();
    if (!job) throw new HttpError(404, "not_found", "Currency job not found");
    if (job.status === "completed" || job.status === "cancelled") return;
    const rates = frozenRatesSchema.parse(JSON.parse(job.ratesJson)) as FrozenRates;
    const rows = await this.db.select({ id: deal.id, amountMinor: deal.amountMinor, currency: deal.currency, moneyRevision: deal.moneyRevision, baseAmountMinor: dealConversion.baseAmountMinor, baseCurrency: dealConversion.baseCurrency }).from(deal).leftJoin(dealConversion, and(eq(dealConversion.dealId, deal.id), eq(dealConversion.version, job.targetVersion), eq(dealConversion.moneyRevision, deal.moneyRevision))).where(job.cursor ? gt(deal.id, job.cursor) : undefined).orderBy(asc(deal.id)).limit(26);
    const chunk = rows.slice(0,25), finished = rows.length <=25;
    if (finished && job.processed + chunk.length !== job.total) throw new HttpError(409,"conflict","Currency job population changed");
    let converted = 0, missing = 0;
    const writes = chunk.flatMap(row => {
      if (job.kind === "fill_missing" && row.baseAmountMinor !== null && row.baseCurrency === job.targetCurrency) return [];
      const fields = conversionFields(row.amountMinor, row.currency, job.targetCurrency, rates);
      if (fields.baseAmountMinor !== null) converted++; else if (row.amountMinor !== null) missing++;
      return [this.db.insert(dealConversion).values({ version: job.targetVersion, dealId: row.id, moneyRevision: row.moneyRevision, amountMinor: row.amountMinor, currency: row.currency, ...fields }).onConflictDoUpdate({ target: [dealConversion.version, dealConversion.dealId], set: { moneyRevision: row.moneyRevision, amountMinor: row.amountMinor, currency: row.currency, ...fields } })];
    });
    const op = this.operation(context, sql`exists(select 1 from crm_setting s join currency_job j on j.id=s.pending_job_id where s.id='settings' and s.pending_job_id=${id} and s.active_conversion_version=${job.expectedVersion} and j.cursor is ${job.cursor} and j.processed=${job.processed} and j.status in ('pending','running'))`);
    const now = new Date();
    await this.db.batch([
      op.begin, ...writes,
      this.db.update(currencyJob).set({ cursor: chunk.at(-1)?.id ?? job.cursor, processed: job.processed+chunk.length, converted: job.converted+converted, missing: job.missing+missing, status: finished ? "completed" : "running", updatedAt: now }).where(eq(currencyJob.id,id)),
      ...(finished ? [this.db.update(crmSetting).set({ activeConversionVersion: job.targetVersion, reportingCurrency: job.targetCurrency, pendingJobId: null, updatedAt: now }).where(eq(crmSetting.id,"settings"))] : []), op.end,
    ]);
  }
  async cancel(context: RequestContext, id: string) {
    await this.guard(context,true);
    const job = await this.db.select().from(currencyJob).where(eq(currencyJob.id,id)).get();
    if (!job) throw new HttpError(404,"not_found","Currency job not found");
    if (job.status === "cancelled") return;
    const op = this.operation(context,sql`exists(select 1 from crm_setting where id='settings' and pending_job_id=${id})`);
    await this.db.batch([op.begin, this.db.update(currencyJob).set({ status:"cancelled", updatedAt:new Date() }).where(eq(currencyJob.id,id)), this.db.update(crmSetting).set({ pendingJobId:null,updatedAt:new Date() }).where(eq(crmSetting.id,"settings")),op.end]);
  }
}
