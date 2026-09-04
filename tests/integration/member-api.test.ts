import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import {
  createMemberDeleteHandler,
  createMemberPatchHandler,
} from "../../app/api/crm/members/[memberId]/route";
import { createMembersGetHandler } from "../../app/api/crm/members/route";
import { handleAuthRequest } from "@/auth/auth";
import type {
  AuthEmailAdapter,
  AuthEmailMessage,
} from "@/auth/email-adapter";
import { SINGLETON_WORKSPACE_ID } from "@/auth/singleton-workspace";
import { company, singletonMembership } from "@/db/schema";
import {
  createCompositionRoot,
  type RuntimeEnv,
} from "@/server/composition-root";

class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];

  async sendVerification(message: AuthEmailMessage) {
    this.verificationMessages.push(message);
  }

  async sendPasswordReset() {}
}

const runtimeBindings = env as RuntimeEnv;
const password = "correct horse battery staple";
let requestIndex = 0;

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
  ]);
}

async function createVerifiedSession(email: string, owner = false) {
  const emailAdapter = new RecordingEmailAdapter();
  const root = createCompositionRoot(runtimeBindings, emailAdapter);
  requestIndex += 1;
  const authRequest = (path: string, init: RequestInit = {}) => {
    const headers = new Headers(init.headers);
    headers.set("origin", "https://auth.test");
    headers.set("cf-connecting-ip", `198.51.100.${requestIndex}`);
    if (init.body) headers.set("content-type", "application/json");
    return handleAuthRequest(
      new Request(`https://auth.test/api/auth${path}`, { ...init, headers }),
      root.auth,
      root.db,
      runtimeBindings.AUTH_BASE_URL,
    );
  };
  const signUp = await authRequest("/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: email, email, password }),
  });
  expect(signUp.status).toBe(200);
  const verificationUrl = new URL(
    emailAdapter.verificationMessages.at(-1)?.url ?? "",
  );
  const token = verificationUrl.searchParams.get("token");
  if (!token) throw new Error("Expected a verification token");
  const verification = await root.auth.api.verifyEmail({
    asResponse: true,
    headers: new Headers({ origin: "https://auth.test" }),
    query: { token },
  });
  expect([200, 302]).toContain(verification.status);
  const signIn = await authRequest("/sign-in/email", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  expect(signIn.status).toBe(200);
  const cookie = signIn.headers.get("set-cookie")?.split(";", 1)[0];
  if (!cookie) throw new Error("Expected a session cookie");
  const storedUser = await root.db.query.user.findFirst({
    where: (fields, { eq }) => eq(fields.email, email),
  });
  if (!storedUser) throw new Error("Expected a stored user");
  if (owner) {
    await root.db.batch([
      root.db
        .update(singletonMembership)
        .set({ role: "owner", updatedAt: new Date() })
        .where(eq(singletonMembership.userId, storedUser.id)),
      root.db
        .update(singletonMembership)
        .set({ role: "member", updatedAt: new Date() })
        .where(eq(singletonMembership.userId, "sentinel-owner")),
    ]);
  }
  return { cookie, userId: storedUser.id };
}

function apiRequest(
  path: string,
  cookie: string,
  init: RequestInit = {},
) {
  const headers = new Headers(init.headers);
  headers.set("cookie", cookie);
  headers.set("cf-ray", "member-api-request");
  if (init.body) {
    headers.set("content-type", "application/json");
    headers.set("origin", "https://auth.test");
    headers.set("sec-fetch-site", "same-origin");
  }
  return new Request(`https://auth.test${path}`, { ...init, headers });
}

