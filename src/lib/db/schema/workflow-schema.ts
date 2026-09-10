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
import { activity } from "./activity-schema";
import { company } from "./company-schema";
import { contact } from "./contact-schema";
import { deal } from "./deal-schema";
import { lead } from "./lead-schema";
import { productVariant } from "./product-schema";
import { salesOrder } from "./order-schema";

const timestamps = {
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
};

export const taskRecord = sqliteTable(
  "task_record",
  {
    activityId: text("activity_id")
      .primaryKey()
      .notNull()
      .references(() => activity.id, { onDelete: "cascade" }),
    assigneeMembershipId: text("assignee_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    currentCycle: integer("current_cycle").notNull().default(1),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    overdueBreached: integer("overdue_breached", { mode: "boolean" })
      .notNull()
      .default(false),
    revision: integer("revision").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("task_assignee_due_idx").on(
      t.assigneeMembershipId,
      t.completedAt,
      t.dueAt,
    ),
  ],
);
export const taskCycle = sqliteTable(
  "task_cycle",
  {
    taskId: text("task_id")
      .notNull()
      .references(() => taskRecord.activityId, { onDelete: "cascade" }),
    cycle: integer("cycle").notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
    openedBy: text("opened_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    completedAt: integer("completed_at", { mode: "timestamp_ms" }),
    overdueBreached: integer("overdue_breached", { mode: "boolean" })
      .notNull()
      .default(false),
    reopenReason: text("reopen_reason"),
  },
  (t) => [primaryKey({ columns: [t.taskId, t.cycle] })],
);
export const taskDeadlineHistory = sqliteTable("task_deadline_history", {
  id: text("id").primaryKey().notNull(),
  taskId: text("task_id")
    .notNull()
    .references(() => taskRecord.activityId, { onDelete: "cascade" }),
  cycle: integer("cycle").notNull(),
  previousDueAt: integer("previous_due_at", { mode: "timestamp_ms" }),
  nextDueAt: integer("next_due_at", { mode: "timestamp_ms" }),
  reason: text("reason").notNull(),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  operationKey: text("operation_key").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
export const taskOperation = sqliteTable("task_operation", {
  id: text("id").primaryKey().notNull(),
  taskId: text("task_id")
    .notNull()
    .references(() => taskRecord.activityId, { onDelete: "cascade" }),
  action: text("action", {
    enum: ["complete", "reopen", "deadline", "assign"],
  }).notNull(),
  fingerprint: text("fingerprint").notNull(),
  resultJson: text("result_json").notNull(),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const appointment = sqliteTable(
  "appointment",
  {
    id: text("id").primaryKey().notNull(),
    subject: text("subject").notNull(),
    description: text("description"),
    startsAt: integer("starts_at", { mode: "timestamp_ms" }).notNull(),
    endsAt: integer("ends_at", { mode: "timestamp_ms" }).notNull(),
    timeZone: text("time_zone").notNull(),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "set null",
    }),
    serviceVariantId: text("service_variant_id").references(
      () => productVariant.id,
      { onDelete: "set null" },
    ),
    organizerMembershipId: text("organizer_membership_id")
      .notNull()
      .references(() => singletonMembership.userId, { onDelete: "restrict" }),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["scheduled", "completed", "cancelled"] })
      .notNull()
      .default("scheduled"),
    reminderEnabled: integer("reminder_enabled", { mode: "boolean" })
      .notNull()
      .default(true),
    reminderOffsetMinutes: integer("reminder_offset_minutes")
      .notNull()
      .default(15),
    conflictAcknowledgedAt: integer("conflict_acknowledged_at", {
      mode: "timestamp_ms",
    }),
    conflictAcknowledgedBy: text("conflict_acknowledged_by").references(
      () => user.id,
      { onDelete: "restrict" },
    ),
    revision: integer("revision").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("appointment_range_idx").on(t.startsAt, t.endsAt, t.status),
    index("appointment_organizer_idx").on(t.organizerMembershipId, t.startsAt),
  ],
);
export const appointmentParticipant = sqliteTable(
  "appointment_participant",
  {
    appointmentId: text("appointment_id")
      .notNull()
      .references(() => appointment.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => singletonMembership.userId, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.appointmentId, t.membershipId] }),
    index("appointment_participant_member_idx").on(
      t.membershipId,
      t.appointmentId,
    ),
  ],
);
export const appointmentOperation = sqliteTable("appointment_operation", {
  id: text("id").primaryKey().notNull(),
  appointmentId: text("appointment_id")
    .notNull()
    .references(() => appointment.id, { onDelete: "cascade" }),
  action: text("action", {
    enum: ["create", "update", "complete", "cancel"],
  }).notNull(),
  fingerprint: text("fingerprint").notNull(),
  resultJson: text("result_json").notNull(),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});

