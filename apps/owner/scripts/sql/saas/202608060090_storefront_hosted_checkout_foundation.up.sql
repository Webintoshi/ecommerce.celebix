BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regclass('saas.checkout_inventory_reservations') IS NULL
    OR pg_catalog.to_regclass('saas.payment_attempts') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_carts') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_checkout_intents') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_checkout_quote(text,timestamp with time zone,text,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.payment_method_single_active_provider_preflight()') IS NULL
    OR saas.payment_method_single_active_provider_preflight() IS DISTINCT FROM true
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_FOUNDATION_SOURCE_INVALID'; END IF;
END
$f$;

CREATE TABLE saas.storefront_hosted_checkout_sessions(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  cart_id uuid,
  intent_id uuid,
  payment_attempt_id uuid NOT NULL,
  payment_method_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  provider_code text NOT NULL,
  environment text NOT NULL,
  credential_version bigint NOT NULL,
  execution_adapter_version integer NOT NULL,
  execution_evidence_digest text NOT NULL,
  order_reference text NOT NULL,
  order_id uuid NOT NULL,
  customer_id uuid NOT NULL,
  address_id uuid NOT NULL,
  event_id uuid NOT NULL,
  receipt_id uuid NOT NULL,
  customer_credential_id uuid NOT NULL,
  source_version bigint NOT NULL,
  commerce_authority_digest char(64) NOT NULL,
  currency text NOT NULL,
  subtotal_minor bigint NOT NULL,
  shipping_minor bigint NOT NULL,
  discount_minor bigint NOT NULL,
  total_minor bigint NOT NULL,
  delivery_snapshot jsonb NOT NULL,
  item_snapshot jsonb NOT NULL,
  status text NOT NULL,
  safe_code text NOT NULL,
  hold_expires_at timestamptz NOT NULL,
  terminal_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  payment_session_key_id text NOT NULL,
  payment_session_credential_digest char(64) NOT NULL,
  payment_session_expires_at timestamptz NOT NULL,
  receipt_key_id text NOT NULL,
  receipt_credential_digest char(64) NOT NULL,
  receipt_expires_at timestamptz NOT NULL,
  customer_key_id text NOT NULL,
  customer_credential_digest char(64) NOT NULL,
  customer_expires_at timestamptz NOT NULL,
  presentation_key_id text,
  presentation_digest char(64),
  sealed_presentation jsonb,
  presentation_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(store_id,id),
  UNIQUE(store_id,payment_attempt_id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,cart_id) REFERENCES saas.storefront_carts(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,intent_id) REFERENCES saas.storefront_checkout_intents(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,payment_attempt_id) REFERENCES saas.payment_attempts(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,payment_method_id) REFERENCES saas.payment_methods(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,profile_id,provider_code) REFERENCES saas.merchant_provider_profiles(store_id,id,provider_code) ON DELETE RESTRICT,
  CHECK((cart_id IS NOT NULL AND intent_id IS NULL) OR (cart_id IS NULL AND intent_id IS NOT NULL)),
  CHECK(provider_code IN('paytr_iframe','iyzico_iframe')),
  CHECK(environment IN('test','live')),
  CHECK(credential_version BETWEEN 1 AND 9007199254740991),
  CHECK(execution_adapter_version>0),
  CHECK(execution_evidence_digest~'^sha256:[a-f0-9]{64}$'),
  CHECK(order_reference~'^[A-Za-z0-9._:-]{1,128}$'),
  CHECK(source_version BETWEEN 1 AND 9007199254740991),
  CHECK(commerce_authority_digest~'^[a-f0-9]{64}$'),
  CHECK(currency='TRY'),
  CHECK(subtotal_minor BETWEEN 0 AND 9007199254740991),
  CHECK(shipping_minor BETWEEN 0 AND 9007199254740991),
  CHECK(discount_minor BETWEEN 0 AND 9007199254740991),
  CHECK(total_minor BETWEEN 1 AND 9007199254740991
    AND total_minor=subtotal_minor+shipping_minor-discount_minor),
  CHECK(pg_catalog.jsonb_typeof(delivery_snapshot)='object'
    AND pg_catalog.pg_column_size(delivery_snapshot)<=16384),
  CHECK(pg_catalog.jsonb_typeof(item_snapshot)='array'
    AND pg_catalog.jsonb_array_length(item_snapshot) BETWEEN 1 AND 100
    AND pg_catalog.pg_column_size(item_snapshot)<=131072),
  CHECK(status IN('active','provider_ready','processing','captured','failed','cancelled','expired','stock_conflict')),
  CHECK(safe_code~'^[a-z][a-z0-9_]{0,63}$'),
  CHECK(version BETWEEN 1 AND 9007199254740991),
  CHECK(payment_session_key_id~'^[a-z0-9][a-z0-9_-]{0,31}$'
    AND receipt_key_id~'^[a-z0-9][a-z0-9_-]{0,31}$'
    AND customer_key_id~'^[a-z0-9][a-z0-9_-]{0,31}$'),
  CHECK(payment_session_credential_digest~'^[a-f0-9]{64}$'
    AND receipt_credential_digest~'^[a-f0-9]{64}$'
    AND customer_credential_digest~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.isfinite(created_at) AND pg_catalog.isfinite(updated_at)
    AND pg_catalog.isfinite(hold_expires_at) AND pg_catalog.isfinite(payment_session_expires_at)
    AND pg_catalog.isfinite(receipt_expires_at) AND pg_catalog.isfinite(customer_expires_at)
    AND updated_at>=created_at AND hold_expires_at=created_at+interval '15 minutes'
    AND payment_session_expires_at=hold_expires_at
    AND receipt_expires_at>created_at AND receipt_expires_at<=created_at+interval '1 day'
    AND customer_expires_at>created_at AND customer_expires_at<=created_at+interval '31 days'),
  CHECK((status IN('captured','failed','cancelled','expired','stock_conflict'))=(terminal_at IS NOT NULL)),
  CHECK(terminal_at IS NULL OR (pg_catalog.isfinite(terminal_at) AND terminal_at BETWEEN created_at AND updated_at)),
  CHECK(
    (presentation_key_id IS NULL AND presentation_digest IS NULL AND sealed_presentation IS NULL AND presentation_expires_at IS NULL)
    OR
    (presentation_key_id~'^[A-Za-z0-9._-]{1,128}$' AND presentation_digest~'^[a-f0-9]{64}$'
      AND pg_catalog.jsonb_typeof(sealed_presentation)='object' AND pg_catalog.pg_column_size(sealed_presentation)<=32768
      AND pg_catalog.isfinite(presentation_expires_at) AND presentation_expires_at>created_at
      AND presentation_expires_at<=hold_expires_at)
  )
);

CREATE UNIQUE INDEX storefront_hosted_checkout_one_active_cart_idx
  ON saas.storefront_hosted_checkout_sessions(store_id,cart_id)
  WHERE cart_id IS NOT NULL AND status IN('active','provider_ready','processing');
CREATE UNIQUE INDEX storefront_hosted_checkout_one_active_intent_idx
  ON saas.storefront_hosted_checkout_sessions(store_id,intent_id)
  WHERE intent_id IS NOT NULL AND status IN('active','provider_ready','processing');
CREATE INDEX storefront_hosted_checkout_expiry_idx
  ON saas.storefront_hosted_checkout_sessions(status,hold_expires_at,id)
  WHERE status IN('active','provider_ready','processing');
CREATE INDEX storefront_hosted_checkout_payment_session_idx
  ON saas.storefront_hosted_checkout_sessions(store_id,payment_session_key_id,payment_session_credential_digest,payment_session_expires_at);

CREATE TABLE saas.storefront_hosted_checkout_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  session_id uuid NOT NULL,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  UNIQUE(store_id,operation_id),
  FOREIGN KEY(store_id,session_id) REFERENCES saas.storefront_hosted_checkout_sessions(store_id,id) ON DELETE RESTRICT,
  CHECK(operation_kind IN('start','presentation','finalize','expire')),
  CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=32768),
  CHECK(pg_catalog.isfinite(committed_at))
);

