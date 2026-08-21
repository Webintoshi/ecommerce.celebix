-- Phase 3Z store-scoped logo and category-showcase authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure('saas.public_starter_presentation(uuid,timestamp with time zone,boolean)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_list_products_by_category(uuid,text,timestamp with time zone,text,integer)') IS NOT NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_save_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NOT NULL
  THEN RAISE EXCEPTION 'STOREFRONT_CATEGORY_SHOWCASE_SOURCE_INVALID'; END IF;
END
$f$;

LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_operations IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.storefront_assets IN ACCESS EXCLUSIVE MODE;

ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check;
ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind IN(
  'discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy',
  'marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite',
  'accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request',
  'notification_setting','theme_setting','hero_banner','promotion_banner','marquee_setting','category_showcase','seo_geo_profile',
  'seo_internal_link','seo_content_entry','seo_category_entry','seo_page_entry','seo_product_entry','ai_setting'
));
ALTER TABLE saas.storefront_assets DROP CONSTRAINT storefront_assets_kind_check;
ALTER TABLE saas.storefront_assets ADD CONSTRAINT storefront_assets_kind_check CHECK(asset_kind IN('logo','hero','social','favicon','category'));

ALTER FUNCTION saas.merchant_admin_required_action(text,boolean) RENAME TO merchant_admin_required_action_without_category_showcase;
ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb) RENAME TO merchant_admin_config_valid_without_category_showcase;
ALTER FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) RENAME TO merchant_admin_list_without_category_showcase;
ALTER FUNCTION saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text) RENAME TO merchant_admin_list_events_without_category_showcase;
ALTER FUNCTION saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid) RENAME TO merchant_admin_get_record_without_category_showcase;
ALTER FUNCTION saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) RENAME TO merchant_admin_save_without_category_showcase;
ALTER FUNCTION saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint) RENAME TO storefront_asset_create_without_category;
ALTER FUNCTION saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean) RENAME TO storefront_asset_list_without_category;
ALTER FUNCTION saas.public_starter_presentation(uuid,timestamptz,boolean) RENAME TO public_starter_presentation_without_category_showcase;

REVOKE ALL ON FUNCTION
  saas.merchant_admin_required_action_without_category_showcase(text,boolean),
  saas.merchant_admin_config_valid_without_category_showcase(text,jsonb),
  saas.merchant_admin_list_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_list_events_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_get_record_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),
  saas.merchant_admin_save_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),
  saas.storefront_asset_create_without_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint),
  saas.storefront_asset_list_without_category(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean),
  saas.public_starter_presentation_without_category_showcase(uuid,timestamptz,boolean)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.merchant_admin_required_action(p_kind text,p_mutation boolean)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_kind='category_showcase' THEN CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END
   ELSE saas.merchant_admin_required_action_without_category_showcase(p_kind,p_mutation) END
$f$;

CREATE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE
 WHEN p_kind='theme_setting' THEN
   saas.merchant_admin_config_valid_without_category_showcase(p_kind,p_config-'logoAssetId')
   AND (NOT p_config?'logoAssetId' OR (pg_catalog.jsonb_typeof(p_config->'logoAssetId')='string' AND p_config->>'logoAssetId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
 WHEN p_kind='category_showcase' THEN
   pg_catalog.jsonb_typeof(p_config)='object' AND pg_catalog.octet_length(p_config::text)<=16384
   AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) field(key) WHERE field.key NOT IN('heading','enabled','items'))
   AND p_config?'heading' AND pg_catalog.jsonb_typeof(p_config->'heading')='string'
   AND p_config->>'heading'=pg_catalog.btrim(p_config->>'heading') AND pg_catalog.char_length(p_config->>'heading') BETWEEN 1 AND 160 AND p_config->>'heading'!~'[[:cntrl:]]'
   AND p_config?'enabled' AND pg_catalog.jsonb_typeof(p_config->'enabled')='boolean'
   AND p_config?'items' AND pg_catalog.jsonb_typeof(p_config->'items')='array' AND pg_catalog.jsonb_array_length(p_config->'items') BETWEEN 1 AND 8
   AND NOT EXISTS(
     SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'items') item(value)
     WHERE pg_catalog.jsonb_typeof(item.value)<>'object'
       OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(item.value) field(key) WHERE field.key NOT IN('categoryId','assetId'))
       OR NOT item.value?'categoryId' OR NOT item.value?'assetId'
       OR pg_catalog.jsonb_typeof(item.value->'categoryId')<>'string' OR pg_catalog.jsonb_typeof(item.value->'assetId')<>'string'
       OR item.value->>'categoryId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       OR item.value->>'assetId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
   )
   AND (SELECT pg_catalog.count(DISTINCT item.value->>'categoryId') FROM pg_catalog.jsonb_array_elements(p_config->'items') item(value))=pg_catalog.jsonb_array_length(p_config->'items')
   AND (SELECT pg_catalog.count(DISTINCT item.value->>'assetId') FROM pg_catalog.jsonb_array_elements(p_config->'items') item(value))=pg_catalog.jsonb_array_length(p_config->'items')
 ELSE saas.merchant_admin_config_valid_without_category_showcase(p_kind,p_config) END
