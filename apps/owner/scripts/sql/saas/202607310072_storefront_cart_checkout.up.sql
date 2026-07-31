-- Phase 4B durable public storefront cart, checkout, receipt, and guest-account authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure('saas.public_storefront_authorized(uuid,text,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.resolve_effective_variant_price(uuid,uuid,text,timestamp with time zone,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.built_in_payment_method_config_valid(text,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid(text,jsonb)') IS NULL
    OR pg_catalog.to_regclass('saas.orders') IS NULL
    OR pg_catalog.to_regclass('saas.inventory_movements') IS NULL
    OR pg_catalog.to_regclass('saas.store_policy_pages') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_carts') IS NOT NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CART_CHECKOUT_SOURCE_INVALID'; END IF;
END
$f$;

ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb)
  RENAME TO merchant_admin_config_valid_without_storefront_checkout;
REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid_without_storefront_checkout(text,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT CASE WHEN p_kind='shipping_setting' THEN
    saas.merchant_admin_config_valid_without_storefront_checkout(
      p_kind,p_config-'shippingPriceCents'
    )
    AND (
      NOT p_config?'shippingPriceCents'
      OR (
        pg_catalog.jsonb_typeof(p_config->'shippingPriceCents')='number'
        AND (p_config->>'shippingPriceCents')~'^(0|[1-9][0-9]{0,8})$'
        AND (p_config->>'shippingPriceCents')::bigint BETWEEN 0 AND 100000000
      )
    )
  ELSE saas.merchant_admin_config_valid_without_storefront_checkout(p_kind,p_config) END
$f$;
REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid(text,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE TABLE saas.storefront_carts(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  status text NOT NULL CHECK(status IN('active','converted','expired')),
  version bigint NOT NULL CHECK(version>0),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(store_id,id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(updated_at>=created_at AND expires_at>created_at)
);

CREATE TABLE saas.storefront_cart_credentials(
  cart_id uuid NOT NULL,
  store_id uuid NOT NULL,
  key_id text NOT NULL CHECK(key_id~'^[a-z0-9][a-z0-9_-]{0,31}$'),
  credential_digest char(64) NOT NULL CHECK(credential_digest~'^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,cart_id),
  UNIQUE(store_id,key_id,credential_digest),
  FOREIGN KEY(store_id,cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.storefront_cart_items(
  cart_id uuid NOT NULL,
  store_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99),
  unit_price_cents bigint NOT NULL CHECK(unit_price_cents BETWEEN 0 AND 8000000000),
  position integer NOT NULL CHECK(position BETWEEN 0 AND 99),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,cart_id,variant_id),
  UNIQUE(store_id,cart_id,position) DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(store_id,cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,variant_id) REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CHECK(updated_at>=created_at)
);

CREATE TABLE saas.storefront_cart_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK(operation_kind IN('add','quantity','remove')),
  payload_fingerprint char(64) NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=131072),
  committed_at timestamptz NOT NULL,
  FOREIGN KEY(store_id,cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT
);

CREATE TABLE saas.storefront_checkout_intents(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind='buy_now'),
  status text NOT NULL CHECK(status IN('active','converted','expired')),
  key_id text NOT NULL CHECK(key_id~'^[a-z0-9][a-z0-9_-]{0,31}$'),
  credential_digest char(64) NOT NULL CHECK(credential_digest~'^[a-f0-9]{64}$'),
  product_id uuid NOT NULL,
  variant_id uuid NOT NULL,
  quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 99),
  unit_price_cents bigint NOT NULL CHECK(unit_price_cents BETWEEN 0 AND 8000000000),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(store_id,id),
  UNIQUE(store_id,key_id,credential_digest),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,variant_id) REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CHECK(expires_at>created_at)
);

CREATE TABLE saas.storefront_customer_credentials(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  key_id text NOT NULL CHECK(key_id~'^[a-z0-9][a-z0-9_-]{0,31}$'),
  credential_digest char(64) NOT NULL CHECK(credential_digest~'^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  UNIQUE(store_id,id),
  UNIQUE(store_id,key_id,credential_digest),
  FOREIGN KEY(store_id,customer_id) REFERENCES saas.customers(store_id,id) ON DELETE RESTRICT,
  CHECK(last_seen_at>=created_at AND expires_at>created_at)
);

CREATE TABLE saas.storefront_order_receipts(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  order_id uuid NOT NULL,
  customer_credential_id uuid NOT NULL,
  key_id text NOT NULL CHECK(key_id~'^[a-z0-9][a-z0-9_-]{0,31}$'),
  credential_digest char(64) NOT NULL CHECK(credential_digest~'^[a-f0-9]{64}$'),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  UNIQUE(store_id,id),
  UNIQUE(store_id,key_id,credential_digest),
  UNIQUE(store_id,order_id),
  FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,customer_credential_id) REFERENCES saas.storefront_customer_credentials(store_id,id) ON DELETE RESTRICT,
  CHECK(expires_at>created_at)
);

CREATE TABLE saas.storefront_checkout_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid,
  intent_id uuid,
  order_id uuid NOT NULL,
  payload_fingerprint char(64) NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=262144),
  committed_at timestamptz NOT NULL,
  FOREIGN KEY(store_id,cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,intent_id) REFERENCES saas.storefront_checkout_intents(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  CHECK((cart_id IS NOT NULL)::integer+(intent_id IS NOT NULL)::integer=1)
);

CREATE INDEX storefront_carts_expiry_idx ON saas.storefront_carts(store_id,status,expires_at,id);
CREATE INDEX storefront_cart_items_order_idx ON saas.storefront_cart_items(store_id,cart_id,position,variant_id);
CREATE INDEX storefront_cart_operations_cart_idx ON saas.storefront_cart_operations(store_id,cart_id,committed_at,operation_id);
CREATE INDEX storefront_checkout_intents_expiry_idx ON saas.storefront_checkout_intents(store_id,status,expires_at,id);
CREATE INDEX storefront_customer_credentials_customer_idx ON saas.storefront_customer_credentials(store_id,customer_id,expires_at DESC,id);
CREATE INDEX storefront_order_receipts_customer_idx ON saas.storefront_order_receipts(store_id,customer_credential_id,created_at DESC,id);
CREATE INDEX storefront_checkout_operations_order_idx ON saas.storefront_checkout_operations(store_id,order_id,committed_at,operation_id);

