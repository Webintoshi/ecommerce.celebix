-- Phase 3P: durable generic hosted-payment authority for quick-order links.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.payment_attempts
  ADD COLUMN execution_adapter_version integer,
  ADD COLUMN execution_evidence_digest text,
  ADD CONSTRAINT payment_attempts_execution_authority_check CHECK(
    (execution_adapter_version IS NULL AND execution_evidence_digest IS NULL)
    OR (
      execution_adapter_version>0
      AND execution_evidence_digest~'^sha256:[a-f0-9]{64}$'
    )
  );

CREATE FUNCTION saas.payment_attempt_bind_execution_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
DECLARE selected_authority record;
BEGIN
  IF NEW.execution_adapter_version IS NOT NULL
    OR NEW.execution_evidence_digest IS NOT NULL
  THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_EXECUTION_AUTHORITY_INVALID'; END IF;
  SELECT profile.execution_adapter_version,profile.execution_evidence_digest
  INTO selected_authority
  FROM saas.merchant_provider_profiles AS profile
  JOIN saas.merchant_provider_definitions AS definition
    ON definition.provider_code=profile.provider_code
    AND definition.capability=profile.capability
    AND definition.enabled
  WHERE profile.store_id=NEW.store_id
    AND profile.id=NEW.profile_id
    AND profile.provider_code=NEW.provider_code
    AND profile.capability='payment_processing'
    AND profile.status='active'
    AND profile.execution_environment=NEW.environment
    AND profile.execution_adapter_version IS NOT NULL
    AND profile.execution_evidence_digest IS NOT NULL
    AND saas.merchant_provider_execution_authority_matches(
      profile.provider_code,profile.capability,profile.execution_environment,
      profile.execution_adapter_version,profile.execution_evidence_digest
    )
  FOR SHARE OF profile;
  IF NOT FOUND THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_EXECUTION_AUTHORITY_INVALID'; END IF;
  NEW.execution_adapter_version:=selected_authority.execution_adapter_version;
  NEW.execution_evidence_digest:=selected_authority.execution_evidence_digest;
  RETURN NEW;
END
$f$;

CREATE TRIGGER payment_attempt_bind_execution_authority
BEFORE INSERT ON saas.payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.payment_attempt_bind_execution_authority();

CREATE FUNCTION saas.guard_payment_attempt_execution_authority_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $f$
BEGIN
  IF NEW.execution_adapter_version IS DISTINCT FROM OLD.execution_adapter_version
    OR NEW.execution_evidence_digest IS DISTINCT FROM OLD.execution_evidence_digest
  THEN RAISE EXCEPTION 'PAYMENT_ATTEMPT_EXECUTION_AUTHORITY_IMMUTABLE'; END IF;
  RETURN NEW;
END
$f$;

CREATE TRIGGER payment_attempt_execution_authority_immutable
BEFORE UPDATE OF execution_adapter_version,execution_evidence_digest ON saas.payment_attempts
FOR EACH ROW EXECUTE FUNCTION saas.guard_payment_attempt_execution_authority_immutable();

CREATE OR REPLACE FUNCTION saas.payment_attempt_begin_projection(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,
    'storeId',attempt.store_id,
    'paymentMethodId',attempt.payment_method_id,
    'profileId',attempt.profile_id,
    'providerCode',attempt.provider_code,
    'environment',attempt.environment,
    'executionAdapterVersion',attempt.execution_adapter_version,
    'executionEvidenceDigest',attempt.execution_evidence_digest,
    'credentialVersion',attempt.credential_version,
    'amountMinor',attempt.amount_minor,
    'currency',attempt.currency,
    'publicConfig',profile.public_config,
    'sealedCredentials',profile.sealed_credentials
  )
  FROM saas.payment_attempts AS attempt
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=attempt.store_id
    AND profile.id=attempt.profile_id
    AND profile.provider_code=attempt.provider_code
    AND profile.credential_version=attempt.credential_version
  WHERE attempt.id=p_attempt_id
$f$;