ALTER TABLE saas.storefront_hosted_checkout_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_hosted_checkout_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_hosted_checkout_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_hosted_checkout_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.storefront_hosted_checkout_sessions,saas.storefront_hosted_checkout_operations
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.guard_storefront_hosted_checkout_operation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_OPERATION_IMMUTABLE';
END
$f$;
CREATE TRIGGER storefront_hosted_checkout_operations_immutable
  BEFORE UPDATE OR DELETE ON saas.storefront_hosted_checkout_operations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_hosted_checkout_operation();

CREATE FUNCTION saas.guard_storefront_hosted_checkout_session()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_SESSION_DELETE_DENIED'; END IF;
  IF (pg_catalog.to_jsonb(NEW)-ARRAY['status','safe_code','terminal_at','version','updated_at','presentation_key_id','presentation_digest','sealed_presentation','presentation_expires_at'])
      IS DISTINCT FROM
     (pg_catalog.to_jsonb(OLD)-ARRAY['status','safe_code','terminal_at','version','updated_at','presentation_key_id','presentation_digest','sealed_presentation','presentation_expires_at'])
    OR NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at
    OR OLD.status IN('captured','failed','cancelled','expired','stock_conflict')
    OR NOT (
      (OLD.status='active' AND NEW.status IN('provider_ready','processing','failed','cancelled','expired'))
      OR (OLD.status='provider_ready' AND NEW.status IN('processing','captured','failed','cancelled','expired','stock_conflict'))
      OR (OLD.status='processing' AND NEW.status IN('provider_ready','captured','failed','cancelled','expired','stock_conflict'))
    )
  THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_SESSION_TRANSITION_DENIED'; END IF;
  RETURN NEW;
