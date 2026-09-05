import { z } from "zod";
import { CURRENCY_CODES } from "./currency-catalog";

export const currencyCodeSchema = z.string().trim().toUpperCase().pipe(z.enum(CURRENCY_CODES));
export const rateSchema = z.string().trim().regex(/^(?:0|[1-9]\d{0,9})(?:\.\d{1,10})?$/).refine(value => /[1-9]/.test(value), "Rate must be positive");
export const currencyMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("set_manual_rate"), baseCurrency: currencyCodeSchema, currency: currencyCodeSchema, rate: rateSchema }).strict(),
  z.object({ action: z.literal("remove_manual_rate"), baseCurrency: currencyCodeSchema, currency: currencyCodeSchema }).strict(),
  z.object({ action: z.literal("set_reporting_currency"), currency: currencyCodeSchema }).strict(),
  z.object({ action: z.literal("fill_missing") }).strict(),
  z.object({ action: z.literal("resume"), jobId: z.string().min(1).max(100) }).strict(),
  z.object({ action: z.literal("cancel"), jobId: z.string().min(1).max(100) }).strict(),
]);
export type CurrencyMutation = z.infer<typeof currencyMutationSchema>;
export const currencyJobSchema = z.object({ id: z.string(), kind: z.enum(["rerate", "fill_missing"]), targetCurrency: currencyCodeSchema, status: z.enum(["pending", "running", "completed", "cancelled"]), processed: z.number().int(), total: z.number().int(), converted: z.number().int(), missing: z.number().int() });
export const currencySettingsSchema = z.object({
  reportingCurrency: currencyCodeSchema, activeVersion: z.string(), canManage: z.boolean(),
  catalog: z.array(z.object({ code: currencyCodeSchema, minorUnits: z.union([z.literal(0), z.literal(2)]) })),
  rates: z.array(z.object({ baseCurrency: currencyCodeSchema, currency: currencyCodeSchema, rate: z.string(), asOf: z.string(), source: z.enum(["manual", "fetched"]), overriding: z.boolean() })),
  unconverted: z.object({ count: z.number().int(), currencies: z.array(z.string()) }), job: currencyJobSchema.nullable(),
});
export type CurrencySettings = z.infer<typeof currencySettingsSchema>;
export type CurrencyJob = z.infer<typeof currencyJobSchema>;
export const dealConversionOutputSchema = z.object({ baseAmountMinor: z.number().int().nullable(), baseCurrency: z.string().nullable(), fxRate: z.string().nullable(), fxRateAt: z.string().nullable() });
