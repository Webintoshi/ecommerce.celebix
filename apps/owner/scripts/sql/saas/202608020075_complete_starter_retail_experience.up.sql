-- Phase 4E: complete tenant-bound starter retail presentation and newsletter authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid(jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_campaign_home(uuid,text,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.store_policy_public_store(text,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regclass('saas.product_reviews') IS NULL
    OR pg_catalog.to_regclass('saas.catalog_admin_resources') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_newsletter_subscribers') IS NOT NULL
  THEN RAISE EXCEPTION 'STARTER_RETAIL_SOURCE_INVALID'; END IF;
END
$f$;

ALTER FUNCTION saas.campaign_starter_composition_valid(jsonb) RENAME TO campaign_starter_composition_v1_valid;

CREATE FUNCTION saas.starter_retail_social_url_valid(p_network text,p_url text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE expected_host text;
BEGIN
  expected_host:=CASE p_network WHEN 'instagram' THEN 'instagram.com' WHEN 'facebook' THEN 'facebook.com' WHEN 'youtube' THEN 'youtube.com' WHEN 'pinterest' THEN 'pinterest.com' WHEN 'tiktok' THEN 'tiktok.com' WHEN 'x' THEN 'x.com' END;
  RETURN expected_host IS NOT NULL AND p_url IS NOT NULL AND p_url=pg_catalog.btrim(p_url)
    AND pg_catalog.char_length(p_url) BETWEEN 12 AND 2048 AND p_url!~'[[:space:][:cntrl:]]'
    AND p_url~('^https://(www\.)?'||pg_catalog.replace(expected_host,'.','\.')||'/[A-Za-z0-9._~!$&''()*+,;=:@%/-]+$')
    AND p_url!~'[@?#]';
EXCEPTION WHEN others THEN RETURN false;
END
$f$;

CREATE FUNCTION saas.starter_retail_footer_link_valid(p_link jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF pg_catalog.jsonb_typeof(p_link)<>'object' OR NOT p_link?'kind' THEN RETURN false; END IF;
  IF p_link->>'kind'='fixed_policy' THEN
    RETURN saas.campaign_starter_exact_keys(p_link,ARRAY['kind','policyKey']) AND p_link->>'policyKey' IN('privacy_security','distance_sales','kvkk','payment_delivery','cookie_usage','returns_exchange','membership');
  ELSIF p_link->>'kind'='category' THEN
    RETURN saas.campaign_starter_exact_keys(p_link,ARRAY['kind','categoryId']) AND saas.campaign_starter_uuid_valid(p_link->'categoryId');
  ELSIF p_link->>'kind'='page' THEN
    RETURN saas.campaign_starter_exact_keys(p_link,ARRAY['kind','pageId']) AND saas.campaign_starter_uuid_valid(p_link->'pageId');
  ELSIF p_link->>'kind'='system' THEN
    RETURN saas.campaign_starter_exact_keys(p_link,ARRAY['kind','destination']) AND p_link->>'destination' IN('/','/products','/favorites','/account');
  END IF;
  RETURN false;
EXCEPTION WHEN others THEN RETURN false;
END
$f$;

CREATE FUNCTION saas.starter_retail_composition_v2_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE section jsonb; item jsonb; group_value jsonb; link_value jsonb; social_value jsonb; legacy_sections jsonb; legacy_config jsonb; seen text[]:=ARRAY[]::text[];
BEGIN
  IF pg_catalog.octet_length(p_config::text)>32768
    OR NOT saas.campaign_starter_exact_keys(p_config,ARRAY['schemaVersion','visual','announcement','navigation','sections','productDetail','cart','footer'])
    OR p_config->'schemaVersion'<>'2'::jsonb THEN RETURN false; END IF;
  IF NOT saas.campaign_starter_exact_keys(p_config->'visual',ARRAY['colorScheme','headingStyle','cornerStyle','headerStyle','productCardStyle','productImageRatio','headerWidth','sectionSpacing'])
    OR p_config->'visual'->>'colorScheme' NOT IN('neutral','warm','dark','ocean') OR p_config->'visual'->>'headingStyle' NOT IN('serif','sans')
    OR p_config->'visual'->>'cornerStyle' NOT IN('square','soft') OR p_config->'visual'->>'headerStyle' NOT IN('overlay','solid')
    OR p_config->'visual'->>'productCardStyle' NOT IN('editorial','compact') OR p_config->'visual'->>'productImageRatio' NOT IN('portrait','square')
    OR p_config->'visual'->>'headerWidth' NOT IN('contained','wide') OR p_config->'visual'->>'sectionSpacing' NOT IN('compact','balanced','airy') THEN RETURN false; END IF;
  IF NOT saas.campaign_starter_exact_keys(p_config->'productDetail',ARRAY['galleryStyle','showSku','showBrand','showBreadcrumbs','showRelatedProducts','showApprovedReviews','mobileStickyPurchase','showSizeGuide','informationSections'])
    OR p_config->'productDetail'->>'galleryStyle' NOT IN('grid','rail')
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_each(p_config->'productDetail') pair WHERE pair.key NOT IN('galleryStyle','informationSections') AND pg_catalog.jsonb_typeof(pair.value)<>'boolean')
    OR pg_catalog.jsonb_typeof(p_config->'productDetail'->'informationSections')<>'array'
    OR pg_catalog.jsonb_array_length(p_config->'productDetail'->'informationSections') NOT BETWEEN 1 AND 4
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements_text(p_config->'productDetail'->'informationSections') value WHERE value NOT IN('description','materials_and_care','certifications','shipping_and_returns'))
    OR (SELECT pg_catalog.count(DISTINCT value) FROM pg_catalog.jsonb_array_elements_text(p_config->'productDetail'->'informationSections') value)<>pg_catalog.jsonb_array_length(p_config->'productDetail'->'informationSections') THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(p_config->'sections')<>'array' OR pg_catalog.jsonb_array_length(p_config->'sections') NOT BETWEEN 1 AND 12 THEN RETURN false; END IF;
  FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'sections') LOOP
    IF pg_catalog.jsonb_typeof(section)<>'object' OR section->>'kind' NOT IN('hero','category_grid','product_row','split_campaign','brand_story','value_propositions','testimonials') THEN RETURN false; END IF;
    IF section->>'kind'<>'product_row' AND section->>'kind'=ANY(seen) THEN RETURN false; END IF; seen:=seen||(section->>'kind');
    IF section->>'kind'='value_propositions' THEN
      IF NOT saas.campaign_starter_exact_keys(section,ARRAY['kind','enabled','items']) OR pg_catalog.jsonb_typeof(section->'enabled')<>'boolean' OR pg_catalog.jsonb_typeof(section->'items')<>'array' OR pg_catalog.jsonb_array_length(section->'items') NOT BETWEEN 2 AND 4 THEN RETURN false; END IF;
      FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'items') LOOP
        IF NOT saas.campaign_starter_exact_keys(item,ARRAY['icon','heading','body']) OR item->>'icon' NOT IN('sparkles','cotton','heart','shield','truck','return') OR NOT saas.campaign_starter_text_valid(item->'heading',1,120) OR NOT saas.campaign_starter_text_valid(item->'body',1,300) THEN RETURN false; END IF;
      END LOOP;
      IF (SELECT pg_catalog.count(DISTINCT value->>'heading') FROM pg_catalog.jsonb_array_elements(section->'items') value)<>pg_catalog.jsonb_array_length(section->'items') THEN RETURN false; END IF;
    ELSIF section->>'kind'='testimonials' THEN
      IF NOT saas.campaign_starter_exact_keys(section,ARRAY['kind','enabled','heading','source','limit','minimumRating']) OR pg_catalog.jsonb_typeof(section->'enabled')<>'boolean' OR NOT saas.campaign_starter_text_valid(section->'heading',1,160) OR section->>'source'<>'approved_product_reviews' OR section->'limit' NOT IN('3'::jsonb,'6'::jsonb,'9'::jsonb) OR section->'minimumRating' NOT IN('4'::jsonb,'5'::jsonb) THEN RETURN false; END IF;
    END IF;
  END LOOP;
  SELECT COALESCE(pg_catalog.jsonb_agg(value),'[]'::jsonb) INTO legacy_sections FROM pg_catalog.jsonb_array_elements(p_config->'sections') value WHERE value->>'kind' IN('hero','category_grid','product_row','split_campaign','brand_story');
  IF pg_catalog.jsonb_array_length(legacy_sections)>0 THEN
    legacy_config:=pg_catalog.jsonb_build_object('schemaVersion',1,'visual',(p_config->'visual')-ARRAY['headerWidth','sectionSpacing'],'announcement',p_config->'announcement','navigation',p_config->'navigation','sections',legacy_sections,'productDetail',pg_catalog.jsonb_build_object('galleryStyle',p_config->'productDetail'->'galleryStyle','showSku',p_config->'productDetail'->'showSku','showBrand',p_config->'productDetail'->'showBrand','showRelatedProducts',p_config->'productDetail'->'showRelatedProducts','mobileStickyPurchase',p_config->'productDetail'->'mobileStickyPurchase'),'cart',p_config->'cart');
    IF NOT saas.campaign_starter_composition_v1_valid(legacy_config) THEN RETURN false; END IF;
  ELSE
    IF NOT saas.campaign_starter_exact_keys(p_config->'announcement',ARRAY['enabled','items'],ARRAY['destination']) OR pg_catalog.jsonb_typeof(p_config->'announcement'->'enabled')<>'boolean' OR pg_catalog.jsonb_typeof(p_config->'announcement'->'items')<>'array' OR pg_catalog.jsonb_array_length(p_config->'announcement'->'items')>12 OR ((p_config->'announcement'->>'enabled')::boolean AND pg_catalog.jsonb_array_length(p_config->'announcement'->'items')=0) OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'announcement'->'items') value WHERE NOT saas.campaign_starter_text_valid(value,1,160)) OR (p_config->'announcement'?'destination' AND NOT saas.campaign_starter_destination_valid(p_config->'announcement'->'destination')) THEN RETURN false; END IF;
    IF NOT saas.campaign_starter_exact_keys(p_config->'navigation',ARRAY['rootCategoryIds'],ARRAY['featuredCategoryId','featuredAssetId']) OR pg_catalog.jsonb_typeof(p_config->'navigation'->'rootCategoryIds')<>'array' OR pg_catalog.jsonb_array_length(p_config->'navigation'->'rootCategoryIds')>8 OR (p_config->'navigation'?'featuredCategoryId')<>(p_config->'navigation'?'featuredAssetId') OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'navigation'->'rootCategoryIds') value WHERE NOT saas.campaign_starter_uuid_valid(value)) THEN RETURN false; END IF;
    IF NOT saas.campaign_starter_exact_keys(p_config->'cart',ARRAY['showCheckoutReadiness','showShippingProgress'],ARRAY['trustMessage']) OR pg_catalog.jsonb_typeof(p_config->'cart'->'showCheckoutReadiness')<>'boolean' OR pg_catalog.jsonb_typeof(p_config->'cart'->'showShippingProgress')<>'boolean' OR (p_config->'cart'?'trustMessage' AND NOT saas.campaign_starter_text_valid(p_config->'cart'->'trustMessage',1,160)) THEN RETURN false; END IF;
  END IF;
  IF NOT saas.campaign_starter_exact_keys(p_config->'footer',ARRAY['tone','groups','newsletter','social']) OR p_config->'footer'->>'tone' NOT IN('light','dark') OR pg_catalog.jsonb_typeof(p_config->'footer'->'groups')<>'array' OR pg_catalog.jsonb_array_length(p_config->'footer'->'groups') NOT BETWEEN 2 AND 4 THEN RETURN false; END IF;
  FOR group_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'footer'->'groups') LOOP
    IF NOT saas.campaign_starter_exact_keys(group_value,ARRAY['heading','links']) OR NOT saas.campaign_starter_text_valid(group_value->'heading',1,80) OR pg_catalog.jsonb_typeof(group_value->'links')<>'array' OR pg_catalog.jsonb_array_length(group_value->'links') NOT BETWEEN 1 AND 8 THEN RETURN false; END IF;
    FOR link_value IN SELECT value FROM pg_catalog.jsonb_array_elements(group_value->'links') LOOP IF NOT saas.starter_retail_footer_link_valid(link_value) THEN RETURN false; END IF; END LOOP;
    IF (SELECT pg_catalog.count(DISTINCT value::text) FROM pg_catalog.jsonb_array_elements(group_value->'links') value)<>pg_catalog.jsonb_array_length(group_value->'links') THEN RETURN false; END IF;
  END LOOP;
  IF (SELECT pg_catalog.count(DISTINCT value->>'heading') FROM pg_catalog.jsonb_array_elements(p_config->'footer'->'groups') value)<>pg_catalog.jsonb_array_length(p_config->'footer'->'groups') THEN RETURN false; END IF;
  IF NOT saas.campaign_starter_exact_keys(p_config->'footer'->'newsletter',ARRAY['enabled','heading','body','consentLabel']) OR pg_catalog.jsonb_typeof(p_config->'footer'->'newsletter'->'enabled')<>'boolean' OR NOT saas.campaign_starter_text_valid(p_config->'footer'->'newsletter'->'heading',1,120) OR NOT saas.campaign_starter_text_valid(p_config->'footer'->'newsletter'->'body',1,500) OR NOT saas.campaign_starter_text_valid(p_config->'footer'->'newsletter'->'consentLabel',1,300) THEN RETURN false; END IF;
  IF pg_catalog.jsonb_typeof(p_config->'footer'->'social')<>'array' OR pg_catalog.jsonb_array_length(p_config->'footer'->'social')>6 THEN RETURN false; END IF;
  FOR social_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'footer'->'social') LOOP IF NOT saas.campaign_starter_exact_keys(social_value,ARRAY['network','url']) OR NOT saas.starter_retail_social_url_valid(social_value->>'network',social_value->>'url') THEN RETURN false; END IF; END LOOP;
  IF (SELECT pg_catalog.count(DISTINCT value->>'network') FROM pg_catalog.jsonb_array_elements(p_config->'footer'->'social') value)<>pg_catalog.jsonb_array_length(p_config->'footer'->'social') THEN RETURN false; END IF;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END