CREATE OR REPLACE FUNCTION saas.payment_attempt_authority_projection(p_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $f$
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,
    'storeId',attempt.store_id,
    'paymentMethodId',attempt.payment_method_id,
    'profileId',attempt.profile_id,
    'providerCode',attempt.provider_code,
    'environment',attempt.environment,
    'executionAdapterVersion',attempt.execution_adapter_version,
    'executionEvidenceDigest',attempt.execution_evidence_digest,
    'credentialVersion',attempt.credential_version,
    'orderReference',attempt.order_reference,
    'amountMinor',attempt.amount_minor,
    'currency',attempt.currency,
    'status',attempt.status,
    'version',attempt.version,
    'providerReference',attempt.safe_provider_reference,
    'publicConfig',profile.public_config,
    'sealedCredentials',profile.sealed_credentials
  )
  FROM saas.payment_attempts AS attempt
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=attempt.store_id
    AND profile.id=attempt.profile_id
    AND profile.provider_code=attempt.provider_code
    AND profile.credential_version=attempt.credential_version
  WHERE attempt.id=p_attempt_id
$f$;

CREATE FUNCTION saas.payment_reconciliation_authority(
  p_attempt_id uuid,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE result jsonb;
BEGIN
  IF p_attempt_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT saas.payment_attempt_authority_projection(attempt.id) INTO result
  FROM saas.payment_attempts AS attempt
  WHERE attempt.id=p_attempt_id AND attempt.updated_at<=p_now;
  IF result IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',result;
END
$f$;

CREATE FUNCTION saas.payment_attempt_claim_reconciliation(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_expected_version bigint,
  p_worker_id text,p_lease_id uuid,p_now timestamptz,p_lease_expires_at timestamptz,
  p_execution_environment text,p_execution_adapter_version integer,
  p_execution_evidence_digest text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE attempt saas.payment_attempts%ROWTYPE;
BEGIN
  IF p_attempt_id IS NULL
    OR p_execution_environment IS NULL OR p_execution_environment NOT IN('test','live')
    OR p_execution_adapter_version IS NULL OR p_execution_adapter_version<1
    OR p_execution_evidence_digest IS NULL
    OR p_execution_evidence_digest!~'^sha256:[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT * INTO attempt FROM saas.payment_attempts WHERE id=p_attempt_id FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  IF attempt.environment IS DISTINCT FROM p_execution_environment
    OR attempt.execution_adapter_version IS DISTINCT FROM p_execution_adapter_version
    OR attempt.execution_evidence_digest IS DISTINCT FROM p_execution_evidence_digest
    OR NOT saas.merchant_provider_execution_authority_matches(
      attempt.provider_code,'payment_processing',attempt.environment,
      attempt.execution_adapter_version,p_execution_evidence_digest
    )
  THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT claim.outcome,claim.result_payload
  FROM saas.payment_attempt_claim_reconciliation(
    p_attempt_id,p_operation_id,p_fingerprint,p_expected_version,p_worker_id,
    p_lease_id,p_now,p_lease_expires_at
  ) AS claim;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.payment_attempt_bind_execution_authority(),
  saas.guard_payment_attempt_execution_authority_immutable(),
  saas.payment_reconciliation_authority(uuid,timestamptz),
  saas.payment_attempt_claim_reconciliation(
    uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz,text,integer,text
  ),
  saas.payment_attempt_claim_reconciliation(
    uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz
  )
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION
  saas.payment_reconciliation_authority(uuid,timestamptz),
  saas.payment_attempt_claim_reconciliation(
    uuid,uuid,text,bigint,text,uuid,timestamptz,timestamptz,text,integer,text
  )
TO celebix_saas_workflow;

DROP TRIGGER quick_order_links_provider_authority ON saas.quick_order_links;
DROP FUNCTION saas.guard_quick_link_provider_authority();

ALTER TABLE saas.quick_order_links
  ALTER COLUMN provider_config_id DROP NOT NULL,
  ADD COLUMN hosted_authority_id uuid,
  ADD CONSTRAINT quick_order_links_one_payment_authority_check CHECK(
    (provider_config_id IS NOT NULL AND hosted_authority_id IS NULL)
    OR (provider_config_id IS NULL AND hosted_authority_id=id)
  );

ALTER TABLE saas.quick_order_link_items
  ADD COLUMN item_type text,
  ADD CONSTRAINT quick_order_link_items_item_type_check CHECK(
    item_type IS NULL OR item_type IN('PHYSICAL','VIRTUAL')
  );

CREATE TABLE saas.quick_order_link_hosted_authorities(
  link_id uuid NOT NULL,
  store_id uuid NOT NULL,
  payment_method_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  provider_code text NOT NULL,
  execution_environment text NOT NULL,
  execution_adapter_version integer NOT NULL,
  execution_evidence_digest text NOT NULL,
  identity_authority char(64),
  identity_key_id text,
  sealed_identity jsonb,
  created_at timestamptz NOT NULL,
  PRIMARY KEY(link_id),
  UNIQUE(store_id,link_id),
  FOREIGN KEY(store_id,link_id) REFERENCES saas.quick_order_links(store_id,id)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  FOREIGN KEY(store_id,payment_method_id) REFERENCES saas.payment_methods(store_id,id)
    ON DELETE RESTRICT,
  FOREIGN KEY(store_id,profile_id,provider_code)
    REFERENCES saas.merchant_provider_profiles(store_id,id,provider_code) ON DELETE RESTRICT,
  CHECK(provider_code IN('paytr_iframe','iyzico_iframe')),
  CHECK(execution_environment IN('test','live')),
  CHECK(execution_adapter_version>0),
  CHECK(execution_evidence_digest~'^sha256:[a-f0-9]{64}$'),
  CHECK(
    (provider_code='iyzico_iframe'
      AND identity_authority~'^[a-f0-9]{64}$'
      AND identity_key_id IS NOT NULL
      AND saas.quick_link_sealed_envelope_is_valid(sealed_identity,identity_key_id))
    OR
    (provider_code='paytr_iframe'
      AND identity_authority IS NULL AND identity_key_id IS NULL AND sealed_identity IS NULL)
  )
);

ALTER TABLE saas.quick_order_link_hosted_authorities ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.quick_order_link_hosted_authorities FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE saas.quick_order_link_hosted_authorities
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

ALTER TABLE saas.quick_order_links
  ADD CONSTRAINT quick_order_links_hosted_authority_fk
  FOREIGN KEY(hosted_authority_id) REFERENCES saas.quick_order_link_hosted_authorities(link_id)
  ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED;

CREATE FUNCTION saas.guard_quick_link_hosted_authority_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  RAISE EXCEPTION 'QUICK_LINK_HOSTED_AUTHORITY_IMMUTABLE';
END
$f$;
CREATE TRIGGER quick_order_link_hosted_authorities_immutable
  BEFORE UPDATE OR DELETE ON saas.quick_order_link_hosted_authorities
  FOR EACH ROW EXECUTE FUNCTION saas.guard_quick_link_hosted_authority_immutable();

CREATE FUNCTION saas.guard_quick_link_provider_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.store_id IS DISTINCT FROM OLD.store_id
    OR NEW.provider_config_id IS DISTINCT FROM OLD.provider_config_id
    OR NEW.hosted_authority_id IS DISTINCT FROM OLD.hosted_authority_id
  ) THEN RAISE EXCEPTION 'QUICK_LINK_PAYMENT_AUTHORITY_IMMUTABLE'; END IF;
  IF NEW.provider_config_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM saas.stores AS store
      JOIN saas.checkout_provider_configs AS provider
        ON provider.store_id=store.id AND provider.id=NEW.provider_config_id
      WHERE store.id=NEW.store_id AND store.status='active'
        AND provider.status='active' AND provider.provider_key='paytr'
    ) THEN RAISE EXCEPTION 'QUICK_LINK_PROVIDER_NOT_READY'; END IF;
  ELSIF NEW.hosted_authority_id IS DISTINCT FROM NEW.id
    OR NOT EXISTS(SELECT 1 FROM saas.stores AS store WHERE store.id=NEW.store_id AND store.status='active')
  THEN RAISE EXCEPTION 'QUICK_LINK_PROVIDER_NOT_READY'; END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_quick_link_provider_authority() FROM PUBLIC;

