BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $storefront_unified_theme_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR pg_catalog.to_regclass('saas.campaign_starter_publications') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_document_valid(uuid,jsonb,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_publishable(uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation(uuid,timestamp with time zone,boolean)') IS NULL THEN
    RAISE EXCEPTION 'STOREFRONT_UNIFIED_THEME_PRECONDITION_FAILED';
  END IF;
END
$storefront_unified_theme_precondition$;

CREATE FUNCTION saas.storefront_theme_default_composition()
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',2,
    'visual',pg_catalog.jsonb_build_object('colorScheme','neutral','headingStyle','serif','cornerStyle','square','headerStyle','overlay','productCardStyle','editorial','productImageRatio','portrait','headerWidth','wide','sectionSpacing','balanced'),
    'announcement',pg_catalog.jsonb_build_object('enabled',true,'items',pg_catalog.jsonb_build_array('Güvenli alışveriş'),'destination','/pages/odeme-teslimat'),
    'navigation',pg_catalog.jsonb_build_object('rootCategoryIds','[]'::jsonb),
    'sections',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','product_row','enabled',true,'heading','Yeni ürünler','source','latest','limit',8)),
    'productDetail',pg_catalog.jsonb_build_object('galleryStyle','grid','showSku',true,'showBrand',true,'showBreadcrumbs',true,'showRelatedProducts',true,'showApprovedReviews',true,'mobileStickyPurchase',true,'showSizeGuide',true,'informationSections',pg_catalog.jsonb_build_array('description','materials_and_care','certifications','shipping_and_returns')),
    'cart',pg_catalog.jsonb_build_object('showCheckoutReadiness',true,'showShippingProgress',false,'trustMessage','Güvenli ödeme'),
    'footer',pg_catalog.jsonb_build_object(
      'tone','dark',
      'groups',pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object('heading','Mağaza','links',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','system','destination','/products'),pg_catalog.jsonb_build_object('kind','system','destination','/favorites'))),
        pg_catalog.jsonb_build_object('heading','Hesap','links',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','system','destination','/account')))
      ),
      'newsletter',pg_catalog.jsonb_build_object('enabled',false,'heading','Bizden haber alın','body','Yeni ürün ve mağaza duyurularını e-postanızda alın.','consentLabel','Aydınlatma metnini okudum ve iletişime izin veriyorum.'),
      'social','[]'::jsonb
    )
  )
$function$;

CREATE FUNCTION saas.storefront_theme_composition_upgrade_v2(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE
    WHEN p_config->>'schemaVersion'='2' THEN p_config
    WHEN p_config->>'schemaVersion'='1' THEN pg_catalog.jsonb_build_object(
      'schemaVersion',2,
      'visual',(p_config->'visual')||pg_catalog.jsonb_build_object('headerWidth','wide','sectionSpacing','balanced'),
      'announcement',p_config->'announcement',
      'navigation',p_config->'navigation',
      'sections',p_config->'sections',
      'productDetail',(p_config->'productDetail')||pg_catalog.jsonb_build_object('showBreadcrumbs',true,'showApprovedReviews',true,'showSizeGuide',true,'informationSections',pg_catalog.jsonb_build_array('description','materials_and_care','certifications','shipping_and_returns')),
      'cart',p_config->'cart',
      'footer',saas.storefront_theme_default_composition()->'footer'
    )
    ELSE saas.storefront_theme_default_composition()
  END
$function$;

CREATE FUNCTION saas.storefront_design_upgrade_v3(p_config jsonb,p_composition jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT (p_config-'composition'-'schemaVersion')
    || pg_catalog.jsonb_build_object('schemaVersion',3,'composition',saas.storefront_theme_composition_upgrade_v2(p_composition))
$function$;

CREATE FUNCTION saas.storefront_theme_composition_references_valid(p_store_id uuid,p_config jsonb,p_publish boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE section jsonb; item jsonb; selected_id uuid;
BEGIN
  IF NOT saas.campaign_starter_composition_valid(p_config) THEN RETURN false; END IF;
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
        IF p_publish AND NOT EXISTS(
          SELECT 1 FROM saas.merchant_admin_records showcase
          CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(showcase.config->'items') showcase_item
          JOIN saas.storefront_assets asset ON asset.store_id=p_store_id AND asset.id=(showcase_item->>'assetId')::uuid AND asset.asset_kind='category' AND asset.status='active'
          WHERE showcase.store_id=p_store_id AND showcase.record_kind='category_showcase' AND showcase.status='active' AND showcase_item->>'categoryId'=selected_id::text
        ) THEN RETURN false; END IF;
      END LOOP;
    ELSIF section->>'kind'='product_row' AND section->>'source'='category' THEN
      selected_id:=(section->>'categoryId')::uuid;
      IF NOT EXISTS(SELECT 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=selected_id AND category.status='active') THEN RETURN false; END IF;
    ELSIF section->>'kind'='split_campaign' THEN
      FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'panels') LOOP
        selected_id:=(item->>'assetId')::uuid;
        IF NOT EXISTS(SELECT 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='hero' AND asset.status='active') THEN RETURN false; END IF;
      END LOOP;
    ELSIF section->>'kind'='brand_story' AND section?'assetId' THEN
      selected_id:=(section->>'assetId')::uuid;
      IF NOT EXISTS(SELECT 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='hero' AND asset.status='active') THEN RETURN false; END IF;
    END IF;
  END LOOP;
  IF p_publish AND NOT saas.starter_retail_publication_references_valid(p_store_id,p_config) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END
$function$;

DO $drop_storefront_design_document_checks$
DECLARE selected record;
BEGIN
  FOR selected IN SELECT constraint_name.conname FROM pg_catalog.pg_constraint constraint_name WHERE constraint_name.conrelid='saas.storefront_designs'::regclass AND constraint_name.contype='c' AND pg_catalog.pg_get_constraintdef(constraint_name.oid) LIKE '%storefront_design_document_valid%' LOOP
    EXECUTE pg_catalog.format('ALTER TABLE saas.storefront_designs DROP CONSTRAINT %I',selected.conname);
  END LOOP;
END
$drop_storefront_design_document_checks$;

ALTER FUNCTION saas.storefront_design_document_valid(uuid,jsonb,boolean) RENAME TO storefront_design_document_v2_valid;

CREATE FUNCTION saas.storefront_design_document_valid(p_store_id uuid,p_config jsonb,p_allow_legacy boolean)
RETURNS boolean
LANGUAGE sql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT p_config->>'schemaVersion'='3'
    AND saas.storefront_design_exact_keys(p_config,ARRAY['schemaVersion','brand','hero','promotion','announcement','composition'])
    AND pg_catalog.pg_column_size(p_config)<=98304
    AND saas.storefront_design_document_v2_valid(p_store_id,(p_config-'composition')||pg_catalog.jsonb_build_object('schemaVersion',2),p_allow_legacy)
    AND saas.storefront_theme_composition_references_valid(p_store_id,p_config->'composition',false)
$function$;

CREATE OR REPLACE FUNCTION saas.storefront_design_publishable(p_store_id uuid,p_config jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE slide jsonb;
BEGIN
  IF NOT saas.storefront_design_document_valid(p_store_id,p_config,false)
     OR NOT saas.storefront_theme_composition_references_valid(p_store_id,p_config->'composition',true) THEN RETURN false; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') selected(slide) WHERE (selected.slide->>'enabled')::boolean) THEN RETURN false; END IF;
  FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') LOOP
    IF (slide->>'enabled')::boolean AND (NOT saas.storefront_design_text_valid(slide->'headline',1,120) OR slide->'desktopImage'='null'::jsonb OR NOT saas.storefront_design_media_reference_valid(p_store_id,slide->'desktopImage',false)) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END
$function$;

ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_schema_version_check;
ALTER TABLE saas.storefront_designs ALTER COLUMN schema_version SET DEFAULT 3;
UPDATE saas.storefront_designs design
SET schema_version=3,
    draft_config=saas.storefront_design_upgrade_v3(design.draft_config,COALESCE((SELECT publication.config FROM saas.campaign_starter_publications publication WHERE publication.store_id=design.store_id),saas.storefront_theme_default_composition())),
    published_config=saas.storefront_design_upgrade_v3(design.published_config,COALESCE((SELECT publication.config FROM saas.campaign_starter_publications publication WHERE publication.store_id=design.store_id),saas.storefront_theme_default_composition()));
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_schema_version_check CHECK(schema_version=3);
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_draft_unified_theme_check CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_published_unified_theme_check CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

CREATE OR REPLACE FUNCTION saas.storefront_design_workspace_payload(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',3,'draftVersion',design.draft_version,'publishedVersion',design.published_version,
    'draftUpdatedAt',saas.storefront_design_timestamp(design.draft_updated_at),'publishedAt',saas.storefront_design_timestamp(design.published_at),
    'draft',design.draft_config,'published',saas.storefront_design_public_payload(design.store_id,design.published_config,design.published_version,design.published_at),
    'store',pg_catalog.jsonb_build_object('name',store.name,'timezone',COALESCE((SELECT setting.config->>'timezone' FROM saas.merchant_admin_records setting WHERE setting.store_id=store.id AND setting.record_kind='general_setting' AND setting.status='active' AND setting.config?'timezone' ORDER BY setting.updated_at DESC,setting.id DESC LIMIT 1),'Europe/Istanbul')),
    'media',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',media.id,'url',media.public_url,'altText',media.alt_text,'mediaType',media.media_type,'width',media.width,'height',media.height) ORDER BY media.created_at DESC,media.id) FROM saas.storefront_design_media media WHERE media.store_id=design.store_id AND media.status='active'),'[]'::jsonb),
    'destinations',COALESCE((SELECT pg_catalog.jsonb_agg(choice.payload ORDER BY choice.label,choice.resource_id) FROM (
      SELECT product.title label,product.id resource_id,pg_catalog.jsonb_build_object('kind','product','resourceId',product.id,'label',product.title,'path','/products/'||product.slug) payload FROM saas.products product WHERE product.store_id=design.store_id AND product.status='active'
      UNION ALL SELECT category.name,category.id,pg_catalog.jsonb_build_object('kind','collection','resourceId',category.id,'label',category.name,'path','/collections/'||category.slug) FROM saas.catalog_categories category WHERE category.store_id=design.store_id AND category.status='active'
      UNION ALL SELECT page.name,page.id,pg_catalog.jsonb_build_object('kind','page','resourceId',page.id,'label',page.name,'path','/pages/'||(page.config->>'slug')) FROM saas.merchant_admin_records page WHERE page.store_id=design.store_id AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true'
    ) choice),'[]'::jsonb)
  ) FROM saas.storefront_designs design JOIN saas.stores store ON store.id=design.store_id WHERE design.store_id=p_store_id
$function$;

DO $storefront_unified_theme_public_resolver$
DECLARE source text; old_source constant text:='SELECT publication.config INTO config FROM saas.campaign_starter_publications publication WHERE publication.store_id=p_store_id;'; new_source constant text:='SELECT design.published_config->''composition'' INTO config FROM saas.storefront_designs design WHERE design.store_id=p_store_id;';
BEGIN
  SELECT procedure.prosrc INTO source FROM pg_catalog.pg_proc procedure WHERE procedure.oid='saas.public_starter_retail_presentation(uuid,timestamp with time zone,boolean)'::regprocedure;
  IF pg_catalog.strpos(source,old_source)=0 THEN RAISE EXCEPTION 'STOREFRONT_UNIFIED_THEME_PUBLIC_RESOLVER_SOURCE_INVALID'; END IF;
  source:=pg_catalog.replace(source,old_source,new_source);
  EXECUTE pg_catalog.format('CREATE OR REPLACE FUNCTION saas.public_starter_retail_presentation(p_store_id uuid,p_now timestamptz,p_allow_index boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS %L',source);
END
$storefront_unified_theme_public_resolver$;

REVOKE ALL ON FUNCTION saas.storefront_theme_default_composition(),saas.storefront_theme_composition_upgrade_v2(jsonb),saas.storefront_design_upgrade_v3(jsonb,jsonb),saas.storefront_theme_composition_references_valid(uuid,jsonb,boolean),saas.storefront_design_document_v2_valid(uuid,jsonb,boolean),saas.storefront_design_document_valid(uuid,jsonb,boolean),saas.storefront_design_publishable(uuid,jsonb),saas.storefront_design_workspace_payload(uuid),saas.public_starter_retail_presentation(uuid,timestamptz,boolean) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_starter_retail_presentation(uuid,timestamptz,boolean) TO celebix_saas_host_resolver;

COMMIT;
