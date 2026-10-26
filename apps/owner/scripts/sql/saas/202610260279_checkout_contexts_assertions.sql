BEGIN READ ONLY;
DO $assertions$DECLARE predecessor record;routine record;role_name text;relation text;BEGIN
 FOR predecessor IN SELECT *FROM saas.checkout_context279_predecessors LOOP
  SELECT p.*,pg_get_userbyid(p.proowner)owner_name,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')definition_sha256
  INTO routine FROM pg_proc p WHERE p.oid=to_regprocedure(predecessor.signature);
  IF NOT FOUND OR routine.definition_sha256<>predecessor.published_sha256 OR routine.owner_name<>predecessor.owner_name
   OR routine.proacl::text IS DISTINCT FROM predecessor.acl OR routine.proconfig IS DISTINCT FROM predecessor.config
   OR routine.prosecdef<>predecessor.security_definer OR routine.provolatile<>predecessor.volatility
  THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_PREDECESSOR_DRIFT:%',predecessor.signature;END IF;
 END LOOP;
 IF(SELECT count(*)FROM saas.checkout_context279_predecessors WHERE original_definition IS NOT NULL)<>2
  OR EXISTS(SELECT 1 FROM saas.checkout_context279_predecessors WHERE original_definition IS NULL AND definition_sha256<>published_sha256)
 THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_PATCH_BOUNDARY_INVALID';END IF;
 IF(SELECT count(*)FROM pg_index WHERE indexrelid IN('saas.storefront_hosted_checkout_one_active_cart_idx'::regclass,
  'saas.storefront_hosted_checkout_one_active_intent_idx'::regclass)AND indisunique
  AND pg_get_expr(indpred,indrelid)LIKE '%context_version = 1%')<>2
  OR NOT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='saas.storefront_hosted_checkout_sessions'::regclass
   AND attname='context_version'AND attnotnull AND atttypid='integer'::regtype)
 THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_LEGACY_UNIQUENESS_INVALID';END IF;
 FOREACH relation IN ARRAY ARRAY['storefront_checkout_contexts279','checkout_context279_predecessors']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('saas.'||relation)AND c.relowner='celebix_saas_owner'::regrole
   AND c.relrowsecurity AND c.relforcerowsecurity AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>c.relowner))
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('saas.'||relation))
  THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_PRIVATE_TABLE_INVALID:%',relation;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.storefront_hosted_checkout_sessions'::regclass
  AND tgname='storefront_hosted_checkout_context279_assign'AND tgenabled='O'AND NOT tgisinternal
  AND tgfoid=to_regprocedure('saas.storefront_checkout_context279_assign()'))
 THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_ASSIGN_TRIGGER_INVALID';END IF;
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
  IF has_function_privilege(role_name,'saas.public_storefront_hosted_checkout_begin_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)','EXECUTE')<>(role_name='celebix_saas_host_resolver')
   OR has_function_privilege(role_name,'saas.storefront_checkout_context279_for_attempt(uuid,uuid,timestamptz)','EXECUTE')<>(role_name='celebix_saas_host_resolver')
   OR has_function_privilege(role_name,'saas.storefront_checkout_context279_assign()','EXECUTE')
   OR has_function_privilege(role_name,'saas.storefront_checkout_context279_immutable()','EXECUTE')
  THEN RAISE EXCEPTION 'CHECKOUT_CONTEXT279_ROUTINE_PRIVACY_INVALID:%',role_name;END IF;
 END LOOP;
END $assertions$;
COMMIT;
