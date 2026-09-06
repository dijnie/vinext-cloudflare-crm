import { HttpError } from "@/lib/http/http-errors";

// Check the composed statements, including filter/sort combinations, before execution.
export function assertQueryLimits(...queries: { toSQL(): { sql: string; params: unknown[] } }[]) {
  for (const query of queries) {
    const compiled = query.toSQL();
    if (compiled.params.length > 100 || new TextEncoder().encode(compiled.sql).length > 100000) throw new HttpError(400, "validation_failed", "Query is too complex; use fewer conditions or simpler formulas");
  }
}
