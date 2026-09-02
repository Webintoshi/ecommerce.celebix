-- Automatic system-managed admin companions for custom storefront domains.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.store_domain_provisioning') IS NULL
     OR pg_catalog.to_regclass('saas.admin_domain_operations') IS NULL
     OR EXISTS (
       SELECT 1 FROM saas.store_domains storefront
       JOIN saas.admin_domains admin_domain ON admin_domain.hostname=storefront.hostname
     ) THEN
    RAISE EXCEPTION 'AUTO_ADMIN_DOMAIN_BUNDLE_PRECONDITION_FAILED';
  END IF;
END
$precondition$;

ALTER TABLE saas.admin_domains
  ADD COLUMN management text NOT NULL DEFAULT 'merchant',
  ADD COLUMN source_storefront_domain_id uuid;

UPDATE saas.admin_domains SET management='platform' WHERE kind='platform_subdomain';

ALTER TABLE saas.admin_domains
  ADD CONSTRAINT admin_domains_management_check CHECK (
    (kind='platform_subdomain' AND management='platform' AND source_storefront_domain_id IS NULL)
    OR (kind='custom_alias' AND management='merchant' AND source_storefront_domain_id IS NULL)
    OR (kind='custom_alias' AND management='system' AND source_storefront_domain_id IS NOT NULL)
  ),
  ADD CONSTRAINT admin_domains_source_storefront_fk
    FOREIGN KEY(store_id,source_storefront_domain_id) REFERENCES saas.store_domains(store_id,id) ON DELETE RESTRICT;

CREATE UNIQUE INDEX admin_domains_one_system_companion_per_storefront_idx
  ON saas.admin_domains(store_id,source_storefront_domain_id)
  WHERE management='system' AND source_storefront_domain_id IS NOT NULL;

CREATE FUNCTION saas.guard_global_domain_hostname() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.hostname,202609020121));
  IF TG_TABLE_NAME='store_domains' AND EXISTS(SELECT 1 FROM saas.admin_domains WHERE hostname=NEW.hostname) THEN
    RAISE EXCEPTION 'DOMAIN_HOSTNAME_ALREADY_CLAIMED' USING ERRCODE='unique_violation';
  END IF;
  IF TG_TABLE_NAME='admin_domains' AND EXISTS(SELECT 1 FROM saas.store_domains WHERE hostname=NEW.hostname) THEN
    RAISE EXCEPTION 'DOMAIN_HOSTNAME_ALREADY_CLAIMED' USING ERRCODE='unique_violation';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER store_domains_global_hostname_guard BEFORE INSERT OR UPDATE OF hostname ON saas.store_domains
  FOR EACH ROW EXECUTE FUNCTION saas.guard_global_domain_hostname();
CREATE TRIGGER admin_domains_global_hostname_guard BEFORE INSERT OR UPDATE OF hostname ON saas.admin_domains
  FOR EACH ROW EXECUTE FUNCTION saas.guard_global_domain_hostname();

