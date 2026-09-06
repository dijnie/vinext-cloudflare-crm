import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";

it("upgrades existing activity history without losing rows or visibility", async () => {
  const db = env.UPGRADE_DB;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 2));
  expect((await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).results).toEqual([
    { name: "0001_crm_baseline.sql" },
    { name: "0002_deal_relationship_invariants.sql" },
  ]);

  await db.batch([
    db.prepare("INSERT INTO user (id,name,email,email_verified,created_at,updated_at) VALUES ('upgrade-owner','Owner','owner@upgrade.invalid',1,1700000000001,1700000000002),('upgrade-member','Member','member@upgrade.invalid',1,1700000000001,1700000000002),('upgrade-revoked','Revoked','revoked@upgrade.invalid',1,1700000000001,1700000000002)"),
    db.prepare("INSERT INTO singleton_membership (user_id,role,status,created_at,updated_at) VALUES ('upgrade-owner','owner','active',1700000000001,1700000000002),('upgrade-member','member','active',1700000000001,1700000000002),('upgrade-revoked','member','revoked',1700000000001,1700000000002)"),
    db.prepare("INSERT INTO company (id,name,owner_membership_id,created_at,updated_at) VALUES ('upgrade-company','Company','upgrade-owner',1700000000001,1700000000002),('other-company','Other','upgrade-owner',1700000000001,1700000000002)"),
    db.prepare("INSERT INTO contact (id,first_name,company_id,owner_membership_id,created_at,updated_at) VALUES ('upgrade-contact','Contact','upgrade-company','upgrade-owner',1700000000001,1700000000002)"),
    db.prepare("INSERT INTO deal (id,name,company_id,owner_membership_id,stage_id,stage_changed_at,currency,created_at,updated_at) VALUES ('upgrade-deal','Deal','upgrade-company','upgrade-owner','demo-booked',1700000000003,'USD',1700000000001,1700000000002)"),
  ]);

  const oldActivities = [
    ["old-note", "note", "Historical note", "Giữ nguyên nội dung", 1700000000123, null, null, "upgrade-company", null, null, "upgrade-owner", '{ "source": "legacy", "nested": {"count": 2} }', 1700000000456, 1700000000789],
    ["old-task", "task", "Historical task", null, 1700000000124, 1700000300000, 1700000200000, null, "upgrade-contact", null, "upgrade-member", '{"completedBy":"upgrade-member"}', 1700000000457, 1700000200001],
    ["old-stage", "stage_change", null, "Audit content", null, null, null, null, null, "upgrade-deal", "upgrade-owner", '{"from":"demo-booked","to":"qualified-to-buy"}', 1700000000458, 1700000000458],
  ];
  for (const values of oldActivities) {
    await db.prepare("INSERT INTO activity (id,type,subject,content,occurred_at,due_at,completed_at,company_id,contact_id,deal_id,author_user_id,metadata_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)").bind(...values).run();
    await db.prepare("INSERT INTO activity_visibility (activity_id,membership_id) VALUES (?, 'upgrade-owner'), (?, 'upgrade-member')").bind(values[0], values[0]).run();
  }
  const beforeActivities = (await db.prepare("SELECT * FROM activity ORDER BY id").all()).results.map(row => ({ ...row, lead_id: null, product_id: null, order_id: null }));
  const beforeVisibility = (await db.prepare("SELECT * FROM activity_visibility ORDER BY activity_id,membership_id").all()).results;
  expect(beforeActivities).toHaveLength(3);
  expect(beforeVisibility).toHaveLength(6);
  const insertMultiAnchor = () => db.prepare("INSERT INTO activity (id,type,company_id,contact_id,deal_id,author_user_id,created_at,updated_at) VALUES ('multi-anchor','note','upgrade-company','upgrade-contact','upgrade-deal','upgrade-owner',1700000400000,1700000400000)").run();
  await expect(insertMultiAnchor()).rejects.toThrow("CHECK constraint failed");

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(2));
  expect((await db.prepare("SELECT * FROM activity ORDER BY id").all()).results).toEqual(beforeActivities);
  expect((await db.prepare("SELECT * FROM activity_visibility ORDER BY activity_id,membership_id").all()).results).toEqual(beforeVisibility);
  expect((await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).results).toEqual([
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
      { name: "0017_catalog.sql" },
    { name: "0018_order_ledger.sql" },
    { name: "0019_scheduling_support.sql" },
    { name: "0020_contracts_reviews.sql" },
    { name: "0021_reporting_indexes.sql" },
    { name: "0022_integration_operations.sql" },
  ]);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  expect((await db.prepare("PRAGMA foreign_key_list(activity_visibility)").all()).results).toContainEqual(expect.objectContaining({ table: "activity", from: "activity_id", on_delete: "CASCADE" }));
  expect((await db.prepare("SELECT name FROM sqlite_schema WHERE name IN ('activity_replacement','activity_visibility_backup')").all()).results).toEqual([]);

  for (const anchor of ["company", "contact", "deal"]) {
    const index = await db.prepare(`PRAGMA index_info(activity_${anchor}_created_idx)`).all<{ name: string }>();
    expect(index.results.map(column => column.name)).toEqual([`${anchor}_id`, "created_at", "id"]);
  }
  const indexNames = (await db.prepare("SELECT name FROM sqlite_schema WHERE type='index'").all<{ name: string }>()).results.map(row => row.name);
  expect(indexNames).toEqual(expect.arrayContaining(["activity_due_idx", "activity_author_idx", "activity_visibility_member_idx"]));
  const triggerNames = (await db.prepare("SELECT name FROM sqlite_schema WHERE type='trigger'").all<{ name: string }>()).results.map(row => row.name);
  expect(triggerNames).toEqual(expect.arrayContaining(["activity_compatible_anchors_insert", "activity_history_immutable", "activity_visibility_active_member_insert", "activity_visibility_active_member_update"]));

  await insertMultiAnchor();
  expect(await db.prepare("SELECT company_id,contact_id,deal_id FROM activity WHERE id='multi-anchor'").first()).toEqual({ company_id: "upgrade-company", contact_id: "upgrade-contact", deal_id: "upgrade-deal" });
  await expect(db.prepare("INSERT INTO activity (id,type,author_user_id,created_at,updated_at) VALUES ('no-anchor','note','upgrade-owner',0,0)").run()).rejects.toThrow("CHECK constraint failed");
  await expect(db.prepare("INSERT INTO activity (id,type,company_id,contact_id,author_user_id,created_at,updated_at) VALUES ('mismatch','note','other-company','upgrade-contact','upgrade-owner',0,0)").run()).rejects.toThrow("activity anchor mismatch");
  await expect(db.prepare("INSERT INTO activity (id,type,company_id,author_user_id,created_at,updated_at) VALUES ('inactive-author','note','upgrade-company','upgrade-revoked',0,0)").run()).rejects.toThrow("author membership is inactive");
  await expect(db.prepare("INSERT INTO activity_visibility (activity_id,membership_id) VALUES ('multi-anchor','upgrade-revoked')").run()).rejects.toThrow("activity membership is inactive");
  await expect(db.prepare("UPDATE activity_visibility SET membership_id='upgrade-revoked' WHERE activity_id='old-note' AND membership_id='upgrade-member'").run()).rejects.toThrow("activity membership is inactive");

  for (const id of ["old-note", "old-stage", "old-task"]) {
    await expect(db.prepare("UPDATE activity SET content='tampered' WHERE id=?").bind(id).run()).rejects.toThrow("activity history is immutable");
  }
  expect((await db.prepare("SELECT * FROM activity WHERE id LIKE 'old-%' ORDER BY id").all()).results).toEqual(beforeActivities);
  expect((await db.prepare("SELECT * FROM activity_visibility ORDER BY activity_id,membership_id").all()).results).toEqual(beforeVisibility);
  await db.prepare("UPDATE activity SET completed_at=NULL,updated_at=1700000500000 WHERE id='old-task'").run();
  expect(await db.prepare("SELECT completed_at,updated_at FROM activity WHERE id='old-task'").first()).toEqual({ completed_at: null, updated_at: 1700000500000 });
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
