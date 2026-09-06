import { env } from "cloudflare:workers";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
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

import { requireRequestContext } from "@/lib/http/request-context";
import type { AppDatabase } from "@/lib/db/database";
import { LeadConversionService } from "@/lib/services/conversions/lead-conversion-service";
import { LeadMappingService } from "@/lib/services/conversions/lead-mapping-service";
import { leadConversionPreviewSchema, type LeadConversionRequest } from "@/lib/services/conversions/lead-conversion-contracts";
import { fieldCreateInputSchema } from "@/lib/services/custom-fields/field-contracts";
import { DraftService } from "@/lib/services/record-drafts/draft-service";

async function setup() {
  const actor = await session(`conversion-${crypto.randomUUID()}@example.com`);
  await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();
  const services = root();
  const context = await requireRequestContext(new Headers({ cookie: actor.cookie }), services);
  return { actor, services, context, conversions: new LeadConversionService(services.db), mapping: new LeadMappingService(services.db) };
}
function interceptBatch(db: AppDatabase, before: () => Promise<unknown>): AppDatabase {
  let used = false;
  return new Proxy(db, { get(target, property) {
    if (property === "batch") return async (statements: Parameters<AppDatabase["batch"]>[0]) => {
      const isWrite = statements.some(statement => "toSQL" in statement && typeof statement.toSQL === "function" && /insert into "action_operation_guard"/i.test(statement.toSQL().sql));
      if (isWrite && !used) { used = true; await before(); }
      return target.batch(statements);
    };
    const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value;
  } });
}
let fixture: Awaited<ReturnType<typeof setup>>;
async function leadRecord(extra: Record<string, unknown> = {}) {
  return fixture.services.leads.create(fixture.context, { firstName: "Prospect", ...extra });
}
async function requestFor(id: string, contact = { firstName: "Converted", email: `${crypto.randomUUID()}@example.com` }): Promise<LeadConversionRequest> {
  const preview = await fixture.conversions.preview(fixture.context, id);
  return { operationKey: crypto.randomUUID(), expectedLeadRevision: preview.leadRevision, expectedLeadValueRevision: preview.leadValueRevision, expectedMappingRevision: preview.mappingRevision, expectedLeadFieldRevision: preview.leadFieldRevision, expectedContactFieldRevision: preview.contactFieldRevision, target: { mode: "create", contact } };
}
const defaultMappings = ["firstName", "lastName", "email", "phone", "title", "companyId", "ownerMembershipId"].map(key => ({ source: `builtin:${key}`, target: `builtin:${key}` }));

