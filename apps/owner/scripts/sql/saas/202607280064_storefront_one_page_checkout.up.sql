-- Phase 3W: PostgreSQL authority for the fixed one-page shared storefront checkout.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
DECLARE required_relation text;
BEGIN
  FOREACH required_relation IN ARRAY ARRAY[
    'saas.abandoned_carts','saas.abandoned_cart_items','saas.payment_methods',
    'saas.merchant_provider_profiles','saas.merchant_admin_records','saas.products',
    'saas.product_variants','saas.product_media','saas.checkout_inventory_reservations',
    'saas.payment_attempts','saas.orders','saas.order_items','saas.order_events'
  ] LOOP
    IF pg_catalog.to_regclass(required_relation) IS NULL THEN
      RAISE EXCEPTION 'STOREFRONT_CHECKOUT_PREREQUISITE_MISSING: %',required_relation;
    END IF;
  END LOOP;
  IF pg_catalog.to_regclass('saas.storefront_checkout_operations') IS NOT NULL
    OR pg_catalog.to_regprocedure(
      'saas.storefront_checkout_get_quote(text,text,timestamp with time zone)'
    ) IS NOT NULL
    OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid='saas.abandoned_carts'::regclass AND attnum>0 AND NOT attisdropped
        AND attname IN(
          'marketing_opt_in','shipping_address','billing_address','shipping_method_code',
          'shipping_cents','discount_record_id','discount_code','checkout_nonce_digest',
          'selected_payment_method_id'
        )
    )
    OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_attribute
      WHERE attrelid='saas.orders'::regclass AND attnum>0 AND NOT attisdropped
        AND attname='storefront_cart_id'
    )
    OR pg_catalog.to_regprocedure(
      'saas.merchant_admin_config_valid_without_checkout_flat_rate(text,jsonb)'
    ) IS NOT NULL
    OR pg_catalog.to_regclass('saas.storefront_checkout_discount_redemptions') IS NOT NULL
    OR pg_catalog.to_regclass('saas.storefront_checkout_payment_bridges') IS NOT NULL
    OR pg_catalog.to_regclass('saas.storefront_checkout_reserved_identities') IS NOT NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_SOURCE_ALREADY_APPLIED'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.abandoned_carts'::regclass
      AND conname='abandoned_carts_total_check' AND contype='c' AND convalidated
      AND pg_catalog.pg_get_constraintdef(oid)=
        'CHECK (((total_cents = (subtotal_cents - discount_cents)) AND (total_cents >= 0)))'
  ) THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_PRIOR_TOTAL_AUTHORITY_INVALID'; END IF;
  IF saas.built_in_payment_methods_preflight() IS DISTINCT FROM true
    OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true
    OR saas.quick_order_hosted_payment_bridge_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_PRIOR_PREFLIGHT_INVALID'; END IF;
END
$f$;

-- Migration 058 made generic payment attempts valid reservation owners, while
-- retaining the quick-order-only link requirement. Storefront generic attempts
-- intentionally carry no quick-order link and still use the same reservation row.
ALTER TABLE saas.checkout_inventory_reservations
  ALTER COLUMN quick_order_link_id DROP NOT NULL;

CREATE TABLE saas.storefront_checkout_discount_redemptions(
  store_id uuid NOT NULL,
  discount_record_id uuid NOT NULL,
  order_id uuid NOT NULL,
  redeemed_at timestamptz NOT NULL,
  PRIMARY KEY(store_id,discount_record_id,order_id),
  CONSTRAINT sf_checkout_discount_redemptions_discount_fk
    FOREIGN KEY(store_id,discount_record_id)
    REFERENCES saas.merchant_admin_records(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT sf_checkout_discount_redemptions_order_fk
    FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT sf_checkout_discount_redemptions_redeemed_check
    CHECK(pg_catalog.isfinite(redeemed_at))
);

CREATE TABLE saas.storefront_checkout_payment_bridges(
  attempt_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  order_id uuid NOT NULL,
  order_item_ids uuid[] NOT NULL,
  order_event_id uuid NOT NULL,
  order_number text NOT NULL,
  discount_record_id uuid,
  settlement_snapshot jsonb NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  settled_at timestamptz,
  CONSTRAINT sf_checkout_payment_bridges_attempt_fk
    FOREIGN KEY(attempt_id) REFERENCES saas.payment_attempts(id) ON DELETE RESTRICT,
  CONSTRAINT sf_checkout_payment_bridges_cart_fk
    FOREIGN KEY(store_id,cart_id) REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT sf_checkout_payment_bridges_discount_fk
    FOREIGN KEY(store_id,discount_record_id)
    REFERENCES saas.merchant_admin_records(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT sf_checkout_payment_bridges_status_check
    CHECK(status IN('active','captured','failed','cancelled','expired')),
  CONSTRAINT sf_checkout_payment_bridges_items_check CHECK(
    pg_catalog.array_ndims(order_item_ids)=1
    AND pg_catalog.array_lower(order_item_ids,1)=1
    AND pg_catalog.cardinality(order_item_ids) BETWEEN 1 AND 100
    AND pg_catalog.array_position(order_item_ids,NULL) IS NULL
  ),
  CONSTRAINT sf_checkout_payment_bridges_order_number_check CHECK(
    order_number=pg_catalog.btrim(order_number)
    AND pg_catalog.char_length(order_number) BETWEEN 1 AND 128
    AND order_number!~'[[:cntrl:]]'),
  CONSTRAINT sf_checkout_payment_bridges_snapshot_check CHECK(
    pg_catalog.jsonb_typeof(settlement_snapshot)='object'
    AND settlement_snapshot?&ARRAY['customer','money','items']
    AND pg_catalog.jsonb_typeof(settlement_snapshot->'customer')='object'
    AND pg_catalog.jsonb_typeof(settlement_snapshot->'money')='object'
    AND pg_catalog.jsonb_typeof(settlement_snapshot->'items')='array'
    AND pg_catalog.jsonb_array_length(settlement_snapshot->'items') BETWEEN 1 AND 100
    AND pg_catalog.pg_column_size(settlement_snapshot)<=1048576),
  CONSTRAINT sf_checkout_payment_bridges_time_check CHECK(
    pg_catalog.isfinite(created_at)
    AND (settled_at IS NULL OR pg_catalog.isfinite(settled_at))
    AND ((status='active' AND settled_at IS NULL)
      OR (status<>'active' AND settled_at IS NOT NULL)))
);

CREATE UNIQUE INDEX sf_checkout_payment_bridges_active_cart_idx
  ON saas.storefront_checkout_payment_bridges(store_id,cart_id)
  WHERE status='active';

CREATE TABLE saas.storefront_checkout_reserved_identities(
  identity_kind text NOT NULL,
  identity_value text NOT NULL,
  attempt_id uuid NOT NULL,
  ordinal integer NOT NULL,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(identity_kind,identity_value),
  UNIQUE(attempt_id,identity_kind,ordinal),
  CONSTRAINT sf_checkout_reserved_identities_attempt_fk
    FOREIGN KEY(attempt_id)
    REFERENCES saas.storefront_checkout_payment_bridges(attempt_id) ON DELETE RESTRICT,
  CONSTRAINT sf_checkout_reserved_identities_value_check CHECK(
    (identity_kind IN('order_id','order_item_id','order_event_id')
      AND identity_value~'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
    OR (identity_kind='order_number'
      AND identity_value~'^SF-[A-F0-9]{20}$')
  ),
  CONSTRAINT sf_checkout_reserved_identities_ordinal_check CHECK(
    (identity_kind='order_item_id' AND ordinal BETWEEN 1 AND 100)
    OR (identity_kind<>'order_item_id' AND ordinal=0)
  ),
  CONSTRAINT sf_checkout_reserved_identities_created_check
    CHECK(pg_catalog.isfinite(created_at))
);

ALTER TABLE saas.storefront_checkout_discount_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_discount_redemptions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_payment_bridges ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_payment_bridges FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_reserved_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_reserved_identities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.storefront_checkout_discount_redemptions,
  saas.storefront_checkout_payment_bridges,
  saas.storefront_checkout_reserved_identities
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.storefront_checkout_get_status(
  p_hostname text,p_credential_digest text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_cart_id uuid;
  selected_store_id uuid;
  selected_method_id uuid;
  selected_order record;
  selected_bridge record;
  selected_method record;
  public_method jsonb;
BEGIN
  IF saas.storefront_checkout_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  SELECT cart.id,cart.selected_payment_method_id
  INTO selected_cart_id,selected_method_id
  FROM saas.abandoned_carts cart
  WHERE cart.store_id=selected_store_id
    AND cart.public_cart_digest=p_credential_digest
  ORDER BY cart.last_activity_at DESC,cart.id DESC LIMIT 1;
  IF selected_cart_id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  SELECT bridge.order_number INTO selected_bridge
  FROM saas.storefront_checkout_payment_bridges bridge
  WHERE bridge.store_id=selected_store_id AND bridge.cart_id=selected_cart_id
    AND bridge.status='active'
  ORDER BY bridge.created_at DESC,bridge.attempt_id DESC LIMIT 1;
  IF selected_bridge.order_number IS NOT NULL THEN
    RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
      'kind','processing','orderNumber',selected_bridge.order_number
    ); RETURN;
  END IF;
  SELECT orders.order_number,orders.status,orders.payment_status
  INTO selected_order
  FROM saas.orders orders
  WHERE orders.store_id=selected_store_id AND orders.storefront_cart_id=selected_cart_id
  ORDER BY orders.created_at DESC,orders.id DESC LIMIT 1;
  IF selected_order.order_number IS NULL THEN
    RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('kind','ready'); RETURN;
  END IF;
  IF selected_order.payment_status='completed' THEN
    RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
      'kind','paid','orderNumber',selected_order.order_number
    ); RETURN;
  END IF;
  IF selected_order.payment_status IN('failed','refunded')
    OR selected_order.status IN('cancelled','refunded')
  THEN
    RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
      'kind','failed','orderNumber',selected_order.order_number
    ); RETURN;
  END IF;
  SELECT method.id,method.kind,method.label,method.config INTO selected_method
  FROM saas.payment_methods method
  WHERE method.store_id=selected_store_id AND method.id=selected_method_id;
  IF selected_method.id IS NULL OR selected_method.kind='provider'
    OR selected_order.payment_status='processing'
  THEN
    RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
      'kind','processing','orderNumber',selected_order.order_number
    ); RETURN;
  END IF;
  IF selected_method.kind NOT IN('cash_on_delivery','bank_transfer')
    OR saas.built_in_payment_method_config_valid(
      selected_method.kind,selected_method.config
    ) IS DISTINCT FROM true
  THEN
    RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
      'kind','failed','orderNumber',selected_order.order_number
    ); RETURN;
  END IF;
  public_method:=saas.storefront_checkout_builtin_method_projection(
    selected_method.id,selected_method.kind,selected_method.label,selected_method.config
  );
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'kind','placed','orderNumber',selected_order.order_number,
    'paymentStatus','pending','method',public_method
  );
END
$f$;

CREATE FUNCTION saas.storefront_checkout_get_policy(
  p_hostname text,p_policy_type text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_store_id uuid; selected_policy record;
BEGIN
  IF saas.storefront_checkout_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR p_policy_type IS NULL OR p_policy_type NOT IN(
      'distance_sales','pre_information','privacy','returns','shipping'
    )
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  IF selected_store_id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  SELECT record.name,record.config,
    saas.storefront_checkout_policy_effective_at(record.config) AS effective_at
  INTO selected_policy
  FROM saas.merchant_admin_records record
  WHERE record.store_id=selected_store_id AND record.record_kind='policy'
    AND record.status='active' AND record.config->>'policyType'=p_policy_type
    AND record.config->>'locale'='tr'
    AND pg_catalog.jsonb_typeof(record.config->'body')='string'
    AND saas.storefront_checkout_text_valid(record.config->>'body',1,100000)
    AND saas.storefront_checkout_policy_effective_at(record.config)<=p_now
  ORDER BY saas.storefront_checkout_policy_effective_at(record.config) DESC,
    record.updated_at DESC,record.id DESC LIMIT 1;
  IF selected_policy.name IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'policyType',p_policy_type,'label',selected_policy.name,
    'body',selected_policy.config->>'body',
    'effectiveAt',saas.merchant_admin_timestamp(selected_policy.effective_at)
  );
END
$f$;

