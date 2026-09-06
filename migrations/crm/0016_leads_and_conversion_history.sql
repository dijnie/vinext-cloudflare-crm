-- Preserve dependent rows before extending entity checks and polymorphic anchors.

DROP TRIGGER "membership_keep_last_owner_on_role_change";

DROP TRIGGER "membership_keep_last_owner_on_status_change";

DROP TRIGGER "membership_keep_last_owner_on_delete";

DROP TRIGGER "company_active_owner_insert";

DROP TRIGGER "company_active_owner_update";

DROP TRIGGER "contact_active_owner_insert";

DROP TRIGGER "contact_active_owner_update";

DROP TRIGGER "deal_active_owner_insert";

DROP TRIGGER "deal_active_owner_update";

DROP TRIGGER "saved_view_active_owner_insert";

DROP TRIGGER "saved_view_active_owner_update";

DROP TRIGGER "activity_visibility_active_member_insert";

DROP TRIGGER "activity_visibility_active_member_update";

DROP TRIGGER "deal_required_relationships_insert";

DROP TRIGGER "deal_required_relationships_update";

DROP TRIGGER "deal_contact_company_insert";

DROP TRIGGER "deal_contact_company_update";

DROP TRIGGER "contact_company_preserves_deals";

DROP TRIGGER "deal_company_preserves_contacts";

DROP TRIGGER "activity_compatible_anchors_insert";

DROP TRIGGER "activity_history_immutable";

DROP TRIGGER "saved_view_creator_immutable";

DROP TRIGGER "saved_view_edit_active_owner";

DROP TRIGGER "deal_currency_job_insert";

DROP TRIGGER "deal_currency_job_money_update";

DROP TRIGGER "deal_currency_job_delete";

DROP TRIGGER "deal_money_revision_update";

DROP TRIGGER "exchange_rate_job_insert";

DROP TRIGGER "exchange_rate_job_update";

DROP TRIGGER "exchange_rate_job_delete";

DROP TRIGGER "membership_default_profile";

DROP TRIGGER "member_branch_active_insert";

DROP TRIGGER "member_branch_active_update";

DROP TRIGGER "branch_archive_in_use";

DROP TRIGGER "branch_default_active";

DROP TRIGGER "membership_clear_branches";

DROP TRIGGER "saved_view_default_visible_insert";

DROP TRIGGER "saved_view_default_visible_update";

DROP TRIGGER "saved_view_default_unshare";

DROP TRIGGER "custom_field_active_user_insert";

DROP TRIGGER "custom_field_active_user_update";

DROP TRIGGER "membership_requires_reference_cleanup";

DROP TRIGGER "custom_field_position_insert";

DROP TRIGGER "custom_field_position_update";

DROP TRIGGER "custom_field_option_position_insert";

DROP TRIGGER "custom_field_option_position_update";

DROP TRIGGER "custom_field_identity_immutable";

DROP TRIGGER "custom_field_option_owner_immutable";

DROP TRIGGER "custom_field_option_available_insert";

DROP TRIGGER "custom_field_option_available_update";

DROP TRIGGER "custom_field_value_validate_insert";

DROP TRIGGER "custom_field_rating_config_update";

DROP TRIGGER "field_configuration_insert";

DROP TRIGGER "field_configuration_update";

DROP TRIGGER "field_configuration_delete";

DROP TRIGGER "formula_field_value_insert";

DROP TRIGGER "formula_field_config_insert";

DROP TRIGGER "formula_field_value_update";

DROP TRIGGER "formula_field_config_update";

DROP TRIGGER "field_value_revision_definition";

DROP TRIGGER "field_value_revision_insert";

DROP TRIGGER "field_value_revision_update";

DROP TRIGGER "field_value_revision_delete";

DROP TRIGGER "field_option_revision_insert";

DROP TRIGGER "field_option_revision_update";

DROP TRIGGER "field_option_revision_delete";

DROP TRIGGER "custom_field_type_with_values";

DROP TRIGGER "custom_field_value_validate_update";

DROP TRIGGER "crm_file_pending_insert";

DROP TRIGGER "crm_file_immutable_update";

DROP TRIGGER "crm_file_preserve_key";

DROP TRIGGER "custom_field_file_validate_insert";

DROP TRIGGER "custom_field_file_validate_update";

DROP TRIGGER "module_setting_entity_immutable";

DROP TRIGGER "module_setting_preserve";

DROP TRIGGER "record_layout_identity";

DROP TRIGGER "record_layout_delete";

DROP TRIGGER "record_draft_identity";

DROP TRIGGER "deal_stage_identity";

DROP TRIGGER "deal_stage_default_available";

DROP TRIGGER "deal_stage_keep_history";

DROP TRIGGER "deal_stage_insert_revision";

DROP TRIGGER "deal_stage_update_revision";

DROP TRIGGER "deal_active_stage_insert";

DROP TRIGGER "deal_active_stage_update";

