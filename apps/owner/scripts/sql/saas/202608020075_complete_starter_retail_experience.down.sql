BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $f$
BEGIN
 IF pg_catalog.to_regclass('saas.storefront_newsletter_subscribers') IS NULL OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_v1_valid(jsonb)') IS NULL THEN RAISE EXCEPTION 'STARTER_RETAIL_DOWN_SOURCE_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM saas.campaign_starter_publications WHERE config->>'schemaVersion'='2') THEN RAISE EXCEPTION 'STARTER_RETAIL_DOWN_V2_DATA_PRESENT'; END IF;
END
$f$;

DROP FUNCTION saas.merchant_newsletter_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer);
DROP FUNCTION saas.public_newsletter_subscribe(text,timestamptz,text,text);
DROP TABLE saas.storefront_newsletter_subscribers;
DROP FUNCTION saas.public_starter_product_detail(uuid,text,timestamptz,text);
DROP FUNCTION saas.public_starter_product_merchandising(uuid,uuid);
CREATE OR REPLACE FUNCTION saas.resolve_public_storefront(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE projection jsonb;
BEGIN
 IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname) OR pg_catalog.char_length(p_hostname) NOT BETWEEN 3 AND 253 OR p_hostname~'[*:/?#@[:space:][:cntrl:]]' OR p_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
 SELECT pg_catalog.jsonb_build_object('schemaVersion',2,'id',store.id,'name',store.name,'slug',store.slug,'hostname',domain.hostname,'primaryHostname',primary_domain.hostname,'canonicalUrl','https://'||domain.hostname||'/','currency',store.currency,'locale',store.locale,'themeKey',store.theme_key,'presentation',saas.public_starter_presentation(store.id,p_now,domain.hostname_type='custom_domain' AND domain.is_primary)) INTO projection
 FROM saas.store_domains domain JOIN saas.stores store ON store.id=domain.store_id AND store.status='active' JOIN saas.store_domains primary_domain ON primary_domain.store_id=store.id AND primary_domain.status='active' AND primary_domain.is_primary AND primary_domain.verified_at<=p_now
 WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.verified_at<=p_now;
 RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END,projection;
END
$f$;
REVOKE ALL ON FUNCTION saas.resolve_public_storefront(text,timestamptz) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.resolve_public_storefront(text,timestamptz) TO celebix_saas_host_resolver;
DROP FUNCTION saas.public_starter_retail_home(uuid,text,timestamptz);
DROP FUNCTION saas.public_starter_retail_presentation(uuid,timestamptz,boolean);
DROP FUNCTION saas.public_starter_review_projection(uuid,uuid);
DROP FUNCTION saas.public_starter_retail_footer(uuid,jsonb);
DROP FUNCTION saas.public_starter_footer_link(uuid,jsonb);
DROP TRIGGER campaign_starter_retail_references ON saas.campaign_starter_publications;
DROP FUNCTION saas.guard_starter_retail_publication();
DROP FUNCTION saas.starter_retail_publication_references_valid(uuid,jsonb);

ALTER TABLE saas.campaign_starter_publications DROP CONSTRAINT campaign_starter_publications_config_check;
DROP FUNCTION saas.campaign_starter_composition_valid(jsonb);
ALTER FUNCTION saas.campaign_starter_composition_v1_valid(jsonb) RENAME TO campaign_starter_composition_valid;
ALTER TABLE saas.campaign_starter_publications ADD CONSTRAINT campaign_starter_publications_config_check CHECK(saas.campaign_starter_composition_valid(config));
DROP FUNCTION saas.starter_retail_composition_v2_valid(jsonb);
DROP FUNCTION saas.starter_retail_footer_link_valid(jsonb);
DROP FUNCTION saas.starter_retail_social_url_valid(text,text);
COMMIT;
