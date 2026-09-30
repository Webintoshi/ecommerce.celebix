BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.storefront_designs IN EXCLUSIVE MODE;

DO $precondition$
BEGIN
 IF pg_catalog.to_regprocedure('saas.storefront_design_composition_valid(jsonb)') IS NULL
 OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)') IS NULL
 OR pg_catalog.to_regclass('saas.section_homepage_v4_backup') IS NOT NULL THEN
  RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_PRECONDITION_FAILED';
 END IF;
END $precondition$;

-- Preserve exact deployed implementations for rollback. Existing documents are
-- not rewritten; the editable published baseline is normalized on read.
CREATE TABLE saas.section_homepage_v4_backup(identity text PRIMARY KEY,definition text NOT NULL);
ALTER TABLE saas.section_homepage_v4_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.section_homepage_v4_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.section_homepage_v4_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
INSERT INTO saas.section_homepage_v4_backup(identity,definition)
SELECT signature,pg_catalog.pg_get_functiondef(signature::regprocedure)
FROM pg_catalog.unnest(ARRAY[
 'saas.storefront_design_composition_valid(jsonb)',
 'saas.storefront_design_document_valid(uuid,jsonb,boolean)',
 'saas.storefront_theme_composition_references_valid(uuid,jsonb,boolean)',
 'saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)',
 'saas.public_starter_retail_presentation(uuid,timestamptz,boolean)',
 'saas.public_starter_retail_home(uuid,text,timestamptz)'
]) signature;
INSERT INTO saas.section_homepage_v4_backup(identity,definition)
SELECT 'constraint:draft','ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_draft_unified_theme_check '||pg_catalog.pg_get_constraintdef(oid)
FROM pg_catalog.pg_constraint WHERE conrelid='saas.storefront_designs'::regclass AND conname='storefront_designs_draft_unified_theme_check';
DO $copies$
DECLARE signature text; definition text; original_name text;
BEGIN
 FOREACH signature IN ARRAY ARRAY[
  'saas.storefront_design_composition_valid(jsonb)',
  'saas.storefront_design_document_valid(uuid,jsonb,boolean)',
  'saas.storefront_theme_composition_references_valid(uuid,jsonb,boolean)',
  'saas.public_starter_retail_presentation(uuid,timestamptz,boolean)'
 ] LOOP
  original_name:=pg_catalog.split_part(pg_catalog.split_part(signature,'(',1),'.',2);
  SELECT backup.definition INTO definition FROM saas.section_homepage_v4_backup backup WHERE identity=signature;
  EXECUTE pg_catalog.replace(definition,'saas.'||original_name||'(', 'saas.'||original_name||'_pre_section_homepage(');
 END LOOP;
END $copies$;

