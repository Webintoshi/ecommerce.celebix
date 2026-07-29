-- Phase 3Q: atomic quick-order hosted-payment to order/inventory bridge.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.checkout_inventory_reservations
  ALTER COLUMN attempt_id DROP NOT NULL,
  ADD COLUMN payment_attempt_id uuid,
  ADD CONSTRAINT checkout_inventory_reservations_one_attempt_owner_check CHECK(
    (attempt_id IS NOT NULL AND payment_attempt_id IS NULL)
    OR (attempt_id IS NULL AND payment_attempt_id IS NOT NULL)
  ),
  ADD CONSTRAINT checkout_inventory_reservations_payment_attempt_store_fk
    FOREIGN KEY (store_id,payment_attempt_id)
    REFERENCES saas.payment_attempts(store_id,id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX checkout_inventory_reservations_payment_attempt_variant_key
  ON saas.checkout_inventory_reservations(payment_attempt_id,variant_id)
  WHERE payment_attempt_id IS NOT NULL;

CREATE TABLE saas.quick_order_hosted_payment_bridges(
  attempt_id uuid NOT NULL,
  store_id uuid NOT NULL,
  quick_order_link_id uuid NOT NULL,
  redemption_session_id uuid NOT NULL,
  authority_digest char(64) NOT NULL,
  order_id uuid NOT NULL,
  order_item_ids uuid[] NOT NULL,
  order_event_id uuid NOT NULL,
  order_number text NOT NULL,
  status text NOT NULL,
  hold_expires_at timestamptz NOT NULL,
  settled_at timestamptz,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(attempt_id),
  UNIQUE(store_id,attempt_id),
  FOREIGN KEY(store_id,attempt_id) REFERENCES saas.payment_attempts(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,quick_order_link_id) REFERENCES saas.quick_order_links(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,redemption_session_id,quick_order_link_id)
    REFERENCES saas.quick_order_redemption_sessions(store_id,id,quick_order_link_id) ON DELETE RESTRICT,
  CHECK(authority_digest~'^[a-f0-9]{64}$'),
  CHECK(order_number~'^QO-[A-F0-9]{20}$'),
  CHECK(pg_catalog.array_ndims(order_item_ids)=1 AND pg_catalog.array_lower(order_item_ids,1)=1
    AND pg_catalog.cardinality(order_item_ids) BETWEEN 1 AND 100
    AND pg_catalog.array_position(order_item_ids,NULL) IS NULL),
  CHECK(status IN('active','captured','failed','cancelled','expired')),
  CHECK(pg_catalog.isfinite(hold_expires_at) AND pg_catalog.isfinite(created_at)
    AND hold_expires_at=created_at+interval '5 minutes'
    AND (settled_at IS NULL OR pg_catalog.isfinite(settled_at))
    AND ((status='active' AND settled_at IS NULL) OR (status<>'active' AND settled_at IS NOT NULL)))
);
CREATE UNIQUE INDEX quick_order_hosted_payment_bridges_one_active_link_idx
  ON saas.quick_order_hosted_payment_bridges(store_id,quick_order_link_id)
  WHERE status='active';

ALTER TABLE saas.quick_order_hosted_payment_bridges ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.quick_order_hosted_payment_bridges FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE saas.quick_order_hosted_payment_bridges
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.quick_order_hosted_payment_uuid(
  p_kind text,p_attempt_id uuid,p_ordinal integer DEFAULT 0
)
RETURNS uuid LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  WITH digest AS (
    SELECT pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      'saas.quick-order-hosted-payment.v1:'||p_kind||':'||p_attempt_id::text||':'||p_ordinal::text,'UTF8'
    )),'hex') value
  )
  SELECT (pg_catalog.substr(value,1,8)||'-'||pg_catalog.substr(value,9,4)||'-8'||
    pg_catalog.substr(value,14,3)||'-8'||pg_catalog.substr(value,18,3)||'-'||
    pg_catalog.substr(value,21,12))::uuid FROM digest
$f$;

