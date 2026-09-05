ALTER TABLE deal ADD COLUMN money_revision integer NOT NULL DEFAULT 0;
ALTER TABLE crm_setting ADD COLUMN active_conversion_version text NOT NULL DEFAULT 'initial';
ALTER TABLE crm_setting ADD COLUMN pending_job_id text;
ALTER TABLE crm_setting ADD COLUMN rates_revision integer NOT NULL DEFAULT 0;

ALTER TABLE exchange_rate RENAME TO exchange_rate_legacy;
CREATE TABLE exchange_rate (
  id text PRIMARY KEY NOT NULL, base_currency text NOT NULL, quote_currency text NOT NULL,
  rate text NOT NULL CHECK (length(rate) BETWEEN 1 AND 21 AND rate NOT GLOB '*[^0-9.]*' AND cast(rate AS numeric)>0
    AND length(rate)-length(replace(rate,'.','')) <= 1
    AND ((instr(rate,'.')=0 AND length(rate)<=10) OR (instr(rate,'.') BETWEEN 2 AND 11 AND length(rate)-instr(rate,'.') BETWEEN 1 AND 10))),
  as_of integer NOT NULL, source text NOT NULL CHECK(source IN ('manual','fetched')), provider text,
  created_at integer NOT NULL, updated_at integer NOT NULL
);
INSERT INTO exchange_rate SELECT id,base_currency,quote_currency,
  cast(rate_scaled / 10000000000 AS text) || CASE WHEN rate_scaled % 10000000000 = 0 THEN '' ELSE '.' || rtrim(printf('%010d',rate_scaled % 10000000000),'0') END,
  as_of,source,provider,created_at,updated_at FROM exchange_rate_legacy;
DROP TABLE exchange_rate_legacy;
CREATE UNIQUE INDEX exchange_rate_pair_source_unique ON exchange_rate(base_currency,quote_currency,source);
CREATE INDEX exchange_rate_pair_idx ON exchange_rate(base_currency,quote_currency);

CREATE TABLE currency_job (
 id text PRIMARY KEY NOT NULL, kind text NOT NULL CHECK(kind IN ('rerate','fill_missing')),
 target_currency text NOT NULL, expected_version text NOT NULL, target_version text NOT NULL,
 rates_json text NOT NULL CHECK(json_valid(rates_json)), cursor text,
 total integer NOT NULL, processed integer NOT NULL DEFAULT 0, converted integer NOT NULL DEFAULT 0, missing integer NOT NULL DEFAULT 0,
 status text NOT NULL CHECK(status IN ('pending','running','completed','cancelled')),
 created_at integer NOT NULL, updated_at integer NOT NULL
);
CREATE TABLE deal_conversion (
 version text NOT NULL, deal_id text NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
 money_revision integer NOT NULL, amount_minor integer, currency text NOT NULL,
 base_amount_minor integer CHECK(base_amount_minor IS NULL OR (typeof(base_amount_minor)='integer' AND base_amount_minor BETWEEN 0 AND 9007199254740991)),
 base_currency text, fx_rate text, fx_rate_at integer, rate_source text,
 PRIMARY KEY(version,deal_id),
 CHECK ((base_amount_minor IS NULL AND base_currency IS NULL AND fx_rate IS NULL AND fx_rate_at IS NULL AND rate_source IS NULL)
 OR (base_amount_minor IS NOT NULL AND base_currency IS NOT NULL AND fx_rate IS NOT NULL AND fx_rate_at IS NOT NULL AND rate_source IN ('identity','manual','fetched')))
);
CREATE INDEX deal_conversion_amount_idx ON deal_conversion(version,base_amount_minor,deal_id);

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