describe.sequential("lead contact conversion", () => {
  beforeAll(async () => { fixture = await setup(); });
  beforeEach(async () => {
    await env.DB.batch([
      env.DB.prepare("UPDATE module_setting SET enabled=1"),
      env.DB.prepare("UPDATE lead_mapping SET mappings_json=?,revision=revision+1 WHERE id='contact'").bind(JSON.stringify(defaultMappings)),
    ]);
  });
  it("prepares contacts without commits, normalizes phone keys and previews real duplicates", async () => {
    const { services, context, conversions } = fixture;
    const prepared = await services.contacts.prepareCreate(context, { firstName: "Pending", phone: " +84 (90) 123 " });
    expect(await env.DB.prepare("SELECT id FROM contact WHERE id=?").bind(prepared.result.id).first()).toBeNull();
    const linked = await services.contacts.create(context, { firstName: "Match", phone: "+84 90123" });
    const source = await leadRecord({ phone: "+84 (90)123" });
    const preview = await conversions.preview(context, source.id);
    expect(leadConversionPreviewSchema.safeParse(preview).success).toBe(true);
    expect(preview.proposedContact).toMatchObject({ firstName: "Prospect", phone: "+84 (90)123" });
    expect(preview.candidates).toContainEqual(expect.objectContaining({ id: linked.id, reasons: ["phone"] }));
    await services.contacts.update(context, linked.id, { phone: "090 123" });
    expect(await env.DB.prepare("SELECT normalized_phone FROM contact WHERE id=?").bind(linked.id).first()).toEqual({ normalized_phone: "090123" });
  });
  it("creates once and replays before consumed draft checks, including disabled modules", async () => {
    const { services, context, conversions } = fixture;
    const source = await leadRecord();
    const draft = await new DraftService(services.db).create(context, { entity: "contact" });
    const input = await requestFor(source.id);
    if (input.target.mode !== "create") throw new Error("Expected create");
    input.target.draftId = draft.id;
    const [first, concurrent] = await Promise.all([conversions.apply(context, source.id, input), conversions.apply(context, source.id, input)]);
    expect(concurrent).toEqual(first); expect(first.contactId).toBe(draft.id);
    expect(await env.DB.prepare("SELECT converted_contact_id,status_id FROM lead WHERE id=?").bind(source.id).first()).toEqual({ converted_contact_id: draft.id, status_id: "converted" });
    expect((await env.DB.prepare("SELECT id FROM lead_conversion WHERE lead_id=?").bind(source.id).all()).results).toHaveLength(1);
    await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity IN ('lead','contact')").run();
    expect(await conversions.apply(context, source.id, input)).toEqual(first);
    await expect(conversions.apply(context, source.id, { ...input, target: { mode: "create", contact: { firstName: "Different" } } })).rejects.toMatchObject({ status: 409 });
  });
  it("links without changing any contact columns, values, ownership or timestamps", async () => {
    const { services, context, conversions } = fixture;
    const target = await services.contacts.create(context, { firstName: "Existing", ownerMembershipId: fixture.actor.id });
    const source = await leadRecord();
    const snapshot = await env.DB.prepare("SELECT * FROM contact WHERE id=?").bind(target.id).first();
    const values = (await env.DB.prepare("SELECT * FROM custom_field_value WHERE contact_id=?").bind(target.id).all()).results;
    const base = await requestFor(source.id), input: LeadConversionRequest = { ...base, target: { mode: "link", contactId: target.id } };
    const result = await conversions.apply(context, source.id, input);
    expect(await env.DB.prepare("SELECT * FROM contact WHERE id=?").bind(target.id).first()).toEqual(snapshot);
    expect((await env.DB.prepare("SELECT * FROM custom_field_value WHERE contact_id=?").bind(target.id).all()).results).toEqual(values);
    expect(await conversions.apply(context, source.id, { ...input, operationKey: crypto.randomUUID() })).toEqual(result);
    await expect(conversions.apply(context, source.id, { ...input, operationKey: crypto.randomUUID(), target: { mode: "link", contactId: crypto.randomUUID() } })).rejects.toMatchObject({ status: 409 });
  });
  it("rejects mapping option/file/formula hazards and guards owner configuration races", async () => {
    const { services, context, mapping } = fixture;
    const source = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "lead", label: "Source choice", type: "select", options: [{ label: "One" }, { label: "Two" }] }));
    const target = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "contact", label: "Target choice", type: "select", options: [{ label: "First" }, { label: "Second" }] }));
    let config = await mapping.get(context);
    await expect(mapping.update(context, { revision: config.revision, autoOrder: false, autoDeal: false, mappings: [{ source: `custom:${source.id}`, target: `custom:${target.id}` }] })).rejects.toMatchObject({ status: 400 });
    const valid = { revision: config.revision, autoOrder: false as const, autoDeal: false as const, mappings: [{ source: `custom:${source.id}`, target: `custom:${target.id}`, options: Object.fromEntries(source.options.map((option,index) => [option.id,target.options[index]!.id])) }] };
    await mapping.update(context, valid);
    config = await mapping.get(context);
    const file = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "lead", label: "Attachments", type: "file" }));
    await expect(mapping.update(context, { revision: config.revision, autoOrder: false, autoDeal: false, mappings: [{ source: `custom:${file.id}`, target: "builtin:firstName" }] })).rejects.toMatchObject({ status: 400 });
    const formula = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "contact", label: "Computed destination", type: "formula", config: { expression: "1+2" } }));
    await expect(mapping.update(context, { revision: config.revision, autoOrder: false, autoDeal: false, mappings: [{ source: "builtin:firstName", target: `custom:${formula.id}` }] })).rejects.toMatchObject({ status: 400 });
    const raced = new LeadMappingService(interceptBatch(services.db, () => env.DB.prepare("UPDATE lead_mapping SET revision=revision+1").run()));
    await expect(raced.update(context, { ...valid, revision: config.revision })).rejects.toMatchObject({ status: 409 });
    await expect(mapping.update(context, { ...valid, revision: (await mapping.get(context)).revision, autoOrder: true } as never)).rejects.toMatchObject({ status: 400 });
  });
  it("rolls back real contact/custom writes and draft consumption on a stale mapping", async () => {
    const { services, context } = fixture;
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "contact", label: "Conversion note", type: "text" }));
    const source = await leadRecord(), input = await requestFor(source.id);
    const draft = await new DraftService(services.db).create(context, { entity: "contact" });
    if (input.target.mode !== "create") throw new Error("Expected create");
    input.target.draftId = draft.id; input.target.contact.customFields = { [field.key]: "Must roll back" };
    const raced = new LeadConversionService(interceptBatch(services.db, () => env.DB.prepare("UPDATE lead_mapping SET revision=revision+1").run()));
    await expect(raced.apply(context, source.id, input)).rejects.toMatchObject({ status: 409 });
    expect(await env.DB.prepare("SELECT * FROM contact WHERE id=?").bind(draft.id).first()).toBeNull();
    expect((await env.DB.prepare("SELECT * FROM custom_field_value WHERE contact_id=?").bind(draft.id).all()).results).toEqual([]);
    expect(await env.DB.prepare("SELECT consumed_at FROM record_draft WHERE id=?").bind(draft.id).first()).toEqual({ consumed_at: null });
    expect(await env.DB.prepare("SELECT converted_at FROM lead WHERE id=?").bind(source.id).first()).toEqual({ converted_at: null });
    expect((await env.DB.prepare("SELECT * FROM lead_conversion WHERE lead_id=?").bind(source.id).all()).results).toEqual([]);
  });
  it("rejects competing contact emails and rechecks module permission at the batch boundary", async () => {
    const { services, context, conversions } = fixture;
    const existing = await services.contacts.create(context, { firstName: "Existing", email: `${crypto.randomUUID()}@example.com` });
    const contact = await services.contacts.byId(context, existing.id);
    const source = await leadRecord(), input = await requestFor(source.id, { firstName: "Duplicate", email: contact.email! });
    await expect(conversions.apply(context, source.id, input)).rejects.toMatchObject({ status: 409 });
    const fresh = await leadRecord(), valid = await requestFor(fresh.id);
    const raced = new LeadConversionService(interceptBatch(services.db, () => env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='contact'").run()));
    await expect(raced.apply(context, fresh.id, valid)).rejects.toMatchObject({ status: 403 });
    expect(await env.DB.prepare("SELECT converted_at FROM lead WHERE id=?").bind(fresh.id).first()).toEqual({ converted_at: null });
  });
  it("rolls back a late operation failure after actual contact and custom inserts", async () => {
    const { services, context, conversions } = fixture;
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "contact", label: "Late failure value", type: "text" }));
    const source = await leadRecord(), input = await requestFor(source.id);
    const draft = await new DraftService(services.db).create(context, { entity: "contact" });
    if (input.target.mode !== "create") throw new Error("Expected create");
    input.target.draftId = draft.id; input.target.contact.customFields = { [field.key]: "Real insert" };
    await env.DB.exec("CREATE TRIGGER reject_test_conversion BEFORE INSERT ON lead_conversion BEGIN SELECT RAISE(ABORT,'forced_conversion_failure'); END;");
    try { await expect(conversions.apply(context, source.id, input)).rejects.toThrow(); }
    finally { await env.DB.exec("DROP TRIGGER reject_test_conversion;"); }
    expect(await env.DB.prepare("SELECT * FROM contact WHERE id=?").bind(draft.id).first()).toBeNull();
    expect((await env.DB.prepare("SELECT * FROM custom_field_value WHERE contact_id=?").bind(draft.id).all()).results).toEqual([]);
    expect(await env.DB.prepare("SELECT consumed_at FROM record_draft WHERE id=?").bind(draft.id).first()).toEqual({ consumed_at: null });
    expect(await env.DB.prepare("SELECT converted_at FROM lead WHERE id=?").bind(source.id).first()).toEqual({ converted_at: null });
    expect((await env.DB.prepare("SELECT * FROM lead_conversion WHERE lead_id=?").bind(source.id).all()).results).toEqual([]);
    const success = await conversions.apply(context, source.id, input);
    expect(success.contactId).toBe(draft.id);
  });
  it("rejects changed source custom values and returns invalid mapped proposals with field errors", async () => {
    const { services, context, conversions, mapping } = fixture;
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "lead", label: "Source review value", type: "text" }));
    const source = await leadRecord({ customFields: { [field.key]: "Initial" } }), input = await requestFor(source.id);
    await services.fields.writeValues(context, { entity: "lead", recordId: source.id, values: { [field.key]: "Changed" } });
    await expect(conversions.apply(context, source.id, input)).rejects.toMatchObject({ status: 409 });
    const current = await mapping.get(context);
    await mapping.update(context, { revision: current.revision, autoOrder: false, autoDeal: false, mappings: [...defaultMappings, { source: `custom:${field.id}`, target: "builtin:email" }].filter(pair => pair.source !== "builtin:email") });
    const preview = await conversions.preview(context, source.id);
    expect(preview.errors).toContainEqual(expect.objectContaining({ field: "email" }));
    expect(preview.proposedContact.email).toBe("Changed");
    expect(leadConversionPreviewSchema.safeParse(preview).success).toBe(true);
  });
  it("arbitrates concurrent operation keys on one lead and rejects a revoked replay", async () => {
    const { context, conversions } = fixture;
    const source = await leadRecord(), input = await requestFor(source.id);
    const results = await Promise.all([conversions.apply(context, source.id, input), conversions.apply(context, source.id, { ...input, operationKey: crypto.randomUUID() })]);
    expect(results[0]).toEqual(results[1]);
    expect((await env.DB.prepare("SELECT * FROM lead_conversion WHERE lead_id=?").bind(source.id).all()).results).toHaveLength(1);
    const other = await setup();
    await other.services.members.remove(other.context, fixture.actor.id, other.actor.id);
    try { await expect(conversions.apply(context, source.id, input)).rejects.toMatchObject({ status: 403 }); }
    finally { await other.services.members.restore(other.context, fixture.actor.id); }
    expect(other.actor.id).not.toBe(fixture.actor.id);
  });
  it("keeps private source files anchored and requires explicit new-contact uploads", async () => {
    fixture = await setup();
    const { services, context, conversions } = fixture;
    const sourceField = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "lead", label: "Source private files", type: "file" }));
    const targetField = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "contact", label: "Contact private files", type: "file", required: true }));
    try {
      const source = await leadRecord();
      const upload = () => new Request("https://auth.test/api/crm/files", { method: "POST", headers: { "content-type": "application/octet-stream", "x-file-name": "private.txt" }, body: "private bytes" });
      const sourceFile = await services.files.upload(context, { entity: "lead", recordId: source.id, fieldId: sourceField.id }, upload());
      await services.fields.writeValues(context, { entity: "lead", recordId: source.id, values: { [sourceField.key]: [sourceFile.id] } });
      const input = await requestFor(source.id);
      if (input.target.mode !== "create") throw new Error("Expected create");
      const draft = await new DraftService(services.db).create(context, { entity: "contact" });
      input.target.draftId = draft.id;
      input.target.contact.customFields = { [targetField.key]: [sourceFile.id] };
      await expect(conversions.apply(context, source.id, input)).rejects.toMatchObject({ status: 409 });
      expect(await env.DB.prepare("SELECT id FROM contact WHERE id=?").bind(draft.id).first()).toBeNull();
      const targetFile = await services.files.upload(context, { entity: "contact", recordId: draft.id, draftId: draft.id, fieldId: targetField.id }, upload());
      input.target.contact.customFields = { [targetField.key]: [targetFile.id] };
      const result = await conversions.apply(context, source.id, input);
      expect((await services.fields.values(context, { entity: "contact", recordId: result.contactId }))[targetField.key]).toEqual([targetFile.id]);
      expect((await services.fields.values(context, { entity: "lead", recordId: source.id }))[sourceField.key]).toEqual([sourceFile.id]);
    } finally { await services.fields.archive(context, targetField.id); }
  });
  it("allows link-only members without contact write grants and blocks owner revocation races", async () => {
    const { services, context, conversions } = fixture;
    const target = await services.contacts.create(context, { firstName: "Read target" }), source = await leadRecord();
    const member = await session(`link-only-${crypto.randomUUID()}@example.com`), profileId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare("INSERT INTO access_profile(id,name,created_at,updated_at) VALUES(?,?,0,0)").bind(profileId, profileId),
      env.DB.prepare("INSERT INTO access_grant(profile_id,permission) VALUES(?,'lead.convert')").bind(profileId),
      env.DB.prepare("UPDATE membership_access SET profile_id=? WHERE membership_id=?").bind(profileId, member.id),
    ]);
    const memberContext = await requireRequestContext(new Headers({ cookie: member.cookie }), services);
    const input = await requestFor(source.id);
    await expect(conversions.apply(memberContext, source.id, input)).rejects.toMatchObject({ status: 403 });
    const before = await env.DB.prepare("SELECT * FROM contact WHERE id=?").bind(target.id).first();
    await conversions.apply(memberContext, source.id, { ...input, target: { mode: "link", contactId: target.id } });
    expect(await env.DB.prepare("SELECT * FROM contact WHERE id=?").bind(target.id).first()).toEqual(before);
    await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity IN ('lead','contact')").run();
    try {
      const detail = await services.contacts.byId(memberContext, target.id);
      expect(detail.convertedFrom).toEqual([expect.objectContaining({ id: source.id, convertedAt: expect.any(String) })]);
      expect(await env.DB.prepare("SELECT * FROM contact WHERE id=?").bind(target.id).first()).toEqual(before);
    } finally { await env.DB.prepare("UPDATE module_setting SET enabled=1 WHERE entity IN ('lead','contact')").run(); }
    const mapping = new LeadMappingService(services.db), config = await mapping.get(context);
    const other = await setup();
    const raced = new LeadMappingService(interceptBatch(services.db, () => env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(context.userId).run()));
    try { await expect(raced.update(context, { revision: config.revision, mappings: defaultMappings, autoOrder: false, autoDeal: false })).rejects.toMatchObject({ status: 403 }); }
    finally { await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(context.userId).run(); }
    expect(other.actor.id).not.toBe(context.userId);
  });
});
