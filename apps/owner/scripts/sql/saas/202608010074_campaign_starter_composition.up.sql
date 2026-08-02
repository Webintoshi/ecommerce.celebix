-- Phase 4D: versioned, tenant-bound Campaign Starter composition authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure('saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_starter_presentation(uuid,timestamp with time zone,boolean)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_list_products(uuid,text,timestamp with time zone,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_list_products_by_category(uuid,text,timestamp with time zone,text,integer)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_save_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NOT NULL
  THEN RAISE EXCEPTION 'CAMPAIGN_STARTER_SOURCE_INVALID'; END IF;
END
$f$;

LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_operations IN ACCESS EXCLUSIVE MODE;

ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check;
ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind IN(
  'discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy',
  'marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite',
  'accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request',
  'notification_setting','theme_setting','hero_banner','promotion_banner','marquee_setting','category_showcase','starter_theme_composition',
  'seo_geo_profile','seo_internal_link','seo_content_entry','seo_category_entry','seo_page_entry','seo_product_entry','ai_setting'
));

ALTER FUNCTION saas.merchant_admin_required_action(text,boolean) RENAME TO merchant_admin_required_action_without_campaign_starter;
ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb) RENAME TO merchant_admin_config_valid_without_campaign_starter;
ALTER FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) RENAME TO merchant_admin_list_without_campaign_starter;
ALTER FUNCTION saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) RENAME TO merchant_admin_list_events_without_campaign_starter;
ALTER FUNCTION saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid) RENAME TO merchant_admin_get_record_without_campaign_starter;
ALTER FUNCTION saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) RENAME TO merchant_admin_save_without_campaign_starter;
ALTER FUNCTION saas.public_starter_presentation(uuid,timestamptz,boolean) RENAME TO public_starter_presentation_without_campaign_starter;

REVOKE ALL ON FUNCTION
  saas.merchant_admin_required_action_without_campaign_starter(text,boolean),
  saas.merchant_admin_config_valid_without_campaign_starter(text,jsonb),
  saas.merchant_admin_list_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_list_events_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_get_record_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),
  saas.merchant_admin_save_without_campaign_starter(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),
  saas.public_starter_presentation_without_campaign_starter(uuid,timestamptz,boolean)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.campaign_starter_text_valid(p_value jsonb,p_min integer,p_max integer)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.jsonb_typeof(p_value)='string'
    AND pg_catalog.octet_length(p_value#>>'{}') BETWEEN p_min AND p_max
    AND p_value#>>'{}'=pg_catalog.btrim(p_value#>>'{}')
    AND p_value#>>'{}'!~'[[:cntrl:]]'
$f$;

CREATE FUNCTION saas.campaign_starter_uuid_valid(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.jsonb_typeof(p_value)='string' AND p_value#>>'{}'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
$f$;

CREATE FUNCTION saas.campaign_starter_destination_valid(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT saas.campaign_starter_text_valid(p_value,1,512)
    AND p_value#>>'{}'~'^/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*$'
    AND p_value#>>'{}'!~'(^//|\\|(?:^|/)\.\.?(/|$))'
$f$;

CREATE FUNCTION saas.campaign_starter_exact_keys(p_value jsonb,p_required text[],p_optional text[] DEFAULT ARRAY[]::text[])
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
  SELECT pg_catalog.jsonb_typeof(p_value)='object'
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.unnest(p_required) key WHERE NOT p_value?key)
    AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_value) key WHERE NOT key=ANY(p_required||p_optional))
$f$;

