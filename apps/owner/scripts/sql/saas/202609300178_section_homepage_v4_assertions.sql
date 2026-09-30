BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $assertions$
DECLARE signature text; role_name text; composition jsonb; banner jsonb;
BEGIN
 IF pg_catalog.to_regclass('saas.section_homepage_v4_backup') IS NULL OR (SELECT pg_catalog.count(*) FROM saas.section_homepage_v4_backup)<>7 THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_ROLLBACK_EVIDENCE_MISSING'; END IF;
 FOREACH signature IN ARRAY ARRAY[
 'saas.storefront_design_normalize_v5(jsonb)','saas.storefront_design_v5_publishable(uuid,jsonb,jsonb)',
 'saas.homepage_banner_media_shape_valid(jsonb)','saas.homepage_banner_destination_shape_valid(jsonb)',
 'saas.public_homepage_banner_media(uuid,jsonb)','saas.public_homepage_banner(uuid,jsonb,timestamptz)',
 'saas.storefront_design_v5_legacy_probe(jsonb)',
 'saas.storefront_design_composition_valid_pre_section_homepage(jsonb)',
 'saas.storefront_design_document_valid_pre_section_homepage(uuid,jsonb,boolean)',
 'saas.storefront_theme_composition_references_valid_pre_section_homepage(uuid,jsonb,boolean)',
 'saas.public_starter_retail_presentation_pre_section_homepage(uuid,timestamptz,boolean)'
 ] LOOP
  IF pg_catalog.to_regprocedure(signature) IS NULL THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_HELPER_MISSING: %',signature; END IF;
  FOREACH role_name IN ARRAY ARRAY['celebix_saas_app','celebix_saas_workflow','celebix_saas_host_resolver'] LOOP
   IF pg_catalog.has_function_privilege(role_name,signature,'EXECUTE') THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_HELPER_EXPOSED: %, %',signature,role_name; END IF;
  END LOOP;
 END LOOP;
 composition:=saas.storefront_theme_composition_with_home_ids(saas.storefront_theme_default_composition())||pg_catalog.jsonb_build_object('schemaVersion',4,'sections','[]'::jsonb);
 IF NOT saas.storefront_design_composition_valid(composition) THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_EMPTY_COMPOSITION_INVALID'; END IF;
 banner:='{"kind":"banner","sectionId":"home_banner_test","enabled":false,"layout":"stacked","autoplay":false,"presentation":"image_only","slides":[]}'::jsonb;
 IF NOT saas.storefront_design_composition_valid(composition||pg_catalog.jsonb_build_object('sections',pg_catalog.jsonb_build_array(banner)))
 OR saas.storefront_design_composition_valid(composition||pg_catalog.jsonb_build_object('sections',pg_catalog.jsonb_build_array(banner,banner))) THEN RAISE EXCEPTION 'SECTION_HOMEPAGE_V4_ID_VALIDATION_FAILED'; END IF;
END $assertions$;
COMMIT;
