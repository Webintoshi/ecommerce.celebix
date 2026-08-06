BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_hosted_checkout_sessions') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_available_stock(uuid,uuid,timestamp with time zone,uuid)') IS NULL
    OR pg_catalog.to_regprocedure('saas.payment_attempt_begin(uuid,timestamp with time zone,uuid,text,uuid,text,bigint,text,text)') IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_START_SOURCE_INVALID'; END IF;
END
$f$;

CREATE FUNCTION saas.storefront_hosted_checkout_authority_projection(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_store uuid; selected_cart saas.storefront_carts%ROWTYPE;
  selected_intent saas.storefront_checkout_intents%ROWTYPE;
  selected_method saas.payment_methods%ROWTYPE;
  selected_profile saas.merchant_provider_profiles%ROWTYPE;
  source_id uuid; source_version bigint; commerce jsonb; facts jsonb;
  authority_digest text; order_reference text;
BEGIN
  IF p_kind NOT IN('cart','buy_now')
    OR NOT saas.storefront_credential_candidates_valid(p_credentials,false)
    OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
    OR p_payment_method_id IS NULL
    OR saas.storefront_delivery_valid(p_delivery) IS DISTINCT FROM TRUE
  THEN RETURN NULL; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN NULL; END IF;

  IF p_kind='cart' THEN
    SELECT cart.* INTO selected_cart
    FROM saas.storefront_carts cart
    JOIN saas.storefront_cart_credentials credential
      ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
    WHERE cart.store_id=selected_store
    ORDER BY cart.created_at DESC,cart.id LIMIT 1;
    IF NOT FOUND OR selected_cart.status<>'active' OR selected_cart.expires_at<=p_now
      OR selected_cart.version<>p_expected_version
    THEN RETURN NULL; END IF;
    source_id:=selected_cart.id; source_version:=selected_cart.version;
    commerce:=saas.storefront_cart_projection(selected_store,source_id,p_now);
  ELSE
    SELECT intent.* INTO selected_intent
    FROM saas.storefront_checkout_intents intent
    JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
      ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
    WHERE intent.store_id=selected_store
    ORDER BY intent.created_at DESC,intent.id LIMIT 1;
    IF NOT FOUND OR selected_intent.status<>'active' OR selected_intent.expires_at<=p_now
      OR p_expected_version<>1
    THEN RETURN NULL; END IF;
    source_id:=selected_intent.id; source_version:=1;
    commerce:=saas.storefront_intent_projection(selected_store,source_id,p_now);
  END IF;
  IF commerce IS NULL OR COALESCE((commerce->>'checkoutReady')::boolean,false) IS DISTINCT FROM TRUE
    OR commerce->>'currency'<>'TRY'
    OR (commerce->>'totalCents')::numeric NOT BETWEEN 1 AND 9007199254740991
    OR pg_catalog.jsonb_typeof(commerce->'items')<>'array'
    OR pg_catalog.jsonb_array_length(commerce->'items') NOT BETWEEN 1 AND 100
  THEN RETURN NULL; END IF;

  SELECT method.* INTO selected_method FROM saas.payment_methods method
  WHERE method.store_id=selected_store AND method.id=p_payment_method_id
    AND method.kind='provider' AND method.state='active'
    AND method.provider_code IN('paytr_iframe','iyzico_iframe');
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT profile.* INTO selected_profile FROM saas.merchant_provider_profiles profile
  WHERE profile.store_id=selected_store AND profile.id=selected_method.profile_id
    AND profile.provider_code=selected_method.provider_code
    AND profile.capability='payment_processing' AND profile.status='active'
    AND profile.validation_environment=profile.execution_environment
    AND profile.validation_adapter_version=profile.execution_adapter_version
    AND profile.execution_environment=selected_method.config->>'environment'
    AND profile.credential_version>0;
  IF NOT FOUND OR saas.merchant_provider_execution_authority_matches(
      selected_profile.provider_code,selected_profile.capability,
      selected_profile.execution_environment,selected_profile.execution_adapter_version,
      selected_profile.execution_evidence_digest
    ) IS DISTINCT FROM TRUE
  THEN RETURN NULL; END IF;

  order_reference:='sf:'||source_id::text||':'||source_version::text;
  facts:=pg_catalog.jsonb_build_object(
    'storeId',selected_store,'sourceKind',p_kind,'sourceId',source_id,
    'sourceVersion',source_version,'paymentMethodId',selected_method.id,
    'methodVersion',selected_method.version,'profileId',selected_profile.id,
    'profileVersion',selected_profile.version,'providerCode',selected_profile.provider_code,
    'environment',selected_profile.execution_environment,
    'credentialVersion',selected_profile.credential_version,
    'executionAdapterVersion',selected_profile.execution_adapter_version,
    'executionEvidenceDigest',selected_profile.execution_evidence_digest,
    'orderReference',order_reference,'currency',commerce->>'currency',
    'subtotalMinor',(commerce->>'subtotalCents')::bigint,
    'shippingMinor',(commerce->>'shippingCents')::bigint,
    'discountMinor',0,'totalMinor',(commerce->>'totalCents')::bigint,
    'delivery',p_delivery,'items',commerce->'items'
  );
  authority_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(facts::text,'UTF8')),'hex');
  RETURN facts||pg_catalog.jsonb_build_object(
    'authorityDigest',authority_digest,
    'presentation',CASE selected_profile.provider_code WHEN 'paytr_iframe' THEN 'iframe' ELSE 'redirect' END,
    'requiredCustomerFields',CASE selected_profile.provider_code WHEN 'iyzico_iframe'
      THEN pg_catalog.jsonb_build_array('identity_number') ELSE '[]'::jsonb END,
    'customerName',(p_delivery->'contact'->>'firstName')||' '||(p_delivery->'contact'->>'lastName'),
    'customerEmail',p_delivery->'contact'->>'email',
    'customerPhone',p_delivery->'contact'->>'phone',
    'customerAddress',pg_catalog.concat_ws(' ',p_delivery->'shippingAddress'->>'line1',
      p_delivery->'shippingAddress'->>'line2',p_delivery->'shippingAddress'->>'district'),
    'city',p_delivery->'shippingAddress'->>'city',
    'country',p_delivery->'shippingAddress'->>'country',
    'postalCode',p_delivery->'shippingAddress'->>'postalCode',
    'basket',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'reference',entry->>'variantId','name',entry->>'title','quantity',(entry->>'quantity')::bigint,
      'unitAmountMinor',(entry->>'unitPriceCents')::bigint,'itemType','PHYSICAL'
    )) FROM pg_catalog.jsonb_array_elements(commerce->'items') entry)
  );