CREATE FUNCTION saas.campaign_starter_composition_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE section jsonb; slide jsonb; panel jsonb; item jsonb; kind text; seen text[]:=ARRAY[]::text[]; source text;
BEGIN
  IF pg_catalog.octet_length(p_config::text)>16384
    OR NOT saas.campaign_starter_exact_keys(p_config,ARRAY['schemaVersion','visual','announcement','navigation','sections','productDetail','cart'])
    OR p_config->'schemaVersion'<>'1'::jsonb THEN RETURN false; END IF;
  IF NOT saas.campaign_starter_exact_keys(p_config->'visual',ARRAY['colorScheme','headingStyle','cornerStyle','headerStyle','productCardStyle','productImageRatio'])
    OR p_config->'visual'->>'colorScheme' NOT IN('neutral','warm','dark','ocean')
    OR p_config->'visual'->>'headingStyle' NOT IN('serif','sans')
    OR p_config->'visual'->>'cornerStyle' NOT IN('square','soft')
    OR p_config->'visual'->>'headerStyle' NOT IN('overlay','solid')
    OR p_config->'visual'->>'productCardStyle' NOT IN('editorial','compact')
    OR p_config->'visual'->>'productImageRatio' NOT IN('portrait','square') THEN RETURN false; END IF;
  IF NOT saas.campaign_starter_exact_keys(p_config->'announcement',ARRAY['enabled','items'],ARRAY['destination'])
    OR pg_catalog.jsonb_typeof(p_config->'announcement'->'enabled')<>'boolean'
    OR pg_catalog.jsonb_typeof(p_config->'announcement'->'items')<>'array'
    OR pg_catalog.jsonb_array_length(p_config->'announcement'->'items')>12
    OR ((p_config->'announcement'->>'enabled')::boolean AND pg_catalog.jsonb_array_length(p_config->'announcement'->'items')=0)
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'announcement'->'items') value WHERE NOT saas.campaign_starter_text_valid(value,1,160))
    OR (p_config->'announcement'?'destination' AND NOT saas.campaign_starter_destination_valid(p_config->'announcement'->'destination')) THEN RETURN false; END IF;
  IF NOT saas.campaign_starter_exact_keys(p_config->'navigation',ARRAY['rootCategoryIds'],ARRAY['featuredCategoryId','featuredAssetId'])
    OR pg_catalog.jsonb_typeof(p_config->'navigation'->'rootCategoryIds')<>'array'
    OR pg_catalog.jsonb_array_length(p_config->'navigation'->'rootCategoryIds')>8
    OR (p_config->'navigation'?'featuredCategoryId')<>(p_config->'navigation'?'featuredAssetId')
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'navigation'->'rootCategoryIds') value WHERE NOT saas.campaign_starter_uuid_valid(value))
    OR (SELECT pg_catalog.count(DISTINCT value) FROM pg_catalog.jsonb_array_elements_text(p_config->'navigation'->'rootCategoryIds') value)<>pg_catalog.jsonb_array_length(p_config->'navigation'->'rootCategoryIds')
    OR (p_config->'navigation'?'featuredCategoryId' AND (NOT saas.campaign_starter_uuid_valid(p_config->'navigation'->'featuredCategoryId') OR NOT saas.campaign_starter_uuid_valid(p_config->'navigation'->'featuredAssetId'))) THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(p_config->'sections')<>'array' OR pg_catalog.jsonb_array_length(p_config->'sections') NOT BETWEEN 1 AND 12 THEN RETURN false; END IF;
  FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'sections') LOOP
    kind:=section->>'kind'; IF kind NOT IN('hero','category_grid','product_row','split_campaign','brand_story') THEN RETURN false; END IF;
    IF kind<>'product_row' AND kind=ANY(seen) THEN RETURN false; END IF; seen:=seen||kind;
    IF kind='hero' THEN
      IF NOT saas.campaign_starter_exact_keys(section,ARRAY['kind','enabled','slides']) OR pg_catalog.jsonb_typeof(section->'enabled')<>'boolean' OR pg_catalog.jsonb_typeof(section->'slides')<>'array' OR pg_catalog.jsonb_array_length(section->'slides') NOT BETWEEN 1 AND 3 THEN RETURN false; END IF;
      FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'slides') LOOP
        IF NOT saas.campaign_starter_exact_keys(slide,ARRAY['heading','desktopAssetId','destination'],ARRAY['eyebrow','body','mobileAssetId','productId'])
          OR NOT saas.campaign_starter_text_valid(slide->'heading',1,160) OR NOT saas.campaign_starter_uuid_valid(slide->'desktopAssetId') OR NOT saas.campaign_starter_destination_valid(slide->'destination')
          OR (slide?'eyebrow' AND NOT saas.campaign_starter_text_valid(slide->'eyebrow',1,80)) OR (slide?'body' AND NOT saas.campaign_starter_text_valid(slide->'body',1,500))
          OR (slide?'mobileAssetId' AND NOT saas.campaign_starter_uuid_valid(slide->'mobileAssetId')) OR (slide?'productId' AND NOT saas.campaign_starter_uuid_valid(slide->'productId')) THEN RETURN false; END IF;
      END LOOP;
    ELSIF kind='category_grid' THEN
      IF NOT saas.campaign_starter_exact_keys(section,ARRAY['kind','enabled','heading','categoryIds']) OR pg_catalog.jsonb_typeof(section->'enabled')<>'boolean' OR NOT saas.campaign_starter_text_valid(section->'heading',1,160) OR pg_catalog.jsonb_typeof(section->'categoryIds')<>'array' OR pg_catalog.jsonb_array_length(section->'categoryIds') NOT BETWEEN 1 AND 8
        OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(section->'categoryIds') value WHERE NOT saas.campaign_starter_uuid_valid(value)) OR (SELECT pg_catalog.count(DISTINCT value) FROM pg_catalog.jsonb_array_elements_text(section->'categoryIds') value)<>pg_catalog.jsonb_array_length(section->'categoryIds') THEN RETURN false; END IF;
    ELSIF kind='product_row' THEN
      IF NOT saas.campaign_starter_exact_keys(section,ARRAY['kind','enabled','heading','source','limit'],ARRAY['categoryId']) OR pg_catalog.jsonb_typeof(section->'enabled')<>'boolean' OR NOT saas.campaign_starter_text_valid(section->'heading',1,160) OR section->>'source' NOT IN('latest','sale','category') OR section->'limit' NOT IN('4'::jsonb,'8'::jsonb,'12'::jsonb) THEN RETURN false; END IF;
      source:=section->>'source'; IF (source='category')<>(section?'categoryId') OR (section?'categoryId' AND NOT saas.campaign_starter_uuid_valid(section->'categoryId')) THEN RETURN false; END IF;
    ELSIF kind='split_campaign' THEN
      IF NOT saas.campaign_starter_exact_keys(section,ARRAY['kind','enabled','panels']) OR pg_catalog.jsonb_typeof(section->'enabled')<>'boolean' OR pg_catalog.jsonb_typeof(section->'panels')<>'array' OR pg_catalog.jsonb_array_length(section->'panels') NOT BETWEEN 1 AND 2 THEN RETURN false; END IF;
      FOR panel IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'panels') LOOP
        IF NOT saas.campaign_starter_exact_keys(panel,ARRAY['heading','assetId','destination'],ARRAY['eyebrow','body']) OR NOT saas.campaign_starter_text_valid(panel->'heading',1,160) OR NOT saas.campaign_starter_uuid_valid(panel->'assetId') OR NOT saas.campaign_starter_destination_valid(panel->'destination') OR (panel?'eyebrow' AND NOT saas.campaign_starter_text_valid(panel->'eyebrow',1,80)) OR (panel?'body' AND NOT saas.campaign_starter_text_valid(panel->'body',1,500)) THEN RETURN false; END IF;
      END LOOP;
    ELSE
      IF NOT saas.campaign_starter_exact_keys(section,ARRAY['kind','enabled','heading','body'],ARRAY['eyebrow','assetId','destination']) OR pg_catalog.jsonb_typeof(section->'enabled')<>'boolean' OR NOT saas.campaign_starter_text_valid(section->'heading',1,160) OR NOT saas.campaign_starter_text_valid(section->'body',1,1000) OR (section?'eyebrow' AND NOT saas.campaign_starter_text_valid(section->'eyebrow',1,80)) OR (section?'assetId' AND NOT saas.campaign_starter_uuid_valid(section->'assetId')) OR (section?'destination' AND NOT saas.campaign_starter_destination_valid(section->'destination')) THEN RETURN false; END IF;
    END IF;
  END LOOP;
  IF NOT saas.campaign_starter_exact_keys(p_config->'productDetail',ARRAY['galleryStyle','showSku','showBrand','showRelatedProducts','mobileStickyPurchase']) OR p_config->'productDetail'->>'galleryStyle' NOT IN('grid','rail') OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(p_config->'productDetail') pair WHERE pair.key<>'galleryStyle' AND pg_catalog.jsonb_typeof(pair.value)<>'boolean') THEN RETURN false; END IF;
  IF NOT saas.campaign_starter_exact_keys(p_config->'cart',ARRAY['showCheckoutReadiness','showShippingProgress'],ARRAY['trustMessage']) OR pg_catalog.jsonb_typeof(p_config->'cart'->'showCheckoutReadiness')<>'boolean' OR pg_catalog.jsonb_typeof(p_config->'cart'->'showShippingProgress')<>'boolean' OR (p_config->'cart'?'trustMessage' AND NOT saas.campaign_starter_text_valid(p_config->'cart'->'trustMessage',1,160)) THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END
