-- Rollback removes entry points and triggers; durable SEO data and category metadata are retained for reapply.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DROP TRIGGER IF EXISTS seo_category_metadata ON saas.merchant_admin_records;
DO $f$ DECLARE tab text;fn record;BEGIN
 FOREACH tab IN ARRAY ARRAY['products','catalog_product_profiles','catalog_categories','merchant_admin_records','merchant_content_bodies','product_variants','product_media'] LOOP EXECUTE format('DROP TRIGGER IF EXISTS seo_resource_notification ON saas.%I',tab);END LOOP;
 FOR fn IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'seo_%' LOOP EXECUTE format('DROP FUNCTION IF EXISTS %s CASCADE',fn.signature);END LOOP;
END $f$;
DROP FUNCTION saas.public_content_index_allowed(uuid,text,timestamptz);
DROP FUNCTION saas.public_content_sitemap_rows(uuid,text,timestamptz,text,jsonb,text,text);
ALTER FUNCTION saas.public_content_index_allowed_before_seo_hub(uuid,text,timestamptz) RENAME TO public_content_index_allowed;
ALTER FUNCTION saas.public_content_sitemap_rows_before_seo_hub(uuid,text,timestamptz,text,jsonb,text,text) RENAME TO public_content_sitemap_rows;
COMMIT;
