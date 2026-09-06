import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { reconcileSingletonMembership } from "@/lib/services/members/singleton-workspace";
import { createDatabase } from "@/lib/db/database";
import {
  activity,
  activityVisibility,
  company,
  contact,
  customFieldDefinition,
  customFieldValue,
  deal,
  savedView,
  session,
  singletonMembership,
  singletonWorkspace,
  user,
} from "@/lib/db/schema";
import { MemberService } from "@/lib/services/members/member-service";
import type { RequestContext } from "@/lib/http/request-context";

const db = createDatabase(env.DB);
const service = new MemberService(db);

function context(userId: string, role: "owner" | "member") {
  return {
    userId,
    membershipId: userId,
    role,
    requestId: `request-${userId}`,
  } as RequestContext;
}

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
    env.DB.prepare("UPDATE singleton_membership SET role = 'owner', status = 'active' WHERE user_id = 'sentinel-owner'"),
    env.DB.prepare(
      "UPDATE singleton_membership SET role = 'member' WHERE user_id != 'sentinel-owner' AND role = 'owner'",
    ),
    env.DB.prepare("DELETE FROM singleton_membership WHERE user_id != 'sentinel-owner'"),
    env.DB.prepare("UPDATE singleton_workspace SET owner_user_id = 'sentinel-owner'"),
    env.DB.prepare("DELETE FROM user WHERE id != 'sentinel-owner'"),
  ]);
}

async function addUser(id: string, role: "owner" | "member", status: "active" | "revoked" = "active") {
  const now = new Date();
  await db.insert(user).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  await db.insert(singletonMembership).values({
    userId: id,
    role,
    status,
    createdAt: now,
    updatedAt: now,
  });
}

