import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type AppDatabase = ReturnType<typeof createDatabase>;

type DrizzleD1Query =
  | { toSQL(): { sql: string; params: unknown[] } }
  | { getQuery(): { sql: string; params: unknown[] } };

function compileD1Query(query: DrizzleD1Query) {
  return "toSQL" in query ? query.toSQL() : query.getQuery();
}

/**
 * Executes Drizzle-built statements as one native D1 batch when callers need
 * D1 metadata or parameterized raw Drizzle queries. Drizzle 0.45.2 cannot batch
 * parameterized SQLiteRaw values and maps query-builder batches without meta.
 */
export function executeD1Batch<T = Record<string, unknown>>(
  db: AppDatabase,
  queries: readonly DrizzleD1Query[],
) {
  const statements = queries.map((query) => {
    const compiled = compileD1Query(query);
    return db.$client.prepare(compiled.sql).bind(...compiled.params);
  });
  return db.$client.batch<T>(statements);
}
