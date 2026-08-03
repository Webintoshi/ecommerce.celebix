BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_design_assertions$
DECLARE invalid boolean;
BEGIN
  SELECT
    pg_catalog.to_regclass('saas.storefront_designs') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_design_media') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_design_operations') IS NULL
    OR pg_catalog.to_regclass('saas.storefront_design_events') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_design_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_design_save_draft(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,bigint)') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_design_media_reserve(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,integer,integer,bigint,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.storefront_design_get_public(uuid,text,timestamp with time zone)') IS NULL
    OR EXISTS(SELECT 1 FROM saas.stores store LEFT JOIN saas.storefront_designs design ON design.store_id=store.id WHERE design.store_id IS NULL)
    OR EXISTS(SELECT 1 FROM saas.storefront_designs design WHERE design.draft_version<1 OR design.published_version<1 OR NOT saas.storefront_design_document_valid(design.store_id,design.draft_config,true) OR NOT saas.storefront_design_document_valid(design.store_id,design.published_config,true))
    OR pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_designs','SELECT')
    OR pg_catalog.has_table_privilege('celebix_saas_host_resolver','saas.storefront_designs','SELECT')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_design_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.storefront_design_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz)','EXECUTE')
    OR NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.storefront_design_get_public(uuid,text,timestamptz)','EXECUTE')
    OR pg_catalog.has_function_privilege('public','saas.storefront_design_get_public(uuid,text,timestamptz)','EXECUTE')
  INTO invalid;
  IF invalid THEN RAISE EXCEPTION 'storefront_design_workspace_contract_invalid'; END IF;
END
$storefront_design_assertions$;

COMMIT;