CREATE FUNCTION saas.storefront_checkout_get_quote(
  p_hostname text,p_credential_digest text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_store_id uuid; selected_cart record;
BEGIN
  IF saas.storefront_checkout_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  IF selected_store_id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_cart FROM saas.abandoned_carts cart
  WHERE cart.store_id=selected_store_id
    AND cart.public_cart_digest=p_credential_digest
    AND cart.status IN('active','recovered')
  ORDER BY cart.last_activity_at DESC,cart.id DESC LIMIT 1;
  IF selected_cart.id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT projected.outcome,projected.result_payload
  FROM saas.storefront_checkout_build_quote(
    selected_store_id,selected_cart.id,selected_cart.shipping_method_code,
    selected_cart.discount_record_id,selected_cart.discount_code,p_now
  ) projected;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_issue_nonce(
  p_hostname text,p_credential_digest text,p_new_nonce_digest text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_store_id uuid; selected_cart record; quote_outcome text; quote_payload jsonb;
BEGIN
  IF saas.storefront_checkout_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_new_nonce_digest IS NULL OR p_new_nonce_digest!~'^[a-f0-9]{64}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  SELECT cart.* INTO selected_cart
  FROM saas.abandoned_carts cart
  WHERE cart.store_id=selected_store_id AND cart.public_cart_digest=p_credential_digest
    AND cart.status IN('active','recovered')
  ORDER BY cart.last_activity_at DESC,cart.id DESC
  LIMIT 1 FOR UPDATE OF cart;
  IF selected_cart.id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  IF p_now<selected_cart.created_at OR p_now<selected_cart.last_activity_at
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT projected.outcome,projected.result_payload INTO quote_outcome,quote_payload
  FROM saas.storefront_checkout_build_quote(
    selected_cart.store_id,selected_cart.id,selected_cart.shipping_method_code,
    selected_cart.discount_record_id,selected_cart.discount_code,p_now
  ) projected;
  IF quote_outcome<>'found' THEN
    RETURN QUERY SELECT quote_outcome,quote_payload; RETURN;
  END IF;
  IF selected_cart.checkout_nonce_digest IS NOT NULL
    AND saas.quick_checkout_digest_matches(
      selected_cart.checkout_nonce_digest,p_new_nonce_digest
    ) IS TRUE
  THEN RETURN QUERY SELECT 'issued',quote_payload; RETURN; END IF;
  IF selected_cart.version>=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.abandoned_carts SET
    checkout_nonce_digest=p_new_nonce_digest,
    version=version+1,last_activity_at=p_now,updated_at=p_now
  WHERE store_id=selected_cart.store_id AND id=selected_cart.id;
  SELECT projected.outcome,projected.result_payload INTO quote_outcome,quote_payload
  FROM saas.storefront_checkout_build_quote(
    selected_cart.store_id,selected_cart.id,selected_cart.shipping_method_code,
    selected_cart.discount_record_id,selected_cart.discount_code,p_now
  ) projected;
  IF quote_outcome<>'found' THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_NONCE_POSTCONDITION_INVALID';
  END IF;
  RETURN QUERY SELECT 'issued',quote_payload;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_update_delivery(
  p_hostname text,p_credential_digest text,p_expected_version bigint,
  p_operation_id uuid,p_fingerprint text,
  p_current_nonce_digest text,p_next_nonce_digest text,
  p_email text,p_marketing_opt_in boolean,
  p_shipping_address jsonb,p_billing_address jsonb,
  p_shipping_code text,p_discount_code text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_store_id uuid;
  selected_cart record;
  selected_operation record;
  selected_discount_id uuid;
  quote_outcome text;
  quote_payload jsonb;
BEGIN
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR saas.storefront_checkout_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
    OR p_current_nonce_digest IS NULL OR p_current_nonce_digest!~'^[a-f0-9]{64}$'
    OR p_next_nonce_digest IS NULL OR p_next_nonce_digest!~'^[a-f0-9]{64}$'
    OR p_next_nonce_digest=p_current_nonce_digest
    OR NOT saas.storefront_checkout_text_valid(p_email,3,320)
    OR p_email<>pg_catalog.lower(p_email)
    OR p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR p_marketing_opt_in IS NULL
    OR saas.storefront_checkout_address_valid(p_shipping_address) IS DISTINCT FROM true
    OR NOT saas.storefront_checkout_text_valid(
      (p_shipping_address->>'firstName')||' '||(p_shipping_address->>'lastName'),1,200
    )
    OR (p_billing_address IS NOT NULL
      AND saas.storefront_checkout_address_valid(p_billing_address) IS DISTINCT FROM true)
    OR p_shipping_code IS DISTINCT FROM 'standard'
    OR (p_discount_code IS NOT NULL AND (
      p_discount_code<>pg_catalog.upper(p_discount_code)
      OR p_discount_code<>pg_catalog.btrim(p_discount_code)
      OR p_discount_code!~'^[A-Z0-9][A-Z0-9_-]{0,63}$'
    ))
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.checkout.operation:'||p_operation_id::text,0
  ));

  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  SELECT cart.* INTO selected_cart
  FROM saas.abandoned_carts cart
  WHERE cart.store_id=selected_store_id AND cart.public_cart_digest=p_credential_digest
    AND cart.status IN('active','recovered')
  ORDER BY cart.last_activity_at DESC,cart.id DESC
  LIMIT 1 FOR UPDATE OF cart;
  IF selected_cart.id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;

  SELECT * INTO selected_operation FROM saas.storefront_checkout_operations operation
  WHERE operation.operation_id=p_operation_id;
  IF selected_operation.operation_id IS NOT NULL THEN
    IF selected_operation.store_id<>selected_cart.store_id
      OR selected_operation.cart_id<>selected_cart.id
      OR selected_operation.action<>'delivery'
      OR selected_operation.fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',selected_operation.result_payload;
    END IF;
    RETURN;
  END IF;

  IF selected_cart.version<>p_expected_version
    OR selected_cart.checkout_nonce_digest IS NULL
    OR saas.quick_checkout_digest_matches(
      selected_cart.checkout_nonce_digest,p_current_nonce_digest
    ) IS DISTINCT FROM true
  THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF p_now<selected_cart.created_at OR p_now<selected_cart.last_activity_at
    OR selected_cart.version>=9007199254740991
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  IF p_discount_code IS NOT NULL THEN
    SELECT discount.id INTO selected_discount_id
    FROM saas.merchant_admin_records discount
    WHERE discount.store_id=selected_cart.store_id
      AND discount.record_kind='discount' AND discount.status='active'
      AND discount.config->>'code'=p_discount_code
    ORDER BY discount.updated_at DESC,discount.id DESC
    LIMIT 1 FOR UPDATE OF discount;
    IF selected_discount_id IS NULL THEN
      RETURN QUERY SELECT 'discount_invalid',NULL::jsonb; RETURN;
    END IF;
  END IF;

  PERFORM product.id
  FROM saas.products product
  WHERE product.store_id=selected_cart.store_id AND EXISTS(
    SELECT 1 FROM saas.abandoned_cart_items item
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
      AND item.product_id=product.id
  )
  ORDER BY product.id FOR KEY SHARE OF product;
  PERFORM variant.id
  FROM saas.product_variants variant
  WHERE variant.store_id=selected_cart.store_id AND EXISTS(
    SELECT 1 FROM saas.abandoned_cart_items item
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
      AND item.variant_id=variant.id
  )
  ORDER BY variant.id FOR UPDATE OF variant;

  SELECT projected.outcome,projected.result_payload INTO quote_outcome,quote_payload
  FROM saas.storefront_checkout_build_quote(
    selected_cart.store_id,selected_cart.id,p_shipping_code,
    selected_discount_id,p_discount_code,p_now
  ) projected;
  IF quote_outcome<>'found' THEN
    RETURN QUERY SELECT quote_outcome,quote_payload; RETURN;
  END IF;

  UPDATE saas.abandoned_carts SET
    customer_name=(p_shipping_address->>'firstName')||' '||(p_shipping_address->>'lastName'),
    customer_email=p_email,customer_phone=p_shipping_address->>'phone',
    marketing_opt_in=p_marketing_opt_in,
    shipping_address=p_shipping_address,billing_address=p_billing_address,
    shipping_method_code=p_shipping_code,
    subtotal_cents=(quote_payload->>'subtotalCents')::bigint,
    shipping_cents=(quote_payload->>'shippingCents')::bigint,
    discount_cents=(quote_payload->>'discountCents')::bigint,
    total_cents=(quote_payload->>'totalCents')::bigint,
    discount_record_id=selected_discount_id,discount_code=p_discount_code,
    checkout_nonce_digest=p_next_nonce_digest,
    version=version+1,last_activity_at=p_now,updated_at=p_now
  WHERE store_id=selected_cart.store_id AND id=selected_cart.id;

  SELECT projected.outcome,projected.result_payload INTO quote_outcome,quote_payload
  FROM saas.storefront_checkout_build_quote(
    selected_cart.store_id,selected_cart.id,p_shipping_code,
    selected_discount_id,p_discount_code,p_now
  ) projected;
  IF quote_outcome<>'found' THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_DELIVERY_POSTCONDITION_INVALID';
  END IF;
  INSERT INTO saas.storefront_checkout_operations(
    operation_id,store_id,cart_id,action,fingerprint,result_payload,committed_at
  ) VALUES(
    p_operation_id,selected_cart.store_id,selected_cart.id,'delivery',p_fingerprint,
    quote_payload,p_now
  );
  RETURN QUERY SELECT 'updated',quote_payload;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_recover_operation(
  p_hostname text,p_credential_digest text,p_operation_id uuid,
  p_fingerprint text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_cart_id uuid; selected_store_id uuid;
  selected_operation record;
BEGIN
  IF saas.storefront_checkout_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  SELECT cart.id INTO selected_cart_id
  FROM saas.abandoned_carts cart
  WHERE cart.store_id=selected_store_id
    AND cart.public_cart_digest=p_credential_digest
  ORDER BY cart.last_activity_at DESC,cart.id DESC LIMIT 1;
  IF selected_cart_id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_operation FROM saas.storefront_checkout_operations operation
  WHERE operation.operation_id=p_operation_id;
  IF selected_operation.operation_id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;
  IF selected_operation.store_id<>selected_store_id
    OR selected_operation.cart_id<>selected_cart_id
    OR selected_operation.fingerprint<>p_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed',selected_operation.result_payload;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_text_valid(
  p_value text,p_minimum integer,p_maximum integer
)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,saas
AS $f$
  SELECT COALESCE(
    p_value IS NOT NULL
    AND p_minimum>=0 AND p_maximum>=p_minimum
    AND p_value=pg_catalog.btrim(
      p_value,
      U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'
    )
    AND pg_catalog.octet_length(p_value) BETWEEN p_minimum AND p_maximum
    AND p_value!~'[[:cntrl:]]',false
  )
$f$;

CREATE FUNCTION saas.storefront_checkout_address_valid(p_address jsonb)
RETURNS boolean
LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,saas
AS $f$
DECLARE expected_keys text[];
BEGIN
  IF p_address IS NULL OR pg_catalog.jsonb_typeof(p_address)<>'object'
    OR pg_catalog.pg_column_size(p_address)>8192
  THEN RETURN false; END IF;
  SELECT pg_catalog.array_agg(key ORDER BY key) INTO expected_keys
  FROM pg_catalog.jsonb_object_keys(p_address) AS keys(key);
  IF expected_keys IS DISTINCT FROM ARRAY[
      'city','countryCode','district','firstName','lastName','line1','phone'
    ]::text[]
    AND expected_keys IS DISTINCT FROM ARRAY[
      'city','company','countryCode','district','firstName','lastName','line1','phone'
    ]::text[]
    AND expected_keys IS DISTINCT FROM ARRAY[
      'city','countryCode','district','firstName','lastName','line1','line2','phone'
    ]::text[]
    AND expected_keys IS DISTINCT FROM ARRAY[
      'city','countryCode','district','firstName','lastName','line1','phone','postalCode'
    ]::text[]
    AND NOT (
      expected_keys @> ARRAY['city','countryCode','district','firstName','lastName','line1','phone']::text[]
      AND expected_keys <@ ARRAY[
        'city','company','countryCode','district','firstName','lastName','line1','line2','phone','postalCode'
      ]::text[]
    )
  THEN RETURN false; END IF;
  IF p_address->>'countryCode'<>'TR'
    OR NOT saas.storefront_checkout_text_valid(p_address->>'firstName',1,120)
    OR NOT saas.storefront_checkout_text_valid(p_address->>'lastName',1,120)
    OR NOT saas.storefront_checkout_text_valid(p_address->>'line1',1,240)
    OR NOT saas.storefront_checkout_text_valid(p_address->>'district',1,120)
    OR NOT saas.storefront_checkout_text_valid(p_address->>'city',1,120)
    OR NOT saas.storefront_checkout_text_valid(p_address->>'phone',7,32)
    OR (p_address?'company' AND NOT saas.storefront_checkout_text_valid(p_address->>'company',1,160))
    OR (p_address?'line2' AND NOT saas.storefront_checkout_text_valid(p_address->>'line2',1,240))
    OR (p_address?'postalCode' AND NOT saas.storefront_checkout_text_valid(p_address->>'postalCode',1,32))
    OR EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_each(p_address) entry
      WHERE pg_catalog.jsonb_typeof(entry.value)<>'string'
    )
  THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END
$f$;

ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb)
  RENAME TO merchant_admin_config_valid_without_checkout_flat_rate;
REVOKE ALL ON FUNCTION
  saas.merchant_admin_config_valid_without_checkout_flat_rate(text,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_typeof(p_config)='object' AND pg_catalog.octet_length(p_config::text)<=16384
  AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) AS field(key) WHERE CASE p_kind
   WHEN 'discount' THEN key NOT IN('code','discountType','value','minimumOrderCents','usageLimit')
   WHEN 'lucky_wheel' THEN key NOT IN('campaignMessage','terms','dailySpinLimit','prizeLabels')
   WHEN 'email_campaign' THEN key NOT IN('subject','audience','content','scheduledAt')
   WHEN 'phone_campaign' THEN key NOT IN('audience','script','scheduledAt')
   WHEN 'whatsapp_campaign' THEN key NOT IN('audience','message','scheduledAt')
   WHEN 'blog_post' THEN key NOT IN('slug','locale','excerpt','body','published')
   WHEN 'page' THEN key NOT IN('slug','locale','body','published')
   WHEN 'policy' THEN key NOT IN('policyType','locale','body','effectiveAt')
   WHEN 'marketplace_connection' THEN key NOT IN('provider','merchantReference','syncEnabled')
   WHEN 'general_setting' THEN key NOT IN('storeDisplayName','supportEmail','timezone')
   WHEN 'language_setting' THEN key NOT IN('defaultLocale','enabledLocales')
   WHEN 'payment_setting' THEN key NOT IN('enabledMethods','cashOnDelivery')
   WHEN 'shipping_setting' THEN key NOT IN('regions','flatRateCents','freeShippingThresholdCents','estimatedDays')
   WHEN 'administrator_invite' THEN key NOT IN('email','role','expiresAt')
   WHEN 'accounting_profile' THEN key NOT IN('legalName','taxOffice','taxNumber','invoiceEmail')
   WHEN 'invoice_integration' THEN key NOT IN('provider','accountReference','enabled')
   WHEN 'seo_control' THEN key NOT IN('metaTitle','metaDescription','allowIndex')
   WHEN 'sitemap' THEN key NOT IN('includeProducts','includeContent','changeFrequency')
   WHEN 'social_preview' THEN key NOT IN('title','description','imageUrl')
   WHEN 'code_integration' THEN key NOT IN('provider','publicIdentifier','enabled')
   WHEN 'indexing_request' THEN key NOT IN('urls','reason')
   WHEN 'notification_setting' THEN key NOT IN('emailEnabled','smsEnabled','pushEnabled','senderLabel','replyToEmail')
   WHEN 'hero_banner' THEN key NOT IN('headline','body','imageUrl','destination','enabled')
   WHEN 'promotion_banner' THEN key NOT IN('headline','body','destination','startsAt','endsAt','enabled')
   WHEN 'marquee_setting' THEN key NOT IN('items','icon','speed','direction','animation','enabled')
   WHEN 'seo_geo_profile' THEN key NOT IN('businessName','businessCategory','serviceAreas','locale','description')
   WHEN 'seo_internal_link' THEN key NOT IN('sourcePath','targetPath','anchorText','enabled')
   WHEN 'seo_content_entry' THEN key NOT IN('resourceId','metaTitle','metaDescription','canonicalPath','structuredDataType')
   WHEN 'seo_category_entry' THEN key NOT IN('resourceId','metaTitle','metaDescription','canonicalPath')
   WHEN 'seo_page_entry' THEN key NOT IN('resourceId','metaTitle','metaDescription','canonicalPath')
   WHEN 'seo_product_entry' THEN key NOT IN('resourceId','metaTitle','metaDescription','canonicalPath')
   WHEN 'ai_setting' THEN key NOT IN('tone','locale','enabledFeatures')
   ELSE true END)
  AND COALESCE(CASE p_kind
   WHEN 'notification_setting' THEN
     (NOT (p_config ? 'emailEnabled') OR pg_catalog.jsonb_typeof(p_config->'emailEnabled')='boolean') AND
     (NOT (p_config ? 'smsEnabled') OR pg_catalog.jsonb_typeof(p_config->'smsEnabled')='boolean') AND
     (NOT (p_config ? 'pushEnabled') OR pg_catalog.jsonb_typeof(p_config->'pushEnabled')='boolean') AND
     (NOT (p_config ? 'senderLabel') OR saas.merchant_admin_setting_text(p_config->'senderLabel',1,160)) AND
     (NOT (p_config ? 'replyToEmail') OR saas.merchant_admin_setting_email(p_config->'replyToEmail'))
   WHEN 'hero_banner' THEN
     (NOT (p_config ? 'headline') OR saas.merchant_admin_setting_text(p_config->'headline',1,160)) AND
     (NOT (p_config ? 'body') OR saas.merchant_admin_setting_text(p_config->'body',1,4000)) AND
     (NOT (p_config ? 'imageUrl') OR saas.merchant_admin_setting_https_media_url(p_config->'imageUrl')) AND
     (NOT (p_config ? 'destination') OR saas.merchant_admin_setting_destination(p_config->'destination')) AND
     (NOT (p_config ? 'enabled') OR pg_catalog.jsonb_typeof(p_config->'enabled')='boolean')
   WHEN 'promotion_banner' THEN
     (NOT (p_config ? 'headline') OR saas.merchant_admin_setting_text(p_config->'headline',1,160)) AND
     (NOT (p_config ? 'body') OR saas.merchant_admin_setting_text(p_config->'body',1,4000)) AND
     (NOT (p_config ? 'destination') OR saas.merchant_admin_setting_destination(p_config->'destination')) AND
     (NOT (p_config ? 'startsAt') OR saas.merchant_admin_setting_timestamp(p_config->'startsAt')) AND
     (NOT (p_config ? 'endsAt') OR saas.merchant_admin_setting_timestamp(p_config->'endsAt')) AND
     (NOT (p_config ? 'startsAt' AND p_config ? 'endsAt') OR saas.merchant_admin_setting_timestamp_value(p_config->'startsAt') < saas.merchant_admin_setting_timestamp_value(p_config->'endsAt')) AND
     (NOT (p_config ? 'enabled') OR pg_catalog.jsonb_typeof(p_config->'enabled')='boolean')
   WHEN 'marquee_setting' THEN
     (NOT (p_config ? 'items') OR (pg_catalog.jsonb_typeof(p_config->'items')='array' AND pg_catalog.jsonb_array_length(p_config->'items') BETWEEN 1 AND 12 AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'items') item WHERE NOT saas.merchant_admin_setting_text(item.value,1,160)))) AND
     (NOT (p_config ? 'icon') OR (p_config->>'icon') IN ('none','sparkle','truck','shield')) AND
     (NOT (p_config ? 'speed') OR (p_config->>'speed') IN ('slow','normal','fast')) AND
     (NOT (p_config ? 'direction') OR (p_config->>'direction') IN ('left','right')) AND
     (NOT (p_config ? 'animation') OR (p_config->>'animation') IN ('continuous','step')) AND
     (NOT (p_config ? 'enabled') OR pg_catalog.jsonb_typeof(p_config->'enabled')='boolean')
   WHEN 'seo_geo_profile' THEN
     (NOT (p_config ? 'businessName') OR saas.merchant_admin_setting_text(p_config->'businessName',1,160)) AND
     (NOT (p_config ? 'businessCategory') OR saas.merchant_admin_setting_text(p_config->'businessCategory',1,160)) AND
     (NOT (p_config ? 'serviceAreas') OR (pg_catalog.jsonb_typeof(p_config->'serviceAreas')='array' AND pg_catalog.jsonb_array_length(p_config->'serviceAreas') BETWEEN 1 AND 24 AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'serviceAreas') item WHERE NOT saas.merchant_admin_setting_text(item.value,1,160)))) AND
     (NOT (p_config ? 'locale') OR saas.merchant_admin_setting_locale(p_config->'locale')) AND
     (NOT (p_config ? 'description') OR saas.merchant_admin_setting_text(p_config->'description',1,4000))
   WHEN 'seo_internal_link' THEN
     (NOT (p_config ? 'sourcePath') OR saas.merchant_admin_setting_public_path(p_config->'sourcePath')) AND
     (NOT (p_config ? 'targetPath') OR saas.merchant_admin_setting_public_path(p_config->'targetPath')) AND
     (NOT (p_config ? 'anchorText') OR saas.merchant_admin_setting_text(p_config->'anchorText',1,160)) AND
     (NOT (p_config ? 'enabled') OR pg_catalog.jsonb_typeof(p_config->'enabled')='boolean')
   WHEN 'seo_content_entry' THEN
     (NOT (p_config ? 'resourceId') OR saas.merchant_admin_setting_uuid(p_config->'resourceId')) AND
     (NOT (p_config ? 'metaTitle') OR saas.merchant_admin_setting_text(p_config->'metaTitle',1,160)) AND
     (NOT (p_config ? 'metaDescription') OR saas.merchant_admin_setting_text(p_config->'metaDescription',1,4000)) AND
     (NOT (p_config ? 'canonicalPath') OR saas.merchant_admin_setting_public_path(p_config->'canonicalPath')) AND
     (NOT (p_config ? 'structuredDataType') OR (p_config->>'structuredDataType') IN ('Article','FAQPage','Product','WebPage'))
   WHEN 'seo_category_entry' THEN
     (NOT (p_config ? 'resourceId') OR saas.merchant_admin_setting_uuid(p_config->'resourceId')) AND
     (NOT (p_config ? 'metaTitle') OR saas.merchant_admin_setting_text(p_config->'metaTitle',1,160)) AND
     (NOT (p_config ? 'metaDescription') OR saas.merchant_admin_setting_text(p_config->'metaDescription',1,4000)) AND
     (NOT (p_config ? 'canonicalPath') OR saas.merchant_admin_setting_public_path(p_config->'canonicalPath'))
   WHEN 'seo_page_entry' THEN
     (NOT (p_config ? 'resourceId') OR saas.merchant_admin_setting_uuid(p_config->'resourceId')) AND
     (NOT (p_config ? 'metaTitle') OR saas.merchant_admin_setting_text(p_config->'metaTitle',1,160)) AND
     (NOT (p_config ? 'metaDescription') OR saas.merchant_admin_setting_text(p_config->'metaDescription',1,4000)) AND
     (NOT (p_config ? 'canonicalPath') OR saas.merchant_admin_setting_public_path(p_config->'canonicalPath'))
   WHEN 'seo_product_entry' THEN
     (NOT (p_config ? 'resourceId') OR saas.merchant_admin_setting_uuid(p_config->'resourceId')) AND
     (NOT (p_config ? 'metaTitle') OR saas.merchant_admin_setting_text(p_config->'metaTitle',1,160)) AND
     (NOT (p_config ? 'metaDescription') OR saas.merchant_admin_setting_text(p_config->'metaDescription',1,4000)) AND
     (NOT (p_config ? 'canonicalPath') OR saas.merchant_admin_setting_public_path(p_config->'canonicalPath'))
   WHEN 'ai_setting' THEN
     (NOT (p_config ? 'tone') OR saas.merchant_admin_setting_text(p_config->'tone',1,160)) AND
     (NOT (p_config ? 'locale') OR saas.merchant_admin_setting_locale(p_config->'locale')) AND
     (NOT (p_config ? 'enabledFeatures') OR (pg_catalog.jsonb_typeof(p_config->'enabledFeatures')='array' AND pg_catalog.jsonb_array_length(p_config->'enabledFeatures') BETWEEN 1 AND 3 AND (SELECT pg_catalog.count(DISTINCT item.value) FROM pg_catalog.jsonb_array_elements_text(p_config->'enabledFeatures') item(value))=pg_catalog.jsonb_array_length(p_config->'enabledFeatures') AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_config->'enabledFeatures') item(value) WHERE item.value NOT IN('description_suggestions','seo_suggestions','campaign_drafts'))))
   WHEN 'shipping_setting' THEN
     (
       NOT p_config ? 'flatRateCents' OR (
         pg_catalog.jsonb_typeof(p_config->'flatRateCents')='number'
         AND (p_config->>'flatRateCents')::numeric=pg_catalog.trunc((p_config->>'flatRateCents')::numeric)
         AND (p_config->>'flatRateCents')::numeric BETWEEN 0 AND 500000000000000
       )
     )
     AND (NOT p_config ? 'freeShippingThresholdCents' OR (
       pg_catalog.jsonb_typeof(p_config->'freeShippingThresholdCents')='number'
       AND (p_config->>'freeShippingThresholdCents')::numeric BETWEEN 0 AND 500000000000000
     ))
     AND (NOT p_config ? 'estimatedDays' OR (
       pg_catalog.jsonb_typeof(p_config->'estimatedDays')='number'
       AND (p_config->>'estimatedDays')::numeric BETWEEN 1 AND 90
     ))
   WHEN 'discount' THEN true WHEN 'lucky_wheel' THEN true WHEN 'email_campaign' THEN true WHEN 'phone_campaign' THEN true WHEN 'whatsapp_campaign' THEN true WHEN 'blog_post' THEN true WHEN 'page' THEN true WHEN 'policy' THEN true WHEN 'marketplace_connection' THEN true WHEN 'general_setting' THEN true WHEN 'language_setting' THEN true WHEN 'payment_setting' THEN true WHEN 'administrator_invite' THEN true WHEN 'accounting_profile' THEN true WHEN 'invoice_integration' THEN true WHEN 'seo_control' THEN true WHEN 'sitemap' THEN true WHEN 'social_preview' THEN true WHEN 'code_integration' THEN true WHEN 'indexing_request' THEN true ELSE false END,false)
