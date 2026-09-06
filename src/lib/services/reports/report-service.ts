import { sql } from "drizzle-orm";
import type { AppDatabase } from "@/lib/db/database";
import { reportingGoal } from "@/lib/db/schema";
import { HttpError } from "@/lib/http/http-errors";
import type { RequestContext } from "@/lib/http/request-context";
import { actionGuard, permissionError, requirePermission } from "../permissions/permission-policy";
import { businessDate, businessDayBounds } from "../settings/business-time";
import { reportGoalInputSchema, reportInputSchema, reportOutputSchema, type ReportGoalInput, type ReportInput, type ReportOutput } from "./report-contracts";

type Row = Record<string, unknown>;
const DAY = 86_400_000;
const integer = (value: unknown) => BigInt(String(value ?? 0));
const count = (value: unknown) => Number(value ?? 0);
const ratio = (top: number, bottom: number) => bottom === 0 ? null : top / bottom;
const moneyRatio = (top: bigint, bottom: bigint) => bottom === 0n ? null : Number(top * 1_000_000n / bottom) / 1_000_000;
const isoDate = (milliseconds: number) => new Date(milliseconds).toISOString().slice(0, 10);

interface CostResult { total: bigint; complete: boolean }
interface LineSnapshot { variantId?: string; quantity: number; costMinor: number | null; components?: Array<{ variantId?: string; kind: string; quantity: number; costMinor: number | null }> }

function parseLines(value: unknown): LineSnapshot[] {
  try { return JSON.parse(String(value)) as LineSnapshot[]; }
  catch { throw new HttpError(500, "internal_error", "An order has an invalid commercial snapshot"); }
}

function frozenCost(value: unknown): CostResult {
  let total = 0n, complete = true;
  for (const line of parseLines(value)) {
    const parts = line.components?.filter(part => part.kind !== "package") ?? [];
    if (parts.length) for (const part of parts) {
      if (part.costMinor == null) complete = false;
      else total += BigInt(part.costMinor) * BigInt(part.quantity);
    }
    else if (line.costMinor == null) complete = false;
    else total += BigInt(line.costMinor) * BigInt(line.quantity);
  }
  return { total, complete };
}

function returnedCost(linesJson: unknown, variantId: string, quantity: number): bigint | null {
  for (const line of parseLines(linesJson)) {
    const parts = line.components?.filter(part => part.kind !== "package") ?? [];
    for (const item of parts.length ? parts : [line]) {
      if (item.variantId === variantId) return item.costMinor == null ? null : BigInt(item.costMinor) * BigInt(quantity);
    }
  }
  return null;
}

function ageBucket(birthDate: unknown, cutoff: string): string {
  if (birthDate == null || !/^\d{4}-\d{2}-\d{2}$/.test(String(birthDate))) return "missing";
  const [year, month, day] = String(birthDate).split("-").map(Number), [cutoffYear, cutoffMonth, cutoffDay] = cutoff.split("-").map(Number);
  let age = cutoffYear - year - (cutoffMonth < month || cutoffMonth === month && cutoffDay < day ? 1 : 0);
  if (age < 0 || age > 130) return "invalid";
  if (age < 18) return "under-18";
  if (age < 25) return "18-24";
  if (age < 35) return "25-34";
  if (age < 45) return "35-44";
  if (age < 55) return "45-54";
  return "55-plus";
}

function demographic(values: string[]) {
  const groups = new Map<string, number>();
  for (const value of values) groups.set(value, (groups.get(value) ?? 0) + 1);
  return [...groups].map(([key, value]) => ({ key, count: value, rate: ratio(value, values.length) })).sort((a, b) => a.key.localeCompare(b.key));
}

