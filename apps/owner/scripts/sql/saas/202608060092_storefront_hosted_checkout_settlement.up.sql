BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_hosted_checkout_sessions') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_storefront_hosted_checkout_status(text,timestamp with time zone,jsonb)') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_order_receipts') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_customer_credentials') IS NULL
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_SETTLEMENT_SOURCE_INVALID'; END IF;
END
$f$;

CREATE FUNCTION saas.storefront_hosted_checkout_terminal_transition()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  selected_session saas.storefront_hosted_checkout_sessions%ROWTYPE;
  selected_customer saas.customers%ROWTYPE;
  selected_address saas.customer_addresses%ROWTYPE;
  line jsonb;
  receipt_payload jsonb;
  operation_result jsonb;
  position integer:=0;
  order_number text;
  held_count bigint;
  tracked_count bigint;
  updated_count bigint;
  settlement_conflict boolean:=false;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT session.* INTO selected_session
  FROM saas.storefront_hosted_checkout_sessions session
  WHERE session.store_id=NEW.store_id AND session.payment_attempt_id=NEW.id
  FOR UPDATE;
  IF NOT FOUND OR selected_session.status IN('captured','failed','cancelled','expired','stock_conflict')
  THEN RETURN NEW; END IF;

  IF NEW.status IN('provider_outcome_unknown','reconciliation_required') THEN
    IF selected_session.status IN('active','provider_ready') THEN
      UPDATE saas.storefront_hosted_checkout_sessions SET
        status='processing',safe_code=NEW.safe_code,version=version+1,updated_at=NEW.updated_at
      WHERE store_id=selected_session.store_id AND id=selected_session.id;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN('captured','failed','cancelled','expired') THEN RETURN NEW; END IF;

  IF selected_session.cart_id IS NOT NULL THEN
    PERFORM cart.id FROM saas.storefront_carts cart
    WHERE cart.store_id=selected_session.store_id AND cart.id=selected_session.cart_id
    FOR UPDATE OF cart;
  ELSE
    PERFORM intent.id FROM saas.storefront_checkout_intents intent
    WHERE intent.store_id=selected_session.store_id AND intent.id=selected_session.intent_id
    FOR UPDATE OF intent;
  END IF;
  PERFORM variant.id FROM saas.product_variants variant
  WHERE variant.store_id=selected_session.store_id AND EXISTS(
    SELECT 1 FROM saas.checkout_inventory_reservations reservation
    WHERE reservation.store_id=selected_session.store_id
      AND reservation.storefront_hosted_session_id=selected_session.id
      AND reservation.variant_id=variant.id
  ) ORDER BY variant.id FOR UPDATE OF variant;
  PERFORM reservation.id FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=selected_session.store_id
    AND reservation.storefront_hosted_session_id=selected_session.id
  ORDER BY reservation.variant_id,reservation.id FOR UPDATE;

  IF NEW.status IN('failed','cancelled','expired') THEN
    UPDATE saas.checkout_inventory_reservations SET
      status=CASE WHEN NEW.status='expired' THEN 'expired' ELSE 'released' END,
      expired_at=CASE WHEN NEW.status='expired' THEN NEW.updated_at ELSE NULL END,
      released_at=CASE WHEN NEW.status='expired' THEN NULL ELSE NEW.updated_at END,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_session.store_id
      AND storefront_hosted_session_id=selected_session.id AND status='held';
    UPDATE saas.storefront_hosted_checkout_sessions SET
      status=NEW.status,safe_code=NEW.safe_code,terminal_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_session.store_id AND id=selected_session.id;
    RETURN NEW;
  END IF;

  SELECT pg_catalog.count(*) INTO held_count
  FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=selected_session.store_id
    AND reservation.storefront_hosted_session_id=selected_session.id;
  settlement_conflict:=held_count<>pg_catalog.jsonb_array_length(selected_session.item_snapshot)
    OR EXISTS(
      SELECT 1 FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=selected_session.store_id
        AND reservation.storefront_hosted_session_id=selected_session.id
        AND reservation.status<>'held'
    ) OR EXISTS(
      SELECT 1 FROM saas.checkout_inventory_reservations reservation
      JOIN saas.product_variants variant
        ON variant.store_id=reservation.store_id AND variant.id=reservation.variant_id
      WHERE reservation.store_id=selected_session.store_id
        AND reservation.storefront_hosted_session_id=selected_session.id
        AND reservation.stock_tracked AND variant.stock_quantity<reservation.quantity
    ) OR (selected_session.cart_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM saas.storefront_carts cart
      WHERE cart.store_id=selected_session.store_id AND cart.id=selected_session.cart_id
        AND cart.status='active' AND cart.version=selected_session.source_version
    )) OR (selected_session.intent_id IS NOT NULL AND NOT EXISTS(
      SELECT 1 FROM saas.storefront_checkout_intents intent
      WHERE intent.store_id=selected_session.store_id AND intent.id=selected_session.intent_id
        AND intent.status='active'
    ));
  IF settlement_conflict THEN
    UPDATE saas.checkout_inventory_reservations SET status='released',released_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_session.store_id
      AND storefront_hosted_session_id=selected_session.id AND status='held';
    UPDATE saas.storefront_hosted_checkout_sessions SET
      status='stock_conflict',safe_code='captured_stock_conflict',terminal_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_session.store_id AND id=selected_session.id;
    RETURN NEW;
  END IF;

  PERFORM customer.id FROM saas.customers customer
  WHERE customer.store_id=selected_session.store_id
    AND (customer.email=selected_session.delivery_snapshot->'contact'->>'email'
      OR customer.phone=selected_session.delivery_snapshot->'contact'->>'phone')
  ORDER BY customer.id FOR UPDATE;
  SELECT customer.* INTO selected_customer FROM saas.customers customer
  WHERE customer.store_id=selected_session.store_id
    AND (customer.email=selected_session.delivery_snapshot->'contact'->>'email'
      OR customer.phone=selected_session.delivery_snapshot->'contact'->>'phone')
  ORDER BY customer.id LIMIT 1;
  IF FOUND THEN
    IF selected_customer.status<>'active'
      OR selected_customer.email IS DISTINCT FROM selected_session.delivery_snapshot->'contact'->>'email'
      OR selected_customer.phone IS DISTINCT FROM selected_session.delivery_snapshot->'contact'->>'phone'
      OR EXISTS(SELECT 1 FROM saas.customers customer
        WHERE customer.store_id=selected_session.store_id AND customer.id<>selected_customer.id
          AND (customer.email=selected_session.delivery_snapshot->'contact'->>'email'
            OR customer.phone=selected_session.delivery_snapshot->'contact'->>'phone'))
    THEN
      UPDATE saas.checkout_inventory_reservations SET status='released',released_at=NEW.updated_at,
        version=version+1,updated_at=NEW.updated_at
      WHERE store_id=selected_session.store_id
        AND storefront_hosted_session_id=selected_session.id AND status='held';
      UPDATE saas.storefront_hosted_checkout_sessions SET
        status='stock_conflict',safe_code='customer_authority_conflict',terminal_at=NEW.updated_at,
        version=version+1,updated_at=NEW.updated_at
      WHERE store_id=selected_session.store_id AND id=selected_session.id;
      RETURN NEW;
    END IF;
    UPDATE saas.customers SET
      first_name=selected_session.delivery_snapshot->'contact'->>'firstName',
      last_name=selected_session.delivery_snapshot->'contact'->>'lastName',
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_session.store_id AND id=selected_customer.id
    RETURNING * INTO selected_customer;
  ELSE
    INSERT INTO saas.customers(
      id,store_id,status,first_name,last_name,email,phone,version,created_at,updated_at
    ) VALUES(
      selected_session.customer_id,selected_session.store_id,'active',
      selected_session.delivery_snapshot->'contact'->>'firstName',
      selected_session.delivery_snapshot->'contact'->>'lastName',
      selected_session.delivery_snapshot->'contact'->>'email',
      selected_session.delivery_snapshot->'contact'->>'phone',1,NEW.updated_at,NEW.updated_at
    ) RETURNING * INTO selected_customer;
  END IF;

  SELECT address.* INTO selected_address FROM saas.customer_addresses address
  WHERE address.store_id=selected_session.store_id
    AND address.customer_id=selected_customer.id AND address.is_default
  FOR UPDATE;
  IF FOUND THEN
    UPDATE saas.customer_addresses SET
      recipient_name=selected_customer.first_name||' '||selected_customer.last_name,
      line1=selected_session.delivery_snapshot->'shippingAddress'->>'line1',
      line2=selected_session.delivery_snapshot->'shippingAddress'->>'line2',
      city=selected_session.delivery_snapshot->'shippingAddress'->>'city',
      district=selected_session.delivery_snapshot->'shippingAddress'->>'district',
      postal_code=selected_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      country=selected_session.delivery_snapshot->'shippingAddress'->>'country',
      version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_session.store_id AND id=selected_address.id
    RETURNING * INTO selected_address;
  ELSE
    INSERT INTO saas.customer_addresses(
      id,store_id,customer_id,label,recipient_name,line1,line2,city,district,
      postal_code,country,is_default,version,created_at,updated_at
    ) VALUES(
      selected_session.address_id,selected_session.store_id,selected_customer.id,'Teslimat',
      selected_customer.first_name||' '||selected_customer.last_name,
      selected_session.delivery_snapshot->'shippingAddress'->>'line1',
      selected_session.delivery_snapshot->'shippingAddress'->>'line2',
      selected_session.delivery_snapshot->'shippingAddress'->>'city',
      selected_session.delivery_snapshot->'shippingAddress'->>'district',
      selected_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      selected_session.delivery_snapshot->'shippingAddress'->>'country',
      true,1,NEW.updated_at,NEW.updated_at
    ) RETURNING * INTO selected_address;
  END IF;

  order_number:='SF-'||pg_catalog.upper(pg_catalog.replace(selected_session.order_id::text,'-',''));
  INSERT INTO saas.orders(
    id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
    subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
    shipping_address,tracking,version,created_at,updated_at,customer_id
  ) VALUES(
    selected_session.order_id,selected_session.store_id,order_number,'storefront',
    selected_customer.first_name||' '||selected_customer.last_name,selected_customer.email,
    selected_customer.phone,selected_session.currency,selected_session.subtotal_minor,
    selected_session.shipping_minor,selected_session.discount_minor,selected_session.total_minor,
    'confirmed','completed',selected_session.delivery_snapshot->'shippingAddress',NULL,
    1,NEW.updated_at,NEW.updated_at,selected_customer.id
  );

  FOR line IN SELECT value FROM pg_catalog.jsonb_array_elements(selected_session.item_snapshot) LOOP
    INSERT INTO saas.order_items(
      id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,
      unit_price_cents,quantity,discount_cents,line_total_cents,created_at
    ) VALUES(
      saas.storefront_commerce_uuid(selected_session.order_id::text||':item:'||position),
      selected_session.store_id,selected_session.order_id,(line->>'productId')::uuid,
      (line->>'variantId')::uuid,position,line->>'title',line->>'variantTitle',line->>'sku',
      (line->>'unitPriceCents')::bigint,(line->>'quantity')::integer,0,
      (line->>'lineTotalCents')::bigint,NEW.updated_at
    );
    position:=position+1;
  END LOOP;

  INSERT INTO saas.order_events(
    id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at
  ) VALUES(
    selected_session.event_id,selected_session.store_id,selected_session.order_id,NULL,
    'order_created',NULL,'confirmed','Storefront kart ödemesi doğrulandı.',
    pg_catalog.jsonb_build_object('paymentKind','hosted_card','providerCode',selected_session.provider_code),
    NEW.updated_at
  );
  INSERT INTO saas.storefront_customer_credentials(
    id,store_id,customer_id,key_id,credential_digest,expires_at,created_at,last_seen_at
  ) VALUES(
    selected_session.customer_credential_id,selected_session.store_id,selected_customer.id,
    selected_session.customer_key_id,selected_session.customer_credential_digest,
    selected_session.customer_expires_at,NEW.updated_at,NEW.updated_at
  );
  INSERT INTO saas.storefront_order_receipts(
    id,store_id,order_id,customer_credential_id,key_id,credential_digest,expires_at,created_at
  ) VALUES(
    selected_session.receipt_id,selected_session.store_id,selected_session.order_id,
    selected_session.customer_credential_id,selected_session.receipt_key_id,
    selected_session.receipt_credential_digest,selected_session.receipt_expires_at,NEW.updated_at
  );
  receipt_payload:=pg_catalog.jsonb_build_object(
    'orderReference',order_number,'currency',selected_session.currency,
    'subtotalCents',selected_session.subtotal_minor,
    'shippingCents',selected_session.shipping_minor,
    'totalCents',selected_session.total_minor,
    'paymentStatus','completed',
    'paymentMethod',pg_catalog.jsonb_build_object(
      'kind','hosted_card','id',selected_session.payment_method_id,
      'label',(SELECT method.label FROM saas.payment_methods method
        WHERE method.store_id=selected_session.store_id AND method.id=selected_session.payment_method_id),
      'instructions','Güvenli sağlayıcı ekranında tamamlandı.',
      'providerCode',selected_session.provider_code,
      'presentation',CASE selected_session.provider_code WHEN 'paytr_iframe' THEN 'iframe' ELSE 'redirect' END,
      'requiredCustomerFields',CASE selected_session.provider_code WHEN 'iyzico_iframe'
        THEN pg_catalog.jsonb_build_array('identity_number') ELSE '[]'::jsonb END
    ),
    'delivery',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'recipientName',selected_customer.first_name||' '||selected_customer.last_name,
      'addressLine1',selected_session.delivery_snapshot->'shippingAddress'->>'line1',
      'addressLine2',selected_session.delivery_snapshot->'shippingAddress'->>'line2',
      'city',selected_session.delivery_snapshot->'shippingAddress'->>'city',
      'district',selected_session.delivery_snapshot->'shippingAddress'->>'district',
      'postalCode',selected_session.delivery_snapshot->'shippingAddress'->>'postalCode',
      'country','TR'
    )),
    'items',selected_session.item_snapshot,
    'createdAt',saas.storefront_commerce_timestamp(NEW.updated_at)
  );
  operation_result:=pg_catalog.jsonb_build_object(
    'receipt',receipt_payload,
    'credentialPersistence',pg_catalog.jsonb_build_object(
      'receipt',true,'customer',true,
      'receiptKeyId',selected_session.receipt_key_id,
      'customerKeyId',selected_session.customer_key_id
    )
  );
  INSERT INTO saas.storefront_checkout_operations(
    operation_id,store_id,cart_id,intent_id,order_id,payload_fingerprint,result_payload,committed_at
  ) VALUES(
    selected_session.payment_attempt_id,selected_session.store_id,selected_session.cart_id,
    selected_session.intent_id,selected_session.order_id,selected_session.commerce_authority_digest,
    operation_result,NEW.updated_at
  );

  UPDATE saas.checkout_inventory_reservations SET status='consumed',consumed_at=NEW.updated_at,
    version=version+1,updated_at=NEW.updated_at
  WHERE store_id=selected_session.store_id
    AND storefront_hosted_session_id=selected_session.id AND status='held';
  SELECT pg_catalog.count(*) INTO tracked_count
  FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=selected_session.store_id
    AND reservation.storefront_hosted_session_id=selected_session.id AND reservation.stock_tracked;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id',selected_session.order_id::text,true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time',NEW.updated_at::text,true);
  UPDATE saas.product_variants variant SET
    stock_quantity=variant.stock_quantity-reservation.quantity,
    version=variant.version+1,updated_at=NEW.updated_at
  FROM saas.checkout_inventory_reservations reservation
  WHERE reservation.store_id=selected_session.store_id
    AND reservation.storefront_hosted_session_id=selected_session.id
    AND reservation.stock_tracked AND variant.store_id=reservation.store_id
    AND variant.id=reservation.variant_id;
  GET DIAGNOSTICS updated_count=ROW_COUNT;
  PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
  PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
  IF updated_count<>tracked_count THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_STOCK_WRITE_CONFLICT'; END IF;

  IF selected_session.cart_id IS NOT NULL THEN
    UPDATE saas.storefront_carts SET status='converted',version=version+1,updated_at=NEW.updated_at
    WHERE store_id=selected_session.store_id AND id=selected_session.cart_id;
  ELSE
    UPDATE saas.storefront_checkout_intents SET status='converted'
    WHERE store_id=selected_session.store_id AND id=selected_session.intent_id;
  END IF;
  UPDATE saas.storefront_hosted_checkout_sessions SET
    status='captured',safe_code=NEW.safe_code,terminal_at=NEW.updated_at,
    version=version+1,updated_at=NEW.updated_at
  WHERE store_id=selected_session.store_id AND id=selected_session.id;
  RETURN NEW;