CREATE FUNCTION saas.homepage_banner_media_shape_valid(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT p_value='null'::jsonb OR CASE p_value->>'kind'
 WHEN 'media' THEN saas.storefront_design_exact_keys(p_value,ARRAY['kind','mediaId']) AND pg_catalog.jsonb_typeof(p_value->'mediaId')='string' AND p_value->>'mediaId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 WHEN 'asset' THEN saas.storefront_design_exact_keys(p_value,ARRAY['kind','assetId']) AND pg_catalog.jsonb_typeof(p_value->'assetId')='string' AND p_value->>'assetId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 WHEN 'legacy_https' THEN saas.storefront_design_exact_keys(p_value,ARRAY['kind','url']) AND saas.storefront_design_text_valid(p_value->'url',1,2048) AND p_value->>'url'~'^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*$' AND p_value->>'url'!~'(^|/)[.][.]?(/|$)'
 ELSE false END
$f$;
CREATE FUNCTION saas.homepage_banner_destination_shape_valid(p_value jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE p_value->>'kind'
 WHEN 'none' THEN saas.storefront_design_exact_keys(p_value,ARRAY['kind'])
 WHEN 'path' THEN saas.storefront_design_exact_keys(p_value,ARRAY['kind','path']) AND saas.campaign_starter_destination_valid(p_value->'path')
 WHEN 'product' THEN saas.storefront_design_exact_keys(p_value,ARRAY['kind','resourceId']) AND pg_catalog.jsonb_typeof(p_value->'resourceId')='string' AND p_value->>'resourceId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 WHEN 'collection' THEN saas.storefront_design_exact_keys(p_value,ARRAY['kind','resourceId']) AND pg_catalog.jsonb_typeof(p_value->'resourceId')='string' AND p_value->>'resourceId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 WHEN 'page' THEN saas.storefront_design_exact_keys(p_value,ARRAY['kind','resourceId']) AND pg_catalog.jsonb_typeof(p_value->'resourceId')='string' AND p_value->>'resourceId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
 ELSE false END
$f$;

CREATE OR REPLACE FUNCTION saas.storefront_design_composition_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE section jsonb; slide jsonb; probe jsonb;
BEGIN
 IF p_config->>'schemaVersion'<>'4' THEN RETURN saas.storefront_design_composition_valid_pre_section_homepage(p_config); END IF;
 IF pg_catalog.pg_column_size(p_config)>524288 OR pg_catalog.jsonb_typeof(p_config->'sections')<>'array' THEN RETURN false; END IF;
 probe:=pg_catalog.jsonb_set(pg_catalog.jsonb_set(p_config,ARRAY['schemaVersion'],'3'::jsonb,false),ARRAY['sections'],'[]'::jsonb,false);
 IF NOT saas.storefront_design_composition_valid_pre_section_homepage(probe) THEN RETURN false; END IF;
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'sections') LOOP
  IF pg_catalog.jsonb_typeof(section)<>'object' OR pg_catalog.jsonb_typeof(section->'sectionId')<>'string' OR section->>'sectionId'!~'^home_[a-z0-9_]{3,75}$' THEN RETURN false; END IF;
  IF section?'style' AND (NOT saas.storefront_design_exact_keys(section->'style',ARRAY['background','width','spacing']) OR pg_catalog.jsonb_typeof(section->'style'->'background')<>'string' OR pg_catalog.jsonb_typeof(section->'style'->'width')<>'string' OR pg_catalog.jsonb_typeof(section->'style'->'spacing')<>'string' OR section->'style'->>'background' NOT IN ('theme','light','dark','brand') OR section->'style'->>'width' NOT IN ('contained','full') OR section->'style'->>'spacing' NOT IN ('small','normal','large')) THEN RETURN false; END IF;
  section:=section-'style';
  IF section->>'kind'='banner' THEN
   IF NOT saas.storefront_design_exact_keys(section,ARRAY['kind','sectionId','enabled','layout','autoplay','presentation','slides'])
   OR pg_catalog.jsonb_typeof(section->'enabled')<>'boolean' OR pg_catalog.jsonb_typeof(section->'autoplay')<>'boolean'
   OR pg_catalog.jsonb_typeof(section->'layout')<>'string' OR pg_catalog.jsonb_typeof(section->'presentation')<>'string' OR section->>'layout' NOT IN ('single','slider','stacked') OR section->>'presentation' NOT IN ('image_only','overlay')
   OR pg_catalog.jsonb_typeof(section->'slides')<>'array' THEN RETURN false; END IF;
   FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'slides') LOOP
    IF NOT saas.storefront_design_exact_keys(slide-'eyebrow'-'productId',ARRAY['slideId','enabled','headline','body','desktopImage','mobileImage','destination'])
    OR pg_catalog.jsonb_typeof(slide->'slideId')<>'string' OR slide->>'slideId'!~'^slide_[a-z0-9_]{2,74}$'
    OR pg_catalog.jsonb_typeof(slide->'enabled')<>'boolean' OR NOT saas.storefront_design_text_valid(slide->'headline',0,160) OR NOT saas.storefront_design_text_valid(slide->'body',0,500)
    OR saas.homepage_banner_media_shape_valid(slide->'desktopImage') IS DISTINCT FROM true OR saas.homepage_banner_media_shape_valid(slide->'mobileImage') IS DISTINCT FROM true
    OR saas.homepage_banner_destination_shape_valid(slide->'destination') IS DISTINCT FROM true
    OR (slide?'eyebrow' AND NOT saas.storefront_design_text_valid(slide->'eyebrow',1,80))
    OR (slide?'productId' AND (pg_catalog.jsonb_typeof(slide->'productId')<>'string' OR slide->>'productId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')) THEN RETURN false; END IF;
   END LOOP;
   IF (SELECT pg_catalog.count(DISTINCT value->>'slideId') FROM pg_catalog.jsonb_array_elements(section->'slides'))<>pg_catalog.jsonb_array_length(section->'slides') THEN RETURN false; END IF;
  ELSE
   IF section->>'kind'='hero' OR (section->>'kind'='product_row' AND section->>'source'='manual' AND NOT(section?'productIds')) THEN RETURN false; END IF;
   IF NOT saas.storefront_design_composition_valid_pre_section_homepage(pg_catalog.jsonb_set(probe,ARRAY['sections'],pg_catalog.jsonb_build_array(section),false)) THEN RETURN false; END IF;
  END IF;
 END LOOP;
 RETURN (SELECT pg_catalog.count(DISTINCT value->>'sectionId') FROM pg_catalog.jsonb_array_elements(p_config->'sections'))=pg_catalog.jsonb_array_length(p_config->'sections');
