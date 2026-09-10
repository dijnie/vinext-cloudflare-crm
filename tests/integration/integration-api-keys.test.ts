import { applyD1Migrations, env } from "cloudflare:test";
import { beforeEach, expect, it } from "vitest";
import { createCompositionRoot, type RuntimeEnv } from "@/lib/composition-root";
import type { AuthEmailAdapter } from "@/lib/email/email-adapter";
import type { RequestContext } from "@/lib/http/request-context";

const adapter: AuthEmailAdapter = {
  async sendVerification() {},
  async sendPasswordReset() {},
};
async function setup() {
  const id = crypto.randomUUID(),
    now = Date.now();
  await env.DB.prepare(
    "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES(?,?,?,1,?,?)",
  )
    .bind(id, "Key owner", `${id}@example.com`, now, now)
    .run();
  await env.DB.prepare(
    "INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES(?,'owner','active',?,?)",
  )
    .bind(id, now, now)
    .run();
  return {
    root: createCompositionRoot(env as unknown as RuntimeEnv, adapter),
    context: {
      userId: id,
      membershipId: id,
      role: "owner",
      user: { name: "Key owner", email: `${id}@example.com` },
      requestId: crypto.randomUUID(),
    } as RequestContext,
  };
}

beforeEach(async () => {
  await env.DB.prepare("DELETE FROM integration_app_audit").run();
  await env.DB.prepare("DELETE FROM integration_app").run();
});

it("issues one-time 32-hex keys, rotates and records lifecycle audit without raw credentials", async () => {
  const { root, context } = await setup(),
    created = await root.integrations.createApp(context, {
      name: "Website",
      grants: ["contacts.read"],
    });
  expect(created.token).toMatch(/^[0-9a-f]{32}$/);
  const listed = await root.integrations.apps(context);
  expect(listed).toEqual([
    expect.objectContaining({
      id: created.id,
      tokenHint: created.token.slice(-4),
      lastUsedAt: null,
      grants: ["contacts.read"],
    }),
  ]);
  expect(JSON.stringify(listed)).not.toContain(created.token);
  await root.integrations.appContacts(created.token);
  await expect(root.integrations.appLeads(created.token)).rejects.toMatchObject(
    {
      status: 401,
      code: "authentication_required",
    },
  );
  const used = (await root.integrations.apps(context))[0]!;
  expect(used.lastUsedAt).toBeInstanceOf(Date);
  const rotated = await root.integrations.rotateApp(
    context,
    created.id,
    used.revision,
  );
  expect(rotated.token).toMatch(/^[0-9a-f]{32}$/);
  expect(rotated.token).not.toBe(created.token);
  await expect(
    root.integrations.appContacts(created.token),
  ).rejects.toMatchObject({ status: 401 });
  await expect(
    root.integrations.revokeApp(context, created.id, used.revision),
  ).rejects.toMatchObject({ status: 409, code: "conflict" });
  expect(
    await env.DB.prepare(
      "SELECT count(*) count FROM integration_app_audit WHERE app_id=?",
    )
      .bind(created.id)
      .first(),
  ).toEqual({ count: 2 });
  await root.integrations.appContacts(rotated.token);
  await root.integrations.revokeApp(context, created.id, rotated.revision);
  await expect(
    root.integrations.appContacts(rotated.token),
  ).rejects.toMatchObject({ status: 401 });
  const audit = (
    await env.DB.prepare(
      "SELECT action,outcome FROM integration_app_audit WHERE app_id=? ORDER BY created_at,id",
    )
      .bind(created.id)
      .all()
  ).results;
  expect(audit.map((row) => row.action).sort()).toEqual([
    "created",
    "revoked",
    "rotated",
  ]);
  expect(audit.every((row) => row.outcome === "success")).toBe(true);
  const stored = await env.DB.prepare(
    "SELECT token_hash,token_hint FROM integration_app WHERE id=?",
  )
    .bind(created.id)
    .first<{ token_hash: string; token_hint: string }>();
  expect(stored?.token_hash).toMatch(/^[0-9a-f]{64}$/);
  expect(stored?.token_hash).not.toContain(rotated.token);
  expect(stored?.token_hint).toBe(rotated.token.slice(-4));
});

it("allows only the active owner to manage workspace keys", async () => {
  const { root, context } = await setup(),
    created = await root.integrations.createApp(context, {
      name: "Owner key",
      grants: ["contacts.read"],
    });
  await env.DB.prepare(
    "UPDATE singleton_membership SET role='member' WHERE user_id=?",
  )
    .bind(context.userId)
    .run();
  await expect(root.integrations.apps(context)).rejects.toMatchObject({
    status: 403,
    code: "owner_required",
  });
  await expect(
    root.integrations.createApp(context, {
      name: "Denied",
      grants: ["contacts.read"],
    }),
  ).rejects.toMatchObject({ status: 403, code: "owner_required" });
  await expect(
    root.integrations.rotateApp(context, created.id, 0),
  ).rejects.toMatchObject({ status: 403, code: "owner_required" });
  await expect(
    root.integrations.revokeApp(context, created.id, 0),
  ).rejects.toMatchObject({ status: 403, code: "owner_required" });
  expect(
    await env.DB.prepare(
      "SELECT status,revision FROM integration_app WHERE id=?",
    )
      .bind(created.id)
      .first(),
  ).toEqual({ status: "active", revision: 0 });
});

it("authenticates a stored legacy crm credential", async () => {
  const { root, context } = await setup(),
    created = await root.integrations.createApp(context, {
      name: "Legacy",
      grants: ["contacts.read"],
    }),
    token = `crm_${"d".repeat(64)}`,
    digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token),
    ),
    tokenHash = [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  await env.DB.prepare(
    "UPDATE integration_app SET token_hash=?,token_hint=NULL WHERE id=?",
  )
    .bind(tokenHash, created.id)
    .run();
  await expect(root.integrations.appContacts(token)).resolves.toEqual([]);
});

it("adds nullable metadata to populated legacy integration keys", async () => {
  const db = env.UPGRADE_DB,
    index = env.TEST_MIGRATIONS.findIndex(
      (item) => item.name === "0023_integration_api_keys.sql",
    );
  expect(index).toBe(22);
  await applyD1Migrations(db, env.TEST_MIGRATIONS.slice(0, index));
  await db.batch([
    db.prepare(
      "INSERT INTO user(id,name,email,email_verified,created_at,updated_at) VALUES('legacy-key-owner','Legacy','legacy-key@example.invalid',1,1,1)",
    ),
    db.prepare(
      "INSERT INTO singleton_membership(user_id,role,status,created_at,updated_at) VALUES('legacy-key-owner','owner','active',1,1)",
    ),
    db.prepare(
      "INSERT INTO integration_app(id,name,token_hash,grants_json,authority_membership_id,status,revision,created_at,updated_at) VALUES('legacy-key','Legacy key','legacy-hash','[\"contacts.read\"]','legacy-key-owner','active',0,1,1)",
    ),
  ]);
  await applyD1Migrations(db, [env.TEST_MIGRATIONS[index]!]);
  expect(
    await db
      .prepare(
        "SELECT id,token_hint,last_used_at FROM integration_app WHERE id='legacy-key'",
      )
      .first(),
  ).toEqual({ id: "legacy-key", token_hint: null, last_used_at: null });
  expect((await db.prepare("PRAGMA foreign_key_check").all()).results).toEqual(
    [],
  );
});
