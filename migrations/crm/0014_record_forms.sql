CREATE TABLE record_layout (
  entity TEXT PRIMARY KEY NOT NULL CHECK(entity IN ('company','contact','deal')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  fields_json TEXT NOT NULL DEFAULT 'null' CHECK(json_valid(fields_json)),
  updated_at INTEGER NOT NULL
);
INSERT INTO record_layout(entity, updated_at) VALUES ('company',0),('contact',0),('deal',0);
CREATE TRIGGER record_layout_identity BEFORE UPDATE OF entity ON record_layout
WHEN NEW.entity <> OLD.entity BEGIN SELECT RAISE(ABORT,'layout_identity_immutable'); END;
CREATE TRIGGER record_layout_delete BEFORE DELETE ON record_layout
BEGIN SELECT RAISE(ABORT,'layout_delete_forbidden'); END;
CREATE TABLE record_draft (
  id TEXT PRIMARY KEY NOT NULL,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal')),
  user_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  consumed_at INTEGER,
  created_at INTEGER NOT NULL,
  CHECK(expires_at > created_at)
);
CREATE TRIGGER record_draft_identity BEFORE UPDATE ON record_draft
WHEN NEW.id <> OLD.id OR NEW.entity <> OLD.entity OR NEW.user_id <> OLD.user_id
  OR NEW.expires_at <> OLD.expires_at OR NEW.created_at <> OLD.created_at
  OR (OLD.consumed_at IS NOT NULL AND NEW.consumed_at IS NOT OLD.consumed_at)
BEGIN SELECT RAISE(ABORT,'draft_identity_immutable'); END;
