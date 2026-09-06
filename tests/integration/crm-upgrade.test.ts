import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";

const legacyLedger = [
  "0001_crm_baseline.sql",
  "0002_deal_relationship_invariants.sql",
  "0003_activity_relationship_history.sql",
  "0004_custom_field_invariants.sql",
  "0005_currency_conversion_versions.sql",
];

it("rolls back a failed migration and permits a corrected retry with the same ledger name", async () => {
  const db = env.UPGRADE_DB;
  const name = "migration-atomicity-probe.sql";
  await expect(applyD1Migrations(db, [{
    name,
    queries: [
      "CREATE TABLE migration_atomicity_probe(id text PRIMARY KEY NOT NULL)",
      "INSERT INTO table_that_does_not_exist(id) VALUES ('failed')",
    ],
  }])).rejects.toThrow();
  expect(await db.prepare("SELECT name FROM sqlite_schema WHERE name='migration_atomicity_probe'").first()).toBeNull();
  expect(await db.prepare("SELECT name FROM d1_migrations WHERE name=?").bind(name).first()).toBeNull();

  await applyD1Migrations(db, [{
    name,
    queries: [
      "CREATE TABLE migration_atomicity_probe(id text PRIMARY KEY NOT NULL)",
      "INSERT INTO migration_atomicity_probe(id) VALUES ('retried')",
    ],
  }]);
  expect(await db.prepare("SELECT id FROM migration_atomicity_probe").first("id")).toBe("retried");
  expect(await db.prepare("SELECT name FROM d1_migrations WHERE name=?").bind(name).first("name")).toBe(name);
  await db.batch([
    db.prepare("DROP TABLE migration_atomicity_probe"),
    db.prepare("DELETE FROM d1_migrations WHERE name=?").bind(name),
  ]);
});

