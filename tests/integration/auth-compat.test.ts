import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { beforeEach, describe, expect, it } from "vitest";

import { createAuth, handleAuthRequest } from "@/modules/auth/auth";
import * as schema from "@/db/schema";
import { requireRequestContext } from "@/server/request-context";
import type {
  AuthEmailAdapter,
  AuthEmailMessage,
} from "@/modules/auth/email-adapter";
import {
  changeSingletonRole,
  reconcileSingletonMembership,
  revokeSingletonMembership,
  SINGLETON_WORKSPACE_ID,
} from "@/modules/auth/singleton-workspace";
import {
  account,
  company,
  rateLimit,
  session,
  singletonMembership,
  singletonWorkspace,
  user,
  verification,
} from "@/db/schema";
import {
  createCompositionRoot,
  type RuntimeEnv,
} from "@/server/composition-root";

class RecordingEmailAdapter implements AuthEmailAdapter {
  readonly verificationMessages: AuthEmailMessage[] = [];
  readonly resetMessages: AuthEmailMessage[] = [];

  async sendVerification(message: AuthEmailMessage) {
    this.verificationMessages.push(message);
  }

  async sendPasswordReset(message: AuthEmailMessage) {
    this.resetMessages.push(message);
  }
}

const runtimeBindings = env as RuntimeEnv;
let harnessIndex = 0;

function createHarness(overrides: Partial<RuntimeEnv> = {}, queries?: string[]) {
  const email = new RecordingEmailAdapter();
  const bindings = { ...runtimeBindings, ...overrides } as RuntimeEnv;
  const root = createCompositionRoot(bindings, email);
  if (queries) {
    root.db = drizzle(bindings.DB, {
      schema,
      logger: { logQuery: (query) => queries.push(query) },
    });
    root.auth = createAuth(root.db, {
      secret: bindings.BETTER_AUTH_SECRET,
      baseUrl: bindings.AUTH_BASE_URL,
    }, email);
  }
  harnessIndex += 1;
  const currentHarness = harnessIndex;
  const request = async (
    pathOrUrl: string,
    init: RequestInit = {},
  ): Promise<Response> => {
    const url = /^https?:\/\//.test(pathOrUrl)
      ? pathOrUrl
      : `https://auth.test/api/auth${pathOrUrl}`;
    const headers = new Headers(init.headers);
    headers.set("origin", headers.get("origin") ?? "https://auth.test");
    if (!headers.has("cf-connecting-ip")) {
      headers.set("cf-connecting-ip", `192.0.${currentHarness}.10`);
    }
    if (init.body) headers.set("content-type", "application/json");
    return handleAuthRequest(
      new Request(url, { ...init, headers }),
      root.auth,
      root.db,
      bindings["AUTH_BASE_URL"],
    );
  };
  return { email, request, root };
}

async function clearState() {
  const { db } = createHarness().root;
  await db.delete(rateLimit);
  await db.delete(session);
  await db.delete(account);
  await db.delete(verification);
  await db.delete(company);
  await db.delete(singletonWorkspace);
  await db.delete(singletonMembership);
  await db.delete(user);
  const now = new Date();
  await db.insert(singletonWorkspace).values({
    id: SINGLETON_WORKSPACE_ID,
    slug: "crm",
    ownerUserId: null,
    createdAt: now,
    updatedAt: now,
  });
}

function jsonBody(value: unknown): string {
  return JSON.stringify(value);
}

function requestCookie(response: Response): string {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error("Expected a session cookie");
  return setCookie.split(";", 1)[0];
}

async function signUpAndVerify(
  harness: ReturnType<typeof createHarness>,
  emailAddress: string,
  password: string,
) {
  const signUp = await harness.request("/sign-up/email", {
    method: "POST",
    body: jsonBody({ name: "Test User", email: emailAddress, password }),
  });
  expect(signUp.status).toBe(200);
  const verificationUrl = new URL(
    harness.email.verificationMessages.at(-1)?.url ?? "",
  );
  const token = verificationUrl.searchParams.get("token");
  if (!token) throw new Error("Verification token was not generated");
  const verify = await harness.root.auth.api.verifyEmail({
    asResponse: true,
    headers: new Headers({ origin: "https://auth.test" }),
    query: { token },
  });
  expect([200, 302]).toContain(verify.status);
}