CREATE TRIGGER quick_order_links_provider_authority
BEFORE INSERT OR UPDATE OF store_id,provider_config_id,hosted_authority_id ON saas.quick_order_links
FOR EACH ROW EXECUTE FUNCTION saas.guard_quick_link_provider_authority();

ALTER FUNCTION saas.quick_links_detail_projection(uuid,uuid,timestamptz)
  RENAME TO quick_links_detail_projection_legacy_v025;
CREATE FUNCTION saas.quick_links_detail_projection(p_store_id uuid,p_link_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',link.id,'customerName',link.customer_name,'customerEmail',link.customer_email,
    'customerPhone',link.customer_phone,
    'firstProductName',(SELECT item.product_name FROM saas.quick_order_link_items item
      WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_link_id ORDER BY item.position,item.id LIMIT 1),
    'itemCount',(SELECT pg_catalog.count(*) FROM saas.quick_order_link_items item
      WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_link_id),
    'status',CASE WHEN link.status IN('active','opened') AND link.expires_at<=p_now THEN 'expired' ELSE link.status END,
    'currency',link.currency,'totalCents',link.total_cents,
    'expiresAt',saas.quick_links_json_timestamp(link.expires_at),
    'createdAt',saas.quick_links_json_timestamp(link.created_at),'version',link.version,
    'shippingAddress',link.shipping_address,'billingAddress',link.billing_address,
    'customerNote',link.customer_note,'internalLabel',link.internal_label,
    'providerKey',COALESCE(provider.provider_key,hosted.provider_code),
    'subtotalCents',link.subtotal_cents,'shippingCents',link.shipping_cents,'discountCents',link.discount_cents,
    'items',(SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'id',item.id,'position',item.position,'productName',item.product_name,'variantName',item.variant_name,
      'sku',item.sku,'imageUrl',item.image_url,'unitPriceCents',item.unit_price_cents,
      'quantity',item.quantity,'lineTotalCents',item.line_total_cents,'itemType',item.item_type
    )) ORDER BY item.position,item.id),'[]'::jsonb) FROM saas.quick_order_link_items item
      WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_link_id),
    'openedAt',CASE WHEN link.opened_at IS NULL THEN NULL ELSE saas.quick_links_json_timestamp(link.opened_at) END,
    'paidAt',CASE WHEN link.paid_at IS NULL THEN NULL ELSE saas.quick_links_json_timestamp(link.paid_at) END,
    'cancelledAt',CASE WHEN link.cancelled_at IS NULL THEN NULL ELSE saas.quick_links_json_timestamp(link.cancelled_at) END,
    'orderId',link.order_id,'updatedAt',saas.quick_links_json_timestamp(link.updated_at)
  ))
  FROM saas.quick_order_links link
  LEFT JOIN saas.checkout_provider_configs provider
    ON provider.store_id=link.store_id AND provider.id=link.provider_config_id
  LEFT JOIN saas.quick_order_link_hosted_authorities hosted
    ON hosted.store_id=link.store_id AND hosted.link_id=link.hosted_authority_id
  WHERE link.store_id=p_store_id AND link.id=p_link_id
