import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) { this.verificationMessages.push(message); }
  async sendPasswordReset() { }
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
    ...["activity_visibility", "activity", "custom_field_value", "lead_collaborator", "lead", "custom_field_option", "custom_field_definition", "saved_view", "deal_contact", "deal", "contact", "company", "session", "account", "verification", "rate_limit"].map(table => env.DB.prepare(`DELETE FROM ${table}`)),
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
import type { AppDatabase } from "@/lib/db/database";
import { LeadService } from "@/lib/services/leads/lead-service";
import { LeadSettingsService } from "@/lib/services/leads/lead-settings-service";
import { leadCreateInputSchema, leadListInputSchema, leadListOutputSchema, leadDetailOutputSchema } from "@/lib/services/leads/lead-contract";
import { fieldCreateInputSchema } from "@/lib/services/custom-fields/field-contracts";
import { normalizeLeadPhone } from "@/lib/services/leads/lead-normalization";
async function setup() {
  const actor = await session(`lead-${crypto.randomUUID()}@example.com`);
  await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();
  const services = root(), context = await requireRequestContext(new Headers({ cookie: actor.cookie }), services);
  return { actor, services, context, leads: new LeadService(services.db), settings: new LeadSettingsService(services.db) };
}
function interceptBatch(db: AppDatabase, before: () => Promise<unknown>): AppDatabase {
  return new Proxy(db, { get(target, property) { if (property === "batch") return async (statements: Parameters<AppDatabase["batch"]>[0]) => { await before(); return target.batch(statements); }; const value = Reflect.get(target, property); return typeof value === "function" ? value.bind(target) : value; } });
}
describe.sequential("lead records and choices", () => {
  beforeEach(clearState);
  it("creates shared leads with collaborators, filters and revision-protected corrections", async () => {
    const { leads, context, actor } = await setup();
    const row = await leads.create(context, leadCreateInputSchema.parse({ firstName: "Lead", email: "FIRST@example.com", phone: "+84 (90) 123-456", collaboratorMembershipIds: [actor.id, actor.id], ownerMembershipId: actor.id }));
    const detail = leadDetailOutputSchema.parse(await leads.byId(context, row.id));
    expect(detail).toMatchObject({ sourceId: "manual", statusId: "new", email: "first@example.com", revision: 0, collaboratorMembershipIds: [actor.id], creatorUserId: actor.id });
    const listed = leadListOutputSchema.parse(await leads.list(context, leadListInputSchema.parse({ collaborator: [actor.id], source: ["manual"], status: ["new"] })));
    expect(listed.total).toBe(1); expect(listed.facets.collaborator).toEqual([expect.objectContaining({ value: actor.id, count: 1 })]);
    await leads.update(context, row.id, { expectedRevision: 0, firstName: "Corrected", collaboratorMembershipIds: [] });
    await expect(leads.update(context, row.id, { expectedRevision: 0, firstName: "Stale" })).rejects.toMatchObject({ status: 409 });
    expect(await leads.byId(context, row.id)).toMatchObject({ firstName: "Corrected", revision: 1, collaboratorMembershipIds: [] });
    await leads.archive(context, row.id); expect((await leads.list(context, leadListInputSchema.parse({}))).total).toBe(0);
    await leads.archive(context, row.id, true); expect((await leads.list(context, leadListInputSchema.parse({}))).total).toBe(1);
  });
  it("suggests exact normalized duplicates without merging or country inference", async () => {
    const { leads, context, services } = await setup();
    const first = await leads.create(context, { firstName: "First", email: "same@example.com", phone: "+84 (90) 123-456" });
    await leads.create(context, { firstName: "Second", email: "same@example.com", phone: "090123456" });
    await services.contacts.create(context, { firstName: "Contact", email: "same@example.com", phone: "+84 90 123456" });
    const result = await leads.duplicates(context, { email: " SAME@EXAMPLE.COM ", phone: "+84-90-123456" });
    expect(result.leads).toHaveLength(2); expect(result.contacts).toHaveLength(1);
    expect(result.leads.find(row => row.id === first.id)?.reasons).toEqual(["email", "phone"]);
    expect(result.leads.find(row => row.id !== first.id)?.reasons).toEqual(["email"]);
    expect((await leads.duplicates(context, { phone: "+8490123456", excludeLeadId: first.id })).leads).toEqual([]);
    expect(await leads.duplicates(context, { email: " ", phone: " " })).toEqual({ leads: [], contacts: [] });
    expect(normalizeLeadPhone("+84 90 ext 123")).toBeNull();
    expect((await leads.list(context, leadListInputSchema.parse({}))).total).toBe(2);
  });
  it("manages retained source/status catalogs and rejects protected markers and missing reasons", async () => {
    const { leads, settings, context } = await setup();
    let catalog = await settings.get(context); expect(catalog.statuses.some(row => row.id === "nurturing")).toBe(true);
    catalog = await settings.mutate(context, { action: "create", kind: "status", label: "Rejected", meaning: "rejected", requiresReason: true, revision: catalog.revision });
    const status = catalog.statuses.find(row => row.label === "Rejected")!;
    await expect(leads.create(context, { firstName: "Missing", statusId: status.id })).rejects.toMatchObject({ status: 400 });
    const row = await leads.create(context, { firstName: "Retained", statusId: status.id, rejectionReason: "No budget" });
    catalog = await settings.mutate(context, { action: "archive", kind: "status", id: status.id, revision: catalog.revision });
    await leads.update(context, row.id, { expectedRevision: 0, firstName: "Historical" });
    await expect(leads.create(context, { firstName: "Inactive", statusId: status.id, rejectionReason: "No budget" })).rejects.toMatchObject({ status: 409 });
    await expect(leads.create(context, { firstName: "Manual conversion", statusId: "converted" })).rejects.toMatchObject({ status: 409 });
    await expect(settings.mutate(context, { action: "archive", kind: "status", id: "converted", revision: catalog.revision })).rejects.toMatchObject({ status: 400 });
    catalog = await settings.mutate(context, { action: "restore", kind: "status", id: status.id, revision: catalog.revision });
    catalog = await settings.mutate(context, { action: "reorder", kind: "status", id: status.id, beforeId: "new", revision: catalog.revision });
    expect(catalog.statuses[0]?.id).toBe(status.id);
    await expect(settings.mutate(context, { action: "relabel", kind: "status", id: status.id, label: "Stale", revision: catalog.revision - 1 })).rejects.toMatchObject({ status: 409 });
  });
  it("rolls back base and custom values on stale writes and final catalog races", async () => {
    const { leads, settings, context, services } = await setup();
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "lead", type: "text", label: "Lead payload", required: true }));
    await expect(leads.create(context, { firstName: "Missing" })).rejects.toMatchObject({ status: 400 });
    const row = await leads.create(context, { firstName: "Original", customFields: { [field.key]: "Original value" } });
    const before = await env.DB.prepare("SELECT * FROM lead WHERE id=?").bind(row.id).first();
    const beforeFields = (await env.DB.prepare("SELECT * FROM custom_field_value WHERE lead_id=?").bind(row.id).all()).results;
    let catalog = await settings.get(context); catalog = await settings.mutate(context, { action: "create", kind: "source", label: "Race source", revision: catalog.revision });
    const source = catalog.sources.find(row => row.label === "Race source")!;
    const raced = new LeadService(interceptBatch(services.db, () => env.DB.prepare("UPDATE lead_source SET archived_at=1 WHERE id=?").bind(source.id).run()));
    await expect(raced.update(context, row.id, { expectedRevision: 0, firstName: "Partial", sourceId: source.id, customFields: { [field.key]: "Partial value" } })).rejects.toMatchObject({ status: 409 });
    expect(await env.DB.prepare("SELECT * FROM lead WHERE id=?").bind(row.id).first()).toEqual(before);
    expect((await env.DB.prepare("SELECT * FROM custom_field_value WHERE lead_id=?").bind(row.id).all()).results).toEqual(beforeFields);
    const stale = new LeadService(interceptBatch(services.db, () => env.DB.prepare("UPDATE lead SET revision=revision+1 WHERE id=?").bind(row.id).run()));
    await expect(stale.update(context, row.id, { expectedRevision: 0, firstName: "Partial", customFields: { [field.key]: "Partial value" } })).rejects.toMatchObject({ status: 409 });
    expect((await leads.byId(context, row.id)).firstName).toBe("Original");
    expect((await env.DB.prepare("SELECT * FROM custom_field_value WHERE lead_id=?").bind(row.id).all()).results).toEqual(beforeFields);
  });
  it("rechecks grants, module and collaborator membership at the final write", async () => {
    const { leads, context, services, actor, settings } = await setup();
    const row = await leads.create(context, { firstName: "Read remains" });
    const disabled = new LeadService(interceptBatch(services.db, () => env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='lead'").run()));
    await expect(disabled.update(context, row.id, { expectedRevision: 0, firstName: "Forbidden" })).rejects.toMatchObject({ status: 403 });
    expect((await leads.byId(context, row.id)).firstName).toBe("Read remains");
    await env.DB.prepare("UPDATE module_setting SET enabled=1 WHERE entity='lead'").run();
    const member = await session(`collaborator-${crypto.randomUUID()}@example.com`);
    const revoked = new LeadService(interceptBatch(services.db, () => env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(member.id).run()));
    await expect(revoked.update(context, row.id, { expectedRevision: 0, collaboratorMembershipIds: [member.id] })).rejects.toMatchObject({ status: 409 });
    expect((await leads.byId(context, row.id)).collaboratorMembershipIds).toEqual([]);
    await env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(actor.id).run();
    await expect(settings.mutate(context, { action: "create", kind: "source", label: "Denied", revision: (await settings.get(context)).revision })).rejects.toMatchObject({ status: 403 });
    await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(actor.id).run();
    await expect(leads.duplicates(context, { email: "same@example.com" })).rejects.toMatchObject({ status: 403 });
  });
  it("uses atomic catalog revisions for simultaneous edits and rechecks owner authorization", async () => {
    const { settings, context, services, actor } = await setup();
    const initial = await settings.get(context);
    const results = await Promise.allSettled([
      settings.mutate(context, { action: "relabel", kind: "source", id: "manual", label: "First", revision: initial.revision }),
      settings.mutate(context, { action: "relabel", kind: "source", id: "manual", label: "Second", revision: initial.revision }),
    ]);
    expect(results.filter(row => row.status === "fulfilled")).toHaveLength(1);
    expect(results.find(row => row.status === "rejected")).toMatchObject({ reason: { status: 409 } });
    const before = await settings.get(context);
    let batch = 0;
    const raced = new LeadSettingsService(interceptBatch(services.db, async () => { if (++batch === 2) await env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(actor.id).run(); }));
    await expect(raced.mutate(context, { action: "create", kind: "source", label: "Forbidden", revision: before.revision })).rejects.toMatchObject({ status: 403 });
    expect((await settings.get(context)).sources).toEqual(before.sources);
  });
  it("rolls back a create when field requirements change and preserves historical blank reasons", async () => {
    const { leads, settings, context, services, actor } = await setup();
    let catalog = await settings.get(context);
    catalog = await settings.mutate(context, { action: "create", kind: "status", label: "Historical rejection", meaning: "rejected", revision: catalog.revision });
    const status = catalog.statuses.find(row => row.label === "Historical rejection")!;
    const record = await leads.create(context, { firstName: "Historical", statusId: status.id });
    await settings.mutate(context, { action: "reason", kind: "status", id: status.id, requiresReason: true, revision: catalog.revision });
    await leads.update(context, record.id, { expectedRevision: 0, title: "Unrelated correction" });
    await expect(leads.update(context, record.id, { expectedRevision: 1, rejectionReason: " " })).rejects.toMatchObject({ status: 400 });
    const field = await services.fields.create(context, fieldCreateInputSchema.parse({ entity: "lead", type: "text", label: "Concurrent requirement" }));
    let batches = 0;
    const raced = new LeadService(interceptBatch(services.db, async () => { if (++batches === 2) await env.DB.prepare("UPDATE custom_field_definition SET required=1 WHERE id=?").bind(field.id).run(); }));
    await expect(raced.create(context, { firstName: "Partial create" })).rejects.toMatchObject({ status: 409 });
    expect((await env.DB.prepare("SELECT first_name FROM lead").all()).results).toEqual([{ first_name: "Historical" }]);
    const revoked = new LeadService(interceptBatch(services.db, () => env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(actor.id).run()));
    await expect(revoked.update(context, record.id, { expectedRevision: 1, title: "Forbidden" })).rejects.toMatchObject({ status: 403 });
  });

});