$f$;

CREATE FUNCTION saas.campaign_starter_composition_valid(p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE p_config->>'schemaVersion' WHEN '1' THEN saas.campaign_starter_composition_v1_valid(p_config) WHEN '2' THEN saas.starter_retail_composition_v2_valid(p_config) ELSE false END
$f$;

ALTER TABLE saas.campaign_starter_publications DROP CONSTRAINT campaign_starter_publications_config_check;
ALTER TABLE saas.campaign_starter_publications ADD CONSTRAINT campaign_starter_publications_config_check CHECK(saas.campaign_starter_composition_valid(config));

CREATE FUNCTION saas.starter_retail_publication_references_valid(p_store_id uuid,p_config jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE group_value jsonb; link_value jsonb; selected_key text;
BEGIN
  IF p_config->>'schemaVersion'<>'2' THEN RETURN true; END IF;
  FOR group_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'footer'->'groups') LOOP
    FOR link_value IN SELECT value FROM pg_catalog.jsonb_array_elements(group_value->'links') LOOP
      IF link_value->>'kind'='category' AND NOT EXISTS(SELECT 1 FROM saas.catalog_categories c WHERE c.store_id=p_store_id AND c.id=(link_value->>'categoryId')::uuid AND c.status='active') THEN RETURN false;
      ELSIF link_value->>'kind'='page' AND NOT EXISTS(SELECT 1 FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=(link_value->>'pageId')::uuid AND r.record_kind='page' AND r.status='active' AND r.config->'published'='true'::jsonb) THEN RETURN false;
      ELSIF link_value->>'kind'='fixed_policy' THEN selected_key:=CASE link_value->>'policyKey' WHEN 'returns_exchange' THEN 'returns_exchanges' ELSE link_value->>'policyKey' END; IF NOT EXISTS(SELECT 1 FROM saas.store_policy_pages p WHERE p.store_id=p_store_id AND p.policy_key=selected_key AND p.status='published') THEN RETURN false; END IF;
      END IF;
    END LOOP;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END
$f$;

CREATE FUNCTION saas.guard_starter_retail_publication()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN IF NOT saas.starter_retail_publication_references_valid(NEW.store_id,NEW.config) THEN RAISE EXCEPTION 'STARTER_RETAIL_REFERENCE_INVALID'; END IF; RETURN NEW; END
$f$;
CREATE TRIGGER campaign_starter_retail_references BEFORE INSERT OR UPDATE ON saas.campaign_starter_publications FOR EACH ROW EXECUTE FUNCTION saas.guard_starter_retail_publication();

CREATE FUNCTION saas.public_starter_footer_link(p_store_id uuid,p_link jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE selected_key text; result jsonb;
BEGIN
  IF p_link->>'kind'='system' THEN RETURN pg_catalog.jsonb_build_object('label',CASE p_link->>'destination' WHEN '/' THEN 'Ana Sayfa' WHEN '/products' THEN 'Tüm Ürünler' WHEN '/favorites' THEN 'Favoriler' ELSE 'Hesabım' END,'destination',p_link->>'destination');
  ELSIF p_link->>'kind'='category' THEN SELECT pg_catalog.jsonb_build_object('label',c.name,'destination','/categories/'||c.slug) INTO result FROM saas.catalog_categories c WHERE c.store_id=p_store_id AND c.id=(p_link->>'categoryId')::uuid AND c.status='active';
  ELSIF p_link->>'kind'='page' THEN SELECT pg_catalog.jsonb_build_object('label',r.name,'destination','/pages/'||(r.config->>'slug')) INTO result FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=(p_link->>'pageId')::uuid AND r.record_kind='page' AND r.status='active' AND r.config->'published'='true'::jsonb;
  ELSE selected_key:=CASE p_link->>'policyKey' WHEN 'returns_exchange' THEN 'returns_exchanges' ELSE p_link->>'policyKey' END; SELECT pg_catalog.jsonb_build_object('label',p.label,'destination',p.route) INTO result FROM saas.store_policy_pages p WHERE p.store_id=p_store_id AND p.policy_key=selected_key AND p.status='published'; END IF;
  RETURN result;
END
$f$;

CREATE FUNCTION saas.public_starter_retail_footer(p_store_id uuid,p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE group_value jsonb; link_value jsonb; resolved jsonb; links jsonb; groups jsonb:='[]'::jsonb;
BEGIN
  FOR group_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'groups') LOOP links:='[]'::jsonb; FOR link_value IN SELECT value FROM pg_catalog.jsonb_array_elements(group_value->'links') LOOP resolved:=saas.public_starter_footer_link(p_store_id,link_value); IF resolved IS NOT NULL THEN links:=links||pg_catalog.jsonb_build_array(resolved); END IF; END LOOP; IF pg_catalog.jsonb_array_length(links)>0 THEN groups:=groups||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('heading',group_value->>'heading','links',links)); END IF; END LOOP;
  IF pg_catalog.jsonb_array_length(groups)<2 THEN RETURN NULL; END IF;
  RETURN pg_catalog.jsonb_build_object('tone',p_config->>'tone','groups',groups,'newsletter',p_config->'newsletter','social',p_config->'social');
END
$f$;

CREATE FUNCTION saas.public_starter_review_projection(p_store_id uuid,p_review_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('reviewerName',r.reviewer_name,'rating',r.rating,'title',r.review_title,'body',r.review_body,'merchantReply',CASE WHEN pg_catalog.char_length(r.merchant_reply)<=1000 THEN r.merchant_reply END)) FROM saas.product_reviews r JOIN saas.products p ON p.store_id=r.store_id AND p.id=r.product_id AND p.status='active' WHERE r.store_id=p_store_id AND r.id=p_review_id AND r.status='approved' AND pg_catalog.char_length(r.review_body)<=2000
$f$;

CREATE FUNCTION saas.public_starter_retail_presentation(p_store_id uuid,p_now timestamptz,p_allow_index boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE base jsonb; config jsonb; section jsonb; item jsonb; resolved jsonb; sections jsonb:='[]'::jsonb; navigation jsonb:='[]'::jsonb; slides jsonb; panels jsonb; categories jsonb; reviews jsonb; hero jsonb; footer jsonb; row_index integer:=0; asset jsonb; hotspot jsonb; featured_category uuid; featured_asset uuid; category_slug text;
BEGIN
  SELECT publication.config INTO config FROM saas.campaign_starter_publications publication WHERE publication.store_id=p_store_id;
  IF config IS NULL OR config->>'schemaVersion'='1' THEN
    base:=saas.public_starter_presentation(p_store_id,p_now,p_allow_index); IF base IS NULL THEN RETURN NULL; END IF;
    IF base->>'schemaVersion'='1' THEN sections:=CASE WHEN (base->'hero'->>'enabled')::boolean THEN pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','hero','slides',pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('heading',base->'hero'->>'headline','body',base->'hero'->>'body','desktopImage',base->'hero'->'image','destination',base->'hero'->>'destination'))))) ELSE '[]'::jsonb END; sections:=sections||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','product_row','key','latest-0','heading','Yeni ürünler','source','latest','limit',COALESCE((base->'theme'->>'homeProductLimit')::integer,8))); ELSE sections:=base->'sections'; END IF;
    RETURN (base-ARRAY['schemaVersion','visual','navigation','sections','productDetail','cart'])||pg_catalog.jsonb_build_object('schemaVersion',3,'visual',COALESCE(base->'visual',pg_catalog.jsonb_build_object('colorScheme',base->'theme'->>'colorScheme','headingStyle',base->'theme'->>'headingStyle','cornerStyle','soft','headerStyle','overlay','productCardStyle',base->'theme'->>'productCardStyle','productImageRatio',base->'theme'->>'productImageRatio'))||pg_catalog.jsonb_build_object('headerWidth','wide','sectionSpacing','balanced'),'navigation',COALESCE(base->'navigation',pg_catalog.jsonb_build_object('items','[]'::jsonb)),'sections',sections,'productDetail',COALESCE(base->'productDetail',pg_catalog.jsonb_build_object('galleryStyle','grid','showSku',true,'showBrand',true,'showRelatedProducts',true,'mobileStickyPurchase',true))||pg_catalog.jsonb_build_object('showBreadcrumbs',true,'showApprovedReviews',true,'showSizeGuide',true,'informationSections',pg_catalog.jsonb_build_array('description','materials_and_care','certifications','shipping_and_returns')),'cart',COALESCE(base->'cart',pg_catalog.jsonb_build_object('showCheckoutReadiness',true,'showShippingProgress',true)),'footer',pg_catalog.jsonb_build_object('tone','dark','groups',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('heading','Mağaza','links',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('label','Ana Sayfa','destination','/'),pg_catalog.jsonb_build_object('label','Tüm Ürünler','destination','/products'),pg_catalog.jsonb_build_object('label','Favoriler','destination','/favorites'))),pg_catalog.jsonb_build_object('heading','Hesap','links',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('label','Hesabım','destination','/account')))),'newsletter',pg_catalog.jsonb_build_object('enabled',false,'heading','Bültene katılın','body','Yeni ürünleri ilk siz öğrenin.','consentLabel','E-posta iletişimine izin veriyorum.'),'social','[]'::jsonb));
  END IF;
  base:=saas.public_starter_presentation_without_campaign_starter(p_store_id,p_now,p_allow_index); IF base IS NULL THEN RETURN NULL; END IF;
  footer:=saas.public_starter_retail_footer(p_store_id,config->'footer'); IF footer IS NULL THEN RETURN NULL; END IF;
  IF config->'navigation'?'featuredCategoryId' THEN featured_category:=(config->'navigation'->>'featuredCategoryId')::uuid; featured_asset:=(config->'navigation'->>'featuredAssetId')::uuid; END IF;
  SELECT COALESCE(pg_catalog.jsonb_agg(x.value ORDER BY root.ordinality) FILTER(WHERE x.value IS NOT NULL),'[]'::jsonb) INTO navigation FROM pg_catalog.jsonb_array_elements_text(config->'navigation'->'rootCategoryIds') WITH ORDINALITY root(value,ordinality) CROSS JOIN LATERAL (SELECT saas.public_campaign_navigation_item(p_store_id,root.value::uuid,0,featured_category,featured_asset) value) x;
  FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(config->'sections') LOOP IF NOT (section->>'enabled')::boolean THEN CONTINUE; END IF;
    IF section->>'kind'='hero' THEN slides:='[]'::jsonb; FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'slides') LOOP asset:=saas.public_campaign_asset(p_store_id,(item->>'desktopAssetId')::uuid); IF asset IS NULL THEN CONTINUE; END IF; hotspot:=NULL; IF item?'productId' THEN SELECT pg_catalog.jsonb_build_object('productSlug',p.slug,'title',p.title,'priceCents',(x.value->>'priceCents')::bigint,'currency','TRY') INTO hotspot FROM saas.products p CROSS JOIN LATERAL (SELECT saas.public_campaign_product_projection(p_store_id,p.id,p_now) value) x WHERE p.store_id=p_store_id AND p.id=(item->>'productId')::uuid AND x.value IS NOT NULL; END IF; slides:=slides||pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('eyebrow',item->>'eyebrow','heading',item->>'heading','body',item->>'body','desktopImage',asset,'mobileImage',CASE WHEN item?'mobileAssetId' THEN saas.public_campaign_asset(p_store_id,(item->>'mobileAssetId')::uuid) END,'destination',item->>'destination','hotspot',hotspot))); END LOOP; IF pg_catalog.jsonb_array_length(slides)=0 THEN CONTINUE; END IF; resolved:=pg_catalog.jsonb_build_object('kind','hero','slides',slides); IF hero IS NULL THEN hero:=slides->0; END IF;
    ELSIF section->>'kind'='category_grid' THEN SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name',c.name,'slug',c.slug,'image',saas.public_campaign_asset(p_store_id,a.id)) ORDER BY requested.ordinality) INTO categories FROM pg_catalog.jsonb_array_elements_text(section->'categoryIds') WITH ORDINALITY requested(id,ordinality) JOIN saas.catalog_categories c ON c.store_id=p_store_id AND c.id=requested.id::uuid AND c.status='active' JOIN LATERAL (SELECT showcase_item FROM saas.merchant_admin_records showcase CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(showcase.config->'items') showcase_item WHERE showcase.store_id=p_store_id AND showcase.record_kind='category_showcase' AND showcase.status='active' AND showcase_item->>'categoryId'=requested.id ORDER BY showcase.updated_at DESC LIMIT 1) mapping ON true JOIN saas.storefront_assets a ON a.store_id=p_store_id AND a.id=(mapping.showcase_item->>'assetId')::uuid AND a.asset_kind='category' AND a.status='active'; IF categories IS NULL OR pg_catalog.jsonb_array_length(categories)=0 THEN CONTINUE; END IF; resolved:=pg_catalog.jsonb_build_object('kind','category_grid','heading',section->>'heading','items',categories);
    ELSIF section->>'kind'='product_row' THEN category_slug:=NULL; IF section->>'source'='category' THEN SELECT slug INTO category_slug FROM saas.catalog_categories WHERE store_id=p_store_id AND id=(section->>'categoryId')::uuid AND status='active'; IF category_slug IS NULL THEN CONTINUE; END IF; END IF; resolved:=pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind','product_row','key',(section->>'source')||'-'||row_index,'heading',section->>'heading','source',section->>'source','categorySlug',category_slug,'limit',(section->>'limit')::integer)); row_index:=row_index+1;
    ELSIF section->>'kind'='split_campaign' THEN panels:='[]'::jsonb; FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'panels') LOOP asset:=saas.public_campaign_asset(p_store_id,(item->>'assetId')::uuid); IF asset IS NULL THEN CONTINUE; END IF; panels:=panels||pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('eyebrow',item->>'eyebrow','heading',item->>'heading','body',item->>'body','image',asset,'destination',item->>'destination'))); END LOOP; IF pg_catalog.jsonb_array_length(panels)=0 THEN CONTINUE; END IF; resolved:=pg_catalog.jsonb_build_object('kind','split_campaign','panels',panels);
    ELSIF section->>'kind'='brand_story' THEN asset:=CASE WHEN section?'assetId' THEN saas.public_campaign_asset(p_store_id,(section->>'assetId')::uuid) END; resolved:=pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind','brand_story','eyebrow',section->>'eyebrow','heading',section->>'heading','body',section->>'body','image',asset,'destination',section->>'destination'));
    ELSIF section->>'kind'='value_propositions' THEN resolved:=pg_catalog.jsonb_build_object('kind','value_propositions','items',section->'items');
    ELSE SELECT COALESCE(pg_catalog.jsonb_agg(x.value ORDER BY r.created_at DESC,r.id DESC) FILTER(WHERE x.value IS NOT NULL),'[]'::jsonb) INTO reviews FROM (SELECT id,created_at FROM saas.product_reviews r WHERE r.store_id=p_store_id AND r.status='approved' AND r.rating>=(section->>'minimumRating')::integer AND EXISTS(SELECT 1 FROM saas.products p WHERE p.store_id=r.store_id AND p.id=r.product_id AND p.status='active') ORDER BY r.created_at DESC,r.id DESC LIMIT (section->>'limit')::integer) r CROSS JOIN LATERAL (SELECT saas.public_starter_review_projection(p_store_id,r.id) value) x; IF pg_catalog.jsonb_array_length(reviews)=0 THEN CONTINUE; END IF; resolved:=pg_catalog.jsonb_build_object('kind','testimonials','heading',section->>'heading','items',reviews);
    END IF; sections:=sections||pg_catalog.jsonb_build_array(resolved);
  END LOOP;
  RETURN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('schemaVersion',3,'displayName',base->>'displayName','supportEmail',base->>'supportEmail','logo',base->'logo','theme',pg_catalog.jsonb_build_object('colorScheme',config->'visual'->>'colorScheme','headingStyle',config->'visual'->>'headingStyle','productCardStyle',config->'visual'->>'productCardStyle','productImageRatio',config->'visual'->>'productImageRatio','homeProductLimit',COALESCE((SELECT (s->>'limit')::integer FROM pg_catalog.jsonb_array_elements(config->'sections') s WHERE s->>'kind'='product_row' LIMIT 1),8),'showBrandStory',EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(config->'sections') s WHERE s->>'kind'='brand_story' AND (s->>'enabled')::boolean)),'hero',COALESCE(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('enabled',hero IS NOT NULL,'headline',COALESCE(hero->>'heading',base->'hero'->>'headline'),'body',COALESCE(hero->>'body',''),'destination',COALESCE(hero->>'destination','/products'),'image',hero->'desktopImage')),base->'hero'),'promotion',base->'promotion','marquee',base->'marquee','categoryShowcase',base->'categoryShowcase','visual',config->'visual','announcement',CASE WHEN (config->'announcement'->>'enabled')::boolean THEN (config->'announcement')-'enabled' END,'navigation',pg_catalog.jsonb_build_object('items',navigation),'sections',sections,'productDetail',config->'productDetail','cart',config->'cart','footer',footer,'seo',base->'seo'));
