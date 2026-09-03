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

-- Financial analytics is PostgreSQL order truth.  Delivery outbox rows are an
-- optional projection for Umami and must never decide whether revenue exists.
ALTER TABLE saas.orders
  ADD COLUMN paid_at timestamptz,
  ADD COLUMN refunded_at timestamptz,
  ADD CONSTRAINT orders_commerce_payment_timestamps_check CHECK (
    (paid_at IS NULL OR paid_at>=created_at)
    AND (refunded_at IS NULL OR (paid_at IS NOT NULL AND refunded_at>=paid_at))
  );

UPDATE saas.orders SET
  paid_at=CASE WHEN payment_status IN ('completed','refunded') THEN COALESCE((SELECT MIN(event.created_at) FROM saas.order_events event WHERE event.store_id=orders.store_id AND event.order_id=orders.id AND event.event_type='payment_transition' AND event.to_value='completed'),created_at) ELSE NULL END,
  refunded_at=CASE WHEN payment_status='refunded' THEN COALESCE((SELECT MIN(event.created_at) FROM saas.order_events event WHERE event.store_id=orders.store_id AND event.order_id=orders.id AND event.event_type='payment_transition' AND event.to_value='refunded'),created_at) ELSE NULL END;

CREATE FUNCTION saas.capture_order_commerce_payment_timestamps()
RETURNS trigger LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF NEW.payment_status IN ('completed','refunded') AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM NEW.payment_status) THEN
    NEW.paid_at:=COALESCE(OLD.paid_at,NEW.paid_at,GREATEST(NEW.created_at,NEW.updated_at));
  END IF;
  IF NEW.payment_status='refunded' AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM 'refunded') THEN
    NEW.refunded_at:=COALESCE(NEW.refunded_at,GREATEST(NEW.paid_at,NEW.updated_at));
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER orders_capture_commerce_payment_timestamps
BEFORE INSERT OR UPDATE OF payment_status ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.capture_order_commerce_payment_timestamps();

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
  anonymous_session_ref char(67) CHECK (anonymous_session_ref IS NULL OR anonymous_session_ref~'^h1_[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,cart_id),
  CONSTRAINT storefront_cart_attribution_cart_store_fk FOREIGN KEY(store_id,cart_id)
    REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
  CHECK (device_group IN ('desktop','mobile','tablet','unknown') AND updated_at>=created_at)
);

CREATE TABLE saas.storefront_intent_attribution (
  store_id uuid NOT NULL,
  intent_id uuid NOT NULL,
  first_touch_source text NOT NULL,
  first_touch_medium text NOT NULL,
  first_touch_campaign text,
  last_touch_source text NOT NULL,
  last_touch_medium text NOT NULL,
  last_touch_campaign text,
  referrer_host text,
  landing_path_group text NOT NULL,
  device_group text NOT NULL,
  anonymous_session_ref char(67) CHECK (anonymous_session_ref IS NULL OR anonymous_session_ref~'^h1_[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,intent_id),
  CONSTRAINT storefront_intent_attribution_intent_store_fk FOREIGN KEY(store_id,intent_id)
    REFERENCES saas.storefront_checkout_intents(store_id,id) ON DELETE RESTRICT,
  CHECK (device_group IN ('desktop','mobile','tablet','unknown'))
);

CREATE TABLE saas.order_commerce_attribution (
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  source_cart_id uuid,
  source_intent_id uuid,
  first_touch_source text NOT NULL,
  first_touch_medium text NOT NULL,
  first_touch_campaign text,
  last_touch_source text NOT NULL,
  last_touch_medium text NOT NULL,
  last_touch_campaign text,
  referrer_host text,
  landing_path_group text NOT NULL,
  device_group text NOT NULL,
  anonymous_session_ref char(67) CHECK (anonymous_session_ref IS NULL OR anonymous_session_ref~'^h1_[0-9a-f]{64}$'),
  captured_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,order_id),
  CONSTRAINT order_commerce_attribution_order_store_fk FOREIGN KEY(store_id,order_id)
    REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT order_commerce_attribution_cart_store_fk FOREIGN KEY(store_id,source_cart_id)
    REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT order_commerce_attribution_intent_store_fk FOREIGN KEY(store_id,source_intent_id)
    REFERENCES saas.storefront_checkout_intents(store_id,id) ON DELETE RESTRICT,
  CHECK ((source_cart_id IS NOT NULL)::integer+(source_intent_id IS NOT NULL)::integer=1)
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

UPDATE saas.abandoned_carts cart SET
  candidate_at=CASE WHEN cart.status IN ('abandoned','recovered')
    THEN COALESCE(cart.abandoned_at,cart.last_activity_at,cart.created_at) ELSE NULL END,
  lifecycle_status=CASE cart.status
    WHEN 'abandoned' THEN 'abandoned'
    WHEN 'recovered' THEN CASE
      WHEN EXISTS(SELECT 1 FROM saas.orders orders WHERE orders.store_id=cart.store_id AND orders.id=cart.recovered_order_id AND orders.payment_status IN ('completed','refunded')) THEN 'recovered'
      WHEN EXISTS(SELECT 1 FROM saas.orders orders WHERE orders.store_id=cart.store_id AND orders.id=cart.recovered_order_id) THEN 'converted_pending_payment'
      ELSE 'expired' END
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
  closed_at timestamptz,
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
    AND (recovered_at IS NULL OR (abandoned_at IS NOT NULL AND recovered_at>=abandoned_at))
    AND (closed_at IS NULL OR closed_at>=candidate_at))
);

-- Product facts are frozen when an episode becomes a candidate.  Historical
-- abandonment analytics must not be rewritten when a resumed cart changes.
CREATE TABLE saas.abandoned_cart_episode_items (
  store_id uuid NOT NULL,
  episode_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  category_id uuid,
  brand_id uuid,
  product_name text NOT NULL CHECK (product_name=pg_catalog.btrim(product_name) AND pg_catalog.char_length(product_name) BETWEEN 1 AND 200),
  quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 9999),
  line_total_minor bigint NOT NULL CHECK (line_total_minor>=0),
  created_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,episode_id,variant_id),
  CONSTRAINT abandoned_cart_episode_items_episode_store_fk FOREIGN KEY(store_id,episode_id)
    REFERENCES saas.abandoned_cart_episodes(store_id,id) ON DELETE RESTRICT
);

-- Preserve pre-124 abandoned carts and reconcile legacy recovered rows only
-- from durable payment evidence. These snapshots make the migration itself
-- compatible with the already-live cart feature.
INSERT INTO saas.abandoned_cart_episodes(
  id,store_id,cart_id,episode_number,candidate_at,abandoned_at,recovered_at,closed_at,linked_order_id,
  currency,value_minor,created_at,updated_at
)
SELECT pg_catalog.gen_random_uuid(),cart.store_id,cart.id,1,
  COALESCE(cart.candidate_at,cart.last_activity_at,cart.created_at),
  COALESCE(cart.abandoned_at,cart.recovered_at,cart.last_activity_at,cart.created_at),
  CASE WHEN cart.recovered_at IS NOT NULL AND orders.paid_at IS NOT NULL THEN orders.paid_at END,
  CASE
    WHEN cart.status='archived' THEN GREATEST(COALESCE(cart.archived_at,cart.updated_at),COALESCE(orders.paid_at,cart.updated_at))
    WHEN cart.lifecycle_status='recovered' THEN COALESCE(orders.paid_at,cart.recovered_at,cart.updated_at)
    WHEN cart.lifecycle_status='expired' THEN COALESCE(cart.updated_at,cart.recovered_at)
  END,
  CASE WHEN cart.recovered_at IS NOT NULL AND orders.paid_at IS NOT NULL THEN cart.recovered_order_id END,
  cart.currency,cart.total_cents,cart.created_at,cart.updated_at
FROM saas.abandoned_carts cart
LEFT JOIN saas.orders orders ON orders.store_id=cart.store_id AND orders.id=cart.recovered_order_id
WHERE cart.status='abandoned'
  OR (cart.status='recovered' AND cart.recovered_order_id IS NOT NULL)
  OR (cart.status='archived' AND cart.abandoned_at IS NOT NULL);

INSERT INTO saas.abandoned_cart_episode_items(
  store_id,episode_id,product_id,variant_id,category_id,brand_id,product_name,quantity,line_total_minor,created_at
)
SELECT item.store_id,episode.id,item.product_id,item.variant_id,
  (SELECT relation.category_id FROM saas.catalog_product_categories relation
    JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id
    WHERE relation.store_id=item.store_id AND relation.product_id=item.product_id
    ORDER BY relation.position,category.depth DESC,category.id LIMIT 1),
  (SELECT relation.resource_id FROM saas.catalog_admin_resource_products relation
    JOIN saas.catalog_admin_resources resource ON resource.store_id=relation.store_id AND resource.id=relation.resource_id AND resource.resource_kind='brand'
    WHERE relation.store_id=item.store_id AND relation.product_id=item.product_id
    ORDER BY relation.position,resource.id LIMIT 1),
  item.product_name,item.quantity,item.line_total_cents,episode.created_at
FROM saas.abandoned_cart_items item
JOIN saas.abandoned_cart_episodes episode ON episode.store_id=item.store_id AND episode.cart_id=item.cart_id AND episode.episode_number=1
WHERE item.product_id IS NOT NULL AND item.variant_id IS NOT NULL;

-- A successful server-side quote is the canonical checkout start for every
-- supported payment method.  Its product and safe attribution snapshots are
-- immutable, so later cart edits cannot rewrite historical product metrics.
CREATE TABLE saas.storefront_checkout_start_snapshots (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('cart','buy_now')),
  cart_id uuid,
  intent_id uuid,
  currency text NOT NULL CHECK (currency~'^[A-Z]{3}$'),
  item_snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(item_snapshot)='array' AND pg_catalog.jsonb_array_length(item_snapshot) BETWEEN 1 AND 100 AND pg_catalog.pg_column_size(item_snapshot)<=131072),
  attribution_snapshot jsonb NOT NULL CHECK (pg_catalog.jsonb_typeof(attribution_snapshot)='object' AND pg_catalog.pg_column_size(attribution_snapshot)<=2048),
  started_at timestamptz NOT NULL,
  CONSTRAINT storefront_checkout_start_cart_store_fk FOREIGN KEY(store_id,cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT storefront_checkout_start_intent_store_fk FOREIGN KEY(store_id,intent_id) REFERENCES saas.storefront_checkout_intents(store_id,id) ON DELETE RESTRICT,
  CHECK ((source_kind='cart' AND cart_id IS NOT NULL AND intent_id IS NULL) OR (source_kind='buy_now' AND cart_id IS NULL AND intent_id IS NOT NULL))
);

CREATE INDEX storefront_checkout_start_cart_session_idx
  ON saas.storefront_checkout_start_snapshots(store_id,cart_id,(attribution_snapshot->>'anonymousSessionRef'),started_at DESC,id);
CREATE INDEX storefront_checkout_start_intent_session_idx
  ON saas.storefront_checkout_start_snapshots(store_id,intent_id,(attribution_snapshot->>'anonymousSessionRef'),started_at DESC,id);

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
  adjusted_items integer CHECK (adjusted_items IS NULL OR adjusted_items BETWEEN 0 AND 100),
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
    AND ((used_at IS NULL AND restored_cart_id IS NULL AND restored_items IS NULL AND omitted_items IS NULL AND adjusted_items IS NULL)
      OR (used_at IS NOT NULL AND restored_cart_id IS NOT NULL AND restored_items IS NOT NULL AND omitted_items IS NOT NULL AND adjusted_items IS NOT NULL)))
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
  DROP CONSTRAINT analytics_delivery_outbox_store_order_kind_key,
  DROP CONSTRAINT analytics_delivery_outbox_kind_check,
  DROP CONSTRAINT analytics_delivery_outbox_payload_check,
  ALTER COLUMN order_id DROP NOT NULL,
  ADD COLUMN cart_id uuid,
  ADD COLUMN episode_id uuid,
  ADD COLUMN payment_attempt_id uuid,
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
  ADD CONSTRAINT analytics_delivery_outbox_payment_attempt_store_fk FOREIGN KEY (store_id,payment_attempt_id)
    REFERENCES saas.payment_attempts(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT analytics_delivery_outbox_store_event_key UNIQUE (store_id,event_key),
  ADD CONSTRAINT analytics_delivery_outbox_entity_check CHECK (order_id IS NOT NULL OR cart_id IS NOT NULL OR payment_attempt_id IS NOT NULL);

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
CREATE INDEX abandoned_carts_global_evaluation_idx ON saas.abandoned_carts(last_activity_at,id)
  WHERE status<>'archived' AND lifecycle_status IN ('active','resumed','candidate','abandoned') AND recovered_order_id IS NULL;
CREATE INDEX abandoned_cart_episodes_store_abandoned_idx ON saas.abandoned_cart_episodes(store_id,abandoned_at DESC,id) WHERE abandoned_at IS NOT NULL;
CREATE INDEX abandoned_cart_episode_items_product_idx ON saas.abandoned_cart_episode_items(store_id,product_id,episode_id);
CREATE INDEX storefront_checkout_start_snapshots_period_idx ON saas.storefront_checkout_start_snapshots(store_id,started_at,currency,id);
CREATE INDEX orders_commerce_paid_period_idx ON saas.orders(store_id,paid_at,currency,id) WHERE paid_at IS NOT NULL;
CREATE INDEX orders_commerce_refunded_period_idx ON saas.orders(store_id,refunded_at,currency,id) WHERE refunded_at IS NOT NULL;
CREATE INDEX abandoned_cart_episodes_store_candidate_idx ON saas.abandoned_cart_episodes(store_id,candidate_at,currency,id);
CREATE INDEX abandoned_cart_episodes_store_recovered_idx ON saas.abandoned_cart_episodes(store_id,recovered_at,currency,id) WHERE recovered_at IS NOT NULL;
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
ALTER TABLE saas.storefront_intent_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_intent_attribution FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.order_commerce_attribution ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.order_commerce_attribution FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_episodes FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_episode_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_episode_items FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_start_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_start_snapshots FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_recovery_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_recovery_tokens FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_recovery_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.abandoned_cart_recovery_attempts FORCE ROW LEVEL SECURITY;

-- Enrich existing public projections with the primary category identifier so
-- each cart/checkout funnel event can carry the same privacy-safe cohort keys.
-- The original implementations remain intact for a lossless down migration.
ALTER FUNCTION saas.public_campaign_product_projection(uuid,uuid,timestamptz)
  RENAME TO public_campaign_product_projection_without_commerce_analytics;
CREATE FUNCTION saas.public_campaign_product_projection(p_store_id uuid,p_product_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
  SELECT CASE WHEN base.payload IS NULL THEN NULL ELSE base.payload||pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'primaryCategoryId',(SELECT relation.category_id FROM saas.catalog_product_categories relation
      JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active'
      WHERE relation.store_id=p_store_id AND relation.product_id=p_product_id
      ORDER BY relation.position,category.depth DESC,category.id LIMIT 1)
  )) END
  FROM (SELECT saas.public_campaign_product_projection_without_commerce_analytics(p_store_id,p_product_id,p_now) payload) base
