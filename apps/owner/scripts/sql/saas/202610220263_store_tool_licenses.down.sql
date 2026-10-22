BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $f$DECLARE r record;BEGIN
 IF current_setting('celebix.allow_store_tools263_rollback',true)IS DISTINCT FROM 'on'OR to_regclass('saas.store_tool_public264_functions')IS NOT NULL OR EXISTS(SELECT 1 FROM saas.store_tool_purchases)THEN RAISE EXCEPTION 'STORE_TOOL263_ROLLBACK_REQUIRES_REVIEW';END IF;
 FOR r IN SELECT * FROM saas.store_tools263_functions LOOP IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=r.function_oid AND proowner=r.function_owner AND proacl IS NOT DISTINCT FROM r.function_acl AND proconfig IS NOT DISTINCT FROM r.function_config AND encode(sha256(convert_to(pg_get_functiondef(oid),'UTF8')),'hex')=r.published_sha256)THEN RAISE EXCEPTION 'STORE_TOOL263_ROLLBACK_DRIFT';END IF;EXECUTE r.definition;END LOOP;
END $f$;
DROP FUNCTION saas.store_tool_workspace_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.store_tool_purchase_request(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text),saas.platform_tool_purchases_read(uuid,jsonb),saas.platform_tool_purchase_settle(uuid,uuid,bigint,text,jsonb),saas.store_tool_is_licensed(uuid,text,timestamptz),saas.store_tool_offer_projection(text),saas.store_tool_purchase_projection(uuid,uuid);
DROP TABLE saas.store_tool_licenses,saas.store_tool_receipts,saas.store_tool_purchases,saas.store_tool_offers,saas.store_tools263_functions;
DROP FUNCTION saas.store_tool_purchase_guard();
COMMIT;
