BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assert$
DECLARE signature text; fn regprocedure;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'saas.orders_list_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,text,text)',
  'saas.orders_list_archived_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,text,text)'
 ] LOOP
  fn:=to_regprocedure(signature);
  IF fn IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=fn AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='s' AND p.proconfig @> ARRAY['search_path=pg_catalog, saas']::text[])
    OR has_function_privilege('public',fn,'EXECUTE') OR NOT has_function_privilege('celebix_saas_app',fn,'EXECUTE')
  THEN RAISE EXCEPTION 'ORDERS227_READER_ABI_DRIFT %',signature;END IF;
 END LOOP;
 fn:=to_regprocedure('saas.orders_list_scope_filtered_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text,text,bigint,bigint,timestamptz,uuid,boolean,text,text)');
 IF fn IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=fn AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='s' AND p.proconfig @> ARRAY['search_path=pg_catalog, saas']::text[])
   OR has_function_privilege('public',fn,'EXECUTE') OR has_function_privilege('celebix_saas_app',fn,'EXECUTE')
 THEN RAISE EXCEPTION 'ORDERS227_PRIVATE_SCOPE_ABI_DRIFT';END IF;
END $assert$;
ROLLBACK;
