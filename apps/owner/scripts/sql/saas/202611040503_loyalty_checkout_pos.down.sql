BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog,saas;
SET LOCAL check_function_bodies=off;
DROP TRIGGER IF EXISTS loyalty_checkout_hosted_binding ON saas.storefront_hosted_checkout_operations;
DROP TRIGGER IF EXISTS loyalty_checkout_immutable ON saas.loyalty_checkout_authorizations;
DROP TRIGGER IF EXISTS loyalty_checkout_order_binding ON saas.storefront_checkout_operations;
DROP TRIGGER IF EXISTS loyalty_pos_order_binding ON saas.in_store_sales;
DO $rollback$DECLARE r record;BEGIN
 IF EXISTS(SELECT 1 FROM saas.loyalty_pos_redemptions)OR EXISTS(SELECT 1 FROM saas.loyalty_checkout_authorizations)OR EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE can_manage_loyalty)THEN RAISE EXCEPTION 'LOYALTY503_ROLLBACK_HAS_LIVE_RIGHTS';END IF;
 FOR r IN SELECT * FROM saas.loyalty503_functions LOOP
  IF encode(sha256(convert_to(pg_get_functiondef(r.identity::regprocedure),'UTF8')),'hex')<>r.patched_hash THEN RAISE EXCEPTION 'LOYALTY503_ROLLBACK_DRIFT:%',r.identity;END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.loyalty503_functions LOOP EXECUTE r.definition;END LOOP;
 FOR r IN SELECT p.oid::regprocedure::text signature FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND(p.proname LIKE 'loyalty_pos_%'OR p.proname LIKE 'loyalty_checkout_%'OR p.proname='public_storefront_checkout_prepare_quote_v5'OR p.proname IN('loyalty503_patch','in_store_staff_projection_v9','in_store_sales_list_staff_v9','in_store_sales_set_staff_v9','in_store_sales_recover_staff_v9'))AND NOT EXISTS(SELECT 1 FROM saas.loyalty503_functions b WHERE b.identity='saas.'||p.oid::regprocedure::text)LOOP EXECUTE 'DROP FUNCTION '||r.signature;END LOOP;
END $rollback$;
DROP TABLE saas.loyalty_pos_redemptions;
DROP TABLE saas.loyalty_checkout_authorizations;
ALTER TABLE saas.in_store_staff_grants DROP COLUMN can_manage_loyalty;
DROP TABLE saas.loyalty503_functions;
COMMIT;
