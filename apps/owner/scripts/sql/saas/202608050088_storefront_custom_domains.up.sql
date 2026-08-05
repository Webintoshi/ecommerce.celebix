-- Phase 4H storefront custom-domain lifecycle authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE TABLE saas.store_domain_provisioning (
  domain_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  provider text NOT NULL DEFAULT 'cloudflare_for_saas',
  provider_hostname_id text,
  cname_target text NOT NULL,
  hostname_status text NOT NULL DEFAULT 'pending',
  ssl_status text NOT NULL DEFAULT 'pending',
  dns_status text NOT NULL DEFAULT 'pending',
  origin_status text NOT NULL DEFAULT 'pending',
  ownership_validation jsonb NOT NULL DEFAULT '[]'::jsonb,
  certificate_validation jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_provider_error_code text,
  requested_removal boolean NOT NULL DEFAULT false,
  attempt_count integer NOT NULL DEFAULT 0,
  next_check_at timestamptz NOT NULL,
  last_checked_at timestamptz,
  lease_id uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT store_domain_provisioning_domain_fk FOREIGN KEY (store_id, domain_id)
    REFERENCES saas.store_domains(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT store_domain_provisioning_provider_check CHECK (provider = 'cloudflare_for_saas'),
  CONSTRAINT store_domain_provisioning_provider_id_check CHECK (
    provider_hostname_id IS NULL OR (
      provider_hostname_id = btrim(provider_hostname_id)
      AND char_length(provider_hostname_id) BETWEEN 1 AND 128
      AND provider_hostname_id ~ '^[A-Za-z0-9._-]+$'
    )
  ),
  CONSTRAINT store_domain_provisioning_cname_check CHECK (
    cname_target = lower(cname_target)
    AND char_length(cname_target) BETWEEN 3 AND 253
    AND cname_target ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  CONSTRAINT store_domain_provisioning_hostname_status_check CHECK (hostname_status IN ('pending','active','failed','deleted')),
  CONSTRAINT store_domain_provisioning_ssl_status_check CHECK (ssl_status IN ('pending','active','failed','deleted')),
  CONSTRAINT store_domain_provisioning_dns_status_check CHECK (dns_status IN ('pending','ready','mismatch')),
  CONSTRAINT store_domain_provisioning_origin_status_check CHECK (origin_status IN ('pending','ready','failed')),
  CONSTRAINT store_domain_provisioning_validation_check CHECK (
    jsonb_typeof(ownership_validation) = 'array'
    AND jsonb_array_length(ownership_validation) <= 1
    AND jsonb_typeof(certificate_validation) = 'array'
    AND jsonb_array_length(certificate_validation) <= 1
    AND pg_catalog.pg_column_size(ownership_validation) <= 8192
    AND pg_catalog.pg_column_size(certificate_validation) <= 8192
  ),
  CONSTRAINT store_domain_provisioning_error_check CHECK (
    last_provider_error_code IS NULL OR last_provider_error_code ~ '^[a-z][a-z0-9_]{1,63}$'
  ),
  CONSTRAINT store_domain_provisioning_attempt_check CHECK (attempt_count BETWEEN 0 AND 1000),
  CONSTRAINT store_domain_provisioning_lease_check CHECK (
    (lease_id IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
    OR (lease_id IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL
      AND lease_owner = btrim(lease_owner) AND char_length(lease_owner) BETWEEN 1 AND 128)
  ),
  CONSTRAINT store_domain_provisioning_timestamp_check CHECK (
    updated_at >= created_at
    AND (last_checked_at IS NULL OR last_checked_at >= created_at)
  ),
  CONSTRAINT store_domain_provisioning_version_check CHECK (version > 0)
);

CREATE UNIQUE INDEX store_domain_provisioning_provider_hostname_key
  ON saas.store_domain_provisioning(provider, provider_hostname_id)
  WHERE provider_hostname_id IS NOT NULL;
CREATE INDEX store_domain_provisioning_work_idx
  ON saas.store_domain_provisioning(next_check_at, domain_id)
  WHERE provider_hostname_id IS NOT NULL
    AND (hostname_status <> 'deleted' OR ssl_status <> 'deleted');

CREATE TABLE saas.store_domain_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  domain_id uuid NOT NULL,
  operation_kind text NOT NULL,
  operation_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT store_domain_operations_domain_fk FOREIGN KEY (store_id, domain_id)
    REFERENCES saas.store_domains(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT store_domain_operations_store_operation_key UNIQUE (store_id, operation_id),
  CONSTRAINT store_domain_operations_store_fingerprint_key UNIQUE (store_id, operation_fingerprint),
  CONSTRAINT store_domain_operations_kind_check CHECK (operation_kind IN ('prepare_create')),
  CONSTRAINT store_domain_operations_fingerprint_check CHECK (operation_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT store_domain_operations_result_check CHECK (
    jsonb_typeof(result_payload) = 'object' AND pg_catalog.pg_column_size(result_payload) <= 32768
  )
);

CREATE FUNCTION saas.guard_store_domain_provisioning()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  IF NEW.domain_id <> OLD.domain_id OR NEW.store_id <> OLD.store_id OR NEW.provider <> OLD.provider
     OR NEW.cname_target <> OLD.cname_target OR NEW.created_at <> OLD.created_at
     OR NEW.version <> OLD.version + 1 THEN
    RAISE EXCEPTION 'STORE_DOMAIN_PROVISIONING_AUTHORITY_INVALID';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER store_domain_provisioning_guard
BEFORE UPDATE ON saas.store_domain_provisioning
FOR EACH ROW EXECUTE FUNCTION saas.guard_store_domain_provisioning();

CREATE FUNCTION saas.guard_store_domain_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, saas
AS $function$
BEGIN
  RAISE EXCEPTION 'STORE_DOMAIN_OPERATION_IMMUTABLE';
END
$function$;

CREATE TRIGGER store_domain_operations_immutable
BEFORE UPDATE OR DELETE ON saas.store_domain_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_store_domain_operation_mutation();

ALTER TABLE saas.store_domain_provisioning ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_domain_provisioning FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.store_domain_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_domain_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.store_domain_provisioning, saas.store_domain_operations FROM PUBLIC;
REVOKE ALL ON saas.store_domain_provisioning, saas.store_domain_operations FROM celebix_saas_app, celebix_saas_workflow;

CREATE FUNCTION saas.store_domain_timestamp(p_value timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$function$;

CREATE FUNCTION saas.store_domain_projection(p_domain_id uuid)
RETURNS jsonb LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'id', domain_row.id,
    'hostname', domain_row.hostname,
    'hostnameType', domain_row.hostname_type,
    'status', domain_row.status,
    'primary', domain_row.is_primary,
    'uiStatus', CASE
      WHEN domain_row.status = 'disabled' THEN 'disabled'
      WHEN provisioning.last_provider_error_code IS NOT NULL THEN 'action_required'
      WHEN domain_row.hostname_type = 'platform_subdomain' THEN 'active'
      WHEN provisioning.dns_status <> 'ready' THEN 'dns_pending'
      WHEN provisioning.hostname_status <> 'active' THEN 'hostname_pending'
      WHEN provisioning.ssl_status <> 'active' THEN 'ssl_pending'
      WHEN provisioning.origin_status <> 'ready' THEN 'origin_pending'
      ELSE 'active'
    END,
    'dnsInstructions', CASE
      WHEN domain_row.hostname_type = 'custom_domain' THEN
        pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'type', 'CNAME', 'name', domain_row.hostname, 'value', provisioning.cname_target
        )) || provisioning.ownership_validation || provisioning.certificate_validation
      ELSE '[]'::jsonb
    END,
    'verifiedAt', CASE WHEN domain_row.verified_at IS NULL THEN NULL ELSE saas.store_domain_timestamp(domain_row.verified_at) END,
    'version', domain_row.version,
    'createdAt', saas.store_domain_timestamp(domain_row.created_at),
    'updatedAt', saas.store_domain_timestamp(domain_row.updated_at)
  )
  FROM saas.store_domains AS domain_row
  LEFT JOIN saas.store_domain_provisioning AS provisioning ON provisioning.domain_id = domain_row.id
  WHERE domain_row.id = p_domain_id
$function$;

CREATE FUNCTION saas.merchant_store_domain_list(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz
) RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    'custom_domains','configuration.read'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error, NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed'::text, pg_catalog.jsonb_build_object(
    'items', COALESCE(pg_catalog.jsonb_agg(saas.store_domain_projection(domain_row.id) ORDER BY domain_row.is_primary DESC, domain_row.hostname), '[]'::jsonb)
  ) FROM saas.store_domains AS domain_row WHERE domain_row.store_id = p_store_id;
END
$function$;

CREATE FUNCTION saas.merchant_store_domain_prepare_create(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_operation_id uuid, p_operation_fingerprint text, p_domain_id uuid,
  p_hostname text, p_provider text, p_cname_target text
) RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; existing_operation saas.store_domain_operations%ROWTYPE; custom_limit numeric;
BEGIN
  authority_error := saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    'custom_domains','configuration.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error, NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_domain_id IS NULL OR p_operation_fingerprint !~ '^[a-f0-9]{64}$'
     OR p_provider <> 'cloudflare_for_saas' OR p_hostname IS NULL OR p_hostname <> lower(p_hostname)
     OR p_cname_target IS NULL OR p_cname_target <> lower(p_cname_target) THEN
    RETURN QUERY SELECT 'invalid_input'::text, NULL::jsonb; RETURN;
  END IF;

  PERFORM 1 FROM saas.stores WHERE id = p_store_id FOR UPDATE;
  SELECT * INTO existing_operation FROM saas.store_domain_operations
    WHERE store_id = p_store_id AND operation_id = p_operation_id;
  IF FOUND THEN
    IF existing_operation.operation_kind <> 'prepare_create'
       OR existing_operation.operation_fingerprint <> p_operation_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch'::text, NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed'::text, existing_operation.result_payload;
    END IF;
    RETURN;
  END IF;

  SELECT plan_limit.effective_limit INTO custom_limit FROM saas.plan_limits AS plan_limit
    WHERE plan_limit.plan_id = p_plan_id AND plan_limit.limit_key = 'customDomains';
  IF custom_limit IS NULL OR custom_limit <= (
    SELECT count(*) FROM saas.store_domains AS domain_row
    WHERE domain_row.store_id = p_store_id AND domain_row.hostname_type = 'custom_domain' AND domain_row.status <> 'disabled'
  ) THEN RETURN QUERY SELECT 'limit_reached'::text, NULL::jsonb; RETURN; END IF;
  IF EXISTS (SELECT 1 FROM saas.store_domains WHERE hostname = p_hostname) THEN
    RETURN QUERY SELECT 'hostname_already_claimed'::text, NULL::jsonb; RETURN;
  END IF;

  INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
  VALUES(p_domain_id,p_store_id,p_hostname,'custom_domain','pending',false,NULL,p_now,p_now,1);
  INSERT INTO saas.store_domain_provisioning(
    domain_id,store_id,provider,cname_target,next_check_at,created_at,updated_at
  ) VALUES(p_domain_id,p_store_id,p_provider,p_cname_target,p_now,p_now,p_now);
  INSERT INTO saas.store_domain_operations(operation_id,store_id,domain_id,operation_kind,operation_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,p_domain_id,'prepare_create',p_operation_fingerprint,saas.store_domain_projection(p_domain_id),p_now);
  RETURN QUERY SELECT 'prepared'::text, saas.store_domain_projection(p_domain_id);
EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT 'hostname_already_claimed'::text, NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.merchant_store_domain_bind_provider(
  p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid,
  p_plan_code text, p_plan_version bigint, p_now timestamptz,
  p_domain_id uuid, p_expected_version bigint, p_provider_hostname_id text,
  p_ownership_validation jsonb, p_certificate_validation jsonb
) RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, saas
AS $function$
DECLARE authority_error text; current_version bigint;
BEGIN
  authority_error := saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT version INTO current_version FROM saas.store_domains WHERE id=p_domain_id AND store_id=p_store_id FOR UPDATE;
  IF current_version IS NULL THEN RETURN QUERY SELECT 'domain_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_version <> p_expected_version THEN RETURN QUERY SELECT 'stale_version'::text,NULL::jsonb; RETURN; END IF;
  IF p_provider_hostname_id IS NULL OR p_provider_hostname_id !~ '^[A-Za-z0-9._-]{1,128}$'
     OR jsonb_typeof(p_ownership_validation) <> 'array' OR jsonb_array_length(p_ownership_validation) > 1
     OR jsonb_typeof(p_certificate_validation) <> 'array' OR jsonb_array_length(p_certificate_validation) > 1 THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.store_domain_provisioning SET provider_hostname_id=p_provider_hostname_id,
    ownership_validation=p_ownership_validation,certificate_validation=p_certificate_validation,
    next_check_at=p_now,updated_at=p_now,version=version+1 WHERE domain_id=p_domain_id;
  UPDATE saas.store_domains SET updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'bound'::text,saas.store_domain_projection(p_domain_id);
END
$function$;

CREATE FUNCTION saas.merchant_store_domain_request_recheck(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; current_version bigint;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT version INTO current_version FROM saas.store_domains WHERE id=p_domain_id AND store_id=p_store_id FOR UPDATE;
  IF current_version IS NULL THEN RETURN QUERY SELECT 'domain_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_domain_provisioning SET last_provider_error_code=NULL,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE domain_id=p_domain_id;
  UPDATE saas.store_domains SET updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'queued'::text,saas.store_domain_projection(p_domain_id);
END
$function$;

CREATE FUNCTION saas.merchant_store_domain_make_primary(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; current_version bigint;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT version INTO current_version FROM saas.store_domains WHERE id=p_domain_id AND store_id=p_store_id FOR UPDATE;
  IF current_version IS NULL THEN RETURN QUERY SELECT 'domain_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version'::text,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.store_domains d JOIN saas.store_domain_provisioning p ON p.domain_id=d.id
    WHERE d.id=p_domain_id AND d.status='active' AND p.hostname_status='active' AND p.ssl_status='active'
      AND p.dns_status='ready' AND p.origin_status='ready' AND p.last_provider_error_code IS NULL
  ) THEN RETURN QUERY SELECT 'not_ready'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_domains SET is_primary=false,updated_at=p_now,version=version+1
    WHERE store_id=p_store_id AND is_primary AND id<>p_domain_id;
  UPDATE saas.store_domains SET is_primary=true,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'activated'::text,saas.store_domain_projection(p_domain_id);
END
$function$;

CREATE FUNCTION saas.merchant_store_domain_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; current_version bigint; was_primary boolean;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT version,is_primary INTO current_version,was_primary FROM saas.store_domains
    WHERE id=p_domain_id AND store_id=p_store_id AND hostname_type='custom_domain' FOR UPDATE;
  IF current_version IS NULL THEN RETURN QUERY SELECT 'domain_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_domains SET status='disabled',is_primary=false,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  IF was_primary THEN
    UPDATE saas.store_domains SET is_primary=true,updated_at=p_now,version=version+1
      WHERE id=(SELECT id FROM saas.store_domains WHERE store_id=p_store_id AND hostname_type='platform_subdomain' AND status='active' ORDER BY created_at LIMIT 1);
  END IF;
  UPDATE saas.store_domain_provisioning SET requested_removal=true,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE domain_id=p_domain_id;
  RETURN QUERY SELECT 'disabled'::text,saas.store_domain_projection(p_domain_id);
END
$function$;

CREATE FUNCTION saas.store_domain_work_claim(
  p_worker_id text,p_now timestamptz,p_lease_expires_at timestamptz,p_limit integer,p_lease_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE claimed jsonb;
BEGIN
  IF p_worker_id IS NULL OR p_worker_id<>btrim(p_worker_id) OR char_length(p_worker_id) NOT BETWEEN 1 AND 128
     OR p_now IS NULL OR p_lease_expires_at<=p_now OR p_limit NOT BETWEEN 1 AND 20 OR p_lease_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  WITH candidates AS (
    SELECT provisioning.domain_id FROM saas.store_domain_provisioning AS provisioning
    WHERE provisioning.provider_hostname_id IS NOT NULL
      AND provisioning.next_check_at<=p_now
      AND (provisioning.lease_expires_at IS NULL OR provisioning.lease_expires_at<=p_now)
      AND (provisioning.hostname_status<>'deleted' OR provisioning.ssl_status<>'deleted')
    ORDER BY provisioning.next_check_at,provisioning.domain_id
    FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), updated AS (
    UPDATE saas.store_domain_provisioning AS provisioning SET
      lease_id=p_lease_id,lease_owner=p_worker_id,lease_expires_at=p_lease_expires_at,
      attempt_count=attempt_count+1,updated_at=p_now,version=version+1
    FROM candidates WHERE provisioning.domain_id=candidates.domain_id
    RETURNING provisioning.*
  ) SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'domainId',updated.domain_id,'storeId',updated.store_id,'hostname',domain_row.hostname,
      'providerHostnameId',updated.provider_hostname_id,'attemptCount',updated.attempt_count,
      'leaseId',updated.lease_id,'leaseOwner',updated.lease_owner,
      'leaseExpiresAt',saas.store_domain_timestamp(updated.lease_expires_at),
      'requestedRemoval',updated.requested_removal
    ) ORDER BY updated.next_check_at,updated.domain_id),'[]'::jsonb) INTO claimed
    FROM updated JOIN saas.store_domains AS domain_row ON domain_row.id=updated.domain_id;
  RETURN QUERY SELECT 'claimed'::text,pg_catalog.jsonb_build_object('items',claimed);
