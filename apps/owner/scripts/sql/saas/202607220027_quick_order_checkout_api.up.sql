-- Phase 3B2 least-privilege quick-order checkout authority.
-- This migration is authorized only for isolated PostgreSQL 16 rehearsal.

BEGIN;
SET LOCAL ROLE celebix_saas_owner;

-- Provider mutations use the same immutable operation ledger without inventing
-- a second replay authority.
ALTER TABLE saas.checkout_operations
  DROP CONSTRAINT checkout_operations_kind_check,
  DROP CONSTRAINT checkout_operations_scope_check,
  ALTER COLUMN store_id DROP NOT NULL,
  ADD COLUMN provider_config_id uuid,
  ADD COLUMN worker_id uuid,
  ADD CONSTRAINT checkout_operations_kind_check CHECK (operation_kind IN (
    'configure_provider','revoke_provider','revoke_redemption','begin_attempt',
    'provider_ready','initiation_unknown','initiation_failed','cleanup_attempt',
    'settle_callback','reconcile_success','reconcile_unknown'
  )),
  ADD CONSTRAINT checkout_operations_worker_id_check CHECK (
    worker_id IS NULL OR worker_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  ADD CONSTRAINT checkout_operations_scope_check CHECK (
    (operation_kind IN ('configure_provider','revoke_provider') AND store_id IS NOT NULL
      AND provider_config_id IS NOT NULL AND attempt_id IS NULL AND redemption_session_id IS NULL AND worker_id IS NULL)
    OR (operation_kind='revoke_redemption' AND store_id IS NOT NULL
      AND redemption_session_id IS NOT NULL AND attempt_id IS NULL AND provider_config_id IS NULL AND worker_id IS NULL)
    OR (operation_kind IN ('begin_attempt','provider_ready','initiation_unknown','initiation_failed',
          'settle_callback','reconcile_success','reconcile_unknown') AND store_id IS NOT NULL
      AND attempt_id IS NOT NULL AND redemption_session_id IS NULL AND provider_config_id IS NULL AND worker_id IS NULL)
    OR (operation_kind='cleanup_attempt' AND store_id IS NULL AND worker_id IS NOT NULL
      AND attempt_id IS NULL AND redemption_session_id IS NULL AND provider_config_id IS NULL)
  ),
  ADD CONSTRAINT checkout_operations_provider_store_fk
    FOREIGN KEY (store_id,provider_config_id)
    REFERENCES saas.checkout_provider_configs(store_id,id);

-- Keep the exact migration-025 implementations available for rollback while
-- the public names enforce the migration-027 TRY boundary.
ALTER FUNCTION saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text)
  RENAME TO quick_links_create_025;
ALTER FUNCTION saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text)
  RENAME TO quick_links_duplicate_025;

CREATE OR REPLACE FUNCTION saas.quick_links_create(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_link_id uuid,p_item_ids uuid[],p_variant_ids uuid[],p_quantities bigint[],p_provider_config_id uuid,
  p_customer_name text,p_customer_email text,p_customer_phone text,
  p_shipping_address jsonb,p_billing_address jsonb,p_customer_note text,p_internal_label text,
  p_shipping_cents bigint,p_discount_cents bigint,p_expiry_hours bigint,
  p_token_digest text,p_token_key_id text,p_sealed_token jsonb,
  p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM saas.stores AS store
    WHERE store.id=p_store_id AND store.status='active' AND store.currency='TRY'
  ) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT delegated.outcome,delegated.result_payload
  FROM saas.quick_links_create_025(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_link_id,p_item_ids,p_variant_ids,p_quantities,p_provider_config_id,
    p_customer_name,p_customer_email,p_customer_phone,p_shipping_address,p_billing_address,
    p_customer_note,p_internal_label,p_shipping_cents,p_discount_cents,p_expiry_hours,
    p_token_digest,p_token_key_id,p_sealed_token,p_operation_id,p_fingerprint
  ) AS delegated;
END
$function$;

CREATE OR REPLACE FUNCTION saas.quick_links_duplicate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_source_link_id uuid,p_link_id uuid,p_item_ids uuid[],p_token_digest text,
  p_token_key_id text,p_sealed_token jsonb,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM saas.quick_order_links AS link
    WHERE link.store_id=p_store_id AND link.id=p_source_link_id AND link.currency='TRY'
  ) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT delegated.outcome,delegated.result_payload
  FROM saas.quick_links_duplicate_025(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_source_link_id,p_link_id,p_item_ids,p_token_digest,p_token_key_id,p_sealed_token,
    p_operation_id,p_fingerprint
  ) AS delegated;
END
$function$;

CREATE FUNCTION saas.quick_checkout_hostname_is_valid(p_hostname text)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $function$
  SELECT p_hostname=pg_catalog.lower(p_hostname)
    AND pg_catalog.char_length(p_hostname) BETWEEN 3 AND 253
    AND p_hostname !~ '[*:/?#@[:space:][:cntrl:]]'
    AND p_hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
$function$;

CREATE FUNCTION saas.quick_checkout_uuid_is_valid(p_value uuid)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $function$
  SELECT p_value::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$function$;

CREATE FUNCTION saas.quick_checkout_provider_projection(p_store_id uuid,p_provider_config_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'id',provider.id,'providerKey',provider.provider_key,'status',provider.status,
    'ready',provider.status='active' AND provider.configuration_digest IS NOT NULL,
    'version',provider.version,'updatedAt',saas.quick_links_json_timestamp(provider.updated_at)
  )
  FROM saas.checkout_provider_configs AS provider
  WHERE provider.store_id=p_store_id AND provider.id=p_provider_config_id
$function$;