it("upgrades a populated CRM atomically without changing identity, history, ownership or money", async () => {
  const db = env.UPGRADE_DB;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, legacyLedger.length));
  expect(
    (await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).results,
  ).toEqual(legacyLedger.map((name) => ({ name })));

  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('upgrade-owner','Owner','owner@crm-upgrade.invalid',1,101,102),('upgrade-member','Member','member@crm-upgrade.invalid',1,103,104),('upgrade-revoked','Revoked','revoked@crm-upgrade.invalid',1,105,106)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES ('upgrade-owner','owner','active',101,102),('upgrade-member','member','active',103,104),('upgrade-revoked','member','revoked',105,106)"),
    db.prepare("UPDATE singleton_workspace SET owner_user_id='upgrade-owner',updated_at=107"),
    db.prepare("INSERT INTO account(id,account_id,provider_id,issuer,user_id,password,created_at,updated_at) VALUES ('upgrade-account','upgrade-owner','credential','credential','upgrade-owner','fixture-hash',108,109)"),
    db.prepare("INSERT INTO session(id,expires_at,token,user_id,created_at,updated_at) VALUES ('upgrade-session',9999999999999,'upgrade-session-token','upgrade-owner',110,111)"),
    db.prepare("INSERT INTO company(id,name,owner_membership_id,created_at,updated_at,archived_at) VALUES ('upgrade-company','Archived company','upgrade-member',112,113,131)"),
    db.prepare("INSERT INTO contact(id,first_name,company_id,owner_membership_id,created_at,updated_at) VALUES ('upgrade-contact','Existing contact','upgrade-company','upgrade-owner',114,115)"),
    db.prepare("INSERT INTO deal(id,name,company_id,owner_membership_id,stage_id,stage_changed_at,amount_minor,currency,created_at,updated_at) VALUES ('upgrade-deal','Existing deal','upgrade-company','upgrade-member','demo-booked',116,10000,'EUR',117,118)"),
    db.prepare("INSERT INTO deal_contact(deal_id,contact_id,role) VALUES ('upgrade-deal','upgrade-contact','Champion')"),
    db.prepare("INSERT INTO activity(id,type,content,company_id,deal_id,author_user_id,metadata_json,created_at,updated_at) VALUES ('upgrade-history','stage_change','Historical content','upgrade-company','upgrade-deal','upgrade-owner','{\"from\":\"demo-booked\",\"to\":\"qualified-to-buy\"}',119,120)"),
    db.prepare("INSERT INTO activity_visibility(activity_id,membership_id) VALUES ('upgrade-history','upgrade-member')"),
    db.prepare("INSERT INTO saved_view(id,entity,name,shared,state_json,owner_membership_id,creator_user_id,created_at,updated_at) VALUES ('upgrade-private-view','company','Personal',0,'{\"filters\":[]}','upgrade-member','upgrade-member',121,122),('upgrade-shared-view','deal','Team',1,'{\"filters\":[]}','upgrade-owner','upgrade-owner',123,124)"),
    db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at,deleted_at) VALUES ('upgrade-field','company','legacy-note','Legacy note','text',0,125,126,NULL),('upgrade-deleted-field','company','deleted-note','Deleted note','text',1,127,128,130)"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,company_id,text_value,updated_at) VALUES ('upgrade-value','upgrade-field','upgrade-company','Retained value',129)"),
    db.prepare("INSERT INTO exchange_rate(id,base_currency,quote_currency,rate,as_of,source,created_at,updated_at) VALUES ('upgrade-rate','USD','EUR','0.95',132,'manual',133,134)"),
    db.prepare("INSERT INTO deal_conversion(version,deal_id,money_revision,amount_minor,currency,base_amount_minor,base_currency,fx_rate,fx_rate_at,rate_source) VALUES ('initial','upgrade-deal',0,10000,'EUR',10526,'USD','0.95',132,'manual')"),
    db.prepare("INSERT INTO currency_job(id,kind,target_currency,expected_version,target_version,rates_json,cursor,total,processed,converted,missing,status,created_at,updated_at) VALUES ('upgrade-job','rerate','USD','initial','version-2','{\"EUR\":\"0.95\"}','upgrade-deal',1,1,1,0,'completed',135,136)"),
  ]);

  const before = {
    users: (await db.prepare("SELECT id,created_at,updated_at FROM user WHERE id LIKE 'upgrade-%' ORDER BY id").all()).results,
    identity: (await db.prepare("SELECT id,user_id,created_at,updated_at FROM account WHERE id='upgrade-account' UNION ALL SELECT id,user_id,created_at,updated_at FROM session WHERE id='upgrade-session'").all()).results,
    memberships: (await db.prepare("SELECT user_id,role,status,created_at,updated_at FROM singleton_membership WHERE user_id LIKE 'upgrade-%' ORDER BY user_id").all()).results,
    history: await db.prepare("SELECT * FROM activity WHERE id='upgrade-history'").first(),
    visibility: await db.prepare("SELECT * FROM activity_visibility WHERE activity_id='upgrade-history'").first(),
    views: (await db.prepare("SELECT id,owner_membership_id,creator_user_id,created_at,updated_at FROM saved_view WHERE id LIKE 'upgrade-%' ORDER BY id").all()).results,
    fields: (await db.prepare("SELECT id,deleted_at,created_at,updated_at FROM custom_field_definition WHERE id LIKE 'upgrade-%' ORDER BY id").all()).results,
    value: await db.prepare("SELECT * FROM custom_field_value WHERE id='upgrade-value'").first(),
    deal: await db.prepare("SELECT id,company_id,owner_membership_id,amount_minor,currency,money_revision,created_at,updated_at FROM deal WHERE id='upgrade-deal'").first(),
    conversion: await db.prepare("SELECT * FROM deal_conversion WHERE deal_id='upgrade-deal'").first(),
    job: await db.prepare("SELECT * FROM currency_job WHERE id='upgrade-job'").first(),
  };

  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('retry-user','Retry','retry@crm-upgrade.invalid',1,140,141)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES ('retry-user','member','active',140,141)"),
  ]);

  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(legacyLedger.length));
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(legacyLedger.length));

  expect((await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).results)
    .toEqual(env.TEST_MIGRATIONS.map(({ name }) => ({ name })));
  expect((await db.prepare("SELECT id,created_at,updated_at FROM user WHERE id LIKE 'upgrade-%' ORDER BY id").all()).results).toEqual(before.users);
  expect((await db.prepare("SELECT id,user_id,created_at,updated_at FROM account WHERE id='upgrade-account' UNION ALL SELECT id,user_id,created_at,updated_at FROM session WHERE id='upgrade-session'").all()).results).toEqual(before.identity);
  expect((await db.prepare("SELECT user_id,role,status,created_at,updated_at FROM singleton_membership WHERE user_id LIKE 'upgrade-%' ORDER BY user_id").all()).results).toEqual(before.memberships);
  expect(await db.prepare("SELECT * FROM activity WHERE id='upgrade-history'").first()).toEqual({ ...before.history, lead_id: null, product_id: null, order_id: null });
  expect(await db.prepare("SELECT * FROM activity_visibility WHERE activity_id='upgrade-history'").first()).toEqual(before.visibility);
  expect((await db.prepare("SELECT id,owner_membership_id,creator_user_id,created_at,updated_at FROM saved_view WHERE id LIKE 'upgrade-%' ORDER BY id").all()).results).toEqual(before.views);
  expect((await db.prepare("SELECT id,deleted_at,created_at,updated_at FROM custom_field_definition WHERE id LIKE 'upgrade-%' ORDER BY id").all()).results).toEqual(before.fields);
  expect(await db.prepare("SELECT * FROM custom_field_value WHERE id='upgrade-value'").first()).toEqual({ ...before.value, lead_id: null, product_id: null, order_id: null, json_value: null, customer_reference_id: null });
  expect(await db.prepare("SELECT id,company_id,owner_membership_id,amount_minor,currency,money_revision,created_at,updated_at FROM deal WHERE id='upgrade-deal'").first()).toEqual(before.deal);
  expect(await db.prepare("SELECT * FROM deal_conversion WHERE deal_id='upgrade-deal'").first()).toEqual(before.conversion);
  expect(await db.prepare("SELECT * FROM currency_job WHERE id='upgrade-job'").first()).toEqual(before.job);
  expect(await db.prepare("SELECT deal_id,contact_id,role FROM deal_contact WHERE deal_id='upgrade-deal'").first()).toEqual({ deal_id: "upgrade-deal", contact_id: "upgrade-contact", role: "Champion" });
  expect(await db.prepare("SELECT archived_at FROM company WHERE id='upgrade-company'").first("archived_at")).toBe(131);
  expect(await db.prepare("SELECT status FROM singleton_membership WHERE user_id='retry-user'").first("status")).toBe("active");
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