CREATE TABLE lead_source(id TEXT PRIMARY KEY NOT NULL,label TEXT,label_key TEXT NOT NULL,position INTEGER NOT NULL UNIQUE,archived_at INTEGER);
CREATE TABLE lead_status(id TEXT PRIMARY KEY NOT NULL,label TEXT,label_key TEXT NOT NULL,position INTEGER NOT NULL UNIQUE,archived_at INTEGER,meaning TEXT NOT NULL CHECK(meaning IN ('working','rejected','converted')) CHECK((meaning='converted')=(id='converted')),requires_reason INTEGER NOT NULL DEFAULT 0 CHECK(requires_reason IN (0,1)));
CREATE TABLE lead_settings_revision(id TEXT PRIMARY KEY NOT NULL CHECK(id='settings'),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0));
INSERT INTO lead_settings_revision VALUES('settings',0);
INSERT INTO lead_source VALUES('manual',NULL,'leadSource.manual',10,NULL);
INSERT INTO lead_status VALUES('new',NULL,'leadStatus.new',10,NULL,'working',0),('contacted',NULL,'leadStatus.contacted',20,NULL,'working',0),('nurturing',NULL,'leadStatus.nurturing',30,NULL,'working',0),('unqualified',NULL,'leadStatus.unqualified',40,NULL,'rejected',0),('converted',NULL,'leadStatus.converted',50,NULL,'converted',0);
CREATE TABLE lead(
 id TEXT PRIMARY KEY NOT NULL,first_name TEXT NOT NULL,last_name TEXT,email TEXT,phone TEXT,normalized_email TEXT,normalized_phone TEXT,title TEXT,description TEXT,
 company_id TEXT REFERENCES company(id) ON DELETE SET NULL,source_id TEXT NOT NULL DEFAULT 'manual' REFERENCES lead_source(id) ON DELETE RESTRICT,status_id TEXT NOT NULL DEFAULT 'new' REFERENCES lead_status(id) ON DELETE RESTRICT,rejection_reason TEXT,
 owner_membership_id TEXT REFERENCES singleton_membership(user_id) ON DELETE SET NULL,creator_user_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
 revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),last_activity_at INTEGER,archived_at INTEGER,converted_at INTEGER,converted_contact_id TEXT REFERENCES contact(id) ON DELETE RESTRICT,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL,
 CHECK((converted_at IS NULL AND converted_contact_id IS NULL AND status_id!='converted') OR (converted_at IS NOT NULL AND converted_contact_id IS NOT NULL AND status_id='converted'))
);
CREATE INDEX lead_source_idx ON lead(source_id); CREATE INDEX lead_status_idx ON lead(status_id); CREATE INDEX lead_owner_idx ON lead(owner_membership_id); CREATE INDEX lead_email_idx ON lead(normalized_email); CREATE INDEX lead_phone_idx ON lead(normalized_phone); CREATE INDEX lead_created_idx ON lead(created_at,id);
CREATE TABLE lead_collaborator(lead_id TEXT NOT NULL REFERENCES lead(id) ON DELETE CASCADE,membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,PRIMARY KEY(lead_id,membership_id));
CREATE INDEX lead_collaborator_member_idx ON lead_collaborator(membership_id,lead_id);
CREATE TABLE lead_mapping(id TEXT PRIMARY KEY NOT NULL CHECK(id='contact'),revision INTEGER NOT NULL DEFAULT 0 CHECK(revision>=0),mappings_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(mappings_json)),auto_order INTEGER NOT NULL DEFAULT 0 CHECK(auto_order=0),auto_deal INTEGER NOT NULL DEFAULT 0 CHECK(auto_deal=0),updated_at INTEGER NOT NULL);
INSERT INTO lead_mapping(id,mappings_json,updated_at) VALUES('contact','[{"source":"builtin:firstName","target":"builtin:firstName"},{"source":"builtin:lastName","target":"builtin:lastName"},{"source":"builtin:email","target":"builtin:email"},{"source":"builtin:phone","target":"builtin:phone"},{"source":"builtin:title","target":"builtin:title"},{"source":"builtin:companyId","target":"builtin:companyId"},{"source":"builtin:ownerMembershipId","target":"builtin:ownerMembershipId"}]',0);
CREATE TABLE lead_conversion(id TEXT PRIMARY KEY NOT NULL,lead_id TEXT NOT NULL UNIQUE REFERENCES lead(id) ON DELETE RESTRICT,operation_key TEXT NOT NULL UNIQUE,fingerprint TEXT NOT NULL,actor_id TEXT NOT NULL REFERENCES user(id) ON DELETE RESTRICT,contact_id TEXT NOT NULL REFERENCES contact(id) ON DELETE RESTRICT,mode TEXT NOT NULL CHECK(mode IN ('create','link')),lead_revision INTEGER NOT NULL,mapping_revision INTEGER NOT NULL,snapshot_json TEXT NOT NULL CHECK(json_valid(snapshot_json)),result_json TEXT NOT NULL CHECK(json_valid(result_json)),completed_at INTEGER NOT NULL);
ALTER TABLE contact ADD COLUMN normalized_phone TEXT;
CREATE INDEX contact_normalized_phone_idx ON contact(normalized_phone);
WITH RECURSIVE digits(id,rest,value,valid) AS (
 SELECT id,CASE WHEN substr(trim(coalesce(phone,''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),1,1)='+' THEN substr(trim(coalesce(phone,''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),2) ELSE trim(coalesce(phone,''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)) END,CASE WHEN substr(trim(coalesce(phone,''),char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279)),1,1)='+' THEN '+' ELSE '' END,1 FROM contact
 UNION ALL SELECT id,substr(rest,2),value || CASE WHEN substr(rest,1,1) GLOB '[0-9]' THEN substr(rest,1,1) ELSE '' END,
 valid AND (substr(rest,1,1) GLOB '[0-9]' OR instr('().-' || char(9,10,11,12,13,32,160,5760,8192,8193,8194,8195,8196,8197,8198,8199,8200,8201,8202,8232,8233,8239,8287,12288,65279),substr(rest,1,1))>0) FROM digits WHERE length(rest)>0
) UPDATE contact SET normalized_phone=(SELECT CASE WHEN valid=0 OR value IN ('','+') THEN NULL ELSE value END FROM digits WHERE digits.id=contact.id AND rest='');


CREATE TABLE "activity_lead_backup" AS SELECT * FROM "activity";

CREATE TABLE "activity_visibility_lead_backup" AS SELECT * FROM "activity_visibility";

CREATE TABLE "crm_file_lead_backup" AS SELECT * FROM "crm_file";

CREATE TABLE "custom_field_definition_lead_backup" AS SELECT * FROM "custom_field_definition";

CREATE TABLE "custom_field_option_lead_backup" AS SELECT * FROM "custom_field_option";

CREATE TABLE "custom_field_value_lead_backup" AS SELECT * FROM "custom_field_value";

CREATE TABLE "field_configuration_revision_lead_backup" AS SELECT * FROM "field_configuration_revision";

CREATE TABLE "field_conversion_guard_lead_backup" AS SELECT * FROM "field_conversion_guard";

CREATE TABLE "field_conversion_preview_lead_backup" AS SELECT * FROM "field_conversion_preview";

CREATE TABLE "field_value_revision_lead_backup" AS SELECT * FROM "field_value_revision";

CREATE TABLE "module_setting_lead_backup" AS SELECT * FROM "module_setting";

CREATE TABLE "record_draft_lead_backup" AS SELECT * FROM "record_draft";

CREATE TABLE "record_layout_lead_backup" AS SELECT * FROM "record_layout";

CREATE TABLE "saved_view_lead_backup" AS SELECT * FROM "saved_view";

CREATE TABLE "saved_view_default_lead_backup" AS SELECT * FROM "saved_view_default";

DROP TABLE "saved_view_default";

DROP TABLE "saved_view";

DROP TABLE "record_layout";

DROP TABLE "record_draft";

DROP TABLE "module_setting";

DROP TABLE "field_value_revision";

DROP TABLE "field_conversion_preview";

DROP TABLE "field_conversion_guard";

DROP TABLE "field_configuration_revision";

DROP TABLE "custom_field_value";

DROP TABLE "custom_field_option";

DROP TABLE "custom_field_definition";

DROP TABLE "crm_file";

DROP TABLE "activity_visibility";

DROP TABLE "activity";

CREATE TABLE "activity" (
  id text PRIMARY KEY NOT NULL,
  type text NOT NULL CHECK (type IN ('note', 'call', 'meeting', 'task', 'stage_change')),
  subject text,
  content text,
  occurred_at integer,
  due_at integer,
  completed_at integer,
  company_id text REFERENCES company(id) ON DELETE CASCADE,
  contact_id text REFERENCES contact(id) ON DELETE CASCADE,
  deal_id text REFERENCES deal(id) ON DELETE CASCADE,
  author_user_id text NOT NULL REFERENCES user(id) ON DELETE RESTRICT,
  metadata_json text CHECK (metadata_json IS NULL OR json_valid(metadata_json)),
  created_at integer NOT NULL,
  updated_at integer NOT NULL,
  "lead_id" TEXT REFERENCES lead(id) ON DELETE CASCADE,
  CHECK (((company_id IS NOT NULL) + (contact_id IS NOT NULL) + (deal_id IS NOT NULL) + (lead_id IS NOT NULL)) >= 1)
);

INSERT INTO "activity"("id","type","subject","content","occurred_at","due_at","completed_at","company_id","contact_id","deal_id","author_user_id","metadata_json","created_at","updated_at") SELECT "id","type","subject","content","occurred_at","due_at","completed_at","company_id","contact_id","deal_id","author_user_id","metadata_json","created_at","updated_at" FROM "activity_lead_backup";

DROP TABLE "activity_lead_backup";

CREATE TABLE `activity_visibility` (
  `activity_id` text NOT NULL REFERENCES `activity` (`id`) ON DELETE CASCADE,
  `membership_id` text NOT NULL REFERENCES `singleton_membership` (`user_id`) ON DELETE CASCADE,
  PRIMARY KEY (`activity_id`, `membership_id`)
);

INSERT INTO "activity_visibility"("activity_id","membership_id") SELECT "activity_id","membership_id" FROM "activity_visibility_lead_backup";

DROP TABLE "activity_visibility_lead_backup";

CREATE TABLE crm_file (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  record_id TEXT NOT NULL,
  field_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL,
  file_name TEXT NOT NULL CHECK(length(file_name) BETWEEN 1 AND 255),
  size INTEGER NOT NULL CHECK(typeof(size)='integer' AND size BETWEEN 0 AND 10485760),
  status TEXT NOT NULL CHECK(status IN ('pending','ready','failed','cleaning')),
  created_at INTEGER NOT NULL,
  ready_at INTEGER,
  cleanup_attempted_at INTEGER,
  CHECK((status='ready' AND ready_at IS NOT NULL) OR (status!='ready' AND ready_at IS NULL))
);

INSERT INTO "crm_file"("id","object_key","entity","record_id","field_id","uploader_id","file_name","size","status","created_at","ready_at","cleanup_attempted_at") SELECT "id","object_key","entity","record_id","field_id","uploader_id","file_name","size","status","created_at","ready_at","cleanup_attempted_at" FROM "crm_file_lead_backup";

DROP TABLE "crm_file_lead_backup";

CREATE TABLE "custom_field_definition" (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal', 'lead')),
  `key` text NOT NULL,
  `label` text NOT NULL,
  `type` text NOT NULL CHECK (`type` IN ('text', 'long_text', 'number', 'date', 'checkbox', 'select', 'url', 'email', 'phone', 'user', 'money', 'multiselect', 'multivalue', 'rating', 'customer', 'formula', 'file')),
  `config_json` text CHECK (`config_json` IS NULL OR json_valid(`config_json`)),
  `required` integer DEFAULT false NOT NULL,
  `show_on_sheet` integer DEFAULT true NOT NULL,
  `show_on_table` integer DEFAULT false NOT NULL,
  `show_on_filter` integer DEFAULT false NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, deleted_at integer);

INSERT INTO "custom_field_definition"("id","entity","key","label","type","config_json","required","show_on_sheet","show_on_table","show_on_filter","position","archived_at","created_at","updated_at","deleted_at") SELECT "id","entity","key","label","type","config_json","required","show_on_sheet","show_on_table","show_on_filter","position","archived_at","created_at","updated_at","deleted_at" FROM "custom_field_definition_lead_backup";

DROP TABLE "custom_field_definition_lead_backup";

CREATE TABLE "custom_field_option" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition" (`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer
);