EXCEPTION WHEN others THEN RETURN false;
END $f$;

CREATE FUNCTION saas.storefront_design_normalize_v5(p_config jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE config jsonb:=p_config; composition jsonb; section jsonb; slide jsonb; sections jsonb:='[]'::jsonb; slides jsonb; ordinal bigint; banner_id text:='home_legacy_main_banner'; suffix integer:=1;
BEGIN
 IF config->>'schemaVersion'='5' THEN RETURN config; END IF;
 IF config->>'schemaVersion'='1' THEN config:=saas.storefront_design_upgrade_v2(config,false); END IF;
 IF config->>'schemaVersion'='2' THEN config:=saas.storefront_design_upgrade_v3(config,saas.storefront_theme_default_composition()); END IF;
 IF config->>'schemaVersion'='3' THEN config:=saas.storefront_design_document_with_home_ids(config); END IF;
 IF config->>'schemaVersion'<>'4' THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_NORMALIZATION_INVALID'; END IF;
 composition:=config->'composition';
 IF composition->>'schemaVersion' IN ('1','2') THEN composition:=saas.storefront_theme_composition_with_home_ids(composition); END IF;
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(composition->'sections') LOOP
  IF section->>'kind'='hero' THEN
   slides:='[]'::jsonb;
   FOR slide,ordinal IN SELECT value,ordinality FROM pg_catalog.jsonb_array_elements(section->'slides') WITH ORDINALITY LOOP
    slides:=slides||pg_catalog.jsonb_build_array(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('slideId','slide_legacy_'||ordinal,'enabled',true,'headline',slide->>'heading','body',COALESCE(slide->>'body',''),'desktopImage',pg_catalog.jsonb_build_object('kind','asset','assetId',slide->>'desktopAssetId'),'mobileImage',CASE WHEN slide?'mobileAssetId' THEN pg_catalog.jsonb_build_object('kind','asset','assetId',slide->>'mobileAssetId') ELSE 'null'::jsonb END,'destination',pg_catalog.jsonb_build_object('kind','path','path',slide->>'destination'),'eyebrow',slide->>'eyebrow','productId',slide->>'productId'))||pg_catalog.jsonb_build_object('mobileImage',CASE WHEN slide?'mobileAssetId' THEN pg_catalog.jsonb_build_object('kind','asset','assetId',slide->>'mobileAssetId') ELSE 'null'::jsonb END));
   END LOOP;
   section:=pg_catalog.jsonb_build_object('kind','banner','sectionId',section->>'sectionId','enabled',section->'enabled','layout','slider','autoplay',false,'presentation','overlay','slides',slides);
  END IF;
  sections:=sections||pg_catalog.jsonb_build_array(section);
 END LOOP;
 IF (config->'hero'->>'enabled')::boolean THEN
  WHILE EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(sections) value WHERE value->>'sectionId'=banner_id) LOOP suffix:=suffix+1;banner_id:='home_legacy_main_banner_'||suffix; END LOOP;
  SELECT COALESCE(pg_catalog.jsonb_agg(selected.slide||pg_catalog.jsonb_build_object('slideId','slide_legacy_'||selected.ordinal) ORDER BY selected.ordinal),'[]'::jsonb) INTO slides FROM pg_catalog.jsonb_array_elements(config->'hero'->'slides') WITH ORDINALITY selected(slide,ordinal);
  sections:=pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('kind','banner','sectionId',banner_id,'enabled',true,'layout','slider','autoplay',true,'presentation','image_only','slides',slides))||sections;
 END IF;
 RETURN config||pg_catalog.jsonb_build_object('schemaVersion',5,'hero',pg_catalog.jsonb_build_object('enabled',false,'slides','[]'::jsonb),'composition',composition||pg_catalog.jsonb_build_object('schemaVersion',4,'sections',sections));
