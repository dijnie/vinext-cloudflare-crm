import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";

it("preserves populated field history, conversion state and current triggers while adding files", async () => {
  const db = env.UPGRADE_DB;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 11));
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('file-owner','Owner','file-owner@upgrade.invalid',1,1,2)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES('file-owner','owner','active',1,2)"),
    db.prepare("INSERT INTO company(id,name,created_at,updated_at) VALUES('file-company','Company',1,2)"),
    db.prepare("INSERT INTO contact(id,first_name,company_id,created_at,updated_at) VALUES('file-contact','Contact','file-company',1,2)"),
  ]);
  const historical: [string, string, unknown][] = [
    ["text", "text_value", "Text"], ["long_text", "text_value", "Long text"],
    ["number", "number_value", 23], ["date", "date_value", 1700000000000],
    ["checkbox", "boolean_value", 1], ["select", "option_id", "selected"],
    ["url", "text_value", "https://example.com"], ["email", "text_value", "a@example.com"],
    ["phone", "text_value", "+84901234567"], ["user", "user_membership_id", "file-owner"],
    ["money", "json_value", '{"amountMinor":123,"currency":"USD"}'],
    ["multiselect", "json_value", '["multi-selected"]'], ["multivalue", "json_value", '["one","two"]'],
    ["rating", "number_value", 4], ["customer", "customer_reference_id", "file-contact"],
  ];
  for (const [position, [type, slot, value]] of historical.entries()) {
    await db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at) VALUES(?,'company',?,?,?, ?,1,2)").bind(type, type, type, type, position).run();
    if (type === "select" || type === "multiselect") await db.prepare("INSERT INTO custom_field_option(id,field_id,label,position) VALUES(?,?,?,0)").bind(type === "select" ? "selected" : "multi-selected", type, "Option").run();
    await db.prepare(`INSERT INTO custom_field_value(id,field_id,company_id,${slot},updated_at) VALUES(?,?,'file-company',?,3)`).bind(`value-${type}`, type, value).run();
  }
  await db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,config_json,position,created_at,updated_at) VALUES('formula','company','formula','Formula','formula','{\"expression\":\"1+2\"}',20,1,2)").run();
  await db.batch([
    db.prepare("UPDATE custom_field_definition SET archived_at=4,deleted_at=5 WHERE id='long_text'"),
    db.prepare("UPDATE custom_field_option SET archived_at=5 WHERE id='selected'"),
    db.prepare("INSERT INTO field_conversion_guard(field_id,source_type,target_type) VALUES('text','text','long_text')"),
    db.prepare("INSERT INTO field_conversion_preview(id,field_id,user_id,source_type,target_type,config_json,configuration_revision,value_revision,expires_at) VALUES('preview','text','file-owner','text','long_text','{}',99,7,9999999999999)"),
  ]);
  const tables = ["custom_field_definition", "custom_field_option", "custom_field_value", "field_value_revision", "field_configuration_revision", "field_conversion_preview", "field_conversion_guard"];
  const snapshots = await Promise.all(tables.map(table => db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()));
  const triggers = (await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger' ORDER BY name").all<{name: string; sql: string}>()).results;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(11));
  for (const [index, table] of tables.entries()) {
    const rows = (await db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all()).results;
    const retained = ["field_configuration_revision","custom_field_definition"].includes(table) ? rows.filter(row => row.entity !== "lead" && row.entity !== "product" && row.entity !== "order") : table === "field_value_revision" ? rows.filter(row => row.field_id !== "7dd843dc-6df2-4c33-a8f8-8f45cc0e5762") : rows;
    const expected = table === "custom_field_value" ? snapshots[index].results.map(row => ({ ...row, lead_id: null, product_id: null, order_id: null })) : snapshots[index].results;
    expect(retained, table).toEqual(expected);
  }
  const after = (await db.prepare("SELECT name,sql FROM sqlite_master WHERE type='trigger'").all<{name: string; sql: string}>()).results;
  const changed = new Set([
    "custom_field_type_with_values", "custom_field_value_validate_insert", "custom_field_value_validate_update", "membership_requires_reference_cleanup", "activity_compatible_anchors_insert", "activity_history_immutable",
    "membership_keep_last_owner_on_delete", "module_setting_preserve", "record_layout_delete", "deal_stage_keep_history", "lead_source_preserve", "lead_status_preserve", "crm_file_preserve_key", "lead_conversion_delete",
    "product_category_delete", "product_delete", "product_variant_delete", "order_operation_immutable_delete", "order_payment_immutable_delete", "order_adjustment_immutable_delete", "inventory_movement_immutable_delete", "entitlement_movement_immutable_delete", "sales_order_delete", "entitlement_delete",
    "appointment_operation_delete", "ticket_cycle_delete", "ticket_event_delete", "contract_version_delete", "contract_operation_delete",
  ]);
  for (const old of triggers) {
    const restored = after.find(trigger => trigger.name === old.name);
    expect(restored, old.name).toBeDefined();
    if (!changed.has(old.name)) expect(restored?.sql).toBe(old.sql);
  }
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  const configBefore = await db.prepare("SELECT revision FROM field_configuration_revision WHERE entity='company'").first<{ revision: number }>();
  await db.prepare("UPDATE custom_field_option SET label='Renamed' WHERE id='multi-selected'").run();
  expect(await db.prepare("SELECT revision FROM field_configuration_revision WHERE entity='company'").first()).toEqual({ revision: configBefore!.revision + 1 });
  await db.prepare("UPDATE custom_field_value SET text_value='Changed' WHERE id='value-text'").run();
  expect(await db.prepare("SELECT revision FROM field_value_revision WHERE field_id='text'").first()).toEqual({ revision: 2 });
  await expect(db.prepare("UPDATE custom_field_definition SET type='number' WHERE id='text'").run()).rejects.toThrow("field_type_has_values");
  await db.prepare("UPDATE custom_field_definition SET type='long_text' WHERE id='text'").run();
  await expect(db.prepare("UPDATE custom_field_value SET text_value='Changed' WHERE id='value-long_text'").run()).rejects.toThrow("field_unavailable");
});

