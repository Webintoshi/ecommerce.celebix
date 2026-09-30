-- Canonicals to other resources must target indexable URLs. Saved choices remain untouched.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $f$ BEGIN
 IF to_regprocedure('saas.seo_canonical_owned(uuid,timestamptz,text,text,uuid)') IS NULL OR to_regclass('saas.seo_resource_options') IS NULL THEN RAISE EXCEPTION 'SEO_INDEXABLE_CANONICALS_PRECONDITION_FAILED';END IF;
 IF to_regprocedure('saas.seo_canonical_owned_before_indexable_targets(uuid,timestamptz,text,text,uuid)') IS NULL THEN ALTER FUNCTION saas.seo_canonical_owned(uuid,timestamptz,text,text,uuid) RENAME TO seo_canonical_owned_before_indexable_targets;END IF;
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_canonical_owned(p_store_id uuid,p_now timestamptz,p_path text,p_kind text,p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT p_path IS NULL OR (saas.seo_path_valid(p_path) AND (
 p_path IN('/','/blog',(SELECT CASE WHEN locale='tr' OR locale LIKE 'tr-%' THEN '/urunler' ELSE '/products' END FROM saas.stores WHERE id=p_store_id))
 OR EXISTS(SELECT 1 FROM saas.products p JOIN saas.stores s ON s.id=p.store_id WHERE p.store_id=p_store_id AND p.status<>'archived' AND p_path=(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/urun/' ELSE '/products/' END)||p.slug AND (p_kind='product' AND p.id=p_id OR p.status='active' AND saas.public_effective_product_projection(p_store_id,p.id,p_now) IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.seo_resource_options o WHERE o.store_id=p_store_id AND o.kind='product' AND o.resource_id=p.id AND o.indexing='noindex')))
 OR EXISTS(SELECT 1 FROM saas.catalog_categories c JOIN saas.stores s ON s.id=c.store_id WHERE c.store_id=p_store_id AND c.status='active' AND p_path=(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/kategori/' ELSE '/categories/' END)||c.slug AND (p_kind='category' AND c.id=p_id OR NOT EXISTS(SELECT 1 FROM saas.seo_resource_options o WHERE o.store_id=p_store_id AND o.kind='category' AND o.resource_id=c.id AND o.indexing='noindex')))
 OR EXISTS(SELECT 1 FROM saas.merchant_admin_records r CROSS JOIN LATERAL(SELECT saas.public_content_locale_config(p_store_id) value) language WHERE r.store_id=p_store_id AND r.record_kind IN('page','blog_post') AND r.status<>'archived'
 AND p_path=(CASE WHEN r.record_kind='page' THEN '/pages/' ELSE '/blog/' END)||coalesce(r.config->>'slug',r.id::text)||(CASE WHEN coalesce(r.config->>'locale',language.value->>'defaultLocale')=language.value->>'defaultLocale' THEN '' ELSE '?lang='||coalesce(r.config->>'locale',language.value->>'defaultLocale') END)
 AND (r.id=p_id AND (p_kind='page' AND r.record_kind='page' OR p_kind='blog' AND r.record_kind='blog_post') OR r.status='active' AND r.config->>'published'='true' AND NOT EXISTS(SELECT 1 FROM saas.seo_resource_options o WHERE o.store_id=p_store_id AND o.kind=CASE WHEN r.record_kind='page' THEN 'page' ELSE 'blog' END AND o.resource_id=r.id AND o.indexing='noindex')
 AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(language.value->'enabledLocales') enabled WHERE enabled.value=coalesce(r.config->>'locale',language.value->>'defaultLocale'))
 AND NOT EXISTS(SELECT 1 FROM saas.merchant_admin_records newer WHERE newer.store_id=r.store_id AND newer.record_kind=r.record_kind AND newer.status='active' AND newer.config->>'published'='true' AND newer.config->>'slug'=r.config->>'slug' AND coalesce(newer.config->>'locale',language.value->>'defaultLocale')=coalesce(r.config->>'locale',language.value->>'defaultLocale') AND (newer.updated_at,newer.id)>(r.updated_at,r.id)) ))
 ))
$f$;
REVOKE ALL ON FUNCTION saas.seo_canonical_owned(uuid,timestamptz,text,text,uuid),saas.seo_canonical_owned_before_indexable_targets(uuid,timestamptz,text,text,uuid) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
COMMIT;
