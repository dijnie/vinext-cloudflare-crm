-- Preserve the complete current field schema, including conversion tokens and revisions.

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

CREATE TABLE "custom_field_definition_next" (
  `id` text PRIMARY KEY NOT NULL,
  `entity` text NOT NULL CHECK (`entity` IN ('company', 'contact', 'deal')),
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

INSERT INTO custom_field_definition_next SELECT * FROM custom_field_definition;

CREATE TABLE "custom_field_option_next" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition_next" (`id`) ON DELETE CASCADE,
  `label` text NOT NULL,
  `position` integer NOT NULL,
  `archived_at` integer
);

INSERT INTO custom_field_option_next SELECT * FROM custom_field_option;

CREATE TABLE "custom_field_value_next" (
  `id` text PRIMARY KEY NOT NULL,
  `field_id` text NOT NULL REFERENCES "custom_field_definition_next" (`id`) ON DELETE CASCADE,
  `company_id` text REFERENCES `company` (`id`) ON DELETE CASCADE,
  `contact_id` text REFERENCES `contact` (`id`) ON DELETE CASCADE,
  `deal_id` text REFERENCES `deal` (`id`) ON DELETE CASCADE,
  `text_value` text,
  `number_value` integer,
  `date_value` integer,
  `boolean_value` integer,
  `option_id` text REFERENCES "custom_field_option_next" (`id`) ON DELETE SET NULL,
  `user_membership_id` text REFERENCES `singleton_membership` (`user_id`) ON DELETE SET NULL,
  `updated_at` integer NOT NULL,
  json_value text CHECK (json_value IS NULL OR json_valid(json_value)),
  customer_reference_id text REFERENCES contact(id) ON DELETE RESTRICT,
  CHECK (((`company_id` IS NOT NULL) + (`contact_id` IS NOT NULL) + (`deal_id` IS NOT NULL)) = 1)
);

INSERT INTO custom_field_value_next SELECT * FROM custom_field_value;

CREATE TABLE field_value_revision_next (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES custom_field_definition_next(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);

INSERT INTO field_value_revision_next SELECT * FROM field_value_revision;

CREATE TABLE field_conversion_preview_next (
  id TEXT PRIMARY KEY NOT NULL,
  field_id TEXT NOT NULL REFERENCES custom_field_definition_next(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  configuration_revision INTEGER NOT NULL,
  value_revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

INSERT INTO field_conversion_preview_next SELECT * FROM field_conversion_preview;

CREATE TABLE field_conversion_guard_next (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES custom_field_definition_next(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL
);

INSERT INTO field_conversion_guard_next SELECT * FROM field_conversion_guard;

DROP TABLE field_conversion_guard;

DROP TABLE field_conversion_preview;

DROP TABLE field_value_revision;

DROP TABLE custom_field_value;

DROP TABLE custom_field_option;

DROP TABLE custom_field_definition;

ALTER TABLE custom_field_definition_next RENAME TO custom_field_definition;

ALTER TABLE custom_field_option_next RENAME TO custom_field_option;

ALTER TABLE custom_field_value_next RENAME TO custom_field_value;

ALTER TABLE field_value_revision_next RENAME TO field_value_revision;

ALTER TABLE field_conversion_preview_next RENAME TO field_conversion_preview;

ALTER TABLE field_conversion_guard_next RENAME TO field_conversion_guard;

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
    THEN RAISE(ABORT, 'membership references require cleanup') END);
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
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
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
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.json_value IS OLD.json_value AND NEW.customer_reference_id IS OLD.customer_reference_id
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
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

CREATE TABLE crm_file (
  id TEXT PRIMARY KEY NOT NULL,
  object_key TEXT NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal')),
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
CREATE UNIQUE INDEX crm_file_object_key_unique ON crm_file(object_key);
CREATE INDEX crm_file_anchor_idx ON crm_file(entity,record_id,field_id);
CREATE INDEX crm_file_cleanup_idx ON crm_file(status,created_at);
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
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id))
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
    AND ((f.entity='company' AND f.record_id=NEW.company_id) OR (f.entity='contact' AND f.record_id=NEW.contact_id) OR (f.entity='deal' AND f.record_id=NEW.deal_id))
  )
 );
END;