DO $f$ DECLARE table_name text; BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'storefront_carts','storefront_cart_credentials','storefront_cart_items',
    'storefront_cart_operations','storefront_checkout_intents',
    'storefront_customer_credentials','storefront_order_receipts',
    'storefront_checkout_operations'
  ] LOOP
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE pg_catalog.format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',table_name);
  END LOOP;
END $f$;

REVOKE ALL ON saas.storefront_carts,saas.storefront_cart_credentials,
  saas.storefront_cart_items,saas.storefront_cart_operations,
  saas.storefront_checkout_intents,saas.storefront_customer_credentials,
  saas.storefront_order_receipts,saas.storefront_checkout_operations
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE TRIGGER storefront_cart_operations_immutable
  BEFORE UPDATE OR DELETE ON saas.storefront_cart_operations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();
CREATE TRIGGER storefront_checkout_operations_immutable
  BEFORE UPDATE OR DELETE ON saas.storefront_checkout_operations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();

CREATE FUNCTION saas.storefront_commerce_uuid(p_seed text)
RETURNS uuid LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT (
    pg_catalog.substr(pg_catalog.md5(p_seed),1,8)||'-'||
    pg_catalog.substr(pg_catalog.md5(p_seed),9,4)||'-4'||
    pg_catalog.substr(pg_catalog.md5(p_seed),14,3)||'-8'||
    pg_catalog.substr(pg_catalog.md5(p_seed),18,3)||'-'||
    pg_catalog.substr(pg_catalog.md5(p_seed),21,12)
  )::uuid
$f$;

CREATE FUNCTION saas.storefront_commerce_timestamp(p_value timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$f$;

CREATE FUNCTION saas.storefront_credential_candidates_valid(p_candidates jsonb,p_allow_empty boolean DEFAULT false)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
  SELECT p_candidates IS NOT NULL
    AND pg_catalog.jsonb_typeof(p_candidates)='array'
    AND (
      (p_allow_empty AND pg_catalog.jsonb_array_length(p_candidates) BETWEEN 0 AND 16)
      OR (NOT p_allow_empty AND pg_catalog.jsonb_array_length(p_candidates) BETWEEN 1 AND 16)
    )
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_candidates) candidate(value)
      WHERE pg_catalog.jsonb_typeof(candidate.value)<>'object'
        OR (SELECT pg_catalog.array_agg(field.key ORDER BY field.key) FROM pg_catalog.jsonb_object_keys(candidate.value) field(key))
          IS DISTINCT FROM ARRAY['digest','keyId']::text[]
        OR pg_catalog.jsonb_typeof(candidate.value->'keyId')<>'string'
        OR candidate.value->>'keyId'!~'^[a-z0-9][a-z0-9_-]{0,31}$'
        OR pg_catalog.jsonb_typeof(candidate.value->'digest')<>'string'
        OR candidate.value->>'digest'!~'^[a-f0-9]{64}$'
    )
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(p_candidates))=
        (SELECT pg_catalog.count(DISTINCT ((value->>'keyId')||':'||(value->>'digest'))) FROM pg_catalog.jsonb_array_elements(p_candidates))
$f$;

CREATE FUNCTION saas.storefront_public_store(p_hostname text,p_now timestamptz)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT domain.store_id
  FROM saas.store_domains domain
  JOIN saas.stores store ON store.id=domain.store_id AND store.status='active'
  WHERE p_now IS NOT NULL AND pg_catalog.isfinite(p_now)
    AND p_hostname IS NOT NULL AND p_hostname=pg_catalog.lower(p_hostname)
    AND pg_catalog.char_length(p_hostname) BETWEEN 3 AND 253
    AND p_hostname~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    AND domain.hostname=p_hostname AND domain.status='active' AND domain.verified_at<=p_now
    AND saas.public_storefront_authorized(domain.store_id,p_hostname,p_now)
  LIMIT 1
$f$;

