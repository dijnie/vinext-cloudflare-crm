import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { singletonMembership } from "./auth-schema";
import { company } from "./company-schema";
import { contact } from "./contact-schema";

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

export const deal = sqliteTable(
  "deal",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    description: text("description"),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "set null",
    }),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    stageId: text("stage_id")
      .notNull()
      .references(() => dealStage.id, { onDelete: "restrict" }),
    stageChangedAt: integer("stage_changed_at", {
      mode: "timestamp_ms",
    }).notNull(),
    amountMinor: integer("amount_minor"),
    moneyRevision: integer("money_revision").default(0).notNull(),
    currency: text("currency").default("USD").notNull(),
    expectedCloseAt: integer("expected_close_at", { mode: "timestamp_ms" }),
    closedAt: integer("closed_at", { mode: "timestamp_ms" }),
    closedReason: text("closed_reason"),
    baseAmountMinor: integer("base_amount_minor"),
    baseCurrency: text("base_currency"),
    fxRateScaled: integer("fx_rate_scaled"),
    fxRateAt: integer("fx_rate_at", { mode: "timestamp_ms" }),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("deal_company_idx").on(table.companyId),
    index("deal_owner_idx").on(table.ownerMembershipId),
    index("deal_stage_idx").on(table.stageId),
    index("deal_close_idx").on(table.expectedCloseAt),
    index("deal_last_activity_idx").on(table.lastActivityAt),
    index("deal_currency_idx").on(table.currency),
    index("deal_archived_idx").on(table.archivedAt),
    check(
      "deal_amount_minor_check",
      sql`${table.amountMinor} is null or ${table.amountMinor} >= 0`,
    ),
    check("deal_currency_check", sql`length(${table.currency}) = 3`),
  ],
);

export const dealContact = sqliteTable(
  "deal_contact",
  {
    dealId: text("deal_id")
      .notNull()
      .references(() => deal.id, { onDelete: "cascade" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "cascade" }),
    role: text("role"),
  },
  (table) => [
    primaryKey({ columns: [table.dealId, table.contactId] }),
    index("deal_contact_contact_idx").on(table.contactId),
  ],
);
