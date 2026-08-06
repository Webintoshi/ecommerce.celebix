BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $function$
BEGIN
  IF pg_catalog.to_regclass('saas.stores') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)') IS NULL
  THEN RAISE EXCEPTION 'SHIPPING_PROVIDER_FOUNDATION_SOURCE_INVALID'; END IF;
END
$function$;

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL
    OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL
    OR p_required_action IS NULL OR p_required_action NOT IN (
      'orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','shipping.read','shipping.manage',
      'carts.read','carts.manage','customers.read','customers.manage','customers.archive',
      'catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.import','catalog_admin.moderate',
      'promotions.read','promotions.manage','promotions.archive','content.read','content.manage','content.archive',
      'marketing.read','marketing.manage','configuration.read','configuration.manage','configuration.archive',
      'integrations.read','integrations.manage','analytics.read','inventory.read','inventory.manage',
      'purchasing.read','purchasing.manage','pricing.read','pricing.manage'
    ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores store_row WHERE store_row.id=p_store_id AND store_row.status='active')
  THEN RETURN 'store_inactive'; END IF;
  SELECT membership.role INTO membership_role FROM saas.memberships membership
  WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
    AND membership.principal_id=p_principal_id AND membership.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.subscriptions subscription
    JOIN saas.plans plan ON plan.id=subscription.plan_id AND plan.plan_code=subscription.plan_code AND plan.version=subscription.plan_version
    WHERE subscription.store_id=p_store_id AND subscription.plan_id=p_plan_id
      AND subscription.plan_code=p_plan_code AND subscription.plan_version=p_plan_version
      AND subscription.status='active' AND subscription.valid_from<=p_now
      AND (subscription.valid_until IS NULL OR subscription.valid_until>p_now)
      AND plan.status='active' AND plan.valid_from<=p_now AND (plan.valid_until IS NULL OR plan.valid_until>p_now)
  ) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.plan_features feature
    WHERE feature.plan_id=p_plan_id AND feature.enabled AND feature.feature_key=p_required_feature
  ) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (
    membership_role IN ('store_owner','admin')
    OR (membership_role='editor' AND p_required_action IN (
      'orders.read','orders.fulfill','orders.note','shipping.read','shipping.manage','carts.read','customers.read',
      'customers.manage','catalog_admin.read','catalog_admin.manage','promotions.read','content.read','content.manage',
      'marketing.read','configuration.read','integrations.read','analytics.read','inventory.read','inventory.manage',
      'purchasing.read','purchasing.manage','pricing.read'
    ))
    OR (membership_role='analyst' AND p_required_action IN (
      'orders.read','shipping.read','carts.read','customers.read','catalog_admin.read','promotions.read','content.read',
      'marketing.read','configuration.read','integrations.read','analytics.read','inventory.read','purchasing.read','pricing.read'
    ))
  ) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END
$function$;

