import { sql, type SQL } from "drizzle-orm";
import { executeD1Batch, type AppDatabase } from "@/lib/db/database";
import type { DashboardInput } from "./dashboard-contracts";

const DAY = 86_400_000;
const OPEN = "ds.closed_state = 'open'";
const COUNTED = "c.base_amount_minor IS NOT NULL AND c.base_currency = s.reporting_currency";
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
  statements(userId: string, input: DashboardInput, now: Date, explain = false) {
    const month = (offset: number) => Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1);
    const current = month(0), previous = month(-1), next = month(1), trend = month(-5);
    const owned = input.scope === "me" ? sql` AND d.owner_membership_id = ${userId}` : sql``;
    const where = sql`s.id = 'settings' AND d.archived_at IS NULL${owned}`;
    const prepare = (query: SQL) => this.db.all<DashboardRow>(explain ? sql`EXPLAIN QUERY PLAN ${query}` : query);
    const query = (selection: SQL, condition: SQL = sql``, tail: SQL = sql``) => prepare(sql`SELECT ${selection} ${sql.raw(FROM)} WHERE ${where}${condition} ${tail}`);
    return [
      prepare(sql`SELECT reporting_currency, active_conversion_version FROM crm_setting WHERE id = 'settings'`),
      prepare(sql`SELECT catalog.id AS stage_id, catalog.label AS stage_label, catalog.label_key AS stage_label_key, COALESCE(totals.count, 0) AS count, COALESCE(totals.money_hi, '0') AS money_hi, COALESCE(totals.money_lo, '0') AS money_lo
        FROM deal_stage catalog LEFT JOIN (
          SELECT d.stage_id, count(*) AS count, ${sql.raw(sumParts())} ${sql.raw(FROM)} WHERE ${where} AND ${sql.raw(OPEN)} GROUP BY d.stage_id
        ) totals ON totals.stage_id = catalog.id
        WHERE catalog.closed_state = 'open' AND (catalog.archived_at IS NULL OR totals.count > 0)
        ORDER BY catalog.position, catalog.id`),
      query(sql`strftime('%Y-%m', d.closed_at / 1000, 'unixepoch') AS month, count(*) AS count, ${sql.raw(sumParts())}`, sql` AND ds.closed_state = 'won' AND d.closed_at >= ${previous} AND d.closed_at < ${next}`, sql`GROUP BY month`),
      query(sql`count(*) AS count, ${sql.raw(sumParts())}`, sql` AND ${sql.raw(OPEN)} AND ${sql.raw(COUNTED)} AND d.expected_close_at >= ${current} AND d.expected_close_at < ${next}`),
      query(sql`COALESCE(SUM(ds.closed_state = 'won'), 0) AS wins,
        COALESCE(SUM(ds.closed_state = 'lost'), 0) AS losses,
        COALESCE(SUM(CASE WHEN ds.closed_state = 'won' AND ${sql.raw(COUNTED)} THEN 1 ELSE 0 END), 0) AS valued_wins,
        AVG(CASE WHEN ds.closed_state = 'won' THEN (d.closed_at - d.created_at) / 86400000.0 END) AS cycle_days,
        ${sql.raw(sumParts(`CASE WHEN ds.closed_state = 'won' THEN ${VALUE} ELSE 0 END`))}`,
        sql` AND ds.closed_state IN ('won', 'lost') AND d.closed_at >= ${now.getTime() - 90 * DAY} AND d.closed_at <= ${now.getTime()}`),
      query(sql`strftime('%Y-%m', d.created_at / 1000, 'unixepoch') AS month, ${sql.raw(sumParts())}`, sql` AND d.created_at >= ${trend} AND d.created_at < ${next}`, sql`GROUP BY month`),
      query(sql`strftime('%Y-%m', d.closed_at / 1000, 'unixepoch') AS month, ${sql.raw(sumParts())}`, sql` AND ds.closed_state = 'won' AND d.closed_at >= ${trend} AND d.closed_at < ${next}`, sql`GROUP BY month`),
      query(sql`d.currency, count(*) AS count`, sql` AND d.amount_minor IS NOT NULL AND (c.base_amount_minor IS NULL OR c.base_currency IS NULL OR c.base_currency != s.reporting_currency)`, sql`GROUP BY d.currency ORDER BY d.currency`),
      prepare(sql`SELECT d.id, d.name, d.stage_id, ds.label AS stage_label, ds.label_key AS stage_label_key, d.amount_minor, d.currency, d.expected_close_at,
        CASE WHEN ${sql.raw(COUNTED)} THEN c.base_amount_minor ELSE NULL END AS base_amount_minor,
        co.id AS company_id, co.name AS company_name, u.id AS owner_id, u.name AS owner_name
        ${sql.raw(FROM)} INNER JOIN company co ON co.id = d.company_id INNER JOIN user u ON u.id = d.owner_membership_id
        WHERE ${where} AND ${sql.raw(OPEN)} ORDER BY base_amount_minor DESC, d.expected_close_at ASC, d.id ASC LIMIT 6`),
      prepare(sql`SELECT a.id, a.subject, a.due_at, a.company_id AS anchor_company_id, a.contact_id AS anchor_contact_id, a.deal_id AS anchor_deal_id, a.lead_id AS anchor_lead_id, a.product_id AS anchor_product_id, a.order_id AS anchor_order_id, co.id AS company_id, co.name AS company_name, d.id AS deal_id, d.name AS deal_name, l.id AS lead_id, trim(l.first_name || ' ' || coalesce(l.last_name,'')) AS lead_name, p.id AS product_id, p.name AS product_name, so.id AS order_id, so.name AS order_name
        FROM activity a LEFT JOIN company co ON co.id = a.company_id LEFT JOIN deal d ON d.id = a.deal_id LEFT JOIN lead l ON l.id = a.lead_id LEFT JOIN product p ON p.id = a.product_id LEFT JOIN sales_order so ON so.id = a.order_id
        WHERE a.type = 'task' AND a.completed_at IS NULL AND a.due_at < ${now.getTime()} AND a.author_user_id = ${userId}
        ORDER BY a.due_at ASC, a.id ASC LIMIT 10`),
      prepare(sql`SELECT a.id, a.type, a.subject, substr(a.content, 1, 600) AS content, a.metadata_json, a.created_at,
        u.id AS author_id, u.name AS author_name, co.id AS company_id, co.name AS company_name, d.id AS deal_id, d.name AS deal_name, l.id AS lead_id, trim(l.first_name || ' ' || coalesce(l.last_name,'')) AS lead_name, p.id AS product_id, p.name AS product_name, so.id AS order_id, so.name AS order_name
        FROM activity a INNER JOIN user u ON u.id = a.author_user_id LEFT JOIN company co ON co.id = a.company_id LEFT JOIN deal d ON d.id = a.deal_id LEFT JOIN lead l ON l.id = a.lead_id LEFT JOIN product p ON p.id = a.product_id LEFT JOIN sales_order so ON so.id = a.order_id
        ${input.scope === "me" ? sql`WHERE a.author_user_id = ${userId}` : sql``} ORDER BY a.created_at DESC, a.id DESC LIMIT 12`),
    ];
  }
  async snapshot(userId: string, input: DashboardInput, now = new Date()) {
    const results = await executeD1Batch<DashboardRow>(this.db, this.statements(userId, input, now));
    return { rows: results.map(result => result.results), rowsRead: results.reduce((sum, result) => sum + result.meta.rows_read, 0), statements: results.length };
  }
}
