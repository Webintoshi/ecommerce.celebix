BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_hero_slider_assertions$
DECLARE invalid boolean;
BEGIN
  SELECT
    pg_catalog.to_regprocedure('saas.storefront_design_publishable(uuid,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_design_upgrade_v2(jsonb,boolean)') IS NULL
    OR EXISTS(
      SELECT 1 FROM saas.storefront_designs design
      WHERE design.schema_version<>2
         OR design.draft_config->>'schemaVersion'<>'2'
         OR design.published_config->>'schemaVersion'<>'2'
         OR NOT saas.storefront_design_document_valid(design.store_id,design.draft_config,true)
         OR NOT saas.storefront_design_document_valid(design.store_id,design.published_config,true)
         OR pg_catalog.jsonb_array_length(design.draft_config->'hero'->'slides') NOT BETWEEN 1 AND 3
         OR pg_catalog.jsonb_array_length(design.published_config->'hero'->'slides') NOT BETWEEN 1 AND 3
    )
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_designs','SELECT')
    OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.storefront_designs','SELECT')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,bigint)','EXECUTE')
    OR pg_catalog.has_function_privilege('public','saas.storefront_design_publishable(uuid,jsonb)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_design_publishable(uuid,jsonb)','EXECUTE')
  INTO invalid;
  IF invalid THEN RAISE EXCEPTION 'storefront_hero_slider_contract_invalid'; END IF;
END
$storefront_hero_slider_assertions$;

COMMIT;