END
$function$;

CREATE FUNCTION saas.store_domain_work_complete(
  p_domain_id uuid,p_lease_id uuid,p_worker_id text,p_now timestamptz,
  p_hostname_status text,p_ssl_status text,p_dns_status text,p_origin_status text,
  p_error_code text,p_next_check_at timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE provisioning_row saas.store_domain_provisioning%ROWTYPE;
BEGIN
  SELECT * INTO provisioning_row FROM saas.store_domain_provisioning WHERE domain_id=p_domain_id FOR UPDATE;
  IF provisioning_row.domain_id IS NULL THEN RETURN QUERY SELECT 'domain_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF provisioning_row.lease_id IS DISTINCT FROM p_lease_id OR provisioning_row.lease_owner IS DISTINCT FROM p_worker_id
     OR provisioning_row.lease_expires_at<p_now THEN RETURN QUERY SELECT 'stale_version'::text,NULL::jsonb; RETURN; END IF;
  IF p_hostname_status NOT IN('pending','active','failed','deleted') OR p_ssl_status NOT IN('pending','active','failed','deleted')
     OR p_dns_status NOT IN('pending','ready','mismatch') OR p_origin_status NOT IN('pending','ready','failed')
     OR (p_error_code IS NOT NULL AND p_error_code!~'^[a-z][a-z0-9_]{1,63}$') THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.store_domain_provisioning SET hostname_status=p_hostname_status,ssl_status=p_ssl_status,
    dns_status=p_dns_status,origin_status=p_origin_status,last_provider_error_code=p_error_code,
    next_check_at=p_next_check_at,last_checked_at=p_now,lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,
    updated_at=p_now,version=version+1 WHERE domain_id=p_domain_id;
  IF NOT provisioning_row.requested_removal AND p_hostname_status='active' AND p_ssl_status='active'
     AND p_dns_status='ready' AND p_origin_status='ready' AND p_error_code IS NULL THEN
    UPDATE saas.store_domains SET status='active',verified_at=COALESCE(verified_at,p_now),updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  END IF;
  RETURN QUERY SELECT 'completed'::text,saas.store_domain_projection(p_domain_id);
END
$function$;

CREATE FUNCTION saas.store_domain_work_fail(
  p_domain_id uuid,p_lease_id uuid,p_worker_id text,p_now timestamptz,p_error_code text,p_retry_at timestamptz,p_terminal boolean
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE provisioning_row saas.store_domain_provisioning%ROWTYPE;
BEGIN
  SELECT * INTO provisioning_row FROM saas.store_domain_provisioning WHERE domain_id=p_domain_id FOR UPDATE;
  IF provisioning_row.domain_id IS NULL THEN RETURN QUERY SELECT 'domain_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF provisioning_row.lease_id IS DISTINCT FROM p_lease_id OR provisioning_row.lease_owner IS DISTINCT FROM p_worker_id
     OR provisioning_row.lease_expires_at<p_now THEN RETURN QUERY SELECT 'stale_version'::text,NULL::jsonb; RETURN; END IF;
  IF p_error_code!~'^[a-z][a-z0-9_]{1,63}$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_domain_provisioning SET last_provider_error_code=p_error_code,
    hostname_status=CASE WHEN p_terminal THEN 'failed' ELSE hostname_status END,
    ssl_status=CASE WHEN p_terminal THEN 'failed' ELSE ssl_status END,
    next_check_at=p_retry_at,last_checked_at=p_now,lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,
    updated_at=p_now,version=version+1 WHERE domain_id=p_domain_id;
  RETURN QUERY SELECT CASE WHEN p_terminal THEN 'failed' ELSE 'retry_scheduled' END,saas.store_domain_projection(p_domain_id);
END
$function$;

REVOKE ALL ON FUNCTION saas.store_domain_timestamp(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.store_domain_projection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.merchant_store_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.merchant_store_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.merchant_store_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,jsonb,jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.merchant_store_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.merchant_store_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.merchant_store_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.store_domain_work_claim(text,timestamptz,timestamptz,integer,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.store_domain_work_complete(uuid,uuid,text,timestamptz,text,text,text,text,text,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.store_domain_work_fail(uuid,uuid,text,timestamptz,text,timestamptz,boolean) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION saas.merchant_store_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_store_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_store_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,jsonb,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_store_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_store_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_store_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.store_domain_work_claim(text,timestamptz,timestamptz,integer,uuid) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.store_domain_work_complete(uuid,uuid,text,timestamptz,text,text,text,text,text,timestamptz) TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.store_domain_work_fail(uuid,uuid,text,timestamptz,text,timestamptz,boolean) TO celebix_saas_workflow;

COMMIT;
