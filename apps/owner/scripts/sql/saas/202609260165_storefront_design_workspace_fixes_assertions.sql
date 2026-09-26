BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $verify$
BEGIN
 IF pg_catalog.to_regclass('saas.storefront_design_workspace_fixes_backup') IS NULL
 OR pg_catalog.to_regprocedure('saas.public_content_page_get(text,timestamptz,text)') IS NULL
 OR pg_catalog.to_regprocedure('saas.storefront_design_composition_valid(jsonb)') IS NULL
 OR pg_catalog.to_regprocedure('saas.storefront_design_category_asset(uuid,jsonb,uuid)') IS NULL THEN RAISE EXCEPTION 'DESIGN_WORKSPACE_FIXES_ARTIFACT_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM saas.storefront_designs WHERE NOT saas.storefront_design_document_valid(store_id,draft_config,true)
 OR NOT saas.storefront_design_document_valid(store_id,published_config,true)) THEN RAISE EXCEPTION 'DESIGN_WORKSPACE_FIXES_DOCUMENT_INVALID'; END IF;
 IF pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_design_workspace_fixes_backup','SELECT')
 OR pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_design_composition_valid(jsonb)','EXECUTE')
 OR pg_catalog.has_function_privilege('celebix_saas_app','saas.public_content_page_get(text,timestamptz,text)','EXECUTE')
 OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.public_content_page_get(text,timestamptz,text)','EXECUTE') THEN RAISE EXCEPTION 'DESIGN_WORKSPACE_FIXES_AUTHORITY_INVALID'; END IF;
END $verify$;
COMMIT;