END
$f$;
CREATE TRIGGER storefront_hosted_checkout_sessions_guard
  BEFORE UPDATE OR DELETE ON saas.storefront_hosted_checkout_sessions
  FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_hosted_checkout_session();

ALTER TABLE saas.checkout_inventory_reservations
  ALTER COLUMN quick_order_link_id DROP NOT NULL,
  ADD COLUMN storefront_hosted_session_id uuid,
  ADD CONSTRAINT checkout_inventory_reservations_commerce_owner_check CHECK(
    (quick_order_link_id IS NOT NULL AND storefront_hosted_session_id IS NULL)
    OR (quick_order_link_id IS NULL AND storefront_hosted_session_id IS NOT NULL)
  ),
  ADD CONSTRAINT checkout_inventory_reservations_standard_session_store_fk
    FOREIGN KEY(store_id,storefront_hosted_session_id)
    REFERENCES saas.storefront_hosted_checkout_sessions(store_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX checkout_inventory_reservations_standard_session_variant_key
  ON saas.checkout_inventory_reservations(storefront_hosted_session_id,variant_id)
  WHERE storefront_hosted_session_id IS NOT NULL;

CREATE OR REPLACE FUNCTION saas.guard_checkout_reservation_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_DELETE_DENIED'; END IF;
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.store_id IS DISTINCT FROM NEW.store_id
    OR OLD.stock_tracked IS DISTINCT FROM NEW.stock_tracked OR OLD.quantity IS DISTINCT FROM NEW.quantity
    OR OLD.quick_order_link_id IS DISTINCT FROM NEW.quick_order_link_id
    OR OLD.storefront_hosted_session_id IS DISTINCT FROM NEW.storefront_hosted_session_id
    OR OLD.product_id IS DISTINCT FROM NEW.product_id OR OLD.variant_id IS DISTINCT FROM NEW.variant_id
    OR OLD.attempt_id IS DISTINCT FROM NEW.attempt_id
    OR OLD.payment_attempt_id IS DISTINCT FROM NEW.payment_attempt_id
    OR OLD.held_at IS DISTINCT FROM NEW.held_at OR NEW.updated_at<OLD.updated_at
    OR NEW.version<>OLD.version+1
  THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_AUTHORITY_IMMUTABLE'; END IF;
  IF OLD.status IN('consumed','released','expired') THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_TERMINAL'; END IF;
  IF OLD.status='held' AND NEW.status NOT IN('held','consumed','released','expired')
  THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_TRANSITION_DENIED'; END IF;
  RETURN NEW;
END
$f$;

CREATE FUNCTION saas.storefront_available_stock(
  p_store_id uuid,p_variant_id uuid,p_now timestamptz,p_excluded_session_id uuid DEFAULT NULL
)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT CASE WHEN variant.stock_tracking THEN
    GREATEST(variant.stock_quantity-COALESCE((
      SELECT pg_catalog.sum(reservation.quantity)::bigint
      FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=variant.store_id AND reservation.variant_id=variant.id
        AND reservation.stock_tracked AND reservation.status='held'
        AND (p_excluded_session_id IS NULL
          OR reservation.storefront_hosted_session_id IS DISTINCT FROM p_excluded_session_id)
        AND (
          (reservation.attempt_id IS NOT NULL AND EXISTS(
            SELECT 1 FROM saas.checkout_payment_attempts legacy_attempt
            WHERE legacy_attempt.store_id=reservation.store_id AND legacy_attempt.id=reservation.attempt_id
              AND legacy_attempt.status IN('reserved','provider_ready','initiation_unknown')
              AND legacy_attempt.hold_expires_at>p_now
          ))
          OR
          (reservation.payment_attempt_id IS NOT NULL AND reservation.quick_order_link_id IS NOT NULL AND EXISTS(
            SELECT 1 FROM saas.quick_order_hosted_payment_bridges bridge
            WHERE bridge.store_id=reservation.store_id AND bridge.attempt_id=reservation.payment_attempt_id
              AND bridge.quick_order_link_id=reservation.quick_order_link_id
              AND bridge.status='active' AND bridge.hold_expires_at>p_now
          ))
          OR
          (reservation.storefront_hosted_session_id IS NOT NULL AND EXISTS(
            SELECT 1 FROM saas.storefront_hosted_checkout_sessions session
            WHERE session.store_id=reservation.store_id AND session.id=reservation.storefront_hosted_session_id
              AND session.payment_attempt_id=reservation.payment_attempt_id
              AND session.status IN('active','provider_ready','processing')
              AND session.hold_expires_at>p_now
          ))
        )
    ),0::bigint),0::bigint)::bigint
    ELSE 9007199254740991::bigint END
  FROM saas.product_variants variant
  WHERE variant.store_id=p_store_id AND variant.id=p_variant_id
$f$;

REVOKE ALL ON FUNCTION saas.storefront_available_stock(uuid,uuid,timestamptz,uuid)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

ALTER FUNCTION saas.public_cart_mutate(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
) RENAME TO public_cart_mutate_without_available_stock_v090;
REVOKE ALL ON FUNCTION saas.public_cart_mutate_without_available_stock_v090(
  text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.public_cart_mutate(
  p_hostname text,p_now timestamptz,p_credentials jsonb,
  p_cart_id uuid,p_cart_key_id text,p_cart_digest text,p_cart_expires_at timestamptz,
  p_operation_id uuid,p_fingerprint text,p_action text,p_expected_version bigint,
  p_product_id uuid,p_variant_id uuid,p_quantity integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_cart_id uuid; selected_variant saas.product_variants%ROWTYPE;
  current_quantity integer:=0; requested_quantity integer; available_quantity bigint;
BEGIN
  IF p_action IN('add','quantity') AND p_quantity BETWEEN 1 AND 99
    AND saas.storefront_credential_candidates_valid(p_credentials,true)
  THEN
    selected_store:=saas.storefront_public_store(p_hostname,p_now);
    IF selected_store IS NOT NULL THEN
      IF pg_catalog.jsonb_array_length(p_credentials)>0 THEN
        SELECT cart.id INTO selected_cart_id
        FROM saas.storefront_carts cart
        JOIN saas.storefront_cart_credentials credential
          ON credential.store_id=cart.store_id AND credential.cart_id=cart.id
        JOIN pg_catalog.jsonb_array_elements(p_credentials) candidate
          ON candidate->>'keyId'=credential.key_id AND candidate->>'digest'=credential.credential_digest
        WHERE cart.store_id=selected_store
        ORDER BY cart.created_at DESC,cart.id LIMIT 1 FOR UPDATE OF cart;
      ELSE selected_cart_id:=p_cart_id; END IF;
      SELECT variant.* INTO selected_variant FROM saas.product_variants variant
      WHERE variant.store_id=selected_store AND variant.id=p_variant_id AND variant.product_id=p_product_id
      FOR UPDATE;
      IF FOUND AND selected_variant.stock_tracking THEN
        IF p_action='add' AND selected_cart_id IS NOT NULL THEN
          SELECT COALESCE(item.quantity,0) INTO current_quantity
          FROM saas.storefront_cart_items item
          WHERE item.store_id=selected_store AND item.cart_id=selected_cart_id AND item.variant_id=p_variant_id;
          current_quantity:=COALESCE(current_quantity,0);
        END IF;
        requested_quantity:=CASE WHEN p_action='add' THEN current_quantity+p_quantity ELSE p_quantity END;
        available_quantity:=saas.storefront_available_stock(selected_store,p_variant_id,p_now,NULL);
        IF available_quantity IS NOT NULL AND available_quantity<requested_quantity THEN
          RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM saas.public_cart_mutate_without_available_stock_v090(
    p_hostname,p_now,p_credentials,p_cart_id,p_cart_key_id,p_cart_digest,p_cart_expires_at,
    p_operation_id,p_fingerprint,p_action,p_expected_version,p_product_id,p_variant_id,p_quantity
  );
END
$f$;

ALTER FUNCTION saas.public_buy_now_create(
  text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer
) RENAME TO public_buy_now_create_without_available_stock_v090;
REVOKE ALL ON FUNCTION saas.public_buy_now_create_without_available_stock_v090(
  text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.public_buy_now_create(
  p_hostname text,p_now timestamptz,p_intent_id uuid,p_key_id text,p_digest text,
  p_expires_at timestamptz,p_product_id uuid,p_variant_id uuid,p_quantity integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; selected_variant saas.product_variants%ROWTYPE; available_quantity bigint;
BEGIN
  IF p_quantity BETWEEN 1 AND 99 THEN
    selected_store:=saas.storefront_public_store(p_hostname,p_now);
    IF selected_store IS NOT NULL THEN
      SELECT variant.* INTO selected_variant FROM saas.product_variants variant
      WHERE variant.store_id=selected_store AND variant.id=p_variant_id AND variant.product_id=p_product_id
      FOR UPDATE;
      IF FOUND AND selected_variant.stock_tracking THEN
        available_quantity:=saas.storefront_available_stock(selected_store,p_variant_id,p_now,NULL);
        IF available_quantity IS NOT NULL AND available_quantity<p_quantity THEN
          RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN;
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM saas.public_buy_now_create_without_available_stock_v090(
    p_hostname,p_now,p_intent_id,p_key_id,p_digest,p_expires_at,p_product_id,p_variant_id,p_quantity
  );
END
$f$;

CREATE OR REPLACE FUNCTION saas.storefront_payment_methods_projection(p_store_id uuid)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH offline AS (
    SELECT method.position,method.id,pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'kind',method.kind,'label',method.label,'instructions',method.config->>'instructions',
      'bankName',CASE WHEN method.kind='bank_transfer' THEN method.config->>'bankName' END,
      'accountHolder',CASE WHEN method.kind='bank_transfer' THEN method.config->>'accountHolder' END,
      'iban',CASE WHEN method.kind='bank_transfer' THEN method.config->>'iban' END
    )) projection
    FROM saas.payment_methods method
    WHERE method.store_id=p_store_id AND method.kind IN('bank_transfer','cash_on_delivery')
      AND method.state='active' AND saas.built_in_payment_method_config_valid(method.kind,method.config)
  ), hosted AS (
    SELECT method.position,method.id,pg_catalog.jsonb_build_object(
      'kind','hosted_card','id',method.id,'label',method.label,
      'instructions','Güvenli sağlayıcı ekranında tamamlanır.',
      'providerCode',method.provider_code,
      'presentation',CASE method.provider_code WHEN 'paytr_iframe' THEN 'iframe' ELSE 'redirect' END,
      'requiredCustomerFields',CASE method.provider_code WHEN 'iyzico_iframe'
        THEN pg_catalog.jsonb_build_array('identity_number') ELSE '[]'::jsonb END
    ) projection
    FROM saas.payment_methods method
    JOIN saas.merchant_provider_profiles profile
      ON profile.store_id=method.store_id AND profile.id=method.profile_id
        AND profile.provider_code=method.provider_code AND profile.capability='payment_processing'
    WHERE method.store_id=p_store_id AND method.kind='provider' AND method.state='active'
      AND method.provider_code IN('paytr_iframe','iyzico_iframe')
      AND method.config->>'environment' IS NOT DISTINCT FROM profile.execution_environment
      AND profile.status='active' AND profile.validation_environment=profile.execution_environment
      AND profile.validation_adapter_version=profile.execution_adapter_version
      AND profile.credential_version>0
      AND saas.merchant_provider_execution_authority_matches(
        profile.provider_code,profile.capability,profile.execution_environment,
        profile.execution_adapter_version,profile.execution_evidence_digest
      )
    ORDER BY method.position,method.id LIMIT 1
  ), methods AS (
    SELECT * FROM offline UNION ALL SELECT * FROM hosted
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(projection ORDER BY position,id),'[]'::jsonb) FROM methods
$f$;

CREATE OR REPLACE FUNCTION saas.storefront_cart_projection(p_store_id uuid,p_cart_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH lines AS (
    SELECT item.position,item.quantity,product.id product_id,variant.id variant_id,
      product.slug,product.title,variant.title variant_title,
      item.unit_price_cents price_cents,primary_media.projection media,
      product.status='active' AND variant.status='active'
        AND resolved.outcome='found' AND resolved.price_cents=item.unit_price_cents
        AND (NOT variant.stock_tracking OR saas.storefront_available_stock(item.store_id,item.variant_id,p_now,NULL)>=item.quantity) available
    FROM saas.storefront_cart_items item
    JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id
    JOIN saas.product_variants variant ON variant.store_id=item.store_id AND variant.id=item.variant_id AND variant.product_id=item.product_id
    LEFT JOIN LATERAL saas.resolve_effective_variant_price(item.store_id,item.variant_id,'storefront',p_now,NULL) resolved ON true
    LEFT JOIN LATERAL (
      SELECT saas.public_media_projection(media.id) projection FROM saas.product_media media
      WHERE media.store_id=item.store_id AND media.product_id=item.product_id AND media.status='active'
      ORDER BY media.sort_order,media.id LIMIT 1
    ) primary_media ON true
    WHERE item.store_id=p_store_id AND item.cart_id=p_cart_id
  ), aggregate AS (
    SELECT COALESCE(pg_catalog.sum(quantity),0)::bigint item_count,
      COALESCE(pg_catalog.sum(price_cents*quantity),0)::bigint subtotal,
      COALESCE(pg_catalog.bool_and(available),false) all_available,
      COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'productId',product_id,'variantId',variant_id,'slug',slug,'title',title,
        'variantTitle',variant_title,'media',media,'quantity',quantity,'unitPriceCents',price_cents,
        'lineTotalCents',price_cents*quantity,'available',available
      )) ORDER BY position,variant_id),'[]'::jsonb) items
    FROM lines
  ), shipping AS (
    SELECT saas.storefront_shipping_projection(p_store_id) projection
  ), payments AS (
    SELECT saas.storefront_payment_methods_projection(p_store_id) methods
  )
  SELECT pg_catalog.jsonb_build_object(
    'version',cart.version,'currency','TRY','itemCount',aggregate.item_count,
    'subtotalCents',aggregate.subtotal,'shippingCents',CASE WHEN aggregate.item_count=0 THEN 0 ELSE COALESCE((shipping.projection->>'shippingCents')::bigint,0) END,
    'totalCents',aggregate.subtotal+CASE WHEN aggregate.item_count=0 THEN 0 ELSE COALESCE((shipping.projection->>'shippingCents')::bigint,0) END,
    'checkoutReady',aggregate.item_count>0 AND aggregate.all_available AND shipping.projection IS NOT NULL AND pg_catalog.jsonb_array_length(payments.methods)>0,
    'checkoutBlocker',CASE
      WHEN aggregate.item_count=0 THEN 'empty_cart'
      WHEN NOT aggregate.all_available THEN 'stock_unavailable'
      WHEN shipping.projection IS NULL THEN 'shipping_unavailable'
      WHEN pg_catalog.jsonb_array_length(payments.methods)=0 THEN 'payment_unavailable'
      ELSE NULL
    END,
    'items',aggregate.items
  )
  FROM saas.storefront_carts cart CROSS JOIN aggregate CROSS JOIN shipping CROSS JOIN payments
  WHERE cart.store_id=p_store_id AND cart.id=p_cart_id
