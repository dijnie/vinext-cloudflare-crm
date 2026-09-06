CREATE TABLE module_setting (
  entity TEXT PRIMARY KEY NOT NULL CHECK (entity IN ('company','contact','deal')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK (enabled IN (0,1)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (typeof(revision) = 'integer' AND revision >= 0),
  updated_at INTEGER NOT NULL
);
INSERT INTO module_setting (entity, enabled, revision, updated_at) VALUES
  ('company',1,0,0), ('contact',1,0,0), ('deal',1,0,0);
CREATE TRIGGER module_setting_entity_immutable
BEFORE UPDATE OF entity ON module_setting
WHEN NEW.entity != OLD.entity
BEGIN SELECT RAISE(ABORT, 'module entity is immutable'); END;
CREATE TRIGGER module_setting_preserve
BEFORE DELETE ON module_setting
BEGIN SELECT RAISE(ABORT, 'module settings must be retained'); END;
