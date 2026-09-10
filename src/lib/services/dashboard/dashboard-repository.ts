import {
  and,
  asc,
  desc,
  eq,
  isNull,
  lt,
  sql,
  type SQL,
  type SQLWrapper,
} from "drizzle-orm";
import { executeD1Batch, type AppDatabase } from "@/lib/db/database";
import {
  activity,
  company,
  crmSetting,
  deal,
  lead,
  product,
  salesOrder,
  user,
} from "@/lib/db/schema";
import type { DashboardInput } from "./dashboard-contracts";

const DAY = 86_400_000;
const OPEN = "ds.closed_state = 'open'";
const COUNTED =
  "c.base_amount_minor IS NOT NULL AND c.base_currency = s.reporting_currency";
const VALUE = `CASE WHEN ${COUNTED} THEN c.base_amount_minor ELSE 0 END`;
const FROM = `FROM deal d INNER JOIN deal_stage ds ON ds.id = d.stage_id CROSS JOIN crm_setting s
  LEFT JOIN deal_conversion c ON c.deal_id = d.id AND c.version = s.active_conversion_version AND c.money_revision = d.money_revision`;
// Dividing before summing keeps both SQLite accumulators exact even when the
// combined monetary total exceeds JavaScript's safe integer range.
function sumParts(expression = VALUE) {
  return `CAST(COALESCE(SUM((${expression}) / 1000000), 0) AS TEXT) AS money_hi,
    CAST(COALESCE(SUM((${expression}) % 1000000), 0) AS TEXT) AS money_lo`;
}
export type DashboardRow = Record<string, unknown>;
export class DashboardRepository {
  constructor(private readonly db: AppDatabase) {}
  statements(
    userId: string,
    input: DashboardInput,
    now: Date,
    explain = false,
  ) {
    const month = (offset: number) =>
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1);
    const current = month(0),
      previous = month(-1),
      next = month(1),
      trend = month(-5);
    const owned =
      input.scope === "me"
        ? sql` AND d.owner_membership_id = ${userId}`
        : sql``;
    const where = sql`s.id = 'settings' AND d.archived_at IS NULL${owned}`;
    const prepare = (query: SQLWrapper) =>
      explain ? sql`EXPLAIN QUERY PLAN ${query.getSQL()}` : query.getSQL();
    const query = (selection: SQL, condition: SQL = sql``, tail: SQL = sql``) =>
      prepare(
        sql`SELECT ${selection} ${sql.raw(FROM)} WHERE ${where}${condition} ${tail}`,
      );
    return [
      prepare(
        this.db
          .select({
            reportingCurrency: crmSetting.reportingCurrency,
            activeConversionVersion: crmSetting.activeConversionVersion,
          })
          .from(crmSetting)
          .where(eq(crmSetting.id, "settings")),
      ),
      prepare(sql`SELECT catalog.id AS stage_id, catalog.label AS stage_label, catalog.label_key AS stage_label_key, COALESCE(totals.count, 0) AS count, COALESCE(totals.money_hi, '0') AS money_hi, COALESCE(totals.money_lo, '0') AS money_lo
        FROM deal_stage catalog LEFT JOIN (
          SELECT d.stage_id, count(*) AS count, ${sql.raw(sumParts())} ${sql.raw(FROM)} WHERE ${where} AND ${sql.raw(OPEN)} GROUP BY d.stage_id
        ) totals ON totals.stage_id = catalog.id
        WHERE catalog.closed_state = 'open' AND (catalog.archived_at IS NULL OR totals.count > 0)
        ORDER BY catalog.position, catalog.id`),
      query(
        sql`strftime('%Y-%m', d.closed_at / 1000, 'unixepoch') AS month, count(*) AS count, ${sql.raw(sumParts())}`,
        sql` AND ds.closed_state = 'won' AND d.closed_at >= ${previous} AND d.closed_at < ${next}`,
        sql`GROUP BY month`,
      ),
      query(
        sql`count(*) AS count, ${sql.raw(sumParts())}`,
        sql` AND ${sql.raw(OPEN)} AND ${sql.raw(COUNTED)} AND d.expected_close_at >= ${current} AND d.expected_close_at < ${next}`,
      ),
      query(
        sql`COALESCE(SUM(ds.closed_state = 'won'), 0) AS wins,
        COALESCE(SUM(ds.closed_state = 'lost'), 0) AS losses,
        COALESCE(SUM(CASE WHEN ds.closed_state = 'won' AND ${sql.raw(COUNTED)} THEN 1 ELSE 0 END), 0) AS valued_wins,
        AVG(CASE WHEN ds.closed_state = 'won' THEN (d.closed_at - d.created_at) / 86400000.0 END) AS cycle_days,
        ${sql.raw(sumParts(`CASE WHEN ds.closed_state = 'won' THEN ${VALUE} ELSE 0 END`))}`,
        sql` AND ds.closed_state IN ('won', 'lost') AND d.closed_at >= ${now.getTime() - 90 * DAY} AND d.closed_at <= ${now.getTime()}`,
      ),
      query(
        sql`strftime('%Y-%m', d.created_at / 1000, 'unixepoch') AS month, ${sql.raw(sumParts())}`,
        sql` AND d.created_at >= ${trend} AND d.created_at < ${next}`,
        sql`GROUP BY month`,
      ),
      query(
        sql`strftime('%Y-%m', d.closed_at / 1000, 'unixepoch') AS month, ${sql.raw(sumParts())}`,
        sql` AND ds.closed_state = 'won' AND d.closed_at >= ${trend} AND d.closed_at < ${next}`,
        sql`GROUP BY month`,
      ),
      query(
        sql`d.currency, count(*) AS count`,
        sql` AND d.amount_minor IS NOT NULL AND (c.base_amount_minor IS NULL OR c.base_currency IS NULL OR c.base_currency != s.reporting_currency)`,
        sql`GROUP BY d.currency ORDER BY d.currency`,
      ),
      prepare(sql`SELECT d.id, d.name, d.stage_id, ds.label AS stage_label, ds.label_key AS stage_label_key, d.amount_minor, d.currency, d.expected_close_at,
        CASE WHEN ${sql.raw(COUNTED)} THEN c.base_amount_minor ELSE NULL END AS base_amount_minor,
        co.id AS company_id, co.name AS company_name, u.id AS owner_id, u.name AS owner_name
        ${sql.raw(FROM)} INNER JOIN company co ON co.id = d.company_id INNER JOIN user u ON u.id = d.owner_membership_id
        WHERE ${where} AND ${sql.raw(OPEN)} ORDER BY base_amount_minor DESC, d.expected_close_at ASC, d.id ASC LIMIT 6`),
      prepare(
        this.db
          .select({
            id: activity.id,
            subject: activity.subject,
            dueAt: activity.dueAt,
            anchorCompanyId: sql`${activity.companyId}`.as("anchor_company_id"),
            anchorContactId: sql`${activity.contactId}`.as("anchor_contact_id"),
            anchorDealId: sql`${activity.dealId}`.as("anchor_deal_id"),
            anchorLeadId: sql`${activity.leadId}`.as("anchor_lead_id"),
            anchorProductId: sql`${activity.productId}`.as("anchor_product_id"),
            anchorOrderId: sql`${activity.orderId}`.as("anchor_order_id"),
            companyId: sql`${company.id}`.as("company_id"),
            companyName: sql`${company.name}`.as("company_name"),
            dealId: sql`${deal.id}`.as("deal_id"),
            dealName: sql`${deal.name}`.as("deal_name"),
            leadId: sql`${lead.id}`.as("lead_id"),
            leadName:
              sql`trim(${lead.firstName} || ' ' || coalesce(${lead.lastName},''))`.as(
                "lead_name",
              ),
            productId: sql`${product.id}`.as("product_id"),
            productName: sql`${product.name}`.as("product_name"),
            orderId: sql`${salesOrder.id}`.as("order_id"),
            orderName: sql`${salesOrder.name}`.as("order_name"),
          })
          .from(activity)
          .leftJoin(company, eq(company.id, activity.companyId))
          .leftJoin(deal, eq(deal.id, activity.dealId))
          .leftJoin(lead, eq(lead.id, activity.leadId))
          .leftJoin(product, eq(product.id, activity.productId))
          .leftJoin(salesOrder, eq(salesOrder.id, activity.orderId))
          .where(
            and(
              eq(activity.type, "task"),
              isNull(activity.completedAt),
              lt(activity.dueAt, now),
              eq(activity.authorUserId, userId),
            ),
          )
          .orderBy(asc(activity.dueAt), asc(activity.id))
          .limit(10),
      ),
      prepare(
        this.db
          .select({
            id: activity.id,
            type: activity.type,
            subject: activity.subject,
            content: sql`substr(${activity.content}, 1, 600)`.as("content"),
            metadataJson: activity.metadataJson,
            createdAt: activity.createdAt,
            authorId: sql`${user.id}`.as("author_id"),
            authorName: sql`${user.name}`.as("author_name"),
            companyId: sql`${company.id}`.as("company_id"),
            companyName: sql`${company.name}`.as("company_name"),
            dealId: sql`${deal.id}`.as("deal_id"),
            dealName: sql`${deal.name}`.as("deal_name"),
            leadId: sql`${lead.id}`.as("lead_id"),
            leadName:
              sql`trim(${lead.firstName} || ' ' || coalesce(${lead.lastName},''))`.as(
                "lead_name",
              ),
            productId: sql`${product.id}`.as("product_id"),
            productName: sql`${product.name}`.as("product_name"),
            orderId: sql`${salesOrder.id}`.as("order_id"),
            orderName: sql`${salesOrder.name}`.as("order_name"),
          })
          .from(activity)
          .innerJoin(user, eq(user.id, activity.authorUserId))
          .leftJoin(company, eq(company.id, activity.companyId))
          .leftJoin(deal, eq(deal.id, activity.dealId))
          .leftJoin(lead, eq(lead.id, activity.leadId))
          .leftJoin(product, eq(product.id, activity.productId))
          .leftJoin(salesOrder, eq(salesOrder.id, activity.orderId))
          .where(
            input.scope === "me"
              ? eq(activity.authorUserId, userId)
              : undefined,
          )
          .orderBy(desc(activity.createdAt), desc(activity.id))
          .limit(12),
      ),
    ];
  }
  async snapshot(userId: string, input: DashboardInput, now = new Date()) {
    const results = await executeD1Batch<DashboardRow>(
      this.db,
      this.statements(userId, input, now),
    );
    return {
      rows: results.map((result) => result.results),
      rowsRead: results.reduce((sum, result) => sum + result.meta.rows_read, 0),
      statements: results.length,
    };
  }
}
