import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";

it("preserves populated records, stage history and retained configuration when lead storage and polymorphic anchors are added", async () => {
  const db = env.UPGRADE_DB;
  const migrationIndex = env.TEST_MIGRATIONS.findIndex(migration => migration.name === "0016_leads_and_conversion_history.sql");
  expect(migrationIndex).toBe(15);
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
  await db.batch([
    db.prepare("INSERT INTO contact(id,first_name,email,phone,owner_membership_id,created_at,updated_at) VALUES('old-contact','Original','Original@example.invalid',' +84 (90) 123-45 ','stage-owner',1700000000001,1700000000002)"),
    db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at) VALUES('old-file-field','deal','old_files','Files','file',1,1700000000001,1700000000002)"),
    db.prepare("INSERT INTO crm_file(id,entity,record_id,field_id,uploader_id,object_key,file_name,size,status,created_at) VALUES('old-file','deal','stage-deal-1','old-file-field','stage-owner','old-object-key','historical.txt',7,'pending',1700000000001)"),
    db.prepare("UPDATE crm_file SET status='ready',ready_at=1700000000002 WHERE id='old-file'"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,deal_id,json_value,updated_at) VALUES('old-file-value','old-file-field','stage-deal-1','[\"old-file\"]',1700000000002)"),
    db.prepare("INSERT INTO field_conversion_preview(id,field_id,user_id,source_type,target_type,config_json,configuration_revision,value_revision,expires_at) VALUES('old-preview','stage-field','stage-owner','text','long_text','{}',2,1,1700003600000)"),
    db.prepare("INSERT INTO saved_view_default(user_id,entity,view_id) VALUES('stage-owner','deal','stage-view')"),
  ]);
  await db.prepare("INSERT INTO contact(id,first_name,phone,created_at,updated_at) VALUES('extension-contact','Extension','+84 90 ext 123',1,2),('misplaced-plus','Invalid','84+90123',1,2)").run();
  const originalObjects = (await db.prepare("SELECT type,name FROM sqlite_schema WHERE type IN ('index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;
  const tables = ["deal", "company", "activity", "activity_visibility", "saved_view", "saved_view_default", "custom_field_definition", "custom_field_value", "deal_conversion", "record_draft", "record_layout", "field_configuration_revision", "field_value_revision", "field_conversion_preview", "crm_file", "module_setting", "deal_stage"];
  const before = new Map(await Promise.all(tables.map(async table => [table, (await db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()).results] as const)));
  const oldContact = await db.prepare("SELECT * FROM contact WHERE id='old-contact'").first();
  await applyD1Migrations(db, [env.TEST_MIGRATIONS[migrationIndex]!]);
  for (const table of tables) {
    let rows = (await db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()).results;
    if (["record_layout", "module_setting", "field_configuration_revision"].includes(table)) rows = rows.filter(row => row.entity !== "lead");
    const expected = before.get(table)!.map(row => ["activity", "custom_field_value"].includes(table) ? { ...row, lead_id: null } : row);
    expect(rows, table).toEqual(expected);
  }
  expect(await db.prepare("SELECT * FROM contact WHERE id='old-contact'").first()).toEqual({ ...oldContact, normalized_phone: "+849012345" });
  expect((await db.prepare("SELECT normalized_phone FROM contact WHERE id IN ('extension-contact','misplaced-plus')").all()).results).toEqual([{normalized_phone:null},{normalized_phone:null}]);
  const currentObjects = (await db.prepare("SELECT type,name FROM sqlite_schema WHERE type IN ('index','trigger') AND name NOT LIKE 'sqlite_%' ORDER BY name").all()).results;
  expect(currentObjects).toEqual(expect.arrayContaining(originalObjects));
  expect((await db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE '%lead_backup%'").all()).results).toEqual([]);
  for (const table of ["record_layout", "module_setting", "field_configuration_revision"]) expect(await db.prepare(`SELECT entity FROM ${table} WHERE entity='lead'`).first()).toEqual({ entity: "lead" });
  await db.batch([
    db.prepare("INSERT INTO lead(id,first_name,owner_membership_id,creator_user_id,created_at,updated_at) VALUES('new-lead','Lead','stage-owner','stage-owner',1700000000001,1700000000002)"),
    db.prepare("INSERT INTO lead_collaborator(lead_id,membership_id) VALUES('new-lead','stage-owner')"),
    db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at) VALUES('lead-text','lead','lead_note','Note','text',0,1,1),('lead-file','lead','lead_files','Files','file',1,1,1)"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,lead_id,text_value,updated_at) VALUES('lead-value','lead-text','new-lead','Real lead value',1)"),
    db.prepare("INSERT INTO crm_file(id,entity,record_id,field_id,uploader_id,object_key,file_name,size,status,created_at) VALUES('lead-file-id','lead','new-lead','lead-file','stage-owner','lead-object-key','lead.txt',5,'pending',1)"),
    db.prepare("UPDATE crm_file SET status='ready',ready_at=2 WHERE id='lead-file-id'"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,lead_id,json_value,updated_at) VALUES('lead-file-value','lead-file','new-lead','[\"lead-file-id\"]',2)"),
    db.prepare("INSERT INTO activity(id,type,lead_id,author_user_id,content,created_at,updated_at) VALUES('lead-activity','note','new-lead','stage-owner','Lead history',1,1)"),
    db.prepare("INSERT INTO saved_view(id,entity,name,shared,state_json,owner_membership_id,creator_user_id,created_at,updated_at) VALUES('lead-view','lead','Lead view',0,'{}','stage-owner','stage-owner',1,1)"),
    db.prepare("INSERT INTO saved_view_default(user_id,entity,view_id) VALUES('stage-owner','lead','lead-view')"),
    db.prepare("INSERT INTO record_draft(id,entity,user_id,expires_at,created_at) VALUES('lead-draft','lead','stage-owner',2,1)"),
  ]);
  expect(await db.prepare("SELECT text_value FROM custom_field_value WHERE id='lead-value'").first()).toEqual({ text_value: "Real lead value" });
  await expect(db.prepare("UPDATE custom_field_value SET json_value='[\"old-file\"]' WHERE id='lead-file-value'").run()).rejects.toThrow("field_file_unavailable");
  await expect(db.prepare("UPDATE custom_field_value SET deal_id='stage-deal-1' WHERE id='lead-value'").run()).rejects.toThrow();
  await expect(db.prepare("UPDATE activity SET content='tamper' WHERE id='stage-history'").run()).rejects.toThrow("activity history is immutable");
  await expect(db.prepare("UPDATE activity SET content='tamper' WHERE id='lead-activity'").run()).rejects.toThrow("activity history is immutable");
  await expect(db.prepare("UPDATE crm_file SET object_key='tamper' WHERE id='old-file'").run()).rejects.toThrow("file_metadata_immutable");
  await expect(db.prepare("UPDATE deal_stage SET closed_state='won' WHERE id='qualified-to-buy'").run()).rejects.toThrow("deal_stage_identity_immutable");
  await expect(db.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id='stage-owner'").run()).rejects.toThrow();
  await expect(db.prepare("INSERT INTO contact(id,first_name,email,created_at,updated_at) VALUES('duplicate','Duplicate','Original@example.invalid',1,1)").run()).rejects.toThrow("UNIQUE constraint failed");
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});


it("uses the contact conversion index for bounded chronological source lookup", async () => {
  const columns = (await env.DB.prepare("PRAGMA index_xinfo(lead_conversion_contact_completed_idx)").all<{name:string|null;desc:number;key:number}>()).results.filter(column => column.key === 1);
  expect(columns.map(({name,desc}) => ({name,desc}))).toEqual([{name:"contact_id",desc:0},{name:"completed_at",desc:1},{name:"lead_id",desc:0}]);
  const plan = (await env.DB.prepare("EXPLAIN QUERY PLAN SELECT l.id,l.first_name,l.last_name,c.completed_at FROM lead_conversion c JOIN lead l ON l.id=c.lead_id WHERE c.contact_id=? ORDER BY c.completed_at DESC,c.lead_id LIMIT 100").bind("target-contact").all<{detail:string}>()).results.map(row => row.detail).join("\n");
  expect(plan).toContain("USING COVERING INDEX lead_conversion_contact_completed_idx (contact_id=?)");
  expect(plan).not.toContain("SCAN c");
  expect(plan).not.toContain("TEMP B-TREE");
});
