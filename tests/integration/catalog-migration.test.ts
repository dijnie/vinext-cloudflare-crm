import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";

it("preserves populated records, stage history and retained configuration when catalog storage and product anchors are added", async () => {
  const db = env.UPGRADE_DB;
  const migrationIndex = env.TEST_MIGRATIONS.findIndex(migration => migration.name === "0017_catalog.sql");
  expect(migrationIndex).toBe(16);
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
  await db.batch([
    db.prepare("INSERT INTO lead(id,first_name,owner_membership_id,creator_user_id,created_at,updated_at) VALUES('retained-lead','Lead','stage-owner','stage-owner',1,2)"),
    db.prepare("INSERT INTO lead_collaborator(lead_id,membership_id) VALUES('retained-lead','stage-owner')"),
    db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at) VALUES('retained-lead-field','lead','note','Note','text',0,1,2)"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,lead_id,text_value,updated_at) VALUES('retained-lead-value','retained-lead-field','retained-lead','Original lead value',2)"),
    db.prepare("INSERT INTO activity(id,type,lead_id,author_user_id,content,created_at,updated_at) VALUES('retained-lead-activity','note','retained-lead','stage-owner','Original history',1,2)"),
    db.prepare("UPDATE lead SET status_id='converted',converted_at=3,converted_contact_id='old-contact',revision=1 WHERE id='retained-lead'"),
    db.prepare("INSERT INTO lead_conversion(id,lead_id,operation_key,fingerprint,actor_id,contact_id,mode,lead_revision,mapping_revision,snapshot_json,result_json,completed_at) VALUES('retained-conversion','retained-lead','retained-operation','fingerprint','stage-owner','old-contact','link',0,0,'{}','{}',3)"),
    db.prepare("INSERT INTO saved_view(id,entity,name,shared,state_json,owner_membership_id,creator_user_id,created_at,updated_at) VALUES('retained-lead-view','lead','Lead view',0,'{}','stage-owner','stage-owner',1,2)"),
    db.prepare("INSERT INTO record_draft(id,entity,user_id,expires_at,created_at) VALUES('retained-lead-draft','lead','stage-owner',3,1)"),
  ]);
  const tables=(await db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='d1_migrations' AND name NOT LIKE '_cf_%' ORDER BY name").all<{name:string}>()).results.map(row=>row.name);
  const snapshots=new Map(await Promise.all(tables.map(async table=>[table,(await db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()).results] as const)));
  const objects=(await db.prepare("SELECT name,type FROM sqlite_schema WHERE type IN ('trigger','index') AND name NOT LIKE 'sqlite_%'").all()).results;
  await applyD1Migrations(db,[env.TEST_MIGRATIONS[migrationIndex]!]);
  for(const table of tables){
    let rows=(await db.prepare(`SELECT * FROM ${table} ORDER BY 1,2`).all()).results;
    if(["custom_field_definition","field_configuration_revision","module_setting","record_layout"].includes(table)) rows=rows.filter(row=>row.entity!=="product");
    if(table==="field_value_revision") rows=rows.filter(row=>row.field_id!=="7dd843dc-6df2-4c33-a8f8-8f45cc0e5762");
    if(table==="access_grant") rows=rows.filter(row=>!String(row.permission).startsWith("product."));
    expect(rows,table).toEqual(snapshots.get(table)!.map(row=>["custom_field_value","activity"].includes(table)?{...row,product_id:null}:row));
  }
  expect((await db.prepare("SELECT name,type FROM sqlite_schema WHERE type IN ('trigger','index') AND name NOT LIKE 'sqlite_%'").all()).results).toEqual(expect.arrayContaining(objects));
  expect((await db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE '%catalog_backup%'").all()).results).toEqual([]);
  expect(await db.prepare("SELECT id,type,required FROM custom_field_definition WHERE entity='product' AND key='catalog_images'").first()).toEqual({id:"7dd843dc-6df2-4c33-a8f8-8f45cc0e5762",type:"file",required:0});
  await db.batch([
    db.prepare("INSERT INTO product(id,kind,name,creator_user_id,created_at,updated_at) VALUES('new-product','product','Product','stage-owner',1,2)"),
    db.prepare("INSERT INTO product_variant(id,product_id,is_default,sku,label,price_minor,currency,created_at,updated_at) VALUES('new-variant','new-product',1,' Example-SKU ','Default',125,'USD',1,2)"),
    db.prepare("INSERT INTO crm_file(id,entity,record_id,field_id,uploader_id,object_key,file_name,size,status,created_at) VALUES('product-image','product','new-product','7dd843dc-6df2-4c33-a8f8-8f45cc0e5762','stage-owner','image-object','photo.png',10,'pending',1)"),
    db.prepare("UPDATE crm_file SET status='ready',ready_at=2 WHERE id='product-image'"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,product_id,json_value,updated_at) VALUES('product-image-value','7dd843dc-6df2-4c33-a8f8-8f45cc0e5762','new-product','[\"product-image\"]',2)"),
    db.prepare("INSERT INTO activity(id,type,product_id,author_user_id,content,created_at,updated_at) VALUES('product-activity','note','new-product','stage-owner','Product note',1,2)"),
    db.prepare("INSERT INTO record_draft(id,entity,user_id,expires_at,created_at) VALUES('product-draft','product','stage-owner',3,1)"),
    db.prepare("INSERT INTO saved_view(id,entity,name,shared,state_json,owner_membership_id,creator_user_id,created_at,updated_at) VALUES('product-view','product','Products',0,'{}','stage-owner','stage-owner',1,2)"),
    db.prepare("INSERT INTO saved_view_default(user_id,entity,view_id) VALUES('stage-owner','product','product-view')"),
  ]);
  expect(await db.prepare("SELECT * FROM product_sku").first()).toEqual({normalized_sku:"example-sku",variant_id:"new-variant"});
  await expect(db.prepare("UPDATE custom_field_value SET json_value='[\"old-file\"]' WHERE id='product-image-value'").run()).rejects.toThrow("field_file_unavailable");
  await expect(db.prepare("UPDATE activity SET lead_id='retained-lead' WHERE id='product-activity'").run()).rejects.toThrow("activity history is immutable");
  await expect(db.prepare("UPDATE lead_conversion SET fingerprint='tamper' WHERE id='retained-conversion'").run()).rejects.toThrow("lead_conversion_immutable");
  await expect(db.prepare("UPDATE deal_stage SET closed_state='won' WHERE id='qualified-to-buy'").run()).rejects.toThrow("deal_stage_identity_immutable");
  await expect(db.prepare("UPDATE product SET kind='service' WHERE id='new-product'").run()).rejects.toThrow("catalog_identity_immutable");
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

it("reserves active SKUs atomically across parent lifecycle and rejects package cycles",async()=>{
 const db=env.DB;
 await db.batch([
  db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('catalog-owner','Owner','catalog@tests.invalid',1,1,2)"),
  db.prepare("INSERT INTO product(id,kind,name,creator_user_id,created_at,updated_at) VALUES('a','package','A','catalog-owner',1,2),('b','package','B','catalog-owner',1,2),('c','service','C','catalog-owner',1,2)"),
  db.prepare("INSERT INTO product_variant(id,product_id,is_default,sku,label,price_minor,currency,created_at,updated_at) VALUES('av','a',1,'Unique','Default',100,'USD',1,2),('bv','b',1,'Second','Default',200,'USD',1,2),('cv','c',1,NULL,'Default',300,'USD',1,2)"),
 ]);
 await expect(db.prepare("UPDATE product_variant SET sku=' UNIQUE ' WHERE id='bv'").run()).rejects.toThrow("UNIQUE constraint failed");
 expect(await db.prepare("SELECT sku FROM product_variant WHERE id='bv'").first()).toEqual({sku:"Second"});
 await expect(db.prepare("UPDATE product_variant SET archived_at=3 WHERE id='av'").run()).rejects.toThrow("catalog_default_variant_required");
 await db.prepare("UPDATE product SET archived_at=3 WHERE id='a'").run();
 expect(await db.prepare("SELECT archived_at FROM product_variant WHERE id='av'").first()).toEqual({archived_at:null});
 await db.prepare("UPDATE product_variant SET sku='unique' WHERE id='bv'").run();
 await expect(db.prepare("UPDATE product SET archived_at=NULL WHERE id='a'").run()).rejects.toThrow("UNIQUE constraint failed");
 expect(await db.prepare("SELECT archived_at FROM product WHERE id='a'").first()).toEqual({archived_at:3});
 expect(await db.prepare("SELECT variant_id FROM product_sku WHERE normalized_sku='unique'").first()).toEqual({variant_id:"bv"});
 await db.prepare("UPDATE product_variant SET sku='second' WHERE id='bv'").run();
 await db.prepare("UPDATE product SET archived_at=NULL WHERE id='a'").run();
 await db.prepare("INSERT INTO product_package_component VALUES('a','bv',1)").run();
 await expect(db.prepare("INSERT INTO product_package_component VALUES('b','av',1)").run()).rejects.toThrow("catalog_package_cycle");
 await expect(db.prepare("INSERT INTO product_package_component VALUES('a','av',1)").run()).rejects.toThrow("catalog_package_cycle");
 await expect(db.prepare("INSERT INTO product_package_component VALUES('c','av',1)").run()).rejects.toThrow("catalog_package_invalid");
 for(const quantity of [0,-1,1.5,1000001]) await expect(db.prepare("INSERT INTO product_package_component VALUES('a','cv',?)").bind(quantity).run()).rejects.toThrow();
 await db.prepare("INSERT INTO product_package_component VALUES('b','cv',2)").run();
 await expect(db.prepare("UPDATE product_package_component SET component_variant_id='av' WHERE package_product_id='b'").run()).rejects.toThrow("catalog_package_cycle");
 expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});

it("preserves category history and requires product ownership cleanup before member revocation", async () => {
  const db = env.DB;
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('catalog-admin','Admin','catalog-admin@tests.invalid',1,1,2),('catalog-member','Member','catalog-member@tests.invalid',1,1,2)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES('catalog-admin','owner','active',1,2),('catalog-member','member','active',1,2)"),
    db.prepare("INSERT INTO product_category(id,label,position) VALUES('category','Services',0)"),
    db.prepare("INSERT INTO product(id,kind,name,category_id,owner_membership_id,creator_user_id,created_at,updated_at) VALUES('owned-product','service','Service','category','catalog-member','catalog-admin',1,2)"),
    db.prepare("INSERT INTO product_variant(id,product_id,is_default,label,price_minor,created_at,updated_at) VALUES('owned-default','owned-product',1,'Default',0,1,2)"),
  ]);
  expect(await db.prepare("SELECT revision FROM product_category_revision WHERE id='categories'").first()).toEqual({revision:1});
  await db.prepare("UPDATE product_category SET archived_at=3 WHERE id='category'").run();
  expect(await db.prepare("SELECT revision FROM product_category_revision WHERE id='categories'").first()).toEqual({revision:2});
  await db.prepare("UPDATE product SET description='Historical category retained' WHERE id='owned-product'").run();
  await expect(db.prepare("INSERT INTO product(id,kind,name,category_id,creator_user_id,created_at,updated_at) VALUES('invalid-category','service','Invalid','category','catalog-admin',1,2)").run()).rejects.toThrow("catalog_category_unavailable");
  await expect(db.prepare("DELETE FROM product_category WHERE id='category'").run()).rejects.toThrow("catalog_history_retained");
  await expect(db.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id='catalog-member'").run()).rejects.toThrow("membership references require cleanup");
  await db.batch([
    db.prepare("UPDATE product SET owner_membership_id=NULL WHERE id='owned-product'"),
    db.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id='catalog-member'"),
  ]);
  await expect(db.prepare("UPDATE product SET owner_membership_id='catalog-member' WHERE id='owned-product'").run()).rejects.toThrow("catalog_owner_inactive");
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
