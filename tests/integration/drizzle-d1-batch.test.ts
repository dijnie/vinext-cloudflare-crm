import { env } from "cloudflare:workers";
import { eq, sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { createDatabase, executeD1Batch } from "@/lib/db/database";
import { actionOperationGuard } from "@/lib/db/schema";

describe.sequential("Drizzle D1 batch contract", () => {
  it("maps raw Drizzle query results and exposes mutation metadata", async () => {
    const db = createDatabase(env.DB);
    const [rows, row, mutation] = await executeD1Batch<{ value: number }>(db, [
      db.all<{ value: number }>(sql`select 1 as value`),
      db.get<{ value: number }>(sql`select 2 as value`),
      db.run(sql`update ${actionOperationGuard} set authorized = 1 where ${actionOperationGuard.id} = ${"missing"}`),
    ]);

    expect(rows.results).toEqual([{ value: 1 }]);
    expect(row.results).toEqual([{ value: 2 }]);
    expect(mutation.meta.changes).toBe(0);
  });

  it("rolls back every Drizzle statement when one batch item fails", async () => {
    const db = createDatabase(env.DB);
    const id = `drizzle-batch-${crypto.randomUUID()}`;

    await expect(executeD1Batch(db, [
      db.run(sql`insert into ${actionOperationGuard} (id, authorized) values (${id}, 1)`),
      db.run(sql`insert into ${actionOperationGuard} (id, authorized) values (${id}, 1)`),
    ])).rejects.toThrow();

    expect(await db.select({ id: actionOperationGuard.id })
      .from(actionOperationGuard)
      .where(eq(actionOperationGuard.id, id)))
      .toEqual([]);
  });
});