$f$;
REVOKE ALL ON FUNCTION saas.quick_links_detail_projection(uuid,uuid,timestamptz) FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.quick_links_create_hosted(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_link_id uuid,p_item_ids uuid[],p_variant_ids uuid[],p_quantities bigint[],p_payment_method_id uuid,
  p_identity_authority text,p_item_types text[],p_identity_key_id text,p_sealed_identity jsonb,
  p_customer_name text,p_customer_email text,p_customer_phone text,
  p_shipping_address jsonb,p_billing_address jsonb,p_customer_note text,p_internal_label text,
  p_shipping_cents bigint,p_discount_cents bigint,p_expiry_hours bigint,
  p_token_digest text,p_token_key_id text,p_sealed_token jsonb,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  authority_error text;
  existing_operation saas.quick_order_link_operations%ROWTYPE;
  selected_method record;
  store_currency text;
  requested_variant_count bigint;
  locked_variant_count bigint;
  item_position integer;
  product_id uuid;
  product_name text;
  variant_name text;
  variant_sku text;
  variant_price bigint;
  product_ids uuid[]:=ARRAY[]::uuid[];
  product_names text[]:=ARRAY[]::text[];
  variant_names text[]:=ARRAY[]::text[];
  variant_skus text[]:=ARRAY[]::text[];
  image_urls text[]:=ARRAY[]::text[];
  unit_prices bigint[]:=ARRAY[]::bigint[];
  line_totals bigint[]:=ARRAY[]::bigint[];
  subtotal numeric:=0;
  line_total numeric;
  total numeric;
  result_payload jsonb;
  uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error='membership_denied' AND EXISTS(
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error:='action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_operation_id::text!~uuid_pattern
    OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  authority_error:=saas.quick_links_lock_manage_authority(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
  IF authority_error='membership_denied' AND EXISTS(
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error:='action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.quick_links.operation:'||p_store_id::text||':'||p_operation_id::text,0)
  );
  SELECT operation.* INTO existing_operation FROM saas.quick_order_link_operations AS operation
  WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='create' AND existing_operation.payload_fingerprint=p_fingerprint
    THEN RETURN QUERY SELECT 'operation_replayed',existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
    RETURN;
  END IF;

  IF p_link_id IS NULL OR p_link_id::text!~uuid_pattern OR p_payment_method_id IS NULL
    OR p_item_ids IS NULL OR p_variant_ids IS NULL OR p_quantities IS NULL OR p_item_types IS NULL
    OR pg_catalog.cardinality(p_item_ids) NOT BETWEEN 1 AND 100
    OR pg_catalog.cardinality(p_item_ids)<>pg_catalog.cardinality(p_variant_ids)
    OR pg_catalog.cardinality(p_item_ids)<>pg_catalog.cardinality(p_quantities)
    OR pg_catalog.cardinality(p_item_ids)<>pg_catalog.cardinality(p_item_types)
    OR p_customer_name IS NULL OR p_customer_name<>pg_catalog.btrim(p_customer_name)
    OR pg_catalog.char_length(p_customer_name) NOT BETWEEN 1 AND 200 OR p_customer_name~'[[:cntrl:]]'
    OR p_customer_email IS NULL OR p_customer_email<>pg_catalog.btrim(p_customer_email)
    OR pg_catalog.char_length(p_customer_email) NOT BETWEEN 3 AND 320 OR p_customer_email~'[[:cntrl:]]'
    OR p_customer_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    OR (p_customer_phone IS NOT NULL AND (p_customer_phone<>pg_catalog.btrim(p_customer_phone)
      OR pg_catalog.char_length(p_customer_phone) NOT BETWEEN 3 AND 32 OR p_customer_phone~'[[:cntrl:]]'))
    OR saas.quick_link_address_is_valid(p_shipping_address) IS DISTINCT FROM TRUE
    OR saas.quick_link_address_is_valid(p_billing_address) IS DISTINCT FROM TRUE
    OR (p_customer_note IS NOT NULL AND (p_customer_note<>pg_catalog.btrim(p_customer_note)
      OR pg_catalog.char_length(p_customer_note) NOT BETWEEN 1 AND 2000 OR p_customer_note~'[[:cntrl:]]'))
    OR (p_internal_label IS NOT NULL AND (p_internal_label<>pg_catalog.btrim(p_internal_label)
      OR pg_catalog.char_length(p_internal_label) NOT BETWEEN 1 AND 200 OR p_internal_label~'[[:cntrl:]]'))
    OR p_shipping_cents IS NULL OR p_shipping_cents NOT BETWEEN 0 AND 500000000000000
    OR p_discount_cents IS NULL OR p_discount_cents NOT BETWEEN 0 AND 500000000000000
    OR p_expiry_hours IS NULL OR p_expiry_hours<>ALL(ARRAY[4,12,24,48,72]::bigint[])
    OR p_token_digest IS NULL OR p_token_digest!~'^[a-f0-9]{64}$'
    OR p_token_key_id IS NULL OR p_token_key_id<>pg_catalog.btrim(p_token_key_id)
    OR pg_catalog.char_length(p_token_key_id) NOT BETWEEN 1 AND 128 OR p_token_key_id~'[[:cntrl:]]'
    OR saas.quick_link_sealed_envelope_is_valid(p_sealed_token,p_token_key_id) IS DISTINCT FROM TRUE
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  IF pg_catalog.array_ndims(p_item_ids) IS DISTINCT FROM 1
    OR pg_catalog.array_lower(p_item_ids,1) IS DISTINCT FROM 1
    OR pg_catalog.array_ndims(p_variant_ids) IS DISTINCT FROM 1
    OR pg_catalog.array_lower(p_variant_ids,1) IS DISTINCT FROM 1
    OR pg_catalog.array_ndims(p_quantities) IS DISTINCT FROM 1
    OR pg_catalog.array_lower(p_quantities,1) IS DISTINCT FROM 1
    OR pg_catalog.array_ndims(p_item_types) IS DISTINCT FROM 1
    OR pg_catalog.array_lower(p_item_types,1) IS DISTINCT FROM 1
    OR pg_catalog.array_position(p_item_ids,NULL) IS NOT NULL
    OR pg_catalog.array_position(p_variant_ids,NULL) IS NOT NULL
    OR pg_catalog.array_position(p_quantities,NULL) IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_item_ids) supplied(id) WHERE supplied.id::text!~uuid_pattern)
    OR (SELECT pg_catalog.count(DISTINCT supplied.id) FROM pg_catalog.unnest(p_item_ids) supplied(id))<>pg_catalog.cardinality(p_item_ids)
    OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_quantities) supplied(quantity) WHERE supplied.quantity NOT BETWEEN 1 AND 9999)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT method.id AS method_id,method.profile_id,method.provider_code,
    profile.execution_environment,profile.execution_adapter_version,profile.execution_evidence_digest
  INTO selected_method
  FROM saas.payment_methods AS method
  JOIN saas.merchant_provider_profiles AS profile
    ON profile.store_id=method.store_id AND profile.id=method.profile_id AND profile.provider_code=method.provider_code
  WHERE method.store_id=p_store_id AND method.id=p_payment_method_id
    AND method.kind='provider' AND method.state='active'
    AND method.provider_code IN('paytr_iframe','iyzico_iframe')
    AND profile.status='active' AND profile.capability='payment_processing'
    AND profile.execution_environment IS NOT NULL
    AND profile.execution_adapter_version IS NOT NULL
    AND profile.execution_evidence_digest IS NOT NULL
    AND method.config->>'environment'=profile.execution_environment
    AND saas.merchant_provider_execution_authority_matches(
      profile.provider_code,profile.capability,profile.execution_environment,
      profile.execution_adapter_version,profile.execution_evidence_digest
    )
  FOR SHARE OF method,profile;
  IF NOT FOUND THEN RETURN QUERY SELECT 'provider_not_ready',NULL::jsonb; RETURN; END IF;
  IF selected_method.provider_code='iyzico_iframe' THEN
    IF p_identity_authority IS NULL OR p_identity_authority!~'^[a-f0-9]{64}$'
      OR p_identity_key_id IS NULL OR p_identity_key_id<>pg_catalog.btrim(p_identity_key_id)
      OR pg_catalog.char_length(p_identity_key_id) NOT BETWEEN 1 AND 128 OR p_identity_key_id~'[[:cntrl:]]'
      OR saas.quick_link_sealed_envelope_is_valid(p_sealed_identity,p_identity_key_id) IS DISTINCT FROM TRUE
      OR pg_catalog.array_position(p_item_types,NULL) IS NOT NULL
      OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_item_types) supplied(item_type)
        WHERE supplied.item_type NOT IN('PHYSICAL','VIRTUAL'))
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  ELSIF p_identity_authority IS NOT NULL OR p_identity_key_id IS NOT NULL OR p_sealed_identity IS NOT NULL
    OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_item_types) supplied(item_type) WHERE supplied.item_type IS NOT NULL)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  SELECT store.currency INTO store_currency FROM saas.stores AS store
  WHERE store.id=p_store_id AND store.status='active';
  SELECT pg_catalog.count(DISTINCT supplied.variant_id) INTO requested_variant_count
  FROM pg_catalog.unnest(p_variant_ids) supplied(variant_id);
  PERFORM 1 FROM (SELECT DISTINCT supplied.variant_id FROM pg_catalog.unnest(p_variant_ids) supplied(variant_id)) requested
  JOIN saas.product_variants AS variant ON variant.store_id=p_store_id AND variant.id=requested.variant_id AND variant.status='active'
  JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id AND product.status='active'
  ORDER BY product.id,variant.id FOR UPDATE OF product,variant;
  GET DIAGNOSTICS locked_variant_count=ROW_COUNT;
  IF locked_variant_count<>requested_variant_count THEN RETURN QUERY SELECT 'catalog_item_unavailable',NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM (
      SELECT requested.variant_id,pg_catalog.sum(requested.quantity::numeric) requested_quantity
      FROM ROWS FROM(pg_catalog.unnest(p_variant_ids),pg_catalog.unnest(p_quantities)) requested(variant_id,quantity)
      GROUP BY requested.variant_id
    ) grouped_request
    JOIN saas.product_variants variant ON variant.store_id=p_store_id AND variant.id=grouped_request.variant_id
    WHERE variant.stock_tracking AND grouped_request.requested_quantity>variant.stock_quantity::numeric
  ) THEN RETURN QUERY SELECT 'stock_unavailable',NULL::jsonb; RETURN; END IF;

  FOR item_position IN 1..pg_catalog.cardinality(p_variant_ids) LOOP
    SELECT product.id,product.title,variant.title,variant.sku,variant.price_cents
    INTO product_id,product_name,variant_name,variant_sku,variant_price
    FROM saas.product_variants variant JOIN saas.products product
      ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE variant.store_id=p_store_id AND variant.id=p_variant_ids[item_position]
      AND variant.status='active' AND product.status='active';
    IF NOT FOUND THEN RETURN QUERY SELECT 'catalog_item_unavailable',NULL::jsonb; RETURN; END IF;
    IF variant_price NOT BETWEEN 0 AND 8000000000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    line_total:=variant_price::numeric*p_quantities[item_position]::numeric;
    IF line_total NOT BETWEEN 0 AND 79992000000000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    subtotal:=subtotal+line_total;
    product_ids:=pg_catalog.array_append(product_ids,product_id);
    product_names:=pg_catalog.array_append(product_names,product_name);
    variant_names:=pg_catalog.array_append(variant_names,variant_name);
    variant_skus:=pg_catalog.array_append(variant_skus,variant_sku);
    image_urls:=pg_catalog.array_append(image_urls,saas.quick_link_canonical_image_url(p_store_id,product_id,p_variant_ids[item_position]));
    unit_prices:=pg_catalog.array_append(unit_prices,variant_price);
    line_totals:=pg_catalog.array_append(line_totals,line_total::bigint);
  END LOOP;
  total:=subtotal+p_shipping_cents::numeric-p_discount_cents::numeric;
  IF subtotal NOT BETWEEN 0 AND 7999200000000000 OR total NOT BETWEEN 0 AND 8500000000000000
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  BEGIN
    INSERT INTO saas.quick_order_links(
      id,store_id,creating_membership_id,provider_config_id,hosted_authority_id,status,
      token_digest,token_key_id,sealed_token,customer_name,customer_email,customer_phone,
      shipping_address,billing_address,customer_note,internal_label,currency,
      subtotal_cents,shipping_cents,discount_cents,total_cents,expires_at,
      opened_at,paid_at,cancelled_at,order_id,version,created_at,updated_at
    ) VALUES(
      p_link_id,p_store_id,p_membership_id,NULL,p_link_id,'active',
      p_token_digest,p_token_key_id,p_sealed_token,p_customer_name,p_customer_email,p_customer_phone,
      p_shipping_address,p_billing_address,p_customer_note,p_internal_label,store_currency,
      subtotal::bigint,p_shipping_cents,p_discount_cents,total::bigint,
      p_now+pg_catalog.make_interval(hours=>p_expiry_hours::integer),
      NULL,NULL,NULL,NULL,1,p_now,p_now
    );
    INSERT INTO saas.quick_order_link_hosted_authorities(
      link_id,store_id,payment_method_id,profile_id,provider_code,
      execution_environment,execution_adapter_version,execution_evidence_digest,
      identity_authority,identity_key_id,sealed_identity,created_at
    ) VALUES(
      p_link_id,p_store_id,selected_method.method_id,selected_method.profile_id,selected_method.provider_code,
      selected_method.execution_environment,selected_method.execution_adapter_version,selected_method.execution_evidence_digest,
      p_identity_authority,p_identity_key_id,p_sealed_identity,p_now
    );
    FOR item_position IN 1..pg_catalog.cardinality(p_item_ids) LOOP
      INSERT INTO saas.quick_order_link_items(
        id,store_id,quick_order_link_id,product_id,variant_id,position,
        product_name,variant_name,sku,image_url,unit_price_cents,quantity,line_total_cents,created_at,item_type
      ) VALUES(
        p_item_ids[item_position],p_store_id,p_link_id,product_ids[item_position],p_variant_ids[item_position],item_position-1,
        product_names[item_position],variant_names[item_position],variant_skus[item_position],image_urls[item_position],
        unit_prices[item_position],p_quantities[item_position]::integer,line_totals[item_position],p_now,p_item_types[item_position]
      );
    END LOOP;
    result_payload:=saas.quick_links_mutation_projection(p_store_id,p_link_id);
    INSERT INTO saas.quick_order_link_operations(
      operation_id,store_id,quick_order_link_id,operation_kind,payload_fingerprint,result_payload,committed_at
    ) VALUES(p_operation_id,p_store_id,p_link_id,'create',p_fingerprint,result_payload,p_now);
  EXCEPTION
    WHEN unique_violation OR check_violation OR foreign_key_violation THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
    WHEN raise_exception THEN RETURN QUERY SELECT 'provider_not_ready',NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed',result_payload;
