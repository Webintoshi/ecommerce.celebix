BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $f$
DECLARE app_oid oid:='celebix_saas_app'::regrole; host_oid oid:='celebix_saas_host_resolver'::regrole;
BEGIN
 IF pg_catalog.to_regprocedure('saas.public_campaign_home(uuid,text,timestamp with time zone)') IS NULL OR pg_catalog.to_regprocedure('saas.public_storefront_related_products(uuid,text,timestamp with time zone,text,integer)') IS NULL OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid(jsonb)') IS NULL THEN RAISE EXCEPTION 'CAMPAIGN_STARTER_API_MISSING'; END IF;
 IF NOT saas.campaign_starter_composition_valid('{"schemaVersion":1,"visual":{"colorScheme":"neutral","headingStyle":"serif","cornerStyle":"soft","headerStyle":"overlay","productCardStyle":"editorial","productImageRatio":"portrait"},"announcement":{"enabled":false,"items":[]},"navigation":{"rootCategoryIds":[]},"sections":[{"kind":"product_row","enabled":true,"heading":"Yeni ürünler","source":"latest","limit":8}],"productDetail":{"galleryStyle":"grid","showSku":true,"showBrand":true,"showRelatedProducts":true,"mobileStickyPurchase":true},"cart":{"showCheckoutReadiness":true,"showShippingProgress":true}}'::jsonb) THEN RAISE EXCEPTION 'CAMPAIGN_STARTER_VALID_CONFIG_REJECTED'; END IF;
 IF saas.campaign_starter_composition_valid('{"schemaVersion":1}'::jsonb) OR saas.campaign_starter_composition_valid('{"schemaVersion":1,"visual":{},"announcement":{},"navigation":{},"sections":[],"productDetail":{},"cart":{},"storeId":"10000000-0000-4000-8000-000000000001"}'::jsonb) THEN RAISE EXCEPTION 'CAMPAIGN_STARTER_WEAK_VALIDATION'; END IF;
 IF NOT pg_catalog.has_function_privilege(app_oid,'saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)','EXECUTE') OR NOT pg_catalog.has_function_privilege(host_oid,'saas.public_campaign_home(uuid,text,timestamp with time zone)','EXECUTE') OR NOT pg_catalog.has_function_privilege(host_oid,'saas.public_storefront_related_products(uuid,text,timestamp with time zone,text,integer)','EXECUTE') THEN RAISE EXCEPTION 'CAMPAIGN_STARTER_GRANT_MISSING'; END IF;
 IF pg_catalog.has_function_privilege(app_oid,'saas.public_campaign_home(uuid,text,timestamp with time zone)','EXECUTE') OR pg_catalog.has_function_privilege(host_oid,'saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)','EXECUTE') THEN RAISE EXCEPTION 'CAMPAIGN_STARTER_ROLE_CROSSOVER'; END IF;
END
$f$;
COMMIT;