REVOKE ALL ON FUNCTION
  saas.storefront_commerce_uuid(text),
  saas.storefront_commerce_timestamp(timestamptz),
  saas.storefront_credential_candidates_valid(jsonb,boolean),
  saas.storefront_public_store(text,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.public_cart_resolve(
  p_hostname text,p_now timestamptz,p_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_cart saas.storefront_carts%ROWTYPE;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_credentials,false) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT cart.* INTO selected_cart
  FROM saas.storefront_carts cart
  JOIN saas.storefront_cart_credentials credential
    ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
    ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE cart.store_id=selected_store
  ORDER BY cart.created_at DESC,cart.id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected_cart.status<>'active' OR selected_cart.expires_at<=p_now THEN
    RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'found',saas.storefront_cart_projection(selected_store,selected_cart.id,p_now);
END
$f$;

CREATE FUNCTION saas.public_cart_mutate(
  p_hostname text,p_now timestamptz,p_credentials jsonb,
  p_cart_id uuid,p_cart_key_id text,p_cart_digest text,p_cart_expires_at timestamptz,
  p_operation_id uuid,p_fingerprint text,p_action text,p_expected_version bigint,
  p_product_id uuid,p_variant_id uuid,p_quantity integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_cart saas.storefront_carts%ROWTYPE;
  existing_operation saas.storefront_cart_operations%ROWTYPE;
  resolved_price record; selected_variant saas.product_variants%ROWTYPE;
  projection jsonb; selected_position integer; created boolean:=false;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_cart_id IS NULL OR p_operation_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_action IS NULL OR p_action NOT IN('add','quantity','remove')
    OR p_expected_version IS NULL OR p_expected_version<0
    OR NOT saas.storefront_credential_candidates_valid(p_credentials,true)
    OR pg_catalog.jsonb_array_length(p_credentials)=0 AND (
      p_action<>'add' OR p_expected_version<>0
      OR p_cart_key_id IS NULL OR p_cart_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
      OR p_cart_digest IS NULL OR p_cart_digest!~'^[a-f0-9]{64}$'
      OR p_cart_expires_at IS NULL OR p_cart_expires_at<=p_now
      OR p_cart_expires_at>p_now+INTERVAL '31 days'
    )
    OR pg_catalog.jsonb_array_length(p_credentials)>0 AND (
      p_cart_key_id IS NOT NULL OR p_cart_digest IS NOT NULL OR p_cart_expires_at IS NOT NULL
    )
    OR p_product_id IS NULL OR p_variant_id IS NULL
    OR (p_action IN('add','quantity') AND (p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 99))
    OR (p_action='remove' AND p_quantity IS NOT NULL)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.cart.operation:'||p_operation_id::text,0));
  SELECT * INTO existing_operation FROM saas.storefront_cart_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.store_id<>selected_store OR existing_operation.payload_fingerprint<>p_fingerprint OR existing_operation.operation_kind<>p_action THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',existing_operation.result_payload; END IF;
    RETURN;
  END IF;

  IF pg_catalog.jsonb_array_length(p_credentials)=0 THEN
    INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
      VALUES(p_cart_id,selected_store,'active',1,p_cart_expires_at,p_now,p_now);
    INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
      VALUES(p_cart_id,selected_store,p_cart_key_id,p_cart_digest,p_cart_expires_at);
    SELECT * INTO selected_cart FROM saas.storefront_carts WHERE store_id=selected_store AND id=p_cart_id FOR UPDATE;
    created:=true;
  ELSE
    SELECT cart.* INTO selected_cart
    FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store
    ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF selected_cart.status<>'active' OR selected_cart.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    IF selected_cart.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.storefront_cart_projection(selected_store,selected_cart.id,p_now); RETURN; END IF;
  END IF;

  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
  WHERE variant.store_id=selected_store AND variant.id=p_variant_id AND variant.product_id=p_product_id AND variant.status='active'
  FOR UPDATE OF variant;
  IF NOT FOUND THEN
    IF created THEN DELETE FROM saas.storefront_cart_credentials WHERE store_id=selected_store AND cart_id=selected_cart.id; DELETE FROM saas.storefront_carts WHERE store_id=selected_store AND id=selected_cart.id; END IF;
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO resolved_price FROM saas.resolve_effective_variant_price(selected_store,p_variant_id,'storefront',p_now,NULL);
  IF resolved_price.outcome<>'found' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;

  IF p_action='add' THEN
    IF selected_variant.stock_tracking AND selected_variant.stock_quantity<p_quantity THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN; END IF;
    SELECT COALESCE(pg_catalog.max(position),-1)+1 INTO selected_position FROM saas.storefront_cart_items WHERE store_id=selected_store AND cart_id=selected_cart.id;
    IF selected_position>99 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)
      VALUES(selected_cart.id,selected_store,p_product_id,p_variant_id,p_quantity,resolved_price.price_cents,selected_position,p_now,p_now)
    ON CONFLICT(store_id,cart_id,variant_id) DO UPDATE SET
      quantity=LEAST(99,saas.storefront_cart_items.quantity+EXCLUDED.quantity),
      unit_price_cents=EXCLUDED.unit_price_cents,updated_at=p_now;
  ELSIF p_action='quantity' THEN
    UPDATE saas.storefront_cart_items SET quantity=p_quantity,unit_price_cents=resolved_price.price_cents,updated_at=p_now
    WHERE store_id=selected_store AND cart_id=selected_cart.id AND product_id=p_product_id AND variant_id=p_variant_id;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF selected_variant.stock_tracking AND selected_variant.stock_quantity<p_quantity THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN; END IF;
  ELSE
    DELETE FROM saas.storefront_cart_items WHERE store_id=selected_store AND cart_id=selected_cart.id AND product_id=p_product_id AND variant_id=p_variant_id;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  END IF;

  IF NOT created THEN UPDATE saas.storefront_carts SET version=version+1,updated_at=p_now WHERE store_id=selected_store AND id=selected_cart.id; END IF;
  projection:=pg_catalog.jsonb_build_object('credentialCreated',created,'cart',saas.storefront_cart_projection(selected_store,selected_cart.id,p_now));
  INSERT INTO saas.storefront_cart_operations(operation_id,store_id,cart_id,operation_kind,payload_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,selected_store,selected_cart.id,p_action,p_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'committed',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END
$f$;

CREATE FUNCTION saas.public_buy_now_create(
  p_hostname text,p_now timestamptz,p_intent_id uuid,p_key_id text,p_digest text,
  p_expires_at timestamptz,p_product_id uuid,p_variant_id uuid,p_quantity integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_variant saas.product_variants%ROWTYPE; resolved_price record;
BEGIN
  IF p_intent_id IS NULL OR p_key_id IS NULL OR p_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
    OR p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$'
    OR p_expires_at IS NULL OR p_expires_at<=p_now OR p_expires_at>p_now+INTERVAL '15 minutes'
    OR p_product_id IS NULL OR p_variant_id IS NULL OR p_quantity IS NULL OR p_quantity NOT BETWEEN 1 AND 99
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT variant.* INTO selected_variant FROM saas.product_variants variant
  JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
  WHERE variant.store_id=selected_store AND variant.id=p_variant_id AND variant.product_id=p_product_id AND variant.status='active'
  FOR KEY SHARE OF variant;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected_variant.stock_tracking AND selected_variant.stock_quantity<p_quantity THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN; END IF;
  SELECT * INTO resolved_price FROM saas.resolve_effective_variant_price(selected_store,p_variant_id,'storefront',p_now,NULL);
  IF resolved_price.outcome<>'found' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.storefront_checkout_intents(id,store_id,kind,status,key_id,credential_digest,product_id,variant_id,quantity,unit_price_cents,expires_at,created_at)
    VALUES(p_intent_id,selected_store,'buy_now','active',p_key_id,p_digest,p_product_id,p_variant_id,p_quantity,resolved_price.price_cents,p_expires_at,p_now);
  RETURN QUERY SELECT 'committed',pg_catalog.jsonb_build_object('intentKind','buy_now');
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END
$f$;

CREATE FUNCTION saas.public_checkout_quote(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_cart saas.storefront_carts%ROWTYPE;
  selected_intent saas.storefront_checkout_intents%ROWTYPE; cart_payload jsonb;
  payments jsonb; shipping jsonb; drift boolean:=false;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN('cart','buy_now') OR NOT saas.storefront_credential_candidates_valid(p_credentials,false) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  shipping:=saas.storefront_shipping_projection(selected_store);
  IF shipping IS NULL THEN RETURN QUERY SELECT 'shipping_unavailable',NULL::jsonb; RETURN; END IF;
  payments:=saas.storefront_payment_methods_projection(selected_store);
  IF pg_catalog.jsonb_array_length(payments)=0 THEN RETURN QUERY SELECT 'payment_unavailable',NULL::jsonb; RETURN; END IF;
  IF p_kind='cart' THEN
    SELECT cart.* INTO selected_cart FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF selected_cart.status<>'active' OR selected_cart.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    IF NOT EXISTS(SELECT 1 FROM saas.storefront_cart_items WHERE store_id=selected_store AND cart_id=selected_cart.id) THEN RETURN QUERY SELECT 'cart_empty',NULL::jsonb; RETURN; END IF;
    SELECT EXISTS(
      SELECT 1 FROM saas.storefront_cart_items item
      CROSS JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) resolved
      WHERE item.store_id=selected_store AND item.cart_id=selected_cart.id
        AND (resolved.outcome<>'found' OR resolved.price_cents<>item.unit_price_cents)
    ) INTO drift;
    IF drift THEN RETURN QUERY SELECT 'price_changed',saas.storefront_cart_projection(selected_store,selected_cart.id,p_now); RETURN; END IF;
    cart_payload:=saas.storefront_cart_projection(selected_store,selected_cart.id,p_now);
  ELSE
    SELECT intent.* INTO selected_intent FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=selected_store ORDER BY intent.created_at DESC,intent.id LIMIT 1 FOR UPDATE OF intent;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    IF selected_intent.status<>'active' OR selected_intent.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    SELECT resolved.outcome<>'found' OR resolved.price_cents<>selected_intent.unit_price_cents INTO drift
    FROM saas.resolve_effective_variant_price(selected_store,selected_intent.variant_id,'storefront',p_now,NULL) resolved;
    IF drift THEN RETURN QUERY SELECT 'price_changed',saas.storefront_intent_projection(selected_store,selected_intent.id,p_now); RETURN; END IF;
    cart_payload:=saas.storefront_intent_projection(selected_store,selected_intent.id,p_now);
  END IF;
  IF NOT COALESCE((cart_payload->>'checkoutReady')::boolean,false) THEN RETURN QUERY SELECT 'stock_unavailable',cart_payload; RETURN; END IF;
  RETURN QUERY SELECT 'quoted',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'cart',cart_payload,'paymentMethods',payments,
    'estimatedDays',shipping->'estimatedDays'
  ));
END
$f$;

CREATE FUNCTION saas.public_checkout_complete(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_delivery jsonb,p_payment_kind text,
  p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
  p_receipt_id uuid,p_receipt_key_id text,p_receipt_digest text,p_receipt_expires_at timestamptz,
  p_customer_credential_id uuid,p_customer_key_id text,p_customer_digest text,p_customer_expires_at timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_cart saas.storefront_carts%ROWTYPE;
  selected_intent saas.storefront_checkout_intents%ROWTYPE;
  existing_operation saas.storefront_checkout_operations%ROWTYPE;
  selected_payment saas.payment_methods%ROWTYPE; selected_shipping jsonb;
  selected_customer saas.customers%ROWTYPE; selected_address saas.customer_addresses%ROWTYPE;
  line record; resolved_price record; cart_payload jsonb; receipt_payload jsonb; result jsonb;
  source_cart_id uuid; source_intent_id uuid; subtotal bigint:=0; shipping bigint:=0;
  order_number text; position integer:=0;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN('cart','buy_now')
    OR NOT saas.storefront_credential_candidates_valid(p_credentials,false)
    OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR NOT saas.storefront_delivery_valid(p_delivery)
    OR p_payment_kind IS NULL OR p_payment_kind NOT IN('bank_transfer','cash_on_delivery')
    OR p_order_id IS NULL OR p_customer_id IS NULL OR p_address_id IS NULL OR p_event_id IS NULL
    OR p_receipt_id IS NULL OR p_customer_credential_id IS NULL
    OR p_receipt_key_id IS NULL OR p_receipt_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
    OR p_receipt_digest IS NULL OR p_receipt_digest!~'^[a-f0-9]{64}$'
    OR p_receipt_expires_at IS NULL OR p_receipt_expires_at<=p_now OR p_receipt_expires_at>p_now+INTERVAL '1 day'
    OR p_customer_key_id IS NULL OR p_customer_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
    OR p_customer_digest IS NULL OR p_customer_digest!~'^[a-f0-9]{64}$'
    OR p_customer_expires_at IS NULL OR p_customer_expires_at<=p_now OR p_customer_expires_at>p_now+INTERVAL '31 days'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront.checkout.operation:'||p_operation_id::text,0));
  SELECT * INTO existing_operation FROM saas.storefront_checkout_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.store_id<>selected_store OR existing_operation.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',existing_operation.result_payload; END IF;
    RETURN;
  END IF;

  IF p_kind='cart' THEN
    SELECT cart.* INTO selected_cart FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    source_cart_id:=selected_cart.id;
    IF selected_cart.status<>'active' OR selected_cart.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    IF selected_cart.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',saas.storefront_cart_projection(selected_store,selected_cart.id,p_now); RETURN; END IF;
    IF NOT EXISTS(SELECT 1 FROM saas.storefront_cart_items WHERE store_id=selected_store AND cart_id=selected_cart.id) THEN RETURN QUERY SELECT 'cart_empty',NULL::jsonb; RETURN; END IF;
    cart_payload:=saas.storefront_cart_projection(selected_store,selected_cart.id,p_now);
  ELSE
    SELECT intent.* INTO selected_intent FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=selected_store ORDER BY intent.created_at DESC,intent.id LIMIT 1 FOR UPDATE OF intent;
    IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
    source_intent_id:=selected_intent.id;
    IF selected_intent.status<>'active' OR selected_intent.expires_at<=p_now THEN RETURN QUERY SELECT 'cart_expired',NULL::jsonb; RETURN; END IF;
    IF p_expected_version<>1 THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
    cart_payload:=saas.storefront_intent_projection(selected_store,selected_intent.id,p_now);
  END IF;

  IF cart_payload IS NULL OR NOT COALESCE((cart_payload->>'checkoutReady')::boolean,false) THEN
    RETURN QUERY SELECT 'stock_unavailable',cart_payload; RETURN;
  END IF;
  selected_shipping:=saas.storefront_shipping_projection(selected_store);
  IF selected_shipping IS NULL THEN RETURN QUERY SELECT 'shipping_unavailable',NULL::jsonb; RETURN; END IF;
  shipping:=(selected_shipping->>'shippingCents')::bigint;
  SELECT * INTO selected_payment FROM saas.payment_methods method
  WHERE method.store_id=selected_store AND method.kind=p_payment_kind AND method.state='active'
    AND saas.built_in_payment_method_config_valid(method.kind,method.config)
  ORDER BY method.position,method.id LIMIT 1 FOR KEY SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'payment_unavailable',NULL::jsonb; RETURN; END IF;

  IF p_kind='cart' THEN
    FOR line IN
      SELECT item.*,variant.stock_tracking,variant.stock_quantity,variant.title variant_title,
        variant.sku,product.title product_title,product.slug
      FROM saas.storefront_cart_items item
      JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id
      JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id
      WHERE item.store_id=selected_store AND item.cart_id=source_cart_id
      ORDER BY item.position,item.variant_id FOR UPDATE OF variant
    LOOP
      SELECT * INTO resolved_price FROM saas.resolve_effective_variant_price(selected_store,line.variant_id,'storefront',p_now,NULL);
      IF resolved_price.outcome<>'found' OR resolved_price.price_cents<>line.unit_price_cents THEN RETURN QUERY SELECT 'price_changed',cart_payload; RETURN; END IF;
      IF line.stock_tracking AND line.stock_quantity<line.quantity THEN RETURN QUERY SELECT 'stock_unavailable',cart_payload; RETURN; END IF;
      subtotal:=subtotal+resolved_price.price_cents*line.quantity;
    END LOOP;
  ELSE
    SELECT variant.stock_tracking,variant.stock_quantity,variant.title variant_title,variant.sku,
      product.title product_title,product.slug,selected_intent.product_id,selected_intent.variant_id,
      selected_intent.quantity,selected_intent.unit_price_cents,0 position
    INTO line
    FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=selected_store AND variant.id=selected_intent.variant_id AND product.id=selected_intent.product_id
    FOR UPDATE OF variant;
    SELECT * INTO resolved_price FROM saas.resolve_effective_variant_price(selected_store,line.variant_id,'storefront',p_now,NULL);
    IF resolved_price.outcome<>'found' OR resolved_price.price_cents<>line.unit_price_cents THEN RETURN QUERY SELECT 'price_changed',cart_payload; RETURN; END IF;
    IF line.stock_tracking AND line.stock_quantity<line.quantity THEN RETURN QUERY SELECT 'stock_unavailable',cart_payload; RETURN; END IF;
    subtotal:=resolved_price.price_cents*line.quantity;
  END IF;

  SELECT customer.* INTO selected_customer FROM saas.customers customer
  WHERE customer.store_id=selected_store AND customer.email=p_delivery->'contact'->>'email'
  FOR UPDATE;
  IF FOUND THEN
    IF selected_customer.status<>'active' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    UPDATE saas.customers SET first_name=p_delivery->'contact'->>'firstName',last_name=p_delivery->'contact'->>'lastName',
      phone=p_delivery->'contact'->>'phone',version=version+1,updated_at=p_now
    WHERE store_id=selected_store AND id=selected_customer.id RETURNING * INTO selected_customer;
  ELSE
    INSERT INTO saas.customers(id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at)
      VALUES(p_customer_id,selected_store,'active',p_delivery->'contact'->>'firstName',p_delivery->'contact'->>'lastName',
        p_delivery->'contact'->>'email',p_delivery->'contact'->>'phone',1,p_now,p_now)
      RETURNING * INTO selected_customer;
  END IF;
  SELECT address.* INTO selected_address FROM saas.customer_addresses address
  WHERE address.store_id=selected_store AND address.customer_id=selected_customer.id AND address.is_default FOR UPDATE;
  IF FOUND THEN
    UPDATE saas.customer_addresses SET recipient_name=selected_customer.first_name||' '||selected_customer.last_name,
      line1=p_delivery->'shippingAddress'->>'line1',line2=p_delivery->'shippingAddress'->>'line2',
      city=p_delivery->'shippingAddress'->>'city',district=p_delivery->'shippingAddress'->>'district',
      postal_code=p_delivery->'shippingAddress'->>'postalCode',country=p_delivery->'shippingAddress'->>'country',
      version=version+1,updated_at=p_now
    WHERE store_id=selected_store AND id=selected_address.id RETURNING * INTO selected_address;
  ELSE
    INSERT INTO saas.customer_addresses(id,store_id,customer_id,label,recipient_name,line1,line2,city,district,postal_code,country,is_default,version,created_at,updated_at)
      VALUES(p_address_id,selected_store,selected_customer.id,'Teslimat',selected_customer.first_name||' '||selected_customer.last_name,
        p_delivery->'shippingAddress'->>'line1',p_delivery->'shippingAddress'->>'line2',p_delivery->'shippingAddress'->>'city',
        p_delivery->'shippingAddress'->>'district',p_delivery->'shippingAddress'->>'postalCode',p_delivery->'shippingAddress'->>'country',true,1,p_now,p_now)
      RETURNING * INTO selected_address;
  END IF;

  order_number:='SF-'||pg_catalog.upper(pg_catalog.replace(p_order_id::text,'-',''));
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,tracking,
    version,created_at,updated_at,customer_id)
  VALUES(p_order_id,selected_store,order_number,'storefront',selected_customer.first_name||' '||selected_customer.last_name,
    selected_customer.email,selected_customer.phone,'TRY',subtotal,shipping,0,subtotal+shipping,'pending','pending',
    p_delivery->'shippingAddress',NULL,1,p_now,p_now,selected_customer.id);

  PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',p_order_id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
  IF p_kind='cart' THEN
    position:=0;
    FOR line IN
      SELECT item.*,variant.stock_tracking,variant.stock_quantity,variant.title variant_title,
        variant.sku,product.title product_title
      FROM saas.storefront_cart_items item
      JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id
      JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id
      WHERE item.store_id=selected_store AND item.cart_id=source_cart_id ORDER BY item.position,item.variant_id
    LOOP
      INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
        VALUES(saas.storefront_commerce_uuid(p_order_id::text||':item:'||position),selected_store,p_order_id,line.product_id,line.variant_id,position,
          line.product_title,line.variant_title,line.sku,line.unit_price_cents,line.quantity,0,line.unit_price_cents*line.quantity,p_now);
      IF line.stock_tracking THEN UPDATE saas.product_variants SET stock_quantity=stock_quantity-line.quantity,version=version+1,updated_at=p_now WHERE store_id=selected_store AND id=line.variant_id; END IF;
      position:=position+1;
    END LOOP;
  ELSE
    INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
      VALUES(saas.storefront_commerce_uuid(p_order_id::text||':item:0'),selected_store,p_order_id,line.product_id,line.variant_id,0,
        line.product_title,line.variant_title,line.sku,line.unit_price_cents,line.quantity,0,line.unit_price_cents*line.quantity,p_now);
    IF line.stock_tracking THEN UPDATE saas.product_variants SET stock_quantity=stock_quantity-line.quantity,version=version+1,updated_at=p_now WHERE store_id=selected_store AND id=line.variant_id; END IF;
  END IF;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);

  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at)
    VALUES(p_event_id,selected_store,p_order_id,NULL,'order_created',NULL,'pending','Storefront siparişi oluşturuldu.',
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('paymentKind',p_payment_kind,'note',p_delivery->'note')),p_now);
  INSERT INTO saas.storefront_customer_credentials(id,store_id,customer_id,key_id,credential_digest,expires_at,created_at,last_seen_at)
    VALUES(p_customer_credential_id,selected_store,selected_customer.id,p_customer_key_id,p_customer_digest,p_customer_expires_at,p_now,p_now);
  INSERT INTO saas.storefront_order_receipts(id,store_id,order_id,customer_credential_id,key_id,credential_digest,expires_at,created_at)
    VALUES(p_receipt_id,selected_store,p_order_id,p_customer_credential_id,p_receipt_key_id,p_receipt_digest,p_receipt_expires_at,p_now);

  receipt_payload:=pg_catalog.jsonb_build_object(
    'orderReference',order_number,'currency','TRY','subtotalCents',subtotal,'shippingCents',shipping,
    'totalCents',subtotal+shipping,'paymentStatus','pending',
    'paymentMethod',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'kind',selected_payment.kind,'label',selected_payment.label,'instructions',selected_payment.config->>'instructions',
      'bankName',CASE WHEN selected_payment.kind='bank_transfer' THEN selected_payment.config->>'bankName' END,
      'accountHolder',CASE WHEN selected_payment.kind='bank_transfer' THEN selected_payment.config->>'accountHolder' END,
      'iban',CASE WHEN selected_payment.kind='bank_transfer' THEN selected_payment.config->>'iban' END
    )),
    'items',cart_payload->'items','createdAt',saas.storefront_commerce_timestamp(p_now)
  );
  result:=pg_catalog.jsonb_build_object('receipt',receipt_payload);
  INSERT INTO saas.storefront_checkout_operations(operation_id,store_id,cart_id,intent_id,order_id,payload_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,selected_store,source_cart_id,source_intent_id,p_order_id,p_fingerprint,result,p_now);
  IF p_kind='cart' THEN UPDATE saas.storefront_carts SET status='converted',version=version+1,updated_at=p_now WHERE store_id=selected_store AND id=source_cart_id;
  ELSE UPDATE saas.storefront_checkout_intents SET status='converted' WHERE store_id=selected_store AND id=source_intent_id; END IF;
  RETURN QUERY SELECT 'committed',result;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END
