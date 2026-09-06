import { applyD1Migrations, env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

const crmTables = [
  "activity",
  "activity_visibility",
  "company",
  "contact",
  "crm_setting",
  "crm_file",
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
    expect(ledger.results).toEqual([
      { name: "0001_crm_baseline.sql" },
      { name: "0002_deal_relationship_invariants.sql" },
      { name: "0003_activity_relationship_history.sql" },
      { name: "0004_custom_field_invariants.sql" },
      { name: "0005_currency_conversion_versions.sql" },
      { name: "0006_branches_and_profiles.sql" },
      { name: "0007_business_calendar_settings.sql" },
      { name: "0008_personal_default_views.sql" },
      { name: "0009_structured_custom_fields.sql" },
      { name: "0010_computed_custom_fields.sql" },
      { name: "0011_custom_field_conversion.sql" },
      { name: "0012_private_file_fields.sql" },
      { name: "0013_module_availability.sql" },
      { name: "0014_record_forms.sql" },
      { name: "0015_deal_stage_configuration.sql" },
      { name: "0016_leads_and_conversion_history.sql" },
    ]);
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
      expect(columns.results.map((row) => row.name)).not.toContain(
        "workspace_id",
      );
      expect(columns.results.map((row) => row.name)).not.toContain(
        "organization_id",
      );
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
        "deal_required_relationships_insert",
        "deal_contact_company_insert",
        "contact_company_preserves_deals",
        "deal_company_preserves_contacts",
        "saved_view_active_owner_insert",
        "custom_field_active_user_insert",
        "activity_visibility_active_member_insert",
      ]),
    );
  });

  it("does not create obsolete sample tables in the fresh CRM schema", async () => {
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_schema WHERE type = 'table'",
    ).all<{ name: string }>();
    const names = tables.results.map((row) => row.name);
    for (const table of [
      "customers", "subscriptions", "features", "subscription_features", "customer_subscriptions",
    ]) expect(names, table).not.toContain(table);
  });

  it("seeds stable stages and singleton settings only", async () => {
    const stages = await env.DB.prepare(
      "SELECT id, position, closed_state FROM deal_stage ORDER BY position",
    ).all();
    expect(stages.results).toHaveLength(7);
    expect(stages.results.at(0)).toMatchObject({
      id: "demo-booked",
      position: 10,
    });
    expect(stages.results.at(-1)).toMatchObject({
      id: "closed-lost",
      closed_state: "lost",
    });

    const settings = await env.DB.prepare("SELECT * FROM crm_setting").all();
    expect(settings.results).toHaveLength(1);
    expect(settings.results[0]).toMatchObject({
      id: "settings",
      reporting_currency: "USD",
    });
    for (const table of ["company", "contact", "deal", "activity"]) {
      const count = await env.DB.prepare(
        `SELECT count(*) AS count FROM ${table}`,
      ).first<{
        count: number;
      }>();
      expect(count?.count).toBe(0);
    }
  });

  it("enforces mandatory and company-compatible deal relationships", async () => {
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('relationship-owner', 'Relationship Owner', 'relationship-owner@example.com', 1, 0, 0)",
      ),
      env.DB.prepare(
        "INSERT INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('relationship-owner', 'owner', 'active', 0, 0)",
      ),
      env.DB.prepare(
        "INSERT INTO company (id, name, created_at, updated_at) VALUES ('relationship-company', 'Relationship Company', 0, 0)",
      ),
      env.DB.prepare(
        "INSERT INTO company (id, name, created_at, updated_at) VALUES ('other-company', 'Other Company', 0, 0)",
      ),
      env.DB.prepare(
        "INSERT INTO contact (id, first_name, company_id, created_at, updated_at) VALUES ('other-contact', 'Other', 'other-company', 0, 0)",
      ),
      env.DB.prepare(
        "INSERT INTO contact (id, first_name, company_id, created_at, updated_at) VALUES ('compatible-contact', 'Compatible', 'relationship-company', 0, 0)",
      ),
    ]);

    await expect(
      env.DB.prepare(
        "INSERT INTO deal (id, name, stage_id, stage_changed_at, currency, created_at, updated_at) VALUES ('invalid-deal', 'Invalid', 'demo-booked', 0, 'USD', 0, 0)",
      ).run(),
    ).rejects.toThrow("deal company and owner are required");

    await env.DB.prepare(
      "INSERT INTO deal (id, name, company_id, owner_membership_id, stage_id, stage_changed_at, currency, created_at, updated_at) VALUES ('valid-deal', 'Valid', 'relationship-company', 'relationship-owner', 'demo-booked', 0, 'USD', 0, 0)",
    ).run();
    await expect(
      env.DB.prepare(
        "INSERT INTO deal_contact (deal_id, contact_id) VALUES ('valid-deal', 'other-contact')",
      ).run(),
    ).rejects.toThrow("deal contact company mismatch");
    await env.DB.prepare(
      "INSERT INTO deal_contact (deal_id, contact_id) VALUES ('valid-deal', 'compatible-contact')",
    ).run();
    await expect(
      env.DB.prepare(
        "UPDATE contact SET company_id = 'other-company' WHERE id = 'compatible-contact'",
      ).run(),
    ).rejects.toThrow("contact company conflicts with a deal");
    await expect(
      env.DB.prepare(
        "UPDATE deal SET company_id = 'other-company' WHERE id = 'valid-deal'",
      ).run(),
    ).rejects.toThrow("deal company conflicts with a contact");
  });
});
