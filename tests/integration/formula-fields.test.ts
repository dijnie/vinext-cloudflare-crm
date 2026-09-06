import { env } from "cloudflare:workers";
import { applyD1Migrations, env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { singletonMembership } from "@/lib/db/schema";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { requireRequestContext, type RequestContext } from "@/lib/http/request-context";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { FieldRepository } from "@/lib/services/custom-fields/field-repository";
import { operationConditionGuard, customFieldDefinition } from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { fieldCreateInputSchema, type FieldType, type FieldValue } from "@/lib/services/custom-fields/field-contracts";
import { createCompaniesGetHandler } from "../../src/app/api/crm/companies/route";
import { createContactsGetHandler } from "../../src/app/api/crm/contacts/route";
import { createDealsGetHandler } from "../../src/app/api/crm/deals/route";
import { dealCreateInputSchema } from "@/lib/services/deals/deal-contract";
import { companyListInputSchema } from "@/lib/services/companies/company-contract";

class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) {
    this.verificationMessages.push(message);
  }
  async sendPasswordReset() {}
}

const bindings = env as RuntimeEnv;
const password = "correct horse battery staple";
let requestIndex = 170;

async function clearState() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM activity_visibility"),
    env.DB.prepare("DELETE FROM activity"),
    env.DB.prepare("DELETE FROM custom_field_value"),
    env.DB.prepare("DELETE FROM custom_field_option"),
    env.DB.prepare("DELETE FROM custom_field_definition"),
    env.DB.prepare("DELETE FROM saved_view"),
    env.DB.prepare("DELETE FROM deal_contact"),
    env.DB.prepare("DELETE FROM deal"),
    env.DB.prepare("DELETE FROM contact"),
    env.DB.prepare("DELETE FROM company"),
    env.DB.prepare("DELETE FROM session"),
    env.DB.prepare("DELETE FROM account"),
    env.DB.prepare("DELETE FROM verification"),
    env.DB.prepare("DELETE FROM rate_limit"),
    env.DB.prepare(
      "INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('sentinel-owner', 'Sentinel Owner', 'sentinel-owner@example.com', 1, 0, 0)",
    ),
    env.DB.prepare(
      "INSERT OR IGNORE INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('sentinel-owner', 'owner', 'active', 0, 0)",
    ),
    env.DB.prepare(
      "UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'",
    ),
    env.DB.prepare(
      "UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'",
    ),
    env.DB.prepare(
      "DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'",
    ),
    env.DB.prepare(
      "UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner' WHERE id = ?",
    ).bind(SINGLETON_WORKSPACE_ID),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
    env.DB.prepare("DELETE FROM member_branch"),
    env.DB.prepare("UPDATE branch_setting SET default_branch_id='default-branch' WHERE id='settings'"),
    env.DB.prepare("DELETE FROM branch WHERE id!='default-branch'"),
    env.DB.prepare("DELETE FROM access_profile WHERE id!='standard-member'"),
    env.DB.prepare("DELETE FROM action_operation_guard"),
  ]);
}

async function verifiedSession(email: string) {
  const emailAdapter = new RecordingEmailAdapter();
  const root = createCompositionRoot(bindings, emailAdapter);
  requestIndex += 1;
  const headers = {
    origin: "https://auth.test",
    "content-type": "application/json",
    "cf-connecting-ip": `203.0.113.${requestIndex}`,
  };
  const signUp = await handleAuthRequest(
    new Request("https://auth.test/api/auth/sign-up/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ name: email, email, password }),
    }),
    root.auth,
    root.db,
    bindings.AUTH_BASE_URL,
  );
  expect(signUp.status).toBe(200);
  const token = new URL(
    emailAdapter.verificationMessages.at(-1)?.url ?? "",
  ).searchParams.get("token");
  if (!token) throw new Error("Expected verification token");
  await root.auth.api.verifyEmail({
    asResponse: true,
    headers: new Headers({ origin: "https://auth.test" }),
    query: { token },
  });
  const signIn = await handleAuthRequest(
    new Request("https://auth.test/api/auth/sign-in/email", {
      method: "POST",
      headers,
      body: JSON.stringify({ email, password }),
    }),
    root.auth,
    root.db,
    bindings.AUTH_BASE_URL,
  );
  const cookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Expected session cookie");
  const user = await root.db.query.user.findFirst({
    where: (fields, { eq }) => eq(fields.email, email),
  });
  if (!user) throw new Error("Expected user");
  return { cookie, userId: user.id };
}


const root = () => createCompositionRoot(bindings, new RecordingEmailAdapter());
async function actor(role: "owner" | "member" = "owner") {
  const session = await verifiedSession(`${crypto.randomUUID()}@example.com`);
  const services = root();
  await services.db.update(singletonMembership).set({ role }).where(eq(singletonMembership.userId, session.userId));
  const headers = new Headers({ cookie: session.cookie, origin: "https://auth.test", "content-type": "application/json" });
  return { ...session, headers, context: await requireRequestContext(headers, services) };
}


