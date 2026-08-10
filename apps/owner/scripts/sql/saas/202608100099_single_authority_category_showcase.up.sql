BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $single_authority_category_showcase_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.merchant_admin_records') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid(text,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation(uuid,timestamp with time zone,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_single_authority_category_showcase(text,jsonb)') IS NOT NULL
     OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_single_authority_category_showcase(uuid,timestamp with time zone,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'SINGLE_AUTHORITY_CATEGORY_SHOWCASE_PRECONDITION_FAILED';
  END IF;
END
$single_authority_category_showcase_precondition$;

LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;

ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb)
  RENAME TO merchant_admin_config_valid_without_single_authority_category_showcase;

CREATE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE WHEN p_kind='category_showcase' THEN
    pg_catalog.jsonb_typeof(p_config)='object'
    AND pg_catalog.octet_length(p_config::text)<=16384
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) field(key)
      WHERE field.key NOT IN('heading','enabled','layout','items')
    )
    AND p_config?'heading'
    AND pg_catalog.jsonb_typeof(p_config->'heading')='string'
    AND p_config->>'heading'=pg_catalog.btrim(p_config->>'heading')
    AND pg_catalog.char_length(p_config->>'heading') BETWEEN 1 AND 160
    AND p_config->>'heading'!~'[[:cntrl:]]'
    AND p_config?'enabled'
    AND pg_catalog.jsonb_typeof(p_config->'enabled')='boolean'
    AND p_config?'layout'
    AND pg_catalog.jsonb_typeof(p_config->'layout')='string'
    AND p_config->>'layout' IN ('duo','grid')
    AND p_config?'items'
    AND pg_catalog.jsonb_typeof(p_config->'items')='array'
    AND pg_catalog.jsonb_array_length(p_config->'items') BETWEEN 1 AND 8
    AND NOT EXISTS(
      SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'items') item(value)
      WHERE pg_catalog.jsonb_typeof(item.value)<>'object'
        OR EXISTS(
          SELECT 1 FROM pg_catalog.jsonb_object_keys(item.value) field(key)
          WHERE field.key NOT IN('categoryId','assetId')
        )
        OR NOT item.value?'categoryId'
        OR NOT item.value?'assetId'
        OR pg_catalog.jsonb_typeof(item.value->'categoryId')<>'string'
        OR pg_catalog.jsonb_typeof(item.value->'assetId')<>'string'
        OR item.value->>'categoryId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR item.value->>'assetId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    )
    AND (
      SELECT pg_catalog.count(DISTINCT item.value->>'categoryId')
      FROM pg_catalog.jsonb_array_elements(p_config->'items') item(value)
    )=pg_catalog.jsonb_array_length(p_config->'items')
    AND (
      SELECT pg_catalog.count(DISTINCT item.value->>'assetId')
      FROM pg_catalog.jsonb_array_elements(p_config->'items') item(value)
    )=pg_catalog.jsonb_array_length(p_config->'items')
  ELSE saas.merchant_admin_config_valid_without_single_authority_category_showcase(p_kind,p_config) END
$function$;

UPDATE saas.merchant_admin_records
SET config=config||pg_catalog.jsonb_build_object('layout','grid')
WHERE record_kind='category_showcase' AND NOT (config?'layout');

ALTER FUNCTION saas.public_starter_retail_presentation(uuid,timestamptz,boolean)
  RENAME TO public_starter_retail_presentation_without_single_authority_category_showcase;

CREATE FUNCTION saas.public_starter_retail_presentation(p_store_id uuid,p_now timestamptz,p_allow_index boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  projected jsonb;
  showcase_layout text;
BEGIN
  projected:=saas.public_starter_retail_presentation_without_single_authority_category_showcase(p_store_id,p_now,p_allow_index);
  IF projected IS NULL OR NOT (projected?'categoryShowcase') THEN RETURN projected; END IF;

  SELECT record.config->>'layout' INTO showcase_layout
  FROM saas.merchant_admin_records record
  WHERE record.store_id=p_store_id
    AND record.record_kind='category_showcase'
    AND record.status='active'
  ORDER BY record.updated_at DESC,record.id DESC
  LIMIT 1;

  IF showcase_layout NOT IN ('duo','grid') THEN RETURN projected-'categoryShowcase'; END IF;
  RETURN pg_catalog.jsonb_set(
    projected,
    ARRAY['categoryShowcase'],
    projected->'categoryShowcase'||pg_catalog.jsonb_build_object('layout',showcase_layout),
    false
  );
END
$function$;

REVOKE ALL ON FUNCTION
  saas.merchant_admin_config_valid_without_single_authority_category_showcase(text,jsonb),
  saas.merchant_admin_config_valid(text,jsonb),
  saas.public_starter_retail_presentation_without_single_authority_category_showcase(uuid,timestamptz,boolean),
  saas.public_starter_retail_presentation(uuid,timestamptz,boolean)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