function breakdown(rows: Array<{ key: string; label: string; value: bigint }>) {
  const groups = new Map<string, { label: string; count: number; value: bigint }>();
  for (const row of rows) { const current = groups.get(row.key) ?? { label: row.label, count: 0, value: 0n }; current.count++; current.value += row.value; groups.set(row.key, current); }
  return [...groups].map(([key, value]) => ({ key, label: value.label, count: value.count, valueMinor: value.value.toString() })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

export class ReportService {
  constructor(private readonly db: AppDatabase) {}

  async setGoal(context: RequestContext, raw: ReportGoalInput) {
    const input = reportGoalInputSchema.parse(raw);
    await requirePermission(this.db, context, [], true);
    const settings = await this.db.$client.prepare("SELECT reporting_currency FROM crm_setting WHERE id='settings'").first<Row>();
    if (!settings) throw new HttpError(503, "internal_error", "Reporting settings are unavailable");
    if (input.scopeKind === "member") {
      const member = await this.db.$client.prepare("SELECT 1 ok FROM singleton_membership WHERE user_id=? AND status='active'").bind(input.scopeId).first<Row>();
      if (!member) throw new HttpError(400, "validation_failed", "Goal member must be active");
    }
    if (input.scopeKind === "branch") {
      const branch = await this.db.$client.prepare("SELECT 1 ok FROM branch WHERE id=? AND archived_at IS NULL").bind(input.scopeId).first<Row>();
      if (!branch) throw new HttpError(400, "validation_failed", "Goal branch must be active");
    }
    const id = crypto.randomUUID(), now = new Date();
    const targetScope = input.scopeKind === "workspace" ? sql`${input.scopeId} = ''`
      : input.scopeKind === "member" ? sql`exists(select 1 from singleton_membership where user_id=${input.scopeId} and status='active')`
      : sql`exists(select 1 from branch where id=${input.scopeId} and archived_at is null)`;
    const guard = actionGuard(this.db, context, [], true, sql`${targetScope} and exists(select 1 from crm_setting where id='settings' and reporting_currency=${String(settings.reporting_currency)})`);
    try {
      await this.db.batch([
        guard.begin,
        this.db.insert(reportingGoal).values({ id, scopeKind: input.scopeKind, scopeId: input.scopeId, periodFrom: input.from, periodTo: input.to, currency: String(settings.reporting_currency), amountMinor: Number(input.amountMinor), creatorUserId: context.userId, updatedAt: now }).onConflictDoUpdate({ target: [reportingGoal.scopeKind, reportingGoal.scopeId, reportingGoal.periodFrom, reportingGoal.periodTo, reportingGoal.currency], set: { amountMinor: Number(input.amountMinor), creatorUserId: context.userId, updatedAt: now } }),
        guard.end,
      ]);
    } catch (error) { permissionError(error); }
    return { saved: true as const };
  }

  async summary(context: RequestContext, raw: ReportInput, now = new Date()): Promise<ReportOutput> {
    const input = reportInputSchema.parse(raw);
    await requirePermission(this.db, context, ["report.view"]);
    const [settings, exportGrant] = await Promise.all([
      this.db.$client.prepare("SELECT reporting_currency,time_zone FROM crm_setting WHERE id='settings'").first<Row>(),
      this.db.$client.prepare("SELECT EXISTS(SELECT 1 FROM membership_access ma JOIN access_grant ag ON ag.profile_id=ma.profile_id WHERE ma.membership_id=? AND ag.permission='report.export') allowed").bind(context.membershipId).first<Row>(),
    ]);
    if (!settings) throw new HttpError(503, "internal_error", "Reporting settings are unavailable");
    const reporting = String(settings.reporting_currency), timeZone = String(settings.time_zone), today = businessDate(now, timeZone);
    const periodTo = input.from <= today && today < input.to ? today : input.to;
    const { start } = businessDayBounds(input.from, timeZone), { end } = businessDayBounds(periodTo, timeZone);
    const days = Math.round((Date.parse(`${periodTo}T00:00:00Z`) - Date.parse(`${input.from}T00:00:00Z`)) / DAY) + 1;
    const previousTo = isoDate(Date.parse(`${input.from}T00:00:00Z`) - DAY), previousFrom = isoDate(Date.parse(`${input.from}T00:00:00Z`) - days * DAY);
    const ownerId = input.scope === "me" ? context.membershipId : input.scope === "member" ? input.scopeId : undefined;
    const branchId = input.scope === "branch" ? input.scopeId : undefined;
    const ownershipFilter = ownerId ? " AND so.owner_membership_id=?" : branchId ? " AND so.owner_membership_id IN (SELECT membership_id FROM member_branch WHERE branch_id=?)" : "";
    const missingSource = input.source === "__missing__";
    const orderFilter = `${ownershipFilter}${missingSource ? " AND so.source IS NULL" : input.source ? " AND so.source=?" : ""}${input.recorderUserId ? " AND so.creator_user_id=?" : ""}`;
    const orderArgs = [...(ownerId ? [ownerId] : branchId ? [branchId] : []), ...(input.source && !missingSource ? [input.source] : []), ...(input.recorderUserId ? [input.recorderUserId] : [])];
    const workFilter = ownerId ? " AND ASSIGNEE=?" : branchId ? " AND ASSIGNEE IN (SELECT membership_id FROM member_branch WHERE branch_id=?)" : "";
    const workArgs = ownerId ? [ownerId] : branchId ? [branchId] : [];
    const leadFilter = ownerId ? " AND l.owner_membership_id=?" : branchId ? " AND l.owner_membership_id IN (SELECT membership_id FROM member_branch WHERE branch_id=?)" : "";
    const goalKind = input.scope === "everyone" ? "workspace" : input.scope === "branch" ? "branch" : "member", goalId = input.scope === "me" ? context.membershipId : input.scopeId ?? "";
    const statements = [
      this.db.$client.prepare(`SELECT so.*,trim(c.first_name||' '||coalesce(c.last_name,'')) contact_name,c.birth_date,c.gender,u.name recorder_name FROM sales_order so JOIN contact c ON c.id=so.contact_id LEFT JOIN user u ON u.id=so.creator_user_id WHERE so.completed_date BETWEEN ? AND ?${orderFilter} ORDER BY so.completed_date,so.number LIMIT 5001`).bind(input.from, periodTo, ...orderArgs),
      this.db.$client.prepare(`SELECT oo.action,count(*) count FROM order_operation oo JOIN sales_order so ON so.id=oo.order_id WHERE oo.business_date BETWEEN ? AND ? AND oo.action IN ('confirm','complete','cancel')${orderFilter} GROUP BY oo.action`).bind(input.from, periodTo, ...orderArgs),
      this.db.$client.prepare(`SELECT so.currency,sum(oa.goods_minor+oa.surcharge_minor) amount,sum(oa.tax_minor) tax FROM order_adjustment oa JOIN sales_order so ON so.id=oa.order_id WHERE oa.business_date BETWEEN ? AND ?${orderFilter} GROUP BY so.currency`).bind(input.from, periodTo, ...orderArgs),
      this.db.$client.prepare(`SELECT op.currency,op.kind,sum(op.amount_minor) amount FROM order_payment op JOIN sales_order so ON so.id=op.order_id WHERE op.business_date BETWEEN ? AND ?${orderFilter} GROUP BY op.currency,op.kind`).bind(input.from, periodTo, ...orderArgs),
      this.db.$client.prepare(`SELECT count(*) cohort,sum(exists(select 1 from lead_conversion lc where lc.lead_id=l.id and lc.completed_at<?)) converted FROM lead l WHERE l.created_at>=? AND l.created_at<?${leadFilter}`).bind(end.getTime(), start.getTime(), end.getTime(), ...workArgs),
      this.db.$client.prepare(`SELECT count(*) count FROM lead_conversion lc JOIN lead l ON l.id=lc.lead_id WHERE lc.completed_at>=? AND lc.completed_at<?${leadFilter}`).bind(start.getTime(), end.getTime(), ...workArgs),
      this.db.$client.prepare(`SELECT tc.due_at,tc.completed_at FROM task_cycle tc JOIN task_record tr ON tr.activity_id=tc.task_id WHERE ((tc.completed_at>=? AND tc.completed_at<?) OR (tc.completed_at IS NULL AND tc.due_at<?))${workFilter.replace("ASSIGNEE", "tr.assignee_membership_id")} LIMIT 5001`).bind(start.getTime(), end.getTime(), end.getTime(), ...workArgs),
      this.db.$client.prepare(`SELECT cyc.due_at,cyc.resolved_at,cyc.opened_at,cyc.first_response_at FROM ticket_cycle cyc JOIN ticket t ON t.id=cyc.ticket_id WHERE ((cyc.resolved_at>=? AND cyc.resolved_at<?) OR (cyc.resolved_at IS NULL AND cyc.due_at<?))${workFilter.replace("ASSIGNEE", "t.assignee_membership_id")} LIMIT 5001`).bind(start.getTime(), end.getTime(), end.getTime(), ...workArgs),
      this.db.$client.prepare(`SELECT so.contact_id,count(*) count FROM sales_order so WHERE so.completed_at<? AND so.state!='cancelled' AND (so.goods_remaining_minor+so.surcharge_remaining_minor+so.tax_remaining_minor)>0${orderFilter} GROUP BY so.contact_id LIMIT 5001`).bind(end.getTime(), ...orderArgs),
      this.db.$client.prepare(`SELECT DISTINCT so.contact_id FROM sales_order so WHERE so.completed_at>=? AND so.completed_at<? AND so.state!='cancelled' AND (so.goods_remaining_minor+so.surcharge_remaining_minor+so.tax_remaining_minor)>0${orderFilter} LIMIT 5001`).bind(end.getTime() - 30 * DAY, end.getTime(), ...orderArgs),
      this.db.$client.prepare(`SELECT so.currency,sum(so.goods_remaining_minor+so.surcharge_remaining_minor+so.tax_remaining_minor-so.collected_minor+so.refunded_minor) amount FROM sales_order so WHERE so.state!='cancelled'${orderFilter} GROUP BY so.currency`).bind(...orderArgs),
      this.db.$client.prepare(`SELECT so.currency,sum(so.goods_minor-so.discount_minor+so.surcharge_minor) amount FROM sales_order so WHERE so.completed_date BETWEEN ? AND ?${orderFilter} GROUP BY so.currency`).bind(previousFrom, previousTo, ...orderArgs),
      this.db.$client.prepare(`SELECT im.order_id,im.variant_id,im.quantity,so.lines_json,so.currency FROM inventory_movement im JOIN sales_order so ON so.id=im.order_id WHERE im.kind='return' AND im.business_date BETWEEN ? AND ?${orderFilter} LIMIT 5001`).bind(input.from, periodTo, ...orderArgs),
      this.db.$client.prepare("SELECT scope_kind,amount_minor FROM reporting_goal WHERE period_from=? AND period_to=? AND currency=? AND ((scope_kind=? AND scope_id=?) OR (scope_kind='workspace' AND scope_id='')) ORDER BY CASE WHEN scope_kind=? THEN 0 ELSE 1 END LIMIT 1").bind(input.from, input.to, reporting, goalKind, goalId, goalKind),
    ];
    const results = await this.db.$client.batch<Row>(statements);
    const [orders, events, adjustments, payments, leadCohort, leadEvents, tasks, tickets, contactCounts, windowContacts, receivables, previousOrders, returns, goals] = results.map(result => result.results);
    if ([orders, tasks, tickets, contactCounts, windowContacts, returns].some(rows => rows.length > 5000)) throw new HttpError(400, "input_limit_exceeded", "Report contains more than 5,000 detail rows in one section; narrow the date range or scope");
    const detail = orders.filter(row => row.currency === reporting).map(row => {
      const cost = frozenCost(row.lines_json);
      return { id: String(row.id), number: count(row.number), name: String(row.name), contactId: String(row.contact_id), contactName: String(row.contact_name), recorderUserId: String(row.creator_user_id), recorderName: row.recorder_name == null ? null : String(row.recorder_name), source: row.source == null ? null : String(row.source), completedDate: String(row.completed_date), currency: String(row.currency), valueBeforeTaxMinor: (integer(row.goods_minor) - integer(row.discount_minor) + integer(row.surcharge_minor)).toString(), taxMinor: integer(row.tax_minor).toString(), costMinor: cost.complete ? cost.total.toString() : null, costComplete: cost.complete };
    });
    const excluded = orders.filter(row => row.currency !== reporting), completeCosts = detail.filter(row => row.costComplete);
    const orderValue = detail.reduce((sum, row) => sum + integer(row.valueBeforeTaxMinor), 0n), tax = detail.reduce((sum, row) => sum + integer(row.taxMinor), 0n), costTotal = completeCosts.reduce((sum, row) => sum + integer(row.costMinor), 0n);
    const returned = returns.filter(row => row.currency == null || row.currency === reporting).map(row => returnedCost(row.lines_json, String(row.variant_id), Math.abs(count(row.quantity))));
    const returnCostComplete = returned.every(value => value !== null), returnCostTotal = returned.reduce<bigint>((sum, value) => sum + (value ?? 0n), 0n);
    const adjustment = adjustments.filter(row => row.currency === reporting).reduce((sum, row) => sum + integer(row.amount), 0n), adjustmentTax = adjustments.filter(row => row.currency === reporting).reduce((sum, row) => sum + integer(row.tax), 0n);
    const collections = payments.filter(row => row.currency === reporting && row.kind === "collection").reduce((sum, row) => sum + integer(row.amount), 0n), refunds = payments.filter(row => row.currency === reporting && row.kind === "refund").reduce((sum, row) => sum + integer(row.amount), 0n), receivable = receivables.filter(row => row.currency === reporting).reduce((sum, row) => sum + integer(row.amount), 0n);
    const previous = previousOrders.filter(row => row.currency === reporting).reduce((sum, row) => sum + integer(row.amount), 0n);
    const event = (action: string) => count(events.find(row => row.action === action)?.count), cohort = count(leadCohort[0]?.cohort), converted = count(leadCohort[0]?.converted);
    const windowIds = new Set(windowContacts.map(row => String(row.contact_id))), repeat = contactCounts.filter(row => windowIds.has(String(row.contact_id)) && count(row.count) >= 2).length;
    const taskDone = tasks.filter(row => row.completed_at != null), taskDue = taskDone.filter(row => row.due_at != null), ticketDone = tickets.filter(row => row.resolved_at != null), ticketDue = ticketDone.filter(row => row.due_at != null), responded = tickets.filter(row => row.first_response_at != null);
    const contacts = new Map<string, Row>(); for (const row of orders.filter(row => row.currency === reporting)) contacts.set(String(row.contact_id), row);
    const goal = goals[0] ? { amountMinor: integer(goals[0].amount_minor).toString(), progressRate: moneyRatio(orderValue, integer(goals[0].amount_minor)), scopeKind: String(goals[0].scope_kind) as "workspace" | "member" | "branch" } : null;
    const queryRows = results.reduce((sum, result) => sum + Number((result.meta as { rows_read?: number }).rows_read ?? result.results.length), 0);
    return reportOutputSchema.parse({
      input, viewerMembershipId: context.membershipId, reportingCurrency: reporting, timeZone, generatedAt: now.toISOString(), capabilities: { export: context.role === "owner" || count(exportGrant?.allowed) === 1, setGoal: context.role === "owner" }, query: { statements: statements.length, rowsRead: queryRows },
      coverage: { includedOrders: detail.length, excludedOrders: excluded.length, excludedCurrencies: [...new Set(excluded.map(row => String(row.currency)))].sort(), costCompleteOrders: completeCosts.length, costCoverage: ratio(completeCosts.length, detail.length) },
      sales: { confirmedOrders: event("confirm"), completedOrders: detail.length, cancelledOrders: event("cancel"), orderValueMinor: orderValue.toString(), taxMinor: tax.toString(), adjustmentMinor: adjustment.toString(), adjustmentTaxMinor: adjustmentTax.toString(), averageOrderMinor: detail.length ? (orderValue / BigInt(detail.length)).toString() : null, grossProfitMinor: completeCosts.length === detail.length && returnCostComplete ? (orderValue - adjustment - costTotal + returnCostTotal).toString() : null, collectionsMinor: collections.toString(), refundsMinor: refunds.toString(), netCollectionMinor: (collections - refunds).toString(), receivableMinor: receivable.toString() },
      comparison: { previousFrom, previousTo, currentMinor: orderValue.toString(), previousMinor: previous.toString(), changeRate: moneyRatio(orderValue - previous, previous) }, goal,
      customers: { buyingContacts: contactCounts.length, totalPurchaseMinor: orderValue.toString(), netCollectionMinor: (collections - refunds).toString(), repeatWindowContacts: windowIds.size, repeatContacts: repeat, repeatRate: ratio(repeat, windowIds.size), ages: demographic([...contacts.values()].map(row => ageBucket(row.birth_date, periodTo))), genders: demographic([...contacts.values()].map(row => row.gender == null ? "missing" : String(row.gender))) },
      leads: { cohort, convertedFromCohort: converted, cohortRate: ratio(converted, cohort), convertedInPeriod: count(leadEvents[0]?.count) },
      work: { openOverdueTasks: tasks.filter(row => row.completed_at == null && row.due_at != null && count(row.due_at) < end.getTime()).length, completedTasksWithDue: taskDue.length, completedTasksOnTime: taskDue.filter(row => count(row.completed_at) <= count(row.due_at)).length, tasksWithoutDue: taskDone.length - taskDue.length, taskOnTimeRate: ratio(taskDue.filter(row => count(row.completed_at) <= count(row.due_at)).length, taskDue.length), openOverdueTickets: tickets.filter(row => row.resolved_at == null && row.due_at != null && count(row.due_at) < end.getTime()).length, resolvedTicketsWithDue: ticketDue.length, resolvedTicketsOnTime: ticketDue.filter(row => count(row.resolved_at) <= count(row.due_at)).length, ticketsWithoutDue: ticketDone.length - ticketDue.length, ticketOnTimeRate: ratio(ticketDue.filter(row => count(row.resolved_at) <= count(row.due_at)).length, ticketDue.length), averageFirstResponseMinutes: responded.length ? responded.reduce((sum, row) => sum + (count(row.first_response_at) - count(row.opened_at)) / 60_000, 0) / responded.length : null, averageResolutionMinutes: ticketDone.length ? ticketDone.reduce((sum, row) => sum + (count(row.resolved_at) - count(row.opened_at)) / 60_000, 0) / ticketDone.length : null },
      sources: breakdown(detail.map(row => ({ key: row.source ?? "__missing__", label: row.source ?? "Unspecified", value: integer(row.valueBeforeTaxMinor) }))), recorders: breakdown(detail.map(row => ({ key: row.recorderUserId, label: row.recorderName ?? "Unknown", value: integer(row.valueBeforeTaxMinor) }))), orders: detail,
      definition: "Completed order value excludes tax; adjustments, collections and refunds follow their own business dates. Repeat purchase uses positive completed orders in the trailing 30 days. Missing costs are never treated as zero.",
    });
  }
}
