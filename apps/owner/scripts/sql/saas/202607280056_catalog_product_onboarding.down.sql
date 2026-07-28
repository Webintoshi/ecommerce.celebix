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
ALTER TABLE saas.product_variants DROP CONSTRAINT product_variants_store_product_id_key;

COMMIT;