$f$;

CREATE FUNCTION saas.merchant_admin_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
 IF p_kind IS DISTINCT FROM 'category_showcase' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_without_category_showcase(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind); RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.merchant_admin_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC) FROM (SELECT id,updated_at FROM saas.merchant_admin_records WHERE store_id=p_store_id AND record_kind=p_kind AND status<>'archived' ORDER BY updated_at DESC,id DESC LIMIT 200) r),'[]'::jsonb));
END
$f$;

CREATE FUNCTION saas.merchant_admin_list_events(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
 IF p_kind IS DISTINCT FROM 'category_showcase' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_events_without_category_showcase(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind); RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.merchant_admin_event_projection(p_store_id,e.id) ORDER BY e.occurred_at DESC,e.id DESC) FROM (SELECT id,occurred_at FROM saas.merchant_admin_events WHERE store_id=p_store_id AND record_kind=p_kind ORDER BY occurred_at DESC,id DESC LIMIT 200) e),'[]'::jsonb));
END
$f$;

CREATE FUNCTION saas.merchant_admin_get_record(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_record_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; projection jsonb;
BEGIN
 IF p_kind IS DISTINCT FROM 'category_showcase' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_get_record_without_category_showcase(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,p_record_id); RETURN; END IF;
 IF p_record_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 SELECT saas.merchant_admin_projection(p_store_id,r.id) INTO projection FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind=p_kind;
 RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'record_not_found' ELSE 'found' END,projection;
END
$f$;

CREATE FUNCTION saas.merchant_admin_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text,p_name text,p_config jsonb,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; item jsonb; selected_id uuid;
BEGIN
 IF p_kind NOT IN('category_showcase','theme_setting') THEN RETURN QUERY SELECT * FROM saas.merchant_admin_save_without_category_showcase(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status); RETURN; END IF;
 authority_error:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id) THEN RETURN QUERY SELECT * FROM saas.merchant_admin_save_without_category_showcase(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status); RETURN; END IF;
 IF NOT saas.merchant_admin_config_valid(p_kind,p_config) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF p_kind='theme_setting' AND p_config?'logoAssetId' THEN
   selected_id:=(p_config->>'logoAssetId')::uuid;
   PERFORM 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='logo' AND asset.status='active' FOR KEY SHARE;
   IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 ELSIF p_kind='category_showcase' THEN
   FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'items') entry(value) LOOP
     selected_id:=(item->>'categoryId')::uuid;
     PERFORM 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=selected_id AND category.status='active' FOR KEY SHARE;
     IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
     selected_id:=(item->>'assetId')::uuid;
     PERFORM 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=selected_id AND asset.asset_kind='category' AND asset.status='active' FOR KEY SHARE;
     IF NOT FOUND THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
   END LOOP;
 END IF;
 RETURN QUERY SELECT * FROM saas.merchant_admin_save_without_category_showcase(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);
END
$f$;

