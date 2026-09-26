BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

-- Serialize SELECT FOR UPDATE save/publish calls before taking rollback evidence.
-- EXCLUSIVE also blocks their row locks, avoiding an UPDATE lock-upgrade deadlock.
-- Normal public SELECTs remain available until the transaction commits.
LOCK TABLE saas.storefront_designs IN EXCLUSIVE MODE;

DO $check$
BEGIN
  IF pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_design_workspace_fixes_backup') IS NOT NULL THEN
    RAISE EXCEPTION 'DESIGN_WORKSPACE_FIXES_PRECONDITION_FAILED';
  END IF;
END $check$;

-- Owner-only rollback evidence preserves the exact definitions on the target DB.
CREATE TABLE saas.storefront_design_workspace_fixes_backup (
  identity text PRIMARY KEY,
  definition text,
  original jsonb,
  migrated jsonb
);
ALTER TABLE saas.storefront_design_workspace_fixes_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_design_workspace_fixes_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.storefront_design_workspace_fixes_backup FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
INSERT INTO saas.storefront_design_workspace_fixes_backup(identity,definition)
SELECT signature,pg_catalog.pg_get_functiondef(signature::regprocedure) FROM pg_catalog.unnest(ARRAY[
 'saas.storefront_design_document_valid(uuid,jsonb,boolean)',
 'saas.storefront_theme_composition_references_valid(uuid,jsonb,boolean)',
 'saas.storefront_design_publishable(uuid,jsonb)',
 'saas.storefront_design_workspace_payload(uuid)',
 'saas.storefront_design_public_destination(uuid,jsonb)',
 'saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamptz)',
 'saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)',
 'saas.public_starter_retail_home(uuid,text,timestamptz)',
 'saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)'
]) signature;
INSERT INTO saas.storefront_design_workspace_fixes_backup(identity,original)
SELECT store_id::text,pg_catalog.jsonb_build_object('draft',draft_config,'published',published_config,'draftVersion',draft_version,'publishedVersion',published_version,'presentation',saas.public_starter_retail_presentation(store_id,pg_catalog.statement_timestamp(),false))
FROM saas.storefront_designs;

-- Keep existing schema rules and limits, extending only the two section shapes.
CREATE FUNCTION saas.storefront_design_composition_without_selections(p_config jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_set(p_config,ARRAY['sections'],COALESCE((
  SELECT pg_catalog.jsonb_agg(CASE
    WHEN section->>'kind'='product_row' THEN CASE WHEN section->>'source'='manual'
      THEN (section-'productIds')||'{"source":"latest"}'::jsonb ELSE section-'productIds' END
    WHEN section->>'kind'='category_grid' THEN section-'categoryImages'
    ELSE section END ORDER BY ordinal)
  FROM pg_catalog.jsonb_array_elements(p_config->'sections') WITH ORDINALITY selected(section,ordinal)
 ),'[]'::jsonb),false)
$f$;

-- Legacy merchant composition writes retain their old validator. New selections
-- enter only through design documents with store-scoped reference validation.
CREATE FUNCTION saas.storefront_design_composition_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE section jsonb; item jsonb;
BEGIN
 IF NOT saas.campaign_starter_composition_valid(saas.storefront_design_composition_without_selections(p_config)) THEN RETURN false; END IF;
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'sections') LOOP
  IF section->>'kind'='product_row' THEN
   IF section->>'source' NOT IN ('latest','sale','category','manual') THEN RETURN false; END IF;
   IF section?'productIds' THEN
    IF section->>'source'<>'manual' OR pg_catalog.jsonb_typeof(section->'productIds')<>'array'
      OR pg_catalog.jsonb_array_length(section->'productIds')>12 THEN RETURN false; END IF;
    FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'productIds') LOOP
     IF pg_catalog.jsonb_typeof(item)<>'string' OR item#>>'{}'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false; END IF;
    END LOOP;
    IF (SELECT pg_catalog.count(DISTINCT value) FROM pg_catalog.jsonb_array_elements(section->'productIds'))<>pg_catalog.jsonb_array_length(section->'productIds') THEN RETURN false; END IF;
   END IF;
  ELSIF section->>'kind'='category_grid' AND section?'categoryImages' THEN
   IF pg_catalog.jsonb_typeof(section->'categoryImages')<>'array' OR pg_catalog.jsonb_array_length(section->'categoryImages')>8 THEN RETURN false; END IF;
   FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'categoryImages') LOOP
    IF NOT saas.storefront_design_exact_keys(item,ARRAY['categoryId','assetId'])
      OR pg_catalog.jsonb_typeof(item->'categoryId')<>'string' OR pg_catalog.jsonb_typeof(item->'assetId')<>'string'
      OR item->>'categoryId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR item->>'assetId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      OR NOT (section->'categoryIds' @> pg_catalog.jsonb_build_array(item->>'categoryId')) THEN RETURN false; END IF;
   END LOOP;
   IF (SELECT pg_catalog.count(DISTINCT value->>'categoryId') FROM pg_catalog.jsonb_array_elements(section->'categoryImages'))<>pg_catalog.jsonb_array_length(section->'categoryImages') THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $f$;

