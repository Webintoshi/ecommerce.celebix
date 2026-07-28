-- Disposable-only rollback. Durable namespace rows must be removed explicitly first.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.store_media_namespaces') IS NULL
     OR pg_catalog.to_regprocedure('saas.guard_store_media_namespace_mutation()') IS NULL THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_ROLLBACK_DRIFT';
  END IF;
  IF EXISTS(SELECT 1 FROM saas.store_media_namespaces) THEN
    RAISE EXCEPTION 'STORE_MEDIA_NAMESPACE_ROLLBACK_REQUIRES_EMPTY';
  END IF;
END
$precondition$;

DROP FUNCTION saas.media_mark_product_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text);
DROP FUNCTION saas.media_mark_archived_object_deleted(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text);
DROP FUNCTION saas.media_recover_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint);
DROP FUNCTION saas.media_finalize_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint);
DROP FUNCTION saas.media_reserve_product_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint);
DROP FUNCTION saas.media_archive_operation_projection(uuid);
DROP TRIGGER product_media_archive_reservation_fence ON saas.product_media;
DROP FUNCTION saas.guard_reserved_product_media_archive();
DROP TRIGGER product_media_archive_operations_one_way ON saas.product_media_archive_operations;
DROP FUNCTION saas.guard_product_media_archive_operation();
DROP TABLE saas.product_media_archive_operations;
DROP FUNCTION saas.media_require_product_cleanup(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text);
DROP FUNCTION saas.media_recover_product_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text);
DROP FUNCTION saas.media_finalize_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text);
DROP FUNCTION saas.media_mark_product_uploaded(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,uuid,uuid,text);
DROP FUNCTION saas.media_reserve_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,uuid,text,text,text,text,integer,integer,bigint,text);
DROP TRIGGER store_media_operations_one_way ON saas.store_media_operations;
DROP FUNCTION saas.guard_store_media_operation_mutation();
DROP FUNCTION saas.store_media_operation_projection(uuid);
DROP TABLE saas.store_media_operations;

DROP TRIGGER tenant_operations_media_snapshot_authority ON saas.tenant_operations;
DROP FUNCTION saas.guard_tenant_operation_media_snapshot();

ALTER TABLE saas.tenant_operations
  DROP CONSTRAINT tenant_operations_result_payload_shape_check;
ALTER TABLE saas.tenant_operations
  DISABLE TRIGGER tenant_operations_replay_immutable;
UPDATE saas.tenant_operations
SET result_payload=result_payload - 'mediaStorage'
WHERE status='committed' AND result_payload ? 'mediaStorage';
ALTER TABLE saas.tenant_operations
  ENABLE TRIGGER tenant_operations_replay_immutable;
ALTER TABLE saas.tenant_operations
  ADD CONSTRAINT tenant_operations_result_payload_shape_check CHECK (
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
  );

GRANT EXECUTE ON FUNCTION saas.media_attach_product(
  uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,
  uuid,uuid,uuid,text,text,text,text,integer,integer,bigint
) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.media_archive_product(
  uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,
  uuid,uuid,bigint
) TO celebix_saas_app;

ALTER TABLE saas.product_media DROP CONSTRAINT product_media_object_deleted_check;
CREATE OR REPLACE FUNCTION saas.guard_product_media_authority()
RETURNS trigger
LANGUAGE plpgsql
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    NEW.id <> OLD.id OR NEW.store_id <> OLD.store_id OR NEW.product_id <> OLD.product_id
    OR NEW.variant_id IS DISTINCT FROM OLD.variant_id OR NEW.object_key <> OLD.object_key
    OR NEW.public_url <> OLD.public_url OR NEW.media_type <> OLD.media_type
    OR NEW.width IS DISTINCT FROM OLD.width OR NEW.height IS DISTINCT FROM OLD.height
    OR NEW.byte_size <> OLD.byte_size OR NEW.created_at <> OLD.created_at
    OR NEW.version <> OLD.version + 1
    OR OLD.status = 'archived'
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_AUTHORITY_IMMUTABLE'; END IF;
  IF NEW.variant_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM saas.product_variants AS variant
    WHERE variant.id = NEW.variant_id AND variant.product_id = NEW.product_id AND variant.store_id = NEW.store_id
  ) THEN RAISE EXCEPTION 'PRODUCT_MEDIA_VARIANT_SCOPE_INVALID'; END IF;
  RETURN NEW;
END
$function$;
ALTER TABLE saas.product_media DROP COLUMN object_deleted_at;

DROP TRIGGER store_media_namespaces_immutable_authority ON saas.store_media_namespaces;
DROP FUNCTION saas.guard_store_media_namespace_mutation();
DROP TABLE saas.store_media_namespaces;

COMMIT;
