BEGIN;
DO $assertions$
BEGIN
 IF pg_catalog.to_regprocedure('saas.storefront_design_editor_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz)') IS NULL
 OR NOT pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_design_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb)','EXECUTE')
 OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.storefront_design_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb)','EXECUTE')
 OR pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_design_editor_payload(uuid)','EXECUTE')
 OR pg_catalog.has_table_privilege('celebix_saas_app','saas.storefront_designs','UPDATE') THEN
  RAISE EXCEPTION 'DESIGN_DIRECT_APPLY_ASSERTIONS_FAILED';
 END IF;
END $assertions$;
ROLLBACK;
