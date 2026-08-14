BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.current_setting('celebix.allow_storefront_checkout_returning_customer_identity_down',true) IS DISTINCT FROM 'on'
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_RETURNING_CUSTOMER_IDENTITY_DOWN_BLOCKED'; END IF;
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
DECLARE selected_store uuid; selected_cart_id uuid; selected_intent_id uuid; line record; cart_payload jsonb;
BEGIN
  IF p_kind IN('cart','buy_now') AND saas.storefront_credential_candidates_valid(p_credentials,false) THEN
    selected_store:=saas.storefront_public_store(p_hostname,p_now);
    IF selected_store IS NOT NULL THEN
      IF p_kind='cart' THEN
        SELECT cart.id INTO selected_cart_id FROM saas.storefront_carts cart
        JOIN saas.storefront_cart_credentials credential
          ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
        JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
          ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
        WHERE cart.store_id=selected_store
        ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
        IF selected_cart_id IS NOT NULL THEN
          cart_payload:=saas.storefront_cart_projection(selected_store,selected_cart_id,p_now);
          FOR line IN
            SELECT item.variant_id,item.quantity,variant.stock_tracking
            FROM saas.storefront_cart_items item
            JOIN saas.product_variants variant
              ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id
            WHERE item.store_id=selected_store AND item.cart_id=selected_cart_id
            ORDER BY item.variant_id FOR UPDATE OF variant
          LOOP
            IF line.stock_tracking AND saas.storefront_available_stock(selected_store,line.variant_id,p_now,NULL)<line.quantity THEN
              RETURN QUERY SELECT 'stock_unavailable',cart_payload; RETURN;
            END IF;
          END LOOP;
        END IF;
      ELSE
        SELECT intent.id INTO selected_intent_id FROM saas.storefront_checkout_intents intent
        JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
          ON candidate->>'keyId'=intent.key_id AND candidate->>'digest'=intent.credential_digest
        WHERE intent.store_id=selected_store
        ORDER BY intent.created_at DESC,intent.id LIMIT 1 FOR UPDATE OF intent;
        IF selected_intent_id IS NOT NULL THEN
          cart_payload:=saas.storefront_intent_projection(selected_store,selected_intent_id,p_now);
          SELECT intent.variant_id,intent.quantity,variant.stock_tracking INTO line
          FROM saas.storefront_checkout_intents intent
          JOIN saas.product_variants variant
            ON variant.store_id=intent.store_id AND variant.id=intent.variant_id AND variant.product_id=intent.product_id
          WHERE intent.store_id=selected_store AND intent.id=selected_intent_id
          FOR UPDATE OF variant;
          IF line.stock_tracking AND saas.storefront_available_stock(selected_store,line.variant_id,p_now,NULL)<line.quantity THEN
            RETURN QUERY SELECT 'stock_unavailable',cart_payload; RETURN;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM saas.public_checkout_complete_without_available_stock_v090(
    p_hostname,p_now,p_kind,p_credentials,p_customer_credentials,p_operation_id,p_fingerprint,p_expected_version,
    p_delivery,p_payment_kind,p_order_id,p_customer_id,p_address_id,p_event_id,p_receipt_id,p_receipt_key_id,
    p_receipt_digest,p_receipt_expires_at,p_customer_credential_id,p_customer_key_id,p_customer_digest,p_customer_expires_at
  );
END
$f$;

DROP FUNCTION IF EXISTS saas.storefront_checkout_reconcile_customer_identity_v105(
  uuid,timestamp with time zone,jsonb,jsonb
);

REVOKE ALL ON FUNCTION
  saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.public_checkout_complete(text,timestamp with time zone,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamp with time zone,uuid,text,text,timestamp with time zone)
TO celebix_saas_host_resolver;

COMMIT;