END $f$;

-- Shared settings use the established validator with an inert compatibility
-- hero and empty legacy composition. Each body section is checked independently.
CREATE FUNCTION saas.storefront_design_v5_legacy_probe(p_config jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT p_config||pg_catalog.jsonb_build_object('schemaVersion',4,'hero',pg_catalog.jsonb_build_object('enabled',false,'slides',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('enabled',false,'headline','','body','','desktopImage','null'::jsonb,'mobileImage','null'::jsonb,'destination',pg_catalog.jsonb_build_object('kind','none')))),'composition',(p_config->'composition')||pg_catalog.jsonb_build_object('schemaVersion',3,'sections','[]'::jsonb))
$f$;
CREATE OR REPLACE FUNCTION saas.storefront_theme_composition_references_valid(p_store_id uuid,p_config jsonb,p_publish boolean)
RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE section jsonb; slide jsonb; reference jsonb; probe jsonb;
BEGIN
 IF p_config->>'schemaVersion'<>'4' THEN RETURN saas.storefront_theme_composition_references_valid_pre_section_homepage(p_store_id,p_config,p_publish); END IF;
 IF NOT saas.storefront_design_composition_valid(p_config) THEN RETURN false; END IF;
 probe:=p_config||pg_catalog.jsonb_build_object('schemaVersion',3,'sections','[]'::jsonb);
 IF NOT saas.storefront_theme_composition_references_valid_pre_section_homepage(p_store_id,probe,p_publish) THEN RETURN false; END IF;
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'sections') LOOP
  IF section->>'kind'<>'banner' THEN
   IF NOT saas.storefront_theme_composition_references_valid_pre_section_homepage(p_store_id,pg_catalog.jsonb_set(probe,ARRAY['sections'],pg_catalog.jsonb_build_array(section-'style'),false),p_publish) THEN RETURN false; END IF;
  ELSE
   IF p_publish AND (section->>'enabled')::boolean AND NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(section->'slides') selected WHERE (selected.value->>'enabled')::boolean) THEN RETURN false; END IF;
   FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(section->'slides') LOOP
    IF slide->'destination'->>'kind'<>'path' AND NOT saas.storefront_design_destination_valid(p_store_id,slide->'destination') THEN RETURN false; END IF;
    IF slide?'productId' AND NOT EXISTS(SELECT 1 FROM saas.products product WHERE product.store_id=p_store_id AND product.id=(slide->>'productId')::uuid AND product.status='active') THEN RETURN false; END IF;
    FOREACH reference IN ARRAY ARRAY[slide->'desktopImage',slide->'mobileImage'] LOOP
     IF reference->>'kind'='media' AND NOT saas.storefront_design_media_reference_valid(p_store_id,reference,false) THEN RETURN false; END IF;
     IF reference->>'kind'='asset' AND NOT EXISTS(SELECT 1 FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=(reference->>'assetId')::uuid AND asset.asset_kind='hero' AND asset.status='active') THEN RETURN false; END IF;
    END LOOP;
    IF p_publish AND (section->>'enabled')::boolean AND (slide->>'enabled')::boolean AND (slide->'desktopImage'='null'::jsonb OR NOT saas.storefront_design_text_valid(slide->'headline',1,160)) THEN RETURN false; END IF;
   END LOOP;
  END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $f$;
