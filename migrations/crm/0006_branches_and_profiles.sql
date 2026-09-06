CREATE TABLE access_profile (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX access_profile_name_unique ON access_profile(name);
CREATE TABLE access_grant (
  profile_id TEXT NOT NULL REFERENCES access_profile(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  PRIMARY KEY (profile_id, permission)
);
CREATE TABLE membership_access (
  membership_id TEXT PRIMARY KEY NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,
  profile_id TEXT NOT NULL REFERENCES access_profile(id) ON DELETE RESTRICT
);
CREATE INDEX membership_access_profile_idx ON membership_access(profile_id);
INSERT INTO access_profile VALUES ('standard-member', 'Standard member', 0, 0);
INSERT INTO access_grant (profile_id, permission) VALUES
('standard-member', 'company.create'),
('standard-member', 'company.update'),
('standard-member', 'company.archive'),
('standard-member', 'company.restore'),
('standard-member', 'company.assign'),
('standard-member', 'contact.create'),
('standard-member', 'contact.update'),
('standard-member', 'contact.archive'),
('standard-member', 'contact.restore'),
('standard-member', 'contact.assign'),
('standard-member', 'deal.create'),
('standard-member', 'deal.update'),
('standard-member', 'deal.archive'),
('standard-member', 'deal.restore'),
('standard-member', 'deal.assign'),
('standard-member', 'activity.create'),
('standard-member', 'activity.update'),
('standard-member', 'field.configure'),
('standard-member', 'view.create'),
('standard-member', 'view.update'),
('standard-member', 'view.delete');
INSERT INTO membership_access SELECT user_id, 'standard-member' FROM singleton_membership;
CREATE TRIGGER membership_default_profile AFTER INSERT ON singleton_membership
BEGIN
  INSERT INTO membership_access VALUES (NEW.user_id, 'standard-member');
END;
CREATE TABLE branch (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  archived_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX branch_active_name_unique ON branch(name) WHERE archived_at IS NULL;
INSERT INTO branch VALUES ('default-branch', 'Chi nhánh mặc định', NULL, 0, 0);
CREATE TABLE branch_setting (
  id TEXT PRIMARY KEY NOT NULL CONSTRAINT branch_setting_singleton CHECK(id = 'settings'),
  default_branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT
);
INSERT INTO branch_setting VALUES ('settings', 'default-branch');
CREATE TABLE member_branch (
  membership_id TEXT NOT NULL REFERENCES singleton_membership(user_id) ON DELETE CASCADE,
  branch_id TEXT NOT NULL REFERENCES branch(id) ON DELETE RESTRICT,
  is_primary INTEGER NOT NULL DEFAULT 0 CHECK(is_primary IN (0,1)),
  PRIMARY KEY (membership_id, branch_id)
);
CREATE INDEX member_branch_branch_idx ON member_branch(branch_id);
CREATE UNIQUE INDEX member_branch_primary_unique ON member_branch(membership_id) WHERE is_primary = 1;
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
CREATE TABLE action_operation_guard (
  id TEXT PRIMARY KEY NOT NULL,
  authorized INTEGER NOT NULL CONSTRAINT action_permission_required CHECK (authorized = 1)
);
CREATE TABLE operation_condition_guard (
  id TEXT PRIMARY KEY NOT NULL,
  authorized INTEGER NOT NULL CONSTRAINT operation_conflict CHECK (authorized = 1)
);
