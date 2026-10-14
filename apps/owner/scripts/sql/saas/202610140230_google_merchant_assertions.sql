-- Short migration acceptance gates; no catalog/account or external Google changes.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $acceptance$ BEGIN
 IF NOT saas.google_merchant_gtin_valid('4006381333931') OR saas.google_merchant_gtin_valid('4006381333932') OR saas.google_merchant_gtin_valid('9800000000004') THEN RAISE EXCEPTION 'MERCHANT230_GTIN_GATE';END IF;
 IF saas.google_merchant_attributes_valid('{"gtin":"4006381333931","identifierExists":false}'::jsonb) OR saas.google_merchant_attributes_valid('{"credential":"private"}'::jsonb) OR NOT saas.google_merchant_attributes_valid('{"identifierExists":false,"color":"Mavi","size":"M"}'::jsonb) THEN RAISE EXCEPTION 'MERCHANT230_PREFERENCE_GATE';END IF;
 IF NOT saas.google_marketing_selection_valid('{"accountId":"123","resourceId":"456","resourceName":"Merchant"}'::jsonb,'merchant','example.com') OR saas.google_marketing_selection_valid('{"accountId":"other","resourceId":"456","resourceName":"Merchant"}'::jsonb,'merchant','example.com') THEN RAISE EXCEPTION 'MERCHANT230_SELECTION_GATE';END IF;
 IF NOT saas.google_marketing_selection_valid('{"accountId":"site","resourceId":"https://example.com/","resourceName":"Example"}'::jsonb,'search_console','example.com') THEN RAISE EXCEPTION 'MERCHANT230_LEGACY_SELECTION_GATE';END IF;
 IF position('merchantDomain' IN pg_get_functiondef('saas.google_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)'::regprocedure))=0 THEN RAISE EXCEPTION 'MERCHANT230_CHECKPOINT_GATE';END IF;
 IF has_function_privilege('celebix_saas_app','saas.google_merchant_read(uuid,uuid,bigint,bigint,uuid,timestamptz)','EXECUTE') OR NOT has_function_privilege('celebix_saas_workflow','saas.google_merchant_read(uuid,uuid,bigint,bigint,uuid,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'MERCHANT230_WORKER_AUTHORITY_GATE';END IF;
END $acceptance$;
ROLLBACK;