$f$;

CREATE FUNCTION saas.merchant_admin_required_action(p_kind text,p_mutation boolean)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_kind='starter_theme_composition' THEN CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END ELSE saas.merchant_admin_required_action_without_campaign_starter(p_kind,p_mutation) END
$f$;

CREATE TABLE saas.campaign_starter_publications(
  store_id uuid NOT NULL,
  record_id uuid NOT NULL,
  record_version bigint NOT NULL,
  config jsonb NOT NULL,
  published_at timestamptz NOT NULL,
  PRIMARY KEY(store_id),
  UNIQUE(store_id,record_id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,record_id) REFERENCES saas.merchant_admin_records(store_id,id) ON DELETE RESTRICT,
  CHECK(record_version>0),
  CHECK(saas.campaign_starter_composition_valid(config)),
  CHECK(pg_catalog.isfinite(published_at))
);
ALTER TABLE saas.campaign_starter_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.campaign_starter_publications FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.campaign_starter_publications FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_workflow,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_kind='starter_theme_composition' THEN saas.campaign_starter_composition_valid(p_config) ELSE saas.merchant_admin_config_valid_without_campaign_starter(p_kind,p_config) END
$f$;

CREATE FUNCTION saas.merchant_admin_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
 IF p_kind IS DISTINCT FROM 'starter_theme_composition' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_without_campaign_starter(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind); RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.merchant_admin_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind=p_kind AND r.status<>'archived'),'[]'::jsonb));
