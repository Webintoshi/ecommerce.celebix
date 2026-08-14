BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure('saas.public_checkout_complete_without_available_stock_v090(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_available_stock(uuid,uuid,timestamp with time zone,uuid)') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_customer_credentials') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_checkout_operations') IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_RETURNING_CUSTOMER_IDENTITY_SOURCE_INVALID'; END IF;
END
$f$;

CREATE FUNCTION saas.storefront_checkout_reconcile_customer_identity_v105(
  p_store_id uuid,
  p_now timestamptz,
  p_delivery jsonb,
  p_customer_credentials jsonb
)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE
  selected_customer_credential saas.storefront_customer_credentials%ROWTYPE;
  selected_customer saas.customers%ROWTYPE;
  email_customer saas.customers%ROWTYPE;
  phone_customer saas.customers%ROWTYPE;
  incoming_first_name text;
  incoming_last_name text;
  incoming_email text;
  incoming_phone text;
BEGIN
  IF p_store_id IS NULL
    OR p_now IS NULL
    OR NOT saas.storefront_delivery_valid(p_delivery)
    OR NOT saas.storefront_credential_candidates_valid(p_customer_credentials,true)
  THEN RETURN 'invalid_input'; END IF;

  incoming_first_name:=p_delivery->'contact'->>'firstName';
  incoming_last_name:=p_delivery->'contact'->>'lastName';
  incoming_email:=p_delivery->'contact'->>'email';
  incoming_phone:=p_delivery->'contact'->>'phone';

  SELECT credential.* INTO selected_customer_credential
  FROM saas.storefront_customer_credentials credential
  JOIN pg_catalog.jsonb_array_elements(p_customer_credentials) candidate
    ON candidate->>'keyId'=credential.key_id
   AND candidate->>'digest'=credential.credential_digest
  WHERE credential.store_id=p_store_id AND credential.expires_at>p_now
  ORDER BY credential.created_at DESC,credential.id
  LIMIT 1 FOR UPDATE OF credential;

  IF selected_customer_credential.id IS NOT NULL THEN
    SELECT customer.* INTO selected_customer
    FROM saas.customers customer
    WHERE customer.store_id=p_store_id
      AND customer.id=selected_customer_credential.customer_id
    FOR UPDATE;

    IF NOT FOUND
      OR selected_customer.status<>'active'
      OR selected_customer.email<>incoming_email
      OR EXISTS(
        SELECT 1 FROM saas.customers customer
        WHERE customer.store_id=p_store_id
          AND customer.id<>selected_customer.id
          AND customer.phone=incoming_phone
      )
    THEN RETURN 'invalid_input'; END IF;

    UPDATE saas.customers
    SET first_name=incoming_first_name,
      last_name=incoming_last_name,
      email=incoming_email,
      phone=incoming_phone,
      version=version+1,
      updated_at=p_now
    WHERE store_id=p_store_id AND id=selected_customer.id;

    UPDATE saas.storefront_customer_credentials
    SET last_seen_at=pg_catalog.GREATEST(last_seen_at,p_now)
    WHERE store_id=p_store_id AND id=selected_customer_credential.id;

    RETURN 'ready';
  END IF;

  PERFORM customer.id
  FROM saas.customers customer
  WHERE customer.store_id=p_store_id
    AND (customer.email=incoming_email OR customer.phone=incoming_phone)
  ORDER BY customer.id
  FOR UPDATE;

  SELECT customer.* INTO email_customer
  FROM saas.customers customer
  WHERE customer.store_id=p_store_id
    AND customer.email=incoming_email
  ORDER BY customer.id
  LIMIT 1;

  SELECT customer.* INTO phone_customer
  FROM saas.customers customer
  WHERE customer.store_id=p_store_id
    AND customer.phone=incoming_phone
  ORDER BY customer.id
  LIMIT 1;

  IF email_customer.id IS NOT NULL THEN
    IF email_customer.status<>'active'
      OR (phone_customer.id IS NOT NULL AND phone_customer.id<>email_customer.id)
    THEN RETURN 'invalid_input'; END IF;

    UPDATE saas.customers
    SET first_name=incoming_first_name,
      last_name=incoming_last_name,
      phone=incoming_phone,
      version=version+1,
      updated_at=p_now
    WHERE store_id=p_store_id AND id=email_customer.id;

    RETURN 'ready';
  END IF;

  IF phone_customer.id IS NOT NULL THEN
    RETURN 'invalid_input';
  END IF;

  RETURN 'ready';
