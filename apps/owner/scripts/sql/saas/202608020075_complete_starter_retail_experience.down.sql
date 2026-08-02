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
