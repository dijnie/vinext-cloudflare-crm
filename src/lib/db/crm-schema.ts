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

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const dealStage = sqliteTable(
  "deal_stage",
  {
    id: text("id").primaryKey(),
    labelKey: text("label_key").notNull(),
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

export const contact = sqliteTable(
  "contact",
  {
    id: text("id").primaryKey(),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    email: text("email"),
    phone: text("phone"),
    title: text("title"),
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
    uniqueIndex("contact_active_email_unique")
      .on(table.email)
      .where(sql`${table.archivedAt} is null and ${table.email} is not null`),
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

export const activity = sqliteTable(
  "activity",
  {
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
    index("activity_company_created_idx").on(table.companyId, table.createdAt, table.id),
    index("activity_contact_created_idx").on(table.contactId, table.createdAt, table.id),
    index("activity_deal_created_idx").on(table.dealId, table.createdAt, table.id),
    index("activity_due_idx").on(table.dueAt),
    index("activity_author_idx").on(table.authorUserId),
    check(
      "activity_type_check",
      sql`${table.type} in ('note', 'call', 'meeting', 'task', 'stage_change')`,
    ),
    check(
      "activity_anchor_check",
      sql`((${table.companyId} is not null) + (${table.contactId} is not null) + (${table.dealId} is not null)) >= 1`,
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

export const memberOperationGuard = sqliteTable(
  "member_operation_guard",
  {
    id: text("id").primaryKey(),
    authorized: integer("authorized").notNull(),
  },
  (table) => [
    check("member_operation_guard_authorized_check", sql`${table.authorized} = 1`),
  ],
);

export const customFieldDefinition = sqliteTable(
  "custom_field_definition",
  {
    id: text("id").primaryKey(),
    entity: text("entity", { enum: ["company", "contact", "deal"] }).notNull(),
    key: text("key").notNull(),
    label: text("label").notNull(),
    type: text("type", {
      enum: [
        "text",
        "long_text",
        "number",
        "date",
        "checkbox",
        "select",
        "url",
        "email",
        "phone",
        "user",
      ],
    }).notNull(),
    configJson: text("config_json"),
    deletedAt: integer("deleted_at", { mode: "timestamp_ms" }),
    required: integer("required", { mode: "boolean" }).default(false).notNull(),
    showOnSheet: integer("show_on_sheet", { mode: "boolean" })
      .default(true)
      .notNull(),
    showOnTable: integer("show_on_table", { mode: "boolean" })
      .default(false)
      .notNull(),
    showOnFilter: integer("show_on_filter", { mode: "boolean" })
      .default(false)
      .notNull(),
    position: integer("position").notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("custom_field_entity_key_unique").on(table.entity, table.key),
    index("custom_field_entity_position_idx").on(table.entity, table.position),
    check(
      "custom_field_entity_check",
      sql`${table.entity} in ('company', 'contact', 'deal')`,
    ),
    check(
      "custom_field_type_check",
      sql`${table.type} in ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user')`,
    ),
    check(
      "custom_field_config_json_check",
      sql`${table.configJson} is null or json_valid(${table.configJson})`,
    ),
  ],
);

export const customFieldOption = sqliteTable(
  "custom_field_option",
  {
    id: text("id").primaryKey(),
    fieldId: text("field_id")
      .notNull()
      .references(() => customFieldDefinition.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: integer("position").notNull(),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
  },
  (table) => [index("custom_field_option_position_idx").on(table.fieldId, table.position)],
);

export const customFieldValue = sqliteTable(
  "custom_field_value",
  {
    id: text("id").primaryKey(),
    fieldId: text("field_id")
      .notNull()
      .references(() => customFieldDefinition.id, { onDelete: "cascade" }),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "cascade",
    }),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "cascade",
    }),
    dealId: text("deal_id").references(() => deal.id, { onDelete: "cascade" }),
    textValue: text("text_value"),
    numberValue: integer("number_value"),
    dateValue: integer("date_value", { mode: "timestamp_ms" }),
    booleanValue: integer("boolean_value", { mode: "boolean" }),
    optionId: text("option_id").references(() => customFieldOption.id, {
      onDelete: "set null",
    }),
    userMembershipId: text("user_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (table) => [
    uniqueIndex("custom_field_company_unique").on(table.fieldId, table.companyId),
    uniqueIndex("custom_field_contact_unique").on(table.fieldId, table.contactId),
    uniqueIndex("custom_field_deal_unique").on(table.fieldId, table.dealId),
    index("custom_field_value_text_idx").on(table.fieldId, table.textValue),
    index("custom_field_value_number_idx").on(table.fieldId, table.numberValue),
    index("custom_field_value_date_idx").on(table.fieldId, table.dateValue),
    index("custom_field_value_user_idx").on(table.userMembershipId),
    check(
      "custom_field_value_one_record_check",
      sql`((${table.companyId} is not null) + (${table.contactId} is not null) + (${table.dealId} is not null)) = 1`,
    ),
  ],
);

export const savedView = sqliteTable(
  "saved_view",
  {
    id: text("id").primaryKey(),
    entity: text("entity", { enum: ["company", "contact", "deal"] }).notNull(),
    name: text("name").notNull(),
    shared: integer("shared", { mode: "boolean" }).default(false).notNull(),
    stateJson: text("state_json").notNull(),
    creatorUserId: text("creator_user_id").references(() => user.id, { onDelete: "set null" }),
    ownerMembershipId: text("owner_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("saved_view_creator_name_unique").on(table.entity, table.creatorUserId, table.name),
    uniqueIndex("saved_view_owner_name_unique").on(
      table.entity,
      table.ownerMembershipId,
      table.name,
    ),
    index("saved_view_entity_shared_idx").on(table.entity, table.shared),
    check(
      "saved_view_entity_check",
      sql`${table.entity} in ('company', 'contact', 'deal')`,
    ),
    check("saved_view_state_json_check", sql`json_valid(${table.stateJson})`),
  ],
);

export const savedViewDefault = sqliteTable("saved_view_default", {
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  entity: text("entity", { enum: ["company", "contact", "deal"] }).notNull(),
  viewId: text("view_id").notNull().references(() => savedView.id, { onDelete: "cascade" }),
}, table => [
  primaryKey({ columns: [table.userId, table.entity] }),
  index("saved_view_default_view_idx").on(table.viewId),
  check("saved_view_default_entity_check", sql`${table.entity} in ('company','contact','deal')`),
]);

export const exchangeRate = sqliteTable(
  "exchange_rate",
  {
    id: text("id").primaryKey(),
    baseCurrency: text("base_currency").notNull(),
    quoteCurrency: text("quote_currency").notNull(),
    rate: text("rate").notNull(),
    asOf: integer("as_of", { mode: "timestamp_ms" }).notNull(),
    source: text("source", { enum: ["fetched", "manual"] }).notNull(),
    provider: text("provider"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("exchange_rate_pair_source_unique").on(
      table.baseCurrency,
      table.quoteCurrency,
      table.source,
    ),
    index("exchange_rate_pair_idx").on(table.baseCurrency, table.quoteCurrency),
    check("exchange_rate_value_check", sql`length(${table.rate}) between 1 and 21`),
    check(
      "exchange_rate_source_check",
      sql`${table.source} in ('fetched', 'manual')`,
    ),
    check(
      "exchange_rate_currency_check",
      sql`length(${table.baseCurrency}) = 3 and length(${table.quoteCurrency}) = 3`,
    ),
  ],
);

export const crmSetting = sqliteTable(
  "crm_setting",
  {
    id: text("id").primaryKey(),
    reportingCurrency: text("reporting_currency").default("USD").notNull(),
    timeZone: text("time_zone").default("Asia/Ho_Chi_Minh").notNull(),
    countryCode: text("country_code").default("VN").notNull(),
    calendarRevision: integer("calendar_revision").default(0).notNull(),
    activeConversionVersion: text("active_conversion_version").default("initial").notNull(),
    pendingJobId: text("pending_job_id"),
    ratesRevision: integer("rates_revision").default(0).notNull(),
    ...timestamps,
  },
  (table) => [
    check("crm_setting_singleton_check", sql`${table.id} = 'settings'`),
    check(
      "crm_setting_currency_check",
      sql`length(${table.reportingCurrency}) = 3`,
    ),
  ],
);

export const currencyJob = sqliteTable("currency_job", {
  id: text("id").primaryKey(),
  kind: text("kind", { enum: ["rerate", "fill_missing"] }).notNull(),
  targetCurrency: text("target_currency").notNull(),
  expectedVersion: text("expected_version").notNull(),
  targetVersion: text("target_version").notNull(),
  ratesJson: text("rates_json").notNull(),
  cursor: text("cursor"),
  total: integer("total").notNull(),
  processed: integer("processed").default(0).notNull(),
  converted: integer("converted").default(0).notNull(),
  missing: integer("missing").default(0).notNull(),
  status: text("status", { enum: ["pending", "running", "completed", "cancelled"] }).notNull(),
  ...timestamps,
});

export const dealConversion = sqliteTable("deal_conversion", {
  version: text("version").notNull(),
  dealId: text("deal_id").notNull().references(() => deal.id, { onDelete: "cascade" }),
  moneyRevision: integer("money_revision").notNull(),
  amountMinor: integer("amount_minor"),
  currency: text("currency").notNull(),
  baseAmountMinor: integer("base_amount_minor"),
  baseCurrency: text("base_currency"),
  fxRate: text("fx_rate"),
  fxRateAt: integer("fx_rate_at", { mode: "timestamp_ms" }),
  rateSource: text("rate_source", { enum: ["identity", "manual", "fetched"] }),
}, table => [primaryKey({ columns: [table.version, table.dealId] }), index("deal_conversion_amount_idx").on(table.version, table.baseAmountMinor, table.dealId)]);