$f$;

CREATE FUNCTION saas.public_checkout_recover(
  p_hostname text,p_now timestamptz,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_operation saas.storefront_checkout_operations%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_operation FROM saas.storefront_checkout_operations WHERE operation_id=p_operation_id AND store_id=selected_store;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;
  ELSIF selected_operation.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',selected_operation.result_payload; END IF;
END
$f$;

CREATE FUNCTION saas.public_receipt_get(
  p_hostname text,p_now timestamptz,p_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_receipt saas.storefront_order_receipts%ROWTYPE; result jsonb;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_credentials,false) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT receipt.* INTO selected_receipt FROM saas.storefront_order_receipts receipt
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=receipt.key_id AND candidate->>'digest'=receipt.credential_digest
  WHERE receipt.store_id=selected_store AND receipt.expires_at>p_now ORDER BY receipt.created_at DESC,receipt.id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT operation.result_payload->'receipt' INTO result FROM saas.storefront_checkout_operations operation
  WHERE operation.store_id=selected_store AND operation.order_id=selected_receipt.order_id;
  RETURN QUERY SELECT CASE WHEN result IS NULL THEN 'not_found' ELSE 'found' END,result;
END
$f$;

CREATE FUNCTION saas.public_account_orders(
  p_hostname text,p_now timestamptz,p_credentials jsonb,p_limit integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_credential saas.storefront_customer_credentials%ROWTYPE; items jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR NOT saas.storefront_credential_candidates_valid(p_credentials,false) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT credential.* INTO selected_credential FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
  WHERE credential.store_id=selected_store AND credential.expires_at>p_now ORDER BY credential.created_at DESC,credential.id LIMIT 1 FOR UPDATE OF credential;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  UPDATE saas.storefront_customer_credentials SET last_seen_at=GREATEST(last_seen_at,p_now)
    WHERE store_id=selected_store AND id=selected_credential.id;
  SELECT COALESCE(pg_catalog.jsonb_agg(entry.receipt ORDER BY entry.created_at DESC,entry.order_id DESC),'[]'::jsonb) INTO items FROM (
    SELECT operation.result_payload->'receipt' receipt,orders.created_at,orders.id order_id
    FROM saas.orders orders
    JOIN saas.storefront_checkout_operations operation ON operation.store_id=orders.store_id AND operation.order_id=orders.id
    WHERE orders.store_id=selected_store AND orders.customer_id=selected_credential.customer_id
    ORDER BY orders.created_at DESC,orders.id DESC LIMIT p_limit
  ) entry;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('items',items);
END
$f$;

REVOKE ALL ON FUNCTION
  saas.public_cart_resolve(text,timestamptz,jsonb),
  saas.public_cart_mutate(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer),
  saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer),
  saas.public_checkout_quote(text,timestamptz,text,jsonb),
  saas.public_checkout_complete(text,timestamptz,text,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz),
  saas.public_checkout_recover(text,timestamptz,uuid,text),
  saas.public_receipt_get(text,timestamptz,jsonb),
  saas.public_account_orders(text,timestamptz,jsonb,integer)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.public_cart_resolve(text,timestamptz,jsonb),
  saas.public_cart_mutate(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer),
  saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer),
  saas.public_checkout_quote(text,timestamptz,text,jsonb),
  saas.public_checkout_complete(text,timestamptz,text,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz),
  saas.public_checkout_recover(text,timestamptz,uuid,text),
  saas.public_receipt_get(text,timestamptz,jsonb),
  saas.public_account_orders(text,timestamptz,jsonb,integer)
