BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $empty_homepage_sections_assertions$
DECLARE
  role_name text;
  empty_config jsonb;
  oversized_sections jsonb;
BEGIN
  IF pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid_without_empty_homepage(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'EMPTY_HOMEPAGE_SECTIONS_API_MISSING';
  END IF;

  empty_config:=pg_catalog.jsonb_set(
    saas.storefront_theme_default_composition(),
    ARRAY['sections'],
    '[]'::jsonb,
    false
  );
  SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'kind','product_row','enabled',true,'heading','Validation','source','latest','limit',4
  )) INTO oversized_sections
  FROM pg_catalog.generate_series(1,13);

  IF NOT saas.campaign_starter_composition_valid(empty_config)
     OR saas.campaign_starter_composition_valid_without_empty_homepage(empty_config)
     OR saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(empty_config,ARRAY['sections'],'{}'::jsonb,false))
     OR saas.campaign_starter_composition_valid(pg_catalog.jsonb_set(empty_config,ARRAY['sections'],oversized_sections,false))
     OR saas.campaign_starter_composition_valid(empty_config||pg_catalog.jsonb_build_object('unexpected',true)) THEN
    RAISE EXCEPTION 'EMPTY_HOMEPAGE_SECTIONS_VALIDATOR_INVALID';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM saas.merchant_admin_records record
    WHERE record.record_kind='starter_theme_composition'
      AND NOT saas.campaign_starter_composition_valid(record.config)
  ) OR EXISTS(
    SELECT 1
    FROM saas.campaign_starter_publications publication
    WHERE NOT saas.campaign_starter_composition_valid(publication.config)
  ) OR EXISTS(
    SELECT 1
    FROM saas.storefront_designs design
    WHERE NOT saas.storefront_design_document_valid(design.store_id,design.draft_config,true)
       OR NOT saas.storefront_design_document_valid(design.store_id,design.published_config,true)
  ) THEN
    RAISE EXCEPTION 'EMPTY_HOMEPAGE_SECTIONS_DATA_INVALID';
  END IF;

  IF EXISTS(
    SELECT 1
    FROM pg_catalog.pg_constraint constraint_record
    WHERE constraint_record.conrelid IN ('saas.campaign_starter_publications'::regclass,'saas.storefront_designs'::regclass)
      AND constraint_record.conname IN (
        'campaign_starter_publications_config_check',
        'storefront_designs_draft_unified_theme_check',
        'storefront_designs_published_unified_theme_check'
      )
      AND NOT constraint_record.convalidated
  ) THEN
    RAISE EXCEPTION 'EMPTY_HOMEPAGE_SECTIONS_CONSTRAINT_NOT_VALIDATED';
  END IF;

  FOR role_name IN SELECT value FROM (VALUES
    ('public'),('celebix_saas_identity'),('celebix_saas_app'),('celebix_saas_workflow'),
    ('celebix_saas_host_resolver'),('celebix_saas_bootstrap'),('celebix_saas_observability'),('celebix_saas_migrator')
  ) roles(value)
  LOOP
    IF pg_catalog.has_function_privilege(role_name,'saas.campaign_starter_composition_valid_without_empty_homepage(jsonb)','EXECUTE')
       OR pg_catalog.has_function_privilege(role_name,'saas.campaign_starter_composition_valid(jsonb)','EXECUTE') THEN
      RAISE EXCEPTION 'EMPTY_HOMEPAGE_SECTIONS_HELPER_EXPOSED';
    END IF;
  END LOOP;
END
$empty_homepage_sections_assertions$;

COMMIT;
