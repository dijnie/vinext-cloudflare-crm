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
