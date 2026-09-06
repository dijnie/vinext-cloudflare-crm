import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";

it("preserves populated records, stage history and retained configuration when stage settings are added", async () => {
  const db = env.UPGRADE_DB;
  const migrationIndex = env.TEST_MIGRATIONS.findIndex(migration => migration.name === "0015_deal_stage_configuration.sql");
  expect(migrationIndex).toBe(14);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, migrationIndex));
  const seedStages = (await db.prepare("SELECT * FROM deal_stage ORDER BY position").all()).results;
  expect(seedStages.map(stage => [stage.id, stage.closed_state])).toEqual([
    ["demo-booked", "open"], ["qualified-to-buy", "open"], ["unqualified-to-buy", "lost"],
    ["decision-maker-bought-in", "open"], ["contract-sent", "open"], ["closed-won", "won"], ["closed-lost", "lost"],
  ]);
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('stage-owner','Owner','stages@upgrade.invalid',1,1700000000001,1700000000002)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES('stage-owner','owner','active',1700000000001,1700000000002)"),
    db.prepare("INSERT INTO company(id,name,owner_membership_id,created_at,updated_at) VALUES('stage-company','Historical company','stage-owner',1700000000001,1700000000002)"),
    ...seedStages.map((stage, index) => db.prepare("INSERT INTO deal(id,name,company_id,owner_membership_id,stage_id,stage_changed_at,amount_minor,currency,closed_at,closed_reason,created_at,updated_at) VALUES(?,?,'stage-company','stage-owner',?,1700000000123,1200,'USD',?,?,1700000000001,1700000000002)").bind(`stage-deal-${index}`, `Historical ${stage.id}`, stage.id, stage.closed_state === "open" ? null : 1700000000123, stage.closed_state === "lost" ? "Historical reason" : null)),
    db.prepare("INSERT INTO activity(id,type,deal_id,company_id,author_user_id,metadata_json,created_at,updated_at) VALUES('stage-history','stage_change','stage-deal-1','stage-company','stage-owner',?,1700000000123,1700000000123)").bind('{ "fromStageId": "demo-booked", "toStageId": "qualified-to-buy" }'),
    db.prepare("INSERT INTO activity_visibility(activity_id,membership_id) VALUES('stage-history','stage-owner')"),
    db.prepare("INSERT INTO saved_view(id,entity,name,shared,state_json,owner_membership_id,creator_user_id,created_at,updated_at) VALUES('stage-view','deal','Historical stages',0,?,'stage-owner','stage-owner',1700000000001,1700000000002)").bind('{"version":1,"query":"stage=qualified-to-buy&stage=closed-lost"}'),
    db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at) VALUES('stage-field','deal','historical_stage_note','Historical note','text',0,1700000000001,1700000000002)"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,deal_id,text_value,updated_at) VALUES('stage-value','stage-field','stage-deal-1','Giữ nguyên giá trị',1700000000002)"),
    db.prepare("INSERT INTO deal_conversion(version,deal_id,money_revision,amount_minor,currency,base_amount_minor,base_currency,fx_rate,fx_rate_at,rate_source) VALUES('initial','stage-deal-1',0,1200,'USD',1200,'USD','1',1700000000123,'identity')"),
    db.prepare("INSERT INTO record_draft(id,entity,user_id,expires_at,consumed_at,created_at) VALUES('stage-draft','deal','stage-owner',1700003600000,NULL,1700000000000),('stage-deal-1','deal','stage-owner',1700003600000,1700000000123,1700000000000)"),
    db.prepare("UPDATE record_layout SET revision=3,fields_json=?,updated_at=1700000000123 WHERE entity='deal'").bind('[{"key":"stageId","visible":true},{"key":"historical_stage_note","visible":true}]'),
  ]);
  const tables = ["deal", "company", "activity", "activity_visibility", "saved_view", "custom_field_definition", "custom_field_value", "deal_conversion", "record_draft", "record_layout"];
  const snapshot = () => Promise.all(tables.map(async table => ({ table, rows: (await db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()).results })));
  const before = await snapshot();
  for (const table of before) expect(table.rows.length, table.table).toBeGreaterThan(0);
  await applyD1Migrations(db, [env.TEST_MIGRATIONS[migrationIndex]!]);
  expect(await snapshot()).toEqual(before);
  expect((await db.prepare("SELECT * FROM deal_stage ORDER BY position").all()).results).toEqual(seedStages.map(stage => ({ ...stage, label: null, archived_at: null })));
  expect(await db.prepare("SELECT * FROM deal_stage_catalog_revision").first()).toEqual({ id: "stages", revision: 0 });
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  await expect(db.prepare("UPDATE deal_stage SET closed_state='won' WHERE id='qualified-to-buy'").run()).rejects.toThrow("deal_stage_identity_immutable");
  await expect(db.prepare("DELETE FROM deal_stage WHERE id='qualified-to-buy'").run()).rejects.toThrow("deal_stage_delete_forbidden");
  await expect(db.prepare("UPDATE deal_stage SET archived_at=1 WHERE id='demo-booked'").run()).rejects.toThrow("deal_stage_default_required");
  await db.prepare("UPDATE deal_stage SET archived_at=1700000000500 WHERE id='qualified-to-buy'").run();
  expect(await snapshot()).toEqual(before);
  await expect(db.prepare("UPDATE deal SET stage_id='qualified-to-buy' WHERE id='stage-deal-0'").run()).rejects.toThrow("deal_stage_unavailable");
  expect(await snapshot()).toEqual(before);
});