END
$f$;

CREATE FUNCTION saas.public_storefront_hosted_checkout_authority(
  p_hostname text,p_now timestamptz,p_kind text,p_credentials jsonb,
  p_expected_version bigint,p_delivery jsonb,p_payment_method_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE result jsonb;
BEGIN
  result:=saas.storefront_hosted_checkout_authority_projection(
    p_hostname,p_now,p_kind,p_credentials,p_expected_version,p_delivery,p_payment_method_id
  );
  IF result IS NULL THEN RETURN QUERY SELECT 'authority_unavailable',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'found',result; END IF;
END
$f$;

CREATE FUNCTION saas.public_storefront_hosted_checkout_begin(
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

CREATE FUNCTION saas.public_storefront_hosted_checkout_presentation_save(
  p_hostname text,p_now timestamptz,p_credentials jsonb,p_operation_id uuid,
  p_fingerprint text,p_expected_version bigint,p_presentation_key_id text,
  p_presentation_digest text,p_sealed_presentation jsonb,p_presentation_expires_at timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_store uuid; selected_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
  operation saas.storefront_hosted_checkout_operations%ROWTYPE; result jsonb;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_credentials,false)
    OR p_operation_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_expected_version IS NULL OR p_expected_version<1
    OR p_presentation_key_id IS NULL
    OR p_presentation_digest!~'^[a-f0-9]{64}$'
    OR p_presentation_expires_at IS NULL OR NOT pg_catalog.isfinite(p_presentation_expires_at)
    OR saas.merchant_provider_sealed_envelope_valid(p_sealed_presentation,p_presentation_key_id) IS DISTINCT FROM TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT session.* INTO selected_session FROM saas.storefront_hosted_checkout_sessions session
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
    ON candidate->>'keyId'=session.payment_session_key_id
    AND candidate->>'digest'=session.payment_session_credential_digest
  WHERE session.store_id=selected_store ORDER BY session.created_at DESC,session.id LIMIT 1 FOR UPDATE OF session;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected_session.payment_session_expires_at<=p_now OR selected_session.hold_expires_at<=p_now
  THEN RETURN QUERY SELECT 'session_expired',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.storefront.hosted.checkout.operation:'||p_operation_id::text,0));
  SELECT hosted_operation.* INTO operation FROM saas.storefront_hosted_checkout_operations hosted_operation
    WHERE hosted_operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id<>selected_store OR operation.session_id<>selected_session.id
      OR operation.operation_kind<>'presentation' OR operation.payload_fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',operation.result_payload; END IF;
    RETURN;
  END IF;
  IF selected_session.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  IF selected_session.status NOT IN('active','processing')
    OR p_presentation_expires_at<=p_now OR p_presentation_expires_at>selected_session.hold_expires_at
  THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
  UPDATE saas.storefront_hosted_checkout_sessions SET
    status='provider_ready',safe_code='provider_ready',presentation_key_id=p_presentation_key_id,
    presentation_digest=p_presentation_digest,sealed_presentation=p_sealed_presentation,
    presentation_expires_at=p_presentation_expires_at,version=version+1,updated_at=p_now
  WHERE id=selected_session.id;
  result:=pg_catalog.jsonb_build_object('sessionId',selected_session.id,'status','provider_ready',
    'version',selected_session.version+1,'providerCode',selected_session.provider_code,
    'presentationExpiresAt',saas.storefront_commerce_timestamp(p_presentation_expires_at));
  INSERT INTO saas.storefront_hosted_checkout_operations(
    operation_id,store_id,session_id,operation_kind,payload_fingerprint,result_payload,committed_at
  ) VALUES(p_operation_id,selected_store,selected_session.id,'presentation',p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'updated',result;
END
$f$;

CREATE FUNCTION saas.public_storefront_hosted_checkout_presentation(
  p_hostname text,p_now timestamptz,p_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_store uuid; selected_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_credentials,false)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  SELECT session.* INTO selected_session FROM saas.storefront_hosted_checkout_sessions session
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
    ON candidate->>'keyId'=session.payment_session_key_id
    AND candidate->>'digest'=session.payment_session_credential_digest
  WHERE session.store_id=selected_store ORDER BY session.created_at DESC,session.id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected_session.payment_session_expires_at<=p_now OR selected_session.hold_expires_at<=p_now
  THEN RETURN QUERY SELECT 'session_expired',NULL::jsonb; RETURN; END IF;
  IF selected_session.status<>'provider_ready' OR selected_session.presentation_expires_at<=p_now
  THEN RETURN QUERY SELECT 'presentation_unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'sessionId',selected_session.id,'status',selected_session.status,'version',selected_session.version,
    'providerCode',selected_session.provider_code,'presentationKeyId',selected_session.presentation_key_id,
    'presentationDigest',selected_session.presentation_digest,'sealedPresentation',selected_session.sealed_presentation,
    'presentationExpiresAt',saas.storefront_commerce_timestamp(selected_session.presentation_expires_at)
  );
END
$f$;

CREATE FUNCTION saas.public_storefront_hosted_checkout_status(
  p_hostname text,p_now timestamptz,p_credentials jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_store uuid; selected_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
BEGIN
  IF NOT saas.storefront_credential_candidates_valid(p_credentials,false)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  selected_store:=saas.storefront_public_store(p_hostname,p_now);
  IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT session.* INTO selected_session FROM saas.storefront_hosted_checkout_sessions session
  JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
    ON candidate->>'keyId'=session.payment_session_key_id
    AND candidate->>'digest'=session.payment_session_credential_digest
  WHERE session.store_id=selected_store ORDER BY session.created_at DESC,session.id LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected_session.payment_session_expires_at<=p_now
  THEN RETURN QUERY SELECT 'session_expired',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object(
    'sessionId',selected_session.id,
    'status',CASE WHEN selected_session.hold_expires_at<=p_now
      AND selected_session.status IN('active','provider_ready','processing') THEN 'expired' ELSE selected_session.status END,
    'safeCode',CASE WHEN selected_session.hold_expires_at<=p_now
      AND selected_session.status IN('active','provider_ready','processing') THEN 'session_expired' ELSE selected_session.safe_code END,
    'version',selected_session.version,
    'paymentSessionExpiresAt',saas.storefront_commerce_timestamp(selected_session.payment_session_expires_at)
  );
END
$f$;

REVOKE ALL ON FUNCTION
  saas.storefront_hosted_checkout_authority_projection(text,timestamptz,text,jsonb,bigint,jsonb,uuid),
  saas.public_storefront_hosted_checkout_authority(text,timestamptz,text,jsonb,bigint,jsonb,uuid),
  saas.public_storefront_hosted_checkout_begin(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text),
  saas.public_storefront_hosted_checkout_presentation_save(text,timestamptz,jsonb,uuid,text,bigint,text,text,jsonb,timestamptz),
  saas.public_storefront_hosted_checkout_presentation(text,timestamptz,jsonb),
  saas.public_storefront_hosted_checkout_status(text,timestamptz,jsonb)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.public_storefront_hosted_checkout_authority(text,timestamptz,text,jsonb,bigint,jsonb,uuid),
  saas.public_storefront_hosted_checkout_begin(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text),
  saas.public_storefront_hosted_checkout_presentation_save(text,timestamptz,jsonb,uuid,text,bigint,text,text,jsonb,timestamptz),
  saas.public_storefront_hosted_checkout_presentation(text,timestamptz,jsonb),
  saas.public_storefront_hosted_checkout_status(text,timestamptz,jsonb)
TO celebix_saas_host_resolver;

COMMIT;
