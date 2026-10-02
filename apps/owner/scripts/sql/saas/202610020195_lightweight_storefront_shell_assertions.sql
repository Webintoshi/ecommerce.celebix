BEGIN READ ONLY;
DO $fn$
DECLARE definition text; domain record; result record; expected jsonb; checked integer:=0;
BEGIN
 SELECT pg_catalog.pg_get_functiondef('saas.resolve_public_storefront(text,timestamptz)'::regprocedure) INTO definition;
 IF pg_catalog.strpos(definition,'public_starter_retail_home')>0 OR pg_catalog.strpos(definition,'public_starter_retail_presentation')=0 THEN RAISE EXCEPTION 'LIGHTWEIGHT_SHELL_STILL_HYDRATES_HOME'; END IF;
 FOR domain IN SELECT d.* FROM saas.store_domains d JOIN saas.stores s ON s.id=d.store_id AND s.status='active' WHERE d.status='active' AND d.verified_at<=now() AND d.is_primary LIMIT 10 LOOP
  SELECT * INTO result FROM saas.resolve_public_storefront(domain.hostname,now());
  expected:=saas.public_starter_retail_presentation(domain.store_id,now(),domain.hostname_type='custom_domain' AND domain.is_primary);
  IF expected IS NOT NULL AND (result.outcome IS DISTINCT FROM 'found' OR result.result_payload->'presentation' IS DISTINCT FROM expected OR result.result_payload->>'id' IS DISTINCT FROM domain.store_id::text OR result.result_payload->>'canonicalUrl' IS DISTINCT FROM 'https://'||domain.hostname||'/') THEN RAISE EXCEPTION 'LIGHTWEIGHT_SHELL_AUTHORITY_OR_PRESENTATION_CHANGED'; END IF;
  checked:=checked+1;
 END LOOP;
 IF EXISTS (SELECT 1 FROM saas.resolve_public_storefront('unregistered.invalid',now()) WHERE outcome='found') THEN RAISE EXCEPTION 'LIGHTWEIGHT_SHELL_UNKNOWN_HOST_FOUND'; END IF;
 IF NOT pg_catalog.has_function_privilege('celebix_saas_host_resolver','saas.resolve_public_storefront(text,timestamptz)','EXECUTE') THEN RAISE EXCEPTION 'LIGHTWEIGHT_SHELL_RESOLVER_ACCESS_MISSING'; END IF;
 RAISE NOTICE 'LIGHTWEIGHT_SHELL_ASSERTIONS_PASS domains=%',checked;
END $fn$;
ROLLBACK;