TO celebix_saas_host_resolver;

-- Kept explicit so catalog/static audits can pin the minimal public entrypoint.
GRANT EXECUTE ON FUNCTION saas.public_cart_resolve(text,timestamptz,jsonb)
TO celebix_saas_host_resolver;

CREATE FUNCTION saas.storefront_shipping_projection(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'shippingCents',COALESCE((record.config->>'shippingPriceCents')::bigint,0),
    'estimatedDays',CASE WHEN record.config?'estimatedDays' THEN (record.config->>'estimatedDays')::integer ELSE NULL END
  )
  FROM saas.merchant_admin_records record
  WHERE record.store_id=p_store_id AND record.record_kind='shipping_setting'
    AND record.status='active'
    AND saas.merchant_admin_config_valid('shipping_setting',record.config)
  ORDER BY record.updated_at DESC,record.id DESC LIMIT 1
$f$;

CREATE FUNCTION saas.storefront_payment_methods_projection(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT COALESCE(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'kind',method.kind,
      'label',method.label,
      'instructions',method.config->>'instructions',
      'bankName',CASE WHEN method.kind='bank_transfer' THEN method.config->>'bankName' END,
      'accountHolder',CASE WHEN method.kind='bank_transfer' THEN method.config->>'accountHolder' END,
      'iban',CASE WHEN method.kind='bank_transfer' THEN method.config->>'iban' END
    )) ORDER BY method.position,method.id
  ),'[]'::jsonb)
  FROM saas.payment_methods method
  WHERE method.store_id=p_store_id
    AND method.kind IN('bank_transfer','cash_on_delivery')
    AND method.state='active'
    AND saas.built_in_payment_method_config_valid(method.kind,method.config)
