ALTER TABLE notification RENAME TO notification_before_automation;
CREATE TABLE notification(
 id TEXT PRIMARY KEY NOT NULL, recipient_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,
 kind TEXT NOT NULL CHECK(kind IN('appointment','task','ticket','contract','automation')), source_id TEXT NOT NULL, source_revision INTEGER NOT NULL,
 due_at INTEGER NOT NULL, title TEXT NOT NULL, body TEXT, target_url TEXT NOT NULL, dedupe_key TEXT NOT NULL UNIQUE,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN('pending','delivered','failed','cancelled')), attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts>=0),
 next_attempt_at INTEGER, last_error TEXT, browser_delivered_at INTEGER, read_at INTEGER, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
INSERT INTO notification SELECT * FROM notification_before_automation;
DROP TABLE notification_before_automation;
CREATE INDEX notification_recipient_due_idx ON notification(recipient_membership_id,state,due_at);

CREATE TABLE webform_config (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('lead','ticket')),
  mode TEXT NOT NULL CHECK (mode IN ('public','signed_system')),
  token_hash TEXT,
  source TEXT NOT NULL,
  authority_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
  mapping_json TEXT NOT NULL CHECK (json_valid(mapping_json) AND json_type(mapping_json)='object'),
  allow_missing_required INTEGER NOT NULL DEFAULT 0 CHECK (allow_missing_required IN (0,1)),
  rate_limit_hour INTEGER NOT NULL DEFAULT 60 CHECK (rate_limit_hour BETWEEN 1 AND 10000),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  CHECK ((mode='public' AND token_hash IS NULL AND allow_missing_required=0) OR (mode='signed_system' AND token_hash IS NOT NULL))
);
CREATE INDEX webform_authority_idx ON webform_config(authority_membership_id,active);

CREATE TABLE webform_submission (
  id TEXT PRIMARY KEY NOT NULL,
  form_id TEXT NOT NULL REFERENCES webform_config(id) ON DELETE RESTRICT,
  submission_key TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  client_hash TEXT NOT NULL,
  record_id TEXT NOT NULL,
  missing_fields_json TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(missing_fields_json) AND json_type(missing_fields_json)='array'),
  created_at INTEGER NOT NULL,
  UNIQUE(form_id,submission_key)
);
CREATE INDEX webform_submission_form_created_idx ON webform_submission(form_id,created_at);

CREATE TABLE webform_rate_bucket (
  form_id TEXT NOT NULL REFERENCES webform_config(id) ON DELETE CASCADE,
  bucket INTEGER NOT NULL,
  client_hash TEXT NOT NULL,
  count INTEGER NOT NULL CHECK (count BETWEEN 1 AND 10000),
  PRIMARY KEY(form_id,bucket,client_hash)
);

CREATE TABLE integration_app (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  grants_json TEXT NOT NULL CHECK (json_valid(grants_json) AND json_type(grants_json)='array'),
  authority_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE integration_event (
  id TEXT PRIMARY KEY NOT NULL,
  app_id TEXT REFERENCES integration_app(id) ON DELETE RESTRICT,
  endpoint_id TEXT REFERENCES webhook_endpoint(id) ON DELETE RESTRICT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound','outbound')),
  event_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  external_id TEXT NOT NULL,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json)='object'),
  state TEXT NOT NULL CHECK (state IN ('received','pending','delivering','delivered','failed','superseded')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  occurred_at INTEGER NOT NULL,
  next_attempt_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(app_id,direction,external_id),
  UNIQUE(endpoint_id,direction,external_id),
  CHECK ((direction='inbound' AND app_id IS NOT NULL AND endpoint_id IS NULL) OR (direction='outbound' AND app_id IS NULL AND endpoint_id IS NOT NULL))
);
CREATE INDEX integration_event_retry_idx ON integration_event(direction,state,next_attempt_at);

CREATE TABLE integration_outbox (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  external_id TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json) AND json_type(payload_json)='object'),
  depth INTEGER NOT NULL DEFAULT 0 CHECK (depth BETWEEN 0 AND 5),
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','dispatching','failed','delivered')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  next_attempt_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX integration_outbox_dispatch_idx ON integration_outbox(state,next_attempt_at);

