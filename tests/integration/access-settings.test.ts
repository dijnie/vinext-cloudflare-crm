import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleAuthRequest } from "@/lib/auth/auth";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import { company, operationConditionGuard, singletonMembership } from "@/lib/db/schema";
import type { AuthEmailAdapter, AuthEmailMessage } from "@/lib/email/email-adapter";
import { requireRequestContext, type RequestContext } from "@/lib/http/request-context";
import { SINGLETON_WORKSPACE_ID } from "@/lib/services/members/singleton-workspace";
import { DEFAULT_PROFILE_ID, PERMISSIONS, type Permission } from "@/lib/services/permissions/access-contracts";
import { actionGuard, permissionError, requirePermission } from "@/lib/services/permissions/permission-policy";
import { currencyError } from "@/lib/services/currencies/currency-service";
import { companyListInputSchema } from "@/lib/services/companies/company-contract";
import { createAccessGetHandler, createAccessPostHandler } from "../../src/app/api/crm/access/route";

class RecordingEmailAdapter implements AuthEmailAdapter {
  verificationMessages: AuthEmailMessage[] = [];
  async sendVerification(message: AuthEmailMessage) {
    this.verificationMessages.push(message);
  }
  async sendPasswordReset() {}
}

const bindings = env as RuntimeEnv;
const password = "correct horse battery staple";
let requestIndex = 170;

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
async function profile(context: RequestContext, grants: Permission[] = []) {
  const name = `Profile ${crypto.randomUUID()}`;
  const result = await root().access.mutate(context, { action: "create-profile", name, grants });
  return result.profiles.find(p => p.name === name)!;
}
async function createBranch(context: RequestContext, name: string) {
  const result = await root().access.mutate(context, { action: "create-branch", name });
  return result.branches.find(b => b.name === name)!;
}