CREATE OR REPLACE FUNCTION saas.storefront_design_document_valid(p_store_id uuid,p_config jsonb,p_allow_legacy boolean)
RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_config->>'schemaVersion'<>'5' THEN RETURN saas.storefront_design_document_valid_pre_section_homepage(p_store_id,p_config,p_allow_legacy); END IF;
 IF pg_catalog.pg_column_size(p_config)>524288 OR NOT saas.storefront_design_exact_keys(p_config,ARRAY['schemaVersion','brand','hero','promotion','announcement','typography','composition'])
 OR NOT saas.storefront_design_exact_keys(p_config->'hero',ARRAY['enabled','slides']) OR p_config->'hero'->'enabled'<>'false'::jsonb OR p_config->'hero'->'slides'<>'[]'::jsonb
 OR p_config->'composition'->>'schemaVersion'<>'4'
 OR NOT saas.storefront_design_document_valid_pre_section_homepage(p_store_id,saas.storefront_design_v5_legacy_probe(p_config),p_allow_legacy)
 OR NOT saas.storefront_theme_composition_references_valid(p_store_id,p_config->'composition',false) THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $f$;

CREATE FUNCTION saas.storefront_design_v5_publishable(p_store_id uuid,p_config jsonb,p_current jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE retained jsonb;
BEGIN
 IF p_config->>'schemaVersion'<>'5' OR NOT saas.storefront_design_document_valid(p_store_id,p_config,true)
 OR NOT saas.storefront_theme_composition_references_valid(p_store_id,p_config->'composition',true) THEN RETURN false; END IF;
 -- Authorization comes only from the locked current publication supplied by the
 -- Apply transaction; the proposed JSON cannot authorize its own raw URLs.
 FOR retained IN SELECT value FROM pg_catalog.jsonb_path_query(p_config,'strict $.** ? (@.kind == "legacy_https")') value LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_path_query(p_current,'strict $.** ? (@.kind == "legacy_https")') existing WHERE existing=retained) THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $f$;

