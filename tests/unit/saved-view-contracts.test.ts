import { describe, expect, it } from "vitest";
import { captureSavedViewState, savedViewCreateSchema, validateSavedViewState } from "@/views/saved-view-contracts";
import { parseListState } from "@/crm/list-state";

describe("saved view URL contracts", () => {
  it("round-trips filters and custom columns while removing ephemeral navigation", () => {
    const url = new URLSearchParams({ q: "A & B", industry: "Media, Publishing", fields: JSON.stringify({ category: ["option-a", "option-b"] }), columns: "name,field:category", archived: "true", sort: "name", dir: "asc", page: "5", recordType: "company", recordId: crypto.randomUUID(), tab: "fields", view: crypto.randomUUID() });
    const state = captureSavedViewState("company", url);
    const restored = new URLSearchParams(state.query);
    for (const key of ["page", "recordType", "recordId", "tab", "view"]) expect(restored.has(key)).toBe(false);
    expect(restored.get("q")).toBe("A & B");
    expect(parseListState("company", restored)).toMatchObject({ columns: ["name", "field:category"], list: { page: 1, archived: true, fields: { category: ["option-a", "option-b"] } } });
    expect(validateSavedViewState("company", state)).toEqual(state);
  });
  it("rejects unknown versions, forbidden navigation, wrong-entity filters and malicious fields", () => {
    for (const query of ["page=2", "recordId=x", "tab=fields", "view=x", "tenant=x", "sort=password", "stage=closed-won", "columns=email", "columns=field:bad%27key", `fields=${encodeURIComponent('{"bad-key":["x"]}')}`]) expect(() => validateSavedViewState("company", { version: 1, query })).toThrow();
    for (const state of [{ version: 2, query: "" }, { query: "" }, { version: 1, query: "", unsafe: true }, null]) expect(() => validateSavedViewState("company", state)).toThrow();
    expect(savedViewCreateSchema.safeParse({ entity: "company", name: "x", state: { version: 1, query: "" }, ownerMembershipId: "other" }).success).toBe(false);
  });
});
