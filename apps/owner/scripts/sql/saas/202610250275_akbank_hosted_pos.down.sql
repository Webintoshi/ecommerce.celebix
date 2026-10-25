-- Only unused native authority can be removed; real attempts require a forward fix.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.akbank-hosted-pos.release275',0));
DO $down$ DECLARE saved record;BEGIN
 IF current_setting('celebix.allow_akbank275_down',true)IS DISTINCT FROM 'on'THEN RAISE EXCEPTION 'AKBANK275_DOWN_OPT_IN_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM saas.merchant_provider_profiles WHERE provider_code='akbank_json')
  OR EXISTS(SELECT 1 FROM saas.payment_attempts WHERE provider_code='akbank_json')
  OR EXISTS(SELECT 1 FROM saas.payment_methods WHERE provider_code='akbank_json')
  OR EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions WHERE provider_code='akbank_json')
  OR EXISTS(SELECT 1 FROM saas.merchant_provider_execution_authorities WHERE provider_code='akbank_json')
 THEN RAISE EXCEPTION 'AKBANK275_USED_AUTHORITY_FORWARD_FIX_REQUIRED';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.storefront_hosted_checkout_sessions'::regclass AND conname='storefront_hosted_checkout_sessions_provider_code_check' AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='6655dd49cbce4b8313e805df8334da1e428e97ef68be9c88e0fcdb52201be795')THEN RAISE EXCEPTION 'AKBANK275_INSTALLED_CONSTRAINT_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.payment_methods'::regclass AND conname='payment_methods_provider_preference_check' AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='18cdece4d307fc401cac7242c7d4189f1dc6d59613cf4e3cd7de78d47079a9ee')THEN RAISE EXCEPTION 'AKBANK275_INSTALLED_CONSTRAINT_INVALID';END IF;
 IF(SELECT count(*)FROM saas.akbank_hosted_pos275_function_backup)<>4 THEN RAISE EXCEPTION 'AKBANK275_BACKUP_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid='saas.akbank_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text)'::regprocedure AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='16acfda8782e3a2ddf3d64880cc9c7252aa5f7bb5f7da9c3ce197b5b382157d1' AND p.proowner='celebix_saas_owner'::regrole AND p.proacl::text='{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_workflow=X/celebix_saas_owner}' AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[] AND p.prosecdef AND p.provolatile='v')THEN RAISE EXCEPTION 'AKBANK275_DOWN_FINALIZER_DRIFT';END IF;
 FOR saved IN SELECT *FROM saas.akbank_hosted_pos275_function_backup LOOP
  IF encode(sha256(convert_to(saved.definition,'UTF8')),'hex')IS DISTINCT FROM saved.before_definition_sha THEN RAISE EXCEPTION 'AKBANK275_BACKUP_DRIFT';END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=saved.after_definition_sha
   AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl
   AND p.proconfig IS NOT DISTINCT FROM saved.config AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility)
  THEN RAISE EXCEPTION 'AKBANK275_DOWN_DRIFT';END IF;
  EXECUTE saved.definition;
 END LOOP;
END $down$;
ALTER TABLE saas.storefront_hosted_checkout_sessions DROP CONSTRAINT storefront_hosted_checkout_sessions_provider_code_check,ADD CONSTRAINT storefront_hosted_checkout_sessions_provider_code_check CHECK ((provider_code = ANY (ARRAY['paytr_iframe'::text, 'iyzico_iframe'::text])));
ALTER TABLE saas.payment_methods DROP CONSTRAINT payment_methods_provider_preference_check,ADD CONSTRAINT payment_methods_provider_preference_check CHECK (((kind <> 'provider'::text) OR (provider_code <> ALL (ARRAY['paytr_iframe'::text, 'iyzico_iframe'::text])) OR saas.provider_payment_method_config_valid(provider_code, config)));
DROP FUNCTION saas.akbank_merchant_self_service_mark_verification(uuid,text,text,text,integer,text,timestamp with time zone,uuid,bigint,bigint,text,text);
ALTER TABLE saas.merchant_provider_definitions DISABLE TRIGGER merchant_provider_definitions_immutable;
DELETE FROM saas.merchant_provider_definitions WHERE provider_code='akbank_json'AND capability='payment_processing';
ALTER TABLE saas.merchant_provider_definitions ENABLE TRIGGER merchant_provider_definitions_immutable;
DROP TABLE saas.akbank_hosted_pos275_function_backup;
COMMIT;
