BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $rollback$
DECLARE saved record;
BEGIN
 IF pg_catalog.to_regclass('saas.merchant_checkout_price_233_backup') IS NULL THEN RETURN;END IF;
 -- Take locks before inspecting active promises or durable history.
 LOCK TABLE saas.merchant_checkout_quotes_233,saas.merchant_checkout_quote_operations_233,saas.merchant_checkout_price_context_233 IN ACCESS EXCLUSIVE MODE;
 IF EXISTS(SELECT 1 FROM saas.merchant_checkout_quote_operations_233)
  OR EXISTS(SELECT 1 FROM saas.merchant_checkout_quotes_233 WHERE expires_at>clock_timestamp())
  OR EXISTS(SELECT 1 FROM saas.merchant_checkout_price_context_233)
 THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_ROLLBACK_HAS_AUTHORITY_FORWARD_RECOVERY_REQUIRED';END IF;
 FOR saved IN SELECT * FROM saas.merchant_checkout_price_233_backup LOOP
  IF pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(saved.signature::regprocedure),'UTF8')),'hex') IS DISTINCT FROM saved.published_sha256
   OR pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.pg_get_functiondef(saved.engine_signature::regprocedure),'UTF8')),'hex') IS DISTINCT FROM saved.engine_sha256
  THEN RAISE EXCEPTION 'MERCHANT_CHECKOUT_233_SOURCE_DRIFT';END IF;
 END LOOP;
 FOR saved IN SELECT * FROM saas.merchant_checkout_price_233_backup WHERE original_definition<>'' LOOP EXECUTE saved.original_definition;END LOOP;
 DROP FUNCTION IF EXISTS saas.public_storefront_hosted_checkout_authority_v3(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text);
 FOR saved IN SELECT DISTINCT engine_signature FROM saas.merchant_checkout_price_233_backup LOOP EXECUTE 'DROP FUNCTION '||saved.engine_signature;END LOOP;
END $rollback$;
DROP FUNCTION IF EXISTS saas.merchant_checkout_quote_match_233(text,uuid,text,jsonb,jsonb,text[],timestamptz);
DROP FUNCTION IF EXISTS saas.merchant_checkout_quote_scope_233(uuid,text,jsonb,jsonb,timestamptz);
DROP FUNCTION IF EXISTS saas.merchant_checkout_quote_structural_digest_233(jsonb);
DROP FUNCTION IF EXISTS saas.merchant_checkout_price_enter_233(text),saas.merchant_checkout_price_leave_233();
DROP TABLE IF EXISTS saas.merchant_checkout_price_context_233,saas.merchant_checkout_quote_operations_233,saas.merchant_checkout_quotes_233;
DROP FUNCTION IF EXISTS saas.merchant_checkout_quote_immutable_233();
DROP TABLE IF EXISTS saas.merchant_checkout_price_233_backup;
COMMIT;
