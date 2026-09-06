CREATE TABLE field_value_revision (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES custom_field_definition(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO field_value_revision(field_id) SELECT id FROM custom_field_definition;
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
CREATE TABLE field_conversion_preview (
  id TEXT PRIMARY KEY NOT NULL,
  field_id TEXT NOT NULL REFERENCES custom_field_definition(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL,
  config_json TEXT NOT NULL CHECK(json_valid(config_json)),
  configuration_revision INTEGER NOT NULL,
  value_revision INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX field_conversion_preview_owner_idx ON field_conversion_preview(field_id,user_id);
CREATE INDEX field_conversion_preview_expiry_idx ON field_conversion_preview(expires_at);
CREATE TABLE field_conversion_guard (
  field_id TEXT PRIMARY KEY NOT NULL REFERENCES custom_field_definition(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL,
  target_type TEXT NOT NULL
);
DROP TRIGGER custom_field_type_with_values;
CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
AND NOT EXISTS (SELECT 1 FROM field_conversion_guard WHERE field_id=OLD.id AND source_type=OLD.type AND target_type=NEW.type)
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;

DROP TRIGGER custom_field_value_validate_update;
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
    (NEW.json_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('money','multiselect','multivalue')))
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