-- The schema-4 document wrapper also checks structure before resolving tenant
-- references. Preserve its exact prior definition while changing that one call.
DO $document_validator$
DECLARE definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('saas.storefront_design_document_valid(uuid,jsonb,boolean)'::regprocedure) INTO definition;
 IF pg_catalog.strpos(definition,'saas.campaign_starter_composition_valid(')=0 THEN
  RAISE EXCEPTION 'DESIGN_WORKSPACE_FIXES_DOCUMENT_SOURCE_CHANGED';
 END IF;
 EXECUTE pg_catalog.replace(definition,'saas.campaign_starter_composition_valid(', 'saas.storefront_design_composition_valid(');
END $document_validator$;

CREATE FUNCTION saas.storefront_design_category_asset(p_store_id uuid,p_section jsonb,p_category_id uuid)
RETURNS uuid LANGUAGE sql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT asset.id FROM saas.storefront_assets asset
 WHERE asset.store_id=p_store_id AND asset.asset_kind='category' AND asset.status='active'
 AND asset.id=COALESCE(
   (SELECT (item->>'assetId')::uuid FROM pg_catalog.jsonb_array_elements(COALESCE(p_section->'categoryImages','[]'::jsonb)) item WHERE item->>'categoryId'=p_category_id::text LIMIT 1),
   CASE WHEN NOT(p_section?'categoryImages') THEN (SELECT (item->>'assetId')::uuid
    FROM saas.merchant_admin_records showcase CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(showcase.config->'items') item
    WHERE showcase.store_id=p_store_id AND showcase.record_kind='category_showcase' AND showcase.status='active'
      AND item->>'categoryId'=p_category_id::text ORDER BY showcase.updated_at DESC,showcase.id DESC LIMIT 1) END)