$f$;

CREATE FUNCTION saas.storefront_cart_projection(p_store_id uuid,p_cart_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH lines AS (
    SELECT item.position,item.quantity,product.id product_id,variant.id variant_id,
      product.slug,product.title,variant.title variant_title,
      resolved.price_cents,
      product.status='active' AND variant.status='active'
        AND (NOT variant.stock_tracking OR variant.stock_quantity>=item.quantity) available
    FROM saas.storefront_cart_items item
    JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id
    JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) resolved
    WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id AND resolved.outcome='found'
  ), aggregate AS (
    SELECT COALESCE(pg_catalog.sum(quantity),0)::bigint item_count,
      COALESCE(pg_catalog.sum(price_cents*quantity),0)::bigint subtotal,
      COALESCE(pg_catalog.bool_and(available),false) all_available,
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'productId',product_id,'variantId',variant_id,'slug',slug,'title',title,
        'variantTitle',variant_title,'quantity',quantity,'unitPriceCents',price_cents,
        'lineTotalCents',price_cents*quantity,'available',available
      ) ORDER BY position,variant_id),'[]'::jsonb) items
    FROM lines
  ), shipping AS (
    SELECT COALESCE((saas.storefront_shipping_projection(p_store_id)->>'shippingCents')::bigint,0) shipping_cents
  )
  SELECT pg_catalog.jsonb_build_object(
    'version',cart.version,'currency','TRY','itemCount',aggregate.item_count,
    'subtotalCents',aggregate.subtotal,'shippingCents',CASE WHEN aggregate.item_count=0 THEN 0 ELSE shipping.shipping_cents END,
    'totalCents',aggregate.subtotal+CASE WHEN aggregate.item_count=0 THEN 0 ELSE shipping.shipping_cents END,
    'checkoutReady',aggregate.item_count>0 AND aggregate.all_available,
    'items',aggregate.items
  )
  FROM saas.storefront_carts cart CROSS JOIN aggregate CROSS JOIN shipping
  WHERE cart.store_id=p_store_id AND cart.id=p_cart_id
