BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
DO $assert289$DECLARE r record;p pg_proc%ROWTYPE;t text;BEGIN
 IF(SELECT count(*)FROM saas.platform_checkout_public289_predecessors)<>3 THEN RAISE EXCEPTION 'PUBLIC_TEST289_PREDECESSOR_SCOPE';END IF;
 FOR r IN SELECT *FROM saas.platform_checkout_public289_predecessors LOOP
  SELECT *INTO p FROM pg_proc WHERE oid=to_regprocedure(r.signature);
  IF NOT FOUND OR p.oid<>r.function_oid OR pg_get_userbyid(p.proowner)<>r.owner_name OR p.proacl::text IS DISTINCT FROM r.acl OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>r.new_hash THEN RAISE EXCEPTION 'PUBLIC_TEST289_LEGACY_IDENTITY_DRIFT';END IF;
 END LOOP;
 FOR r IN SELECT *FROM(VALUES
 ('saas.platform_checkout_public_test_create(timestamp with time zone,uuid,text,text,text)','f4273c228083bd70d2ef911bd6d7d46abb77c0ff7653282d6444a135bee11c64','{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_platform_operator=X/celebix_saas_owner}'),
 ('saas.platform_checkout_public_intent_guard289()','b49f83dfac00dde111a4acb2ce3c2e009d4e6c2e85cc0c269e2028600219af2e','{celebix_saas_owner=X/celebix_saas_owner}')
 )v(identity,hash,acl)LOOP
  SELECT *INTO p FROM pg_proc WHERE oid=to_regprocedure(r.identity);
  IF NOT FOUND OR p.proowner<>'celebix_saas_owner'::regrole OR p.proacl::text IS DISTINCT FROM r.acl OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')<>r.hash THEN RAISE EXCEPTION 'PUBLIC_TEST289_NEW_ROUTINE_DRIFT';END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.platform_checkout_orders'::regclass AND attname='public_test_purchase'AND attnotnull AND NOT attisdropped)
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.platform_checkout_orders'::regclass AND attname IN('principal_id','membership_id')AND attnotnull)
  OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.platform_checkout_intents'::regclass AND attname='principal_id'AND attnotnull)
  OR NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='saas.platform_checkout_orders'::regclass AND conname='platform_checkout_public_actor289'AND convalidated AND encode(sha256(convert_to(pg_get_constraintdef(oid),'UTF8')),'hex')='e7ce752831b57913ba76b9b770bcbafc64996513b0b8f261877a2387c5c443a8')
  OR NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.platform_checkout_intents'::regclass AND tgname='platform_checkout_public_intent_guard289'AND tgenabled='O'AND tgfoid='saas.platform_checkout_public_intent_guard289()'::regprocedure)
 THEN RAISE EXCEPTION 'PUBLIC_TEST289_ACTOR_BOUNDARY_DRIFT';END IF;
 FOREACH t IN ARRAY ARRAY['platform_checkout_public289_predecessors','platform_checkout_public_test_limits289']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('saas.'||t)AND relowner='celebix_saas_owner'::regrole AND relrowsecurity AND relforcerowsecurity)
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('saas.'||t)AND polroles<>ARRAY['celebix_saas_owner'::regrole::oid])THEN RAISE EXCEPTION 'PUBLIC_TEST289_RELATION_PRIVACY_DRIFT';END IF;
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_table_privilege(r.rolname,'saas.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')THEN RAISE EXCEPTION 'PUBLIC_TEST289_PRIVATE_TABLE_GRANT';END IF;
  END LOOP;
 END LOOP;
END $assert289$;
COMMIT;