CREATE FUNCTION saas.shipping_timestamp(p_value timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$function$;

CREATE FUNCTION saas.shipping_credential_envelope_valid(p_value jsonb,p_key_id text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $function$
DECLARE key_count integer;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value)<>'object' OR pg_catalog.pg_column_size(p_value)>32768
    OR p_key_id IS NULL OR p_key_id<>pg_catalog.btrim(p_key_id)
    OR pg_catalog.octet_length(p_key_id) NOT BETWEEN 1 AND 128
    OR p_key_id!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$'
  THEN RETURN false; END IF;
  SELECT pg_catalog.count(*) INTO key_count FROM pg_catalog.jsonb_object_keys(p_value);
  RETURN key_count=6
    AND p_value ?& ARRAY['algorithm','ciphertext','iv','keyId','tag','version']
    AND pg_catalog.jsonb_typeof(p_value->'algorithm')='string'
    AND pg_catalog.jsonb_typeof(p_value->'ciphertext')='string'
    AND pg_catalog.jsonb_typeof(p_value->'iv')='string'
    AND pg_catalog.jsonb_typeof(p_value->'keyId')='string'
    AND pg_catalog.jsonb_typeof(p_value->'tag')='string'
    AND pg_catalog.jsonb_typeof(p_value->'version')='number'
    AND p_value->>'algorithm'='A256GCM' AND p_value->>'version'='1'
    AND p_value->>'keyId'=p_key_id
    AND pg_catalog.octet_length(p_value->>'ciphertext') BETWEEN 2 AND 21846
    AND p_value->>'ciphertext'~'^[A-Za-z0-9_-]+$'
    AND p_value->>'iv'~'^[A-Za-z0-9_-]{16}$'
    AND p_value->>'tag'~'^[A-Za-z0-9_-]{22}$';
END
$function$;

CREATE FUNCTION saas.shipping_resource_batch_valid(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas
AS $function$
DECLARE entry jsonb; key_count integer; seen_ids text[]:=ARRAY[]::text[]; handler_count integer:=0;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value)<>'array' OR pg_catalog.jsonb_array_length(p_value) NOT BETWEEN 1 AND 300
    OR pg_catalog.pg_column_size(p_value)>262144 THEN RETURN false; END IF;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_value) LOOP
    IF pg_catalog.jsonb_typeof(entry)<>'object' THEN RETURN false; END IF;
    SELECT pg_catalog.count(*) INTO key_count FROM pg_catalog.jsonb_object_keys(entry);
    IF key_count<>6 OR NOT(entry ?& ARRAY['id','kind','providerResourceId','label','active','digest'])
      OR entry->>'id'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR entry->>'kind' NOT IN('brand','address','handler')
      OR entry->>'providerResourceId' IS NULL
      OR pg_catalog.octet_length(entry->>'providerResourceId') NOT BETWEEN 1 AND 200
      OR entry->>'providerResourceId'<>pg_catalog.btrim(entry->>'providerResourceId')
      OR entry->>'providerResourceId'!~'^[A-Za-z0-9_-]+$'
      OR entry->>'label' IS NULL OR pg_catalog.octet_length(entry->>'label') NOT BETWEEN 1 AND 200
      OR entry->>'label'<>pg_catalog.btrim(entry->>'label') OR entry->>'label'~'[[:cntrl:]]'
      OR pg_catalog.jsonb_typeof(entry->'active')<>'boolean'
      OR entry->>'digest'!~'^[a-f0-9]{64}$'
      OR entry->>'id'=ANY(seen_ids)
    THEN RETURN false; END IF;
    seen_ids:=pg_catalog.array_append(seen_ids,entry->>'id');
    IF entry->>'kind'='handler' AND (entry->>'active')::boolean THEN handler_count:=handler_count+1; END IF;
  END LOOP;
  RETURN handler_count>0;
EXCEPTION WHEN OTHERS THEN RETURN false;
END
$function$;