END
$f$;

CREATE OR REPLACE FUNCTION saas.public_checkout_complete(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,p_customer_credentials jsonb,
  p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_delivery jsonb,p_payment_kind text,
  p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
  p_receipt_id uuid,p_receipt_key_id text,p_receipt_digest text,p_receipt_expires_at timestamptz,
  p_customer_credential_id uuid,p_customer_key_id text,p_customer_digest text,p_customer_expires_at timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE
  selected_store uuid;
  selected_cart_id uuid;
  selected_intent_id uuid;
  existing_operation saas.storefront_checkout_operations%ROWTYPE;
  line record;
  cart_payload jsonb;
  identity_outcome text;
BEGIN
  IF p_kind IS NULL OR p_kind NOT IN('cart','buy_now')
    OR NOT saas.storefront_credential_candidates_valid(p_credentials,false)
    OR NOT saas.storefront_credential_candidates_valid(p_customer_credentials,true)
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
  SELECT * INTO existing_operation
  FROM saas.storefront_checkout_operations
  WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.store_id<>selected_store OR existing_operation.payload_fingerprint<>p_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',existing_operation.result_payload;
    END IF;
    RETURN;
  END IF;

  IF p_kind='cart' THEN
    SELECT cart.id INTO selected_cart_id
    FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential
      ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store
    ORDER BY cart.created_at DESC,cart.id
    LIMIT 1 FOR UPDATE OF cart;

    IF selected_cart_id IS NOT NULL THEN
      cart_payload:=saas.storefront_cart_projection(selected_store,selected_cart_id,p_now);
      FOR line IN
        SELECT item.variant_id,item.quantity,variant.stock_tracking
        FROM saas.storefront_cart_items item
        JOIN saas.product_variants variant
          ON variant.store_id=item.store_id
         AND variant.id=item.variant_id
         AND variant.product_id=item.product_id
        WHERE item.store_id=selected_store AND item.cart_id=selected_cart_id
        ORDER BY item.variant_id
        FOR UPDATE OF variant
      LOOP
        IF line.stock_tracking AND saas.storefront_available_stock(selected_store,line.variant_id,p_now,NULL)<line.quantity THEN
          RETURN QUERY SELECT 'stock_unavailable',cart_payload; RETURN;
        END IF;
      END LOOP;
    END IF;
  ELSE
    SELECT intent.id INTO selected_intent_id
    FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=intent.key_id
     AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=selected_store
    ORDER BY intent.created_at DESC,intent.id
    LIMIT 1 FOR UPDATE OF intent;

    IF selected_intent_id IS NOT NULL THEN
      cart_payload:=saas.storefront_intent_projection(selected_store,selected_intent_id,p_now);
      SELECT intent.variant_id,intent.quantity,variant.stock_tracking INTO line
      FROM saas.storefront_checkout_intents intent
      JOIN saas.product_variants variant
        ON variant.store_id=intent.store_id
       AND variant.id=intent.variant_id
       AND variant.product_id=intent.product_id
      WHERE intent.store_id=selected_store AND intent.id=selected_intent_id
      FOR UPDATE OF variant;

      IF line.stock_tracking AND saas.storefront_available_stock(selected_store,line.variant_id,p_now,NULL)<line.quantity THEN
        RETURN QUERY SELECT 'stock_unavailable',cart_payload; RETURN;
      END IF;
    END IF;
  END IF;

  identity_outcome:=saas.storefront_checkout_reconcile_customer_identity_v105(
    selected_store,p_now,p_delivery,p_customer_credentials
  );
  IF identity_outcome IS DISTINCT FROM 'ready' THEN
    RETURN QUERY SELECT identity_outcome,NULL::jsonb; RETURN;
  END IF;

  RETURN QUERY SELECT * FROM saas.public_checkout_complete_without_available_stock_v090(
    p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,p_operation_id,p_fingerprint,p_expected_version,
    p_delivery,p_payment_kind,p_order_id,p_customer_id,p_address_id,p_event_id,p_receipt_id,p_receipt_key_id,
    p_receipt_digest,p_receipt_expires_at,p_customer_credential_id,p_customer_key_id,p_customer_digest,p_customer_expires_at
  );
END
$f$;

REVOKE ALL ON FUNCTION
  saas.storefront_checkout_reconcile_customer_identity_v105(uuid,timestamp with time zone,jsonb,jsonb),
  saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)
TO celebix_saas_host_resolver;

COMMIT;
