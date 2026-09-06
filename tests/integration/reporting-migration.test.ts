import { applyD1Migrations, env } from "cloudflare:test";
import { expect, it } from "vitest";

it("adds reporting metadata without rewriting contacts, orders or operations", async () => {
  const db = env.UPGRADE_DB, index = env.TEST_MIGRATIONS.findIndex(item => item.name === "0021_reporting_indexes.sql");
  expect(index).toBe(20); await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, index));
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('report-legacy','Legacy','report-legacy@example.com',1,0,0)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES('report-legacy','member','active',0,0)"),
    db.prepare("INSERT INTO contact(id,first_name,created_at,updated_at) VALUES('report-contact','Legacy',0,0)"),
    db.prepare(`INSERT INTO sales_order(id,number,name,contact_id,owner_membership_id,creator_user_id,currency,state,creation_fingerprint,creation_result_json,lines_json,goods_minor,discount_minor,surcharge_minor,tax_minor,original_minor,goods_remaining_minor,surcharge_remaining_minor,tax_remaining_minor,completed_at,completed_date,created_at,updated_at) VALUES('report-order',901,'Legacy order','report-contact','report-legacy','report-legacy','USD','completed','legacy','{}','[]',100,0,0,0,100,100,0,0,1,'2026-09-01',0,0)`),
  ]);
  const before = await db.prepare("SELECT * FROM sales_order WHERE id='report-order'").first();
  await applyD1Migrations(db, [env.TEST_MIGRATIONS[index]!]);
  expect(await db.prepare("SELECT * FROM sales_order WHERE id='report-order'").first()).toEqual(before);
  expect(await db.prepare("SELECT birth_date,gender FROM contact WHERE id='report-contact'").first()).toEqual({ birth_date: null, gender: null });
  expect(await db.prepare("SELECT 1 ok FROM access_grant WHERE profile_id='standard-member' AND permission='report.view'").first()).toEqual({ ok: 1 });
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