$function$;

ALTER FUNCTION saas.storefront_cart_projection(uuid,uuid,timestamptz)
  RENAME TO storefront_cart_projection_without_commerce_analytics;
CREATE FUNCTION saas.storefront_cart_projection(p_store_id uuid,p_cart_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  WITH base AS (
    SELECT saas.storefront_cart_projection_without_commerce_analytics(p_store_id,p_cart_id,p_now) payload
  ), enriched AS (
    SELECT item.ordinality, item.value||pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'categoryId',(SELECT relation.category_id FROM saas.catalog_product_categories relation
        JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active'
        WHERE relation.store_id=p_store_id AND relation.product_id=(item.value->>'productId')::uuid
        ORDER BY relation.position,category.depth DESC,category.id LIMIT 1)
    )) value
    FROM base CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(base.payload->'items') WITH ORDINALITY item(value,ordinality)
  )
  SELECT CASE WHEN base.payload IS NULL THEN NULL ELSE pg_catalog.jsonb_set(base.payload,'{items}',
    COALESCE((SELECT pg_catalog.jsonb_agg(enriched.value ORDER BY enriched.ordinality) FROM enriched),'[]'::jsonb)) END FROM base
$function$;

ALTER FUNCTION saas.storefront_intent_projection(uuid,uuid,timestamptz)
  RENAME TO storefront_intent_projection_without_commerce_analytics;
CREATE FUNCTION saas.storefront_intent_projection(p_store_id uuid,p_intent_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  WITH base AS (
    SELECT saas.storefront_intent_projection_without_commerce_analytics(p_store_id,p_intent_id,p_now) payload
  ), enriched AS (
    SELECT item.ordinality, item.value||pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'categoryId',(SELECT relation.category_id FROM saas.catalog_product_categories relation
        JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active'
        WHERE relation.store_id=p_store_id AND relation.product_id=(item.value->>'productId')::uuid
        ORDER BY relation.position,category.depth DESC,category.id LIMIT 1)
    )) value
    FROM base CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(base.payload->'items') WITH ORDINALITY item(value,ordinality)
  )
  SELECT CASE WHEN base.payload IS NULL THEN NULL ELSE pg_catalog.jsonb_set(base.payload,'{items}',
    COALESCE((SELECT pg_catalog.jsonb_agg(enriched.value ORDER BY enriched.ordinality) FROM enriched),'[]'::jsonb)) END FROM base
$function$;

-- Treat the successful server-side quote as the one canonical checkout start
-- for cart and buy-now flows. This remains independent of the payment method
-- selected later and freezes the exact items used by historical analytics.
ALTER FUNCTION saas.public_checkout_quote(text,timestamptz,text,jsonb)
  RENAME TO public_checkout_quote_without_commerce_analytics;
CREATE FUNCTION saas.public_checkout_quote(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_store uuid; selected_cart_id uuid; selected_intent_id uuid;
  selected_outcome text; selected_payload jsonb; selected_attribution jsonb;
BEGIN
  SELECT quote.outcome,quote.result_payload INTO selected_outcome,selected_payload
  FROM saas.public_checkout_quote_without_commerce_analytics(p_hostname,p_now,p_kind,p_credentials) quote;
  IF selected_outcome='quoted' THEN
    BEGIN
    selected_store:=saas.storefront_public_store(p_hostname,p_now);
    IF p_kind='cart' THEN
      SELECT cart.id INTO selected_cart_id FROM saas.storefront_carts cart
      JOIN saas.storefront_cart_credentials credential
        ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
      JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
        ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
      WHERE cart.store_id=selected_store ORDER BY cart.created_at DESC,cart.id LIMIT 1;
      SELECT pg_catalog.jsonb_build_object(
        'firstTouchSource',attribution.first_touch_source,
        'firstTouchMedium',attribution.first_touch_medium,
        'firstTouchCampaign',attribution.first_touch_campaign,
        'lastTouchSource',attribution.last_touch_source,
        'lastTouchMedium',attribution.last_touch_medium,
        'lastTouchCampaign',attribution.last_touch_campaign,
        'referrerHost',attribution.referrer_host,
        'landingPathGroup',attribution.landing_path_group,
        'deviceGroup',attribution.device_group,
        'anonymousSessionRef',attribution.anonymous_session_ref
      ) INTO selected_attribution
      FROM saas.storefront_cart_attribution attribution
      WHERE attribution.store_id=selected_store AND attribution.cart_id=selected_cart_id;
    ELSE
      SELECT intent.id INTO selected_intent_id FROM saas.storefront_checkout_intents intent
      JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
        ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
      WHERE intent.store_id=selected_store ORDER BY intent.created_at DESC,intent.id LIMIT 1;
      SELECT pg_catalog.jsonb_build_object(
        'firstTouchSource',attribution.first_touch_source,
        'firstTouchMedium',attribution.first_touch_medium,
        'firstTouchCampaign',attribution.first_touch_campaign,
        'lastTouchSource',attribution.last_touch_source,
        'lastTouchMedium',attribution.last_touch_medium,
        'lastTouchCampaign',attribution.last_touch_campaign,
        'referrerHost',attribution.referrer_host,
        'landingPathGroup',attribution.landing_path_group,
        'deviceGroup',attribution.device_group,
        'anonymousSessionRef',attribution.anonymous_session_ref
      ) INTO selected_attribution
      FROM saas.storefront_intent_attribution attribution
      WHERE attribution.store_id=selected_store AND attribution.intent_id=selected_intent_id;
    END IF;
    INSERT INTO saas.storefront_checkout_start_snapshots(
      id,store_id,source_kind,cart_id,intent_id,currency,item_snapshot,attribution_snapshot,started_at
    ) VALUES(
      pg_catalog.gen_random_uuid(),selected_store,p_kind,selected_cart_id,selected_intent_id,
      selected_payload->'cart'->>'currency',selected_payload->'cart'->'items',
      COALESCE(selected_attribution,pg_catalog.jsonb_build_object(
        'firstTouchSource','unknown','firstTouchMedium','unknown',
        'lastTouchSource','unknown','lastTouchMedium','unknown',
        'landingPathGroup','/unknown','deviceGroup','unknown'
      )),p_now
    );
    EXCEPTION WHEN OTHERS THEN
      -- Analytics is deliberately fail-open: quote and checkout readiness must
      -- survive analytics storage/schema pressure or a malformed snapshot.
      NULL;
    END;
  END IF;
  RETURN QUERY SELECT selected_outcome,selected_payload;
END
$function$;

-- Snapshot checkout attribution for every order, not only carts that happened
-- to pass through an abandoned/recovered state.  Buy-now remains represented
-- explicitly and falls back to "unknown" until it has a cart attribution.
CREATE FUNCTION saas.capture_checkout_order_commerce_attribution()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_snapshot saas.storefront_checkout_start_snapshots%ROWTYPE; selected_payload jsonb;
BEGIN
  SELECT snapshot.* INTO selected_snapshot
  FROM saas.storefront_checkout_start_snapshots snapshot
  WHERE snapshot.store_id=NEW.store_id
    AND snapshot.cart_id IS NOT DISTINCT FROM NEW.cart_id
    AND snapshot.intent_id IS NOT DISTINCT FROM NEW.intent_id
    AND snapshot.started_at<=NEW.committed_at
  ORDER BY snapshot.started_at DESC,snapshot.id DESC LIMIT 1;
  IF FOUND THEN
    INSERT INTO saas.order_commerce_attribution(
      store_id,order_id,source_cart_id,source_intent_id,
      first_touch_source,first_touch_medium,first_touch_campaign,
      last_touch_source,last_touch_medium,last_touch_campaign,
      referrer_host,landing_path_group,device_group,anonymous_session_ref,captured_at
    ) VALUES(
      NEW.store_id,NEW.order_id,NEW.cart_id,NEW.intent_id,
      COALESCE(selected_snapshot.attribution_snapshot->>'firstTouchSource','unknown'),
      COALESCE(selected_snapshot.attribution_snapshot->>'firstTouchMedium','unknown'),
      selected_snapshot.attribution_snapshot->>'firstTouchCampaign',
      COALESCE(selected_snapshot.attribution_snapshot->>'lastTouchSource','unknown'),
      COALESCE(selected_snapshot.attribution_snapshot->>'lastTouchMedium','unknown'),
      selected_snapshot.attribution_snapshot->>'lastTouchCampaign',
      selected_snapshot.attribution_snapshot->>'referrerHost',
      COALESCE(selected_snapshot.attribution_snapshot->>'landingPathGroup','/unknown'),
      COALESCE(selected_snapshot.attribution_snapshot->>'deviceGroup','unknown'),
      selected_snapshot.attribution_snapshot->>'anonymousSessionRef',NEW.committed_at
    ) ON CONFLICT(store_id,order_id) DO NOTHING;
    SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'valueCents',orders.total_cents,'currency',orders.currency,'source',orders.source,
      'anonymousSessionRef',selected_snapshot.attribution_snapshot->>'anonymousSessionRef'
    )) INTO selected_payload
    FROM saas.orders orders WHERE orders.store_id=NEW.store_id AND orders.id=NEW.order_id;
    IF selected_payload IS NOT NULL THEN
      UPDATE saas.analytics_delivery_outbox outbox SET
        payload=selected_payload,
        payload_digest=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(selected_payload::text,'UTF8')),'hex'),
        updated_at=GREATEST(outbox.updated_at,NEW.committed_at)
      WHERE outbox.store_id=NEW.store_id AND outbox.order_id=NEW.order_id
        AND outbox.event_kind='purchase' AND outbox.status IN ('pending','retry');
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER storefront_checkout_operations_capture_commerce_attribution
AFTER INSERT ON saas.storefront_checkout_operations FOR EACH ROW
EXECUTE FUNCTION saas.capture_checkout_order_commerce_attribution();

-- Purchase remains canonical PostgreSQL output.  The optional opaque browser
-- session reference lets analytics join the verified purchase to its funnel
-- without disclosing an order, customer, cart, or checkout identifier.
CREATE OR REPLACE FUNCTION saas.enqueue_analytics_purchase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE safe_payload jsonb; selected_session_ref text;
BEGIN
  IF NEW.payment_status='completed' AND (TG_OP='INSERT' OR OLD.payment_status IS DISTINCT FROM 'completed') THEN
    SELECT attribution.anonymous_session_ref INTO selected_session_ref
    FROM saas.order_commerce_attribution attribution
    WHERE attribution.store_id=NEW.store_id AND attribution.order_id=NEW.id;
    safe_payload:=pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'valueCents',NEW.total_cents,'currency',NEW.currency,'source',NEW.source,
      'anonymousSessionRef',selected_session_ref
    ));
    INSERT INTO saas.analytics_delivery_outbox(
      id,store_id,order_id,connection_id,website_id,event_kind,payload,payload_digest,status,attempt_count,next_attempt_at,created_at,updated_at
    ) SELECT pg_catalog.gen_random_uuid(),NEW.store_id,NEW.id,connection.id,connection.website_id,'purchase',safe_payload,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(safe_payload::text,'UTF8')),'hex'),'pending',0,NEW.updated_at,NEW.updated_at,NEW.updated_at
    FROM saas.store_analytics_connections connection
    WHERE connection.store_id=NEW.store_id AND connection.status='active' AND saas.analytics_connection_is_current(connection.id,NEW.updated_at)
      AND COALESCE((SELECT setting.tracking_policy FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=NEW.store_id),'anonymous_commerce')='anonymous_commerce'
    ON CONFLICT(store_id,event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;

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
      AND COALESCE((SELECT setting.tracking_policy FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=connection.store_id),'anonymous_commerce')='anonymous_commerce'
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
  IF NOT p_value ?& ARRAY['deviceGroup','firstTouch','landingPathGroup','lastTouch']
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_value) key
      WHERE key<>ALL(ARRAY['anonymousSessionRef','deviceGroup','firstTouch','landingPathGroup','lastTouch','referrerHost']))
    OR (p_value ? 'anonymousSessionRef' AND p_value->>'anonymousSessionRef'!~'^h1_[0-9a-f]{64}$')
  THEN RETURN false; END IF;
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
  IF COALESCE((SELECT setting.tracking_policy FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=selected_store),'anonymous_commerce')='disabled' THEN
    RETURN QUERY SELECT 'recorded',pg_catalog.jsonb_build_object(); RETURN;
  END IF;
  SELECT cart.id INTO selected_cart FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_candidates) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store AND cart.status='active' AND cart.expires_at>p_now
    ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
  IF selected_cart IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.storefront_cart_attribution(store_id,cart_id,first_touch_source,first_touch_medium,first_touch_campaign,
    last_touch_source,last_touch_medium,last_touch_campaign,referrer_host,landing_path_group,device_group,anonymous_session_ref,created_at,updated_at)
  VALUES(selected_store,selected_cart,p_attribution->'firstTouch'->>'source',p_attribution->'firstTouch'->>'medium',p_attribution->'firstTouch'->>'campaign',
    p_attribution->'lastTouch'->>'source',p_attribution->'lastTouch'->>'medium',p_attribution->'lastTouch'->>'campaign',p_attribution->>'referrerHost',p_attribution->>'landingPathGroup',p_attribution->>'deviceGroup',p_attribution->>'anonymousSessionRef',p_now,p_now)
  ON CONFLICT(store_id,cart_id) DO UPDATE SET
    last_touch_source=CASE WHEN EXCLUDED.last_touch_source NOT IN ('direct','unknown') THEN EXCLUDED.last_touch_source ELSE storefront_cart_attribution.last_touch_source END,
    last_touch_medium=CASE WHEN EXCLUDED.last_touch_source NOT IN ('direct','unknown') THEN EXCLUDED.last_touch_medium ELSE storefront_cart_attribution.last_touch_medium END,
    last_touch_campaign=CASE WHEN EXCLUDED.last_touch_source NOT IN ('direct','unknown') THEN EXCLUDED.last_touch_campaign ELSE storefront_cart_attribution.last_touch_campaign END,
    referrer_host=COALESCE(EXCLUDED.referrer_host,storefront_cart_attribution.referrer_host),landing_path_group=EXCLUDED.landing_path_group,
    device_group=EXCLUDED.device_group,anonymous_session_ref=COALESCE(EXCLUDED.anonymous_session_ref,storefront_cart_attribution.anonymous_session_ref),updated_at=p_now;
  PERFORM saas.sync_durable_abandoned_cart(selected_store,selected_cart,p_now);
  UPDATE saas.abandoned_carts abandoned SET
    first_touch_source=attribution.first_touch_source,first_touch_medium=attribution.first_touch_medium,first_touch_campaign=attribution.first_touch_campaign,
    last_touch_source=attribution.last_touch_source,last_touch_medium=attribution.last_touch_medium,last_touch_campaign=attribution.last_touch_campaign,
    referrer_host=attribution.referrer_host,landing_path_group=attribution.landing_path_group,device_group=attribution.device_group,
    anonymous_session_ref=attribution.anonymous_session_ref,updated_at=GREATEST(abandoned.updated_at,p_now)
  FROM saas.storefront_cart_attribution attribution
  WHERE abandoned.store_id=selected_store AND abandoned.source_cart_id=selected_cart AND attribution.store_id=selected_store AND attribution.cart_id=selected_cart;
  RETURN QUERY SELECT 'recorded',pg_catalog.jsonb_build_object();
