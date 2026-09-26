-- Permanent category images and atomic sibling ordering. No homepage publication writes.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.catalog_categories ADD COLUMN image_asset_id uuid, ADD COLUMN image_alt_text text;
ALTER TABLE saas.catalog_categories ADD CONSTRAINT catalog_categories_image_asset_fk
  FOREIGN KEY(store_id,image_asset_id) REFERENCES saas.storefront_assets(store_id,id) ON DELETE RESTRICT;
ALTER TABLE saas.catalog_categories ADD CONSTRAINT catalog_categories_image_pair_check CHECK (
  (image_asset_id IS NULL AND image_alt_text IS NULL) OR
  (image_asset_id IS NOT NULL AND image_alt_text IS NOT NULL
    AND image_alt_text=pg_catalog.btrim(image_alt_text) AND pg_catalog.char_length(image_alt_text)<=500
    AND image_alt_text!~'[[:cntrl:]]')
);
CREATE INDEX catalog_categories_image_asset_idx ON saas.catalog_categories(store_id,image_asset_id) WHERE image_asset_id IS NOT NULL;

CREATE TABLE saas.catalog_category_order_operations (
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  fingerprint char(64) NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=1048576),
  committed_at timestamptz NOT NULL CHECK(pg_catalog.isfinite(committed_at))
);
CREATE INDEX catalog_category_order_operations_store_idx ON saas.catalog_category_order_operations(store_id,committed_at,operation_id);
ALTER TABLE saas.catalog_category_order_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_category_order_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.catalog_category_order_operations FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
CREATE TRIGGER catalog_category_order_operations_immutable BEFORE UPDATE OR DELETE ON saas.catalog_category_order_operations
  FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_onboarding_operation_mutation();

