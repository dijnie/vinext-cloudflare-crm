import { z } from "zod";
import { currencyCodeSchema } from "@/lib/services/currencies/currency-contracts";
import { dealStageSchema } from "@/lib/services/deals/deal-contract";
import { stageChangeMetadataSchema } from "@/lib/services/activities/activity-contract";

export const dashboardInputSchema = z.object({ scope: z.enum(["me", "everyone"]).default("me") }).strict();
export type DashboardInput = z.infer<typeof dashboardInputSchema>;
const money = z.string().regex(/^\d+$/);
const count = z.number().int().nonnegative();
const brief = z.object({ id: z.string(), name: z.string() });
const monthly = z.object({ count, valueMinor: money });
export const dashboardSummarySchema = z.object({
  scope: z.enum(["me", "everyone"]), reportingCurrency: currencyCodeSchema, activeVersion: z.string(),
  unconverted: z.object({ count, currencies: z.array(z.string()) }),
  pipeline: z.object({ stages: z.array(z.object({ stageId: dealStageSchema, stageLabel: z.string().nullable(), stageLabelKey: z.string(), count, valueMinor: money })), totalMinor: money, totalDeals: count }),
  wonThisMonth: monthly, wonPrevMonth: monthly, closingThisMonthTotal: monthly,
  performance: z.object({ windowDays: z.literal(90), wins: count, losses: count, winRate: z.number().nullable(), avgDealMinor: money.nullable(), avgCycleDays: z.number().nullable() }),
  trend: z.array(z.object({ month: z.string(), wonMinor: money, createdMinor: money })),
  biggestOpen: z.array(z.object({ id: z.string(), name: z.string(), stageId: dealStageSchema, stageLabel: z.string().nullable(), stageLabelKey: z.string(), company: brief, owner: z.object({ membershipId: z.string(), name: z.string() }), amountMinor: z.number().int().nullable(), currency: z.string(), baseAmountMinor: z.number().int().nullable(), expectedCloseAt: z.string().nullable() })),
  overdueTasks: z.array(z.object({ companyId: z.string().nullable(), contactId: z.string().nullable(), dealId: z.string().nullable(), leadId: z.string().nullable(), productId: z.string().nullable(), orderId: z.string().nullable(), id: z.string(), subject: z.string().nullable(), dueAt: z.string(), company: brief.nullable(), deal: brief.nullable(), lead: brief.nullable(), product: brief.nullable(), order: brief.nullable() })),
  recentActivity: z.array(z.object({ id: z.string(), type: z.enum(["note", "call", "meeting", "task", "stage_change"]), subject: z.string().nullable(), content: z.string().nullable(), author: brief, createdAt: z.string(), company: brief.nullable(), deal: brief.nullable(), lead: brief.nullable(), product: brief.nullable(), order: brief.nullable(), metadata: stageChangeMetadataSchema.nullable() })),
});
export type DashboardSummaryData = z.infer<typeof dashboardSummarySchema>;