END
$function$;

-- New storefronts submit the current anonymous attribution immediately before
-- quoting.  The legacy four-argument quote remains callable for migration-first
-- deploys and records a deterministic "legacy" snapshot.
CREATE FUNCTION saas.public_checkout_quote(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_attribution jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE attribution_outcome text;
BEGIN
  IF NOT saas.commerce_attribution_valid(p_attribution) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF p_kind='cart' THEN
    BEGIN
      SELECT recorded.outcome INTO attribution_outcome
      FROM saas.public_cart_attribution_record(p_hostname,p_now,p_credentials,p_attribution) recorded;
    EXCEPTION WHEN OTHERS THEN
      -- Analytics enrichment is best effort. Canonical checkout quote remains
      -- available during analytics schema/storage/worker incidents.
      attribution_outcome:=NULL;
    END;
  END IF;
  RETURN QUERY SELECT quoted.outcome,quoted.result_payload
  FROM saas.public_checkout_quote(p_hostname,p_now,p_kind,p_credentials) quoted;
END
$function$;

-- New code records the same privacy-safe attribution for a buy-now intent in
-- the transaction that creates it; the existing nine-argument function stays
-- available for migration-first rolling compatibility.
CREATE FUNCTION saas.public_buy_now_create(
  p_hostname text,p_now timestamptz,p_intent_id uuid,p_key_id text,p_digest text,p_expires_at timestamptz,
  p_product_id uuid,p_variant_id uuid,p_quantity integer,p_attribution jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_outcome text; selected_payload jsonb; selected_store uuid;
BEGIN
  IF NOT saas.commerce_attribution_valid(p_attribution) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT created.outcome,created.result_payload INTO selected_outcome,selected_payload
  FROM saas.public_buy_now_create(p_hostname,p_now,p_intent_id,p_key_id,p_digest,p_expires_at,p_product_id,p_variant_id,p_quantity) created;
  IF selected_outcome='committed' THEN
    BEGIN
      selected_store:=saas.storefront_public_store(p_hostname,p_now);
      IF COALESCE((SELECT setting.tracking_policy FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=selected_store),'anonymous_commerce')='anonymous_commerce' THEN
        INSERT INTO saas.storefront_intent_attribution(
        store_id,intent_id,first_touch_source,first_touch_medium,first_touch_campaign,
        last_touch_source,last_touch_medium,last_touch_campaign,referrer_host,landing_path_group,
        device_group,anonymous_session_ref,created_at
      ) VALUES(
        selected_store,p_intent_id,p_attribution->'firstTouch'->>'source',p_attribution->'firstTouch'->>'medium',p_attribution->'firstTouch'->>'campaign',
        p_attribution->'lastTouch'->>'source',p_attribution->'lastTouch'->>'medium',p_attribution->'lastTouch'->>'campaign',
        p_attribution->>'referrerHost',p_attribution->>'landingPathGroup',p_attribution->>'deviceGroup',p_attribution->>'anonymousSessionRef',p_now
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      -- Buy-now intent creation is canonical commerce behavior. Attribution is
      -- best effort and must not roll it back when analytics storage is down.
      NULL;
    END;
  END IF;
  RETURN QUERY SELECT selected_outcome,selected_payload;
END
$function$;

CREATE FUNCTION saas.capture_order_commerce_attribution()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF NEW.recovered_order_id IS NOT NULL AND NEW.source_cart_id IS NOT NULL
    AND (TG_OP='INSERT' OR OLD.recovered_order_id IS DISTINCT FROM NEW.recovered_order_id) THEN
    INSERT INTO saas.order_commerce_attribution(store_id,order_id,source_cart_id,first_touch_source,first_touch_medium,first_touch_campaign,
      last_touch_source,last_touch_medium,last_touch_campaign,referrer_host,landing_path_group,device_group,anonymous_session_ref,captured_at)
    SELECT NEW.store_id,NEW.recovered_order_id,NEW.source_cart_id,attribution.first_touch_source,attribution.first_touch_medium,attribution.first_touch_campaign,
      attribution.last_touch_source,attribution.last_touch_medium,attribution.last_touch_campaign,attribution.referrer_host,attribution.landing_path_group,attribution.device_group,attribution.anonymous_session_ref,NEW.updated_at
    FROM saas.storefront_cart_attribution attribution WHERE attribution.store_id=NEW.store_id AND attribution.cart_id=NEW.source_cart_id
    ON CONFLICT(store_id,order_id) DO NOTHING;
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER abandoned_carts_capture_order_attribution
AFTER INSERT OR UPDATE OF recovered_order_id ON saas.abandoned_carts FOR EACH ROW EXECUTE FUNCTION saas.capture_order_commerce_attribution();

CREATE FUNCTION saas.sync_commerce_cart_conversion_state()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_payment_status text; selected_episode_id uuid;
BEGIN
  IF TG_OP='UPDATE' AND NEW.recovered_order_id IS NOT DISTINCT FROM OLD.recovered_order_id THEN RETURN NEW; END IF;
  IF NEW.recovered_order_id IS NULL THEN RETURN NEW; END IF;
  SELECT orders.payment_status INTO selected_payment_status FROM saas.orders orders
    WHERE orders.store_id=NEW.store_id AND orders.id=NEW.recovered_order_id;
  IF selected_payment_status IS NULL THEN RAISE EXCEPTION 'COMMERCE_CART_ORDER_BINDING_INVALID'; END IF;
  NEW.lifecycle_status:=CASE WHEN selected_payment_status IN ('completed','refunded') THEN 'recovered' ELSE 'converted_pending_payment' END;
  SELECT episode.id INTO selected_episode_id FROM saas.abandoned_cart_episodes episode
    WHERE episode.store_id=NEW.store_id AND episode.cart_id=NEW.id AND episode.abandoned_at IS NOT NULL
      AND episode.recovered_at IS NULL
    ORDER BY episode.episode_number DESC LIMIT 1 FOR UPDATE;
  IF selected_episode_id IS NULL THEN
    IF selected_payment_status IN ('completed','refunded') THEN
      NEW.status:='archived';
      NEW.archived_at:=COALESCE(NEW.archived_at,NEW.updated_at);
      NEW.lifecycle_status:='expired';
    ELSE
      NEW.lifecycle_status:='converted_pending_payment';
    END IF;
    RETURN NEW;
  END IF;
  UPDATE saas.abandoned_cart_episodes SET linked_order_id=NEW.recovered_order_id,
    recovered_at=CASE WHEN NEW.lifecycle_status='recovered' THEN NEW.updated_at ELSE recovered_at END,
    closed_at=CASE WHEN NEW.lifecycle_status='recovered' THEN NEW.updated_at ELSE closed_at END,
    updated_at=GREATEST(updated_at,NEW.updated_at)
    WHERE store_id=NEW.store_id AND id=selected_episode_id;
  IF NEW.lifecycle_status='converted_pending_payment' THEN
    UPDATE saas.abandoned_cart_recovery_tokens SET revoked_at=COALESCE(revoked_at,NEW.updated_at)
      WHERE store_id=NEW.store_id AND cart_id=NEW.id AND converted_at IS NULL;
  ELSE
    NEW.status:='recovered';
    NEW.abandoned_at:=COALESCE(NEW.abandoned_at,NEW.updated_at);
    NEW.recovered_at:=NEW.updated_at;
    UPDATE saas.abandoned_cart_recovery_tokens SET converted_at=NEW.updated_at,revoked_at=COALESCE(revoked_at,NEW.updated_at)
      WHERE store_id=NEW.store_id AND cart_id=NEW.id AND converted_at IS NULL AND used_at IS NOT NULL;
    UPDATE saas.abandoned_cart_recovery_tokens SET revoked_at=COALESCE(revoked_at,NEW.updated_at)
      WHERE store_id=NEW.store_id AND cart_id=NEW.id AND converted_at IS NULL AND used_at IS NULL;
    IF selected_episode_id IS NOT NULL THEN
      PERFORM saas.commerce_analytics_enqueue_cart_event(NEW.store_id,NEW.id,selected_episode_id,'cart_recovered','cart_recovered:'||selected_episode_id::text,NEW.currency,NEW.total_cents,NEW.updated_at);
    END IF;
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER abandoned_carts_sync_commerce_conversion
BEFORE INSERT OR UPDATE ON saas.abandoned_carts FOR EACH ROW EXECUTE FUNCTION saas.sync_commerce_cart_conversion_state();

-- Archive is a terminal lifecycle transition. Preserve the established
-- operation replay contract while closing analytics eligibility atomically.
CREATE OR REPLACE FUNCTION saas.abandoned_carts_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_cart_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.abandoned_cart_operations%ROWTYPE;
  selected saas.abandoned_carts%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_operation_id IS NULL OR p_cart_id IS NULL
    OR p_expected_version<1 OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_operation_id::text,0));
  SELECT * INTO existing FROM saas.abandoned_cart_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id<>p_store_id OR existing.cart_id<>p_cart_id OR existing.operation_kind<>'archive'
      OR existing.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
    RETURN QUERY SELECT 'operation_replayed',existing.result_payload; RETURN;
  END IF;
  SELECT * INTO selected FROM saas.abandoned_carts WHERE store_id=p_store_id AND id=p_cart_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'cart_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF selected.status NOT IN ('active','abandoned','recovered') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  UPDATE saas.abandoned_carts SET status='archived',lifecycle_status='expired',archived_at=p_now,
    version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_cart_id;
  UPDATE saas.abandoned_cart_episodes SET closed_at=COALESCE(closed_at,p_now),updated_at=GREATEST(updated_at,p_now)
    WHERE store_id=p_store_id AND cart_id=p_cart_id AND closed_at IS NULL;
  UPDATE saas.abandoned_cart_recovery_tokens SET revoked_at=COALESCE(revoked_at,p_now)
    WHERE store_id=p_store_id AND cart_id=p_cart_id AND converted_at IS NULL;
  projection:=saas.abandoned_carts_mutation_projection(p_store_id,p_cart_id);
  INSERT INTO saas.abandoned_cart_operations(operation_id,store_id,cart_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,p_cart_id,'archive',p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'committed',projection;
END
$function$;

-- A merchant assertion is not payment evidence. Keep the legacy endpoint
-- callable for old applications, but make it a fail-closed no-op; only the
-- captured-order triggers can transition a cart to recovered.
CREATE OR REPLACE FUNCTION saas.abandoned_carts_mark_recovered(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_cart_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_cart_id IS NULL OR p_expected_version<1 OR p_fingerprint !~ '^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.abandoned_carts cart WHERE cart.store_id=p_store_id AND cart.id=p_cart_id) THEN
    RETURN QUERY SELECT 'cart_not_found',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;
END
$function$;

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
    AND COALESCE((SELECT setting.tracking_policy FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=p_store_id),'anonymous_commerce')='anonymous_commerce'
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
    AND COALESCE((SELECT setting.tracking_policy FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=NEW.store_id),'anonymous_commerce')='anonymous_commerce'
  ON CONFLICT(store_id,event_key) DO NOTHING;
  RETURN NEW;
END
$function$;
CREATE TRIGGER orders_enqueue_commerce_analytics_lifecycle
AFTER INSERT OR UPDATE OF payment_status,status ON saas.orders FOR EACH ROW EXECUTE FUNCTION saas.commerce_analytics_enqueue_order_event();

CREATE FUNCTION saas.commerce_analytics_enqueue_payment_attempt_failure()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE selected_attempt saas.payment_attempts%ROWTYPE; safe_payload jsonb; safe_event_key text;
BEGIN
  IF NEW.to_status<>'failed' THEN RETURN NEW; END IF;
  BEGIN
    SELECT attempt.* INTO STRICT selected_attempt FROM saas.payment_attempts attempt
      WHERE attempt.store_id=NEW.store_id AND attempt.id=NEW.attempt_id;
    safe_payload:=pg_catalog.jsonb_build_object(
      'schemaVersion',1,'currency',selected_attempt.currency,'valueMinor',selected_attempt.amount_minor
    );
    safe_event_key:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      'payment_failed:attempt:'||NEW.attempt_id::text||':'||NEW.attempt_version::text,'UTF8')),'hex');
    INSERT INTO saas.analytics_delivery_outbox(
      id,store_id,order_id,cart_id,episode_id,payment_attempt_id,connection_id,website_id,event_kind,event_key,
      occurred_at,currency,value_minor,payload,payload_digest,status,attempt_count,next_attempt_at,created_at,updated_at
    ) SELECT pg_catalog.gen_random_uuid(),NEW.store_id,NULL,NULL,NULL,NEW.attempt_id,connection.id,connection.website_id,
      'payment_failed',safe_event_key,NEW.occurred_at,selected_attempt.currency,selected_attempt.amount_minor,safe_payload,
      pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(safe_payload::text,'UTF8')),'hex'),
      'pending',0,NEW.occurred_at,NEW.occurred_at,NEW.occurred_at
    FROM saas.store_analytics_connections connection
    WHERE connection.store_id=NEW.store_id AND connection.status='active'
      AND saas.analytics_connection_is_current(connection.id,NEW.occurred_at)
      AND COALESCE((SELECT setting.tracking_policy FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=NEW.store_id),'anonymous_commerce')='anonymous_commerce'
    ON CONFLICT(store_id,event_key) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Analytics delivery is a best-effort projection and cannot roll back the
    -- canonical payment attempt transition.
    NULL;
  END;
  RETURN NEW;