const define = (context: RequestContext, label: string, type: FieldType, expression?: string) => root().fields.create(context, fieldCreateInputSchema.parse({ entity: "company", label, type, ...(expression ? { config: { expression } } : {}), showOnTable: true }));

describe.sequential("computed field persistence", () => {
  beforeEach(clearState);
  it("computes current values and list output without storing a formula value", async () => {
    const owner = await actor(), services = root();
    const number = await define(owner.context, "Amount", "number"), rating = await define(owner.context, "Rating", "rating");
    const formula = await define(owner.context, "Total", "formula", "[amount]*2+[rating]");
    const record = await services.companies.create(owner.context, { name: "Computed" });
    const input = { entity: "company" as const, recordId: record.id };
    expect((await services.fields.values(owner.context, input))[formula.key]).toBeNull();
    await services.fields.writeValues(owner.context, { ...input, values: { [number.key]: 10, [rating.key]: 3 } });
    expect((await services.fields.values(owner.context, input))[formula.key]).toBe(23);
    expect((await services.companies.list(owner.context, companyListInputSchema.parse({}))).rows[0].fields[formula.key]).toBe(23);
    await services.fields.writeValues(owner.context, { ...input, values: { [number.key]: 12 } });
    expect((await services.fields.values(owner.context, input))[formula.key]).toBe(27);
    await services.fields.archive(owner.context, number.id);
    expect((await services.fields.values(owner.context, input))[formula.key]).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM custom_field_value WHERE field_id=?").bind(formula.id).first("count")).toBe(0);
  });
  it("rejects every write to computed fields including null and blocks required definitions", async () => {
    const owner = await actor(), services = root(), formula = await define(owner.context, "Constant", "formula", "2+3");
    const record = await services.companies.create(owner.context, { name: "Read only" });
    for (const value of [null, 10]) await expect(services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [formula.key]: value } })).rejects.toMatchObject({ status: 400 });
    await expect(services.fields.create(owner.context, fieldCreateInputSchema.parse({ entity: "company", label: "Required", type: "formula", required: true, config: { expression: "1" } }))).rejects.toMatchObject({ status: 400 });
    await expect(env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,updated_at) VALUES ('raw-formula',?,?,0)").bind(formula.id, record.id).run()).rejects.toThrow();
  });
  it("rejects cycles through retained hidden definitions without changing configuration", async () => {
    const owner = await actor(), services = root();
    const first = await define(owner.context, "First", "formula", "1"), second = await define(owner.context, "Second", "formula", "[first]+1");
    await services.fields.archive(owner.context, second.id);
    await expect(services.fields.update(owner.context, first.id, { config: { expression: "[second]+1" } })).rejects.toMatchObject({ status: 400 });
    expect((await services.fields.byId(owner.context, first.id)).config).toEqual({ expression: "1" });
    await services.fields.restore(owner.context, second.id);
    await expect(services.fields.update(owner.context, first.id, { config: { expression: "[second]+1" } })).rejects.toMatchObject({ status: 400 });
    expect((await services.fields.byId(owner.context, first.id)).config).toEqual({ expression: "1" });
  });
  it("increments entity configuration revisions and rejects stale graph writes atomically", async () => {
    const owner = await actor(), services = root(), repository = new FieldRepository(services.db);
    const initial = await repository.configuration("company");
    const field = await define(owner.context, "Source", "number");
    const created = await repository.configuration("company");
    expect(created.revision).toBeGreaterThan(initial.revision);
    expect(created.fields.some(item => item.id === field.id)).toBe(true);
    await services.fields.archive(owner.context, field.id);
    const archived = await repository.configuration("company"); expect(archived.revision).toBeGreaterThan(created.revision);
    const id = crypto.randomUUID(), now = new Date();
    await expect(services.db.batch([
      services.db.insert(customFieldDefinition).values({ id, entity: "company", key: "stale", label: "Stale", type: "formula", configJson: '{"expression":"1"}', position: 99, createdAt: now, updatedAt: now }),
      services.db.insert(operationConditionGuard).values({ id: crypto.randomUUID(), authorized: sql<number>`CASE WHEN EXISTS(SELECT 1 FROM field_configuration_revision WHERE entity='company' AND revision=${created.revision}) THEN 1 ELSE 0 END` }),
    ])).rejects.toThrow();
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM custom_field_definition WHERE id=?").bind(id).first("count")).toBe(0);
    expect((await repository.configuration("company")).revision).toBe(archived.revision);
  });

  it("matches computed coverage to null, zero, missing and overflow values", async () => {
    const owner = await actor(), services = root();
    const source = await define(owner.context, "Source", "number");
    const divided = await define(owner.context, "Divided", "formula", "10/[source]");
    const overflow = await define(owner.context, "Overflow", "formula", "1e308*1e308");
    const dependent = await define(owner.context, "Dependent", "formula", "1/[overflow]");
    const zero = await define(owner.context, "Zero", "formula", "[source]*0");
    for (const value of [null, 0, 2]) {
      const record = await services.companies.create(owner.context, { name: `Coverage ${value}` });
      if (value !== null) await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [source.key]: value } });
      const values = await services.fields.values(owner.context, { entity: "company", recordId: record.id });
      expect(values[divided.key]).toBe(value === 2 ? 5 : null);
      expect(values[overflow.key]).toBeNull(); expect(values[dependent.key]).toBeNull();
      expect(values[zero.key]).toBe(value === null ? null : 0);
    }
    expect(await services.fields.coverage(owner.context, divided.id)).toEqual({ total: 3, filled: 1 });
    expect(await services.fields.coverage(owner.context, overflow.id)).toEqual({ total: 3, filled: 0 });
    expect(await services.fields.coverage(owner.context, dependent.id)).toEqual({ total: 3, filled: 0 });
    expect(await services.fields.coverage(owner.context, zero.id)).toEqual({ total: 3, filled: 2 });
  });

  it("computes SQL coverage for the allowed eight-formula dependency chain", async () => {
    const owner = await actor(), services = root();
    const source = await define(owner.context, "Source", "number");
    let previous = source.key, last = source;
    for (let i = 0; i < 8; i++) { last = await define(owner.context, `Chain ${i}`, "formula", `[${previous}]+1`); previous = last.key; }
    const record = await services.companies.create(owner.context, { name: "Deep coverage" });
    await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [source.key]: 2 } });
    expect((await services.fields.values(owner.context, { entity: "company", recordId: record.id }))[last.key]).toBe(10);
    expect(await services.fields.coverage(owner.context, last.id)).toEqual({ total: 1, filled: 1 });
  });

});

