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
import { createFieldConversionHandler } from "../../src/app/api/crm/fields/[fieldId]/conversion/route";
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



const define = (context: RequestContext, type: FieldType, extra = {}) => root().fields.create(context, fieldCreateInputSchema.parse({ entity: "company", label: `Field ${crypto.randomUUID()}`, type, ...(type === "select" ? { options: [{ label: "Retained option" }] } : {}), ...extra }));

describe.sequential("field conversion previews", () => {
  beforeEach(clearState);
  it("converts exact text and numeric values without changing IDs or value timestamps", async () => {
    const owner = await actor(), services = root();
    for (const [source, target, value, expected] of [
      ["text", "long_text", "Exact Text", "Exact Text"], ["text", "multivalue", "Exact Text", ["Exact Text"]], ["multivalue", "text", ["Exact Text"], "Exact Text"], ["number", "rating", 0, 0], ["rating", "number", 4, 4],
    ] as [FieldType, FieldType, FieldValue, FieldValue][]) {
      const field = await define(owner.context, source), record = await services.companies.create(owner.context, { name: "Converted" });
      await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [field.key]: value } });
      const before = await env.DB.prepare("SELECT id,updated_at FROM custom_field_value WHERE field_id=?").bind(field.id).first();
      const preview = await services.fields.previewConversion(owner.context, field.id, target, {});
      expect(preview).toMatchObject({ total: 1, convertible: 1, rejected: 0, token: expect.any(String) });
      await services.fields.applyConversion(owner.context, field.id, preview.token!);
      expect((await services.fields.values(owner.context, { entity: "company", recordId: record.id }))[field.key]).toEqual(expected);
      expect(await env.DB.prepare("SELECT id,updated_at FROM custom_field_value WHERE field_id=?").bind(field.id).first()).toEqual(before);
      expect(await services.fields.byId(owner.context, field.id)).toMatchObject({ id: field.id, key: field.key, type: target });
    }
  });
  it("preserves archived option references and archived record values through both directions", async () => {
    const owner = await actor(), services = root(), field = await define(owner.context, "select");
    const record = await services.companies.create(owner.context, { name: "Archived" });
    await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [field.key]: field.options[0].id } });
    await services.companies.archive(owner.context, record.id);
    await env.DB.prepare("UPDATE custom_field_option SET archived_at=123 WHERE id=?").bind(field.options[0].id).run();
    const beforeOption = await env.DB.prepare("SELECT * FROM custom_field_option WHERE id=?").bind(field.options[0].id).first();
    const beforeValue = await env.DB.prepare("SELECT id,updated_at,company_id FROM custom_field_value WHERE field_id=?").bind(field.id).first();
    for (const type of ["multiselect", "select"] as const) {
      const preview = await services.fields.previewConversion(owner.context, field.id, type, {});
      expect(preview.rejected).toBe(0); expect(preview.token).toBeTruthy();
      await services.fields.applyConversion(owner.context, field.id, preview.token!);
      expect(await env.DB.prepare("SELECT * FROM custom_field_option WHERE id=?").bind(field.options[0].id).first()).toEqual(beforeOption);
      expect(await env.DB.prepare("SELECT id,updated_at,company_id FROM custom_field_value WHERE field_id=?").bind(field.id).first()).toEqual(beforeValue);
    }
  });
  it("invalidates previews on values, configuration and options without applying a stale conversion", async () => {
    const owner = await actor(), services = root(), field = await define(owner.context, "select");
    const record = await services.companies.create(owner.context, { name: "Stale" });
    await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [field.key]: field.options[0].id } });
    for (const mutate of [
      () => services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [field.key]: field.options[0].id } }),
      () => services.fields.update(owner.context, field.id, { label: `Changed ${crypto.randomUUID()}` }),
      () => env.DB.prepare("UPDATE custom_field_option SET label='New option label' WHERE id=?").bind(field.options[0].id).run(),
    ]) {
      const preview = await services.fields.previewConversion(owner.context, field.id, "multiselect", {}); await mutate();
      await expect(services.fields.applyConversion(owner.context, field.id, preview.token!)).rejects.toMatchObject({ status: 409 });
      expect((await services.fields.byId(owner.context, field.id)).type).toBe("select");
    }
  });
  it("binds tokens to the actor and rejects expiry and replay", async () => {
    const owner = await actor(), other = await actor(), services = root(), field = await define(owner.context, "text");
    let preview = await services.fields.previewConversion(owner.context, field.id, "long_text", {});
    await expect(services.fields.applyConversion(other.context, field.id, preview.token!)).rejects.toMatchObject({ status: 409 });
    await env.DB.prepare("UPDATE field_conversion_preview SET expires_at=0 WHERE id=?").bind(preview.token).run();
    await expect(services.fields.applyConversion(owner.context, field.id, preview.token!)).rejects.toMatchObject({ status: 409 });
    preview = await services.fields.previewConversion(owner.context, field.id, "long_text", {});
    const handler = createFieldConversionHandler(services, field.id);
    const request = () => new Request(`https://auth.test/api/crm/fields/${field.id}/conversion`, { method: "POST", headers: owner.headers, body: JSON.stringify({ action: "apply", token: preview.token }) });
    expect((await handler(request())).status).toBe(200);
    expect((await handler(request())).status).toBe(409);
  });
  it("rechecks current configure permission and revoked membership", async () => {
    const owner = await actor(), member = await actor("member"), services = root(), field = await define(owner.context, "text");
    const name = crypto.randomUUID(), settings = await services.access.mutate(owner.context, { action: "create-profile", name, grants: [] });
    const preview = await services.fields.previewConversion(member.context, field.id, "long_text", {});
    await services.access.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: settings.profiles.find(p => p.name === name)!.id });
    await expect(services.fields.applyConversion(member.context, field.id, preview.token!)).rejects.toMatchObject({ status: 403 });
    await services.members.remove(owner.context, member.userId);
    await expect(services.fields.previewConversion(member.context, field.id, "long_text", {})).rejects.toMatchObject({ status: 403 });
    expect((await services.fields.byId(owner.context, field.id)).type).toBe("text");
  });
  it("rejects lossy values and direct type changes without creating applicable tokens", async () => {
    const owner = await actor(), services = root();
    const field = await define(owner.context, "multivalue"), record = await services.companies.create(owner.context, { name: "Lossy" });
    await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [field.key]: ["One", "Two"] } });
    expect(await services.fields.previewConversion(owner.context, field.id, "text", {})).toMatchObject({ token: null, total: 1, rejected: 1, reasons: ["multiple_values"] });
    await expect(env.DB.prepare("UPDATE custom_field_definition SET type='text' WHERE id=?").bind(field.id).run()).rejects.toThrow("field_type_has_values");
    const number = await define(owner.context, "number"), formula = await define(owner.context, "formula", { config: { expression: `[${number.key}]+1` } });
    expect(await services.fields.previewConversion(owner.context, number.id, "text", {})).toMatchObject({ token: null });
    await expect(services.fields.update(owner.context, number.id, { type: "text" })).rejects.toMatchObject({ status: 400 });
    await expect(services.fields.update(owner.context, formula.id, { type: "number" })).rejects.toMatchObject({ status: 409 });
  });
  it("scans every page including an empty legacy ID and preserves null rows", async () => {
    const owner = await actor(), services = root(), field = await define(owner.context, "text");
    await env.DB.batch(Array.from({ length: 101 }, (_, i) => env.DB.prepare("INSERT INTO company(id,name,created_at,updated_at) VALUES (?,?,0,0)").bind(`paged-${i}`, `Paged ${i}`)));
    await env.DB.batch(Array.from({ length: 101 }, (_, i) => env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,text_value,updated_at) VALUES (?,?,?,?,?)").bind(i === 0 ? "" : `value-${i}`, field.id, `paged-${i}`, i === 0 ? null : `Exact ${i}`, i + 100)));
    const before = (await env.DB.prepare("SELECT * FROM custom_field_value ORDER BY id").all()).results;
    const preview = await services.fields.previewConversion(owner.context, field.id, "long_text", {});
    expect(preview).toMatchObject({ total: 101, convertible: 101, rejected: 0 });
    await services.fields.applyConversion(owner.context, field.id, preview.token!);
    expect((await env.DB.prepare("SELECT * FROM custom_field_value ORDER BY id").all()).results).toEqual(before);
  });
  it("leaves exact fractional SQL numbers untouched when rating conversion is rejected", async () => {
    const owner = await actor(), services = root(), field = await define(owner.context, "number");
    const record = await services.companies.create(owner.context, { name: "Precision" });
    await env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,number_value,updated_at) VALUES ('fraction',?,?,0.12345678901234567,123)").bind(field.id, record.id).run();
    const before = await env.DB.prepare("SELECT * FROM custom_field_value WHERE id='fraction'").first();
    expect(await services.fields.previewConversion(owner.context, field.id, "rating", {})).toMatchObject({ token: null, rejected: 1 });
    expect(await env.DB.prepare("SELECT * FROM custom_field_value WHERE id='fraction'").first()).toEqual(before);
  });

  it("enforces same-origin requests and configure permission for both conversion actions", async () => {
    const owner = await actor(), member = await actor("member"), services = root(), field = await define(owner.context, "text");
    const handler = createFieldConversionHandler(services, field.id);
    const name = crypto.randomUUID(), settings = await services.access.mutate(owner.context, { action: "create-profile", name, grants: [] });
    await services.access.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: settings.profiles.find(p => p.name === name)!.id });
    const preview = await services.fields.previewConversion(owner.context, field.id, "long_text", {});
    for (const payload of [{ action: "preview", type: "long_text", config: {} }, { action: "apply", token: preview.token }]) {
      const request = (headers: Headers) => new Request(`https://auth.test/api/crm/fields/${field.id}/conversion`, { method: "POST", headers, body: JSON.stringify(payload) });
      expect((await handler(request(member.headers))).status).toBe(403);
      const hostile = new Headers(owner.headers); hostile.set("origin", "https://other.invalid");
      const rejected = await handler(request(hostile)); expect(rejected.status).toBe(403);
      expect(await rejected.json()).toMatchObject({ error: { code: "invalid_origin" } });
    }
    expect((await services.fields.byId(owner.context, field.id)).type).toBe("text");
    await services.fields.applyConversion(owner.context, field.id, preview.token!);
    expect((await services.fields.byId(owner.context, field.id)).type).toBe("long_text");
  });

});

it("adds conversion revisions without changing existing values or historical references", async () => {
  const db = testEnv.UPGRADE_DB;
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(0, 10));
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
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(10, 11));
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
