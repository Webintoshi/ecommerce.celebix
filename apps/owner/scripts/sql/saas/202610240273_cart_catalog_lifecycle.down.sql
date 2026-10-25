BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.cart-catalog-lifecycle.release273',0));
DO $restore$DECLARE r record;p record;BEGIN
 IF current_setting('celebix.allow_native273_down',true)IS DISTINCT FROM 'on'THEN
  RAISE EXCEPTION 'CART_CATALOG273_ROLLBACK_CONFIRMATION_REQUIRED';
 END IF;
 IF(SELECT count(*)FROM saas.cart_catalog_lifecycle273_functions)<>4 THEN
  RAISE EXCEPTION 'CART_CATALOG273_BACKUP_INCOMPLETE';
 END IF;
 FOR r IN SELECT * FROM saas.cart_catalog_lifecycle273_functions LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF p.oid IS DISTINCT FROM r.function_oid OR p.proowner<>r.owner_oid
   OR p.proacl IS DISTINCT FROM r.acl OR p.proconfig IS DISTINCT FROM r.config
   OR p.prosecdef<>r.definer OR p.provolatile<>r.volatility
   OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')IS DISTINCT FROM r.published_sha256
   OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM r.predecessor_sha256
  THEN RAISE EXCEPTION 'CART_CATALOG273_PUBLISHED_DRIFT:%',r.signature;END IF;
 END LOOP;
 FOR r IN SELECT * FROM saas.cart_catalog_lifecycle273_functions LOOP EXECUTE r.definition;END LOOP;
END $restore$;
DROP TABLE saas.cart_catalog_lifecycle273_functions;
COMMIT;