CREATE TABLE saas.shipping_provider_definitions (
  provider_code text PRIMARY KEY,
  display_name text NOT NULL,
  capability_version bigint NOT NULL CHECK(capability_version>0),
  supports_quote boolean NOT NULL,
  supports_shipment boolean NOT NULL,
  supports_label boolean NOT NULL,
  supports_cancel boolean NOT NULL,
  supports_return boolean NOT NULL,
  supports_tracking boolean NOT NULL,
  supports_cod boolean NOT NULL,
  enabled boolean NOT NULL,
  environment text NOT NULL CHECK(environment='live'),
  adapter_version bigint NOT NULL CHECK(adapter_version>0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
  CONSTRAINT shipping_provider_definitions_code_check CHECK(provider_code='basit_kargo'),
  CONSTRAINT shipping_provider_definitions_name_check CHECK(
    pg_catalog.octet_length(display_name) BETWEEN 1 AND 100 AND display_name=pg_catalog.btrim(display_name) AND display_name!~'[[:cntrl:]]'
  )
);

INSERT INTO saas.shipping_provider_definitions(
  provider_code,display_name,capability_version,supports_quote,supports_shipment,supports_label,
  supports_cancel,supports_return,supports_tracking,supports_cod,enabled,environment,adapter_version,created_at,updated_at
) VALUES('basit_kargo','Basit Kargo',1,true,true,true,true,true,true,true,true,'live',1,'2026-08-06T00:00:00Z','2026-08-06T00:00:00Z');

CREATE TABLE saas.shipping_provider_profiles (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE CASCADE,
  provider_code text NOT NULL REFERENCES saas.shipping_provider_definitions(provider_code) ON DELETE RESTRICT,
  status text NOT NULL CHECK(status IN('pending','active','disabled','revoked','attention_required')),
  credential_envelope jsonb NOT NULL,
  credential_digest char(64) NOT NULL CHECK(credential_digest~'^[a-f0-9]{64}$'),
  credential_key_id text NOT NULL,
  credential_version bigint NOT NULL CHECK(credential_version>0),
  account_identity_digest char(64) CHECK(account_identity_digest~'^[a-f0-9]{64}$'),
  selected_brand_resource_id uuid,
  selected_address_resource_id uuid,
  cod_delivered_marks_paid boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  revoked_at timestamptz,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT shipping_provider_profiles_store_id_key UNIQUE(store_id,id),
  CONSTRAINT shipping_provider_profiles_envelope_check CHECK(saas.shipping_credential_envelope_valid(credential_envelope,credential_key_id)),
  CONSTRAINT shipping_provider_profiles_lifecycle_check CHECK(
    (status='revoked' AND revoked_at IS NOT NULL)
    OR (status<>'revoked' AND revoked_at IS NULL)
  ),
  CONSTRAINT shipping_provider_profiles_active_check CHECK(
    status<>'active' OR (verified_at IS NOT NULL AND selected_brand_resource_id IS NOT NULL AND selected_address_resource_id IS NOT NULL)
  ),
  CONSTRAINT shipping_provider_profiles_timestamp_check CHECK(
    updated_at>=created_at AND (verified_at IS NULL OR verified_at>=created_at) AND (revoked_at IS NULL OR revoked_at>=created_at)
  )
);
CREATE UNIQUE INDEX shipping_provider_profiles_one_current
  ON saas.shipping_provider_profiles(store_id,provider_code) WHERE status<>'revoked';

CREATE TABLE saas.shipping_provider_resources (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  credential_version bigint NOT NULL CHECK(credential_version>0),
  resource_kind text NOT NULL CHECK(resource_kind IN('brand','address','handler')),
  provider_resource_id text NOT NULL,
  display_label text NOT NULL,
  canonical_digest char(64) NOT NULL CHECK(canonical_digest~'^[a-f0-9]{64}$'),
  active boolean NOT NULL,
  verified_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK(updated_at>=created_at AND verified_at>=created_at),
  CONSTRAINT shipping_provider_resources_store_id_key UNIQUE(store_id,id),
  CONSTRAINT shipping_provider_resources_profile_fk FOREIGN KEY(store_id,profile_id)
    REFERENCES saas.shipping_provider_profiles(store_id,id) ON DELETE CASCADE,
  CONSTRAINT shipping_provider_resources_provider_id_check CHECK(
    pg_catalog.octet_length(provider_resource_id) BETWEEN 1 AND 200
    AND provider_resource_id=pg_catalog.btrim(provider_resource_id) AND provider_resource_id~'^[A-Za-z0-9_-]+$'
  ),
  CONSTRAINT shipping_provider_resources_label_check CHECK(
    pg_catalog.octet_length(display_label) BETWEEN 1 AND 200
    AND display_label=pg_catalog.btrim(display_label) AND display_label!~'[[:cntrl:]]'
  ),
  CONSTRAINT shipping_provider_resources_provider_key UNIQUE(store_id,profile_id,resource_kind,provider_resource_id)
);

ALTER TABLE saas.shipping_provider_profiles
  ADD CONSTRAINT shipping_provider_profiles_brand_fk FOREIGN KEY(store_id,selected_brand_resource_id)
    REFERENCES saas.shipping_provider_resources(store_id,id) ON DELETE RESTRICT,
  ADD CONSTRAINT shipping_provider_profiles_address_fk FOREIGN KEY(store_id,selected_address_resource_id)
    REFERENCES saas.shipping_provider_resources(store_id,id) ON DELETE RESTRICT;

CREATE TABLE saas.shipping_validation_jobs (
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  profile_id uuid NOT NULL,
  credential_version bigint NOT NULL CHECK(credential_version>0),
  status text NOT NULL CHECK(status IN('queued','leased','succeeded','failed','superseded')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK(attempt_count BETWEEN 0 AND 10),
  next_run_at timestamptz NOT NULL,
  lease_id uuid,
  lease_owner text,
  lease_expires_at timestamptz,
  fence_token bigint NOT NULL DEFAULT 0 CHECK(fence_token>=0),
  safe_code text,
  version bigint NOT NULL DEFAULT 1 CHECK(version>0),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL CHECK(updated_at>=created_at),
  CONSTRAINT shipping_validation_jobs_store_id_key UNIQUE(store_id,id),
  CONSTRAINT shipping_validation_jobs_profile_fk FOREIGN KEY(store_id,profile_id)
    REFERENCES saas.shipping_provider_profiles(store_id,id) ON DELETE CASCADE,
  CONSTRAINT shipping_validation_jobs_lease_check CHECK(
    (status='leased' AND lease_id IS NOT NULL AND lease_owner IS NOT NULL AND lease_expires_at IS NOT NULL
      AND pg_catalog.octet_length(lease_owner) BETWEEN 1 AND 128 AND lease_owner=pg_catalog.btrim(lease_owner))
    OR (status<>'leased' AND lease_id IS NULL AND lease_owner IS NULL AND lease_expires_at IS NULL)
  ),
  CONSTRAINT shipping_validation_jobs_code_check CHECK(
    safe_code IS NULL OR safe_code~'^[a-z][a-z0-9_]{1,63}$'
  )
);
CREATE UNIQUE INDEX shipping_validation_jobs_one_open
  ON saas.shipping_validation_jobs(store_id,profile_id) WHERE status IN('queued','leased');
CREATE INDEX shipping_validation_jobs_claim_idx
  ON saas.shipping_validation_jobs(next_run_at,id) WHERE status='queued';

CREATE TABLE saas.shipping_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL,
  operation_kind text NOT NULL CHECK(operation_kind IN('save','select_resources','revoke')),
  payload_fingerprint char(64) NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=65536),
  committed_at timestamptz NOT NULL,
  CONSTRAINT shipping_operations_store_operation_key UNIQUE(store_id,operation_id),
  CONSTRAINT shipping_operations_profile_fk FOREIGN KEY(store_id,profile_id)
    REFERENCES saas.shipping_provider_profiles(store_id,id) ON DELETE RESTRICT
);
CREATE INDEX shipping_operations_store_idx ON saas.shipping_operations(store_id,committed_at DESC,operation_id DESC);