CREATE FUNCTION saas.quick_order_hosted_payment_projection(
  p_hostname text,p_redemption_digest text,p_now timestamptz
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected record; items jsonb; facts jsonb; authority_digest text;
  shipping_text text; total_item_count bigint; eligible_item_count bigint; basket_subtotal numeric;
BEGIN
  SELECT store.id AS store_id,store.currency AS store_currency,store.status AS store_status,
    domain.hostname,domain.verified_at,session.id AS session_id,session.version AS session_version,
    session.expires_at AS session_expires_at,session.revoked_at,session.consumed_at,
    link.*,hosted.payment_method_id,hosted.profile_id,hosted.provider_code,
    hosted.execution_environment,hosted.execution_adapter_version,hosted.execution_evidence_digest,
    hosted.identity_authority,hosted.identity_key_id,hosted.sealed_identity,
    method.state AS method_state,method.version AS method_version,method.config AS method_config,
    profile.status AS profile_status,profile.version AS profile_version,
    profile.credential_version,profile.execution_environment AS current_environment,
    profile.execution_adapter_version AS current_adapter_version,
    profile.execution_evidence_digest AS current_evidence_digest
  INTO selected
  FROM saas.store_domains domain
  JOIN saas.stores store ON store.id=domain.store_id
  JOIN saas.quick_order_redemption_sessions session
    ON session.store_id=store.id AND session.cookie_digest=p_redemption_digest
  JOIN saas.quick_order_links link
    ON link.store_id=session.store_id AND link.id=session.quick_order_link_id
  JOIN saas.quick_order_link_hosted_authorities hosted
    ON hosted.store_id=link.store_id AND hosted.link_id=link.hosted_authority_id
  JOIN saas.payment_methods method
    ON method.store_id=hosted.store_id AND method.id=hosted.payment_method_id
  JOIN saas.merchant_provider_profiles profile
    ON profile.store_id=hosted.store_id AND profile.id=hosted.profile_id
      AND profile.provider_code=hosted.provider_code
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary
    AND domain.verified_at<=p_now;
  IF NOT FOUND OR selected.store_status<>'active' OR selected.store_currency<>selected.currency
    OR selected.revoked_at IS NOT NULL OR selected.consumed_at IS NOT NULL
    OR selected.session_expires_at<=p_now OR selected.status NOT IN('active','opened')
    OR selected.expires_at<=p_now OR selected.hosted_authority_id IS DISTINCT FROM selected.id
    OR selected.provider_code<>'iyzico_iframe' OR selected.method_state<>'active'
    OR selected.method_config->>'environment' IS DISTINCT FROM selected.execution_environment
    OR selected.profile_status<>'active'
    OR selected.current_environment IS DISTINCT FROM selected.execution_environment
    OR selected.current_adapter_version IS DISTINCT FROM selected.execution_adapter_version
    OR selected.current_evidence_digest IS DISTINCT FROM selected.execution_evidence_digest
    OR selected.identity_authority IS NULL OR selected.identity_authority!~'^[a-f0-9]{64}$'
    OR selected.identity_key_id IS NULL
    OR saas.quick_link_sealed_envelope_is_valid(selected.sealed_identity,selected.identity_key_id) IS DISTINCT FROM TRUE
    OR saas.merchant_provider_execution_authority_matches(
      selected.provider_code,'payment_processing',selected.execution_environment,
      selected.execution_adapter_version,selected.execution_evidence_digest
    ) IS DISTINCT FROM TRUE
  THEN RETURN NULL; END IF;
  SELECT pg_catalog.count(*) INTO total_item_count
  FROM saas.quick_order_link_items item
  WHERE item.store_id=selected.store_id AND item.quick_order_link_id=selected.id;
  SELECT pg_catalog.count(*),COALESCE(pg_catalog.sum(item.line_total_cents::numeric),0),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'reference',item.id::text,'name',item.product_name,'quantity',item.quantity,
    'unitAmountMinor',item.unit_price_cents,'itemType',item.item_type,
    'productId',item.product_id,'variantId',item.variant_id,
    'productVersion',product.version,'variantVersion',variant.version,
    'stockTracked',variant.stock_tracking,'stockQuantity',variant.stock_quantity
  ) ORDER BY item.position,item.id)
  INTO eligible_item_count,basket_subtotal,items
  FROM saas.quick_order_link_items item
  JOIN saas.products product ON product.store_id=item.store_id AND product.id=item.product_id
  JOIN saas.product_variants variant
    ON variant.store_id=item.store_id AND variant.product_id=item.product_id AND variant.id=item.variant_id
  WHERE item.store_id=selected.store_id AND item.quick_order_link_id=selected.id
    AND product.status='active' AND product.archived_at IS NULL
    AND variant.status='active' AND variant.archived_at IS NULL
    AND item.item_type IN('PHYSICAL','VIRTUAL') AND item.unit_price_cents BETWEEN 1 AND 8000000000
    AND item.quantity BETWEEN 1 AND 9999
    AND item.line_total_cents::numeric=item.unit_price_cents::numeric*item.quantity::numeric;
  IF total_item_count NOT BETWEEN 1 AND 100 OR eligible_item_count<>total_item_count
    OR basket_subtotal<>selected.subtotal_cents::numeric
    OR selected.total_cents::numeric<>
      selected.subtotal_cents::numeric+selected.shipping_cents::numeric-selected.discount_cents::numeric
    OR selected.shipping_cents NOT BETWEEN 0 AND 500000000000000
    OR selected.discount_cents NOT BETWEEN 0 AND 500000000000000
    OR selected.total_cents NOT BETWEEN 1 AND 9007199254740991
    OR selected.currency!~'^[A-Z]{3}$' THEN RETURN NULL; END IF;
  shipping_text:=pg_catalog.concat_ws(' ',selected.shipping_address->>'recipientName',
    selected.shipping_address->>'phone',selected.shipping_address->>'line1',
    selected.shipping_address->>'line2',selected.shipping_address->>'district',
    selected.shipping_address->>'city',selected.shipping_address->>'region',
    selected.shipping_address->>'postalCode',selected.shipping_address->>'country');
  IF selected.customer_name IS NULL OR selected.customer_email IS NULL OR selected.customer_phone IS NULL
    OR shipping_text IS NULL OR pg_catalog.char_length(shipping_text) NOT BETWEEN 1 AND 1024
  THEN RETURN NULL; END IF;
  facts:=pg_catalog.jsonb_build_object(
    'hostname',p_hostname,'storeId',selected.store_id,'linkId',selected.id,
    'linkVersion',selected.version,'linkUpdatedAt',selected.updated_at,
    'redemptionSessionId',selected.session_id,'redemptionVersion',selected.session_version,
    'paymentMethodId',selected.payment_method_id,'methodVersion',selected.method_version,
    'profileId',selected.profile_id,'profileVersion',selected.profile_version,
    'providerCode',selected.provider_code,'environment',selected.execution_environment,
    'executionAdapterVersion',selected.execution_adapter_version,
    'executionEvidenceDigest',selected.execution_evidence_digest,
    'credentialVersion',selected.credential_version,'identityAuthority',selected.identity_authority,
    'amountMinor',selected.total_cents,'currency',selected.currency,'items',items
  );
  authority_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(facts::text,'UTF8')),'hex');
  RETURN pg_catalog.jsonb_build_object(
    'authorityDigest',authority_digest,'storeId',selected.store_id,'linkId',selected.id,
    'redemptionSessionId',selected.session_id,'paymentMethodId',selected.payment_method_id,
    'profileId',selected.profile_id,'providerCode',selected.provider_code,
    'environment',selected.execution_environment,'executionAdapterVersion',selected.execution_adapter_version,
    'executionEvidenceDigest',selected.execution_evidence_digest,'credentialVersion',selected.credential_version,
    'orderReference','qo:'||selected.id::text,'amountMinor',selected.total_cents,'currency',selected.currency,
    'identityAuthority',selected.identity_authority,'identityKeyId',selected.identity_key_id,
    'sealedIdentity',selected.sealed_identity,'customerName',selected.customer_name,
    'customerEmail',selected.customer_email,'customerPhone',selected.customer_phone,
    'customerAddress',shipping_text,'city',selected.shipping_address->>'city',
    'country',selected.shipping_address->>'country','postalCode',selected.shipping_address->>'postalCode',
    'basket',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'reference',entry->>'reference','name',entry->>'name','quantity',(entry->>'quantity')::bigint,
      'unitAmountMinor',(entry->>'unitAmountMinor')::bigint,'itemType',entry->>'itemType'
    )) FROM pg_catalog.jsonb_array_elements(items) entry)
  );
