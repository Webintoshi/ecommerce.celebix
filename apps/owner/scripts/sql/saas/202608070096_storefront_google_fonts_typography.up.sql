BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $storefront_google_fonts_typography_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_document_valid(uuid,jsonb,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_typography_valid(jsonb)') IS NOT NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_document_without_typography_valid(uuid,jsonb,boolean)') IS NOT NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_public_payload_without_typography(uuid,jsonb,bigint,timestamp with time zone)') IS NOT NULL THEN
    RAISE EXCEPTION 'STOREFRONT_GOOGLE_FONTS_TYPOGRAPHY_PRECONDITION_FAILED';
  END IF;
END
$storefront_google_fonts_typography_precondition$;

DO $drop_storefront_design_typography_checks$
DECLARE selected record;
BEGIN
  FOR selected IN
    SELECT constraint_name.conname
    FROM pg_catalog.pg_constraint constraint_name
    WHERE constraint_name.conrelid='saas.storefront_designs'::regclass
      AND constraint_name.contype='c'
      AND pg_catalog.pg_get_constraintdef(constraint_name.oid) LIKE '%storefront_design_document_valid%'
  LOOP
    EXECUTE pg_catalog.format('ALTER TABLE saas.storefront_designs DROP CONSTRAINT %I',selected.conname);
  END LOOP;
END
$drop_storefront_design_typography_checks$;

ALTER FUNCTION saas.storefront_design_document_valid(uuid,jsonb,boolean)
  RENAME TO storefront_design_document_without_typography_valid;
ALTER FUNCTION saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamptz)
  RENAME TO storefront_design_public_payload_without_typography;

