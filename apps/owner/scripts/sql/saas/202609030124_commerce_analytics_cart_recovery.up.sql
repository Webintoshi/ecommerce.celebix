-- Additive commerce analytics and cart-recovery authority built on the existing
-- Umami connection, analytics outbox, durable cart, checkout, and order tables.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.store_analytics_connections
  ADD COLUMN tracker_version integer NOT NULL DEFAULT 1 CHECK (tracker_version BETWEEN 1 AND 1000),
  ADD COLUMN last_reconciled_at timestamptz,
  ADD COLUMN last_success_at timestamptz,
  ADD COLUMN safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  ADD CONSTRAINT store_analytics_connections_store_id_id_key UNIQUE(store_id,id);

CREATE TABLE saas.store_analytics_hostnames (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  connection_id uuid NOT NULL REFERENCES saas.store_analytics_connections(id) ON DELETE RESTRICT,
  hostname text NOT NULL CHECK (
    hostname=pg_catalog.lower(hostname) AND pg_catalog.char_length(hostname) BETWEEN 3 AND 253
    AND hostname!~'[*:/?#@[:space:][:cntrl:]]'
  ),
  environment text NOT NULL CHECK (environment IN ('staging','production')),
  source text NOT NULL CHECK (source IN ('primary','custom','fallback')),
  active boolean NOT NULL DEFAULT true,
  reconciled_at timestamptz NOT NULL,
  CONSTRAINT store_analytics_hostnames_store_id_id_key UNIQUE (store_id,id),
  CONSTRAINT store_analytics_hostnames_store_host_environment_key UNIQUE (store_id,hostname,environment),
  CONSTRAINT store_analytics_hostnames_connection_store_fk FOREIGN KEY (store_id,connection_id)
    REFERENCES saas.store_analytics_connections(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.store_commerce_analytics_settings (
  store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
  candidate_minutes integer NOT NULL DEFAULT 30 CHECK (candidate_minutes BETWEEN 15 AND 360),
  abandoned_hours integer NOT NULL DEFAULT 24 CHECK (abandoned_hours BETWEEN 1 AND 168),
  recovery_link_hours integer NOT NULL DEFAULT 72 CHECK (recovery_link_hours BETWEEN 1 AND 168),
  automatic_recovery_enabled boolean NOT NULL DEFAULT false,
  maximum_message_attempts integer NOT NULL DEFAULT 3 CHECK (maximum_message_attempts BETWEEN 1 AND 3),
  minimum_message_interval_hours integer NOT NULL DEFAULT 6 CHECK (minimum_message_interval_hours BETWEEN 6 AND 168),
  tracking_policy text NOT NULL DEFAULT 'anonymous_commerce' CHECK (tracking_policy IN ('disabled','anonymous_commerce')),
  version bigint NOT NULL DEFAULT 1 CHECK (version>0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CHECK (abandoned_hours*60>candidate_minutes),
  CHECK (updated_at>=created_at)
);

CREATE TABLE saas.storefront_cart_attribution (
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  first_touch_source text NOT NULL,
  first_touch_medium text NOT NULL,
  first_touch_campaign text,
  last_touch_source text NOT NULL,
  last_touch_medium text NOT NULL,
  last_touch_campaign text,
  referrer_host text,
  landing_path_group text NOT NULL,
  device_group text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,cart_id),
  CONSTRAINT storefront_cart_attribution_cart_store_fk FOREIGN KEY(store_id,cart_id)
    REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
  CHECK (device_group IN ('desktop','mobile','tablet','unknown') AND updated_at>=created_at)
);

CREATE TABLE saas.order_commerce_attribution (
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  source_cart_id uuid NOT NULL,
  first_touch_source text NOT NULL,
  first_touch_medium text NOT NULL,
  first_touch_campaign text,
  last_touch_source text NOT NULL,
  last_touch_medium text NOT NULL,
  last_touch_campaign text,
  referrer_host text,
  landing_path_group text NOT NULL,
  device_group text NOT NULL,
  captured_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,order_id),
  CONSTRAINT order_commerce_attribution_order_store_fk FOREIGN KEY(store_id,order_id)
    REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT order_commerce_attribution_cart_store_fk FOREIGN KEY(store_id,source_cart_id)
    REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT
);

ALTER TABLE saas.abandoned_carts
  ADD COLUMN lifecycle_status text NOT NULL DEFAULT 'active' CHECK (
    lifecycle_status IN ('active','candidate','abandoned','resumed','converted_pending_payment','recovered','expired')
  ),
  ADD COLUMN candidate_at timestamptz,
  ADD COLUMN expires_at timestamptz,
  ADD COLUMN first_touch_source text,
  ADD COLUMN first_touch_medium text,
  ADD COLUMN first_touch_campaign text,
  ADD COLUMN last_touch_source text,
  ADD COLUMN last_touch_medium text,
  ADD COLUMN last_touch_campaign text,
  ADD COLUMN referrer_host text,
  ADD COLUMN landing_path_group text,
  ADD COLUMN device_group text,
  ADD COLUMN anonymous_session_ref char(67) CHECK (anonymous_session_ref IS NULL OR anonymous_session_ref ~ '^h1_[0-9a-f]{64}$'),
  ADD CONSTRAINT abandoned_carts_safe_attribution_check CHECK (
    (first_touch_source IS NULL OR (pg_catalog.char_length(first_touch_source) BETWEEN 1 AND 128 AND first_touch_source!~'[[:cntrl:]@]'))
    AND (first_touch_medium IS NULL OR (pg_catalog.char_length(first_touch_medium) BETWEEN 1 AND 128 AND first_touch_medium!~'[[:cntrl:]@]'))
    AND (first_touch_campaign IS NULL OR (pg_catalog.char_length(first_touch_campaign) BETWEEN 1 AND 128 AND first_touch_campaign!~'[[:cntrl:]@]'))
    AND (last_touch_source IS NULL OR (pg_catalog.char_length(last_touch_source) BETWEEN 1 AND 128 AND last_touch_source!~'[[:cntrl:]@]'))
    AND (last_touch_medium IS NULL OR (pg_catalog.char_length(last_touch_medium) BETWEEN 1 AND 128 AND last_touch_medium!~'[[:cntrl:]@]'))
    AND (last_touch_campaign IS NULL OR (pg_catalog.char_length(last_touch_campaign) BETWEEN 1 AND 128 AND last_touch_campaign!~'[[:cntrl:]@]'))
    AND (referrer_host IS NULL OR (referrer_host=pg_catalog.lower(referrer_host) AND referrer_host!~'[/?:#@[:space:][:cntrl:]]'))
    AND (landing_path_group IS NULL OR (pg_catalog.char_length(landing_path_group) BETWEEN 1 AND 128 AND landing_path_group~'^/[a-z0-9/_-]*$'))
    AND (device_group IS NULL OR device_group IN ('desktop','mobile','tablet','unknown'))
  );

UPDATE saas.abandoned_carts SET lifecycle_status=CASE status
  WHEN 'abandoned' THEN 'abandoned' WHEN 'recovered' THEN 'converted_pending_payment'
  WHEN 'archived' THEN 'expired' ELSE 'active' END;

CREATE TABLE saas.abandoned_cart_episodes (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  episode_number integer NOT NULL CHECK (episode_number BETWEEN 1 AND 10000),
  candidate_at timestamptz NOT NULL,
  abandoned_at timestamptz,
  resumed_at timestamptz,
  recovered_at timestamptz,
  linked_order_id uuid,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  value_minor bigint NOT NULL CHECK (value_minor >= 0),
  first_touch jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_catalog.jsonb_typeof(first_touch)='object' AND pg_catalog.pg_column_size(first_touch)<=1024),
  last_touch jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (pg_catalog.jsonb_typeof(last_touch)='object' AND pg_catalog.pg_column_size(last_touch)<=1024),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT abandoned_cart_episodes_store_id_id_key UNIQUE (store_id,id),
  CONSTRAINT abandoned_cart_episodes_store_cart_number_key UNIQUE (store_id,cart_id,episode_number),
  CONSTRAINT abandoned_cart_episodes_cart_store_fk FOREIGN KEY (store_id,cart_id)
    REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT abandoned_cart_episodes_order_store_fk FOREIGN KEY (store_id,linked_order_id)
    REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  CHECK (updated_at>=created_at AND (abandoned_at IS NULL OR abandoned_at>=candidate_at)
    AND (resumed_at IS NULL OR (abandoned_at IS NOT NULL AND resumed_at>=abandoned_at))
    AND (recovered_at IS NULL OR (abandoned_at IS NOT NULL AND recovered_at>=abandoned_at)))
);

