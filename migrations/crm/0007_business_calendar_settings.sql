ALTER TABLE crm_setting ADD COLUMN time_zone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh';
ALTER TABLE crm_setting ADD COLUMN country_code TEXT NOT NULL DEFAULT 'VN' CHECK (length(country_code) = 2);
ALTER TABLE crm_setting ADD COLUMN calendar_revision INTEGER NOT NULL DEFAULT 0 CHECK (calendar_revision >= 0);
