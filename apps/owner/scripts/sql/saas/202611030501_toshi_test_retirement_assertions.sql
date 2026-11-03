BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
DO $assert501$
DECLARE r record;p pg_proc%ROWTYPE;
BEGIN
 FOR r IN SELECT *FROM(VALUES
 ('saas.platform_checkout_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,jsonb,text)','b61e52784ddc7a399d13c81cb7bcc65eda15e1c125769b535889cb13e045d08e','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'),
 ('saas.platform_checkout_machine(text,jsonb)','832c3187132a72c20bf3559ad78f6a8dfcaef37df87aeb321f5dd0729dc1695b','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_platform_operator=X/celebix_saas_owner}'),
 ('saas.platform_checkout_public_test_create(timestamp with time zone,uuid,text,text,text)','e15e43c94597ea0f34318c44bb41905d5aea83824976aac67302f0409481bf51','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_platform_operator=X/celebix_saas_owner}'))expected(identity,hash,acl)LOOP
  SELECT *INTO p FROM pg_proc WHERE oid=to_regprocedure(r.identity);
  IF NOT FOUND OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl::text IS DISTINCT FROM r.acl OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>r.hash THEN RAISE EXCEPTION 'TOSHI_RETIRE501_ASSERTION_FAILED';END IF;
 END LOOP;
END $assert501$;
ROLLBACK;
