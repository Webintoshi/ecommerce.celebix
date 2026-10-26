-- Forward fixes are required after any operation has adopted private pricing.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.checkout-pricing-contexts.release280',0));
LOCK TABLE saas.storefront_checkout_pricing_contexts280 IN ACCESS EXCLUSIVE MODE;
DO $guard$BEGIN
 IF current_setting('celebix.allow_checkout_pricing_context280_down',true)IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_DOWN_OPT_IN_REQUIRED';END IF;
 IF EXISTS(SELECT 1 FROM saas.storefront_checkout_pricing_contexts280)
  OR EXISTS(SELECT 1 FROM saas.storefront_customer_credentials WHERE key_id='checkout_ctx280')
 THEN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_ALREADY_USED';END IF;
END $guard$;
DROP TABLE saas.storefront_checkout_pricing_contexts280;
DROP FUNCTION saas.public_checkout_recover_v4(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text);
DROP FUNCTION saas.public_checkout_complete_v4(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text);
DROP FUNCTION saas.public_storefront_hosted_checkout_begin_v5(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text);
DROP FUNCTION saas.public_storefront_hosted_checkout_authority_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text);
DROP FUNCTION saas.public_storefront_checkout_prepare_quote_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb);
DROP FUNCTION saas.storefront_checkout_pricing_candidate280(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,text);
DROP FUNCTION saas.storefront_checkout_pricing_source280(text,timestamptz,text,jsonb);
DROP FUNCTION saas.storefront_checkout_pricing_fingerprint280(jsonb);
DROP FUNCTION saas.storefront_checkout_pricing_context280_immutable();
DROP TABLE saas.checkout_pricing_context280_predecessors;
COMMIT;
