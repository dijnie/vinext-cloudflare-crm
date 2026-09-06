import { describe, expect, it } from "vitest";

import {
  requireOwnerRole,
  resolveRemovalReplacement,
} from "@/lib/services/members/member-policy";
import type { RequestContext } from "@/lib/http/request-context";

function context(role: "owner" | "member", membershipId = "actor") {
  return { userId: membershipId, membershipId, role } as RequestContext;
}

describe("member policy", () => {
  it("allows only owners to manage members", () => {
    expect(() => requireOwnerRole(context("owner"))).not.toThrow();
    expect(() => requireOwnerRole(context("member"))).toThrowError(
      expect.objectContaining({ status: 403, code: "owner_required" }),
    );
  });

  it("uses the actor as the default replacement", () => {
    expect(resolveRemovalReplacement(context("owner"), "target")).toBe("actor");
  });

  it("requires another member for self-removal", () => {
    expect(() => resolveRemovalReplacement(context("owner"), "actor")).toThrowError(
      expect.objectContaining({ status: 409, code: "conflict" }),
    );
    expect(() =>
      resolveRemovalReplacement(context("owner"), "actor", null),
    ).toThrowError(expect.objectContaining({ status: 409, code: "conflict" }));
    expect(resolveRemovalReplacement(context("owner"), "actor", "owner-b")).toBe(
      "owner-b",
    );
  });

  it("allows an owner to clear another member's references", () => {
    expect(resolveRemovalReplacement(context("owner"), "target", null)).toBeNull();
  });
});