END
$function$;
CREATE TRIGGER payment_attempt_events_enqueue_commerce_failure
AFTER INSERT ON saas.payment_attempt_events FOR EACH ROW
EXECUTE FUNCTION saas.commerce_analytics_enqueue_payment_attempt_failure();

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
    LEFT JOIN saas.store_commerce_analytics_settings configured ON configured.store_id=cart.store_id
    WHERE cart.status<>'archived' AND cart.lifecycle_status IN ('active','resumed','candidate','abandoned') AND cart.recovered_order_id IS NULL
      AND (
        cart.source_cart_id IS NULL OR NOT EXISTS(
          SELECT 1 FROM saas.storefront_carts source
          WHERE source.store_id=cart.store_id AND source.id=cart.source_cart_id
            AND source.status='active' AND source.expires_at>p_now
        ) OR (
          EXISTS(
            SELECT 1 FROM saas.abandoned_cart_items item
            JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id AND product.status='active'
            JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id AND variant.status='active'
            JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) price ON price.outcome='found'
            WHERE item.store_id=cart.store_id AND item.cart_id=cart.id
              AND (NOT variant.stock_tracking OR saas.storefront_available_stock(item.store_id,item.variant_id,p_now,NULL)>0)
          ) AND (
            cart.lifecycle_status IN ('active','resumed')
              AND cart.last_activity_at<=p_now-pg_catalog.make_interval(mins=>COALESCE(configured.candidate_minutes,30))
            OR cart.lifecycle_status='candidate' AND (
              cart.last_activity_at<=p_now-pg_catalog.make_interval(hours=>COALESCE(configured.abandoned_hours,24))
              OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episodes episode
                WHERE episode.store_id=cart.store_id AND episode.cart_id=cart.id AND episode.closed_at IS NULL
                  AND episode.abandoned_at IS NULL AND cart.last_activity_at>episode.candidate_at)
            )
            OR cart.lifecycle_status='abandoned' AND EXISTS(
              SELECT 1 FROM saas.abandoned_cart_episodes episode
              WHERE episode.store_id=cart.store_id AND episode.cart_id=cart.id AND episode.closed_at IS NULL
                AND episode.abandoned_at IS NOT NULL AND cart.last_activity_at>episode.abandoned_at
            )
          )
        )
      )
    ORDER BY cart.last_activity_at,cart.id FOR UPDATE OF cart SKIP LOCKED LIMIT p_limit
  LOOP
    IF selected.source_cart_id IS NULL OR NOT EXISTS(
      SELECT 1 FROM saas.storefront_carts source
      WHERE source.store_id=selected.store_id AND source.id=selected.source_cart_id
        AND source.status='active' AND source.expires_at>p_now
    ) THEN
      UPDATE saas.abandoned_carts SET status='archived',lifecycle_status='expired',archived_at=COALESCE(archived_at,p_now),
        version=version+1,updated_at=p_now WHERE store_id=selected.store_id AND id=selected.id;
      UPDATE saas.abandoned_cart_episodes SET closed_at=COALESCE(closed_at,p_now),updated_at=GREATEST(updated_at,p_now)
        WHERE store_id=selected.store_id AND cart_id=selected.id AND closed_at IS NULL;
      UPDATE saas.abandoned_cart_recovery_tokens SET revoked_at=COALESCE(revoked_at,p_now)
        WHERE store_id=selected.store_id AND cart_id=selected.id AND converted_at IS NULL;
      CONTINUE;
    END IF;
    settings:=saas.commerce_analytics_settings_for_store(selected.store_id,p_now);
    IF NOT EXISTS(SELECT 1 FROM saas.abandoned_cart_items item WHERE item.store_id=selected.store_id AND item.cart_id=selected.id) THEN CONTINUE; END IF;
    IF selected.lifecycle_status='candidate' AND EXISTS(
      SELECT 1 FROM saas.abandoned_cart_episodes prior
      WHERE prior.store_id=selected.store_id AND prior.cart_id=selected.id
        AND prior.closed_at IS NULL AND prior.abandoned_at IS NULL
        AND selected.last_activity_at>prior.candidate_at
    ) THEN
      UPDATE saas.abandoned_carts SET lifecycle_status='active',candidate_at=NULL,version=version+1,updated_at=p_now
        WHERE store_id=selected.store_id AND id=selected.id;
      UPDATE saas.abandoned_cart_episodes SET closed_at=p_now,updated_at=p_now
        WHERE store_id=selected.store_id AND cart_id=selected.id AND closed_at IS NULL AND abandoned_at IS NULL;
      CONTINUE;
    END IF;
    IF selected.lifecycle_status='abandoned' AND EXISTS(
      SELECT 1 FROM saas.abandoned_cart_episodes prior
      WHERE prior.store_id=selected.store_id AND prior.cart_id=selected.id AND prior.abandoned_at IS NOT NULL
        AND prior.closed_at IS NULL AND prior.resumed_at IS NULL AND selected.last_activity_at>prior.abandoned_at
    ) THEN
      UPDATE saas.abandoned_carts SET lifecycle_status='resumed',version=version+1,updated_at=p_now WHERE store_id=selected.store_id AND id=selected.id;
      UPDATE saas.abandoned_cart_episodes SET resumed_at=p_now,closed_at=p_now,updated_at=p_now WHERE store_id=selected.store_id AND cart_id=selected.id AND closed_at IS NULL AND resumed_at IS NULL AND recovered_at IS NULL;
      SELECT episode.id INTO episode_id FROM saas.abandoned_cart_episodes episode WHERE episode.store_id=selected.store_id AND episode.cart_id=selected.id ORDER BY episode.episode_number DESC LIMIT 1;
      PERFORM saas.commerce_analytics_enqueue_cart_event(selected.store_id,selected.id,episode_id,'cart_resumed','cart_resumed:'||episode_id::text,selected.currency,selected.total_cents,p_now);
      resumed:=resumed+1; CONTINUE;
    END IF;
    IF selected.lifecycle_status IN ('active','resumed') AND selected.last_activity_at<=p_now-pg_catalog.make_interval(mins=>settings.candidate_minutes) THEN
      SELECT COALESCE(MAX(e.episode_number),0)+1 INTO episode_number FROM saas.abandoned_cart_episodes e WHERE e.store_id=selected.store_id AND e.cart_id=selected.id;
      episode_id:=pg_catalog.gen_random_uuid();
      INSERT INTO saas.abandoned_cart_episodes(id,store_id,cart_id,episode_number,candidate_at,currency,value_minor,first_touch,last_touch,created_at,updated_at)
      VALUES(episode_id,selected.store_id,selected.id,episode_number,p_now,selected.currency,selected.total_cents,
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('source',selected.first_touch_source,'medium',selected.first_touch_medium,'campaign',selected.first_touch_campaign,'device',selected.device_group)),
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('source',selected.last_touch_source,'medium',selected.last_touch_medium,'campaign',selected.last_touch_campaign,'device',selected.device_group)),p_now,p_now);
      INSERT INTO saas.abandoned_cart_episode_items(store_id,episode_id,product_id,variant_id,category_id,brand_id,product_name,quantity,line_total_minor,created_at)
      SELECT item.store_id,episode_id,item.product_id,item.variant_id,
        (SELECT relation.category_id FROM saas.catalog_product_categories relation
          JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active'
          WHERE relation.store_id=item.store_id AND relation.product_id=item.product_id
          ORDER BY relation.position,category.depth DESC,category.id LIMIT 1),
        (SELECT relation.resource_id FROM saas.catalog_admin_resource_products relation
          JOIN saas.catalog_admin_resources resource ON resource.store_id=relation.store_id AND resource.id=relation.resource_id AND resource.resource_kind='brand' AND resource.status='active'
          WHERE relation.store_id=item.store_id AND relation.product_id=item.product_id
          ORDER BY relation.position,resource.id LIMIT 1),
        item.product_name,item.quantity,item.line_total_cents,p_now
      FROM saas.abandoned_cart_items item
      WHERE item.store_id=selected.store_id AND item.cart_id=selected.id
        AND item.product_id IS NOT NULL AND item.variant_id IS NOT NULL;
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
        ON episode.store_id=cart.store_id AND episode.cart_id=cart.id AND episode.abandoned_at IS NOT NULL
          AND episode.recovered_at IS NULL
      WHERE cart.store_id=NEW.store_id AND cart.status<>'archived' AND cart.recovered_order_id=NEW.id
        AND episode.id=(SELECT latest.id FROM saas.abandoned_cart_episodes latest
          WHERE latest.store_id=cart.store_id AND latest.cart_id=cart.id AND latest.abandoned_at IS NOT NULL
            AND latest.recovered_at IS NULL
          ORDER BY latest.episode_number DESC LIMIT 1)
      FOR UPDATE OF cart,episode
    LOOP
      UPDATE saas.abandoned_carts SET lifecycle_status='recovered',status='recovered',
        abandoned_at=COALESCE(abandoned_at,NEW.updated_at),recovered_at=NEW.updated_at,version=version+1,updated_at=NEW.updated_at
        WHERE store_id=selected.store_id AND id=selected.id;
      UPDATE saas.abandoned_cart_episodes SET recovered_at=NEW.updated_at,closed_at=NEW.updated_at,linked_order_id=NEW.id,updated_at=NEW.updated_at
        WHERE store_id=selected.store_id AND id=selected.episode_id;
      UPDATE saas.abandoned_cart_recovery_tokens SET converted_at=NEW.updated_at,revoked_at=COALESCE(revoked_at,NEW.updated_at)
        WHERE store_id=selected.store_id AND cart_id=selected.id AND converted_at IS NULL AND used_at IS NOT NULL;
      UPDATE saas.abandoned_cart_recovery_tokens SET revoked_at=COALESCE(revoked_at,NEW.updated_at)
        WHERE store_id=selected.store_id AND cart_id=selected.id AND converted_at IS NULL AND used_at IS NULL;
      PERFORM saas.commerce_analytics_enqueue_cart_event(selected.store_id,selected.id,selected.episode_id,'cart_recovered','cart_recovered:'||selected.episode_id::text,selected.currency,NEW.total_cents,NEW.updated_at);
    END LOOP;
    UPDATE saas.abandoned_carts cart SET status='archived',archived_at=COALESCE(cart.archived_at,NEW.updated_at),
      lifecycle_status='expired',updated_at=GREATEST(cart.updated_at,NEW.updated_at)
    WHERE cart.store_id=NEW.store_id AND cart.recovered_order_id=NEW.id
      AND NOT EXISTS(SELECT 1 FROM saas.abandoned_cart_episodes episode
        WHERE episode.store_id=cart.store_id AND episode.cart_id=cart.id AND episode.abandoned_at IS NOT NULL);
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
  WITH exhausted_candidates AS (
    SELECT outbox.id FROM saas.analytics_delivery_outbox outbox
    WHERE outbox.status='processing' AND outbox.lease_expires_at<=p_now AND outbox.attempt_count>=10
    ORDER BY outbox.lease_expires_at,outbox.id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ) UPDATE saas.analytics_delivery_outbox outbox SET status='failed',lease_token=NULL,lease_expires_at=NULL,
      last_error_code='lease_expired_after_max_attempts',updated_at=p_now
    FROM exhausted_candidates WHERE outbox.id=exhausted_candidates.id;
  WITH candidates AS (
    SELECT outbox.id FROM saas.analytics_delivery_outbox outbox
    WHERE outbox.attempt_count<10 AND ((outbox.status='pending' AND outbox.next_attempt_at<=p_now) OR (outbox.status='processing' AND outbox.lease_expires_at<=p_now))
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
  WITH exhausted_candidates AS (
    SELECT outbox.id FROM saas.analytics_delivery_outbox outbox
    WHERE outbox.event_kind='purchase' AND outbox.status='processing'
      AND outbox.lease_expires_at<=p_now AND outbox.attempt_count>=10
    ORDER BY outbox.lease_expires_at,outbox.id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ) UPDATE saas.analytics_delivery_outbox outbox SET status='failed',lease_token=NULL,lease_expires_at=NULL,
      last_error_code='lease_expired_after_max_attempts',updated_at=p_now
    FROM exhausted_candidates WHERE outbox.id=exhausted_candidates.id;
  WITH candidates AS (
    SELECT outbox.id FROM saas.analytics_delivery_outbox outbox
    WHERE outbox.event_kind='purchase' AND outbox.attempt_count<10
      AND ((outbox.status='pending' AND outbox.next_attempt_at<=p_now) OR (outbox.status='processing' AND outbox.lease_expires_at<=p_now))
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

CREATE FUNCTION saas.commerce_analytics_settings_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','configuration.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'resolved',COALESCE((SELECT pg_catalog.jsonb_build_object(
    'candidateInactivityMinutes',setting.candidate_minutes,'abandonedInactivityHours',setting.abandoned_hours,
    'recoveryLinkHours',setting.recovery_link_hours,'automaticRecoveryEnabled',setting.automatic_recovery_enabled,
    'maximumMessageAttempts',setting.maximum_message_attempts,'minimumMessageIntervalHours',setting.minimum_message_interval_hours,
    'trackingPolicy',setting.tracking_policy,'version',setting.version
  ) FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=p_store_id),
  pg_catalog.jsonb_build_object('candidateInactivityMinutes',30,'abandonedInactivityHours',24,'recoveryLinkHours',72,
    'automaticRecoveryEnabled',false,'maximumMessageAttempts',3,'minimumMessageIntervalHours',6,
    'trackingPolicy','anonymous_commerce','version',1));
END
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
  IF selected_cart.status='archived' OR selected_cart.lifecycle_status<>'abandoned' OR selected_cart.source_cart_id IS NULL OR selected_cart.recovered_order_id IS NOT NULL
    OR NOT EXISTS(SELECT 1 FROM saas.storefront_carts source WHERE source.store_id=selected_cart.store_id AND source.id=selected_cart.source_cart_id AND source.status='active' AND source.expires_at>p_now)
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.abandoned_cart_items item
    JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id AND product.status='active'
    JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id AND variant.status='active'
    JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) price ON price.outcome='found'
    WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id
      AND (NOT variant.stock_tracking OR saas.storefront_available_stock(item.store_id,item.variant_id,p_now,NULL)>0)
  ) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_episode FROM saas.abandoned_cart_episodes
    WHERE store_id=p_store_id AND cart_id=p_cart_id AND abandoned_at IS NOT NULL AND closed_at IS NULL AND resumed_at IS NULL AND recovered_at IS NULL
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
    WHERE store_id=p_store_id AND cart_id=p_cart_id AND revoked_at IS NULL;
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
  copied integer:=0; omitted integer:=0; adjusted integer:=0;
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
  IF NOT FOUND OR selected_abandoned.status='archived' OR selected_abandoned.lifecycle_status NOT IN ('abandoned','resumed')
    OR selected_abandoned.source_cart_id IS NULL
    OR NOT EXISTS(SELECT 1 FROM saas.storefront_carts source WHERE source.store_id=selected_abandoned.store_id AND source.id=selected_abandoned.source_cart_id AND source.status='active' AND source.expires_at>p_now)
  THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.abandoned_cart_episodes newer
    JOIN saas.abandoned_cart_episodes issued ON issued.store_id=newer.store_id AND issued.id=selected_token.episode_id
    WHERE newer.store_id=selected_token.store_id AND newer.cart_id=selected_token.cart_id
      AND newer.episode_number>issued.episode_number
  ) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected_token.used_at IS NOT NULL THEN
    IF selected_token.restored_cart_id<>p_cart_id OR NOT EXISTS(
      SELECT 1 FROM saas.storefront_carts cart
      WHERE cart.store_id=selected_token.store_id AND cart.id=p_cart_id
        AND cart.status='active' AND cart.expires_at>p_now
    ) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    -- The raw recovery token is the replay authority. Rotate the deterministic
    -- cart credential to the active application key so an unknown-commit retry
    -- remains usable across application-key rotation.
    UPDATE saas.storefront_cart_credentials SET
      key_id=p_key_id,credential_digest=p_cart_digest,expires_at=p_cart_expires_at
    WHERE store_id=selected_token.store_id AND cart_id=p_cart_id;
    UPDATE saas.storefront_carts SET
      expires_at=p_cart_expires_at,updated_at=GREATEST(updated_at,p_now)
    WHERE store_id=selected_token.store_id AND id=p_cart_id;
    RETURN QUERY SELECT 'restored',pg_catalog.jsonb_build_object(
      'cart',saas.storefront_cart_projection(selected_token.store_id,p_cart_id,p_now),
      'restoredItems',selected_token.restored_items,'omittedItems',selected_token.omitted_items,'adjustedItems',selected_token.adjusted_items
    ); RETURN;
  END IF;
  INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
    VALUES(p_cart_id,selected_token.store_id,'active',1,p_cart_expires_at,p_now,p_now);
  INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
    VALUES(p_cart_id,selected_token.store_id,p_key_id,p_cart_digest,p_cart_expires_at);
  INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)
  SELECT p_cart_id,item.store_id,item.product_id,item.variant_id,
    LEAST(item.quantity,CASE WHEN variant.stock_tracking THEN saas.storefront_available_stock(item.store_id,item.variant_id,p_now,NULL) ELSE item.quantity END,99),
    price.price_cents,pg_catalog.row_number() OVER(ORDER BY item.variant_id)-1,p_now,p_now
  FROM saas.abandoned_cart_episode_items item
  JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id AND product.status='active'
  JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id AND variant.status='active'
  JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) price ON price.outcome='found'
  WHERE item.store_id=selected_token.store_id AND item.episode_id=selected_token.episode_id
    AND (NOT variant.stock_tracking OR saas.storefront_available_stock(item.store_id,item.variant_id,p_now,NULL)>0)
  ORDER BY item.variant_id;
  GET DIAGNOSTICS copied=ROW_COUNT;
  SELECT COUNT(*)-copied INTO omitted FROM saas.abandoned_cart_episode_items item
    WHERE item.store_id=selected_token.store_id AND item.episode_id=selected_token.episode_id;
  SELECT COUNT(*) INTO adjusted FROM saas.abandoned_cart_episode_items source
    JOIN saas.storefront_cart_items restored ON restored.store_id=source.store_id AND restored.cart_id=p_cart_id AND restored.variant_id=source.variant_id
    WHERE source.store_id=selected_token.store_id AND source.episode_id=selected_token.episode_id AND restored.quantity<source.quantity;
  IF copied=0 THEN RAISE EXCEPTION 'COMMERCE_RECOVERY_CART_EMPTY'; END IF;
  INSERT INTO saas.storefront_cart_attribution(store_id,cart_id,first_touch_source,first_touch_medium,first_touch_campaign,
    last_touch_source,last_touch_medium,last_touch_campaign,referrer_host,landing_path_group,device_group,anonymous_session_ref,created_at,updated_at)
  SELECT attribution.store_id,p_cart_id,attribution.first_touch_source,attribution.first_touch_medium,attribution.first_touch_campaign,
    attribution.last_touch_source,attribution.last_touch_medium,attribution.last_touch_campaign,attribution.referrer_host,
    attribution.landing_path_group,attribution.device_group,attribution.anonymous_session_ref,p_now,p_now
  FROM saas.storefront_cart_attribution attribution
  WHERE attribution.store_id=selected_token.store_id AND attribution.cart_id=selected_abandoned.source_cart_id
  ON CONFLICT(store_id,cart_id) DO NOTHING;
  UPDATE saas.abandoned_cart_recovery_tokens SET used_at=p_now,restored_cart_id=p_cart_id,restored_items=copied,omitted_items=omitted,adjusted_items=adjusted
    WHERE store_id=selected_token.store_id AND id=selected_token.id;
  UPDATE saas.abandoned_cart_episodes SET resumed_at=p_now,closed_at=p_now,updated_at=p_now
    WHERE store_id=selected_token.store_id AND id=selected_token.episode_id AND closed_at IS NULL AND resumed_at IS NULL;
  UPDATE saas.abandoned_carts SET source_cart_id=p_cart_id,public_cart_digest=p_cart_digest,status='active',lifecycle_status='resumed',
    abandoned_at=NULL,last_activity_at=p_now,version=version+1,updated_at=p_now
    WHERE store_id=selected_token.store_id AND id=selected_token.cart_id;
  PERFORM saas.commerce_analytics_enqueue_cart_event(selected_token.store_id,selected_token.cart_id,selected_token.episode_id,
    'cart_resumed','cart_resumed:'||selected_token.episode_id::text,selected_abandoned.currency,selected_abandoned.total_cents,p_now);
  RETURN QUERY SELECT 'restored',pg_catalog.jsonb_build_object(
    'cart',saas.storefront_cart_projection(selected_token.store_id,p_cart_id,p_now),'restoredItems',copied,'omittedItems',omitted,'adjustedItems',adjusted
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
    WHERE cart.store_id=p_store_id AND cart.id=p_cart_id AND cart.status<>'archived'
      AND cart.lifecycle_status IN ('abandoned','resumed') AND episode.closed_at IS NULL
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

CREATE FUNCTION saas.commerce_analytics_timezone(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected_timezone text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','analytics.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT setting.config->>'timezone' INTO selected_timezone
  FROM saas.merchant_admin_records setting
  WHERE setting.store_id=p_store_id AND setting.record_kind='general_setting' AND setting.status='active' AND setting.config?'timezone'
  ORDER BY setting.updated_at DESC,setting.id DESC LIMIT 1;
  RETURN QUERY SELECT 'resolved',pg_catalog.to_jsonb(COALESCE(selected_timezone,'Europe/Istanbul'));
END
$function$;

CREATE FUNCTION saas.commerce_analytics_paid_funnel_sessions(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_now timestamptz,p_start_at timestamptz,p_end_at timestamptz,p_filters jsonb
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; selected_count bigint; selected_payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','analytics.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_start_at>=p_end_at OR p_end_at>p_now OR p_end_at-p_start_at>interval '13 months'
    OR p_filters IS NULL OR pg_catalog.jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_filters) key WHERE key<>ALL(ARRAY['currency','device','source','campaign','productId','categoryId']))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  WITH paid_sessions AS (
    SELECT attribution.anonymous_session_ref,orders.paid_at AS occurred_at
    FROM saas.orders orders
    JOIN saas.order_commerce_attribution attribution
      ON attribution.store_id=orders.store_id AND attribution.order_id=orders.id
    WHERE orders.store_id=p_store_id
      AND orders.payment_status IN ('completed','refunded')
      AND orders.paid_at>=p_start_at AND orders.paid_at<p_end_at
      AND (NOT p_filters ? 'currency' OR orders.currency=p_filters->>'currency')
      AND attribution.anonymous_session_ref IS NOT NULL
      AND (NOT p_filters ? 'source' OR attribution.last_touch_source=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR attribution.last_touch_campaign=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR attribution.device_group=p_filters->>'device')
      AND (NOT p_filters ? 'productId' OR EXISTS(
        SELECT 1 FROM saas.order_items item WHERE item.store_id=orders.store_id AND item.order_id=orders.id
          AND item.product_id=(p_filters->>'productId')::uuid))
      AND (NOT p_filters ? 'categoryId' OR EXISTS(
        SELECT 1 FROM saas.storefront_checkout_operations operation
        JOIN LATERAL (
          SELECT candidate.item_snapshot
          FROM saas.storefront_checkout_start_snapshots candidate
          WHERE candidate.store_id=operation.store_id
            AND candidate.cart_id IS NOT DISTINCT FROM operation.cart_id
            AND candidate.intent_id IS NOT DISTINCT FROM operation.intent_id
            AND candidate.attribution_snapshot->>'anonymousSessionRef'=attribution.anonymous_session_ref
            AND candidate.started_at<=operation.committed_at
          ORDER BY candidate.started_at DESC,candidate.id DESC LIMIT 1
        ) snapshot ON true
        CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.item_snapshot) entry(value)
        WHERE operation.store_id=orders.store_id AND operation.order_id=orders.id
          AND entry.value->>'categoryId'=p_filters->>'categoryId'))
    ORDER BY orders.paid_at,attribution.anonymous_session_ref,orders.id
    LIMIT 10001
  ) SELECT COUNT(*),COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'anonymousSessionRef',anonymous_session_ref,'occurredAt',saas.merchant_admin_timestamp(occurred_at)
    ) ORDER BY occurred_at,anonymous_session_ref),'[]'::jsonb)
    INTO selected_count,selected_payload FROM paid_sessions;
  IF selected_count>10000 THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'resolved',selected_payload;