END
$f$;

REVOKE ALL ON FUNCTION saas.guard_quick_link_hosted_authority_immutable() FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.quick_links_create_hosted(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,
  text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,
  text,text,jsonb,uuid,text
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.quick_links_create_hosted(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,
  text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,
  text,text,jsonb,uuid,text
) TO celebix_saas_app;

CREATE FUNCTION saas.quick_order_hosted_payment_authority_preflight()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT
    to_regclass('saas.quick_order_link_hosted_authorities') IS NOT NULL
    AND to_regprocedure(
      'saas.quick_links_create_hosted(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid[],uuid[],bigint[],uuid,text,text[],text,jsonb,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)'
    ) IS NOT NULL
    AND COALESCE((SELECT relation.relrowsecurity AND relation.relforcerowsecurity
      FROM pg_catalog.pg_class AS relation
      WHERE relation.oid='saas.quick_order_link_hosted_authorities'::pg_catalog.regclass),false)
    AND (SELECT pg_catalog.count(*)=2 FROM pg_catalog.pg_attribute AS attribute
      WHERE attribute.attrelid='saas.payment_attempts'::pg_catalog.regclass
        AND attribute.attname IN('execution_adapter_version','execution_evidence_digest')
        AND NOT attribute.attisdropped)
    AND to_regprocedure(
      'saas.payment_reconciliation_authority(uuid,timestamp with time zone)'
    ) IS NOT NULL
    AND to_regprocedure(
      'saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone,text,integer,text)'
    ) IS NOT NULL
    AND pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.payment_reconciliation_authority(uuid,timestamp with time zone)',
      'EXECUTE'
    )
    AND pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone,text,integer,text)',
      'EXECUTE'
    )
    AND NOT pg_catalog.has_function_privilege(
      'celebix_saas_workflow',
      'saas.payment_attempt_claim_reconciliation(uuid,uuid,text,bigint,text,uuid,timestamp with time zone,timestamp with time zone)',
      'EXECUTE'
    )
$f$;
REVOKE ALL ON FUNCTION saas.quick_order_hosted_payment_authority_preflight() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.quick_order_hosted_payment_authority_preflight() TO celebix_saas_app;

COMMIT;