INSERT INTO "custom_field_option"("id","field_id","label","position","archived_at") SELECT "id","field_id","label","position","archived_at" FROM "custom_field_option_lead_backup";

DROP TABLE "custom_field_option_lead_backup";

CREATE TABLE "custom_field_value" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition" (`id`) ON DELETE CASCADE,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `text_value` text,
  `number_value` integer,
  `date_value` integer,
  `boolean_value` integer,
  `option_id` text REFERENCES "custom_field_option" (`id`) ON DELETE SET NULL,
  `user_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `updated_at` integer NOT NULL,
  json_value text CHECK (json_value IS NULL OR json_valid(json_value)),
  customer_reference_id text REFERENCES contact(id) ON DELETE RESTRICT,
  "lead_id" TEXT REFERENCES lead(id) ON DELETE CASCADE,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL) + (`lead_id` IS NOT NULL)) = 1)
);

INSERT INTO "custom_field_value"("id","field_id","company_id","contact_id","deal_id","text_value","number_value","date_value","boolean_value","option_id","user_membership_id","updated_at","json_value","customer_reference_id") SELECT "id","field_id","company_id","contact_id","deal_id","text_value","number_value","date_value","boolean_value","option_id","user_membership_id","updated_at","json_value","customer_reference_id" FROM "custom_field_value_lead_backup";

DROP TABLE "custom_field_value_lead_backup";

CREATE TABLE field_configuration_revision (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "field_configuration_revision"("entity","revision") SELECT "entity","revision" FROM "field_configuration_revision_lead_backup";

DROP TABLE "field_configuration_revision_lead_backup";

CREATE TABLE "field_conversion_guard" (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL
);

INSERT INTO "field_conversion_guard"("field_id","source_type","target_type") SELECT "field_id","source_type","target_type" FROM "field_conversion_guard_lead_backup";

DROP TABLE "field_conversion_guard_lead_backup";

CREATE TABLE "field_conversion_preview" (
  id TEXT PRIMARY KEY NOT NULL,
  field_id TEXT NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  configuration_revision INTEGER NOT NULL,
  value_revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT INTO "field_conversion_preview"("id","field_id","user_id","source_type","target_type","config_json","configuration_revision","value_revision","expires_at") SELECT "id","field_id","user_id","source_type","target_type","config_json","configuration_revision","value_revision","expires_at" FROM "field_conversion_preview_lead_backup";

DROP TABLE "field_conversion_preview_lead_backup";

CREATE TABLE "field_value_revision" (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES "custom_field_definition"(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO "field_value_revision"("field_id","revision") SELECT "field_id","revision" FROM "field_value_revision_lead_backup";

DROP TABLE "field_value_revision_lead_backup";

CREATE TABLE module_setting (
  entity TEXT PRIMARY KEY NOT NULL CHECK (entity IN ('company','contact','deal','lead')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision) = 'integer' AND revision >= 0),
  updated_at INTEGER NOT NULL
);

INSERT INTO "module_setting"("entity","enabled","revision","updated_at") SELECT "entity","enabled","revision","updated_at" FROM "module_setting_lead_backup";

DROP TABLE "module_setting_lead_backup";

CREATE TABLE record_draft (
  id TEXT PRIMARY KEY NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK(expires_at > created_at)
);

INSERT INTO "record_draft"("id","entity","user_id","expires_at","consumed_at","created_at") SELECT "id","entity","user_id","expires_at","consumed_at","created_at" FROM "record_draft_lead_backup";

DROP TABLE "record_draft_lead_backup";

CREATE TABLE record_layout (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  fields_json TEXT NOT NULL DEFAULT 'null' CHECK(json_valid(fields_json)),
  updated_at INTEGER NOT NULL
);

INSERT INTO "record_layout"("entity","revision","fields_json","updated_at") SELECT "entity","revision","fields_json","updated_at" FROM "record_layout_lead_backup";

DROP TABLE "record_layout_lead_backup";

CREATE TABLE `saved_view` (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal', 'lead')),
  `name` text NOT NULL,
  `shared` integer DEFAULT false NOT NULL,
  `state_json` text NOT NULL CHECK (json_valid(`state_json`)),
  `owner_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