CREATE FUNCTION saas.public_homepage_banner_media(p_store_id uuid,p_reference jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE result jsonb;
BEGIN
 IF p_reference='null'::jsonb THEN RETURN 'null'::jsonb; END IF;
 IF p_reference->>'kind'='asset' THEN RETURN COALESCE(saas.public_campaign_asset(p_store_id,(p_reference->>'assetId')::uuid),'null'::jsonb); END IF;
 IF p_reference->>'kind'='legacy_https' THEN RETURN pg_catalog.jsonb_build_object('url',p_reference->>'url','altText','','mediaType','image/webp','width',1,'height',1); END IF;
 SELECT pg_catalog.jsonb_build_object('url',media.public_url,'altText',media.alt_text,'mediaType',media.media_type,'width',media.width,'height',media.height) INTO result FROM saas.storefront_design_media media WHERE media.store_id=p_store_id AND media.id=(p_reference->>'mediaId')::uuid AND media.status='active';
 RETURN COALESCE(result,'null'::jsonb);
END $f$;
CREATE FUNCTION saas.public_homepage_banner(p_store_id uuid,p_section jsonb,p_now timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE slide jsonb; slides jsonb:='[]'::jsonb; destination jsonb; hotspot jsonb; desktop jsonb;
BEGIN
 FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(p_section->'slides') LOOP
  IF NOT (slide->>'enabled')::boolean THEN CONTINUE; END IF;
  desktop:=saas.public_homepage_banner_media(p_store_id,slide->'desktopImage');IF desktop='null'::jsonb THEN CONTINUE; END IF;
  destination:=CASE WHEN slide->'destination'->>'kind'='path' THEN slide->'destination'->'path' ELSE COALESCE(saas.storefront_design_public_destination(p_store_id,slide->'destination')->'path','null'::jsonb) END;
  hotspot:=NULL;
  IF slide?'productId' THEN SELECT pg_catalog.jsonb_build_object('productSlug',product.slug,'title',product.title,'priceCents',(projected.payload->>'priceCents')::bigint,'currency','TRY') INTO hotspot FROM saas.products product CROSS JOIN LATERAL (SELECT saas.public_effective_product_projection(p_store_id,product.id,p_now) payload) projected WHERE product.store_id=p_store_id AND product.id=(slide->>'productId')::uuid AND projected.payload IS NOT NULL; END IF;
  slides:=slides||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('slideId',slide->>'slideId','enabled',true,'headline',slide->>'headline','body',slide->>'body','desktopImage',desktop,'mobileImage',saas.public_homepage_banner_media(p_store_id,slide->'mobileImage'),'destination',destination)||CASE WHEN slide?'eyebrow' THEN pg_catalog.jsonb_build_object('eyebrow',slide->>'eyebrow') ELSE '{}'::jsonb END||CASE WHEN hotspot IS NOT NULL THEN pg_catalog.jsonb_build_object('hotspot',hotspot) ELSE '{}'::jsonb END);
 END LOOP;
 RETURN pg_catalog.jsonb_build_object('kind','banner','sectionId',p_section->>'sectionId','layout',p_section->>'layout','autoplay',p_section->'autoplay','presentation',p_section->>'presentation','slides',slides);
END $f$;

DO $projection$
DECLARE definition text; marker text:='IF section->>''kind''=''hero'' THEN'; append_marker text:='END IF; sections:=sections||pg_catalog.jsonb_build_array(resolved);';
BEGIN
 SELECT backup.definition INTO definition FROM saas.section_homepage_v4_backup backup WHERE identity='saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)';
 IF pg_catalog.strpos(definition,marker)=0 OR pg_catalog.strpos(definition,append_marker)=0 OR pg_catalog.strpos(definition,'(section->>''source'')||''-''||row_index')=0 THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_PROJECTION_SOURCE_CHANGED'; END IF;
 definition:=pg_catalog.replace(definition,marker,'IF section->>''kind''=''banner'' THEN resolved:=saas.public_homepage_banner(p_store_id,section,p_now); IF pg_catalog.jsonb_array_length(resolved->''slides'')=0 THEN CONTINUE; END IF; ELSIF section->>''kind''=''hero'' THEN');
 definition:=pg_catalog.replace(definition,append_marker,'END IF; IF config->>''schemaVersion''=''4'' THEN IF section?''style'' THEN resolved:=resolved||pg_catalog.jsonb_build_object(''style'',section->''style''); END IF; IF section->>''kind''=''category_grid'' THEN resolved:=resolved||pg_catalog.jsonb_build_object(''layout'',section->>''layout''); END IF; END IF; sections:=sections||pg_catalog.jsonb_build_array(resolved);');
 definition:=pg_catalog.replace(definition,'(section->>''source'')||''-''||row_index','CASE WHEN config->>''schemaVersion''=''4'' THEN section->>''sectionId'' ELSE (section->>''source'')||''-''||row_index END');
 EXECUTE definition;
 SELECT backup.definition INTO definition FROM saas.section_homepage_v4_backup backup WHERE identity='saas.public_starter_retail_home(uuid,text,timestamptz)';
 IF pg_catalog.strpos(definition,'presentation->>''schemaVersion''<>''3''')=0 THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_HOME_SOURCE_CHANGED'; END IF;
 definition:=pg_catalog.replace(definition,'presentation->>''schemaVersion''<>''3''','presentation->>''schemaVersion'' NOT IN (''3'',''4'')');
 IF pg_catalog.strpos(definition,'selected_category:=NULL;')=0 OR pg_catalog.strpos(definition,'FROM selected;')=0 THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_HOME_CACHE_SOURCE_CHANGED'; END IF;
 definition:=pg_catalog.replace(definition,'selected_category uuid;', 'selected_category uuid; source_cache jsonb:=''{}''::jsonb; source_key text;');
 definition:=pg_catalog.replace(definition,'selected_category:=NULL;', 'source_key:=pg_catalog.md5((section-ARRAY[''sectionId'',''key'',''heading'',''style''])::text); IF source_cache?source_key THEN items:=source_cache->source_key; ELSE selected_category:=NULL;');
 definition:=pg_catalog.replace(definition,'FROM selected;', 'FROM selected; source_cache:=source_cache||pg_catalog.jsonb_build_object(source_key,items); END IF;');
 EXECUTE definition;
END $projection$;
CREATE OR REPLACE FUNCTION saas.public_starter_retail_presentation(p_store_id uuid,p_now timestamptz,p_allow_index boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE composition jsonb; projected jsonb; section jsonb; config_section jsonb; sections jsonb:='[]'::jsonb;
BEGIN
 SELECT design.published_config->'composition' INTO composition FROM saas.storefront_designs design WHERE design.store_id=p_store_id;
 IF composition->>'schemaVersion'<>'4' OR composition IS NULL THEN RETURN saas.public_starter_retail_presentation_pre_section_homepage(p_store_id,p_now,p_allow_index); END IF;
 projected:=saas.public_starter_retail_presentation_without_category_layout(p_store_id,p_now,p_allow_index);
 -- The legacy projector strips null keys recursively. Banner frames require
 -- explicit null media/destination fields; restore them after that projection.
 FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(projected->'sections') LOOP
  IF section->>'kind'='banner' THEN
   SELECT selected.value INTO config_section FROM pg_catalog.jsonb_array_elements(composition->'sections') selected WHERE selected.value->>'sectionId'=section->>'sectionId';
   section:=saas.public_homepage_banner(p_store_id,config_section,p_now)||CASE WHEN config_section?'style' THEN pg_catalog.jsonb_build_object('style',config_section->'style') ELSE '{}'::jsonb END;
  END IF;
  sections:=sections||pg_catalog.jsonb_build_array(section);
 END LOOP;
 RETURN projected||pg_catalog.jsonb_build_object('schemaVersion',4,'sections',sections);
END $f$;

ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_schema_version_check;
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_schema_version_check CHECK(schema_version IN (4,5));
-- Apply preserves an old saved draft even when its selected resources were
-- archived later. Once published V5, the legacy writers are closed by179 and
-- only the owner can change those old draft bytes. Keep their structural shape
-- check; revalidate every resource in the new publication through Apply.
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_draft_unified_theme_check CHECK(
 saas.storefront_design_document_valid(store_id,draft_config,true)
 OR (schema_version=5 AND published_config->>'schemaVersion'='5' AND draft_config->>'schemaVersion' IN ('3','4')
   AND saas.storefront_design_exact_keys(draft_config-'typography',ARRAY['schemaVersion','brand','hero','promotion','announcement','composition'])
   AND saas.storefront_design_composition_valid(draft_config->'composition'))
);
-- New definitions replace the existing function OIDs, so existing document
-- CHECK constraints automatically use the V5-aware validation.
REVOKE ALL ON FUNCTION
 saas.homepage_banner_media_shape_valid(jsonb),saas.homepage_banner_destination_shape_valid(jsonb),
 saas.storefront_design_composition_valid_pre_section_homepage(jsonb),saas.storefront_design_document_valid_pre_section_homepage(uuid,jsonb,boolean),
 saas.storefront_theme_composition_references_valid_pre_section_homepage(uuid,jsonb,boolean),saas.public_starter_retail_presentation_pre_section_homepage(uuid,timestamptz,boolean),
 saas.storefront_design_normalize_v5(jsonb),saas.storefront_design_v5_legacy_probe(jsonb),saas.storefront_design_v5_publishable(uuid,jsonb,jsonb),
 saas.public_homepage_banner_media(uuid,jsonb),saas.public_homepage_banner(uuid,jsonb,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
COMMIT;