CREATE TABLE webhook_endpoint (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  secret_ciphertext TEXT NOT NULL,
  events_json TEXT NOT NULL CHECK (json_valid(events_json) AND json_type(events_json)='array'),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE email_template (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  required_variables_json TEXT NOT NULL CHECK (json_valid(required_variables_json) AND json_type(required_variables_json)='array'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE automation_rule (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  event_type TEXT NOT NULL,
  condition_json TEXT NOT NULL CHECK (json_valid(condition_json) AND json_type(condition_json)='object'),
  action_json TEXT NOT NULL CHECK (json_valid(action_json) AND json_type(action_json)='object'),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  authority_membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
  max_depth INTEGER NOT NULL DEFAULT 3 CHECK (max_depth BETWEEN 1 AND 5),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE automation_run (
  id TEXT PRIMARY KEY NOT NULL,
  rule_id TEXT NOT NULL REFERENCES automation_rule(id) ON DELETE RESTRICT,
  event_id TEXT NOT NULL,
  depth INTEGER NOT NULL CHECK (depth BETWEEN 0 AND 5),
  status TEXT NOT NULL CHECK (status IN ('processing','completed','skipped','failed')),
  result_json TEXT NOT NULL CHECK (json_valid(result_json)),
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(rule_id,event_id)
);

CREATE TABLE customer_segment (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  entity TEXT NOT NULL CHECK (entity IN ('lead','contact','company','deal')),
  kind TEXT NOT NULL CHECK (kind IN ('static','dynamic')),
  filter_json TEXT NOT NULL CHECK (json_valid(filter_json) AND json_type(filter_json)='object'),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE customer_segment_member (
  segment_id TEXT NOT NULL REFERENCES customer_segment(id) ON DELETE CASCADE,
  record_id TEXT NOT NULL,
  added_at INTEGER NOT NULL,
  PRIMARY KEY(segment_id,record_id)
);

CREATE TABLE ai_setting (
  id TEXT PRIMARY KEY NOT NULL CHECK (id='settings'),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  provider TEXT,
  monthly_budget_minor INTEGER NOT NULL DEFAULT 0 CHECK (monthly_budget_minor >= 0),
  used_minor INTEGER NOT NULL DEFAULT 0 CHECK (used_minor >= 0 AND used_minor <= monthly_budget_minor),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
INSERT INTO ai_setting(id,enabled,provider,monthly_budget_minor,used_minor,revision) VALUES('settings',0,NULL,0,0,0);

CREATE TABLE workspace_profile (
  id TEXT PRIMARY KEY NOT NULL CHECK (id='workspace'),
  name TEXT NOT NULL,
  logo_object_key TEXT,
  logo_file_name TEXT,
  logo_content_type TEXT,
  logo_size INTEGER CHECK (logo_size IS NULL OR logo_size BETWEEN 1 AND 2097152),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  updated_at INTEGER NOT NULL
);
INSERT INTO workspace_profile(id,name,revision,updated_at) VALUES('workspace','CRM Workspace',0,unixepoch('subsec')*1000);

CREATE TABLE workspace_deletion_request (
  id TEXT PRIMARY KEY NOT NULL CHECK (id='workspace'),
  requested_by TEXT NOT NULL,
  requested_at INTEGER NOT NULL,
  execute_after INTEGER NOT NULL,
  quiesce_until INTEGER,
  status TEXT NOT NULL CHECK (status IN ('scheduled','cancelled','executing','deleted')),
  cancelled_at INTEGER,
  CHECK (execute_after >= requested_at + 2592000000),
  CHECK (quiesce_until IS NULL OR quiesce_until >= execute_after)
);

CREATE TABLE workspace_deletion_object (
  object_key TEXT PRIMARY KEY NOT NULL,
  state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','failed','deleted')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 20),
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE TABLE configuration_copy_audit (
  id TEXT PRIMARY KEY NOT NULL,
  actor_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE RESTRICT,
  keys_json TEXT NOT NULL CHECK (json_valid(keys_json) AND json_type(keys_json)='array'),
  preview_json TEXT NOT NULL CHECK (json_valid(preview_json) AND json_type(preview_json)='object'),
  applied INTEGER NOT NULL CHECK (applied IN (0,1)),
  created_at INTEGER NOT NULL
);

CREATE TABLE workspace_deletion_guard (id TEXT PRIMARY KEY NOT NULL CHECK(id='workspace'));

CREATE TRIGGER workspace_deletion_block_file_insert BEFORE INSERT ON crm_file WHEN EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;
CREATE TRIGGER workspace_deletion_block_file_ready BEFORE UPDATE OF status ON crm_file WHEN NEW.status='ready' AND EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;
CREATE TRIGGER workspace_deletion_block_document_insert BEFORE INSERT ON contract_document WHEN EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;
CREATE TRIGGER workspace_deletion_block_document_ready BEFORE UPDATE OF status ON contract_document WHEN NEW.status='ready' AND EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;
CREATE TRIGGER workspace_deletion_block_logo BEFORE UPDATE OF logo_object_key ON workspace_profile WHEN NEW.logo_object_key IS NOT OLD.logo_object_key AND EXISTS(SELECT 1 FROM workspace_deletion_request WHERE id='workspace' AND status='executing') BEGIN SELECT RAISE(ABORT,'workspace_deletion_in_progress'); END;

CREATE TRIGGER integration_lead_created AFTER INSERT ON lead BEGIN INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at) VALUES(lower(hex(randomblob(16))),'lead.created',NEW.id,'lead.created:'||NEW.id,json_object('leadId',NEW.id,'source',NEW.source_id),'pending',0,NEW.created_at,NEW.created_at,NEW.created_at); END;
CREATE TRIGGER integration_lead_status AFTER UPDATE OF status_id ON lead WHEN NEW.status_id IS NOT OLD.status_id BEGIN INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at) VALUES(lower(hex(randomblob(16))),'lead.status.changed',NEW.id,'lead.status.changed:'||NEW.id||':'||NEW.revision,json_object('leadId',NEW.id,'status',NEW.status_id),'pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at); END;
CREATE TRIGGER integration_ticket_created AFTER INSERT ON ticket BEGIN INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at) VALUES(lower(hex(randomblob(16))),'ticket.created',NEW.id,'ticket.created:'||NEW.id,json_object('ticketId',NEW.id,'source',NEW.source),'pending',0,NEW.created_at,NEW.created_at,NEW.created_at); END;
CREATE TRIGGER integration_ticket_status AFTER UPDATE OF status ON ticket WHEN NEW.status IS NOT OLD.status BEGIN INSERT OR IGNORE INTO integration_outbox(id,event_type,subject_id,external_id,payload_json,state,attempts,next_attempt_at,created_at,updated_at) VALUES(lower(hex(randomblob(16))),'ticket.status.changed',NEW.id,'ticket.status.changed:'||NEW.id||':'||NEW.revision,json_object('ticketId',NEW.id,'status',NEW.status),'pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at); END;
DROP TRIGGER membership_keep_last_owner_on_delete;
CREATE TRIGGER membership_keep_last_owner_on_delete BEFORE DELETE ON singleton_membership WHEN OLD.role='owner' AND OLD.status='active' AND EXISTS(SELECT 1 FROM singleton_workspace) AND NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT (CASE WHEN (SELECT count(*) FROM singleton_membership WHERE role='owner' AND status='active')<=1 THEN RAISE(ABORT,'last owner protected') END); END;
DROP TRIGGER module_setting_preserve;
CREATE TRIGGER module_setting_preserve BEFORE DELETE ON module_setting WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'module settings must be retained'); END;
DROP TRIGGER record_layout_delete;
CREATE TRIGGER record_layout_delete BEFORE DELETE ON record_layout WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'layout_delete_forbidden'); END;
DROP TRIGGER deal_stage_keep_history;
CREATE TRIGGER deal_stage_keep_history BEFORE DELETE ON deal_stage WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'deal_stage_delete_forbidden'); END;
DROP TRIGGER lead_source_preserve;
CREATE TRIGGER lead_source_preserve BEFORE DELETE ON lead_source WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;
DROP TRIGGER lead_status_preserve;
CREATE TRIGGER lead_status_preserve BEFORE DELETE ON lead_status WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;
DROP TRIGGER crm_file_preserve_key;
CREATE TRIGGER crm_file_preserve_key BEFORE DELETE ON crm_file WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'file_key_retained'); END;
DROP TRIGGER lead_conversion_delete;
CREATE TRIGGER lead_conversion_delete BEFORE DELETE ON lead_conversion WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;
DROP TRIGGER product_category_delete;
CREATE TRIGGER product_category_delete BEFORE DELETE ON product_category WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;
DROP TRIGGER product_delete;
CREATE TRIGGER product_delete BEFORE DELETE ON product WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;
DROP TRIGGER product_variant_delete;
CREATE TRIGGER product_variant_delete BEFORE DELETE ON product_variant WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'catalog_history_retained'); END;
DROP TRIGGER order_operation_immutable_delete;
CREATE TRIGGER order_operation_immutable_delete BEFORE DELETE ON order_operation WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER order_payment_immutable_delete;
CREATE TRIGGER order_payment_immutable_delete BEFORE DELETE ON order_payment WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER order_adjustment_immutable_delete;
CREATE TRIGGER order_adjustment_immutable_delete BEFORE DELETE ON order_adjustment WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER inventory_movement_immutable_delete;
CREATE TRIGGER inventory_movement_immutable_delete BEFORE DELETE ON inventory_movement WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER entitlement_movement_immutable_delete;
CREATE TRIGGER entitlement_movement_immutable_delete BEFORE DELETE ON entitlement_movement WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER sales_order_delete;
CREATE TRIGGER sales_order_delete BEFORE DELETE ON sales_order WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER entitlement_delete;
CREATE TRIGGER entitlement_delete BEFORE DELETE ON service_entitlement WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'sales_history_immutable'); END;
DROP TRIGGER appointment_operation_delete;
CREATE TRIGGER appointment_operation_delete BEFORE DELETE ON appointment_operation WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'appointment_history_immutable'); END;
DROP TRIGGER ticket_cycle_delete;
CREATE TRIGGER ticket_cycle_delete BEFORE DELETE ON ticket_cycle WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'ticket_history_immutable'); END;
DROP TRIGGER ticket_event_delete;
CREATE TRIGGER ticket_event_delete BEFORE DELETE ON ticket_event WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'ticket_history_immutable'); END;
DROP TRIGGER contract_version_delete;
CREATE TRIGGER contract_version_delete BEFORE DELETE ON contract_version WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'contract_history_immutable'); END;
DROP TRIGGER contract_operation_delete;
CREATE TRIGGER contract_operation_delete BEFORE DELETE ON contract_operation WHEN NOT EXISTS(SELECT 1 FROM workspace_deletion_guard) BEGIN SELECT RAISE(ABORT,'contract_history_immutable'); END;
