import { and } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { describe, expect, it } from "vitest";
import { company } from "@/db/schema";
import { inJsonArray } from "@/crm/sql-filters";

const dialect = new SQLiteSyncDialect();
describe("JSON array SQL filters", () => {
  it("binds each 100-value filter as a single parameter", () => {
    const values = Array.from({ length: 100 }, (_, index) => `value-${index}`);
    const compiled = dialect.sqlToQuery(and(inJsonArray(company.id, values), inJsonArray(company.industry, values))!);
    expect(compiled.params).toEqual([JSON.stringify(values), JSON.stringify(values)]);
    expect(compiled.sql.match(/\?/g)).toHaveLength(2);
  });
  it("keeps punctuation and SQL-looking text inside bound JSON", () => {
    const values = ["Media, Publishing", "O'Reilly", "\"quoted\"", "'); DROP TABLE company; --", "line\nbreak"];
    const compiled = dialect.sqlToQuery(inJsonArray(company.industry, values));
    expect(compiled.params).toEqual([JSON.stringify(values)]);
    expect(compiled.sql).not.toContain("DROP TABLE");
    expect(JSON.parse(compiled.params[0] as string)).toEqual(values);
  });
  it("binds an empty selection as an empty JSON array", () => {
    expect(dialect.sqlToQuery(inJsonArray(company.id, [])).params).toEqual(["[]"]);
  });
});