END
$f$;

CREATE FUNCTION saas.quick_order_hosted_payment_authority(
  p_hostname text,p_redemption_digest text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE result jsonb;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
    OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
    OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.store_domains domain JOIN saas.quick_order_redemption_sessions session
      ON session.store_id=domain.store_id AND session.cookie_digest=p_redemption_digest
    JOIN saas.quick_order_links link ON link.store_id=session.store_id AND link.id=session.quick_order_link_id
    WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary
      AND domain.verified_at<=p_now AND link.provider_config_id IS NOT NULL
  ) THEN RETURN QUERY SELECT 'legacy',NULL::jsonb; RETURN; END IF;
  result:=saas.quick_order_hosted_payment_projection(p_hostname,p_redemption_digest,p_now);
  IF result IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',result;
END
$f$;

CREATE FUNCTION saas.quick_order_hosted_payment_begin(
  p_hostname text,p_redemption_digest text,p_operation_id uuid,p_fingerprint text,
  p_callback_binding_digest text,p_expected_authority_digest text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority jsonb; v_link_id uuid; v_store_id uuid; v_session_id uuid; item_record record;
  held_quantity numeric; begin_outcome text; begin_result jsonb; order_ids uuid[]:=ARRAY[]::uuid[];
  item_index integer:=0; order_digest text;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
    OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
    OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR p_callback_binding_digest IS NULL OR p_callback_binding_digest!~'^[a-f0-9]{64}$'
    OR p_expected_authority_digest IS NULL OR p_expected_authority_digest!~'^[a-f0-9]{64}$'
    OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT session.store_id,session.quick_order_link_id,session.id
  INTO v_store_id,v_link_id,v_session_id
  FROM saas.store_domains domain
  JOIN saas.quick_order_redemption_sessions session
    ON session.store_id=domain.store_id AND session.cookie_digest=p_redemption_digest
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary
    AND domain.verified_at<=p_now;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  PERFORM link.id FROM saas.quick_order_links link
    WHERE link.store_id=v_store_id AND link.id=v_link_id FOR UPDATE OF link;
  PERFORM session.id FROM saas.quick_order_redemption_sessions session
    WHERE session.store_id=v_store_id AND session.id=v_session_id FOR UPDATE OF session;
  PERFORM product.id FROM saas.products product WHERE product.store_id=v_store_id AND EXISTS(
    SELECT 1 FROM saas.quick_order_link_items item WHERE item.store_id=v_store_id
      AND item.quick_order_link_id=v_link_id AND item.product_id=product.id
  ) ORDER BY product.id FOR KEY SHARE OF product;
  PERFORM variant.id FROM saas.product_variants variant WHERE variant.store_id=v_store_id AND EXISTS(
    SELECT 1 FROM saas.quick_order_link_items item WHERE item.store_id=v_store_id
      AND item.quick_order_link_id=v_link_id AND item.variant_id=variant.id
  ) ORDER BY variant.id FOR UPDATE OF variant;
  authority:=saas.quick_order_hosted_payment_projection(p_hostname,p_redemption_digest,p_now);
  IF authority IS NULL OR saas.quick_checkout_digest_matches(
    authority->>'authorityDigest',p_expected_authority_digest
  ) IS DISTINCT FROM TRUE THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.checkout_payment_attempts attempt
    WHERE attempt.store_id=v_store_id AND attempt.quick_order_link_id=v_link_id
      AND attempt.status IN('reserved','provider_ready','initiation_unknown'))
    OR EXISTS(SELECT 1 FROM saas.quick_order_hosted_payment_bridges bridge
      WHERE bridge.store_id=v_store_id AND bridge.quick_order_link_id=v_link_id
        AND bridge.status='active' AND bridge.attempt_id<>p_operation_id)
  THEN RETURN QUERY SELECT 'attempt_in_progress',NULL::jsonb; RETURN; END IF;
  FOR item_record IN
    SELECT item.product_id,item.variant_id,pg_catalog.sum(item.quantity)::bigint quantity,
      variant.stock_tracking,variant.stock_quantity
    FROM saas.quick_order_link_items item JOIN saas.product_variants variant
      ON variant.store_id=item.store_id AND variant.product_id=item.product_id AND variant.id=item.variant_id
    WHERE item.store_id=v_store_id AND item.quick_order_link_id=v_link_id
    GROUP BY item.product_id,item.variant_id,variant.stock_tracking,variant.stock_quantity
    ORDER BY item.product_id,item.variant_id
  LOOP
    SELECT COALESCE(pg_catalog.sum(reservation.quantity),0) INTO held_quantity
    FROM saas.checkout_inventory_reservations reservation
    WHERE reservation.store_id=v_store_id AND reservation.variant_id=item_record.variant_id
      AND reservation.status='held' AND reservation.stock_tracked;
    IF item_record.stock_tracking AND item_record.stock_quantity::numeric-held_quantity<item_record.quantity
    THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN; END IF;
  END LOOP;
  BEGIN
    SELECT begun.outcome,begun.result_payload INTO begin_outcome,begin_result
    FROM saas.payment_attempt_begin(
      v_store_id,p_now,p_operation_id,p_fingerprint,(authority->>'paymentMethodId')::uuid,
      authority->>'orderReference',(authority->>'amountMinor')::bigint,authority->>'currency',
      p_callback_binding_digest
    ) begun;
    IF begin_outcome NOT IN('created','operation_replayed')
    THEN RETURN QUERY SELECT begin_outcome,begin_result; RETURN; END IF;
    IF begin_outcome='operation_replayed' THEN
      IF NOT EXISTS(SELECT 1 FROM saas.quick_order_hosted_payment_bridges bridge
        WHERE bridge.attempt_id=p_operation_id AND bridge.store_id=v_store_id
          AND bridge.quick_order_link_id=v_link_id AND bridge.redemption_session_id=v_session_id
          AND bridge.authority_digest=p_expected_authority_digest)
      THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
      RETURN QUERY SELECT begin_outcome,begin_result; RETURN;
    END IF;
    FOR item_record IN SELECT item.id FROM saas.quick_order_link_items item
      WHERE item.store_id=v_store_id AND item.quick_order_link_id=v_link_id ORDER BY item.position,item.id
    LOOP
      item_index:=item_index+1;
      order_ids:=pg_catalog.array_append(order_ids,
        saas.quick_order_hosted_payment_uuid('order-item',p_operation_id,item_index));
    END LOOP;
    order_digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
      'saas.quick-order-hosted-payment.order.v1:'||p_operation_id::text,'UTF8')),'hex');
    INSERT INTO saas.quick_order_hosted_payment_bridges(
      attempt_id,store_id,quick_order_link_id,redemption_session_id,authority_digest,
      order_id,order_item_ids,order_event_id,order_number,status,hold_expires_at,created_at
    ) VALUES(
      p_operation_id,v_store_id,v_link_id,v_session_id,p_expected_authority_digest,
      saas.quick_order_hosted_payment_uuid('order',p_operation_id),order_ids,
      saas.quick_order_hosted_payment_uuid('order-event',p_operation_id),
      'QO-'||pg_catalog.upper(pg_catalog.substr(order_digest,1,20)),'active',p_now+interval '5 minutes',p_now
    );
    FOR item_record IN
      SELECT item.product_id,item.variant_id,pg_catalog.sum(item.quantity)::bigint quantity,variant.stock_tracking
      FROM saas.quick_order_link_items item JOIN saas.product_variants variant
        ON variant.store_id=item.store_id AND variant.product_id=item.product_id AND variant.id=item.variant_id
      WHERE item.store_id=v_store_id AND item.quick_order_link_id=v_link_id
      GROUP BY item.product_id,item.variant_id,variant.stock_tracking ORDER BY item.product_id,item.variant_id
    LOOP
      INSERT INTO saas.checkout_inventory_reservations(
        id,store_id,attempt_id,payment_attempt_id,quick_order_link_id,product_id,variant_id,
        quantity,stock_tracked,status,held_at,version,updated_at
      ) VALUES(
        saas.quick_order_hosted_payment_uuid('reservation:'||item_record.variant_id::text,p_operation_id),
        v_store_id,NULL,p_operation_id,v_link_id,item_record.product_id,item_record.variant_id,
        item_record.quantity,item_record.stock_tracking,'held',p_now,1,p_now
      );
    END LOOP;
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range
    OR datetime_field_overflow OR raise_exception THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT begin_outcome,begin_result;
