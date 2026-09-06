import { requireRequestContext } from "@/lib/http/request-context";
import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { DealRepository } from "@/lib/services/deals/deal-repository";
import { company as companyTable } from "@/lib/db/schema";
import { inJsonArray } from "@/lib/db/sql-filters";
import { createActivitiesGetHandler, createActivitiesPostHandler } from "../../src/app/api/crm/activities/route";
import { createActivityPatchHandler } from "../../src/app/api/crm/activities/[activityId]/route";
import { createOwnershipPatchHandler } from "../../src/app/api/crm/ownership/route";
import { createCompaniesGetHandler, createCompaniesPatchHandler, createCompaniesPostHandler } from "../../src/app/api/crm/companies/route";
import { createContactsPostHandler } from "../../src/app/api/crm/contacts/route";
import { createDealsPostHandler } from "../../src/app/api/crm/deals/route";
import { createDealPatchHandler } from "../../src/app/api/crm/deals/[dealId]/route";

class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) { this.verificationMessages.push(message); }
  async sendPasswordReset() {}
}
const bindings = env as RuntimeEnv;
let requestIndex = 50;
const root = () => createCompositionRoot(bindings, new RecordingEmailAdapter());
function request(path: string, cookie?: string, method = "GET", body?: unknown) {
  const headers = new Headers({ "cf-ray": "activities-request" });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) {
    headers.set("content-type", "application/json");
    headers.set("origin", "https://auth.test");
    headers.set("sec-fetch-site", "same-origin");
  }
  return new Request(`https://auth.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}
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
    ...["activity_visibility", "activity", "custom_field_value", "saved_view", "deal_contact", "deal", "contact", "company", "session", "account", "verification", "rate_limit"].map(table => env.DB.prepare(`DELETE FROM ${table}`)),
    env.DB.prepare("INSERT OR IGNORE INTO user (id, name, email, email_verified, created_at, updated_at) VALUES ('sentinel-owner', 'Sentinel Owner', 'sentinel-owner@example.com', 1, 0, 0)"),
    env.DB.prepare("INSERT OR IGNORE INTO singleton_membership (user_id, role, status, created_at, updated_at) VALUES ('sentinel-owner', 'owner', 'active', 0, 0)"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'"),
    env.DB.prepare("DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner' WHERE id = ?").bind(SINGLETON_WORKSPACE_ID),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
  ]);
}
async function records(cookie: string, owner: string) {
  const composition = root();
  const company = await successful(await createCompaniesPostHandler(composition)(request("/api/crm/companies", cookie, "POST", { name: "Acme" })));
  const contact = await successful(await createContactsPostHandler(composition)(request("/api/crm/contacts", cookie, "POST", { firstName: "Ada", companyId: company.id })));
  const deal = await successful(await createDealsPostHandler(composition)(request("/api/crm/deals", cookie, "POST", { name: "Expansion", companyId: company.id, ownerMembershipId: owner })));
  return { company, contact, deal };
}
const create = (cookie: string, input: unknown) => createActivitiesPostHandler(root())(request("/api/crm/activities", cookie, "POST", input));
const timeline = async (cookie: string, entity: string, recordId: string, extra = "") => successful(await createActivitiesGetHandler(root())(request(`/api/crm/activities?entity=${entity}&recordId=${recordId}${extra}`, cookie)));
const complete = (cookie: string, id: string, completed: boolean) => createActivityPatchHandler(root(), id)(request(`/api/crm/activities/${id}`, cookie, "PATCH", { completed, ...completed ? {} : { reason: "More work is required" } }));

describe.sequential("activities and ownership API", () => {
  beforeEach(clearState);

  it("handles 100 selected records and combined 100-value filters within D1 parameter limits", async () => {
    const actor = await session("bulk-limit@example.com");
    const target = await session("bulk-target@example.com");
    const punctuation = "Media, O'Reilly \"Publishing\"'); --";
    const selected = Array.from({ length: 100 }, (_, index) => ({ id: crypto.randomUUID(), industry: index === 0 ? punctuation : `Industry ${index}` }));
    const untouchedId = crypto.randomUUID();
    await env.DB.batch([
      ...selected.map((row, index) => env.DB.prepare("INSERT INTO company (id, name, industry, owner_membership_id, created_at, updated_at) VALUES (?, ?, ?, ?, 0, 0)").bind(row.id, `Batch company ${index}`, row.industry, actor.id)),
      env.DB.prepare("INSERT INTO company (id, name, industry, owner_membership_id, created_at, updated_at) VALUES (?, 'Untouched', 'Outside', ?, 0, 0)").bind(untouchedId, actor.id),
    ]);
    const ids = selected.map(row => row.id);
    const mutate = (action: string) => createCompaniesPatchHandler(root())(request("/api/crm/companies", actor.cookie, "PATCH", { action, ids }));
    expect(await successful(await mutate("bulk-archive"))).toEqual({ requested: 100, succeeded: 100, failed: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS count FROM company WHERE archived_at IS NOT NULL").first()).toEqual({ count: 100 });
    expect(await env.DB.prepare("SELECT archived_at FROM company WHERE id = ?").bind(untouchedId).first()).toEqual({ archived_at: null });
    expect(await successful(await mutate("bulk-restore"))).toEqual({ requested: 100, succeeded: 100, failed: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS count FROM company WHERE archived_at IS NOT NULL").first()).toEqual({ count: 0 });
    const ownership = await createOwnershipPatchHandler(root())(request("/api/crm/ownership", actor.cookie, "PATCH", { entity: "company", ids, ownerMembershipId: target.id }));
    expect(await successful(ownership)).toEqual({ requested: 100, succeeded: 100, failed: 0 });
    expect(await env.DB.prepare("SELECT count(*) AS count FROM company WHERE owner_membership_id = ?").bind(target.id).first()).toEqual({ count: 100 });
    expect(await env.DB.prepare("SELECT owner_membership_id FROM company WHERE id = ?").bind(untouchedId).first()).toEqual({ owner_membership_id: actor.id });
    const filters = new URLSearchParams({ q: "Batch", pageSize: "100" });
    for (const row of selected) filters.append("industry", row.industry);
    for (let index = 0; index < 100; index += 1) filters.append("owner", index === 0 ? target.id : `unmatched-member-${index}`);
    const filtered = await successful(await createCompaniesGetHandler(root())(request(`/api/crm/companies?${filters}`, actor.cookie)));
    expect(filtered.total).toBe(100);
    expect(filtered.rows.map((row: any) => row.id).sort()).toEqual(ids.slice().sort());
    const exact = await successful(await createCompaniesGetHandler(root())(request(`/api/crm/companies?${new URLSearchParams({ industry: punctuation })}`, actor.cookie)));
    expect(exact.rows.map((row: any) => row.id)).toEqual([selected[0].id]);
    const emptySelection = await root().db.select({ id: companyTable.id }).from(companyTable).where(inJsonArray(companyTable.id, []));
    expect(emptySelection).toEqual([]);
    expect(await env.DB.prepare("SELECT count(*) AS count FROM company").first()).toEqual({ count: 101 });
  });

  it("guards timeline, creation, completion and ownership with active sessions", async () => {
    const actor = await session("guards@example.com");
    const { company } = await records(actor.cookie, "sentinel-owner");
    const handlers = (cookie?: string) => [
      createActivitiesGetHandler(root())(request(`/api/crm/activities?entity=company&recordId=${company.id}`, cookie)),
      createActivitiesPostHandler(root())(request("/api/crm/activities", cookie, "POST", { type: "note", companyId: company.id })),
      createActivityPatchHandler(root(), crypto.randomUUID())(request("/api/crm/activities/missing", cookie, "PATCH", { completed: true })),
      createOwnershipPatchHandler(root())(request("/api/crm/ownership", cookie, "PATCH", { entity: "company", ids: [company.id], ownerMembershipId: actor.id })),
    ];
    for (const response of await Promise.all(handlers())) expect(response.status).toBe(401);
    await env.DB.prepare("UPDATE singleton_membership SET status = 'revoked' WHERE user_id = ?").bind(actor.id).run();
    for (const response of await Promise.all(handlers(actor.cookie))) expect(response.status).toBe(403);
  });

  it("infers related company anchors, stamps affected records, and rejects incompatible anchors", async () => {
    const actor = await session("anchors@example.com");
    const { company, contact, deal } = await records(actor.cookie, actor.id);
    const other = await records(actor.cookie, actor.id);
    const entry = await successful(await create(actor.cookie, { type: "meeting", contactId: contact.id, dealId: deal.id, subject: "Discovery", content: "Discuss requirements" }));
    expect(entry).toMatchObject({ companyId: company.id, contactId: contact.id, dealId: deal.id, author: { id: actor.id } });
    for (const [entity, id] of [["company", company.id], ["contact", contact.id], ["deal", deal.id]]) {
      expect((await timeline(actor.cookie, entity, id)).entries.map((row: any) => row.id)).toContain(entry.id);
      const stamp = await env.DB.prepare(`SELECT last_activity_at FROM ${entity} WHERE id = ?`).bind(id).first<{ last_activity_at: number }>();
      expect(stamp?.last_activity_at).toBeGreaterThan(0);
    }
    const before = await env.DB.prepare("SELECT count(*) AS count FROM activity").first<{ count: number }>();
    expect((await create(actor.cookie, { type: "note", companyId: other.company.id, contactId: contact.id })).status).toBe(409);
    expect((await create(actor.cookie, { type: "note", contactId: other.contact.id, dealId: deal.id })).status).toBe(409);
    expect((await create(actor.cookie, { type: "note", companyId: crypto.randomUUID() })).status).toBe(404);
    expect(await env.DB.prepare("SELECT count(*) AS count FROM activity").first()).toEqual(before);
    const contactOnly = await successful(await create(actor.cookie, { type: "call", contactId: contact.id }));
    expect(contactOnly.companyId).toBe(company.id);
    const dealOnly = await successful(await create(actor.cookie, { type: "note", dealId: deal.id }));
    expect(dealOnly.companyId).toBe(company.id);
  });

  it("rolls back the activity and all stamps if a record stamp write fails", async () => {
    const actor = await session("atomic@example.com");
    const { company, contact } = await records(actor.cookie, actor.id);
    await env.DB.exec("CREATE TRIGGER reject_contact_stamp BEFORE UPDATE OF last_activity_at ON contact BEGIN SELECT RAISE(ABORT, 'forced stamp failure'); END");
    try {
      expect((await create(actor.cookie, { type: "note", contactId: contact.id })).status).toBe(500);
      expect(await env.DB.prepare("SELECT count(*) AS count FROM activity").first()).toEqual({ count: 0 });
      expect(await env.DB.prepare("SELECT last_activity_at FROM company WHERE id = ?").bind(company.id).first()).toEqual({ last_activity_at: null });
      expect(await env.DB.prepare("SELECT last_activity_at FROM contact WHERE id = ?").bind(contact.id).first()).toEqual({ last_activity_at: null });
    } finally { await env.DB.exec("DROP TRIGGER reject_contact_stamp"); }
  });

  it("paginates timestamp ties without skips or duplicates", async () => {
    const actor = await session("cursor@example.com");
    const { company } = await records(actor.cookie, actor.id);
    const entries = ["First", "Second", "Third"].map(subject => ({ id: crypto.randomUUID(), subject }));
    await env.DB.batch(entries.map(entry => env.DB.prepare("INSERT INTO activity (id, type, subject, company_id, author_user_id, occurred_at, created_at, updated_at) VALUES (?, 'note', ?, ?, ?, 1788537600000, 1788537600000, 1788537600000)").bind(entry.id, entry.subject, company.id, actor.id)));
    const first = await timeline(actor.cookie, "company", company.id, "&limit=2");
    expect(first.entries).toHaveLength(2);
    expect(first.nextCursor).toBeTypeOf("string");
    const second = await timeline(actor.cookie, "company", company.id, `&limit=2&cursor=${encodeURIComponent(first.nextCursor)}`);
    expect(second.entries).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    const received = [...first.entries, ...second.entries].map(row => row.id);
    expect(new Set(received).size).toBe(3);
    expect(received.slice().sort()).toEqual(entries.map(row => row.id).sort());
    expect((await timeline(actor.cookie, "company", company.id, "&limit=2")).entries.map((row: any) => row.id)).toEqual(first.entries.map((row: any) => row.id));
  });

  it("completes and reopens tasks and excludes notes from task completion", async () => {
    const actor = await session("tasks@example.com");
    const { company } = await records(actor.cookie, actor.id);
    const task = await successful(await create(actor.cookie, { type: "task", companyId: company.id, subject: "Follow up", dueAt: "2099-01-01T00:00:00.000Z" }));
    const note = await successful(await create(actor.cookie, { type: "note", companyId: company.id, content: "Context" }));
    expect((await timeline(actor.cookie, "company", company.id, "&filter=upcoming")).entries.map((row: any) => row.id)).toEqual([task.id]);
    const done = await successful(await complete(actor.cookie, task.id, true));
    expect(done.completedAt).not.toBeNull();
    expect((await timeline(actor.cookie, "company", company.id, "&filter=done")).entries.map((row: any) => row.id)).toEqual([task.id]);
    expect((await timeline(actor.cookie, "company", company.id, "&filter=history")).entries.map((row: any) => row.id).sort()).toEqual([task.id, note.id].sort());
    expect((await timeline(actor.cookie, "company", company.id, "&filter=upcoming")).entries).toEqual([]);
    expect((await successful(await complete(actor.cookie, task.id, false))).completedAt).toBeNull();
    expect((await timeline(actor.cookie, "company", company.id, "&filter=done")).entries).toEqual([]);
    expect((await timeline(actor.cookie, "company", company.id, "&filter=history")).entries.map((row: any) => row.id)).toEqual([note.id]);
    expect((await complete(actor.cookie, note.id, true)).status).toBe(400);
  });

  it("records real deal stage changes once and prevents client mutation of stage history", async () => {
    const actor = await session("stages@example.com");
    const { company, deal } = await records(actor.cookie, actor.id);
    const patch = (stageId: string) => createDealPatchHandler(root(), Promise.resolve({ dealId: deal.id }))(request(`/api/crm/deals/${deal.id}`, actor.cookie, "PATCH", { action: "update", data: { stageId } }));
    await successful(await patch("demo-booked"));
    expect((await timeline(actor.cookie, "deal", deal.id)).entries).toEqual([]);
    await successful(await patch("qualified-to-buy"));
    await successful(await patch("qualified-to-buy"));
    const entries = (await timeline(actor.cookie, "deal", deal.id)).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "stage_change", author: { id: actor.id }, metadata: { fromStageId: "demo-booked", toStageId: "qualified-to-buy" } });
    expect((await timeline(actor.cookie, "company", company.id)).entries.map((row: any) => row.id)).toContain(entries[0].id);
    expect((await complete(actor.cookie, entries[0].id, true)).status).toBe(400);
    expect((await create(actor.cookie, { type: "stage_change", dealId: deal.id, metadata: entries[0].metadata })).status).toBe(400);
    await expect(env.DB.prepare("UPDATE activity SET content = 'rewritten' WHERE id = ?").bind(entries[0].id).run()).rejects.toThrow("immutable");
    expect((await timeline(actor.cookie, "deal", deal.id)).entries).toEqual(entries);
    const stampBefore = await env.DB.prepare("SELECT last_activity_at FROM company WHERE id = ?").bind(company.id).first();
    await env.DB.exec("CREATE TRIGGER reject_stage_history BEFORE INSERT ON activity WHEN NEW.type = 'stage_change' BEGIN SELECT RAISE(ABORT, 'forced history failure'); END");
    try {
      expect((await patch("closed-won")).status).toBe(500);
      expect(await env.DB.prepare("SELECT stage_id FROM deal WHERE id = ?").bind(deal.id).first()).toEqual({ stage_id: "qualified-to-buy" });
      expect(await env.DB.prepare("SELECT last_activity_at FROM company WHERE id = ?").bind(company.id).first()).toEqual(stampBefore);
      expect((await timeline(actor.cookie, "deal", deal.id)).entries).toEqual(entries);
    } finally { await env.DB.exec("DROP TRIGGER reject_stage_history"); }
  });

  it("rejects stale stage writes without changing records or creating history", async () => {
    const actor = await session("stale-stage@example.com");
    const { company, deal } = await records(actor.cookie, actor.id);
    await successful(await createDealPatchHandler(root(), Promise.resolve({ dealId: deal.id }))(request(`/api/crm/deals/${deal.id}`, actor.cookie, "PATCH", { action: "update", data: { stageId: "qualified-to-buy" } })));
    const snapshot = async () => ({
      deal: await env.DB.prepare("SELECT name, stage_id, last_activity_at, updated_at FROM deal WHERE id = ?").bind(deal.id).first(),
      company: await env.DB.prepare("SELECT last_activity_at, updated_at FROM company WHERE id = ?").bind(company.id).first(),
      history: await env.DB.prepare("SELECT count(*) AS count FROM activity WHERE deal_id = ?").bind(deal.id).first(),
    });
    const before = await snapshot();
    const result = await new DealRepository(root().db).updateWithHistory(deal.id, { name: "must-not-write", stageId: "closed-won", updatedAt: new Date("2099-01-01T00:00:00.000Z") }, "demo-booked", actor.id, await requireRequestContext(new Headers({ cookie: actor.cookie }), root()));
    expect(result).toBeUndefined();
    expect(await snapshot()).toEqual(before);
  });

  it("anchors a combined company and stage change to the newly assigned company", async () => {
    const actor = await session("move-stage@example.com");
    const original = await records(actor.cookie, actor.id);
    const destination = await records(actor.cookie, actor.id);
    await successful(await createDealPatchHandler(root(), Promise.resolve({ dealId: original.deal.id }))(request(`/api/crm/deals/${original.deal.id}`, actor.cookie, "PATCH", { action: "update", data: { companyId: destination.company.id, stageId: "qualified-to-buy" } })));
    const entries = (await timeline(actor.cookie, "deal", original.deal.id)).entries;
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ type: "stage_change", companyId: destination.company.id, dealId: original.deal.id, metadata: { fromStageId: "demo-booked", toStageId: "qualified-to-buy" } });
    expect((await timeline(actor.cookie, "company", destination.company.id)).entries.map((row: any) => row.id)).toContain(entries[0].id);
    expect((await timeline(actor.cookie, "company", original.company.id)).entries).toEqual([]);
    expect(await env.DB.prepare("SELECT last_activity_at FROM company WHERE id = ?").bind(original.company.id).first()).toEqual({ last_activity_at: null });
    const destinationStamp = await env.DB.prepare("SELECT last_activity_at FROM company WHERE id = ?").bind(destination.company.id).first<{ last_activity_at: number }>();
    expect(destinationStamp?.last_activity_at).toBeGreaterThan(0);
  });

  it("changes only selected ownership, permits nullable company/contact owners and rejects invalid deal or revoked owners", async () => {
    const actor = await session("ownership@example.com");
    const target = await session("target@example.com");
    const selected = await records(actor.cookie, actor.id);
    const untouched = await records(actor.cookie, actor.id);
    const assign = (entity: string, ids: string[], ownerMembershipId: string | null) => createOwnershipPatchHandler(root())(request("/api/crm/ownership", actor.cookie, "PATCH", { entity, ids, ownerMembershipId }));
    for (const entity of ["company", "contact", "deal"] as const) {
      expect(await successful(await assign(entity, [selected[entity].id, selected[entity].id], target.id))).toEqual({ requested: 1, succeeded: 1, failed: 0 });
      expect(await env.DB.prepare(`SELECT owner_membership_id FROM ${entity} WHERE id = ?`).bind(selected[entity].id).first()).toEqual({ owner_membership_id: target.id });
      expect(await env.DB.prepare(`SELECT owner_membership_id FROM ${entity} WHERE id = ?`).bind(untouched[entity].id).first()).toEqual({ owner_membership_id: entity === "deal" ? actor.id : null });
    }
    for (const entity of ["company", "contact"] as const) {
      await successful(await assign(entity, [selected[entity].id], null));
      expect(await env.DB.prepare(`SELECT owner_membership_id FROM ${entity} WHERE id = ?`).bind(selected[entity].id).first()).toEqual({ owner_membership_id: null });
    }
    expect((await assign("deal", [selected.deal.id], null)).status).toBe(400);
    await successful(await assign("deal", [selected.deal.id], actor.id));
    await env.DB.prepare("UPDATE singleton_membership SET status = 'revoked' WHERE user_id = ?").bind(target.id).run();
    expect((await assign("company", [selected.company.id], target.id)).status).toBe(400);
    expect(await env.DB.prepare("SELECT owner_membership_id FROM company WHERE id = ?").bind(selected.company.id).first()).toEqual({ owner_membership_id: null });
  });
});
