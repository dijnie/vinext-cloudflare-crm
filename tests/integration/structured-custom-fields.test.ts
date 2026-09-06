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

const define = (context: RequestContext, type: FieldType, extra = {}) => root().fields.create(context, fieldCreateInputSchema.parse({ entity: "company", label: `${type} field`, type, showOnTable: true, showOnFilter: ["multiselect", "customer"].includes(type), ...(type === "multiselect" ? { options: [{ label: "One" }, { label: "Two" }] } : {}), ...extra }));

describe.sequential("structured custom fields", () => {
  beforeEach(clearState);

  it("persists and lists all five typed values including zero and explicit clears", async () => {
    const owner = await actor(), services = root();
    const record = await services.companies.create(owner.context, { name: "Structured" });
    const customer = await services.contacts.create(owner.context, { firstName: "Ada", lastName: "Lovelace" });
    for (const type of ["money", "multiselect", "multivalue", "rating", "customer"] as const) {
      const field = await define(owner.context, type);
      const value: FieldValue = type === "money" ? { amountMinor: 0, currency: "VND" } : type === "multiselect" ? field.options.map(option => option.id) : type === "multivalue" ? ["First", "Second"] : type === "rating" ? 0 : customer.id;
      const input = { entity: "company" as const, recordId: record.id, values: { [field.key]: value } };
      expect((await services.fields.writeValues(owner.context, input))[field.key]).toEqual(value);
      expect((await services.fields.values(owner.context, input))[field.key]).toEqual(value);
      const list = await services.companies.list(owner.context, companyListInputSchema.parse({}));
      expect(list.rows.find(row => row.id === record.id)?.fields[field.key]).toEqual(value);
      expect(await services.fields.coverage(owner.context, field.id)).toMatchObject({ filled: 1 });
      if (type === "customer") expect(list.fieldCustomerLabels[customer.id]).toBe("Ada Lovelace");
      await services.fields.writeValues(owner.context, { ...input, values: { [field.key]: null } });
      expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM custom_field_value WHERE field_id=?").bind(field.id).first("count")).toBe(0);
    }
  });

  it("rejects invalid typed shapes and preserves all prior values on a mixed write", async () => {
    const owner = await actor(), services = root();
    const record = await services.companies.create(owner.context, { name: "Validation" });
    const money = await define(owner.context, "money"), multi = await define(owner.context, "multiselect"), values = await define(owner.context, "multivalue"), rating = await define(owner.context, "rating"), customer = await define(owner.context, "customer");
    const target = await services.contacts.create(owner.context, { firstName: "Archived" });
    await services.contacts.archive(owner.context, target.id);
    await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [rating.key]: 3 } });
    const invalid: [string, FieldValue][] = [[money.key, { amountMinor: -1, currency: "USD" }], [money.key, { amountMinor: 1, currency: "ZZZ" } as unknown as FieldValue], [money.key, 12], [multi.key, ["foreign-option"]], [multi.key, [multi.options[0].id, multi.options[0].id]], [values.key, ["duplicate", "duplicate"]], [values.key, "not-array"], [rating.key, 5.5], [rating.key, 6], [rating.key, -1], [customer.key, target.id], [customer.key, crypto.randomUUID()]];
    for (const [key, value] of invalid) {
      await expect(services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [rating.key]: 4, [key]: value } })).rejects.toMatchObject({ status: 400 });
      expect((await services.fields.values(owner.context, { entity: "company", recordId: record.id }))[rating.key]).toBe(3);
    }
  });

  it("protects stored ratings when lowering the configured maximum", async () => {
    const owner = await actor(), services = root();
    const record = await services.companies.create(owner.context, { name: "Rating" });
    const rating = await define(owner.context, "rating", { config: { ratingMax: 10 } });
    await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [rating.key]: 8 } });
    await expect(services.fields.update(owner.context, rating.id, { config: { ratingMax: 5 } })).rejects.toMatchObject({ status: 409 });
    expect((await services.fields.byId(owner.context, rating.id)).config).toEqual({ ratingMax: 10 });
    expect((await services.fields.values(owner.context, { entity: "company", recordId: record.id }))[rating.key]).toBe(8);
  });

  it("keeps historical customer references after archive but prevents deletion and new assignment", async () => {
    const owner = await actor(), services = root(), field = await define(owner.context, "customer");
    const record = await services.companies.create(owner.context, { name: "History" }), customer = await services.contacts.create(owner.context, { firstName: "History customer" });
    await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [field.key]: customer.id } });
    await services.contacts.archive(owner.context, customer.id);
    expect((await services.fields.values(owner.context, { entity: "company", recordId: record.id }))[field.key]).toBe(customer.id);
    await expect(env.DB.prepare("DELETE FROM contact WHERE id=?").bind(customer.id).run()).rejects.toThrow("FOREIGN KEY");
    await expect(services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [field.key]: customer.id } })).rejects.toMatchObject({ status: 400 });
  });

  it("keeps multi-select and customer filters aligned with list counts and independent facets", async () => {
    const owner = await actor(), services = root();
    const multi = await define(owner.context, "multiselect"), customer = await define(owner.context, "customer");
    const ada = await services.contacts.create(owner.context, { firstName: "Ada" }), grace = await services.contacts.create(owner.context, { firstName: "Grace" });
    const ids: string[] = [];
    for (const [choices, target] of [[multi.options.map(option => option.id), ada.id], [[multi.options[1].id], grace.id]] as [string[], string][]) {
      const record = await services.companies.create(owner.context, { name: target }); ids.push(record.id);
      await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [multi.key]: choices, [customer.key]: target } });
    }
    const result = await services.companies.list(owner.context, companyListInputSchema.parse({ fields: { [multi.key]: [multi.options[0].id], [customer.key]: [ada.id] } }));
    expect(result.total).toBe(1); expect(result.rows.map(row => row.id)).toEqual([ids[0]]);
    expect(result.fieldFacets[multi.key]).toEqual(expect.arrayContaining([{ value: multi.options[0].id, label: "One", count: 1 }, { value: multi.options[1].id, label: "Two", count: 2 }]));
    expect(result.fieldFacets[customer.key]).toEqual(expect.arrayContaining([{ value: ada.id, label: "Ada", count: 1 }, { value: grace.id, label: "Grace", count: 1 }]));
  });

  it("enforces write permissions and raw SQL validation without retaining partial writes", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const rating = await define(owner.context, "rating"), multi = await define(owner.context, "multivalue");
    const record = await services.companies.create(owner.context, { name: "Guarded" });
    const name = crypto.randomUUID(), settings = await services.access.mutate(owner.context, { action: "create-profile", name, grants: [] });
    await services.access.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: settings.profiles.find(p => p.name === name)!.id });
    await expect(services.fields.writeValues(member.context, { entity: "company", recordId: record.id, values: { [rating.key]: 1 } })).rejects.toMatchObject({ status: 403 });
    await expect(env.DB.batch([
      env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,number_value,updated_at) VALUES ('valid-rating',?,?,3,0)").bind(rating.id, record.id),
      env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,json_value,updated_at) VALUES ('invalid-array',?,?,?,0)").bind(multi.id, record.id, '["same","same"]'),
    ])).rejects.toThrow("field_json_value_invalid");
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM custom_field_value").first("count")).toBe(0);
    await expect(env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,number_value,updated_at) VALUES ('invalid-rating',?,?,6,0)").bind(rating.id, record.id).run()).rejects.toThrow("field_rating_invalid");
  });

  it("rejects raw structured values that bypass service validation", async () => {
    const owner = await actor(), services = root();
    const record = await services.companies.create(owner.context, { name: "Raw validation" });
    const money = await define(owner.context, "money"), multi = await define(owner.context, "multiselect"), customer = await define(owner.context, "customer");
    for (const payload of ['{"amountMinor":-1,"currency":"USD"}', '{"amountMinor":1,"currency":"ZZZ"}', '{"amountMinor":1,"currency":"USD","extra":true}']) {
      await expect(env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,json_value,updated_at) VALUES (?,?,?,?,0)").bind(crypto.randomUUID(), money.id, record.id, payload).run()).rejects.toThrow("field_money_invalid");
    }
    await expect(env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,json_value,updated_at) VALUES (?,?,?,?,0)").bind(crypto.randomUUID(), multi.id, record.id, '["foreign-option"]').run()).rejects.toThrow("field_option_mismatch");
    const target = await services.contacts.create(owner.context, { firstName: "Archived" });
    await services.contacts.archive(owner.context, target.id);
    await expect(env.DB.prepare("INSERT INTO custom_field_value(id,field_id,company_id,customer_reference_id,updated_at) VALUES (?,?,?,?,0)").bind(crypto.randomUUID(), customer.id, record.id, target.id).run()).rejects.toThrow("field_customer_unavailable");
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM custom_field_value").first("count")).toBe(0);
  });


  it("rejects empty arrays for scalar fields without clearing existing values", async () => {
    const owner = await actor(), services = root();
    const record = await services.companies.create(owner.context, { name: "Scalar" });
    for (const [type, value] of [["text", "Retained"], ["number", 42], ["checkbox", false], ["rating", 3]] as const) {
      const field = await define(owner.context, type);
      await services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [field.key]: value } });
      await expect(services.fields.writeValues(owner.context, { entity: "company", recordId: record.id, values: { [field.key]: [] } })).rejects.toMatchObject({ status: 400 });
      expect((await services.fields.values(owner.context, { entity: "company", recordId: record.id }))[field.key]).toBe(value);
    }
  });

  it("exposes empty and populated customer labels through all three validated list APIs", async () => {
    const owner = await actor(), services = root();
    const company = await services.companies.create(owner.context, { name: "Company" });
    const contact = await services.contacts.create(owner.context, { firstName: "Contact" });
    const target = await services.contacts.create(owner.context, { firstName: "Ada", lastName: "Lovelace" });
    const deal = await services.deals.create(owner.context, dealCreateInputSchema.parse({ name: "Deal", companyId: company.id, ownerMembershipId: owner.userId }));
    for (const [entity, id, handler, path] of [
      ["company", company.id, createCompaniesGetHandler, "companies"],
      ["contact", contact.id, createContactsGetHandler, "contacts"],
      ["deal", deal.id, createDealsGetHandler, "deals"],
    ] as const) {
      const read = () => handler(services)(new Request(`https://auth.test/api/crm/${path}`, { headers: owner.headers }));
      const empty = await read(); expect(empty.status).toBe(200);
      expect(await empty.json()).toMatchObject({ fieldCustomerLabels: {} });
      const field = await services.fields.create(owner.context, fieldCreateInputSchema.parse({ entity, label: "Customer", type: "customer", showOnTable: true }));
      await services.fields.writeValues(owner.context, { entity, recordId: id, values: { [field.key]: target.id } });
      const populated = await read(); expect(populated.status).toBe(200);
      expect(await populated.json()).toMatchObject({ fieldCustomerLabels: { [target.id]: "Ada Lovelace" }, rows: expect.arrayContaining([expect.objectContaining({ id, fields: { [field.key]: target.id } })]) });
    }
  });

});

