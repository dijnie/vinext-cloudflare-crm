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
import type { EntityType } from "@/lib/listing/list-state";
import { createSavedViewPatchHandler } from "../../src/app/api/crm/saved-views/[viewId]/route";
import { createSavedViewDefaultPutHandler } from "../../src/app/api/crm/saved-views/default/route";

class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) {
    this.verificationMessages.push(message);
  }
  async sendPasswordReset() {}
}

const bindings = env as RuntimeEnv;
const password = "correct horse battery staple";
let requestIndex = 180;

async function clearState() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM activity_visibility"),
    env.DB.prepare("DELETE FROM activity"),
    env.DB.prepare("DELETE FROM custom_field_value"),
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

const createView = (context: RequestContext, entity: EntityType = "company", shared = false) => root().views.create(context, { entity, name: crypto.randomUUID(), shared, state: { version: 1, query: "" } });
const apiRequest = (headers: Headers, body: unknown) => new Request("https://auth.test/api/crm/saved-views/default", { method: "PUT", headers, body: JSON.stringify(body) });

describe.sequential("personal default saved views", () => {
  beforeEach(clearState);

  it("isolates each person's defaults by entity and supports clearing only one selection", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const shared = await createView(owner.context, "company", true), contact = await createView(member.context, "contact");
    expect(await services.views.preferred(member.context, "company")).toBeNull();
    expect((await createSavedViewDefaultPutHandler(services)(apiRequest(member.headers, { entity: "company", viewId: shared.id }))).status).toBe(200);
    await services.views.setPreferred(member.context, { entity: "contact", viewId: contact.id });
    expect(await services.views.preferred(member.context, "company")).toMatchObject({ id: shared.id, isDefault: true, mine: false });
    expect(await services.views.preferred(owner.context, "company")).toBeNull();
    expect((await services.views.list(member.context, "company")).find(view => view.id === shared.id)?.isDefault).toBe(true);
    expect((await services.views.list(owner.context, "company")).find(view => view.id === shared.id)?.isDefault).toBe(false);
    const response = await createSavedViewDefaultPutHandler(services)(apiRequest(member.headers, { entity: "company", viewId: null }));
    expect(await response.json()).toEqual({ entity: "company", viewId: null });
    expect(await services.views.preferred(member.context, "company")).toBeNull();
    expect(await services.views.preferred(member.context, "contact")).toMatchObject({ id: contact.id });
  });

  it("lets restricted members select shared views without gaining edit rights", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const shared = await createView(owner.context, "company", true);
    const name = crypto.randomUUID();
    const settings = await services.access.mutate(owner.context, { action: "create-profile", name, grants: [] });
    await services.access.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: settings.profiles.find(p => p.name === name)!.id });
    await expect(services.views.setPreferred(member.context, { entity: "company", viewId: shared.id })).resolves.toEqual({ entity: "company", viewId: shared.id });
    await expect(services.views.update(member.context, shared.id, { name: "Forbidden" })).rejects.toMatchObject({ status: 403 });
    await expect(services.views.delete(member.context, shared.id)).rejects.toMatchObject({ status: 403 });
  });

  it("clears other users' defaults on unshare while preserving creator selection and cascades deletion", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const shared = await createView(owner.context, "company", true);
    for (const context of [owner.context, member.context]) await services.views.setPreferred(context, { entity: "company", viewId: shared.id });
    const patched = await createSavedViewPatchHandler(services, shared.id)(new Request(`https://auth.test/api/crm/saved-views/${shared.id}`, { method: "PATCH", headers: owner.headers, body: JSON.stringify({ shared: false }) }));
    expect(patched.status).toBe(200);
    expect(await patched.json()).toMatchObject({ id: shared.id, isDefault: true, shared: false, mine: true });
    expect(await services.views.preferred(member.context, "company")).toBeNull();
    expect(await services.views.preferred(owner.context, "company")).toMatchObject({ id: shared.id });
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM saved_view_default WHERE view_id=?").bind(shared.id).first("count")).toBe(1);
    await services.views.delete(owner.context, shared.id);
    expect(await services.views.preferred(owner.context, "company")).toBeNull();
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM saved_view_default").first("count")).toBe(0);
  });

  it("rejects private and wrong-entity selections in HTTP, service and SQL guards", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const privateView = await createView(owner.context), shared = await createView(owner.context, "contact", true);
    const handler = createSavedViewDefaultPutHandler(services);
    expect((await handler(apiRequest(new Headers({ "content-type": "application/json", origin: "https://auth.test" }), { entity: "company", viewId: privateView.id }))).status).toBe(401);
    expect((await handler(apiRequest(member.headers, { entity: "company", viewId: "bad" }))).status).toBe(400);
    for (const viewId of [privateView.id, shared.id, crypto.randomUUID()]) {
      expect((await handler(apiRequest(member.headers, { entity: "company", viewId }))).status).toBe(404);
      await expect(services.views.setPreferred(member.context, { entity: "company", viewId })).rejects.toMatchObject({ status: 404 });
      await expect(env.DB.prepare("INSERT INTO saved_view_default(user_id,entity,view_id) VALUES (?,'company',?)").bind(member.userId, viewId).run()).rejects.toThrow("default_view_unavailable");
    }
    await services.views.setPreferred(member.context, { entity: "contact", viewId: shared.id });
    await expect(env.DB.prepare("UPDATE saved_view_default SET entity='company' WHERE user_id=?").bind(member.userId).run()).rejects.toThrow("default_view_unavailable");
    expect(await services.views.preferred(member.context, "contact")).toMatchObject({ id: shared.id });
  });

  it("denies a revoked service context without clearing an existing preference", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const shared = await createView(owner.context, "company", true);
    await services.views.setPreferred(member.context, { entity: "company", viewId: shared.id });
    await services.members.remove(owner.context, member.userId);
    await expect(services.views.setPreferred(member.context, { entity: "company", viewId: null })).rejects.toMatchObject({ status: 403 });
    await expect(services.views.preferred(member.context, "company")).rejects.toMatchObject({ status: 403 });
    expect(await env.DB.prepare("SELECT view_id FROM saved_view_default WHERE user_id=?").bind(member.userId).first("view_id")).toBe(shared.id);
  });

  it("returns no preferred view when stored query state is corrupt", async () => {
    const owner = await actor(), services = root();
    const view = await createView(owner.context);
    await services.views.setPreferred(owner.context, { entity: "company", viewId: view.id });
    await env.DB.prepare("UPDATE saved_view SET state_json=? WHERE id=?").bind('{"version":1,"query":"sort=password"}', view.id).run();
    expect(await services.views.preferred(owner.context, "company")).toBeNull();
    await expect(services.views.setPreferred(owner.context, { entity: "company", viewId: view.id })).rejects.toMatchObject({ status: 409 });
  });
});

it("upgrades populated saved views without changing state, creator or sharing", async () => {
  const db = testEnv.UPGRADE_DB;
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(0, 7));
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('view-owner','Owner','owner@view.invalid',1,101,102)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES ('view-owner','owner','active',101,102)"),
    db.prepare("INSERT INTO saved_view(id,entity,name,shared,state_json,owner_membership_id,creator_user_id,created_at,updated_at) VALUES ('private','company','Private',0,'{\"version\":1,\"query\":\"q=retained\"}','view-owner','view-owner',103,104),('shared','deal','Shared',1,'{\"version\":1,\"query\":\"\"}','view-owner','view-owner',105,106)"),
  ]);
  const before = (await db.prepare("SELECT * FROM saved_view ORDER BY id").all()).results;
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(7, 8));
  expect((await db.prepare("SELECT * FROM saved_view ORDER BY id").all()).results).toEqual(before);
  expect((await db.prepare("SELECT * FROM saved_view_default").all()).results).toEqual([]);
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
});