ALTER FUNCTION saas.catalog_category_projection(uuid,uuid) RENAME TO catalog_category_projection_without_images;
REVOKE ALL ON FUNCTION saas.catalog_category_projection_without_images(uuid,uuid) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
ALTER FUNCTION saas.catalog_create_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,jsonb) RENAME TO catalog_create_category_without_images;
REVOKE ALL ON FUNCTION saas.catalog_create_category_without_images(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
ALTER FUNCTION saas.catalog_update_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) RENAME TO catalog_update_category_without_images;
REVOKE ALL ON FUNCTION saas.catalog_update_category_without_images(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
ALTER FUNCTION saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) RENAME TO storefront_asset_archive_without_images;
REVOKE ALL ON FUNCTION saas.storefront_asset_archive_without_images(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

CREATE FUNCTION saas.catalog_category_image_valid(p_image jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
  SELECT COALESCE(p_image='null'::jsonb OR (
    saas.catalog_onboarding_json_exact(p_image,ARRAY['assetId','altText'],ARRAY[]::text[])
    AND pg_catalog.jsonb_typeof(p_image->'assetId')='string'
    AND p_image->>'assetId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    AND pg_catalog.jsonb_typeof(p_image->'altText')='string'
    AND p_image->>'altText'=pg_catalog.btrim(p_image->>'altText')
    AND pg_catalog.char_length(p_image->>'altText')<=500
    AND p_image->>'altText'!~'[[:cntrl:]]'
  ),false)
$function$;

CREATE FUNCTION saas.catalog_category_projection(p_store_id uuid,p_category_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'id',category.id,
    'parentId',category.parent_id,
    'name',category.name,
    'slug',category.slug,
    'position',category.position,
    'depth',category.depth,
    'status',category.status,
    'version',category.version,
    'createdAt',saas.catalog_timestamp(category.created_at),
    'updatedAt',saas.catalog_timestamp(category.updated_at),
    'image',CASE WHEN category.image_asset_id IS NULL THEN NULL ELSE pg_catalog.jsonb_build_object('assetId',category.image_asset_id,'altText',category.image_alt_text,'publicUrl',asset.public_url,'width',asset.width,'height',asset.height) END,
    'archivedAt',CASE WHEN category.archived_at IS NULL THEN NULL ELSE saas.catalog_timestamp(category.archived_at) END
  ))
  FROM saas.catalog_categories AS category
  LEFT JOIN saas.storefront_assets AS asset ON asset.store_id=category.store_id AND asset.id=category.image_asset_id AND asset.asset_kind='category' AND asset.status='active'
  WHERE category.store_id=p_store_id AND category.id=p_category_id
$function$;

CREATE FUNCTION saas.catalog_create_category(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_category_id uuid,p_fields jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  prior_operation saas.catalog_onboarding_operations%ROWTYPE;
  requested_parent uuid;
  requested_asset uuid;
  requested_alt text;
  requested_parent_depth integer;
  slug_base text;
  allocated_slug text;
  slug_suffix integer:=1;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage'
  ); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_category_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR NOT saas.catalog_onboarding_json_exact(p_fields,ARRAY['name','position'],ARRAY['parentId','image'])
     OR (p_fields ? 'image' AND NOT saas.catalog_category_image_valid(p_fields->'image'))
     OR pg_catalog.jsonb_typeof(p_fields->'name')<>'string'
     OR p_fields->>'name'<>pg_catalog.btrim(p_fields->>'name')
     OR pg_catalog.char_length(p_fields->>'name') NOT BETWEEN 1 AND 120
     OR p_fields->>'name'~'[[:cntrl:]]'
     OR pg_catalog.jsonb_typeof(p_fields->'position')<>'number'
     OR (p_fields->>'position')::numeric<>pg_catalog.trunc((p_fields->>'position')::numeric)
     OR (p_fields->>'position')::numeric NOT BETWEEN 0 AND 9999
     OR (p_fields ? 'parentId' AND (
       pg_catalog.jsonb_typeof(p_fields->'parentId')<>'string'
       OR p_fields->>'parentId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog_onboarding:'||p_operation_id::text,0));
  SELECT operation.* INTO prior_operation FROM saas.catalog_onboarding_operations AS operation
  WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF prior_operation.store_id<>p_store_id OR prior_operation.payload_fingerprint<>p_fingerprint OR prior_operation.operation_kind<>'create_category' THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',prior_operation.result_payload||'{"replayed":true}'::jsonb; END IF;
    RETURN;
  END IF;

  PERFORM 1 FROM saas.stores AS store WHERE store.id=p_store_id AND store.status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'store_inactive',NULL::jsonb; RETURN; END IF;
  IF p_fields ? 'image' AND p_fields->'image'<>'null'::jsonb THEN
    requested_asset:=(p_fields->'image'->>'assetId')::uuid;
    requested_alt:=p_fields->'image'->>'altText';
    -- FOR SHARE conflicts with asset archive and preserves the kind/status read.
    PERFORM 1 FROM saas.storefront_assets AS asset WHERE asset.store_id=p_store_id
      AND asset.id=requested_asset AND asset.asset_kind='category' AND asset.status='active' FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  END IF;
  requested_parent:=(p_fields->>'parentId')::uuid;
  IF requested_parent IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM saas.catalog_categories AS parent
    WHERE parent.store_id=p_store_id AND parent.id=requested_parent AND parent.status='active'
  ) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF requested_parent IS NOT NULL THEN
    SELECT parent.depth INTO requested_parent_depth FROM saas.catalog_categories AS parent
    WHERE parent.store_id=p_store_id AND parent.id=requested_parent AND parent.status='active';
    IF requested_parent_depth>=8 THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  END IF;
  slug_base:=saas.catalog_onboarding_slug_base(p_fields->>'name');
  allocated_slug:=slug_base;
  WHILE EXISTS(SELECT 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id AND category.slug=allocated_slug) LOOP
    slug_suffix:=slug_suffix+1;
    allocated_slug:=pg_catalog.left(slug_base,100-pg_catalog.char_length('-'||slug_suffix::text))||'-'||slug_suffix::text;
  END LOOP;
  BEGIN
    INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,status,version,created_at,updated_at,image_asset_id,image_alt_text)
    VALUES(p_category_id,p_store_id,requested_parent,p_fields->>'name',allocated_slug,(p_fields->>'position')::integer,'active',1,p_now,p_now,requested_asset,requested_alt);
    result:=pg_catalog.jsonb_build_object('category',saas.catalog_category_projection(p_store_id,p_category_id),'replayed',false);
    INSERT INTO saas.catalog_onboarding_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_category_id,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'create_category',p_fingerprint,p_category_id,result,p_now);
  EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN;
    WHEN check_violation OR foreign_key_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'created',result;
