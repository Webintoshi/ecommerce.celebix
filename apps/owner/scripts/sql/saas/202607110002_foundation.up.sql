-- Phase 2A1 shared-SaaS PostgreSQL foundation.
-- Greenfield/disposable execution only; this file is not wired to any runtime or deployment.

BEGIN;

DO $phase2a1_foundation_precondition$
DECLARE
  role_name text;
BEGIN
  IF pg_catalog.to_regnamespace('saas') IS NOT NULL THEN
    RAISE EXCEPTION 'PHASE2A1_SCHEMA_PRECONDITION_FAILED: schema saas already exists';
  END IF;

  FOREACH role_name IN ARRAY ARRAY[
    'celebix_saas_owner',
    'celebix_saas_migrator',
    'celebix_saas_bootstrap',
    'celebix_saas_app',
    'celebix_saas_workflow',
    'celebix_saas_host_resolver',
    'celebix_saas_observability'
  ]
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = role_name) THEN
      RAISE EXCEPTION 'PHASE2A1_SCHEMA_PRECONDITION_FAILED: required role % is missing', role_name;
    END IF;
  END LOOP;
END
$phase2a1_foundation_precondition$;

SET LOCAL ROLE celebix_saas_owner;

CREATE SCHEMA saas AUTHORIZATION celebix_saas_owner;
REVOKE ALL ON SCHEMA saas FROM PUBLIC;

CREATE TABLE saas.principals (
  id uuid,
  issuer text NOT NULL,
  subject text NOT NULL,
  email text NOT NULL,
  email_verified boolean NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT principals_pkey PRIMARY KEY (id),
  CONSTRAINT principals_issuer_subject_key UNIQUE (issuer, subject),
  CONSTRAINT principals_authority_nonblank_check CHECK (
    issuer = btrim(issuer)
    AND subject = btrim(subject)
    AND char_length(issuer) BETWEEN 1 AND 2048
    AND char_length(subject) BETWEEN 1 AND 512
  ),
  CONSTRAINT principals_email_verified_check CHECK (email_verified),
  CONSTRAINT principals_email_normalized_check CHECK (
    email = lower(btrim(email))
    AND char_length(email) BETWEEN 3 AND 320
    AND email ~ '^[^[:space:]@]+@[^[:space:]@]+$'
  ),
  CONSTRAINT principals_timestamp_order_check CHECK (updated_at >= created_at)
);

