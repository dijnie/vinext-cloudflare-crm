import type { AppDatabase } from "@/lib/db/database";
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
    const owned = input.scope === "me" ? " AND d.owner_membership_id = ?" : "";
    const args = input.scope === "me" ? [userId] : [];
    const where = `s.id = 'settings' AND d.archived_at IS NULL${owned}`;
    const prepare = (query: string, bindings: (string | number)[] = []) => this.db.$client.prepare(`${explain ? "EXPLAIN QUERY PLAN " : ""}${query}`).bind(...bindings);
    const query = (selection: string, condition = "", tail = "", values: (string | number)[] = []) => prepare(`SELECT ${selection} ${FROM} WHERE ${where}${condition} ${tail}`, [...args, ...values]);
    return [
      prepare("SELECT reporting_currency, active_conversion_version FROM crm_setting WHERE id = 'settings'"),
      prepare(`SELECT catalog.id AS stage_id, catalog.label AS stage_label, catalog.label_key AS stage_label_key, COALESCE(totals.count, 0) AS count, COALESCE(totals.money_hi, '0') AS money_hi, COALESCE(totals.money_lo, '0') AS money_lo
        FROM deal_stage catalog LEFT JOIN (
          SELECT d.stage_id, count(*) AS count, ${sumParts()} ${FROM} WHERE ${where} AND ${OPEN} GROUP BY d.stage_id
        ) totals ON totals.stage_id = catalog.id
        WHERE catalog.closed_state = 'open' AND (catalog.archived_at IS NULL OR totals.count > 0)
        ORDER BY catalog.position, catalog.id`, args),
      query(`strftime('%Y-%m', d.closed_at / 1000, 'unixepoch') AS month, count(*) AS count, ${sumParts()}`, " AND ds.closed_state = 'won' AND d.closed_at >= ? AND d.closed_at < ?", "GROUP BY month", [previous, next]),
      query(`count(*) AS count, ${sumParts()}`, ` AND ${OPEN} AND ${COUNTED} AND d.expected_close_at >= ? AND d.expected_close_at < ?`, "", [current, next]),
      query(`COALESCE(SUM(ds.closed_state = 'won'), 0) AS wins,
        COALESCE(SUM(ds.closed_state = 'lost'), 0) AS losses,
        COALESCE(SUM(CASE WHEN ds.closed_state = 'won' AND ${COUNTED} THEN 1 ELSE 0 END), 0) AS valued_wins,
        AVG(CASE WHEN ds.closed_state = 'won' THEN (d.closed_at - d.created_at) / 86400000.0 END) AS cycle_days,
        ${sumParts(`CASE WHEN ds.closed_state = 'won' THEN ${VALUE} ELSE 0 END`)}`,
        " AND ds.closed_state IN ('won', 'lost') AND d.closed_at >= ? AND d.closed_at <= ?", "", [now.getTime() - 90 * DAY, now.getTime()]),
      query(`strftime('%Y-%m', d.created_at / 1000, 'unixepoch') AS month, ${sumParts()}`, " AND d.created_at >= ? AND d.created_at < ?", "GROUP BY month", [trend, next]),
      query(`strftime('%Y-%m', d.closed_at / 1000, 'unixepoch') AS month, ${sumParts()}`, " AND ds.closed_state = 'won' AND d.closed_at >= ? AND d.closed_at < ?", "GROUP BY month", [trend, next]),
      query("d.currency, count(*) AS count", " AND d.amount_minor IS NOT NULL AND (c.base_amount_minor IS NULL OR c.base_currency IS NULL OR c.base_currency != s.reporting_currency)", "GROUP BY d.currency ORDER BY d.currency"),
      prepare(`SELECT d.id, d.name, d.stage_id, ds.label AS stage_label, ds.label_key AS stage_label_key, d.amount_minor, d.currency, d.expected_close_at,
        CASE WHEN ${COUNTED} THEN c.base_amount_minor ELSE NULL END AS base_amount_minor,
        co.id AS company_id, co.name AS company_name, u.id AS owner_id, u.name AS owner_name
        ${FROM} INNER JOIN company co ON co.id = d.company_id INNER JOIN user u ON u.id = d.owner_membership_id
        WHERE ${where} AND ${OPEN} ORDER BY base_amount_minor DESC, d.expected_close_at ASC, d.id ASC LIMIT 6`, args),
      prepare(`SELECT a.id, a.subject, a.due_at, a.company_id AS anchor_company_id, a.contact_id AS anchor_contact_id, a.deal_id AS anchor_deal_id, a.lead_id AS anchor_lead_id, co.id AS company_id, co.name AS company_name, d.id AS deal_id, d.name AS deal_name, l.id AS lead_id, trim(l.first_name || ' ' || coalesce(l.last_name,'')) AS lead_name
        FROM activity a LEFT JOIN company co ON co.id = a.company_id LEFT JOIN deal d ON d.id = a.deal_id LEFT JOIN lead l ON l.id = a.lead_id
        WHERE a.type = 'task' AND a.completed_at IS NULL AND a.due_at < ? AND a.author_user_id = ?
        ORDER BY a.due_at ASC, a.id ASC LIMIT 10`, [now.getTime(), userId]),
      prepare(`SELECT a.id, a.type, a.subject, substr(a.content, 1, 600) AS content, a.metadata_json, a.created_at,
        u.id AS author_id, u.name AS author_name, co.id AS company_id, co.name AS company_name, d.id AS deal_id, d.name AS deal_name, l.id AS lead_id, trim(l.first_name || ' ' || coalesce(l.last_name,'')) AS lead_name
        FROM activity a INNER JOIN user u ON u.id = a.author_user_id LEFT JOIN company co ON co.id = a.company_id LEFT JOIN deal d ON d.id = a.deal_id LEFT JOIN lead l ON l.id = a.lead_id
        ${input.scope === "me" ? "WHERE a.author_user_id = ?" : ""} ORDER BY a.created_at DESC, a.id DESC LIMIT 12`, args),
    ];
  }
  async snapshot(userId: string, input: DashboardInput, now = new Date()) {
    const results = await this.db.$client.batch<DashboardRow>(this.statements(userId, input, now));
    return { rows: results.map(result => result.results), rowsRead: results.reduce((sum, result) => sum + result.meta.rows_read, 0), statements: results.length };
  }
}