CREATE FUNCTION saas.storefront_design_font_option_valid(p_option jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  weight text;
  ordinal bigint;
  previous_ordinal integer:=0;
  selected_ordinal integer;
  seen text[]:=ARRAY[]::text[];
BEGIN
  IF pg_catalog.jsonb_typeof(p_option)<>'object'
     OR NOT saas.storefront_design_exact_keys(p_option,ARRAY['family','category','availableWeights','source'])
     OR p_option->>'family' !~ '^[A-Za-z0-9][A-Za-z0-9 .&()+-]{0,119}$'
     OR p_option->>'family' IS DISTINCT FROM pg_catalog.btrim(p_option->>'family')
     OR p_option->>'category' NOT IN ('sans-serif','serif','display','handwriting','monospace')
     OR p_option->>'source'<>'google'
     OR pg_catalog.jsonb_typeof(p_option->'availableWeights')<>'array'
     OR pg_catalog.jsonb_array_length(p_option->'availableWeights') NOT BETWEEN 1 AND 5 THEN
    RETURN false;
  END IF;

  FOR weight,ordinal IN
    SELECT item.value,item.ordinality
    FROM pg_catalog.jsonb_array_elements_text(p_option->'availableWeights') WITH ORDINALITY item(value,ordinality)
  LOOP
    selected_ordinal:=pg_catalog.array_position(ARRAY['400','500','600','700','800'],weight);
    IF selected_ordinal IS NULL OR selected_ordinal<=previous_ordinal OR weight=ANY(seen) THEN
      RETURN false;
    END IF;
    previous_ordinal:=selected_ordinal;
    seen:=pg_catalog.array_append(seen,weight);
  END LOOP;
  RETURN true;
EXCEPTION WHEN others THEN
  RETURN false;
END
$function$;

CREATE FUNCTION saas.storefront_design_typography_valid(p_typography jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE
  heading_size integer;
  body_size integer;
BEGIN
  IF pg_catalog.jsonb_typeof(p_typography)<>'object'
     OR NOT saas.storefront_design_exact_keys(p_typography,ARRAY['headingFont','bodyFont','headingWeight','bodyWeight','headingSizePx','bodySizePx'])
     OR NOT saas.storefront_design_font_option_valid(p_typography->'headingFont')
     OR NOT saas.storefront_design_font_option_valid(p_typography->'bodyFont')
     OR p_typography->>'headingWeight' NOT IN ('400','500','600','700','800')
     OR p_typography->>'bodyWeight' NOT IN ('400','500','600','700','800')
     OR NOT (p_typography->'headingFont'->'availableWeights' ? (p_typography->>'headingWeight'))
     OR NOT (p_typography->'bodyFont'->'availableWeights' ? (p_typography->>'bodyWeight'))
     OR pg_catalog.jsonb_typeof(p_typography->'headingSizePx')<>'number'
     OR pg_catalog.jsonb_typeof(p_typography->'bodySizePx')<>'number' THEN
    RETURN false;
  END IF;
  heading_size:=(p_typography->>'headingSizePx')::integer;
  body_size:=(p_typography->>'bodySizePx')::integer;
  RETURN heading_size BETWEEN 24 AND 72
    AND body_size BETWEEN 14 AND 20
    AND pg_catalog.to_jsonb(heading_size)=p_typography->'headingSizePx'
    AND pg_catalog.to_jsonb(body_size)=p_typography->'bodySizePx';
EXCEPTION WHEN others THEN
  RETURN false;
END
$function$;

CREATE FUNCTION saas.storefront_design_typography_default(p_legacy_font_family text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  WITH selected AS (
    SELECT CASE p_legacy_font_family
      WHEN 'manrope' THEN 'Manrope'
      WHEN 'montserrat' THEN 'Montserrat'
      WHEN 'playfair' THEN 'Playfair Display'
      ELSE 'Inter'
    END family,
    CASE WHEN p_legacy_font_family='playfair' THEN 'serif' ELSE 'sans-serif' END category
  ), font AS (
    SELECT pg_catalog.jsonb_build_object(
      'family',selected.family,
      'category',selected.category,
      'availableWeights',pg_catalog.jsonb_build_array('400','500','600','700','800'),
      'source','google'
    ) value
    FROM selected
  )
  SELECT pg_catalog.jsonb_build_object(
    'headingFont',font.value,
    'bodyFont',font.value,
    'headingWeight','700',
    'bodyWeight','400',
    'headingSizePx',40,
    'bodySizePx',16
  )
  FROM font
$function$;

CREATE FUNCTION saas.storefront_design_document_valid(p_store_id uuid,p_config jsonb,p_allow_legacy boolean)
RETURNS boolean
LANGUAGE sql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE
    WHEN NOT (p_config?'typography') THEN
      saas.storefront_design_document_without_typography_valid(p_store_id,p_config,p_allow_legacy)
    ELSE
      p_config->>'schemaVersion'='3'
      AND saas.storefront_design_exact_keys(p_config,ARRAY['schemaVersion','brand','hero','promotion','announcement','typography','composition'])
      AND pg_catalog.pg_column_size(p_config)<=98304
      AND saas.storefront_design_document_without_typography_valid(p_store_id,p_config-'typography',p_allow_legacy)
      AND saas.storefront_design_typography_valid(p_config->'typography')
    END
$function$;

CREATE FUNCTION saas.storefront_design_public_payload(p_store_id uuid,p_config jsonb,p_version bigint,p_published_at timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
  SELECT saas.storefront_design_public_payload_without_typography(p_store_id,p_config,p_version,p_published_at)
    || pg_catalog.jsonb_build_object(
      'typography',CASE
        WHEN p_config?'typography' THEN p_config->'typography'
        ELSE saas.storefront_design_typography_default(p_config->'brand'->>'fontFamily')
      END
    )
$function$;

ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_draft_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,draft_config,true));
ALTER TABLE saas.storefront_designs
  ADD CONSTRAINT storefront_designs_published_unified_theme_check
  CHECK(saas.storefront_design_document_valid(store_id,published_config,true));

REVOKE ALL ON FUNCTION
  saas.storefront_design_font_option_valid(jsonb),
  saas.storefront_design_typography_valid(jsonb),
  saas.storefront_design_typography_default(text),
  saas.storefront_design_document_without_typography_valid(uuid,jsonb,boolean),
  saas.storefront_design_document_valid(uuid,jsonb,boolean),
  saas.storefront_design_public_payload_without_typography(uuid,jsonb,bigint,timestamptz),
  saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

COMMIT;