CREATE TABLE saas.stores (
  id uuid,
  name text NOT NULL,
  slug text NOT NULL,
  status text NOT NULL,
  locale text NOT NULL,
  currency text NOT NULL,
  theme_key text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT stores_pkey PRIMARY KEY (id),
  CONSTRAINT stores_slug_key UNIQUE (slug),
  CONSTRAINT stores_id_slug_key UNIQUE (id, slug),
  CONSTRAINT stores_name_nonblank_check CHECK (
    name = btrim(name) AND char_length(name) BETWEEN 1 AND 160
  ),
  CONSTRAINT stores_slug_normalized_check CHECK (
    slug = lower(slug)
    AND char_length(slug) BETWEEN 3 AND 63
    AND slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  CONSTRAINT stores_status_check CHECK (status IN ('provisioning', 'active', 'suspended', 'failed')),
  CONSTRAINT stores_locale_check CHECK (locale = 'tr'),
  CONSTRAINT stores_currency_check CHECK (currency = 'TRY'),
  CONSTRAINT stores_theme_key_check CHECK (
    theme_key = btrim(theme_key) AND char_length(theme_key) BETWEEN 1 AND 80
  ),
  CONSTRAINT stores_timestamp_order_check CHECK (updated_at >= created_at)
);

CREATE TABLE saas.domains (
  id uuid,
  store_id uuid NOT NULL,
  normalized_hostname text NOT NULL,
  domain_type text NOT NULL,
  status text NOT NULL,
  canonical boolean NOT NULL DEFAULT false,
  cache_version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT domains_pkey PRIMARY KEY (id),
  CONSTRAINT domains_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT domains_hostname_key UNIQUE (normalized_hostname),
  CONSTRAINT domains_store_id_key UNIQUE (store_id, id),
  CONSTRAINT domains_hostname_normalized_check CHECK (
    normalized_hostname = lower(normalized_hostname)
    AND char_length(normalized_hostname) BETWEEN 3 AND 253
    AND normalized_hostname !~ '[*:/?#@[:space:]]'
    AND normalized_hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  ),
  CONSTRAINT domains_type_check CHECK (domain_type IN ('platform_subdomain', 'custom')),
  CONSTRAINT domains_status_check CHECK (status IN ('pending_verification', 'active', 'disabled')),
  CONSTRAINT domains_cache_version_check CHECK (cache_version > 0),
  CONSTRAINT domains_timestamp_order_check CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX domains_one_active_canonical_per_store_idx
  ON saas.domains (store_id)
  WHERE canonical AND status = 'active';

CREATE INDEX domains_store_status_idx ON saas.domains (store_id, status);

CREATE TABLE saas.memberships (
  id uuid,
  principal_id uuid NOT NULL,
  store_id uuid NOT NULL,
  role text NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT memberships_pkey PRIMARY KEY (id),
  CONSTRAINT memberships_principal_fk FOREIGN KEY (principal_id) REFERENCES saas.principals(id) ON DELETE RESTRICT,
  CONSTRAINT memberships_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT memberships_principal_store_key UNIQUE (principal_id, store_id),
  CONSTRAINT memberships_store_id_key UNIQUE (store_id, id),
  CONSTRAINT memberships_id_principal_key UNIQUE (id, principal_id),
  CONSTRAINT memberships_role_check CHECK (role IN ('store_owner', 'admin', 'editor', 'analyst')),
  CONSTRAINT memberships_status_check CHECK (status IN ('active', 'invited', 'revoked')),
  CONSTRAINT memberships_timestamp_order_check CHECK (updated_at >= created_at)
);

CREATE INDEX memberships_principal_status_idx ON saas.memberships (principal_id, status, store_id);
CREATE INDEX memberships_store_status_idx ON saas.memberships (store_id, status, principal_id);

CREATE TABLE saas.plans (
  id uuid,
  plan_code text NOT NULL,
  version integer NOT NULL,
  status text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT plans_pkey PRIMARY KEY (id),
  CONSTRAINT plans_code_version_key UNIQUE (plan_code, version),
  CONSTRAINT plans_identity_version_key UNIQUE (id, plan_code, version),
  CONSTRAINT plans_code_normalized_check CHECK (
    plan_code = lower(btrim(plan_code))
    AND char_length(plan_code) BETWEEN 1 AND 80
    AND plan_code ~ '^[a-z0-9]+(_[a-z0-9]+)*$'
  ),
  CONSTRAINT plans_version_check CHECK (version > 0),
  CONSTRAINT plans_status_check CHECK (status IN ('active', 'inactive', 'expired')),
  CONSTRAINT plans_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT plans_timestamp_order_check CHECK (updated_at >= created_at)
);

CREATE TABLE saas.plan_features (
  plan_id uuid NOT NULL,
  feature_key text NOT NULL,
  feature_ordinal smallint NOT NULL,
  enabled boolean NOT NULL,
  CONSTRAINT plan_features_pkey PRIMARY KEY (plan_id, feature_key),
  CONSTRAINT plan_features_plan_fk FOREIGN KEY (plan_id) REFERENCES saas.plans(id) ON DELETE RESTRICT,
  CONSTRAINT plan_features_plan_ordinal_key UNIQUE (plan_id, feature_ordinal),
  CONSTRAINT plan_features_key_check CHECK (feature_key IN (
    'catalog',
    'orders',
    'customers',
    'content',
    'media',
    'analytics',
    'checkout',
    'custom_domains',
    'staff_management',
    'promotions',
    'integrations',
    'accounting',
    'marketplaces'
  )),
  CONSTRAINT plan_features_ordinal_check CHECK (feature_ordinal BETWEEN 1 AND 13)
);

CREATE TABLE saas.plan_limits (
  plan_id uuid NOT NULL,
  limit_key text NOT NULL,
  limit_ordinal smallint NOT NULL,
  limit_value numeric(20,4) NOT NULL,
  effective_limit bigint GENERATED ALWAYS AS (floor(limit_value)) STORED,
  CONSTRAINT plan_limits_pkey PRIMARY KEY (plan_id, limit_key),
  CONSTRAINT plan_limits_plan_fk FOREIGN KEY (plan_id) REFERENCES saas.plans(id) ON DELETE RESTRICT,
  CONSTRAINT plan_limits_plan_ordinal_key UNIQUE (plan_id, limit_ordinal),
  CONSTRAINT plan_limits_key_check CHECK (limit_key IN (
    'products',
    'staff',
    'storageBytes',
    'monthlyOrders',
    'customDomains'
  )),
  CONSTRAINT plan_limits_value_check CHECK (limit_value >= 0),
  CONSTRAINT plan_limits_ordinal_check CHECK (limit_ordinal BETWEEN 1 AND 5)
);

CREATE TABLE saas.subscriptions (
  id uuid,
  store_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  plan_code text NOT NULL,
  plan_version integer NOT NULL,
  status text NOT NULL,
  valid_from timestamptz NOT NULL,
  valid_until timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT subscriptions_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT subscriptions_plan_version_fk FOREIGN KEY (plan_id, plan_code, plan_version)
    REFERENCES saas.plans(id, plan_code, version) ON DELETE RESTRICT,
  CONSTRAINT subscriptions_store_id_key UNIQUE (store_id, id),
  CONSTRAINT subscriptions_id_plan_key UNIQUE (id, plan_id),
  CONSTRAINT subscriptions_status_check CHECK (status IN ('active', 'inactive', 'expired')),
  CONSTRAINT subscriptions_validity_check CHECK (valid_until IS NULL OR valid_until > valid_from),
  CONSTRAINT subscriptions_timestamp_order_check CHECK (updated_at >= created_at)
);

CREATE UNIQUE INDEX subscriptions_one_active_per_store_idx
  ON saas.subscriptions (store_id)
  WHERE status = 'active';

CREATE INDEX subscriptions_plan_version_idx
  ON saas.subscriptions (plan_id, plan_code, plan_version);

CREATE TABLE saas.store_settings (
  id uuid,
  store_id uuid NOT NULL,
  key text NOT NULL,
  value jsonb NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT store_settings_pkey PRIMARY KEY (id),
  CONSTRAINT store_settings_store_fk FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT store_settings_store_key_key UNIQUE (store_id, key),
  CONSTRAINT store_settings_key_check CHECK (key IN ('locale', 'currency', 'themeKey')),
  CONSTRAINT store_settings_value_shape_check CHECK (
    jsonb_typeof(value) = 'string' AND pg_column_size(value) <= 4096
  ),
  CONSTRAINT store_settings_timestamp_order_check CHECK (updated_at >= created_at)
);

CREATE TABLE saas.tenant_operations (
  id uuid,
  idempotency_key text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  status text NOT NULL,
  result_store_id uuid,
  result_domain_id uuid,
  result_membership_id uuid,
  result_principal_id uuid,
  result_subscription_id uuid,
  result_plan_id uuid,
  result_payload jsonb,
  requested_at timestamptz NOT NULL,
  committed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT tenant_operations_pkey PRIMARY KEY (id),
  CONSTRAINT tenant_operations_idempotency_key_key UNIQUE (idempotency_key),
  CONSTRAINT tenant_operations_idempotency_key_canonical_check CHECK (
    idempotency_key = btrim(idempotency_key)
    AND char_length(idempotency_key) BETWEEN 1 AND 128
  ),
  CONSTRAINT tenant_operations_fingerprint_check CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT tenant_operations_status_check CHECK (status IN ('processing', 'committed', 'failed')),
  CONSTRAINT tenant_operations_store_domain_fk FOREIGN KEY (result_store_id, result_domain_id)
    REFERENCES saas.domains(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_operations_store_membership_fk FOREIGN KEY (result_store_id, result_membership_id)
    REFERENCES saas.memberships(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_operations_membership_principal_fk FOREIGN KEY (result_membership_id, result_principal_id)
    REFERENCES saas.memberships(id, principal_id) ON DELETE RESTRICT,
  CONSTRAINT tenant_operations_store_subscription_fk FOREIGN KEY (result_store_id, result_subscription_id)
    REFERENCES saas.subscriptions(store_id, id) ON DELETE RESTRICT,
  CONSTRAINT tenant_operations_subscription_plan_fk FOREIGN KEY (result_subscription_id, result_plan_id)
    REFERENCES saas.subscriptions(id, plan_id) ON DELETE RESTRICT,
  CONSTRAINT tenant_operations_result_payload_size_check CHECK (
    result_payload IS NULL OR pg_column_size(result_payload) <= 32768
  ),
  CONSTRAINT tenant_operations_result_payload_shape_check CHECK (
    result_payload IS NULL
    OR (
      jsonb_typeof(result_payload) = 'object'
      AND result_payload - ARRAY[
        'schemaVersion', 'operationId', 'replayed', 'store', 'primaryDomain',
        'membership', 'plan', 'provisioningStatus', 'panelUrl', 'storefrontUrl'
      ] = '{}'::jsonb
      AND result_payload @> '{"schemaVersion":1,"replayed":false,"provisioningStatus":"ready"}'::jsonb
      AND result_payload ?& ARRAY[
        'schemaVersion', 'operationId', 'replayed', 'store', 'primaryDomain',
        'membership', 'plan', 'provisioningStatus', 'panelUrl', 'storefrontUrl'
      ]
      AND (result_payload ->> 'operationId')::uuid = id
      AND jsonb_typeof(result_payload -> 'store') = 'object'
      AND (result_payload -> 'store') - ARRAY['id', 'slug', 'status'] = '{}'::jsonb
      AND result_payload #>> '{store,status}' = 'active'
      AND jsonb_typeof(result_payload -> 'primaryDomain') = 'object'
      AND (result_payload -> 'primaryDomain') - ARRAY[
        'schemaVersion', 'hostname', 'domainId', 'domainType', 'storeId',
        'storeSlug', 'canonicalHostname', 'status', 'cacheVersion'
      ] = '{}'::jsonb
      AND (result_payload #>> '{primaryDomain,schemaVersion}')::integer = 1
      AND jsonb_typeof(result_payload -> 'membership') = 'object'
      AND (result_payload -> 'membership') - ARRAY[
        'schemaVersion', 'id', 'principalId', 'storeId', 'role', 'status',
        'createdAt', 'updatedAt'
      ] = '{}'::jsonb
      AND (result_payload #>> '{membership,schemaVersion}')::integer = 1
      AND jsonb_typeof(result_payload -> 'plan') = 'object'
      AND (result_payload -> 'plan') - ARRAY[
        'schemaVersion', 'planId', 'planCode', 'version', 'status', 'features',
        'limits', 'validFrom', 'validUntil'
      ] = '{}'::jsonb
      AND (result_payload #>> '{plan,schemaVersion}')::integer = 1
      AND (result_payload #>> '{store,id}')::uuid = result_store_id
      AND result_payload #>> '{store,slug}' ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      AND (result_payload #>> '{primaryDomain,domainId}')::uuid = result_domain_id
      AND (result_payload #>> '{primaryDomain,storeId}')::uuid = result_store_id
      AND result_payload #>> '{primaryDomain,storeSlug}' = result_payload #>> '{store,slug}'
      AND result_payload #>> '{primaryDomain,domainType}' IN ('platform_subdomain', 'custom')
      AND result_payload #>> '{primaryDomain,status}' = 'active'
      AND (result_payload #>> '{primaryDomain,cacheVersion}')::bigint > 0
      AND result_payload #>> '{primaryDomain,hostname}' ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
      AND result_payload #>> '{primaryDomain,canonicalHostname}' ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
      AND (result_payload #>> '{membership,id}')::uuid = result_membership_id
      AND (result_payload #>> '{membership,principalId}')::uuid = result_principal_id
      AND (result_payload #>> '{membership,storeId}')::uuid = result_store_id
      AND result_payload #>> '{membership,role}' = 'store_owner'
      AND result_payload #>> '{membership,status}' = 'active'
      AND result_payload #>> '{membership,createdAt}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      AND result_payload #>> '{membership,updatedAt}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      AND (result_payload #>> '{plan,planId}')::uuid = result_plan_id
      AND result_payload #>> '{plan,planCode}' = 'free_starter'
      AND (result_payload #>> '{plan,version}')::integer = 1
      AND result_payload #>> '{plan,status}' = 'active'
      AND result_payload #> '{plan,features}' = '["catalog","orders","customers","content","media","analytics","checkout"]'::jsonb
      AND result_payload #> '{plan,limits}' = '{"products":100,"staff":1,"storageBytes":1000000000,"monthlyOrders":100,"customDomains":0}'::jsonb
      AND result_payload #>> '{plan,validFrom}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
      AND (
        NOT (result_payload -> 'plan' ? 'validUntil')
        OR (
          result_payload #>> '{plan,validUntil}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$'
          AND result_payload #>> '{plan,validUntil}' >= result_payload #>> '{plan,validFrom}'
        )
      )
      AND jsonb_typeof(result_payload -> 'panelUrl') = 'string'
      AND char_length(result_payload ->> 'panelUrl') BETWEEN 1 AND 2048
      AND result_payload ->> 'panelUrl' ~ '^https://'
      AND jsonb_typeof(result_payload -> 'storefrontUrl') = 'string'
      AND char_length(result_payload ->> 'storefrontUrl') BETWEEN 1 AND 2048
      AND result_payload ->> 'storefrontUrl' ~ '^https://'
    ) IS TRUE
  ),
  CONSTRAINT tenant_operations_committed_result_check CHECK (
    (
      status = 'committed'
      AND result_store_id IS NOT NULL
      AND result_domain_id IS NOT NULL
      AND result_membership_id IS NOT NULL
      AND result_principal_id IS NOT NULL
      AND result_subscription_id IS NOT NULL
      AND result_plan_id IS NOT NULL
      AND result_payload IS NOT NULL
      AND committed_at IS NOT NULL
    )
    OR (
      status IN ('processing', 'failed')
      AND result_store_id IS NULL
      AND result_domain_id IS NULL
      AND result_membership_id IS NULL
      AND result_principal_id IS NULL
      AND result_subscription_id IS NULL
      AND result_plan_id IS NULL
      AND result_payload IS NULL
      AND committed_at IS NULL
    )
  ),
  CONSTRAINT tenant_operations_timestamp_order_check CHECK (
    updated_at >= created_at
    AND requested_at <= created_at
    AND (committed_at IS NULL OR (committed_at >= created_at AND updated_at >= committed_at))
  )
);

CREATE INDEX tenant_operations_status_created_idx
  ON saas.tenant_operations (status, created_at);
CREATE INDEX tenant_operations_result_store_idx
  ON saas.tenant_operations (result_store_id);
CREATE INDEX tenant_operations_result_domain_idx
  ON saas.tenant_operations (result_store_id, result_domain_id);
CREATE INDEX tenant_operations_result_membership_idx
  ON saas.tenant_operations (result_store_id, result_membership_id);
CREATE INDEX tenant_operations_result_subscription_idx
  ON saas.tenant_operations (result_store_id, result_subscription_id);

CREATE FUNCTION saas.reject_principal_authority_change()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.issuer IS DISTINCT FROM OLD.issuer
     OR NEW.subject IS DISTINCT FROM OLD.subject
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'PRINCIPAL_AUTHORITY_IMMUTABLE';
  END IF;
  RETURN NEW;
END
$function$;

CREATE TRIGGER principals_authority_immutable
BEFORE UPDATE ON saas.principals
FOR EACH ROW EXECUTE FUNCTION saas.reject_principal_authority_change();

CREATE FUNCTION saas.reject_plan_version_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION 'PLAN_VERSION_IMMUTABLE';
END
$function$;

CREATE FUNCTION saas.guard_tenant_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
     OR NEW.payload_fingerprint IS DISTINCT FROM OLD.payload_fingerprint
     OR NEW.requested_at IS DISTINCT FROM OLD.requested_at
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'TENANT_OPERATION_AUTHORITY_IMMUTABLE';
  END IF;

  IF OLD.status = 'committed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'TENANT_OPERATION_COMMITTED_SNAPSHOT_IMMUTABLE';
  END IF;

  IF OLD.status = 'failed' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'TENANT_OPERATION_FAILED_TERMINAL';
  END IF;

  IF OLD.status = 'processing' AND NEW.status NOT IN ('processing', 'committed', 'failed') THEN
    RAISE EXCEPTION 'TENANT_OPERATION_INVALID_TRANSITION';
  END IF;

  IF OLD.status = 'processing'
     AND NEW.status = 'committed'
     AND NOT EXISTS (
       SELECT 1
       FROM saas.stores AS store
       JOIN saas.domains AS domain
         ON domain.id = NEW.result_domain_id
        AND domain.store_id = store.id
       JOIN saas.memberships AS membership
         ON membership.id = NEW.result_membership_id
        AND membership.store_id = store.id
       JOIN saas.subscriptions AS subscription
         ON subscription.id = NEW.result_subscription_id
        AND subscription.store_id = store.id
       JOIN saas.plans AS plan
         ON plan.id = NEW.result_plan_id
        AND plan.id = subscription.plan_id
        AND plan.plan_code = subscription.plan_code
        AND plan.version = subscription.plan_version
       WHERE store.id = NEW.result_store_id
         AND store.status = 'active'
         AND store.slug = NEW.result_payload #>> '{store,slug}'
         AND NEW.result_payload #>> '{store,status}' = store.status
         AND domain.canonical
         AND domain.status = 'active'
         AND domain.normalized_hostname = NEW.result_payload #>> '{primaryDomain,hostname}'
         AND domain.normalized_hostname = NEW.result_payload #>> '{primaryDomain,canonicalHostname}'
         AND domain.domain_type = NEW.result_payload #>> '{primaryDomain,domainType}'
         AND domain.status = NEW.result_payload #>> '{primaryDomain,status}'
         AND domain.cache_version = (NEW.result_payload #>> '{primaryDomain,cacheVersion}')::bigint
         AND store.id = (NEW.result_payload #>> '{primaryDomain,storeId}')::uuid
         AND store.slug = NEW.result_payload #>> '{primaryDomain,storeSlug}'
         AND NEW.result_payload ->> 'storefrontUrl' = 'https://' || domain.normalized_hostname
         AND membership.principal_id = NEW.result_principal_id
         AND membership.role = 'store_owner'
         AND membership.status = 'active'
         AND membership.role = NEW.result_payload #>> '{membership,role}'
         AND membership.status = NEW.result_payload #>> '{membership,status}'
         AND membership.created_at = (NEW.result_payload #>> '{membership,createdAt}')::timestamptz
         AND membership.updated_at = (NEW.result_payload #>> '{membership,updatedAt}')::timestamptz
         AND subscription.status = 'active'
         AND subscription.valid_from <= NEW.committed_at
         AND (subscription.valid_until IS NULL OR NEW.committed_at < subscription.valid_until)
         AND subscription.valid_from = (NEW.result_payload #>> '{plan,validFrom}')::timestamptz
         AND (
           (
             subscription.valid_until IS NULL
             AND NOT (NEW.result_payload -> 'plan' ? 'validUntil')
           )
           OR (
             subscription.valid_until IS NOT NULL
             AND subscription.valid_until = (NEW.result_payload #>> '{plan,validUntil}')::timestamptz
           )
         )
         AND plan.status = 'active'
         AND plan.plan_code = NEW.result_payload #>> '{plan,planCode}'
         AND plan.version = (NEW.result_payload #>> '{plan,version}')::integer
         AND NEW.result_payload #>> '{plan,status}' = subscription.status
         AND NEW.result_payload #> '{plan,features}' = (
           SELECT pg_catalog.jsonb_agg(feature.feature_key ORDER BY feature.feature_ordinal)
           FROM saas.plan_features AS feature
           WHERE feature.plan_id = plan.id AND feature.enabled
         )
         AND NEW.result_payload #> '{plan,limits}' = (
           SELECT pg_catalog.jsonb_object_agg(
             limit_row.limit_key,
             limit_row.effective_limit
             ORDER BY limit_row.limit_ordinal
           )
           FROM saas.plan_limits AS limit_row
           WHERE limit_row.plan_id = plan.id
         )
     ) THEN
    RAISE EXCEPTION 'TENANT_OPERATION_RESULT_GRAPH_MISMATCH';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER tenant_operations_replay_immutable
BEFORE UPDATE ON saas.tenant_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_tenant_operation_mutation();

ALTER TABLE saas.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.principals FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.stores FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.domains FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.memberships FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.plans FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.plan_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.plan_features FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.plan_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.plan_limits FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.subscriptions FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_settings FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.tenant_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.tenant_operations FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.has_active_membership(target_store_id uuid, allowed_roles text[])
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM saas.memberships AS membership
    WHERE membership.store_id = target_store_id
      AND membership.store_id = nullif(pg_catalog.current_setting('app.current_store_id', true), '')::uuid
      AND membership.principal_id = nullif(pg_catalog.current_setting('app.current_principal_id', true), '')::uuid
      AND membership.status = 'active'
      AND membership.role = ANY (allowed_roles)
  );
$function$;

REVOKE ALL ON FUNCTION saas.has_active_membership(uuid, text[]) FROM PUBLIC;

CREATE POLICY principals_own_identity
ON saas.principals
USING (id = nullif(pg_catalog.current_setting('app.current_principal_id', true), '')::uuid)
WITH CHECK (id = nullif(pg_catalog.current_setting('app.current_principal_id', true), '')::uuid);

CREATE POLICY stores_active_membership_read
ON saas.stores FOR SELECT
USING (saas.has_active_membership(id, ARRAY['store_owner', 'admin', 'editor', 'analyst']::text[]));

CREATE POLICY stores_privileged_membership_update
ON saas.stores FOR UPDATE
USING (saas.has_active_membership(id, ARRAY['store_owner', 'admin']::text[]))
WITH CHECK (saas.has_active_membership(id, ARRAY['store_owner', 'admin']::text[]));

CREATE POLICY domains_active_membership_read
ON saas.domains FOR SELECT
USING (saas.has_active_membership(store_id, ARRAY['store_owner', 'admin', 'editor', 'analyst']::text[]));

CREATE POLICY domains_privileged_membership_write
ON saas.domains FOR ALL
USING (saas.has_active_membership(store_id, ARRAY['store_owner', 'admin']::text[]))
WITH CHECK (saas.has_active_membership(store_id, ARRAY['store_owner', 'admin']::text[]));

CREATE POLICY memberships_principal_discovery
ON saas.memberships FOR SELECT
USING (
  principal_id = nullif(pg_catalog.current_setting('app.current_principal_id', true), '')::uuid
  AND status = 'active'
);

CREATE POLICY plans_current_subscription_read
ON saas.plans FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM saas.subscriptions AS subscription
    WHERE subscription.plan_id = plans.id
      AND subscription.store_id = nullif(pg_catalog.current_setting('app.current_store_id', true), '')::uuid
      AND subscription.status = 'active'
      AND saas.has_active_membership(subscription.store_id, ARRAY['store_owner', 'admin', 'editor', 'analyst']::text[])
  )
);

CREATE POLICY plan_features_current_subscription_read
ON saas.plan_features FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM saas.subscriptions AS subscription
    WHERE subscription.plan_id = plan_features.plan_id
      AND subscription.store_id = nullif(pg_catalog.current_setting('app.current_store_id', true), '')::uuid
      AND subscription.status = 'active'
      AND saas.has_active_membership(subscription.store_id, ARRAY['store_owner', 'admin', 'editor', 'analyst']::text[])
  )
);

CREATE POLICY plan_limits_current_subscription_read
ON saas.plan_limits FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM saas.subscriptions AS subscription
    WHERE subscription.plan_id = plan_limits.plan_id
      AND subscription.store_id = nullif(pg_catalog.current_setting('app.current_store_id', true), '')::uuid
      AND subscription.status = 'active'
      AND saas.has_active_membership(subscription.store_id, ARRAY['store_owner', 'admin', 'editor', 'analyst']::text[])
  )
);

CREATE POLICY subscriptions_active_membership_read
ON saas.subscriptions FOR SELECT
USING (saas.has_active_membership(store_id, ARRAY['store_owner', 'admin', 'editor', 'analyst']::text[]));

CREATE POLICY store_settings_active_membership_read
ON saas.store_settings FOR SELECT
USING (saas.has_active_membership(store_id, ARRAY['store_owner', 'admin', 'editor', 'analyst']::text[]));

CREATE POLICY store_settings_editor_write
ON saas.store_settings FOR ALL
USING (saas.has_active_membership(store_id, ARRAY['store_owner', 'admin', 'editor']::text[]))
WITH CHECK (saas.has_active_membership(store_id, ARRAY['store_owner', 'admin', 'editor']::text[]));

CREATE POLICY tenant_operations_active_membership_read
ON saas.tenant_operations FOR SELECT
USING (saas.has_active_membership(result_store_id, ARRAY['store_owner', 'admin', 'editor', 'analyst']::text[]));

CREATE FUNCTION saas.resolve_store_host(requested_hostname text)
RETURNS TABLE (
  schema_version integer,
  hostname text,
  domain_id uuid,
  domain_type text,
  store_id uuid,
  store_slug text,
  canonical_hostname text,
  status text,
  cache_version bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    1 AS schema_version,
    d.normalized_hostname AS hostname,
    d.id AS domain_id,
    d.domain_type,
    s.id AS store_id,
    s.slug AS store_slug,
    canonical.normalized_hostname AS canonical_hostname,
    d.status,
    d.cache_version
  FROM saas.domains AS d
  JOIN saas.stores AS s
    ON s.id = d.store_id
  JOIN saas.domains AS canonical
    ON canonical.store_id = d.store_id
   AND canonical.canonical
   AND canonical.status = 'active'
  WHERE requested_hostname = lower(requested_hostname)
    AND char_length(requested_hostname) BETWEEN 3 AND 253
    AND requested_hostname !~ '[*:/?#@[:space:]]'
    AND requested_hostname ~ '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
    AND d.normalized_hostname = requested_hostname
    AND d.status = 'active'
    AND s.status = 'active';
$function$;

REVOKE ALL ON FUNCTION saas.resolve_store_host(text) FROM PUBLIC;

COMMIT;