$f$;

CREATE FUNCTION saas.storefront_intent_projection(p_store_id uuid,p_intent_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH selected AS (
    SELECT intent.quantity,product.id product_id,variant.id variant_id,product.slug,
      product.title,variant.title variant_title,resolved.price_cents,
      product.status='active' AND variant.status='active'
        AND (NOT variant.stock_tracking OR variant.stock_quantity>=intent.quantity) available
    FROM saas.storefront_checkout_intents intent
    JOIN saas.products product ON product.store_id=intent.store_id AND product.id=intent.product_id
    JOIN saas.product_variants variant ON variant.store_id=intent.store_id AND variant.id=intent.variant_id AND variant.product_id=intent.product_id
    CROSS JOIN LATERAL saas.resolve_effective_variant_price(intent.store_id,intent.variant_id,'storefront',p_now,NULL) resolved
    WHERE intent.store_id=p_store_id AND intent.id=p_intent_id AND resolved.outcome='found'
  ), shipping AS (
    SELECT COALESCE((saas.storefront_shipping_projection(p_store_id)->>'shippingCents')::bigint,0) shipping_cents
  )
  SELECT pg_catalog.jsonb_build_object(
    'version',1,'currency','TRY','itemCount',selected.quantity,
    'subtotalCents',selected.price_cents*selected.quantity,'shippingCents',shipping.shipping_cents,
    'totalCents',selected.price_cents*selected.quantity+shipping.shipping_cents,
    'checkoutReady',selected.available,
    'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'productId',selected.product_id,'variantId',selected.variant_id,'slug',selected.slug,
      'title',selected.title,'variantTitle',selected.variant_title,'quantity',selected.quantity,
      'unitPriceCents',selected.price_cents,'lineTotalCents',selected.price_cents*selected.quantity,
      'available',selected.available
    ))
  ) FROM selected CROSS JOIN shipping