CREATE FUNCTION saas.shipping_guard_operation_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
BEGIN RAISE EXCEPTION 'SHIPPING_OPERATION_IMMUTABLE'; END
$function$;
CREATE TRIGGER shipping_operations_immutable BEFORE UPDATE OR DELETE ON saas.shipping_operations
FOR EACH ROW EXECUTE FUNCTION saas.shipping_guard_operation_immutable();

CREATE FUNCTION saas.shipping_guard_resource_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.profile_id<>OLD.profile_id
    OR NEW.credential_version<>OLD.credential_version OR NEW.resource_kind<>OLD.resource_kind
    OR NEW.provider_resource_id<>OLD.provider_resource_id OR NEW.created_at<>OLD.created_at
  THEN RAISE EXCEPTION 'SHIPPING_RESOURCE_IDENTITY_IMMUTABLE'; END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER shipping_provider_resources_identity_guard BEFORE UPDATE ON saas.shipping_provider_resources
FOR EACH ROW EXECUTE FUNCTION saas.shipping_guard_resource_identity();

ALTER TABLE saas.shipping_provider_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_provider_definitions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_provider_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_provider_profiles FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_provider_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_provider_resources FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_validation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_validation_jobs FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.shipping_operations FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE saas.shipping_provider_definitions,saas.shipping_provider_profiles,
  saas.shipping_provider_resources,saas.shipping_validation_jobs,saas.shipping_operations
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.shipping_connection_projection(p_store_id uuid,p_profile_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'providerCode',profile.provider_code,'displayName',definition.display_name,'status',profile.status,
    'credentialVersion',profile.credential_version,
    'selectedBrandLabel',brand.display_label,'selectedAddressLabel',address.display_label,
    'codDeliveredMarksPaid',profile.cod_delivered_marks_paid,
    'verifiedAt',CASE WHEN profile.verified_at IS NULL THEN NULL ELSE saas.shipping_timestamp(profile.verified_at) END,
    'version',profile.version
  ))
  FROM saas.shipping_provider_profiles profile
  JOIN saas.shipping_provider_definitions definition ON definition.provider_code=profile.provider_code
  LEFT JOIN saas.shipping_provider_resources brand ON brand.store_id=profile.store_id AND brand.id=profile.selected_brand_resource_id
  LEFT JOIN saas.shipping_provider_resources address ON address.store_id=profile.store_id AND address.id=profile.selected_address_resource_id
  WHERE profile.store_id=p_store_id AND profile.id=p_profile_id
$function$;

