BEGIN;
DO $assert$ DECLARE t text;r text;BEGIN
 IF NOT has_function_privilege('celebix_saas_platform_operator','saas.merchant_phone_operator_enroll(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_OPERATOR_GRANT_REQUIRED';END IF;
 FOREACH r IN ARRAY ARRAY['celebix_saas_identity','celebix_saas_app','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver'] LOOP
  IF has_function_privilege(r,'saas.merchant_phone_operator_enroll(jsonb)','EXECUTE') THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_WORKLOAD_GRANT';END IF;
 END LOOP;
 FOREACH t IN ARRAY ARRAY['merchant_phone_enrollment_operations','merchant_phone_enrollment_original_functions','merchant_phone_enrollment_schema_backup'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relrowsecurity AND relforcerowsecurity) OR has_table_privilege('celebix_saas_platform_operator','saas.'||t,'SELECT') OR has_table_privilege('celebix_saas_identity','saas.'||t,'SELECT') THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_PRIVATE_TABLE';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM saas.merchant_phone_identities WHERE principal_id IS NOT NULL AND verified_at IS NULL AND(reserved_principal_id IS DISTINCT FROM principal_id OR operator_enrolled_at IS NULL)) THEN RAISE EXCEPTION 'PHONE_ENROLLMENT_UNVERIFIED_PROVENANCE';END IF;
END $assert$;
ROLLBACK;