it("enforces file arrays, anchored ready metadata and permanent cleanup tombstones", async () => {
  const db = env.DB;
  await db.batch([
    db.prepare("INSERT INTO company(id,name,created_at,updated_at) VALUES('files-company','Company',1,2),('files-other','Other',1,2)"),
    db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at) VALUES('files','company','files','Files','file',0,1,2),('other-files','company','other-files','Other files','file',1,1,2)"),
  ]);
  const upload = (id: string, record = "files-company", field = "files") => db.prepare("INSERT INTO crm_file(id,object_key,entity,record_id,field_id,uploader_id,file_name,size,status,created_at) VALUES(?,?,'company',?,?,'deleted-user','private.pdf',123,'pending',1)").bind(id, `objects/${id}`, record, field).run();
  await upload("ready");
  await upload("pending");
  await upload("second-ready");
  await upload("wrong-record", "files-other");
  await upload("wrong-field", "files-company", "other-files");
  await db.prepare("UPDATE crm_file SET status='ready',ready_at=2 WHERE id IN ('ready','second-ready','wrong-record','wrong-field')").run();
  const save = (json: string) => db.prepare("INSERT INTO custom_field_value(id,field_id,company_id,json_value,updated_at) VALUES('files-value','files','files-company',?,2) ON CONFLICT(id) DO UPDATE SET json_value=excluded.json_value").bind(json).run();
  await save('["second-ready","ready"]');
  expect(await db.prepare("SELECT json_value FROM custom_field_value WHERE id='files-value'").first()).toEqual({ json_value: '["second-ready","ready"]' });
  await save('["ready"]');
  for (const json of ['["ready","ready"]', '{}', '[1]', 'null', '[""]', JSON.stringify(Array.from({length: 11}, (_, i) => `file-${i}`))]) await expect(save(json)).rejects.toThrow("field_file_invalid");
  for (const id of ["pending", "missing", "wrong-record", "wrong-field"]) await expect(save(JSON.stringify([id]))).rejects.toThrow("field_file_unavailable");
  await expect(db.prepare("UPDATE custom_field_value SET text_value='wrong' WHERE id='files-value'").run()).rejects.toThrow();
  await expect(db.prepare("UPDATE custom_field_definition SET type='multivalue' WHERE id='files'").run()).rejects.toThrow("field_type_has_values");
  await db.prepare("INSERT INTO field_conversion_guard(field_id,source_type,target_type) VALUES('files','file','multivalue')").run();
  await expect(db.prepare("UPDATE custom_field_definition SET type='multivalue' WHERE id='files'").run()).rejects.toThrow("field_type_has_values");
  for (const change of ["object_key='changed'", "record_id='files-other'", "field_id='other-files'", "entity='contact'", "uploader_id='other'", "file_name='changed'", "size=1", "created_at=5", "status='failed',ready_at=NULL", "ready_at=8"]) await expect(db.prepare(`UPDATE crm_file SET ${change} WHERE id='ready'`).run()).rejects.toThrow("file_metadata_immutable");
  await db.prepare("UPDATE crm_file SET status='failed' WHERE id='pending'").run();
  await expect(db.prepare("UPDATE crm_file SET status='ready',ready_at=2 WHERE id='pending'").run()).rejects.toThrow("file_metadata_immutable");
  await db.prepare("UPDATE crm_file SET status='cleaning',cleanup_attempted_at=4 WHERE id='pending'").run();
  await db.prepare("UPDATE crm_file SET cleanup_attempted_at=5 WHERE id='pending'").run();
  await expect(db.prepare("UPDATE crm_file SET status='ready',ready_at=2 WHERE id='pending'").run()).rejects.toThrow("file_metadata_immutable");
  await expect(db.prepare("DELETE FROM crm_file WHERE id='pending'").run()).rejects.toThrow("file_key_retained");
  await save('[]');
  await db.prepare("DELETE FROM company WHERE id='files-company'").run();
  await db.prepare("DELETE FROM custom_field_definition WHERE id='files'").run();
  expect(await db.prepare("SELECT count(*) AS count FROM crm_file").first()).toEqual({ count: 5 });
  expect((await db.prepare("PRAGMA foreign_key_list(crm_file)").all()).results).toEqual([]);
});
