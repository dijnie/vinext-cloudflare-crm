import { describe, expect, it } from "vitest";

import type { CompositionRoot } from "@/lib/composition-root";
import { requireRequestContext } from "@/lib/http/request-context";

function rootWith(sessionValue: unknown, membershipValue: unknown) {
  return {
    auth: { api: { getSession: async () => sessionValue } },
    db: {
      query: {
        singletonMembership: { findFirst: async () => membershipValue },
      },
    },
  } as unknown as CompositionRoot;
}

describe("request context", () => {
  it("rejects unauthenticated requests", async () => {
    await expect(
      requireRequestContext(new Headers(), rootWith(null, null)),
    ).rejects.toMatchObject({ status: 401, code: "authentication_required" });
  });

  it("rejects verified users without active membership", async () => {
    await expect(
      requireRequestContext(
        new Headers(),
        rootWith({ user: { id: "user-a", emailVerified: true } }, null),
      ),
    ).rejects.toMatchObject({ status: 403, code: "membership_required" });
  });

  it("creates a branded context for a verified active member", async () => {
    await expect(
      requireRequestContext(
        new Headers({ "cf-ray": "request-a" }),
        rootWith(
          { user: { id: "user-a", emailVerified: true } },
          { userId: "user-a", role: "owner", status: "active" },
        ),
      ),
    ).resolves.toMatchObject({
      userId: "user-a",
      membershipId: "user-a",
      role: "owner",
      requestId: "request-a",
    });
  });
});
