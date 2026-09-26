BEGIN;
SET LOCAL ROLE celebix_saas_owner;
-- Schema rollback is refused once users have saved optional values; preserve their data.
DO $rollback_guard$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.product_variants WHERE measurements IS NOT NULL)
 THEN RAISE EXCEPTION 'MEASUREMENT_ROLLBACK_DATA_PRESENT: retain additive schema and roll forward'; END IF;
END $rollback_guard$;
DROP FUNCTION saas.catalog_create_product_measurements(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb);
DROP FUNCTION saas.catalog_create_product_measurements_implementation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb);
DROP FUNCTION saas.catalog_create_variant_measurements(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb);
DROP FUNCTION saas.catalog_create_variant_measurements_implementation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb);
DROP FUNCTION saas.catalog_update_variant_measurements(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb);
DROP FUNCTION saas.catalog_update_variant_measurements_implementation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb);
DROP FUNCTION saas.catalog_onboard_product_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb);
DROP FUNCTION saas.catalog_create_variants_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb);
ALTER TABLE saas.product_variants DROP CONSTRAINT product_variants_measurements_valid, DROP COLUMN measurements;
DROP FUNCTION saas.catalog_get_product_details_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean);
DROP FUNCTION saas.catalog_get_product_editor_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_update_merchandising_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb);
DROP FUNCTION saas.catalog_publish_after_media_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,integer);
DROP FUNCTION saas.catalog_measurements_enrich_result(uuid,uuid,jsonb);
DROP FUNCTION saas.catalog_onboarding_result_projection_v2(uuid,uuid);
DROP FUNCTION saas.catalog_variant_projection_v2(uuid);
DROP FUNCTION saas.catalog_measurements_valid(jsonb);
COMMIT;