END
$f$;

CREATE FUNCTION saas.merchant_admin_list_events(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
 IF p_kind IS DISTINCT FROM 'starter_theme_composition' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_events_without_campaign_starter(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind); RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.merchant_admin_event_projection(p_store_id,e.id) ORDER BY e.occurred_at DESC,e.id DESC) FROM saas.merchant_admin_events e WHERE e.store_id=p_store_id AND e.record_kind=p_kind),'[]'::jsonb));
END
$f$;

CREATE FUNCTION saas.merchant_admin_get_record(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_record_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; projection jsonb;
BEGIN
 IF p_kind IS DISTINCT FROM 'starter_theme_composition' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_get_record_without_campaign_starter(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,p_record_id); RETURN; END IF;
 IF p_record_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 SELECT saas.merchant_admin_projection(p_store_id,r.id) INTO projection FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind=p_kind;
 RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'record_not_found' ELSE 'found' END,projection;
END
$f$;

CREATE FUNCTION saas.merchant_admin_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text,p_name text,p_config jsonb,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; reference jsonb; selected_id uuid; existing_id uuid; delegated_outcome text; delegated_payload jsonb;
BEGIN
 IF p_kind IS DISTINCT FROM 'starter_theme_composition' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_save_without_campaign_starter(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status); RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id) THEN RETURN QUERY SELECT * FROM saas.merchant_admin_save_without_campaign_starter(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status); RETURN; END IF;
 IF NOT saas.campaign_starter_composition_valid(p_config) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT id INTO existing_id FROM saas.merchant_admin_records WHERE store_id=p_store_id AND record_kind=p_kind AND status<>'archived' ORDER BY updated_at DESC,id DESC LIMIT 1 FOR UPDATE;
 IF existing_id IS NOT NULL AND existing_id<>p_record_id THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 FOR selected_id IN SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(p_config->'navigation'->'rootCategoryIds') value LOOP PERFORM 1 FROM saas.catalog_categories WHERE store_id=p_store_id AND id=selected_id AND status='active' FOR KEY SHARE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; END LOOP;
 IF p_config->'navigation'?'featuredCategoryId' THEN
   selected_id:=(p_config->'navigation'->>'featuredCategoryId')::uuid; PERFORM 1 FROM saas.catalog_categories WHERE store_id=p_store_id AND id=selected_id AND status='active' FOR KEY SHARE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
   selected_id:=(p_config->'navigation'->>'featuredAssetId')::uuid; PERFORM 1 FROM saas.storefront_assets WHERE store_id=p_store_id AND id=selected_id AND asset_kind='category' AND status='active' FOR KEY SHARE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 END IF;
 FOR reference IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'sections') LOOP
   IF reference->>'kind'='hero' THEN
     FOR reference IN SELECT value FROM pg_catalog.jsonb_array_elements(reference->'slides') LOOP
       selected_id:=(reference->>'desktopAssetId')::uuid; PERFORM 1 FROM saas.storefront_assets WHERE store_id=p_store_id AND id=selected_id AND asset_kind='hero' AND status='active' FOR KEY SHARE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
       IF reference?'mobileAssetId' THEN selected_id:=(reference->>'mobileAssetId')::uuid; PERFORM 1 FROM saas.storefront_assets WHERE store_id=p_store_id AND id=selected_id AND asset_kind='hero' AND status='active' FOR KEY SHARE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; END IF;
       IF reference?'productId' THEN selected_id:=(reference->>'productId')::uuid; PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=selected_id AND status='active' FOR KEY SHARE; IF NOT FOUND OR (p_status='active' AND saas.public_category_product_projection(p_store_id,selected_id,p_now) IS NULL) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; END IF;
     END LOOP;
   ELSIF reference->>'kind'='category_grid' THEN
     FOR selected_id IN SELECT value::uuid FROM pg_catalog.jsonb_array_elements_text(reference->'categoryIds') value LOOP
       PERFORM 1 FROM saas.catalog_categories WHERE store_id=p_store_id AND id=selected_id AND status='active' FOR KEY SHARE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
       IF p_status='active' THEN PERFORM 1 FROM saas.merchant_admin_records showcase JOIN LATERAL pg_catalog.jsonb_array_elements(showcase.config->'items') showcase_item ON true JOIN saas.storefront_assets asset ON asset.store_id=p_store_id AND asset.id=(showcase_item->>'assetId')::uuid AND asset.asset_kind='category' AND asset.status='active' WHERE showcase.store_id=p_store_id AND showcase.record_kind='category_showcase' AND showcase.status='active' AND showcase_item->>'categoryId'=selected_id::text FOR KEY SHARE OF showcase,asset; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; END IF;
     END LOOP;
   ELSIF reference->>'kind'='product_row' AND reference->>'source'='category' THEN selected_id:=(reference->>'categoryId')::uuid; PERFORM 1 FROM saas.catalog_categories WHERE store_id=p_store_id AND id=selected_id AND status='active' FOR KEY SHARE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
   ELSIF reference->>'kind'='split_campaign' THEN FOR reference IN SELECT value FROM pg_catalog.jsonb_array_elements(reference->'panels') LOOP selected_id:=(reference->>'assetId')::uuid; PERFORM 1 FROM saas.storefront_assets WHERE store_id=p_store_id AND id=selected_id AND asset_kind='hero' AND status='active' FOR KEY SHARE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; END LOOP;
   ELSIF reference->>'kind'='brand_story' AND reference?'assetId' THEN selected_id:=(reference->>'assetId')::uuid; PERFORM 1 FROM saas.storefront_assets WHERE store_id=p_store_id AND id=selected_id AND asset_kind='hero' AND status='active' FOR KEY SHARE; IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
   END IF;
 END LOOP;
 SELECT delegated.outcome,delegated.result_payload INTO delegated_outcome,delegated_payload
 FROM saas.merchant_admin_save_without_campaign_starter(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status) delegated;
 IF delegated_outcome='saved' AND p_status='active' THEN
   INSERT INTO saas.campaign_starter_publications(store_id,record_id,record_version,config,published_at)
   VALUES(p_store_id,p_record_id,(delegated_payload->>'version')::bigint,p_config,p_now)
   ON CONFLICT(store_id) DO UPDATE SET record_id=EXCLUDED.record_id,record_version=EXCLUDED.record_version,config=EXCLUDED.config,published_at=EXCLUDED.published_at;
 END IF;
 RETURN QUERY SELECT delegated_outcome,delegated_payload;