END
$f$;

CREATE FUNCTION saas.public_starter_retail_home(p_store_id uuid,p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE presentation jsonb; section jsonb; result record; items jsonb; rows jsonb:='[]'::jsonb;
BEGIN
 IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 presentation:=saas.public_starter_retail_presentation(p_store_id,p_now,false); IF presentation IS NULL OR presentation->>'schemaVersion'<>'3' THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(presentation->'sections') LOOP IF section->>'kind'<>'product_row' THEN CONTINUE; END IF; IF section->>'source'='category' THEN SELECT * INTO result FROM saas.public_list_products_by_category(p_store_id,p_hostname,p_now,section->>'categorySlug',(section->>'limit')::integer); items:=result.result_payload->'items'; ELSE SELECT * INTO result FROM saas.public_list_products(p_store_id,p_hostname,p_now,CASE WHEN section->>'source'='sale' THEN 48 ELSE (section->>'limit')::integer END); items:=result.result_payload; IF section->>'source'='sale' THEN SELECT COALESCE(pg_catalog.jsonb_agg(value),'[]'::jsonb) INTO items FROM (SELECT value FROM pg_catalog.jsonb_array_elements(items) value WHERE value?'compareAtCents' AND (value->>'compareAtCents')::bigint>(value->>'priceCents')::bigint LIMIT (section->>'limit')::integer) selected; END IF; END IF; IF result.outcome<>'found' OR items IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF; rows:=rows||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('key',section->>'key','items',items)); END LOOP;
 RETURN QUERY SELECT 'found',pg_catalog.jsonb_build_object('presentation',presentation,'productRows',rows);
