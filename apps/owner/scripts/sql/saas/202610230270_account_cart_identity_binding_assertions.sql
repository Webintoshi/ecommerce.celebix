BEGIN;
DO $assertions$
DECLARE role_name text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=to_regprocedure('saas.public_account_cart_bind(text,timestamptz,jsonb,jsonb)')
  AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='9fedf443fa521c575279a7987f5eeb7595c468554c244f4415392f1b210d41f8'
  AND p.proowner='celebix_saas_owner'::regrole AND p.prosecdef AND p.provolatile='v'
  AND NOT p.proisstrict AND p.proparallel='u'
  AND p.proconfig=ARRAY['search_path=pg_catalog, saas']::text[]
  AND p.proacl::text='{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_host_resolver=X/celebix_saas_owner}')
 THEN RAISE EXCEPTION 'ACCOUNT_CART270_FUNCTION_AUTHORITY'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
  WHERE i.indexrelid=to_regclass('saas.account_cart270_single_account_idx')
   AND i.indrelid='saas.storefront_account_cart_links'::regclass
   AND i.indisunique AND i.indisvalid AND i.indisready AND NOT i.indisprimary
   AND i.indpred IS NULL AND i.indexprs IS NULL AND c.relowner='celebix_saas_owner'::regrole
   AND encode(sha256(convert_to(pg_get_indexdef(i.indexrelid),'UTF8')),'hex')='146ced5c02aae8e69b2a5641bed76b5458cfbee03b284db505753a666a16d94b')
 THEN RAISE EXCEPTION 'ACCOUNT_CART270_INDEX_AUTHORITY'; END IF;
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP
  IF has_function_privilege(role_name,'saas.public_account_cart_bind(text,timestamptz,jsonb,jsonb)','EXECUTE') IS DISTINCT FROM (role_name='celebix_saas_host_resolver')
   OR has_table_privilege(role_name,'saas.storefront_account_cart_links','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'ACCOUNT_CART270_ROLE_BOUNDARY:%',role_name; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='saas.storefront_account_cart_links'::regclass
  AND c.relowner='celebix_saas_owner'::regrole AND c.relrowsecurity AND c.relforcerowsecurity)
 THEN RAISE EXCEPTION 'ACCOUNT_CART270_LINK_TABLE_BOUNDARY'; END IF;
END $assertions$;
ROLLBACK;