$f$;

REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid(text,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

ALTER TABLE saas.abandoned_carts
  ADD COLUMN marketing_opt_in boolean NOT NULL DEFAULT false,
  ADD COLUMN shipping_address jsonb,
  ADD COLUMN billing_address jsonb,
  ADD COLUMN shipping_method_code text,
  ADD COLUMN shipping_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN discount_record_id uuid,
  ADD COLUMN discount_code text,
  ADD COLUMN checkout_nonce_digest character(64),
  ADD COLUMN selected_payment_method_id uuid;

ALTER TABLE saas.abandoned_carts
  DROP CONSTRAINT abandoned_carts_total_check,
  ADD CONSTRAINT abandoned_carts_total_check CHECK (
    total_cents = subtotal_cents + shipping_cents - discount_cents
    AND total_cents >= 0
  ),
  ADD CONSTRAINT abandoned_carts_checkout_money_check CHECK (
    subtotal_cents BETWEEN 0 AND 500000000000000
    AND shipping_cents BETWEEN 0 AND 500000000000000
    AND discount_cents BETWEEN 0 AND 500000000000000
    AND discount_cents <= subtotal_cents + shipping_cents
  ),
  ADD CONSTRAINT abandoned_carts_shipping_address_check CHECK (
    shipping_address IS NULL OR saas.storefront_checkout_address_valid(shipping_address)
  ),
  ADD CONSTRAINT abandoned_carts_billing_address_check CHECK (
    billing_address IS NULL OR saas.storefront_checkout_address_valid(billing_address)
  ),
  ADD CONSTRAINT abandoned_carts_shipping_method_code_check CHECK (
    shipping_method_code IS NULL OR shipping_method_code='standard'
  ),
  ADD CONSTRAINT abandoned_carts_discount_authority_check CHECK (
    (discount_record_id IS NULL)=(discount_code IS NULL)
  ),
  ADD CONSTRAINT abandoned_carts_discount_code_check CHECK (
    discount_code IS NULL OR (
      discount_code=pg_catalog.upper(discount_code)
      AND discount_code=pg_catalog.btrim(discount_code)
      AND discount_code~'^[A-Z0-9][A-Z0-9_-]{0,63}$'
    )
  ),
  ADD CONSTRAINT abandoned_carts_checkout_nonce_digest_check CHECK (
    checkout_nonce_digest IS NULL OR checkout_nonce_digest~'^[a-f0-9]{64}$'
  ),
  ADD CONSTRAINT abandoned_carts_discount_record_store_fk
    FOREIGN KEY(store_id,discount_record_id)
    REFERENCES saas.merchant_admin_records(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT abandoned_carts_selected_payment_method_store_fk
    FOREIGN KEY(store_id,selected_payment_method_id)
    REFERENCES saas.payment_methods(store_id,id) ON DELETE RESTRICT;

ALTER TABLE saas.orders
  ADD COLUMN storefront_cart_id uuid,
  ADD CONSTRAINT orders_storefront_cart_source_check CHECK (
    storefront_cart_id IS NULL OR source='storefront'
  ),
  ADD CONSTRAINT orders_storefront_cart_store_fk
    FOREIGN KEY(store_id,storefront_cart_id)
    REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT orders_storefront_cart_key UNIQUE(store_id,storefront_cart_id);

CREATE TABLE saas.storefront_checkout_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN('delivery','submit_builtin','submit_hosted')),
  fingerprint character(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  UNIQUE(store_id,cart_id,operation_id),
  FOREIGN KEY(store_id,cart_id) REFERENCES saas.abandoned_carts(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT storefront_checkout_operations_fingerprint_check CHECK (
    fingerprint~'^[a-f0-9]{64}$'
  ),
  CONSTRAINT storefront_checkout_operations_result_check CHECK (
    pg_catalog.jsonb_typeof(result_payload)='object'
  ),
  CONSTRAINT storefront_checkout_operations_committed_check CHECK (
    pg_catalog.isfinite(committed_at)
  )
);

CREATE INDEX storefront_checkout_operations_cart_committed_idx
  ON saas.storefront_checkout_operations(store_id,cart_id,committed_at DESC,operation_id);

CREATE FUNCTION saas.guard_storefront_checkout_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
BEGIN
  RAISE EXCEPTION 'STOREFRONT_CHECKOUT_OPERATION_IMMUTABLE';
END
$f$;

CREATE TRIGGER storefront_checkout_operations_immutable
BEFORE UPDATE OR DELETE ON saas.storefront_checkout_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_checkout_operation_mutation();

CREATE TRIGGER storefront_checkout_discount_redemptions_immutable
BEFORE UPDATE OR DELETE ON saas.storefront_checkout_discount_redemptions
FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_checkout_operation_mutation();

CREATE FUNCTION saas.guard_storefront_checkout_payment_bridge_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
BEGIN
  IF TG_OP='DELETE'
    OR (pg_catalog.to_jsonb(NEW)-'status'-'settled_at') IS DISTINCT FROM
       (pg_catalog.to_jsonb(OLD)-'status'-'settled_at')
    OR OLD.status<>'active'
    OR NEW.status NOT IN('captured','failed','cancelled','expired')
    OR NEW.settled_at IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_PAYMENT_BRIDGE_IMMUTABLE'; END IF;
  RETURN NEW;
END
$f$;

CREATE TRIGGER storefront_checkout_payment_bridges_immutable
BEFORE UPDATE OR DELETE ON saas.storefront_checkout_payment_bridges
FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_checkout_payment_bridge_mutation();

CREATE TRIGGER storefront_checkout_reserved_identities_immutable
BEFORE UPDATE OR DELETE ON saas.storefront_checkout_reserved_identities
FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_checkout_operation_mutation();

CREATE FUNCTION saas.guard_storefront_checkout_reserved_identity_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_attempt_id uuid;
  settlement_attempt_text text;
  settlement_attempt_id uuid;
  settlement_allowed boolean:=false;
  identity_lock_keys text[];
  identity_lock_key text;
BEGIN
  IF TG_TABLE_NAME='orders' THEN
    IF TG_OP='UPDATE' AND NEW.id=OLD.id AND NEW.order_number=OLD.order_number THEN
      RETURN NEW;
    END IF;
    identity_lock_keys:=ARRAY[
      'order_id:'||NEW.id::text,
      'order_number:'||NEW.order_number
    ];
    IF TG_OP='UPDATE' THEN
      identity_lock_keys:=identity_lock_keys||ARRAY[
        'order_id:'||OLD.id::text,
        'order_number:'||OLD.order_number
      ];
    END IF;
  ELSIF TG_TABLE_NAME='order_items' THEN
    IF TG_OP='UPDATE' AND NEW.id=OLD.id THEN RETURN NEW; END IF;
    identity_lock_keys:=ARRAY['order_item_id:'||NEW.id::text];
    IF TG_OP='UPDATE' THEN
      identity_lock_keys:=identity_lock_keys||ARRAY['order_item_id:'||OLD.id::text];
    END IF;
  ELSIF TG_TABLE_NAME='order_events' THEN
    IF TG_OP='UPDATE' AND NEW.id=OLD.id THEN RETURN NEW; END IF;
    identity_lock_keys:=ARRAY['order_event_id:'||NEW.id::text];
    IF TG_OP='UPDATE' THEN
      identity_lock_keys:=identity_lock_keys||ARRAY['order_event_id:'||OLD.id::text];
    END IF;
  ELSE
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_RESERVED_IDENTITY_TRIGGER_INVALID';
  END IF;

  FOR identity_lock_key IN
    SELECT DISTINCT candidate.lock_key
    FROM pg_catalog.unnest(identity_lock_keys) AS candidate(lock_key)
    ORDER BY candidate.lock_key
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.storefront.checkout.identity-reservation:'||identity_lock_key,0
    ));
  END LOOP;

  IF TG_TABLE_NAME='orders' THEN
    SELECT reserved.attempt_id INTO selected_attempt_id
    FROM saas.storefront_checkout_reserved_identities reserved
    WHERE (reserved.identity_kind='order_id' AND reserved.identity_value=NEW.id::text)
      OR (reserved.identity_kind='order_number' AND reserved.identity_value=NEW.order_number)
      OR (TG_OP='UPDATE' AND reserved.identity_kind='order_id'
        AND reserved.identity_value=OLD.id::text)
      OR (TG_OP='UPDATE' AND reserved.identity_kind='order_number'
        AND reserved.identity_value=OLD.order_number)
    ORDER BY reserved.identity_kind LIMIT 1;
  ELSIF TG_TABLE_NAME='order_items' THEN
    SELECT reserved.attempt_id INTO selected_attempt_id
    FROM saas.storefront_checkout_reserved_identities reserved
    WHERE reserved.identity_kind='order_item_id'
      AND (reserved.identity_value=NEW.id::text
        OR (TG_OP='UPDATE' AND reserved.identity_value=OLD.id::text));
  ELSIF TG_TABLE_NAME='order_events' THEN
    SELECT reserved.attempt_id INTO selected_attempt_id
    FROM saas.storefront_checkout_reserved_identities reserved
    WHERE reserved.identity_kind='order_event_id'
      AND (reserved.identity_value=NEW.id::text
        OR (TG_OP='UPDATE' AND reserved.identity_value=OLD.id::text));
  END IF;
  IF selected_attempt_id IS NULL THEN RETURN NEW; END IF;

  settlement_attempt_text:=pg_catalog.current_setting(
    'saas.storefront_checkout.settlement_attempt_id',true
  );
  IF settlement_attempt_text IS NOT NULL AND settlement_attempt_text~
    '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  THEN
    settlement_attempt_id:=settlement_attempt_text::uuid;
    IF TG_TABLE_NAME='orders' THEN
      SELECT EXISTS(
        SELECT 1 FROM saas.storefront_checkout_payment_bridges bridge
        JOIN saas.payment_attempts attempt ON attempt.id=bridge.attempt_id
        WHERE bridge.attempt_id=selected_attempt_id
          AND bridge.attempt_id=settlement_attempt_id
          AND bridge.status='active' AND attempt.status='captured'
          AND bridge.order_id=NEW.id AND bridge.order_number=NEW.order_number
      ) INTO settlement_allowed;
    ELSIF TG_TABLE_NAME='order_items' THEN
      SELECT EXISTS(
        SELECT 1 FROM saas.storefront_checkout_payment_bridges bridge
        JOIN saas.payment_attempts attempt ON attempt.id=bridge.attempt_id
        WHERE bridge.attempt_id=selected_attempt_id
          AND bridge.attempt_id=settlement_attempt_id
          AND bridge.status='active' AND attempt.status='captured'
          AND NEW.id=ANY(bridge.order_item_ids)
      ) INTO settlement_allowed;
    ELSE
      SELECT EXISTS(
        SELECT 1 FROM saas.storefront_checkout_payment_bridges bridge
        JOIN saas.payment_attempts attempt ON attempt.id=bridge.attempt_id
        WHERE bridge.attempt_id=selected_attempt_id
          AND bridge.attempt_id=settlement_attempt_id
          AND bridge.status='active' AND attempt.status='captured'
          AND bridge.order_event_id=NEW.id
      ) INTO settlement_allowed;
    END IF;
  END IF;
  IF settlement_allowed IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_RESERVED_IDENTITY';
  END IF;
  RETURN NEW;
END
$f$;

CREATE TRIGGER orders_storefront_checkout_reserved_identity
BEFORE INSERT OR UPDATE ON saas.orders
FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_checkout_reserved_identity_insert();
CREATE TRIGGER order_items_storefront_checkout_reserved_identity
BEFORE INSERT OR UPDATE ON saas.order_items
FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_checkout_reserved_identity_insert();
CREATE TRIGGER order_events_storefront_checkout_reserved_identity
BEFORE INSERT OR UPDATE ON saas.order_events
FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_checkout_reserved_identity_insert();

ALTER TABLE saas.storefront_checkout_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_checkout_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.storefront_checkout_operations
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.storefront_checkout_hostname_valid(p_hostname text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,saas
AS $f$
  SELECT COALESCE(
    p_hostname IS NOT NULL
    AND p_hostname=pg_catalog.lower(p_hostname)
    AND pg_catalog.char_length(p_hostname) BETWEEN 3 AND 253
    AND p_hostname!~'[*:/?#@[:space:][:cntrl:]]'
    AND p_hostname~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$',
    false
  )
$f$;

CREATE FUNCTION saas.storefront_checkout_discount_value(
  p_config jsonb,p_subtotal_cents bigint,p_shipping_cents bigint
)
RETURNS bigint
LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  value_amount numeric;
  minimum_amount numeric:=0;
  discount_amount numeric;
BEGIN
  IF p_config IS NULL OR pg_catalog.jsonb_typeof(p_config)<>'object'
    OR NOT p_config ?& ARRAY['code','discountType','value']
    OR pg_catalog.jsonb_typeof(p_config->'code')<>'string'
    OR pg_catalog.jsonb_typeof(p_config->'discountType')<>'string'
    OR pg_catalog.jsonb_typeof(p_config->'value')<>'number'
    OR p_config->>'code'<>pg_catalog.upper(p_config->>'code')
    OR p_config->>'code'!~'^[A-Z0-9][A-Z0-9_-]{0,63}$'
    OR p_subtotal_cents NOT BETWEEN 0 AND 500000000000000
    OR p_shipping_cents NOT BETWEEN 0 AND 500000000000000
  THEN RETURN NULL; END IF;
  value_amount:=(p_config->>'value')::numeric;
  IF value_amount<>pg_catalog.trunc(value_amount) OR value_amount<0 THEN RETURN NULL; END IF;
  IF p_config?'minimumOrderCents' THEN
    IF pg_catalog.jsonb_typeof(p_config->'minimumOrderCents')<>'number' THEN RETURN NULL; END IF;
    minimum_amount:=(p_config->>'minimumOrderCents')::numeric;
    IF minimum_amount<>pg_catalog.trunc(minimum_amount)
      OR minimum_amount NOT BETWEEN 0 AND 500000000000000
    THEN RETURN NULL; END IF;
  END IF;
  IF p_config?'usageLimit' THEN
    IF pg_catalog.jsonb_typeof(p_config->'usageLimit')<>'number'
      OR (p_config->>'usageLimit')::numeric<>pg_catalog.trunc((p_config->>'usageLimit')::numeric)
      OR (p_config->>'usageLimit')::numeric NOT BETWEEN 1 AND 9007199254740991
    THEN RETURN NULL; END IF;
  END IF;
  IF p_subtotal_cents<minimum_amount THEN RETURN NULL; END IF;
  IF p_config->>'discountType' IN('fixed','fixed_amount') THEN
    IF value_amount>500000000000000 THEN RETURN NULL; END IF;
    discount_amount:=LEAST(value_amount,p_subtotal_cents::numeric+p_shipping_cents::numeric);
  ELSIF p_config->>'discountType'='percentage' THEN
    IF value_amount>100 THEN RETURN NULL; END IF;
    discount_amount:=pg_catalog.floor(p_subtotal_cents::numeric*value_amount/100);
  ELSE
    RETURN NULL;
  END IF;
  IF discount_amount NOT BETWEEN 0 AND 500000000000000 THEN RETURN NULL; END IF;
  RETURN discount_amount::bigint;
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN NULL;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_uuid(
  p_kind text,p_authority_id uuid,p_ordinal integer DEFAULT 0
)
RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT
SET search_path=pg_catalog,saas
AS $f$
  WITH digest AS (
    SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      'saas.storefront-checkout.v1:'||p_kind||':'||p_authority_id::text||':'||p_ordinal::text,
      'UTF8'
    )),'hex') AS value
  )
  SELECT (
    pg_catalog.substr(value,1,8)||'-'||pg_catalog.substr(value,9,4)||'-8'||
    pg_catalog.substr(value,14,3)||'-8'||pg_catalog.substr(value,18,3)||'-'||
    pg_catalog.substr(value,21,12)
  )::uuid
  FROM digest
$f$;

CREATE FUNCTION saas.storefront_checkout_policy_effective_at(p_config jsonb)
RETURNS timestamptz
LANGUAGE plpgsql IMMUTABLE
SET search_path=pg_catalog,saas
AS $f$
DECLARE selected timestamptz;
BEGIN
  IF p_config IS NULL OR pg_catalog.jsonb_typeof(p_config)<>'object'
    OR pg_catalog.jsonb_typeof(p_config->'effectiveAt')<>'string'
  THEN RETURN NULL; END IF;
  selected:=(p_config->>'effectiveAt')::timestamptz;
  IF NOT pg_catalog.isfinite(selected) THEN RETURN NULL; END IF;
  RETURN selected;
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow THEN
  RETURN NULL;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_builtin_method_projection(
  p_method_id uuid,p_kind text,p_label text,p_config jsonb
)
RETURNS jsonb
LANGUAGE sql IMMUTABLE
SET search_path=pg_catalog,saas
AS $f$
  SELECT CASE p_kind
    WHEN 'cash_on_delivery' THEN pg_catalog.jsonb_build_object(
      'id',p_method_id,'kind','cash_on_delivery','label',p_label,
      'instructions',COALESCE(NULLIF(p_config->>'instructions',''),'Ödeme teslimatta alınır.')
    )
    WHEN 'bank_transfer' THEN pg_catalog.jsonb_build_object(
      'id',p_method_id,'kind','bank_transfer','label',p_label,
      'bankName',p_config->>'bankName','accountHolder',p_config->>'accountHolder',
      'iban',p_config->>'iban',
      'instructions',COALESCE(NULLIF(p_config->>'instructions',''),'Sipariş sonrası banka havalesi yapınız.')
    )
    ELSE NULL::jsonb
  END
