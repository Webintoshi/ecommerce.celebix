BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_unified_theme_assertions$
DECLARE resolver_source text;
BEGIN
  SELECT procedure.prosrc INTO resolver_source FROM pg_catalog.pg_proc procedure WHERE procedure.oid='saas.public_starter_retail_presentation(uuid,timestamp with time zone,boolean)'::regprocedure;
  IF pg_catalog.to_regprocedure('saas.storefront_design_upgrade_v3(jsonb,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_theme_composition_references_valid(uuid,jsonb,boolean)') IS NULL
     OR EXISTS(SELECT 1 FROM saas.storefront_designs design WHERE design.schema_version<>3 OR design.draft_config->>'schemaVersion'<>'3' OR design.published_config->>'schemaVersion'<>'3' OR NOT design.draft_config?'composition' OR NOT design.published_config?'composition' OR NOT saas.storefront_design_document_valid(design.store_id,design.draft_config,true) OR NOT saas.storefront_design_document_valid(design.store_id,design.published_config,true))
     OR pg_catalog.strpos(resolver_source,'published_config->''composition''')=0
     OR pg_catalog.strpos(resolver_source,'campaign_starter_publications')>0
     OR pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_designs','SELECT')
     OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.storefront_designs','SELECT')
     OR pg_catalog.has_function_privilege('public','saas.storefront_theme_composition_references_valid(uuid,jsonb,boolean)','EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_theme_composition_references_valid(uuid,jsonb,boolean)','EXECUTE')
     OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.public_starter_retail_presentation(uuid,timestamp with time zone,boolean)','EXECUTE') THEN
    RAISE EXCEPTION 'storefront_unified_theme_contract_invalid';
  END IF;
END
$storefront_unified_theme_assertions$;

COMMIT;
