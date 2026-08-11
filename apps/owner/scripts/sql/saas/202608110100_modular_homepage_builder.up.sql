BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $modular_homepage_builder_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR pg_catalog.to_regclass('saas.campaign_starter_publications') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid(jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_document_valid(uuid,jsonb,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_publishable(uuid,jsonb)') IS NULL
     OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_category_layout(uuid,timestamp with time zone,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.campaign_starter_composition_valid_without_home_ids(jsonb)') IS NOT NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_document_valid_without_home_ids(uuid,jsonb,boolean)') IS NOT NULL
     OR pg_catalog.to_regprocedure('saas.public_starter_retail_presentation_without_home_ids(uuid,timestamp with time zone,boolean)') IS NOT NULL THEN
    RAISE EXCEPTION 'MODULAR_HOMEPAGE_BUILDER_PRECONDITION_FAILED';
  END IF;
END
$modular_homepage_builder_precondition$;

LOCK TABLE saas.storefront_designs IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.campaign_starter_publications IN ACCESS EXCLUSIVE MODE;

ALTER TABLE saas.campaign_starter_publications
  DROP CONSTRAINT campaign_starter_publications_config_check;
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_draft_unified_theme_check;
ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_published_unified_theme_check;

CREATE FUNCTION saas.storefront_theme_composition_without_home_ids(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE
    WHEN p_config->>'schemaVersion'<>'3' OR pg_catalog.jsonb_typeof(p_config->'sections')<>'array' THEN p_config
    ELSE pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(p_config,ARRAY['schemaVersion'],'2'::jsonb,false),
      ARRAY['sections'],
      COALESCE((
        SELECT pg_catalog.jsonb_agg(section.value-'sectionId' ORDER BY section.ordinality)
        FROM pg_catalog.jsonb_array_elements(p_config->'sections') WITH ORDINALITY section(value,ordinality)
      ),'[]'::jsonb),
      false
    )
  END
$function$;

CREATE FUNCTION saas.storefront_theme_composition_with_home_ids(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  WITH upgraded AS (
    SELECT saas.storefront_theme_composition_upgrade_v2(p_config) value
  ), numbered AS (
    SELECT section.value,section.ordinality,
      pg_catalog.row_number() OVER(PARTITION BY section.value->>'kind' ORDER BY section.ordinality) occurrence
    FROM upgraded
    CROSS JOIN LATERAL pg_catalog.jsonb_array_elements(upgraded.value->'sections') WITH ORDINALITY section(value,ordinality)
  )
  SELECT pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(upgraded.value,ARRAY['schemaVersion'],'3'::jsonb,false),
    ARRAY['sections'],
    COALESCE((
      SELECT pg_catalog.jsonb_agg(
        numbered.value||pg_catalog.jsonb_build_object(
          'sectionId','home_'||(numbered.value->>'kind')||'_'||numbered.occurrence
        )
        ORDER BY numbered.ordinality
      )
      FROM numbered
    ),'[]'::jsonb),
    false
  )
  FROM upgraded
$function$;

ALTER FUNCTION saas.campaign_starter_composition_valid(jsonb)
  RENAME TO campaign_starter_composition_valid_without_home_ids;

CREATE FUNCTION saas.campaign_starter_composition_valid(p_config jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE section jsonb;
BEGIN
  IF p_config->>'schemaVersion' IN ('1','2') THEN
    RETURN saas.campaign_starter_composition_valid_without_home_ids(p_config);
  END IF;
  IF p_config->>'schemaVersion'<>'3'
     OR pg_catalog.jsonb_typeof(p_config->'sections')<>'array' THEN
    RETURN false;
  END IF;
  FOR section IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'sections') LOOP
    IF pg_catalog.jsonb_typeof(section)<>'object'
       OR pg_catalog.jsonb_typeof(section->'sectionId')<>'string'
       OR section->>'sectionId'!~'^home_[a-z0-9_]{3,75}$' THEN
      RETURN false;
    END IF;
  END LOOP;
  IF (
    SELECT pg_catalog.count(DISTINCT section.value->>'sectionId')
    FROM pg_catalog.jsonb_array_elements(p_config->'sections') section(value)
  )<>pg_catalog.jsonb_array_length(p_config->'sections') THEN
    RETURN false;
  END IF;
  RETURN saas.campaign_starter_composition_valid_without_home_ids(
    saas.storefront_theme_composition_without_home_ids(p_config)
  );
EXCEPTION WHEN others THEN
  RETURN false;
END
$function$;

CREATE FUNCTION saas.storefront_design_document_with_home_ids(p_config jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT (p_config-'schemaVersion'-'composition'-'typography')
    || pg_catalog.jsonb_build_object(
      'schemaVersion',4,
      'typography',COALESCE(
        p_config->'typography',
        saas.storefront_design_typography_default(p_config->'brand'->>'fontFamily')
      ),
      'composition',saas.storefront_theme_composition_with_home_ids(p_config->'composition')
    )
$function$;

ALTER FUNCTION saas.storefront_design_document_valid(uuid,jsonb,boolean)
  RENAME TO storefront_design_document_valid_without_home_ids;

CREATE FUNCTION saas.storefront_design_document_valid(p_store_id uuid,p_config jsonb,p_allow_legacy boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE downgraded jsonb;
BEGIN
  IF p_config->>'schemaVersion'='3' THEN
    RETURN saas.storefront_design_document_valid_without_home_ids(p_store_id,p_config,p_allow_legacy);
  END IF;
  IF p_config->>'schemaVersion'<>'4'
     OR NOT saas.storefront_design_exact_keys(
       p_config,
       ARRAY['schemaVersion','brand','hero','promotion','announcement','typography','composition']
     )
     OR pg_catalog.pg_column_size(p_config)>98304
     OR NOT saas.campaign_starter_composition_valid(p_config->'composition') THEN
    RETURN false;
  END IF;
  downgraded:=pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(p_config,ARRAY['schemaVersion'],'3'::jsonb,false),
    ARRAY['composition'],
    saas.storefront_theme_composition_without_home_ids(p_config->'composition'),
    false
  );
  RETURN saas.storefront_design_document_valid_without_home_ids(p_store_id,downgraded,p_allow_legacy);
EXCEPTION WHEN others THEN
  RETURN false;
END
$function$;

CREATE OR REPLACE FUNCTION saas.storefront_design_publishable(p_store_id uuid,p_config jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE slide jsonb; composition jsonb;
BEGIN
  composition:=CASE
    WHEN p_config->'composition'->>'schemaVersion'='3'
      THEN saas.storefront_theme_composition_without_home_ids(p_config->'composition')
    ELSE p_config->'composition'
  END;
  IF NOT saas.storefront_design_document_valid(p_store_id,p_config,false)
     OR NOT saas.storefront_theme_composition_references_valid(p_store_id,composition,true) THEN
    RETURN false;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') selected(slide)
    WHERE (selected.slide->>'enabled')::boolean
  ) THEN RETURN false; END IF;
  FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') LOOP
    IF (slide->>'enabled')::boolean AND (
      NOT saas.storefront_design_text_valid(slide->'headline',1,120)
      OR slide->'desktopImage'='null'::jsonb
      OR NOT saas.storefront_design_media_reference_valid(p_store_id,slide->'desktopImage',false)
    ) THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END
$function$;

ALTER TABLE saas.storefront_designs
  DROP CONSTRAINT storefront_designs_schema_version_check;
UPDATE saas.storefront_designs
SET schema_version=4,
    draft_config=saas.storefront_design_document_with_home_ids(draft_config),
    published_config=saas.storefront_design_document_with_home_ids(published_config);
ALTER TABLE saas.storefront_designs
  ALTER COLUMN schema_version SET DEFAULT 4;
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_schema_version_check CHECK(schema_version=4);

ALTER FUNCTION saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)
  RENAME TO public_starter_retail_presentation_without_home_ids;

DO $modular_homepage_public_projection$
DECLARE
  source text;
  old_source constant text:='END IF; sections:=sections||pg_catalog.jsonb_build_array(resolved);';
  new_source constant text:='END IF; IF section?''sectionId'' THEN resolved:=resolved||pg_catalog.jsonb_build_object(''sectionId'',section->>''sectionId''); END IF; sections:=sections||pg_catalog.jsonb_build_array(resolved);';
BEGIN
  SELECT procedure.prosrc INTO source
  FROM pg_catalog.pg_proc procedure
  WHERE procedure.oid='saas.public_starter_retail_presentation_without_home_ids(uuid,timestamp with time zone,boolean)'::regprocedure;
  IF source IS NULL OR pg_catalog.strpos(source,old_source)=0 THEN
    RAISE EXCEPTION 'MODULAR_HOMEPAGE_PUBLIC_PROJECTION_SOURCE_INVALID';
  END IF;
  source:=pg_catalog.replace(source,old_source,new_source);
  EXECUTE pg_catalog.format(
    'CREATE FUNCTION saas.public_starter_retail_presentation_without_category_layout(p_store_id uuid,p_now timestamptz,p_allow_index boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS %L',
    source
  );
END
$modular_homepage_public_projection$;

ALTER TABLE saas.campaign_starter_publications
  ADD CONSTRAINT campaign_starter_publications_config_check
  CHECK(saas.campaign_starter_composition_valid(config));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_draft_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_published_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

REVOKE ALL ON FUNCTION
  saas.storefront_theme_composition_without_home_ids(jsonb),
  saas.storefront_theme_composition_with_home_ids(jsonb),
  saas.campaign_starter_composition_valid_without_home_ids(jsonb),
  saas.campaign_starter_composition_valid(jsonb),
  saas.storefront_design_document_with_home_ids(jsonb),
  saas.storefront_design_document_valid_without_home_ids(uuid,jsonb,boolean),
  saas.storefront_design_document_valid(uuid,jsonb,boolean),
  saas.storefront_design_publishable(uuid,jsonb),
  saas.public_starter_retail_presentation_without_home_ids(uuid,timestamptz,boolean),
  saas.public_starter_retail_presentation_without_category_layout(uuid,timestamptz,boolean)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
