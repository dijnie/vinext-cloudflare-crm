import { describe, expect, it } from "vitest";
import { activityCreateInputSchema, activityCompleteInputSchema, timelineInputSchema, ownershipInputSchema } from "@/crm/contracts/activity-contract";

const id = "11111111-1111-4111-8111-111111111111";
describe("activity and ownership contracts", () => {
  it("requires an anchor and a nonblank task subject", () => {
    for (const input of [{ type: "note" }, { type: "note", companyId: null }, { type: "task", companyId: id }, { type: "task", companyId: id, subject: "  " }]) {
      expect(activityCreateInputSchema.safeParse(input).success).toBe(false);
    }
    expect(activityCreateInputSchema.parse({ type: "task", contactId: id, subject: " Follow up " }).subject).toBe("Follow up");
  });
  it("rejects client authorship and system stage events", () => {
    for (const field of [{ authorId: id }, { author: { id } }, { metadata: { fromStageId: "new", toStageId: "won" } }, { type: "stage_change" }]) {
      expect(activityCreateInputSchema.safeParse({ type: "note", companyId: id, ...field }).success).toBe(false);
    }
    expect(activityCompleteInputSchema.safeParse({ completed: true, content: "rewrite" }).success).toBe(false);
  });
  it("allows due dates only on tasks", () => {
    const dueAt = "2026-09-08T10:00:00.000Z";
    expect(activityCreateInputSchema.safeParse({ type: "task", companyId: id, subject: "Call", dueAt }).success).toBe(true);
    for (const type of ["note", "call", "meeting"]) expect(activityCreateInputSchema.safeParse({ type, companyId: id, dueAt }).success).toBe(false);
  });
  it("validates stable timeline cursors and bounded page sizes", () => {
    const base = { entity: "company", recordId: id };
    expect(timelineInputSchema.parse(base)).toMatchObject({ filter: "all", limit: 30 });
    expect(timelineInputSchema.safeParse({ ...base, cursor: `1788537600000:${id}` }).success).toBe(true);
    for (const cursor of ["bad", `-1:${id}`, `1.5:${id}`, "1:------------------------------------"]) expect(timelineInputSchema.safeParse({ ...base, cursor }).success).toBe(false);
    for (const limit of [0, 101, 1.5]) expect(timelineInputSchema.safeParse({ ...base, limit }).success).toBe(false);
  });
  it("permits unassignment for companies and contacts but requires a deal owner", () => {
    for (const entity of ["company", "contact"]) expect(ownershipInputSchema.safeParse({ entity, ids: [id], ownerMembershipId: null }).success).toBe(true);
    expect(ownershipInputSchema.safeParse({ entity: "deal", ids: [id], ownerMembershipId: null }).success).toBe(false);
    expect(ownershipInputSchema.safeParse({ entity: "deal", ids: [id], ownerMembershipId: "member" }).success).toBe(true);
  });
  it("bounds bulk selections before deduplicating IDs", () => {
    const base = { entity: "company", ownerMembershipId: null };
    expect(ownershipInputSchema.parse({ ...base, ids: [id, id] }).ids).toEqual([id]);
    for (const ids of [[], Array(101).fill(id), ["invalid"]]) expect(ownershipInputSchema.safeParse({ ...base, ids }).success).toBe(false);
  });
});
