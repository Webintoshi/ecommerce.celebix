-- Bounded pending replacement for one storefront/admin domain bundle.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF to_regclass('saas.domain_bundle_operations') IS NULL
     OR to_regclass('saas.store_domain_provisioning') IS NULL
     OR to_regprocedure('saas.admin_domain_projection(uuid)') IS NULL THEN
    RAISE EXCEPTION 'STORE_DOMAIN_REPLACEMENT_PRECONDITION_FAILED';
  END IF;
END
$precondition$;

CREATE TABLE saas.store_domain_replacements(
  replacement_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  source_storefront_domain_id uuid NOT NULL,
  target_storefront_domain_id uuid NOT NULL,
  target_admin_domain_id uuid NOT NULL,
  operation_fingerprint character(64) NOT NULL,
  status text NOT NULL DEFAULT 'preparing',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT store_domain_replacements_source_fk FOREIGN KEY(store_id,source_storefront_domain_id) REFERENCES saas.store_domains(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT store_domain_replacements_target_fk FOREIGN KEY(store_id,target_storefront_domain_id) REFERENCES saas.store_domains(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT store_domain_replacements_admin_fk FOREIGN KEY(store_id,target_admin_domain_id) REFERENCES saas.admin_domains(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT store_domain_replacements_distinct_check CHECK(source_storefront_domain_id<>target_storefront_domain_id),
  CONSTRAINT store_domain_replacements_fingerprint_check CHECK(operation_fingerprint~'^[a-f0-9]{64}$'),
  CONSTRAINT store_domain_replacements_status_check CHECK(status IN('preparing','activated','cancelled','rolled_back')),
  CONSTRAINT store_domain_replacements_version_check CHECK(version>0),
  CONSTRAINT store_domain_replacements_timestamp_check CHECK(updated_at>=created_at),
  CONSTRAINT store_domain_replacements_store_fingerprint_key UNIQUE(store_id,operation_fingerprint),
  CONSTRAINT store_domain_replacements_store_id_key UNIQUE(store_id,replacement_id),
  CONSTRAINT store_domain_replacements_target_key UNIQUE(store_id,target_storefront_domain_id),
  CONSTRAINT store_domain_replacements_admin_key UNIQUE(store_id,target_admin_domain_id)
);
CREATE UNIQUE INDEX store_domain_replacements_one_open_per_store_idx ON saas.store_domain_replacements(store_id)
  WHERE status IN('preparing','activated','rolled_back');

CREATE FUNCTION saas.guard_store_domain_replacement() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF TG_OP='DELETE' OR NEW.replacement_id<>OLD.replacement_id OR NEW.store_id<>OLD.store_id
     OR NEW.source_storefront_domain_id<>OLD.source_storefront_domain_id
     OR NEW.target_storefront_domain_id<>OLD.target_storefront_domain_id
     OR NEW.target_admin_domain_id<>OLD.target_admin_domain_id
     OR NEW.operation_fingerprint<>OLD.operation_fingerprint OR NEW.created_at<>OLD.created_at
     OR NEW.version<>OLD.version+1
     OR (OLD.status='preparing' AND NEW.status NOT IN('activated','cancelled'))
     OR (OLD.status='activated' AND NEW.status<>'rolled_back')
     OR OLD.status IN('cancelled','rolled_back') THEN
    RAISE EXCEPTION 'STORE_DOMAIN_REPLACEMENT_AUTHORITY_INVALID';
  END IF;
  RETURN NEW;
END $f$;
CREATE TRIGGER store_domain_replacements_guard BEFORE UPDATE OR DELETE ON saas.store_domain_replacements
  FOR EACH ROW EXECUTE FUNCTION saas.guard_store_domain_replacement();
ALTER TABLE saas.store_domain_replacements ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_domain_replacements FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.store_domain_replacements FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;

CREATE TABLE saas.store_domain_replacement_actions(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  replacement_id uuid NOT NULL,
  action text NOT NULL CHECK(action IN('activate','cancel','rollback')),
  operation_fingerprint character(64) NOT NULL CHECK(operation_fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object' AND pg_column_size(result_payload)<=32768),
  committed_at timestamptz NOT NULL,
  CONSTRAINT store_domain_replacement_actions_replacement_fk FOREIGN KEY(store_id,replacement_id) REFERENCES saas.store_domain_replacements(store_id,replacement_id) ON DELETE RESTRICT,
  CONSTRAINT store_domain_replacement_actions_store_fingerprint_key UNIQUE(store_id,operation_fingerprint)
);
CREATE TRIGGER store_domain_replacement_actions_immutable BEFORE UPDATE OR DELETE ON saas.store_domain_replacement_actions
  FOR EACH ROW EXECUTE FUNCTION saas.guard_store_domain_operation_mutation();
ALTER TABLE saas.store_domain_replacement_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_domain_replacement_actions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.store_domain_replacement_actions FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;

CREATE FUNCTION saas.store_domain_replacement_projection(p_replacement_id uuid) RETURNS jsonb
LANGUAGE sql STABLE STRICT SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
  SELECT jsonb_build_object(
    'schemaVersion',1,'id',replacement.replacement_id,
    'sourceStorefrontDomainId',replacement.source_storefront_domain_id,
    'targetStorefrontDomainId',replacement.target_storefront_domain_id,
    'targetAdminDomainId',replacement.target_admin_domain_id,
    'status',replacement.status,
    'ready',replacement.status<>'cancelled'
      AND storefront.status='active' AND storefront.verified_at IS NOT NULL
      AND storefront_provisioning.hostname_status='active' AND storefront_provisioning.ssl_status='active'
      AND storefront_provisioning.dns_status='ready' AND storefront_provisioning.origin_status='ready'
      AND storefront_provisioning.last_provider_error_code IS NULL AND NOT storefront_provisioning.requested_removal
      AND admin_domain.status='active' AND admin_domain.verified_at IS NOT NULL
      AND admin_domain.hostname_status='active' AND admin_domain.ssl_status='active'
      AND admin_domain.dns_status='ready' AND admin_domain.origin_status='ready'
      AND admin_domain.last_provider_error_code IS NULL AND NOT admin_domain.requested_removal,
    'version',replacement.version,
    'createdAt',saas.store_domain_timestamp(replacement.created_at),
    'updatedAt',saas.store_domain_timestamp(replacement.updated_at)
  )
  FROM saas.store_domain_replacements replacement
  JOIN saas.store_domains storefront ON storefront.id=replacement.target_storefront_domain_id AND storefront.store_id=replacement.store_id
  JOIN saas.store_domain_provisioning storefront_provisioning ON storefront_provisioning.domain_id=storefront.id
  JOIN saas.admin_domains admin_domain ON admin_domain.id=replacement.target_admin_domain_id AND admin_domain.store_id=replacement.store_id
  WHERE replacement.replacement_id=p_replacement_id
$f$;

CREATE FUNCTION saas.merchant_store_domain_replacement_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',jsonb_build_object('items',COALESCE(jsonb_agg(saas.store_domain_replacement_projection(replacement_id) ORDER BY created_at DESC),'[]'::jsonb))
    FROM saas.store_domain_replacements WHERE store_id=p_store_id;
END $f$;

CREATE FUNCTION saas.merchant_store_domain_replacement_prepare(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_operation_fingerprint text,p_source_storefront_domain_id uuid,p_target_storefront_domain_id uuid,p_storefront_hostname text,
  p_provider text,p_storefront_cname_target text,p_target_admin_domain_id uuid,p_admin_hostname text,p_admin_cname_target text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing saas.store_domain_replacements%ROWTYPE; source_domain saas.store_domains%ROWTYPE;
  source_admin saas.admin_domains%ROWTYPE; custom_limit numeric; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_source_storefront_domain_id IS NULL OR p_target_storefront_domain_id IS NULL OR p_target_admin_domain_id IS NULL
     OR p_operation_fingerprint!~'^[a-f0-9]{64}$' OR p_provider<>'cloudflare_for_saas'
     OR p_storefront_hostname IS NULL OR p_storefront_hostname<>lower(p_storefront_hostname)
     OR p_admin_hostname IS NULL OR p_admin_hostname<>lower(p_admin_hostname) OR p_admin_hostname!~'^admin\.'
     OR p_storefront_cname_target IS NULL OR p_storefront_cname_target<>lower(p_storefront_cname_target)
     OR p_admin_cname_target IS NULL OR p_admin_cname_target<>lower(p_admin_cname_target) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO existing FROM saas.store_domain_replacements
    WHERE (store_id=p_store_id AND (replacement_id=p_operation_id OR operation_fingerprint=p_operation_fingerprint))
       OR replacement_id=p_operation_id FOR UPDATE;
  IF FOUND THEN
    IF existing.store_id<>p_store_id OR existing.operation_fingerprint<>p_operation_fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',jsonb_build_object('replacement',saas.store_domain_replacement_projection(existing.replacement_id),'storefront',saas.store_domain_projection(existing.target_storefront_domain_id),'admin',saas.admin_domain_projection(existing.target_admin_domain_id));
    END IF;
    RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.store_domain_replacements WHERE store_id=p_store_id AND status IN('preparing','activated','rolled_back')) THEN
    RETURN QUERY SELECT 'limit_reached',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO source_domain FROM saas.store_domains WHERE id=p_source_storefront_domain_id AND store_id=p_store_id AND hostname_type='custom_domain' FOR UPDATE;
  IF source_domain.id IS NULL THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF source_domain.status<>'active' OR NOT source_domain.is_primary OR source_domain.verified_at IS NULL
     OR NOT EXISTS(SELECT 1 FROM saas.store_domain_provisioning WHERE domain_id=source_domain.id AND hostname_status='active' AND ssl_status='active' AND dns_status='ready' AND origin_status='ready' AND last_provider_error_code IS NULL AND NOT requested_removal) THEN
    RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO source_admin FROM saas.admin_domains WHERE store_id=p_store_id AND source_storefront_domain_id=source_domain.id AND management='system' FOR UPDATE;
  IF source_admin.id IS NULL OR source_admin.status<>'active' OR NOT source_admin.canonical OR source_admin.verified_at IS NULL
     OR source_admin.hostname_status<>'active' OR source_admin.ssl_status<>'active' OR source_admin.dns_status<>'ready' OR source_admin.origin_status<>'ready'
     OR source_admin.last_provider_error_code IS NOT NULL OR source_admin.requested_removal THEN
    RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN;
  END IF;
  SELECT effective_limit INTO custom_limit FROM saas.plan_limits WHERE plan_id=p_plan_id AND limit_key='customDomains';
  IF custom_limit IS NULL OR custom_limit<(SELECT count(*) FROM saas.store_domains WHERE store_id=p_store_id AND hostname_type='custom_domain' AND status<>'disabled') THEN
    RETURN QUERY SELECT 'limit_reached',NULL::jsonb; RETURN;
  END IF;
  IF EXISTS(SELECT 1 FROM saas.store_domains WHERE hostname IN(p_storefront_hostname,p_admin_hostname))
     OR EXISTS(SELECT 1 FROM saas.admin_domains WHERE hostname IN(p_storefront_hostname,p_admin_hostname)) THEN
    RETURN QUERY SELECT 'hostname_already_claimed',NULL::jsonb; RETURN;
  END IF;
  INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
  VALUES(p_target_storefront_domain_id,p_store_id,p_storefront_hostname,'custom_domain','pending',false,NULL,p_now,p_now,1);
  INSERT INTO saas.store_domain_provisioning(domain_id,store_id,provider,cname_target,next_check_at,created_at,updated_at)
  VALUES(p_target_storefront_domain_id,p_store_id,p_provider,p_storefront_cname_target,p_now,p_now,p_now);
  INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,verified_at,version,created_at,updated_at,provider,cname_target,next_check_at,management,source_storefront_domain_id)
  VALUES(p_target_admin_domain_id,p_store_id,p_admin_hostname,'custom_alias','pending_verification',false,NULL,1,p_now,p_now,p_provider,p_admin_cname_target,p_now,'system',p_target_storefront_domain_id);
  INSERT INTO saas.store_domain_replacements(replacement_id,store_id,source_storefront_domain_id,target_storefront_domain_id,target_admin_domain_id,operation_fingerprint,status,version,created_at,updated_at)
  VALUES(p_operation_id,p_store_id,p_source_storefront_domain_id,p_target_storefront_domain_id,p_target_admin_domain_id,p_operation_fingerprint,'preparing',1,p_now,p_now);
  payload:=jsonb_build_object('replacement',saas.store_domain_replacement_projection(p_operation_id),'storefront',saas.store_domain_projection(p_target_storefront_domain_id),'admin',saas.admin_domain_projection(p_target_admin_domain_id));
  RETURN QUERY SELECT 'prepared',payload;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'hostname_already_claimed',NULL::jsonb;
END $f$;

CREATE FUNCTION saas.merchant_store_domain_replacement_activate(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_action_operation_id uuid,p_action_fingerprint text,p_replacement_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; selected saas.store_domain_replacements%ROWTYPE; existing_action saas.store_domain_replacement_actions%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_action_operation_id IS NULL OR p_action_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO existing_action FROM saas.store_domain_replacement_actions WHERE operation_id=p_action_operation_id OR (store_id=p_store_id AND operation_fingerprint=p_action_fingerprint) FOR UPDATE;
  IF FOUND THEN
    IF existing_action.store_id<>p_store_id OR existing_action.replacement_id<>p_replacement_id OR existing_action.action<>'activate' OR existing_action.operation_fingerprint<>p_action_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',existing_action.result_payload; END IF;
    RETURN;
  END IF;
  SELECT * INTO selected FROM saas.store_domain_replacements WHERE replacement_id=p_replacement_id AND store_id=p_store_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF selected.status<>'preparing' OR NOT (saas.store_domain_replacement_projection(selected.replacement_id)->>'ready')::boolean THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.store_domains WHERE id=selected.source_storefront_domain_id AND store_id=p_store_id AND status='active' AND is_primary) THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_domains SET is_primary=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND is_primary AND id<>selected.target_storefront_domain_id;
  UPDATE saas.store_domains SET is_primary=true,updated_at=p_now,version=version+1 WHERE id=selected.target_storefront_domain_id;
  UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND canonical AND id<>selected.target_admin_domain_id;
  UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=selected.target_admin_domain_id;
  UPDATE saas.store_domain_replacements SET status='activated',updated_at=p_now,version=version+1 WHERE replacement_id=selected.replacement_id;
  payload:=saas.store_domain_replacement_projection(selected.replacement_id);
  INSERT INTO saas.store_domain_replacement_actions(operation_id,store_id,replacement_id,action,operation_fingerprint,result_payload,committed_at) VALUES(p_action_operation_id,p_store_id,p_replacement_id,'activate',p_action_fingerprint,payload,p_now);
  RETURN QUERY SELECT 'activated',payload;
END $f$;

CREATE FUNCTION saas.merchant_store_domain_replacement_cancel(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_action_operation_id uuid,p_action_fingerprint text,p_replacement_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; selected saas.store_domain_replacements%ROWTYPE; existing_action saas.store_domain_replacement_actions%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_action_operation_id IS NULL OR p_action_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO existing_action FROM saas.store_domain_replacement_actions WHERE operation_id=p_action_operation_id OR (store_id=p_store_id AND operation_fingerprint=p_action_fingerprint) FOR UPDATE;
  IF FOUND THEN
    IF existing_action.store_id<>p_store_id OR existing_action.replacement_id<>p_replacement_id OR existing_action.action<>'cancel' OR existing_action.operation_fingerprint<>p_action_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',existing_action.result_payload; END IF;
    RETURN;
  END IF;
  SELECT * INTO selected FROM saas.store_domain_replacements WHERE replacement_id=p_replacement_id AND store_id=p_store_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF selected.status<>'preparing' THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_domains SET status='disabled',is_primary=false,verified_at=NULL,updated_at=p_now,version=version+1 WHERE id=selected.target_storefront_domain_id;
  UPDATE saas.store_domain_provisioning SET requested_removal=true,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE domain_id=selected.target_storefront_domain_id;
  UPDATE saas.admin_domains SET status='disabled',canonical=false,verified_at=NULL,requested_removal=true,next_check_at=p_now,updated_at=p_now,version=version+1 WHERE id=selected.target_admin_domain_id;
  UPDATE saas.store_domain_replacements SET status='cancelled',updated_at=p_now,version=version+1 WHERE replacement_id=selected.replacement_id;
  payload:=saas.store_domain_replacement_projection(selected.replacement_id);
  INSERT INTO saas.store_domain_replacement_actions(operation_id,store_id,replacement_id,action,operation_fingerprint,result_payload,committed_at) VALUES(p_action_operation_id,p_store_id,p_replacement_id,'cancel',p_action_fingerprint,payload,p_now);
  RETURN QUERY SELECT 'cancelled',payload;
END $f$;

CREATE FUNCTION saas.merchant_store_domain_replacement_rollback(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_action_operation_id uuid,p_action_fingerprint text,p_replacement_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; selected saas.store_domain_replacements%ROWTYPE; source_admin_id uuid; existing_action saas.store_domain_replacement_actions%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_action_operation_id IS NULL OR p_action_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  SELECT * INTO existing_action FROM saas.store_domain_replacement_actions WHERE operation_id=p_action_operation_id OR (store_id=p_store_id AND operation_fingerprint=p_action_fingerprint) FOR UPDATE;
  IF FOUND THEN
    IF existing_action.store_id<>p_store_id OR existing_action.replacement_id<>p_replacement_id OR existing_action.action<>'rollback' OR existing_action.operation_fingerprint<>p_action_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',existing_action.result_payload; END IF;
    RETURN;
  END IF;
  SELECT * INTO selected FROM saas.store_domain_replacements WHERE replacement_id=p_replacement_id AND store_id=p_store_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF selected.status<>'activated' OR NOT EXISTS(
    SELECT 1 FROM saas.store_domains source_domain JOIN saas.store_domain_provisioning provisioning ON provisioning.domain_id=source_domain.id
    WHERE source_domain.id=selected.source_storefront_domain_id AND source_domain.store_id=p_store_id AND source_domain.status='active' AND source_domain.verified_at IS NOT NULL
      AND provisioning.hostname_status='active' AND provisioning.ssl_status='active' AND provisioning.dns_status='ready' AND provisioning.origin_status='ready'
      AND provisioning.last_provider_error_code IS NULL AND NOT provisioning.requested_removal
  ) THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  SELECT id INTO source_admin_id FROM saas.admin_domains WHERE store_id=p_store_id AND source_storefront_domain_id=selected.source_storefront_domain_id AND management='system'
    AND status='active' AND verified_at IS NOT NULL AND hostname_status='active' AND ssl_status='active' AND dns_status='ready' AND origin_status='ready'
    AND last_provider_error_code IS NULL AND NOT requested_removal FOR UPDATE;
  IF source_admin_id IS NULL THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_domains SET is_primary=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND is_primary AND id<>selected.source_storefront_domain_id;
  UPDATE saas.store_domains SET is_primary=true,updated_at=p_now,version=version+1 WHERE id=selected.source_storefront_domain_id;
  UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND canonical AND id<>source_admin_id;
  UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=source_admin_id;
  UPDATE saas.store_domain_replacements SET status='rolled_back',updated_at=p_now,version=version+1 WHERE replacement_id=selected.replacement_id;
  payload:=saas.store_domain_replacement_projection(selected.replacement_id);
  INSERT INTO saas.store_domain_replacement_actions(operation_id,store_id,replacement_id,action,operation_fingerprint,result_payload,committed_at) VALUES(p_action_operation_id,p_store_id,p_replacement_id,'rollback',p_action_fingerprint,payload,p_now);
  RETURN QUERY SELECT 'rolled_back',payload;
END $f$;

-- Ordinary primary/disable routes cannot bypass or destroy an in-flight replacement.
CREATE OR REPLACE FUNCTION saas.merchant_store_domain_bundle_make_primary(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_outcome text; selected_payload jsonb; companion_id uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM saas.store_domain_replacements WHERE store_id=p_store_id AND status='preparing') THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  SELECT result.outcome,result.result_payload INTO selected_outcome,selected_payload FROM saas.merchant_store_domain_make_primary(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_domain_id,p_expected_version) result;
  IF selected_outcome='activated' THEN
    SELECT id INTO companion_id FROM saas.admin_domains WHERE store_id=p_store_id AND source_storefront_domain_id=p_domain_id AND management='system' AND status='active' AND hostname_status='active' AND ssl_status='active' AND dns_status='ready' AND origin_status='ready' AND last_provider_error_code IS NULL AND NOT requested_removal FOR UPDATE;
    IF companion_id IS NOT NULL THEN
      UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND canonical AND id<>companion_id;
      UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=companion_id;
    END IF;
  END IF;
  RETURN QUERY SELECT selected_outcome,selected_payload;
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_store_domain_bundle_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_outcome text; selected_payload jsonb; companion_id uuid; companion_primary boolean; fallback_id uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM saas.store_domain_replacements WHERE store_id=p_store_id AND status='preparing' AND p_domain_id IN(source_storefront_domain_id,target_storefront_domain_id)) THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  SELECT id,canonical INTO companion_id,companion_primary FROM saas.admin_domains WHERE store_id=p_store_id AND source_storefront_domain_id=p_domain_id AND management='system' FOR UPDATE;
  SELECT result.outcome,result.result_payload INTO selected_outcome,selected_payload FROM saas.merchant_store_domain_disable(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_domain_id,p_expected_version) result;
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

CREATE OR REPLACE FUNCTION saas.merchant_admin_domain_make_primary(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; selected saas.admin_domains%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM saas.store_domain_replacements WHERE store_id=p_store_id AND status='preparing') THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected FROM saas.admin_domains WHERE id=p_domain_id AND store_id=p_store_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'domain_not_found',NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'stale_version',NULL::jsonb; RETURN; END IF;
  IF selected.status<>'active' OR selected.verified_at IS NULL OR selected.hostname_status<>'active' OR selected.ssl_status<>'active' OR selected.dns_status<>'ready' OR selected.origin_status<>'ready' OR selected.last_provider_error_code IS NOT NULL OR selected.requested_removal THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN; END IF;
  UPDATE saas.admin_domains SET canonical=false,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND canonical AND id<>p_domain_id;
  UPDATE saas.admin_domains SET canonical=true,updated_at=p_now,version=version+1 WHERE id=p_domain_id;
  RETURN QUERY SELECT 'activated',saas.admin_domain_projection(p_domain_id);
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_domain_disable(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_domain_id uuid,p_expected_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; selected saas.admin_domains%ROWTYPE; fallback_id uuid;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'custom_domains','configuration.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM saas.store_domain_replacements replacement JOIN saas.admin_domains domain_row ON domain_row.store_id=replacement.store_id
    WHERE replacement.store_id=p_store_id AND replacement.status='preparing' AND domain_row.id=p_domain_id
      AND domain_row.source_storefront_domain_id IN(replacement.source_storefront_domain_id,replacement.target_storefront_domain_id)) THEN
    RETURN QUERY SELECT 'not_ready',NULL::jsonb; RETURN;
  END IF;
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

REVOKE ALL ON FUNCTION saas.store_domain_replacement_projection(uuid),
  saas.merchant_store_domain_replacement_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.merchant_store_domain_replacement_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,uuid,text,text),
  saas.merchant_store_domain_replacement_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.merchant_store_domain_replacement_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.merchant_store_domain_replacement_rollback(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.merchant_store_domain_replacement_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.merchant_store_domain_replacement_prepare(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,uuid,text,text),
  saas.merchant_store_domain_replacement_activate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.merchant_store_domain_replacement_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.merchant_store_domain_replacement_rollback(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;

COMMIT;
