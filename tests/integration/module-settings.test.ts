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

import { applyD1Migrations } from "cloudflare:test";
import { createModulesGetHandler, createModulesPatchHandler } from "../../src/app/api/crm/modules/route";
import { ModuleService } from "@/lib/services/modules/module-service";
import { requireRequestContext } from "@/lib/http/request-context";
import type { AppDatabase } from "@/lib/db/database";
const get = (cookie:string) => createModulesGetHandler(root())(request("/api/crm/modules",cookie));
const update = (cookie:string,input:unknown) => createModulesPatchHandler(root())(request("/api/crm/modules",cookie,"PATCH",input));
async function owner() { const actor=await session(`module-${crypto.randomUUID()}@example.com`);await env.DB.prepare("UPDATE singleton_membership SET role='owner' WHERE user_id=?").bind(actor.id).run();return actor; }
describe.sequential("module settings",()=>{
  beforeEach(async()=>{await clearState();await env.DB.prepare("UPDATE module_setting SET enabled=1,revision=0,updated_at=0").run();});
  it("defaults enabled modules and preserves historical records during migration",async()=>{
    const db=env.UPGRADE_DB;await applyD1Migrations(db,env.TEST_MIGRATIONS.slice(0,12));
    await db.prepare("INSERT INTO company (id,name,created_at,updated_at) VALUES ('module-upgrade','Historical company',1700000000000,1700000000001)").run();
    const before=await db.prepare("SELECT * FROM company WHERE id='module-upgrade'").first();
    await applyD1Migrations(db,env.TEST_MIGRATIONS.slice(12));
    expect(await db.prepare("SELECT * FROM company WHERE id='module-upgrade'").first()).toEqual(before);
    expect((await db.prepare("SELECT entity,enabled,revision FROM module_setting ORDER BY entity").all()).results).toEqual(["company","contact","deal","lead"].map(entity=>({entity,enabled:1,revision:0})));
    expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  });
  it("allows active reads and owner revisions while denying members and stale updates",async()=>{
    const actor=await owner(),member=await session(`module-member-${crypto.randomUUID()}@example.com`);
    const initial=await successful(await get(actor.cookie));expect(initial.canManage).toBe(true);expect(initial.modules).toEqual(["company","contact","deal","lead"].map(entity=>({entity,enabled:true,revision:0})));
    expect((await successful(await get(member.cookie))).canManage).toBe(false);
    expect((await update(member.cookie,{entity:"company",enabled:false,revision:0})).status).toBe(403);
    const changed=await successful(await update(actor.cookie,{entity:"company",enabled:false,revision:0}));expect(changed.modules[0]).toEqual({entity:"company",enabled:false,revision:1});
    expect((await update(actor.cookie,{entity:"company",enabled:true,revision:0})).status).toBe(409);
    expect((await successful(await update(actor.cookie,{entity:"company",enabled:true,revision:1}))).modules[0]).toEqual({entity:"company",enabled:true,revision:2});
    expect((await update(actor.cookie,{entity:"activity",enabled:false,revision:0})).status).toBe(400);
    expect((await get("")).status).toBe(401);
    const competing=await Promise.all([update(actor.cookie,{entity:"contact",enabled:false,revision:0}),update(actor.cookie,{entity:"contact",enabled:true,revision:0})]);
    expect(competing.map(response=>response.status).sort()).toEqual([200,409]);
    expect((await env.DB.prepare("SELECT revision FROM module_setting WHERE entity='contact'").first<{revision:number}>())?.revision).toBe(1);
  });
  it("checks current owner role within the mutation batch after preliminary authorization",async()=>{
    const actor=await owner(),composition=root();const context=await requireRequestContext(new Headers({cookie:actor.cookie}),composition);
    const db=new Proxy(composition.db,{get(target,prop){if(prop==="batch")return async(statements:Parameters<AppDatabase["batch"]>[0])=>{await env.DB.prepare("UPDATE singleton_membership SET role='member' WHERE user_id=?").bind(actor.id).run();return target.batch(statements);};const value=Reflect.get(target,prop);return typeof value==="function"?value.bind(target):value;}});
    await expect(new ModuleService(db).update(context,{entity:"deal",enabled:false,revision:0})).rejects.toMatchObject({status:403});
    expect(await env.DB.prepare("SELECT enabled,revision FROM module_setting WHERE entity='deal'").first()).toEqual({enabled:1,revision:0});
    expect((await composition.modules.get(context)).canManage).toBe(false);
    await env.DB.prepare("UPDATE singleton_membership SET status='revoked' WHERE user_id=?").bind(actor.id).run();
    await expect(composition.modules.get(context)).rejects.toMatchObject({status:403});
  });
  it("enforces immutable entity keys and valid persisted state",async()=>{
    await expect(env.DB.prepare("UPDATE module_setting SET enabled=2 WHERE entity='company'").run()).rejects.toThrow();
    await expect(env.DB.prepare("UPDATE module_setting SET revision=-1 WHERE entity='company'").run()).rejects.toThrow();
    await expect(env.DB.prepare("UPDATE module_setting SET entity='other' WHERE entity='company'").run()).rejects.toThrow();
    await expect(env.DB.prepare("DELETE FROM module_setting WHERE entity='company'").run()).rejects.toThrow();
  });
});