$f$;

CREATE OR REPLACE FUNCTION saas.storefront_intent_projection(p_store_id uuid,p_intent_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  WITH selected AS (
    SELECT intent.quantity,product.id product_id,variant.id variant_id,product.slug,
      product.title,variant.title variant_title,intent.unit_price_cents price_cents,primary_media.projection media,
      product.status='active' AND variant.status='active'
        AND resolved.outcome='found' AND resolved.price_cents=intent.unit_price_cents
        AND (NOT variant.stock_tracking OR saas.storefront_available_stock(intent.store_id,intent.variant_id,p_now,NULL)>=intent.quantity) available
    FROM saas.storefront_checkout_intents intent
    JOIN saas.products product ON product.store_id=intent.store_id AND product.id=intent.product_id
    JOIN saas.product_variants variant ON variant.store_id=intent.store_id AND variant.id=intent.variant_id AND variant.product_id=intent.product_id
    LEFT JOIN LATERAL saas.resolve_effective_variant_price(intent.store_id,intent.variant_id,'storefront',p_now,NULL) resolved ON true
    LEFT JOIN LATERAL (
      SELECT saas.public_media_projection(media.id) projection FROM saas.product_media media
      WHERE media.store_id=intent.store_id AND media.product_id=intent.product_id AND media.status='active'
      ORDER BY media.sort_order,media.id LIMIT 1
    ) primary_media ON true
    WHERE intent.store_id=p_store_id AND intent.id=p_intent_id
  ), shipping AS (
    SELECT saas.storefront_shipping_projection(p_store_id) projection
  ), payments AS (
    SELECT saas.storefront_payment_methods_projection(p_store_id) methods
  )
  SELECT pg_catalog.jsonb_build_object(
    'version',1,'currency','TRY','itemCount',selected.quantity,
    'subtotalCents',selected.price_cents*selected.quantity,'shippingCents',COALESCE((shipping.projection->>'shippingCents')::bigint,0),
    'totalCents',selected.price_cents*selected.quantity+COALESCE((shipping.projection->>'shippingCents')::bigint,0),
    'checkoutReady',selected.available AND shipping.projection IS NOT NULL AND pg_catalog.jsonb_array_length(payments.methods)>0,
    'checkoutBlocker',CASE
      WHEN NOT selected.available THEN 'stock_unavailable'
      WHEN shipping.projection IS NULL THEN 'shipping_unavailable'
      WHEN pg_catalog.jsonb_array_length(payments.methods)=0 THEN 'payment_unavailable'
      ELSE NULL
    END,
    'items',pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'productId',selected.product_id,'variantId',selected.variant_id,'slug',selected.slug,
      'title',selected.title,'variantTitle',selected.variant_title,'media',selected.media,'quantity',selected.quantity,
      'unitPriceCents',selected.price_cents,'lineTotalCents',selected.price_cents*selected.quantity,
      'available',selected.available
    )))
  ) FROM selected CROSS JOIN shipping CROSS JOIN payments