describe.sequential("singleton membership foundation", () => {
  beforeEach(clearState);

  it("promotes, demotes, restores, and protects the last owner", async () => {
    await addUser("member-a", "member");
    const events: Array<{ code: string; outcome: string }> = [];
    const auditedService = new MemberService(db, (event) => events.push(event));

    await auditedService.changeRole(context("sentinel-owner", "owner"), "member-a", "owner");
    await auditedService.changeRole(context("member-a", "owner"), "sentinel-owner", "member");
    await expect(
      auditedService.changeRole(context("member-a", "owner"), "member-a", "member"),
    ).rejects.toMatchObject({ status: 409, code: "conflict" });

    await auditedService.remove(context("member-a", "owner"), "sentinel-owner");
    await auditedService.restore(context("member-a", "owner"), "sentinel-owner");
    expect(events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "membership.role_changed", outcome: "succeeded" }),
        expect.objectContaining({ code: "membership.removed", outcome: "succeeded" }),
        expect.objectContaining({ code: "membership.restored", outcome: "succeeded" }),
      ]),
    );
    expect(
      await db.query.singletonMembership.findFirst({
        where: eq(singletonMembership.userId, "sentinel-owner"),
      }),
    ).toMatchObject({ role: "member", status: "active" });
  });

  it("rejects membership management by a member", async () => {
    await addUser("member-a", "member");
    await expect(
      service.changeRole(context("member-a", "member"), "sentinel-owner", "member"),
    ).rejects.toMatchObject({ status: 403, code: "owner_required" });
  });

  it("rejects a mutation after the actor loses owner access", async () => {
    await addUser("owner-b", "owner");
    await addUser("member-a", "member");
    const staleContext = context("sentinel-owner", "owner");
    await db
      .update(singletonMembership)
      .set({ role: "member", updatedAt: new Date() })
      .where(eq(singletonMembership.userId, "sentinel-owner"));

    await expect(service.remove(staleContext, "member-a", "owner-b")).rejects.toMatchObject({
      status: 403,
      code: "owner_required",
    });
    expect(
      await db.query.singletonMembership.findFirst({
        where: eq(singletonMembership.userId, "member-a"),
      }),
    ).toMatchObject({ status: "active" });
  });

  it("removes a member and atomically reassigns every active reference", async () => {
    await addUser("member-a", "member");
    const now = new Date();
    await db.insert(company).values({
      id: "company-a",
      name: "Company A",
      ownerMembershipId: "member-a",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(contact).values({
      id: "contact-a",
      firstName: "Contact",
      companyId: "company-a",
      ownerMembershipId: "member-a",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(deal).values({
      id: "deal-a",
      name: "Deal A",
      companyId: "company-a",
      ownerMembershipId: "member-a",
      stageId: "demo-booked",
      stageChangedAt: now,
      currency: "USD",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(customFieldDefinition).values({
      id: "field-a",
      entity: "company",
      key: "account-manager",
      label: "Account manager",
      type: "user",
      position: 10,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(customFieldValue).values({
      id: "value-a",
      fieldId: "field-a",
      companyId: "company-a",
      userMembershipId: "member-a",
      updatedAt: now,
    });
    await db.insert(activity).values({
      id: "activity-a",
      type: "task",
      companyId: "company-a",
      authorUserId: "member-a",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(activityVisibility).values({
      activityId: "activity-a",
      membershipId: "member-a",
    });
    await db.insert(savedView).values({
      id: "view-a",
      entity: "company",
      name: "My companies",
      stateJson: "{}",
      ownerMembershipId: "member-a",
      creatorUserId: "member-a",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(session).values({
      id: "session-a",
      token: "token-a",
      userId: "member-a",
      expiresAt: new Date(now.getTime() + 60_000),
      createdAt: now,
      updatedAt: now,
    });

    await service.remove(context("sentinel-owner", "owner"), "member-a");

    expect(await db.query.company.findFirst()).toMatchObject({ ownerMembershipId: "sentinel-owner" });
    expect(await db.query.contact.findFirst()).toMatchObject({ ownerMembershipId: "sentinel-owner" });
    expect(await db.query.deal.findFirst()).toMatchObject({ ownerMembershipId: "sentinel-owner" });
    expect(await db.query.customFieldValue.findFirst()).toMatchObject({
      userMembershipId: "sentinel-owner",
    });
    expect(await db.query.savedView.findFirst()).toMatchObject({ ownerMembershipId: null, creatorUserId: "member-a" });
    expect(await db.select().from(activityVisibility)).toHaveLength(0);
    expect(await db.select().from(session)).toHaveLength(0);
    expect(await db.query.activity.findFirst()).toMatchObject({ authorUserId: "member-a" });
    expect(await db.query.singletonMembership.findFirst({
      where: eq(singletonMembership.userId, "member-a"),
    })).toMatchObject({ status: "revoked" });
  });

  it("keeps revoked users out of automatic enrollment", async () => {
    await addUser("revoked-a", "member", "revoked");
    await expect(reconcileSingletonMembership(db, "revoked-a")).rejects.toThrow(
      "Membership is revoked",
    );
  });

  it("rejects new USER values and task visibility for revoked members", async () => {
    await addUser("revoked-a", "member", "revoked");
    const now = new Date();
    await db.insert(company).values({
      id: "company-a",
      name: "Company A",
      ownerMembershipId: "sentinel-owner",
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(customFieldDefinition).values({
      id: "field-a",
      entity: "company",
      key: "account-manager",
      label: "Account manager",
      type: "user",
      position: 10,
      createdAt: now,
      updatedAt: now,
    });
    let fieldError: unknown;
    try {
      await db.insert(customFieldValue).values({
        id: "value-a",
        fieldId: "field-a",
        companyId: "company-a",
        userMembershipId: "revoked-a",
        updatedAt: now,
      });
    } catch (error) {
      fieldError = error;
    }
    expect((fieldError as { cause?: Error }).cause?.message).toContain(
      "field_member_inactive",
    );

    await db.insert(activity).values({
      id: "activity-a",
      type: "task",
      companyId: "company-a",
      authorUserId: "sentinel-owner",
      createdAt: now,
      updatedAt: now,
    });
    let visibilityError: unknown;
    try {
      await db.insert(activityVisibility).values({
        activityId: "activity-a",
        membershipId: "revoked-a",
      });
    } catch (error) {
      visibilityError = error;
    }
    expect((visibilityError as { cause?: Error }).cause?.message).toContain(
      "activity membership is inactive",
    );
  });
});