$f$;

CREATE FUNCTION saas.storefront_delivery_valid(p_delivery jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
  SELECT p_delivery IS NOT NULL AND pg_catalog.jsonb_typeof(p_delivery)='object'
    AND (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_delivery) key)
      IN (ARRAY['contact','shippingAddress']::text[],ARRAY['contact','note','shippingAddress']::text[])
    AND pg_catalog.jsonb_typeof(p_delivery->'contact')='object'
    AND (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_delivery->'contact') key)
      =ARRAY['email','firstName','lastName','phone']::text[]
    AND pg_catalog.jsonb_typeof(p_delivery->'shippingAddress')='object'
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_delivery->'shippingAddress') key WHERE key NOT IN('line1','line2','city','district','postalCode','country'))
    AND (p_delivery->'shippingAddress')?'line1' AND (p_delivery->'shippingAddress')?'city' AND (p_delivery->'shippingAddress')?'country'
    AND (p_delivery->'contact'->>'firstName')=pg_catalog.btrim(p_delivery->'contact'->>'firstName')
    AND pg_catalog.char_length(p_delivery->'contact'->>'firstName') BETWEEN 1 AND 100
    AND (p_delivery->'contact'->>'lastName')=pg_catalog.btrim(p_delivery->'contact'->>'lastName')
    AND pg_catalog.char_length(p_delivery->'contact'->>'lastName') BETWEEN 1 AND 100
    AND (p_delivery->'contact'->>'email')=pg_catalog.lower(pg_catalog.btrim(p_delivery->'contact'->>'email'))
    AND pg_catalog.char_length(p_delivery->'contact'->>'email') BETWEEN 3 AND 320
    AND (p_delivery->'contact'->>'email')~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    AND (p_delivery->'contact'->>'phone')~'^\+[1-9][0-9]{7,14}$'
    AND (p_delivery->'shippingAddress'->>'line1')=pg_catalog.btrim(p_delivery->'shippingAddress'->>'line1')
    AND pg_catalog.char_length(p_delivery->'shippingAddress'->>'line1') BETWEEN 1 AND 300
    AND (p_delivery->'shippingAddress'->>'city')=pg_catalog.btrim(p_delivery->'shippingAddress'->>'city')
    AND pg_catalog.char_length(p_delivery->'shippingAddress'->>'city') BETWEEN 1 AND 100
    AND (p_delivery->'shippingAddress'->>'country')~'^[A-Z]{2}$'
    AND (NOT (p_delivery->'shippingAddress')?'line2' OR ((p_delivery->'shippingAddress'->>'line2')=pg_catalog.btrim(p_delivery->'shippingAddress'->>'line2') AND pg_catalog.char_length(p_delivery->'shippingAddress'->>'line2') BETWEEN 1 AND 300))
    AND (NOT (p_delivery->'shippingAddress')?'district' OR ((p_delivery->'shippingAddress'->>'district')=pg_catalog.btrim(p_delivery->'shippingAddress'->>'district') AND pg_catalog.char_length(p_delivery->'shippingAddress'->>'district') BETWEEN 1 AND 100))
    AND (NOT (p_delivery->'shippingAddress')?'postalCode' OR ((p_delivery->'shippingAddress'->>'postalCode')=pg_catalog.btrim(p_delivery->'shippingAddress'->>'postalCode') AND pg_catalog.char_length(p_delivery->'shippingAddress'->>'postalCode') BETWEEN 1 AND 20))
    AND (NOT p_delivery?'note' OR (pg_catalog.jsonb_typeof(p_delivery->'note')='string' AND (p_delivery->>'note')=pg_catalog.btrim(p_delivery->>'note') AND pg_catalog.char_length(p_delivery->>'note') BETWEEN 1 AND 500))
    AND p_delivery::text!~'[[:cntrl:]]'
$f$;

REVOKE ALL ON FUNCTION
  saas.storefront_shipping_projection(uuid),
  saas.storefront_payment_methods_projection(uuid),
  saas.storefront_cart_projection(uuid,uuid,timestamptz),
  saas.storefront_intent_projection(uuid,uuid,timestamptz),
  saas.storefront_delivery_valid(jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

COMMIT;
