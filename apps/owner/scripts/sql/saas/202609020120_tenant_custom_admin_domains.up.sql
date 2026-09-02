-- Tenant-owned admin hostname lifecycle. Storefront authority is intentionally untouched.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.admin_domains DROP CONSTRAINT admin_domains_canonical_kind_check;
ALTER TABLE saas.admin_domains
  ADD COLUMN provider text,
  ADD COLUMN provider_hostname_id text,
  ADD COLUMN cname_target text,
  ADD COLUMN hostname_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN ssl_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN dns_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN origin_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN ownership_validation jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN certificate_validation jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN last_provider_error_code text,
  ADD COLUMN next_check_at timestamptz,
  ADD COLUMN last_checked_at timestamptz,
  ADD COLUMN requested_removal boolean NOT NULL DEFAULT false,
  ADD COLUMN attempt_count integer NOT NULL DEFAULT 0,
  ADD COLUMN lease_id uuid,
  ADD COLUMN lease_owner text,
  ADD COLUMN lease_expires_at timestamptz,
  ADD CONSTRAINT admin_domains_provider_check CHECK (
    (kind='platform_subdomain' AND provider IS NULL AND provider_hostname_id IS NULL AND cname_target IS NULL)
    OR (kind='custom_alias' AND hostname~'^admin\.' AND provider='cloudflare_for_saas' AND cname_target IS NOT NULL)
  ),
  ADD CONSTRAINT admin_domains_provider_id_check CHECK (provider_hostname_id IS NULL OR (provider_hostname_id=btrim(provider_hostname_id) AND char_length(provider_hostname_id) BETWEEN 1 AND 128 AND provider_hostname_id~'^[A-Za-z0-9._-]+$')),
  ADD CONSTRAINT admin_domains_cname_check CHECK (cname_target IS NULL OR (cname_target=lower(cname_target) AND char_length(cname_target) BETWEEN 3 AND 253 AND cname_target~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$')),
  ADD CONSTRAINT admin_domains_hostname_status_check CHECK (hostname_status IN('pending','active','failed','deleted')),
  ADD CONSTRAINT admin_domains_ssl_status_check CHECK (ssl_status IN('pending','active','failed','deleted')),
  ADD CONSTRAINT admin_domains_dns_status_check CHECK (dns_status IN('pending','ready','mismatch')),
  ADD CONSTRAINT admin_domains_origin_status_check CHECK (origin_status IN('pending','ready','failed')),
  ADD CONSTRAINT admin_domains_validation_check CHECK (jsonb_typeof(ownership_validation)='array' AND jsonb_array_length(ownership_validation)<=1 AND jsonb_typeof(certificate_validation)='array' AND jsonb_array_length(certificate_validation)<=1 AND pg_column_size(ownership_validation)<=8192 AND pg_column_size(certificate_validation)<=8192),
  ADD CONSTRAINT admin_domains_error_check CHECK (last_provider_error_code IS NULL OR last_provider_error_code~'^[a-z][a-z0-9_]{1,63}$'),
  ADD CONSTRAINT admin_domains_attempt_check CHECK (attempt_count BETWEEN 0 AND 1000),
  ADD CONSTRAINT admin_domains_lease_check CHECK (
    (lease_id IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
    OR (lease_id IS NOT NULL AND lease_owner IS NOT NULL AND lease_owner=btrim(lease_owner) AND char_length(lease_owner) BETWEEN 1 AND 128 AND lease_owner~'^[A-Za-z0-9._-]+$' AND lease_expires_at IS NOT NULL)
  ),
  ADD CONSTRAINT admin_domains_custom_primary_ready_check CHECK (NOT canonical OR kind='platform_subdomain' OR (status='active' AND hostname_status='active' AND ssl_status='active' AND dns_status='ready' AND origin_status='ready' AND last_provider_error_code IS NULL AND NOT requested_removal));

UPDATE saas.admin_domains SET hostname_status='active',ssl_status='active',dns_status='ready',origin_status='ready'
WHERE kind='platform_subdomain';

CREATE UNIQUE INDEX admin_domains_provider_hostname_key ON saas.admin_domains(provider,provider_hostname_id) WHERE provider_hostname_id IS NOT NULL;
CREATE INDEX admin_domains_work_idx ON saas.admin_domains(next_check_at,id) WHERE kind='custom_alias' AND provider_hostname_id IS NOT NULL AND (hostname_status<>'deleted' OR ssl_status<>'deleted');

CREATE TABLE saas.admin_domain_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  domain_id uuid NOT NULL,
  operation_fingerprint character(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT admin_domain_operations_domain_fk FOREIGN KEY(store_id,domain_id) REFERENCES saas.admin_domains(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT admin_domain_operations_fingerprint_check CHECK(operation_fingerprint~'^[a-f0-9]{64}$'),
  CONSTRAINT admin_domain_operations_result_check CHECK(jsonb_typeof(result_payload)='object' AND pg_column_size(result_payload)<=32768)
);
ALTER TABLE saas.admin_domain_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.admin_domain_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.admin_domain_operations FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;

CREATE FUNCTION saas.admin_domain_timestamp(p_value timestamptz) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$f$;

CREATE FUNCTION saas.admin_domain_projection(p_domain_id uuid) RETURNS jsonb
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT jsonb_build_object(
    'schemaVersion',1,'id',d.id,'hostname',d.hostname,'kind',d.kind,'status',d.status,
    'primary',d.canonical,'fallback',d.kind='platform_subdomain','hostnameStatus',d.hostname_status,
    'sslStatus',d.ssl_status,'dnsStatus',d.dns_status,'originStatus',d.origin_status,
    'uiStatus',CASE WHEN d.status='disabled' THEN 'disabled' WHEN d.last_provider_error_code IS NOT NULL THEN 'action_required'
      WHEN d.kind='platform_subdomain' THEN 'active' WHEN d.dns_status<>'ready' THEN 'dns_pending'
      WHEN d.hostname_status<>'active' THEN 'hostname_pending' WHEN d.ssl_status<>'active' THEN 'ssl_pending'
      WHEN d.origin_status<>'ready' THEN 'origin_pending' ELSE 'active' END,
    'dnsInstructions',CASE WHEN d.kind='custom_alias' THEN jsonb_build_array(jsonb_build_object('type','CNAME','name',d.hostname,'value',d.cname_target))||d.ownership_validation||d.certificate_validation ELSE '[]'::jsonb END,
    'verifiedAt',CASE WHEN d.verified_at IS NULL THEN NULL ELSE saas.admin_domain_timestamp(d.verified_at) END,
    'lastCheckedAt',CASE WHEN d.last_checked_at IS NULL THEN NULL ELSE saas.admin_domain_timestamp(d.last_checked_at) END,
    'version',d.version,'createdAt',saas.admin_domain_timestamp(d.created_at),'updatedAt',saas.admin_domain_timestamp(d.updated_at)
  ) FROM saas.admin_domains d WHERE d.id=p_domain_id
$f$;

CREATE FUNCTION saas.merchant_admin_domain_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed'::text,jsonb_build_object('items',COALESCE(jsonb_agg(saas.admin_domain_projection(d.id) ORDER BY d.canonical DESC,d.kind,d.hostname),'[]'::jsonb)) FROM saas.admin_domains d WHERE d.store_id=p_store_id;
END $f$;

CREATE FUNCTION saas.merchant_admin_domain_prepare_create(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_operation_fingerprint text,p_domain_id uuid,p_hostname text,p_provider text,p_cname_target text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing saas.admin_domain_operations%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_domain_id IS NULL OR p_operation_fingerprint!~'^[a-f0-9]{64}$' OR p_provider<>'cloudflare_for_saas' OR p_hostname IS NULL OR p_hostname<>lower(p_hostname) OR p_hostname!~'^admin\.([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' OR p_cname_target IS NULL OR p_cname_target<>lower(p_cname_target) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO existing FROM saas.admin_domain_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id<>p_store_id OR existing.operation_fingerprint<>p_operation_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',existing.result_payload; END IF; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.admin_domains WHERE hostname=p_hostname) OR EXISTS(SELECT 1 FROM saas.store_domains WHERE hostname=p_hostname) THEN RETURN QUERY SELECT 'hostname_already_claimed',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,version,created_at,updated_at,provider,cname_target,next_check_at)
  VALUES(p_domain_id,p_store_id,p_hostname,'custom_alias','pending_verification',false,NULL,1,p_now,p_now,p_provider,p_cname_target,p_now);
  projection:=saas.admin_domain_projection(p_domain_id);
  INSERT INTO saas.admin_domain_operations VALUES(p_operation_id,p_store_id,p_domain_id,p_operation_fingerprint,projection,p_now);
  RETURN QUERY SELECT 'prepared',projection;
END $f$;

CREATE FUNCTION saas.merchant_admin_domain_bind_provider(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_domain_id uuid,p_expected_version bigint,p_provider_hostname_id text,p_ownership jsonb,p_certificate jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; current_version bigint;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT version INTO current_version FROM saas.admin_domains WHERE id=p_domain_id AND store_id=p_store_id AND kind='custom_alias' FOR UPDATE;
  IF current_version IS NULL THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  UPDATE saas.admin_domains SET provider_hostname_id=p_provider_hostname_id,ownership_validation=p_ownership,certificate_validation=p_certificate,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'bound',saas.admin_domain_projection(p_domain_id);
END $f$;

CREATE FUNCTION saas.merchant_admin_domain_request_recheck(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; current_version bigint;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT version INTO current_version FROM saas.admin_domains WHERE id=p_domain_id AND store_id=p_store_id AND kind='custom_alias' FOR UPDATE;
  IF current_version IS NULL THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  UPDATE saas.admin_domains SET next_check_at=p_now,last_provider_error_code=NULL,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'recheck_requested',saas.admin_domain_projection(p_domain_id);
END $f$;

CREATE FUNCTION saas.merchant_admin_domain_make_primary(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; selected saas.admin_domains%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO selected FROM saas.admin_domains WHERE id=p_domain_id AND store_id=p_store_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF selected.status<>'active' OR selected.verified_at IS NULL OR selected.hostname_status<>'active' OR selected.ssl_status<>'active' OR selected.dns_status<>'ready' OR selected.origin_status<>'ready' OR selected.last_provider_error_code IS NOT NULL OR selected.requested_removal THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND canonical AND id<>p_domain_id;
  UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'activated',saas.admin_domain_projection(p_domain_id);
END $f$;

CREATE FUNCTION saas.merchant_admin_domain_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; selected saas.admin_domains%ROWTYPE; fallback_id uuid;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO selected FROM saas.admin_domains WHERE id=p_domain_id AND store_id=p_store_id AND kind='custom_alias' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF selected.canonical THEN
    SELECT id INTO fallback_id FROM saas.admin_domains WHERE store_id=p_store_id AND kind='platform_subdomain' AND status='active' AND verified_at<=p_now ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF fallback_id IS NULL THEN RETURN QUERY SELECT 'fallback_missing',NULL::jsonb; RETURN; END IF;
    UPDATE saas.admin_domains SET canonical=false WHERE id=p_domain_id;
    UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=fallback_id;
  END IF;
  UPDATE saas.admin_domains SET status='disabled',canonical=false,verified_at=NULL,requested_removal=true,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'disabled',saas.admin_domain_projection(p_domain_id);
END $f$;

CREATE FUNCTION saas.admin_domain_work_claim(p_worker_id text,p_now timestamptz,p_lease_expires_at timestamptz,p_limit integer,p_lease_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE claimed jsonb;
BEGIN
  IF p_worker_id IS NULL OR p_worker_id<>btrim(p_worker_id) OR char_length(p_worker_id) NOT BETWEEN 1 AND 128
     OR p_now IS NULL OR p_lease_expires_at<=p_now OR p_limit NOT BETWEEN 1 AND 20 OR p_lease_id IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  WITH selected AS (
    SELECT id FROM saas.admin_domains
    WHERE kind='custom_alias' AND provider_hostname_id IS NOT NULL AND next_check_at<=p_now
      AND (lease_expires_at IS NULL OR lease_expires_at<=p_now)
      AND (hostname_status<>'deleted' OR ssl_status<>'deleted')
    ORDER BY next_check_at,id FOR UPDATE SKIP LOCKED LIMIT p_limit
  ), updated AS (
    UPDATE saas.admin_domains d SET lease_id=p_lease_id,lease_owner=p_worker_id,lease_expires_at=p_lease_expires_at,
      attempt_count=attempt_count+1,updated_at=p_now,version=version+1
    FROM selected WHERE d.id=selected.id RETURNING d.*
  ) SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'domainId',id,'storeId',store_id,'hostname',hostname,'providerHostnameId',provider_hostname_id,
      'attemptCount',attempt_count,'leaseId',lease_id,'leaseOwner',lease_owner,
      'leaseExpiresAt',saas.admin_domain_timestamp(lease_expires_at),'requestedRemoval',requested_removal
    ) ORDER BY next_check_at,id),'[]'::jsonb) INTO claimed FROM updated;
  RETURN QUERY SELECT 'claimed',jsonb_build_object('items',claimed);
END $f$;

CREATE FUNCTION saas.admin_domain_work_complete(p_domain_id uuid,p_lease_id uuid,p_worker_id text,p_now timestamptz,p_hostname_status text,p_ssl_status text,p_dns_status text,p_origin_status text,p_error_code text,p_next_check_at timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected saas.admin_domains%ROWTYPE; fallback_id uuid; ready boolean;
BEGIN
  SELECT * INTO selected FROM saas.admin_domains WHERE id=p_domain_id AND kind='custom_alias' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.lease_id IS DISTINCT FROM p_lease_id OR selected.lease_owner IS DISTINCT FROM p_worker_id OR selected.lease_expires_at<p_now THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF p_hostname_status NOT IN('pending','active','failed','deleted') OR p_ssl_status NOT IN('pending','active','failed','deleted')
     OR p_dns_status NOT IN('pending','ready','mismatch') OR p_origin_status NOT IN('pending','ready','failed')
     OR (p_error_code IS NOT NULL AND p_error_code!~'^[a-z][a-z0-9_]{1,63}$') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  ready:=NOT selected.requested_removal AND p_hostname_status='active' AND p_ssl_status='active' AND p_dns_status='ready' AND p_origin_status='ready' AND p_error_code IS NULL;
  IF selected.canonical AND NOT ready THEN
    PERFORM 1 FROM saas.stores WHERE id=selected.store_id FOR UPDATE;
    SELECT id INTO fallback_id FROM saas.admin_domains WHERE store_id=selected.store_id AND kind='platform_subdomain' AND status='active' AND verified_at<=p_now ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF fallback_id IS NULL THEN RETURN QUERY SELECT 'fallback_missing',NULL::jsonb; RETURN; END IF;
    UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
    UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=fallback_id;
  END IF;
  UPDATE saas.admin_domains SET hostname_status=p_hostname_status,ssl_status=p_ssl_status,dns_status=p_dns_status,origin_status=p_origin_status,
    last_provider_error_code=p_error_code,next_check_at=p_next_check_at,last_checked_at=p_now,
    status=CASE WHEN selected.requested_removal THEN status WHEN ready THEN 'active' ELSE 'pending_verification' END,
    verified_at=CASE WHEN ready THEN COALESCE(verified_at,p_now) ELSE NULL END,
    lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'completed',saas.admin_domain_projection(p_domain_id);
END $f$;

CREATE FUNCTION saas.admin_domain_work_fail(p_domain_id uuid,p_lease_id uuid,p_worker_id text,p_now timestamptz,p_error_code text,p_retry_at timestamptz,p_terminal boolean)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected saas.admin_domains%ROWTYPE; fallback_id uuid;
BEGIN
  SELECT * INTO selected FROM saas.admin_domains WHERE id=p_domain_id AND kind='custom_alias' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.lease_id IS DISTINCT FROM p_lease_id OR selected.lease_owner IS DISTINCT FROM p_worker_id OR selected.lease_expires_at<p_now THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF p_error_code!~'^[a-z][a-z0-9_]{1,63}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF selected.canonical THEN
    PERFORM 1 FROM saas.stores WHERE id=selected.store_id FOR UPDATE;
    SELECT id INTO fallback_id FROM saas.admin_domains WHERE store_id=selected.store_id AND kind='platform_subdomain' AND status='active' AND verified_at<=p_now ORDER BY created_at LIMIT 1 FOR UPDATE;
    IF fallback_id IS NULL THEN RETURN QUERY SELECT 'fallback_missing',NULL::jsonb; RETURN; END IF;
    UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
    UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=fallback_id;
  END IF;
  UPDATE saas.admin_domains SET last_provider_error_code=p_error_code,
    hostname_status=CASE WHEN p_terminal THEN 'failed' ELSE hostname_status END,
    ssl_status=CASE WHEN p_terminal THEN 'failed' ELSE ssl_status END,
    status=CASE WHEN requested_removal THEN status ELSE 'pending_verification' END,verified_at=NULL,
    next_check_at=p_retry_at,last_checked_at=p_now,lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,
    updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT CASE WHEN p_terminal THEN 'failed' ELSE 'retry_scheduled' END,saas.admin_domain_projection(p_domain_id);
END $f$;

CREATE OR REPLACE FUNCTION saas.resolve_public_admin_brand(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,authority jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT CASE WHEN resolved.store_id IS NULL THEN 'admin_host_unknown' ELSE 'resolved' END,
    CASE WHEN resolved.store_id IS NULL THEN NULL::jsonb ELSE jsonb_build_object('storeSlug',resolved.store_slug,'displayName',resolved.display_name,'logoUrl',NULL,'accentColor',NULL,'canonicalAdminOrigin','https://'||resolved.primary_hostname) END
  FROM (SELECT 1) seed LEFT JOIN LATERAL (
    SELECT store.id store_id,store.slug store_slug,store.name display_name,primary_domain.hostname primary_hostname
    FROM saas.admin_domains requested JOIN saas.stores store ON store.id=requested.store_id AND store.status='active'
    JOIN saas.admin_domains primary_domain ON primary_domain.store_id=store.id AND primary_domain.canonical AND primary_domain.status='active' AND primary_domain.verified_at<=p_now
    WHERE p_hostname IS NOT NULL AND p_now IS NOT NULL AND p_hostname=lower(p_hostname) AND p_hostname=requested.hostname AND requested.status='active' AND requested.verified_at<=p_now LIMIT 1
  ) resolved ON true
$f$;

CREATE OR REPLACE FUNCTION saas.resolve_admin_domain_origin_health(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT CASE WHEN d.id IS NULL THEN 'not_found' ELSE 'found' END,CASE WHEN d.id IS NULL THEN NULL::jsonb ELSE jsonb_build_object('schemaVersion',1,'status','ok','storeId',d.store_id,'hostname',d.hostname) END
  FROM (SELECT 1) seed LEFT JOIN LATERAL (SELECT * FROM saas.admin_domains WHERE hostname=p_hostname AND status IN('pending_verification','active') AND NOT requested_removal AND created_at<=p_now LIMIT 1) d ON true
$f$;

CREATE OR REPLACE FUNCTION saas.issue_returning_panel_session_for_admin_host(
  p_issuer text,p_subject text,p_destination_hostname text,p_session_id uuid,p_family_id uuid,p_operation_id uuid,p_token_key_id text,p_token_digest text,p_now timestamptz,p_expires_at timestamptz
) RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_principal_id uuid; selected_store_id uuid;
BEGIN
  IF p_issuer IS NULL OR p_subject IS NULL OR p_destination_hostname IS NULL OR p_session_id IS NULL OR p_family_id IS NULL OR p_operation_id IS NULL OR p_token_key_id IS NULL OR p_token_digest IS NULL OR p_now IS NULL OR p_expires_at IS NULL
     OR length(p_issuer)>2048 OR length(p_subject)>512 OR length(p_destination_hostname)>253 OR p_issuer<>btrim(p_issuer) OR p_subject<>btrim(p_subject) OR p_destination_hostname<>lower(btrim(p_destination_hostname))
     OR p_destination_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' OR p_expires_at<=p_now OR p_expires_at>p_now+interval '8 hours' THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  SELECT principal.id,store.id INTO selected_principal_id,selected_store_id
  FROM saas.principals principal JOIN saas.memberships membership ON membership.principal_id=principal.id AND membership.role='store_owner' AND membership.status='active'
  JOIN saas.stores store ON store.id=membership.store_id AND store.status='active'
  JOIN saas.admin_domains domain ON domain.store_id=store.id AND domain.hostname=p_destination_hostname AND domain.status='active' AND domain.verified_at IS NOT NULL AND domain.verified_at<=p_now
  JOIN saas.subscriptions subscription ON subscription.store_id=store.id AND subscription.status='active' AND subscription.valid_from<=p_now AND (subscription.valid_until IS NULL OR p_now<subscription.valid_until)
  JOIN saas.plans plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR p_now<plan.valid_until)
  WHERE principal.issuer=p_issuer AND principal.subject=p_subject AND principal.email_verified FOR SHARE OF principal,membership,store,domain,subscription,plan;
  IF selected_principal_id IS NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT issued.outcome,issued.authority FROM saas.issue_panel_session(p_session_id,p_family_id,p_operation_id,p_token_key_id,p_token_digest,selected_principal_id,selected_store_id,p_now,p_expires_at) issued;
END $f$;

CREATE OR REPLACE FUNCTION saas.issue_cross_host_panel_handoff(
  p_source_token_key_id text,p_source_token_digest text,p_handoff_id uuid,p_operation_id uuid,p_token_key_id text,p_token_digest text,
  p_destination_store_id uuid,p_destination_hostname text,p_now timestamptz,p_expires_at timestamptz
) RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE current_session saas.panel_sessions%ROWTYPE; destination_domain saas.admin_domains%ROWTYPE; existing saas.cross_host_panel_handoffs%ROWTYPE;
BEGIN
  IF p_source_token_key_id!~'^[A-Za-z0-9._-]{1,64}$' OR p_source_token_digest!~'^[a-f0-9]{64}$' OR p_token_key_id!~'^[A-Za-z0-9._-]{1,64}$' OR p_token_digest!~'^[a-f0-9]{64}$'
     OR p_handoff_id IS NULL OR p_operation_id IS NULL OR p_destination_store_id IS NULL OR p_destination_hostname IS NULL OR p_now IS NULL OR p_expires_at IS NULL
     OR p_destination_hostname<>lower(p_destination_hostname) OR p_destination_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
     OR p_expires_at<=p_now OR p_expires_at>p_now+interval '2 minutes' THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  SELECT * INTO current_session FROM saas.panel_sessions WHERE token_key_id=p_source_token_key_id AND token_digest=p_source_token_digest;
  IF NOT FOUND OR current_session.revoked_at IS NOT NULL OR current_session.expires_at<=p_now THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text,30006902));
  SELECT * INTO existing FROM saas.cross_host_panel_handoffs WHERE operation_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF existing.source_session_id<>current_session.session_id OR existing.token_key_id<>p_token_key_id OR existing.token_digest<>p_token_digest OR existing.destination_store_id<>p_destination_store_id OR existing.destination_hostname<>p_destination_hostname OR existing.issued_at<>p_now OR existing.expires_at<>p_expires_at THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
    IF existing.redeemed_at IS NOT NULL THEN RETURN QUERY SELECT 'handoff_replayed',NULL::jsonb; RETURN; END IF;
    IF p_now>=existing.expires_at THEN RETURN QUERY SELECT 'expired',NULL::jsonb; RETURN; END IF;
    RETURN QUERY SELECT 'operation_replayed',jsonb_build_object('destinationOrigin','https://'||existing.destination_hostname,'expiresAt',to_char(existing.expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')); RETURN;
  END IF;
  SELECT domain.* INTO destination_domain FROM saas.admin_domains domain JOIN saas.stores store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.memberships membership ON membership.store_id=store.id AND membership.principal_id=current_session.principal_id AND membership.status='active'
  WHERE domain.store_id=p_destination_store_id AND domain.hostname=p_destination_hostname AND domain.status='active' AND domain.verified_at IS NOT NULL AND domain.verified_at<=p_now FOR SHARE OF domain,store,membership;
  IF NOT FOUND THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.cross_host_panel_handoffs(handoff_id,operation_id,token_key_id,token_digest,principal_id,source_session_id,destination_store_id,destination_admin_domain_id,destination_hostname,issued_at,expires_at,redeemed_at,version,created_at,updated_at)
  VALUES(p_handoff_id,p_operation_id,p_token_key_id,p_token_digest,current_session.principal_id,current_session.session_id,p_destination_store_id,destination_domain.id,p_destination_hostname,p_now,p_expires_at,NULL,1,p_now,p_now);
  RETURN QUERY SELECT 'handoff_issued',jsonb_build_object('destinationOrigin','https://'||p_destination_hostname,'expiresAt',to_char(p_expires_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
END $f$;

CREATE OR REPLACE FUNCTION saas.recover_returning_panel_session_for_admin_host(
  p_issuer text,p_subject text,p_destination_hostname text,p_operation_id uuid,p_token_key_id text,p_token_digest text
) RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE recovered_principal_id uuid; recovered_store_id uuid;
BEGIN
  SELECT session.principal_id,session.active_store_id INTO recovered_principal_id,recovered_store_id
  FROM saas.panel_sessions session JOIN saas.principals principal ON principal.id=session.principal_id AND principal.issuer=p_issuer AND principal.subject=p_subject AND principal.email_verified
  JOIN saas.memberships membership ON membership.principal_id=principal.id AND membership.store_id=session.active_store_id AND membership.role='store_owner' AND membership.status='active'
  JOIN saas.stores store ON store.id=membership.store_id AND store.status='active'
  JOIN saas.admin_domains domain ON domain.store_id=store.id AND domain.hostname=p_destination_hostname AND domain.status='active' AND domain.verified_at IS NOT NULL
  WHERE session.operation_id=p_operation_id AND session.operation_kind='issue' AND session.token_key_id=p_token_key_id AND session.token_digest=p_token_digest;
  IF recovered_principal_id IS NULL THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT recovered.outcome,recovered.authority FROM saas.recover_panel_session_operation(p_operation_id,'issue',p_token_key_id,p_token_digest,recovered_principal_id,recovered_store_id,NULL,NULL,NULL) recovered;
END $f$;

CREATE OR REPLACE FUNCTION saas.list_panel_session_store_options(p_token_key_id text,p_token_digest text,p_now timestamptz)
RETURNS TABLE(outcome text,authority jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_session saas.panel_sessions%ROWTYPE; option_count bigint; includes_active boolean; options jsonb;
BEGIN
  IF p_token_key_id IS NULL OR p_token_digest IS NULL OR p_now IS NULL OR p_token_key_id!~'^[A-Za-z0-9._-]{1,64}$' OR p_token_digest!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected_session FROM saas.panel_sessions WHERE token_key_id=p_token_key_id AND token_digest=p_token_digest;
  IF NOT FOUND OR selected_session.revoked_at IS NOT NULL OR selected_session.expires_at<=p_now THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb; RETURN; END IF;
  SELECT count(*),bool_or(store.id=selected_session.active_store_id),jsonb_agg(jsonb_build_object('storeId',store.id,'storeSlug',store.slug,'displayName',store.name,'canonicalAdminOrigin','https://'||domain.hostname) ORDER BY store.slug,store.id)
    INTO option_count,includes_active,options
  FROM saas.memberships membership JOIN saas.stores store ON store.id=membership.store_id AND store.status='active'
  JOIN LATERAL (SELECT hostname FROM saas.admin_domains d WHERE d.store_id=store.id AND d.status='active' AND d.verified_at<=p_now ORDER BY d.canonical DESC,(d.kind='custom_alias') DESC,d.hostname LIMIT 1) domain ON true
  WHERE membership.principal_id=selected_session.principal_id AND membership.status='active'
    AND EXISTS(SELECT 1 FROM saas.subscriptions subscription JOIN saas.plans plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR p_now<plan.valid_until) WHERE subscription.store_id=store.id AND subscription.status='active' AND subscription.valid_from<=p_now AND (subscription.valid_until IS NULL OR p_now<subscription.valid_until));
  IF option_count<1 OR option_count>100 OR NOT COALESCE(includes_active,false) THEN RETURN QUERY SELECT 'durable_authority_invalid',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'resolved',jsonb_build_object('activeStoreId',selected_session.active_store_id,'stores',options);
END $f$;

REVOKE ALL ON FUNCTION saas.admin_domain_timestamp(timestamptz),saas.admin_domain_projection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.merchant_admin_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.merchant_admin_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text),saas.merchant_admin_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,jsonb,jsonb),saas.merchant_admin_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),saas.merchant_admin_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),saas.merchant_admin_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_domain_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.merchant_admin_domain_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text),saas.merchant_admin_domain_bind_provider(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint,text,jsonb,jsonb),saas.merchant_admin_domain_request_recheck(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),saas.merchant_admin_domain_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),saas.merchant_admin_domain_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.admin_domain_work_claim(text,timestamptz,timestamptz,integer,uuid),saas.admin_domain_work_complete(uuid,uuid,text,timestamptz,text,text,text,text,text,timestamptz),saas.admin_domain_work_fail(uuid,uuid,text,timestamptz,text,timestamptz,boolean) FROM PUBLIC;
GRANT USAGE ON SCHEMA saas TO celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.admin_domain_work_claim(text,timestamptz,timestamptz,integer,uuid),saas.admin_domain_work_complete(uuid,uuid,text,timestamptz,text,text,text,text,text,timestamptz),saas.admin_domain_work_fail(uuid,uuid,text,timestamptz,text,timestamptz,boolean) TO celebix_saas_workflow;
REVOKE ALL ON FUNCTION saas.resolve_admin_domain_origin_health(text,timestamptz) FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.resolve_admin_domain_origin_health(text,timestamptz),saas.resolve_public_admin_brand(text,timestamptz) TO celebix_saas_host_resolver;

COMMIT;