export const ticketSequence = sqliteTable("ticket_sequence", {
  id: text("id").primaryKey().notNull(),
  nextNumber: integer("next_number").notNull(),
});
export const ticket = sqliteTable(
  "ticket",
  {
    id: text("id").primaryKey().notNull(),
    number: integer("number").notNull().unique(),
    subject: text("subject").notNull(),
    description: text("description"),
    priority: text("priority", {
      enum: ["low", "normal", "high", "urgent"],
    }).notNull(),
    category: text("category"),
    source: text("source").notNull(),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "set null",
    }),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "set null",
    }),
    assigneeMembershipId: text("assignee_membership_id").references(
      () => singletonMembership.userId,
      { onDelete: "set null" },
    ),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status", { enum: ["open", "resolved"] })
      .notNull()
      .default("open"),
    currentCycle: integer("current_cycle").notNull().default(1),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    firstResponseAt: integer("first_response_at", { mode: "timestamp_ms" }),
    overdueBreached: integer("overdue_breached", { mode: "boolean" })
      .notNull()
      .default(false),
    revision: integer("revision").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    index("ticket_status_due_idx").on(t.status, t.dueAt),
    index("ticket_assignee_idx").on(t.assigneeMembershipId, t.status, t.dueAt),
    index("ticket_contact_idx").on(t.contactId, t.createdAt),
  ],
);
export const ticketCollaborator = sqliteTable(
  "ticket_collaborator",
  {
    ticketId: text("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    membershipId: text("membership_id")
      .notNull()
      .references(() => singletonMembership.userId, { onDelete: "restrict" }),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.membershipId] })],
);
export const ticketCycle = sqliteTable(
  "ticket_cycle",
  {
    ticketId: text("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    cycle: integer("cycle").notNull(),
    openedAt: integer("opened_at", { mode: "timestamp_ms" }).notNull(),
    openedBy: text("opened_by")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    dueAt: integer("due_at", { mode: "timestamp_ms" }),
    resolvedAt: integer("resolved_at", { mode: "timestamp_ms" }),
    overdueBreached: integer("overdue_breached", { mode: "boolean" })
      .notNull()
      .default(false),
    reopenReason: text("reopen_reason"),
    firstResponseAt: integer("first_response_at", { mode: "timestamp_ms" }),
  },
  (t) => [primaryKey({ columns: [t.ticketId, t.cycle] })],
);
export const ticketEvent = sqliteTable(
  "ticket_event",
  {
    id: text("id").primaryKey().notNull(),
    ticketId: text("ticket_id")
      .notNull()
      .references(() => ticket.id, { onDelete: "cascade" }),
    cycle: integer("cycle").notNull(),
    action: text("action", {
      enum: [
        "created",
        "response",
        "deadline",
        "assign",
        "resolve",
        "reopen",
        "collaborators",
      ],
    }).notNull(),
    content: text("content"),
    previousDueAt: integer("previous_due_at", { mode: "timestamp_ms" }),
    nextDueAt: integer("next_due_at", { mode: "timestamp_ms" }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    operationKey: text("operation_key").notNull().unique(),
    fingerprint: text("fingerprint").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [index("ticket_event_ticket_idx").on(t.ticketId, t.createdAt)],
);

export const notificationPreference = sqliteTable("notification_preference", {
  membershipId: text("membership_id")
    .primaryKey()
    .notNull()
    .references(() => singletonMembership.userId, { onDelete: "cascade" }),
  inAppEnabled: integer("in_app_enabled", { mode: "boolean" })
    .notNull()
    .default(true),
  browserEnabled: integer("browser_enabled", { mode: "boolean" })
    .notNull()
    .default(false),
  appointmentOffsetMinutes: integer("appointment_offset_minutes")
    .notNull()
    .default(15),
  taskOffsetMinutes: integer("task_offset_minutes").notNull().default(0),
  ticketOffsetMinutes: integer("ticket_offset_minutes").notNull().default(0),
  contractOffsetMinutes: integer("contract_offset_minutes")
    .notNull()
    .default(10080),
  revision: integer("revision").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const notification = sqliteTable(
  "notification",
  {
    id: text("id").primaryKey().notNull(),
    recipientMembershipId: text("recipient_membership_id")
      .notNull()
      .references(() => singletonMembership.userId, { onDelete: "cascade" }),
    kind: text("kind", {
      enum: ["appointment", "task", "ticket", "contract", "automation"],
    }).notNull(),
    sourceId: text("source_id").notNull(),
    sourceRevision: integer("source_revision").notNull(),
    dueAt: integer("due_at", { mode: "timestamp_ms" }).notNull(),
    title: text("title").notNull(),
    body: text("body"),
    targetUrl: text("target_url").notNull(),
    dedupeKey: text("dedupe_key").notNull().unique(),
    state: text("state", {
      enum: ["pending", "delivered", "failed", "cancelled"],
    })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    browserDeliveredAt: integer("browser_delivered_at", {
      mode: "timestamp_ms",
    }),
    readAt: integer("read_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    index("notification_recipient_due_idx").on(
      t.recipientMembershipId,
      t.state,
      t.dueAt,
    ),
  ],
);

export const contract = sqliteTable(
  "contract",
  {
    id: text("id").primaryKey().notNull(),
    name: text("name").notNull(),
    companyId: text("company_id")
      .notNull()
      .references(() => company.id, { onDelete: "restrict" }),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "restrict",
    }),
    dealId: text("deal_id").references(() => deal.id, { onDelete: "restrict" }),
    orderId: text("order_id").references(() => salesOrder.id, {
      onDelete: "restrict",
    }),
    valueMinor: integer("value_minor"),
    currency: text("currency").notNull(),
    effectiveAt: integer("effective_at", { mode: "timestamp_ms" }),
    expiresAt: integer("expires_at", { mode: "timestamp_ms" }),
    ownerMembershipId: text("owner_membership_id")
      .notNull()
      .references(() => singletonMembership.userId, { onDelete: "restrict" }),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    status: text("status", {
      enum: ["draft", "active", "completed", "terminated", "expired"],
    })
      .notNull()
      .default("draft"),
    revision: integer("revision").notNull().default(0),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    index("contract_company_idx").on(t.companyId, t.status, t.expiresAt),
    index("contract_owner_idx").on(t.ownerMembershipId, t.status, t.expiresAt),
  ],
);
export const contractParty = sqliteTable(
  "contract_party",
  {
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    partyId: text("party_id").notNull(),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "restrict",
    }),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "restrict",
    }),
    role: text("role").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.contractId, t.partyId] })],
);
export const contractVersion = sqliteTable(
  "contract_version",
  {
    contractId: text("contract_id")
      .notNull()
      .references(() => contract.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    snapshotJson: text("snapshot_json").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.contractId, t.version] })],
);
export const contractOperation = sqliteTable("contract_operation", {
  operationKey: text("operation_key").primaryKey().notNull(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contract.id, { onDelete: "restrict" }),
  fingerprint: text("fingerprint").notNull(),
  resultJson: text("result_json").notNull(),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
export const contractDocument = sqliteTable("contract_document", {
  id: text("id").primaryKey().notNull(),
  contractId: text("contract_id")
    .notNull()
    .references(() => contract.id, { onDelete: "restrict" }),
  objectKey: text("object_key").notNull().unique(),
  fileName: text("file_name").notNull(),
  size: integer("size").notNull(),
  status: text("status", {
    enum: ["pending", "ready", "failed", "cleaning"],
  }).notNull(),
  uploaderId: text("uploader_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  readyAt: integer("ready_at", { mode: "timestamp_ms" }),
  cleanupAttemptedAt: integer("cleanup_attempted_at", { mode: "timestamp_ms" }),
});
export const review = sqliteTable(
  "review",
  {
    id: text("id").primaryKey().notNull(),
    source: text("source").notNull(),
    eventId: text("event_id").notNull(),
    companyId: text("company_id").references(() => company.id, {
      onDelete: "restrict",
    }),
    contactId: text("contact_id").references(() => contact.id, {
      onDelete: "restrict",
    }),
    content: text("content").notNull(),
    rating: integer("rating").notNull(),
    tagsJson: text("tags_json").notNull().default("[]"),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    fingerprint: text("fingerprint").notNull(),
    revision: integer("revision").notNull().default(0),
    archivedAt: integer("archived_at", { mode: "timestamp_ms" }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("review_source_event_unique").on(t.source, t.eventId),
    index("review_customer_idx").on(t.companyId, t.contactId, t.createdAt),
  ],
);
export const reportingGoal = sqliteTable(
  "reporting_goal",
  {
    id: text("id").primaryKey().notNull(),
    scopeKind: text("scope_kind", {
      enum: ["workspace", "member", "branch"],
    }).notNull(),
    scopeId: text("scope_id").notNull().default(""),
    periodFrom: text("period_from").notNull(),
    periodTo: text("period_to").notNull(),
    currency: text("currency").notNull(),
    amountMinor: integer("amount_minor").notNull(),
    creatorUserId: text("creator_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("reporting_goal_scope_unique").on(
      t.scopeKind,
      t.scopeId,
      t.periodFrom,
      t.periodTo,
      t.currency,
    ),
    index("reporting_goal_period_idx").on(
      t.periodFrom,
      t.periodTo,
      t.scopeKind,
      t.scopeId,
    ),
  ],
);

export const webformConfig = sqliteTable("webform_config", {
  id: text("id").primaryKey().notNull(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  entity: text("entity", { enum: ["lead", "ticket"] }).notNull(),
  mode: text("mode", { enum: ["public", "signed_system"] }).notNull(),
  tokenHash: text("token_hash"),
  source: text("source").notNull(),
  authorityMembershipId: text("authority_membership_id")
    .notNull()
    .references(() => singletonMembership.userId, { onDelete: "restrict" }),
  mappingJson: text("mapping_json").notNull(),
  allowMissingRequired: integer("allow_missing_required", { mode: "boolean" })
    .notNull()
    .default(false),
  rateLimitHour: integer("rate_limit_hour").notNull().default(60),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  revision: integer("revision").notNull().default(0),
  ...timestamps,
});
export const webformSubmission = sqliteTable(
  "webform_submission",
  {
    id: text("id").primaryKey().notNull(),
    formId: text("form_id")
      .notNull()
      .references(() => webformConfig.id, { onDelete: "restrict" }),
    submissionKey: text("submission_key").notNull(),
    fingerprint: text("fingerprint").notNull(),
    clientHash: text("client_hash").notNull(),
    recordId: text("record_id").notNull(),
    missingFieldsJson: text("missing_fields_json").notNull().default("[]"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("webform_submission_unique").on(t.formId, t.submissionKey),
  ],
);
export const webformRateBucket = sqliteTable(
  "webform_rate_bucket",
  {
    formId: text("form_id")
      .notNull()
      .references(() => webformConfig.id, { onDelete: "cascade" }),
    bucket: integer("bucket").notNull(),
    clientHash: text("client_hash").notNull(),
    count: integer("count").notNull(),
  },
  (t) => [primaryKey({ columns: [t.formId, t.bucket, t.clientHash] })],
);
export const integrationApp = sqliteTable("integration_app", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  tokenHint: text("token_hint"),
  grantsJson: text("grants_json").notNull(),
  authorityMembershipId: text("authority_membership_id")
    .notNull()
    .references(() => singletonMembership.userId, { onDelete: "restrict" }),
  status: text("status", { enum: ["active", "revoked"] })
    .notNull()
    .default("active"),
  revision: integer("revision").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  lastUsedAt: integer("last_used_at", { mode: "timestamp_ms" }),
  revokedAt: integer("revoked_at", { mode: "timestamp_ms" }),
});
export const integrationAppAudit = sqliteTable(
  "integration_app_audit",
  {
    id: text("id").primaryKey().notNull(),
    appId: text("app_id")
      .notNull()
      .references(() => integrationApp.id, { onDelete: "restrict" }),
    actorMembershipId: text("actor_membership_id")
      .notNull()
      .references(() => singletonMembership.userId, { onDelete: "restrict" }),
    action: text("action", {
      enum: ["created", "rotated", "revoked"],
    }).notNull(),
    outcome: text("outcome", { enum: ["success"] })
      .notNull()
      .default("success"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    index("integration_app_audit_app_created_idx").on(t.appId, t.createdAt),
  ],
);
export const webhookEndpoint = sqliteTable("webhook_endpoint", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  secretCiphertext: text("secret_ciphertext").notNull(),
  eventsJson: text("events_json").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  revision: integer("revision").notNull().default(0),
  ...timestamps,
});
export const integrationEvent = sqliteTable(
  "integration_event",
  {
    id: text("id").primaryKey().notNull(),
    appId: text("app_id").references(() => integrationApp.id, {
      onDelete: "restrict",
    }),
    endpointId: text("endpoint_id").references(() => webhookEndpoint.id, {
      onDelete: "restrict",
    }),
    direction: text("direction", { enum: ["inbound", "outbound"] }).notNull(),
    eventType: text("event_type").notNull(),
    subjectId: text("subject_id").notNull(),
    externalId: text("external_id").notNull(),
    payloadJson: text("payload_json").notNull(),
    state: text("state", {
      enum: [
        "received",
        "pending",
        "delivering",
        "delivered",
        "failed",
        "superseded",
      ],
    }).notNull(),
    attempts: integer("attempts").notNull().default(0),
    occurredAt: integer("occurred_at", { mode: "timestamp_ms" }).notNull(),
    nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
    lastError: text("last_error"),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [
    uniqueIndex("integration_event_external_unique").on(
      t.appId,
      t.direction,
      t.externalId,
    ),
    uniqueIndex("integration_event_endpoint_unique").on(
      t.endpointId,
      t.direction,
      t.externalId,
    ),
  ],
);
export const integrationOutbox = sqliteTable("integration_outbox", {
  id: text("id").primaryKey().notNull(),
  eventType: text("event_type").notNull(),
  subjectId: text("subject_id").notNull(),
  externalId: text("external_id").notNull().unique(),
  payloadJson: text("payload_json").notNull(),
  depth: integer("depth").notNull().default(0),
  state: text("state", {
    enum: ["pending", "dispatching", "failed", "delivered"],
  })
    .notNull()
    .default("pending"),
  attempts: integer("attempts").notNull().default(0),
  nextAttemptAt: integer("next_attempt_at", { mode: "timestamp_ms" }),
  lastError: text("last_error"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const scheduledDueFence = sqliteTable("scheduled_due_fence", {
  outboxId: text("outbox_id")
    .primaryKey()
    .notNull()
    .references(() => integrationOutbox.id, { onDelete: "cascade" }),
  fencedAt: integer("fenced_at", { mode: "timestamp_ms" }).notNull(),
});
export const emailTemplate = sqliteTable("email_template", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  subject: text("subject").notNull(),
  body: text("body").notNull(),
  requiredVariablesJson: text("required_variables_json").notNull(),
  revision: integer("revision").notNull().default(0),
  ...timestamps,
});
export const automationRule = sqliteTable("automation_rule", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  eventType: text("event_type").notNull(),
  conditionJson: text("condition_json").notNull(),
  actionJson: text("action_json").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  authorityMembershipId: text("authority_membership_id")
    .notNull()
    .references(() => singletonMembership.userId, { onDelete: "restrict" }),
  maxDepth: integer("max_depth").notNull().default(3),
  revision: integer("revision").notNull().default(0),
  ...timestamps,
});
export const automationRun = sqliteTable(
  "automation_run",
  {
    id: text("id").primaryKey().notNull(),
    ruleId: text("rule_id")
      .notNull()
      .references(() => automationRule.id, { onDelete: "restrict" }),
    eventId: text("event_id").notNull(),
    depth: integer("depth").notNull(),
    status: text("status", {
      enum: ["processing", "completed", "skipped", "failed"],
    }).notNull(),
    resultJson: text("result_json").notNull(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [uniqueIndex("automation_run_event_unique").on(t.ruleId, t.eventId)],
);
export const customerSegment = sqliteTable("customer_segment", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  entity: text("entity", {
    enum: ["lead", "contact", "company", "deal"],
  }).notNull(),
  kind: text("kind", { enum: ["static", "dynamic"] }).notNull(),
  filterJson: text("filter_json").notNull(),
  revision: integer("revision").notNull().default(0),
  ...timestamps,
});
export const customerSegmentMember = sqliteTable(
  "customer_segment_member",
  {
    segmentId: text("segment_id")
      .notNull()
      .references(() => customerSegment.id, { onDelete: "cascade" }),
    recordId: text("record_id").notNull(),
    addedAt: integer("added_at", { mode: "timestamp_ms" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.segmentId, t.recordId] })],
);
export const workspaceProfile = sqliteTable("workspace_profile", {
  id: text("id", { enum: ["workspace"] })
    .primaryKey()
    .notNull(),
  name: text("name").notNull(),
  logoObjectKey: text("logo_object_key"),
  logoFileName: text("logo_file_name"),
  logoContentType: text("logo_content_type"),
  logoSize: integer("logo_size"),
  revision: integer("revision").notNull().default(0),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
export const workspaceDeletionRequest = sqliteTable(
  "workspace_deletion_request",
  {
    id: text("id", { enum: ["workspace"] })
      .primaryKey()
      .notNull(),
    requestedBy: text("requested_by").notNull(),
    requestedAt: integer("requested_at", { mode: "timestamp_ms" }).notNull(),
    executeAfter: integer("execute_after", { mode: "timestamp_ms" }).notNull(),
    quiesceUntil: integer("quiesce_until", { mode: "timestamp_ms" }),
    status: text("status", {
      enum: ["scheduled", "cancelled", "executing", "deleted"],
    }).notNull(),
    cancelledAt: integer("cancelled_at", { mode: "timestamp_ms" }),
  },
);
export const workspaceDeletionObject = sqliteTable(
  "workspace_deletion_object",
  {
    objectKey: text("object_key").primaryKey().notNull(),
    state: text("state", { enum: ["pending", "failed", "deleted"] })
      .notNull()
      .default("pending"),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
  },
);
export const configurationCopyAudit = sqliteTable("configuration_copy_audit", {
  id: text("id").primaryKey().notNull(),
  actorId: text("actor_id")
    .notNull()
    .references(() => singletonMembership.userId, { onDelete: "restrict" }),
  keysJson: text("keys_json").notNull(),
  previewJson: text("preview_json").notNull(),
  applied: integer("applied", { mode: "boolean" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
});
