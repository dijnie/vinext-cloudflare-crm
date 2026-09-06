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

import { createLayoutsGetHandler, createLayoutsPatchHandler } from "../../src/app/api/crm/layouts/route";
import { LayoutService } from "@/lib/services/layouts/layout-service";
import { layoutIdentity, type LayoutSettings } from "@/lib/services/layouts/layout-contracts";
import { DEFAULT_LAYOUT_KEYS } from "@/lib/services/layouts/layout-catalog";
import { requireRequestContext } from "@/lib/http/request-context";
import { fieldCreateInputSchema } from "@/lib/services/custom-fields/field-contracts";
import type { AppDatabase } from "@/lib/db/database";
const get = (cookie: string, entity = "company") => createLayoutsGetHandler(root())(request(`/api/crm/layouts?entity=${entity}`, cookie));
const update = (cookie: string, input: unknown) => createLayoutsPatchHandler(root())(request("/api/crm/layouts", cookie, "PATCH", input));
const entries = (settings: LayoutSettings) => settings.fields.map(({ kind, key, visible }) => ({ kind, key, visible }));
async function actor(owner = true) {
  const user = await session(`layout-${crypto.randomUUID()}@example.com`);
  if (owner) await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(user.id).run();
  return { ...user, context: await requireRequestContext(new Headers({ cookie: user.cookie }), root()) };
}
const define = (context: Awaited<ReturnType<typeof actor>>["context"], label: string, extra = {}) => root().fields.create(context, fieldCreateInputSchema.parse({ entity: "company", type: "text", label, ...extra }));
describe.sequential("owner record layouts", () => {
  beforeEach(async () => { await clearState(); await env.DB.prepare("UPDATE record_layout SET revision=0,fields_json='null',updated_at=0").run(); });
  it("keeps default surface catalogs and distinguishes custom keys from builtin names", async () => {
    const owner = await actor();
    const custom = await define(owner.context, "Name");
    expect(custom.key).toBe("name");
    const initial = await successful(await get(owner.cookie)) as LayoutSettings;
    expect(initial.configured).toBe(false);
    expect(initial.fields.filter(field => field.key === "name").map(field => field.kind)).toEqual(["builtin", "custom"]);
    expect(DEFAULT_LAYOUT_KEYS.company.create).toEqual(["name", "domain", "ownerMembershipId"]);
    expect(initial.fields.find(field => field.key === "createdAt")).toMatchObject({ readOnly: true, surfaces: ["detail"] });
    expect(initial.fields.find(field => field.key === "description")).toMatchObject({ surfaces: ["edit", "detail"] });
    const fields = entries(initial).reverse().map(field => field.kind === "custom" ? { ...field, visible: false } : field);
    const saved = await successful(await update(owner.cookie, { entity: "company", revision: initial.revision, fields })) as LayoutSettings;
    expect(saved.configured).toBe(true);
    expect(saved.fields.map(layoutIdentity)).toEqual(fields.map(layoutIdentity));
    expect(saved.fields.find(field => field.kind === "custom")).toMatchObject({ visible: false });
  });
  it("rejects member, stale, incomplete and immutable-field edits without persisting them", async () => {
    const owner = await actor(), member = await actor(false);
    const initial = await successful(await get(owner.cookie)) as LayoutSettings;
    expect((await successful(await get(member.cookie))).canManage).toBe(false);
    const body = { entity: "company", revision: initial.revision, fields: entries(initial) };
    expect((await update(member.cookie, body)).status).toBe(403);
    expect((await update(owner.cookie, { ...body, fields: body.fields.slice(1) })).status).toBe(400);
    expect((await update(owner.cookie, { ...body, fields: [...body.fields.slice(1), body.fields[1]] })).status).toBe(400);
    expect((await update(owner.cookie, { ...body, fields: body.fields.map(field => field.key === "name" ? { ...field, visible: false } : field) })).status).toBe(400);
    expect((await update(owner.cookie, { ...body, fields: body.fields.map(field => ({ ...field, required: false })) })).status).toBe(400);
    await successful(await update(owner.cookie, body));
    expect((await update(owner.cookie, body)).status).toBe(409);
    expect((await get("")).status).toBe(401);
  });
  it("retains inactive slots, appends new fields and makes subsequently required fields visible", async () => {
    const owner = await actor(), member = await actor(false);
    const a = await define(member.context, "First custom"), b = await define(member.context, "Retained custom"), c = await define(member.context, "Last custom");
    const initial = await successful(await get(owner.cookie)) as LayoutSettings;
    const fields = entries(initial).map(field => field.kind === "custom" && field.key === b.key ? { ...field, visible: false } : field);
    await successful(await update(owner.cookie, { entity: "company", revision: 0, fields }));
    const prior = await env.DB.prepare("SELECT fields_json FROM record_layout WHERE entity='company'").first<{ fields_json: string }>();
    await root().fields.archive(member.context, b.id);
    const archived = await successful(await get(owner.cookie)) as LayoutSettings;
    expect(archived.fields.some(field => field.kind === "custom" && field.key === b.key)).toBe(false);
    const reordered = entries(archived).reverse();
    await successful(await update(owner.cookie, { entity: "company", revision: archived.revision, fields: reordered }));
    await root().fields.restore(member.context, b.id);
    const restored = await successful(await get(owner.cookie)) as LayoutSettings;
    const oldIndex = JSON.parse(prior!.fields_json).findIndex((entry: any) => entry.kind === "custom" && entry.key === b.key);
    expect(restored.fields[oldIndex]).toMatchObject({ key: b.key, kind: "custom", visible: false });
    await root().fields.delete(member.context, b.id, b.key);
    const deleted = await successful(await get(owner.cookie)) as LayoutSettings;
    expect(deleted.fields.some(field => field.kind === "custom" && field.key === b.key)).toBe(false);
    await successful(await update(owner.cookie, { entity: "company", revision: deleted.revision, fields: entries(deleted) }));
    await root().fields.recover(member.context, b.id);
    expect((await successful(await get(owner.cookie))).fields[oldIndex]).toMatchObject({ key: b.key, kind: "custom", visible: false });
    await root().fields.update(member.context, b.id, { required: true });
    expect((await successful(await get(owner.cookie))).fields.find((field: any) => field.kind === "custom" && field.key === b.key)).toMatchObject({ required: true, visible: true });
    const newer = await define(member.context, "Newest custom", { showOnSheet: false });
    expect((await successful(await get(owner.cookie))).fields.at(-1)).toMatchObject({ key: newer.key, visible: false });
    expect((await root().fields.list(member.context, { entity: "company" })).map(field => field.id)).toEqual([a.id, b.id, c.id, newer.id]);
  });
  it("retains owner layout administration while modules are disabled", async () => {
    const owner = await actor();
    await env.DB.prepare("UPDATE module_setting SET enabled=0 WHERE entity='company'").run();
    const initial = await successful(await get(owner.cookie)) as LayoutSettings;
    const saved = await successful(await update(owner.cookie, { entity: "company", revision: initial.revision, fields: entries(initial).reverse() })) as LayoutSettings;
    expect(saved.revision).toBe(initial.revision + 1);
    expect(saved.fields.map(layoutIdentity)).toEqual(entries(initial).reverse().map(layoutIdentity));
  });
  it("rejects field configuration changes occurring inside the save window", async () => {
    const owner = await actor(), composition = root();
    const initial = await composition.layouts.get(owner.context, { entity: "company" });
    let calls = 0;
    const db = new Proxy(composition.db, { get(target, prop) {
      if (prop === "batch") return async (statements: Parameters<AppDatabase["batch"]>[0]) => {
        if (++calls === 2) await env.DB.prepare("UPDATE field_configuration_revision SET revision=revision+1 WHERE entity='company'").run();
        return target.batch(statements);
      };
      const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(new LayoutService(db).update(owner.context, { entity: "company", revision: initial.revision, fields: entries(initial) })).rejects.toMatchObject({ status: 409 });
    expect(await env.DB.prepare("SELECT revision,fields_json FROM record_layout WHERE entity='company'").first()).toEqual({ revision: 0, fields_json: "null" });
  });
  it("rechecks current owner rights in the mutation batch", async () => {
    const owner = await actor(), composition = root();
    const initial = await composition.layouts.get(owner.context, { entity: "company" });
    let calls = 0;
    const db = new Proxy(composition.db, { get(target, prop) {
      if (prop === "batch") return async (statements: Parameters<AppDatabase["batch"]>[0]) => {
        if (++calls === 2) await env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(owner.id).run();
        return target.batch(statements);
      };
      const value = Reflect.get(target, prop); return typeof value === "function" ? value.bind(target) : value;
    } });
    await expect(new LayoutService(db).update(owner.context, { entity: "company", revision: initial.revision, fields: entries(initial) })).rejects.toMatchObject({ status: 403 });
    expect(await env.DB.prepare("SELECT revision FROM record_layout WHERE entity='company'").first()).toEqual({ revision: 0 });
  });
});
