import { is, SQL } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export function createDatabase(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type AppDatabase = ReturnType<typeof createDatabase>;

export type DrizzleD1Query =
  | SQL
  | { toSQL(): { sql: string; params: unknown[] } }
  | { getQuery(): { sql: string; params: unknown[] } };

function compileD1Query(db: AppDatabase, query: DrizzleD1Query) {
  if (is(query, SQL)) return db.run(query).getQuery();
  return "toSQL" in query ? query.toSQL() : query.getQuery();
}

/**
 * Executes builders or SQL templates as one native D1 batch when callers need
 * D1 metadata or parameterized raw Drizzle queries. Drizzle 0.45.2 cannot batch
 * parameterized SQLiteRaw values and maps query-builder batches without meta.
 * Results retain database column names/storage values; builder decoders and
 * projection aliases are not applied. Use explicit SQL aliases where needed.
 */
export function executeD1Batch<T = Record<string, unknown>>(
  db: AppDatabase,
  queries: readonly DrizzleD1Query[],
) {
  const statements = queries.map((query) => {
    const compiled = compileD1Query(db, query);
    return db.$client.prepare(compiled.sql).bind(...compiled.params);
  });
  return db.$client.batch<T>(statements);
}