END
$f$;

CREATE FUNCTION saas.public_starter_product_merchandising(p_store_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 WITH linked AS (SELECT r.* FROM saas.catalog_admin_resource_products rp JOIN saas.catalog_admin_resources r ON r.store_id=rp.store_id AND r.id=rp.resource_id AND r.status='active' WHERE rp.store_id=p_store_id AND rp.product_id=p_product_id),
 highlights AS (SELECT COALESCE(pg_catalog.jsonb_agg(config->>'text' ORDER BY name,id),'[]'::jsonb) value FROM linked WHERE resource_kind='definition' AND saas.campaign_starter_exact_keys(config,ARRAY['role','text']) AND config->>'role'='highlight' AND saas.campaign_starter_text_valid(config->'text',1,300)),
 material AS (SELECT (SELECT config->>'body' FROM linked WHERE resource_kind='attribute' AND saas.campaign_starter_exact_keys(config,ARRAY['role','body']) AND config->>'role'='materials_and_care' AND saas.campaign_starter_text_valid(config->'body',1,4000) ORDER BY name,id LIMIT 1) value),
 certifications AS (SELECT COALESCE(pg_catalog.jsonb_agg(config->>'label' ORDER BY name,id),'[]'::jsonb) value FROM linked WHERE resource_kind='extra' AND saas.campaign_starter_exact_keys(config,ARRAY['role','label']) AND config->>'role'='certification' AND saas.campaign_starter_text_valid(config->'label',1,160)),
 guide AS (SELECT (SELECT pg_catalog.jsonb_build_object('heading',config->>'heading','body',config->>'body') FROM linked WHERE resource_kind='definition' AND saas.campaign_starter_exact_keys(config,ARRAY['role','heading','body']) AND config->>'role'='size_guide' AND saas.campaign_starter_text_valid(config->'heading',1,120) AND saas.campaign_starter_text_valid(config->'body',1,4000) ORDER BY name,id LIMIT 1) value)
 SELECT CASE WHEN pg_catalog.jsonb_array_length(highlights.value)=0 AND material.value IS NULL AND pg_catalog.jsonb_array_length(certifications.value)=0 AND guide.value IS NULL THEN NULL ELSE pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('highlights',highlights.value,'materialsAndCare',material.value,'certifications',certifications.value,'sizeGuide',guide.value)) END FROM highlights CROSS JOIN material CROSS JOIN certifications CROSS JOIN guide
