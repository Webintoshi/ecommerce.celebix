-- Bind every SaaS store to one immutable, server-owned object-key namespace.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.stores') IS NULL
     OR pg_catalog.to_regclass('saas.store_media_namespaces') IS NOT NULL THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_PREREQUISITE_DRIFT';
  END IF;
  IF EXISTS(
    SELECT 1
    FROM saas.stores AS store
    WHERE store.status='active'
      AND NOT EXISTS(
        SELECT 1
        FROM saas.subscriptions AS subscription
        JOIN saas.plans AS plan
          ON plan.id=subscription.plan_id
         AND plan.plan_code=subscription.plan_code
         AND plan.version=subscription.plan_version
        JOIN saas.plan_features AS feature
          ON feature.plan_id=plan.id AND feature.feature_key='media' AND feature.enabled
        JOIN saas.plan_limits AS plan_limit
          ON plan_limit.plan_id=plan.id AND plan_limit.limit_key='storageBytes'
         AND plan_limit.effective_limit>=0
        WHERE subscription.store_id=store.id
          AND subscription.status='active'
          AND subscription.valid_from<=pg_catalog.transaction_timestamp()
          AND (subscription.valid_until IS NULL OR subscription.valid_until>pg_catalog.transaction_timestamp())
          AND plan.status='active'
          AND plan.valid_from<=pg_catalog.transaction_timestamp()
          AND (plan.valid_until IS NULL OR plan.valid_until>pg_catalog.transaction_timestamp())
      )
  ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_ACTIVE_SUBSCRIPTION_REQUIRED';
  END IF;
END
$precondition$;

CREATE TABLE saas.store_media_namespaces (
  store_id uuid,
  namespace_prefix text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  CONSTRAINT store_media_namespaces_pkey PRIMARY KEY (store_id),
  CONSTRAINT store_media_namespaces_store_fk
    FOREIGN KEY (store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT store_media_namespaces_prefix_key UNIQUE (namespace_prefix),
  CONSTRAINT store_media_namespaces_prefix_check
    CHECK (namespace_prefix = 'stores/' || store_id::text || '/'),
  CONSTRAINT store_media_namespaces_status_check
    CHECK (status IN ('active','suspended','deleting','deleted')),
  CONSTRAINT store_media_namespaces_version_check CHECK (version > 0),
  CONSTRAINT store_media_namespaces_timestamp_check CHECK (updated_at >= created_at)
);

CREATE FUNCTION saas.guard_store_media_namespace_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_DELETE_FORBIDDEN';
  END IF;
  IF NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.namespace_prefix IS DISTINCT FROM OLD.namespace_prefix
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.version<>OLD.version+1
     OR NEW.updated_at<=OLD.updated_at
     OR NOT (
       (OLD.status='active' AND NEW.status IN ('suspended','deleting'))
       OR (OLD.status='suspended' AND NEW.status IN ('active','deleting'))
       OR (OLD.status='deleting' AND NEW.status='deleted')
     ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_MUTATION_FORBIDDEN';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION saas.guard_store_media_namespace_mutation() FROM PUBLIC;

CREATE TRIGGER store_media_namespaces_immutable_authority
BEFORE UPDATE OR DELETE ON saas.store_media_namespaces
FOR EACH ROW EXECUTE FUNCTION saas.guard_store_media_namespace_mutation();

ALTER TABLE saas.store_media_namespaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_media_namespaces FORCE ROW LEVEL SECURITY;

INSERT INTO saas.store_media_namespaces(
  store_id,namespace_prefix,status,version,created_at,updated_at
)
SELECT
  store.id,
  'stores/' || store.id::text || '/',
  CASE WHEN store.status='active' THEN 'active' ELSE 'suspended' END,
  1,
  store.created_at,
  store.created_at
FROM saas.stores AS store
ORDER BY store.id;

-- Upgrade every durable pre-058 tenant result before the TypeScript parser starts
-- requiring the namespace readiness proof. The old exact-shape constraint and
-- immutable replay trigger are intentionally relaxed only inside this transaction.
ALTER TABLE saas.tenant_operations
  DROP CONSTRAINT tenant_operations_result_payload_shape_check;
ALTER TABLE saas.tenant_operations
  DISABLE TRIGGER tenant_operations_replay_immutable;

UPDATE saas.tenant_operations AS operation
SET result_payload=operation.result_payload || pg_catalog.jsonb_build_object(
  'mediaStorage',
  pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'status','ready',
    'version',namespace.version
  )
)
FROM saas.store_media_namespaces AS namespace
WHERE operation.status='committed'
  AND operation.result_store_id=namespace.store_id
  AND NOT operation.result_payload ? 'mediaStorage';

ALTER TABLE saas.tenant_operations
  ENABLE TRIGGER tenant_operations_replay_immutable;

ALTER TABLE saas.tenant_operations
  ADD CONSTRAINT tenant_operations_result_payload_shape_check CHECK (
    result_payload IS NULL
    OR (
      jsonb_typeof(result_payload) = 'object'
      AND result_payload - ARRAY[
        'schemaVersion', 'operationId', 'replayed', 'store', 'primaryDomain',
        'membership', 'plan', 'mediaStorage', 'provisioningStatus', 'panelUrl', 'storefrontUrl'
      ] = '{}'::jsonb
      AND result_payload @> '{"schemaVersion":1,"replayed":false,"provisioningStatus":"ready"}'::jsonb
      AND result_payload ?& ARRAY[
        'schemaVersion', 'operationId', 'replayed', 'store', 'primaryDomain',
        'membership', 'plan', 'mediaStorage', 'provisioningStatus', 'panelUrl', 'storefrontUrl'
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
      AND jsonb_typeof(result_payload -> 'mediaStorage') = 'object'
      AND (result_payload -> 'mediaStorage') - ARRAY['schemaVersion','status','version'] = '{}'::jsonb
      AND result_payload #> '{mediaStorage}' @> '{"schemaVersion":1,"status":"ready"}'::jsonb
      AND jsonb_typeof(result_payload #> '{mediaStorage,version}') = 'number'
      AND (result_payload #>> '{mediaStorage,version}')::bigint > 0
      AND (result_payload #>> '{mediaStorage,version}')::numeric =
        (result_payload #>> '{mediaStorage,version}')::bigint
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
  );

CREATE FUNCTION saas.guard_tenant_operation_media_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF OLD.status='processing' AND NEW.status='committed' AND NOT EXISTS(
    SELECT 1
    FROM saas.store_media_namespaces AS namespace
    WHERE namespace.store_id=NEW.result_store_id
      AND namespace.namespace_prefix='stores/' || NEW.result_store_id::text || '/'
      AND namespace.status='active'
      AND NEW.result_payload #>> '{mediaStorage,schemaVersion}'='1'
      AND NEW.result_payload #>> '{mediaStorage,status}'='ready'
      AND namespace.version=(NEW.result_payload #>> '{mediaStorage,version}')::bigint
  ) THEN
    RAISE EXCEPTION 'TENANT_OPERATION_MEDIA_SNAPSHOT_MISMATCH';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_tenant_operation_media_snapshot() FROM PUBLIC;
CREATE TRIGGER tenant_operations_media_snapshot_authority
BEFORE UPDATE ON saas.tenant_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_tenant_operation_media_snapshot();

REVOKE ALL ON TABLE saas.store_media_namespaces FROM PUBLIC;
REVOKE ALL ON TABLE saas.store_media_namespaces FROM
  celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_observability,celebix_saas_migrator;
GRANT SELECT,INSERT ON TABLE saas.store_media_namespaces TO celebix_saas_bootstrap;

CREATE TABLE saas.store_media_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  media_id uuid NOT NULL,
  product_id uuid NOT NULL,
  variant_id uuid,
  object_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  media_type text NOT NULL,
  alt_text text NOT NULL,
  width integer NOT NULL,
  height integer NOT NULL,
  byte_size bigint NOT NULL,
  payload_sha256 char(64) NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  state text NOT NULL,
  version bigint NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  uploaded_at timestamptz,
  committed_at timestamptz,
  cleanup_required_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT store_media_operations_namespace_fk
    FOREIGN KEY (store_id) REFERENCES saas.store_media_namespaces(store_id) ON DELETE RESTRICT,
  CONSTRAINT store_media_operations_product_fk
    FOREIGN KEY (store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT store_media_operations_variant_fk
    FOREIGN KEY (store_id,variant_id) REFERENCES saas.product_variants(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT store_media_operations_media_key UNIQUE (store_id,media_id),
  CONSTRAINT store_media_operations_object_key_check CHECK (
    object_key='stores/' || store_id::text || '/products/' || product_id::text || '/' || media_id::text ||
      CASE media_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' WHEN 'image/webp' THEN '.webp' ELSE '' END
  ),
  CONSTRAINT store_media_operations_public_url_check CHECK (
    public_url=btrim(public_url) AND char_length(public_url) BETWEEN 1 AND 2048
    AND public_url ~ '^https://[^/?#[:space:][:cntrl:]]+/'
    AND public_url !~ '[?#[:space:][:cntrl:]]'
    AND right(public_url,char_length(object_key)+1)='/' || object_key
  ),
  CONSTRAINT store_media_operations_type_check CHECK (media_type IN ('image/jpeg','image/png','image/webp')),
  CONSTRAINT store_media_operations_alt_check CHECK (
    alt_text=btrim(alt_text) AND char_length(alt_text)<=500 AND alt_text !~ '[[:cntrl:]]'
  ),
  CONSTRAINT store_media_operations_dimensions_check CHECK (width BETWEEN 1 AND 8192 AND height BETWEEN 1 AND 8192),
  CONSTRAINT store_media_operations_size_check CHECK (byte_size BETWEEN 1 AND 5242880),
  CONSTRAINT store_media_operations_digest_check CHECK (payload_sha256 ~ '^[a-f0-9]{64}$'),
  CONSTRAINT store_media_operations_fingerprint_check CHECK (payload_fingerprint ~ '^[a-f0-9]{64}$'),
  CONSTRAINT store_media_operations_state_check CHECK (state IN ('reserved','uploaded','committed','cleanup_required','deleted')),
  CONSTRAINT store_media_operations_version_check CHECK (version>0),
  CONSTRAINT store_media_operations_timestamp_check CHECK (
    updated_at>=created_at
    AND (uploaded_at IS NULL OR uploaded_at>=created_at)
    AND (committed_at IS NULL OR committed_at>=created_at)
    AND (cleanup_required_at IS NULL OR cleanup_required_at>=created_at)
    AND (deleted_at IS NULL OR deleted_at>=created_at)
    AND (state<>'reserved' OR (uploaded_at IS NULL AND committed_at IS NULL AND cleanup_required_at IS NULL AND deleted_at IS NULL))
    AND (state<>'uploaded' OR (uploaded_at IS NOT NULL AND committed_at IS NULL AND cleanup_required_at IS NULL AND deleted_at IS NULL))
    AND (state<>'committed' OR (uploaded_at IS NOT NULL AND committed_at IS NOT NULL AND cleanup_required_at IS NULL AND deleted_at IS NULL))
    AND (state<>'cleanup_required' OR (cleanup_required_at IS NOT NULL AND committed_at IS NULL AND deleted_at IS NULL))
    AND (state<>'deleted' OR (cleanup_required_at IS NOT NULL AND deleted_at IS NOT NULL AND committed_at IS NULL))
  )
);
CREATE INDEX store_media_operations_store_state_idx
  ON saas.store_media_operations(store_id,state,created_at,operation_id);

CREATE FUNCTION saas.store_media_operation_projection(p_operation_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'operationId',operation.operation_id,
    'mediaId',operation.media_id,
    'productId',operation.product_id,
    'objectKey',operation.object_key,
    'publicUrl',operation.public_url,
    'mediaType',operation.media_type,
    'byteSize',operation.byte_size,
    'payloadSha256',operation.payload_sha256,
    'state',operation.state,
    'version',operation.version
  )
  FROM saas.store_media_operations AS operation
  WHERE operation.operation_id=p_operation_id;
$function$;

CREATE FUNCTION saas.guard_store_media_operation_mutation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='DELETE'
     OR NEW.operation_id IS DISTINCT FROM OLD.operation_id
     OR NEW.store_id IS DISTINCT FROM OLD.store_id
     OR NEW.media_id IS DISTINCT FROM OLD.media_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.variant_id IS DISTINCT FROM OLD.variant_id
     OR NEW.object_key IS DISTINCT FROM OLD.object_key
     OR NEW.public_url IS DISTINCT FROM OLD.public_url
     OR NEW.media_type IS DISTINCT FROM OLD.media_type
     OR NEW.alt_text IS DISTINCT FROM OLD.alt_text
     OR NEW.width IS DISTINCT FROM OLD.width
     OR NEW.height IS DISTINCT FROM OLD.height
     OR NEW.byte_size IS DISTINCT FROM OLD.byte_size
     OR NEW.payload_sha256 IS DISTINCT FROM OLD.payload_sha256
     OR NEW.payload_fingerprint IS DISTINCT FROM OLD.payload_fingerprint
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.version<>OLD.version+1
     OR NEW.updated_at<=OLD.updated_at
     OR NOT (
       (OLD.state='reserved' AND NEW.state IN ('uploaded','cleanup_required'))
       OR (OLD.state='uploaded' AND NEW.state IN ('committed','cleanup_required'))
       OR (OLD.state='cleanup_required' AND NEW.state='deleted')
     ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_OPERATION_MUTATION_FORBIDDEN';
  END IF;
  RETURN NEW;
END
$function$;

REVOKE ALL ON FUNCTION saas.store_media_operation_projection(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.guard_store_media_operation_mutation() FROM PUBLIC;
CREATE TRIGGER store_media_operations_one_way
BEFORE UPDATE OR DELETE ON saas.store_media_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_store_media_operation_mutation();

ALTER TABLE saas.store_media_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_media_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE saas.store_media_operations FROM PUBLIC;
REVOKE ALL ON TABLE saas.store_media_operations FROM
  celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

-- The pre-saga attach function can create a durable product_media row without
-- any corresponding R2 upload proof. Keep it for rollback compatibility, but
-- remove the application role's ability to execute it.
REVOKE EXECUTE ON FUNCTION saas.media_attach_product(
  uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,
  uuid,uuid,uuid,text,text,text,text,integer,integer,bigint
) FROM celebix_saas_app;

ALTER TABLE saas.product_media
  ADD COLUMN object_deleted_at timestamptz;
ALTER TABLE saas.product_media
  ADD CONSTRAINT product_media_object_deleted_check CHECK (
    object_deleted_at IS NULL OR (status='archived' AND object_deleted_at>=archived_at)
  );

CREATE OR REPLACE FUNCTION saas.guard_product_media_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='UPDATE'
     AND OLD.status='archived'
     AND OLD.object_deleted_at IS NULL
     AND NEW.object_deleted_at IS NOT NULL
     AND NEW.id=OLD.id AND NEW.store_id=OLD.store_id AND NEW.product_id=OLD.product_id
     AND NEW.variant_id IS NOT DISTINCT FROM OLD.variant_id AND NEW.object_key=OLD.object_key
     AND NEW.public_url=OLD.public_url AND NEW.media_type=OLD.media_type
     AND NEW.alt_text=OLD.alt_text AND NEW.width IS NOT DISTINCT FROM OLD.width
     AND NEW.height IS NOT DISTINCT FROM OLD.height AND NEW.byte_size=OLD.byte_size
     AND NEW.sort_order=OLD.sort_order AND NEW.status=OLD.status
     AND NEW.created_at=OLD.created_at AND NEW.updated_at=OLD.updated_at
     AND NEW.archived_at IS NOT DISTINCT FROM OLD.archived_at AND NEW.version=OLD.version THEN
    RETURN NEW;
  END IF;
  IF TG_OP='UPDATE' AND (
    NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.product_id<>OLD.product_id
    OR NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.object_key<>OLD.object_key
    OR NEW.public_url<>OLD.public_url OR NEW.media_type<>OLD.media_type
    OR NEW.width IS DISTINCT FROM OLD.width OR NEW.height IS DISTINCT FROM OLD.height
    OR NEW.byte_size<>OLD.byte_size OR NEW.created_at<>OLD.created_at
    OR NEW.version<>OLD.version+1 OR OLD.status='archived'
    OR NEW.object_deleted_at IS DISTINCT FROM OLD.object_deleted_at
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_AUTHORITY_IMMUTABLE'; END IF;
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM saas.product_variants AS variant
    WHERE variant.id=NEW.variant_id AND variant.product_id=NEW.product_id AND variant.store_id=NEW.store_id
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_VARIANT_SCOPE_INVALID'; END IF;
  RETURN NEW;
END
$function$;

CREATE TABLE saas.product_media_archive_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  media_id uuid NOT NULL,
  product_id uuid NOT NULL,
  object_key text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  expected_version bigint NOT NULL,
  state text NOT NULL,
  version bigint NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  committed_at timestamptz,
  deleted_at timestamptz,
  CONSTRAINT product_media_archive_operations_store_fk
    FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CONSTRAINT product_media_archive_operations_media_fk
    FOREIGN KEY(store_id,media_id) REFERENCES saas.product_media(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT product_media_archive_operations_product_fk
    FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  CONSTRAINT product_media_archive_operations_fingerprint_check
    CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CONSTRAINT product_media_archive_operations_version_check
    CHECK(expected_version>0 AND version>0),
  CONSTRAINT product_media_archive_operations_state_check
    CHECK(state IN('reserved','committed','deleted')),
  CONSTRAINT product_media_archive_operations_lifecycle_check CHECK(
    (state='reserved' AND committed_at IS NULL AND deleted_at IS NULL)
    OR (state='committed' AND committed_at IS NOT NULL AND deleted_at IS NULL)
    OR (state='deleted' AND committed_at IS NOT NULL AND deleted_at IS NOT NULL)
  ),
  CONSTRAINT product_media_archive_operations_timestamp_check CHECK(
    updated_at>=created_at
    AND (committed_at IS NULL OR (committed_at>=created_at AND updated_at>=committed_at))
    AND (deleted_at IS NULL OR (deleted_at>=committed_at AND updated_at>=deleted_at))
  )
);
CREATE UNIQUE INDEX product_media_archive_operations_one_reserved
  ON saas.product_media_archive_operations(store_id,media_id)
  WHERE state='reserved';
CREATE INDEX product_media_archive_operations_store_state_idx
  ON saas.product_media_archive_operations(store_id,state,updated_at,operation_id);

CREATE FUNCTION saas.guard_reserved_product_media_archive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF NOT EXISTS(
    SELECT 1
    FROM saas.product_media_archive_operations AS operation
    WHERE operation.store_id=OLD.store_id
      AND operation.media_id=OLD.id
      AND operation.product_id=OLD.product_id
      AND operation.state='reserved'
  ) THEN
    RETURN NEW;
  END IF;
  IF OLD.status='pending' AND NEW.status='archived'
     AND NEW.id=OLD.id AND NEW.store_id=OLD.store_id AND NEW.product_id=OLD.product_id
     AND NEW.variant_id IS NOT DISTINCT FROM OLD.variant_id AND NEW.object_key=OLD.object_key
     AND NEW.public_url=OLD.public_url AND NEW.media_type=OLD.media_type
     AND NEW.alt_text=OLD.alt_text AND NEW.width IS NOT DISTINCT FROM OLD.width
     AND NEW.height IS NOT DISTINCT FROM OLD.height AND NEW.byte_size=OLD.byte_size
     AND NEW.sort_order=OLD.sort_order AND NEW.created_at=OLD.created_at
     AND NEW.updated_at>=OLD.updated_at AND OLD.archived_at IS NULL
     AND NEW.archived_at=NEW.updated_at
     AND NEW.object_deleted_at IS NOT DISTINCT FROM OLD.object_deleted_at
     AND NEW.version=OLD.version+1 THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'PRODUCT_MEDIA_ARCHIVE_RESERVED';
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_reserved_product_media_archive() FROM PUBLIC;
CREATE TRIGGER product_media_archive_reservation_fence
BEFORE UPDATE ON saas.product_media
FOR EACH ROW EXECUTE FUNCTION saas.guard_reserved_product_media_archive();

CREATE FUNCTION saas.guard_product_media_archive_operation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP='DELETE'
     OR NEW.operation_id<>OLD.operation_id OR NEW.store_id<>OLD.store_id
     OR NEW.media_id<>OLD.media_id OR NEW.product_id<>OLD.product_id
     OR NEW.object_key<>OLD.object_key OR NEW.payload_fingerprint<>OLD.payload_fingerprint
     OR NEW.expected_version<>OLD.expected_version OR NEW.created_at<>OLD.created_at
     OR NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at
     OR NOT(
       (OLD.state='reserved' AND NEW.state='committed'
        AND OLD.committed_at IS NULL AND NEW.committed_at=NEW.updated_at
        AND NEW.deleted_at IS NULL)
       OR (OLD.state='committed' AND NEW.state='deleted'
        AND NEW.committed_at=OLD.committed_at
        AND OLD.deleted_at IS NULL AND NEW.deleted_at=NEW.updated_at)
     ) THEN
    RAISE EXCEPTION 'PRODUCT_MEDIA_ARCHIVE_OPERATION_MUTATION_FORBIDDEN';
  END IF;
  RETURN NEW;
END
$function$;
REVOKE ALL ON FUNCTION saas.guard_product_media_archive_operation() FROM PUBLIC;
CREATE TRIGGER product_media_archive_operations_one_way
BEFORE UPDATE OR DELETE ON saas.product_media_archive_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_product_media_archive_operation();

ALTER TABLE saas.product_media_archive_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.product_media_archive_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE saas.product_media_archive_operations FROM PUBLIC;
REVOKE ALL ON TABLE saas.product_media_archive_operations FROM
  celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.media_archive_operation_projection(p_operation_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object('media',saas.media_projection(operation.media_id))
  FROM saas.product_media_archive_operations AS operation
  WHERE operation.operation_id=p_operation_id;
$function$;
REVOKE ALL ON FUNCTION saas.media_archive_operation_projection(uuid) FROM PUBLIC;

CREATE FUNCTION saas.media_reserve_product_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_media_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.product_media_archive_operations%ROWTYPE; selected saas.product_media%ROWTYPE;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.product_media_archive_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF operation.store_id=p_store_id AND operation.media_id=p_media_id
       AND operation.product_id=p_product_id AND operation.payload_fingerprint=p_fingerprint
       AND operation.expected_version=p_expected_version THEN
      RETURN QUERY SELECT 'operation_replayed'::text,saas.media_archive_operation_projection(p_operation_id);
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF;
    RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR p_product_id IS NULL OR p_media_id IS NULL OR p_expected_version<1
     OR EXISTS(SELECT 1 FROM saas.product_media_operations WHERE operation_id=p_operation_id)
     OR EXISTS(SELECT 1 FROM saas.store_media_operations WHERE operation_id=p_operation_id) THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected FROM saas.product_media
    WHERE store_id=p_store_id AND product_id=p_product_id AND id=p_media_id AND status='active'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF selected.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.product_media SET status='pending',updated_at=p_now,version=version+1 WHERE id=p_media_id;
  INSERT INTO saas.product_media_archive_operations(
    operation_id,store_id,media_id,product_id,object_key,payload_fingerprint,
    expected_version,state,version,created_at,updated_at
  ) VALUES(
    p_operation_id,p_store_id,p_media_id,p_product_id,selected.object_key,p_fingerprint,
    p_expected_version,'reserved',1,p_now,p_now
  );
  RETURN QUERY SELECT 'reserved'::text,saas.media_archive_operation_projection(p_operation_id);
EXCEPTION WHEN unique_violation THEN
  RETURN QUERY SELECT 'version_conflict'::text,NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.media_finalize_product_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_media_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.product_media_archive_operations%ROWTYPE; projection jsonb;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.product_media_archive_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR operation.store_id<>p_store_id OR operation.media_id<>p_media_id
     OR operation.product_id<>p_product_id OR operation.payload_fingerprint<>p_fingerprint
     OR operation.expected_version<>p_expected_version THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  IF operation.state IN('committed','deleted') THEN
    RETURN QUERY SELECT 'operation_replayed'::text,saas.media_archive_operation_projection(p_operation_id); RETURN;
  END IF;
  PERFORM 1 FROM saas.product_media
    WHERE store_id=p_store_id AND product_id=p_product_id AND id=p_media_id
      AND object_key=operation.object_key AND status='pending' AND version=p_expected_version+1
    FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.product_media SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_media_id;
  projection:=saas.media_archive_operation_projection(p_operation_id);
  INSERT INTO saas.product_media_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
  VALUES(p_operation_id,p_store_id,'archive_media',p_fingerprint,projection,p_now);
  UPDATE saas.product_media_archive_operations
    SET state='committed',committed_at=p_now,updated_at=p_now,version=version+1
    WHERE operation_id=p_operation_id;
  RETURN QUERY SELECT 'committed'::text,projection;
END
$function$;

CREATE FUNCTION saas.media_recover_product_archive(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_media_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.product_media_archive_operations%ROWTYPE;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.product_media_archive_operations WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF operation.store_id<>p_store_id OR operation.media_id<>p_media_id
     OR operation.product_id<>p_product_id OR operation.payload_fingerprint<>p_fingerprint
     OR operation.expected_version<>p_expected_version THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'found'::text,saas.media_archive_operation_projection(p_operation_id);
END
$function$;

REVOKE ALL ON FUNCTION saas.media_reserve_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_finalize_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_recover_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.media_reserve_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_finalize_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_recover_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) TO celebix_saas_app;
REVOKE EXECUTE ON FUNCTION saas.media_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint) FROM celebix_saas_app;

CREATE FUNCTION saas.media_reserve_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_media_id uuid,p_product_id uuid,p_variant_id uuid,
  p_object_key text,p_public_url text,p_media_type text,p_alt_text text,
  p_width integer,p_height integer,p_byte_size bigint,p_payload_sha256 text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; existing saas.store_media_operations%ROWTYPE; reserved_bytes bigint;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.store_media_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=p_store_id AND existing.payload_fingerprint=p_fingerprint
       AND existing.media_id=p_media_id AND existing.product_id=p_product_id
       AND existing.payload_sha256=p_payload_sha256 THEN
      RETURN QUERY SELECT 'operation_replayed'::text,saas.store_media_operation_projection(p_operation_id);
    ELSE RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; END IF;
    RETURN;
  END IF;
  IF p_operation_id IS NULL OR p_media_id IS NULL OR p_product_id IS NULL
     OR p_fingerprint !~ '^[a-f0-9]{64}$' OR p_payload_sha256 !~ '^[a-f0-9]{64}$'
     OR p_media_type NOT IN ('image/jpeg','image/png','image/webp')
     OR p_alt_text IS NULL OR p_alt_text<>btrim(p_alt_text) OR char_length(p_alt_text)>500 OR p_alt_text~'[[:cntrl:]]'
     OR p_width NOT BETWEEN 1 AND 8192 OR p_height NOT BETWEEN 1 AND 8192
     OR p_byte_size NOT BETWEEN 1 AND 5242880 THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  PERFORM 1 FROM saas.store_media_namespaces
    WHERE store_id=p_store_id AND namespace_prefix='stores/' || p_store_id::text || '/' AND status='active'
    FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'store_inactive'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id AND status<>'archived' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_variant_id IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM saas.product_variants
    WHERE store_id=p_store_id AND product_id=p_product_id AND id=p_variant_id AND status='active'
  ) THEN RETURN QUERY SELECT 'variant_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF p_object_key<>(
       'stores/' || p_store_id::text || '/products/' || p_product_id::text || '/' || p_media_id::text ||
       CASE p_media_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END
     )
     OR p_public_url !~ '^https://[^/?#[:space:][:cntrl:]]+/'
     OR p_public_url~'[?#[:space:][:cntrl:]]'
     OR right(p_public_url,char_length(p_object_key)+1)<>'/' || p_object_key THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  IF (SELECT pg_catalog.count(*) FROM saas.product_media
      WHERE store_id=p_store_id AND product_id=p_product_id AND status IN ('pending','active'))
     + (SELECT pg_catalog.count(*) FROM saas.store_media_operations
        WHERE store_id=p_store_id AND product_id=p_product_id AND state IN ('reserved','uploaded','cleanup_required')) >=16 THEN
    RETURN QUERY SELECT 'media_limit_reached'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT
    COALESCE((
      SELECT pg_catalog.sum(byte_size)
      FROM saas.product_media
      WHERE store_id=p_store_id AND (status<>'archived' OR object_deleted_at IS NULL)
    ),0)
    + COALESCE((SELECT pg_catalog.sum(byte_size) FROM saas.store_media_operations WHERE store_id=p_store_id AND state IN ('reserved','uploaded','cleanup_required')),0)
  INTO reserved_bytes;
  IF reserved_bytes+p_byte_size>p_storage_bytes THEN RETURN QUERY SELECT 'media_limit_reached'::text,NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.store_media_operations(
    operation_id,store_id,media_id,product_id,variant_id,object_key,public_url,media_type,alt_text,
    width,height,byte_size,payload_sha256,payload_fingerprint,state,version,created_at,updated_at
  ) VALUES(
    p_operation_id,p_store_id,p_media_id,p_product_id,p_variant_id,p_object_key,p_public_url,p_media_type,p_alt_text,
    p_width,p_height,p_byte_size,p_payload_sha256,p_fingerprint,'reserved',1,p_now,p_now
  );
  RETURN QUERY SELECT 'reserved'::text,saas.store_media_operation_projection(p_operation_id);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.media_mark_product_uploaded(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_media_id uuid,p_product_id uuid,p_payload_sha256 text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.store_media_operations%ROWTYPE;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.store_media_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR operation.store_id<>p_store_id OR operation.media_id<>p_media_id OR operation.product_id<>p_product_id OR operation.payload_sha256<>p_payload_sha256 THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  IF operation.state IN ('uploaded','committed') THEN RETURN QUERY SELECT 'operation_replayed'::text,saas.store_media_operation_projection(p_operation_id); RETURN; END IF;
  IF operation.state<>'reserved' THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_media_operations SET state='uploaded',uploaded_at=p_now,updated_at=p_now,version=version+1 WHERE operation_id=p_operation_id;
  RETURN QUERY SELECT 'uploaded'::text,saas.store_media_operation_projection(p_operation_id);
END
$function$;

CREATE FUNCTION saas.media_finalize_product(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_media_id uuid,p_product_id uuid,p_payload_sha256 text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.store_media_operations%ROWTYPE; next_order integer;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.store_media_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR operation.store_id<>p_store_id OR operation.media_id<>p_media_id OR operation.product_id<>p_product_id OR operation.payload_sha256<>p_payload_sha256 THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  IF operation.state='committed' THEN RETURN QUERY SELECT 'operation_replayed'::text,saas.store_media_operation_projection(p_operation_id); RETURN; END IF;
  IF operation.state<>'uploaded' THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id AND status<>'archived' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found'::text,NULL::jsonb; RETURN; END IF;
  SELECT COALESCE(pg_catalog.max(sort_order)+1,0) INTO next_order FROM saas.product_media WHERE store_id=p_store_id AND product_id=p_product_id AND status='active';
  IF next_order>15 THEN RETURN QUERY SELECT 'media_limit_reached'::text,NULL::jsonb; RETURN; END IF;
  INSERT INTO saas.product_media(
    id,store_id,product_id,variant_id,object_key,public_url,media_type,alt_text,width,height,
    byte_size,sort_order,status,created_at,updated_at,version
  ) VALUES(
    operation.media_id,operation.store_id,operation.product_id,operation.variant_id,operation.object_key,
    operation.public_url,operation.media_type,operation.alt_text,operation.width,operation.height,
    operation.byte_size,next_order,'active',operation.created_at,p_now,1
  );
  UPDATE saas.store_media_operations SET state='committed',committed_at=p_now,updated_at=p_now,version=version+1 WHERE operation_id=p_operation_id;
  RETURN QUERY SELECT 'committed'::text,saas.store_media_operation_projection(p_operation_id);
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.media_recover_product_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_media_id uuid,p_product_id uuid,p_payload_sha256 text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.store_media_operations%ROWTYPE;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.store_media_operations WHERE operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'media_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF operation.store_id<>p_store_id OR operation.media_id<>p_media_id OR operation.product_id<>p_product_id OR operation.payload_sha256<>p_payload_sha256 THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found'::text,saas.store_media_operation_projection(p_operation_id);
END
$function$;

CREATE FUNCTION saas.media_require_product_cleanup(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_media_id uuid,p_product_id uuid,p_payload_sha256 text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.store_media_operations%ROWTYPE;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.store_media_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR operation.store_id<>p_store_id OR operation.media_id<>p_media_id OR operation.product_id<>p_product_id OR operation.payload_sha256<>p_payload_sha256 THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  IF operation.state='cleanup_required' THEN RETURN QUERY SELECT 'operation_replayed'::text,saas.store_media_operation_projection(p_operation_id); RETURN; END IF;
  IF operation.state NOT IN ('reserved','uploaded') THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_media_operations SET state='cleanup_required',cleanup_required_at=p_now,updated_at=p_now,version=version+1 WHERE operation_id=p_operation_id;
  RETURN QUERY SELECT 'cleanup_required'::text,saas.store_media_operation_projection(p_operation_id);
END
$function$;

CREATE FUNCTION saas.media_mark_product_deleted(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_media_id uuid,p_product_id uuid,p_payload_sha256 text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE authority_error text; operation saas.store_media_operations%ROWTYPE;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO operation FROM saas.store_media_operations WHERE operation_id=p_operation_id FOR UPDATE;
  IF NOT FOUND OR operation.store_id<>p_store_id OR operation.media_id<>p_media_id OR operation.product_id<>p_product_id OR operation.payload_sha256<>p_payload_sha256 THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  IF operation.state='deleted' THEN RETURN QUERY SELECT 'operation_replayed'::text,saas.store_media_operation_projection(p_operation_id); RETURN; END IF;
  IF operation.state<>'cleanup_required' THEN RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN; END IF;
  UPDATE saas.store_media_operations SET state='deleted',deleted_at=p_now,updated_at=p_now,version=version+1 WHERE operation_id=p_operation_id;
  RETURN QUERY SELECT 'deleted'::text,saas.store_media_operation_projection(p_operation_id);
END
$function$;

CREATE FUNCTION saas.media_mark_archived_object_deleted(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
  p_operation_id uuid,p_media_id uuid,p_product_id uuid,p_object_key text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  selected saas.product_media%ROWTYPE;
  archive_operation saas.product_media_archive_operations%ROWTYPE;
BEGIN
  authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT * INTO selected
  FROM saas.product_media
  WHERE store_id=p_store_id AND id=p_media_id AND product_id=p_product_id
    AND object_key=p_object_key AND status='archived'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO archive_operation
  FROM saas.product_media_archive_operations
  WHERE operation_id=p_operation_id
  FOR UPDATE;
  IF NOT FOUND
     OR archive_operation.store_id<>p_store_id
     OR archive_operation.media_id<>p_media_id
     OR archive_operation.product_id<>p_product_id
     OR archive_operation.object_key<>p_object_key
     OR archive_operation.state NOT IN('committed','deleted')
     OR NOT EXISTS(
    SELECT 1 FROM saas.product_media_operations AS operation
    WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id
      AND operation.operation_kind='archive_media'
      AND operation.result_payload #>> '{media,id}'=p_media_id::text
      AND operation.result_payload #>> '{media,productId}'=p_product_id::text
      AND operation.result_payload #>> '{media,objectKey}'=p_object_key
      AND operation.result_payload #>> '{media,status}'='archived'
  ) THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  IF selected.object_deleted_at IS NOT NULL THEN
    IF archive_operation.state<>'deleted' THEN
      RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
    END IF;
    RETURN QUERY SELECT 'operation_replayed'::text,
      pg_catalog.jsonb_build_object('media',saas.media_projection(p_media_id));
    RETURN;
  END IF;
  IF archive_operation.state<>'committed' THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  UPDATE saas.product_media SET object_deleted_at=p_now WHERE id=p_media_id;
  UPDATE saas.product_media_archive_operations
  SET state='deleted',deleted_at=p_now,updated_at=p_now,version=version+1
  WHERE operation_id=p_operation_id;
  RETURN QUERY SELECT 'deleted'::text,
    pg_catalog.jsonb_build_object('media',saas.media_projection(p_media_id));
END
$function$;

REVOKE ALL ON FUNCTION saas.media_reserve_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_mark_product_uploaded(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_finalize_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_recover_product_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_require_product_cleanup(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_mark_product_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.media_mark_archived_object_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.media_reserve_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_mark_product_uploaded(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_finalize_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_recover_product_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_require_product_cleanup(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_mark_product_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_mark_archived_object_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text) TO celebix_saas_app;

DO $postcondition$
BEGIN
  IF EXISTS(
    SELECT store.id
    FROM saas.stores AS store
    LEFT JOIN saas.store_media_namespaces AS namespace
      ON namespace.store_id=store.id
     AND namespace.namespace_prefix='stores/' || store.id::text || '/'
    GROUP BY store.id
    HAVING pg_catalog.count(namespace.store_id)<>1
  ) THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_BACKFILL_INVALID';
  END IF;
END
$postcondition$;

COMMIT;