it("adds computed definitions without losing structured values or historical field references", async () => {
  const db = testEnv.UPGRADE_DB;
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(0, 9));
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('field-owner','Owner','owner@fields.invalid',1,101,102)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES ('field-owner','owner','active',101,102)"),
    db.prepare("INSERT INTO company(id,name,created_at,updated_at) VALUES ('field-company','Company',103,104)"),
    db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at) VALUES ('select-field','company','choice','Choice','select',0,105,106),('user-field','company','person','Person','user',1,107,108),('deleted-field','company','deleted','Deleted','text',2,109,110)"),
    db.prepare("INSERT INTO custom_field_option(id,field_id,label,position) VALUES ('retained-option','select-field','Retained option',0)"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,company_id,option_id,updated_at) VALUES ('select-value','select-field','field-company','retained-option',111)"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,company_id,user_membership_id,updated_at) VALUES ('user-value','user-field','field-company','field-owner',112)"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,company_id,text_value,updated_at) VALUES ('deleted-value','deleted-field','field-company','Retained text',113)"),
    db.prepare("UPDATE custom_field_option SET archived_at=114 WHERE id='retained-option'"),
    db.prepare("UPDATE custom_field_definition SET archived_at=115 WHERE id IN ('select-field','user-field')"),
    db.prepare("UPDATE custom_field_definition SET deleted_at=116 WHERE id='deleted-field'"),
    db.prepare("INSERT INTO saved_view(id,entity,name,shared,state_json,owner_membership_id,creator_user_id,created_at,updated_at) VALUES ('retained-view','company','View',0,'{\"version\":1,\"query\":\"columns=name,field:choice\"}','field-owner','field-owner',117,118)"),
    db.prepare("INSERT INTO contact(id,first_name,created_at,updated_at) VALUES ('customer','Customer',119,120)"),
    db.prepare("INSERT INTO custom_field_definition(id,entity,key,label,type,position,created_at,updated_at) VALUES ('money-field','company','money','Money','money',3,121,122),('customer-field','company','customer','Customer','customer',4,123,124)"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,company_id,json_value,updated_at) VALUES ('money-value','money-field','field-company','{\"amountMinor\":12345,\"currency\":\"VND\"}',125)"),
    db.prepare("INSERT INTO custom_field_value(id,field_id,company_id,customer_reference_id,updated_at) VALUES ('customer-value','customer-field','field-company','customer',126)"),
    db.prepare("INSERT INTO saved_view_default(user_id,entity,view_id) VALUES ('field-owner','company','retained-view')"),
  ]);
  const tables = ["custom_field_definition", "custom_field_option", "custom_field_value", "user", "singleton_membership", "saved_view", "saved_view_default"];
  const before = await Promise.all(tables.map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(9, 10));
  for (const [index, table] of tables.entries()) {
    const expected = before[index];
    expect((await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results, table).toEqual(expected);
  }
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  expect((await db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'custom_field_%_next'").all()).results).toEqual([]);
  await expect(db.prepare("UPDATE custom_field_value SET text_value='modified' WHERE id='deleted-value'").run()).rejects.toThrow("field_unavailable");
  await expect(db.prepare("UPDATE custom_field_definition SET entity='contact' WHERE id='select-field'").run()).rejects.toThrow("field_identity_immutable");
  await expect(db.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id='field-owner'").run()).rejects.toThrow();
});
