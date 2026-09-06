CREATE TABLE saved_view_default (
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  entity TEXT NOT NULL CHECK(entity IN ('company','contact','deal')),
  view_id TEXT NOT NULL REFERENCES saved_view(id) ON DELETE CASCADE,
  PRIMARY KEY(user_id, entity)
);
CREATE INDEX saved_view_default_view_idx ON saved_view_default(view_id);
CREATE TRIGGER saved_view_default_visible_insert BEFORE INSERT ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;
CREATE TRIGGER saved_view_default_visible_update BEFORE UPDATE ON saved_view_default
WHEN NOT EXISTS (SELECT 1 FROM saved_view WHERE id=NEW.view_id AND entity=NEW.entity AND (shared=1 OR creator_user_id=NEW.user_id))
BEGIN SELECT RAISE(ABORT, 'default_view_unavailable'); END;
CREATE TRIGGER saved_view_default_unshare AFTER UPDATE OF shared ON saved_view
WHEN OLD.shared=1 AND NEW.shared=0
BEGIN DELETE FROM saved_view_default WHERE view_id=NEW.id AND user_id IS NOT NEW.creator_user_id; END;