CREATE FUNCTION saas.storefront_asset_create(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_asset_id uuid,p_kind text,p_object_key text,p_public_url text,p_media_type text,p_alt_text text,p_width integer,p_height integer,p_byte_size bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing record; projection jsonb;
BEGIN
 IF p_kind IS DISTINCT FROM 'category' THEN RETURN QUERY SELECT * FROM saas.storefront_asset_create_without_category(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now,p_operation_id,p_fingerprint,p_asset_id,p_kind,p_object_key,p_public_url,p_media_type,p_alt_text,p_width,p_height,p_byte_size); RETURN; END IF;
 authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 SELECT * INTO existing FROM saas.storefront_asset_operation_replay(p_operation_id,p_store_id,'create_asset',p_fingerprint); IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
 PERFORM 1 FROM saas.stores store WHERE store.id=p_store_id AND store.status='active' FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'store_inactive',NULL::jsonb; RETURN; END IF;
 SELECT * INTO existing FROM saas.storefront_asset_operation_replay(p_operation_id,p_store_id,'create_asset',p_fingerprint); IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
 IF p_operation_id IS NULL OR p_asset_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_media_type IS NULL OR p_media_type NOT IN('image/jpeg','image/png','image/webp') OR p_width IS NULL OR p_width NOT BETWEEN 1 AND 8192 OR p_height IS NULL OR p_height NOT BETWEEN 1 AND 8192 OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 5242880 OR p_object_key IS NULL OR p_public_url IS NULL OR p_alt_text IS NULL OR p_alt_text<>pg_catalog.btrim(p_alt_text) OR pg_catalog.char_length(p_alt_text)>500 OR p_alt_text~'[[:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF p_object_key<>'stores/'||p_store_id::text||'/storefront/category/'||p_asset_id::text||(CASE p_media_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END) OR p_public_url!~'^https://media(\.saas-staging)?\.celebix\.site/' OR p_public_url~'[?#[:space:][:cntrl:]]' OR pg_catalog.right(p_public_url,pg_catalog.char_length(p_object_key)+1)<>'/'||p_object_key THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF (SELECT pg_catalog.count(*) FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id)>=64 OR (SELECT COALESCE(pg_catalog.sum(media.byte_size),0) FROM saas.product_media media WHERE media.store_id=p_store_id AND media.status IN('pending','active'))+(SELECT COALESCE(pg_catalog.sum(asset.byte_size),0) FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id)+p_byte_size>p_storage_bytes THEN RETURN QUERY SELECT 'asset_limit_reached',NULL::jsonb; RETURN; END IF;
 INSERT INTO saas.storefront_assets(id,store_id,asset_kind,object_key,public_url,media_type,alt_text,width,height,byte_size,status,created_at,updated_at,version) VALUES(p_asset_id,p_store_id,'category',p_object_key,p_public_url,p_media_type,p_alt_text,p_width,p_height,p_byte_size,'active',p_now,p_now,1);
 projection:=pg_catalog.jsonb_build_object('asset',saas.storefront_asset_projection(p_store_id,p_asset_id)); INSERT INTO saas.storefront_asset_operations VALUES(p_operation_id,p_store_id,'create_asset',p_fingerprint,projection,p_now); RETURN QUERY SELECT 'committed',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END
$f$;

CREATE FUNCTION saas.storefront_asset_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_kind text,p_include_archived boolean)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
 IF p_kind IS DISTINCT FROM 'category' THEN RETURN QUERY SELECT * FROM saas.storefront_asset_list_without_category(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now,p_kind,p_include_archived); RETURN; END IF;
 authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_include_archived IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'found',COALESCE(pg_catalog.jsonb_agg(saas.storefront_asset_projection(p_store_id,asset.id) ORDER BY asset.updated_at DESC,asset.id DESC),'[]'::jsonb) FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.asset_kind='category' AND (p_include_archived OR asset.status='active');
END
$f$;

CREATE FUNCTION saas.public_starter_presentation(p_store_id uuid,p_now timestamptz,p_allow_index boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE base jsonb; theme_config jsonb; showcase_config jsonb; logo jsonb; showcase_items jsonb; expected integer; actual integer;
BEGIN
 base:=saas.public_starter_presentation_without_category_showcase(p_store_id,p_now,p_allow_index); IF base IS NULL THEN RETURN NULL; END IF;
 SELECT r.config INTO theme_config FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='theme_setting' AND r.status='active' ORDER BY r.updated_at DESC,r.id DESC LIMIT 1;
 IF theme_config?'logoAssetId' THEN logo:=saas.public_storefront_asset(p_store_id,'logo',pg_catalog.jsonb_build_object('assetId',theme_config->>'logoAssetId')); END IF;
 SELECT r.config INTO showcase_config FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='category_showcase' AND r.status='active' ORDER BY r.updated_at DESC,r.id DESC LIMIT 1;
 IF showcase_config IS NOT NULL AND COALESCE((showcase_config->>'enabled')::boolean,false) THEN
   expected:=pg_catalog.jsonb_array_length(showcase_config->'items');
   SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',category.id,'name',category.name,'slug',category.slug,'image',saas.public_storefront_asset(p_store_id,'category',item.value)) ORDER BY item.ordinality),pg_catalog.count(*)
   INTO showcase_items,actual
   FROM pg_catalog.jsonb_array_elements(showcase_config->'items') WITH ORDINALITY item(value,ordinality)
   JOIN saas.catalog_categories category ON category.store_id=p_store_id AND category.id=(item.value->>'categoryId')::uuid AND category.status='active'
   JOIN saas.storefront_assets asset ON asset.store_id=p_store_id AND asset.id=(item.value->>'assetId')::uuid AND asset.asset_kind='category' AND asset.status='active';
   IF actual=expected THEN base:=base||pg_catalog.jsonb_build_object('categoryShowcase',pg_catalog.jsonb_build_object('heading',showcase_config->>'heading','items',showcase_items)); END IF;
 END IF;
 RETURN base||pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('logo',logo));