$f$;

CREATE OR REPLACE FUNCTION saas.public_checkout_quote(
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
    'cart',cart_payload,'paymentMethods',payments,'estimatedDays',shipping->'estimatedDays'
  ));
END
$f$;

ALTER FUNCTION saas.public_checkout_complete(
  text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,
  uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz
) RENAME TO public_checkout_complete_without_available_stock_v090;
REVOKE ALL ON FUNCTION saas.public_checkout_complete_without_available_stock_v090(
  text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,
  uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz
) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.public_checkout_complete(
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

DO $f$
BEGIN
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid='saas.checkout_inventory_reservations'::pg_catalog.regclass
      AND conname='checkout_inventory_reservations_one_attempt_owner_check'
  ) THEN RAISE EXCEPTION 'STOREFRONT_HOSTED_CHECKOUT_ATTEMPT_OWNER_CONSTRAINT_MISSING'; END IF;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.public_cart_mutate(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer),
  saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer),
  saas.storefront_payment_methods_projection(uuid),
  saas.storefront_cart_projection(uuid,uuid,timestamptz),
  saas.storefront_intent_projection(uuid,uuid,timestamptz),
  saas.public_checkout_quote(text,timestamptz,text,jsonb),
  saas.public_checkout_complete(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.public_cart_mutate(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer),
  saas.public_buy_now_create(text,timestamptz,uuid,text,text,timestamptz,uuid,uuid,integer),
  saas.public_checkout_quote(text,timestamptz,text,jsonb),
  saas.public_checkout_complete(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz)
TO celebix_saas_host_resolver;

COMMIT;
