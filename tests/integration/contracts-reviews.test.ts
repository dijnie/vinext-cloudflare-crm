import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import type { RequestContext } from "@/lib/http/request-context";
const root = createCompositionRoot(env as RuntimeEnv, {
  sendVerification: async () => {},
  sendPasswordReset: async () => {},
});
let context: RequestContext, ownerId: string, companyId: string;
async function actor(role: "owner" | "member" = "owner") {
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,?,0,0)",
    ).bind(id, "B2B owner", `${id}@example.com`, 1),
    env.DB.prepare(
      "INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES(?,?,\'active\',0,0)",
    ).bind(id, role),
  ]);
  return id;
}
beforeAll(async () => {
  ownerId = await actor();
  context = {
    userId: ownerId,
    membershipId: ownerId,
    role: "owner",
    user: { name: "B2B owner", email: `${ownerId}@example.com` },
    requestId: crypto.randomUUID(),
  } as RequestContext;
  companyId = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO company(id,name,created_at,updated_at) VALUES(?,?,0,0)",
  )
    .bind(companyId, "B2B customer")
    .run();
});
describe.sequential("contracts and reviews", () => {
  it("versions idempotent contract changes and protects company relationships", async () => {
    const key = crypto.randomUUID(),
      input = {
        operationKey: key,
        name: "Annual agreement",
        companyId,
        ownerMembershipId: ownerId,
        valueMinor: 1200000,
        currency: "VND",
        effectiveAt: "2026-09-01T00:00:00.000Z",
        expiresAt: "2027-09-01T00:00:00.000Z",
        parties: [{ companyId, role: "customer" }],
      };
    const created = await root.contracts.create(context, input);
    expect((await root.contracts.create(context, input)).id).toBe(created.id);
    expect(created).toMatchObject({
      status: "draft",
      revision: 0,
      parties: [{ companyId, role: "customer" }],
    });
    const active = await root.contracts.command(context, created.id, {
      action: "status",
      operationKey: crypto.randomUUID(),
      expectedRevision: 0,
      reason: "Approved by both parties",
      status: "active",
    });
    expect(active).toMatchObject({ status: "active", revision: 1 });
    expect(active.versions.map((x) => x.version)).toEqual([1, 0]);
    await expect(
      root.contracts.command(context, created.id, {
        action: "status",
        operationKey: crypto.randomUUID(),
        expectedRevision: 1,
        reason: "Invalid reversal",
        status: "draft",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const competing = await Promise.allSettled([
      root.contracts.command(context, created.id, {
        action: "update",
        operationKey: crypto.randomUUID(),
        expectedRevision: 1,
        reason: "First writer",
        name: "First accepted name",
      }),
      root.contracts.command(context, created.id, {
        action: "update",
        operationKey: crypto.randomUUID(),
        expectedRevision: 1,
        reason: "Second writer",
        name: "Second accepted name",
      }),
    ]);
    expect(
      competing.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      competing.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);
    expect(
      (
        competing.find(
          (result) => result.status === "rejected",
        ) as PromiseRejectedResult
      ).reason,
    ).toMatchObject({ status: 409 });
    await expect(
      root.contracts.command(context, created.id, {
        action: "archive",
        operationKey: crypto.randomUUID(),
        expectedRevision: 0,
        reason: "stale",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const foreign = crypto.randomUUID(),
      contact = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO company(id,name,created_at,updated_at) VALUES(?,?,0,0)",
      ).bind(foreign, "Foreign company"),
      env.DB.prepare(
        "INSERT INTO contact(id,first_name,company_id,created_at,updated_at) VALUES(?,?,?,0,0)",
      ).bind(contact, "Foreign", foreign),
    ]);
    await expect(
      root.contracts.create(context, {
        ...input,
        operationKey: crypto.randomUUID(),
        contactId: contact,
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      root.contracts.create(context, {
        ...input,
        operationKey: crypto.randomUUID(),
        parties: [
          { companyId, role: "customer" },
          { contactId: crypto.randomUUID(), role: "signer" },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const archivedDraft = await root.contracts.create(context, {
      ...input,
      operationKey: crypto.randomUUID(),
      name: "Archived draft",
    });
    const archived = await root.contracts.command(context, archivedDraft.id, {
      action: "archive",
      operationKey: crypto.randomUUID(),
      expectedRevision: 0,
      reason: "No longer needed",
    });
    await expect(
      root.contracts.command(context, archived.id, {
        action: "status",
        operationKey: crypto.randomUUID(),
        expectedRevision: archived.revision,
        reason: "Must restore first",
        status: "active",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      root.contractDocuments.upload(
        context,
        archived.id,
        new Request("https://auth.test/api/crm/contracts/document", {
          method: "POST",
          headers: {
            "content-type": "application/octet-stream",
            "x-file-name": "blocked.txt",
          },
          body: new Uint8Array([1]),
        }),
      ),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("stores private contract document bytes in R2 and rechecks metadata access", async () => {
    const contract = await root.contracts.create(context, {
      operationKey: crypto.randomUUID(),
      name: "Document agreement",
      companyId,
      ownerMembershipId: ownerId,
      currency: "USD",
      parties: [{ companyId, role: "customer" }],
    });
    const request = new Request(
      "https://auth.test/api/crm/contracts/document",
      {
        method: "POST",
        headers: {
          "content-type": "application/octet-stream",
          "x-file-name": encodeURIComponent("signed agreement.pdf"),
        },
        body: new Uint8Array([1, 2, 3, 4]),
      },
    );
    const file = await root.contractDocuments.upload(
      context,
      contract.id,
      request,
    );
    const response = await root.contractDocuments.download(context, file.id);
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([
      1, 2, 3, 4,
    ]);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(
      (await root.contracts.byId(context, contract.id)).documents,
    ).toContainEqual(
      expect.objectContaining({ id: file.id, name: "signed agreement.pdf" }),
    );
  });
  it("retries cleanup for failed contract document objects", async () => {
    const parent = await root.contracts.create(context, {
      operationKey: crypto.randomUUID(),
      name: "Cleanup agreement",
      companyId,
      ownerMembershipId: ownerId,
      currency: "USD",
      parties: [{ companyId, role: "customer" }],
    });
    const id = crypto.randomUUID(),
      objectKey = crypto.randomUUID();
    await env.CRM_FILES.put(objectKey, new Uint8Array([9, 8, 7]));
    await env.DB.prepare(
      "INSERT INTO contract_document(id,contract_id,object_key,file_name,size,status,uploader_id,created_at) VALUES(?,?,?,?,?,'failed',?,?)",
    )
      .bind(
        id,
        parent.id,
        objectKey,
        "orphan.bin",
        3,
        ownerId,
        Date.now() - 172800000,
      )
      .run();
    expect(await root.contractDocuments.cleanup(context)).toEqual({
      cleaned: 1,
      failed: 0,
    });
    expect(await env.CRM_FILES.get(objectKey)).toBeNull();
    expect(
      await env.DB.prepare("SELECT status FROM contract_document WHERE id=?")
        .bind(id)
        .first(),
    ).toEqual({ status: "cleaning" });
  });
  it("deduplicates source events and normalizes manual review tags", async () => {
    const input = {
      source: "manual",
      eventId: crypto.randomUUID(),
      companyId,
      content: "Helpful support",
      rating: 5,
      tags: ["VIP", " vip ", "Support"],
    };
    const first = await root.reviews.create(context, input),
      retry = await root.reviews.create(context, input);
    expect(retry).toEqual(first);
    expect(first.tags).toEqual(["support", "vip"]);
    const edited = await root.reviews.update(context, first.id, {
      expectedRevision: 0,
      content: "Updated support review",
      rating: 4,
      tags: ["Follow-up"],
    });
    expect(edited).toMatchObject({
      content: "Updated support review",
      rating: 4,
      tags: ["follow-up"],
      revision: 1,
    });
    const archived = await root.reviews.update(context, first.id, {
      expectedRevision: 1,
      archived: true,
    });
    expect(archived.archivedAt).not.toBeNull();
    expect(
      (await root.reviews.list(context, true)).rows.map((row) => row.id),
    ).toContain(first.id);
    const restored = await root.reviews.update(context, first.id, {
      expectedRevision: 2,
      archived: false,
    });
    expect(restored).toMatchObject({ archivedAt: null, revision: 3 });
    await expect(
      root.reviews.create(context, { ...input, content: "Different payload" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      root.reviews.create(context, {
        ...input,
        eventId: crypto.randomUUID(),
        rating: 6,
      }),
    ).rejects.toThrow();
  });
  it("hands required contract ownership to an active replacement before revocation", async () => {
    const target = await actor("member"),
      replacement = await actor("member"),
      contract = await root.contracts.create(context, {
        operationKey: crypto.randomUUID(),
        name: "Owned contract",
        companyId,
        ownerMembershipId: target,
        currency: "USD",
        parties: [{ companyId, role: "customer" }],
      });
    await root.members.remove(context, target, replacement);
    const handedOff = await root.contracts.byId(context, contract.id);
    expect(handedOff).toMatchObject({
      ownerMembershipId: replacement,
      revision: 1,
    });
    expect(handedOff.versions).toEqual([
      expect.objectContaining({
        version: 1,
        reason: "Owner reassigned because member access was revoked",
      }),
      expect.objectContaining({ version: 0 }),
    ]);
    const version = await env.DB.prepare(
      "SELECT snapshot_json FROM contract_version WHERE contract_id=? AND version=1",
    )
      .bind(contract.id)
      .first<{ snapshot_json: string }>();
    expect(JSON.parse(version!.snapshot_json)).toMatchObject({
      id: contract.id,
      ownerMembershipId: replacement,
      creatorUserId: ownerId,
      revision: 1,
      parties: [{ companyId, contactId: null, role: "customer" }],
    });
    expect(JSON.parse(version!.snapshot_json).createdAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T/,
    );
    expect(
      await env.DB.prepare(
        "SELECT status FROM singleton_membership WHERE user_id=?",
      )
        .bind(target)
        .first(),
    ).toEqual({ status: "revoked" });
  });
});
