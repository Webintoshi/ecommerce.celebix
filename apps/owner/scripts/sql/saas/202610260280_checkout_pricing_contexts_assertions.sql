BEGIN READ ONLY;
DO $assertions$DECLARE predecessor record;routine record;role_name text;relation text;expected record;BEGIN
 FOR predecessor IN SELECT *FROM saas.checkout_pricing_context280_predecessors LOOP
  SELECT p.*,pg_get_userbyid(p.proowner)owner_name,encode(sha256(convert_to(pg_get_functiondef(to_regprocedure(predecessor.signature)),'UTF8')),'hex')definition_sha256
  INTO routine FROM pg_proc p WHERE p.oid=to_regprocedure(predecessor.signature);
  IF NOT FOUND OR routine.definition_sha256<>predecessor.definition_sha256 OR routine.owner_name<>predecessor.owner_name
   OR routine.proacl::text IS DISTINCT FROM predecessor.acl OR routine.proconfig IS DISTINCT FROM predecessor.config
   OR routine.prosecdef<>predecessor.security_definer OR routine.provolatile<>predecessor.volatility
  THEN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_PREDECESSOR_DRIFT:%',predecessor.signature;END IF;
 END LOOP;
 IF(SELECT count(*)FROM pg_proc WHERE pronamespace='saas'::regnamespace)<>(SELECT count(*)+9 FROM saas.checkout_pricing_context280_predecessors)
 THEN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_ROUTINE_COUNT_INVALID';END IF;
 FOREACH relation IN ARRAY ARRAY['storefront_checkout_pricing_contexts280','checkout_pricing_context280_predecessors']LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('saas.'||relation)AND c.relowner='celebix_saas_owner'::regrole
   AND c.relrowsecurity AND c.relforcerowsecurity AND NOT EXISTS(SELECT 1 FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a WHERE a.grantee<>c.relowner))
   OR EXISTS(SELECT 1 FROM pg_policy WHERE polrelid=to_regclass('saas.'||relation))
  THEN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_PRIVATE_TABLE_INVALID:%',relation;END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.storefront_checkout_pricing_contexts280'::regclass
  AND tgname='storefront_checkout_pricing_contexts280_immutable'AND tgenabled='O'AND NOT tgisinternal
  AND tgfoid=to_regprocedure('saas.storefront_checkout_pricing_context280_immutable()'))
 THEN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_IMMUTABILITY_INVALID';END IF;
 FOR expected IN SELECT *FROM(VALUES
  ('saas.storefront_checkout_pricing_context280_immutable()',false,false,'v'),
  ('saas.storefront_checkout_pricing_fingerprint280(jsonb)',false,false,'i'),
  ('saas.storefront_checkout_pricing_source280(text,timestamptz,text,jsonb)',false,true,'s'),
  ('saas.storefront_checkout_pricing_candidate280(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,text)',false,true,'s'),
  ('saas.public_storefront_checkout_prepare_quote_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb)',true,true,'v'),
  ('saas.public_storefront_hosted_checkout_authority_v4(text,timestamptz,text,jsonb,bigint,jsonb,uuid,jsonb,jsonb,uuid,uuid,uuid,text)',true,true,'v'),
  ('saas.public_storefront_hosted_checkout_begin_v5(text,timestamptz,text,jsonb,bigint,jsonb,uuid,text,uuid,text,uuid,text,uuid,uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text,jsonb,jsonb,text,text)',true,true,'v'),
  ('saas.public_checkout_complete_v4(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text)',true,true,'v'),
  ('saas.public_checkout_recover_v4(text,timestamptz,text,jsonb,jsonb,uuid,text,bigint,jsonb,text,uuid,uuid,uuid,uuid,uuid,text,text,timestamptz,uuid,text,text,timestamptz,text[],text)',true,true,'s')
 )proof(signature,public_entrypoint,security_definer,volatility)LOOP
  SELECT *INTO routine FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  IF NOT FOUND OR routine.proowner<>'celebix_saas_owner'::regrole OR routine.prosecdef<>expected.security_definer
   OR routine.provolatile<>expected.volatility OR routine.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
   OR EXISTS(SELECT 1 FROM aclexplode(coalesce(routine.proacl,acldefault('f',routine.proowner)))a WHERE a.grantee=0)
  THEN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_ROUTINE_METADATA_INVALID:%',expected.signature;END IF;
  FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%'AND rolname<>'celebix_saas_owner'LOOP
   IF has_function_privilege(role_name,expected.signature,'EXECUTE')<>(expected.public_entrypoint AND role_name='celebix_saas_host_resolver')
   THEN RAISE EXCEPTION 'CHECKOUT_PRICING_CONTEXT280_ROUTINE_PRIVACY_INVALID:%:%',role_name,expected.signature;END IF;
  END LOOP;
 END LOOP;
END $assertions$;
COMMIT;