describe.sequential("member API", () => {
  beforeEach(clearState);

  it("lets an owner list, change, remove, and restore members", async () => {
    const owner = await createVerifiedSession("owner@example.com", true);
    const member = await createVerifiedSession("member@example.com");
    const root = createCompositionRoot(runtimeBindings, new RecordingEmailAdapter());

    const list = await createMembersGetHandler(root)(
      apiRequest("/api/crm/members", owner.cookie),
    );
    expect(list.status).toBe(200);
    expect(list.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await list.json()).toMatchObject({
      members: expect.arrayContaining([
        expect.objectContaining({ membershipId: owner.userId, role: "owner" }),
        expect.objectContaining({ membershipId: member.userId, role: "member" }),
      ]),
    });

    const changeRole = await createMemberPatchHandler(
      root,
      Promise.resolve({ memberId: member.userId }),
    )(
      apiRequest(`/api/crm/members/${member.userId}`, owner.cookie, {
        method: "PATCH",
        body: JSON.stringify({ action: "change-role", role: "owner" }),
      }),
    );
    expect(changeRole.status).toBe(200);
    expect(await changeRole.json()).toEqual({ success: true });

    await root.db.insert(company).values({
      id: "owned-company",
      name: "Owned company",
      ownerMembershipId: member.userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const remove = await createMemberDeleteHandler(
      root,
      Promise.resolve({ memberId: member.userId }),
    )(
      apiRequest(`/api/crm/members/${member.userId}`, owner.cookie, {
        method: "DELETE",
        body: JSON.stringify({ replacementMembershipId: owner.userId }),
      }),
    );
    expect(remove.status).toBe(200);
    expect(await remove.json()).toEqual({ success: true });
    expect(await root.db.query.company.findFirst({ where: (fields, { eq }) => eq(fields.id, "owned-company") })).toMatchObject({ ownerMembershipId: owner.userId });
    const revokedSession = await createMembersGetHandler(root)(apiRequest("/api/crm/members", member.cookie));
    expect(revokedSession.status).toBe(401);

    const restore = await createMemberPatchHandler(
      root,
      Promise.resolve({ memberId: member.userId }),
    )(
      apiRequest(`/api/crm/members/${member.userId}`, owner.cookie, {
        method: "PATCH",
        body: JSON.stringify({ action: "restore" }),
      }),
    );
    expect(restore.status).toBe(200);
    expect(await restore.json()).toEqual({ success: true });
  });

  it("rejects last-owner self-removal and keeps the session active", async () => {
    const owner = await createVerifiedSession("owner@example.com", true);
    const member = await createVerifiedSession("member@example.com");
    const root = createCompositionRoot(runtimeBindings, new RecordingEmailAdapter());
    const remove = await createMemberDeleteHandler(root, Promise.resolve({ memberId: owner.userId }))(
      apiRequest(`/api/crm/members/${owner.userId}`, owner.cookie, {
        method: "DELETE",
        body: JSON.stringify({ replacementMembershipId: member.userId }),
      }),
    );
    expect(remove.status).toBe(409);
    expect(await remove.json()).toEqual({ error: { code: "conflict", requestId: "member-api-request" } });
    expect((await createMembersGetHandler(root)(apiRequest("/api/crm/members", owner.cookie))).status).toBe(200);
  });

  it("keeps workspace ownership with an owner when records go to a member", async () => {
    const actor = await createVerifiedSession("actor@example.com", true);
    const replacement = await createVerifiedSession("replacement@example.com");
    const root = createCompositionRoot(runtimeBindings, new RecordingEmailAdapter());
    const promoteCanonicalOwner = await createMemberPatchHandler(root, Promise.resolve({ memberId: "sentinel-owner" }))(
      apiRequest("/api/crm/members/sentinel-owner", actor.cookie, { method: "PATCH", body: JSON.stringify({ action: "change-role", role: "owner" }) }),
    );
    expect(promoteCanonicalOwner.status).toBe(200);
    await root.db.insert(company).values({ id: "canonical-owner-company", name: "Canonical owner company", ownerMembershipId: "sentinel-owner", createdAt: new Date(), updatedAt: new Date() });

    const remove = await createMemberDeleteHandler(root, Promise.resolve({ memberId: "sentinel-owner" }))(
      apiRequest("/api/crm/members/sentinel-owner", actor.cookie, { method: "DELETE", body: JSON.stringify({ replacementMembershipId: replacement.userId }) }),
    );
    expect(remove.status).toBe(200);
    expect(await root.db.query.singletonWorkspace.findFirst({ where: (fields, { eq }) => eq(fields.id, SINGLETON_WORKSPACE_ID) })).toMatchObject({ ownerUserId: actor.userId });
    expect(await root.db.query.singletonMembership.findFirst({ where: (fields, { eq }) => eq(fields.userId, actor.userId) })).toMatchObject({ role: "owner", status: "active" });
    expect(await root.db.query.company.findFirst({ where: (fields, { eq }) => eq(fields.id, "canonical-owner-company") })).toMatchObject({ ownerMembershipId: replacement.userId });
  });

  it("returns the guarded error shape for member access and strict input failures", async () => {
    const owner = await createVerifiedSession("owner@example.com", true);
    const member = await createVerifiedSession("member@example.com");
    const root = createCompositionRoot(runtimeBindings, new RecordingEmailAdapter());

    const denied = await createMembersGetHandler(root)(
      apiRequest("/api/crm/members", member.cookie),
    );
    expect(denied.status).toBe(403);
    expect(await denied.json()).toEqual({
      error: { code: "owner_required", requestId: "member-api-request" },
    });

    const deniedMutation = await createMemberPatchHandler(
      root,
      Promise.resolve({ memberId: owner.userId }),
    )(
      apiRequest(`/api/crm/members/${owner.userId}`, member.cookie, {
        method: "PATCH",
        body: JSON.stringify({ action: "change-role", role: "member" }),
      }),
    );
    expect(deniedMutation.status).toBe(403);
    expect(await deniedMutation.json()).toEqual({
      error: { code: "owner_required", requestId: "member-api-request" },
    });

    const invalid = await createMemberPatchHandler(
      root,
      Promise.resolve({ memberId: member.userId }),
    )(
      apiRequest(`/api/crm/members/${member.userId}`, owner.cookie, {
        method: "PATCH",
        body: JSON.stringify({
          action: "change-role",
          role: "member",
          unexpected: true,
        }),
      }),
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({
      error: { code: "validation_failed", requestId: "member-api-request" },
    });
  });
});
