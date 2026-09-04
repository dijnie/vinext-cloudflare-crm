import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const crmTables = [
  "activity",
  "activity_visibility",
  "company",
  "contact",
  "crm_setting",
  "custom_field_definition",
  "custom_field_option",
  "custom_field_value",
  "deal",
  "deal_contact",
  "deal_stage",
  "exchange_rate",
  "saved_view",
];

describe("CRM baseline migration", () => {
  it("applies once and records the authoritative baseline", async () => {
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
    const ledger = await env.DB.prepare(
      "SELECT name FROM d1_migrations ORDER BY id",
    ).all<{ name: string }>();
    expect(ledger.results).toEqual([{ name: "0001_crm_baseline.sql" }]);
  });

  it("creates required tables without CRM tenant columns", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table'",
    ).all<{ name: string }>();
    const names = new Set(tables.results.map((row) => row.name));
    for (const table of crmTables) expect(names.has(table), table).toBe(true);

    for (const table of crmTables) {
      const columns = await env.DB.prepare(`PRAGMA table_info(${table})`).all<{
        name: string;
      }>();
      expect(columns.results.map((row) => row.name)).not.toContain("workspace_id");
      expect(columns.results.map((row) => row.name)).not.toContain("organization_id");
    }
  });

  it("keeps foreign keys valid and creates query indexes", async () => {
    const violations = await env.DB.prepare("PRAGMA foreign_key_check").all();
    expect(violations.results).toEqual([]);

    const companyForeignKeys = await env.DB.prepare(
      "PRAGMA foreign_key_list(company)",
    ).all<{ table: string; from: string }>();
    expect(companyForeignKeys.results).toContainEqual(
      expect.objectContaining({
        table: "singleton_membership",
        from: "owner_membership_id",
      }),
    );

    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'index'",
    ).all<{ name: string }>();
    const names = indexes.results.map((row) => row.name);
    expect(names).toEqual(
      expect.arrayContaining([
        "company_owner_idx",
        "contact_company_idx",
        "deal_stage_idx",
        "activity_company_created_idx",
        "custom_field_entity_position_idx",
        "saved_view_entity_shared_idx",
        "exchange_rate_pair_idx",
      ]),
    );

    const triggers = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'trigger'",
    ).all<{ name: string }>();
    expect(triggers.results.map((row) => row.name)).toEqual(
      expect.arrayContaining([
        "membership_keep_last_owner_on_role_change",
        "membership_keep_last_owner_on_status_change",
        "membership_requires_reference_cleanup",
        "company_active_owner_insert",
        "contact_active_owner_insert",
        "deal_active_owner_insert",
        "saved_view_active_owner_insert",
        "custom_field_active_user_insert",
        "activity_visibility_active_member_insert",
      ]),
    );
  });

  it("seeds stable stages and singleton settings only", async () => {
    const stages = await env.DB.prepare(
      "SELECT id, position, closed_state FROM deal_stage ORDER BY position",
    ).all();
    expect(stages.results).toHaveLength(7);
    expect(stages.results.at(0)).toMatchObject({ id: "demo-booked", position: 10 });
    expect(stages.results.at(-1)).toMatchObject({ id: "closed-lost", closed_state: "lost" });

    const settings = await env.DB.prepare("SELECT * FROM crm_setting").all();
    expect(settings.results).toHaveLength(1);
    expect(settings.results[0]).toMatchObject({ id: "settings", reporting_currency: "USD" });
    for (const table of ["company", "contact", "deal", "activity"]) {
      const count = await env.DB.prepare(`SELECT count(*) AS count FROM ${table}`).first<{
        count: number;
      }>();
      expect(count?.count).toBe(0);
    }
  });
});