END
$f$;

CREATE OR REPLACE FUNCTION saas.guard_checkout_reservation_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CHECKOUT_RESERVATION_DELETE_DENIED'; END IF;
  IF OLD.id IS DISTINCT FROM NEW.id OR OLD.store_id IS DISTINCT FROM NEW.store_id
    OR OLD.stock_tracked IS DISTINCT FROM NEW.stock_tracked OR OLD.quantity IS DISTINCT FROM NEW.quantity
    OR OLD.quick_order_link_id IS DISTINCT FROM NEW.quick_order_link_id
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

CREATE FUNCTION saas.guard_checkout_generic_parallel_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.quick_order_hosted_payment_bridges bridge
    WHERE bridge.store_id=NEW.store_id AND bridge.quick_order_link_id=NEW.quick_order_link_id
      AND bridge.status='active')
  THEN RAISE EXCEPTION 'QUICK_ORDER_GENERIC_PAYMENT_ATTEMPT_ACTIVE'; END IF;
  RETURN NEW;
END
$f$;
CREATE TRIGGER checkout_payment_attempts_no_generic_parallel
BEFORE INSERT ON saas.checkout_payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.guard_checkout_generic_parallel_attempt();

CREATE FUNCTION saas.guard_quick_order_hosted_payment_bridge()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_PAYMENT_BRIDGE_IMMUTABLE'; END IF;
  IF (pg_catalog.to_jsonb(NEW)-'status'-'settled_at') IS DISTINCT FROM
     (pg_catalog.to_jsonb(OLD)-'status'-'settled_at')
    OR OLD.status<>'active' OR NEW.status NOT IN('captured','failed','cancelled','expired')
    OR NEW.settled_at IS NULL
  THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_PAYMENT_BRIDGE_IMMUTABLE'; END IF;
  RETURN NEW;