$f$;

CREATE FUNCTION saas.public_starter_product_detail(p_store_id uuid,p_hostname text,p_now timestamptz,p_slug text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_product_id uuid; base jsonb; merchandising jsonb; reviews jsonb;
BEGIN
 IF p_slug IS NULL OR p_slug<>pg_catalog.lower(p_slug) OR pg_catalog.char_length(p_slug) NOT BETWEEN 3 AND 100 OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF NOT saas.public_storefront_authorized(p_store_id,p_hostname,p_now) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 SELECT p.id,saas.public_campaign_product_projection(p_store_id,p.id,p_now) INTO selected_product_id,base FROM saas.products p WHERE p.store_id=p_store_id AND p.slug=p_slug AND p.status='active'; IF base IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
 merchandising:=saas.public_starter_product_merchandising(p_store_id,selected_product_id);
 SELECT COALESCE(pg_catalog.jsonb_agg(x.value ORDER BY r.created_at DESC,r.id DESC) FILTER(WHERE x.value IS NOT NULL),'[]'::jsonb) INTO reviews FROM (SELECT review.id,review.created_at FROM saas.product_reviews review WHERE review.store_id=p_store_id AND review.product_id=selected_product_id AND review.status='approved' ORDER BY review.created_at DESC,review.id DESC LIMIT 50) r CROSS JOIN LATERAL (SELECT saas.public_starter_review_projection(p_store_id,r.id) value) x;
 RETURN QUERY SELECT 'found',base||pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('merchandising',merchandising,'reviews',CASE WHEN pg_catalog.jsonb_array_length(reviews)>0 THEN reviews END));
