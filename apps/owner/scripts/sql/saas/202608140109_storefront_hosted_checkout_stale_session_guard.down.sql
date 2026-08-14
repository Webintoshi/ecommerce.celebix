BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
DECLARE routine_oid oid:=pg_catalog.to_regprocedure(
  'saas.public_storefront_hosted_checkout_begin(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text)'
);
BEGIN
  IF pg_catalog.current_setting(
    'celebix.allow_storefront_hosted_checkout_stale_session_guard_down',true
  )<>'on' THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_STALE_SESSION_GUARD_DOWN_GUARD_REQUIRED';
  END IF;
  IF routine_oid IS NULL THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_STALE_SESSION_GUARD_DOWN_FUNCTION_MISSING';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid=routine_oid
      AND procedure.proowner='celebix_saas_owner'::regrole
      AND procedure.prosecdef
      AND pg_catalog.md5(procedure.prosrc)='2af1f7f7cad92f0ead6dc4cbf18b547d'
  ) THEN
    RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_STALE_SESSION_GUARD_DOWN_FUNCTION_CHANGED';
  END IF;
END
$f$;

CREATE OR REPLACE FUNCTION saas.public_storefront_hosted_checkout_begin(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid,
  p_expected_authority_digest text,p_operation_id uuid,p_fingerprint text,
  p_session_id uuid,p_callback_binding_digest text,
  p_order_id uuid,p_customer_id uuid,p_address_id uuid,p_event_id uuid,
  p_receipt_id uuid,p_customer_credential_id uuid,
  p_payment_session_key_id text,p_payment_session_digest text,
  p_receipt_key_id text,p_receipt_digest text,
  p_customer_key_id text,p_customer_digest text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority jsonb; selected_store uuid; source_id uuid; selected_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
  operation saas.storefront_hosted_checkout_operations%ROWTYPE; begin_outcome text; begin_result jsonb;
  entry jsonb; available_quantity bigint; result jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
    OR p_kind NOT IN('cart','buy_now')
    OR NOT saas.storefront_credential_candidates_valid(p_credentials,false)
    OR p_operation_id IS NULL OR p_session_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_authority_digest IS NULL OR p_expected_authority_digest!~'^[a-f0-9]{64}$'
    OR p_callback_binding_digest IS NULL OR p_callback_binding_digest!~'^[a-f0-9]{64}$'
    OR p_order_id IS NULL OR p_customer_id IS NULL OR p_address_id IS NULL OR p_event_id IS NULL
    OR p_receipt_id IS NULL OR p_customer_credential_id IS NULL
    OR p_payment_session_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
    OR p_receipt_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
    OR p_customer_key_id!~'^[a-z0-9][a-z0-9_-]{0,31}$'
    OR p_payment_session_digest!~'^[a-f0-9]{64}$' OR p_receipt_digest!~'^[a-f0-9]{64}$'
    OR p_customer_digest!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
  SELECT hosted_operation.* INTO operation FROM saas.storefront_hosted_checkout_operations hosted_operation
  WHERE hosted_operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>selected_store OR operation.operation_kind<>'start'
      OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload;
    END IF;
    RETURN;
  END IF;

  IF p_kind='cart' THEN
    SELECT cart.id INTO source_id FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential
      ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store ORDER BY cart.created_at DESC,cart.id LIMIT 1;
  ELSIF p_kind='buy_now' THEN
    SELECT intent.id INTO source_id FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=selected_store ORDER BY intent.created_at DESC,intent.id LIMIT 1;
  END IF;
  IF source_id IS NOT NULL AND EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions session
    WHERE session.store_id=selected_store
      AND ((p_kind='cart' AND session.cart_id=source_id) OR (p_kind='buy_now' AND session.intent_id=source_id))
      AND session.status IN('active','provider_ready','processing') AND session.hold_expires_at>p_now)
  THEN RETURN QUERY SELECT 'attempt_in_progress',NULL::jsonb; RETURN; END IF;

  authority:=saas.storefront_hosted_checkout_authority_projection(
    p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id);
  IF authority IS NULL OR authority->>'authorityDigest' IS DISTINCT FROM p_expected_authority_digest
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  source_id:=(authority->>'sourceId')::uuid;
  IF p_kind='cart' THEN
    PERFORM cart.id FROM saas.storefront_carts cart
      WHERE cart.store_id=selected_store AND cart.id=source_id FOR UPDATE OF cart;
  ELSE
    PERFORM intent.id FROM saas.storefront_checkout_intents intent
      WHERE intent.store_id=selected_store AND intent.id=source_id FOR UPDATE OF intent;
  END IF;
  PERFORM variant.id FROM saas.product_variants variant
    WHERE variant.store_id=selected_store AND EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(authority->'items') item
      WHERE (item->>'variantId')::uuid=variant.id
    ) ORDER BY variant.id FOR UPDATE OF variant;
  authority:=saas.storefront_hosted_checkout_authority_projection(
    p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id);
  IF authority IS NULL OR authority->>'authorityDigest' IS DISTINCT FROM p_expected_authority_digest
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions session
    WHERE session.store_id=selected_store
      AND ((p_kind='cart' AND session.cart_id=source_id) OR (p_kind='buy_now' AND session.intent_id=source_id))
      AND session.status IN('active','provider_ready','processing') AND session.hold_expires_at>p_now)
  THEN RETURN QUERY SELECT 'attempt_in_progress',NULL::jsonb; RETURN; END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(authority->'items') LOOP
    available_quantity:=saas.storefront_available_stock(
      selected_store,(entry->>'variantId')::uuid,p_now,NULL);
    IF available_quantity IS NULL OR available_quantity<(entry->>'quantity')::bigint
    THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN; END IF;
  END LOOP;

  BEGIN
    SELECT begun.outcome,begun.result_payload INTO begin_outcome,begin_result
    FROM saas.payment_attempt_begin(
      selected_store,p_now,p_operation_id,p_fingerprint,p_payment_method_id,
      authority->>'orderReference',(authority->>'totalMinor')::bigint,
      authority->>'currency',p_callback_binding_digest
    ) begun;
    IF begin_outcome NOT IN('created','operation_replayed')
    THEN RETURN QUERY SELECT begin_outcome,begin_result; RETURN; END IF;
    IF begin_outcome='operation_replayed' THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN;
    END IF;
    INSERT INTO saas.storefront_hosted_checkout_sessions(
      id,store_id,cart_id,intent_id,payment_attempt_id,payment_method_id,profile_id,
      provider_code,environment,credential_version,execution_adapter_version,
      execution_evidence_digest,order_reference,order_id,customer_id,address_id,event_id,
      receipt_id,customer_credential_id,source_version,commerce_authority_digest,currency,
      subtotal_minor,shipping_minor,discount_minor,total_minor,delivery_snapshot,item_snapshot,
      status,safe_code,hold_expires_at,terminal_at,version,payment_session_key_id,
      payment_session_credential_digest,payment_session_expires_at,receipt_key_id,
      receipt_credential_digest,receipt_expires_at,customer_key_id,customer_credential_digest,
      customer_expires_at,created_at,updated_at
    ) VALUES(
      p_session_id,selected_store,CASE WHEN p_kind='cart' THEN source_id END,
      CASE WHEN p_kind='buy_now' THEN source_id END,p_operation_id,p_payment_method_id,
      (authority->>'profileId')::uuid,authority->>'providerCode',authority->>'environment',
      (authority->>'credentialVersion')::bigint,(authority->>'executionAdapterVersion')::integer,
      authority->>'executionEvidenceDigest',authority->>'orderReference',p_order_id,p_customer_id,
      p_address_id,p_event_id,p_receipt_id,p_customer_credential_id,p_expected_version,
      p_expected_authority_digest,authority->>'currency',(authority->>'subtotalMinor')::bigint,
      (authority->>'shippingMinor')::bigint,(authority->>'discountMinor')::bigint,
      (authority->>'totalMinor')::bigint,p_delivery,authority->'items','active','payment_started',
      p_now+interval '15 minutes',NULL,1,p_payment_session_key_id,p_payment_session_digest,
      p_now+interval '15 minutes',p_receipt_key_id,p_receipt_digest,p_now+interval '1 day',
      p_customer_key_id,p_customer_digest,p_now+interval '30 days',p_now,p_now
    );
    FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(authority->'items') LOOP
      INSERT INTO saas.checkout_inventory_reservations(
        id,store_id,attempt_id,payment_attempt_id,quick_order_link_id,storefront_hosted_session_id,
        product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at
      ) VALUES(
        saas.storefront_commerce_uuid('hosted-reservation:'||p_session_id::text||':'||(entry->>'variantId')),
        selected_store,NULL,p_operation_id,NULL,p_session_id,(entry->>'productId')::uuid,
        (entry->>'variantId')::uuid,(entry->>'quantity')::bigint,
        (SELECT variant.stock_tracking FROM saas.product_variants variant
          WHERE variant.store_id=selected_store AND variant.id=(entry->>'variantId')::uuid),
        'held',p_now,1,p_now
      );
    END LOOP;
    result:=begin_result||pg_catalog.jsonb_build_object(
      'sessionId',p_session_id,'sessionStatus','active','sessionVersion',1,
      'paymentSessionKeyId',p_payment_session_key_id,
      'receiptKeyId',p_receipt_key_id,'customerKeyId',p_customer_key_id,
      'paymentSessionExpiresAt',saas.storefront_commerce_timestamp(p_now+interval '15 minutes'),
      'receiptExpiresAt',saas.storefront_commerce_timestamp(p_now+interval '1 day'),
      'customerExpiresAt',saas.storefront_commerce_timestamp(p_now+interval '30 days')
    );
    INSERT INTO saas.storefront_hosted_checkout_operations(
      operation_id,store_id,session_id,operation_kind,payload_fingerprint,result_payload,committed_at
    ) VALUES(p_operation_id,selected_store,p_session_id,'start',p_fingerprint,result,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation
    OR numeric_value_out_of_range OR datetime_field_overflow OR raise_exception THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'created',result;
END
$f$;

COMMIT;