END
$f$;

CREATE TRIGGER payment_attempt_standard_checkout_terminal
AFTER UPDATE OF status ON saas.payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.storefront_hosted_checkout_terminal_transition();

CREATE FUNCTION saas.storefront_hosted_checkout_expire_created(
  p_now timestamptz,p_limit integer
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE expired_count bigint;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_limit NOT BETWEEN 1 AND 25
  THEN RETURN 0; END IF;
  WITH candidates AS (
    SELECT attempt.id FROM saas.payment_attempts attempt
    JOIN saas.storefront_hosted_checkout_sessions session
      ON session.store_id=attempt.store_id AND session.payment_attempt_id=attempt.id
    WHERE session.status IN('active','provider_ready','processing')
      AND session.hold_expires_at<=p_now AND attempt.status='created'
    ORDER BY session.hold_expires_at,attempt.id
    FOR UPDATE OF attempt SKIP LOCKED LIMIT p_limit
  )
  UPDATE saas.payment_attempts attempt SET
    status='expired',safe_code='initialization_expired',version=version+1,updated_at=p_now
  FROM candidates WHERE attempt.id=candidates.id;
  GET DIAGNOSTICS expired_count=ROW_COUNT;
  RETURN expired_count;
END
$f$;

CREATE FUNCTION saas.storefront_hosted_checkout_reconciliation_candidates(
  p_now timestamptz,p_limit integer
)
RETURNS TABLE(
  attempt_id uuid,attempt_version bigint,attempt_status text,
  credential_version bigint,provider_reference text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
  SELECT attempt.id,attempt.version,attempt.status,attempt.credential_version,
    attempt.safe_provider_reference
  FROM saas.payment_attempts attempt
  JOIN saas.storefront_hosted_checkout_sessions session
    ON session.store_id=attempt.store_id AND session.payment_attempt_id=attempt.id
  WHERE p_now IS NOT NULL AND pg_catalog.isfinite(p_now)
    AND session.status IN('active','provider_ready','processing')
    AND session.hold_expires_at<=p_now
    AND attempt.status IN(
      'awaiting_customer','submitted','authorized','provider_outcome_unknown','reconciliation_required'
    )
  ORDER BY attempt.updated_at,attempt.id
  LIMIT CASE WHEN p_limit BETWEEN 1 AND 25 THEN p_limit ELSE 0 END
$f$;

CREATE FUNCTION saas.storefront_hosted_checkout_settlement_preflight()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.to_regprocedure('saas.storefront_hosted_checkout_terminal_transition()') IS NOT NULL
    AND pg_catalog.to_regprocedure('saas.storefront_hosted_checkout_expire_created(timestamp with time zone,integer)') IS NOT NULL
    AND pg_catalog.to_regprocedure('saas.storefront_hosted_checkout_reconciliation_candidates(timestamp with time zone,integer)') IS NOT NULL
    AND EXISTS(
      SELECT 1 FROM pg_catalog.pg_trigger trigger_info
      WHERE trigger_info.tgrelid='saas.payment_attempts'::pg_catalog.regclass
        AND trigger_info.tgname='payment_attempt_standard_checkout_terminal'
        AND trigger_info.tgfoid='saas.storefront_hosted_checkout_terminal_transition()'::pg_catalog.regprocedure
        AND trigger_info.tgenabled='O' AND NOT trigger_info.tgisinternal
    )
$f$;

REVOKE ALL ON FUNCTION
  saas.storefront_hosted_checkout_terminal_transition(),
  saas.storefront_hosted_checkout_expire_created(timestamptz,integer),
  saas.storefront_hosted_checkout_reconciliation_candidates(timestamptz,integer),
  saas.storefront_hosted_checkout_settlement_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.storefront_hosted_checkout_expire_created(timestamptz,integer),
  saas.storefront_hosted_checkout_reconciliation_candidates(timestamptz,integer),
  saas.storefront_hosted_checkout_settlement_preflight()
TO celebix_saas_workflow;

COMMIT;
