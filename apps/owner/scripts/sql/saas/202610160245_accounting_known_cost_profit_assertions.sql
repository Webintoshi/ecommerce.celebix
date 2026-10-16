BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
DO $assertions$
DECLARE f record;role_name text;outcome_value text;filters jsonb:='{"dateFrom":"2026-10-01","dateTo":"2026-10-16","profitScope":"known_cost"}';
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.accounting_known_profit_245_backup'::regclass AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
  OR(SELECT count(*) FROM saas.accounting_known_profit_245_backup)<>1
 THEN RAISE EXCEPTION 'ACCOUNTING245_BACKUP_AUTHORITY_INVALID';END IF;
 FOREACH role_name IN ARRAY ARRAY['public','celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_bootstrap','celebix_saas_host_resolver','celebix_saas_observability','celebix_saas_migrator'] LOOP
  IF has_table_privilege(role_name,'saas.accounting_known_profit_245_backup','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
  THEN RAISE EXCEPTION 'ACCOUNTING245_BACKUP_EXPOSED: %',role_name;END IF;
 END LOOP;
 SELECT * INTO STRICT f FROM saas.accounting_known_profit_245_backup;
 IF f.signature<>'saas.accounting_profitability_read(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,jsonb)' OR f.original_sha256<>'1f23a5d92126be51dc9e664f8d90d410912589ded0ea7049d34802047cbee230' OR f.published_sha256<>'b0f616812582cbf4f78e79ccde20a48dbbdbc58b9916669d7d229751f9b755d7'
  OR encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>f.original_sha256
  OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.function_oid AND p.oid=to_regprocedure(f.signature)
   AND p.proowner=f.function_owner AND p.proowner='celebix_saas_owner'::regrole AND p.proacl IS NOT DISTINCT FROM f.function_acl
   AND p.proconfig=ARRAY['search_path=pg_catalog, saas'] AND p.provolatile='s' AND p.prosecdef
   AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')=f.published_sha256
   AND has_function_privilege('celebix_saas_app',p.oid,'EXECUTE'))
 THEN RAISE EXCEPTION 'ACCOUNTING245_SOURCE_OR_AUTHORITY_DRIFT';END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid=f.function_oid AND (a.grantor<>'celebix_saas_owner'::regrole OR a.privilege_type<>'EXECUTE' OR a.is_grantable
   OR a.grantee NOT IN('celebix_saas_owner'::regrole,'celebix_saas_app'::regrole)))
 THEN RAISE EXCEPTION 'ACCOUNTING245_RPC_GRANT_DRIFT';END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.accounting_known_profit_245_backup'::regclass AND tgname='accounting_immutable'
  AND tgfoid='saas.accounting_immutable()'::regprocedure AND tgtype=27 AND tgenabled='O' AND NOT tgisinternal AND tgqual IS NULL AND tgattr::text='' AND tgnargs=0)
 THEN RAISE EXCEPTION 'ACCOUNTING245_BACKUP_NOT_IMMUTABLE';END IF;
 IF saas.accounting_profitability_filters_valid(filters) OR NOT saas.accounting_profitability_filters_valid(filters-'profitScope')
 THEN RAISE EXCEPTION 'ACCOUNTING245_LEGACY_VALIDATOR_CONTRACT_DRIFT';END IF;
 SELECT outcome INTO outcome_value FROM saas.accounting_profitability_read(NULL,NULL,NULL,NULL,NULL,NULL,clock_timestamp(),filters);
 IF outcome_value IS DISTINCT FROM 'membership_denied' THEN RAISE EXCEPTION 'ACCOUNTING245_UNAUTHENTICATED_ACCESS';END IF;
END $assertions$;
ROLLBACK;