CREATE TABLE saas.abandoned_cart_recovery_tokens (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  token_digest char(64) NOT NULL CHECK (token_digest ~ '^[0-9a-f]{64}$'),
  key_version integer NOT NULL CHECK (key_version BETWEEN 1 AND 1000),
  hostname text NOT NULL CHECK (hostname=pg_catalog.lower(hostname) AND hostname!~'[/?:#@[:space:][:cntrl:]]'),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  used_at timestamptz,
  restored_cart_id uuid,
  restored_items integer CHECK (restored_items IS NULL OR restored_items BETWEEN 1 AND 100),
  omitted_items integer CHECK (omitted_items IS NULL OR omitted_items BETWEEN 0 AND 100),
  converted_at timestamptz,
  created_by_membership_id uuid NOT NULL,
  created_at timestamptz NOT NULL,
  CONSTRAINT abandoned_cart_recovery_tokens_store_id_id_key UNIQUE (store_id,id),
  CONSTRAINT abandoned_cart_recovery_tokens_store_digest_key UNIQUE (store_id,token_digest),
  CONSTRAINT abandoned_cart_recovery_tokens_cart_store_fk FOREIGN KEY (store_id,cart_id)
    REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT abandoned_cart_recovery_tokens_episode_store_fk FOREIGN KEY (store_id,episode_id)
    REFERENCES saas.abandoned_cart_episodes(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT abandoned_cart_recovery_tokens_member_store_fk FOREIGN KEY (store_id,created_by_membership_id)
    REFERENCES saas.memberships(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT abandoned_cart_recovery_tokens_restored_cart_store_fk FOREIGN KEY (store_id,restored_cart_id)
    REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
  CHECK (expires_at>created_at AND (revoked_at IS NULL OR revoked_at>=created_at) AND (used_at IS NULL OR used_at>=created_at)
    AND (converted_at IS NULL OR (used_at IS NOT NULL AND converted_at>=used_at))
    AND ((used_at IS NULL AND restored_cart_id IS NULL AND restored_items IS NULL AND omitted_items IS NULL)
      OR (used_at IS NOT NULL AND restored_cart_id IS NOT NULL AND restored_items IS NOT NULL AND omitted_items IS NOT NULL)))
);

CREATE TABLE saas.abandoned_cart_recovery_attempts (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  operation_id uuid NOT NULL,
  channel text NOT NULL CHECK (channel IN ('link','contacted','note','email','whatsapp')),
  status text NOT NULL CHECK (status IN ('queued','sent','failed','recorded')),
  consent_verified boolean NOT NULL DEFAULT false,
  safe_error_code text CHECK (safe_error_code IS NULL OR safe_error_code ~ '^[a-z][a-z0-9_]{0,63}$'),
  note text CHECK (note IS NULL OR (note=pg_catalog.btrim(note) AND pg_catalog.char_length(note) BETWEEN 1 AND 1000 AND note!~'[[:cntrl:]]')),
  attempted_by_membership_id uuid NOT NULL,
  attempted_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT abandoned_cart_recovery_attempts_store_id_id_key UNIQUE (store_id,id),
  CONSTRAINT abandoned_cart_recovery_attempts_store_operation_key UNIQUE (store_id,operation_id),
  CONSTRAINT abandoned_cart_recovery_attempts_cart_store_fk FOREIGN KEY (store_id,cart_id)
    REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT abandoned_cart_recovery_attempts_episode_store_fk FOREIGN KEY (store_id,episode_id)
    REFERENCES saas.abandoned_cart_episodes(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT abandoned_cart_recovery_attempts_member_store_fk FOREIGN KEY (store_id,attempted_by_membership_id)
    REFERENCES saas.memberships(store_id,id) ON DELETE RESTRICT,
  CHECK (updated_at>=attempted_at),
  CHECK (channel NOT IN ('email','whatsapp') OR consent_verified)
);

ALTER TABLE saas.analytics_delivery_outbox
  DROP CONSTRAINT analytics_delivery_outbox_kind_check,
  DROP CONSTRAINT analytics_delivery_outbox_payload_check,
  ALTER COLUMN order_id DROP NOT NULL,
  ADD COLUMN cart_id uuid,
  ADD COLUMN episode_id uuid,
  ADD COLUMN event_key text,
  ADD COLUMN occurred_at timestamptz,
  ADD COLUMN currency text CHECK (currency IS NULL OR currency ~ '^[A-Z]{3}$'),
  ADD COLUMN value_minor bigint CHECK (value_minor IS NULL OR value_minor >= 0),
  ADD CONSTRAINT analytics_delivery_outbox_kind_check CHECK (event_kind IN (
    'purchase','payment_failed','refund','order_cancelled','cart_abandoned','cart_resumed','cart_recovered',
    'recovery_message_queued','recovery_message_sent','recovery_message_failed'
  )),
  ADD CONSTRAINT analytics_delivery_outbox_payload_check CHECK (
    pg_catalog.jsonb_typeof(payload)='object' AND pg_catalog.pg_column_size(payload)<=2048
    AND NOT payload ?| ARRAY['orderId','orderNumber','storeId','cartId','checkoutId','customerId','customer','name','email','phone','address','websiteId','provider','token','recoveryToken','note']
  ),
  ADD CONSTRAINT analytics_delivery_outbox_cart_store_fk FOREIGN KEY (store_id,cart_id)
    REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT analytics_delivery_outbox_episode_store_fk FOREIGN KEY (store_id,episode_id)
    REFERENCES saas.abandoned_cart_episodes(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT analytics_delivery_outbox_store_event_key UNIQUE (store_id,event_key),
  ADD CONSTRAINT analytics_delivery_outbox_entity_check CHECK (order_id IS NOT NULL OR cart_id IS NOT NULL);

UPDATE saas.analytics_delivery_outbox SET
  event_key=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('purchase:order:'||order_id::text,'UTF8')),'hex'),
  occurred_at=created_at,
  currency=payload->>'currency',
  value_minor=(payload->>'valueCents')::bigint;

CREATE FUNCTION saas.ensure_analytics_event_metadata()
RETURNS trigger LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF NEW.event_key IS NULL AND NEW.event_kind='purchase' AND NEW.order_id IS NOT NULL THEN
    NEW.event_key:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to('purchase:order:'||NEW.order_id::text,'UTF8')),'hex');
  END IF;
  IF NEW.occurred_at IS NULL THEN NEW.occurred_at:=NEW.created_at; END IF;
  IF NEW.currency IS NULL AND NEW.payload ? 'currency' THEN NEW.currency:=NEW.payload->>'currency'; END IF;
  IF NEW.value_minor IS NULL AND NEW.payload ? 'valueCents' THEN NEW.value_minor:=(NEW.payload->>'valueCents')::bigint; END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER analytics_delivery_outbox_event_metadata
BEFORE INSERT ON saas.analytics_delivery_outbox FOR EACH ROW EXECUTE FUNCTION saas.ensure_analytics_event_metadata();

ALTER TABLE saas.analytics_delivery_outbox
  ALTER COLUMN event_key SET NOT NULL,
  ALTER COLUMN occurred_at SET NOT NULL;

CREATE INDEX store_analytics_hostnames_lookup_idx ON saas.store_analytics_hostnames(hostname,environment) WHERE active;
CREATE INDEX abandoned_carts_lifecycle_evaluation_idx ON saas.abandoned_carts(store_id,lifecycle_status,last_activity_at,id)
  WHERE lifecycle_status IN ('active','resumed','candidate','abandoned','converted_pending_payment');
CREATE INDEX abandoned_cart_episodes_store_abandoned_idx ON saas.abandoned_cart_episodes(store_id,abandoned_at DESC,id) WHERE abandoned_at IS NOT NULL;
CREATE INDEX abandoned_cart_recovery_tokens_resolve_idx ON saas.abandoned_cart_recovery_tokens(hostname,token_digest,expires_at) WHERE revoked_at IS NULL;
CREATE INDEX abandoned_cart_recovery_attempts_episode_idx ON saas.abandoned_cart_recovery_attempts(store_id,episode_id,attempted_at,id);
CREATE INDEX analytics_delivery_outbox_operational_idx ON saas.analytics_delivery_outbox(store_id,status,next_attempt_at,created_at,id);
CREATE INDEX order_commerce_attribution_source_idx ON saas.order_commerce_attribution(store_id,last_touch_source,last_touch_medium,last_touch_campaign,order_id);

ALTER TABLE saas.store_analytics_hostnames ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_analytics_hostnames FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.store_commerce_analytics_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_commerce_analytics_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_cart_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_cart_attribution FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_commerce_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_commerce_attribution FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_episodes FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_recovery_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_recovery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_recovery_attempts FORCE ROW LEVEL SECURITY;