END
$f$;

CREATE FUNCTION saas.public_campaign_asset(p_store_id uuid,p_asset_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object('url',asset.public_url,'mediaType',asset.media_type,'altText',asset.alt_text,'width',asset.width,'height',asset.height)
 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=p_asset_id AND asset.status='active'
$f$;

CREATE FUNCTION saas.public_campaign_navigation_item(p_store_id uuid,p_category_id uuid,p_depth integer,p_featured_category_id uuid,p_featured_asset_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE category_record record; children jsonb; featured jsonb; featured_image jsonb;
BEGIN
 SELECT category.name,category.slug INTO category_record FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=p_category_id AND category.status='active'; IF NOT FOUND THEN RETURN NULL; END IF;
 IF p_depth<2 THEN
   SELECT COALESCE(pg_catalog.jsonb_agg(resolved.value ORDER BY child.position,child.id) FILTER(WHERE resolved.value IS NOT NULL),'[]'::jsonb) INTO children
   FROM saas.catalog_categories child
   CROSS JOIN LATERAL (SELECT saas.public_campaign_navigation_item(p_store_id,child.id,p_depth+1,p_featured_category_id,p_featured_asset_id) value) resolved
   WHERE child.store_id=p_store_id AND child.parent_id=p_category_id AND child.status='active';
 ELSE children:='[]'::jsonb; END IF;
 IF p_category_id=p_featured_category_id THEN featured_image:=saas.public_campaign_asset(p_store_id,p_featured_asset_id); IF featured_image IS NOT NULL THEN featured:=pg_catalog.jsonb_build_object('name',category_record.name,'slug',category_record.slug,'image',featured_image); END IF; END IF;
 RETURN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('name',category_record.name,'slug',category_record.slug,'children',children,'featured',featured));
END
$f$;

CREATE FUNCTION saas.public_starter_presentation(p_store_id uuid,p_now timestamptz,p_allow_index boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE
 base jsonb; config jsonb; section jsonb; item jsonb; resolved jsonb;
 sections jsonb:='[]'::jsonb; navigation jsonb:='[]'::jsonb; slides jsonb; panels jsonb; categories jsonb; hero jsonb;
 row_index integer:=0; asset jsonb; hotspot jsonb; featured_category uuid; featured_asset uuid; category_slug text;
BEGIN
 base:=saas.public_starter_presentation_without_campaign_starter(p_store_id,p_now,p_allow_index); IF base IS NULL THEN RETURN NULL; END IF;
 SELECT publication.config INTO config FROM saas.campaign_starter_publications publication WHERE publication.store_id=p_store_id; IF config IS NULL THEN RETURN base; END IF;
 IF config->'navigation'?'featuredCategoryId' THEN featured_category:=(config->'navigation'->>'featuredCategoryId')::uuid; featured_asset:=(config->'navigation'->>'featuredAssetId')::uuid; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(resolved_root.value ORDER BY root.ordinality) FILTER(WHERE resolved_root.value IS NOT NULL),'[]'::jsonb) INTO navigation
 FROM pg_catalog.jsonb_array_elements_text(config->'navigation'->'rootCategoryIds') WITH ORDINALITY root(value,ordinality)
 CROSS JOIN LATERAL (SELECT saas.public_campaign_navigation_item(p_store_id,root.value::uuid,0,featured_category,featured_asset) value) resolved_root;
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(config->'sections') LOOP
   IF NOT (section->>'enabled')::boolean THEN CONTINUE; END IF;
   IF section->>'kind'='hero' THEN
     slides:='[]'::jsonb; FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'slides') LOOP
       asset:=saas.public_campaign_asset(p_store_id,(item->>'desktopAssetId')::uuid); IF asset IS NULL THEN CONTINUE; END IF; hotspot:=NULL;
       IF item?'productId' THEN SELECT pg_catalog.jsonb_build_object('productSlug',product.slug,'title',product.title,'priceCents',(projection.value->>'priceCents')::bigint,'currency','TRY') INTO hotspot FROM saas.products product CROSS JOIN LATERAL (SELECT saas.public_category_product_projection(p_store_id,product.id,p_now) value) projection WHERE product.store_id=p_store_id AND product.id=(item->>'productId')::uuid AND projection.value IS NOT NULL; END IF;
       slides:=slides||pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('eyebrow',item->>'eyebrow','heading',item->>'heading','body',item->>'body','desktopImage',asset,'mobileImage',CASE WHEN item?'mobileAssetId' THEN saas.public_campaign_asset(p_store_id,(item->>'mobileAssetId')::uuid) END,'destination',item->>'destination','hotspot',hotspot)));
     END LOOP; IF pg_catalog.jsonb_array_length(slides)=0 THEN CONTINUE; END IF; resolved:=pg_catalog.jsonb_build_object('kind','hero','slides',slides); IF hero IS NULL THEN hero:=slides->0; END IF;
   ELSIF section->>'kind'='category_grid' THEN
     SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',category.name,'slug',category.slug,'image',saas.public_campaign_asset(p_store_id,asset.id)) ORDER BY requested.ordinality) INTO categories
     FROM pg_catalog.jsonb_array_elements_text(section->'categoryIds') WITH ORDINALITY requested(id,ordinality)
     JOIN saas.catalog_categories category ON category.store_id=p_store_id AND category.id=requested.id::uuid AND category.status='active'
     JOIN LATERAL (SELECT showcase_item FROM saas.merchant_admin_records showcase CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(showcase.config->'items') showcase_item WHERE showcase.store_id=p_store_id AND showcase.record_kind='category_showcase' AND showcase.status='active' AND showcase_item->>'categoryId'=requested.id ORDER BY showcase.updated_at DESC LIMIT 1) mapping ON true
     JOIN saas.storefront_assets asset ON asset.store_id=p_store_id AND asset.id=(mapping.showcase_item->>'assetId')::uuid AND asset.asset_kind='category' AND asset.status='active';
     IF categories IS NULL OR pg_catalog.jsonb_array_length(categories)=0 THEN CONTINUE; END IF; resolved:=pg_catalog.jsonb_build_object('kind','category_grid','heading',section->>'heading','items',categories);
   ELSIF section->>'kind'='product_row' THEN
     category_slug:=NULL; IF section->>'source'='category' THEN SELECT slug INTO category_slug FROM saas.catalog_categories WHERE store_id=p_store_id AND id=(section->>'categoryId')::uuid AND status='active'; IF category_slug IS NULL THEN CONTINUE; END IF; END IF;
     resolved:=pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind','product_row','key',(section->>'source')||'-'||row_index,'heading',section->>'heading','source',section->>'source','categorySlug',category_slug,'limit',(section->>'limit')::integer)); row_index:=row_index+1;
   ELSIF section->>'kind'='split_campaign' THEN
     panels:='[]'::jsonb; FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'panels') LOOP asset:=saas.public_campaign_asset(p_store_id,(item->>'assetId')::uuid); IF asset IS NULL THEN CONTINUE; END IF; panels:=panels||pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('eyebrow',item->>'eyebrow','heading',item->>'heading','body',item->>'body','image',asset,'destination',item->>'destination'))); END LOOP; IF pg_catalog.jsonb_array_length(panels)=0 THEN CONTINUE; END IF; resolved:=pg_catalog.jsonb_build_object('kind','split_campaign','panels',panels);
   ELSE asset:=CASE WHEN section?'assetId' THEN saas.public_campaign_asset(p_store_id,(section->>'assetId')::uuid) END; resolved:=pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind','brand_story','eyebrow',section->>'eyebrow','heading',section->>'heading','body',section->>'body','image',asset,'destination',section->>'destination'));
   END IF; sections:=sections||pg_catalog.jsonb_build_array(resolved);
 END LOOP;
 RETURN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('schemaVersion',2,'displayName',base->>'displayName','supportEmail',base->>'supportEmail','logo',base->'logo','theme',pg_catalog.jsonb_build_object('colorScheme',config->'visual'->>'colorScheme','headingStyle',config->'visual'->>'headingStyle','productCardStyle',config->'visual'->>'productCardStyle','productImageRatio',config->'visual'->>'productImageRatio','homeProductLimit',COALESCE((SELECT (s->>'limit')::integer FROM pg_catalog.jsonb_array_elements(config->'sections') s WHERE s->>'kind'='product_row' LIMIT 1),8),'showBrandStory',EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(config->'sections') s WHERE s->>'kind'='brand_story' AND (s->>'enabled')::boolean)),'hero',COALESCE(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('enabled',hero IS NOT NULL,'headline',COALESCE(hero->>'heading',base->'hero'->>'headline'),'body',COALESCE(hero->>'body',''),'destination',COALESCE(hero->>'destination','/products'),'image',hero->'desktopImage')),base->'hero'),'promotion',base->'promotion','marquee',base->'marquee','categoryShowcase',base->'categoryShowcase','visual',config->'visual','announcement',CASE WHEN (config->'announcement'->>'enabled')::boolean THEN ((config->'announcement')-'enabled'::text) END,'navigation',pg_catalog.jsonb_build_object('items',navigation),'sections',sections,'productDetail',config->'productDetail','cart',config->'cart','seo',base->'seo'));
