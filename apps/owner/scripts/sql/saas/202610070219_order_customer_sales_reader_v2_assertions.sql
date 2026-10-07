BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assert$
DECLARE signature text; fn regprocedure;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
 'saas.orders_list_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)',
 'saas.orders_list_archived_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)',
 'saas.orders_get_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'
 ] LOOP
  fn:=to_regprocedure(signature);
  IF fn IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=fn AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='s') OR has_function_privilege('public',fn,'EXECUTE') OR NOT has_function_privilege('celebix_saas_app',fn,'EXECUTE') THEN RAISE EXCEPTION 'ORDERS219_READER_ABI_DRIFT %',signature;END IF;
 END LOOP;
 FOREACH signature IN ARRAY ARRAY[
 'saas.orders_normalized_phone_v2(text)',
 'saas.orders_search_matches_v2(text,text,text,text,text,text,text,text)',
 'saas.orders_reader_metadata_v2(uuid,uuid)',
 'saas.orders_detail_projection_v2(uuid,uuid)',
 'saas.orders_list_scope_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid,boolean)'
 ] LOOP
  fn:=to_regprocedure(signature);
  IF fn IS NULL OR has_function_privilege('public',fn,'EXECUTE') OR has_function_privilege('celebix_saas_app',fn,'EXECUTE') THEN RAISE EXCEPTION 'ORDERS219_HELPER_ABI_DRIFT %',signature;END IF;
 END LOOP;
END $assert$;
ROLLBACK;