-- Keep one Umami website per store while projecting every active storefront
-- hostname into a server-owned allowlist. Admin hostnames are held in a
-- different table and therefore cannot enter this projection.
CREATE OR REPLACE FUNCTION saas.analytics_connection_is_current(p_connection_id uuid,p_now timestamptz)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT p_now IS NOT NULL AND EXISTS(
    SELECT 1 FROM saas.store_analytics_connections connection
    JOIN saas.stores store ON store.id=connection.store_id AND store.status='active'
    JOIN saas.store_domains domain ON domain.store_id=connection.store_id AND domain.status='active' AND domain.verified_at<=p_now
    JOIN saas.subscriptions subscription ON subscription.store_id=connection.store_id AND subscription.status='active'
      AND subscription.valid_from<=p_now AND (subscription.valid_until IS NULL OR subscription.valid_until>p_now)
    JOIN saas.plans plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
      AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR plan.valid_until>p_now)
    JOIN saas.plan_features feature ON feature.plan_id=plan.id AND feature.feature_key='analytics' AND feature.enabled
    WHERE connection.id=p_connection_id AND connection.status='active'
  )
$function$;

CREATE FUNCTION saas.commerce_analytics_reconcile_hostnames(p_store_id uuid,p_now timestamptz,p_environment text)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_connection saas.store_analytics_connections%ROWTYPE; active_count integer;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_environment NOT IN ('staging','production') THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT connection.* INTO selected_connection FROM saas.store_analytics_connections connection
    JOIN saas.stores store ON store.id=connection.store_id AND store.status='active'
    WHERE connection.store_id=p_store_id AND connection.status='active' FOR UPDATE OF connection;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_configured',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.store_analytics_hostnames(id,store_id,connection_id,hostname,environment,source,active,reconciled_at)
  SELECT pg_catalog.gen_random_uuid(),domain.store_id,selected_connection.id,domain.hostname,p_environment,
    CASE WHEN domain.is_primary THEN 'primary' WHEN domain.hostname_type='custom_domain' THEN 'custom' ELSE 'fallback' END,true,p_now
  FROM saas.store_domains domain
  WHERE domain.store_id=p_store_id AND domain.status='active' AND domain.verified_at<=p_now
  ON CONFLICT(store_id,hostname,environment) DO UPDATE SET connection_id=EXCLUDED.connection_id,
    source=EXCLUDED.source,active=true,reconciled_at=EXCLUDED.reconciled_at;
  UPDATE saas.store_analytics_hostnames projected SET active=false,reconciled_at=p_now
    WHERE projected.store_id=p_store_id AND projected.environment=p_environment AND projected.active
      AND NOT EXISTS(SELECT 1 FROM saas.store_domains domain WHERE domain.store_id=p_store_id
        AND domain.hostname=projected.hostname AND domain.status='active' AND domain.verified_at<=p_now);
  SELECT COUNT(*) INTO active_count FROM saas.store_analytics_hostnames
    WHERE store_id=p_store_id AND connection_id=selected_connection.id AND environment=p_environment AND active;
  UPDATE saas.store_analytics_connections SET last_reconciled_at=p_now,
    safe_error_code=CASE WHEN active_count=0 THEN 'hostname_not_found' ELSE NULL END,version=version+1,updated_at=p_now
    WHERE id=selected_connection.id;
  RETURN QUERY SELECT CASE WHEN active_count=0 THEN 'hostname_not_found' ELSE 'reconciled' END,
    pg_catalog.jsonb_build_object('websitePreserved',true,'activeHostnameCount',active_count,'environment',p_environment);
END
$function$;

CREATE FUNCTION saas.commerce_analytics_reconcile_all_hostnames(p_now timestamptz,p_environment text,p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected record; reconciled integer:=0;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_environment NOT IN ('staging','production') OR p_limit NOT BETWEEN 1 AND 500 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  FOR selected IN SELECT connection.store_id FROM saas.store_analytics_connections connection
    WHERE connection.status='active' ORDER BY connection.store_id FOR UPDATE SKIP LOCKED LIMIT p_limit
  LOOP
    PERFORM * FROM saas.commerce_analytics_reconcile_hostnames(selected.store_id,p_now,p_environment);
    reconciled:=reconciled+1;
  END LOOP;
  RETURN QUERY SELECT 'reconciled',pg_catalog.jsonb_build_object('stores',reconciled,'environment',p_environment);
END
$function$;

INSERT INTO saas.store_analytics_hostnames(id,store_id,connection_id,hostname,environment,source,active,reconciled_at)
SELECT pg_catalog.gen_random_uuid(),domain.store_id,connection.id,domain.hostname,
  CASE WHEN domain.hostname LIKE '%.saas-staging.celebix.site' THEN 'staging' ELSE 'production' END,
  CASE WHEN domain.is_primary THEN 'primary' WHEN domain.hostname_type='custom_domain' THEN 'custom' ELSE 'fallback' END,
  true,CURRENT_TIMESTAMP
FROM saas.store_analytics_connections connection JOIN saas.store_domains domain ON domain.store_id=connection.store_id
WHERE connection.status='active' AND domain.status='active' AND domain.verified_at<=CURRENT_TIMESTAMP
ON CONFLICT(store_id,hostname,environment) DO NOTHING;

CREATE OR REPLACE FUNCTION saas.analytics_connection_get_for_host(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE connection_row saas.store_analytics_connections%ROWTYPE;
BEGIN
  IF p_now IS NULL OR p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname) OR pg_catalog.char_length(p_hostname) NOT BETWEEN 3 AND 253
    OR p_hostname~'[*:/?#@[:space:][:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT connection.* INTO connection_row FROM saas.store_analytics_hostnames hostname
    JOIN saas.store_analytics_connections connection ON connection.id=hostname.connection_id AND connection.store_id=hostname.store_id
    WHERE hostname.hostname=p_hostname AND hostname.active AND connection.status='active'
      AND saas.analytics_connection_is_current(connection.id,p_now)
    ORDER BY hostname.reconciled_at DESC,hostname.id DESC LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('websiteId',connection_row.website_id,'hostname',p_hostname); END IF;
END
$function$;

CREATE FUNCTION saas.commerce_analytics_settings_for_store(p_store_id uuid,p_now timestamptz)
RETURNS saas.store_commerce_analytics_settings
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected saas.store_commerce_analytics_settings%ROWTYPE;
BEGIN
  INSERT INTO saas.store_commerce_analytics_settings(store_id,created_at,updated_at)
  VALUES(p_store_id,p_now,p_now) ON CONFLICT(store_id) DO NOTHING;
  SELECT * INTO selected FROM saas.store_commerce_analytics_settings WHERE store_id=p_store_id;
  RETURN selected;
END
$function$;

CREATE FUNCTION saas.commerce_attribution_valid(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
DECLARE root_keys text[]; touch_value jsonb; touch_keys text[];
BEGIN
  IF p_value IS NULL OR pg_catalog.jsonb_typeof(p_value)<>'object' OR pg_catalog.pg_column_size(p_value)>1024 THEN RETURN false; END IF;
  SELECT pg_catalog.array_agg(key ORDER BY key) INTO root_keys FROM pg_catalog.jsonb_object_keys(p_value) key;
  IF root_keys<>ARRAY['deviceGroup','firstTouch','landingPathGroup','lastTouch']::text[]
    AND root_keys<>ARRAY['deviceGroup','firstTouch','landingPathGroup','lastTouch','referrerHost']::text[] THEN RETURN false; END IF;
  IF p_value->>'deviceGroup' NOT IN ('desktop','mobile','tablet','unknown')
    OR p_value->>'landingPathGroup'!~'^/[a-z0-9/_-]{0,127}$'
    OR (p_value ? 'referrerHost' AND (p_value->>'referrerHost'<>pg_catalog.lower(p_value->>'referrerHost')
      OR p_value->>'referrerHost'!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')) THEN RETURN false; END IF;
  FOR touch_value IN SELECT value FROM pg_catalog.jsonb_array_elements(pg_catalog.jsonb_build_array(p_value->'firstTouch',p_value->'lastTouch')) LOOP
    IF pg_catalog.jsonb_typeof(touch_value)<>'object' THEN RETURN false; END IF;
    SELECT pg_catalog.array_agg(key ORDER BY key) INTO touch_keys FROM pg_catalog.jsonb_object_keys(touch_value) key;
    IF (touch_keys<>ARRAY['medium','source']::text[] AND touch_keys<>ARRAY['campaign','medium','source']::text[])
      OR touch_value->>'source'!~'^[[:alnum:]][[:alnum:] ._+/-]{0,127}$'
      OR touch_value->>'medium'!~'^[[:alnum:]][[:alnum:] ._+/-]{0,127}$'
      OR (touch_value ? 'campaign' AND touch_value->>'campaign'!~'^[[:alnum:]][[:alnum:] ._+/-]{0,127}$')
      OR touch_value::text~*'(@|https?://|www\.|token[[:space:]]*=|([0-9][ -]?){13,19})' THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END
$function$;

CREATE FUNCTION saas.public_cart_attribution_record(p_hostname text,p_now timestamptz,p_candidates jsonb,p_attribution jsonb)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_store uuid; selected_cart uuid;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_candidates,false) OR NOT saas.commerce_attribution_valid(p_attribution) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT cart.id INTO selected_cart FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_candidates) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store AND cart.status='active' AND cart.expires_at>p_now
    ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
  IF selected_cart IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.storefront_cart_attribution(store_id,cart_id,first_touch_source,first_touch_medium,first_touch_campaign,
    last_touch_source,last_touch_medium,last_touch_campaign,referrer_host,landing_path_group,device_group,created_at,updated_at)
  VALUES(selected_store,selected_cart,p_attribution->'firstTouch'->>'source',p_attribution->'firstTouch'->>'medium',p_attribution->'firstTouch'->>'campaign',
    p_attribution->'lastTouch'->>'source',p_attribution->'lastTouch'->>'medium',p_attribution->'lastTouch'->>'campaign',p_attribution->>'referrerHost',p_attribution->>'landingPathGroup',p_attribution->>'deviceGroup',p_now,p_now)
  ON CONFLICT(store_id,cart_id) DO UPDATE SET
    last_touch_source=CASE WHEN EXCLUDED.last_touch_source NOT IN ('direct','unknown') THEN EXCLUDED.last_touch_source ELSE storefront_cart_attribution.last_touch_source END,
    last_touch_medium=CASE WHEN EXCLUDED.last_touch_source NOT IN ('direct','unknown') THEN EXCLUDED.last_touch_medium ELSE storefront_cart_attribution.last_touch_medium END,
    last_touch_campaign=CASE WHEN EXCLUDED.last_touch_source NOT IN ('direct','unknown') THEN EXCLUDED.last_touch_campaign ELSE storefront_cart_attribution.last_touch_campaign END,
    referrer_host=COALESCE(EXCLUDED.referrer_host,storefront_cart_attribution.referrer_host),landing_path_group=EXCLUDED.landing_path_group,
    device_group=EXCLUDED.device_group,updated_at=p_now;
  PERFORM saas.sync_durable_abandoned_cart(selected_store,selected_cart,p_now);
  UPDATE saas.abandoned_carts abandoned SET
    first_touch_source=attribution.first_touch_source,first_touch_medium=attribution.first_touch_medium,first_touch_campaign=attribution.first_touch_campaign,
    last_touch_source=attribution.last_touch_source,last_touch_medium=attribution.last_touch_medium,last_touch_campaign=attribution.last_touch_campaign,
    referrer_host=attribution.referrer_host,landing_path_group=attribution.landing_path_group,device_group=attribution.device_group,
    anonymous_session_ref='h1_'||pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(selected_store::text||':'||selected_cart::text,'UTF8')),'hex'),updated_at=GREATEST(abandoned.updated_at,p_now)
  FROM saas.storefront_cart_attribution attribution
  WHERE abandoned.store_id=selected_store AND abandoned.source_cart_id=selected_cart AND attribution.store_id=selected_store AND attribution.cart_id=selected_cart;
  RETURN QUERY SELECT 'recorded',pg_catalog.jsonb_build_object();
