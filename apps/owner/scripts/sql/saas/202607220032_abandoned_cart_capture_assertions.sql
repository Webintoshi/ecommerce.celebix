BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $phase3b3_capture_assertions$
DECLARE signature text; selected regprocedure; definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)',
    'saas.abandoned_carts_mark_stale(timestamp with time zone,timestamp with time zone)',
    'saas.abandoned_carts_convert(text,text,uuid,timestamp with time zone)'
  ] LOOP
    selected:=signature::regprocedure;
    IF NOT pg_catalog.has_function_privilege('celebix_saas_workflow',selected,'EXECUTE')
       OR pg_catalog.has_function_privilege('celebix_saas_app',selected,'EXECUTE')
       OR pg_catalog.has_function_privilege('public',selected,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B3_CAPTURE_ASSERTION_FAILED: ACL drift %',signature;
    END IF;
    SELECT pg_catalog.pg_get_functiondef(selected) INTO definition;
    IF definition !~ 'SECURITY DEFINER' OR definition !~ 'SET search_path TO ''pg_catalog'', ''saas'''
       OR definition ~ 'current_setting' OR definition ~ 'p_store_id' THEN
      RAISE EXCEPTION 'PHASE3B3_CAPTURE_ASSERTION_FAILED: authority drift %',signature;
    END IF;
  END LOOP;
  IF pg_catalog.pg_get_functiondef('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)'::regprocedure)
     !~ 'product_variants' OR pg_catalog.pg_get_functiondef('saas.abandoned_carts_capture(text,uuid,text,timestamp with time zone,jsonb,jsonb)'::regprocedure)
     !~ 'pg_advisory_xact_lock' THEN
    RAISE EXCEPTION 'PHASE3B3_CAPTURE_ASSERTION_FAILED: catalog/concurrency drift';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint WHERE conrelid='saas.abandoned_carts'::regclass
      AND conname='abandoned_carts_recovered_order_store_fk'
      AND pg_catalog.pg_get_constraintdef(oid)~'FOREIGN KEY \(store_id, recovered_order_id\) REFERENCES saas.orders\(store_id, id\)'
  ) THEN RAISE EXCEPTION 'PHASE3B3_CAPTURE_ASSERTION_FAILED: order/store FK drift'; END IF;
END
$phase3b3_capture_assertions$;
COMMIT;
