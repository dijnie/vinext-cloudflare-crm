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
import { company } from "./company-schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const contact = sqliteTable(
  "contact",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    normalizedPhone: text("normalized_phone"),
    title: text("title"),
    birthDate: text("birth_date"),
    gender: text("gender", {
      enum: ["female", "male", "nonbinary", "other", "undisclosed"],
    }),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "set null",
    }),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    index("contact_name_idx").on(table.firstName, table.lastName),
    index("contact_company_idx").on(table.companyId),
    index("contact_owner_idx").on(table.ownerMembershipId),
    index("contact_last_activity_idx").on(table.lastActivityAt),
    index("contact_archived_idx").on(table.archivedAt),
    index("contact_normalized_phone_idx").on(table.normalizedPhone),
    uniqueIndex("contact_active_email_unique")
      .on(table.email)
      .where(sql`${table.archivedAt} is null and ${table.email} is not null`),
  ],
);