$f$;
CREATE OR REPLACE FUNCTION saas.storefront_theme_composition_references_valid(p_store_id uuid,p_config jsonb,p_publish boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE section jsonb; item jsonb; selected_id uuid;
BEGIN
  IF NOT saas.storefront_design_composition_valid(p_config) THEN RETURN false; END IF;
  FOR selected_id IN SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(p_config->'navigation'->'rootCategoryIds') value LOOP
    IF NOT EXISTS(SELECT 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=selected_id AND category.status='active') THEN RETURN false; END IF;
  END LOOP;
  IF p_config->'navigation'?'featuredCategoryId' THEN
    selected_id:=(p_config->'navigation'->>'featuredCategoryId')::uuid;
    IF NOT EXISTS(SELECT 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=selected_id AND category.status='active') THEN RETURN false; END IF;
    selected_id:=(p_config->'navigation'->>'featuredAssetId')::uuid;
    IF NOT EXISTS(SELECT 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='category' AND asset.status='active') THEN RETURN false; END IF;
  END IF;
  FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'sections') LOOP
    IF section->>'kind'='hero' THEN
      FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'slides') LOOP
        selected_id:=(item->>'desktopAssetId')::uuid;
        IF NOT EXISTS(SELECT 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='hero' AND asset.status='active') THEN RETURN false; END IF;
        IF item?'mobileAssetId' THEN selected_id:=(item->>'mobileAssetId')::uuid; IF NOT EXISTS(SELECT 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='hero' AND asset.status='active') THEN RETURN false; END IF; END IF;
        IF item?'productId' THEN selected_id:=(item->>'productId')::uuid; IF NOT EXISTS(SELECT 1 FROM saas.products product WHERE product.store_id=p_store_id AND product.id=selected_id AND product.status='active') THEN RETURN false; END IF; END IF;
      END LOOP;
    ELSIF section->>'kind'='category_grid' THEN
      FOR selected_id IN SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(section->'categoryIds') value LOOP
        IF NOT EXISTS(SELECT 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=selected_id AND category.status='active') THEN RETURN false; END IF;
        IF p_publish AND (section->>'enabled')::boolean AND saas.storefront_design_category_asset(p_store_id,section,selected_id) IS NULL THEN RETURN false; END IF;
      END LOOP;
      FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(COALESCE(section->'categoryImages','[]'::jsonb)) LOOP
        selected_id:=(item->>'assetId')::uuid;
        IF NOT EXISTS(SELECT 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='category' AND asset.status='active') THEN RETURN false; END IF;
      END LOOP;
    ELSIF section->>'kind'='product_row' AND section->>'source'='manual' THEN
      IF p_publish AND (section->>'enabled')::boolean AND pg_catalog.jsonb_array_length(COALESCE(section->'productIds','[]'::jsonb))=0 THEN RETURN false; END IF;
      FOR selected_id IN SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(COALESCE(section->'productIds','[]'::jsonb)) LOOP
        IF NOT EXISTS(SELECT 1 FROM saas.products product WHERE product.store_id=p_store_id AND product.id=selected_id AND product.status='active') THEN RETURN false; END IF;
      END LOOP;
    ELSIF section->>'kind'='product_row' AND section->>'source'='category' THEN
      selected_id:=(section->>'categoryId')::uuid;
      IF NOT EXISTS(SELECT 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=selected_id AND category.status='active') THEN RETURN false; END IF;
    ELSIF section->>'kind'='split_campaign' THEN
      IF p_publish AND (section->>'enabled')::boolean AND pg_catalog.jsonb_array_length(section->'panels')=0 THEN RETURN false; END IF;
      FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'panels') LOOP
        selected_id:=(item->>'assetId')::uuid;
        IF NOT EXISTS(SELECT 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='hero' AND asset.status='active') THEN RETURN false; END IF;
      END LOOP;
    ELSIF section->>'kind'='brand_story' AND section?'assetId' THEN
      selected_id:=(section->>'assetId')::uuid;
      IF NOT EXISTS(SELECT 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='hero' AND asset.status='active') THEN RETURN false; END IF;
    END IF;
  END LOOP;
  IF p_publish AND NOT saas.starter_retail_publication_references_valid(p_store_id,saas.storefront_theme_composition_without_home_ids(p_config)) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION saas.storefront_design_publishable(p_store_id uuid,p_config jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE slide jsonb;
BEGIN
 IF NOT saas.storefront_design_document_valid(p_store_id,p_config,false)
   OR NOT saas.storefront_theme_composition_references_valid(p_store_id,p_config->'composition',true) THEN RETURN false; END IF;
 IF NOT (p_config->'hero'->>'enabled')::boolean THEN RETURN true; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') selected(slide) WHERE (slide->>'enabled')::boolean) THEN RETURN false; END IF;
 FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') LOOP
  IF (slide->>'enabled')::boolean AND (NOT saas.storefront_design_text_valid(slide->'headline',1,120)
    OR slide->'desktopImage'='null'::jsonb OR NOT saas.storefront_design_media_reference_valid(p_store_id,slide->'desktopImage',false)) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $f$;
CREATE OR REPLACE FUNCTION saas.storefront_design_workspace_payload(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',3,'draftVersion',design.draft_version,'publishedVersion',design.published_version,
    'draftUpdatedAt',saas.storefront_design_timestamp(design.draft_updated_at),'publishedAt',saas.storefront_design_timestamp(design.published_at),
    'draft',design.draft_config,'publishedDraft',design.published_config,'published',saas.storefront_design_public_payload(design.store_id,design.published_config,design.published_version,design.published_at),
    'store',pg_catalog.jsonb_build_object('name',store.name,'timezone',COALESCE((SELECT setting.config->>'timezone' FROM saas.merchant_admin_records setting WHERE setting.store_id=store.id AND setting.record_kind='general_setting' AND setting.status='active' AND setting.config?'timezone' ORDER BY setting.updated_at DESC,setting.id DESC LIMIT 1),'Europe/Istanbul')),
    'media',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',media.id,'url',media.public_url,'altText',media.alt_text,'mediaType',media.media_type,'width',media.width,'height',media.height) ORDER BY media.created_at DESC,media.id) FROM saas.storefront_design_media media WHERE media.store_id=design.store_id AND media.status='active'),'[]'::jsonb),
    'assets',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',asset.id,'url',asset.public_url,'altText',asset.alt_text,'mediaType',asset.media_type,'width',asset.width,'height',asset.height,'kind',asset.asset_kind) ORDER BY asset.updated_at DESC,asset.id) FROM saas.storefront_assets asset WHERE asset.store_id=design.store_id AND asset.status='active'),'[]'::jsonb),
    'destinations',COALESCE((SELECT pg_catalog.jsonb_agg(choice.payload ORDER BY choice.label,choice.resource_id) FROM (
      SELECT product.title label,product.id resource_id,pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind','product','resourceId',product.id,'label',product.title,'path','/products/'||product.slug,
       'searchTerms',COALESCE((SELECT pg_catalog.jsonb_agg(term ORDER BY term) FROM (
         SELECT DISTINCT pg_catalog.btrim(term) term FROM saas.product_variants variant
         CROSS JOIN LATERAL pg_catalog.unnest(ARRAY[variant.sku,variant.barcode]) term
         WHERE variant.store_id=design.store_id AND variant.product_id=product.id AND variant.status='active'
         AND term IS NOT NULL AND pg_catalog.btrim(term)<>'' ORDER BY term LIMIT 100
       ) selected),'[]'::jsonb),
       'categoryIds',COALESCE((SELECT pg_catalog.jsonb_agg(category_id ORDER BY category_id) FROM saas.catalog_product_categories relation WHERE relation.store_id=design.store_id AND relation.product_id=product.id),'[]'::jsonb),
       'imageUrl',projected.payload->'media'->0->>'url','priceCents',projected.payload->'priceCents',
       'available',COALESCE((projected.payload->>'available')::boolean,false))) payload
       FROM saas.products product CROSS JOIN LATERAL (SELECT saas.public_effective_product_projection(design.store_id,product.id,pg_catalog.statement_timestamp()) payload) projected WHERE product.store_id=design.store_id AND product.status='active'
      UNION ALL SELECT category.name,category.id,pg_catalog.jsonb_build_object('kind','collection','resourceId',category.id,'label',category.name,'path','/categories/'||category.slug) FROM saas.catalog_categories category WHERE category.store_id=design.store_id AND category.status='active'
      UNION ALL SELECT page.name,page.id,pg_catalog.jsonb_build_object('kind','page','resourceId',page.id,'label',page.name,'path','/pages/'||(page.config->>'slug')) FROM saas.merchant_admin_records page WHERE page.store_id=design.store_id AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true'
    ) choice),'[]'::jsonb)
  ) FROM saas.storefront_designs design JOIN saas.stores store ON store.id=design.store_id WHERE design.store_id=p_store_id