END
$f$;

CREATE TABLE saas.storefront_newsletter_subscribers(
 store_id uuid NOT NULL,email_digest character(64) NOT NULL,normalized_email text NOT NULL,status text NOT NULL,consent_version text NOT NULL,consented_at timestamptz NOT NULL,version bigint NOT NULL,created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,email_digest),FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
 CHECK(email_digest~'^[a-f0-9]{64}$'),CHECK(normalized_email=pg_catalog.lower(pg_catalog.btrim(normalized_email)) AND pg_catalog.char_length(normalized_email) BETWEEN 3 AND 254 AND normalized_email~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),CHECK(status IN('subscribed','unsubscribed')),CHECK(consent_version~'^[a-z0-9]+(-[a-z0-9]+)*$' AND pg_catalog.char_length(consent_version)<=64),CHECK(version>0),CHECK(updated_at>=created_at AND consented_at>=created_at AND consented_at<=updated_at)
);
ALTER TABLE saas.storefront_newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_newsletter_subscribers FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.storefront_newsletter_subscribers FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE FUNCTION saas.public_newsletter_subscribe(p_hostname text,p_now timestamptz,p_email text,p_consent_version text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; normalized text; digest text;
BEGIN
 IF p_now IS NULL OR NOT saas.store_policy_hostname_valid(p_hostname) OR p_email IS NULL OR p_email<>pg_catalog.btrim(p_email) OR pg_catalog.char_length(p_email) NOT BETWEEN 3 AND 254 OR p_email~'[[:cntrl:]]' OR p_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' OR p_consent_version IS NULL OR p_consent_version<>pg_catalog.btrim(p_consent_version) OR pg_catalog.char_length(p_consent_version) NOT BETWEEN 1 AND 64 OR p_consent_version!~'^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now); IF selected_store IS NULL THEN RETURN QUERY SELECT 'subscribed',pg_catalog.jsonb_build_object('outcome','subscribed'); RETURN; END IF;
 normalized:=pg_catalog.lower(p_email); digest:=pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(normalized,'UTF8')),'hex');
 INSERT INTO saas.storefront_newsletter_subscribers(store_id,email_digest,normalized_email,status,consent_version,consented_at,version,created_at,updated_at) VALUES(selected_store,digest,normalized,'subscribed',p_consent_version,p_now,1,p_now,p_now)
 ON CONFLICT(store_id,email_digest) DO UPDATE SET status='subscribed',consent_version=EXCLUDED.consent_version,consented_at=EXCLUDED.consented_at,version=saas.storefront_newsletter_subscribers.version+1,updated_at=EXCLUDED.updated_at WHERE saas.storefront_newsletter_subscribers.status<>'subscribed' OR saas.storefront_newsletter_subscribers.consent_version<>EXCLUDED.consent_version;
 RETURN QUERY SELECT 'subscribed',pg_catalog.jsonb_build_object('outcome','subscribed');