END
$f$;
CREATE TRIGGER quick_order_hosted_payment_bridges_immutable
BEFORE UPDATE OR DELETE ON saas.quick_order_hosted_payment_bridges
FOR EACH ROW EXECUTE FUNCTION saas.guard_quick_order_hosted_payment_bridge();

CREATE FUNCTION saas.quick_order_hosted_payment_terminal_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE bridge saas.quick_order_hosted_payment_bridges%ROWTYPE; link saas.quick_order_links%ROWTYPE;
  item_record record; item_index integer:=0; tracked_count bigint; updated_count bigint;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  SELECT * INTO bridge FROM saas.quick_order_hosted_payment_bridges
    WHERE attempt_id=NEW.id FOR UPDATE;
  IF NOT FOUND THEN RETURN NEW; END IF;
  IF NEW.status='captured' THEN
    SELECT * INTO link FROM saas.quick_order_links
      WHERE store_id=bridge.store_id AND id=bridge.quick_order_link_id FOR UPDATE;
    PERFORM product.id FROM saas.products product WHERE product.store_id=bridge.store_id AND EXISTS(
      SELECT 1 FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=bridge.store_id AND reservation.payment_attempt_id=NEW.id
        AND reservation.product_id=product.id
    ) ORDER BY product.id FOR KEY SHARE OF product;
    PERFORM variant.id FROM saas.product_variants variant WHERE variant.store_id=bridge.store_id AND EXISTS(
      SELECT 1 FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=bridge.store_id AND reservation.payment_attempt_id=NEW.id
        AND reservation.variant_id=variant.id
    ) ORDER BY variant.id FOR UPDATE OF variant;
    PERFORM reservation.id FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=bridge.store_id AND reservation.payment_attempt_id=NEW.id
      ORDER BY reservation.variant_id,reservation.id FOR UPDATE;
    IF bridge.status<>'active' OR link.status NOT IN('active','opened')
      OR NOT EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations reservation
        WHERE reservation.store_id=bridge.store_id AND reservation.payment_attempt_id=NEW.id)
      OR EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations reservation
        WHERE reservation.store_id=bridge.store_id AND reservation.payment_attempt_id=NEW.id
          AND reservation.status<>'held')
      OR EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations reservation
        JOIN saas.product_variants variant ON variant.store_id=reservation.store_id AND variant.id=reservation.variant_id
        WHERE reservation.store_id=bridge.store_id AND reservation.payment_attempt_id=NEW.id
          AND reservation.stock_tracked AND variant.stock_quantity<reservation.quantity)
    THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_PAYMENT_SETTLEMENT_CONFLICT'; END IF;
    INSERT INTO saas.orders(
      id,store_id,order_number,source,customer_name,customer_email,customer_phone,currency,
      subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,
      shipping_address,billing_address,quick_order_link_id,version,created_at,updated_at
    ) VALUES(
      bridge.order_id,link.store_id,bridge.order_number,'quick_link',link.customer_name,
      link.customer_email,link.customer_phone,link.currency,link.subtotal_cents,link.shipping_cents,
      link.discount_cents,link.total_cents,'confirmed','completed',link.shipping_address,
      link.billing_address,link.id,1,NEW.updated_at,NEW.updated_at
    );
    FOR item_record IN SELECT * FROM saas.quick_order_link_items item
      WHERE item.store_id=link.store_id AND item.quick_order_link_id=link.id
      ORDER BY item.position,item.id
    LOOP
      item_index:=item_index+1;
      INSERT INTO saas.order_items(
        id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,
        unit_price_cents,quantity,discount_cents,line_total_cents,created_at
      ) VALUES(
        bridge.order_item_ids[item_index],link.store_id,bridge.order_id,item_record.product_id,
        item_record.variant_id,item_record.position,item_record.product_name,item_record.variant_name,
        item_record.sku,item_record.unit_price_cents,item_record.quantity,0,item_record.line_total_cents,NEW.updated_at
      );
    END LOOP;
    INSERT INTO saas.order_events(
      id,store_id,order_id,actor_membership_id,event_type,from_value,to_value,message,payload,created_at
    ) VALUES(
      bridge.order_event_id,link.store_id,bridge.order_id,NULL,'order_created',NULL,'confirmed',
      'Quick order payment confirmed',pg_catalog.jsonb_build_object('source','quick_link'),NEW.updated_at
    );
    UPDATE saas.checkout_inventory_reservations SET status='consumed',consumed_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
      WHERE store_id=bridge.store_id AND payment_attempt_id=NEW.id AND status='held';
    SELECT pg_catalog.count(*) INTO tracked_count FROM saas.checkout_inventory_reservations
      WHERE store_id=bridge.store_id AND payment_attempt_id=NEW.id AND stock_tracked;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','checkout_sale',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id',NEW.id::text,true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time',NEW.updated_at::text,true);
    UPDATE saas.product_variants variant SET stock_quantity=variant.stock_quantity-reservation.quantity,
      version=variant.version+1,updated_at=NEW.updated_at
      FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=bridge.store_id AND reservation.payment_attempt_id=NEW.id
        AND reservation.stock_tracked AND variant.store_id=reservation.store_id
        AND variant.id=reservation.variant_id;
    GET DIAGNOSTICS updated_count=ROW_COUNT;
    PERFORM pg_catalog.set_config('saas.inventory.source_marker','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_id','',true);
    PERFORM pg_catalog.set_config('saas.inventory.source_time','',true);
    IF updated_count<>tracked_count THEN RAISE EXCEPTION 'QUICK_ORDER_HOSTED_PAYMENT_STOCK_CONFLICT'; END IF;
    UPDATE saas.quick_order_links SET status='paid',opened_at=COALESCE(opened_at,NEW.updated_at),
      paid_at=NEW.updated_at,order_id=bridge.order_id,version=version+1,updated_at=NEW.updated_at
      WHERE store_id=bridge.store_id AND id=bridge.quick_order_link_id;
    UPDATE saas.quick_order_hosted_payment_bridges SET status='captured',settled_at=NEW.updated_at
      WHERE attempt_id=NEW.id;
  ELSIF NEW.status IN('failed','cancelled','expired') THEN
    PERFORM 1 FROM saas.quick_order_links
      WHERE store_id=bridge.store_id AND id=bridge.quick_order_link_id FOR UPDATE;
    PERFORM reservation.id FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=bridge.store_id AND reservation.payment_attempt_id=NEW.id
      ORDER BY reservation.variant_id,reservation.id FOR UPDATE;
    UPDATE saas.checkout_inventory_reservations SET status='released',released_at=NEW.updated_at,
      version=version+1,updated_at=NEW.updated_at
      WHERE store_id=bridge.store_id AND payment_attempt_id=NEW.id AND status='held';
    UPDATE saas.quick_order_hosted_payment_bridges SET status=NEW.status,settled_at=NEW.updated_at
      WHERE attempt_id=NEW.id;
  END IF;
  RETURN NEW;