$function$;

CREATE OR REPLACE FUNCTION saas.storefront_design_public_destination(p_store_id uuid,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE resource_id uuid; result jsonb;
BEGIN
  IF p_value->>'kind'='none' THEN RETURN 'null'::jsonb; END IF;
  resource_id:=(p_value->>'resourceId')::uuid;
  IF p_value->>'kind'='product' THEN
    SELECT pg_catalog.jsonb_build_object('path','/products/'||product.slug) INTO result FROM saas.products product WHERE product.store_id=p_store_id AND product.id=resource_id AND product.status='active';
  ELSIF p_value->>'kind'='collection' THEN
    SELECT pg_catalog.jsonb_build_object('path','/categories/'||category.slug) INTO result FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=resource_id AND category.status='active';
  ELSE
    SELECT pg_catalog.jsonb_build_object('path','/pages/'||(page.config->>'slug')) INTO result FROM saas.merchant_admin_records page WHERE page.store_id=p_store_id AND page.id=resource_id AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true';
  END IF;
  RETURN COALESCE(result,'null'::jsonb);
END
$function$;

-- Preserve content previously visible in customized publications. Draft
-- composition is kept as authored. Legacy category content is copied once;
-- subsequent publications use only the composition's heading/order/layout.
UPDATE saas.storefront_designs design SET published_config=pg_catalog.jsonb_set(
 design.published_config,ARRAY['composition','announcement'],
 (design.published_config->'composition'->'announcement')||pg_catalog.jsonb_build_object(
 'items',design.published_config->'announcement'->'items','enabled',design.published_config->'announcement'->'enabled'),false)
WHERE design.published_version>1;
UPDATE saas.storefront_designs design SET published_config=pg_catalog.jsonb_set(
 design.published_config,ARRAY['composition','sections'],(
 SELECT COALESCE(pg_catalog.jsonb_agg(CASE WHEN section->>'kind'='category_grid' THEN
   CASE WHEN NOT(backup.original->'presentation'?'categoryShowcase') OR NOT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(COALESCE(backup.original->'presentation'->'sections','[]'::jsonb)) item WHERE item->>'kind'='category_grid'
   ) THEN section||'{"enabled":false}'::jsonb
   ELSE section||pg_catalog.jsonb_build_object(
    'heading',backup.original->'presentation'->'categoryShowcase'->>'heading',
    'layout',backup.original->'presentation'->'categoryShowcase'->>'layout',
    'categoryIds',(SELECT pg_catalog.jsonb_agg(item->>'id' ORDER BY ordinal) FROM pg_catalog.jsonb_array_elements(backup.original->'presentation'->'categoryShowcase'->'items') WITH ORDINALITY selected(item,ordinal)),
    'categoryImages',(SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('categoryId',item->>'id','assetId',asset.id) ORDER BY ordinal)
      FROM pg_catalog.jsonb_array_elements(backup.original->'presentation'->'categoryShowcase'->'items') WITH ORDINALITY selected(item,ordinal)
      JOIN saas.storefront_assets asset ON asset.store_id=design.store_id AND asset.asset_kind='category' AND asset.status='active' AND asset.public_url=item->'image'->>'url')
   ) END
 ELSE section END ORDER BY section_order),'[]'::jsonb)
 FROM pg_catalog.jsonb_array_elements(design.published_config->'composition'->'sections') WITH ORDINALITY selected(section,section_order)
),false)
FROM saas.storefront_design_workspace_fixes_backup backup
WHERE backup.identity=design.store_id::text
AND EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(design.published_config->'composition'->'sections') section WHERE section->>'kind'='category_grid');

