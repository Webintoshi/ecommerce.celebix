DO $assertions$
DECLARE fn regprocedure; is_public boolean;
BEGIN
 FOREACH fn IN ARRAY ARRAY[
   'saas.pricing_reference_set_projection(uuid,uuid)'::regprocedure,
   'saas.pricing_reference_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,integer,bigint)'::regprocedure,
   'saas.pricing_catalog_gram_candidates(uuid,uuid)'::regprocedure,
   'saas.pricing_catalog_gram_scope_digest(uuid,uuid,uuid,timestamptz)'::regprocedure,
   'saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,integer,uuid,uuid)'::regprocedure,
   'saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid)'::regprocedure
 ] LOOP
   SELECT proname IN ('pricing_reference_list','pricing_reference_set_preview_v2','pricing_reference_set_activate_v2')
     INTO is_public FROM pg_catalog.pg_proc WHERE oid=fn;
   IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_proc WHERE oid=fn AND proowner='celebix_saas_owner'::regrole AND prosecdef
     AND proconfig=ARRAY['search_path=pg_catalog, saas']::text[])
     OR pg_catalog.has_function_privilege('public',fn,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_host_resolver',fn,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_workflow',fn,'EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app',fn,'EXECUTE') IS DISTINCT FROM is_public
   THEN RAISE EXCEPTION 'REFERENCE_CATALOG_GRAMS_PRIVILEGE_ASSERTION_FAILED:%',fn; END IF;
 END LOOP;
END $assertions$;
