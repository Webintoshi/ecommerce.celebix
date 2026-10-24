BEGIN READ ONLY;
DO $assertions$ DECLARE saved record;BEGIN
 IF(SELECT count(*)FROM saas.akbank_hosted_pos275_function_backup)<>4 THEN RAISE EXCEPTION 'AKBANK275_BACKUP_INVALID';END IF;
 FOR saved IN SELECT *FROM saas.akbank_hosted_pos275_function_backup LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=saved.after_definition_sha
   AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl
   AND p.proconfig IS NOT DISTINCT FROM saved.config AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility)
  THEN RAISE EXCEPTION 'AKBANK275_INSTALLED_FUNCTION_INVALID: %',saved.signature;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM saas.merchant_provider_definitions WHERE provider_code='akbank_json'AND capability='payment_processing'AND enabled AND allows_verification_without_execution_authority)THEN RAISE EXCEPTION 'AKBANK275_DEFINITION_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='saas.akbank_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)'::regprocedure
  AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='v'
  AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  AND p.proacl::text='{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}'
  AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='16acfda8782e3a2ddf3d64880cc9c7252aa5f7bb5f7da9c3ce197b5b382157d1')THEN RAISE EXCEPTION 'AKBANK275_FINALIZER_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='saas.akbank_hosted_pos275_function_backup'::regclass
   AND c.relowner='celebix_saas_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity
   AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>c.relowner))THEN RAISE EXCEPTION 'AKBANK275_BACKUP_PRIVACY_INVALID';END IF;
 IF EXISTS(SELECT 1 FROM pg_class WHERE oid IN('saas.payment_methods'::regclass,'saas.payment_attempts'::regclass,'saas.storefront_hosted_checkout_sessions'::regclass,'saas.merchant_provider_profiles'::regclass)AND(NOT relrowsecurity OR NOT relforcerowsecurity))THEN RAISE EXCEPTION 'AKBANK275_RLS_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.storefront_hosted_checkout_sessions'::regclass AND conname='storefront_hosted_checkout_sessions_provider_code_check' AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='6655dd49cbce4b8313e805df8334da1e428e97ef68be9c88e0fcdb52201be795')THEN RAISE EXCEPTION 'AKBANK275_INSTALLED_CONSTRAINT_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.payment_methods'::regclass AND conname='payment_methods_provider_preference_check' AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='18cdece4d307fc401cac7242c7d4189f1dc6d59613cf4e3cd7de78d47079a9ee')THEN RAISE EXCEPTION 'AKBANK275_INSTALLED_CONSTRAINT_INVALID';END IF;
END $assertions$;
COMMIT;
