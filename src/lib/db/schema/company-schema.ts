import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { singletonMembership } from "./auth-schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const company = sqliteTable(
  "company",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    domain: text("domain"),
    website: text("website"),
    description: text("description"),
    industry: text("industry"),
    city: text("city"),
    countryCode: text("country_code"),
    phone: text("phone"),
    email: text("email"),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("company_name_idx").on(table.name),
    index("company_owner_idx").on(table.ownerMembershipId),
    index("company_last_activity_idx").on(table.lastActivityAt),
    index("company_archived_idx").on(table.archivedAt),
    uniqueIndex("company_active_domain_unique")
      .on(table.domain)
      .where(sql`${table.archivedAt} is null and ${table.domain} is not null`),
  ],
);
