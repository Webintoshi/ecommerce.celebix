DO $assertions$ DECLARE r record; p record;
BEGIN
 IF (SELECT count(*) FROM saas.catalog_collection_design_backup_183)<>9 THEN RAISE EXCEPTION 'COLLECTION_DESIGN_BACKUP_INVALID'; END IF;
 FOR r IN SELECT * FROM saas.catalog_collection_design_backup_183 LOOP
  SELECT * INTO p FROM pg_proc WHERE oid=r.signature::regprocedure;
  IF p.proowner<>r.owner_id OR p.proacl IS DISTINCT FROM r.acl OR p.prosecdef<>r.security_definer OR p.proconfig IS DISTINCT FROM r.config OR pg_get_functiondef(p.oid)<>r.migrated_definition THEN RAISE EXCEPTION 'COLLECTION_DESIGN_ASSERT_AUTHORITY_CHANGED'; END IF;
 END LOOP;
 IF NOT saas.c183_navigation_valid('{"rootCategoryIds":[],"rootLinks":[{"kind":"catalog_collection","resourceId":"10000000-0000-4000-8000-000000000001"},{"kind":"category","resourceId":"10000000-0000-4000-8000-000000000001"}]}'::jsonb) OR saas.c183_navigation_valid('{"rootLinks":[{"kind":"catalog_collection","resourceId":"bad"}]}'::jsonb) OR saas.c183_navigation_valid('{"rootLinks":[{"kind":"catalog_collection","resourceId":"10000000-0000-4000-8000-000000000001"},{"kind":"catalog_collection","resourceId":"10000000-0000-4000-8000-000000000001"}]}'::jsonb) THEN RAISE EXCEPTION 'COLLECTION_DESIGN_NAV_VALIDATION_INVALID'; END IF;
 IF NOT saas.starter_retail_footer_link_valid('{"kind":"catalog_collection","resourceId":"10000000-0000-4000-8000-000000000001"}'::jsonb) THEN RAISE EXCEPTION 'COLLECTION_DESIGN_FOOTER_VALIDATION_INVALID'; END IF;
 IF NOT saas.homepage_banner_destination_shape_valid('{"kind":"catalog_collection","resourceId":"10000000-0000-4000-8000-000000000001"}'::jsonb) OR saas.homepage_banner_destination_shape_valid('{"kind":"catalog_collection","resourceId":"bad"}'::jsonb) THEN RAISE EXCEPTION 'COLLECTION_DESIGN_BANNER_VALIDATION_INVALID'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc proc CROSS JOIN unnest(ARRAY['celebix_saas_app','celebix_saas_host_resolver','celebix_saas_workflow']) role WHERE proc.pronamespace='saas'::regnamespace AND proc.proname LIKE 'c183_%' AND has_function_privilege(role,proc.oid,'EXECUTE')) THEN RAISE EXCEPTION 'COLLECTION_DESIGN_HELPER_PUBLIC'; END IF;
END $assertions$;
