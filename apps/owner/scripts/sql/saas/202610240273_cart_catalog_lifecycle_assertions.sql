BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $verify$DECLARE r record;p record;role_name text;BEGIN
 IF(SELECT count(*)FROM saas.cart_catalog_lifecycle273_functions)<>4
 OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='saas.cart_catalog_lifecycle273_functions'::regclass
  AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
 THEN RAISE EXCEPTION 'CART_CATALOG273_SOURCE_INVALID';END IF;
 FOR r IN SELECT * FROM saas.cart_catalog_lifecycle273_functions LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF p.oid IS DISTINCT FROM r.function_oid OR p.proowner<>r.owner_oid
   OR p.proacl IS DISTINCT FROM r.acl OR p.proconfig IS DISTINCT FROM r.config
   OR p.prosecdef<>r.definer OR p.provolatile<>r.volatility
   OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256
   OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM r.predecessor_sha256
  THEN RAISE EXCEPTION 'CART_CATALOG273_FUNCTION_DRIFT:%',r.signature;END IF;
 END LOOP;
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
  IF has_table_privilege(role_name,'saas.cart_catalog_lifecycle273_functions','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')THEN
   RAISE EXCEPTION 'CART_CATALOG273_PRIVATE_SOURCE_EXPOSED:%',role_name;
  END IF;
 END LOOP;
 IF has_function_privilege('celebix_saas_host_resolver','saas.public_cart_mutate_without_available_stock_v090(text,timestamptz,jsonb,uuid,text,text,timestamptz,uuid,text,text,bigint,uuid,uuid,integer)','EXECUTE')
 OR NOT has_function_privilege('celebix_saas_app','saas.delete_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,text)','EXECUTE')
 THEN RAISE EXCEPTION 'CART_CATALOG273_EXECUTION_BOUNDARY_INVALID';END IF;
END $verify$;
ROLLBACK;
