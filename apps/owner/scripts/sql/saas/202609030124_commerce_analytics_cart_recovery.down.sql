BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.abandoned_cart_episodes)
    OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episode_items)
    OR EXISTS(SELECT 1 FROM saas.storefront_checkout_start_snapshots)
    OR EXISTS(SELECT 1 FROM saas.abandoned_cart_recovery_tokens)
    OR EXISTS(SELECT 1 FROM saas.abandoned_cart_recovery_attempts)
    OR EXISTS(SELECT 1 FROM saas.storefront_cart_attribution)
    OR EXISTS(SELECT 1 FROM saas.storefront_intent_attribution)
    OR EXISTS(SELECT 1 FROM saas.order_commerce_attribution)
    OR EXISTS(SELECT 1 FROM saas.analytics_delivery_outbox WHERE event_kind<>'purchase')
  THEN RAISE EXCEPTION 'COMMERCE_ANALYTICS_DOWN_GUARD'; END IF;
END
$guard$;

DROP TRIGGER orders_sync_commerce_analytics_paid_recovery ON saas.orders;
DROP FUNCTION saas.sync_commerce_analytics_paid_recovery();
DROP TRIGGER orders_enqueue_commerce_analytics_lifecycle ON saas.orders;
DROP FUNCTION saas.commerce_analytics_enqueue_order_event();
DROP TRIGGER payment_attempt_events_enqueue_commerce_failure ON saas.payment_attempt_events;
DROP FUNCTION saas.commerce_analytics_enqueue_payment_attempt_failure();
DROP TRIGGER abandoned_carts_sync_commerce_conversion ON saas.abandoned_carts;
DROP FUNCTION saas.sync_commerce_cart_conversion_state();
CREATE OR REPLACE FUNCTION saas.abandoned_carts_mark_recovered(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_cart_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT * FROM saas.abandoned_carts_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_cart_id,p_expected_version,'mark_recovered')
$function$;
CREATE OR REPLACE FUNCTION saas.abandoned_carts_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_cart_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT * FROM saas.abandoned_carts_mutate(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_cart_id,p_expected_version,'archive')
$function$;
GRANT EXECUTE ON FUNCTION saas.abandoned_carts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
DROP TRIGGER abandoned_carts_capture_order_attribution ON saas.abandoned_carts;
DROP FUNCTION saas.capture_order_commerce_attribution();
DROP TRIGGER storefront_checkout_operations_capture_commerce_attribution ON saas.storefront_checkout_operations;
DROP FUNCTION saas.capture_checkout_order_commerce_attribution();
DROP FUNCTION saas.commerce_analytics_paid_funnel_sessions(uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz,timestamptz,jsonb);
DROP FUNCTION saas.commerce_analytics_timezone(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz,timestamptz);
DROP FUNCTION saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz,timestamptz,jsonb);
DROP TRIGGER orders_capture_commerce_payment_timestamps ON saas.orders;
DROP FUNCTION saas.capture_order_commerce_payment_timestamps();
ALTER TABLE saas.orders DROP CONSTRAINT orders_commerce_payment_timestamps_check,
  DROP COLUMN refunded_at,DROP COLUMN paid_at;
DROP FUNCTION saas.public_campaign_product_projection(uuid,uuid,timestamptz);
ALTER FUNCTION saas.public_campaign_product_projection_without_commerce_analytics(uuid,uuid,timestamptz)
  RENAME TO public_campaign_product_projection;
DROP FUNCTION saas.storefront_cart_projection(uuid,uuid,timestamptz);
ALTER FUNCTION saas.storefront_cart_projection_without_commerce_analytics(uuid,uuid,timestamptz)
  RENAME TO storefront_cart_projection;
DROP FUNCTION saas.storefront_intent_projection(uuid,uuid,timestamptz);
ALTER FUNCTION saas.storefront_intent_projection_without_commerce_analytics(uuid,uuid,timestamptz)
  RENAME TO storefront_intent_projection;
