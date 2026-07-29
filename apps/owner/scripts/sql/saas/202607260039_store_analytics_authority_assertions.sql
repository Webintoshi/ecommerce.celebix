DO $assertions$
DECLARE signature text; runtime_role text;
BEGIN
  IF pg_catalog.to_regclass('saas.store_analytics_connections') IS NULL
    OR pg_catalog.to_regclass('saas.analytics_connection_operations') IS NULL
    OR pg_catalog.to_regclass('saas.analytics_delivery_outbox') IS NULL
  THEN RAISE EXCEPTION 'PHASE3H_TABLES_MISSING'; END IF;
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='saas.store_analytics_connections'::regclass)
    OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='saas.analytics_connection_operations'::regclass)
    OR NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class WHERE oid='saas.analytics_delivery_outbox'::regclass)
  THEN RAISE EXCEPTION 'PHASE3H_RLS_NOT_FORCED'; END IF;
  FOREACH signature IN ARRAY ARRAY[
    'saas.analytics_connection_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',
    'saas.analytics_connection_begin(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid)',
    'saas.analytics_connection_activate(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text)',
    'saas.analytics_connection_disable(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)',
    'saas.analytics_connection_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',
    'saas.analytics_connection_get_for_host(text,timestamp with time zone)',
    'saas.analytics_outbox_claim(timestamp with time zone,integer,interval)',
    'saas.analytics_outbox_mark_delivered(uuid,text,timestamp with time zone)',
    'saas.analytics_outbox_mark_failed(uuid,text,timestamp with time zone,text,timestamp with time zone,boolean)'
  ] LOOP
    IF pg_catalog.to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'PHASE3H_FUNCTION_MISSING: %',signature; END IF;
  END LOOP;
  FOREACH runtime_role IN ARRAY ARRAY['celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow'] LOOP
    IF pg_catalog.has_table_privilege(runtime_role,'saas.store_analytics_connections','SELECT,INSERT,UPDATE,DELETE')
      OR pg_catalog.has_table_privilege(runtime_role,'saas.analytics_connection_operations','SELECT,INSERT,UPDATE,DELETE')
      OR pg_catalog.has_table_privilege(runtime_role,'saas.analytics_delivery_outbox','SELECT,INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'PHASE3H_DIRECT_TABLE_PRIVILEGE: %',runtime_role; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_trigger WHERE tgrelid='saas.orders'::regclass AND tgname='orders_enqueue_analytics_purchase' AND NOT tgisinternal)
    THEN RAISE EXCEPTION 'PHASE3H_ORDER_TRIGGER_MISSING'; END IF;
END
$assertions$;
