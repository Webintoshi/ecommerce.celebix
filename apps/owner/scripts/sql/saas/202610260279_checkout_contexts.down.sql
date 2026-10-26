BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.checkout-contexts.release279',0));
LOCK TABLE saas.storefront_hosted_checkout_sessions IN SHARE ROW EXCLUSIVE MODE;
DO $guard$DECLARE saved record;BEGIN
 IF current_setting('celebix.allow_checkout_context279_down',true)IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_DOWN_OPT_IN_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM saas.storefront_checkout_contexts279)
  OR EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions WHERE context_version=2)
 THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_USED_FORWARD_FIX_REQUIRED';END IF;
 FOR saved IN SELECT *FROM saas.checkout_context279_predecessors WHERE original_definition IS NOT NULL LOOP
  IF to_regprocedure(saved.signature)IS NULL OR encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(saved.signature)),'UTF8')),'hex')<>saved.published_sha256
  THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_DOWN_ROUTINE_DRIFT:%',saved.signature;END IF;
  EXECUTE saved.original_definition;
 END LOOP;
END $guard$;
DROP TRIGGER storefront_hosted_checkout_context279_assign ON saas.storefront_hosted_checkout_sessions;
DROP FUNCTION saas.storefront_checkout_context279_assign();
DROP FUNCTION saas.storefront_checkout_context279_for_attempt(uuid,uuid,timestamptz);
DROP FUNCTION saas.public_storefront_hosted_checkout_begin_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text);
DROP TRIGGER storefront_checkout_contexts279_immutable ON saas.storefront_checkout_contexts279;
DROP FUNCTION saas.storefront_checkout_context279_immutable();
DROP INDEX saas.storefront_hosted_checkout_context279_source_idx;
DROP INDEX saas.storefront_hosted_checkout_one_active_cart_idx;
DROP INDEX saas.storefront_hosted_checkout_one_active_intent_idx;
ALTER TABLE saas.storefront_hosted_checkout_sessions DROP COLUMN context_version;
CREATE UNIQUE INDEX storefront_hosted_checkout_one_active_cart_idx ON saas.storefront_hosted_checkout_sessions(store_id,cart_id)
 WHERE cart_id IS NOT NULL AND status IN('active','provider_ready','processing');
CREATE UNIQUE INDEX storefront_hosted_checkout_one_active_intent_idx ON saas.storefront_hosted_checkout_sessions(store_id,intent_id)
 WHERE intent_id IS NOT NULL AND status IN('active','provider_ready','processing');
DROP TABLE saas.storefront_checkout_contexts279,saas.checkout_context279_predecessors;
COMMIT;