END
$f$;
CREATE TRIGGER payment_attempt_quick_order_terminal
AFTER UPDATE OF status ON saas.payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.quick_order_hosted_payment_terminal_transition();

CREATE OR REPLACE FUNCTION saas.guard_checkout_quick_link_live_attempt()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF (NEW.status IN('cancelled','expired') AND OLD.status IS DISTINCT FROM NEW.status)
    OR NEW.expires_at<OLD.expires_at THEN
    IF EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations reservation
      WHERE reservation.store_id=OLD.store_id AND reservation.quick_order_link_id=OLD.id
        AND reservation.status='held')
    THEN RAISE EXCEPTION 'QUICK_LINK_HAS_LIVE_PAYMENT_ATTEMPT'; END IF;
  END IF;
  RETURN NEW;
END
$f$;

CREATE FUNCTION saas.quick_order_hosted_payment_expire_created(
  p_now timestamptz,p_limit integer
)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE expired_count bigint;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_limit NOT BETWEEN 1 AND 100
  THEN RETURN 0; END IF;
  WITH candidates AS (
    SELECT attempt.id FROM saas.payment_attempts attempt
    JOIN saas.quick_order_hosted_payment_bridges bridge ON bridge.attempt_id=attempt.id
    WHERE bridge.status='active' AND bridge.hold_expires_at<=p_now AND attempt.status='created'
    ORDER BY bridge.hold_expires_at,attempt.id FOR UPDATE OF attempt SKIP LOCKED LIMIT p_limit
  )
  UPDATE saas.payment_attempts attempt SET status='expired',safe_code='initialization_expired',
    version=version+1,updated_at=p_now FROM candidates WHERE attempt.id=candidates.id;
  GET DIAGNOSTICS expired_count=ROW_COUNT;
  RETURN expired_count;
