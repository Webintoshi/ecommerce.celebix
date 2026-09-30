-- Add true catalog-collection destinations without changing category semantics or publications.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $guard$ BEGIN
 IF to_regprocedure('saas.catalog_collection_config_normalized(jsonb)') IS NULL OR to_regclass('saas.catalog_collection_design_backup_181') IS NOT NULL THEN RAISE EXCEPTION 'COLLECTION_DESIGN_PREDECESSOR_INVALID'; END IF;
END $guard$;
CREATE TABLE saas.catalog_collection_design_backup_181(signature text PRIMARY KEY,clone_name text NOT NULL,definition text NOT NULL,owner_id oid NOT NULL,acl aclitem[],security_definer boolean NOT NULL,config text[],migrated_definition text);
ALTER TABLE saas.catalog_collection_design_backup_181 ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_collection_design_backup_181 FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.catalog_collection_design_backup_181 FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
INSERT INTO saas.catalog_collection_design_backup_181(signature,clone_name,definition,owner_id,acl,security_definer,config)
SELECT entry.signature,entry.clone_name,pg_get_functiondef(p.oid),p.proowner,p.proacl,p.prosecdef,p.proconfig
FROM (VALUES
('saas.storefront_design_composition_valid(jsonb)','c181_composition_predecessor'),
('saas.storefront_theme_composition_references_valid(uuid,jsonb,boolean)','c181_references_predecessor'),
('saas.storefront_design_destination_valid(uuid,jsonb)','c181_destination_predecessor'),
('saas.storefront_design_public_destination(uuid,jsonb)','c181_public_destination_predecessor'),
('saas.storefront_design_workspace_payload(uuid)','c181_workspace_predecessor'),
('saas.starter_retail_footer_link_valid(jsonb)','c181_footer_valid_predecessor'),
('saas.public_starter_footer_link(uuid,jsonb)','c181_public_footer_predecessor'),
('saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)','c181_presentation_predecessor')) entry(signature,clone_name) JOIN pg_proc p ON p.oid=to_regprocedure(entry.signature);
DO $clones$ DECLARE r record; source text; clone_signature text;
BEGIN
 IF (SELECT count(*) FROM saas.catalog_collection_design_backup_181)<>8 THEN RAISE EXCEPTION 'COLLECTION_DESIGN_SOURCE_MISSING'; END IF;
 FOR r IN SELECT * FROM saas.catalog_collection_design_backup_181 LOOP
  source:=replace(r.definition,'FUNCTION '||split_part(r.signature,'(',1)||'(', 'FUNCTION saas.'||r.clone_name||'(');
  IF source=r.definition THEN RAISE EXCEPTION 'COLLECTION_DESIGN_CLONE_INVALID'; END IF;
  EXECUTE source;
  clone_signature:='saas.'||r.clone_name||substring(r.signature from position('(' in r.signature));
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',clone_signature);
 END LOOP;
END $clones$;

CREATE FUNCTION saas.c181_navigation_valid(p_navigation jsonb) RETURNS boolean
LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE link jsonb;
BEGIN
 IF NOT p_navigation?'rootLinks' THEN RETURN true; END IF;
 IF jsonb_typeof(p_navigation->'rootLinks')<>'array' OR jsonb_array_length(p_navigation->'rootLinks')>8 THEN RETURN false; END IF;
 FOR link IN SELECT value FROM jsonb_array_elements(p_navigation->'rootLinks') LOOP
  IF NOT saas.storefront_design_exact_keys(link,ARRAY['kind','resourceId']) OR link->>'kind' NOT IN('category','catalog_collection') OR NOT saas.campaign_starter_uuid_valid(link->'resourceId') THEN RETURN false; END IF;
 END LOOP;
 RETURN (SELECT count(*)=count(DISTINCT value->>'kind'||':'||(value->>'resourceId')) FROM jsonb_array_elements(p_navigation->'rootLinks'));