END
$f$;

CREATE OR REPLACE FUNCTION saas.public_starter_presentation(p_store_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT saas.public_starter_presentation(p_store_id,p_now,false) $f$;

ALTER FUNCTION saas.public_get_product_by_slug(uuid,text,timestamptz,text) RENAME TO public_get_product_by_slug_without_campaign_detail;

CREATE FUNCTION saas.public_campaign_product_projection(p_store_id uuid,p_product_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT (
   WITH RECURSIVE resolved_variants AS (
     SELECT variant.*,resolved.price_cents AS effective_price FROM saas.product_variants variant
     CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,variant.id,'storefront',p_now,NULL) resolved
     WHERE variant.store_id=p_store_id AND variant.product_id=product.id AND variant.status='active' AND resolved.outcome='found'
   ), selected_price AS (SELECT * FROM resolved_variants ORDER BY effective_price,created_at,id LIMIT 1),
   variants AS (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',variant.id,'title',variant.title,'sku',variant.sku,'priceCents',variant.effective_price,'compareAtCents',variant.compare_at_cents,'stockTracking',variant.stock_tracking,'stockQuantity',variant.stock_quantity,'available',(NOT variant.stock_tracking OR variant.stock_quantity>0),'attributes',variant.attributes)) ORDER BY variant.created_at,variant.id) payload FROM resolved_variants variant),
   media AS (SELECT COALESCE(pg_catalog.jsonb_agg(saas.public_media_projection(media.id) ORDER BY media.sort_order,media.id),'[]'::jsonb) payload FROM saas.product_media media WHERE media.store_id=p_store_id AND media.product_id=product.id AND media.status='active'),
   selected_category AS (SELECT category.id,category.parent_id,category.name,category.slug,category.depth FROM saas.catalog_product_categories relation JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active' WHERE relation.store_id=p_store_id AND relation.product_id=product.id ORDER BY relation.position,category.depth DESC,category.id LIMIT 1),
   category_ancestors(id,parent_id,name,slug,depth) AS (SELECT id,parent_id,name,slug,depth FROM selected_category UNION ALL SELECT parent.id,parent.parent_id,parent.name,parent.slug,parent.depth FROM saas.catalog_categories parent JOIN category_ancestors child ON child.parent_id=parent.id WHERE parent.store_id=p_store_id AND parent.status='active'),
   category_path AS (SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',name,'slug',slug) ORDER BY depth),'[]'::jsonb) payload FROM category_ancestors),
   brand AS (SELECT pg_catalog.jsonb_build_object('name',resource.name,'slug',resource.slug) payload FROM saas.catalog_admin_resource_products relation JOIN saas.catalog_admin_resources resource ON resource.store_id=relation.store_id AND resource.id=relation.resource_id AND resource.resource_kind='brand' AND resource.status='active' WHERE relation.store_id=p_store_id AND relation.product_id=product.id ORDER BY relation.position,resource.id LIMIT 1)
   SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',product.id,'slug',product.slug,'title',product.title,'description',product.description,'brand',(SELECT payload FROM brand),'categoryPath',category_path.payload,'currency',product.currency,'status','active','priceCents',selected_price.effective_price,'compareAtCents',selected_price.compare_at_cents,'available',EXISTS(SELECT 1 FROM resolved_variants available WHERE NOT available.stock_tracking OR available.stock_quantity>0),'variants',variants.payload,'media',media.payload))
   FROM selected_price CROSS JOIN variants CROSS JOIN media CROSS JOIN category_path
 ) FROM saas.products product WHERE product.store_id=p_store_id AND product.id=p_product_id AND product.status='active'
$f$;

CREATE FUNCTION saas.public_get_product_by_slug(p_store_id uuid,p_hostname text,p_now timestamptz,p_slug text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE projection jsonb;
BEGIN
 IF p_slug IS NULL OR p_slug<>pg_catalog.lower(p_slug) OR pg_catalog.char_length(p_slug) NOT BETWEEN 3 AND 100 OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 SELECT saas.public_campaign_product_projection(p_store_id,product.id,p_now) INTO projection FROM saas.products product WHERE product.store_id=p_store_id AND product.slug=p_slug AND product.status='active';
 RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END,projection;
END
$f$;

CREATE FUNCTION saas.public_storefront_related_products(p_store_id uuid,p_hostname text,p_now timestamptz,p_slug text,p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_product uuid; selected_category uuid; items jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 12 OR p_slug IS NULL OR p_slug<>pg_catalog.lower(p_slug) OR pg_catalog.char_length(p_slug) NOT BETWEEN 3 AND 100 OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 SELECT product.id INTO selected_product FROM saas.products product WHERE product.store_id=p_store_id AND product.slug=p_slug AND product.status='active'; IF selected_product IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 SELECT relation.category_id INTO selected_category FROM saas.catalog_product_categories relation JOIN saas.catalog_categories category ON category.store_id=relation.store_id AND category.id=relation.category_id AND category.status='active' WHERE relation.store_id=p_store_id AND relation.product_id=selected_product ORDER BY relation.position,category.depth DESC,category.id LIMIT 1;
 SELECT COALESCE(pg_catalog.jsonb_agg(candidate.projection ORDER BY candidate.created_at DESC,candidate.id DESC),'[]'::jsonb) INTO items FROM (
   SELECT product.id,product.created_at,saas.public_campaign_product_projection(p_store_id,product.id,p_now) projection
   FROM saas.products product
   WHERE product.store_id=p_store_id AND product.status='active' AND product.id<>selected_product
     AND (selected_category IS NULL OR EXISTS(SELECT 1 FROM saas.catalog_product_categories relation WHERE relation.store_id=p_store_id AND relation.product_id=product.id AND relation.category_id=selected_category))
   ORDER BY product.created_at DESC,product.id DESC LIMIT p_limit
 ) candidate WHERE candidate.projection IS NOT NULL;
 RETURN QUERY SELECT 'found',items;
END
$f$;

CREATE FUNCTION saas.public_campaign_home(p_store_id uuid,p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE presentation jsonb; section jsonb; result record; items jsonb; rows jsonb:='[]'::jsonb;
BEGIN
 IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 presentation:=saas.public_starter_presentation(p_store_id,p_now,false); IF presentation IS NULL OR presentation->>'schemaVersion'<>'2' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(presentation->'sections') LOOP IF section->>'kind'<>'product_row' THEN CONTINUE; END IF;
   IF section->>'source'='category' THEN SELECT * INTO result FROM saas.public_list_products_by_category(p_store_id,p_hostname,p_now,section->>'categorySlug',(section->>'limit')::integer); items:=result.result_payload->'items';
   ELSE SELECT * INTO result FROM saas.public_list_products(p_store_id,p_hostname,p_now,CASE WHEN section->>'source'='sale' THEN 48 ELSE (section->>'limit')::integer END); items:=result.result_payload; IF section->>'source'='sale' THEN SELECT COALESCE(pg_catalog.jsonb_agg(value),'[]'::jsonb) INTO items FROM (SELECT value FROM pg_catalog.jsonb_array_elements(items) value WHERE value?'compareAtCents' AND (value->>'compareAtCents')::bigint>(value->>'priceCents')::bigint LIMIT (section->>'limit')::integer) selected; END IF;
   END IF; IF result.outcome<>'found' OR items IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF; rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key',section->>'key','items',items));
 END LOOP;
 RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('presentation',presentation,'productRows',rows);
END
$f$;

REVOKE ALL ON FUNCTION saas.campaign_starter_text_valid(jsonb,integer,integer),saas.campaign_starter_uuid_valid(jsonb),saas.campaign_starter_destination_valid(jsonb),saas.campaign_starter_exact_keys(jsonb,text[],text[]),saas.campaign_starter_composition_valid(jsonb),saas.merchant_admin_required_action(text,boolean),saas.merchant_admin_config_valid(text,jsonb),saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),saas.public_campaign_asset(uuid,uuid),saas.public_campaign_navigation_item(uuid,uuid,integer,uuid,uuid),saas.public_starter_presentation(uuid,timestamptz),saas.public_starter_presentation(uuid,timestamptz,boolean),saas.public_campaign_product_projection(uuid,uuid,timestamptz),saas.public_get_product_by_slug(uuid,text,timestamptz,text),saas.public_storefront_related_products(uuid,text,timestamptz,text,integer),saas.public_campaign_home(uuid,text,timestamptz) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.public_campaign_home(uuid,text,timestamptz) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.public_get_product_by_slug(uuid,text,timestamptz,text),saas.public_storefront_related_products(uuid,text,timestamptz,text,integer) TO celebix_saas_host_resolver;
COMMIT;
