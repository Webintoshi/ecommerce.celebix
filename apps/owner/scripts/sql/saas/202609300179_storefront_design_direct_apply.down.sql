BEGIN;
SET LOCAL ROLE celebix_saas_owner;
LOCK TABLE saas.storefront_designs,saas.storefront_design_operations IN ACCESS EXCLUSIVE MODE;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.storefront_design_operations WHERE result_payload?'design')
 OR EXISTS(SELECT 1 FROM saas.storefront_designs WHERE published_config->>'schemaVersion'='5') THEN
  RAISE EXCEPTION 'DESIGN_DIRECT_APPLY_DOWN_HAS_LIVE_OPERATIONS';
 END IF;
END $guard$;
DO $restore$
DECLARE definition text;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('saas.storefront_design_save_draft_pre_direct_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb)'::regprocedure) INTO definition;
 EXECUTE pg_catalog.replace(definition,'saas.storefront_design_save_draft_pre_direct_apply(', 'saas.storefront_design_save_draft(');
 SELECT pg_catalog.pg_get_functiondef('saas.storefront_design_publish_pre_direct_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,bigint)'::regprocedure) INTO definition;
 EXECUTE pg_catalog.replace(definition,'saas.storefront_design_publish_pre_direct_apply(', 'saas.storefront_design_publish(');
END $restore$;
DROP FUNCTION saas.storefront_design_save_draft_pre_direct_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb),saas.storefront_design_publish_pre_direct_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,bigint),saas.storefront_design_editor_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.storefront_design_apply_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.storefront_design_apply(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb),saas.storefront_design_editor_payload(uuid);
ALTER TABLE saas.storefront_design_operations DROP CONSTRAINT storefront_design_operations_result_payload_check;
ALTER TABLE saas.storefront_design_operations ADD CONSTRAINT storefront_design_operations_result_payload_check
 CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=131072);
COMMIT;