DO $public_announcement$
DECLARE definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamptz)'::regprocedure) INTO definition;
 -- The typography wrapper delegates content to the slider projection. Retain
 -- that implementation, projecting one announcement authority afterwards.
 EXECUTE pg_catalog.replace(definition,'saas.storefront_design_public_payload(', 'saas.storefront_design_public_payload_before_workspace_fixes(');
END $public_announcement$;
CREATE OR REPLACE FUNCTION saas.storefront_design_public_payload(p_store_id uuid,p_config jsonb,p_version bigint,p_published_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_set(saas.storefront_design_public_payload_before_workspace_fixes(p_store_id,p_config,p_version,p_published_at),ARRAY['announcement'],
 (p_config->'announcement')||pg_catalog.jsonb_build_object('enabled',p_config->'composition'->'announcement'->'enabled',
 'items',CASE WHEN pg_catalog.jsonb_array_length(p_config->'composition'->'announcement'->'items')>0
 THEN p_config->'composition'->'announcement'->'items' ELSE p_config->'announcement'->'items' END),false)
$f$;

-- Patch the guarded base projection, keeping all existing navigation, footer,
-- testimonials, merchandising and fixed section IDs intact.
DO $projection$
DECLARE definition text; old_category text; new_category text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)'::regprocedure) INTO definition;
 old_category:='JOIN LATERAL (SELECT showcase_item FROM saas.merchant_admin_records showcase CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(showcase.config->''items'') showcase_item WHERE showcase.store_id=p_store_id AND showcase.record_kind=''category_showcase'' AND showcase.status=''active'' AND showcase_item->>''categoryId''=requested.id ORDER BY showcase.updated_at DESC LIMIT 1) mapping ON true JOIN saas.storefront_assets a ON a.store_id=p_store_id AND a.id=(mapping.showcase_item->>''assetId'')::uuid AND a.asset_kind=''category'' AND a.status=''active''';
 new_category:='JOIN saas.storefront_assets a ON a.store_id=p_store_id AND a.id=saas.storefront_design_category_asset(p_store_id,section,c.id) AND a.asset_kind=''category'' AND a.status=''active''';
 IF pg_catalog.strpos(definition,old_category)=0 OR pg_catalog.strpos(definition,'''categorySlug'',category_slug,')=0 THEN RAISE EXCEPTION 'DESIGN_WORKSPACE_FIXES_PROJECTION_SOURCE_CHANGED'; END IF;
 definition:=pg_catalog.replace(definition,old_category,new_category);
 definition:=pg_catalog.replace(definition,'''categorySlug'',category_slug,','''categorySlug'',category_slug,''productIds'',CASE WHEN section->>''source''=''manual'' THEN COALESCE(section->''productIds'',''[]''::jsonb) END,');
 EXECUTE definition;
END $projection$;

-- Add the conjunction used by draft previews; it applies both predicates before
-- pagination and reuses the public category order.
DO $catalog$
DECLARE definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('saas.public_catalog_query_v2(text,timestamptz,text,text,text,text,integer,integer)'::regprocedure) INTO definition;
 IF pg_catalog.strpos(definition,'''all'',''available'',''discounted''')=0 OR pg_catalog.strpos(definition,'p_filter=''discounted'' AND')=0 THEN RAISE EXCEPTION 'DESIGN_WORKSPACE_FIXES_CATALOG_SOURCE_CHANGED'; END IF;
 definition:=pg_catalog.replace(definition,'''all'',''available'',''discounted''','''all'',''available'',''discounted'',''available_discounted''');
 definition:=pg_catalog.replace(definition,'p_filter=''discounted'' AND','p_filter IN (''discounted'',''available_discounted'') AND (p_filter<>''available_discounted'' OR (candidate.payload->>''available'')::boolean) AND');
 EXECUTE definition;
END $catalog$;

CREATE OR REPLACE FUNCTION saas.public_starter_retail_home(p_store_id uuid,p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE presentation jsonb; section jsonb; items jsonb; rows jsonb:='[]'::jsonb; allow_index boolean:=false; selected_category uuid;
BEGIN
 IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 SELECT domain.hostname_type='custom_domain' AND domain.is_primary INTO allow_index FROM saas.store_domains domain WHERE domain.store_id=p_store_id AND domain.hostname=p_hostname AND domain.status='active' AND domain.verified_at<=p_now;
 presentation:=saas.public_starter_retail_presentation(p_store_id,p_now,COALESCE(allow_index,false));
 IF presentation IS NULL OR presentation->>'schemaVersion'<>'3' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(presentation->'sections') LOOP
  IF section->>'kind'<>'product_row' THEN CONTINUE; END IF;
  selected_category:=NULL;
  IF section->>'source'='category' THEN
   SELECT id INTO selected_category FROM saas.catalog_categories WHERE store_id=p_store_id AND slug=section->>'categorySlug' AND status='active';
   IF selected_category IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  END IF;
  WITH candidates AS MATERIALIZED (
   SELECT product.id,product.created_at,
    CASE WHEN section->>'source'='manual' THEN (SELECT requested.ordinality FROM pg_catalog.jsonb_array_elements_text(section->'productIds') WITH ORDINALITY requested(id,ordinality) WHERE requested.id=product.id::text)
     WHEN selected_category IS NOT NULL THEN (SELECT assignment.storefront_position FROM saas.catalog_product_categories assignment WHERE assignment.store_id=p_store_id AND assignment.category_id=selected_category AND assignment.product_id=product.id) END position,
    saas.public_effective_product_projection(p_store_id,product.id,p_now) payload
   FROM saas.products product WHERE product.store_id=p_store_id AND product.status='active'
    AND (section->>'source'<>'manual' OR section->'productIds' @> pg_catalog.jsonb_build_array(product.id::text))
    AND (selected_category IS NULL OR EXISTS(SELECT 1 FROM saas.catalog_product_categories assignment WHERE assignment.store_id=p_store_id AND assignment.category_id=selected_category AND assignment.product_id=product.id))
  ), selected AS (
   SELECT * FROM candidates WHERE payload IS NOT NULL AND COALESCE((payload->>'available')::boolean,false)
    AND (section->>'source'<>'sale' OR (payload?'compareAtCents' AND (payload->>'compareAtCents')::bigint>(payload->>'priceCents')::bigint))
   ORDER BY position ASC NULLS LAST,created_at DESC,id DESC LIMIT (section->>'limit')::integer
  ) SELECT COALESCE(pg_catalog.jsonb_agg(payload ORDER BY position ASC NULLS LAST,created_at DESC,id DESC),'[]'::jsonb) INTO items FROM selected;
  rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key',section->>'key','items',items));
 END LOOP;
 RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('presentation',presentation,'productRows',rows);
END $f$;

CREATE FUNCTION saas.public_content_page_get(p_hostname text,p_now timestamptz,p_slug text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; projected jsonb;
BEGIN
 IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true
 OR p_slug IS NULL OR pg_catalog.char_length(p_slug) NOT BETWEEN 1 AND 100 OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now);
 IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 SELECT pg_catalog.jsonb_build_object('id',page.id,'slug',page.config->>'slug','title',page.name,'body',COALESCE(page.config->>'body',''),'updatedAt',saas.storefront_design_timestamp(page.updated_at))
 INTO projected FROM saas.merchant_admin_records page
 WHERE page.store_id=selected_store AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true' AND page.config->>'slug'=p_slug
 ORDER BY page.updated_at DESC,page.id DESC LIMIT 1;
 RETURN QUERY SELECT CASE WHEN projected IS NULL THEN 'not_found' ELSE 'found' END,projected;
END $f$;
REVOKE ALL ON FUNCTION saas.public_content_page_get(text,timestamptz,text) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow;
GRANT EXECUTE ON FUNCTION saas.public_content_page_get(text,timestamptz,text) TO celebix_saas_host_resolver;

UPDATE saas.storefront_design_workspace_fixes_backup backup SET migrated=pg_catalog.jsonb_build_object('draft',design.draft_config,'published',design.published_config,'draftVersion',design.draft_version,'publishedVersion',design.published_version)
FROM saas.storefront_designs design WHERE backup.identity=design.store_id::text;
REVOKE ALL ON FUNCTION saas.storefront_design_composition_without_selections(jsonb),saas.storefront_design_composition_valid(jsonb),saas.storefront_design_category_asset(uuid,jsonb,uuid),saas.storefront_design_public_payload_before_workspace_fixes(uuid,jsonb,bigint,timestamptz)
FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;
COMMIT;
