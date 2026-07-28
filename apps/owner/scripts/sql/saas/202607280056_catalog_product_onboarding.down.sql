-- Disposable-only rollback for catalog onboarding migration 056.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $rollback_guard$
BEGIN
  IF EXISTS(SELECT 1 FROM saas.catalog_product_profiles)
     OR EXISTS(SELECT 1 FROM saas.catalog_categories)
     OR EXISTS(SELECT 1 FROM saas.catalog_product_categories)
     OR EXISTS(SELECT 1 FROM saas.catalog_variant_commerce_profiles)
     OR EXISTS(SELECT 1 FROM saas.catalog_product_channels)
     OR EXISTS(SELECT 1 FROM saas.catalog_onboarding_operations) THEN
    RAISE EXCEPTION 'CATALOG_PRODUCT_ONBOARDING_ROLLBACK_BLOCKED';
  END IF;
END
$rollback_guard$;

DROP FUNCTION saas.catalog_recover_onboarding_operation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text);
DROP FUNCTION saas.catalog_publish_after_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,integer);
DROP FUNCTION saas.catalog_update_merchandising(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb);
DROP FUNCTION saas.catalog_get_product_editor(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid);
DROP FUNCTION saas.catalog_onboard_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb);
DROP FUNCTION saas.catalog_get_onboarding_options(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz);
DROP FUNCTION saas.catalog_product_editor_projection(uuid,uuid);
DROP FUNCTION saas.catalog_onboarding_result_projection(uuid,uuid);
DROP FUNCTION saas.catalog_onboarding_profile_projection(uuid,uuid);
DROP FUNCTION saas.catalog_onboarding_resource_ids_projection(uuid,uuid);
DROP FUNCTION saas.catalog_onboarding_slug_base(text);
DROP FUNCTION saas.catalog_onboarding_uuid_json_array_valid(jsonb,integer);
DROP FUNCTION saas.catalog_onboarding_json_exact(jsonb,text[],text[]);

DROP TRIGGER catalog_onboarding_operations_immutable ON saas.catalog_onboarding_operations;
DROP FUNCTION saas.guard_catalog_onboarding_operation_mutation();
DROP TRIGGER catalog_categories_tree_guard ON saas.catalog_categories;
DROP FUNCTION saas.guard_catalog_category_tree();
DROP TABLE saas.catalog_onboarding_operations;
DROP TABLE saas.catalog_product_channels;
DROP TABLE saas.catalog_variant_commerce_profiles;
DROP TABLE saas.catalog_product_categories;
DROP TABLE saas.catalog_categories;
DROP TABLE saas.catalog_product_profiles;

COMMIT;