describe.sequential("access settings and service authorization", () => {
  beforeEach(clearState);

  it("creates and updates exact profile grants while protecting the compatibility profile and assigned profiles", async () => {
    const owner = await actor(), member = await actor("member");
    const service = root().access;
    const initial = await service.settings(owner.context);
    expect(initial.profiles.find(p => p.id === DEFAULT_PROFILE_ID)?.grants.sort()).toEqual(PERMISSIONS.filter(p => !p.endsWith(".export")).sort());
    expect(initial.members.find(m => m.membershipId === member.userId)?.profileId).toBe(DEFAULT_PROFILE_ID);
    const restricted = await profile(owner.context, ["company.create"]);
    const updated = await service.mutate(owner.context, { action: "update-profile", id: restricted.id, name: "Restricted", grants: ["company.update", "contact.create"] });
    expect(updated.profiles.find(p => p.id === restricted.id)).toMatchObject({ name: "Restricted", grants: expect.arrayContaining(["company.update", "contact.create"]) });
    expect(updated.profiles.find(p => p.id === restricted.id)?.grants).toHaveLength(2);
    await service.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: restricted.id });
    await expect(service.mutate(owner.context, { action: "delete-profile", id: restricted.id })).rejects.toMatchObject({ status: 409 });
    for (const action of ["update-profile", "delete-profile"] as const) {
      await expect(service.mutate(owner.context, action === "update-profile" ? { action, id: DEFAULT_PROFILE_ID, name: "Changed", grants: [] } : { action, id: DEFAULT_PROFILE_ID })).rejects.toMatchObject({ status: 409 });
    }
    await service.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: DEFAULT_PROFILE_ID });
    expect((await service.mutate(owner.context, { action: "delete-profile", id: restricted.id })).profiles.some(p => p.id === restricted.id)).toBe(false);
  });

  it("denies owner administration to a real member through both HTTP and direct service calls", async () => {
    const member = await actor("member"), services = root();
    const get = await createAccessGetHandler(services)(new Request("https://auth.test/api/crm/access", { headers: member.headers }));
    expect(get.status).toBe(403);
    const post = await createAccessPostHandler(services)(new Request("https://auth.test/api/crm/access", { method: "POST", headers: member.headers, body: JSON.stringify({ action: "create-branch", name: "Forbidden" }) }));
    expect(post.status).toBe(403);
    await expect(services.access.settings(member.context)).rejects.toMatchObject({ status: 403 });
    await expect(services.access.mutate(member.context, { action: "create-profile", name: "Forbidden", grants: [] })).rejects.toMatchObject({ status: 403 });
  });

  it("manages branch names, primary assignment, default selection and archive protection", async () => {
    const owner = await actor(), member = await actor("member"), service = root().access;
    const first = await createBranch(owner.context, "North"), second = await createBranch(owner.context, "South");
    const renamed = await service.mutate(owner.context, { action: "rename-branch", id: first.id, name: "Northern office" });
    expect(renamed.branches.find(b => b.id === first.id)?.name).toBe("Northern office");
    const assigned = await service.mutate(owner.context, { action: "assign-branches", membershipId: member.userId, branchIds: [first.id, second.id], primaryBranchId: second.id });
    expect(assigned.members.find(m => m.membershipId === member.userId)).toMatchObject({ branchIds: expect.arrayContaining([first.id, second.id]), primaryBranchId: second.id });
    await expect(service.mutate(owner.context, { action: "archive-branch", id: first.id })).rejects.toMatchObject({ status: 409 });
    await service.mutate(owner.context, { action: "assign-branches", membershipId: member.userId, branchIds: [], primaryBranchId: null });
    await service.mutate(owner.context, { action: "set-default-branch", id: first.id });
    await expect(service.mutate(owner.context, { action: "archive-branch", id: first.id })).rejects.toMatchObject({ status: 409 });
    await service.mutate(owner.context, { action: "set-default-branch", id: second.id });
    const archived = await service.mutate(owner.context, { action: "archive-branch", id: first.id });
    expect(archived.branches.find(b => b.id === first.id)?.archivedAt).toEqual(expect.any(String));
    await expect(service.mutate(owner.context, { action: "set-default-branch", id: first.id })).rejects.toMatchObject({ status: 400 });
    const restored = await service.mutate(owner.context, { action: "restore-branch", id: first.id });
    expect(restored.branches.find(b => b.id === first.id)?.archivedAt).toBeNull();
  });

  it("rolls back branch replacement when one selected branch is archived", async () => {
    const owner = await actor(), member = await actor("member"), service = root().access;
    const active = await createBranch(owner.context, "Active"), archived = await createBranch(owner.context, "Archived");
    await service.mutate(owner.context, { action: "assign-branches", membershipId: member.userId, branchIds: [active.id], primaryBranchId: active.id });
    await service.mutate(owner.context, { action: "archive-branch", id: archived.id });
    await expect(service.mutate(owner.context, { action: "assign-branches", membershipId: member.userId, branchIds: [active.id, archived.id], primaryBranchId: archived.id })).rejects.toMatchObject({ status: 400 });
    expect((await service.settings(owner.context)).members.find(m => m.membershipId === member.userId)).toMatchObject({ branchIds: [active.id], primaryBranchId: active.id });
  });

  it("clears revoked member branches and restores membership without reviving old assignments", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const assigned = await createBranch(owner.context, "Assigned");
    const restricted = await profile(owner.context, []);
    await services.access.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: restricted.id });
    await services.access.mutate(owner.context, { action: "assign-branches", membershipId: member.userId, branchIds: [assigned.id], primaryBranchId: assigned.id });
    await services.members.remove(owner.context, member.userId);
    expect((await services.access.settings(owner.context)).members.find(m => m.membershipId === member.userId)).toMatchObject({ status: "revoked", branchIds: [], primaryBranchId: null, profileId: restricted.id });
    await expect(services.access.mutate(owner.context, { action: "assign-branches", membershipId: member.userId, branchIds: [assigned.id], primaryBranchId: assigned.id })).rejects.toMatchObject({ status: 404 });
    await services.members.restore(owner.context, member.userId);
    expect((await services.access.settings(owner.context)).members.find(m => m.membershipId === member.userId)).toMatchObject({ status: "active", branchIds: [], primaryBranchId: null, profileId: restricted.id });
  });

  it("enforces direct company write grants while retaining shared reads and owner bypass", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const restricted = await profile(owner.context);
    await services.access.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: restricted.id });
    await services.access.mutate(owner.context, { action: "assign-profile", membershipId: owner.userId, profileId: restricted.id });
    const record = await services.companies.create(owner.context, { name: "Shared" });
    expect((await services.companies.list(member.context, companyListInputSchema.parse({}))).rows.map(c => c.id)).toContain(record.id);
    expect(await services.companies.byId(member.context, record.id)).toMatchObject({ name: "Shared" });
    await expect(services.companies.create(member.context, { name: "Denied" })).rejects.toMatchObject({ status: 403 });
    await expect(services.companies.update(member.context, record.id, { name: "Denied" })).rejects.toMatchObject({ status: 403 });
    await expect(services.companies.archive(member.context, record.id)).rejects.toMatchObject({ status: 403 });
    await expect(services.companies.bulkArchive(member.context, [record.id])).rejects.toMatchObject({ status: 403 });
    await services.companies.archive(owner.context, record.id);
    await expect(services.companies.archive(member.context, record.id, true)).rejects.toMatchObject({ status: 403 });
    await expect(services.companies.bulkArchive(member.context, [record.id], true)).rejects.toMatchObject({ status: 403 });
  });

  it("requires assign permission as well as create or update for owner changes", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const restricted = await profile(owner.context, ["company.create", "company.update"]);
    await services.access.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: restricted.id });
    const record = await services.companies.create(member.context, { name: "Unassigned" });
    await services.companies.update(member.context, record.id, { name: "Updated" });
    await expect(services.companies.create(member.context, { name: "Assigned", ownerMembershipId: member.userId })).rejects.toMatchObject({ status: 403 });
    await expect(services.companies.update(member.context, record.id, { ownerMembershipId: member.userId })).rejects.toMatchObject({ status: 403 });
    await expect(services.companies.update(member.context, record.id, { ownerMembershipId: null })).rejects.toMatchObject({ status: 403 });
    await services.access.mutate(owner.context, { action: "update-profile", id: restricted.id, name: restricted.name, grants: ["company.create", "company.update", "company.assign"] });
    await expect(services.companies.update(member.context, record.id, { ownerMembershipId: member.userId })).resolves.toMatchObject({ id: record.id });
  });

  it("rejects a stale precheck and rolls back earlier writes in the same D1 batch", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    const restricted = await profile(owner.context, ["company.create"]);
    await services.access.mutate(owner.context, { action: "assign-profile", membershipId: member.userId, profileId: restricted.id });
    await requirePermission(services.db, member.context, ["company.create"]);
    const guard = actionGuard(services.db, member.context, ["company.create"]);
    await services.access.mutate(owner.context, { action: "update-profile", id: restricted.id, name: restricted.name, grants: [] });
    const id = crypto.randomUUID(), now = new Date();
    const failure = await services.db.batch([
      services.db.insert(company).values({ id, name: "Must roll back", createdAt: now, updatedAt: now }),
      guard.begin,
      guard.end,
    ]).then(() => null, error => error);
    expect(`${failure} ${failure?.cause}`).toContain("action_permission_required");
    expect(await services.db.select().from(company).where(eq(company.id, id))).toEqual([]);
    expect(await env.DB.prepare("SELECT COUNT(*) AS count FROM action_operation_guard").first("count")).toBe(0);
  });

  it("rejects a membership revoked after the permission precheck", async () => {
    const owner = await actor(), member = await actor("member"), services = root();
    await requirePermission(services.db, member.context, ["company.create"]);
    const guard = actionGuard(services.db, member.context, ["company.create"]);
    await services.members.remove(owner.context, member.userId);
    const id = crypto.randomUUID(), now = new Date();
    const failure = await services.db.batch([
      guard.begin,
      services.db.insert(company).values({ id, name: "Revoked actor", createdAt: now, updatedAt: now }),
      guard.end,
    ]).then(() => null, error => error);
    expect(`${failure} ${failure?.cause}`).toContain("action_permission_required");
    expect(await services.db.select().from(company).where(eq(company.id, id))).toEqual([]);
  });


  it("distinguishes state conflicts from revoked write permission", async () => {
    const member = await actor("member"), services = root();
    const stateFailure = await services.db.insert(operationConditionGuard).values({ id: crypto.randomUUID(), authorized: 0 }).then(() => null, error => error);
    expect(() => currencyError(stateFailure)).toThrow(expect.objectContaining({ status: 409, code: "conflict" }));
    await services.db.update(singletonMembership).set({ status: "revoked" }).where(eq(singletonMembership.userId, member.userId));
    const guard = actionGuard(services.db, member.context, ["company.create"]);
    const permissionFailure = await services.db.batch([guard.begin, guard.end]).then(() => null, error => error);
    expect(() => permissionError(permissionFailure)).toThrow(expect.objectContaining({ status: 403, code: "permission_required" }));
  });

});
