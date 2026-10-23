BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.account-cart.release270',0));
DO $safe$
BEGIN
 IF current_setting('celebix.allow_account_cart270_down',true) IS DISTINCT FROM 'on'
 THEN RAISE EXCEPTION 'ACCOUNT_CART270_DOWN_OPT_IN_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM saas.storefront_account_cart_links)
 THEN RAISE EXCEPTION 'ACCOUNT_CART270_USED_AUTHORITY_FORWARD_FIX_REQUIRED'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('saas.public_account_cart_bind(text,timestamptz,jsonb,jsonb)')
  AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='9fedf443fa521c575279a7987f5eeb7595c468554c244f4415392f1b210d41f8'
  AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef
  AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  AND p.proacl::text='{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}')
 THEN RAISE EXCEPTION 'ACCOUNT_CART270_DOWN_SOURCE_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
  WHERE i.indexrelid=to_regclass('saas.account_cart270_single_account_idx')
   AND i.indrelid='saas.storefront_account_cart_links'::regclass
   AND i.indisunique AND i.indisvalid AND i.indisready AND NOT i.indisprimary
   AND i.indpred IS NULL AND i.indexprs IS NULL AND c.relowner='celebix_saas_owner'::regrole
   AND encode(sha256(convert_to(pg_get_indexdef(i.indexrelid),'UTF8')),'hex')='146ced5c02aae8e69b2a5641bed76b5458cfbee03b284db505753a666a16d94b')
 THEN RAISE EXCEPTION 'ACCOUNT_CART270_INDEX_AUTHORITY'; END IF;
END $safe$;
DROP FUNCTION saas.public_account_cart_bind(text,timestamptz,jsonb,jsonb);
DROP INDEX saas.account_cart270_single_account_idx;
COMMIT;
