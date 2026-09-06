import { describe, expect, it } from "vitest";
import { accessMutationSchema } from "@/lib/services/permissions/access-contracts";

describe("access mutation contracts", () => {
  it("rejects unsupported, duplicate, and administrative pseudo-grants", () => {
    for (const grants of [["company.read"], ["member.manage"], ["company.create", "company.create"]]) {
      expect(accessMutationSchema.safeParse({ action: "create-profile", name: "Restricted", grants }).success).toBe(false);
    }
    expect(accessMutationSchema.safeParse({ action: "create-profile", name: "Restricted", grants: [] }).success).toBe(true);
  });

  it("requires exactly one selected primary branch for nonempty branch assignments", () => {
    for (const assignment of [
      { branchIds: ["a"], primaryBranchId: null },
      { branchIds: ["a"], primaryBranchId: "b" },
      { branchIds: [], primaryBranchId: "a" },
      { branchIds: ["a", "a"], primaryBranchId: "a" },
    ]) {
      expect(accessMutationSchema.safeParse({ action: "assign-branches", membershipId: "member", ...assignment }).success).toBe(false);
    }
    for (const assignment of [
      { branchIds: [], primaryBranchId: null },
      { branchIds: ["a", "b"], primaryBranchId: "b" },
    ]) {
      expect(accessMutationSchema.safeParse({ action: "assign-branches", membershipId: "member", ...assignment }).success).toBe(true);
    }
  });

  it("normalizes names and rejects empty names, oversized assignments and unknown fields", () => {
    expect(accessMutationSchema.parse({ action: "create-branch", name: "  North  " })).toEqual({ action: "create-branch", name: "North" });
    for (const input of [
      { action: "create-branch", name: "   " },
      { action: "rename-branch", id: "branch", name: "a".repeat(121) },
      { action: "create-profile", name: "Restricted", grants: [], role: "owner" },
      { action: "assign-branches", membershipId: "member", branchIds: Array.from({ length: 101 }, (_, i) => `branch-${i}`), primaryBranchId: "branch-0" },
    ]) expect(accessMutationSchema.safeParse(input).success).toBe(false);
  });
});
