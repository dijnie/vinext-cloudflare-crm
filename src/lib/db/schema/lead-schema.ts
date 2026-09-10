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

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const leadSource = sqliteTable("lead_source", {
  id: text("id").primaryKey().notNull(),
  label: text("label"),
  labelKey: text("label_key").notNull(),
  position: integer("position").notNull().unique(),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
});
export const leadStatus = sqliteTable(
  "lead_status",
  {
    id: text("id").primaryKey().notNull(),
    label: text("label"),
    labelKey: text("label_key").notNull(),
    position: integer("position").notNull().unique(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    meaning: text("meaning", {
      enum: ["working", "rejected", "converted"],
    }).notNull(),
    requiresReason: integer("requires_reason", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    check(
      "lead_status_meaning",
      sql`${table.meaning} in ('working','rejected','converted')`,
    ),
    check(
      "lead_converted_status",
      sql`(${table.meaning} = 'converted') = (${table.id} = 'converted')`,
    ),
    check("lead_requires_reason", sql`${table.requiresReason} in (0,1)`),
  ],
);
export const leadSettingsRevision = sqliteTable(
  "lead_settings_revision",
  {
    id: text("id", { enum: ["settings"] })
      .primaryKey()
      .notNull(),
    revision: integer("revision").notNull().default(0),
  },
  (table) => [
    check("lead_settings_singleton", sql`${table.id} = 'settings'`),
    check("lead_settings_revision", sql`${table.revision} >= 0`),
  ],
);
export const lead = sqliteTable(
  "lead",
  {
    id: text("id").primaryKey().notNull(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    normalizedEmail: text("normalized_email"),
    normalizedPhone: text("normalized_phone"),
    title: text("title"),
    description: text("description"),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "set null",
    }),
    sourceId: text("source_id")
      .notNull()
      .default("manual")
      .references(() => leadSource.id, { onDelete: "restrict" }),
    statusId: text("status_id")
      .notNull()
      .default("new")
      .references(() => leadStatus.id, { onDelete: "restrict" }),
    rejectionReason: text("rejection_reason"),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull().default(0),
    lastActivityAt: integer("last_activity_at", { mode: "timestamp_ms" }),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    convertedAt: integer("converted_at", { mode: "timestamp_ms" }),
    convertedContactId: text("converted_contact_id").references(
      () => contact.id,
      { onDelete: "restrict" },
    ),
    ...timestamps,
  },
  (table) => [
    index("lead_source_idx").on(table.sourceId),
    index("lead_status_idx").on(table.statusId),
    index("lead_owner_idx").on(table.ownerMembershipId),
    index("lead_email_idx").on(table.normalizedEmail),
    index("lead_phone_idx").on(table.normalizedPhone),
    index("lead_created_idx").on(table.createdAt, table.id),
    check("lead_revision", sql`${table.revision} >= 0`),
    check(
      "lead_conversion_state",
      sql`(${table.convertedAt} is null and ${table.convertedContactId} is null and ${table.statusId} != 'converted') or (${table.convertedAt} is not null and ${table.convertedContactId} is not null and ${table.statusId} = 'converted')`,
    ),
  ],
);
export const leadCollaborator = sqliteTable(
  "lead_collaborator",
  {
    leadId: text("lead_id")
      .notNull()
      .references(() => lead.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => singletonMembership.userId, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.leadId, table.membershipId] }),
    index("lead_collaborator_member_idx").on(table.membershipId, table.leadId),
  ],
);
export const leadMapping = sqliteTable(
  "lead_mapping",
  {
    id: text("id", { enum: ["contact"] })
      .primaryKey()
      .notNull(),
    revision: integer("revision").notNull().default(0),
    mappingsJson: text("mappings_json").notNull().default("[]"),
    autoOrder: integer("auto_order", { mode: "boolean" })
      .notNull()
      .default(false),
    autoDeal: integer("auto_deal", { mode: "boolean" })
      .notNull()
      .default(false),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    check("lead_mapping_singleton", sql`${table.id} = 'contact'`),
    check("lead_mapping_revision", sql`${table.revision} >= 0`),
    check("lead_mapping_json", sql`json_valid(${table.mappingsJson})`),
    check("lead_mapping_order_boolean", sql`${table.autoOrder} in (0,1)`),
    check("lead_mapping_deal_boolean", sql`${table.autoDeal} in (0,1)`),
  ],
);
export const leadConversion = sqliteTable(
  "lead_conversion",
  {
    id: text("id").primaryKey().notNull(),
    leadId: text("lead_id")
      .notNull()
      .unique()
      .references(() => lead.id, { onDelete: "restrict" }),
    operationKey: text("operation_key").notNull().unique(),
    fingerprint: text("fingerprint").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    contactId: text("contact_id")
      .notNull()
      .references(() => contact.id, { onDelete: "restrict" }),
    mode: text("mode", { enum: ["create", "link"] }).notNull(),
    leadRevision: integer("lead_revision").notNull(),
    mappingRevision: integer("mapping_revision").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    resultJson: text("result_json").notNull(),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    index("lead_conversion_contact_completed_idx").on(
      table.contactId,
      sql`${table.completedAt} desc`,
      table.leadId,
    ),
    check("lead_conversion_mode", sql`${table.mode} in ('create','link')`),
    check(
      "lead_conversion_snapshot_json",
      sql`json_valid(${table.snapshotJson})`,
    ),
    check("lead_conversion_result_json", sql`json_valid(${table.resultJson})`),
  ],
);
