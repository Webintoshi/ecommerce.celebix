-- Read-only review before SQL209. No table mutation, raw body, credentials or fake actor.
BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL statement_timeout='30s';
WITH keys AS (
 SELECT * FROM (VALUES
 ('about',ARRAY['hakkımızda','hakkimizda','about','about us'],ARRAY['hakkimizda','about','about-us']),
 ('contact',ARRAY['iletişim','iletisim','contact','contact us'],ARRAY['iletisim','contact','contact-us']),
 ('blog',ARRAY['blog'],ARRAY['blog'])) k(page_key,names,slugs)
), stores AS MATERIALIZED (
 SELECT s.id,saas.merchant_content_locale_config(s.id)->>'defaultLocale' locale FROM saas.stores s
), matching AS (
 SELECT s.id store_id,s.locale,k.page_key,r.id record_id,r.config->>'slug' slug,
 EXISTS(SELECT 1 FROM keys other WHERE other.page_key<>k.page_key AND (lower(btrim(r.name))=ANY(other.names) OR r.config->>'slug'=ANY(other.slugs))) cross_key,
 EXISTS(SELECT 1 FROM saas.merchant_admin_records duplicate WHERE duplicate.store_id=r.store_id AND duplicate.record_kind='page' AND duplicate.id<>r.id AND duplicate.config->>'slug'=r.config->>'slug' AND coalesce(duplicate.config->>'locale',s.locale)=s.locale) duplicate_route
 FROM stores s CROSS JOIN keys k JOIN saas.merchant_admin_records r ON r.store_id=s.id AND r.record_kind='page' AND r.status IN('draft','active')
 AND coalesce(r.config->>'locale',s.locale)=s.locale AND char_length(r.config->>'slug') BETWEEN 1 AND 100 AND r.config->>'slug'~'^[a-z0-9]+(-[a-z0-9]+)*$' AND r.config->>'slug'<>r.id::text
 AND (lower(btrim(r.name))=ANY(k.names) OR r.config->>'slug'=ANY(k.slugs))
)
SELECT s.id store_id,s.locale,k.page_key,count(m.record_id)::integer candidate_count,
 CASE WHEN count(m.record_id)=1 AND bool_or(m.cross_key OR m.duplicate_route) IS DISTINCT FROM true THEN 'adopt' ELSE 'create_draft' END planned_action,
 CASE WHEN count(m.record_id)=0 THEN 'missing' WHEN count(m.record_id)>1 OR bool_or(m.cross_key OR m.duplicate_route) THEN 'ambiguous_preserve_existing' ELSE 'unambiguous_preserve_existing' END reason,
 array_agg(m.record_id ORDER BY m.record_id) FILTER(WHERE m.record_id IS NOT NULL) candidate_ids
FROM stores s CROSS JOIN keys k LEFT JOIN matching m ON m.store_id=s.id AND m.page_key=k.page_key
GROUP BY s.id,s.locale,k.page_key ORDER BY s.id,k.page_key;
COMMIT;
