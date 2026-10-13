BEGIN;
DO $assert$ DECLARE r record;t text;BEGIN
 IF to_regprocedure('saas.public_account_phone_command(text,jsonb)') IS NULL OR to_regprocedure('saas.whatsapp_otp_reserve_send(uuid,text,text,text)') IS NULL THEN RAISE EXCEPTION 'CUSTOMER_PHONE_FUNCTIONS_REQUIRED';END IF;
 IF NOT has_function_privilege('celebix_saas_host_resolver','saas.public_account_phone_command(text,jsonb)','EXECUTE') OR has_function_privilege('celebix_saas_identity','saas.public_account_phone_command(text,jsonb)','EXECUTE') OR has_function_privilege('celebix_saas_app','saas.public_account_phone_command(text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'CUSTOMER_PHONE_GRANTS_INVALID';END IF;
 FOR r IN SELECT p.oid FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname LIKE 'public_account_auth_%' LOOP IF has_function_privilege('celebix_saas_host_resolver',r.oid,'EXECUTE') THEN RAISE EXCEPTION 'CUSTOMER_EMAIL_OR_OLD_PHONE_GRANT_ACTIVE';END IF;END LOOP;
 FOREACH t IN ARRAY ARRAY['customer_phone_original_functions','customer_phone_installed_functions','customer_phone_login_operations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=('saas.'||t)::regclass AND c.relrowsecurity AND c.relforcerowsecurity) OR has_table_privilege('celebix_saas_host_resolver','saas.'||t,'SELECT') OR has_table_privilege('celebix_saas_identity','saas.'||t,'SELECT') THEN RAISE EXCEPTION 'CUSTOMER_PHONE_PRIVATE_TABLE_INVALID';END IF;
 END LOOP;
 IF has_function_privilege('celebix_saas_host_resolver','saas.customer_phone_verify_isolated(text,timestamptz,uuid,text,text,text,text,text,uuid,uuid,uuid,text,text,text,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'CUSTOMER_PHONE_PRIVATE_VERIFY_EXPOSED';END IF;
END $assert$;
ROLLBACK;
