-- Exact one-expression patch, unchanged callable identity and authority.
DO $assertions$
DECLARE signature constant text:='saas.in_store_sales_mutate_v3(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb)';
 anchor constant text:='selected.total_cents,''delivered'',CASE WHEN selected.initial_collection_cents=selected.total_cents THEN ''completed'' ELSE ''pending'' END,NULL,p_now,p_now,CASE';
 replacement constant text:='selected.total_cents,''delivered'',CASE WHEN selected.initial_collection_cents=selected.total_cents THEN ''completed'' ELSE ''pending'' END,NULL,coalesce(selected.payment_received_at,p_now),p_now,CASE';
 backup saas.in_store_payment_timing_208_backup%ROWTYPE;
BEGIN
 IF (SELECT count(*) FROM saas.in_store_payment_timing_208_backup)<>1 THEN RAISE EXCEPTION 'IN_STORE_PAYMENT_TIMING_BACKUP_INVALID';END IF;
 SELECT * INTO backup FROM saas.in_store_payment_timing_208_backup WHERE singleton;
 IF backup.before_hash<>'b359a12e8b2443a89818304e04dd18ae8e6da7c15be157fcfee7f25285f9ed48'
  OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(backup.definition,'UTF8')),'hex')<>backup.before_hash
  OR backup.owner_oid<>'celebix_saas_owner'::regrole
  OR backup.acl::text<>'{celebix_saas_owner=X/celebix_saas_owner}'
  OR (pg_catalog.length(backup.definition)-pg_catalog.length(pg_catalog.replace(backup.definition,anchor,'')))/pg_catalog.length(anchor)<>1
  OR backup.after_hash<>pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.replace(backup.definition,anchor,replacement),'UTF8')),'hex')
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid=p.prolang
   WHERE p.oid=backup.function_oid AND p.oid=pg_catalog.to_regprocedure(signature)
    AND pg_catalog.pg_get_functiondef(p.oid)=pg_catalog.replace(backup.definition,anchor,replacement)
    AND p.proowner=backup.owner_oid AND p.proacl=backup.acl AND p.prosecdef
    AND p.provolatile='v' AND p.prokind='f' AND NOT p.proleakproof AND NOT p.proisstrict AND p.proparallel='u'
    AND l.lanname='plpgsql' AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[])
  OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class c WHERE c.oid='saas.in_store_payment_timing_208_backup'::regclass
   AND c.relowner='celebix_saas_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity)
  OR pg_catalog.has_table_privilege('celebix_saas_app','saas.in_store_payment_timing_208_backup','SELECT')
  OR pg_catalog.has_function_privilege('celebix_saas_app',signature,'EXECUTE')
  OR pg_catalog.has_function_privilege('public',signature,'EXECUTE')
 THEN RAISE EXCEPTION 'IN_STORE_PAYMENT_TIMING_EXACT_PATCH_INVALID';END IF;
END $assertions$;
