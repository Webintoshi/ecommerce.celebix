BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $responsive_category_showcase_layout_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.campaign_starter_publications') IS NULL
     OR pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_theme_composition_upgrade_v2(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation(uuid,timestamp with time zone,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid_without_category_layout(jsonb)') IS NOT NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_category_layout_add_default(jsonb)') IS NOT NULL THEN
    RAISE EXCEPTION 'RESPONSIVE_CATEGORY_SHOWCASE_LAYOUT_PRECONDITION_FAILED';
  END IF;
END
$responsive_category_showcase_layout_precondition$;

ALTER TABLE saas.campaign_starter_publications DROP CONSTRAINT campaign_starter_publications_config_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_published_unified_theme_check;

CREATE FUNCTION saas.campaign_starter_category_layout_add_default(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE
    WHEN p_config->>'schemaVersion'<>'2' OR pg_catalog.jsonb_typeof(p_config->'sections')<>'array' THEN p_config
    ELSE pg_catalog.jsonb_set(
      p_config,
      ARRAY['sections'],
      COALESCE((
        SELECT pg_catalog.jsonb_agg(
          CASE
            WHEN section.value->>'kind'='category_grid' AND NOT (section.value?'layout')
              THEN section.value||pg_catalog.jsonb_build_object('layout','grid')
            ELSE section.value
          END
          ORDER BY section.ordinality
        )
        FROM pg_catalog.jsonb_array_elements(p_config->'sections') WITH ORDINALITY section(value,ordinality)
      ),'[]'::jsonb),
      false
    )
  END
$function$;

CREATE FUNCTION saas.campaign_starter_category_layout_strip(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE
    WHEN p_config->>'schemaVersion'<>'2' OR pg_catalog.jsonb_typeof(p_config->'sections')<>'array' THEN p_config
    ELSE pg_catalog.jsonb_set(
      p_config,
      ARRAY['sections'],
      COALESCE((
        SELECT pg_catalog.jsonb_agg(
          CASE WHEN section.value->>'kind'='category_grid' THEN section.value-'layout' ELSE section.value END
          ORDER BY section.ordinality
        )
        FROM pg_catalog.jsonb_array_elements(p_config->'sections') WITH ORDINALITY section(value,ordinality)
      ),'[]'::jsonb),
      false
    )
  END
$function$;

ALTER FUNCTION saas.campaign_starter_composition_valid(jsonb)
  RENAME TO campaign_starter_composition_valid_without_category_layout;

CREATE FUNCTION saas.campaign_starter_composition_valid(p_config jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE section jsonb;
BEGIN
  IF p_config->>'schemaVersion'='1' THEN
    RETURN saas.campaign_starter_composition_valid_without_category_layout(p_config);
  END IF;
  IF p_config->>'schemaVersion'<>'2' OR pg_catalog.jsonb_typeof(p_config->'sections')<>'array' THEN
    RETURN false;
  END IF;
  FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'sections') LOOP
    IF section->>'kind'='category_grid' AND (
      NOT saas.campaign_starter_exact_keys(section,ARRAY['kind','enabled','heading','categoryIds','layout'])
      OR pg_catalog.jsonb_typeof(section->'layout')<>'string'
      OR section->>'layout' NOT IN ('duo','grid')
    ) THEN
      RETURN false;
    END IF;
  END LOOP;
  RETURN saas.campaign_starter_composition_valid_without_category_layout(
    saas.campaign_starter_category_layout_strip(p_config)
  );
EXCEPTION WHEN others THEN
  RETURN false;
END
$function$;

UPDATE saas.merchant_admin_records
SET config=saas.campaign_starter_category_layout_add_default(config)
WHERE record_kind='starter_theme_composition' AND config->>'schemaVersion'='2';

UPDATE saas.campaign_starter_publications
SET config=saas.campaign_starter_category_layout_add_default(config)
WHERE config->>'schemaVersion'='2';

UPDATE saas.storefront_designs
SET draft_config=CASE
      WHEN draft_config->'composition'->>'schemaVersion'='2'
        THEN pg_catalog.jsonb_set(draft_config,ARRAY['composition'],saas.campaign_starter_category_layout_add_default(draft_config->'composition'),false)
      ELSE draft_config
    END,
    published_config=CASE
      WHEN published_config->'composition'->>'schemaVersion'='2'
        THEN pg_catalog.jsonb_set(published_config,ARRAY['composition'],saas.campaign_starter_category_layout_add_default(published_config->'composition'),false)
      ELSE published_config
    END;

ALTER FUNCTION saas.storefront_theme_composition_upgrade_v2(jsonb)
  RENAME TO storefront_theme_composition_upgrade_v2_without_category_layout;

CREATE FUNCTION saas.storefront_theme_composition_upgrade_v2(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT saas.campaign_starter_category_layout_add_default(
    saas.storefront_theme_composition_upgrade_v2_without_category_layout(p_config)
  )
$function$;

ALTER FUNCTION saas.public_starter_retail_presentation(uuid,timestamptz,boolean)
  RENAME TO public_starter_retail_presentation_without_category_layout;

CREATE FUNCTION saas.public_starter_retail_presentation(p_store_id uuid,p_now timestamptz,p_allow_index boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  projected jsonb;
  projected_sections jsonb;
  selected_layout text:='grid';
BEGIN
  projected:=saas.public_starter_retail_presentation_without_category_layout(p_store_id,p_now,p_allow_index);
  IF projected IS NULL THEN RETURN NULL; END IF;

  SELECT section->>'layout' INTO selected_layout
  FROM saas.storefront_designs design
  CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(design.published_config->'composition'->'sections') section
  WHERE design.store_id=p_store_id AND section->>'kind'='category_grid'
  LIMIT 1;
  selected_layout:=COALESCE(selected_layout,'grid');

  SELECT COALESCE(pg_catalog.jsonb_agg(
    CASE WHEN section.value->>'kind'='category_grid'
      THEN section.value||pg_catalog.jsonb_build_object('layout',selected_layout)
      ELSE section.value END
    ORDER BY section.ordinality
  ),'[]'::jsonb)
  INTO projected_sections
  FROM pg_catalog.jsonb_array_elements(projected->'sections') WITH ORDINALITY section(value,ordinality);

  RETURN pg_catalog.jsonb_set(projected,ARRAY['sections'],projected_sections,false);
END
$function$;

ALTER TABLE saas.campaign_starter_publications
  ADD CONSTRAINT campaign_starter_publications_config_check CHECK(saas.campaign_starter_composition_valid(config));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_draft_unified_theme_check CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_published_unified_theme_check CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

REVOKE ALL ON FUNCTION
  saas.campaign_starter_category_layout_add_default(jsonb),
  saas.campaign_starter_category_layout_strip(jsonb),
  saas.campaign_starter_composition_valid_without_category_layout(jsonb),
  saas.campaign_starter_composition_valid(jsonb),
  saas.storefront_theme_composition_upgrade_v2_without_category_layout(jsonb),
  saas.storefront_theme_composition_upgrade_v2(jsonb),
  saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean),
  saas.public_starter_retail_presentation(uuid,timestamptz,boolean)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