, creator_user_id text REFERENCES user(id) ON DELETE SET NULL);

INSERT INTO "saved_view"("id","entity","name","shared","state_json","owner_membership_id","created_at","updated_at","creator_user_id") SELECT "id","entity","name","shared","state_json","owner_membership_id","created_at","updated_at","creator_user_id" FROM "saved_view_lead_backup";

DROP TABLE "saved_view_lead_backup";

CREATE TABLE saved_view_default (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal','lead')),
  view_id TEXT NOT NULL REFERENCES saved_view(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, entity)
);

INSERT INTO "saved_view_default"("user_id","entity","view_id") SELECT "user_id","entity","view_id" FROM "saved_view_default_lead_backup";

DROP TABLE "saved_view_default_lead_backup";

CREATE INDEX `activity_visibility_member_idx` ON `activity_visibility` (`membership_id`);

CREATE UNIQUE INDEX `saved_view_owner_name_unique` ON `saved_view` (`entity`, `owner_membership_id`, `name`);

CREATE INDEX `saved_view_entity_shared_idx` ON `saved_view` (`entity`, `shared`);

CREATE INDEX activity_company_created_idx ON activity(company_id, created_at, id);

CREATE INDEX activity_contact_created_idx ON activity(contact_id, created_at, id);

CREATE INDEX activity_deal_created_idx ON activity(deal_id, created_at, id);

CREATE INDEX activity_due_idx ON activity(due_at);

CREATE INDEX activity_author_idx ON activity(author_user_id);

CREATE UNIQUE INDEX saved_view_creator_name_unique ON saved_view(entity, creator_user_id, name);

CREATE INDEX saved_view_default_view_idx ON saved_view_default(view_id);

CREATE UNIQUE INDEX `custom_field_entity_key_unique` ON `custom_field_definition` (`entity`, `key`);

CREATE INDEX `custom_field_entity_position_idx` ON `custom_field_definition` (`entity`, `position`);

CREATE INDEX `custom_field_option_position_idx` ON `custom_field_option` (`field_id`, `position`);

CREATE UNIQUE INDEX `custom_field_company_unique` ON `custom_field_value` (`field_id`, `company_id`);

CREATE UNIQUE INDEX `custom_field_contact_unique` ON `custom_field_value` (`field_id`, `contact_id`);

CREATE UNIQUE INDEX `custom_field_deal_unique` ON `custom_field_value` (`field_id`, `deal_id`);

CREATE INDEX `custom_field_value_text_idx` ON `custom_field_value` (`field_id`, `text_value`);

CREATE INDEX `custom_field_value_number_idx` ON `custom_field_value` (`field_id`, `number_value`);

CREATE INDEX `custom_field_value_date_idx` ON `custom_field_value` (`field_id`, `date_value`);

CREATE INDEX `custom_field_value_user_idx` ON `custom_field_value` (`user_membership_id`);

CREATE INDEX custom_field_value_option_idx ON custom_field_value(field_id, option_id);

CREATE INDEX custom_field_value_customer_idx ON custom_field_value(customer_reference_id);

CREATE UNIQUE INDEX field_conversion_preview_owner_idx ON field_conversion_preview(field_id,user_id);

CREATE INDEX field_conversion_preview_expiry_idx ON field_conversion_preview(expires_at);

CREATE UNIQUE INDEX crm_file_object_key_unique ON crm_file(object_key);

CREATE INDEX crm_file_anchor_idx ON crm_file(entity,record_id,field_id);

CREATE INDEX crm_file_cleanup_idx ON crm_file(status,created_at);

CREATE UNIQUE INDEX custom_field_lead_unique ON custom_field_value(field_id,lead_id);

CREATE INDEX activity_lead_created_idx ON activity(lead_id,created_at,id);

INSERT INTO module_setting(entity,enabled,revision,updated_at) VALUES('lead',1,0,0);

INSERT INTO record_layout(entity,updated_at) VALUES('lead',0);

INSERT INTO field_configuration_revision(entity,revision) VALUES('lead',0);

CREATE TRIGGER `membership_keep_last_owner_on_role_change`
BEFORE UPDATE OF `role` ON `singleton_membership`
WHEN OLD.`role` = 'owner' AND OLD.`status` = 'active' AND NEW.`role` != 'owner'
  AND EXISTS (SELECT 1 FROM `singleton_workspace`)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM `singleton_membership` WHERE `role` = 'owner' AND `status` = 'active') <= 1
    THEN RAISE(ABORT, 'last owner protected') END);
END;

CREATE TRIGGER `membership_keep_last_owner_on_status_change`
BEFORE UPDATE OF `status` ON `singleton_membership`
WHEN OLD.`role` = 'owner' AND OLD.`status` = 'active' AND NEW.`status` != 'active'
  AND EXISTS (SELECT 1 FROM `singleton_workspace`)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM `singleton_membership` WHERE `role` = 'owner' AND `status` = 'active') <= 1
    THEN RAISE(ABORT, 'last owner protected') END);
END;

CREATE TRIGGER `membership_keep_last_owner_on_delete`
BEFORE DELETE ON `singleton_membership`
WHEN OLD.`role` = 'owner' AND OLD.`status` = 'active'
  AND EXISTS (SELECT 1 FROM `singleton_workspace`)
BEGIN
  SELECT (CASE WHEN (SELECT count(*) FROM `singleton_membership` WHERE `role` = 'owner' AND `status` = 'active') <= 1
    THEN RAISE(ABORT, 'last owner protected') END);
END;

CREATE TRIGGER `company_active_owner_insert`
BEFORE INSERT ON `company`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;

CREATE TRIGGER `company_active_owner_update`
BEFORE UPDATE OF `owner_membership_id` ON `company`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;

CREATE TRIGGER `contact_active_owner_insert`
BEFORE INSERT ON `contact`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;

CREATE TRIGGER `contact_active_owner_update`
BEFORE UPDATE OF `owner_membership_id` ON `contact`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;

