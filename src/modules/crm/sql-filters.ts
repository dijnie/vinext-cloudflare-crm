import { sql, type SQLWrapper } from "drizzle-orm";

// One bound JSON array leaves room for other filters and mutation parameters.
export function inJsonArray(column: SQLWrapper, values: readonly string[]) {
  return sql`${column} in (select value from json_each(${JSON.stringify(values)}))`;
}
