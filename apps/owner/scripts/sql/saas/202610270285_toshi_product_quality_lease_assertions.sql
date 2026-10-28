DO $assert285$
DECLARE p pg_proc%ROWTYPE;
BEGIN
 SELECT * INTO p FROM pg_proc WHERE oid=to_regprocedure('saas.content_authoring_claim(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,bigint)');
 IF NOT FOUND OR  p.proowner <> 'celebix_saas_owner'::regrole OR NOT p.prosecdef
  OR p.provolatile <> 'v' OR p.prokind <> 'f' OR NOT p.proretset
  OR p.prorettype <> 'record'::regtype OR p.proisstrict OR p.proparallel <> 'u'
  OR p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
  OR pg_get_function_result(p.oid) <> 'TABLE(outcome text, result_payload jsonb)'
  OR p.proacl::text IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'
  OR p.prolang IS DISTINCT FROM (SELECT oid FROM pg_language WHERE lanname='plpgsql')
  OR encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') <> 'eeb53d46eda5bb5a15b59da6c67afbb9ee43ece06c4554936e7cd686311932c8' THEN
  RAISE EXCEPTION 'TOSHI_QUALITY_LEASE285_INSTALLED_STATE_INVALID';
 END IF;
 IF has_function_privilege('celebix_saas_app',p.oid,'EXECUTE') IS DISTINCT FROM true
  OR EXISTS(SELECT 1 FROM aclexplode(p.proacl) WHERE grantee=0) THEN
  RAISE EXCEPTION 'TOSHI_QUALITY_LEASE285_APP_ONLY_ACL_INVALID';
 END IF;
END $assert285$;