CREATE TRIGGER `deal_active_owner_insert`
BEFORE INSERT ON `deal`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;

CREATE TRIGGER `deal_active_owner_update`
BEFORE UPDATE OF `owner_membership_id` ON `deal`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'owner membership is inactive') END);
END;

CREATE TRIGGER `saved_view_active_owner_insert`
BEFORE INSERT ON `saved_view`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'view owner membership is inactive') END);
END;

CREATE TRIGGER `saved_view_active_owner_update`
BEFORE UPDATE OF `owner_membership_id` ON `saved_view`
WHEN NEW.`owner_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`owner_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'view owner membership is inactive') END);
END;

CREATE TRIGGER `activity_visibility_active_member_insert`
BEFORE INSERT ON `activity_visibility`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'activity membership is inactive') END);
END;

CREATE TRIGGER `activity_visibility_active_member_update`
BEFORE UPDATE OF `membership_id` ON `activity_visibility`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'activity membership is inactive') END);
END;

CREATE TRIGGER `deal_required_relationships_insert`
BEFORE INSERT ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_required_relationships_update`
BEFORE UPDATE OF `company_id`, `owner_membership_id` ON `deal`
BEGIN
  SELECT (CASE WHEN NEW.`company_id` IS NULL OR NEW.`owner_membership_id` IS NULL
    THEN RAISE(ABORT, 'deal company and owner are required') END);
END;

CREATE TRIGGER `deal_contact_company_insert`
BEFORE INSERT ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `deal_contact_company_update`
BEFORE UPDATE OF `deal_id`, `contact_id` ON `deal_contact`
BEGIN
  SELECT (CASE WHEN NOT EXISTS (
    SELECT 1
      FROM `deal`
      JOIN `contact` ON `contact`.`id` = NEW.`contact_id`
     WHERE `deal`.`id` = NEW.`deal_id`
       AND `deal`.`company_id` IS NOT NULL
       AND `contact`.`company_id` = `deal`.`company_id`
  ) THEN RAISE(ABORT, 'deal contact company mismatch') END);
END;

CREATE TRIGGER `contact_company_preserves_deals`
BEFORE UPDATE OF `company_id` ON `contact`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `deal` ON `deal`.`id` = `deal_contact`.`deal_id`
     WHERE `deal_contact`.`contact_id` = OLD.`id`
       AND (NEW.`company_id` IS NULL OR NEW.`company_id` != `deal`.`company_id`)
  ) THEN RAISE(ABORT, 'contact company conflicts with a deal') END);
END;

CREATE TRIGGER `deal_company_preserves_contacts`
BEFORE UPDATE OF `company_id` ON `deal`
BEGIN
  SELECT (CASE WHEN EXISTS (
    SELECT 1
      FROM `deal_contact`
      JOIN `contact` ON `contact`.`id` = `deal_contact`.`contact_id`
     WHERE `deal_contact`.`deal_id` = OLD.`id`
       AND (`contact`.`company_id` IS NULL OR `contact`.`company_id` != NEW.`company_id`)
  ) THEN RAISE(ABORT, 'deal company conflicts with a contact') END);
END;

CREATE TRIGGER activity_compatible_anchors_insert
BEFORE INSERT ON activity
BEGIN
 SELECT (CASE WHEN NEW.lead_id IS NOT NULL AND (NEW.company_id IS NOT NULL OR NEW.contact_id IS NOT NULL OR NEW.deal_id IS NOT NULL) THEN RAISE(ABORT,'activity anchor mismatch') END);
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id = NEW.author_user_id AND status = 'active')
    THEN RAISE(ABORT, 'author membership is inactive') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact WHERE id = NEW.contact_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.deal_id IS NOT NULL AND NEW.company_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM deal WHERE id = NEW.deal_id AND company_id = NEW.company_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
  SELECT (CASE WHEN NEW.contact_id IS NOT NULL AND NEW.deal_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM contact JOIN deal ON contact.company_id = deal.company_id WHERE contact.id = NEW.contact_id AND deal.id = NEW.deal_id)
    THEN RAISE(ABORT, 'activity anchor mismatch') END);
END;

CREATE TRIGGER activity_history_immutable
BEFORE UPDATE ON activity
WHEN OLD.type != 'task' OR NEW.type != OLD.type OR NEW.id != OLD.id
  OR NEW.author_user_id != OLD.author_user_id OR NEW.created_at != OLD.created_at
  OR NEW.company_id IS NOT OLD.company_id OR NEW.contact_id IS NOT OLD.contact_id
  OR NEW.lead_id IS NOT OLD.lead_id OR NEW.deal_id IS NOT OLD.deal_id OR NEW.subject IS NOT OLD.subject
  OR NEW.content IS NOT OLD.content OR NEW.occurred_at IS NOT OLD.occurred_at
  OR NEW.due_at IS NOT OLD.due_at OR NEW.metadata_json IS NOT OLD.metadata_json
BEGIN
  SELECT RAISE(ABORT, 'activity history is immutable');
END;

CREATE TRIGGER saved_view_creator_immutable BEFORE UPDATE OF creator_user_id ON saved_view
WHEN NEW.creator_user_id IS NOT NULL AND NEW.creator_user_id IS NOT OLD.creator_user_id
BEGIN SELECT RAISE(ABORT, 'saved_view_creator_immutable'); END;

CREATE TRIGGER saved_view_edit_active_owner BEFORE UPDATE ON saved_view
WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active'
)
BEGIN SELECT RAISE(ABORT, 'saved_view_owner_inactive'); END;

CREATE TRIGGER deal_currency_job_insert BEFORE INSERT ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_currency_job_money_update BEFORE UPDATE OF amount_minor,currency ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency)
 AND EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_currency_job_delete BEFORE DELETE ON deal
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER deal_money_revision_update BEFORE UPDATE ON deal
WHEN (NEW.amount_minor IS NOT OLD.amount_minor OR NEW.currency IS NOT OLD.currency) AND NEW.money_revision != OLD.money_revision + 1
BEGIN SELECT RAISE(ABORT,'deal_money_revision_conflict'); END;

CREATE TRIGGER exchange_rate_job_insert BEFORE INSERT ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER exchange_rate_job_update BEFORE UPDATE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER exchange_rate_job_delete BEFORE DELETE ON exchange_rate
WHEN EXISTS(SELECT 1 FROM crm_setting WHERE pending_job_id IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'currency_job_pending'); END;

CREATE TRIGGER membership_default_profile AFTER INSERT ON singleton_membership
BEGIN
  INSERT INTO membership_access VALUES (NEW.user_id, 'standard-member');
END;

CREATE TRIGGER member_branch_active_insert BEFORE INSERT ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER member_branch_active_update BEFORE UPDATE ON member_branch
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active')
    OR NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER branch_archive_in_use BEFORE UPDATE OF archived_at ON branch WHEN NEW.archived_at IS NOT NULL
BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM branch_setting WHERE default_branch_id=OLD.id)
    OR EXISTS (SELECT 1 FROM member_branch WHERE branch_id=OLD.id)
    THEN RAISE(ABORT, 'branch_in_use') END);
END;

CREATE TRIGGER branch_default_active BEFORE UPDATE OF default_branch_id ON branch_setting
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM branch WHERE id=NEW.default_branch_id AND archived_at IS NULL)
    THEN RAISE(ABORT, 'branch_assignment_invalid') END);
END;

CREATE TRIGGER membership_clear_branches AFTER UPDATE OF status ON singleton_membership WHEN NEW.status='revoked'
BEGIN
  DELETE FROM member_branch WHERE membership_id=NEW.user_id;
END;

CREATE TRIGGER saved_view_default_visible_insert BEFORE INSERT ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;

CREATE TRIGGER saved_view_default_visible_update BEFORE UPDATE ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;

CREATE TRIGGER saved_view_default_unshare AFTER UPDATE OF shared ON saved_view
WHEN OLD.shared=1 AND NEW.shared=0
BEGIN DELETE FROM saved_view_default WHERE view_id=NEW.id AND user_id IS NOT NEW.creator_user_id; END;

CREATE TRIGGER `custom_field_active_user_insert`
BEFORE INSERT ON `custom_field_value`
WHEN NEW.`user_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`user_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'field user membership is inactive') END);
END;

CREATE TRIGGER `custom_field_active_user_update`
BEFORE UPDATE OF `user_membership_id` ON `custom_field_value`
WHEN NEW.`user_membership_id` IS NOT NULL
BEGIN
  SELECT (CASE WHEN NOT EXISTS (SELECT 1 FROM `singleton_membership` WHERE `user_id` = NEW.`user_membership_id` AND `status` = 'active')
    THEN RAISE(ABORT, 'field user membership is inactive') END);
END;

CREATE TRIGGER `membership_requires_reference_cleanup`
BEFORE UPDATE OF `status` ON `singleton_membership`
WHEN OLD.`status` = 'active' AND NEW.`status` = 'revoked'
BEGIN
  SELECT (CASE WHEN EXISTS (SELECT 1 FROM `company` WHERE `owner_membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `contact` WHERE `owner_membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `deal` WHERE `owner_membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `custom_field_value` WHERE `user_membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `activity_visibility` WHERE `membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM `saved_view` WHERE `owner_membership_id` = OLD.`user_id`)
    OR EXISTS (SELECT 1 FROM lead WHERE owner_membership_id=OLD.user_id) OR EXISTS (SELECT 1 FROM lead_collaborator WHERE membership_id=OLD.user_id) THEN RAISE(ABORT, 'membership references require cleanup') END);
