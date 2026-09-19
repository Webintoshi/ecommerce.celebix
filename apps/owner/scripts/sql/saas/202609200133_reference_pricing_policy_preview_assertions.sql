DO $assertions$
DECLARE candidate regprocedure:='saas.pricing_calculate_policy_candidate(uuid,uuid,jsonb,uuid)'::regprocedure;
  preview regprocedure:='saas.pricing_variant_policy_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb,text)'::regprocedure;
  guarded_save regprocedure:='saas.pricing_variant_policy_save_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb,text)'::regprocedure;
  legacy_save regprocedure:='saas.pricing_variant_policy_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,bigint,jsonb)'::regprocedure;
BEGIN
  IF pg_catalog.has_function_privilege('celebix_saas_app',candidate,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',candidate,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app',legacy_save,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',preview,'EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app',guarded_save,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',preview,'EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',guarded_save,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',preview,'EXECUTE')
    OR pg_catalog.has_function_privilege('public',guarded_save,'EXECUTE')
  THEN RAISE EXCEPTION 'REFERENCE_POLICY_PREVIEW_PRIVILEGE_ASSERTION_FAILED'; END IF;
END $assertions$;