END
$function$;

CREATE FUNCTION saas.capture_order_commerce_attribution()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF NEW.recovered_order_id IS NOT NULL AND NEW.source_cart_id IS NOT NULL
    AND (TG_OP='INSERT' OR OLD.recovered_order_id IS DISTINCT FROM NEW.recovered_order_id) THEN
    INSERT INTO saas.order_commerce_attribution(store_id,order_id,source_cart_id,first_touch_source,first_touch_medium,first_touch_campaign,
      last_touch_source,last_touch_medium,last_touch_campaign,referrer_host,landing_path_group,device_group,captured_at)
    SELECT NEW.store_id,NEW.recovered_order_id,NEW.source_cart_id,attribution.first_touch_source,attribution.first_touch_medium,attribution.first_touch_campaign,
      attribution.last_touch_source,attribution.last_touch_medium,attribution.last_touch_campaign,attribution.referrer_host,attribution.landing_path_group,attribution.device_group,NEW.updated_at
    FROM saas.storefront_cart_attribution attribution WHERE attribution.store_id=NEW.store_id AND attribution.cart_id=NEW.source_cart_id
    ON CONFLICT(store_id,order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER abandoned_carts_capture_order_attribution
AFTER INSERT OR UPDATE OF recovered_order_id ON saas.abandoned_carts FOR EACH ROW EXECUTE FUNCTION saas.capture_order_commerce_attribution();

CREATE FUNCTION saas.commerce_analytics_enqueue_cart_event(
  p_store_id uuid,p_cart_id uuid,p_episode_id uuid,p_event_kind text,p_event_key text,
  p_currency text,p_value_minor bigint,p_now timestamptz
) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE safe_payload jsonb;
BEGIN
  safe_payload:=pg_catalog.jsonb_build_object('schemaVersion',1,'currency',p_currency,'valueMinor',p_value_minor);
  INSERT INTO saas.analytics_delivery_outbox(
    id,store_id,order_id,cart_id,episode_id,connection_id,website_id,event_kind,event_key,
    occurred_at,currency,value_minor,payload,payload_digest,status,attempt_count,next_attempt_at,created_at,updated_at
  ) SELECT pg_catalog.gen_random_uuid(),p_store_id,NULL,p_cart_id,p_episode_id,c.id,c.website_id,p_event_kind,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(p_event_key,'UTF8')),'hex'),
    p_now,p_currency,p_value_minor,safe_payload,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(safe_payload::text,'UTF8')),'hex'),
    'pending',0,p_now,p_now,p_now
  FROM saas.store_analytics_connections c
  WHERE c.store_id=p_store_id AND c.status='active' AND saas.analytics_connection_is_current(c.id,p_now)
  ON CONFLICT(store_id,event_key) DO NOTHING;
END
$function$;

CREATE FUNCTION saas.commerce_analytics_enqueue_order_event()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_kind text; safe_payload jsonb; safe_event_key text;
BEGIN
  IF NEW.payment_status='failed' AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM 'failed') THEN selected_kind:='payment_failed';
  ELSIF NEW.payment_status='refunded' AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM 'refunded') THEN selected_kind:='refund';
  ELSIF NEW.status='cancelled' AND (TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'cancelled') THEN selected_kind:='order_cancelled';
  ELSE RETURN NEW; END IF;
  safe_payload:=pg_catalog.jsonb_build_object('schemaVersion',1,'currency',NEW.currency,'valueMinor',NEW.total_cents);
  safe_event_key:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(selected_kind||':'||NEW.id::text||':'||NEW.version::text,'UTF8')),'hex');
  INSERT INTO saas.analytics_delivery_outbox(
    id,store_id,order_id,cart_id,episode_id,connection_id,website_id,event_kind,event_key,
    occurred_at,currency,value_minor,payload,payload_digest,status,attempt_count,next_attempt_at,created_at,updated_at
  ) SELECT pg_catalog.gen_random_uuid(),NEW.store_id,NEW.id,NULL,NULL,connection.id,connection.website_id,selected_kind,safe_event_key,
    NEW.updated_at,NEW.currency,NEW.total_cents,safe_payload,
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(safe_payload::text,'UTF8')),'hex'),
    'pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at
  FROM saas.store_analytics_connections connection
  WHERE connection.store_id=NEW.store_id AND connection.status='active' AND saas.analytics_connection_is_current(connection.id,NEW.updated_at)
  ON CONFLICT(store_id,event_key) DO NOTHING;
  RETURN NEW;
END
$function$;
CREATE TRIGGER orders_enqueue_commerce_analytics_lifecycle
AFTER INSERT OR UPDATE OF payment_status,status ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.commerce_analytics_enqueue_order_event();