it("rebuilds populated field tables without losing hidden definitions, option IDs or retained references", async () => {
  const db = testEnv.UPGRADE_DB;
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(0, 8));
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
    db.prepare("INSERT INTO saved_view_default(user_id,entity,view_id) VALUES ('field-owner','company','retained-view')"),
  ]);
  const tables = ["custom_field_definition", "custom_field_option", "custom_field_value", "user", "singleton_membership", "saved_view", "saved_view_default"];
  const before = await Promise.all(tables.map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(8, 9));
  for (const [index, table] of tables.entries()) {
    const expected = table === "custom_field_value" ? before[index].map(row => ({ ...row, json_value: null, customer_reference_id: null })) : before[index];
    expect((await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results, table).toEqual(expected);
  }
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  expect((await db.prepare("SELECT name FROM sqlite_schema WHERE name LIKE 'custom_field_%_next'").all()).results).toEqual([]);
  await expect(db.prepare("UPDATE custom_field_value SET text_value='modified' WHERE id='deleted-value'").run()).rejects.toThrow("field_unavailable");
  await expect(db.prepare("UPDATE custom_field_definition SET entity='contact' WHERE id='select-field'").run()).rejects.toThrow("field_identity_immutable");
  await expect(db.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id='field-owner'").run()).rejects.toThrow();
});
