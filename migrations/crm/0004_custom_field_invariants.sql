ALTER TABLE custom_field_definition ADD COLUMN deleted_at integer;
ALTER TABLE saved_view ADD COLUMN creator_user_id text REFERENCES user(id) ON DELETE SET NULL;
UPDATE saved_view SET creator_user_id = owner_membership_id;
CREATE UNIQUE INDEX saved_view_creator_name_unique ON saved_view(entity, creator_user_id, name);
CREATE TRIGGER saved_view_creator_immutable BEFORE UPDATE OF creator_user_id ON saved_view
WHEN NEW.creator_user_id IS NOT NULL AND NEW.creator_user_id IS NOT OLD.creator_user_id
BEGIN SELECT RAISE(ABORT, 'saved_view_creator_immutable'); END;
CREATE INDEX custom_field_value_option_idx ON custom_field_value(field_id, option_id);

-- Recheck retained ownership on ordinary edits, not only ownership changes.
CREATE TRIGGER saved_view_edit_active_owner BEFORE UPDATE ON saved_view
WHEN NEW.owner_membership_id IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM singleton_membership WHERE user_id=NEW.owner_membership_id AND status='active'
)
BEGIN SELECT RAISE(ABORT, 'saved_view_owner_inactive'); END;

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

-- Stable keys are reserved even while a definition is tombstoned.
CREATE TRIGGER custom_field_identity_immutable BEFORE UPDATE OF key,entity ON custom_field_definition
WHEN NEW.key != OLD.key OR NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'field_identity_immutable'); END;
CREATE TRIGGER custom_field_type_with_values BEFORE UPDATE OF type ON custom_field_definition
WHEN NEW.type != OLD.type AND EXISTS (SELECT 1 FROM custom_field_value WHERE field_id=OLD.id)
BEGIN SELECT RAISE(ABORT, 'field_type_has_values'); END;
CREATE TRIGGER custom_field_option_owner_immutable BEFORE UPDATE OF field_id ON custom_field_option
WHEN NEW.field_id != OLD.field_id
BEGIN SELECT RAISE(ABORT, 'field_option_owner_immutable'); END;
CREATE TRIGGER custom_field_option_available_insert BEFORE INSERT ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type='select')
BEGIN SELECT RAISE(ABORT, 'field_option_unavailable'); END;
CREATE TRIGGER custom_field_option_available_update BEFORE UPDATE ON custom_field_option
WHEN NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND deleted_at IS NULL AND type='select')
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
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='number')))
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
END;
CREATE TRIGGER custom_field_value_validate_update BEFORE UPDATE ON custom_field_value
BEGIN
  -- Membership revocation transfers or clears references in every retained value.
  SELECT RAISE(ABORT, 'field_unavailable') WHERE NOT (OLD.user_membership_id IS NOT NULL AND NEW.id=OLD.id AND NEW.field_id=OLD.field_id
    AND NEW.company_id IS OLD.company_id AND NEW.contact_id IS OLD.contact_id AND NEW.deal_id IS OLD.deal_id
    AND NEW.text_value IS OLD.text_value AND NEW.number_value IS OLD.number_value
    AND NEW.date_value IS OLD.date_value AND NEW.boolean_value IS OLD.boolean_value AND NEW.option_id IS OLD.option_id
    AND EXISTS (SELECT 1 FROM member_operation_guard WHERE authorized=1)) AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND archived_at IS NULL AND deleted_at IS NULL);

  SELECT RAISE(ABORT, 'field_entity_mismatch') WHERE NOT EXISTS (
    SELECT 1 FROM custom_field_definition f WHERE f.id = NEW.field_id
      AND ((f.entity = 'company' AND NEW.company_id IS NOT NULL) OR (f.entity = 'contact' AND NEW.contact_id IS NOT NULL) OR (f.entity = 'deal' AND NEW.deal_id IS NOT NULL))
  );
  SELECT RAISE(ABORT, 'field_value_type_mismatch') WHERE
    (NEW.text_value IS NOT NULL AND NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type IN ('text','long_text','url','email','phone')))
    OR (NEW.number_value IS NOT NULL AND (typeof(NEW.number_value) NOT IN ('integer','real') OR NOT EXISTS (SELECT 1 FROM custom_field_definition WHERE id=NEW.field_id AND type='number')))
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
END;