EXCEPTION WHEN others THEN RETURN false;
END $f$;
CREATE OR REPLACE FUNCTION saas.starter_retail_footer_link_valid(p_link jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_link->>'kind'='catalog_collection' THEN RETURN saas.storefront_design_exact_keys(p_link,ARRAY['kind','resourceId']) AND saas.campaign_starter_uuid_valid(p_link->'resourceId'); END IF;
 RETURN saas.c181_footer_valid_predecessor(p_link);
END $f$;
CREATE OR REPLACE FUNCTION saas.storefront_design_composition_valid(p_config jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
BEGIN
 RETURN saas.c181_navigation_valid(p_config->'navigation') AND saas.c181_composition_predecessor(jsonb_set(p_config,ARRAY['navigation'],(p_config->'navigation')-'rootLinks',false));
EXCEPTION WHEN others THEN RETURN false;
END $f$;
CREATE OR REPLACE FUNCTION saas.storefront_design_destination_valid(p_store_id uuid,p_value jsonb) RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_value->>'kind'='catalog_collection' THEN
  RETURN saas.storefront_design_exact_keys(p_value,ARRAY['kind','resourceId']) AND saas.campaign_starter_uuid_valid(p_value->'resourceId') AND EXISTS(SELECT 1 FROM saas.catalog_admin_resources resource WHERE resource.store_id=p_store_id AND resource.id=(p_value->>'resourceId')::uuid AND resource.resource_kind='collection' AND resource.status='active' AND saas.catalog_collection_config_normalized(resource.config)->'published'='true'::jsonb);
 END IF;
 RETURN saas.c181_destination_predecessor(p_store_id,p_value);
EXCEPTION WHEN others THEN RETURN false;
END $f$;
CREATE OR REPLACE FUNCTION saas.storefront_theme_composition_references_valid(p_store_id uuid,p_config jsonb,p_publish boolean) RETURNS boolean LANGUAGE plpgsql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
DECLARE link jsonb; group_value jsonb;
BEGIN
 IF NOT saas.storefront_design_composition_valid(p_config) OR NOT saas.c181_references_predecessor(p_store_id,jsonb_set(p_config,ARRAY['navigation'],(p_config->'navigation')-'rootLinks',false),p_publish) THEN RETURN false; END IF;
 FOR link IN SELECT value FROM jsonb_array_elements(COALESCE(p_config->'navigation'->'rootLinks','[]'::jsonb)) LOOP
  IF link->>'kind'='category' THEN
   IF NOT EXISTS(SELECT 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=(link->>'resourceId')::uuid AND category.status='active') THEN RETURN false; END IF;
  ELSIF NOT saas.storefront_design_destination_valid(p_store_id,link) THEN RETURN false; END IF;
 END LOOP;
 FOR group_value IN SELECT value FROM jsonb_array_elements(p_config->'footer'->'groups') LOOP
  FOR link IN SELECT value FROM jsonb_array_elements(group_value->'links') LOOP
   IF link->>'kind'='catalog_collection' AND NOT saas.storefront_design_destination_valid(p_store_id,link) THEN RETURN false; END IF;
  END LOOP;
 END LOOP;
 RETURN true;
EXCEPTION WHEN others THEN RETURN false;
END $f$;
CREATE OR REPLACE FUNCTION saas.storefront_design_public_destination(p_store_id uuid,p_value jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE result jsonb;
BEGIN
 IF p_value->>'kind'<>'catalog_collection' THEN RETURN saas.c181_public_destination_predecessor(p_store_id,p_value); END IF;
 SELECT jsonb_build_object('path','/collections/'||resource.slug) INTO result FROM saas.catalog_admin_resources resource WHERE resource.store_id=p_store_id AND resource.id=(p_value->>'resourceId')::uuid AND resource.resource_kind='collection' AND resource.status='active' AND saas.catalog_collection_config_normalized(resource.config)->'published'='true'::jsonb;
 RETURN COALESCE(result,'null'::jsonb);
END $f$;
CREATE OR REPLACE FUNCTION saas.public_starter_footer_link(p_store_id uuid,p_link jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE result jsonb;
BEGIN
 IF p_link->>'kind'<>'catalog_collection' THEN RETURN saas.c181_public_footer_predecessor(p_store_id,p_link); END IF;
 SELECT jsonb_build_object('label',resource.name,'destination','/collections/'||resource.slug) INTO result FROM saas.catalog_admin_resources resource WHERE resource.store_id=p_store_id AND resource.id=(p_link->>'resourceId')::uuid AND resource.resource_kind='collection' AND resource.status='active' AND saas.catalog_collection_config_normalized(resource.config)->'published'='true'::jsonb;
 RETURN result;
END $f$;
CREATE OR REPLACE FUNCTION saas.storefront_design_workspace_payload(p_store_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE payload jsonb; choices jsonb;
BEGIN
 payload:=saas.c181_workspace_predecessor(p_store_id);
 IF payload IS NULL THEN RETURN NULL; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object('kind','catalog_collection','resourceId',resource.id,'label',resource.name,'path','/collections/'||resource.slug) ORDER BY resource.name,resource.id),'[]'::jsonb) INTO choices FROM saas.catalog_admin_resources resource WHERE resource.store_id=p_store_id AND resource.resource_kind='collection' AND resource.status='active' AND saas.catalog_collection_config_normalized(resource.config)->'published'='true'::jsonb;
 RETURN jsonb_set(payload,ARRAY['destinations'],(payload->'destinations')||choices,false);
END $f$;
CREATE OR REPLACE FUNCTION saas.public_starter_retail_presentation_without_category_layout(p_store_id uuid,p_now timestamptz,p_allow_index boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE payload jsonb; navigation jsonb; items jsonb:='[]'::jsonb; link jsonb; item jsonb;
BEGIN
 payload:=saas.c181_presentation_predecessor(p_store_id,p_now,p_allow_index);
 IF payload IS NULL THEN RETURN NULL; END IF;
 SELECT published_config->'composition'->'navigation' INTO navigation FROM saas.storefront_designs WHERE store_id=p_store_id;
 IF NOT navigation?'rootLinks' THEN RETURN payload; END IF;
 FOR link IN SELECT value FROM jsonb_array_elements(navigation->'rootLinks') LOOP
  item:=NULL;
  IF link->>'kind'='category' THEN item:=saas.public_campaign_navigation_item(p_store_id,(link->>'resourceId')::uuid,0,(navigation->>'featuredCategoryId')::uuid,(navigation->>'featuredAssetId')::uuid);
  ELSE SELECT jsonb_build_object('name',resource.name,'slug',resource.slug,'children','[]'::jsonb,'kind','catalog_collection','resourceId',resource.id,'path','/collections/'||resource.slug) INTO item FROM saas.catalog_admin_resources resource WHERE resource.store_id=p_store_id AND resource.id=(link->>'resourceId')::uuid AND resource.resource_kind='collection' AND resource.status='active' AND saas.catalog_collection_config_normalized(resource.config)->'published'='true'::jsonb; END IF;
  IF item IS NOT NULL THEN items:=items||jsonb_build_array(item); END IF;
 END LOOP;
 RETURN jsonb_set(payload,ARRAY['navigation','items'],items,false);
END $f$;
REVOKE ALL ON FUNCTION saas.c181_navigation_valid(jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
DO $authority$ DECLARE r record; p record;
BEGIN
 FOR r IN SELECT * FROM saas.catalog_collection_design_backup_181 LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=r.signature::regprocedure;
  IF p.proowner<>r.owner_id OR p.proacl IS DISTINCT FROM r.acl OR p.prosecdef<>r.security_definer OR p.proconfig IS DISTINCT FROM r.config THEN RAISE EXCEPTION 'COLLECTION_DESIGN_AUTHORITY_CHANGED %',r.signature; END IF;
  UPDATE saas.catalog_collection_design_backup_181 SET migrated_definition=pg_get_functiondef(p.oid) WHERE signature=r.signature;
 END LOOP;
END $authority$;
COMMIT;
