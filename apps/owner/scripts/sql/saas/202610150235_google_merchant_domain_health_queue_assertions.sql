-- Structural acceptance only; no tenant data or credentials are required.
DO $assertions$
DECLARE saved record;current_function record;definition text;role_name text;field_name text;
BEGIN
 IF (SELECT count(*) FROM saas.google_merchant_235_backup)<>1 THEN RAISE EXCEPTION 'MERCHANT235_BACKUP_INVALID';END IF;
 SELECT * INTO STRICT saved FROM saas.google_merchant_235_backup;
 SELECT * INTO STRICT current_function FROM pg_proc WHERE oid='saas.google_merchant_changed()'::regprocedure;
 definition:=pg_get_functiondef(current_function.oid);
 IF current_function.oid IS DISTINCT FROM saved.function_oid OR current_function.proowner IS DISTINCT FROM saved.function_owner
  OR current_function.proacl IS DISTINCT FROM saved.function_acl OR NOT current_function.prosecdef
  OR current_function.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  OR pg_get_function_result(current_function.oid)<>'trigger' OR current_function.pronargs<>0
  OR encode(sha256(convert_to(definition,'UTF8')),'hex') IS DISTINCT FROM saved.published_sha256
  OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM saved.original_sha256
 THEN RAISE EXCEPTION 'MERCHANT235_FUNCTION_CONTRACT_INVALID';END IF;
 FOREACH field_name IN ARRAY ARRAY['store_id','hostname','status','is_primary','verified_at'] LOOP
  IF position('NEW.'||field_name||' IS NOT DISTINCT FROM OLD.'||field_name IN definition)=0
  THEN RAISE EXCEPTION 'MERCHANT235_DOMAIN_GUARD_INVALID';END IF;
 END LOOP;
 IF position('IF TG_OP=''UPDATE'' AND NEW.store_id' IN definition)=0
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.store_domains'::regclass AND tgname='google_merchant_domain_changed' AND tgfoid=current_function.oid AND NOT tgisinternal AND tgenabled IN('O','A') AND tgtype=29)
 THEN RAISE EXCEPTION 'MERCHANT235_DOMAIN_TRIGGER_INVALID';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.google_merchant_235_backup'::regclass AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'MERCHANT235_BACKUP_NOT_PRIVATE';END IF;
 FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver','celebix_saas_identity','celebix_saas_bootstrap','celebix_saas_observability'] LOOP
  IF has_table_privilege(role_name,'saas.google_merchant_235_backup','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  THEN RAISE EXCEPTION 'MERCHANT235_BACKUP_EXPOSED';END IF;
 END LOOP;
END $assertions$;