DROP FUNCTION saas.public_checkout_quote(text,timestamptz,text,jsonb,jsonb);
DROP FUNCTION saas.public_checkout_quote(text,timestamptz,text,jsonb);
ALTER FUNCTION saas.public_checkout_quote_without_commerce_analytics(text,timestamptz,text,jsonb)
  RENAME TO public_checkout_quote;
GRANT EXECUTE ON FUNCTION saas.public_checkout_quote(text,timestamptz,text,jsonb) TO celebix_saas_host_resolver;
DROP FUNCTION saas.public_cart_recovery_restore(text,timestamptz,text,uuid,text,text,timestamptz);
DROP FUNCTION saas.commerce_cart_recovery_attempt_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text);
DROP FUNCTION saas.commerce_cart_recovery_link_issue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,integer);
DROP FUNCTION saas.commerce_analytics_settings_update(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,integer,integer,integer,boolean,integer,integer,text);
DROP FUNCTION saas.commerce_analytics_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz);
DROP FUNCTION saas.commerce_analytics_worker_status(uuid,timestamptz);
DROP FUNCTION saas.analytics_outbox_requeue_dead_letter(uuid,timestamptz);
DROP FUNCTION saas.analytics_outbox_claim_v2(timestamptz,integer,interval);
DROP FUNCTION saas.commerce_analytics_evaluate_carts(timestamptz,integer);
DROP FUNCTION saas.commerce_analytics_enqueue_cart_event(uuid,uuid,uuid,text,text,text,bigint,timestamptz);
DROP FUNCTION saas.commerce_analytics_settings_for_store(uuid,timestamptz);
DROP FUNCTION saas.public_cart_attribution_record(text,timestamptz,jsonb,jsonb);
DROP FUNCTION saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer,jsonb);
DROP FUNCTION saas.commerce_attribution_valid(jsonb);
DROP FUNCTION saas.commerce_analytics_reconcile_all_hostnames(timestamptz,text,integer);
DROP FUNCTION saas.commerce_analytics_reconcile_hostnames(uuid,timestamptz,text);
DROP TRIGGER analytics_delivery_outbox_event_metadata ON saas.analytics_delivery_outbox;
DROP FUNCTION saas.ensure_analytics_event_metadata();

ALTER TABLE saas.analytics_delivery_outbox
  DROP CONSTRAINT analytics_delivery_outbox_entity_check,
  DROP CONSTRAINT analytics_delivery_outbox_store_event_key,
  DROP CONSTRAINT analytics_delivery_outbox_episode_store_fk,
  DROP CONSTRAINT analytics_delivery_outbox_cart_store_fk,
  DROP CONSTRAINT analytics_delivery_outbox_payment_attempt_store_fk,
  DROP CONSTRAINT analytics_delivery_outbox_payload_check,
  DROP CONSTRAINT analytics_delivery_outbox_kind_check,
  DROP COLUMN value_minor,DROP COLUMN currency,DROP COLUMN occurred_at,DROP COLUMN event_key,DROP COLUMN payment_attempt_id,DROP COLUMN episode_id,DROP COLUMN cart_id,
  ALTER COLUMN order_id SET NOT NULL,
  ADD CONSTRAINT analytics_delivery_outbox_store_order_kind_key UNIQUE(store_id,order_id,event_kind),
  ADD CONSTRAINT analytics_delivery_outbox_kind_check CHECK(event_kind='purchase'),
  ADD CONSTRAINT analytics_delivery_outbox_payload_check CHECK (
    pg_catalog.jsonb_typeof(payload)='object' AND pg_catalog.pg_column_size(payload)<=1024
    AND payload ?& ARRAY['valueCents','currency','source']
    AND NOT payload ?| ARRAY['orderId','orderNumber','storeId','customer','email','address','websiteId','provider']
  );

