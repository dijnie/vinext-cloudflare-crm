import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";
import { DEFAULT_PROFILE_ID, PERMISSIONS } from "@/lib/services/permissions/access-contracts";

it("adds access profiles without rewriting existing identity, CRM, history or conversion data", async () => {
  const db = env.UPGRADE_DB;
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, 5));
  expect((await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).results).toHaveLength(5);
  const fixtures = [
    "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('owner','Owner','owner@upgrade.invalid',1,101,102),('member','Member','member@upgrade.invalid',1,103,104),('revoked','Revoked','revoked@upgrade.invalid',1,105,106)",
    "INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES ('owner','owner','active',101,102),('member','member','active',103,104),('revoked','member','revoked',105,106)",
    "UPDATE singleton_workspace SET owner_user_id='owner',updated_at=107",
    "INSERT INTO account(id,account_id,provider_id,issuer,user_id,password,created_at,updated_at) VALUES ('account','owner','credential','credential','owner','fixture-password-hash',108,109)",
    "INSERT INTO session(id,expires_at,token,user_id,created_at,updated_at) VALUES ('session',9999999999999,'fixture-session-token','owner',110,111)",
    "INSERT INTO company(id,name,owner_membership_id,created_at,updated_at) VALUES ('company','Existing company','member',112,113)",
    "INSERT INTO contact(id,first_name,company_id,owner_membership_id,created_at,updated_at) VALUES ('contact','Existing contact','company','owner',114,115)",
    "INSERT INTO deal(id,name,company_id,owner_membership_id,stage_id,stage_changed_at,amount_minor,currency,created_at,updated_at) VALUES ('deal','Existing deal','company','member','demo-booked',116,10000,'USD',117,118)",
    "INSERT INTO deal_contact(deal_id,contact_id,role) VALUES ('deal','contact','Champion')",
    "INSERT INTO activity(id,type,content,company_id,deal_id,author_user_id,metadata_json,created_at,updated_at) VALUES ('history','stage_change','Historical content','company','deal','owner','{\"from\":\"demo-booked\",\"to\":\"qualified-to-buy\"}',119,120)",
    "INSERT INTO activity_visibility(activity_id,membership_id) VALUES ('history','member')",
    "INSERT INTO saved_view(id,entity,name,shared,state_json,owner_membership_id,creator_user_id,created_at,updated_at) VALUES ('private','company','Personal',0,'{\"filters\":[]}','member','member',121,122),('shared','deal','Team',1,'{\"filters\":[]}','owner','owner',123,124)",
    "INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at) VALUES ('field','company','legacy-note','Legacy note','text',0,125,126),('deleted','company','deleted-note','Deleted note','text',1,127,128)",
    "INSERT INTO custom_field_value(id,field_id,company_id,text_value,updated_at) VALUES ('value','field','company','Retained value',129)",
    "UPDATE custom_field_definition SET deleted_at=130 WHERE id='deleted'",
    "UPDATE company SET archived_at=131 WHERE id='company'",
    "INSERT INTO exchange_rate(id,base_currency,quote_currency,rate,as_of,source,created_at,updated_at) VALUES ('rate','USD','EUR','0.95',132,'manual',133,134)",
    "INSERT INTO deal_conversion(version,deal_id,money_revision,amount_minor,currency,base_amount_minor,base_currency,fx_rate,fx_rate_at,rate_source) VALUES ('initial','deal',0,10000,'USD',10000,'USD','1',135,'identity')",
  ];
  await db.batch(fixtures.map(query => db.prepare(query)));
  const tables = ["user", "account", "session", "singleton_workspace", "singleton_membership", "company", "contact", "deal", "deal_contact", "activity", "activity_visibility", "saved_view", "custom_field_definition", "custom_field_value", "exchange_rate", "deal_conversion", "crm_setting", "deal_stage"];
  const before = await Promise.all(tables.map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(5, 6));
  for (const [index, table] of tables.entries()) {
    expect((await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results, table).toEqual(before[index]);
  }
  expect((await db.prepare("SELECT membership_id,profile_id FROM membership_access ORDER BY membership_id").all()).results).toEqual([
    { membership_id: "member", profile_id: DEFAULT_PROFILE_ID },
    { membership_id: "owner", profile_id: DEFAULT_PROFILE_ID },
    { membership_id: "revoked", profile_id: DEFAULT_PROFILE_ID },
  ]);
  expect((await db.prepare("SELECT permission FROM access_grant ORDER BY permission").all<{ permission: string }>()).results.map(row => row.permission)).toEqual(PERMISSIONS.filter(permission => !permission.endsWith(".export") && !["lead","product","order","inventory","entitlement","appointment","task","ticket","contract","review"].some(prefix=>permission.startsWith(`${prefix}.`))).sort());
  expect((await db.prepare("SELECT * FROM member_branch").all()).results).toEqual([]);
  expect(await db.prepare("SELECT default_branch_id FROM branch_setting WHERE id='settings'").first("default_branch_id")).toBe("default-branch");
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('new','New','new@upgrade.invalid',1,136,137)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES ('new','member','active',136,137)"),
  ]);
  expect(await db.prepare("SELECT profile_id FROM membership_access WHERE membership_id='new'").first("profile_id")).toBe(DEFAULT_PROFILE_ID);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  expect((await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).results).toHaveLength(6);
});