$f$;

CREATE FUNCTION saas.storefront_checkout_build_quote(
  p_store_id uuid,p_cart_id uuid,p_shipping_code text,
  p_discount_record_id uuid,p_discount_code text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_store saas.stores%ROWTYPE;
  selected_cart saas.abandoned_carts%ROWTYPE;
  item_record record;
  item_count integer:=0;
  items_json jsonb:='[]'::jsonb;
  methods_json jsonb:='[]'::jsonb;
  policy_links_json jsonb:='[]'::jsonb;
  shipping_json jsonb;
  shipping_config jsonb;
  shipping_setting_found boolean:=false;
  shipping_price bigint:=0;
  selected_shipping bigint:=0;
  free_threshold numeric;
  estimated_days numeric;
  subtotal_amount numeric:=0;
  discount_amount bigint:=0;
  selected_discount saas.merchant_admin_records%ROWTYPE;
  usage_limit numeric;
  used_count bigint;
BEGIN
  IF p_store_id IS NULL OR p_cart_id IS NULL
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR (p_shipping_code IS NOT NULL AND p_shipping_code<>'standard')
    OR ((p_discount_record_id IS NULL)<>(p_discount_code IS NULL))
    OR (p_discount_code IS NOT NULL AND (
      p_discount_code<>pg_catalog.upper(p_discount_code)
      OR p_discount_code<>pg_catalog.btrim(p_discount_code)
      OR p_discount_code!~'^[A-Z0-9][A-Z0-9_-]{0,63}$'
    ))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT * INTO selected_store FROM saas.stores store
  WHERE store.id=p_store_id AND store.status='active';
  SELECT * INTO selected_cart FROM saas.abandoned_carts cart
  WHERE cart.store_id=p_store_id AND cart.id=p_cart_id;
  IF selected_store.id IS NULL OR selected_cart.id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;

  FOR item_record IN
    SELECT
      item.id,item.position,item.quantity,
      product.id AS current_product_id,product.title AS current_title,product.status AS product_status,
      variant.id AS current_variant_id,variant.title AS current_variant_title,
      variant.status AS variant_status,variant.stock_tracking,variant.stock_quantity,
      effective.outcome AS price_outcome,effective.price_cents,
      media.image_path
    FROM saas.abandoned_cart_items item
    LEFT JOIN saas.products product
      ON product.store_id=item.store_id AND product.id=item.product_id
    LEFT JOIN saas.product_variants variant
      ON variant.store_id=item.store_id AND variant.id=item.variant_id
        AND variant.product_id=item.product_id
    LEFT JOIN LATERAL saas.resolve_effective_variant_price(
      item.store_id,item.variant_id,'storefront',p_now,NULL
    ) effective ON true
    LEFT JOIN LATERAL (
      SELECT '/'||selected_media.object_key AS image_path
      FROM saas.product_media selected_media
      WHERE selected_media.store_id=item.store_id
        AND selected_media.product_id=item.product_id
        AND selected_media.status='active'
        AND (selected_media.variant_id IS NULL OR selected_media.variant_id=item.variant_id)
      ORDER BY (selected_media.variant_id IS NOT NULL) DESC,
        selected_media.sort_order,selected_media.id
      LIMIT 1
    ) media ON true
    WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id
    ORDER BY item.position,item.id
  LOOP
    item_count:=item_count+1;
    IF item_record.current_product_id IS NULL OR item_record.current_variant_id IS NULL
      OR item_record.product_status<>'active' OR item_record.variant_status<>'active'
      OR item_record.price_outcome<>'found' OR item_record.price_cents IS NULL
      OR item_record.price_cents NOT BETWEEN 0 AND 500000000000000
    THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN; END IF;
    subtotal_amount:=subtotal_amount+item_record.price_cents::numeric*item_record.quantity::numeric;
    IF subtotal_amount>500000000000000 THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    END IF;
    items_json:=items_json||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
      'id',item_record.id,'title',item_record.current_title,
      'variantLabel',item_record.current_variant_title,'quantity',item_record.quantity,
      'unitPriceCents',item_record.price_cents,
      'lineTotalCents',(item_record.price_cents::numeric*item_record.quantity::numeric)::bigint,
      'imagePath',item_record.image_path
    ));
  END LOOP;
  IF item_count=0 THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;

  IF EXISTS(
    SELECT 1
    FROM (
      SELECT item.variant_id,pg_catalog.sum(item.quantity)::numeric AS requested
      FROM saas.abandoned_cart_items item
      WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id
      GROUP BY item.variant_id
    ) requested
    JOIN saas.product_variants variant
      ON variant.store_id=p_store_id AND variant.id=requested.variant_id
    LEFT JOIN LATERAL (
      SELECT COALESCE(pg_catalog.sum(reservation.quantity),0)::numeric AS held
      FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=p_store_id
        AND reservation.variant_id=variant.id
        AND reservation.status='held' AND reservation.stock_tracked
    ) reservation ON true
    WHERE variant.stock_tracking
      AND variant.stock_quantity::numeric-reservation.held<requested.requested
  ) THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN; END IF;

  SELECT setting.config,true INTO shipping_config,shipping_setting_found
  FROM saas.merchant_admin_records setting
  WHERE setting.store_id=p_store_id AND setting.record_kind='shipping_setting'
    AND setting.status='active'
    AND saas.merchant_admin_config_valid('shipping_setting',setting.config)
  ORDER BY setting.updated_at DESC,setting.id DESC LIMIT 1;
  shipping_config:=COALESCE(shipping_config,'{}'::jsonb);
  shipping_price:=COALESCE((shipping_config->>'flatRateCents')::bigint,0);
  IF shipping_config?'freeShippingThresholdCents' THEN
    free_threshold:=(shipping_config->>'freeShippingThresholdCents')::numeric;
    IF subtotal_amount>=free_threshold THEN shipping_price:=0; END IF;
  END IF;
  estimated_days:=CASE WHEN shipping_config?'estimatedDays'
    THEN (shipping_config->>'estimatedDays')::numeric ELSE NULL END;
  shipping_json:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id','standard',
    'label',CASE WHEN shipping_price=0 THEN 'Ücretsiz standart teslimat' ELSE 'Standart teslimat' END,
    'description',CASE WHEN estimated_days IS NULL THEN NULL
      ELSE estimated_days::text||' iş günü içinde teslimat' END,
    'priceCents',shipping_price
  ));
  selected_shipping:=CASE WHEN p_shipping_code='standard' THEN shipping_price ELSE 0 END;

  IF p_discount_record_id IS NOT NULL THEN
    SELECT * INTO selected_discount
    FROM saas.merchant_admin_records discount
    WHERE discount.store_id=p_store_id AND discount.id=p_discount_record_id
      AND discount.record_kind='discount' AND discount.status='active'
      AND discount.config->>'code'=p_discount_code
    ORDER BY discount.updated_at DESC LIMIT 1;
    IF selected_discount.id IS NULL THEN
      RETURN QUERY SELECT 'discount_invalid',NULL::jsonb; RETURN;
    END IF;
    discount_amount:=saas.storefront_checkout_discount_value(
      selected_discount.config,subtotal_amount::bigint,selected_shipping
    );
    IF discount_amount IS NULL THEN
      RETURN QUERY SELECT 'discount_invalid',NULL::jsonb; RETURN;
    END IF;
    IF selected_discount.config?'usageLimit' THEN
      usage_limit:=(selected_discount.config->>'usageLimit')::numeric;
      SELECT
        (SELECT pg_catalog.count(*)
          FROM saas.merchant_admin_events event
          WHERE event.store_id=p_store_id AND event.record_id=selected_discount.id
            AND event.event_kind='coupon_used')
        +(SELECT pg_catalog.count(*)
          FROM saas.storefront_checkout_discount_redemptions redemption
          WHERE redemption.store_id=p_store_id
            AND redemption.discount_record_id=selected_discount.id)
        +(SELECT pg_catalog.count(*)
          FROM saas.storefront_checkout_payment_bridges bridge
          WHERE bridge.store_id=p_store_id AND bridge.status='active'
            AND bridge.discount_record_id=selected_discount.id)
      INTO used_count;
      IF used_count::numeric>=usage_limit THEN
        RETURN QUERY SELECT 'discount_invalid',NULL::jsonb; RETURN;
      END IF;
    END IF;
  END IF;

  SELECT COALESCE(pg_catalog.jsonb_agg(projected.payload ORDER BY projected.position,projected.id),'[]'::jsonb)
  INTO methods_json
  FROM (
    SELECT method.id,method.position,
      CASE method.kind
        WHEN 'provider' THEN pg_catalog.jsonb_build_object(
          'id',method.id,'kind','provider','label',method.label,
          'providerCode',method.provider_code,
          'logoPath',CASE method.provider_code
            WHEN 'paytr_iframe' THEN '/payment-providers/paytr.svg'
            WHEN 'iyzico_iframe' THEN '/payment-providers/iyzico.svg' END
        )
        ELSE saas.storefront_checkout_builtin_method_projection(
          method.id,method.kind,method.label,method.config
        )
      END AS payload
    FROM saas.payment_methods method
    LEFT JOIN saas.merchant_provider_profiles profile
      ON profile.store_id=method.store_id AND profile.id=method.profile_id
        AND profile.provider_code=method.provider_code
    WHERE method.store_id=p_store_id AND method.state='active'
      AND (
        (method.kind='provider'
          AND method.provider_code IN('paytr_iframe','iyzico_iframe')
          AND profile.status='active'
          AND profile.capability='payment_processing'
          AND profile.execution_environment IS NOT NULL
          AND profile.execution_adapter_version IS NOT NULL
          AND profile.execution_evidence_digest IS NOT NULL)
        OR
        (method.kind IN('cash_on_delivery','bank_transfer')
          AND saas.built_in_payment_method_config_valid(method.kind,method.config))
      )
  ) projected;

  WITH candidate AS (
    SELECT record.id,record.name,record.config,
      saas.storefront_checkout_policy_effective_at(record.config) AS effective_at,
      pg_catalog.row_number() OVER(
        PARTITION BY record.config->>'policyType'
        ORDER BY saas.storefront_checkout_policy_effective_at(record.config) DESC,
          record.updated_at DESC,record.id DESC
      ) AS rank
    FROM saas.merchant_admin_records record
    WHERE record.store_id=p_store_id AND record.record_kind='policy' AND record.status='active'
      AND record.config->>'policyType' IN(
        'distance_sales','pre_information','privacy','returns','shipping'
      )
      AND record.config->>'locale'='tr'
      AND pg_catalog.jsonb_typeof(record.config->'body')='string'
      AND saas.storefront_checkout_text_valid(record.config->>'body',1,100000)
      AND saas.storefront_checkout_policy_effective_at(record.config)<=p_now
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'policyType',candidate.config->>'policyType','label',candidate.name,
    'href','/politikalar/'||(candidate.config->>'policyType')
  ) ORDER BY candidate.config->>'policyType'),'[]'::jsonb)
  INTO policy_links_json FROM candidate WHERE candidate.rank=1;

  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'schemaVersion',1,'cartId',selected_cart.id,'cartVersion',selected_cart.version,
    'storeName',selected_store.name,'currency',selected_store.currency,'locale','tr',
    'items',items_json,'shippingOptions',shipping_json,
    'selectedShippingId',p_shipping_code,
    'paymentMethods',methods_json,
    'policyLinks',policy_links_json,
    'subtotalCents',subtotal_amount::bigint,'shippingCents',selected_shipping,
    'discountCents',discount_amount,
    'totalCents',subtotal_amount::bigint+selected_shipping-discount_amount,
    'discountCode',p_discount_code
  );
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN
  RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_submit_builtin(
  p_hostname text,p_credential_digest text,p_expected_version bigint,
  p_operation_id uuid,p_fingerprint text,p_nonce_digest text,
  p_payment_method_id uuid,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_store_id uuid;
  selected_cart saas.abandoned_carts%ROWTYPE;
  selected_operation saas.storefront_checkout_operations%ROWTYPE;
  selected_method saas.payment_methods%ROWTYPE;
  selected_discount saas.merchant_admin_records%ROWTYPE;
  quote_outcome text;
  quote_payload jsonb;
  created_order_id uuid;
  created_order_number text;
  created_event_id uuid;
  order_digest text;
  result jsonb;
  item_record record;
  item_index integer:=0;
  tracked_count bigint;
  updated_count bigint;
BEGIN
  IF saas.storefront_checkout_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
    OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_nonce_digest IS NULL OR p_nonce_digest!~'^[a-f0-9]{64}$'
    OR p_payment_method_id IS NULL
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  -- operation -> cart -> selected method -> discount -> products -> variants -> held reservations
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.checkout.operation:'||p_operation_id::text,0
  ));
  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  SELECT cart.* INTO selected_cart
  FROM saas.abandoned_carts cart
  WHERE cart.store_id=selected_store_id AND cart.public_cart_digest=p_credential_digest
  ORDER BY cart.last_activity_at DESC,cart.id DESC
  LIMIT 1 FOR UPDATE OF cart;
  IF selected_cart.id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;

  SELECT operation.* INTO selected_operation
  FROM saas.storefront_checkout_operations operation
  WHERE operation.operation_id=p_operation_id;
  IF selected_operation.operation_id IS NOT NULL THEN
    IF selected_operation.store_id<>selected_cart.store_id
      OR selected_operation.cart_id<>selected_cart.id
      OR selected_operation.action<>'submit_builtin'
      OR selected_operation.fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',selected_operation.result_payload;
    END IF;
    RETURN;
  END IF;

  IF selected_cart.status NOT IN('active','recovered')
    OR selected_cart.version<>p_expected_version
    OR selected_cart.checkout_nonce_digest IS NULL
    OR saas.quick_checkout_digest_matches(
      selected_cart.checkout_nonce_digest,p_nonce_digest
    ) IS DISTINCT FROM true
  THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF p_now<selected_cart.created_at OR p_now<selected_cart.last_activity_at
    OR selected_cart.version>=9007199254740991
    OR selected_cart.customer_name IS NULL OR selected_cart.customer_email IS NULL
    OR selected_cart.customer_phone IS NULL OR selected_cart.shipping_address IS NULL
    OR selected_cart.shipping_method_code IS DISTINCT FROM 'standard'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT method.* INTO selected_method FROM saas.payment_methods method
  WHERE method.store_id=selected_cart.store_id AND method.id=p_payment_method_id
  FOR UPDATE OF method;
  IF selected_method.id IS NULL OR selected_method.kind NOT IN('cash_on_delivery','bank_transfer')
    OR selected_method.state<>'active'
    OR saas.built_in_payment_method_config_valid(
      selected_method.kind,selected_method.config
    ) IS DISTINCT FROM true
  THEN RETURN QUERY SELECT 'payment_method_unavailable',NULL::jsonb; RETURN; END IF;

  IF selected_cart.discount_record_id IS NOT NULL THEN
    SELECT discount.* INTO selected_discount
    FROM saas.merchant_admin_records discount
    WHERE discount.store_id=selected_cart.store_id
      AND discount.id=selected_cart.discount_record_id
    FOR UPDATE OF discount;
    IF selected_discount.id IS NULL THEN
      RETURN QUERY SELECT 'discount_invalid',NULL::jsonb; RETURN;
    END IF;
  END IF;

  PERFORM product.id FROM saas.products product
  WHERE product.store_id=selected_cart.store_id AND EXISTS(
    SELECT 1 FROM saas.abandoned_cart_items item
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
      AND item.product_id=product.id
  ) ORDER BY product.id FOR KEY SHARE OF product;
  PERFORM variant.id FROM saas.product_variants variant
  WHERE variant.store_id=selected_cart.store_id AND EXISTS(
    SELECT 1 FROM saas.abandoned_cart_items item
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
      AND item.variant_id=variant.id
  ) ORDER BY variant.id FOR UPDATE OF variant;
  PERFORM reservation.id FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=selected_cart.store_id AND reservation.status='held'
    AND EXISTS(
      SELECT 1 FROM saas.abandoned_cart_items item
      WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
        AND item.variant_id=reservation.variant_id
    )
  ORDER BY reservation.variant_id,reservation.id FOR UPDATE OF reservation;

  IF EXISTS(
    SELECT 1 FROM saas.storefront_checkout_payment_bridges bridge
    WHERE bridge.store_id=selected_cart.store_id AND bridge.cart_id=selected_cart.id
      AND bridge.status='active'
  ) THEN RETURN QUERY SELECT 'payment_method_unavailable',NULL::jsonb; RETURN; END IF;

  SELECT projected.outcome,projected.result_payload INTO quote_outcome,quote_payload
  FROM saas.storefront_checkout_build_quote(
    selected_cart.store_id,selected_cart.id,selected_cart.shipping_method_code,
    selected_cart.discount_record_id,selected_cart.discount_code,p_now
  ) projected;
  IF quote_outcome<>'found' THEN
    RETURN QUERY SELECT quote_outcome,quote_payload; RETURN;
  END IF;

  created_order_id:=saas.storefront_checkout_uuid('builtin-order',p_operation_id);
  created_event_id:=saas.storefront_checkout_uuid('builtin-order-event',p_operation_id);
  order_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
    'saas.storefront-checkout.order.v1:'||p_operation_id::text,'UTF8'
  )),'hex');
  created_order_number:='SF-'||pg_catalog.upper(pg_catalog.substr(order_digest,1,20));

  INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,
    currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,
    payment_status,shipping_address,billing_address,storefront_cart_id,
    version,created_at,updated_at
  ) VALUES(
    created_order_id,selected_cart.store_id,created_order_number,'storefront',
    selected_cart.customer_name,selected_cart.customer_email,selected_cart.customer_phone,
    selected_cart.currency,(quote_payload->>'subtotalCents')::bigint,
    (quote_payload->>'shippingCents')::bigint,(quote_payload->>'discountCents')::bigint,
    (quote_payload->>'totalCents')::bigint,'confirmed','pending',
    selected_cart.shipping_address,selected_cart.billing_address,selected_cart.id,
    1,p_now,p_now
  );

  FOR item_record IN
    SELECT item.*,product.title AS current_product_name,variant.title AS current_variant_name,
      effective.price_cents AS current_unit_price
    FROM saas.abandoned_cart_items item
    JOIN saas.products product
      ON product.store_id=item.store_id AND product.id=item.product_id
    JOIN saas.product_variants variant
      ON variant.store_id=item.store_id AND variant.product_id=item.product_id
        AND variant.id=item.variant_id
    JOIN LATERAL saas.resolve_effective_variant_price(
      item.store_id,item.variant_id,'storefront',p_now,NULL
    ) effective ON effective.outcome='found'
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
    ORDER BY item.position,item.id
  LOOP
    item_index:=item_index+1;
    INSERT INTO saas.order_items(
      id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,
      unit_price_cents,quantity,discount_cents,line_total_cents,created_at
    ) VALUES(
      saas.storefront_checkout_uuid('builtin-order-item',p_operation_id,item_index),
      selected_cart.store_id,created_order_id,item_record.product_id,item_record.variant_id,
      item_record.position,item_record.current_product_name,item_record.current_variant_name,
      item_record.sku,item_record.current_unit_price,item_record.quantity,0,
      item_record.current_unit_price*item_record.quantity,p_now
    );
  END LOOP;

  INSERT INTO saas.order_events(
    id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,
    message,payload,created_at
  ) VALUES(
    created_event_id,selected_cart.store_id,created_order_id,NULL,'order_created',NULL,
    'confirmed','Storefront order placed',pg_catalog.jsonb_build_object(
      'source','storefront','paymentMethod',selected_method.kind
    ),p_now
  );

  SELECT pg_catalog.count(*) INTO tracked_count
  FROM (
    SELECT variant.id
    FROM saas.abandoned_cart_items item
    JOIN saas.product_variants variant
      ON variant.store_id=item.store_id AND variant.id=item.variant_id
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
      AND variant.stock_tracking
    GROUP BY variant.id
  ) tracked;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',created_order_id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',p_now::text,true);
  UPDATE saas.product_variants variant SET
    stock_quantity=variant.stock_quantity-requested.quantity,
    version=variant.version+1,updated_at=p_now
  FROM (
    SELECT item.variant_id,pg_catalog.sum(item.quantity)::bigint AS quantity
    FROM saas.abandoned_cart_items item
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
    GROUP BY item.variant_id
  ) requested
  WHERE variant.store_id=selected_cart.store_id AND variant.id=requested.variant_id
    AND variant.stock_tracking;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  IF updated_count<>tracked_count THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_BUILTIN_STOCK_CONFLICT';
  END IF;

  IF selected_cart.discount_record_id IS NOT NULL THEN
    INSERT INTO saas.storefront_checkout_discount_redemptions(
      store_id,discount_record_id,order_id,redeemed_at
    ) VALUES(
      selected_cart.store_id,selected_cart.discount_record_id,created_order_id,p_now
    );
  END IF;
  UPDATE saas.abandoned_carts SET
    status='archived',archived_at=p_now,recovered_order_id=created_order_id,
    selected_payment_method_id=selected_method.id,version=version+1,
    last_activity_at=p_now,updated_at=p_now
  WHERE store_id=selected_cart.store_id AND id=selected_cart.id;

  result:=pg_catalog.jsonb_build_object(
    'kind','placed','orderNumber',created_order_number,'statusPath','/checkout/status'
  );
  INSERT INTO saas.storefront_checkout_operations(
    operation_id,store_id,cart_id,action,fingerprint,result_payload,committed_at
  ) VALUES(
    p_operation_id,selected_cart.store_id,selected_cart.id,'submit_builtin',
    p_fingerprint,result,p_now
  );
  RETURN QUERY SELECT 'placed',result;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_begin_hosted(
  p_hostname text,p_credential_digest text,p_expected_version bigint,
  p_operation_id uuid,p_fingerprint text,p_nonce_digest text,
  p_payment_method_id uuid,p_identity_number text,p_attempt_id uuid,
  p_callback_binding_digest text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_store_id uuid;
  selected_cart saas.abandoned_carts%ROWTYPE;
  selected_operation saas.storefront_checkout_operations%ROWTYPE;
  selected_method saas.payment_methods%ROWTYPE;
  selected_profile saas.merchant_provider_profiles%ROWTYPE;
  selected_attempt saas.payment_attempts%ROWTYPE;
  selected_discount saas.merchant_admin_records%ROWTYPE;
  quote_outcome text;
  quote_payload jsonb;
  begin_outcome text;
  item_record record;
  held_quantity numeric;
  item_count bigint;
  matched_item_count bigint;
  unique_item_count bigint;
  quoted_line_sum numeric;
  quote_items_valid boolean;
  basket jsonb;
  settlement_items jsonb;
  settlement_snapshot jsonb;
  derived_order_id uuid;
  derived_order_item_ids uuid[];
  derived_order_event_id uuid;
  derived_order_number text;
  identity_lock_key text;
  result jsonb;
BEGIN
  IF saas.storefront_checkout_hostname_valid(p_hostname) IS DISTINCT FROM true
    OR p_credential_digest IS NULL OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
    OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_nonce_digest IS NULL OR p_nonce_digest!~'^[a-f0-9]{64}$'
    OR p_payment_method_id IS NULL OR p_attempt_id IS NULL
    OR p_callback_binding_digest IS NULL OR p_callback_binding_digest!~'^[a-f0-9]{64}$'
    OR (p_identity_number IS NOT NULL AND (
      p_identity_number!~'^[!-~]{5,50}$'
      OR p_identity_number=pg_catalog.repeat(
        pg_catalog.substr(p_identity_number,1,1),pg_catalog.char_length(p_identity_number)
      )
      OR p_identity_number='12345678901'
    ))
    OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  -- Settlement admission -> operation -> cart -> selected method -> discount ->
  -- products -> variants -> held reservations -> identity reservation.
  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'saas.storefront.checkout.settlement-admission',0
  ));
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.checkout.operation:'||p_operation_id::text,0
  ));
  selected_store_id:=saas.abandoned_cart_capture_store(p_hostname,p_now);
  SELECT cart.* INTO selected_cart FROM saas.abandoned_carts cart
  WHERE cart.store_id=selected_store_id AND cart.public_cart_digest=p_credential_digest
  ORDER BY cart.last_activity_at DESC,cart.id DESC
  LIMIT 1 FOR UPDATE OF cart;
  IF selected_cart.id IS NULL THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN;
  END IF;

  SELECT operation.* INTO selected_operation
  FROM saas.storefront_checkout_operations operation
  WHERE operation.operation_id=p_operation_id;
  IF selected_operation.operation_id IS NOT NULL THEN
    IF selected_operation.store_id<>selected_cart.store_id
      OR selected_operation.cart_id<>selected_cart.id
      OR selected_operation.action<>'submit_hosted'
      OR selected_operation.fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',selected_operation.result_payload;
    END IF;
    RETURN;
  END IF;

  IF selected_cart.status NOT IN('active','recovered')
    OR selected_cart.version<>p_expected_version
    OR selected_cart.checkout_nonce_digest IS NULL
    OR saas.quick_checkout_digest_matches(
      selected_cart.checkout_nonce_digest,p_nonce_digest
    ) IS DISTINCT FROM true
  THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF p_now<selected_cart.created_at OR p_now<selected_cart.last_activity_at
    OR selected_cart.version>=9007199254740991
    OR selected_cart.customer_name IS NULL OR selected_cart.customer_email IS NULL
    OR selected_cart.customer_phone IS NULL OR selected_cart.shipping_address IS NULL
    OR selected_cart.shipping_method_code IS DISTINCT FROM 'standard'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT method.* INTO selected_method FROM saas.payment_methods method
  WHERE method.store_id=selected_cart.store_id AND method.id=p_payment_method_id
  FOR UPDATE OF method;
  IF selected_method.id IS NULL OR selected_method.kind<>'provider'
    OR selected_method.state<>'active'
    OR selected_method.provider_code NOT IN('paytr_iframe','iyzico_iframe')
  THEN RETURN QUERY SELECT 'payment_method_unavailable',NULL::jsonb; RETURN; END IF;
  IF selected_method.provider_code='iyzico_iframe' AND p_identity_number IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT profile.* INTO selected_profile FROM saas.merchant_provider_profiles profile
  WHERE profile.store_id=selected_cart.store_id AND profile.id=selected_method.profile_id
    AND profile.provider_code=selected_method.provider_code;
  IF selected_profile.id IS NULL OR selected_profile.status<>'active'
    OR selected_profile.capability<>'payment_processing'
    OR selected_profile.execution_environment NOT IN('test','live')
    OR selected_profile.execution_adapter_version IS NULL
    OR selected_profile.execution_evidence_digest IS NULL
    OR selected_method.config->>'environment' IS DISTINCT FROM selected_profile.execution_environment
    OR saas.merchant_provider_execution_authority_matches(
      selected_profile.provider_code,selected_profile.capability,
      selected_profile.execution_environment,selected_profile.execution_adapter_version,
      selected_profile.execution_evidence_digest
    ) IS DISTINCT FROM true
    OR NOT EXISTS(
      SELECT 1 FROM saas.merchant_provider_definitions definition
      WHERE definition.provider_code=selected_method.provider_code
        AND definition.capability='payment_processing' AND definition.enabled
    )
    OR (SELECT pg_catalog.count(*) FROM saas.payment_methods active_method
      WHERE active_method.store_id=selected_cart.store_id
        AND active_method.kind='provider' AND active_method.state='active')<>1
  THEN RETURN QUERY SELECT 'payment_method_unavailable',NULL::jsonb; RETURN; END IF;

  IF selected_cart.discount_record_id IS NOT NULL THEN
    SELECT discount.* INTO selected_discount
    FROM saas.merchant_admin_records discount
    WHERE discount.store_id=selected_cart.store_id
      AND discount.id=selected_cart.discount_record_id
    FOR UPDATE OF discount;
    IF selected_discount.id IS NULL THEN
      RETURN QUERY SELECT 'discount_invalid',NULL::jsonb; RETURN;
    END IF;
  END IF;

  PERFORM item.id FROM saas.abandoned_cart_items item
  WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
  ORDER BY item.position,item.id FOR UPDATE OF item;
  PERFORM product.id FROM saas.products product
  WHERE product.store_id=selected_cart.store_id AND EXISTS(
    SELECT 1 FROM saas.abandoned_cart_items item
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
      AND item.product_id=product.id
  ) ORDER BY product.id FOR KEY SHARE OF product;
  PERFORM variant.id FROM saas.product_variants variant
  WHERE variant.store_id=selected_cart.store_id AND EXISTS(
    SELECT 1 FROM saas.abandoned_cart_items item
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
      AND item.variant_id=variant.id
  ) ORDER BY variant.id FOR UPDATE OF variant;
  PERFORM reservation.id FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=selected_cart.store_id AND reservation.status='held'
    AND EXISTS(
      SELECT 1 FROM saas.abandoned_cart_items item
      WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
        AND item.variant_id=reservation.variant_id
    )
  ORDER BY reservation.variant_id,reservation.id FOR UPDATE OF reservation;

  IF EXISTS(
    SELECT 1 FROM saas.storefront_checkout_payment_bridges bridge
    WHERE bridge.store_id=selected_cart.store_id AND bridge.cart_id=selected_cart.id
      AND bridge.status='active'
  ) THEN RETURN QUERY SELECT 'payment_method_unavailable',NULL::jsonb; RETURN; END IF;

  SELECT projected.outcome,projected.result_payload INTO quote_outcome,quote_payload
  FROM saas.storefront_checkout_build_quote(
    selected_cart.store_id,selected_cart.id,selected_cart.shipping_method_code,
    selected_cart.discount_record_id,selected_cart.discount_code,p_now
  ) projected;
  IF quote_outcome<>'found' THEN
    RETURN QUERY SELECT quote_outcome,quote_payload; RETURN;
  END IF;
  SELECT pg_catalog.count(*) INTO item_count FROM saas.abandoned_cart_items item
  WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id;
  IF pg_catalog.jsonb_typeof(quote_payload->'items')<>'array'
    OR item_count NOT BETWEEN 1 AND 100
    OR pg_catalog.jsonb_array_length(quote_payload->'items')<>item_count
    OR quote_payload->>'currency'<>selected_cart.currency
    OR (quote_payload->>'totalCents')::bigint<1
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  WITH quoted AS (
    SELECT entry.value AS quoted_item,entry.ordinality
    FROM pg_catalog.jsonb_array_elements(quote_payload->'items')
      WITH ORDINALITY entry(value,ordinality)
  ),matched AS (
    SELECT quoted.quoted_item,quoted.ordinality,item.*
    FROM quoted
    LEFT JOIN saas.abandoned_cart_items item
      ON item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
        AND item.id=(quoted.quoted_item->>'id')::uuid
  )
  SELECT
    pg_catalog.count(matched.id),
    pg_catalog.count(DISTINCT matched.id),
    COALESCE(pg_catalog.bool_and(
      matched.id IS NOT NULL
      AND pg_catalog.jsonb_typeof(matched.quoted_item)='object'
      AND matched.quoted_item?&ARRAY[
        'id','title','variantLabel','quantity','unitPriceCents','lineTotalCents','imagePath'
      ]
      AND pg_catalog.jsonb_typeof(matched.quoted_item->'id')='string'
      AND pg_catalog.jsonb_typeof(matched.quoted_item->'title')='string'
      AND pg_catalog.jsonb_typeof(matched.quoted_item->'quantity')='number'
      AND pg_catalog.jsonb_typeof(matched.quoted_item->'unitPriceCents')='number'
      AND pg_catalog.jsonb_typeof(matched.quoted_item->'lineTotalCents')='number'
      AND (matched.quoted_item->>'quantity')::bigint=matched.quantity
      AND (matched.quoted_item->>'unitPriceCents')::numeric>=0
      AND (matched.quoted_item->>'lineTotalCents')::numeric=
        (matched.quoted_item->>'unitPriceCents')::numeric*matched.quantity::numeric
    ),false),
    COALESCE(pg_catalog.sum((matched.quoted_item->>'lineTotalCents')::numeric),0),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'reference',matched.quoted_item->>'id','name',matched.quoted_item->>'title',
      'quantity',(matched.quoted_item->>'quantity')::bigint,
      'unitAmountMinor',(matched.quoted_item->>'unitPriceCents')::bigint,
      'itemType','PHYSICAL'
    ) ORDER BY matched.ordinality),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'reference',matched.quoted_item->>'id','productId',matched.product_id,
      'variantId',matched.variant_id,'position',matched.position,
      'productName',matched.quoted_item->>'title',
      'variantName',matched.quoted_item->>'variantLabel','sku',matched.sku,
      'unitPriceCents',(matched.quoted_item->>'unitPriceCents')::bigint,
      'quantity',(matched.quoted_item->>'quantity')::bigint,'discountCents',0,
      'lineTotalCents',(matched.quoted_item->>'lineTotalCents')::bigint
    ) ORDER BY matched.ordinality)
  INTO matched_item_count,unique_item_count,quote_items_valid,quoted_line_sum,
    basket,settlement_items
  FROM matched;
  IF matched_item_count<>item_count OR unique_item_count<>item_count
    OR quote_items_valid IS DISTINCT FROM true
    OR quoted_line_sum<>(quote_payload->>'subtotalCents')::numeric
    OR (quote_payload->>'subtotalCents')::numeric
      +(quote_payload->>'shippingCents')::numeric
      -(quote_payload->>'discountCents')::numeric
      <>(quote_payload->>'totalCents')::numeric
    OR pg_catalog.jsonb_array_length(basket)<>item_count
    OR pg_catalog.jsonb_array_length(settlement_items)<>item_count
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_SNAPSHOT_INVALID'; END IF;

  derived_order_id:=saas.storefront_checkout_uuid('hosted-order',p_attempt_id);
  SELECT pg_catalog.array_agg(
    saas.storefront_checkout_uuid('hosted-order-item',p_attempt_id,ordinal)
    ORDER BY ordinal
  ) INTO derived_order_item_ids
  FROM pg_catalog.generate_series(1,item_count::integer) ordinal;
  derived_order_event_id:=saas.storefront_checkout_uuid('hosted-order-event',p_attempt_id);
  derived_order_number:='SF-'||pg_catalog.upper(pg_catalog.substr(
    pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      'saas.storefront-checkout.hosted-order.v1:'||p_attempt_id::text,'UTF8'
    )),'hex'),1,20
  ));

  FOR identity_lock_key IN
    SELECT identity.lock_key FROM (
      SELECT 1 AS lock_rank,'order_id:'||derived_order_id::text AS lock_key
      UNION ALL SELECT 1,'order_number:'||derived_order_number
      UNION ALL SELECT 2,'order_item_id:'||item_id::text
        FROM pg_catalog.unnest(derived_order_item_ids) item_id
      UNION ALL SELECT 3,'order_event_id:'||derived_order_event_id::text
    ) identity ORDER BY identity.lock_rank,identity.lock_key
  LOOP
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.storefront.checkout.identity-reservation:'||identity_lock_key,0
    ));
  END LOOP;
  IF EXISTS(SELECT 1 FROM saas.orders orders WHERE orders.id=derived_order_id)
    OR EXISTS(SELECT 1 FROM saas.orders orders
      WHERE orders.store_id=selected_cart.store_id
        AND orders.order_number=derived_order_number)
    OR EXISTS(SELECT 1 FROM saas.order_items item
      WHERE item.id=ANY(derived_order_item_ids))
    OR EXISTS(SELECT 1 FROM saas.order_events event
      WHERE event.id=derived_order_event_id)
    OR EXISTS(
      SELECT 1 FROM saas.storefront_checkout_reserved_identities reserved
      WHERE (reserved.identity_kind='order_id'
          AND reserved.identity_value=derived_order_id::text)
        OR (reserved.identity_kind='order_number'
          AND reserved.identity_value=derived_order_number)
        OR (reserved.identity_kind='order_item_id'
          AND reserved.identity_value=ANY(derived_order_item_ids::text[]))
        OR (reserved.identity_kind='order_event_id'
          AND reserved.identity_value=derived_order_event_id::text)
    )
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT begun.outcome INTO begin_outcome FROM saas.payment_attempt_begin(
    selected_cart.store_id,p_now,p_attempt_id,p_fingerprint,selected_method.id,
    'sf:'||selected_cart.id::text,(quote_payload->>'totalCents')::bigint,
    selected_cart.currency,p_callback_binding_digest
  ) begun;
  IF begin_outcome<>'created' THEN
    IF begin_outcome='operation_mismatch' THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'payment_method_unavailable',NULL::jsonb;
    END IF;
    RETURN;
  END IF;

  SELECT attempt.* INTO selected_attempt
  FROM saas.payment_attempts attempt WHERE attempt.id=p_attempt_id;
  IF selected_attempt.id IS NULL
    OR selected_attempt.store_id<>selected_cart.store_id
    OR selected_attempt.payment_method_id<>selected_method.id
    OR selected_attempt.order_reference<>'sf:'||selected_cart.id::text
    OR selected_attempt.amount_minor<>(quote_payload->>'totalCents')::bigint
    OR selected_attempt.currency<>selected_cart.currency
    OR selected_attempt.provider_code NOT IN('paytr_iframe','iyzico_iframe')
    OR selected_attempt.environment NOT IN('test','live')
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_ATTEMPT_AUTHORITY_INVALID'; END IF;

  FOR item_record IN
    SELECT item.product_id,item.variant_id,pg_catalog.sum(item.quantity)::bigint AS quantity,
      variant.stock_tracking
    FROM saas.abandoned_cart_items item
    JOIN saas.product_variants variant
      ON variant.store_id=item.store_id AND variant.id=item.variant_id
    WHERE item.store_id=selected_cart.store_id AND item.cart_id=selected_cart.id
    GROUP BY item.product_id,item.variant_id,variant.stock_tracking
    ORDER BY item.product_id,item.variant_id
  LOOP
    SELECT COALESCE(pg_catalog.sum(reservation.quantity),0) INTO held_quantity
    FROM saas.checkout_inventory_reservations reservation
    WHERE reservation.store_id=selected_cart.store_id
      AND reservation.variant_id=item_record.variant_id
      AND reservation.status='held' AND reservation.stock_tracked;
    IF item_record.stock_tracking AND EXISTS(
      SELECT 1 FROM saas.product_variants variant
      WHERE variant.store_id=selected_cart.store_id AND variant.id=item_record.variant_id
        AND variant.stock_quantity::numeric-held_quantity<item_record.quantity
    ) THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_STOCK_CONFLICT'; END IF;
    INSERT INTO saas.checkout_inventory_reservations(
      id,store_id,payment_attempt_id,product_id,variant_id,quantity,
      stock_tracked,status,held_at,version,updated_at
    ) VALUES(
      saas.storefront_checkout_uuid(
        'hosted-reservation:'||item_record.variant_id::text,p_attempt_id
      ),selected_cart.store_id,p_attempt_id,item_record.product_id,item_record.variant_id,
      item_record.quantity,item_record.stock_tracking,'held',p_now,1,p_now
    );
  END LOOP;

  settlement_snapshot:=pg_catalog.jsonb_build_object(
    'customer',pg_catalog.jsonb_build_object(
      'name',selected_cart.customer_name,'email',selected_cart.customer_email,
      'phone',selected_cart.customer_phone,'identityNumber',p_identity_number,
      'shippingAddress',selected_cart.shipping_address,
      'billingAddress',selected_cart.billing_address
    ),
    'money',pg_catalog.jsonb_build_object(
      'currency',selected_attempt.currency,
      'subtotalCents',(quote_payload->>'subtotalCents')::bigint,
      'shippingCents',(quote_payload->>'shippingCents')::bigint,
      'discountCents',(quote_payload->>'discountCents')::bigint,
      'totalCents',selected_attempt.amount_minor,
      'discountCode',selected_cart.discount_code
    ),
    'items',settlement_items
  );

  INSERT INTO saas.storefront_checkout_payment_bridges(
    attempt_id,store_id,cart_id,order_id,order_item_ids,order_event_id,
    order_number,discount_record_id,settlement_snapshot,status,created_at
  ) VALUES(
    p_attempt_id,selected_cart.store_id,selected_cart.id,derived_order_id,
    derived_order_item_ids,derived_order_event_id,derived_order_number,
    selected_cart.discount_record_id,settlement_snapshot,'active',p_now
  );

  INSERT INTO saas.storefront_checkout_reserved_identities(
    identity_kind,identity_value,attempt_id,ordinal,created_at
  ) VALUES
    ('order_id',derived_order_id::text,p_attempt_id,0,p_now),
    ('order_event_id',derived_order_event_id::text,p_attempt_id,0,p_now),
    ('order_number',derived_order_number,p_attempt_id,0,p_now);
  INSERT INTO saas.storefront_checkout_reserved_identities(
    identity_kind,identity_value,attempt_id,ordinal,created_at
  )
  SELECT 'order_item_id',identity.id::text,p_attempt_id,identity.ordinality::integer,p_now
  FROM pg_catalog.unnest(derived_order_item_ids) WITH ORDINALITY identity(id,ordinality);

  result:=pg_catalog.jsonb_build_object(
    'storeId',selected_attempt.store_id,'paymentMethodId',selected_attempt.payment_method_id,
    'profileId',selected_attempt.profile_id,'providerCode',selected_attempt.provider_code,
    'orderReference',selected_attempt.order_reference,
    'amountMinor',selected_attempt.amount_minor,'currency',selected_attempt.currency,
    'customer',settlement_snapshot->'customer','basket',basket,
    'attemptId',selected_attempt.id,'bridgeId',selected_attempt.id,
    'environment',selected_attempt.environment,'reservationStatus','held'
  );
  INSERT INTO saas.storefront_checkout_operations(
    operation_id,store_id,cart_id,action,fingerprint,result_payload,committed_at
  ) VALUES(
    p_operation_id,selected_cart.store_id,selected_cart.id,'submit_hosted',
    p_fingerprint,result,p_now
  );
  UPDATE saas.abandoned_carts SET
    selected_payment_method_id=selected_method.id,checkout_nonce_digest=NULL,
    version=version+1,last_activity_at=p_now,updated_at=p_now
  WHERE store_id=selected_cart.store_id AND id=selected_cart.id;
  RETURN QUERY SELECT 'created',result;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_payment_attempt_terminal()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_bridge saas.storefront_checkout_payment_bridges%ROWTYPE;
  selected_cart_id uuid;
  item_record record;
  tracked_count bigint;
  updated_count bigint;
  snapshot_money jsonb;
  snapshot_items jsonb;
  snapshot_item_count integer:=0;
  snapshot_subtotal numeric;
  snapshot_shipping numeric;
  snapshot_discount numeric;
  snapshot_total numeric;
  snapshot_line_sum numeric:=0;
  snapshot_unit numeric;
  snapshot_quantity numeric;
  snapshot_line numeric;
  snapshot_item_discount numeric;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  IF NEW.order_reference!~
    '^sf:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
  THEN RETURN NEW; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended(
    'saas.storefront.checkout.settlement-admission',0
  ));
  SELECT bridge.* INTO selected_bridge
  FROM saas.storefront_checkout_payment_bridges bridge
  WHERE bridge.attempt_id=NEW.id;
  IF selected_bridge.attempt_id IS NULL OR selected_bridge.status<>'active' THEN
    RETURN NEW;
  END IF;

  SELECT cart.id INTO selected_cart_id FROM saas.abandoned_carts cart
  WHERE cart.store_id=selected_bridge.store_id AND cart.id=selected_bridge.cart_id
  FOR UPDATE OF cart;
  IF selected_cart_id IS NULL THEN
    RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_CART_CONFLICT';
  END IF;
  SELECT bridge.* INTO selected_bridge
  FROM saas.storefront_checkout_payment_bridges bridge
  WHERE bridge.attempt_id=NEW.id FOR UPDATE OF bridge;
  IF selected_bridge.status<>'active' THEN RETURN NEW; END IF;

  IF NEW.status='captured' THEN
    IF NEW.id<>selected_bridge.attempt_id OR NEW.store_id<>selected_bridge.store_id
      OR selected_bridge.settlement_snapshot IS NULL
      OR pg_catalog.jsonb_typeof(selected_bridge.settlement_snapshot)<>'object'
      OR NOT selected_bridge.settlement_snapshot?&ARRAY['customer','money','items']
      OR pg_catalog.jsonb_typeof(selected_bridge.settlement_snapshot->'customer')<>'object'
      OR pg_catalog.jsonb_typeof(selected_bridge.settlement_snapshot->'money')<>'object'
      OR pg_catalog.jsonb_typeof(selected_bridge.settlement_snapshot->'items')<>'array'
    THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_SETTLEMENT_CONFLICT'; END IF;

    snapshot_money:=selected_bridge.settlement_snapshot->'money';
    snapshot_items:=selected_bridge.settlement_snapshot->'items';
    IF NOT snapshot_money?&ARRAY[
        'currency','subtotalCents','shippingCents','discountCents','totalCents','discountCode'
      ]
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(snapshot_money))<>6
      OR pg_catalog.jsonb_typeof(snapshot_money->'currency')<>'string'
      OR pg_catalog.jsonb_typeof(snapshot_money->'subtotalCents')<>'number'
      OR pg_catalog.jsonb_typeof(snapshot_money->'shippingCents')<>'number'
      OR pg_catalog.jsonb_typeof(snapshot_money->'discountCents')<>'number'
      OR pg_catalog.jsonb_typeof(snapshot_money->'totalCents')<>'number'
      OR ((snapshot_money->>'subtotalCents')~'^(0|[1-9][0-9]{0,15})$') IS DISTINCT FROM true
      OR ((snapshot_money->>'shippingCents')~'^(0|[1-9][0-9]{0,15})$') IS DISTINCT FROM true
      OR ((snapshot_money->>'discountCents')~'^(0|[1-9][0-9]{0,15})$') IS DISTINCT FROM true
      OR ((snapshot_money->>'totalCents')~'^[1-9][0-9]{0,15}$') IS DISTINCT FROM true
      OR pg_catalog.jsonb_array_length(snapshot_items)
        <>pg_catalog.cardinality(selected_bridge.order_item_ids)
    THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_SETTLEMENT_CONFLICT'; END IF;

    snapshot_subtotal:=(snapshot_money->>'subtotalCents')::numeric;
    snapshot_shipping:=(snapshot_money->>'shippingCents')::numeric;
    snapshot_discount:=(snapshot_money->>'discountCents')::numeric;
    snapshot_total:=(snapshot_money->>'totalCents')::numeric;
    IF snapshot_subtotal>500000000000000
      OR snapshot_shipping>500000000000000
      OR snapshot_discount>500000000000000
      OR snapshot_total>9007199254740991
      OR snapshot_subtotal+snapshot_shipping-snapshot_discount<>snapshot_total
      OR snapshot_money->>'currency'<>NEW.currency
      OR snapshot_total<>NEW.amount_minor::numeric
    THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_SETTLEMENT_CONFLICT'; END IF;

    FOR item_record IN
      SELECT entry.value AS snapshot_item,entry.ordinality::integer AS item_index
      FROM pg_catalog.jsonb_array_elements(snapshot_items)
        WITH ORDINALITY entry(value,ordinality)
      ORDER BY entry.ordinality
    LOOP
      snapshot_item_count:=snapshot_item_count+1;
      IF pg_catalog.jsonb_typeof(item_record.snapshot_item)<>'object'
        OR NOT item_record.snapshot_item?&ARRAY[
          'reference','productId','variantId','position','productName','variantName','sku',
          'unitPriceCents','quantity','discountCents','lineTotalCents'
        ]
        OR (SELECT pg_catalog.count(*)
          FROM pg_catalog.jsonb_object_keys(item_record.snapshot_item))<>11
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'reference')<>'string'
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'productId')<>'string'
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'variantId')<>'string'
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'position')<>'number'
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'productName')<>'string'
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'variantName') NOT IN('string','null')
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'sku') NOT IN('string','null')
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'unitPriceCents')<>'number'
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'quantity')<>'number'
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'discountCents')<>'number'
        OR pg_catalog.jsonb_typeof(item_record.snapshot_item->'lineTotalCents')<>'number'
        OR ((item_record.snapshot_item->>'reference')~
          '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
          IS DISTINCT FROM true
        OR ((item_record.snapshot_item->>'productId')~
          '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
          IS DISTINCT FROM true
        OR ((item_record.snapshot_item->>'variantId')~
          '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$')
          IS DISTINCT FROM true
        OR ((item_record.snapshot_item->>'position')~'^(0|[1-9][0-9]?)$')
          IS DISTINCT FROM true
        OR ((item_record.snapshot_item->>'unitPriceCents')~'^(0|[1-9][0-9]{0,15})$')
          IS DISTINCT FROM true
        OR ((item_record.snapshot_item->>'quantity')~'^[1-9][0-9]{0,3}$')
          IS DISTINCT FROM true
        OR ((item_record.snapshot_item->>'discountCents')~'^(0|[1-9][0-9]{0,15})$')
          IS DISTINCT FROM true
        OR ((item_record.snapshot_item->>'lineTotalCents')~'^(0|[1-9][0-9]{0,15})$')
          IS DISTINCT FROM true
      THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_SETTLEMENT_CONFLICT'; END IF;

      snapshot_unit:=(item_record.snapshot_item->>'unitPriceCents')::numeric;
      snapshot_quantity:=(item_record.snapshot_item->>'quantity')::numeric;
      snapshot_item_discount:=(item_record.snapshot_item->>'discountCents')::numeric;
      snapshot_line:=(item_record.snapshot_item->>'lineTotalCents')::numeric;
      IF (item_record.snapshot_item->>'position')::numeric NOT BETWEEN 0 AND 99
        OR snapshot_unit>500000000000000 OR snapshot_quantity NOT BETWEEN 1 AND 9999
        OR snapshot_item_discount<>0
        OR snapshot_line<>snapshot_unit*snapshot_quantity
        OR snapshot_line>500000000000000
      THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_SETTLEMENT_CONFLICT'; END IF;
      snapshot_line_sum:=snapshot_line_sum+snapshot_line;
    END LOOP;
    IF snapshot_item_count<>pg_catalog.cardinality(selected_bridge.order_item_ids)
      OR snapshot_line_sum<>snapshot_subtotal
      OR (SELECT pg_catalog.count(DISTINCT entry->>'reference')
        FROM pg_catalog.jsonb_array_elements(snapshot_items) entry)<>snapshot_item_count
      OR (SELECT pg_catalog.count(DISTINCT entry->>'position')
        FROM pg_catalog.jsonb_array_elements(snapshot_items) entry)<>snapshot_item_count
    THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_SETTLEMENT_CONFLICT'; END IF;

    PERFORM variant.id FROM saas.product_variants variant
    WHERE variant.store_id=selected_bridge.store_id AND EXISTS(
      SELECT 1 FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=selected_bridge.store_id
        AND reservation.payment_attempt_id=NEW.id AND reservation.variant_id=variant.id
    ) ORDER BY variant.id FOR UPDATE OF variant;
    PERFORM reservation.id FROM saas.checkout_inventory_reservations reservation
    WHERE reservation.store_id=selected_bridge.store_id
      AND reservation.payment_attempt_id=NEW.id
    ORDER BY reservation.variant_id,reservation.id FOR UPDATE OF reservation;

    IF NOT EXISTS(
        SELECT 1 FROM saas.checkout_inventory_reservations reservation
        WHERE reservation.store_id=selected_bridge.store_id
          AND reservation.payment_attempt_id=NEW.id
      )
      OR EXISTS(
        SELECT 1 FROM saas.checkout_inventory_reservations reservation
        WHERE reservation.store_id=selected_bridge.store_id
          AND reservation.payment_attempt_id=NEW.id AND reservation.status<>'held'
      )
      OR EXISTS(
        SELECT 1
        FROM (
          SELECT (entry->>'productId')::uuid AS product_id,
            (entry->>'variantId')::uuid AS variant_id,
            pg_catalog.sum((entry->>'quantity')::bigint) AS quantity
          FROM pg_catalog.jsonb_array_elements(
            selected_bridge.settlement_snapshot->'items'
          ) entry
          GROUP BY (entry->>'productId')::uuid,(entry->>'variantId')::uuid
        ) snapshot_item
        FULL JOIN (
          SELECT reservation.product_id,reservation.variant_id,
            pg_catalog.sum(reservation.quantity)::bigint AS quantity
          FROM saas.checkout_inventory_reservations reservation
          WHERE reservation.store_id=selected_bridge.store_id
            AND reservation.payment_attempt_id=NEW.id
          GROUP BY reservation.product_id,reservation.variant_id
        ) held USING(product_id,variant_id)
        WHERE snapshot_item.quantity IS DISTINCT FROM held.quantity
      )
      OR EXISTS(
        SELECT 1 FROM saas.checkout_inventory_reservations reservation
        JOIN saas.product_variants variant
          ON variant.store_id=reservation.store_id AND variant.id=reservation.variant_id
        WHERE reservation.store_id=selected_bridge.store_id
          AND reservation.payment_attempt_id=NEW.id AND reservation.stock_tracked
          AND variant.stock_quantity<reservation.quantity
      )
    THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_SETTLEMENT_CONFLICT'; END IF;

    PERFORM pg_catalog.set_config(
      'saas.storefront_checkout.settlement_attempt_id',NEW.id::text,true
    );

    INSERT INTO saas.orders(
      id,store_id,order_number,source,customer_name,customer_email,customer_phone,
      currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,
      payment_status,shipping_address,billing_address,storefront_cart_id,
      version,created_at,updated_at
    ) VALUES(
      selected_bridge.order_id,selected_bridge.store_id,selected_bridge.order_number,
      'storefront',selected_bridge.settlement_snapshot#>>'{customer,name}',
      selected_bridge.settlement_snapshot#>>'{customer,email}',
      selected_bridge.settlement_snapshot#>>'{customer,phone}',
      selected_bridge.settlement_snapshot#>>'{money,currency}',
      (selected_bridge.settlement_snapshot#>>'{money,subtotalCents}')::bigint,
      (selected_bridge.settlement_snapshot#>>'{money,shippingCents}')::bigint,
      (selected_bridge.settlement_snapshot#>>'{money,discountCents}')::bigint,
      (selected_bridge.settlement_snapshot#>>'{money,totalCents}')::bigint,
      'confirmed','completed',selected_bridge.settlement_snapshot#>'{customer,shippingAddress}',
      selected_bridge.settlement_snapshot#>'{customer,billingAddress}',
      selected_bridge.cart_id,1,NEW.updated_at,NEW.updated_at
    );

    FOR item_record IN
      SELECT entry.value AS snapshot_item,entry.ordinality::integer AS item_index
      FROM pg_catalog.jsonb_array_elements(
        selected_bridge.settlement_snapshot->'items'
      ) WITH ORDINALITY entry(value,ordinality)
      ORDER BY entry.ordinality
    LOOP
      INSERT INTO saas.order_items(
        id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,
        unit_price_cents,quantity,discount_cents,line_total_cents,created_at
      ) VALUES(
        selected_bridge.order_item_ids[item_record.item_index],selected_bridge.store_id,
        selected_bridge.order_id,(item_record.snapshot_item->>'productId')::uuid,
        (item_record.snapshot_item->>'variantId')::uuid,
        (item_record.snapshot_item->>'position')::integer,
        item_record.snapshot_item->>'productName',item_record.snapshot_item->>'variantName',
        item_record.snapshot_item->>'sku',
        (item_record.snapshot_item->>'unitPriceCents')::bigint,
        (item_record.snapshot_item->>'quantity')::integer,
        (item_record.snapshot_item->>'discountCents')::bigint,
        (item_record.snapshot_item->>'lineTotalCents')::bigint,NEW.updated_at
      );
    END LOOP;

    INSERT INTO saas.order_events(
      id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,
      message,payload,created_at
    ) VALUES(
      selected_bridge.order_event_id,selected_bridge.store_id,selected_bridge.order_id,
      NULL,'order_created',NULL,'confirmed','Storefront hosted payment captured',
      pg_catalog.jsonb_build_object('source','storefront','providerCode',NEW.provider_code),
      NEW.updated_at
    );

    UPDATE saas.checkout_inventory_reservations SET
      status='consumed',consumed_at=NEW.updated_at,version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_bridge.store_id AND payment_attempt_id=NEW.id AND status='held';
    SELECT pg_catalog.count(*) INTO tracked_count
    FROM saas.checkout_inventory_reservations reservation
    WHERE reservation.store_id=selected_bridge.store_id
      AND reservation.payment_attempt_id=NEW.id AND reservation.stock_tracked;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id',NEW.id::text,true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time',NEW.updated_at::text,true);
    UPDATE saas.product_variants variant SET
      stock_quantity=variant.stock_quantity-reservation.quantity,
      version=variant.version+1,updated_at=NEW.updated_at
    FROM saas.checkout_inventory_reservations reservation
    WHERE reservation.store_id=selected_bridge.store_id
      AND reservation.payment_attempt_id=NEW.id AND reservation.stock_tracked
      AND variant.store_id=reservation.store_id AND variant.id=reservation.variant_id;
    GET DIAGNOSTICS updated_count=ROW_COUNT;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
    IF updated_count<>tracked_count THEN
      RAISE EXCEPTION 'STOREFRONT_CHECKOUT_HOSTED_STOCK_CONFLICT';
    END IF;

    IF selected_bridge.discount_record_id IS NOT NULL THEN
      INSERT INTO saas.storefront_checkout_discount_redemptions(
        store_id,discount_record_id,order_id,redeemed_at
      ) VALUES(
        selected_bridge.store_id,selected_bridge.discount_record_id,
        selected_bridge.order_id,NEW.updated_at
      );
    END IF;
    UPDATE saas.abandoned_carts SET
      status='archived',archived_at=NEW.updated_at,recovered_order_id=selected_bridge.order_id,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_bridge.store_id AND id=selected_bridge.cart_id;
    UPDATE saas.storefront_checkout_payment_bridges SET
      status='captured',settled_at=NEW.updated_at
    WHERE attempt_id=NEW.id;
    PERFORM pg_catalog.set_config('saas.storefront_checkout.settlement_attempt_id','',true);
  ELSIF NEW.status IN('failed','cancelled','expired') THEN
    PERFORM reservation.id FROM saas.checkout_inventory_reservations reservation
    WHERE reservation.store_id=selected_bridge.store_id
      AND reservation.payment_attempt_id=NEW.id
    ORDER BY reservation.variant_id,reservation.id FOR UPDATE OF reservation;
    UPDATE saas.checkout_inventory_reservations SET
      status='released',released_at=NEW.updated_at,version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_bridge.store_id AND payment_attempt_id=NEW.id AND status='held';
    UPDATE saas.storefront_checkout_payment_bridges SET
      status=NEW.status,settled_at=NEW.updated_at
    WHERE attempt_id=NEW.id;
  END IF;
  RETURN NEW;
END
$f$;

CREATE TRIGGER payment_attempt_storefront_checkout_terminal
AFTER UPDATE OF status ON saas.payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.storefront_checkout_payment_attempt_terminal();

CREATE FUNCTION saas.storefront_checkout_preflight()
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $f$
DECLARE
  owner_oid oid:='celebix_saas_owner'::regrole;
  app_oid oid:='celebix_saas_app'::regrole;
  workflow_oid oid:='celebix_saas_workflow'::regrole;
  signature text;
  expected_hash text;
  expected_volatility "char";
  expected_language text;
  expected_security_definer boolean;
  expected_strict boolean;
  procedure_oid oid;
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_roles
    WHERE oid=owner_oid AND rolbypassrls AND NOT rolsuper
      AND NOT rolcanlogin AND NOT rolinherit
  ) OR saas.built_in_payment_methods_preflight() IS DISTINCT FROM true
    OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true
    OR saas.quick_order_hosted_payment_bridge_preflight() IS DISTINCT FROM true
  THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('saas.abandoned_carts','marketing_opt_in','boolean',true,'false'),
      ('saas.abandoned_carts','shipping_address','jsonb',false,NULL),
      ('saas.abandoned_carts','billing_address','jsonb',false,NULL),
      ('saas.abandoned_carts','shipping_method_code','text',false,NULL),
      ('saas.abandoned_carts','shipping_cents','bigint',true,'0'),
      ('saas.abandoned_carts','discount_record_id','uuid',false,NULL),
      ('saas.abandoned_carts','discount_code','text',false,NULL),
      ('saas.abandoned_carts','checkout_nonce_digest','character(64)',false,NULL),
      ('saas.abandoned_carts','selected_payment_method_id','uuid',false,NULL),
      ('saas.orders','storefront_cart_id','uuid',false,NULL),
      ('saas.checkout_inventory_reservations','quick_order_link_id','uuid',false,NULL),
      ('saas.storefront_checkout_discount_redemptions','store_id','uuid',true,NULL),
      ('saas.storefront_checkout_discount_redemptions','discount_record_id','uuid',true,NULL),
      ('saas.storefront_checkout_discount_redemptions','order_id','uuid',true,NULL),
      ('saas.storefront_checkout_discount_redemptions','redeemed_at','timestamp with time zone',true,NULL),
      ('saas.storefront_checkout_payment_bridges','attempt_id','uuid',true,NULL),
      ('saas.storefront_checkout_payment_bridges','store_id','uuid',true,NULL),
      ('saas.storefront_checkout_payment_bridges','cart_id','uuid',true,NULL),
      ('saas.storefront_checkout_payment_bridges','order_id','uuid',true,NULL),
      ('saas.storefront_checkout_payment_bridges','order_item_ids','uuid[]',true,NULL),
      ('saas.storefront_checkout_payment_bridges','order_event_id','uuid',true,NULL),
      ('saas.storefront_checkout_payment_bridges','order_number','text',true,NULL),
      ('saas.storefront_checkout_payment_bridges','discount_record_id','uuid',false,NULL),
      ('saas.storefront_checkout_payment_bridges','settlement_snapshot','jsonb',true,NULL),
      ('saas.storefront_checkout_payment_bridges','status','text',true,NULL),
      ('saas.storefront_checkout_payment_bridges','created_at','timestamp with time zone',true,NULL),
      ('saas.storefront_checkout_payment_bridges','settled_at','timestamp with time zone',false,NULL),
      ('saas.storefront_checkout_reserved_identities','identity_kind','text',true,NULL),
      ('saas.storefront_checkout_reserved_identities','identity_value','text',true,NULL),
      ('saas.storefront_checkout_reserved_identities','attempt_id','uuid',true,NULL),
      ('saas.storefront_checkout_reserved_identities','ordinal','integer',true,NULL),
      ('saas.storefront_checkout_reserved_identities','created_at','timestamp with time zone',true,NULL),
      ('saas.storefront_checkout_operations','operation_id','uuid',true,NULL),
      ('saas.storefront_checkout_operations','store_id','uuid',true,NULL),
      ('saas.storefront_checkout_operations','cart_id','uuid',true,NULL),
      ('saas.storefront_checkout_operations','action','text',true,NULL),
      ('saas.storefront_checkout_operations','fingerprint','character(64)',true,NULL),
      ('saas.storefront_checkout_operations','result_payload','jsonb',true,NULL),
      ('saas.storefront_checkout_operations','committed_at','timestamp with time zone',true,NULL)
    ) expected(relation_name,column_name,type_name,is_not_null,default_expression)
    LEFT JOIN pg_catalog.pg_attribute attribute
      ON attribute.attrelid=expected.relation_name::pg_catalog.regclass
      AND attribute.attname=expected.column_name
      AND attribute.attnum>0 AND NOT attribute.attisdropped
    LEFT JOIN pg_catalog.pg_attrdef default_info
      ON default_info.adrelid=attribute.attrelid AND default_info.adnum=attribute.attnum
    WHERE attribute.attrelid IS NULL
      OR pg_catalog.format_type(attribute.atttypid,attribute.atttypmod)<>expected.type_name
      OR attribute.attnotnull<>expected.is_not_null
      OR pg_catalog.pg_get_expr(default_info.adbin,default_info.adrelid)
        IS DISTINCT FROM expected.default_expression
  ) THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('saas.abandoned_carts','abandoned_carts_total_check','c',
       'CHECK (((total_cents = ((subtotal_cents + shipping_cents) - discount_cents)) AND (total_cents >= 0)))'),
      ('saas.abandoned_carts','abandoned_carts_checkout_money_check','c',
       'CHECK ((((subtotal_cents >= 0) AND (subtotal_cents <= ''500000000000000''::bigint)) AND ((shipping_cents >= 0) AND (shipping_cents <= ''500000000000000''::bigint)) AND ((discount_cents >= 0) AND (discount_cents <= ''500000000000000''::bigint)) AND (discount_cents <= (subtotal_cents + shipping_cents))))'),
      ('saas.abandoned_carts','abandoned_carts_shipping_address_check','c',
       'CHECK (((shipping_address IS NULL) OR storefront_checkout_address_valid(shipping_address)))'),
      ('saas.abandoned_carts','abandoned_carts_billing_address_check','c',
       'CHECK (((billing_address IS NULL) OR storefront_checkout_address_valid(billing_address)))'),
      ('saas.abandoned_carts','abandoned_carts_shipping_method_code_check','c',
       'CHECK (((shipping_method_code IS NULL) OR (shipping_method_code = ''standard''::text)))'),
      ('saas.abandoned_carts','abandoned_carts_discount_authority_check','c',
       'CHECK (((discount_record_id IS NULL) = (discount_code IS NULL)))'),
      ('saas.abandoned_carts','abandoned_carts_discount_code_check','c',
       'CHECK (((discount_code IS NULL) OR ((discount_code = upper(discount_code)) AND (discount_code = btrim(discount_code)) AND (discount_code ~ ''^[A-Z0-9][A-Z0-9_-]{0,63}$''::text))))'),
      ('saas.abandoned_carts','abandoned_carts_checkout_nonce_digest_check','c',
       'CHECK (((checkout_nonce_digest IS NULL) OR (checkout_nonce_digest ~ ''^[a-f0-9]{64}$''::text)))'),
      ('saas.abandoned_carts','abandoned_carts_discount_record_store_fk','f',
       'FOREIGN KEY (store_id, discount_record_id) REFERENCES merchant_admin_records(store_id, id) ON DELETE RESTRICT'),
      ('saas.abandoned_carts','abandoned_carts_selected_payment_method_store_fk','f',
       'FOREIGN KEY (store_id, selected_payment_method_id) REFERENCES payment_methods(store_id, id) ON DELETE RESTRICT'),
      ('saas.orders','orders_storefront_cart_source_check','c',
       'CHECK (((storefront_cart_id IS NULL) OR (source = ''storefront''::text)))'),
      ('saas.orders','orders_storefront_cart_store_fk','f',
       'FOREIGN KEY (store_id, storefront_cart_id) REFERENCES abandoned_carts(store_id, id) ON DELETE RESTRICT'),
      ('saas.orders','orders_storefront_cart_key','u','UNIQUE (store_id, storefront_cart_id)'),
      ('saas.storefront_checkout_discount_redemptions','storefront_checkout_discount_redemptions_pkey','p',
       'PRIMARY KEY (store_id, discount_record_id, order_id)'),
      ('saas.storefront_checkout_discount_redemptions','sf_checkout_discount_redemptions_discount_fk','f',
       'FOREIGN KEY (store_id, discount_record_id) REFERENCES merchant_admin_records(store_id, id) ON DELETE RESTRICT'),
      ('saas.storefront_checkout_discount_redemptions','sf_checkout_discount_redemptions_order_fk','f',
       'FOREIGN KEY (store_id, order_id) REFERENCES orders(store_id, id) ON DELETE RESTRICT'),
      ('saas.storefront_checkout_discount_redemptions','sf_checkout_discount_redemptions_redeemed_check','c',
       'CHECK (isfinite(redeemed_at))'),
      ('saas.storefront_checkout_payment_bridges','storefront_checkout_payment_bridges_pkey','p',
       'PRIMARY KEY (attempt_id)'),
      ('saas.storefront_checkout_payment_bridges','sf_checkout_payment_bridges_attempt_fk','f',
       'FOREIGN KEY (attempt_id) REFERENCES payment_attempts(id) ON DELETE RESTRICT'),
      ('saas.storefront_checkout_payment_bridges','sf_checkout_payment_bridges_cart_fk','f',
       'FOREIGN KEY (store_id, cart_id) REFERENCES abandoned_carts(store_id, id) ON DELETE RESTRICT'),
      ('saas.storefront_checkout_payment_bridges','sf_checkout_payment_bridges_discount_fk','f',
       'FOREIGN KEY (store_id, discount_record_id) REFERENCES merchant_admin_records(store_id, id) ON DELETE RESTRICT'),
      ('saas.storefront_checkout_payment_bridges','sf_checkout_payment_bridges_status_check','c',
       'CHECK ((status = ANY (ARRAY[''active''::text, ''captured''::text, ''failed''::text, ''cancelled''::text, ''expired''::text])))'),
      ('saas.storefront_checkout_payment_bridges','sf_checkout_payment_bridges_items_check','c',
       'CHECK (((array_ndims(order_item_ids) = 1) AND (array_lower(order_item_ids, 1) = 1) AND ((cardinality(order_item_ids) >= 1) AND (cardinality(order_item_ids) <= 100)) AND (array_position(order_item_ids, NULL::uuid) IS NULL)))'),
      ('saas.storefront_checkout_payment_bridges','sf_checkout_payment_bridges_order_number_check','c',
       'CHECK (((order_number = btrim(order_number)) AND ((char_length(order_number) >= 1) AND (char_length(order_number) <= 128)) AND (order_number !~ ''[[:cntrl:]]''::text)))'),
      ('saas.storefront_checkout_payment_bridges','sf_checkout_payment_bridges_snapshot_check','c',
       'CHECK (((jsonb_typeof(settlement_snapshot) = ''object''::text) AND (settlement_snapshot ?& ARRAY[''customer''::text, ''money''::text, ''items''::text]) AND (jsonb_typeof((settlement_snapshot -> ''customer''::text)) = ''object''::text) AND (jsonb_typeof((settlement_snapshot -> ''money''::text)) = ''object''::text) AND (jsonb_typeof((settlement_snapshot -> ''items''::text)) = ''array''::text) AND ((jsonb_array_length((settlement_snapshot -> ''items''::text)) >= 1) AND (jsonb_array_length((settlement_snapshot -> ''items''::text)) <= 100)) AND (pg_column_size(settlement_snapshot) <= 1048576)))'),
      ('saas.storefront_checkout_payment_bridges','sf_checkout_payment_bridges_time_check','c',
       'CHECK ((isfinite(created_at) AND ((settled_at IS NULL) OR isfinite(settled_at)) AND (((status = ''active''::text) AND (settled_at IS NULL)) OR ((status <> ''active''::text) AND (settled_at IS NOT NULL)))))'),
      ('saas.storefront_checkout_reserved_identities','storefront_checkout_reserved_identities_pkey','p',
       'PRIMARY KEY (identity_kind, identity_value)'),
      ('saas.storefront_checkout_reserved_identities','storefront_checkout_reserved__attempt_id_identity_kind_ordi_key','u',
       'UNIQUE (attempt_id, identity_kind, ordinal)'),
      ('saas.storefront_checkout_reserved_identities','sf_checkout_reserved_identities_attempt_fk','f',
       'FOREIGN KEY (attempt_id) REFERENCES storefront_checkout_payment_bridges(attempt_id) ON DELETE RESTRICT'),
      ('saas.storefront_checkout_reserved_identities','sf_checkout_reserved_identities_value_check','c',
       'CHECK ((((identity_kind = ANY (ARRAY[''order_id''::text, ''order_item_id''::text, ''order_event_id''::text])) AND (identity_value ~ ''^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$''::text)) OR ((identity_kind = ''order_number''::text) AND (identity_value ~ ''^SF-[A-F0-9]{20}$''::text))))'),
      ('saas.storefront_checkout_reserved_identities','sf_checkout_reserved_identities_ordinal_check','c',
       'CHECK ((((identity_kind = ''order_item_id''::text) AND ((ordinal >= 1) AND (ordinal <= 100))) OR ((identity_kind <> ''order_item_id''::text) AND (ordinal = 0))))'),
      ('saas.storefront_checkout_reserved_identities','sf_checkout_reserved_identities_created_check','c',
       'CHECK (isfinite(created_at))'),
      ('saas.storefront_checkout_operations','storefront_checkout_operations_pkey','p','PRIMARY KEY (operation_id)'),
      ('saas.storefront_checkout_operations','storefront_checkout_operation_store_id_cart_id_operation_id_key','u','UNIQUE (store_id, cart_id, operation_id)'),
      ('saas.storefront_checkout_operations','storefront_checkout_operations_store_id_cart_id_fkey','f',
       'FOREIGN KEY (store_id, cart_id) REFERENCES abandoned_carts(store_id, id) ON DELETE RESTRICT'),
      ('saas.storefront_checkout_operations','storefront_checkout_operations_action_check','c',
       'CHECK ((action = ANY (ARRAY[''delivery''::text, ''submit_builtin''::text, ''submit_hosted''::text])))'),
      ('saas.storefront_checkout_operations','storefront_checkout_operations_fingerprint_check','c',
       'CHECK ((fingerprint ~ ''^[a-f0-9]{64}$''::text))'),
      ('saas.storefront_checkout_operations','storefront_checkout_operations_result_check','c',
       'CHECK ((jsonb_typeof(result_payload) = ''object''::text))'),
      ('saas.storefront_checkout_operations','storefront_checkout_operations_committed_check','c',
       'CHECK (isfinite(committed_at))')
    ) expected(relation_name,constraint_name,constraint_type,constraint_definition)
    LEFT JOIN pg_catalog.pg_constraint constraint_info
      ON constraint_info.conrelid=expected.relation_name::pg_catalog.regclass
      AND constraint_info.conname=expected.constraint_name
    WHERE constraint_info.oid IS NULL OR NOT constraint_info.convalidated
      OR constraint_info.contype::text<>expected.constraint_type
      OR pg_catalog.pg_get_constraintdef(constraint_info.oid)<>expected.constraint_definition
  ) THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('saas.abandoned_carts'),
      ('saas.merchant_admin_records'),
      ('saas.storefront_checkout_operations'),
      ('saas.storefront_checkout_discount_redemptions'),
      ('saas.storefront_checkout_payment_bridges'),
      ('saas.storefront_checkout_reserved_identities'),
      ('saas.orders')
    ) expected(relation_name)
    LEFT JOIN pg_catalog.pg_class relation
      ON relation.oid=expected.relation_name::pg_catalog.regclass
    WHERE relation.oid IS NULL OR relation.relkind<>'r' OR relation.relpersistence<>'p'
  ) THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('saas.storefront_checkout_operations',7,7),
      ('saas.storefront_checkout_discount_redemptions',4,4),
      ('saas.storefront_checkout_payment_bridges',12,9),
      ('saas.storefront_checkout_reserved_identities',5,6)
    ) expected(relation_name,column_count,constraint_count)
    LEFT JOIN pg_catalog.pg_class relation
      ON relation.oid=expected.relation_name::pg_catalog.regclass
    WHERE relation.oid IS NULL OR relation.relkind<>'r' OR relation.relpersistence<>'p'
      OR relation.relowner<>owner_oid OR NOT relation.relrowsecurity
      OR NOT relation.relforcerowsecurity
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute attribute
          WHERE attribute.attrelid=relation.oid AND attribute.attnum>0
            AND NOT attribute.attisdropped)<>expected.column_count
      OR (SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint constraint_info
          WHERE constraint_info.conrelid=relation.oid
            AND constraint_info.contype IN('p','u','f','c')
            AND constraint_info.convalidated)<>expected.constraint_count
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid IN(
      'saas.storefront_checkout_operations'::regclass,
      'saas.storefront_checkout_discount_redemptions'::regclass,
      'saas.storefront_checkout_payment_bridges'::regclass,
      'saas.storefront_checkout_reserved_identities'::regclass
    )
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_class relation
    WHERE relation.oid='saas.storefront_checkout_operations'::regclass
      AND relation.relkind='r' AND relation.relpersistence='p'
      AND relation.relowner=owner_oid AND relation.relrowsecurity
      AND relation.relforcerowsecurity
      AND (
        SELECT pg_catalog.count(*) FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid=relation.oid AND attribute.attnum>0 AND NOT attribute.attisdropped
      )=7
      AND (
        SELECT pg_catalog.count(*) FROM pg_catalog.pg_constraint constraint_info
        WHERE constraint_info.conrelid=relation.oid
          AND constraint_info.contype IN('p','u','f','c') AND constraint_info.convalidated
      )=7
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_index index_info
    WHERE index_info.indexrelid='saas.sf_checkout_payment_bridges_active_cart_idx'::regclass
      AND index_info.indrelid='saas.storefront_checkout_payment_bridges'::regclass
      AND index_info.indisunique AND index_info.indisvalid AND index_info.indisready
      AND pg_catalog.pg_get_indexdef(index_info.indexrelid)=
        'CREATE UNIQUE INDEX sf_checkout_payment_bridges_active_cart_idx ON saas.storefront_checkout_payment_bridges USING btree (store_id, cart_id) WHERE (status = ''active''::text)'
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.storefront_checkout_operations'::regclass
      AND tgname='storefront_checkout_operations_immutable'
      AND tgenabled='O' AND NOT tgisinternal
      AND tgfoid='saas.guard_storefront_checkout_operation_mutation()'::regprocedure
      AND tgtype=27 AND tgnargs=0 AND tgqual IS NULL
      AND tgconstraint=0 AND tgconstrrelid=0
      AND NOT tgdeferrable AND NOT tginitdeferred
      AND tgoldtable IS NULL AND tgnewtable IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.storefront_checkout_reserved_identities'::regclass
      AND tgname='storefront_checkout_reserved_identities_immutable'
      AND tgenabled='O' AND NOT tgisinternal
      AND tgfoid='saas.guard_storefront_checkout_operation_mutation()'::regprocedure
      AND tgtype=27 AND tgnargs=0 AND tgqual IS NULL
      AND tgconstraint=0 AND tgconstrrelid=0
      AND NOT tgdeferrable AND NOT tginitdeferred
      AND tgoldtable IS NULL AND tgnewtable IS NULL
  ) OR EXISTS(
    SELECT 1 FROM (VALUES
      ('saas.orders','orders_storefront_checkout_reserved_identity'),
      ('saas.order_items','order_items_storefront_checkout_reserved_identity'),
      ('saas.order_events','order_events_storefront_checkout_reserved_identity')
    ) expected(relation_name,trigger_name)
    LEFT JOIN pg_catalog.pg_trigger trigger_info
      ON trigger_info.tgrelid=expected.relation_name::regclass
      AND trigger_info.tgname=expected.trigger_name
      AND trigger_info.tgenabled='O' AND NOT trigger_info.tgisinternal
      AND trigger_info.tgfoid=
        'saas.guard_storefront_checkout_reserved_identity_insert()'::regprocedure
      AND trigger_info.tgtype=23 AND trigger_info.tgnargs=0
      AND trigger_info.tgqual IS NULL AND trigger_info.tgconstraint=0
      AND trigger_info.tgconstrrelid=0 AND NOT trigger_info.tgdeferrable
      AND NOT trigger_info.tginitdeferred
      AND trigger_info.tgoldtable IS NULL AND trigger_info.tgnewtable IS NULL
    WHERE trigger_info.oid IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.storefront_checkout_discount_redemptions'::regclass
      AND tgname='storefront_checkout_discount_redemptions_immutable'
      AND tgenabled='O' AND NOT tgisinternal
      AND tgfoid='saas.guard_storefront_checkout_operation_mutation()'::regprocedure
      AND tgtype=27 AND tgnargs=0 AND tgqual IS NULL
      AND tgconstraint=0 AND tgconstrrelid=0
      AND NOT tgdeferrable AND NOT tginitdeferred
      AND tgoldtable IS NULL AND tgnewtable IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='saas.storefront_checkout_payment_bridges'::regclass
      AND tgname='storefront_checkout_payment_bridges_immutable'
      AND tgenabled='O' AND NOT tgisinternal
      AND tgfoid='saas.guard_storefront_checkout_payment_bridge_mutation()'::regprocedure
      AND tgtype=27 AND tgnargs=0 AND tgqual IS NULL
      AND tgconstraint=0 AND tgconstrrelid=0
      AND NOT tgdeferrable AND NOT tginitdeferred
      AND tgoldtable IS NULL AND tgnewtable IS NULL
  ) OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_trigger trigger_info
    WHERE trigger_info.tgrelid='saas.payment_attempts'::regclass
      AND trigger_info.tgname='payment_attempt_storefront_checkout_terminal'
      AND trigger_info.tgenabled='O' AND NOT trigger_info.tgisinternal
      AND trigger_info.tgfoid=
        'saas.storefront_checkout_payment_attempt_terminal()'::regprocedure
      AND trigger_info.tgtype=17 AND trigger_info.tgnargs=0
      AND trigger_info.tgqual IS NULL AND trigger_info.tgconstraint=0
      AND trigger_info.tgconstrrelid=0 AND NOT trigger_info.tgdeferrable
      AND NOT trigger_info.tginitdeferred
      AND trigger_info.tgoldtable IS NULL AND trigger_info.tgnewtable IS NULL
      AND trigger_info.tgattr::text=(
        SELECT attribute.attnum::text FROM pg_catalog.pg_attribute attribute
        WHERE attribute.attrelid='saas.payment_attempts'::regclass
          AND attribute.attname='status' AND attribute.attnum>0
          AND NOT attribute.attisdropped
      )
  ) THEN RETURN false; END IF;

  IF EXISTS(
    SELECT 1 FROM (VALUES
      ('saas.storefront_checkout_operations'),
      ('saas.storefront_checkout_discount_redemptions'),
      ('saas.storefront_checkout_payment_bridges'),
      ('saas.storefront_checkout_reserved_identities')
    ) expected(relation_name)
    WHERE NOT pg_catalog.has_table_privilege(
      owner_oid,expected.relation_name,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    )
  ) OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_class relation
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))
      ) privilege
      WHERE relation.oid IN(
          'saas.storefront_checkout_operations'::regclass,
          'saas.storefront_checkout_discount_redemptions'::regclass,
          'saas.storefront_checkout_payment_bridges'::regclass,
          'saas.storefront_checkout_reserved_identities'::regclass
        )
        AND (privilege.grantor<>owner_oid OR privilege.grantee<>owner_oid
          OR privilege.is_grantable OR privilege.privilege_type NOT IN(
            'SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER'
          ))
    )
  THEN RETURN false; END IF;

  FOR signature,expected_hash,expected_volatility,expected_language,
      expected_security_definer,expected_strict IN SELECT * FROM (VALUES
    ('saas.storefront_checkout_text_valid(text,integer,integer)','6e5a94197cf08513e6d1b3f6fc66f240','i'::"char",'sql',false,false),
    ('saas.storefront_checkout_address_valid(jsonb)','95bc687f74f5e21728e88a2d21702561','i'::"char",'plpgsql',false,false),
    ('saas.storefront_checkout_hostname_valid(text)','c45b944e836d587f40d229497918d272','i'::"char",'sql',false,false),
    ('saas.storefront_checkout_discount_value(jsonb,bigint,bigint)','79cda9d8c306660d2bffad8031743886','i'::"char",'plpgsql',false,false),
    ('saas.storefront_checkout_policy_effective_at(jsonb)','5003a939d535c64b6fae689864657385','i'::"char",'plpgsql',false,false),
    ('saas.storefront_checkout_builtin_method_projection(uuid,text,text,jsonb)','8666c8906b07f18f9a282eba199951e0','i'::"char",'sql',false,false),
    ('saas.storefront_checkout_uuid(text,uuid,integer)','3ac502c4599ddcc05bfccfa119a90fc7','i'::"char",'sql',false,true),
    ('saas.storefront_checkout_build_quote(uuid,uuid,text,uuid,text,timestamp with time zone)','771d877f57e5076f567c92e407cb21a2','s'::"char",'plpgsql',false,false),
    ('saas.guard_storefront_checkout_operation_mutation()','b82fe65c8b62c247ca772213f0a9ddf5','v'::"char",'plpgsql',false,false),
    ('saas.guard_storefront_checkout_payment_bridge_mutation()','393409bd2288bb92ed6fd2c0a1033565','v'::"char",'plpgsql',false,false),
    ('saas.guard_storefront_checkout_reserved_identity_insert()','e64434b18c6fdd81f1af8a3f35cf9a76','v'::"char",'plpgsql',true,false),
    ('saas.storefront_checkout_payment_attempt_terminal()','dc688e7a5245a8ed28080ed727946dc0','v'::"char",'plpgsql',true,false),
    ('saas.merchant_admin_config_valid(text,jsonb)','92fac9712cf88f9da42f326579611763','i'::"char",'sql',false,true),
    ('saas.merchant_admin_config_valid_without_checkout_flat_rate(text,jsonb)','18ffaa56eab1e91c53531405780836c6','i'::"char",'sql',false,true),
    ('saas.abandoned_cart_capture_store(text,timestamp with time zone)','2885f205f0901b662efd76c11cd23dbd','s'::"char",'sql',true,false)
  ) expected(
    signature,expected_hash,expected_volatility,expected_language,
    expected_security_definer,expected_strict
  ) LOOP
    procedure_oid:=pg_catalog.to_regprocedure(signature);
    IF procedure_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid=procedure_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef=expected_security_definer
        AND NOT procedure.proleakproof AND procedure.proisstrict=expected_strict
        AND procedure.proparallel='u' AND procedure.provolatile=expected_volatility
        AND procedure.prolang=(
          SELECT oid FROM pg_catalog.pg_language WHERE lanname=expected_language
        )
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND pg_catalog.md5(procedure.prosrc)=expected_hash
    ) OR NOT pg_catalog.has_function_privilege(owner_oid,procedure_oid,'EXECUTE')
      OR EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) privilege
        WHERE procedure.oid=procedure_oid AND (
          privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
          OR privilege.grantor<>owner_oid OR privilege.grantee<>owner_oid
        )
      )
    THEN RETURN false; END IF;
  END LOOP;

  FOR signature,expected_hash,expected_volatility IN SELECT * FROM (VALUES
    ('saas.storefront_checkout_get_quote(text,text,timestamp with time zone)','55a13b99a537cae6df50f09ca2994ebe','s'::"char"),
    ('saas.storefront_checkout_issue_nonce(text,text,text,timestamp with time zone)','75e8e2d7f00503fc5a35329acb90d7e1','v'::"char"),
    ('saas.storefront_checkout_update_delivery(text,text,bigint,uuid,text,text,text,text,boolean,jsonb,jsonb,text,text,timestamp with time zone)','fe56e71b3fdb8c694e3a0ea1650d33b3','v'::"char"),
    ('saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamp with time zone)','dd39a69adb7399f6e2a278c7a447683e','v'::"char"),
    ('saas.storefront_checkout_begin_hosted(text,text,bigint,uuid,text,text,uuid,text,uuid,text,timestamp with time zone)','397531c6e482991b782ef989878e6abe','v'::"char"),
    ('saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamp with time zone)','ea527e8fd871eeebd57ba7bd16f88121','s'::"char"),
    ('saas.storefront_checkout_get_status(text,text,timestamp with time zone)','a094b754f97152d4a8177f0dd6d03bc0','s'::"char"),
    ('saas.storefront_checkout_get_policy(text,text,timestamp with time zone)','443b25ad8174205f9fbe4ed29030f2f1','s'::"char"),
    ('saas.storefront_checkout_preflight()',NULL::text,'s'::"char")
  ) expected(signature,expected_hash,expected_volatility) LOOP
    procedure_oid:=pg_catalog.to_regprocedure(signature);
    IF procedure_oid IS NULL OR NOT EXISTS(
      SELECT 1 FROM pg_catalog.pg_proc procedure
      WHERE procedure.oid=procedure_oid AND procedure.proowner=owner_oid
        AND procedure.prokind='f' AND procedure.prosecdef AND NOT procedure.proleakproof
        AND NOT procedure.proisstrict AND procedure.proparallel='u'
        AND procedure.provolatile=expected_volatility
        AND procedure.prolang=(SELECT oid FROM pg_catalog.pg_language WHERE lanname='plpgsql')
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
        AND (expected_hash IS NULL OR pg_catalog.md5(procedure.prosrc)=expected_hash)
    ) OR NOT pg_catalog.has_function_privilege(owner_oid,procedure_oid,'EXECUTE')
      OR pg_catalog.has_function_privilege(app_oid,procedure_oid,'EXECUTE')
      OR NOT pg_catalog.has_function_privilege(workflow_oid,procedure_oid,'EXECUTE')
      OR EXISTS(
        SELECT 1 FROM pg_catalog.pg_proc procedure
        CROSS JOIN LATERAL pg_catalog.aclexplode(
          COALESCE(procedure.proacl,pg_catalog.acldefault('f',procedure.proowner))
        ) privilege
        WHERE procedure.oid=procedure_oid AND (
          privilege.privilege_type<>'EXECUTE' OR privilege.is_grantable
          OR privilege.grantor<>owner_oid
          OR privilege.grantee NOT IN(owner_oid,workflow_oid)
        )
      )
    THEN RETURN false; END IF;
  END LOOP;

  IF pg_catalog.to_regprocedure(
    'saas.storefront_checkout_begin_hosted(text,text,bigint,uuid,text,text,uuid,uuid,text,uuid,uuid[],uuid,text,timestamp with time zone)'
  ) IS NOT NULL THEN RETURN false; END IF;

  IF saas.merchant_admin_config_valid(
      'shipping_setting','{"regions":["TR"],"flatRateCents":2500,"freeShippingThresholdCents":50000,"estimatedDays":3}'::jsonb
    ) IS DISTINCT FROM true
    OR saas.merchant_admin_config_valid(
      'shipping_setting','{"regions":["TR"],"freeShippingThresholdCents":50000,"estimatedDays":3}'::jsonb
    ) IS DISTINCT FROM true
    OR saas.merchant_admin_config_valid(
      'shipping_setting','{"flatRateCents":1.5}'::jsonb
    ) IS DISTINCT FROM false
    OR saas.merchant_admin_config_valid(
      'shipping_setting','{"unknown":1}'::jsonb
    ) IS DISTINCT FROM false
  THEN RETURN false; END IF;
  RETURN true;
