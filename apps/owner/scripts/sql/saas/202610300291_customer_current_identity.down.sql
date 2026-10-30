-- Restore the exact previous readers; business snapshots remain unchanged.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.customer-current-identity.release291',0));
DO $down$ DECLARE reviewed record;saved record;BEGIN
 IF current_setting('celebix.allow_native291_down',true) IS DISTINCT FROM 'on' THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_DOWN_OPT_IN_REQUIRED';END IF;
 IF (SELECT count(*) FROM saas.customer_current_identity291_function_backup)<>4 THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_BACKUP_INVALID';END IF;
 FOR reviewed IN SELECT * FROM(VALUES
  ('saas.abandoned_carts_list_without_durable_reconciliation_v101(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)','e2f971e4ec017297c3cbb74af097b7147d0505664a0602f38034b362f0e2b646','332ef3ddc982547facc9e5d14c2cdaac2d9863e57faaa7607fd7b0fe52224eb5',true),
  ('saas.abandoned_carts_projection(uuid,uuid)','e96f824519fe4fe2794c607385edbb5c29d391e7529a17620454af8a882020e9','1133116b8a51efa8719e0d246cb214bf1514ca0d0af152e587f49c43c604d1c2',false),
  ('saas.accounting_receivable_projection(uuid,uuid)','1b9f355323a8d4727cc03da9d4d49f389ad7c691e6da0bb7ba473ba2b21ea418','5dd750d3133aa97311e24a4739f32395cd5f8012f7bebcf495e0371e736b117f',true),
  ('saas.in_store_sales_projection_v3(uuid,uuid)','29f84ec8829fa86b393835e78553ad9e8b2e8d75c0564cf5b0799d2b7872209d','a20bae5c73624f766e492ce51af1298075e7cd9b42062c3b4790a077ff6bc8b3',true)
 )evidence(signature,before_sha,after_sha,definer) LOOP
  SELECT * INTO STRICT saved FROM saas.customer_current_identity291_function_backup WHERE signature=reviewed.signature;
  IF saved.before_definition_sha IS DISTINCT FROM reviewed.before_sha OR saved.after_definition_sha IS DISTINCT FROM reviewed.after_sha
   OR encode(sha256(convert_to(saved.definition,'UTF8')),'hex') IS DISTINCT FROM reviewed.before_sha
   OR saved.owner_oid IS DISTINCT FROM 'celebix_saas_owner'::regrole
   OR saved.acl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'
   OR saved.config IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
   OR saved.security_definer IS DISTINCT FROM reviewed.definer OR saved.volatility<>'s' OR saved.is_strict OR saved.parallel<>'u'
  THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_BACKUP_DRIFT:%',reviewed.signature;END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid AND p.oid=to_regprocedure(saved.signature)
   AND encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex')=saved.after_definition_sha
   AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl AND p.proconfig IS NOT DISTINCT FROM saved.config
   AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility AND p.proisstrict=saved.is_strict AND p.proparallel=saved.parallel)
  THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_DOWN_DRIFT:%',saved.signature;END IF;
  EXECUTE saved.definition;
  IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=saved.function_oid
   AND encode(sha256(convert_to(pg_get_functiondef(saved.function_oid),'UTF8')),'hex')=saved.before_definition_sha
   AND p.proowner=saved.owner_oid AND p.proacl IS NOT DISTINCT FROM saved.acl AND p.proconfig IS NOT DISTINCT FROM saved.config
   AND p.prosecdef=saved.security_definer AND p.provolatile=saved.volatility AND p.proisstrict=saved.is_strict AND p.proparallel=saved.parallel)
  THEN RAISE EXCEPTION 'CUSTOMER_CURRENT_IDENTITY291_RESTORE_INVALID:%',saved.signature;END IF;
 END LOOP;
END $down$;
DROP TABLE saas.customer_current_identity291_function_backup;
COMMIT;