CREATE FUNCTION saas.shipping_connection_current(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_provider_code text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; selected_profile_id uuid;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.read'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_provider_code<>'basit_kargo' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT profile.id INTO selected_profile_id FROM saas.shipping_provider_profiles profile
  WHERE profile.store_id=p_store_id AND profile.provider_code=p_provider_code AND profile.status<>'revoked';
  IF selected_profile_id IS NULL THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,saas.shipping_connection_projection(p_store_id,selected_profile_id);
END
$function$;

CREATE FUNCTION saas.shipping_connection_save(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_profile_id uuid,p_job_id uuid,p_provider_code text,
  p_credential_envelope jsonb,p_credential_digest text,p_credential_key_id text,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; existing_operation saas.shipping_operations%ROWTYPE; selected_profile saas.shipping_provider_profiles%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_job_id IS NULL OR p_provider_code<>'basit_kargo'
    OR p_payload_fingerprint!~'^[a-f0-9]{64}$' OR p_credential_digest!~'^[a-f0-9]{64}$'
    OR p_expected_version<0 OR NOT saas.shipping_credential_envelope_valid(p_credential_envelope,p_credential_key_id)
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO existing_operation FROM saas.shipping_operations operation
  WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.store_id<>p_store_id OR existing_operation.payload_fingerprint<>p_payload_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload; END IF;
    RETURN;
  END IF;
  PERFORM 1 FROM saas.stores store_row WHERE store_row.id=p_store_id FOR UPDATE;
  SELECT profile.* INTO selected_profile FROM saas.shipping_provider_profiles profile
  WHERE profile.store_id=p_store_id AND profile.provider_code=p_provider_code AND profile.status<>'revoked' FOR UPDATE;
  IF FOUND THEN
    IF selected_profile.id<>p_profile_id OR selected_profile.version<>p_expected_version
    THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
    UPDATE saas.shipping_validation_jobs SET status='superseded',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,
      safe_code='credential_rotated',version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND profile_id=selected_profile.id AND status IN('queued','leased');
    UPDATE saas.shipping_provider_profiles SET
      status='pending',credential_envelope=p_credential_envelope,credential_digest=p_credential_digest,
      credential_key_id=p_credential_key_id,credential_version=credential_version+1,account_identity_digest=NULL,
      selected_brand_resource_id=NULL,selected_address_resource_id=NULL,verified_at=NULL,
      version=version+1,updated_at=p_now
    WHERE store_id=p_store_id AND id=selected_profile.id RETURNING * INTO selected_profile;
    DELETE FROM saas.shipping_provider_resources resource
    WHERE resource.store_id=p_store_id AND resource.profile_id=selected_profile.id;
  ELSE
    IF p_expected_version<>0 THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
    INSERT INTO saas.shipping_provider_profiles(
      id,store_id,provider_code,status,credential_envelope,credential_digest,credential_key_id,
      credential_version,cod_delivered_marks_paid,version,created_at,updated_at
    ) VALUES(
      p_profile_id,p_store_id,p_provider_code,'pending',p_credential_envelope,p_credential_digest,p_credential_key_id,
      1,false,1,p_now,p_now
    ) RETURNING * INTO selected_profile;
  END IF;
  INSERT INTO saas.shipping_validation_jobs(
    id,store_id,profile_id,credential_version,status,attempt_count,next_run_at,fence_token,version,created_at,updated_at
  ) VALUES(p_job_id,p_store_id,selected_profile.id,selected_profile.credential_version,'queued',0,p_now,0,1,p_now,p_now);
  INSERT INTO saas.shipping_operations(operation_id,store_id,profile_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,selected_profile.id,'save',p_payload_fingerprint,
    saas.shipping_connection_projection(p_store_id,selected_profile.id),p_now)
  RETURNING shipping_operations.result_payload INTO payload;
  RETURN QUERY SELECT 'saved'::text,payload;
END
$function$;

CREATE FUNCTION saas.shipping_connection_select_resources(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_profile_id uuid,p_brand_resource_id uuid,
  p_address_resource_id uuid,p_cod_delivered_marks_paid boolean,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; existing_operation saas.shipping_operations%ROWTYPE; selected_profile saas.shipping_provider_profiles%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_brand_resource_id IS NULL OR p_address_resource_id IS NULL
    OR p_cod_delivered_marks_paid IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version<1
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO existing_operation FROM saas.shipping_operations operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.store_id<>p_store_id OR existing_operation.payload_fingerprint<>p_payload_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload; END IF;
    RETURN;
  END IF;
  SELECT profile.* INTO selected_profile FROM saas.shipping_provider_profiles profile
  WHERE profile.store_id=p_store_id AND profile.id=p_profile_id AND profile.status<>'revoked' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected_profile.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  IF selected_profile.verified_at IS NULL
    OR NOT EXISTS(SELECT 1 FROM saas.shipping_provider_resources resource
      WHERE resource.store_id=p_store_id AND resource.profile_id=p_profile_id AND resource.id=p_brand_resource_id
        AND resource.resource_kind='brand' AND resource.active AND resource.credential_version=selected_profile.credential_version)
    OR NOT EXISTS(SELECT 1 FROM saas.shipping_provider_resources resource
      WHERE resource.store_id=p_store_id AND resource.profile_id=p_profile_id AND resource.id=p_address_resource_id
        AND resource.resource_kind='address' AND resource.active AND resource.credential_version=selected_profile.credential_version)
  THEN RETURN QUERY SELECT 'resource_invalid'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.shipping_provider_profiles SET status='active',selected_brand_resource_id=p_brand_resource_id,
    selected_address_resource_id=p_address_resource_id,cod_delivered_marks_paid=p_cod_delivered_marks_paid,
    version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_profile_id RETURNING * INTO selected_profile;
  payload:=saas.shipping_connection_projection(p_store_id,p_profile_id);
  INSERT INTO saas.shipping_operations(operation_id,store_id,profile_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,p_profile_id,'select_resources',p_payload_fingerprint,payload,p_now);
  RETURN QUERY SELECT 'selected'::text,payload;
END
$function$;

CREATE FUNCTION saas.shipping_connection_revoke(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_profile_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; existing_operation saas.shipping_operations%ROWTYPE; selected_profile saas.shipping_provider_profiles%ROWTYPE; payload jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.manage'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_profile_id IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version<1
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO existing_operation FROM saas.shipping_operations operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing_operation.store_id<>p_store_id OR existing_operation.payload_fingerprint<>p_payload_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload; END IF;
    RETURN;
  END IF;
  SELECT profile.* INTO selected_profile FROM saas.shipping_provider_profiles profile
  WHERE profile.store_id=p_store_id AND profile.id=p_profile_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected_profile.status='revoked' THEN RETURN QUERY SELECT 'already_revoked'::text,NULL::jsonb; RETURN; END IF;
  IF selected_profile.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.shipping_validation_jobs SET status='superseded',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,
    safe_code='connection_revoked',version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND profile_id=p_profile_id AND status IN('queued','leased');
  UPDATE saas.shipping_provider_profiles SET status='revoked',selected_brand_resource_id=NULL,
    selected_address_resource_id=NULL,revoked_at=p_now,version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_profile_id RETURNING * INTO selected_profile;
  payload:=saas.shipping_connection_projection(p_store_id,p_profile_id);
  INSERT INTO saas.shipping_operations(operation_id,store_id,profile_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,p_profile_id,'revoke',p_payload_fingerprint,payload,p_now);
  RETURN QUERY SELECT 'revoked'::text,payload;
END
$function$;

CREATE FUNCTION saas.shipping_connection_recover_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_payload_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; selected_operation saas.shipping_operations%ROWTYPE;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','shipping.read'
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO selected_operation FROM saas.shipping_operations operation WHERE operation.operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected_operation.store_id<>p_store_id OR selected_operation.payload_fingerprint<>p_payload_fingerprint
  THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,selected_operation.result_payload;
END
$function$;

CREATE FUNCTION saas.shipping_validation_claim(
  p_worker_id text,p_now timestamptz,p_lease_seconds integer,p_lease_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE selected_job saas.shipping_validation_jobs%ROWTYPE;
BEGIN
  IF p_worker_id IS NULL OR p_worker_id<>pg_catalog.btrim(p_worker_id) OR pg_catalog.octet_length(p_worker_id) NOT BETWEEN 1 AND 128
    OR p_worker_id~'[[:cntrl:]]' OR p_now IS NULL OR p_lease_seconds NOT BETWEEN 5 AND 900 OR p_lease_id IS NULL
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT candidate.* INTO selected_job FROM saas.shipping_validation_jobs candidate
  JOIN saas.shipping_provider_profiles profile ON profile.store_id=candidate.store_id AND profile.id=candidate.profile_id
  WHERE candidate.status='queued' AND candidate.next_run_at<=p_now AND candidate.attempt_count<5
    AND profile.status='pending' AND profile.credential_version=candidate.credential_version
  ORDER BY candidate.next_run_at,candidate.id FOR UPDATE OF candidate SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN QUERY SELECT 'empty'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.shipping_validation_jobs SET status='leased',attempt_count=attempt_count+1,
    lease_id=p_lease_id,lease_owner=p_worker_id,lease_expires_at=p_now+pg_catalog.make_interval(secs=>p_lease_seconds),
    fence_token=fence_token+1,version=version+1,updated_at=p_now
  WHERE id=selected_job.id RETURNING * INTO selected_job;
  RETURN QUERY SELECT 'claimed'::text,pg_catalog.jsonb_build_object(
    'jobId',selected_job.id,'storeId',selected_job.store_id,'profileId',selected_job.profile_id,
    'providerCode','basit_kargo','credentialVersion',selected_job.credential_version,
    'leaseId',selected_job.lease_id,'fenceToken',selected_job.fence_token,'version',selected_job.version
  );
END
$function$;

CREATE FUNCTION saas.shipping_validation_open_credential(
  p_job_id uuid,p_worker_id text,p_lease_id uuid,p_fence_token bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE selected_job saas.shipping_validation_jobs%ROWTYPE; selected_profile saas.shipping_provider_profiles%ROWTYPE;
BEGIN
  SELECT job.* INTO selected_job FROM saas.shipping_validation_jobs job WHERE job.id=p_job_id;
  IF NOT FOUND OR selected_job.status<>'leased' OR selected_job.lease_owner<>p_worker_id
    OR selected_job.lease_id<>p_lease_id OR selected_job.fence_token<>p_fence_token
    OR selected_job.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_invalid'::text,NULL::jsonb; RETURN; END IF;
  SELECT profile.* INTO selected_profile FROM saas.shipping_provider_profiles profile
  WHERE profile.store_id=selected_job.store_id AND profile.id=selected_job.profile_id
    AND profile.status='pending' AND profile.credential_version=selected_job.credential_version;
  IF NOT FOUND THEN RETURN QUERY SELECT 'credential_stale'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'opened'::text,pg_catalog.jsonb_build_object(
    'providerCode',selected_profile.provider_code,'credentialEnvelope',selected_profile.credential_envelope,
    'credentialDigest',selected_profile.credential_digest,'credentialKeyId',selected_profile.credential_key_id,
    'credentialVersion',selected_profile.credential_version
  );
END
$function$;

CREATE FUNCTION saas.shipping_validation_complete(
  p_job_id uuid,p_worker_id text,p_lease_id uuid,p_fence_token bigint,p_now timestamptz,
  p_account_identity_digest text,p_resources jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE selected_job saas.shipping_validation_jobs%ROWTYPE; selected_profile saas.shipping_provider_profiles%ROWTYPE; entry jsonb;
BEGIN
  IF p_account_identity_digest!~'^[a-f0-9]{64}$' OR NOT saas.shipping_resource_batch_valid(p_resources)
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT job.* INTO selected_job FROM saas.shipping_validation_jobs job WHERE job.id=p_job_id FOR UPDATE;
  IF NOT FOUND OR selected_job.status<>'leased' OR selected_job.lease_owner<>p_worker_id
    OR selected_job.lease_id<>p_lease_id OR selected_job.fence_token<>p_fence_token OR selected_job.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_invalid'::text,NULL::jsonb; RETURN; END IF;
  SELECT profile.* INTO selected_profile FROM saas.shipping_provider_profiles profile
  WHERE profile.store_id=selected_job.store_id AND profile.id=selected_job.profile_id FOR UPDATE;
  IF NOT FOUND OR selected_profile.status<>'pending' OR selected_profile.credential_version<>selected_job.credential_version
  THEN RETURN QUERY SELECT 'credential_stale'::text,NULL::jsonb; RETURN; END IF;
  DELETE FROM saas.shipping_provider_resources resource
  WHERE resource.store_id=selected_profile.store_id AND resource.profile_id=selected_profile.id;
  FOR entry IN SELECT value FROM pg_catalog.jsonb_array_elements(p_resources) LOOP
    INSERT INTO saas.shipping_provider_resources(
      id,store_id,profile_id,credential_version,resource_kind,provider_resource_id,display_label,
      canonical_digest,active,verified_at,created_at,updated_at
    ) VALUES(
      (entry->>'id')::uuid,selected_profile.store_id,selected_profile.id,selected_profile.credential_version,
      entry->>'kind',entry->>'providerResourceId',entry->>'label',entry->>'digest',(entry->>'active')::boolean,
      p_now,p_now,p_now
    );
  END LOOP;
  UPDATE saas.shipping_provider_profiles SET account_identity_digest=p_account_identity_digest,
    verified_at=p_now,version=version+1,updated_at=p_now
  WHERE store_id=selected_profile.store_id AND id=selected_profile.id;
  UPDATE saas.shipping_validation_jobs SET status='succeeded',lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,
    safe_code=NULL,version=version+1,updated_at=p_now WHERE id=selected_job.id;
  RETURN QUERY SELECT 'completed'::text,pg_catalog.jsonb_build_object(
    'profileId',selected_profile.id,'credentialVersion',selected_profile.credential_version
  );
END
$function$;

CREATE FUNCTION saas.shipping_validation_fail(
  p_job_id uuid,p_worker_id text,p_lease_id uuid,p_fence_token bigint,p_now timestamptz,
  p_failure_kind text,p_safe_code text,p_retry_after_seconds integer
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE selected_job saas.shipping_validation_jobs%ROWTYPE; terminal boolean;
BEGIN
  IF p_failure_kind NOT IN('credential_invalid','rejected','throttled','temporary_failure')
    OR p_safe_code!~'^[a-z][a-z0-9_]{1,63}$'
    OR (p_failure_kind IN('throttled','temporary_failure') AND p_retry_after_seconds NOT BETWEEN 1 AND 900)
    OR (p_failure_kind IN('credential_invalid','rejected') AND p_retry_after_seconds IS NOT NULL)
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT job.* INTO selected_job FROM saas.shipping_validation_jobs job WHERE job.id=p_job_id FOR UPDATE;
  IF NOT FOUND OR selected_job.status<>'leased' OR selected_job.lease_owner<>p_worker_id
    OR selected_job.lease_id<>p_lease_id OR selected_job.fence_token<>p_fence_token OR selected_job.lease_expires_at<=p_now
  THEN RETURN QUERY SELECT 'lease_invalid'::text,NULL::jsonb; RETURN; END IF;
  terminal:=p_failure_kind IN('credential_invalid','rejected') OR selected_job.attempt_count>=5;
  UPDATE saas.shipping_validation_jobs SET status=CASE WHEN terminal THEN 'failed' ELSE 'queued' END,
    next_run_at=CASE WHEN terminal THEN next_run_at ELSE p_now+pg_catalog.make_interval(secs=>p_retry_after_seconds) END,
    lease_id=NULL,lease_owner=NULL,lease_expires_at=NULL,safe_code=p_safe_code,version=version+1,updated_at=p_now
  WHERE id=selected_job.id;
  IF terminal THEN
    UPDATE saas.shipping_provider_profiles SET status='attention_required',version=version+1,updated_at=p_now
    WHERE store_id=selected_job.store_id AND id=selected_job.profile_id
      AND credential_version=selected_job.credential_version AND status='pending';
  END IF;
  RETURN QUERY SELECT CASE WHEN terminal THEN 'failed' ELSE 'requeued' END,
    pg_catalog.jsonb_build_object('jobId',selected_job.id,'safeCode',p_safe_code);
END
$function$;

CREATE FUNCTION saas.shipping_provider_preflight()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
  SELECT EXISTS(
    SELECT 1 FROM saas.shipping_provider_definitions definition
    WHERE definition.provider_code='basit_kargo' AND definition.enabled AND definition.environment='live'
  )
$function$;

REVOKE ALL ON FUNCTION
  saas.shipping_connection_projection(uuid,uuid),
  saas.shipping_connection_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.shipping_connection_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text,jsonb,text,text,bigint),
  saas.shipping_connection_select_resources(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,uuid,boolean,bigint),
  saas.shipping_connection_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.shipping_connection_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),
  saas.shipping_validation_claim(text,timestamptz,integer,uuid),
  saas.shipping_validation_open_credential(uuid,text,uuid,bigint,timestamptz),
  saas.shipping_validation_complete(uuid,text,uuid,bigint,timestamptz,text,jsonb),
  saas.shipping_validation_fail(uuid,text,uuid,bigint,timestamptz,text,text,integer),
  saas.shipping_provider_preflight()
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,
  celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.shipping_connection_current(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.shipping_connection_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,text,jsonb,text,text,bigint),
  saas.shipping_connection_select_resources(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,uuid,uuid,boolean,bigint),
  saas.shipping_connection_revoke(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.shipping_connection_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text)
TO celebix_saas_app;

GRANT EXECUTE ON FUNCTION
  saas.shipping_validation_claim(text,timestamptz,integer,uuid),
  saas.shipping_validation_open_credential(uuid,text,uuid,bigint,timestamptz),
  saas.shipping_validation_complete(uuid,text,uuid,bigint,timestamptz,text,jsonb),
  saas.shipping_validation_fail(uuid,text,uuid,bigint,timestamptz,text,text,integer),
  saas.shipping_provider_preflight()
TO celebix_saas_workflow;

GRANT USAGE ON SCHEMA saas TO celebix_saas_app,celebix_saas_workflow;

COMMIT;
