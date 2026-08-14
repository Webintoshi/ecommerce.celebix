BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure(
      'saas.merchant_provider_execution_authority_visible(text,text,text,integer,text)'
    ) IS NULL
    OR pg_catalog.to_regprocedure(
      'saas.storefront_hosted_checkout_authority_projection(text,timestamp with time zone,text,jsonb,bigint,jsonb,uuid)'
    ) IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_READ_ONLY_AUTHORITY_SOURCE_INVALID'; END IF;
END
$f$;

CREATE OR REPLACE FUNCTION saas.storefront_hosted_checkout_authority_projection(
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
  IF NOT FOUND OR (CASE WHEN pg_catalog.current_setting('transaction_read_only')='on'
      THEN saas.merchant_provider_execution_authority_visible(
        selected_profile.provider_code,selected_profile.capability,
        selected_profile.execution_environment,selected_profile.execution_adapter_version,
        selected_profile.execution_evidence_digest
      )
      ELSE saas.merchant_provider_execution_authority_matches(
        selected_profile.provider_code,selected_profile.capability,
        selected_profile.execution_environment,selected_profile.execution_adapter_version,
        selected_profile.execution_evidence_digest
      )
    END) IS DISTINCT FROM TRUE
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

COMMIT;
