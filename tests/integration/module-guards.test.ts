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
import { ActivityService } from "@/lib/services/activities/activity-service";
import { companyListInputSchema } from "@/lib/services/companies/company-contract";
import { contactListInputSchema } from "@/lib/services/contacts/contact-contract";
import { dealCreateInputSchema, dealListInputSchema } from "@/lib/services/deals/deal-contract";
import { fieldCreateInputSchema, type FieldEntity } from "@/lib/services/custom-fields/field-contracts";
import { requirePermission } from "@/lib/services/permissions/permission-policy";
import { FileService } from "@/lib/services/files/file-service";

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
async function enabled(entity: FieldEntity, value: boolean) {
  await env.DB.prepare("UPDATE module_setting SET enabled=? WHERE entity=?").bind(value ? 1 : 0, entity).run();
}
async function snapshot() {
  const tables = ["company", "contact", "deal", "deal_contact", "custom_field_value", "activity"];
  return Promise.all(tables.map(table => env.DB.prepare(`SELECT * FROM ${table} ORDER BY 1, 2`).all().then(result => result.results)));
}

describe.sequential("disabled modules preserve history and block record mutations", () => {
  beforeEach(clearState);

  it("retains enabled deal stage history without stamping its disabled company", async () => {
    const { services, context, company, deal } = await setup();
    const before = await env.DB.prepare("SELECT * FROM company WHERE id=?").bind(company.id).first();
    await enabled("company", false);
    await services.deals.update(context, deal.id, { stageId: "qualified-to-buy" });
    expect((await services.deals.byId(context, deal.id)).stageId).toBe("qualified-to-buy");
    expect(await env.DB.prepare("SELECT * FROM company WHERE id=?").bind(company.id).first()).toEqual(before);
    const history = await services.activities.timeline(context, { entity: "deal", recordId: deal.id, filter: "history", limit: 30 });
    expect(history.entries).toEqual([expect.objectContaining({ type: "stage_change", companyId: company.id, dealId: deal.id, metadata: { fromStageId: "demo-booked", toStageId: "qualified-to-buy" } })]);
    expect((await services.activities.timeline(context, { entity: "company", recordId: company.id, filter: "history", limit: 30 })).entries[0]?.id).toBe(history.entries[0]?.id);
  });

  for (const entity of ["company", "contact", "deal"] as const) {
    it(`blocks all ${entity} write families even for owners without changing stored records`, async () => {
      const fixture = await setup();
      const { services, context, company, contact, deal, actor } = fixture;
      const id = fixture[entity].id;
      const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity, label: "History", type: "text" }));
      await services.fields.writeValues(context, { entity, recordId: id, values: { [field.key]: "Keep" } });
      await enabled(entity, false);
      const before = await snapshot();
      const service = entity === "company" ? services.companies : entity === "contact" ? services.contacts : services.deals;
      const create = entity === "company" ? () => services.companies.create(context, { name: "Blocked" }) : entity === "contact" ? () => services.contacts.create(context, { firstName: "Blocked" }) : () => services.deals.create(context, dealCreateInputSchema.parse({ name: "Blocked", companyId: company.id, ownerMembershipId: actor.id }));
      const update = entity === "contact" ? () => services.contacts.update(context, id, { firstName: "Blocked" }) : entity === "company" ? () => services.companies.update(context, id, { name: "Blocked" }) : () => services.deals.update(context, id, { name: "Blocked" });
      const operations = [create, update,
        () => service.archive(context, id), () => service.archive(context, id, true),
        () => service.bulkArchive(context, [id]), () => service.bulkArchive(context, [id], true),
        () => service.update(context, id, { ownerMembershipId: "sentinel-owner" }),
        () => services.ownership.assign(context, { entity, ids: [id], ownerMembershipId: "sentinel-owner" }),
        () => services.fields.writeValues(context, { entity, recordId: id, values: { [field.key]: "Blocked" } }),
        ...(entity === "deal" ? [() => services.deals.attachContact(context, deal.id, contact.id), () => services.deals.setContactRole(context, deal.id, contact.id, "Blocked"), () => services.deals.detachContact(context, deal.id, contact.id)] : []),
      ];
      for (const operation of operations) await expect(operation()).rejects.toMatchObject({ status: 403 });
      expect(await snapshot()).toEqual(before);
    });
  }

  it("retains details, lists, facets, saved views and export permission while definition administration stays available", async () => {
    const { services, context, company, contact, deal } = await setup();
    const view = await services.views.create(context, { entity: "company", name: "History", shared: false, state: { version: 1, query: "" } });
    const lists = async () => Promise.all([
      services.companies.list(context, companyListInputSchema.parse({})),
      services.contacts.list(context, contactListInputSchema.parse({})),
      services.deals.list(context, dealListInputSchema.parse({})),
    ]);
    const before = await lists();
    for (const entity of ["company", "contact", "deal"] as const) await enabled(entity, false);
    expect(await lists()).toEqual(before);
    expect(await services.companies.byId(context, company.id)).toMatchObject({ id: company.id });
    expect(await services.contacts.byId(context, contact.id)).toMatchObject({ company: { id: company.id } });
    expect(await services.deals.byId(context, deal.id)).toMatchObject({ company: { id: company.id }, contacts: [{ id: contact.id }] });
    expect(await services.views.list(context, "company")).toEqual([view]);
    for (const entity of ["company", "contact", "deal"] as const) await expect(requirePermission(services.db, context, [`${entity}.export`])).resolves.toBeUndefined();
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "company", type: "text", label: "Admin" }));
    expect(await services.fields.update(context, field.id, { label: "Admin updated" })).toMatchObject({ label: "Admin updated" });
    await services.views.update(context, view.id, { name: "History renamed" });
    expect((await services.views.list(context, "company"))[0]?.name).toBe("History renamed");
  });

  it("rechecks module state in the real SQL batch after preliminary authorization", async () => {
    const { services, context, company } = await setup();
    const before = await snapshot();
    let reachedBatch = false;
    const db = new Proxy(services.db, { get(target, property) {
      if (property === "batch") return async (statements: Parameters<typeof target.batch>[0]) => {
        reachedBatch = true;
        await enabled("company", false);
        return target.batch(statements);
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(new CompanyService(db).update(context, company.id, { name: "Lost race" })).rejects.toMatchObject({ status: 403 });
    expect(reachedBatch).toBe(true);
    expect(await snapshot()).toEqual(before);
    expect((await env.DB.prepare("SELECT * FROM action_operation_guard").all()).results).toEqual([]);
  });

  it("guards resolved company anchors and every stored task anchor while retaining history", async () => {
    const { services, context, company, contact, deal } = await setup();
    const task = await services.activities.create(context, { type: "task", subject: "Follow up", contactId: contact.id, dealId: deal.id });
    expect(task.companyId).toBe(company.id);
    const before = await snapshot();
    await enabled("company", false);
    for (const anchor of [{ contactId: contact.id }, { dealId: deal.id }]) await expect(services.activities.create(context, { type: "note", ...anchor })).rejects.toMatchObject({ status: 403 });
    await enabled("company", true);
    for (const entity of ["company", "contact", "deal"] as const) {
      await enabled(entity, false);
      await expect(services.activities.complete(context, task.id, true)).rejects.toMatchObject({ status: 403 });
      expect((await services.activities.timeline(context, { entity, recordId: ({ company, contact, deal })[entity].id, filter: "all", limit: 30 })).entries.map(entry => entry.id)).toContain(task.id);
      await enabled(entity, true);
    }
    expect(await snapshot()).toEqual(before);
    let reachedBatch = false;
    const db = new Proxy(services.db, { get(target, property) {
      if (property === "batch") return async (statements: Parameters<typeof target.batch>[0]) => {
        reachedBatch = true;
        await enabled("company", false);
        return target.batch(statements);
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    const racingActivities = new ActivityService(db);
    await expect(racingActivities.create(context, { type: "note", contactId: contact.id })).rejects.toMatchObject({ status: 403 });
    expect(reachedBatch).toBe(true);
    expect(await snapshot()).toEqual(before);
    await enabled("company", true);
    reachedBatch = false;
    await expect(racingActivities.complete(context, task.id, true)).rejects.toMatchObject({ status: 403 });
    expect(reachedBatch).toBe(true);
    expect(await snapshot()).toEqual(before);
    await enabled("company", true);
    expect(await services.activities.complete(context, task.id, true)).toMatchObject({ completedAt: expect.any(String) });
  });

  it("rejects an earlier conversion token after disabling without rewriting values or consuming the token", async () => {
    const { services, context, company } = await setup();
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "company", type: "text", label: "Convert" }));
    await services.fields.writeValues(context, { entity: "company", recordId: company.id, values: { [field.key]: "History" } });
    const preview = await services.fields.previewConversion(context, field.id, "long_text", {});
    expect(preview.token).toBeTruthy();
    const before = await snapshot();
    await enabled("company", false);
    await expect(services.fields.applyConversion(context, field.id, preview.token!)).rejects.toMatchObject({ status: 403 });
    expect((await services.fields.byId(context, field.id)).type).toBe("text");
    expect(await snapshot()).toEqual(before);
    await enabled("company", true);
    expect((await services.fields.applyConversion(context, field.id, preview.token!)).type).toBe("long_text");
  });

  it("keeps historical file downloads readable and records compensated uploads when disabled during R2 put", async () => {
    const { services, context, company } = await setup();
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "company", type: "file", label: "Files" }));
    const input = { entity: "company" as const, recordId: company.id, fieldId: field.id };
    const upload = () => new Request("https://auth.test/upload", { method: "POST", headers: { "x-file-name": "history.txt", "content-type": "application/octet-stream" }, body: new Uint8Array([0, 1, 255]) });
    const stored = await services.files.upload(context, input, upload());
    await services.fields.writeValues(context, { entity: "company", recordId: company.id, values: { [field.key]: [stored.id] } });
    let key = "";
    const bucket = new Proxy(bindings.CRM_FILES, { get(target, property) {
      if (property === "put") return async (objectKey: string, bytes: Uint8Array) => {
        key = objectKey;
        const result = await target.put(objectKey, bytes);
        await enabled("company", false);
        return result;
      };
      const value = Reflect.get(target, property);
      return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(new FileService(services.db, bucket).upload(context, input, upload())).rejects.toMatchObject({ status: 409 });
    expect(await bindings.CRM_FILES.get(key)).toBeNull();
    expect(await env.DB.prepare("SELECT status FROM crm_file WHERE object_key=?").bind(key).first()).toEqual({ status: "failed" });
    expect([...new Uint8Array(await (await services.files.download(context, stored.id)).arrayBuffer())]).toEqual([0, 1, 255]);
    await expect(services.files.upload(context, input, upload())).rejects.toMatchObject({ status: 403 });
  });

  it("allows administrative membership revocation and ownership handover across disabled records", async () => {
    const { services, context, company, contact, deal, actor } = await setup();
    const departing = await session(`departing-${crypto.randomUUID()}@example.com`);
    for (const [entity, id] of [["company", company.id], ["contact", contact.id], ["deal", deal.id]] as const) {
      await services.ownership.assign(context, { entity, ids: [id], ownerMembershipId: departing.id });
      const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity, type: "user", label: "Responsible" }));
      await services.fields.writeValues(context, { entity, recordId: id, values: { [field.key]: departing.id } });
      await enabled(entity, false);
    }
    await services.members.remove(context, departing.id, actor.id);
    expect(await env.DB.prepare("SELECT status FROM singleton_membership WHERE user_id=?").bind(departing.id).first()).toEqual({ status: "revoked" });
    for (const [entity, id] of [["company", company.id], ["contact", contact.id], ["deal", deal.id]] as const) expect(await env.DB.prepare(`SELECT owner_membership_id FROM ${entity} WHERE id=?`).bind(id).first()).toEqual({ owner_membership_id: actor.id });
    expect(await env.DB.prepare("SELECT count(*) AS count FROM custom_field_value WHERE user_membership_id=?").bind(departing.id).first()).toEqual({ count: 0 });
    expect((await env.DB.prepare("SELECT enabled FROM module_setting WHERE entity IN ('company','contact','deal')").all()).results).toEqual([{ enabled: 0 }, { enabled: 0 }, { enabled: 0 }]);
  });
});