END
$function$;

CREATE FUNCTION saas.catalog_update_category(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_category_id uuid,p_expected_version bigint,p_fields jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  authority_error text;
  prior_operation saas.catalog_onboarding_operations%ROWTYPE;
  current_category saas.catalog_categories%ROWTYPE;
  requested_parent uuid;
  requested_asset uuid;
  requested_alt text;
  requested_parent_depth integer;
  slug_base text;
  allocated_slug text;
  slug_suffix integer:=1;
  result jsonb;
BEGIN
  authority_error:=saas.catalog_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now
  );
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage'
  ); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_category_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
     OR NOT saas.catalog_onboarding_json_exact(p_fields,ARRAY['name','position'],ARRAY['parentId','image'])
     OR (p_fields ? 'image' AND NOT saas.catalog_category_image_valid(p_fields->'image'))
     OR pg_catalog.jsonb_typeof(p_fields->'name')<>'string'
     OR p_fields->>'name'<>pg_catalog.btrim(p_fields->>'name')
     OR pg_catalog.char_length(p_fields->>'name') NOT BETWEEN 1 AND 120 OR p_fields->>'name'~'[[:cntrl:]]'
     OR pg_catalog.jsonb_typeof(p_fields->'position')<>'number'
     OR (p_fields->>'position')::numeric<>pg_catalog.trunc((p_fields->>'position')::numeric)
     OR (p_fields->>'position')::numeric NOT BETWEEN 0 AND 9999
     OR (p_fields ? 'parentId' AND (
       pg_catalog.jsonb_typeof(p_fields->'parentId')<>'string'
       OR p_fields->>'parentId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
     )) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog_onboarding:'||p_operation_id::text,0));
  SELECT operation.* INTO prior_operation FROM saas.catalog_onboarding_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF prior_operation.store_id<>p_store_id OR prior_operation.payload_fingerprint<>p_fingerprint OR prior_operation.operation_kind<>'update_category' OR prior_operation.result_category_id<>p_category_id THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',prior_operation.result_payload||'{"replayed":true}'::jsonb; END IF;
    RETURN;
  END IF;
  PERFORM 1 FROM saas.stores AS store WHERE store.id=p_store_id AND store.status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'store_inactive',NULL::jsonb; RETURN; END IF;
  IF p_fields ? 'image' AND p_fields->'image'<>'null'::jsonb THEN
    requested_asset:=(p_fields->'image'->>'assetId')::uuid;
    requested_alt:=p_fields->'image'->>'altText';
    -- FOR SHARE conflicts with asset archive and preserves the kind/status read.
    PERFORM 1 FROM saas.storefront_assets AS asset WHERE asset.store_id=p_store_id
      AND asset.id=requested_asset AND asset.asset_kind='category' AND asset.status='active' FOR SHARE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  END IF;
  SELECT category.* INTO current_category FROM saas.catalog_categories AS category
  WHERE category.store_id=p_store_id AND category.id=p_category_id AND category.status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'category_not_found',NULL::jsonb; RETURN; END IF;
  IF current_category.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  requested_parent:=(p_fields->>'parentId')::uuid;
  IF requested_parent=p_category_id OR (requested_parent IS NOT NULL AND NOT EXISTS(
    SELECT 1 FROM saas.catalog_categories AS parent
    WHERE parent.store_id=p_store_id AND parent.id=requested_parent AND parent.status='active'
  )) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF requested_parent IS NOT NULL THEN
    SELECT parent.depth INTO requested_parent_depth FROM saas.catalog_categories AS parent
    WHERE parent.store_id=p_store_id AND parent.id=requested_parent AND parent.status='active';
    IF requested_parent_depth>=8 THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  END IF;
  IF requested_parent IS DISTINCT FROM current_category.parent_id AND EXISTS(
    SELECT 1 FROM saas.catalog_categories AS child
    WHERE child.store_id=p_store_id AND child.parent_id=p_category_id AND child.status='active'
  ) THEN RETURN QUERY SELECT 'category_in_use',NULL::jsonb; RETURN; END IF;
  IF requested_parent IS NOT NULL AND EXISTS(
    WITH RECURSIVE descendants(id) AS (
      SELECT child.id FROM saas.catalog_categories AS child
      WHERE child.store_id=p_store_id AND child.parent_id=p_category_id AND child.status='active'
      UNION ALL
      SELECT child.id FROM saas.catalog_categories AS child JOIN descendants ON child.parent_id=descendants.id
      WHERE child.store_id=p_store_id AND child.status='active'
    ) SELECT 1 FROM descendants WHERE id=requested_parent
  ) THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN; END IF;
  slug_base:=saas.catalog_onboarding_slug_base(p_fields->>'name'); allocated_slug:=slug_base;
  WHILE EXISTS(SELECT 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id AND category.slug=allocated_slug AND category.id<>p_category_id) LOOP
    slug_suffix:=slug_suffix+1;
    allocated_slug:=pg_catalog.left(slug_base,100-pg_catalog.char_length('-'||slug_suffix::text))||'-'||slug_suffix::text;
  END LOOP;
  BEGIN
    UPDATE saas.catalog_categories SET parent_id=requested_parent,name=p_fields->>'name',slug=allocated_slug,
      position=(p_fields->>'position')::integer,version=version+1,updated_at=p_now,
      image_asset_id=CASE WHEN p_fields ? 'image' THEN requested_asset ELSE current_category.image_asset_id END,
      image_alt_text=CASE WHEN p_fields ? 'image' THEN requested_alt ELSE current_category.image_alt_text END
    WHERE store_id=p_store_id AND id=p_category_id;
    result:=pg_catalog.jsonb_build_object('category',saas.catalog_category_projection(p_store_id,p_category_id),'replayed',false);
    INSERT INTO saas.catalog_onboarding_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_category_id,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'update_category',p_fingerprint,p_category_id,result,p_now);
  EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'catalog_conflict',NULL::jsonb; RETURN;
    WHEN check_violation OR foreign_key_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END;
  RETURN QUERY SELECT 'updated',result;