CREATE FUNCTION saas.commerce_analytics_evaluate_carts(p_now timestamptz,p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected record; settings saas.store_commerce_analytics_settings%ROWTYPE; episode_id uuid; episode_number integer; candidates integer:=0; abandoned integer:=0; resumed integer:=0;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_limit NOT BETWEEN 1 AND 500 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  FOR selected IN
    SELECT cart.* FROM saas.abandoned_carts cart JOIN saas.stores store ON store.id=cart.store_id AND store.status='active'
    WHERE cart.lifecycle_status IN ('active','resumed','candidate','abandoned')
      AND (cart.expires_at IS NULL OR cart.expires_at>p_now)
    ORDER BY cart.last_activity_at,cart.id FOR UPDATE OF cart SKIP LOCKED LIMIT p_limit
  LOOP
    settings:=saas.commerce_analytics_settings_for_store(selected.store_id,p_now);
    IF NOT EXISTS(SELECT 1 FROM saas.abandoned_cart_items item WHERE item.store_id=selected.store_id AND item.cart_id=selected.id) THEN CONTINUE; END IF;
    IF selected.lifecycle_status='abandoned' AND EXISTS(
      SELECT 1 FROM saas.abandoned_cart_episodes prior
      WHERE prior.store_id=selected.store_id AND prior.cart_id=selected.id AND prior.abandoned_at IS NOT NULL
        AND prior.resumed_at IS NULL AND selected.last_activity_at>prior.abandoned_at
    ) THEN
      UPDATE saas.abandoned_carts SET lifecycle_status='resumed',version=version+1,updated_at=p_now WHERE store_id=selected.store_id AND id=selected.id;
      UPDATE saas.abandoned_cart_episodes SET resumed_at=p_now,updated_at=p_now WHERE store_id=selected.store_id AND cart_id=selected.id AND resumed_at IS NULL AND recovered_at IS NULL;
      SELECT episode.id INTO episode_id FROM saas.abandoned_cart_episodes episode WHERE episode.store_id=selected.store_id AND episode.cart_id=selected.id ORDER BY episode.episode_number DESC LIMIT 1;
      PERFORM saas.commerce_analytics_enqueue_cart_event(selected.store_id,selected.id,episode_id,'cart_resumed','cart_resumed:'||episode_id::text,selected.currency,selected.total_cents,p_now);
      resumed:=resumed+1; CONTINUE;
    END IF;
    IF selected.lifecycle_status IN ('active','resumed') AND selected.last_activity_at<=p_now-pg_catalog.make_interval(mins=>settings.candidate_minutes) THEN
      SELECT COALESCE(MAX(e.episode_number),0)+1 INTO episode_number FROM saas.abandoned_cart_episodes e WHERE e.store_id=selected.store_id AND e.cart_id=selected.id;
      episode_id:=pg_catalog.gen_random_uuid();
      INSERT INTO saas.abandoned_cart_episodes(id,store_id,cart_id,episode_number,candidate_at,currency,value_minor,first_touch,last_touch,created_at,updated_at)
      VALUES(episode_id,selected.store_id,selected.id,episode_number,p_now,selected.currency,selected.total_cents,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('source',selected.first_touch_source,'medium',selected.first_touch_medium,'campaign',selected.first_touch_campaign)),
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('source',selected.last_touch_source,'medium',selected.last_touch_medium,'campaign',selected.last_touch_campaign)),p_now,p_now);
      UPDATE saas.abandoned_carts SET lifecycle_status='candidate',candidate_at=p_now,version=version+1,updated_at=p_now WHERE store_id=selected.store_id AND id=selected.id;
      candidates:=candidates+1; CONTINUE;
    END IF;
    IF selected.lifecycle_status='candidate' AND selected.last_activity_at<=p_now-pg_catalog.make_interval(hours=>settings.abandoned_hours) THEN
      SELECT episode.id INTO episode_id FROM saas.abandoned_cart_episodes episode WHERE episode.store_id=selected.store_id AND episode.cart_id=selected.id AND episode.abandoned_at IS NULL ORDER BY episode.episode_number DESC LIMIT 1 FOR UPDATE;
      IF episode_id IS NOT NULL THEN
        UPDATE saas.abandoned_cart_episodes SET abandoned_at=p_now,updated_at=p_now WHERE store_id=selected.store_id AND id=episode_id;
        UPDATE saas.abandoned_carts SET lifecycle_status='abandoned',status='abandoned',abandoned_at=p_now,version=version+1,updated_at=p_now WHERE store_id=selected.store_id AND id=selected.id;
        PERFORM saas.commerce_analytics_enqueue_cart_event(selected.store_id,selected.id,episode_id,'cart_abandoned','cart_abandoned:'||episode_id::text,selected.currency,selected.total_cents,p_now);
        abandoned:=abandoned+1;
      END IF;
    END IF;
  END LOOP;
  RETURN QUERY SELECT 'evaluated',pg_catalog.jsonb_build_object('candidate',candidates,'abandoned',abandoned,'resumed',resumed,'asOf',p_now);
END
$function$;

CREATE FUNCTION saas.sync_commerce_analytics_paid_recovery()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected record;
BEGIN
  IF NEW.payment_status='completed' AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM 'completed') THEN
    FOR selected IN SELECT cart.store_id,cart.id,cart.currency,cart.total_cents,episode.id AS episode_id
      FROM saas.abandoned_carts cart JOIN saas.abandoned_cart_episodes episode
        ON episode.store_id=cart.store_id AND episode.cart_id=cart.id AND episode.abandoned_at IS NOT NULL AND episode.recovered_at IS NULL
      WHERE cart.store_id=NEW.store_id AND cart.recovered_order_id=NEW.id FOR UPDATE OF cart,episode
    LOOP
      UPDATE saas.abandoned_carts SET lifecycle_status='recovered',status='recovered',
        abandoned_at=COALESCE(abandoned_at,NEW.updated_at),recovered_at=NEW.updated_at,version=version+1,updated_at=NEW.updated_at
        WHERE store_id=selected.store_id AND id=selected.id;
      UPDATE saas.abandoned_cart_episodes SET recovered_at=NEW.updated_at,linked_order_id=NEW.id,updated_at=NEW.updated_at
        WHERE store_id=selected.store_id AND id=selected.episode_id;
      UPDATE saas.abandoned_cart_recovery_tokens SET converted_at=NEW.updated_at,revoked_at=COALESCE(revoked_at,NEW.updated_at)
        WHERE store_id=selected.store_id AND cart_id=selected.id AND converted_at IS NULL;
      PERFORM saas.commerce_analytics_enqueue_cart_event(selected.store_id,selected.id,selected.episode_id,'cart_recovered','cart_recovered:'||selected.episode_id::text,selected.currency,NEW.total_cents,NEW.updated_at);
    END LOOP;
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER orders_sync_commerce_analytics_paid_recovery
AFTER INSERT OR UPDATE OF payment_status ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.sync_commerce_analytics_paid_recovery();

CREATE FUNCTION saas.analytics_outbox_claim_v2(p_now timestamptz,p_limit integer,p_lease interval)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE claimed jsonb;
BEGIN
  IF p_now IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_lease<interval '5 seconds' OR p_lease>interval '15 minutes' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  WITH candidates AS (
    SELECT outbox.id FROM saas.analytics_delivery_outbox outbox
    WHERE (outbox.status='pending' AND outbox.next_attempt_at<=p_now) OR (outbox.status='processing' AND outbox.lease_expires_at<=p_now)
    ORDER BY outbox.next_attempt_at,outbox.created_at,outbox.id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), updated AS (
    UPDATE saas.analytics_delivery_outbox outbox SET status='processing',attempt_count=outbox.attempt_count+1,
      lease_token=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.gen_random_uuid()::text||':'||outbox.id::text||':'||p_now::text,'UTF8')),'hex'),
      lease_expires_at=p_now+p_lease,updated_at=p_now FROM candidates WHERE outbox.id=candidates.id AND outbox.attempt_count<10 RETURNING outbox.*
  ) SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'eventId',u.id,'leaseToken',u.lease_token,'websiteId',u.website_id,'hostname',connection.hostname,
      'attemptCount',u.attempt_count,'payload',pg_catalog.jsonb_build_object('name',u.event_kind)||u.payload
    ) ORDER BY u.created_at,u.id),'[]'::jsonb) INTO claimed
    FROM updated u JOIN saas.store_analytics_connections connection ON connection.id=u.connection_id;
  RETURN QUERY SELECT 'claimed',claimed;
END
$function$;

-- Rolling-release compatibility: an old worker understands purchase payloads
-- only, so its established function deliberately skips every v2 event kind.
CREATE OR REPLACE FUNCTION saas.analytics_outbox_claim(p_now timestamptz,p_limit integer,p_lease interval)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE claimed jsonb;
BEGIN
  IF p_now IS NULL OR p_limit NOT BETWEEN 1 AND 100 OR p_lease<interval '5 seconds' OR p_lease>interval '15 minutes' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  WITH candidates AS (
    SELECT outbox.id FROM saas.analytics_delivery_outbox outbox
    WHERE outbox.event_kind='purchase' AND ((outbox.status='pending' AND outbox.next_attempt_at<=p_now) OR (outbox.status='processing' AND outbox.lease_expires_at<=p_now))
    ORDER BY outbox.next_attempt_at,outbox.created_at,outbox.id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), updated AS (
    UPDATE saas.analytics_delivery_outbox outbox SET status='processing',attempt_count=outbox.attempt_count+1,
      lease_token=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.gen_random_uuid()::text||':'||outbox.id::text||':'||p_now::text,'UTF8')),'hex'),
      lease_expires_at=p_now+p_lease,updated_at=p_now FROM candidates WHERE outbox.id=candidates.id AND outbox.attempt_count<10 RETURNING outbox.*
  ) SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'eventId',u.id,'leaseToken',u.lease_token,'websiteId',u.website_id,'hostname',connection.hostname,
      'attemptCount',u.attempt_count,'payload',pg_catalog.jsonb_build_object('name','purchase')||u.payload
    ) ORDER BY u.created_at,u.id),'[]'::jsonb) INTO claimed
    FROM updated u JOIN saas.store_analytics_connections connection ON connection.id=u.connection_id;
  RETURN QUERY SELECT 'claimed',claimed;
