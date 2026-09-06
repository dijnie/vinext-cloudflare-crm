import { env } from "cloudflare:workers";
import { applyD1Migrations, env as testEnv } from "cloudflare:test";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { singletonMembership } from "@/lib/db/schema";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { requireRequestContext } from "@/lib/http/request-context";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { createSettingsGetHandler, createSettingsPatchHandler } from "../../src/app/api/crm/settings/route";

class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) {
    this.verificationMessages.push(message);
  }
  async sendPasswordReset() {}
}

const bindings = env as RuntimeEnv;
const password = "correct horse battery staple";
let requestIndex = 210;

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
    env.DB.prepare("UPDATE crm_setting SET time_zone='Asia/Ho_Chi_Minh', country_code='VN', calendar_revision=0 WHERE id='settings'"),
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

function apiRequest(headers: Headers, body?: unknown) {
  return new Request("https://auth.test/api/crm/settings", { method: body === undefined ? "GET" : "PATCH", headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

describe.sequential("business settings authorization and revisions", () => {
  beforeEach(clearState);

  it("allows owner API updates and authenticated member reads while denying member writes", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    expect((await createSettingsGetHandler(services)(apiRequest(new Headers()))).status).toBe(401);
    const initial = await createSettingsGetHandler(services)(apiRequest(member.headers));
    expect(initial.status).toBe(200);
    expect(initial.headers.get("cache-control")).toBe("private, no-store");
    expect(await initial.json()).toMatchObject({ timeZone: "Asia/Ho_Chi_Minh", countryCode: "VN", revision: 0, canManage: false });
    const change = { timeZone: "America/New_York", countryCode: "US", revision: 0 };
    expect((await createSettingsPatchHandler(services)(apiRequest(member.headers, change))).status).toBe(403);
    await expect(services.settings.update(member.context, change)).rejects.toMatchObject({ status: 403, code: "owner_required" });
    const updated = await createSettingsPatchHandler(services)(apiRequest(owner.headers, change));
    expect(updated.status).toBe(200);
    expect(await updated.json()).toMatchObject({ ...change, revision: 1, canManage: true });
    expect(await services.settings.get(member.context, new Date("2026-03-08T12:00:00Z"))).toMatchObject({ timeZone: change.timeZone, countryCode: "US", canManage: false, today: "2026-03-08", dayStartsAt: "2026-03-08T05:00:00.000Z", dayEndsAt: "2026-03-09T04:00:00.000Z" });
    await expect(services.settings.update(owner.context, { timeZone: "UTC", countryCode: "GB", revision: 1 })).resolves.toMatchObject({ timeZone: "UTC", revision: 2 });
  });

  it("returns revision conflicts without altering calendar, currency or job state", async () => {
    const owner = await actor(), services = root();
    await services.settings.update(owner.context, { timeZone: "Asia/Tokyo", countryCode: "JP", revision: 0 });
    const before = await env.DB.prepare("SELECT * FROM crm_setting WHERE id='settings'").first();
    const stale = { timeZone: "UTC", countryCode: "GB", revision: 0 };
    await expect(services.settings.update(owner.context, stale)).rejects.toMatchObject({ status: 409, code: "conflict" });
    expect((await createSettingsPatchHandler(services)(apiRequest(owner.headers, stale))).status).toBe(409);
    expect(await env.DB.prepare("SELECT * FROM crm_setting WHERE id='settings'").first()).toEqual(before);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM operation_condition_guard").first("count")).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM action_operation_guard").first("count")).toBe(0);
  });

  it("rejects invalid timezone and revision inputs without changing settings", async () => {
    const owner = await actor(), services = root();
    for (const change of [{ timeZone: "Mars/Olympus", countryCode: "VN", revision: 0 }, { timeZone: "UTC", countryCode: "VNM", revision: 0 }, { timeZone: "UTC", countryCode: "AA", revision: 0 }, { timeZone: "UTC", countryCode: "ZZ", revision: 0 }, { timeZone: "UTC", countryCode: "EU", revision: 0 }, { timeZone: "UTC", countryCode: "VN", revision: -1 }]) {
      expect((await createSettingsPatchHandler(services)(apiRequest(owner.headers, change))).status).toBe(400);
      await expect(services.settings.update(owner.context, change)).rejects.toMatchObject({ status: 400 });
    }
    expect(await services.settings.get(owner.context)).toMatchObject({ timeZone: "Asia/Ho_Chi_Minh", countryCode: "VN", revision: 0 });
  });
});

it("adds calendar defaults to a populated database without changing currency jobs or existing columns", async () => {
  const db = testEnv.UPGRADE_DB;
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(0, 6));
  await db.batch([
    db.prepare("INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES ('calendar-owner','Owner','owner@calendar.invalid',1,101,102)"),
    db.prepare("INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES ('calendar-owner','owner','active',101,102)"),
    db.prepare("INSERT INTO member_branch(membership_id,branch_id,is_primary) VALUES ('calendar-owner','default-branch',1)"),
    db.prepare("INSERT INTO company(id,name,owner_membership_id,created_at,updated_at) VALUES ('calendar-company','Existing','calendar-owner',103,104)"),
    db.prepare("INSERT INTO exchange_rate(id,base_currency,quote_currency,rate,as_of,source,created_at,updated_at) VALUES ('calendar-rate','USD','EUR','0.95',105,'manual',106,107)"),
    db.prepare("INSERT INTO currency_job(id,kind,target_currency,expected_version,target_version,rates_json,total,processed,converted,missing,status,created_at,updated_at) VALUES ('calendar-job','rerate','EUR','initial','next','{}',5,2,1,1,'running',108,109)"),
    db.prepare("UPDATE crm_setting SET reporting_currency='EUR',active_conversion_version='current',pending_job_id='calendar-job',rates_revision=3,updated_at=110 WHERE id='settings'"),
  ]);
  const tables = ["user", "singleton_membership", "membership_access", "member_branch", "company", "exchange_rate", "currency_job", "crm_setting"];
  const before = await Promise.all(tables.map(async table => (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results));
  await applyD1Migrations(db, testEnv.TEST_MIGRATIONS.slice(6, 7));
  for (const [index, table] of tables.entries()) {
    const after = (await db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all()).results;
    if (table === "crm_setting") {
      expect(after).toEqual(before[index].map(row => ({ ...row, time_zone: "Asia/Ho_Chi_Minh", country_code: "VN", calendar_revision: 0 })));
    } else expect(after, table).toEqual(before[index]);
  }
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual([]);
  expect((await db.prepare("SELECT name FROM d1_migrations ORDER BY id").all()).results).toHaveLength(7);
});
