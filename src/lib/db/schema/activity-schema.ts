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

import { singletonMembership, user } from "./auth-schema";
import { company } from "./company-schema";
import { contact } from "./contact-schema";
import { deal } from "./deal-schema";
import { lead } from "./lead-schema";
import { product, salesOrder } from "./product-order-schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const activity = sqliteTable(
  "activity",
  {
    orderId: text("order_id").references(() => salesOrder.id, {
      onDelete: "cascade",
    }),
    productId: text("product_id").references(() => product.id, {
      onDelete: "cascade",
    }),
    leadId: text("lead_id").references(() => lead.id, { onDelete: "cascade" }),
    id: text("id").primaryKey(),
    type: text("type", {
      enum: ["note", "call", "meeting", "task", "stage_change"],
    }).notNull(),
    subject: text("subject"),
    content: text("content"),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "cascade",
    }),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "cascade",
    }),
    dealId: text("deal_id").references(() => deal.id, {
      onDelete: "cascade",
    }),
    authorUserId: text("author_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    metadataJson: text("metadata_json"),
    ...timestamps,
  },
  (table) => [
    index("activity_order_created_idx").on(
      table.orderId,
      table.createdAt,
      table.id,
    ),
    index("activity_product_created_idx").on(
      table.productId,
      table.createdAt,
      table.id,
    ),
    index("activity_lead_created_idx").on(
      table.leadId,
      table.createdAt,
      table.id,
    ),
    index("activity_company_created_idx").on(
      table.companyId,
      table.createdAt,
      table.id,
    ),
    index("activity_contact_created_idx").on(
      table.contactId,
      table.createdAt,
      table.id,
    ),
    index("activity_deal_created_idx").on(
      table.dealId,
      table.createdAt,
      table.id,
    ),
    index("activity_due_idx").on(table.dueAt),
    index("activity_author_idx").on(table.authorUserId),
    check(
      "activity_type_check",
      sql`${table.type} in ('note', 'call', 'meeting', 'task', 'stage_change')`,
    ),
    check(
      "activity_anchor_check",
      sql`((${table.companyId} is not null) + (${table.contactId} is not null) + (${table.dealId} is not null) + (${table.leadId} is not null) + (${table.productId} is not null) + (${table.orderId} is not null)) >= 1`,
    ),
    check(
      "activity_metadata_json_check",
      sql`${table.metadataJson} is null or json_valid(${table.metadataJson})`,
    ),
  ],
);

export const activityVisibility = sqliteTable(
  "activity_visibility",
  {
    activityId: text("activity_id")
      .notNull()
      .references(() => activity.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => singletonMembership.userId, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.activityId, table.membershipId] }),
    index("activity_visibility_member_idx").on(table.membershipId),
  ],
);
