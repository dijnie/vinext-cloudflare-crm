import { describe, expect, it } from "vitest";
import { changeListState, listApiSearch, parseListState } from "@/crm/list-state";
describe("canonical list navigation", () => {
  it("rejects unknown, malformed and duplicate parameters", () => {
    for (const query of ["secret=x", "page=0", "pageSize=101", "recordType=deal", "recordId=bad", "columns=password", "sort=nope", "q=a&q=b", "tab=unknown"]) expect(() => parseListState("company", new URLSearchParams(query))).toThrow();
  });
  it("resets pages while retaining sheet and list context", () => {
    const before = new URLSearchParams("page=4&owner=alice&recordType=company&recordId=11111111-1111-4111-8111-111111111111");
    const next = new URLSearchParams(changeListState(before, { q: "Acme" }));
    expect(next.has("page")).toBe(false); expect(next.get("owner")).toBe("alice"); expect(next.get("recordType")).toBe("company");
    expect(listApiSearch(next)).toBe("owner=alice&q=Acme");
  });
  it("defaults to bounded newest-first lists", () => {
    expect(parseListState("deal", new URLSearchParams()).list).toMatchObject({ page: 1, pageSize: 25, dir: "desc" });
    expect(parseListState("company", new URLSearchParams("tab=fields&columns=name,field:rating"))).toMatchObject({ tab: "fields", columns: ["name", "field:rating"] });
  });
  it("preserves punctuation in repeated textual facet values", () => {
    const state = parseListState("contact", new URLSearchParams("title=VP%2C+Sales&title=CEO"));
    expect(state.list).toMatchObject({ title: ["VP, Sales", "CEO"] });
    const next = new URLSearchParams(changeListState(new URLSearchParams("page=3"), { industry: ["Media, Publishing", "Technology"] }));
    expect(next.has("page")).toBe(false);
    expect(parseListState("company", next).list).toMatchObject({ industry: ["Media, Publishing", "Technology"] });
    expect(new URLSearchParams(listApiSearch(next)).getAll("industry")).toEqual(["Media, Publishing", "Technology"]);
  });
});
