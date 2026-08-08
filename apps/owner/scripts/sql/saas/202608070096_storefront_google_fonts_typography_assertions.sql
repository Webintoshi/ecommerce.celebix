BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $storefront_google_fonts_typography_assertions$
DECLARE
  valid_font jsonb:=pg_catalog.jsonb_build_object(
    'family','Manrope','category','sans-serif',
    'availableWeights',pg_catalog.jsonb_build_array('400','500','600','700','800'),
    'source','google'
  );
  valid_typography jsonb;
  hostile jsonb;
  selected record;
  projected jsonb;
  function_source text;
BEGIN
  valid_typography:=pg_catalog.jsonb_build_object(
    'headingFont',valid_font,'bodyFont',valid_font,
    'headingWeight','700','bodyWeight','400',
    'headingSizePx',48,'bodySizePx',16
  );
  IF NOT saas.storefront_design_typography_valid(valid_typography) THEN
    RAISE EXCEPTION 'STOREFRONT_TYPOGRAPHY_VALID_INVALID';
  END IF;

  SELECT procedure.prosrc INTO function_source
  FROM pg_catalog.pg_proc procedure
  WHERE procedure.oid='saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamp with time zone)'::regprocedure;
  IF pg_catalog.strpos(function_source,'storefront_design_public_payload_without_typography')=0
     OR pg_catalog.strpos(function_source,'storefront_design_typography_default')=0 THEN
    RAISE EXCEPTION 'STOREFRONT_TYPOGRAPHY_PUBLIC_INVALID';
  END IF;

  IF NOT saas.storefront_design_typography_valid(saas.storefront_design_typography_default('inter'))
     OR saas.storefront_design_typography_default('playfair')->'headingFont'->>'family'<>'Playfair Display'
     OR saas.storefront_design_typography_default('playfair')->'headingFont'->>'category'<>'serif' THEN
    RAISE EXCEPTION 'STOREFRONT_TYPOGRAPHY_LEGACY_INVALID';
  END IF;

  FOR selected IN
    SELECT store_id,published_config,published_version,published_at
    FROM saas.storefront_designs
  LOOP
    projected:=saas.storefront_design_public_payload(selected.store_id,selected.published_config,selected.published_version,selected.published_at);
    IF NOT projected?'typography'
       OR NOT saas.storefront_design_typography_valid(projected->'typography') THEN
      RAISE EXCEPTION 'STOREFRONT_TYPOGRAPHY_PUBLIC_INVALID';
    END IF;
  END LOOP;

  FOREACH hostile IN ARRAY ARRAY[
    pg_catalog.jsonb_set(valid_typography,ARRAY['headingFont','family'],'"Manrope;src:url(evil)"'::jsonb,false),
    pg_catalog.jsonb_set(valid_typography,ARRAY['headingFont','availableWeights'],'["400","400"]'::jsonb,false),
    pg_catalog.jsonb_set(valid_typography,ARRAY['headingWeight'],'"900"'::jsonb,false),
    pg_catalog.jsonb_set(valid_typography,ARRAY['headingSizePx'],'73'::jsonb,false),
    valid_typography||pg_catalog.jsonb_build_object('unknown',true)
  ] LOOP
    IF saas.storefront_design_typography_valid(hostile) THEN
      RAISE EXCEPTION 'STOREFRONT_TYPOGRAPHY_HOSTILE_ACCEPTED';
    END IF;
  END LOOP;

  IF pg_catalog.has_function_privilege('public','saas.storefront_design_typography_valid(jsonb)','EXECUTE')
     OR pg_catalog.has_function_privilege('celebix_saas_app','saas.storefront_design_typography_valid(jsonb)','EXECUTE')
     OR EXISTS(
       SELECT 1 FROM saas.storefront_designs
       WHERE NOT saas.storefront_design_document_valid(store_id,draft_config,true)
          OR NOT saas.storefront_design_document_valid(store_id,published_config,true)
     ) THEN
    RAISE EXCEPTION 'STOREFRONT_TYPOGRAPHY_AUTHORITY_INVALID';
  END IF;
END
$storefront_google_fonts_typography_assertions$;

COMMIT;
