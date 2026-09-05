import type { AppDatabase } from "@/db/client";
import { DEAL_STAGE_IDS } from "@/modules/crm/contracts/deal-contract";
import { stageChangeMetadataSchema } from "@/modules/crm/contracts/activity-contract";
import { HttpError } from "@/server/http-errors";
import type { RequestContext } from "@/server/request-context";
import { dashboardSummarySchema, type DashboardInput } from "./dashboard-contracts";
import { DashboardRepository, type DashboardRow } from "./dashboard-repository";

const MAX_AGGREGATE_ROWS = 1_000_000_000;
function count(value: unknown): number { const result = Number(value ?? 0); if (!Number.isSafeInteger(result) || result < 0 || result > MAX_AGGREGATE_ROWS) throw new Error("Dashboard count is out of range"); return result; }
function amount(row?: DashboardRow): bigint { return BigInt(String(row?.money_hi ?? "0")) * 1_000_000n + BigInt(String(row?.money_lo ?? "0")); }
function timestamp(value: unknown): string | null { return value == null ? null : new Date(Number(value)).toISOString(); }
function brief(row: DashboardRow, prefix: string) { return row[`${prefix}_id`] == null ? null : { id: String(row[`${prefix}_id`]), name: String(row[`${prefix}_name`] ?? "") }; }
function monthly(row?: DashboardRow) { return { count: count(row?.count), valueMinor: amount(row).toString() }; }
export class DashboardService {
  private readonly repository: DashboardRepository;
  constructor(db: AppDatabase) { this.repository = new DashboardRepository(db); }
  async summary(context: RequestContext, input: DashboardInput, now = new Date()) {
    if (!context.membershipId || !context.userId) throw new HttpError(403, "membership_required", "Active membership required");
    const result = await this.repository.snapshot(context.userId, input, now);
    const [settings, stageRows, months, closing, performanceRows, createdTrend, wonTrend, unconverted, biggest, tasks, activity] = result.rows;
    const setting = settings[0]; if (!setting) throw new HttpError(503, "internal_error", "Reporting settings are unavailable");
    const performance = performanceRows[0];
    const wins = count(performance.wins), losses = count(performance.losses), valued = count(performance.valued_wins);
    const monthKey = (offset: number) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)).toISOString().slice(0, 7);
    const stages = DEAL_STAGE_IDS.filter(id => !["closed-won", "closed-lost"].includes(id)).map(stageId => ({ stageId, ...monthly(stageRows.find(row => row.stage_id === stageId)) }));
    return dashboardSummarySchema.parse({
      scope: input.scope, reportingCurrency: setting.reporting_currency, activeVersion: setting.active_conversion_version,
      unconverted: { count: count(unconverted.reduce((total, row) => total + count(row.count), 0)), currencies: unconverted.map(row => String(row.currency)) },
      pipeline: { stages, totalMinor: stages.reduce((sum, stage) => sum + BigInt(stage.valueMinor), 0n).toString(), totalDeals: count(stages.reduce((sum, stage) => sum + stage.count, 0)) },
      wonThisMonth: monthly(months.find(row => row.month === monthKey(0))), wonPrevMonth: monthly(months.find(row => row.month === monthKey(-1))), closingThisMonthTotal: monthly(closing[0]),
      performance: { windowDays: 90, wins, losses, winRate: wins + losses ? wins / (wins + losses) : null, avgDealMinor: valued ? ((amount(performance) + BigInt(Math.floor(valued / 2))) / BigInt(valued)).toString() : null, avgCycleDays: performance.cycle_days == null ? null : Math.round(Number(performance.cycle_days)) },
      trend: Array.from({ length: 6 }, (_, index) => { const month = monthKey(index - 5); return { month, createdMinor: amount(createdTrend.find(row => row.month === month)).toString(), wonMinor: amount(wonTrend.find(row => row.month === month)).toString() }; }),
      biggestOpen: biggest.map(row => ({ id: row.id, name: row.name, stageId: row.stage_id, company: brief(row, "company"), owner: { membershipId: row.owner_id, name: row.owner_name }, amountMinor: row.amount_minor, currency: row.currency, baseAmountMinor: row.base_amount_minor, expectedCloseAt: timestamp(row.expected_close_at) })),
      overdueTasks: tasks.map(row => ({ id: row.id, subject: row.subject, dueAt: timestamp(row.due_at), company: brief(row, "company"), deal: brief(row, "deal") })),
      recentActivity: activity.map(row => ({ id: row.id, type: row.type, subject: row.subject, content: row.content, author: brief(row, "author"), createdAt: timestamp(row.created_at), company: brief(row, "company"), deal: brief(row, "deal"), metadata: row.type === "stage_change" ? stageChangeMetadataSchema.parse(JSON.parse(String(row.metadata_json))) : null })),
    });
  }
}