END
$f$;

CREATE FUNCTION saas.merchant_newsletter_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_limit integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
 authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'content','content.read'); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 200 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('email',s.normalized_email,'status',s.status,'consentVersion',s.consent_version,'consentedAt',saas.catalog_admin_timestamp(s.consented_at)) ORDER BY s.consented_at DESC,s.email_digest) FROM (SELECT * FROM saas.storefront_newsletter_subscribers WHERE store_id=p_store_id ORDER BY consented_at DESC,email_digest LIMIT p_limit) s),'[]'::jsonb));
END
$f$;

REVOKE ALL ON FUNCTION saas.campaign_starter_composition_v1_valid(jsonb),saas.starter_retail_social_url_valid(text,text),saas.starter_retail_footer_link_valid(jsonb),saas.starter_retail_composition_v2_valid(jsonb),saas.campaign_starter_composition_valid(jsonb),saas.starter_retail_publication_references_valid(uuid,jsonb),saas.guard_starter_retail_publication(),saas.public_starter_footer_link(uuid,jsonb),saas.public_starter_retail_footer(uuid,jsonb),saas.public_starter_review_projection(uuid,uuid),saas.public_starter_retail_presentation(uuid,timestamptz,boolean),saas.public_starter_retail_home(uuid,text,timestamptz),saas.public_starter_product_merchandising(uuid,uuid),saas.public_starter_product_detail(uuid,text,timestamptz,text),saas.public_newsletter_subscribe(text,timestamptz,text,text),saas.merchant_newsletter_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_starter_retail_home(uuid,text,timestamptz),saas.public_starter_product_detail(uuid,text,timestamptz,text),saas.public_newsletter_subscribe(text,timestamptz,text,text) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.merchant_newsletter_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer) TO celebix_saas_app;
COMMIT;