END
$function$;

CREATE FUNCTION saas.analytics_outbox_requeue_dead_letter(p_event_id uuid,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF p_event_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.analytics_delivery_outbox SET status='pending',attempt_count=0,next_attempt_at=p_now,
    lease_token=NULL,lease_expires_at=NULL,last_error_code=NULL,updated_at=p_now
  WHERE id=p_event_id AND status='failed';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'requeued',pg_catalog.jsonb_build_object();
END
$function$;

CREATE FUNCTION saas.commerce_analytics_worker_status(p_store_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'pending',COUNT(*) FILTER(WHERE status='pending'),'claimed',COUNT(*) FILTER(WHERE status='processing'),
    'retry',COUNT(*) FILTER(WHERE status='pending' AND attempt_count>0),'deadLetter',COUNT(*) FILTER(WHERE status='failed'),
    'oldestPendingSeconds',COALESCE(EXTRACT(EPOCH FROM p_now-MIN(created_at) FILTER(WHERE status='pending'))::bigint,0),
    'lastSuccessfulDelivery',CASE WHEN MAX(delivered_at) IS NULL THEN NULL ELSE saas.merchant_admin_timestamp(MAX(delivered_at)) END,
    'deliveryLatencyMilliseconds',COALESCE(AVG(EXTRACT(EPOCH FROM delivered_at-created_at)*1000) FILTER(WHERE delivered_at IS NOT NULL)::bigint,0)
  ) FROM saas.analytics_delivery_outbox WHERE store_id=p_store_id
$function$;

CREATE FUNCTION saas.commerce_analytics_settings_update(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_now timestamptz,p_expected_version bigint,p_candidate_minutes integer,p_abandoned_hours integer,
  p_recovery_link_hours integer,p_automatic_recovery_enabled boolean,p_maximum_message_attempts integer,
  p_minimum_message_interval_hours integer,p_tracking_policy text
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; current_version bigint;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_expected_version<1 OR p_candidate_minutes NOT BETWEEN 15 AND 360 OR p_abandoned_hours NOT BETWEEN 1 AND 168
    OR p_abandoned_hours*60<=p_candidate_minutes OR p_recovery_link_hours NOT BETWEEN 1 AND 168
    OR p_maximum_message_attempts NOT BETWEEN 1 AND 3 OR p_minimum_message_interval_hours NOT BETWEEN 6 AND 168
    OR p_tracking_policy NOT IN ('disabled','anonymous_commerce') OR p_automatic_recovery_enabled THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT version INTO current_version FROM saas.store_commerce_analytics_settings WHERE store_id=p_store_id FOR UPDATE;
  IF current_version IS NULL AND p_expected_version<>1 OR current_version IS NOT NULL AND current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.store_commerce_analytics_settings(store_id,candidate_minutes,abandoned_hours,recovery_link_hours,automatic_recovery_enabled,maximum_message_attempts,minimum_message_interval_hours,tracking_policy,version,created_at,updated_at)
  VALUES(p_store_id,p_candidate_minutes,p_abandoned_hours,p_recovery_link_hours,p_automatic_recovery_enabled,p_maximum_message_attempts,p_minimum_message_interval_hours,p_tracking_policy,p_expected_version+1,p_now,p_now)
  ON CONFLICT(store_id) DO UPDATE SET candidate_minutes=EXCLUDED.candidate_minutes,abandoned_hours=EXCLUDED.abandoned_hours,recovery_link_hours=EXCLUDED.recovery_link_hours,
    automatic_recovery_enabled=EXCLUDED.automatic_recovery_enabled,maximum_message_attempts=EXCLUDED.maximum_message_attempts,
    minimum_message_interval_hours=EXCLUDED.minimum_message_interval_hours,tracking_policy=EXCLUDED.tracking_policy,version=EXCLUDED.version,updated_at=EXCLUDED.updated_at;
  RETURN QUERY SELECT 'committed',pg_catalog.jsonb_build_object('candidateInactivityMinutes',p_candidate_minutes,'abandonedInactivityHours',p_abandoned_hours,
    'recoveryLinkHours',p_recovery_link_hours,'automaticRecoveryEnabled',p_automatic_recovery_enabled,'maximumMessageAttempts',p_maximum_message_attempts,
    'minimumMessageIntervalHours',p_minimum_message_interval_hours,'trackingPolicy',p_tracking_policy,'version',p_expected_version+1);
END
$function$;

CREATE FUNCTION saas.commerce_cart_recovery_link_issue(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_now timestamptz,p_cart_id uuid,p_token_id uuid,p_token_digest text,p_key_version integer
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected_cart saas.abandoned_carts%ROWTYPE; selected_episode saas.abandoned_cart_episodes%ROWTYPE;
  selected_hostname text; settings saas.store_commerce_analytics_settings%ROWTYPE; selected_expires_at timestamptz;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_cart_id IS NULL OR p_token_id IS NULL
    OR p_token_digest!~'^[0-9a-f]{64}$' OR p_key_version NOT BETWEEN 1 AND 1000
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_cart FROM saas.abandoned_carts WHERE store_id=p_store_id AND id=p_cart_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'cart_not_found',NULL::jsonb; RETURN; END IF;
  IF selected_cart.lifecycle_status<>'abandoned' OR selected_cart.source_cart_id IS NULL THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_episode FROM saas.abandoned_cart_episodes
    WHERE store_id=p_store_id AND cart_id=p_cart_id AND abandoned_at IS NOT NULL AND resumed_at IS NULL AND recovered_at IS NULL
    ORDER BY episode_number DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  SELECT domain.hostname INTO selected_hostname FROM saas.store_domains domain
    WHERE domain.store_id=p_store_id AND domain.status='active' AND domain.is_primary
      AND saas.public_storefront_authorized(p_store_id,domain.hostname,p_now)
    ORDER BY domain.updated_at DESC,domain.id DESC LIMIT 1;
  IF selected_hostname IS NULL THEN RETURN QUERY SELECT 'store_inactive',NULL::jsonb; RETURN; END IF;
  settings:=saas.commerce_analytics_settings_for_store(p_store_id,p_now);
  selected_expires_at:=p_now+pg_catalog.make_interval(hours=>settings.recovery_link_hours);
  UPDATE saas.abandoned_cart_recovery_tokens SET revoked_at=p_now
    WHERE store_id=p_store_id AND cart_id=p_cart_id AND revoked_at IS NULL AND used_at IS NULL AND expires_at>p_now;
  INSERT INTO saas.abandoned_cart_recovery_tokens(
    id,store_id,cart_id,episode_id,token_digest,key_version,hostname,expires_at,created_by_membership_id,created_at
  ) VALUES(p_token_id,p_store_id,p_cart_id,selected_episode.id,p_token_digest,p_key_version,selected_hostname,selected_expires_at,p_membership_id,p_now);
  INSERT INTO saas.abandoned_cart_recovery_attempts(
    id,store_id,cart_id,episode_id,operation_id,channel,status,attempted_by_membership_id,attempted_at,updated_at
  ) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_cart_id,selected_episode.id,p_token_id,'link','recorded',p_membership_id,p_now,p_now);
  RETURN QUERY SELECT 'committed',pg_catalog.jsonb_build_object(
    'cartId',p_cart_id,'hostname',selected_hostname,'expiresAt',saas.merchant_admin_timestamp(selected_expires_at)
  );
END
$function$;

CREATE FUNCTION saas.public_cart_recovery_restore(
  p_hostname text,p_now timestamptz,p_token_digest text,p_cart_id uuid,p_key_id text,p_cart_digest text,p_cart_expires_at timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_token saas.abandoned_cart_recovery_tokens%ROWTYPE; selected_abandoned saas.abandoned_carts%ROWTYPE;
  copied integer:=0; omitted integer:=0;
BEGIN
  IF p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname) OR p_hostname!~'^[a-z0-9.-]{3,253}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_token_digest!~'^[0-9a-f]{64}$'
    OR p_cart_id IS NULL OR p_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$' OR p_cart_digest!~'^[0-9a-f]{64}$'
    OR p_cart_expires_at<=p_now OR p_cart_expires_at>p_now+interval '31 days'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT token.* INTO selected_token FROM saas.abandoned_cart_recovery_tokens token
    WHERE token.hostname=p_hostname AND token.token_digest=p_token_digest AND token.revoked_at IS NULL
      AND token.converted_at IS NULL AND token.expires_at>p_now
    ORDER BY token.created_at DESC,token.id DESC LIMIT 1 FOR UPDATE;
  IF NOT FOUND OR NOT saas.public_storefront_authorized(selected_token.store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_abandoned FROM saas.abandoned_carts
    WHERE store_id=selected_token.store_id AND id=selected_token.cart_id FOR UPDATE;
  IF NOT FOUND OR selected_abandoned.lifecycle_status NOT IN ('abandoned','resumed') THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected_token.used_at IS NOT NULL THEN
    IF selected_token.restored_cart_id<>p_cart_id OR NOT EXISTS(
      SELECT 1 FROM saas.storefront_carts cart JOIN saas.storefront_cart_credentials credential
        ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
      WHERE cart.store_id=selected_token.store_id AND cart.id=p_cart_id AND cart.status='active' AND cart.expires_at>p_now
        AND credential.key_id=p_key_id AND credential.credential_digest=p_cart_digest AND credential.expires_at>p_now
    ) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    RETURN QUERY SELECT 'restored',pg_catalog.jsonb_build_object(
      'cart',saas.storefront_cart_projection(selected_token.store_id,p_cart_id,p_now),
      'restoredItems',selected_token.restored_items,'omittedItems',selected_token.omitted_items
    ); RETURN;
  END IF;
  INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
    VALUES(p_cart_id,selected_token.store_id,'active',1,p_cart_expires_at,p_now,p_now);
  INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
    VALUES(p_cart_id,selected_token.store_id,p_key_id,p_cart_digest,p_cart_expires_at);
  INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)
  SELECT p_cart_id,item.store_id,item.product_id,item.variant_id,
    LEAST(item.quantity,CASE WHEN variant.stock_tracking THEN variant.stock_quantity ELSE item.quantity END,99),
    price.price_cents,pg_catalog.row_number() OVER(ORDER BY item.position,item.id)-1,p_now,p_now
  FROM saas.abandoned_cart_items item
  JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id AND product.status='active'
  JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id AND variant.status='active'
  JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) price ON price.outcome='found'
  WHERE item.store_id=selected_token.store_id AND item.cart_id=selected_token.cart_id
    AND (NOT variant.stock_tracking OR variant.stock_quantity>0)
  ORDER BY item.position,item.id;
  GET DIAGNOSTICS copied=ROW_COUNT;
  SELECT COUNT(*)-copied INTO omitted FROM saas.abandoned_cart_items item
    WHERE item.store_id=selected_token.store_id AND item.cart_id=selected_token.cart_id;
  IF copied=0 THEN RAISE EXCEPTION 'COMMERCE_RECOVERY_CART_EMPTY'; END IF;
  INSERT INTO saas.storefront_cart_attribution(store_id,cart_id,first_touch_source,first_touch_medium,first_touch_campaign,
    last_touch_source,last_touch_medium,last_touch_campaign,referrer_host,landing_path_group,device_group,created_at,updated_at)
  SELECT attribution.store_id,p_cart_id,attribution.first_touch_source,attribution.first_touch_medium,attribution.first_touch_campaign,
    attribution.last_touch_source,attribution.last_touch_medium,attribution.last_touch_campaign,attribution.referrer_host,
    attribution.landing_path_group,attribution.device_group,p_now,p_now
  FROM saas.storefront_cart_attribution attribution
  WHERE attribution.store_id=selected_token.store_id AND attribution.cart_id=selected_abandoned.source_cart_id
  ON CONFLICT(store_id,cart_id) DO NOTHING;
  UPDATE saas.abandoned_cart_recovery_tokens SET used_at=p_now,restored_cart_id=p_cart_id,restored_items=copied,omitted_items=omitted
    WHERE store_id=selected_token.store_id AND id=selected_token.id;
  UPDATE saas.abandoned_cart_episodes SET resumed_at=p_now,updated_at=p_now
    WHERE store_id=selected_token.store_id AND id=selected_token.episode_id AND resumed_at IS NULL;
  UPDATE saas.abandoned_carts SET source_cart_id=p_cart_id,public_cart_digest=p_cart_digest,status='active',lifecycle_status='resumed',
    abandoned_at=NULL,last_activity_at=p_now,version=version+1,updated_at=p_now
    WHERE store_id=selected_token.store_id AND id=selected_token.cart_id;
  PERFORM saas.commerce_analytics_enqueue_cart_event(selected_token.store_id,selected_token.cart_id,selected_token.episode_id,
    'cart_resumed','cart_resumed:'||selected_token.episode_id::text,selected_abandoned.currency,selected_abandoned.total_cents,p_now);
  RETURN QUERY SELECT 'restored',pg_catalog.jsonb_build_object(
    'cart',saas.storefront_cart_projection(selected_token.store_id,p_cart_id,p_now),'restoredItems',copied,'omittedItems',omitted
  );
EXCEPTION WHEN check_violation OR unique_violation OR foreign_key_violation THEN
  RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
WHEN raise_exception THEN
  IF SQLERRM='COMMERCE_RECOVERY_CART_EMPTY' THEN RETURN QUERY SELECT 'cart_empty',NULL::jsonb; ELSE RAISE; END IF;
END
$function$;

CREATE FUNCTION saas.commerce_cart_recovery_attempt_record(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_now timestamptz,p_cart_id uuid,p_operation_id uuid,p_channel text,p_note text
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected_episode uuid; existing saas.abandoned_cart_recovery_attempts%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_cart_id IS NULL OR p_operation_id IS NULL
    OR p_channel NOT IN ('contacted','note')
    OR (p_channel='contacted' AND p_note IS NOT NULL)
    OR (p_channel='note' AND (p_note IS NULL OR p_note<>pg_catalog.btrim(p_note) OR pg_catalog.char_length(p_note) NOT BETWEEN 1 AND 1000 OR p_note~'[[:cntrl:]]'))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.abandoned_cart_recovery_attempts WHERE store_id=p_store_id AND operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.cart_id<>p_cart_id OR existing.channel<>p_channel OR existing.note IS DISTINCT FROM p_note THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_build_object('cartId',p_cart_id,'kind',p_channel,
      'recordedAt',saas.merchant_admin_timestamp(existing.attempted_at),'replayed',true); END IF;
    RETURN;
  END IF;
  SELECT episode.id INTO selected_episode FROM saas.abandoned_carts cart JOIN saas.abandoned_cart_episodes episode
    ON episode.store_id=cart.store_id AND episode.cart_id=cart.id AND episode.abandoned_at IS NOT NULL AND episode.recovered_at IS NULL
    WHERE cart.store_id=p_store_id AND cart.id=p_cart_id AND cart.lifecycle_status IN ('abandoned','resumed')
    ORDER BY episode.episode_number DESC LIMIT 1 FOR UPDATE OF cart,episode;
  IF selected_episode IS NULL THEN
    IF EXISTS(SELECT 1 FROM saas.abandoned_carts WHERE id=p_cart_id AND store_id<>p_store_id) OR NOT EXISTS(SELECT 1 FROM saas.abandoned_carts WHERE id=p_cart_id) THEN
      RETURN QUERY SELECT 'cart_not_found',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; END IF;
    RETURN;
  END IF;
  INSERT INTO saas.abandoned_cart_recovery_attempts(
    id,store_id,cart_id,episode_id,operation_id,channel,status,consent_verified,note,attempted_by_membership_id,attempted_at,updated_at
  ) VALUES(pg_catalog.gen_random_uuid(),p_store_id,p_cart_id,selected_episode,p_operation_id,p_channel,'recorded',false,p_note,p_membership_id,p_now,p_now);
  RETURN QUERY SELECT 'committed',pg_catalog.jsonb_build_object('cartId',p_cart_id,'kind',p_channel,
    'recordedAt',saas.merchant_admin_timestamp(p_now),'replayed',false);
END
$function$;

CREATE FUNCTION saas.commerce_analytics_snapshot(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_now timestamptz,p_start_at timestamptz,p_end_at timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','analytics.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_start_at>=p_end_at OR p_end_at>p_now OR p_end_at-p_start_at>interval '13 months' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  RETURN QUERY WITH order_metrics AS (
    SELECT currency,COUNT(*) FILTER(WHERE payment_status IN ('completed','refunded')) AS paid,
      COALESCE(SUM(total_cents) FILTER(WHERE payment_status IN ('completed','refunded')),0) AS gross,
      COALESCE(SUM(total_cents) FILTER(WHERE payment_status='refunded'),0) AS refunded
    FROM saas.orders WHERE store_id=p_store_id AND created_at>=p_start_at AND created_at<p_end_at GROUP BY currency
  ), recovery AS (
    SELECT episode.currency,COUNT(*) FILTER(WHERE episode.abandoned_at IS NOT NULL) AS abandoned,
      COALESCE(SUM(episode.value_minor) FILTER(WHERE episode.abandoned_at IS NOT NULL),0) AS abandoned_value,
      COUNT(*) FILTER(WHERE episode.recovered_at IS NOT NULL) AS recovered,
      COALESCE(SUM(orders.total_cents) FILTER(WHERE episode.recovered_at IS NOT NULL AND orders.payment_status IN ('completed','refunded')),0) AS recovered_gross,
      COALESCE(SUM(orders.total_cents) FILTER(WHERE episode.recovered_at IS NOT NULL AND orders.payment_status='refunded'),0) AS recovered_refunded
    FROM saas.abandoned_cart_episodes episode LEFT JOIN saas.orders orders ON orders.store_id=episode.store_id AND orders.id=episode.linked_order_id
    WHERE episode.store_id=p_store_id AND episode.candidate_at>=p_start_at AND episode.candidate_at<p_end_at GROUP BY episode.currency
  ), cart_metrics AS (
    SELECT currency,
      COUNT(DISTINCT id) FILTER(WHERE lifecycle_status IN ('active','resumed') AND last_activity_at>=p_start_at AND last_activity_at<p_end_at) AS active,
      COUNT(DISTINCT id) FILTER(WHERE lifecycle_status='candidate' AND candidate_at>=p_start_at AND candidate_at<p_end_at) AS candidate,
      COUNT(DISTINCT id) FILTER(WHERE candidate_at>=p_start_at AND candidate_at<p_end_at) AS eligible,
      COUNT(DISTINCT id) FILTER(WHERE checkout_started_at>=p_start_at AND checkout_started_at<p_end_at) AS checkout_starts,
      COUNT(DISTINCT id) FILTER(WHERE checkout_started_at IS NOT NULL AND abandoned_at>=p_start_at AND abandoned_at<p_end_at) AS checkout_abandoned
    FROM saas.abandoned_carts WHERE store_id=p_store_id GROUP BY currency
  ), failure_metrics AS (
    SELECT currency,COUNT(*) AS failures FROM saas.analytics_delivery_outbox
    WHERE store_id=p_store_id AND event_kind='payment_failed' AND occurred_at>=p_start_at AND occurred_at<p_end_at GROUP BY currency
  ), currency_set AS (
    SELECT currency FROM order_metrics UNION SELECT currency FROM recovery UNION SELECT currency FROM cart_metrics UNION SELECT currency FROM failure_metrics
  ), currency_rows AS (
    SELECT currency_set.currency,COALESCE(cart_metrics.active,0) AS active,COALESCE(cart_metrics.candidate,0) AS candidate,
      COALESCE(cart_metrics.eligible,0) AS eligible,COALESCE(cart_metrics.checkout_starts,0) AS checkout_starts,
      COALESCE(cart_metrics.checkout_abandoned,0) AS checkout_abandoned,COALESCE(failure_metrics.failures,0) AS failures,
      COALESCE(order_metrics.paid,0) AS paid,COALESCE(order_metrics.gross,0) AS gross,COALESCE(order_metrics.refunded,0) AS refunded,
      COALESCE(recovery.abandoned,0) AS abandoned,COALESCE(recovery.abandoned_value,0) AS abandoned_value,
      COALESCE(recovery.recovered,0) AS recovered,COALESCE(recovery.recovered_gross,0) AS recovered_gross,
      COALESCE(recovery.recovered_refunded,0) AS recovered_refunded
    FROM currency_set LEFT JOIN order_metrics USING(currency) LEFT JOIN recovery USING(currency)
      LEFT JOIN cart_metrics USING(currency) LEFT JOIN failure_metrics USING(currency)
  ), attribution_facts AS (
    SELECT attribution.last_touch_source AS source,attribution.last_touch_medium AS medium,attribution.last_touch_campaign AS campaign,
      orders.currency,1::bigint AS paid,orders.total_cents AS gross,0::bigint AS abandoned,0::bigint AS recovered
    FROM saas.order_commerce_attribution attribution JOIN saas.orders orders ON orders.store_id=attribution.store_id AND orders.id=attribution.order_id
    WHERE attribution.store_id=p_store_id AND orders.created_at>=p_start_at AND orders.created_at<p_end_at AND orders.payment_status IN ('completed','refunded')
    UNION ALL
    SELECT COALESCE(cart.last_touch_source,'unknown'),COALESCE(cart.last_touch_medium,'unknown'),cart.last_touch_campaign,episode.currency,
      0,0,1,CASE WHEN episode.recovered_at IS NOT NULL AND orders.payment_status IN ('completed','refunded') THEN COALESCE(orders.total_cents,0) ELSE 0 END
    FROM saas.abandoned_cart_episodes episode JOIN saas.abandoned_carts cart ON cart.store_id=episode.store_id AND cart.id=episode.cart_id
      LEFT JOIN saas.orders orders ON orders.store_id=episode.store_id AND orders.id=episode.linked_order_id
    WHERE episode.store_id=p_store_id AND episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at
  ), attribution_rows AS (
    SELECT source,medium,campaign,currency,SUM(paid) AS paid,SUM(gross) AS gross,SUM(abandoned) AS abandoned,SUM(recovered) AS recovered
    FROM attribution_facts GROUP BY source,medium,campaign,currency
  ) SELECT 'resolved',pg_catalog.jsonb_build_object('schemaVersion',1,'rangeStart',saas.merchant_admin_timestamp(p_start_at),'rangeEnd',saas.merchant_admin_timestamp(p_end_at),'currencies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'currency',currency,'activeCarts',active,'candidateCarts',candidate,'eligibleCarts',eligible,'checkoutStarts',checkout_starts,
      'checkoutAbandoned',checkout_abandoned,'paymentFailures',failures,'paidOrders',paid,'grossRevenueMinor',gross,
      'refundedMinor',refunded,'abandonedCarts',abandoned,'abandonedValueMinor',abandoned_value,'recoveredCarts',recovered,
      'recoveredGrossMinor',recovered_gross,'recoveredRefundedMinor',recovered_refunded,'recoveredNetMinor',recovered_gross-recovered_refunded
    ) ORDER BY currency) FROM currency_rows),'[]'::jsonb),'attribution',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'source',source,'medium',medium,'campaign',campaign,'currency',currency,'paidOrders',paid,'grossRevenueMinor',gross,
      'abandonedCarts',abandoned,'recoveredRevenueMinor',recovered) ORDER BY source,medium,campaign,currency) FROM attribution_rows),'[]'::jsonb),
    'worker',saas.commerce_analytics_worker_status(p_store_id,p_now),
    'settings',COALESCE((SELECT pg_catalog.jsonb_build_object(
      'candidateInactivityMinutes',setting.candidate_minutes,'abandonedInactivityHours',setting.abandoned_hours,
      'recoveryLinkHours',setting.recovery_link_hours,'automaticRecoveryEnabled',setting.automatic_recovery_enabled,
      'maximumMessageAttempts',setting.maximum_message_attempts,'minimumMessageIntervalHours',setting.minimum_message_interval_hours,
      'trackingPolicy',setting.tracking_policy,'version',setting.version
    ) FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=p_store_id),
    pg_catalog.jsonb_build_object('candidateInactivityMinutes',30,'abandonedInactivityHours',24,'recoveryLinkHours',72,
      'automaticRecoveryEnabled',false,'maximumMessageAttempts',3,'minimumMessageIntervalHours',6,
      'trackingPolicy','anonymous_commerce','version',1)))
    FROM order_metrics FULL JOIN recovery ON recovery.currency=order_metrics.currency;
END
$function$;

REVOKE ALL ON saas.store_analytics_hostnames,saas.store_commerce_analytics_settings,saas.storefront_cart_attribution,saas.order_commerce_attribution,saas.abandoned_cart_episodes,
  saas.abandoned_cart_recovery_tokens,saas.abandoned_cart_recovery_attempts
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA saas FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_evaluate_carts(timestamptz,integer),saas.analytics_outbox_claim_v2(timestamptz,integer,interval),
  saas.analytics_outbox_requeue_dead_letter(uuid,timestamptz),
  saas.commerce_analytics_reconcile_all_hostnames(timestamptz,text,integer) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_settings_update(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,integer,integer,integer,boolean,integer,integer,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_cart_recovery_link_issue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,integer) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_cart_recovery_attempt_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.public_cart_recovery_restore(text,timestamptz,text,uuid,text,text,timestamptz) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_cart_attribution_record(text,timestamptz,jsonb,jsonb) TO celebix_saas_host_resolver;

COMMIT;
