import { sql } from "drizzle-orm";
import { check, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const memberOperationGuard = sqliteTable(
  "member_operation_guard",
  {
    id: text("id").primaryKey(),
    authorized: integer("authorized").notNull(),
  },
  (table) => [
    check(
      "member_operation_guard_authorized_check",
      sql`${table.authorized} = 1`,
    ),
  ],
);