END
$function$;

CREATE FUNCTION saas.commerce_analytics_snapshot(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_now timestamptz,p_start_at timestamptz,p_end_at timestamptz,p_filters jsonb
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'analytics','analytics.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_start_at IS NULL OR p_end_at IS NULL OR p_start_at>=p_end_at OR p_end_at>p_now OR p_end_at-p_start_at>interval '13 months'
    OR p_filters IS NULL OR pg_catalog.jsonb_typeof(p_filters)<>'object'
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_filters) key WHERE key<>ALL(ARRAY['view','device','source','campaign','productId','categoryId','currency','touch','search','lifecycle','contact','brandId','minimumValueMinor','maximumValueMinor','productPage','cartPage','timezone']))
    OR (p_filters ? 'view' AND p_filters->>'view' NOT IN ('overview','funnel','abandoned-carts','acquisition','products','status'))
    OR (p_filters ? 'minimumValueMinor' AND pg_catalog.jsonb_typeof(p_filters->'minimumValueMinor')<>'number')
    OR (p_filters ? 'maximumValueMinor' AND pg_catalog.jsonb_typeof(p_filters->'maximumValueMinor')<>'number')
    OR (p_filters ? 'productPage' AND (pg_catalog.jsonb_typeof(p_filters->'productPage')<>'number'
      OR (p_filters->>'productPage')::numeric<>pg_catalog.trunc((p_filters->>'productPage')::numeric)
      OR (p_filters->>'productPage')::numeric NOT BETWEEN 1 AND 100000))
    OR (p_filters ? 'cartPage' AND (pg_catalog.jsonb_typeof(p_filters->'cartPage')<>'number'
      OR (p_filters->>'cartPage')::numeric<>pg_catalog.trunc((p_filters->>'cartPage')::numeric)
      OR (p_filters->>'cartPage')::numeric NOT BETWEEN 1 AND 100000))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  RETURN QUERY WITH payment_events AS (
    SELECT orders.id AS order_id,orders.paid_at AS captured_at
    FROM saas.orders orders
    WHERE orders.store_id=p_store_id AND orders.paid_at>=p_start_at AND orders.paid_at<p_end_at
      AND COALESCE(p_filters->>'view','all')<>'status'
  ), refund_events AS (
    SELECT orders.id AS order_id,orders.refunded_at
    FROM saas.orders orders
    WHERE orders.store_id=p_store_id AND orders.refunded_at>=p_start_at AND orders.refunded_at<p_end_at
      AND COALESCE(p_filters->>'view','all')<>'status'
  ), order_scope AS (
    SELECT orders.*
    FROM saas.orders orders
    LEFT JOIN saas.order_commerce_attribution attribution
      ON attribution.store_id=orders.store_id AND attribution.order_id=orders.id
    WHERE orders.store_id=p_store_id AND COALESCE(p_filters->>'view','all')<>'status'
      AND (
        orders.paid_at>=p_start_at AND orders.paid_at<p_end_at
        OR orders.refunded_at>=p_start_at AND orders.refunded_at<p_end_at
        OR EXISTS(SELECT 1 FROM saas.order_events period_event
          WHERE period_event.store_id=orders.store_id AND period_event.order_id=orders.id
            AND period_event.created_at>=p_start_at AND period_event.created_at<p_end_at
            AND period_event.event_type='payment_transition' AND period_event.to_value='failed')
        OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episodes period_episode
          WHERE period_episode.store_id=orders.store_id AND period_episode.linked_order_id=orders.id
            AND period_episode.recovered_at>=p_start_at AND period_episode.recovered_at<p_end_at)
      )
      AND (NOT p_filters ? 'currency' OR orders.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'source' OR CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN COALESCE(attribution.first_touch_source,'unknown')
        ELSE COALESCE(attribution.last_touch_source,'unknown') END=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN attribution.first_touch_campaign ELSE attribution.last_touch_campaign END=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR COALESCE(attribution.device_group,'unknown')=p_filters->>'device')
      AND (NOT p_filters ? 'productId' OR EXISTS(SELECT 1 FROM saas.order_items item WHERE item.store_id=orders.store_id AND item.order_id=orders.id AND item.product_id=(p_filters->>'productId')::uuid))
      AND (NOT p_filters ? 'categoryId' OR EXISTS(SELECT 1 FROM saas.order_items item JOIN saas.catalog_product_categories relation ON relation.store_id=item.store_id AND relation.product_id=item.product_id AND relation.category_id=(p_filters->>'categoryId')::uuid WHERE item.store_id=orders.store_id AND item.order_id=orders.id))
      AND (NOT p_filters ? 'brandId' OR EXISTS(SELECT 1 FROM saas.order_items item JOIN saas.catalog_admin_resource_products relation ON relation.store_id=item.store_id AND relation.product_id=item.product_id AND relation.resource_id=(p_filters->>'brandId')::uuid WHERE item.store_id=orders.store_id AND item.order_id=orders.id))
      AND (NOT p_filters ? 'search' OR EXISTS(SELECT 1 FROM saas.order_items item WHERE item.store_id=orders.store_id AND item.order_id=orders.id AND pg_catalog.lower(item.product_name) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%'))
  ), cart_scope AS (
    SELECT cart.*
    FROM saas.abandoned_carts cart
    WHERE cart.store_id=p_store_id AND COALESCE(p_filters->>'view','all') IN ('all','overview','abandoned-carts')
      AND (cart.last_activity_at>=p_start_at AND cart.last_activity_at<p_end_at
        OR cart.candidate_at>=p_start_at AND cart.candidate_at<p_end_at
        OR cart.abandoned_at>=p_start_at AND cart.abandoned_at<p_end_at
        OR cart.recovered_at>=p_start_at AND cart.recovered_at<p_end_at)
      AND (NOT p_filters ? 'currency' OR cart.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'source' OR CASE COALESCE(p_filters->>'touch','last') WHEN 'first' THEN COALESCE(cart.first_touch_source,'unknown') ELSE COALESCE(cart.last_touch_source,'unknown') END=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR CASE COALESCE(p_filters->>'touch','last') WHEN 'first' THEN cart.first_touch_campaign ELSE cart.last_touch_campaign END=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR COALESCE(cart.device_group,'unknown')=p_filters->>'device')
      AND (NOT p_filters ? 'lifecycle' OR cart.lifecycle_status=p_filters->>'lifecycle')
      AND (NOT p_filters ? 'contact' OR CASE p_filters->>'contact' WHEN 'contactable' THEN cart.customer_email IS NOT NULL OR cart.customer_phone IS NOT NULL WHEN 'unavailable' THEN cart.customer_email IS NULL AND cart.customer_phone IS NULL ELSE false END)
      AND (NOT p_filters ? 'minimumValueMinor' OR cart.total_cents>=(p_filters->>'minimumValueMinor')::bigint)
      AND (NOT p_filters ? 'maximumValueMinor' OR cart.total_cents<=(p_filters->>'maximumValueMinor')::bigint)
      AND (NOT p_filters ? 'productId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_items item WHERE item.store_id=cart.store_id AND item.cart_id=cart.id AND item.product_id=(p_filters->>'productId')::uuid))
      AND (NOT p_filters ? 'categoryId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_items item JOIN saas.catalog_product_categories relation ON relation.store_id=item.store_id AND relation.product_id=item.product_id AND relation.category_id=(p_filters->>'categoryId')::uuid WHERE item.store_id=cart.store_id AND item.cart_id=cart.id))
      AND (NOT p_filters ? 'brandId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_items item JOIN saas.catalog_admin_resource_products relation ON relation.store_id=item.store_id AND relation.product_id=item.product_id AND relation.resource_id=(p_filters->>'brandId')::uuid WHERE item.store_id=cart.store_id AND item.cart_id=cart.id))
      AND (NOT p_filters ? 'search' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_items item WHERE item.store_id=cart.store_id AND item.cart_id=cart.id AND pg_catalog.lower(item.product_name) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%'))
  ), episode_scope AS (
    SELECT episode.*
    FROM saas.abandoned_cart_episodes episode
    JOIN saas.abandoned_carts cart ON cart.store_id=episode.store_id AND cart.id=episode.cart_id
    WHERE episode.store_id=p_store_id AND COALESCE(p_filters->>'view','all') IN ('all','overview','abandoned-carts','acquisition','products')
      AND (episode.candidate_at>=p_start_at AND episode.candidate_at<p_end_at
        OR episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at
        OR episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at)
      AND (NOT p_filters ? 'currency' OR episode.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'source' OR CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN COALESCE(episode.first_touch->>'source','unknown')
        ELSE COALESCE(episode.last_touch->>'source','unknown') END=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN episode.first_touch->>'campaign' ELSE episode.last_touch->>'campaign' END=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR COALESCE(CASE COALESCE(p_filters->>'touch','last')
        WHEN 'first' THEN episode.first_touch->>'device' ELSE episode.last_touch->>'device' END,'unknown')=p_filters->>'device')
      AND (NOT p_filters ? 'lifecycle' OR cart.lifecycle_status=p_filters->>'lifecycle')
      AND (NOT p_filters ? 'contact' OR CASE p_filters->>'contact'
        WHEN 'contactable' THEN cart.customer_email IS NOT NULL OR cart.customer_phone IS NOT NULL
        WHEN 'unavailable' THEN cart.customer_email IS NULL AND cart.customer_phone IS NULL ELSE false END)
      AND (NOT p_filters ? 'minimumValueMinor' OR episode.value_minor>=(p_filters->>'minimumValueMinor')::bigint)
      AND (NOT p_filters ? 'maximumValueMinor' OR episode.value_minor<=(p_filters->>'maximumValueMinor')::bigint)
      AND (NOT p_filters ? 'productId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episode_items item WHERE item.store_id=episode.store_id AND item.episode_id=episode.id AND item.product_id=(p_filters->>'productId')::uuid))
      AND (NOT p_filters ? 'categoryId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episode_items item WHERE item.store_id=episode.store_id AND item.episode_id=episode.id AND item.category_id=(p_filters->>'categoryId')::uuid))
      AND (NOT p_filters ? 'brandId' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episode_items item WHERE item.store_id=episode.store_id AND item.episode_id=episode.id AND item.brand_id=(p_filters->>'brandId')::uuid))
      AND (NOT p_filters ? 'search' OR EXISTS(SELECT 1 FROM saas.abandoned_cart_episode_items item WHERE item.store_id=episode.store_id AND item.episode_id=episode.id AND pg_catalog.lower(item.product_name) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%'))
  ), checkout_items AS (
    SELECT snapshot.id AS snapshot_id,
      COALESCE(snapshot.attribution_snapshot->>'anonymousSessionRef','legacy_'||snapshot.id::text) AS session_key,
      snapshot.cart_id,snapshot.intent_id,snapshot.currency,snapshot.started_at AS checkout_started_at,
      (entry.value->>'productId')::uuid AS product_id,(entry.value->>'variantId')::uuid AS variant_id,
      entry.value->>'title' AS product_name,
      COALESCE((entry.value->>'categoryId')::uuid,(SELECT relation.category_id FROM saas.catalog_product_categories relation
        WHERE relation.store_id=snapshot.store_id AND relation.product_id=(entry.value->>'productId')::uuid ORDER BY relation.position,relation.category_id LIMIT 1)) AS category_id,
      (SELECT relation.resource_id FROM saas.catalog_admin_resource_products relation
        JOIN saas.catalog_admin_resources resource ON resource.store_id=relation.store_id AND resource.id=relation.resource_id AND resource.resource_kind='brand'
        WHERE relation.store_id=snapshot.store_id AND relation.product_id=(entry.value->>'productId')::uuid ORDER BY relation.position,relation.resource_id LIMIT 1) AS brand_id,
      COALESCE(snapshot.attribution_snapshot->>'firstTouchSource','unknown') AS first_touch_source,
      snapshot.attribution_snapshot->>'firstTouchCampaign' AS first_touch_campaign,
      COALESCE(snapshot.attribution_snapshot->>'lastTouchSource','unknown') AS last_touch_source,
      snapshot.attribution_snapshot->>'lastTouchCampaign' AS last_touch_campaign,
      COALESCE(snapshot.attribution_snapshot->>'deviceGroup','unknown') AS device_group
    FROM saas.storefront_checkout_start_snapshots snapshot
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(snapshot.item_snapshot) entry(value)
    WHERE snapshot.store_id=p_store_id AND snapshot.started_at>=p_start_at AND snapshot.started_at<p_end_at
      AND COALESCE(p_filters->>'view','all') IN ('all','overview','funnel','abandoned-carts','products')
  ), checkout_scope AS (
    SELECT item.* FROM checkout_items item
    WHERE (NOT p_filters ? 'currency' OR item.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'source' OR CASE COALESCE(p_filters->>'touch','last') WHEN 'first' THEN item.first_touch_source ELSE item.last_touch_source END=p_filters->>'source')
      AND (NOT p_filters ? 'campaign' OR CASE COALESCE(p_filters->>'touch','last') WHEN 'first' THEN item.first_touch_campaign ELSE item.last_touch_campaign END=p_filters->>'campaign')
      AND (NOT p_filters ? 'device' OR item.device_group=p_filters->>'device')
      AND (NOT p_filters ? 'productId' OR item.product_id=(p_filters->>'productId')::uuid)
      AND (NOT p_filters ? 'categoryId' OR item.category_id=(p_filters->>'categoryId')::uuid)
      AND (NOT p_filters ? 'brandId' OR item.brand_id=(p_filters->>'brandId')::uuid)
      AND (NOT p_filters ? 'search' OR pg_catalog.lower(item.product_name) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%')
  ), checkout_start_scope AS (
    SELECT item.session_key,item.currency,MIN(item.checkout_started_at) AS checkout_started_at
    FROM checkout_scope item GROUP BY item.session_key,item.currency
  ), paid_order_metrics AS (
    SELECT orders.currency,COUNT(*) AS paid,COALESCE(SUM(orders.total_cents),0) AS gross
    FROM order_scope orders JOIN payment_events payment ON payment.order_id=orders.id
    WHERE payment.captured_at>=p_start_at AND payment.captured_at<p_end_at GROUP BY orders.currency
  ), refund_metrics AS (
    SELECT orders.currency,COALESCE(SUM(orders.total_cents),0) AS refunded
    FROM order_scope orders JOIN refund_events refund ON refund.order_id=orders.id
    WHERE refund.refunded_at>=p_start_at AND refund.refunded_at<p_end_at GROUP BY orders.currency
  ), order_metrics AS (
    SELECT currencies.currency,COALESCE(paid.paid,0) AS paid,COALESCE(paid.gross,0) AS gross,COALESCE(refund.refunded,0) AS refunded
    FROM (SELECT currency FROM paid_order_metrics UNION SELECT currency FROM refund_metrics) currencies
    LEFT JOIN paid_order_metrics paid USING(currency) LEFT JOIN refund_metrics refund USING(currency)
  ), recovery AS (
    SELECT episode.currency,COUNT(DISTINCT episode.cart_id) AS abandoned,
      COALESCE(SUM(episode.value_minor),0) AS abandoned_value,
      COUNT(DISTINCT episode.cart_id) FILTER(WHERE episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at) AS recovered,
      COALESCE(SUM(orders.total_cents) FILTER(WHERE episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at AND orders.paid_at IS NOT NULL),0) AS recovered_gross,
      COALESCE(SUM(orders.total_cents) FILTER(WHERE orders.refunded_at>=p_start_at AND orders.refunded_at<p_end_at),0) AS recovered_refunded
    FROM episode_scope episode
      LEFT JOIN order_scope orders ON orders.store_id=episode.store_id AND orders.id=episode.linked_order_id
    WHERE episode.store_id=p_store_id AND episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at GROUP BY episode.currency
  ), eligible_metrics AS (
    SELECT episode.currency,COUNT(DISTINCT episode.cart_id) AS eligible
    FROM episode_scope episode
    WHERE episode.store_id=p_store_id AND (
      (episode.candidate_at>=p_start_at AND episode.candidate_at<p_end_at)
      OR (episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at)
    )
    GROUP BY episode.currency
  ), cart_metrics AS (
    SELECT currency,
      COUNT(DISTINCT id) FILTER(WHERE lifecycle_status IN ('active','resumed') AND last_activity_at>=p_start_at AND last_activity_at<p_end_at) AS active,
      COUNT(DISTINCT id) FILTER(WHERE lifecycle_status='candidate' AND candidate_at>=p_start_at AND candidate_at<p_end_at) AS candidate
    FROM cart_scope GROUP BY currency
    HAVING COUNT(*) FILTER(WHERE lifecycle_status IN ('active','resumed') AND last_activity_at>=p_start_at AND last_activity_at<p_end_at)>0
      OR COUNT(*) FILTER(WHERE candidate_at>=p_start_at AND candidate_at<p_end_at)>0
  ), checkout_metrics AS (
    SELECT checkout.currency,COUNT(DISTINCT checkout.session_key) AS checkout_starts,
      COUNT(DISTINCT checkout.session_key) FILTER(WHERE checkout.checkout_started_at+
        pg_catalog.make_interval(hours=>COALESCE((SELECT setting.abandoned_hours FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=p_store_id),24))<=p_end_at) AS eligible_checkout_starts,
      COUNT(DISTINCT checkout.session_key) FILTER(WHERE checkout.checkout_started_at+
        pg_catalog.make_interval(hours=>COALESCE((SELECT setting.abandoned_hours FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=p_store_id),24))<=p_end_at
        AND NOT EXISTS(
          SELECT 1 FROM checkout_scope member
          JOIN saas.storefront_checkout_operations operation
            ON operation.store_id=p_store_id
            AND operation.cart_id IS NOT DISTINCT FROM member.cart_id
            AND operation.intent_id IS NOT DISTINCT FROM member.intent_id
          JOIN payment_events payment ON payment.order_id=operation.order_id
            AND payment.captured_at>=checkout.checkout_started_at
            AND payment.captured_at<=checkout.checkout_started_at+
            pg_catalog.make_interval(hours=>COALESCE((SELECT setting.abandoned_hours FROM saas.store_commerce_analytics_settings setting WHERE setting.store_id=p_store_id),24))
          WHERE member.session_key=checkout.session_key AND member.currency=checkout.currency
        )) AS checkout_abandoned
    FROM checkout_start_scope checkout
    WHERE checkout.checkout_started_at>=p_start_at AND checkout.checkout_started_at<p_end_at
    GROUP BY checkout.currency
  ), failure_facts AS (
    SELECT checkout.snapshot_id,checkout.session_key AS failure_key,checkout.currency,event.occurred_at
    FROM saas.payment_attempt_events event
    JOIN saas.storefront_hosted_checkout_sessions hosted
      ON hosted.store_id=event.store_id AND hosted.payment_attempt_id=event.attempt_id
    JOIN LATERAL (SELECT snapshot.id AS snapshot_id,COALESCE(snapshot.attribution_snapshot->>'anonymousSessionRef','legacy_'||snapshot.id::text) AS session_key,snapshot.currency
      FROM saas.storefront_checkout_start_snapshots snapshot
      WHERE snapshot.store_id=hosted.store_id
        AND snapshot.cart_id IS NOT DISTINCT FROM hosted.cart_id
        AND snapshot.intent_id IS NOT DISTINCT FROM hosted.intent_id
        AND snapshot.started_at<=event.occurred_at
      ORDER BY snapshot.started_at DESC,snapshot.id DESC LIMIT 1) checkout ON true
    WHERE event.store_id=p_store_id AND event.to_status='failed'
    UNION ALL
    SELECT checkout.snapshot_id,checkout.session_key,checkout.currency,event.created_at
    FROM saas.order_events event
    JOIN order_scope orders ON orders.id=event.order_id AND orders.store_id=event.store_id
    JOIN saas.storefront_checkout_operations operation ON operation.store_id=orders.store_id AND operation.order_id=orders.id
    JOIN LATERAL (SELECT snapshot.id AS snapshot_id,COALESCE(snapshot.attribution_snapshot->>'anonymousSessionRef','legacy_'||snapshot.id::text) AS session_key,snapshot.currency
      FROM saas.storefront_checkout_start_snapshots snapshot
      WHERE snapshot.store_id=operation.store_id
        AND snapshot.cart_id IS NOT DISTINCT FROM operation.cart_id
        AND snapshot.intent_id IS NOT DISTINCT FROM operation.intent_id
        AND snapshot.started_at<=event.created_at
      ORDER BY snapshot.started_at DESC,snapshot.id DESC LIMIT 1) checkout ON true
    WHERE event.event_type='payment_transition' AND event.to_value='failed'
  ), failure_metrics AS (
    SELECT failure.currency,COUNT(DISTINCT failure.failure_key) AS failures FROM failure_facts failure
    WHERE failure.occurred_at>=p_start_at AND failure.occurred_at<p_end_at
      AND EXISTS(SELECT 1 FROM checkout_scope checkout
        WHERE checkout.snapshot_id=failure.snapshot_id
          AND checkout.session_key=failure.failure_key
          AND checkout.currency=failure.currency
          AND checkout.checkout_started_at>=p_start_at AND checkout.checkout_started_at<p_end_at)
    GROUP BY failure.currency
  ), currency_set AS (
    SELECT currency FROM order_metrics UNION SELECT currency FROM recovery UNION SELECT currency FROM eligible_metrics UNION SELECT currency FROM cart_metrics UNION SELECT currency FROM checkout_metrics UNION SELECT currency FROM failure_metrics
  ), currency_rows AS (
    SELECT currency_set.currency,COALESCE(cart_metrics.active,0) AS active,COALESCE(cart_metrics.candidate,0) AS candidate,
      COALESCE(eligible_metrics.eligible,0) AS eligible,COALESCE(checkout_metrics.checkout_starts,0) AS checkout_starts,
      COALESCE(checkout_metrics.eligible_checkout_starts,0) AS eligible_checkout_starts,
      COALESCE(checkout_metrics.checkout_abandoned,0) AS checkout_abandoned,COALESCE(failure_metrics.failures,0) AS failures,
      COALESCE(order_metrics.paid,0) AS paid,COALESCE(order_metrics.gross,0) AS gross,COALESCE(order_metrics.refunded,0) AS refunded,
      COALESCE(recovery.abandoned,0) AS abandoned,COALESCE(recovery.abandoned_value,0) AS abandoned_value,
      COALESCE(recovery.recovered,0) AS recovered,COALESCE(recovery.recovered_gross,0) AS recovered_gross,
      COALESCE(recovery.recovered_refunded,0) AS recovered_refunded
    FROM currency_set LEFT JOIN order_metrics USING(currency) LEFT JOIN recovery USING(currency) LEFT JOIN eligible_metrics USING(currency)
      LEFT JOIN cart_metrics USING(currency) LEFT JOIN checkout_metrics USING(currency) LEFT JOIN failure_metrics USING(currency)
  ), attribution_facts AS (
    SELECT touch.kind AS touch,touch.source,touch.medium,touch.campaign,
      orders.currency,1::bigint AS paid,orders.total_cents AS gross,0::bigint AS abandoned,0::bigint AS recovered
    FROM order_scope orders
      JOIN payment_events payment ON payment.order_id=orders.id
      LEFT JOIN saas.order_commerce_attribution attribution ON attribution.store_id=orders.store_id AND attribution.order_id=orders.id
      CROSS JOIN LATERAL (VALUES
        ('first',COALESCE(attribution.first_touch_source,'unknown'),COALESCE(attribution.first_touch_medium,'unknown'),attribution.first_touch_campaign),
        ('last',COALESCE(attribution.last_touch_source,'unknown'),COALESCE(attribution.last_touch_medium,'unknown'),attribution.last_touch_campaign)
      ) touch(kind,source,medium,campaign)
    WHERE orders.store_id=p_store_id AND payment.captured_at>=p_start_at AND payment.captured_at<p_end_at
      AND COALESCE(p_filters->>'view','all') IN ('all','acquisition')
    UNION ALL
    SELECT touch.kind,touch.source,touch.medium,touch.campaign,episode.currency,
      0,0,1,CASE WHEN episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at AND orders.paid_at<p_end_at THEN COALESCE(orders.total_cents,0) ELSE 0 END
    FROM episode_scope episode
      LEFT JOIN order_scope orders ON orders.store_id=episode.store_id AND orders.id=episode.linked_order_id
      CROSS JOIN LATERAL (VALUES
        ('first',COALESCE(episode.first_touch->>'source','unknown'),COALESCE(episode.first_touch->>'medium','unknown'),episode.first_touch->>'campaign'),
        ('last',COALESCE(episode.last_touch->>'source','unknown'),COALESCE(episode.last_touch->>'medium','unknown'),episode.last_touch->>'campaign')
      ) touch(kind,source,medium,campaign)
    WHERE episode.store_id=p_store_id AND episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at
      AND COALESCE(p_filters->>'view','all') IN ('all','acquisition')
  ), attribution_rows AS (
    SELECT touch,source,medium,campaign,currency,SUM(paid) AS paid,SUM(gross) AS gross,SUM(abandoned) AS abandoned,SUM(recovered) AS recovered
    FROM attribution_facts GROUP BY touch,source,medium,campaign,currency
  ), paid_product_facts AS (
    SELECT item.product_id,orders.currency,COUNT(DISTINCT orders.id)::bigint AS paid_orders,
      SUM(item.quantity)::bigint AS quantity,SUM(item.line_total_cents)::bigint AS revenue
    FROM saas.order_items item JOIN order_scope orders ON orders.store_id=item.store_id AND orders.id=item.order_id
      JOIN payment_events payment ON payment.order_id=orders.id
    WHERE item.store_id=p_store_id AND item.product_id IS NOT NULL AND payment.captured_at>=p_start_at AND payment.captured_at<p_end_at
    GROUP BY item.product_id,orders.currency
  ), product_cart_facts AS (
    SELECT item.product_id,item.currency,COUNT(DISTINCT item.session_key)::bigint AS checkout_starts
    FROM checkout_scope item
    WHERE item.checkout_started_at>=p_start_at AND item.checkout_started_at<p_end_at
    GROUP BY item.product_id,item.currency
  ), abandoned_product_facts AS (
    SELECT item.product_id,episode.currency,COUNT(DISTINCT (episode.id,item.product_id))::bigint AS abandoned_appearances
    FROM saas.abandoned_cart_episode_items item
    JOIN episode_scope episode ON episode.store_id=item.store_id AND episode.id=item.episode_id
    WHERE item.store_id=p_store_id AND episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at
    GROUP BY item.product_id,episode.currency
  ), recovered_product_facts AS (
    SELECT item.product_id,orders.currency,COALESCE(SUM(item.line_total_cents),0)::bigint AS recovered_revenue
    FROM episode_scope episode
    JOIN order_scope orders ON orders.store_id=episode.store_id AND orders.id=episode.linked_order_id AND orders.paid_at IS NOT NULL
    JOIN saas.order_items item ON item.store_id=orders.store_id AND item.order_id=orders.id AND item.product_id IS NOT NULL
    WHERE episode.store_id=p_store_id AND episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at
    GROUP BY item.product_id,orders.currency
  ), product_primary_categories AS (
    SELECT DISTINCT ON(relation.store_id,relation.product_id)
      relation.store_id,relation.product_id,category.id AS category_id,category.name AS category_name
    FROM saas.catalog_product_categories relation
    JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id
    WHERE relation.store_id=p_store_id
    ORDER BY relation.store_id,relation.product_id,relation.position,category.id
  ), product_primary_brands AS (
    SELECT DISTINCT ON(relation.store_id,relation.product_id)
      relation.store_id,relation.product_id,brand.id AS brand_id,brand.name AS brand_name
    FROM saas.catalog_admin_resource_products relation
    JOIN saas.catalog_admin_resources brand ON brand.store_id=relation.store_id AND brand.id=relation.resource_id AND brand.resource_kind='brand'
    WHERE relation.store_id=p_store_id
    ORDER BY relation.store_id,relation.product_id,relation.position,brand.id
  ), product_catalog AS (
    SELECT product.id,product.store_id,product.title,product.currency,
      category.category_id,category.category_name,brand.brand_id,brand.brand_name
    FROM saas.products product
    LEFT JOIN product_primary_categories category ON category.store_id=product.store_id AND category.product_id=product.id
    LEFT JOIN product_primary_brands brand ON brand.store_id=product.store_id AND brand.product_id=product.id
    WHERE product.store_id=p_store_id AND COALESCE(p_filters->>'view','all') IN ('all','products')
      AND (NOT p_filters ? 'productId' OR product.id=(p_filters->>'productId')::uuid)
      AND (NOT p_filters ? 'categoryId' OR EXISTS(SELECT 1 FROM saas.catalog_product_categories relation WHERE relation.store_id=product.store_id AND relation.product_id=product.id AND relation.category_id=(p_filters->>'categoryId')::uuid))
      AND (NOT p_filters ? 'brandId' OR EXISTS(SELECT 1 FROM saas.catalog_admin_resource_products relation WHERE relation.store_id=product.store_id AND relation.product_id=product.id AND relation.resource_id=(p_filters->>'brandId')::uuid))
      AND (NOT p_filters ? 'search' OR pg_catalog.lower(product.title) LIKE '%'||pg_catalog.lower(p_filters->>'search')||'%')
  ), product_currencies AS (
    SELECT product.id AS product_id,product.currency
    FROM product_catalog product
    WHERE (NOT p_filters ? 'currency' OR product.currency=p_filters->>'currency')
    UNION SELECT fact.product_id,fact.currency FROM paid_product_facts fact
      JOIN product_catalog product ON product.id=fact.product_id
      WHERE (NOT p_filters ? 'currency' OR fact.currency=p_filters->>'currency')
    UNION SELECT fact.product_id,fact.currency FROM product_cart_facts fact
      JOIN product_catalog product ON product.id=fact.product_id
      WHERE (NOT p_filters ? 'currency' OR fact.currency=p_filters->>'currency')
    UNION SELECT fact.product_id,fact.currency FROM abandoned_product_facts fact
      JOIN product_catalog product ON product.id=fact.product_id
      WHERE (NOT p_filters ? 'currency' OR fact.currency=p_filters->>'currency')
    UNION SELECT fact.product_id,fact.currency FROM recovered_product_facts fact
      JOIN product_catalog product ON product.id=fact.product_id
      WHERE (NOT p_filters ? 'currency' OR fact.currency=p_filters->>'currency')
  ), product_rows AS (
    SELECT product.id AS product_id,product.title,currency.currency,product.category_id,product.category_name,
      product.brand_id,product.brand_name,COALESCE(cart.checkout_starts,0) AS checkout_starts,
      COALESCE(paid.paid_orders,0) AS paid_orders,COALESCE(paid.quantity,0) AS quantity,COALESCE(paid.revenue,0) AS revenue,
      COALESCE(abandoned.abandoned_appearances,0) AS abandoned_appearances,COALESCE(recovered.recovered_revenue,0) AS recovered_revenue
    FROM product_catalog product
    JOIN product_currencies currency ON currency.product_id=product.id
    LEFT JOIN paid_product_facts paid ON paid.product_id=product.id AND paid.currency=currency.currency
    LEFT JOIN product_cart_facts cart ON cart.product_id=product.id AND cart.currency=currency.currency
    LEFT JOIN abandoned_product_facts abandoned ON abandoned.product_id=product.id AND abandoned.currency=currency.currency
    LEFT JOIN recovered_product_facts recovered ON recovered.product_id=product.id AND recovered.currency=currency.currency
    ORDER BY revenue DESC,quantity DESC,product.id,product.currency
    LIMIT 100 OFFSET (COALESCE((p_filters->>'productPage')::integer,1)-1)*100
  ), commerce_series AS (
    SELECT point.starts_at,point.currency,SUM(point.paid_orders)::bigint AS paid_orders,SUM(point.gross)::bigint AS gross,
      SUM(point.abandoned)::bigint AS abandoned,SUM(point.recovered)::bigint AS recovered
    FROM (
      SELECT pg_catalog.date_trunc('day',payment.captured_at,COALESCE(p_filters->>'timezone','Europe/Istanbul')) AS starts_at,orders.currency,1::bigint AS paid_orders,
        orders.total_cents::bigint AS gross,0::bigint AS abandoned,0::bigint AS recovered
      FROM payment_events payment JOIN order_scope orders ON orders.id=payment.order_id
      WHERE payment.captured_at>=p_start_at AND payment.captured_at<p_end_at
      UNION ALL
      SELECT pg_catalog.date_trunc('day',episode.abandoned_at,COALESCE(p_filters->>'timezone','Europe/Istanbul')),episode.currency,0,0,1,0
      FROM episode_scope episode WHERE episode.abandoned_at>=p_start_at AND episode.abandoned_at<p_end_at
      UNION ALL
      SELECT pg_catalog.date_trunc('day',episode.recovered_at,COALESCE(p_filters->>'timezone','Europe/Istanbul')),episode.currency,0,0,0,1
      FROM episode_scope episode WHERE episode.recovered_at>=p_start_at AND episode.recovered_at<p_end_at
    ) point WHERE COALESCE(p_filters->>'view','all') IN ('all','overview')
    GROUP BY point.starts_at,point.currency
  ), cart_candidates AS (
    SELECT cart.* FROM cart_scope cart
    WHERE cart.store_id=p_store_id
      AND COALESCE(p_filters->>'view','all') IN ('all','abandoned-carts')
      AND (cart.last_activity_at>=p_start_at AND cart.last_activity_at<p_end_at OR cart.abandoned_at>=p_start_at AND cart.abandoned_at<p_end_at OR cart.recovered_at>=p_start_at AND cart.recovered_at<p_end_at)
  ), cart_page_rows AS (
    SELECT candidate.* FROM cart_candidates candidate
    WHERE (NOT p_filters ? 'currency' OR candidate.currency=p_filters->>'currency')
      AND (NOT p_filters ? 'lifecycle' OR candidate.lifecycle_status=p_filters->>'lifecycle')
      AND (NOT p_filters ? 'contact' OR CASE p_filters->>'contact' WHEN 'contactable' THEN candidate.customer_email IS NOT NULL OR candidate.customer_phone IS NOT NULL WHEN 'unavailable' THEN candidate.customer_email IS NULL AND candidate.customer_phone IS NULL ELSE false END)
      AND (NOT p_filters ? 'minimumValueMinor' OR candidate.total_cents>=(p_filters->>'minimumValueMinor')::bigint)
      AND (NOT p_filters ? 'maximumValueMinor' OR candidate.total_cents<=(p_filters->>'maximumValueMinor')::bigint)
    ORDER BY candidate.last_activity_at DESC,candidate.id DESC
    LIMIT 100 OFFSET (COALESCE((p_filters->>'cartPage')::integer,1)-1)*100
  ), cart_ranked_items AS (
    SELECT item.store_id,item.cart_id,item.product_name,
      pg_catalog.row_number() OVER(PARTITION BY item.store_id,item.cart_id ORDER BY item.position,item.id) AS item_rank
    FROM saas.abandoned_cart_items item JOIN cart_page_rows page
      ON page.store_id=item.store_id AND page.id=item.cart_id
  ), cart_item_summaries AS (
    SELECT item.store_id,item.cart_id,
      pg_catalog.string_agg(item.product_name,', ' ORDER BY item.item_rank) AS product_summary
    FROM cart_ranked_items item WHERE item.item_rank<=3 GROUP BY item.store_id,item.cart_id
  ), cart_contacted AS (
    SELECT attempt.store_id,attempt.cart_id,true AS contacted
    FROM saas.abandoned_cart_recovery_attempts attempt JOIN cart_page_rows page
      ON page.store_id=attempt.store_id AND page.id=attempt.cart_id
    WHERE attempt.channel IN ('contacted','email','whatsapp') GROUP BY attempt.store_id,attempt.cart_id
  ), cart_rows AS (
    SELECT page.*,COALESCE(summary.product_summary,'Ürün bilgisi yok') AS product_summary,
      COALESCE(contact.contacted,false) AS contacted
    FROM cart_page_rows page
    LEFT JOIN cart_item_summaries summary ON summary.store_id=page.store_id AND summary.cart_id=page.id
    LEFT JOIN cart_contacted contact ON contact.store_id=page.store_id AND contact.cart_id=page.id
  ) SELECT 'resolved',pg_catalog.jsonb_build_object('schemaVersion',1,'rangeStart',saas.merchant_admin_timestamp(p_start_at),'rangeEnd',saas.merchant_admin_timestamp(p_end_at),'currencies',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'currency',currency,'activeCarts',active,'candidateCarts',candidate,'eligibleCarts',eligible,'checkoutStarts',checkout_starts,'eligibleCheckoutStarts',eligible_checkout_starts,
      'checkoutAbandoned',checkout_abandoned,'paymentFailures',failures,'paidOrders',paid,'grossRevenueMinor',gross,
      'refundedMinor',refunded,'abandonedCarts',abandoned,'abandonedValueMinor',abandoned_value,'recoveredCarts',recovered,
      'recoveredGrossMinor',recovered_gross,'recoveredRefundedMinor',recovered_refunded,'recoveredNetMinor',recovered_gross-recovered_refunded
    ) ORDER BY currency) FROM currency_rows),'[]'::jsonb),'attribution',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'touch',touch,'source',source,'medium',medium,'campaign',campaign,'currency',currency,'paidOrders',paid,'grossRevenueMinor',gross,
      'abandonedCarts',abandoned,'recoveredRevenueMinor',recovered) ORDER BY touch,source,medium,campaign,currency) FROM attribution_rows),'[]'::jsonb),
    'products',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'productId',product_id,'title',title,'currency',currency,'categoryId',category_id,'categoryName',category_name,
      'brandId',brand_id,'brandName',brand_name,'checkoutStarts',checkout_starts,'paidOrders',paid_orders,'quantity',quantity,
      'revenueMinor',revenue,'abandonedAppearances',abandoned_appearances,'recoveredRevenueMinor',recovered_revenue
    ) ORDER BY revenue DESC,quantity DESC,product_id,title,currency) FROM product_rows),'[]'::jsonb),
    'productPage',pg_catalog.jsonb_build_object(
      'page',COALESCE((p_filters->>'productPage')::integer,1),'pageSize',100,
      'totalItems',(SELECT COUNT(*) FROM product_currencies),
      'totalPages',CASE WHEN (SELECT COUNT(*) FROM product_currencies)=0 THEN 0 ELSE pg_catalog.ceil((SELECT COUNT(*) FROM product_currencies)::numeric/100)::integer END
    ),
    'series',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('startsAt',saas.merchant_admin_timestamp(starts_at),
      'currency',currency,'paidOrders',paid_orders,'grossRevenueMinor',gross,'abandonedCarts',abandoned,'recoveredCarts',recovered)
      ORDER BY starts_at,currency) FROM commerce_series),'[]'::jsonb),
    'carts',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'id',id,'customerLabel',CASE WHEN customer_name IS NOT NULL THEN pg_catalog.left(customer_name,1)||'***' WHEN customer_email IS NOT NULL THEN pg_catalog.left(customer_email,1)||'***@'||pg_catalog.split_part(customer_email,'@',2) WHEN customer_phone IS NOT NULL THEN '***'||pg_catalog.right(customer_phone,2) ELSE 'Anonim ziyaretçi' END,
      'productSummary',product_summary,'subtotalMinor',subtotal_cents,'discountMinor',discount_cents,'shippingMinor',0,'totalMinor',total_cents,
      'currency',currency,'lastActivityAt',saas.merchant_admin_timestamp(last_activity_at),'abandonedAt',CASE WHEN abandoned_at IS NULL THEN NULL ELSE saas.merchant_admin_timestamp(abandoned_at) END,
      'source',COALESCE(last_touch_source,'unknown'),'campaign',last_touch_campaign,'device',COALESCE(device_group,'unknown'),'lifecycle',lifecycle_status,
      'contactable',customer_email IS NOT NULL OR customer_phone IS NOT NULL,'contacted',contacted
    )) ORDER BY last_activity_at DESC,id DESC) FROM cart_rows),'[]'::jsonb),
    'cartPage',pg_catalog.jsonb_build_object(
      'page',COALESCE((p_filters->>'cartPage')::integer,1),'pageSize',100,
      'totalItems',(SELECT COUNT(*) FROM cart_candidates),
      'totalPages',CASE WHEN (SELECT COUNT(*) FROM cart_candidates)=0 THEN 0 ELSE pg_catalog.ceil((SELECT COUNT(*) FROM cart_candidates)::numeric/100)::integer END
    ),
    'worker',saas.commerce_analytics_worker_status(p_store_id,p_now))
    ;
