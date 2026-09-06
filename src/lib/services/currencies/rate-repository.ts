import { and, eq } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { crmSetting, exchangeRate } from "@/lib/db/schema";
import { canonicalRate, type FrozenRates } from "./conversion-service";
import { CURRENCY_CODES } from "./currency-catalog";

export class RateRepository {
  constructor(private readonly db: AppDatabase) {}
  async setting() { const row = await this.db.select().from(crmSetting).where(eq(crmSetting.id, "settings")).get(); if (!row) throw new Error("Currency settings are missing"); return row; }
  list(baseCurrency: string) { return this.db.select().from(exchangeRate).where(eq(exchangeRate.baseCurrency, baseCurrency)); }
  async snapshot(baseCurrency: string, now = new Date()): Promise<FrozenRates> {
    const rows = await this.list(baseCurrency);
    const rates: FrozenRates = {};
    for (const row of rows.filter(row => row.source === "fetched").concat(rows.filter(row => row.source === "manual"))) {
      if (!CURRENCY_CODES.includes(row.quoteCurrency as typeof CURRENCY_CODES[number])) continue;
      try { rates[row.quoteCurrency] = { rate: canonicalRate(row.rate), asOf: row.asOf.toISOString(), source: row.source }; }
      catch { delete rates[row.quoteCurrency]; }
    }
    rates[baseCurrency] = { rate: "1", asOf: now.toISOString(), source: "identity" };
    return rates;
  }
  manual(baseCurrency: string, currency: string) { return and(eq(exchangeRate.baseCurrency, baseCurrency), eq(exchangeRate.quoteCurrency, currency), eq(exchangeRate.source, "manual")); }
}
