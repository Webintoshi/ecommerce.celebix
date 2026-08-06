BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $function$
BEGIN
  IF saas.shipping_fulfillment_runtime_preflight() IS DISTINCT FROM true
    OR (SELECT pg_catalog.count(*)<>7 FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid=relation.relnamespace
      WHERE namespace.nspname='saas'
        AND relation.relname IN('shipping_quote_sessions','shipping_quote_options','shipping_shipments',
          'shipping_shipment_items','shipping_fulfillment_jobs','shipping_shipment_events','shipping_fulfillment_operations')
        AND relation.relrowsecurity AND relation.relforcerowsecurity)
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.shipping_shipments','SELECT,INSERT,UPDATE,DELETE')
    OR pg_catalog.has_table_privilege('celebix_saas_workflow','saas.shipping_fulfillment_jobs','SELECT,INSERT,UPDATE,DELETE')
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.shipping_quote_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,jsonb,uuid,text,uuid,uuid,text)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.shipping_shipment_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,text,uuid,uuid,text,uuid,uuid,uuid)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.shipping_fulfillment_claim(text,timestamp with time zone,integer,uuid)',
      'EXECUTE'
    )
    OR NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.shipping_fulfillment_claim_job(uuid,text,timestamp with time zone,integer,uuid)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'celebix_saas_app',
      'saas.shipping_fulfillment_open(uuid,text,uuid,bigint,timestamp with time zone)',
      'EXECUTE'
    )
    OR pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.shipping_quote_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,bigint,jsonb,uuid,text,uuid,uuid,text)',
      'EXECUTE'
    )
  THEN RAISE EXCEPTION 'SHIPPING_FULFILLMENT_RUNTIME_CONTRACT_INVALID'; END IF;
END
$function$;

COMMIT;