END
$function$;

CREATE FUNCTION saas.commerce_analytics_snapshot(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,
  p_now timestamptz,p_start_at timestamptz,p_end_at timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT * FROM saas.commerce_analytics_snapshot(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_start_at,p_end_at,'{}'::jsonb)
$function$;

REVOKE ALL ON saas.store_analytics_hostnames,saas.store_commerce_analytics_settings,saas.storefront_cart_attribution,saas.storefront_intent_attribution,saas.order_commerce_attribution,saas.abandoned_cart_episodes,saas.abandoned_cart_episode_items,saas.storefront_checkout_start_snapshots,
  saas.abandoned_cart_recovery_tokens,saas.abandoned_cart_recovery_attempts
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA saas FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.public_checkout_quote_without_commerce_analytics(text,timestamptz,text,jsonb)
FROM celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_evaluate_carts(timestamptz,integer),saas.analytics_outbox_claim_v2(timestamptz,integer,interval),
  saas.analytics_outbox_requeue_dead_letter(uuid,timestamptz),
  saas.commerce_analytics_reconcile_all_hostnames(timestamptz,text,integer) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_snapshot(uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz,timestamptz,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_paid_funnel_sessions(uuid,uuid,uuid,uuid,text,bigint,timestamptz,timestamptz,timestamptz,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_timezone(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_analytics_settings_update(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,integer,integer,integer,boolean,integer,integer,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_cart_recovery_link_issue(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,integer) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.commerce_cart_recovery_attempt_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.public_cart_recovery_restore(text,timestamptz,text,uuid,text,text,timestamptz) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_cart_attribution_record(text,timestamptz,jsonb,jsonb) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_checkout_quote(text,timestamptz,text,jsonb,jsonb) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer,jsonb) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_checkout_quote(text,timestamptz,text,jsonb) TO celebix_saas_host_resolver;

COMMIT;
