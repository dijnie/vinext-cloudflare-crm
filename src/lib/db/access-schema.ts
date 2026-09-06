import { sql } from "drizzle-orm";
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { singletonMembership } from "./auth-schema";

export const accessProfile = sqliteTable("access_profile", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, t => [uniqueIndex("access_profile_name_unique").on(t.name)]);
export const accessGrant = sqliteTable("access_grant", {
  profileId: text("profile_id").notNull().references(() => accessProfile.id, { onDelete: "cascade" }),
  permission: text("permission").notNull(),
}, t => [primaryKey({ columns: [t.profileId, t.permission] })]);
export const membershipAccess = sqliteTable("membership_access", {
  membershipId: text("membership_id").primaryKey().references(() => singletonMembership.userId, { onDelete: "cascade" }),
  profileId: text("profile_id").notNull().references(() => accessProfile.id, { onDelete: "restrict" }),
}, t => [index("membership_access_profile_idx").on(t.profileId)]);
export const branch = sqliteTable("branch", {
  id: text("id").primaryKey(), name: text("name").notNull(),
  archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
}, t => [uniqueIndex("branch_active_name_unique").on(t.name).where(sql`${t.archivedAt} IS NULL`)]);
export const branchSetting = sqliteTable("branch_setting", {
  id: text("id").primaryKey(), defaultBranchId: text("default_branch_id").notNull().references(() => branch.id, { onDelete: "restrict" }),
}, t => [check("branch_setting_singleton", sql`${t.id} = 'settings'`)]);
export const memberBranch = sqliteTable("member_branch", {
  membershipId: text("membership_id").notNull().references(() => singletonMembership.userId, { onDelete: "cascade" }),
  branchId: text("branch_id").notNull().references(() => branch.id, { onDelete: "restrict" }),
  isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
}, t => [primaryKey({ columns: [t.membershipId, t.branchId] }), index("member_branch_branch_idx").on(t.branchId), uniqueIndex("member_branch_primary_unique").on(t.membershipId).where(sql`${t.isPrimary} = 1`)]);
export const actionOperationGuard = sqliteTable("action_operation_guard", {
  id: text("id").primaryKey(), authorized: integer("authorized").notNull(),
}, t => [check("action_permission_required", sql`${t.authorized} = 1`)]);
export const operationConditionGuard = sqliteTable("operation_condition_guard", {
  id: text("id").primaryKey(), authorized: integer("authorized").notNull(),
}, t => [check("operation_conflict", sql`${t.authorized} = 1`)]);
