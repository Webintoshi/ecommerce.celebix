DO $assertions$ DECLARE t text;r text;BEGIN
 IF to_regprocedure('saas.merchant_whatsapp_command(text,jsonb)') IS NULL OR to_regprocedure('saas.whatsapp_otp_reserve_send(uuid,text,text,text)') IS NULL THEN RAISE EXCEPTION 'MERCHANT_PHONE_AUTHORITY_MISSING';END IF;
 FOREACH t IN ARRAY ARRAY['merchant_whatsapp_policy','merchant_whatsapp_store_policy','merchant_phone_identities','merchant_phone_staff','merchant_phone_operations','merchant_phone_pending','merchant_phone_challenges','whatsapp_otp_send_reservations'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('saas.'||t)::regclass AND relrowsecurity AND relforcerowsecurity) THEN RAISE EXCEPTION 'MERCHANT_PHONE_RLS_MISSING %',t;END IF;
  FOREACH r IN ARRAY ARRAY['celebix_saas_identity','celebix_saas_app','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_platform_operator','celebix_saas_host_resolver'] LOOP
   IF has_table_privilege(r,'saas.'||t,'SELECT,INSERT,UPDATE,DELETE') THEN RAISE EXCEPTION 'MERCHANT_PHONE_DIRECT_TABLE_ACCESS % %',r,t;END IF;
  END LOOP;
 END LOOP;
 IF NOT has_function_privilege('celebix_saas_identity','saas.merchant_whatsapp_command(text,jsonb)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT_PHONE_EXECUTE_MISSING';END IF;
 FOREACH r IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_platform_operator','celebix_saas_host_resolver'] LOOP
  IF has_function_privilege(r,'saas.merchant_whatsapp_command(text,jsonb)','EXECUTE') OR has_function_privilege(r,'saas.whatsapp_otp_reserve_send(uuid,text,text,text)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT_PHONE_EXCESS_EXECUTE %',r;END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM saas.principals WHERE authority_kind='phone' AND email IS NULL AND email_verified) THEN RAISE EXCEPTION 'MERCHANT_PHONE_FAKE_EMAIL';END IF;
END $assertions$;
