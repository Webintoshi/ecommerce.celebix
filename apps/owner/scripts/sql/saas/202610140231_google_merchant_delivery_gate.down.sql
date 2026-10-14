BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $restore$ DECLARE definition text;BEGIN SELECT b.definition INTO definition FROM saas.google_merchant_231_backup b;EXECUTE definition;END $restore$;
DROP TABLE saas.google_merchant_231_backup,saas.google_merchant_delivery_control;
COMMIT;