END
$f$;

CREATE FUNCTION saas.quick_order_hosted_payment_reconciliation_candidates(
  p_now timestamptz,p_limit integer
)
RETURNS TABLE(attempt_id uuid,attempt_version bigint,attempt_status text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT attempt.id,attempt.version,attempt.status FROM saas.payment_attempts attempt
  JOIN saas.quick_order_hosted_payment_bridges bridge ON bridge.attempt_id=attempt.id
  WHERE p_now IS NOT NULL AND pg_catalog.isfinite(p_now)
    AND bridge.status='active' AND (
      (attempt.status='provider_outcome_unknown' AND attempt.updated_at<=p_now)
      OR (attempt.status='awaiting_customer' AND bridge.hold_expires_at<=p_now)
    )
    ORDER BY attempt.updated_at,attempt.id
    LIMIT CASE WHEN p_limit BETWEEN 1 AND 100 THEN p_limit ELSE 0 END
$f$;

CREATE FUNCTION saas.quick_order_hosted_payment_bridge_preflight()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT saas.quick_order_hosted_payment_authority_preflight()
    AND to_regclass('saas.quick_order_hosted_payment_bridges') IS NOT NULL
    AND to_regprocedure('saas.quick_order_hosted_payment_authority(text,text,timestamp with time zone)') IS NOT NULL
    AND to_regprocedure('saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamp with time zone)') IS NOT NULL
    AND COALESCE((SELECT relrowsecurity AND relforcerowsecurity FROM pg_catalog.pg_class
      WHERE oid='saas.quick_order_hosted_payment_bridges'::regclass),false)
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_trigger trigger_info
      JOIN (VALUES
        (to_regclass('saas.payment_attempts'),'payment_attempt_quick_order_terminal',
          to_regprocedure('saas.quick_order_hosted_payment_terminal_transition()'),17,false),
        (to_regclass('saas.checkout_payment_attempts'),'checkout_payment_attempts_no_generic_parallel',
          to_regprocedure('saas.guard_checkout_generic_parallel_attempt()'),7,false),
        (to_regclass('saas.quick_order_hosted_payment_bridges'),'quick_order_hosted_payment_bridges_immutable',
          to_regprocedure('saas.guard_quick_order_hosted_payment_bridge()'),27,false),
        (to_regclass('saas.checkout_inventory_reservations'),'checkout_inventory_reservations_transition',
          to_regprocedure('saas.guard_checkout_reservation_transition()'),27,false),
        (to_regclass('saas.quick_order_links'),'quick_order_links_live_attempt',
          to_regprocedure('saas.guard_checkout_quick_link_live_attempt()'),19,false),
        (to_regclass('saas.quick_order_links'),'quick_order_links_live_attempt_commit',
          to_regprocedure('saas.guard_checkout_quick_link_live_attempt()'),17,true)
      ) expected(tgrelid,tgname,tgfoid,tgtype,constraint_trigger)
        ON expected.tgrelid=trigger_info.tgrelid AND expected.tgname=trigger_info.tgname
        AND expected.tgfoid=trigger_info.tgfoid AND expected.tgtype=trigger_info.tgtype
        AND expected.constraint_trigger=(trigger_info.tgconstraint<>0)
      WHERE expected.tgrelid IS NOT NULL AND expected.tgfoid IS NOT NULL
        AND trigger_info.tgenabled='O' AND NOT trigger_info.tgisinternal)=6
    AND (SELECT pg_catalog.count(*) FROM pg_catalog.pg_proc procedure
      JOIN (VALUES
        (to_regprocedure('saas.quick_order_hosted_payment_terminal_transition()'),true),
        (to_regprocedure('saas.guard_checkout_generic_parallel_attempt()'),false),
        (to_regprocedure('saas.guard_quick_order_hosted_payment_bridge()'),false),
        (to_regprocedure('saas.guard_checkout_reservation_transition()'),false),
        (to_regprocedure('saas.guard_checkout_quick_link_live_attempt()'),true)
      ) expected(oid,security_definer) ON expected.oid=procedure.oid
      WHERE expected.oid IS NOT NULL
        AND procedure.proowner='celebix_saas_owner'::pg_catalog.regrole
        AND procedure.prosecdef=expected.security_definer AND procedure.provolatile='v'
        AND procedure.proconfig IS NOT DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[])=5
$f$;

REVOKE ALL ON FUNCTION
  saas.quick_order_hosted_payment_uuid(text,uuid,integer),
  saas.quick_order_hosted_payment_projection(text,text,timestamptz),
  saas.quick_order_hosted_payment_authority(text,text,timestamptz),
  saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamptz),
  saas.guard_checkout_generic_parallel_attempt(),
  saas.guard_quick_order_hosted_payment_bridge(),
  saas.quick_order_hosted_payment_terminal_transition(),
  saas.quick_order_hosted_payment_expire_created(timestamptz,integer),
  saas.quick_order_hosted_payment_reconciliation_candidates(timestamptz,integer),
  saas.quick_order_hosted_payment_bridge_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.quick_order_hosted_payment_authority(text,text,timestamptz),
  saas.quick_order_hosted_payment_begin(text,text,uuid,text,text,text,timestamptz),
  saas.quick_order_hosted_payment_expire_created(timestamptz,integer),
  saas.quick_order_hosted_payment_reconciliation_candidates(timestamptz,integer),
  saas.quick_order_hosted_payment_bridge_preflight()
TO celebix_saas_workflow;

COMMIT;