END
$function$;

CREATE FUNCTION saas.storefront_asset_archive(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_asset_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing record; current_version bigint; projection jsonb;
BEGIN
 authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_asset_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.storefront_asset:'||p_operation_id::text,0));
 SELECT * INTO existing FROM saas.storefront_asset_operation_replay(p_operation_id,p_store_id,'archive_asset',p_fingerprint); IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
 SELECT asset.version INTO current_version FROM saas.storefront_assets asset WHERE asset.id=p_asset_id AND asset.store_id=p_store_id AND asset.status='active' FOR UPDATE;
 IF current_version IS NULL THEN RETURN QUERY SELECT 'asset_not_found',NULL::jsonb; RETURN; END IF; IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id AND category.image_asset_id=p_asset_id) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 UPDATE saas.storefront_assets SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_asset_id AND store_id=p_store_id;
 projection:=pg_catalog.jsonb_build_object('asset',saas.storefront_asset_projection(p_store_id,p_asset_id)); INSERT INTO saas.storefront_asset_operations VALUES(p_operation_id,p_store_id,'archive_asset',p_fingerprint,projection,p_now); RETURN QUERY SELECT 'committed',projection;
END
$f$;

CREATE FUNCTION saas.catalog_reorder_categories(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text,p_fields jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; previous saas.catalog_category_order_operations%ROWTYPE;
  requested_group jsonb; requested_parent uuid; member_count bigint; requested_count bigint;
  result jsonb; all_ids uuid[]; total_count bigint;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'catalog','catalog_admin.manage'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
    OR NOT saas.catalog_onboarding_json_exact(p_fields,ARRAY['groups'],ARRAY[]::text[])
    OR pg_catalog.jsonb_typeof(p_fields->'groups')<>'array'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF pg_catalog.jsonb_array_length(p_fields->'groups') NOT BETWEEN 1 AND 500
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  FOR requested_group IN SELECT value FROM pg_catalog.jsonb_array_elements(p_fields->'groups') LOOP
    IF NOT saas.catalog_onboarding_json_exact(requested_group,
        ARRAY['orderedCategoryIds','expectedVersions'],ARRAY['parentId'])
      OR (requested_group?'parentId' AND (pg_catalog.jsonb_typeof(requested_group->'parentId')<>'string'
        OR requested_group->>'parentId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
      OR pg_catalog.jsonb_typeof(requested_group->'orderedCategoryIds')<>'array'
      OR pg_catalog.jsonb_typeof(requested_group->'expectedVersions')<>'array'
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    requested_count:=pg_catalog.jsonb_array_length(requested_group->'orderedCategoryIds');
    IF requested_count NOT BETWEEN 1 AND 500
      OR pg_catalog.jsonb_array_length(requested_group->'expectedVersions')<>requested_count
      OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(requested_group->'orderedCategoryIds') AS item(value)
        WHERE pg_catalog.jsonb_typeof(item.value)<>'string'
          OR item.value#>>'{}'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    -- Validate shape before any cast or membership lookup.
    IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(requested_group->'expectedVersions') AS item(value)
        WHERE NOT saas.catalog_onboarding_json_exact(item.value,ARRAY['categoryId','version'],ARRAY[]::text[])
          OR pg_catalog.jsonb_typeof(item.value->'categoryId')<>'string'
          OR item.value->>'categoryId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
          OR pg_catalog.jsonb_typeof(item.value->'version')<>'number')
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
    IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(requested_group->'expectedVersions') AS item(value)
        WHERE (item.value->>'version')::numeric NOT BETWEEN 1 AND 9007199254740990
          OR (item.value->>'version')::numeric<>pg_catalog.trunc((item.value->>'version')::numeric))
      OR (SELECT pg_catalog.count(DISTINCT item.value->>'categoryId')
        FROM pg_catalog.jsonb_array_elements(requested_group->'expectedVersions') AS item(value))<>requested_count
      OR EXISTS(SELECT item.value->>'categoryId'
        FROM pg_catalog.jsonb_array_elements(requested_group->'expectedVersions') AS item(value)
        EXCEPT SELECT value FROM pg_catalog.jsonb_array_elements_text(requested_group->'orderedCategoryIds'))
    THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  END LOOP;
  IF (SELECT pg_catalog.count(DISTINCT COALESCE(item.value->>'parentId','root'))
      FROM pg_catalog.jsonb_array_elements(p_fields->'groups') AS item(value))
    <>pg_catalog.jsonb_array_length(p_fields->'groups')
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.array_agg(item.id::uuid),pg_catalog.count(*) INTO all_ids,total_count
    FROM pg_catalog.jsonb_array_elements(p_fields->'groups') AS grp(value)
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements_text(grp.value->'orderedCategoryIds') AS item(id);
  IF total_count>500 OR (SELECT pg_catalog.count(DISTINCT id) FROM pg_catalog.unnest(all_ids) AS item(id))<>total_count
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog_category_order:'||p_operation_id::text,0));
  SELECT operation.* INTO previous FROM saas.catalog_category_order_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF previous.store_id<>p_store_id OR previous.fingerprint<>p_fingerprint
    THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_set(previous.result_payload,'{replayed}','true'::jsonb); END IF;
    RETURN;
  END IF;
  -- Same lock order as category create/update. It prevents root-level insert
  -- phantoms; row locks also serialize archive/delete while validating siblings.
  PERFORM 1 FROM saas.stores AS store WHERE store.id=p_store_id AND store.status='active' FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'store_inactive',NULL::jsonb; RETURN; END IF;
  PERFORM 1 FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id
    ORDER BY category.id FOR UPDATE;

  -- Validate every group before the first write: no partial successful group.
  FOR requested_group IN SELECT value FROM pg_catalog.jsonb_array_elements(p_fields->'groups') LOOP
    requested_parent:=(requested_group->>'parentId')::uuid;
    requested_count:=pg_catalog.jsonb_array_length(requested_group->'orderedCategoryIds');
    SELECT pg_catalog.count(*) INTO member_count FROM saas.catalog_categories AS category
      WHERE category.store_id=p_store_id AND category.parent_id IS NOT DISTINCT FROM requested_parent AND category.status='active';
    IF member_count<>requested_count OR EXISTS(
      SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(requested_group->'orderedCategoryIds')
      EXCEPT SELECT category.id FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id
        AND category.parent_id IS NOT DISTINCT FROM requested_parent AND category.status='active'
    ) THEN RETURN QUERY SELECT 'order_membership_changed',NULL::jsonb; RETURN; END IF;
    IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(requested_group->'expectedVersions') AS expected(value)
      JOIN saas.catalog_categories AS category ON category.store_id=p_store_id AND category.id=(expected.value->>'categoryId')::uuid
      WHERE category.version<>(expected.value->>'version')::bigint)
    THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
  END LOOP;
  FOR requested_group IN SELECT value FROM pg_catalog.jsonb_array_elements(p_fields->'groups') LOOP
    UPDATE saas.catalog_categories AS category SET position=requested.ordinality::integer,
      version=category.version+1,updated_at=p_now
      FROM pg_catalog.jsonb_array_elements_text(requested_group->'orderedCategoryIds') WITH ORDINALITY AS requested(id,ordinality)
      WHERE category.store_id=p_store_id AND category.id=requested.id::uuid;
  END LOOP;
  SELECT pg_catalog.jsonb_build_object('categories',COALESCE(pg_catalog.jsonb_agg(
      saas.catalog_category_projection(p_store_id,category.id) ORDER BY category.depth,category.position,category.id),'[]'::jsonb),'replayed',false)
    INTO result FROM saas.catalog_categories AS category WHERE category.store_id=p_store_id AND category.id=ANY(all_ids);
  INSERT INTO saas.catalog_category_order_operations(operation_id,store_id,fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,p_fingerprint,result,p_now);
  RETURN QUERY SELECT 'reordered',result;
END
$function$;

CREATE FUNCTION saas.catalog_recover_category_order(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,
  p_operation_id uuid,p_fingerprint text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; previous saas.catalog_category_order_operations%ROWTYPE;
BEGIN
  authority_error:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
  IF authority_error IS NULL THEN authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'catalog','catalog_admin.read'); END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  SELECT operation.* INTO previous FROM saas.catalog_category_order_operations AS operation WHERE operation.operation_id=p_operation_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;
  ELSIF previous.store_id<>p_store_id OR previous.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
  ELSE RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_set(previous.result_payload,'{replayed}','true'::jsonb); END IF;
END
$function$;

REVOKE ALL ON FUNCTION saas.catalog_category_image_valid(jsonb),saas.catalog_category_projection(uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION
  saas.catalog_create_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,jsonb),
  saas.catalog_update_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb),
  saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.catalog_reorder_categories(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,jsonb),
  saas.catalog_recover_category_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  saas.catalog_create_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,jsonb),
  saas.catalog_update_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb),
  saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint),
  saas.catalog_reorder_categories(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,jsonb),
  saas.catalog_recover_category_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text)
TO celebix_saas_app;
COMMIT;
