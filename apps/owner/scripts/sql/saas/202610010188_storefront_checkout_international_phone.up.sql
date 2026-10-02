-- Accept canonical international contact phones without changing delivery fields or authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $migration$
DECLARE
 signature regprocedure := 'saas.storefront_delivery_valid(jsonb)'::regprocedure;
 original text;
 changed text;
 original_metadata jsonb;
 old_phone text := $phone$AND (p_delivery->'contact'->>'phone')~'^\+90[1-9][0-9]{9}$'$phone$;
 new_phone text := $phone$AND pg_catalog.char_length(p_delivery->'contact'->>'phone') BETWEEN 9 AND 16
    AND (p_delivery->'contact'->>'phone')~'^\+[1-9][0-9]{7,14}$'$phone$;
BEGIN
 SELECT pg_catalog.pg_get_functiondef(p.oid),pg_catalog.to_jsonb(p)-'prosrc'
 INTO original,original_metadata FROM pg_catalog.pg_proc p WHERE p.oid=signature;
 IF original IS NULL
 OR (pg_catalog.length(original)-pg_catalog.length(pg_catalog.replace(original,old_phone,'')))/pg_catalog.length(old_phone)<>1
 OR pg_catalog.strpos(original,new_phone)>0 THEN
  RAISE EXCEPTION 'STOREFRONT_CHECKOUT_PHONE_PREDECESSOR_INVALID';
 END IF;
 changed:=pg_catalog.replace(original,old_phone,new_phone);
 EXECUTE changed;
 IF (SELECT pg_catalog.to_jsonb(p)-'prosrc' FROM pg_catalog.pg_proc p WHERE p.oid=signature) IS DISTINCT FROM original_metadata
 OR pg_catalog.pg_get_functiondef(signature) IS DISTINCT FROM changed THEN
  RAISE EXCEPTION 'STOREFRONT_CHECKOUT_PHONE_AUTHORITY_OR_UNRELATED_BODY_CHANGED';
 END IF;
END
$migration$;
COMMIT;