describe.sequential("Better Auth compatibility under workerd", () => {
  beforeEach(clearState);

  it("accepts any well-formed email but rejects malformed sign-up input", async () => {
    const { email, request, root } = createHarness();
    const accepted = await request("/sign-up/email", {
      method: "POST",
      body: jsonBody({
        name: "Open registration",
        email: "owner+other@example.com",
        password: "correct horse battery staple",
      }),
    });
    const malformed = await request("/sign-up/email", {
      method: "POST",
      body: jsonBody({ name: "Malformed", password: "unused-password" }),
    });

    expect(accepted.status).toBe(200);
    expect(malformed.status).toBe(400);
    expect(email.verificationMessages).toHaveLength(1);
    expect(await root.db.select().from(user)).toHaveLength(1);
    expect(await root.db.select().from(session)).toHaveLength(0);
    expect(await root.db.select().from(singletonMembership)).toHaveLength(0);
  });

  it("normalizes sign-up, verifies email, admits a guarded session, and signs out", async () => {
    const { email, request, root } = createHarness();
    const signUp = await request("/sign-up/email", {
      method: "POST",
      body: jsonBody({
        name: "Owner",
        email: " OWNER@EXAMPLE.COM ",
        password: "correct horse battery staple",
      }),
    });

    expect(signUp.status).toBe(200);
    expect(email.verificationMessages).toHaveLength(1);
    const storedUser = await root.db.query.user.findFirst();
    expect(storedUser?.email).toBe("owner@example.com");
    expect(await root.db.select().from(session)).toHaveLength(0);
    expect(await root.db.select().from(singletonMembership)).toHaveLength(0);

    const verificationUrl = new URL(email.verificationMessages[0].url);
    const token = verificationUrl.searchParams.get("token");
    if (!token) throw new Error("Verification token was not generated");
    const verify = await root.auth.api.verifyEmail({
      asResponse: true,
      headers: new Headers({ origin: "https://auth.test" }),
      query: { token },
    });
    expect([200, 302]).toContain(verify.status);

    const membership = await root.db.query.singletonMembership.findFirst();
    expect(membership).toMatchObject({ role: "owner", status: "active" });

    const signIn = await request("http://auth.test/api/auth/sign-in/email", {
      method: "POST",
      headers: { origin: "http://auth.test" },
      body: jsonBody({
        email: " OWNER@EXAMPLE.COM ",
        password: "correct horse battery staple",
      }),
    });
    expect(signIn.status).toBe(200);
    const setCookie = signIn.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Lax");

    const cookie = requestCookie(signIn);
    const currentSession = await request("/get-session", {
      headers: { cookie },
    });
    const sessionBody = (await currentSession.json()) as {
      user?: { email?: string };
    } | null;
    expect(sessionBody?.user?.email).toBe("owner@example.com");

    const signOut = await request("/sign-out", {
      method: "POST",
      headers: { cookie },
      body: jsonBody({}),
    });
    expect(signOut.status).toBe(200);
    const afterSignOut = await request("/get-session", {
      headers: { cookie },
    });
    expect(await afterSignOut.json()).toBeNull();
  });

  it("rejects an untrusted mutation origin", async () => {
    const { request } = createHarness();
    const response = await request("/sign-in/email", {
      method: "POST",
      headers: { origin: "https://evil.example" },
      body: jsonBody({
        email: "owner@example.com",
        password: "correct horse battery staple",
      }),
    });
    expect(response.status).toBe(403);
  });

  it("persists auth rate limits in D1", async () => {
    const harness = createHarness();
    const password = "correct horse battery staple";
    await signUpAndVerify(harness, "owner@example.com", password);
    const responses: Response[] = [];
    for (let attempt = 0; attempt < 11; attempt += 1) {
      responses.push(
        await harness.request("/sign-in/email", {
          method: "POST",
          body: jsonBody({
            email: "owner@example.com",
            password,
          }),
        }),
      );
    }

    expect(responses.slice(0, 10).every((response) => response.status === 200)).toBe(true);
    expect(responses[10].status).toBe(429);
    expect(await harness.root.db.select().from(rateLimit)).not.toHaveLength(0);
  });

  it("keeps a revoked account out on later sign-in", async () => {
    const harness = createHarness();
    await signUpAndVerify(
      harness,
      "owner@example.com",
      "correct horse battery staple",
    );
    const currentUser = await harness.root.db.query.user.findFirst();
    if (!currentUser) throw new Error("Expected the verified user");
    const now = new Date();
    await harness.root.db.insert(user).values({
      id: "backup-owner",
      name: "Backup Owner",
      email: "backup-owner@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await harness.root.db.insert(singletonMembership).values({
      userId: "backup-owner",
      role: "owner",
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
    await harness.root.db
      .update(singletonMembership)
      .set({ status: "revoked", updatedAt: new Date() })
      .where(eq(singletonMembership.userId, currentUser.id));

    const response = await harness.request("/sign-in/email", {
      method: "POST",
      body: jsonBody({
        email: "owner@example.com",
        password: "correct horse battery staple",
      }),
    });
    expect(response.status).toBe(400);
    expect(await harness.root.db.select().from(session)).toHaveLength(0);
    expect(
      await harness.root.db.query.singletonMembership.findFirst(),
    ).toMatchObject({ status: "revoked" });
  });

  it("renews an active database session after its update window", async () => {
    const harness = createHarness();
    const password = "correct horse battery staple";
    await signUpAndVerify(harness, "owner@example.com", password);
    const signIn = await harness.request("/sign-in/email", {
      method: "POST",
      body: jsonBody({ email: "owner@example.com", password }),
    });
    const cookie = requestCookie(signIn);
    const currentSession = await harness.root.db.query.session.findFirst();
    if (!currentSession) throw new Error("Expected an active session");
    // Age the real persisted session instead of sleeping for the renewal window.
    const previousUpdate = new Date(Date.now() - 301_000);
    const previousExpiry = new Date(previousUpdate.getTime() + 3_600_000);
    await harness.root.db.update(session).set({
      updatedAt: previousUpdate,
      expiresAt: previousExpiry,
    }).where(eq(session.id, currentSession.id));

    const response = await harness.request("/get-session", {
      headers: { cookie },
    });
    expect(response.status).toBe(200);
    const renewed = await harness.root.db.query.session.findFirst({
      where: eq(session.id, currentSession.id),
    });
    expect(renewed!.updatedAt.getTime()).toBeGreaterThan(
      previousUpdate.getTime(),
    );
    expect(renewed!.expiresAt.getTime()).toBeGreaterThan(
      previousExpiry.getTime(),
    );
  });

  it("checks session and user with one read and avoids renewal writes during navigation", async () => {
    const queries: string[] = [];
    const harness = createHarness({}, queries);
    const password = "correct horse battery staple";
    await signUpAndVerify(harness, "owner@example.com", password);
    const signIn = await harness.request("/sign-in/email", {
      method: "POST",
      body: jsonBody({ email: "owner@example.com", password }),
    });
    const headers = new Headers({ cookie: requestCookie(signIn) });
    for (const ageSeconds of [2, 120, 290]) {
      const previousUpdate = new Date(Date.now() - ageSeconds * 1_000);
      await harness.root.db.update(session).set({
        updatedAt: previousUpdate,
        expiresAt: new Date(previousUpdate.getTime() + 3_600_000),
      });
      queries.length = 0;
      const context = await requireRequestContext(headers, harness.root);
      expect(context.role).toBe("owner");
      // One session+user read and one live membership read; no renewal write.
      expect(queries).toHaveLength(2);
      expect(queries.every((query) => /^select\b/i.test(query))).toBe(true);
      const stored = await harness.root.db.query.session.findFirst();
      expect(stored?.updatedAt).toEqual(previousUpdate);
    }

    // A previously valid cookie cannot bypass immediate server-side revocation.
    await harness.root.db.delete(session);
    await expect(requireRequestContext(headers, harness.root))
      .rejects.toMatchObject({ status: 401 });
  });

  it("observes role, verification and membership changes on the next request", async () => {
    const harness = createHarness();
    const password = "correct horse battery staple";
    await signUpAndVerify(harness, "owner@example.com", password);
    await signUpAndVerify(harness, "member@example.com", password);
    const signIn = await harness.request("/sign-in/email", {
      method: "POST",
      body: jsonBody({ email: "member@example.com", password }),
    });
    const headers = new Headers({ cookie: requestCookie(signIn) });
    const context = await requireRequestContext(headers, harness.root);
    expect(context.role).toBe("member");
    await harness.root.db.update(singletonMembership).set({ role: "owner" })
      .where(eq(singletonMembership.userId, context.userId));
    expect((await requireRequestContext(headers, harness.root)).role).toBe("owner");
    await harness.root.db.update(singletonMembership).set({ role: "member" })
      .where(eq(singletonMembership.userId, context.userId));
    expect((await requireRequestContext(headers, harness.root)).role).toBe("member");

    await harness.root.db.update(user).set({ emailVerified: false })
      .where(eq(user.id, context.userId));
    await expect(requireRequestContext(headers, harness.root))
      .rejects.toMatchObject({ status: 401 });
    await harness.root.db.update(user).set({ emailVerified: true })
      .where(eq(user.id, context.userId));
    await harness.root.db.update(singletonMembership).set({ status: "revoked" })
      .where(eq(singletonMembership.userId, context.userId));
    await expect(requireRequestContext(headers, harness.root))
      .rejects.toMatchObject({ status: 403 });
  });

  it("rejects expired sessions instead of renewing them", async () => {
    const harness = createHarness();
    const password = "correct horse battery staple";
    await signUpAndVerify(harness, "owner@example.com", password);
    const signIn = await harness.request("/sign-in/email", {
      method: "POST",
      body: jsonBody({ email: "owner@example.com", password }),
    });
    const headers = new Headers({ cookie: requestCookie(signIn) });
    await harness.root.db.update(session).set({ expiresAt: new Date(Date.now() - 1_000) });
    await expect(requireRequestContext(headers, harness.root))
      .rejects.toMatchObject({ status: 401 });
    expect(await harness.root.db.select().from(session)).toHaveLength(0);
  });

  it("uses generic reset responses, rejects host poisoning, consumes a short-lived token record, and invalidates old sessions", async () => {
    const harness = createHarness();
    const oldPassword = "correct horse battery staple";
    const newPassword = "new correct horse battery staple";
    await signUpAndVerify(harness, "owner@example.com", oldPassword);

    const firstSignIn = await harness.request("/sign-in/email", {
      method: "POST",
      body: jsonBody({ email: "owner@example.com", password: oldPassword }),
    });
    const secondSignIn = await harness.request("/sign-in/email", {
      method: "POST",
      body: jsonBody({ email: "owner@example.com", password: oldPassword }),
    });
    expect(firstSignIn.status).toBe(200);
    expect(secondSignIn.status).toBe(200);
    const firstCookie = requestCookie(firstSignIn);
    expect(await harness.root.db.select().from(session)).toHaveLength(2);

    const existing = await harness.request("/request-password-reset", {
      method: "POST",
      body: jsonBody({
        email: "owner@example.com",
        redirectTo: "/reset-password",
      }),
    });
    const missing = await harness.request("/request-password-reset", {
      method: "POST",
      body: jsonBody({
        email: "missing@example.com",
        redirectTo: "/reset-password",
      }),
    });
    expect(existing.status).toBe(missing.status);
    expect(await existing.json()).toEqual(await missing.json());
    expect(harness.email.resetMessages).toHaveLength(1);
    const [resetRecord] = await harness.root.db.select().from(verification);
    expect(resetRecord.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(resetRecord.expiresAt.getTime()).toBeLessThanOrEqual(
      Date.now() + 15 * 60 * 1_000,
    );

    const poisoned = await harness.request(
      "https://evil.example/api/auth/request-password-reset",
      {
        method: "POST",
        body: jsonBody({
          email: "owner@example.com",
          redirectTo: "https://evil.example/reset-password",
        }),
      },
    );
    expect(poisoned.status).toBe(403);
    expect(harness.email.resetMessages).toHaveLength(1);

    const resetUrl = new URL(harness.email.resetMessages[0].url);
    expect(resetUrl.origin).toBe("https://auth.test");
    const resetToken =
      resetUrl.searchParams.get("token") ??
      resetUrl.pathname.split("/").filter(Boolean).at(-1);
    if (!resetToken) throw new Error("Reset token was not generated");

    const reset = await harness.request("/reset-password", {
      method: "POST",
      body: jsonBody({ newPassword, token: resetToken }),
    });
    expect(reset.status).toBe(200);
    expect(await harness.root.db.select().from(session)).toHaveLength(0);
    expect(await harness.root.db.select().from(verification)).toHaveLength(0);
    const oldSession = await harness.request("/get-session", {
      headers: { cookie: firstCookie },
    });
    expect(await oldSession.json()).toBeNull();

    const newSignIn = await harness.request("/sign-in/email", {
      method: "POST",
      body: jsonBody({ email: "owner@example.com", password: newPassword }),
    });
    expect(newSignIn.status).toBe(200);
  });

  it("claims exactly one owner through concurrent verified auth flows", async () => {
    const emails = Array.from({ length: 8 }, (_, index) =>
      `race-${index}@example.com`,
    );
    const harness = createHarness();
    const password = "correct horse battery staple";
    const signUps = await Promise.all(
      emails.map((email, index) =>
        harness.request("/sign-up/email", {
          method: "POST",
          headers: { "cf-connecting-ip": `198.51.100.${index + 1}` },
          body: jsonBody({ name: email, email, password }),
        }),
      ),
    );
    expect(signUps.every((response) => response.status === 200)).toBe(true);
    const tokens = harness.email.verificationMessages.map((message) =>
      new URL(message.url).searchParams.get("token"),
    );
    expect(tokens.every(Boolean)).toBe(true);

    await Promise.all(
      tokens.map((token) =>
        harness.root.auth.api.verifyEmail({
          asResponse: true,
          headers: new Headers({ origin: "https://auth.test" }),
          query: { token: token! },
        }),
      ),
    );
    const memberships = await harness.root.db.select().from(singletonMembership);
    expect(memberships).toHaveLength(8);
    expect(memberships.filter((entry) => entry.role === "owner")).toHaveLength(1);
  });

  it("claims one owner, enrolls later members, and never revives revocation", async () => {
    const { root } = createHarness();
    const now = new Date();
    const users = Array.from({ length: 8 }, (_, index) => ({
      id: `race-user-${index}`,
      name: `User ${index}`,
      email: `race-${index}@example.com`,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    }));
    await root.db.insert(user).values(users);

    await Promise.all(
      users.map((entry) => reconcileSingletonMembership(root.db, entry.id)),
    );
    const memberships = await root.db.select().from(singletonMembership);
    expect(memberships.filter((entry) => entry.role === "owner")).toHaveLength(
      1,
    );
    expect(memberships.filter((entry) => entry.role === "member")).toHaveLength(
      7,
    );

    const owner = memberships.find((entry) => entry.role === "owner")!;
    const laterMember = memberships.find((entry) => entry.role === "member")!;
    expect(
      await changeSingletonRole(
        root.db,
        owner.userId,
        laterMember.userId,
        "owner",
      ),
    ).toBe(true);
    expect(
      await changeSingletonRole(
        root.db,
        laterMember.userId,
        owner.userId,
        "member",
      ),
    ).toBe(true);
    expect(
      await changeSingletonRole(
        root.db,
        laterMember.userId,
        laterMember.userId,
        "member",
      ),
    ).toBe(false);
    expect(
      await revokeSingletonMembership(
        root.db,
        laterMember.userId,
        laterMember.userId,
      ),
    ).toBe(false);

    expect(
      await revokeSingletonMembership(
        root.db,
        laterMember.userId,
        owner.userId,
      ),
    ).toBe(true);
    await expect(
      reconcileSingletonMembership(root.db, owner.userId),
    ).rejects.toThrow("Membership is revoked");
  });

  it("repairs membership after a transient post-claim failure", async () => {
    const { root } = createHarness();
    const now = new Date();
    await root.db.insert(user).values({
      id: "repair-owner",
      name: "Repair Owner",
      email: "repair@example.com",
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
    await root.db
      .update(singletonWorkspace)
      .set({ ownerUserId: "repair-owner", updatedAt: now })
      .where(eq(singletonWorkspace.id, SINGLETON_WORKSPACE_ID));

    await expect(
      reconcileSingletonMembership(root.db, "repair-owner"),
    ).resolves.toBe("owner");
  });

  it("preserves one owner during concurrent owner removal attempts", async () => {
    const { root } = createHarness();
    const now = new Date();
    await root.db.insert(user).values([
      { id: "owner-a", name: "Owner A", email: "a@example.com", emailVerified: true, createdAt: now, updatedAt: now },
      { id: "owner-b", name: "Owner B", email: "b@example.com", emailVerified: true, createdAt: now, updatedAt: now },
    ]);
    await root.db.insert(singletonMembership).values([
      { userId: "owner-a", role: "owner", status: "active", createdAt: now, updatedAt: now },
      { userId: "owner-b", role: "owner", status: "active", createdAt: now, updatedAt: now },
    ]);

    const removals = await Promise.all([
      revokeSingletonMembership(root.db, "owner-a", "owner-b"),
      revokeSingletonMembership(root.db, "owner-b", "owner-a"),
    ]);
    expect(removals.filter(Boolean)).toHaveLength(1);
    const activeOwners = await root.db.query.singletonMembership.findMany({
      where: (table, { and, eq }) =>
        and(eq(table.role, "owner"), eq(table.status, "active")),
    });
    expect(activeOwners).toHaveLength(1);
  });
});
