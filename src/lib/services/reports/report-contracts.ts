import { z } from "zod";
import { MAX_AMOUNT_MINOR } from "../currencies/currency-catalog";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(parsed) && new Date(parsed).toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const money = z.string().regex(/^-?\d+$/);
const optionalRatio = z.number().nullable();

export const reportInputSchema = z.object({
  from: date,
  to: date,
  scope: z.enum(["me", "everyone", "member", "branch"]).default("me"),
  scopeId: z.string().trim().min(1).max(255).optional(),
  recorderUserId: z.string().trim().min(1).max(255).optional(),
  source: z.string().trim().min(1).max(120).optional(),
}).strict()
  .refine(value => ["member", "branch"].includes(value.scope) ? Boolean(value.scopeId) : value.scopeId === undefined, { path: ["scopeId"], message: "A scope target is required only for member and branch reports" })
  .refine(value => value.from <= value.to, { path: ["to"], message: "End date must follow start date" })
  .refine(value => (Date.parse(`${value.to}T00:00:00Z`) - Date.parse(`${value.from}T00:00:00Z`)) / 86_400_000 <= 366, { path: ["to"], message: "Report range is limited to 367 days" })
  ;

export const reportGoalInputSchema = z.object({
  from: date,
  to: date,
  scopeKind: z.enum(["workspace", "member", "branch"]),
  scopeId: z.string().trim().max(255).default(""),
  amountMinor: z.string().max(14).regex(/^\d+$/).refine(value => BigInt(value) <= BigInt(MAX_AMOUNT_MINOR), "Goal exceeds the supported money range"),
}).strict().refine(value => value.from <= value.to, { path: ["to"] })
  .refine(value => value.scopeKind === "workspace" ? value.scopeId === "" : value.scopeId.length > 0, { path: ["scopeId"] });

export const reportOrderSchema = z.object({
  id: z.string(), number: z.number(), name: z.string(), contactId: z.string(), contactName: z.string(),
  recorderUserId: z.string(), recorderName: z.string().nullable(), source: z.string().nullable(),
  completedDate: date, currency: z.string(), valueBeforeTaxMinor: money, taxMinor: money,
  costMinor: money.nullable(), costComplete: z.boolean(),
});

const breakdown = z.object({ key: z.string(), label: z.string(), count: z.number(), valueMinor: money });
const comparison = z.object({ previousFrom: date, previousTo: date, currentMinor: money, previousMinor: money, changeRate: optionalRatio });
const demographic = z.object({ key: z.string(), count: z.number(), rate: z.number().min(0).max(1).nullable() });

export const reportOutputSchema = z.object({
  input: reportInputSchema, viewerMembershipId: z.string(), reportingCurrency: z.string(), timeZone: z.string(), generatedAt: z.string(),
  capabilities: z.object({ export: z.boolean(), setGoal: z.boolean() }),
  query: z.object({ statements: z.number(), rowsRead: z.number() }),
  coverage: z.object({ includedOrders: z.number(), excludedOrders: z.number(), excludedCurrencies: z.array(z.string()), costCompleteOrders: z.number(), costCoverage: z.number().min(0).max(1).nullable() }),
  sales: z.object({ confirmedOrders: z.number(), completedOrders: z.number(), cancelledOrders: z.number(), orderValueMinor: money, taxMinor: money, adjustmentMinor: money, adjustmentTaxMinor: money, averageOrderMinor: money.nullable(), grossProfitMinor: money.nullable(), collectionsMinor: money, refundsMinor: money, netCollectionMinor: money, receivableMinor: money }),
  comparison,
  goal: z.object({ amountMinor: money, progressRate: z.number().nullable(), scopeKind: z.enum(["workspace", "member", "branch"]) }).nullable(),
  customers: z.object({ buyingContacts: z.number(), totalPurchaseMinor: money, netCollectionMinor: money, repeatWindowContacts: z.number(), repeatContacts: z.number(), repeatRate: z.number().min(0).max(1).nullable(), ages: z.array(demographic), genders: z.array(demographic) }),
  leads: z.object({ cohort: z.number(), convertedFromCohort: z.number(), cohortRate: z.number().min(0).max(1).nullable(), convertedInPeriod: z.number() }),
  work: z.object({ openOverdueTasks: z.number(), completedTasksWithDue: z.number(), completedTasksOnTime: z.number(), tasksWithoutDue: z.number(), taskOnTimeRate: z.number().min(0).max(1).nullable(), openOverdueTickets: z.number(), resolvedTicketsWithDue: z.number(), resolvedTicketsOnTime: z.number(), ticketsWithoutDue: z.number(), ticketOnTimeRate: z.number().min(0).max(1).nullable(), averageFirstResponseMinutes: z.number().nullable(), averageResolutionMinutes: z.number().nullable() }),
  sources: z.array(breakdown), recorders: z.array(breakdown), orders: z.array(reportOrderSchema), definition: z.string(),
});

export type ReportInput = z.infer<typeof reportInputSchema>;
export type ReportGoalInput = z.infer<typeof reportGoalInputSchema>;
export type ReportOutput = z.infer<typeof reportOutputSchema>;
