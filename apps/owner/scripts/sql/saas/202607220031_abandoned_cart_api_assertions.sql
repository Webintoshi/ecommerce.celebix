-- Phase 3B3 abandoned-cart API definer, ACL and durable-authority assertions.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $phase3b3_abandoned_cart_api_assertions$
DECLARE
  signature text;
  function_oid regprocedure;
  function_definition text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'saas.abandoned_carts_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)',
    'saas.abandoned_carts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'saas.abandoned_carts_mark_recovered(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.abandoned_carts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'
  ] LOOP
    function_oid := signature::regprocedure;
    IF NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_proc AS procedure
      JOIN pg_catalog.pg_roles AS owner_role ON owner_role.oid=procedure.proowner
      WHERE procedure.oid=function_oid AND owner_role.rolname='celebix_saas_owner'
        AND procedure.prosecdef AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
    ) OR pg_catalog.has_function_privilege('public',function_oid,'EXECUTE')
       OR NOT pg_catalog.has_function_privilege('celebix_saas_app',function_oid,'EXECUTE') THEN
      RAISE EXCEPTION 'PHASE3B3_CART_API_ASSERTION_FAILED: function security/ACL drift %',signature;
    END IF;
    SELECT pg_catalog.pg_get_functiondef(function_oid) INTO function_definition;
    IF function_definition !~ 'p_store_id' OR function_definition ~ 'current_setting' THEN
      RAISE EXCEPTION 'PHASE3B3_CART_API_ASSERTION_FAILED: browser/session authority drift %',signature;
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure,
    'EXECUTE'
  ) OR pg_catalog.has_function_privilege(
    'public',
    'saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PHASE3B3_CART_API_ASSERTION_FAILED: mutation helper exposed';
  END IF;

  function_definition := pg_catalog.pg_get_functiondef(
    'saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)'::regprocedure
  );
  IF function_definition !~ 'carts[.]read' OR function_definition !~ 'carts[.]manage'
     OR function_definition !~ 'membership[.]store_id[[:space:]]*=[[:space:]]*p_store_id'
     OR function_definition !~ 'subscription[.]store_id[[:space:]]*=[[:space:]]*p_store_id' THEN
    RAISE EXCEPTION 'PHASE3B3_CART_API_ASSERTION_FAILED: durable cart action authority drift';
  END IF;

  IF pg_catalog.pg_get_functiondef(
    'saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure
  ) !~ 'pg_advisory_xact_lock'
  OR pg_catalog.pg_get_functiondef(
    'saas.abandoned_carts_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure
  ) !~ 'FOR UPDATE' THEN
    RAISE EXCEPTION 'PHASE3B3_CART_API_ASSERTION_FAILED: concurrency authority drift';
  END IF;
END
$phase3b3_abandoned_cart_api_assertions$;

COMMIT;