CREATE FUNCTION saas.quick_checkout_manage_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS text LANGUAGE plpgsql VOLATILE SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN RETURN 'invalid_input'; END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error='membership_denied' AND EXISTS (
    SELECT 1 FROM saas.memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error:='action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN authority_error; END IF;
  RETURN saas.quick_links_lock_manage_authority(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
END
$function$;

CREATE FUNCTION saas.quick_links_get_provider_readiness(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; projection jsonb;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.read'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT saas.quick_checkout_provider_projection(p_store_id,provider.id) INTO projection
  FROM saas.checkout_provider_configs AS provider
  WHERE provider.store_id=p_store_id AND provider.provider_key='paytr'
  ORDER BY (provider.status<>'revoked') DESC,provider.updated_at DESC,provider.id LIMIT 1;
  IF projection IS NULL THEN
    RETURN QUERY SELECT 'not_configured'::text,pg_catalog.jsonb_build_object('ready',false,'providerKey','paytr');
  ELSE RETURN QUERY SELECT 'found'::text,projection; END IF;
END
$function$;

CREATE FUNCTION saas.quick_links_configure_provider(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_provider_config_id uuid,p_expected_version bigint,p_configuration_digest text,
  p_configuration_key_id text,p_sealed_configuration jsonb,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; current_provider saas.checkout_provider_configs%ROWTYPE;
  existing_operation saas.checkout_operations%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.quick_checkout_manage_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF saas.quick_checkout_uuid_is_valid(p_provider_config_id) IS DISTINCT FROM TRUE
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740991
     OR p_configuration_digest IS NULL OR p_configuration_digest!~'^[a-f0-9]{64}$'
     OR p_configuration_key_id IS NULL OR p_configuration_key_id<>pg_catalog.btrim(p_configuration_key_id)
     OR pg_catalog.char_length(p_configuration_key_id) NOT BETWEEN 1 AND 128
     OR p_configuration_key_id~'[[:cntrl:]]'
     OR saas.quick_link_sealed_envelope_is_valid(p_sealed_configuration,p_configuration_key_id) IS DISTINCT FROM TRUE
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.checkout.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation
    WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.store_id=p_store_id AND existing_operation.provider_config_id=p_provider_config_id
       AND existing_operation.operation_kind='configure_provider' AND existing_operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.checkout.provider:paytr:'||p_store_id::text,0)
  );
  IF EXISTS(SELECT 1 FROM saas.checkout_provider_configs AS history
    WHERE history.store_id=p_store_id AND history.provider_key='paytr' AND history.updated_at>p_now) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT provider.* INTO current_provider FROM saas.checkout_provider_configs AS provider
    WHERE provider.store_id=p_store_id AND provider.id=p_provider_config_id FOR UPDATE;
  BEGIN
    IF FOUND THEN
      IF p_now<current_provider.updated_at THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
      IF current_provider.status='revoked' THEN RETURN QUERY SELECT 'provider_revoked'::text,NULL::jsonb; RETURN; END IF;
      IF p_expected_version<>current_provider.version OR current_provider.version=9007199254740991 THEN
        RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN;
      END IF;
      UPDATE saas.checkout_provider_configs SET status='active',configuration_digest=p_configuration_digest,
        configuration_key_id=p_configuration_key_id,sealed_configuration=p_sealed_configuration,
        version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND id=p_provider_config_id;
    ELSE
      IF p_expected_version<>0 THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
      INSERT INTO saas.checkout_provider_configs(
        id,store_id,provider_key,status,public_origin,configuration_key_id,sealed_configuration,
        configuration_digest,version,created_at,updated_at
      ) VALUES (
        p_provider_config_id,p_store_id,'paytr','active','https://www.paytr.com',p_configuration_key_id,
        p_sealed_configuration,p_configuration_digest,1,p_now,p_now
      );
    END IF;
    projection:=saas.quick_checkout_provider_projection(p_store_id,p_provider_config_id);
    INSERT INTO saas.checkout_operations(
      operation_id,store_id,provider_config_id,operation_kind,payload_fingerprint,result_payload,committed_at
    ) VALUES (p_operation_id,p_store_id,p_provider_config_id,'configure_provider',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.quick_links_revoke_provider(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_provider_config_id uuid,p_expected_version bigint,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; current_provider saas.checkout_provider_configs%ROWTYPE;
  existing_operation saas.checkout_operations%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.quick_checkout_manage_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF saas.quick_checkout_uuid_is_valid(p_provider_config_id) IS DISTINCT FROM TRUE
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740991
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.checkout.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.store_id=p_store_id AND existing_operation.provider_config_id=p_provider_config_id
       AND existing_operation.operation_kind='revoke_provider' AND existing_operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.checkout.provider:paytr:'||p_store_id::text,0)
  );
  IF EXISTS(SELECT 1 FROM saas.checkout_provider_configs AS history
    WHERE history.store_id=p_store_id AND history.provider_key='paytr' AND history.updated_at>p_now) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT provider.* INTO current_provider FROM saas.checkout_provider_configs AS provider
    WHERE provider.store_id=p_store_id AND provider.id=p_provider_config_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'provider_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_now<current_provider.updated_at THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF current_provider.status='revoked' THEN RETURN QUERY SELECT 'provider_revoked'::text,NULL::jsonb; RETURN; END IF;
  IF current_provider.version<>p_expected_version OR current_provider.version=9007199254740991 THEN
    RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN;
  END IF;
  BEGIN
    UPDATE saas.checkout_provider_configs SET status='revoked',version=version+1,updated_at=p_now
      WHERE store_id=p_store_id AND id=p_provider_config_id;
    projection:=saas.quick_checkout_provider_projection(p_store_id,p_provider_config_id);
    INSERT INTO saas.checkout_operations(operation_id,store_id,provider_config_id,operation_kind,payload_fingerprint,result_payload,committed_at)
      VALUES(p_operation_id,p_store_id,p_provider_config_id,'revoke_provider',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.quick_links_reveal_credential(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_link_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; projection jsonb;
BEGIN
  authority_error:=saas.quick_checkout_manage_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF saas.quick_checkout_uuid_is_valid(p_link_id) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'storeId',link.store_id,'linkId',link.id,'canonicalHostname',domain.hostname,
    'expiresAt',saas.quick_links_json_timestamp(link.expires_at),
    'tokenDigest',link.token_digest,'tokenKeyId',link.token_key_id,'sealedToken',link.sealed_token
  ) INTO projection
  FROM saas.quick_order_links AS link
  JOIN saas.store_domains AS domain ON domain.store_id=link.store_id AND domain.status='active'
    AND domain.is_primary AND domain.verified_at<=p_now
  WHERE link.store_id=p_store_id AND link.id=p_link_id AND link.currency='TRY';
  IF projection IS NULL THEN RETURN QUERY SELECT 'quick_link_not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,projection;
END
$function$;

CREATE FUNCTION saas.quick_links_reveal_provider_configuration(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_provider_config_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; projection jsonb;
BEGIN
  authority_error:=saas.quick_checkout_manage_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF saas.quick_checkout_uuid_is_valid(p_provider_config_id) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'storeId',provider.store_id,'providerConfigId',provider.id,'version',provider.version,
    'configurationDigest',provider.configuration_digest,
    'configurationKeyId',provider.configuration_key_id,'sealedConfiguration',provider.sealed_configuration
  ) INTO projection
  FROM saas.checkout_provider_configs AS provider
  WHERE provider.store_id=p_store_id AND provider.id=p_provider_config_id
    AND provider.status='active' AND provider.provider_key='paytr' AND provider.configuration_digest IS NOT NULL;
  IF projection IS NULL THEN RETURN QUERY SELECT 'provider_not_ready'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,projection;
END
$function$;

CREATE FUNCTION saas.quick_links_recover_provider_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_provider_config_id uuid,p_operation_id uuid,p_kind text,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; existing_operation saas.checkout_operations%ROWTYPE;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  authority_error:=saas.quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error='membership_denied' AND EXISTS(
    SELECT 1 FROM saas.memberships AS membership WHERE membership.id=p_membership_id
      AND membership.store_id=p_store_id AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error:='action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF saas.quick_checkout_uuid_is_valid(p_provider_config_id) IS DISTINCT FROM TRUE
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_kind IS NULL OR p_kind<>ALL(ARRAY['configure_provider','revoke_provider'])
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation
  WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id
    AND operation.provider_config_id=p_provider_config_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing_operation.operation_kind<>p_kind OR existing_operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
END
$function$;

CREATE FUNCTION saas.quick_checkout_public_quote(p_store_id uuid,p_link_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',1,'status',link.status,'merchantName',store.name,'currency','TRY',
    'subtotalCents',link.subtotal_cents,'shippingCents',link.shipping_cents,
    'discountCents',link.discount_cents,'totalCents',link.total_cents,
    'expiresAt',saas.quick_links_json_timestamp(link.expires_at),
    'items',(
      SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'productName',item.product_name,'variantName',item.variant_name,'imageUrl',item.image_url,
        'unitPriceCents',item.unit_price_cents,'quantity',item.quantity,'lineTotalCents',item.line_total_cents
      )) ORDER BY item.position,item.id),'[]'::jsonb)
      FROM saas.quick_order_link_items AS item
      WHERE item.store_id=p_store_id AND item.quick_order_link_id=p_link_id
    )
  )
  FROM saas.quick_order_links AS link JOIN saas.stores AS store ON store.id=link.store_id
  WHERE link.store_id=p_store_id AND link.id=p_link_id AND link.currency='TRY'
$function$;

CREATE FUNCTION saas.quick_links_claim_redemption(
  p_hostname text,p_token_digest text,p_redemption_id uuid,p_redemption_digest text,
  p_now timestamptz,p_expires_at timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE current_link saas.quick_order_links%ROWTYPE; canonical_hostname text; resolved_store_id uuid; projection jsonb;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
     OR p_token_digest IS NULL OR p_token_digest!~'^[a-f0-9]{64}$'
     OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_checkout_uuid_is_valid(p_redemption_id) IS DISTINCT FROM TRUE
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE
     OR saas.quick_links_authority_time_is_valid(p_expires_at) IS DISTINCT FROM TRUE
     OR p_expires_at<=p_now OR p_expires_at>p_now+interval '15 minutes' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT requested_domain.store_id,primary_domain.hostname INTO resolved_store_id,canonical_hostname
  FROM saas.store_domains AS requested_domain
  JOIN saas.store_domains AS primary_domain ON primary_domain.store_id=requested_domain.store_id
    AND primary_domain.status='active' AND primary_domain.is_primary AND primary_domain.verified_at<=p_now
  JOIN saas.stores AS store ON store.id=requested_domain.store_id AND store.status='active'
  WHERE requested_domain.hostname=p_hostname AND requested_domain.status='active'
    AND requested_domain.verified_at<=p_now;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_hostname<>canonical_hostname THEN
    RETURN QUERY SELECT 'canonicalize'::text,pg_catalog.jsonb_build_object('canonicalHostname',canonical_hostname);
    RETURN;
  END IF;
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=resolved_store_id AND link.token_digest=p_token_digest FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores AS store
  JOIN saas.store_domains AS requested_domain ON requested_domain.store_id=store.id
  JOIN saas.store_domains AS primary_domain ON primary_domain.store_id=store.id
  WHERE store.id=resolved_store_id AND store.status='active'
    AND requested_domain.hostname=p_hostname AND requested_domain.status='active'
    AND requested_domain.verified_at<=p_now
    AND primary_domain.hostname=canonical_hostname AND primary_domain.status='active'
    AND primary_domain.is_primary AND primary_domain.verified_at<=p_now
  FOR SHARE OF store,requested_domain,primary_domain;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  IF p_now<current_link.updated_at THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.version=9007199254740991 THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  IF current_link.currency<>'TRY' OR current_link.status NOT IN ('active','opened')
     OR current_link.expires_at<=p_now OR p_expires_at>current_link.expires_at THEN
    RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN;
  END IF;
  BEGIN
    INSERT INTO saas.quick_order_redemption_sessions(
      id,store_id,quick_order_link_id,cookie_digest,expires_at,version,created_at,updated_at
    ) VALUES(p_redemption_id,current_link.store_id,current_link.id,p_redemption_digest,p_expires_at,1,p_now,p_now);
    IF current_link.status='active' THEN
      UPDATE saas.quick_order_links SET status='opened',opened_at=p_now,version=version+1,updated_at=p_now
      WHERE store_id=current_link.store_id AND id=current_link.id;
    END IF;
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  projection:=pg_catalog.jsonb_build_object(
    'canonicalHostname',canonical_hostname,'redemptionExpiresAt',saas.quick_links_json_timestamp(p_expires_at),
    'quote',saas.quick_checkout_public_quote(current_link.store_id,current_link.id)
  );
  RETURN QUERY SELECT 'claimed'::text,projection;
END
$function$;

CREATE FUNCTION saas.quick_links_recover_redemption_revoke(
  p_hostname text,p_redemption_digest text,p_operation_id uuid,p_fingerprint text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE existing_operation saas.checkout_operations%ROWTYPE;
  resolved_store_id uuid; resolved_session_id uuid;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
     OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT session.store_id,session.id INTO resolved_store_id,resolved_session_id
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.quick_order_redemption_sessions AS session ON session.store_id=domain.store_id
    AND session.cookie_digest=p_redemption_digest
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary
    AND domain.verified_at<=p_now;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation
  WHERE operation.operation_id=p_operation_id AND operation.store_id=resolved_store_id
    AND operation.redemption_session_id=resolved_session_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing_operation.operation_kind<>'revoke_redemption'
     OR existing_operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
END
$function$;

CREATE FUNCTION saas.quick_links_resolve_redemption(p_hostname text,p_redemption_digest text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE projection jsonb;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
     OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'canonicalHostname',primary_domain.hostname,'redemptionExpiresAt',saas.quick_links_json_timestamp(session.expires_at),
    'quote',saas.quick_checkout_public_quote(link.store_id,link.id)
  ) INTO projection
  FROM saas.store_domains AS requested_domain
  JOIN saas.store_domains AS primary_domain ON primary_domain.store_id=requested_domain.store_id
    AND primary_domain.status='active' AND primary_domain.is_primary AND primary_domain.verified_at<=p_now
  JOIN saas.quick_order_redemption_sessions AS session ON session.store_id=requested_domain.store_id
    AND session.cookie_digest=p_redemption_digest AND session.consumed_at IS NULL AND session.revoked_at IS NULL
    AND session.expires_at>p_now
  JOIN saas.quick_order_links AS link ON link.store_id=session.store_id AND link.id=session.quick_order_link_id
    AND link.currency='TRY' AND link.status IN ('active','opened') AND link.expires_at>p_now
  JOIN saas.stores AS store ON store.id=link.store_id AND store.status='active'
  WHERE requested_domain.hostname=p_hostname AND requested_domain.status='active' AND requested_domain.is_primary
    AND requested_domain.verified_at<=p_now;
  IF projection IS NULL THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,projection;
END
$function$;

CREATE FUNCTION saas.quick_links_revoke_redemption(
  p_hostname text,p_redemption_digest text,p_operation_id uuid,p_fingerprint text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE current_session saas.quick_order_redemption_sessions%ROWTYPE;
  existing_operation saas.checkout_operations%ROWTYPE; projection jsonb;
  resolved_store_id uuid; resolved_link_id uuid;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
     OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.checkout.operation:'||p_operation_id::text,0));
  SELECT session.store_id,session.quick_order_link_id INTO resolved_store_id,resolved_link_id
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.quick_order_redemption_sessions AS session ON session.store_id=domain.store_id
    AND session.cookie_digest=p_redemption_digest
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary AND domain.verified_at<=p_now;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.quick_order_links AS link
  WHERE link.store_id=resolved_store_id AND link.id=resolved_link_id FOR UPDATE OF link;
  PERFORM 1 FROM saas.stores AS store
  JOIN saas.store_domains AS domain ON domain.store_id=store.id
  WHERE store.id=resolved_store_id AND store.status='active'
    AND domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary
    AND domain.verified_at<=p_now
  FOR SHARE OF store,domain;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  SELECT session.* INTO current_session FROM saas.quick_order_redemption_sessions AS session
  WHERE session.store_id=resolved_store_id AND session.quick_order_link_id=resolved_link_id
    AND session.cookie_digest=p_redemption_digest FOR UPDATE OF session;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='revoke_redemption' AND existing_operation.redemption_session_id=current_session.id
       AND existing_operation.store_id=current_session.store_id AND existing_operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  IF current_session.consumed_at IS NOT NULL OR current_session.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_session.updated_at OR current_session.version=9007199254740991 THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.checkout_payment_attempts AS attempt
    JOIN saas.checkout_inventory_reservations AS reservation
      ON reservation.store_id=attempt.store_id AND reservation.attempt_id=attempt.id AND reservation.status='held'
    WHERE attempt.store_id=current_session.store_id
      AND attempt.redemption_session_id=current_session.id
      AND attempt.status IN ('reserved','provider_ready','initiation_unknown')
  ) THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  BEGIN
    UPDATE saas.quick_order_redemption_sessions SET revoked_at=p_now,version=version+1,updated_at=p_now
      WHERE store_id=current_session.store_id AND id=current_session.id;
    projection:=pg_catalog.jsonb_build_object('status','revoked');
    INSERT INTO saas.checkout_operations(operation_id,store_id,redemption_session_id,operation_kind,payload_fingerprint,result_payload,committed_at)
      VALUES(p_operation_id,current_session.store_id,current_session.id,'revoke_redemption',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.quick_checkout_customer_snapshot_is_valid(p_link saas.quick_order_links)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas
AS $function$
  SELECT p_link.currency='TRY'
    AND p_link.customer_name=pg_catalog.btrim(p_link.customer_name)
    AND pg_catalog.char_length(p_link.customer_name) BETWEEN 1 AND 60
    AND p_link.customer_name!~'[[:cntrl:]]'
    AND p_link.customer_email=pg_catalog.btrim(p_link.customer_email)
    AND pg_catalog.octet_length(p_link.customer_email)=pg_catalog.char_length(p_link.customer_email)
    AND pg_catalog.char_length(p_link.customer_email) BETWEEN 3 AND 100
    AND p_link.customer_email~'^[A-Za-z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$'
    AND p_link.customer_email!~'[[:space:][:cntrl:]]'
    AND p_link.customer_phone IS NOT NULL
    AND p_link.customer_phone=pg_catalog.btrim(p_link.customer_phone)
    AND pg_catalog.char_length(p_link.customer_phone) BETWEEN 1 AND 20
    AND p_link.customer_phone~'^\+?[0-9]{1,19}$'
    AND pg_catalog.char_length(pg_catalog.concat_ws(' ',
      p_link.shipping_address->>'recipientName',p_link.shipping_address->>'phone',
      p_link.shipping_address->>'line1',p_link.shipping_address->>'line2',
      p_link.shipping_address->>'district',p_link.shipping_address->>'city',
      p_link.shipping_address->>'region',p_link.shipping_address->>'postalCode',
      p_link.shipping_address->>'country'
    )) BETWEEN 1 AND 400
    AND pg_catalog.concat_ws(' ',
      p_link.shipping_address->>'recipientName',p_link.shipping_address->>'phone',
      p_link.shipping_address->>'line1',p_link.shipping_address->>'line2',
      p_link.shipping_address->>'district',p_link.shipping_address->>'city',
      p_link.shipping_address->>'region',p_link.shipping_address->>'postalCode',
      p_link.shipping_address->>'country'
    )!~'[[:cntrl:]]'
$function$;

CREATE FUNCTION saas.checkout_begin_attempt(
  p_hostname text,p_redemption_digest text,p_attempt_id uuid,p_merchant_oid text,
  p_operation_id uuid,p_fingerprint text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE current_link saas.quick_order_links%ROWTYPE; current_session saas.quick_order_redemption_sessions%ROWTYPE;
  current_provider saas.checkout_provider_configs%ROWTYPE; existing_operation saas.checkout_operations%ROWTYPE;
  projection jsonb; basket_encoding text; requested_count bigint; locked_count bigint;
  held_quantity numeric; requested_quantity numeric; item_record record; resolved_store_id uuid; resolved_link_id uuid;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
     OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_checkout_uuid_is_valid(p_attempt_id) IS DISTINCT FROM TRUE
     OR p_merchant_oid IS NULL OR p_merchant_oid!~'^[a-f0-9]{32}$'
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.checkout.operation:'||p_operation_id::text,0));
  -- Link is the first mutable checkout lock. Host authority participates in the
  -- same query so token/cookie digests never become global lookup oracles.
  SELECT session.store_id,session.quick_order_link_id INTO resolved_store_id,resolved_link_id
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.quick_order_redemption_sessions AS session ON session.store_id=domain.store_id
    AND session.cookie_digest=p_redemption_digest
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary AND domain.verified_at<=p_now;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  SELECT link.* INTO current_link FROM saas.quick_order_links AS link
  WHERE link.store_id=resolved_store_id AND link.id=resolved_link_id FOR UPDATE OF link;
  PERFORM 1 FROM saas.stores AS store
  JOIN saas.store_domains AS domain ON domain.store_id=store.id
  WHERE store.id=resolved_store_id AND store.status='active'
    AND domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary
    AND domain.verified_at<=p_now
  FOR SHARE OF store,domain;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN; END IF;
  SELECT session.* INTO current_session FROM saas.quick_order_redemption_sessions AS session
  WHERE session.store_id=resolved_store_id AND session.quick_order_link_id=resolved_link_id
    AND session.cookie_digest=p_redemption_digest FOR UPDATE OF session;
  IF NOT FOUND OR current_session.revoked_at IS NOT NULL OR current_session.consumed_at IS NOT NULL
     OR current_session.expires_at<=p_now OR current_link.status NOT IN ('active','opened')
     OR current_link.expires_at<=p_now OR saas.quick_checkout_customer_snapshot_is_valid(current_link) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'unavailable'::text,NULL::jsonb; RETURN;
  END IF;
  IF p_now<current_link.updated_at OR p_now<current_session.updated_at THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='begin_attempt' AND existing_operation.attempt_id=p_attempt_id
       AND existing_operation.store_id=resolved_store_id AND existing_operation.payload_fingerprint=p_fingerprint
       AND EXISTS(SELECT 1 FROM saas.checkout_payment_attempts AS replayed_attempt
         WHERE replayed_attempt.id=p_attempt_id AND replayed_attempt.store_id=resolved_store_id
           AND replayed_attempt.redemption_session_id=current_session.id AND replayed_attempt.quick_order_link_id=current_link.id) THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM saas.checkout_payment_attempts AS attempt
    WHERE attempt.store_id=current_link.store_id AND attempt.quick_order_link_id=current_link.id
      AND attempt.status IN ('reserved','provider_ready','initiation_unknown')) THEN
    RETURN QUERY SELECT 'attempt_in_progress'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('saas.checkout.merchant_oid:'||p_merchant_oid,0)
  );
  SELECT provider.* INTO current_provider FROM saas.checkout_provider_configs AS provider
    WHERE provider.store_id=current_link.store_id AND provider.id=current_link.provider_config_id
      AND provider.status='active' AND provider.provider_key='paytr'
      AND provider.configuration_digest~'^[a-f0-9]{64}$'
    FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'provider_not_ready'::text,NULL::jsonb; RETURN; END IF;
  IF p_now<current_provider.updated_at THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.count(*),
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_array(item.product_name,item.unit_price_cents,item.quantity)
      ORDER BY item.position,item.id)::text
  INTO requested_count,basket_encoding
  FROM saas.quick_order_link_items AS item
  WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id;
  IF requested_count NOT BETWEEN 1 AND 100 OR pg_catalog.octet_length(basket_encoding) NOT BETWEEN 2 AND 65536
     OR EXISTS (SELECT 1 FROM saas.quick_order_link_items AS item
       WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
         AND (item.product_name<>pg_catalog.btrim(item.product_name)
           OR pg_catalog.char_length(item.product_name) NOT BETWEEN 1 AND 200
           OR item.product_name~'[[:cntrl:]]' OR item.unit_price_cents NOT BETWEEN 1 AND 8000000000
           OR item.quantity NOT BETWEEN 1 AND 9999 OR item.line_total_cents NOT BETWEEN 1 AND 79992000000000)) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.product_variants AS variant
  JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id
  WHERE (variant.store_id,variant.product_id,variant.id) IN (
    SELECT item.store_id,item.product_id,item.variant_id FROM saas.quick_order_link_items AS item
    WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
  ) AND variant.status='active' AND variant.archived_at IS NULL AND product.status='active' AND product.archived_at IS NULL
  ORDER BY product.id,variant.id FOR UPDATE OF product,variant;
  GET DIAGNOSTICS locked_count=ROW_COUNT;
  SELECT pg_catalog.count(DISTINCT item.variant_id) INTO requested_count
  FROM saas.quick_order_link_items AS item WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id;
  IF locked_count<>requested_count THEN RETURN QUERY SELECT 'catalog_item_unavailable'::text,NULL::jsonb; RETURN; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.quick_order_link_items AS item
    JOIN saas.product_variants AS variant ON variant.store_id=item.store_id AND variant.product_id=item.product_id AND variant.id=item.variant_id
    JOIN saas.products AS product ON product.store_id=variant.store_id AND product.id=variant.product_id
    WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
      AND (variant.updated_at>p_now OR product.updated_at>p_now)
  ) THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  FOR item_record IN
    SELECT item.product_id,item.variant_id,pg_catalog.sum(item.quantity)::bigint AS quantity,
      variant.stock_tracking,variant.stock_quantity
    FROM saas.quick_order_link_items AS item
    JOIN saas.product_variants AS variant ON variant.store_id=item.store_id AND variant.product_id=item.product_id AND variant.id=item.variant_id
    WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
    GROUP BY item.product_id,item.variant_id,variant.stock_tracking,variant.stock_quantity
    ORDER BY item.product_id,item.variant_id
  LOOP
    SELECT COALESCE(pg_catalog.sum(reservation.quantity),0) INTO held_quantity
    FROM saas.checkout_inventory_reservations AS reservation
    WHERE reservation.store_id=current_link.store_id AND reservation.variant_id=item_record.variant_id
      AND reservation.status='held' AND reservation.stock_tracked;
    requested_quantity:=item_record.quantity;
    IF item_record.stock_tracking AND item_record.stock_quantity::numeric-held_quantity<requested_quantity THEN
      RETURN QUERY SELECT 'stock_unavailable'::text,NULL::jsonb; RETURN;
    END IF;
  END LOOP;
  IF EXISTS(SELECT 1 FROM saas.checkout_payment_attempts AS attempt WHERE attempt.merchant_oid=p_merchant_oid) THEN
    RETURN QUERY SELECT 'merchant_oid_conflict'::text,NULL::jsonb; RETURN;
  END IF;
  BEGIN
    INSERT INTO saas.checkout_payment_attempts(
      id,store_id,quick_order_link_id,redemption_session_id,provider_config_id,provider_config_version,
      configuration_digest,configuration_key_id,sealed_configuration,merchant_oid,
      expected_subtotal_cents,expected_shipping_cents,expected_discount_cents,expected_payment_amount,
      currency,status,hold_expires_at,version,created_at,updated_at
    ) VALUES(
      p_attempt_id,current_link.store_id,current_link.id,current_session.id,current_provider.id,current_provider.version,
      current_provider.configuration_digest,current_provider.configuration_key_id,current_provider.sealed_configuration,p_merchant_oid,
      current_link.subtotal_cents,current_link.shipping_cents,current_link.discount_cents,current_link.total_cents,
      'TRY','reserved',p_now+interval '5 minutes',1,p_now,p_now
    );
    FOR item_record IN
      SELECT item.product_id,item.variant_id,pg_catalog.sum(item.quantity)::bigint AS quantity,variant.stock_tracking
      FROM saas.quick_order_link_items AS item
      JOIN saas.product_variants AS variant ON variant.store_id=item.store_id AND variant.product_id=item.product_id AND variant.id=item.variant_id
      WHERE item.store_id=current_link.store_id AND item.quick_order_link_id=current_link.id
      GROUP BY item.product_id,item.variant_id,variant.stock_tracking ORDER BY item.product_id,item.variant_id
    LOOP
      INSERT INTO saas.checkout_inventory_reservations(
        id,store_id,attempt_id,quick_order_link_id,product_id,variant_id,quantity,stock_tracked,status,held_at,version,updated_at
      ) VALUES(
        (pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),1,8)||'-'||
         pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),9,4)||'-4'||
         pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),14,3)||'-8'||
         pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),18,3)||'-'||
         pg_catalog.substr(pg_catalog.md5(p_attempt_id::text||item_record.variant_id::text),21,12))::uuid,
        current_link.store_id,p_attempt_id,current_link.id,item_record.product_id,item_record.variant_id,
        item_record.quantity,item_record.stock_tracking,'held',p_now,1,p_now
      );
    END LOOP;
    projection:=pg_catalog.jsonb_build_object(
      'attemptId',p_attempt_id,'storeId',current_link.store_id,'providerConfigId',current_provider.id,
      'status','reserved','holdExpiresAt',saas.quick_links_json_timestamp(p_now+interval '5 minutes'),
      'merchantOid',p_merchant_oid,'paymentAmount',current_link.total_cents,'currency','TRY',
      'customerName',current_link.customer_name,'customerEmail',current_link.customer_email,
      'customerPhone',current_link.customer_phone,
      'shippingAddress',pg_catalog.concat_ws(' ',
        current_link.shipping_address->>'recipientName',current_link.shipping_address->>'phone',
        current_link.shipping_address->>'line1',current_link.shipping_address->>'line2',
        current_link.shipping_address->>'district',current_link.shipping_address->>'city',
        current_link.shipping_address->>'region',current_link.shipping_address->>'postalCode',
        current_link.shipping_address->>'country'),
      'basket',basket_encoding::jsonb,'providerConfigVersion',current_provider.version,
      'configurationDigest',current_provider.configuration_digest,
      'configurationKeyId',current_provider.configuration_key_id,
      'sealedConfiguration',current_provider.sealed_configuration
    );
    INSERT INTO saas.checkout_operations(operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,result_payload,committed_at)
      VALUES(p_operation_id,current_link.store_id,p_attempt_id,'begin_attempt',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.checkout_mark_provider_ready(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_sealed_provider_token jsonb,
  p_provider_token_digest text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE current_attempt saas.checkout_payment_attempts%ROWTYPE; existing_operation saas.checkout_operations%ROWTYPE;
  projection jsonb; token_key_id text;
BEGIN
  token_key_id:=p_sealed_provider_token->>'keyId';
  IF saas.quick_checkout_uuid_is_valid(p_attempt_id) IS DISTINCT FROM TRUE
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_provider_token_digest IS NULL OR p_provider_token_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_link_sealed_envelope_is_valid(p_sealed_provider_token,token_key_id) IS DISTINCT FROM TRUE
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.checkout.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='provider_ready' AND existing_operation.attempt_id=p_attempt_id
      AND existing_operation.payload_fingerprint=p_fingerprint THEN
      SELECT pg_catalog.jsonb_build_object(
        'attemptId',attempt.id,'status','provider_ready','providerTokenDigest',attempt.provider_token_digest,
        'providerTokenKeyId',attempt.provider_token_key_id,'sealedProviderToken',attempt.sealed_provider_token
      ) INTO projection FROM saas.checkout_payment_attempts AS attempt WHERE attempt.id=p_attempt_id;
      RETURN QUERY SELECT 'operation_replayed'::text,projection;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  SELECT attempt.* INTO current_attempt FROM saas.checkout_payment_attempts AS attempt WHERE attempt.id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'attempt_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_attempt.status<>'reserved' OR current_attempt.hold_expires_at<=p_now
     OR p_now<current_attempt.updated_at OR current_attempt.version=9007199254740991
     OR EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
       WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
         AND reservation.status='held' AND reservation.updated_at>p_now)
  THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN; END IF;
  BEGIN
    UPDATE saas.checkout_payment_attempts SET status='provider_ready',provider_token_digest=p_provider_token_digest,
      provider_token_key_id=token_key_id,sealed_provider_token=p_sealed_provider_token,provider_ready_at=p_now,
      version=version+1,updated_at=p_now WHERE id=p_attempt_id;
    projection:=pg_catalog.jsonb_build_object(
      'attemptId',p_attempt_id,'status','provider_ready','providerTokenDigest',p_provider_token_digest,
      'providerTokenKeyId',token_key_id,'sealedProviderToken',p_sealed_provider_token
    );
    INSERT INTO saas.checkout_operations(operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,result_payload,committed_at)
      VALUES(p_operation_id,current_attempt.store_id,p_attempt_id,'provider_ready',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.quick_checkout_mark_attempt_without_token(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_now timestamptz,p_kind text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE current_attempt saas.checkout_payment_attempts%ROWTYPE; existing_operation saas.checkout_operations%ROWTYPE;
  projection jsonb; target_status text;
BEGIN
  IF p_kind NOT IN ('initiation_unknown','initiation_failed')
     OR saas.quick_checkout_uuid_is_valid(p_attempt_id) IS DISTINCT FROM TRUE
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.checkout.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind=p_kind AND existing_operation.attempt_id=p_attempt_id
      AND existing_operation.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  SELECT attempt.* INTO current_attempt FROM saas.checkout_payment_attempts AS attempt WHERE attempt.id=p_attempt_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'attempt_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_kind='initiation_failed' THEN
    PERFORM 1 FROM saas.checkout_inventory_reservations AS reservation
    WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
      AND reservation.status='held'
    ORDER BY reservation.variant_id,reservation.id FOR UPDATE OF reservation;
  END IF;
  IF current_attempt.status<>'reserved' OR p_now<current_attempt.updated_at OR current_attempt.version=9007199254740991
     OR (p_kind='initiation_failed' AND EXISTS(SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
       WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
         AND reservation.status='held'
         AND (reservation.updated_at>p_now OR reservation.version=9007199254740991)))
     OR (p_kind='initiation_unknown' AND current_attempt.hold_expires_at<=p_now) THEN
    RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END IF;
  target_status:=CASE p_kind WHEN 'initiation_unknown' THEN 'initiation_unknown' ELSE 'failed' END;
  BEGIN
    IF p_kind='initiation_unknown' THEN
      UPDATE saas.checkout_payment_attempts SET status='initiation_unknown',initiation_unknown_at=p_now,
        version=version+1,updated_at=p_now WHERE id=p_attempt_id;
      INSERT INTO saas.checkout_reconciliation_jobs(attempt_id,store_id,status,attempt_number,next_attempt_at,created_at,updated_at)
        VALUES(p_attempt_id,current_attempt.store_id,'pending',0,p_now,p_now,p_now);
    ELSE
      UPDATE saas.checkout_inventory_reservations SET status='released',released_at=p_now,version=version+1,updated_at=p_now
        WHERE store_id=current_attempt.store_id AND attempt_id=p_attempt_id AND status='held';
      UPDATE saas.checkout_payment_attempts SET status='failed',failed_at=p_now,version=version+1,updated_at=p_now WHERE id=p_attempt_id;
    END IF;
    projection:=pg_catalog.jsonb_build_object('attemptId',p_attempt_id,'status',target_status);
    INSERT INTO saas.checkout_operations(operation_id,store_id,attempt_id,operation_kind,payload_fingerprint,result_payload,committed_at)
      VALUES(p_operation_id,current_attempt.store_id,p_attempt_id,p_kind,p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow OR raise_exception THEN
    RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.checkout_mark_initiation_unknown(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT result.outcome,result.result_payload FROM saas.quick_checkout_mark_attempt_without_token(
    p_attempt_id,p_operation_id,p_fingerprint,p_now,'initiation_unknown'
  ) AS result
$function$;

CREATE FUNCTION saas.checkout_mark_initiation_failed(
  p_attempt_id uuid,p_operation_id uuid,p_fingerprint text,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT result.outcome,result.result_payload FROM saas.quick_checkout_mark_attempt_without_token(
    p_attempt_id,p_operation_id,p_fingerprint,p_now,'initiation_failed'
  ) AS result
$function$;

CREATE FUNCTION saas.checkout_cleanup_pre_provider_attempts(
  p_worker_id uuid,p_operation_id uuid,p_fingerprint text,p_now timestamptz,p_cleanup_limit bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE existing_operation saas.checkout_operations%ROWTYPE; current_attempt saas.checkout_payment_attempts%ROWTYPE;
  cleaned_count bigint:=0; projection jsonb; transition_failed boolean:=false;
BEGIN
  IF saas.quick_checkout_uuid_is_valid(p_worker_id) IS DISTINCT FROM TRUE
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE
     OR p_cleanup_limit IS NULL OR p_cleanup_limit NOT BETWEEN 1 AND 100 THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.checkout.operation:'||p_operation_id::text,0));
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind='cleanup_attempt' AND existing_operation.worker_id=p_worker_id
       AND existing_operation.payload_fingerprint=p_fingerprint THEN
      RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF; RETURN;
  END IF;
  BEGIN
    FOR current_attempt IN
      SELECT attempt.* FROM saas.checkout_payment_attempts AS attempt
      WHERE attempt.status='reserved' AND attempt.hold_expires_at<=p_now AND attempt.updated_at<=p_now
      ORDER BY attempt.hold_expires_at,attempt.id FOR UPDATE SKIP LOCKED LIMIT p_cleanup_limit
    LOOP
      PERFORM 1 FROM saas.checkout_inventory_reservations AS reservation
      WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
        AND reservation.status='held'
      ORDER BY reservation.variant_id,reservation.id FOR UPDATE OF reservation;
      IF current_attempt.version=9007199254740991 OR EXISTS(
        SELECT 1 FROM saas.checkout_inventory_reservations AS reservation
        WHERE reservation.store_id=current_attempt.store_id AND reservation.attempt_id=current_attempt.id
          AND reservation.status='held'
          AND (reservation.updated_at>p_now OR reservation.version=9007199254740991)
      ) THEN
        transition_failed:=true;
        RAISE check_violation USING MESSAGE='controlled checkout cleanup transition';
      END IF;
      UPDATE saas.checkout_inventory_reservations SET status='expired',expired_at=p_now,version=version+1,updated_at=p_now
        WHERE store_id=current_attempt.store_id AND attempt_id=current_attempt.id AND status='held';
      UPDATE saas.checkout_payment_attempts SET status='expired',expired_at=p_now,version=version+1,updated_at=p_now
        WHERE id=current_attempt.id;
      cleaned_count:=cleaned_count+1;
    END LOOP;
    projection:=pg_catalog.jsonb_build_object('releasedCount',cleaned_count);
    INSERT INTO saas.checkout_operations(operation_id,store_id,worker_id,operation_kind,payload_fingerprint,result_payload,committed_at)
      VALUES(p_operation_id,NULL,p_worker_id,'cleanup_attempt',p_fingerprint,projection,p_now);
  EXCEPTION WHEN unique_violation OR check_violation OR foreign_key_violation OR numeric_value_out_of_range OR datetime_field_overflow OR raise_exception THEN
    IF transition_failed THEN RETURN QUERY SELECT 'invalid_transition'::text,NULL::jsonb;
    ELSE RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; END IF;
    RETURN;
  END;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.checkout_recover_cleanup_operation(
  p_worker_id uuid,p_operation_id uuid,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE existing_operation saas.checkout_operations%ROWTYPE;
BEGIN
  IF saas.quick_checkout_uuid_is_valid(p_worker_id) IS DISTINCT FROM TRUE
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation
  WHERE operation.operation_id=p_operation_id AND operation.worker_id=p_worker_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing_operation.operation_kind<>'cleanup_attempt'
     OR existing_operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
END
$function$;

CREATE FUNCTION saas.checkout_get_payment_presentation(p_hostname text,p_redemption_digest text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE projection jsonb;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
     OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT pg_catalog.jsonb_build_object(
    'attemptId',attempt.id,'storeId',attempt.store_id,'merchantOid',attempt.merchant_oid,
    'providerTokenDigest',attempt.provider_token_digest,
    'providerTokenKeyId',attempt.provider_token_key_id,'sealedProviderToken',attempt.sealed_provider_token
  ) INTO projection
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.quick_order_redemption_sessions AS session ON session.store_id=domain.store_id
    AND session.cookie_digest=p_redemption_digest AND session.revoked_at IS NULL AND session.consumed_at IS NULL AND session.expires_at>p_now
  JOIN saas.checkout_payment_attempts AS attempt ON attempt.store_id=session.store_id
    AND attempt.redemption_session_id=session.id AND attempt.status='provider_ready'
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary AND domain.verified_at<=p_now
  ORDER BY attempt.created_at DESC,attempt.id DESC LIMIT 1;
  IF projection IS NULL THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,projection;
END
$function$;

CREATE FUNCTION saas.checkout_get_redemption_status(p_hostname text,p_redemption_digest text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE link_status text; link_expires_at timestamptz; attempt_status text; order_number text; projection jsonb;
  resolved_store_id uuid; resolved_link_id uuid;
BEGIN
  IF saas.quick_checkout_hostname_is_valid(p_hostname) IS DISTINCT FROM TRUE
     OR p_redemption_digest IS NULL OR p_redemption_digest!~'^[a-f0-9]{64}$'
     OR saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT link.store_id,link.id,link.status,link.expires_at,attempt.status,ordered.order_number
    INTO resolved_store_id,resolved_link_id,link_status,link_expires_at,attempt_status,order_number
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.quick_order_redemption_sessions AS session ON session.store_id=domain.store_id AND session.cookie_digest=p_redemption_digest
  JOIN saas.quick_order_links AS link ON link.store_id=session.store_id AND link.id=session.quick_order_link_id
  LEFT JOIN LATERAL (SELECT candidate.status,candidate.settled_order_id FROM saas.checkout_payment_attempts AS candidate
    WHERE candidate.store_id=link.store_id AND candidate.quick_order_link_id=link.id
      AND candidate.redemption_session_id=session.id
    ORDER BY candidate.created_at DESC,candidate.id DESC LIMIT 1) AS attempt ON TRUE
  LEFT JOIN saas.orders AS ordered ON ordered.store_id=link.store_id AND ordered.id=attempt.settled_order_id
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.is_primary AND domain.verified_at<=p_now
    AND session.revoked_at IS NULL AND session.expires_at>p_now;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  projection:=CASE
    WHEN link_status='paid' AND order_number IS NOT NULL
      THEN pg_catalog.jsonb_build_object('kind','paid','orderNumber',order_number)
    WHEN attempt_status IN ('reserved','provider_ready','initiation_unknown')
      THEN pg_catalog.jsonb_build_object('kind','processing')
    WHEN attempt_status IN ('failed','expired')
      THEN pg_catalog.jsonb_build_object('kind','failed')
    WHEN link_status NOT IN ('active','opened') OR link_expires_at<=p_now
      THEN pg_catalog.jsonb_build_object('kind','unavailable')
    ELSE pg_catalog.jsonb_build_object('kind','ready','quote',
      saas.quick_checkout_public_quote(resolved_store_id,resolved_link_id))
  END;
  RETURN QUERY SELECT 'found'::text,projection;
END
$function$;

CREATE FUNCTION saas.checkout_recover_attempt_operation(
  p_attempt_id uuid,p_operation_id uuid,p_kind text,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE existing_operation saas.checkout_operations%ROWTYPE;
BEGIN
  IF saas.quick_checkout_uuid_is_valid(p_attempt_id) IS DISTINCT FROM TRUE
     OR saas.quick_checkout_uuid_is_valid(p_operation_id) IS DISTINCT FROM TRUE
     OR p_kind IS NULL OR p_kind<>ALL(ARRAY['begin_attempt','provider_ready','initiation_unknown','initiation_failed'])
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT operation.* INTO existing_operation FROM saas.checkout_operations AS operation
    WHERE operation.operation_id=p_operation_id AND operation.attempt_id=p_attempt_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing_operation.operation_kind<>p_kind OR existing_operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
END
$function$;

REVOKE ALL ON FUNCTION saas.quick_links_create_025(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.quick_links_duplicate_025(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text) FROM PUBLIC,celebix_saas_app;
REVOKE ALL ON FUNCTION saas.quick_checkout_hostname_is_valid(text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.quick_checkout_uuid_is_valid(uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.quick_checkout_provider_projection(uuid,uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.quick_checkout_manage_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.quick_checkout_public_quote(uuid,uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.quick_checkout_customer_snapshot_is_valid(saas.quick_order_links) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.quick_checkout_mark_attempt_without_token(uuid,uuid,text,timestamptz,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;

REVOKE ALL ON FUNCTION saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.quick_links_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid[],uuid[],bigint[],uuid,text,text,text,jsonb,jsonb,text,text,bigint,bigint,bigint,text,text,jsonb,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_duplicate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid[],text,text,jsonb,uuid,text) TO celebix_saas_app;

REVOKE ALL ON FUNCTION saas.quick_links_get_provider_readiness(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_configure_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,text,jsonb,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_revoke_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_reveal_credential(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_reveal_provider_configuration(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_recover_provider_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.quick_links_get_provider_readiness(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_configure_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,text,jsonb,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_revoke_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_reveal_credential(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_reveal_provider_configuration(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.quick_links_recover_provider_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,text,text) TO celebix_saas_app;

GRANT USAGE ON SCHEMA saas TO celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.quick_links_claim_redemption(text,text,uuid,text,timestamptz,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_resolve_redemption(text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_revoke_redemption(text,text,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.quick_links_recover_redemption_revoke(text,text,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.checkout_mark_provider_ready(uuid,uuid,text,jsonb,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.checkout_mark_initiation_unknown(uuid,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.checkout_mark_initiation_failed(uuid,uuid,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.checkout_cleanup_pre_provider_attempts(uuid,uuid,text,timestamptz,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.checkout_recover_cleanup_operation(uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.checkout_get_payment_presentation(text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.checkout_get_redemption_status(text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.checkout_recover_attempt_operation(uuid,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.quick_links_claim_redemption(text,text,uuid,text,timestamptz,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.quick_links_resolve_redemption(text,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.quick_links_revoke_redemption(text,text,uuid,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.quick_links_recover_redemption_revoke(text,text,uuid,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.checkout_begin_attempt(text,text,uuid,text,uuid,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.checkout_mark_provider_ready(uuid,uuid,text,jsonb,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.checkout_mark_initiation_unknown(uuid,uuid,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.checkout_mark_initiation_failed(uuid,uuid,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.checkout_cleanup_pre_provider_attempts(uuid,uuid,text,timestamptz,bigint) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.checkout_recover_cleanup_operation(uuid,uuid,text) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.checkout_get_payment_presentation(text,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.checkout_get_redemption_status(text,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.checkout_recover_attempt_operation(uuid,uuid,text,text) TO celebix_saas_workflow;

COMMIT;
