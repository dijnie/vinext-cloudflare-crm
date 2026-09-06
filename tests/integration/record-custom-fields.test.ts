import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) { this.verificationMessages.push(message); }
  async sendPasswordReset() {}
}
const bindings = env as RuntimeEnv;
let requestIndex = 50;
const root = () => createCompositionRoot(bindings, new RecordingEmailAdapter());
async function successful(response: Response) {
  const body = await response.json() as any;
  expect(response.status, JSON.stringify(body)).toBe(200);
  return body;
}
async function session(email: string) {
  const adapter = new RecordingEmailAdapter();
  const composition = createCompositionRoot(bindings, adapter);
  const headers = { origin: "https://auth.test", "content-type": "application/json", "cf-connecting-ip": `192.0.2.${++requestIndex}` };
  const auth = (path: string, body: unknown) => handleAuthRequest(new Request(`https://auth.test/api/auth/${path}`, { method: "POST", headers, body: JSON.stringify(body) }), composition.auth, composition.db, bindings.AUTH_BASE_URL);
  const password = "correct horse battery staple";
  await successful(await auth("sign-up/email", { name: email, email, password }));
  const token = new URL(adapter.verificationMessages.at(-1)?.url ?? "").searchParams.get("token");
  if (!token) throw new Error("Expected verification token");
  await composition.auth.api.verifyEmail({ asResponse: true, headers: new Headers({ origin: "https://auth.test" }), query: { token } });
  const signedIn = await auth("sign-in/email", { email, password });
  expect(signedIn.status).toBe(200);
  const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
  const user = await composition.db.query.user.findFirst({ where: (fields, { eq }) => eq(fields.email, email) });
  if (!cookie || !user) throw new Error("Expected verified session");
  return { cookie, id: user.id };
}
async function clearState() {
  await env.DB.batch([
    env.DB.prepare("UPDATE module_setting SET enabled=1"),
    ...["activity_visibility", "activity", "custom_field_value", "custom_field_option", "custom_field_definition", "saved_view", "deal_contact", "deal", "contact", "company", "session", "account", "verification", "rate_limit"].map(table => env.DB.prepare(`DELETE FROM ${table}`)),
    env.DB.prepare("INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('sentinel-owner', 'Sentinel Owner', 'sentinel-owner@example.com', 1, 0, 0)"),
    env.DB.prepare("INSERT OR IGNORE INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('sentinel-owner', 'owner', 'active', 0, 0)"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'"),
    env.DB.prepare("DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner' WHERE id = ?").bind(SINGLETON_WORKSPACE_ID),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
  ]);
}

import { requireRequestContext } from "@/lib/http/request-context";
import { CompanyService } from "@/lib/services/companies/company-service";
import { dealCreateInputSchema } from "@/lib/services/deals/deal-contract";
import { fieldCreateInputSchema } from "@/lib/services/custom-fields/field-contracts";

async function setup() {
  const actor = await session(`module-${crypto.randomUUID()}@example.com`);
  await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();
  const services = root();
  const context = await requireRequestContext(new Headers({ cookie: actor.cookie }), services);
  const company = await services.companies.create(context, { name: "Historical company", ownerMembershipId: actor.id });
  const contact = await services.contacts.create(context, { firstName: "Historical contact", companyId: company.id, ownerMembershipId: actor.id });
  const deal = await services.deals.create(context, dealCreateInputSchema.parse({ name: "Historical deal", companyId: company.id, ownerMembershipId: actor.id }));
  await services.deals.attachContact(context, deal.id, contact.id, "Buyer");
  return { actor, services, context, company, contact, deal };
}
async function snapshot() {
  const tables = ["company", "contact", "deal", "deal_contact", "custom_field_value", "activity"];
  return Promise.all(tables.map(table => env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all().then(result => result.results)));
}

import { ContactService } from "@/lib/services/contacts/contact-service";
import { DealService } from "@/lib/services/deals/deal-service";
import { DealRepository } from "@/lib/services/deals/deal-repository";
import { companyCreateInputSchema, companyUpdateInputSchema } from "@/lib/services/companies/company-contract";
import { contactCreateInputSchema, contactUpdateInputSchema } from "@/lib/services/contacts/contact-contract";
import { dealUpdateInputSchema } from "@/lib/services/deals/deal-contract";

describe.sequential("atomic record and custom field writes", () => {
  beforeEach(clearState);

  for (const entity of ["company", "contact", "deal"] as const) {
    it(`creates ${entity} with required values atomically and preserves incomplete historical updates`, async () => {
      const fixture = await setup();
      const { services, context, company, actor } = fixture;
      const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity, type: "text", label: "Required history", required: true }));
      const file = await services.fields.create(context, fieldCreateInputSchema.parse({ entity, type: "file", label: "Attachments" }));
      const create = (customFields?: Record<string, string | string[]>) => entity === "company" ? services.companies.create(context, companyCreateInputSchema.parse({ name: "New", customFields })) : entity === "contact" ? services.contacts.create(context, contactCreateInputSchema.parse({ firstName: "New", customFields })) : services.deals.create(context, dealCreateInputSchema.parse({ name: "New", companyId: company.id, ownerMembershipId: actor.id, customFields }));
      const before = await snapshot();
      await expect(create()).rejects.toMatchObject({ status: 400 });
      expect(await snapshot()).toEqual(before);
      // This passes value parsing and fails its attachment guard after base INSERT.
      await expect(create({ [field.key]: "Valid", [file.key]: [crypto.randomUUID()] })).rejects.toMatchObject({ status: 409 });
      expect(await snapshot()).toEqual(before);
      const created = await create({ [field.key]: "Stored together" });
      expect((await services.fields.values(context, { entity, recordId: created.id }))[field.key]).toBe("Stored together");
      const recordId = fixture[entity].id;
      const updated = entity === "contact" ? { firstName: "Historical edit" } : { name: "Historical edit" };
      const update = (data: unknown) => entity === "company" ? services.companies.update(context, recordId, companyUpdateInputSchema.parse({ action: "update", data }).data) : entity === "contact" ? services.contacts.update(context, recordId, contactUpdateInputSchema.parse({ action: "update", data }).data) : services.deals.update(context, recordId, dealUpdateInputSchema.parse({ action: "update", data }).data);
      await update(updated);
      expect((await services.fields.values(context, { entity, recordId }))[field.key]).toBeNull();
      const after = await snapshot();
      await expect(update({ ...updated, customFields: { [field.key]: null } })).rejects.toMatchObject({ status: 400 });
      expect(await snapshot()).toEqual(after);
      await expect(update({ ...updated, customFields: { [field.key]: "Valid", [file.key]: [crypto.randomUUID()] } })).rejects.toMatchObject({ status: 409 });
      expect(await snapshot()).toEqual(after);
    });
  }

  it("rejects newly required configuration racing an empty create payload across all entities", async () => {
    const { services, context, company, actor } = await setup();
    for (const entity of ["company", "contact", "deal"] as const) {
      const before = await snapshot();
      let changed = false;
      const db = new Proxy(services.db, { get(target, property) {
        if (property === "batch") return async (statements: Parameters<typeof target.batch>[0]) => {
          if (!changed && statements.some(statement => "toSQL" in statement && typeof statement.toSQL === "function" && statement.toSQL().sql.startsWith(`insert into "${entity}"`))) {
            changed = true;
            await services.fields.create(context, fieldCreateInputSchema.parse({ entity, type: "text", label: "Added during create", required: true }));
          }
          return target.batch(statements);
        };
        const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
      } });
      const attempt = entity === "company" ? new CompanyService(db).create(context, { name: "Race" }) : entity === "contact" ? new ContactService(db).create(context, { firstName: "Race" }) : new DealService(db).create(context, dealCreateInputSchema.parse({ name: "Race", companyId: company.id, ownerMembershipId: actor.id }));
      await expect(attempt).rejects.toMatchObject({ status: 409 });
      expect(changed).toBe(true);
      expect(await snapshot()).toEqual(before);
    }
  });

  it("uses create permission for required values without requiring update permission", async () => {
    const { services, context } = await setup();
    const member = await session(`creator-${crypto.randomUUID()}@example.com`);
    const profileName = crypto.randomUUID();
    const access = await services.access.mutate(context, { action: "create-profile", name: profileName, grants: ["company.create"] });
    const profile = access.profiles.find(item => item.name === profileName)!;
    await services.access.mutate(context, { action: "assign-profile", membershipId: member.id, profileId: profile.id });
    const memberContext = await requireRequestContext(new Headers({ cookie: member.cookie }), services);
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "company", type: "text", label: "Mandatory", required: true }));
    const record = await services.companies.create(memberContext, { name: "Created", customFields: { [field.key]: "Present" } });
    expect((await services.fields.values(memberContext, { entity: "company", recordId: record.id }))[field.key]).toBe("Present");
    await expect(services.companies.update(memberContext, record.id, { customFields: { [field.key]: "Forbidden" } })).rejects.toMatchObject({ status: 403 });
  });

  it("rolls back base changes on stale calendar metadata and preserves deal update/history adjacency", async () => {
    const { services, context, deal } = await setup();
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "deal", type: "date", label: "Appointment", config: { dateTime: true } }));
    const calendar = field.calendar!;
    await env.DB.prepare("UPDATE crm_setting SET calendar_revision=calendar_revision+1 WHERE id='settings'").run();
    const before = await snapshot();
    await expect(services.deals.update(context, deal.id, { stageId: "qualified-to-buy", customFields: { [field.key]: "2030-01-01T12:00:00.123Z" }, calendarRevision: calendar.revision })).rejects.toMatchObject({ status: 409 });
    expect(await snapshot()).toEqual(before);
    await services.deals.update(context, deal.id, { stageId: "qualified-to-buy", customFields: { [field.key]: "2030-01-01T12:00:00.123Z" }, calendarRevision: calendar.revision + 1 });
    expect((await services.fields.values(context, { entity: "deal", recordId: deal.id }))[field.key]).toBe("2030-01-01T12:00:00.123Z");
    expect((await services.activities.timeline(context, { entity: "deal", recordId: deal.id, filter: "history", limit: 30 })).entries).toHaveLength(1);
  });

  it("rejects stale zero-row deal updates before attaching custom values or appending history", async () => {
    const { services, context, deal } = await setup();
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "deal", type: "text", label: "Race value" }));
    const prepared = await services.fields.prepareValues(context, { entity: "deal", recordId: deal.id, values: { [field.key]: "Must not attach" } });
    await services.deals.update(context, deal.id, { stageId: "qualified-to-buy" });
    const before = await snapshot();
    const repository = new DealRepository(services.db);
    for (const values of [{ name: "Stale" }, { stageId: "contract-sent", updatedAt: new Date() }]) {
      await expect(repository.updateWithHistory(deal.id, values, "demo-booked", context.userId, context, undefined, prepared)).rejects.toMatchObject({ status: 409 });
      expect(await snapshot()).toEqual(before);
    }
  });
});