END
$f$;

REVOKE ALL ON FUNCTION saas.storefront_checkout_text_valid(text,integer,integer),
  saas.storefront_checkout_address_valid(jsonb),
  saas.storefront_checkout_hostname_valid(text),
  saas.storefront_checkout_discount_value(jsonb,bigint,bigint),
  saas.storefront_checkout_uuid(text,uuid,integer),
  saas.storefront_checkout_policy_effective_at(jsonb),
  saas.storefront_checkout_builtin_method_projection(uuid,text,text,jsonb),
  saas.storefront_checkout_build_quote(uuid,uuid,text,uuid,text,timestamptz),
  saas.guard_storefront_checkout_operation_mutation(),
  saas.guard_storefront_checkout_payment_bridge_mutation(),
  saas.guard_storefront_checkout_reserved_identity_insert(),
  saas.storefront_checkout_payment_attempt_terminal()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

REVOKE ALL ON FUNCTION
  saas.storefront_checkout_get_quote(text,text,timestamptz),
  saas.storefront_checkout_issue_nonce(text,text,text,timestamptz),
  saas.storefront_checkout_update_delivery(
    text,text,bigint,uuid,text,text,text,text,boolean,jsonb,jsonb,text,text,timestamptz
  ),
  saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamptz),
  saas.storefront_checkout_begin_hosted(
    text,text,bigint,uuid,text,text,uuid,text,uuid,text,timestamptz
  ),
  saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamptz),
  saas.storefront_checkout_get_status(text,text,timestamptz),
  saas.storefront_checkout_get_policy(text,text,timestamptz),
  saas.storefront_checkout_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.storefront_checkout_get_quote(text,text,timestamptz),
  saas.storefront_checkout_issue_nonce(text,text,text,timestamptz),
  saas.storefront_checkout_update_delivery(
    text,text,bigint,uuid,text,text,text,text,boolean,jsonb,jsonb,text,text,timestamptz
  ),
  saas.storefront_checkout_submit_builtin(text,text,bigint,uuid,text,text,uuid,timestamptz),
  saas.storefront_checkout_begin_hosted(
    text,text,bigint,uuid,text,text,uuid,text,uuid,text,timestamptz
  ),
  saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamptz),
  saas.storefront_checkout_get_status(text,text,timestamptz),
  saas.storefront_checkout_get_policy(text,text,timestamptz),
  saas.storefront_checkout_preflight()
TO celebix_saas_workflow;

COMMIT;