CREATE TABLE saas.domain_bundle_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  storefront_domain_id uuid NOT NULL,
  admin_domain_id uuid NOT NULL,
  operation_fingerprint character(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT domain_bundle_operations_storefront_fk FOREIGN KEY(store_id,storefront_domain_id) REFERENCES saas.store_domains(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT domain_bundle_operations_admin_fk FOREIGN KEY(store_id,admin_domain_id) REFERENCES saas.admin_domains(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT domain_bundle_operations_fingerprint_key UNIQUE(store_id,operation_fingerprint),
  CONSTRAINT domain_bundle_operations_fingerprint_check CHECK(operation_fingerprint~'^[a-f0-9]{64}$'),
  CONSTRAINT domain_bundle_operations_result_check CHECK(jsonb_typeof(result_payload)='object' AND pg_column_size(result_payload)<=65536)
);
CREATE TRIGGER domain_bundle_operations_immutable BEFORE UPDATE OR DELETE ON saas.domain_bundle_operations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_store_domain_operation_mutation();
ALTER TABLE saas.domain_bundle_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.domain_bundle_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.domain_bundle_operations FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;

CREATE TABLE saas.admin_domain_companion_audit(
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  storefront_domain_id uuid NOT NULL,
  admin_domain_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN('migration_adopted','owner_adopted','owner_created')),
  actor text NOT NULL CHECK(actor=btrim(actor) AND char_length(actor) BETWEEN 1 AND 128),
  recorded_at timestamptz NOT NULL,
  CONSTRAINT admin_domain_companion_audit_storefront_fk FOREIGN KEY(store_id,storefront_domain_id) REFERENCES saas.store_domains(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT admin_domain_companion_audit_admin_fk FOREIGN KEY(store_id,admin_domain_id) REFERENCES saas.admin_domains(store_id,id) ON DELETE RESTRICT
);
ALTER TABLE saas.admin_domain_companion_audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.admin_domain_companion_audit FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.admin_domain_companion_audit FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;

WITH candidates AS (
  SELECT admin_domain.id AS admin_id,admin_domain.store_id,storefront.id AS storefront_id
  FROM saas.admin_domains admin_domain
  JOIN saas.store_domains storefront ON storefront.store_id=admin_domain.store_id
    AND storefront.hostname_type='custom_domain'
    AND storefront.status<>'disabled'
    AND admin_domain.hostname='admin.'||CASE WHEN storefront.hostname LIKE 'www.%' THEN substr(storefront.hostname,5) ELSE storefront.hostname END
  WHERE admin_domain.kind='custom_alias' AND admin_domain.management='merchant'
), unambiguous AS (
  SELECT * FROM candidates candidate
  WHERE 1=(SELECT count(*) FROM candidates peer WHERE peer.admin_id=candidate.admin_id)
    AND 1=(SELECT count(*) FROM candidates peer WHERE peer.storefront_id=candidate.storefront_id)
), updated AS (
  UPDATE saas.admin_domains admin_domain SET management='system',source_storefront_domain_id=selected.storefront_id,
    updated_at=GREATEST(admin_domain.updated_at,clock_timestamp()),version=admin_domain.version+1
  FROM unambiguous selected WHERE admin_domain.id=selected.admin_id
  RETURNING admin_domain.store_id,admin_domain.source_storefront_domain_id,admin_domain.id,admin_domain.updated_at
)
INSERT INTO saas.admin_domain_companion_audit(store_id,storefront_domain_id,admin_domain_id,action,actor,recorded_at)
SELECT store_id,source_storefront_domain_id,id,'migration_adopted','migration-121',updated_at FROM updated;

CREATE FUNCTION saas.merchant_store_domain_bundle_prepare_create(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_operation_fingerprint text,p_storefront_domain_id uuid,p_storefront_hostname text,p_provider text,p_storefront_cname_target text,
  p_admin_domain_id uuid,p_admin_hostname text,p_admin_cname_target text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing saas.domain_bundle_operations%ROWTYPE; custom_limit numeric; selected_admin saas.admin_domains%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_storefront_domain_id IS NULL OR p_admin_domain_id IS NULL OR p_operation_fingerprint!~'^[a-f0-9]{64}$'
     OR p_provider<>'cloudflare_for_saas' OR p_storefront_hostname IS NULL OR p_storefront_hostname<>lower(p_storefront_hostname)
     OR p_admin_hostname IS NULL OR p_admin_hostname<>lower(p_admin_hostname) OR p_admin_hostname!~'^admin\.'
     OR p_storefront_cname_target IS NULL OR p_storefront_cname_target<>lower(p_storefront_cname_target)
     OR p_admin_cname_target IS NULL OR p_admin_cname_target<>lower(p_admin_cname_target) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO existing FROM saas.domain_bundle_operations
    WHERE store_id=p_store_id AND (operation_id=p_operation_id OR operation_fingerprint=p_operation_fingerprint) FOR UPDATE;
  IF FOUND THEN
    IF existing.operation_fingerprint<>p_operation_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',existing.result_payload; END IF;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.domain_bundle_operations WHERE operation_id=p_operation_id) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
  SELECT effective_limit INTO custom_limit FROM saas.plan_limits WHERE plan_id=p_plan_id AND limit_key='customDomains';
  IF custom_limit IS NULL OR custom_limit<=(SELECT count(*) FROM saas.store_domains WHERE store_id=p_store_id AND hostname_type='custom_domain' AND status<>'disabled') THEN
    RETURN QUERY SELECT 'limit_reached',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.store_domains WHERE hostname=p_storefront_hostname)
     OR EXISTS(SELECT 1 FROM saas.admin_domains WHERE hostname=p_storefront_hostname)
     OR EXISTS(SELECT 1 FROM saas.store_domains WHERE hostname=p_admin_hostname) THEN
    RETURN QUERY SELECT 'hostname_already_claimed',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_admin FROM saas.admin_domains WHERE hostname=p_admin_hostname FOR UPDATE;
  IF FOUND AND (selected_admin.store_id<>p_store_id OR selected_admin.kind<>'custom_alias'
      OR (selected_admin.source_storefront_domain_id IS NOT NULL AND selected_admin.source_storefront_domain_id<>p_storefront_domain_id)) THEN
    RETURN QUERY SELECT 'hostname_already_claimed',NULL::jsonb; RETURN;
  END IF;
  INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
  VALUES(p_storefront_domain_id,p_store_id,p_storefront_hostname,'custom_domain','pending',false,NULL,p_now,p_now,1);
  INSERT INTO saas.store_domain_provisioning(domain_id,store_id,provider,cname_target,next_check_at,created_at,updated_at)
  VALUES(p_storefront_domain_id,p_store_id,p_provider,p_storefront_cname_target,p_now,p_now,p_now);
  IF selected_admin.id IS NULL THEN
    INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,version,created_at,updated_at,provider,cname_target,next_check_at,management,source_storefront_domain_id)
    VALUES(p_admin_domain_id,p_store_id,p_admin_hostname,'custom_alias','pending_verification',false,NULL,1,p_now,p_now,p_provider,p_admin_cname_target,p_now,'system',p_storefront_domain_id);
  ELSE
    p_admin_domain_id:=selected_admin.id;
    UPDATE saas.admin_domains SET management='system',source_storefront_domain_id=p_storefront_domain_id,updated_at=p_now,version=version+1 WHERE id=selected_admin.id;
    INSERT INTO saas.admin_domain_companion_audit(store_id,storefront_domain_id,admin_domain_id,action,actor,recorded_at)
    VALUES(p_store_id,p_storefront_domain_id,selected_admin.id,'owner_adopted','merchant-bundle-service',p_now);
  END IF;
  payload:=jsonb_build_object('storefront',saas.store_domain_projection(p_storefront_domain_id),'admin',saas.admin_domain_projection(p_admin_domain_id));
  INSERT INTO saas.domain_bundle_operations(operation_id,store_id,storefront_domain_id,admin_domain_id,operation_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,p_storefront_domain_id,p_admin_domain_id,p_operation_fingerprint,payload,p_now);
  RETURN QUERY SELECT 'prepared',payload;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'hostname_already_claimed',NULL::jsonb;
END $f$;

CREATE FUNCTION saas.merchant_store_domain_bundle_make_primary(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_outcome text; selected_payload jsonb; companion_id uuid;
BEGIN
  SELECT result.outcome,result.result_payload INTO selected_outcome,selected_payload
    FROM saas.merchant_store_domain_make_primary(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_domain_id,p_expected_version) result;
  IF selected_outcome='activated' THEN
    SELECT id INTO companion_id FROM saas.admin_domains WHERE store_id=p_store_id AND source_storefront_domain_id=p_domain_id AND management='system'
      AND status='active' AND hostname_status='active' AND ssl_status='active' AND dns_status='ready' AND origin_status='ready'
      AND last_provider_error_code IS NULL AND NOT requested_removal FOR UPDATE;
    IF companion_id IS NOT NULL THEN
      UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND canonical AND id<>companion_id;
      UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=companion_id;
    END IF;
  END IF;
  RETURN QUERY SELECT selected_outcome,selected_payload;
END $f$;

CREATE FUNCTION saas.merchant_store_domain_bundle_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_outcome text; selected_payload jsonb; companion_id uuid; companion_primary boolean; fallback_id uuid;
BEGIN
  SELECT id,canonical INTO companion_id,companion_primary FROM saas.admin_domains
    WHERE store_id=p_store_id AND source_storefront_domain_id=p_domain_id AND management='system' FOR UPDATE;
  SELECT result.outcome,result.result_payload INTO selected_outcome,selected_payload
    FROM saas.merchant_store_domain_disable(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_domain_id,p_expected_version) result;
  IF selected_outcome='disabled' AND companion_id IS NOT NULL THEN
    UPDATE saas.admin_domains SET status='disabled',canonical=false,verified_at=NULL,requested_removal=true,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE id=companion_id;
    IF companion_primary THEN
      SELECT id INTO fallback_id FROM saas.admin_domains WHERE store_id=p_store_id AND kind='platform_subdomain' AND status='active' ORDER BY created_at LIMIT 1 FOR UPDATE;
      IF fallback_id IS NULL THEN RAISE EXCEPTION 'ADMIN_FALLBACK_MISSING'; END IF;
      UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=fallback_id;
    END IF;
  END IF;
  RETURN QUERY SELECT selected_outcome,selected_payload;
END $f$;

CREATE FUNCTION saas.owner_adopt_admin_domain_companion(p_store_id uuid,p_storefront_domain_id uuid,p_admin_hostname text,p_actor text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE storefront saas.store_domains%ROWTYPE; admin_domain saas.admin_domains%ROWTYPE;
BEGIN
  IF p_store_id IS NULL OR p_storefront_domain_id IS NULL OR p_admin_hostname IS NULL OR p_admin_hostname<>lower(p_admin_hostname)
     OR p_actor IS NULL OR p_actor<>btrim(p_actor) OR char_length(p_actor) NOT BETWEEN 1 AND 128 OR p_now IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO storefront FROM saas.store_domains WHERE id=p_storefront_domain_id AND store_id=p_store_id AND hostname_type='custom_domain' FOR UPDATE;
  SELECT * INTO admin_domain FROM saas.admin_domains WHERE hostname=p_admin_hostname FOR UPDATE;
  IF storefront.id IS NULL OR admin_domain.id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF admin_domain.store_id<>p_store_id OR admin_domain.kind<>'custom_alias'
     OR (admin_domain.source_storefront_domain_id IS NOT NULL AND admin_domain.source_storefront_domain_id<>p_storefront_domain_id) THEN
    RETURN QUERY SELECT 'hostname_already_claimed',NULL::jsonb; RETURN;
  END IF;
  IF admin_domain.management='system' AND admin_domain.source_storefront_domain_id=p_storefront_domain_id THEN
    RETURN QUERY SELECT 'operation_replayed',jsonb_build_object('storefrontDomainId',storefront.id,'adminDomainId',admin_domain.id); RETURN;
  END IF;
  UPDATE saas.admin_domains SET management='system',source_storefront_domain_id=p_storefront_domain_id,updated_at=p_now,version=version+1 WHERE id=admin_domain.id;
  INSERT INTO saas.admin_domain_companion_audit(store_id,storefront_domain_id,admin_domain_id,action,actor,recorded_at)
  VALUES(p_store_id,p_storefront_domain_id,admin_domain.id,'owner_adopted',p_actor,p_now);
  RETURN QUERY SELECT 'adopted',jsonb_build_object('storefrontDomainId',storefront.id,'adminDomainId',admin_domain.id);
END $f$;

CREATE FUNCTION saas.owner_prepare_admin_domain_companion(p_store_id uuid,p_storefront_domain_id uuid,p_admin_domain_id uuid,p_admin_hostname text,p_cname_target text,p_actor text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE storefront saas.store_domains%ROWTYPE;
BEGIN
  IF p_store_id IS NULL OR p_storefront_domain_id IS NULL OR p_admin_domain_id IS NULL OR p_admin_hostname IS NULL OR p_admin_hostname<>lower(p_admin_hostname)
     OR p_admin_hostname!~'^admin\.' OR p_cname_target IS NULL OR p_cname_target<>lower(p_cname_target)
     OR p_actor IS NULL OR p_actor<>btrim(p_actor) OR char_length(p_actor) NOT BETWEEN 1 AND 128 OR p_now IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO storefront FROM saas.store_domains WHERE id=p_storefront_domain_id AND store_id=p_store_id AND hostname_type='custom_domain' AND status<>'disabled' FOR UPDATE;
  IF storefront.id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM saas.admin_domains WHERE hostname=p_admin_hostname) OR EXISTS(SELECT 1 FROM saas.store_domains WHERE hostname=p_admin_hostname) THEN
    RETURN QUERY SELECT 'hostname_already_claimed',NULL::jsonb; RETURN;
  END IF;
  INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,version,created_at,updated_at,provider,cname_target,next_check_at,management,source_storefront_domain_id)
  VALUES(p_admin_domain_id,p_store_id,p_admin_hostname,'custom_alias','pending_verification',false,NULL,1,p_now,p_now,'cloudflare_for_saas',p_cname_target,p_now,'system',p_storefront_domain_id);
  INSERT INTO saas.admin_domain_companion_audit(store_id,storefront_domain_id,admin_domain_id,action,actor,recorded_at)
  VALUES(p_store_id,p_storefront_domain_id,p_admin_domain_id,'owner_created',p_actor,p_now);
  RETURN QUERY SELECT 'prepared',saas.admin_domain_projection(p_admin_domain_id);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'hostname_already_claimed',NULL::jsonb;
END $f$;

CREATE FUNCTION saas.owner_bind_admin_domain_companion(p_admin_domain_id uuid,p_expected_version bigint,p_provider_hostname_id text,p_ownership jsonb,p_certificate jsonb,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected saas.admin_domains%ROWTYPE;
BEGIN
  SELECT * INTO selected FROM saas.admin_domains WHERE id=p_admin_domain_id AND kind='custom_alias' AND management='system' FOR UPDATE;
  IF selected.id IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF p_provider_hostname_id IS NULL OR p_provider_hostname_id!~'^[A-Za-z0-9._-]{1,128}$'
     OR jsonb_typeof(p_ownership)<>'array' OR jsonb_array_length(p_ownership)>1
     OR jsonb_typeof(p_certificate)<>'array' OR jsonb_array_length(p_certificate)>1 OR p_now IS NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.admin_domains SET provider_hostname_id=p_provider_hostname_id,ownership_validation=p_ownership,certificate_validation=p_certificate,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_admin_domain_id;
  RETURN QUERY SELECT 'bound',saas.admin_domain_projection(p_admin_domain_id);
END $f$;

REVOKE ALL ON FUNCTION saas.merchant_store_domain_bundle_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text,uuid,text,text),
  saas.merchant_store_domain_bundle_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),
  saas.merchant_store_domain_bundle_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),
  saas.owner_adopt_admin_domain_companion(uuid,uuid,text,text,timestamptz),
  saas.owner_prepare_admin_domain_companion(uuid,uuid,uuid,text,text,text,timestamptz),
  saas.owner_bind_admin_domain_companion(uuid,bigint,text,jsonb,jsonb,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_global_domain_hostname() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.merchant_store_domain_bundle_prepare_create(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,text,uuid,text,text),
  saas.merchant_store_domain_bundle_make_primary(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint),
  saas.merchant_store_domain_bundle_disable(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.owner_adopt_admin_domain_companion(uuid,uuid,text,text,timestamptz) TO celebix_saas_owner;
GRANT EXECUTE ON FUNCTION saas.owner_prepare_admin_domain_companion(uuid,uuid,uuid,text,text,text,timestamptz),
  saas.owner_bind_admin_domain_companion(uuid,bigint,text,jsonb,jsonb,timestamptz) TO celebix_saas_owner;

COMMIT;
