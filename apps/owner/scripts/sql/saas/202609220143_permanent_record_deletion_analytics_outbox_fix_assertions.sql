DO $assertions$
DECLARE
  impact_definition text;
  delete_definition text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'::regprocedure
  ) INTO impact_definition;
  SELECT pg_catalog.pg_get_functiondef(
    'saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)'::regprocedure
  ) INTO delete_definition;

  IF impact_definition !~ 'analytics_events'
     OR impact_definition !~ 'analytics_delivery_outbox'
     OR delete_definition !~ 'DELETE FROM saas.analytics_delivery_outbox' THEN
    RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_ANALYTICS_OUTBOX_FIX_ASSERTION_FAILED';
  END IF;

  IF NOT pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.order_deletion_impact(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',
    'EXECUTE'
  ) OR NOT pg_catalog.has_function_privilege(
    'celebix_saas_app',
    'saas.delete_order(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_ANALYTICS_OUTBOX_FIX_ACL_ASSERTION_FAILED';
  END IF;
END
$assertions$;