END
$f$;

CREATE OR REPLACE FUNCTION saas.public_starter_presentation(p_store_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT saas.public_starter_presentation(p_store_id,p_now,false) $f$;

CREATE FUNCTION saas.public_category_product_projection(p_store_id uuid,p_product_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT (
   WITH resolved_variants AS (
     SELECT variant.*,resolved.price_cents AS effective_price FROM saas.product_variants variant
     CROSS JOIN LATERAL saas.resolve_effective_variant_price(p_store_id,variant.id,'storefront',p_now,NULL) resolved
     WHERE variant.store_id=p_store_id AND variant.product_id=product.id AND variant.status='active' AND resolved.outcome='found'
   ), selected_price AS (SELECT * FROM resolved_variants ORDER BY effective_price,created_at,id LIMIT 1),
   variants AS (SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',variant.id,'title',variant.title,'sku',variant.sku,'priceCents',variant.effective_price,'compareAtCents',variant.compare_at_cents,'stockTracking',variant.stock_tracking,'stockQuantity',variant.stock_quantity,'available',(NOT variant.stock_tracking OR variant.stock_quantity>0),'attributes',variant.attributes)) ORDER BY variant.created_at,variant.id) payload FROM resolved_variants variant),
   media AS (SELECT COALESCE(pg_catalog.jsonb_agg(saas.public_media_projection(media.id) ORDER BY media.sort_order,media.id),'[]'::jsonb) payload FROM saas.product_media media WHERE media.store_id=p_store_id AND media.product_id=product.id AND media.status='active')
   SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',product.id,'slug',product.slug,'title',product.title,'description',product.description,'currency',product.currency,'status','active','priceCents',selected_price.effective_price,'compareAtCents',selected_price.compare_at_cents,'available',EXISTS(SELECT 1 FROM resolved_variants available WHERE NOT available.stock_tracking OR available.stock_quantity>0),'variants',variants.payload,'media',media.payload)) FROM selected_price CROSS JOIN variants CROSS JOIN media
 ) FROM saas.products product WHERE product.store_id=p_store_id AND product.id=p_product_id AND product.status='active'
$f$;

CREATE FUNCTION saas.public_list_products_by_category(p_store_id uuid,p_hostname text,p_now timestamptz,p_slug text,p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_category saas.catalog_categories%ROWTYPE; items jsonb;
BEGIN
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 48 OR p_slug IS NULL OR p_slug<>pg_catalog.lower(p_slug) OR pg_catalog.char_length(p_slug) NOT BETWEEN 1 AND 100 OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 SELECT category.* INTO selected_category FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.slug=p_slug AND category.status='active';
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(selected.payload ORDER BY selected.available DESC,selected.created_at DESC,selected.id DESC),'[]'::jsonb) INTO items FROM (
   SELECT projected.id,projected.created_at,(projected.payload->>'available')::boolean AS available,projected.payload
   FROM (
     SELECT product.id,product.created_at,saas.public_category_product_projection(p_store_id,product.id,p_now) payload
     FROM saas.catalog_product_categories relation JOIN saas.products product ON product.store_id=relation.store_id AND product.id=relation.product_id AND product.status='active'
     WHERE relation.store_id=p_store_id AND relation.category_id=selected_category.id
   ) projected
   WHERE projected.payload IS NOT NULL
   ORDER BY (projected.payload->>'available')::boolean DESC,projected.created_at DESC,projected.id DESC LIMIT p_limit
 ) selected;
 RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('category',pg_catalog.jsonb_build_object('id',selected_category.id,'name',selected_category.name,'slug',selected_category.slug),'items',items);
END
$f$;

REVOKE ALL ON FUNCTION
 saas.merchant_admin_required_action(text,boolean),saas.merchant_admin_config_valid(text,jsonb),
 saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
 saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),
 saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint),saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean),
 saas.public_starter_presentation(uuid,timestamptz),saas.public_starter_presentation(uuid,timestamptz,boolean),saas.public_category_product_projection(uuid,uuid,timestamptz),saas.public_list_products_by_category(uuid,text,timestamptz,text,integer)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text),saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint),saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.public_list_products_by_category(uuid,text,timestamptz,text,integer) TO celebix_saas_host_resolver;
COMMIT;
