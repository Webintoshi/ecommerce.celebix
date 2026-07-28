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
    'saas.orders'
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
      SELECT pg_catalog.count(*) INTO used_count
      FROM saas.merchant_admin_events event
      WHERE event.store_id=p_store_id AND event.record_id=selected_discount.id
        AND event.event_kind='coupon_used';
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
      ('saas.orders')
    ) expected(relation_name)
    LEFT JOIN pg_catalog.pg_class relation
      ON relation.oid=expected.relation_name::pg_catalog.regclass
    WHERE relation.oid IS NULL OR relation.relkind<>'r' OR relation.relpersistence<>'p'
  ) THEN RETURN false; END IF;

  IF NOT EXISTS(
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
  ) OR EXISTS(
    SELECT 1 FROM pg_catalog.pg_policy
    WHERE polrelid='saas.storefront_checkout_operations'::regclass
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
  ) THEN RETURN false; END IF;

  IF NOT pg_catalog.has_table_privilege(
      owner_oid,'saas.storefront_checkout_operations',
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    ) OR EXISTS(
      SELECT 1 FROM pg_catalog.pg_class relation
      CROSS JOIN LATERAL pg_catalog.aclexplode(
        COALESCE(relation.relacl,pg_catalog.acldefault('r',relation.relowner))
      ) privilege
      WHERE relation.oid='saas.storefront_checkout_operations'::regclass
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
    ('saas.storefront_checkout_build_quote(uuid,uuid,text,uuid,text,timestamp with time zone)','353f592ec53a3b9f2ddcb56f30640229','s'::"char",'plpgsql',false,false),
    ('saas.guard_storefront_checkout_operation_mutation()','b82fe65c8b62c247ca772213f0a9ddf5','v'::"char",'plpgsql',false,false),
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
    ('saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamp with time zone)','ea527e8fd871eeebd57ba7bd16f88121','s'::"char"),
    ('saas.storefront_checkout_get_status(text,text,timestamp with time zone)','3c1f0c4ac10435bd53275d6891df7362','s'::"char"),
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
  saas.storefront_checkout_policy_effective_at(jsonb),
  saas.storefront_checkout_builtin_method_projection(uuid,text,text,jsonb),
  saas.storefront_checkout_build_quote(uuid,uuid,text,uuid,text,timestamptz),
  saas.guard_storefront_checkout_operation_mutation()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

REVOKE ALL ON FUNCTION
  saas.storefront_checkout_get_quote(text,text,timestamptz),
  saas.storefront_checkout_issue_nonce(text,text,text,timestamptz),
  saas.storefront_checkout_update_delivery(
    text,text,bigint,uuid,text,text,text,text,boolean,jsonb,jsonb,text,text,timestamptz
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
  saas.storefront_checkout_recover_operation(text,text,uuid,text,timestamptz),
  saas.storefront_checkout_get_status(text,text,timestamptz),
  saas.storefront_checkout_get_policy(text,text,timestamptz),
  saas.storefront_checkout_preflight()
TO celebix_saas_workflow;

COMMIT;
