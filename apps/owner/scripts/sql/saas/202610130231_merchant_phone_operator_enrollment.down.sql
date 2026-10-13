BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
DO $guard$ DECLARE r record;BEGIN
 IF EXISTS(SELECT 1 FROM saas.merchant_phone_enrollment_operations) OR EXISTS(SELECT 1 FROM saas.merchant_phone_identities WHERE operator_enrolled_at IS NOT NULL) THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_ROLLBACK_REQUIRES_UNUSED_AUTHORITY';END IF;
 FOR r IN SELECT * FROM saas.merchant_phone_enrollment_original_functions LOOP
  IF pg_get_functiondef(r.signature::regprocedure)<>r.installed_definition THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_ROLLBACK_ORDER';END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.merchant_phone_enrollment_original_functions LOOP EXECUTE r.definition;END LOOP;
END $guard$;
DROP FUNCTION saas.merchant_phone_operator_enroll(jsonb);
ALTER TABLE saas.merchant_phone_identities DROP CONSTRAINT merchant_phone_enrollment_binding_check;
ALTER TABLE saas.merchant_phone_identities DROP CONSTRAINT merchant_phone_enrollment_reservation_check;
DO $restore$ DECLARE r record;BEGIN FOR r IN SELECT * FROM saas.merchant_phone_enrollment_schema_backup LOOP EXECUTE format('ALTER TABLE saas.merchant_phone_identities ADD CONSTRAINT %I %s',r.name,r.definition);END LOOP;END $restore$;
ALTER TABLE saas.merchant_phone_identities DROP COLUMN operator_enrolled_at,DROP COLUMN reserved_principal_id;
DROP TABLE saas.merchant_phone_enrollment_operations,saas.merchant_phone_enrollment_original_functions,saas.merchant_phone_enrollment_schema_backup;
COMMIT;
