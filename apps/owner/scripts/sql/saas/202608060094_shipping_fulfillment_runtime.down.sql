BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

LOCK TABLE saas.shipping_fulfillment_operations,saas.shipping_shipment_events,
  saas.shipping_fulfillment_jobs,saas.shipping_shipment_items,saas.shipping_shipments,
  saas.shipping_quote_options,saas.shipping_quote_sessions IN ACCESS EXCLUSIVE MODE;
DO $function$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.shipping_fulfillment_operations)
    OR EXISTS(SELECT 1 FROM saas.shipping_shipment_events)
    OR EXISTS(SELECT 1 FROM saas.shipping_fulfillment_jobs)
    OR EXISTS(SELECT 1 FROM saas.shipping_shipment_items)
    OR EXISTS(SELECT 1 FROM saas.shipping_shipments)
    OR EXISTS(SELECT 1 FROM saas.shipping_quote_options)
    OR EXISTS(SELECT 1 FROM saas.shipping_quote_sessions)
  THEN RAISE EXCEPTION 'SHIPPING_FULFILLMENT_RUNTIME_DOWN_BLOCKED'; END IF;
END
$function$;

REVOKE ALL ON FUNCTION
  saas.shipping_quote_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb,uuid,text,uuid,uuid,text),
  saas.shipping_quote_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.shipping_shipment_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,uuid,uuid,text,uuid,uuid,uuid),
  saas.shipping_shipment_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.shipping_shipment_for_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),
  saas.shipping_fulfillment_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),
  saas.shipping_fulfillment_claim(text,timestamptz,integer,uuid),
  saas.shipping_fulfillment_claim_job(uuid,text,timestamptz,integer,uuid),
  saas.shipping_fulfillment_open(uuid,text,uuid,bigint,timestamptz),
  saas.shipping_quote_complete(uuid,text,uuid,bigint,timestamptz,jsonb),
  saas.shipping_fulfillment_fail(uuid,text,uuid,bigint,timestamptz,text,text,integer),
  saas.shipping_shipment_complete(uuid,text,uuid,bigint,timestamptz,uuid,text,text,text,text,text,bigint),
  saas.shipping_shipment_mark_unknown(uuid,text,uuid,bigint,timestamptz,uuid,text),
  saas.shipping_fulfillment_runtime_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

DROP FUNCTION saas.shipping_fulfillment_runtime_preflight();
DROP FUNCTION saas.shipping_shipment_mark_unknown(uuid,text,uuid,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.shipping_shipment_complete(uuid,text,uuid,bigint,timestamptz,uuid,text,text,text,text,text,bigint);
DROP FUNCTION saas.shipping_fulfillment_fail(uuid,text,uuid,bigint,timestamptz,text,text,integer);
DROP FUNCTION saas.shipping_quote_complete(uuid,text,uuid,bigint,timestamptz,jsonb);
DROP FUNCTION saas.shipping_fulfillment_open(uuid,text,uuid,bigint,timestamptz);
DROP FUNCTION saas.shipping_fulfillment_claim_job(uuid,text,timestamptz,integer,uuid);
DROP FUNCTION saas.shipping_fulfillment_claim(text,timestamptz,integer,uuid);
DROP FUNCTION saas.shipping_fulfillment_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.shipping_shipment_for_order(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.shipping_shipment_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid);
DROP FUNCTION saas.shipping_shipment_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,uuid,uuid,text,uuid,uuid,uuid);
DROP FUNCTION saas.shipping_quote_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text);
DROP FUNCTION saas.shipping_quote_begin(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,jsonb,uuid,text,uuid,uuid,text);
DROP FUNCTION saas.shipping_shipment_projection(uuid,uuid);
DROP FUNCTION saas.shipping_quote_projection(uuid,uuid);

DROP TRIGGER shipping_fulfillment_operations_immutable ON saas.shipping_fulfillment_operations;
DROP TRIGGER shipping_shipment_events_immutable ON saas.shipping_shipment_events;
DROP FUNCTION saas.shipping_fulfillment_guard_immutable();

DROP TABLE saas.shipping_fulfillment_operations;
DROP TABLE saas.shipping_shipment_events;
DROP TABLE saas.shipping_fulfillment_jobs;
DROP TABLE saas.shipping_shipment_items;
DROP TABLE saas.shipping_shipments;
DROP TABLE saas.shipping_quote_options;
DROP TABLE saas.shipping_quote_sessions;
ALTER TABLE saas.order_items DROP CONSTRAINT order_items_store_order_id_key;
DROP FUNCTION saas.shipping_quote_option_batch_valid(jsonb);
DROP FUNCTION saas.shipping_package_batch_valid(jsonb);

COMMIT;