END;

CREATE TRIGGER custom_field_position_insert BEFORE INSERT ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_position_update BEFORE UPDATE OF position ON custom_field_definition
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_insert BEFORE INSERT ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_option_position_update BEFORE UPDATE OF position ON custom_field_option
WHEN typeof(NEW.position) != 'integer' OR NEW.position < 0
BEGIN SELECT RAISE(ABORT, 'field_position_invalid'); END;

CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE OF key,entity ON custom_field_definition
WHEN NEW.key != OLD.key OR NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'field_identity_immutable'); END;

CREATE TRIGGER custom_field_option_owner_immutable BEFORE UPDATE OF field_id ON custom_field_option
WHEN NEW.field_id != OLD.field_id
BEGIN SELECT RAISE(ABORT, 'field_option_owner_immutable'); END;

CREATE TRIGGER custom_field_option_available_insert BEFORE INSERT ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_option_available_update BEFORE UPDATE ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type IN ('select','multiselect'))
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;

CREATE TRIGGER custom_field_value_validate_insert BEFORE INSERT ON custom_field_value
BEGIN
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL) OR (f.entity = 'lead' AND NEW.lead_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND archived_at IS NULL
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER custom_field_rating_config_update BEFORE UPDATE OF config_json ON custom_field_definition
WHEN NEW.type='rating' AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=NEW.id AND number_value > coalesce(json_extract(NEW.config_json,'$.ratingMax'),5))
BEGIN SELECT RAISE(ABORT, 'field_rating_has_values'); END;

CREATE TRIGGER field_configuration_insert AFTER INSERT ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_update AFTER UPDATE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=NEW.entity; END;

CREATE TRIGGER field_configuration_delete AFTER DELETE ON custom_field_definition
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=OLD.entity; END;

CREATE TRIGGER formula_field_value_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_insert BEFORE INSERT ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER formula_field_value_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='formula')
BEGIN SELECT RAISE(ABORT, 'formula_field_read_only'); END;

CREATE TRIGGER formula_field_config_update BEFORE UPDATE ON custom_field_definition
WHEN NEW.type='formula' AND (NEW.required != 0 OR json_type(NEW.config_json,'$.expression') IS NOT 'text' OR length(trim(json_extract(NEW.config_json,'$.expression'))) NOT BETWEEN 1 AND 1000)
BEGIN SELECT RAISE(ABORT, 'formula_field_config_invalid'); END;

CREATE TRIGGER field_value_revision_definition AFTER INSERT ON custom_field_definition
BEGIN INSERT INTO field_value_revision(field_id) VALUES(NEW.id); END;

CREATE TRIGGER field_value_revision_insert AFTER INSERT ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=NEW.field_id; END;

CREATE TRIGGER field_value_revision_update AFTER UPDATE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id IN (OLD.field_id,NEW.field_id); END;

CREATE TRIGGER field_value_revision_delete AFTER DELETE ON custom_field_value
BEGIN UPDATE field_value_revision SET revision=revision+1 WHERE field_id=OLD.field_id; END;

CREATE TRIGGER field_option_revision_insert AFTER INSERT ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_update AFTER UPDATE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=NEW.field_id); END;

CREATE TRIGGER field_option_revision_delete AFTER DELETE ON custom_field_option
BEGIN UPDATE field_configuration_revision SET revision=revision+1 WHERE entity=(SELECT entity FROM custom_field_definition WHERE id=OLD.field_id); END;

CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
AND (OLD.type='file' OR NEW.type='file' OR NOT EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=OLD.id AND source_type=OLD.type AND target_type=NEW.type))
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;

CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id AND NEW.lead_id IS OLD.lead_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.json_value IS OLD.json_value AND NEW.customer_reference_id IS OLD.customer_reference_id
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL) OR (f.entity = 'lead' AND NEW.lead_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('number','rating'))))
    OR (NEW.date_value IS NOT NULL AND (typeof(NEW.date_value) != 'integer' OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='date')))
    OR (NEW.boolean_value IS NOT NULL AND (NEW.boolean_value NOT IN (0,1) OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='checkbox')))
    OR (NEW.option_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='select'))
    OR (NEW.user_membership_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='user'));
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.option_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE id=NEW.option_id AND field_id=NEW.field_id AND (archived_at IS NULL OR (
      json_array_length(OLD.json_value)=1 AND json_extract(OLD.json_value,'$[0]')=NEW.option_id
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='multiselect' AND target_type='select')
    ))
  );
  SELECT RAISE(ABORT, 'field_member_inactive') WHERE NEW.user_membership_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM singleton_membership WHERE user_id=NEW.user_membership_id AND status='active'
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue','file')))
    OR (NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='customer'));
  SELECT RAISE(ABORT, 'field_rating_invalid') WHERE NEW.number_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='rating'
      AND (typeof(NEW.number_value) != 'integer' OR NEW.number_value < 0 OR NEW.number_value > coalesce(json_extract(config_json,'$.ratingMax'),5))
  );
  SELECT RAISE(ABORT, 'field_customer_unavailable') WHERE NEW.customer_reference_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM contact WHERE id=NEW.customer_reference_id AND archived_at IS NULL
  );
  SELECT RAISE(ABORT, 'field_json_value_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('multiselect','multivalue')
      AND (json_type(NEW.json_value) != 'array' OR json_array_length(NEW.json_value) > 100
        OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type != 'text' OR length(value) NOT BETWEEN 1 AND 2000)
        OR (SELECT count(*) FROM json_each(NEW.json_value)) != (SELECT count(DISTINCT value) FROM json_each(NEW.json_value)))
  );
  SELECT RAISE(ABORT, 'field_option_mismatch') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='multiselect'
  ) AND EXISTS (SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_option WHERE field_id=NEW.field_id AND id=chosen.value AND (archived_at IS NULL OR (
      OLD.option_id=chosen.value AND json_array_length(NEW.json_value)=1
      AND EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=NEW.field_id AND source_type='select' AND target_type='multiselect')
    ))
  ));
  SELECT RAISE(ABORT, 'field_money_invalid') WHERE NEW.json_value IS NOT NULL AND EXISTS (
    SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='money'
  ) AND (json_type(NEW.json_value) != 'object' OR (SELECT count(*) FROM json_each(NEW.json_value)) != 2
    OR json_type(NEW.json_value,'$.amountMinor') IS NOT 'integer'
    OR json_extract(NEW.json_value,'$.amountMinor') NOT BETWEEN 0 AND 99999999999999
    OR json_type(NEW.json_value,'$.currency') IS NOT 'text'
    OR json_extract(NEW.json_value,'$.currency') NOT IN ('USD','EUR','JPY','GBP','CNY','AUD','CAD','CHF','HKD','SGD','ZAR','VND'));
END;

CREATE TRIGGER crm_file_pending_insert BEFORE INSERT ON crm_file
WHEN NEW.status!='pending'
BEGIN SELECT RAISE(ABORT,'file_initial_status_invalid'); END;

CREATE TRIGGER crm_file_immutable_update BEFORE UPDATE ON crm_file
WHEN NEW.id IS NOT OLD.id OR NEW.object_key IS NOT OLD.object_key
 OR NEW.entity IS NOT OLD.entity OR NEW.record_id IS NOT OLD.record_id
 OR NEW.field_id IS NOT OLD.field_id OR NEW.uploader_id IS NOT OLD.uploader_id
 OR NEW.file_name IS NOT OLD.file_name OR NEW.size IS NOT OLD.size OR NEW.created_at IS NOT OLD.created_at
 OR (OLD.status='ready' AND (NEW.status IS NOT OLD.status OR NEW.ready_at IS NOT OLD.ready_at))
 OR (OLD.status='cleaning' AND NEW.status!='cleaning')
 OR (OLD.status='failed' AND NEW.status NOT IN ('failed','cleaning'))
BEGIN SELECT RAISE(ABORT,'file_metadata_immutable'); END;

CREATE TRIGGER crm_file_preserve_key BEFORE DELETE ON crm_file
BEGIN SELECT RAISE(ABORT,'file_key_retained'); END;

CREATE TRIGGER custom_field_file_validate_insert BEFORE INSERT ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id) OR (f.entity='lead' AND f.record_id=NEW.lead_id))
  )
 );
END;

CREATE TRIGGER custom_field_file_validate_update BEFORE UPDATE ON custom_field_value
WHEN EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='file')
BEGIN
 SELECT RAISE(ABORT,'field_file_invalid') WHERE NEW.json_value IS NULL
 OR json_type(NEW.json_value)!='array' OR json_array_length(NEW.json_value)>10
 OR EXISTS (SELECT 1 FROM json_each(NEW.json_value) WHERE type!='text' OR length(value)=0)
 OR (SELECT count(*) FROM json_each(NEW.json_value))!=(SELECT count(DISTINCT value) FROM json_each(NEW.json_value))
 OR NEW.text_value IS NOT NULL OR NEW.number_value IS NOT NULL OR NEW.date_value IS NOT NULL
 OR NEW.boolean_value IS NOT NULL OR NEW.option_id IS NOT NULL OR NEW.user_membership_id IS NOT NULL OR NEW.customer_reference_id IS NOT NULL;
 SELECT RAISE(ABORT,'field_file_unavailable') WHERE EXISTS (
  SELECT 1 FROM json_each(NEW.json_value) chosen WHERE NOT EXISTS (
   SELECT 1 FROM crm_file f WHERE f.id=chosen.value AND f.status='ready' AND f.field_id=NEW.field_id
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id) OR (f.entity='lead' AND f.record_id=NEW.lead_id))
  )
 );
END;

CREATE TRIGGER module_setting_entity_immutable
BEFORE UPDATE OF entity ON module_setting
WHEN NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'module entity is immutable'); END;

CREATE TRIGGER module_setting_preserve
BEFORE DELETE ON module_setting
BEGIN SELECT RAISE(ABORT, 'module settings must be retained'); END;

CREATE TRIGGER record_layout_identity BEFORE UPDATE OF entity ON record_layout
WHEN NEW.entity <> OLD.entity BEGIN SELECT RAISE(ABORT,'layout_identity_immutable'); END;

CREATE TRIGGER record_layout_delete BEFORE DELETE ON record_layout
BEGIN SELECT RAISE(ABORT,'layout_delete_forbidden'); END;

CREATE TRIGGER record_draft_identity BEFORE UPDATE ON record_draft
WHEN NEW.id <> OLD.id OR NEW.entity <> OLD.entity OR NEW.user_id <> OLD.user_id
  OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at
  OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS NOT OLD.consumed_at)
BEGIN SELECT RAISE(ABORT,'draft_identity_immutable'); END;

CREATE TRIGGER deal_stage_identity BEFORE UPDATE ON deal_stage
WHEN NEW.id <> OLD.id OR NEW.label_key <> OLD.label_key OR NEW.closed_state <> OLD.closed_state
BEGIN SELECT RAISE(ABORT,'deal_stage_identity_immutable'); END;

