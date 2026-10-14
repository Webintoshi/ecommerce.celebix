-- No tenant rows, customer data or credentials are required by this check.
DO $assertions$
DECLARE saved record;tab text;name text;signature text;
BEGIN
 IF (SELECT count(*) FROM saas.merchant_checkout_price_233_backup)<>6 THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_BACKUP_INVALID';END IF;
 FOR saved IN SELECT * FROM saas.merchant_checkout_price_233_backup LOOP
  IF pg_catalog.to_regprocedure(saved.signature) IS NULL OR pg_catalog.to_regprocedure(saved.engine_signature) IS NULL
   OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(saved.signature::regprocedure),'UTF8')),'hex') IS DISTINCT FROM saved.published_sha256
   OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(saved.engine_signature::regprocedure),'UTF8')),'hex') IS DISTINCT FROM saved.engine_sha256
   OR pg_catalog.has_function_privilege('public',saved.engine_signature,'EXECUTE')
   OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',saved.engine_signature,'EXECUTE')
   OR pg_catalog.has_function_privilege('celebix_saas_app',saved.engine_signature,'EXECUTE')
   OR pg_catalog.has_function_privilege('celebix_saas_workflow',saved.engine_signature,'EXECUTE')
  THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_FUNCTION_AUTHORITY_INVALID';END IF;
 END LOOP;
 FOREACH tab IN ARRAY ARRAY['merchant_checkout_price_233_backup','merchant_checkout_quotes_233','merchant_checkout_quote_operations_233','merchant_checkout_price_context_233'] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class relation WHERE relation.oid=('saas.'||tab)::regclass AND relation.relrowsecurity AND relation.relforcerowsecurity)
   OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.'||tab,'SELECT,INSERT,UPDATE,DELETE')
   OR pg_catalog.has_table_privilege('celebix_saas_app','saas.'||tab,'SELECT,INSERT,UPDATE,DELETE')
   OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.'||tab,'SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_PRIVATE_STORAGE_INVALID';END IF;
 END LOOP;
 FOR name,signature IN SELECT p.proname,p.oid::regprocedure::text FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN('merchant_checkout_quote_structural_digest_233','merchant_checkout_quote_scope_233','merchant_checkout_quote_match_233','merchant_checkout_price_enter_233','merchant_checkout_price_leave_233','merchant_checkout_quote_immutable_233') LOOP
  IF pg_catalog.has_function_privilege('public',signature,'EXECUTE') OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',signature,'EXECUTE') OR pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE') THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_HELPER_EXPOSED';END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM saas.merchant_checkout_price_context_233) THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_CONTEXT_NOT_CLEARED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.merchant_checkout_quotes_233'::regclass AND tgname='merchant_checkout_quote_immutable_233' AND NOT tgisinternal)
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.merchant_checkout_quote_operations_233'::regclass AND tgname='merchant_checkout_quote_operation_immutable_233' AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_IMMUTABILITY_MISSING';END IF;
END $assertions$;
