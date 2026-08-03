-- Catalog assertions for Phase 4C checkout readiness authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $f$
DECLARE cart_body text; intent_body text; quote_body text;
BEGIN
  SELECT pg_catalog.pg_get_functiondef('saas.storefront_cart_projection(uuid,uuid,timestamp with time zone)'::regprocedure),
    pg_catalog.pg_get_functiondef('saas.storefront_intent_projection(uuid,uuid,timestamp with time zone)'::regprocedure),
    pg_catalog.pg_get_functiondef('saas.public_checkout_quote(text,timestamp with time zone,text,jsonb)'::regprocedure)
    INTO cart_body,intent_body,quote_body;
  IF pg_catalog.strpos(cart_body,'''checkoutBlocker''')=0
    OR pg_catalog.strpos(cart_body,'''empty_cart''')=0
    OR pg_catalog.strpos(cart_body,'''stock_unavailable''')=0
    OR pg_catalog.strpos(cart_body,'''shipping_unavailable''')=0
    OR pg_catalog.strpos(cart_body,'''payment_unavailable''')=0
    OR pg_catalog.strpos(intent_body,'''checkoutBlocker''')=0
    OR pg_catalog.strpos(intent_body,'''stock_unavailable''')=0
    OR pg_catalog.strpos(intent_body,'''shipping_unavailable''')=0
    OR pg_catalog.strpos(intent_body,'''payment_unavailable''')=0
    OR pg_catalog.strpos(quote_body,'jsonb_build_object')=0
    OR pg_catalog.strpos(quote_body,'jsonb_strip_nulls')>0
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_READINESS_BODY_INVALID'; END IF;
  IF pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_cart_projection(uuid,uuid,timestamp with time zone)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.storefront_cart_projection(uuid,uuid,timestamp with time zone)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_intent_projection(uuid,uuid,timestamp with time zone)','EXECUTE')
    OR pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.storefront_intent_projection(uuid,uuid,timestamp with time zone)','EXECUTE')
  THEN RAISE EXCEPTION 'STOREFRONT_CHECKOUT_READINESS_HELPER_ACL_INVALID'; END IF;
END
$f$;

ROLLBACK;