CREATE TRIGGER deal_stage_default_available BEFORE UPDATE OF archived_at ON deal_stage
WHEN OLD.id='demo-booked' AND NEW.archived_at IS NOT NULL
BEGIN SELECT RAISE(ABORT,'deal_stage_default_required'); END;

CREATE TRIGGER deal_stage_keep_history BEFORE DELETE ON deal_stage
BEGIN SELECT RAISE(ABORT,'deal_stage_delete_forbidden'); END;

CREATE TRIGGER deal_stage_insert_revision AFTER INSERT ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;

CREATE TRIGGER deal_stage_update_revision AFTER UPDATE ON deal_stage
BEGIN UPDATE deal_stage_catalog_revision SET revision=revision+1 WHERE id='stages'; END;

CREATE TRIGGER deal_active_stage_insert BEFORE INSERT ON deal
WHEN NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;

CREATE TRIGGER deal_active_stage_update BEFORE UPDATE OF stage_id ON deal
WHEN NEW.stage_id <> OLD.stage_id AND NOT EXISTS (SELECT 1 FROM deal_stage WHERE id=NEW.stage_id AND archived_at IS NULL)
BEGIN SELECT RAISE(ABORT,'deal_stage_unavailable'); END;

CREATE TRIGGER lead_source_identity BEFORE UPDATE ON lead_source WHEN NEW.id IS NOT OLD.id OR NEW.label_key IS NOT OLD.label_key BEGIN SELECT RAISE(ABORT,'lead_catalog_identity_immutable'); END;
CREATE TRIGGER lead_status_identity BEFORE UPDATE ON lead_status WHEN NEW.id IS NOT OLD.id OR NEW.label_key IS NOT OLD.label_key OR NEW.meaning IS NOT OLD.meaning BEGIN SELECT RAISE(ABORT,'lead_catalog_identity_immutable'); END;
CREATE TRIGGER lead_source_default BEFORE UPDATE ON lead_source WHEN OLD.id='manual' AND NEW.archived_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'lead_default_required'); END;
CREATE TRIGGER lead_status_default BEFORE UPDATE ON lead_status WHEN OLD.id IN ('new','converted') AND NEW.archived_at IS NOT NULL BEGIN SELECT RAISE(ABORT,'lead_default_required'); END;
CREATE TRIGGER lead_source_preserve BEFORE DELETE ON lead_source BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;
CREATE TRIGGER lead_status_preserve BEFORE DELETE ON lead_status BEGIN SELECT RAISE(ABORT,'lead_catalog_delete_forbidden'); END;
CREATE TRIGGER lead_source_insert_revision AFTER INSERT ON lead_source BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;
CREATE TRIGGER lead_source_update_revision AFTER UPDATE ON lead_source BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;
CREATE TRIGGER lead_status_insert_revision AFTER INSERT ON lead_status BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;
CREATE TRIGGER lead_status_update_revision AFTER UPDATE ON lead_status BEGIN UPDATE lead_settings_revision SET revision=revision+1 WHERE id='settings'; END;
CREATE TRIGGER lead_identity BEFORE UPDATE ON lead WHEN NEW.id IS NOT OLD.id OR NEW.creator_user_id IS NOT OLD.creator_user_id OR NEW.created_at IS NOT OLD.created_at BEGIN SELECT RAISE(ABORT,'lead_identity_immutable'); END;
CREATE TRIGGER lead_converted_identity BEFORE UPDATE ON lead WHEN OLD.converted_at IS NOT NULL AND (NEW.converted_at IS NOT OLD.converted_at OR NEW.converted_contact_id IS NOT OLD.converted_contact_id OR NEW.status_id IS NOT OLD.status_id) BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;
CREATE TRIGGER lead_source_insert BEFORE INSERT ON lead WHEN NOT EXISTS(SELECT 1 FROM lead_source WHERE id=NEW.source_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_source_unavailable'); END;
CREATE TRIGGER lead_source_update BEFORE UPDATE OF source_id ON lead WHEN NEW.source_id IS NOT OLD.source_id AND NOT EXISTS(SELECT 1 FROM lead_source WHERE id=NEW.source_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_source_unavailable'); END;
CREATE TRIGGER lead_status_insert BEFORE INSERT ON lead WHEN NOT EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_status_unavailable'); END;
CREATE TRIGGER lead_status_update BEFORE UPDATE OF status_id ON lead WHEN NEW.status_id IS NOT OLD.status_id AND NOT EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND archived_at IS NULL) BEGIN SELECT RAISE(ABORT,'lead_status_unavailable'); END;
CREATE TRIGGER lead_reason_insert BEFORE INSERT ON lead WHEN EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND requires_reason=1) AND length(trim(coalesce(NEW.rejection_reason,'')))=0 BEGIN SELECT RAISE(ABORT,'lead_reason_required'); END;
CREATE TRIGGER lead_reason_update BEFORE UPDATE ON lead WHEN (NEW.status_id IS NOT OLD.status_id OR NEW.rejection_reason IS NOT OLD.rejection_reason) AND EXISTS(SELECT 1 FROM lead_status WHERE id=NEW.status_id AND requires_reason=1) AND length(trim(coalesce(NEW.rejection_reason,'')))=0 BEGIN SELECT RAISE(ABORT,'lead_reason_required'); END;
CREATE TRIGGER lead_owner_insert BEFORE INSERT ON lead WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_owner_inactive'); END;
CREATE TRIGGER lead_owner_update BEFORE UPDATE ON lead WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_owner_inactive'); END;
CREATE TRIGGER lead_collaborator_insert BEFORE INSERT ON lead_collaborator WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_collaborator_inactive'); END;
CREATE TRIGGER lead_collaborator_update BEFORE UPDATE ON lead_collaborator WHEN NOT EXISTS(SELECT 1 FROM singleton_membership WHERE user_id=NEW.membership_id AND status='active') BEGIN SELECT RAISE(ABORT,'lead_collaborator_inactive'); END;
CREATE TRIGGER lead_conversion_update BEFORE UPDATE ON lead_conversion BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;
CREATE TRIGGER lead_conversion_delete BEFORE DELETE ON lead_conversion BEGIN SELECT RAISE(ABORT,'lead_conversion_immutable'); END;
CREATE TRIGGER lead_conversion_result BEFORE INSERT ON lead_conversion WHEN NOT EXISTS(SELECT 1 FROM lead WHERE id=NEW.lead_id AND converted_contact_id=NEW.contact_id AND converted_at=NEW.completed_at AND status_id='converted') BEGIN SELECT RAISE(ABORT,'lead_conversion_result_mismatch'); END;
INSERT INTO access_grant(profile_id,permission) VALUES
('standard-member','lead.create'),('standard-member','lead.update'),('standard-member','lead.archive'),('standard-member','lead.restore'),('standard-member','lead.assign'),('standard-member','lead.convert');

CREATE INDEX lead_conversion_contact_completed_idx ON lead_conversion(contact_id,completed_at DESC,lead_id);