CREATE OR REPLACE FUNCTION saas.enqueue_analytics_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE safe_payload jsonb;
BEGIN
  IF NEW.payment_status='completed' AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM 'completed') THEN
    safe_payload:=pg_catalog.jsonb_build_object('valueCents',NEW.total_cents,'currency',NEW.currency,'source',NEW.source);
    INSERT INTO saas.analytics_delivery_outbox(
      id,store_id,order_id,connection_id,website_id,event_kind,payload,payload_digest,status,attempt_count,next_attempt_at,created_at,updated_at
    ) SELECT pg_catalog.gen_random_uuid(),NEW.store_id,NEW.id,connection.id,connection.website_id,'purchase',safe_payload,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(safe_payload::text,'UTF8')),'hex'),'pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at
    FROM saas.store_analytics_connections connection
    WHERE connection.store_id=NEW.store_id AND connection.status='active' AND saas.analytics_connection_is_current(connection.id,NEW.updated_at)
    ON CONFLICT(store_id,order_id,event_kind) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;

DROP TABLE saas.abandoned_cart_recovery_attempts;
DROP TABLE saas.abandoned_cart_recovery_tokens;
DROP TABLE saas.storefront_checkout_start_snapshots;
DROP TABLE saas.abandoned_cart_episode_items;
DROP TABLE saas.abandoned_cart_episodes;
DROP TABLE saas.order_commerce_attribution;
DROP TABLE saas.storefront_intent_attribution;
DROP TABLE saas.storefront_cart_attribution;
ALTER TABLE saas.abandoned_carts DROP CONSTRAINT abandoned_carts_safe_attribution_check,
  DROP COLUMN anonymous_session_ref,DROP COLUMN device_group,DROP COLUMN landing_path_group,DROP COLUMN referrer_host,
  DROP COLUMN last_touch_campaign,DROP COLUMN last_touch_medium,DROP COLUMN last_touch_source,
  DROP COLUMN first_touch_campaign,DROP COLUMN first_touch_medium,DROP COLUMN first_touch_source,
  DROP COLUMN expires_at,DROP COLUMN candidate_at,DROP COLUMN lifecycle_status;
DROP TABLE saas.store_commerce_analytics_settings;

CREATE OR REPLACE FUNCTION saas.analytics_connection_is_current(p_connection_id uuid,p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT p_now IS NOT NULL AND EXISTS(
    SELECT 1 FROM saas.store_analytics_connections c
    JOIN saas.stores s ON s.id=c.store_id AND s.status='active'
    JOIN saas.store_domains d ON d.store_id=c.store_id AND d.hostname=c.hostname AND d.status='active' AND d.is_primary AND d.verified_at<=p_now
    JOIN saas.subscriptions sub ON sub.store_id=c.store_id AND sub.status='active' AND sub.valid_from<=p_now AND (sub.valid_until IS NULL OR sub.valid_until>p_now)
    JOIN saas.plans p ON p.id=sub.plan_id AND p.plan_code=sub.plan_code AND p.version=sub.plan_version AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)
    JOIN saas.plan_features f ON f.plan_id=p.id AND f.feature_key='analytics' AND f.enabled
    WHERE c.id=p_connection_id AND c.status='active'
  )
$function$;

CREATE OR REPLACE FUNCTION saas.analytics_connection_get_for_host(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE connection_row saas.store_analytics_connections%ROWTYPE;
BEGIN
  IF p_now IS NULL OR p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname) OR pg_catalog.char_length(p_hostname) NOT BETWEEN 3 AND 253
    OR p_hostname~'[*:/?#@[:space:][:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT c.* INTO connection_row FROM saas.store_analytics_connections c
    WHERE c.hostname=p_hostname AND c.status='active' AND saas.analytics_connection_is_current(c.id,p_now);
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('websiteId',connection_row.website_id,'hostname',connection_row.hostname); END IF;
END
$function$;

DROP TABLE saas.store_analytics_hostnames;
ALTER TABLE saas.store_analytics_connections DROP CONSTRAINT store_analytics_connections_store_id_id_key,
  DROP COLUMN safe_error_code,DROP COLUMN last_success_at,DROP COLUMN last_reconciled_at,DROP COLUMN tracker_version;

COMMIT;
