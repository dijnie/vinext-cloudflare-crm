import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const dealStage = sqliteTable(
  "deal_stage",
  {
    id: text("id").primaryKey(),
    labelKey: text("label_key").notNull(),
    label: text("label"),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    position: integer("position").notNull(),
    closedState: text("closed_state", {
      enum: ["open", "won", "lost"],
    })
      .default("open")
      .notNull(),
  },
  (table) => [
    uniqueIndex("deal_stage_position_unique").on(table.position),
    check(
      "deal_stage_closed_state_check",
      sql`${table.closedState} in ('open', 'won', 'lost')`,
    ),
  ],
);
