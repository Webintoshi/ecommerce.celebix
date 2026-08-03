BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_hero_slider_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.storefront_designs') IS NULL
     OR pg_catalog.to_regclass('saas.storefront_design_media') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_document_valid(uuid,jsonb,boolean)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamp with time zone)') IS NULL
     OR pg_catalog.to_regprocedure('saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,bigint)') IS NULL THEN
    RAISE EXCEPTION 'STOREFRONT_HERO_SLIDER_PRECONDITION_FAILED';
  END IF;
END
$storefront_hero_slider_precondition$;

CREATE FUNCTION saas.storefront_design_upgrade_v2(p_config jsonb,p_draft boolean)
RETURNS jsonb
LANGUAGE sql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT CASE WHEN p_config->>'schemaVersion'='2' THEN p_config ELSE
    pg_catalog.jsonb_build_object(
      'schemaVersion',2,
      'brand',p_config->'brand',
      'hero',pg_catalog.jsonb_build_object(
        'enabled',p_config->'hero'->'enabled',
        'slides',pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
          'headline',p_config->'hero'->>'headline',
          'body',p_config->'hero'->>'body',
          'desktopImage',CASE
            WHEN p_draft AND p_config->'hero'->'image'->>'kind'='legacy_https' THEN 'null'::jsonb
            ELSE p_config->'hero'->'image'
          END,
          'mobileImage','null'::jsonb,
          'destination',p_config->'hero'->'destination',
          'enabled',true
        ))
      ),
      'promotion',p_config->'promotion',
      'announcement',p_config->'announcement'
    ) END
$function$;

CREATE OR REPLACE FUNCTION saas.storefront_design_document_valid(p_store_id uuid,p_config jsonb,p_allow_legacy boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE item jsonb; slide jsonb; starts_at timestamptz; ends_at timestamptz;
BEGIN
  IF pg_catalog.pg_column_size(p_config)>65536
     OR NOT saas.storefront_design_exact_keys(p_config,ARRAY['schemaVersion','brand','hero','promotion','announcement'])
     OR p_config->>'schemaVersion'<>'2'
     OR NOT saas.storefront_design_exact_keys(p_config->'brand',ARRAY['logo','favicon','primaryColor','accentColor','backgroundColor','textColor','fontFamily'])
     OR NOT saas.storefront_design_media_reference_valid(p_store_id,p_config->'brand'->'logo',p_allow_legacy)
     OR NOT saas.storefront_design_media_reference_valid(p_store_id,p_config->'brand'->'favicon',p_allow_legacy)
     OR p_config->'brand'->>'primaryColor'!~'^#[0-9A-F]{6}$'
     OR p_config->'brand'->>'accentColor'!~'^#[0-9A-F]{6}$'
     OR p_config->'brand'->>'backgroundColor'!~'^#[0-9A-F]{6}$'
     OR p_config->'brand'->>'textColor'!~'^#[0-9A-F]{6}$'
     OR p_config->'brand'->>'fontFamily' NOT IN('inter','manrope','playfair','montserrat')
     OR NOT saas.storefront_design_exact_keys(p_config->'hero',ARRAY['enabled','slides'])
     OR pg_catalog.jsonb_typeof(p_config->'hero'->'enabled')<>'boolean'
     OR pg_catalog.jsonb_typeof(p_config->'hero'->'slides')<>'array'
     OR pg_catalog.jsonb_array_length(p_config->'hero'->'slides') NOT BETWEEN 1 AND 3
     OR NOT saas.storefront_design_exact_keys(p_config->'promotion',ARRAY['headline','body','destination','startsAt','endsAt','enabled'])
     OR NOT saas.storefront_design_text_valid(p_config->'promotion'->'headline',1,120)
     OR NOT saas.storefront_design_text_valid(p_config->'promotion'->'body',0,500)
     OR NOT saas.storefront_design_destination_valid(p_store_id,p_config->'promotion'->'destination')
     OR pg_catalog.jsonb_typeof(p_config->'promotion'->'enabled')<>'boolean'
     OR NOT saas.storefront_design_exact_keys(p_config->'announcement',ARRAY['items','icon','speed','direction','animation','enabled'])
     OR pg_catalog.jsonb_typeof(p_config->'announcement'->'items')<>'array'
     OR pg_catalog.jsonb_array_length(p_config->'announcement'->'items') NOT BETWEEN 1 AND 12
     OR p_config->'announcement'->>'icon' NOT IN('none','sparkle','truck','shield')
     OR p_config->'announcement'->>'speed' NOT IN('slow','normal','fast')
     OR p_config->'announcement'->>'direction' NOT IN('left','right')
     OR p_config->'announcement'->>'animation' NOT IN('continuous','step')
     OR pg_catalog.jsonb_typeof(p_config->'announcement'->'enabled')<>'boolean' THEN RETURN false; END IF;
  FOR slide IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') LOOP
    IF NOT saas.storefront_design_exact_keys(slide,ARRAY['headline','body','desktopImage','mobileImage','destination','enabled'])
       OR NOT saas.storefront_design_text_valid(slide->'headline',0,120)
       OR NOT saas.storefront_design_text_valid(slide->'body',0,500)
       OR NOT saas.storefront_design_media_reference_valid(p_store_id,slide->'desktopImage',p_allow_legacy)
       OR NOT saas.storefront_design_media_reference_valid(p_store_id,slide->'mobileImage',p_allow_legacy)
       OR NOT saas.storefront_design_destination_valid(p_store_id,slide->'destination')
       OR pg_catalog.jsonb_typeof(slide->'enabled')<>'boolean' THEN RETURN false; END IF;
  END LOOP;
  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(p_config->'announcement'->'items') LOOP
    IF NOT saas.storefront_design_text_valid(item,1,120) THEN RETURN false; END IF;
  END LOOP;
  IF (p_config->'promotion'->'startsAt')='null'::jsonb AND (p_config->'promotion'->'endsAt')='null'::jsonb THEN RETURN true; END IF;
  IF (p_config->'promotion'->'startsAt')='null'::jsonb OR (p_config->'promotion'->'endsAt')='null'::jsonb
     OR NOT saas.storefront_design_timestamp_valid(p_config->'promotion'->'startsAt')
     OR NOT saas.storefront_design_timestamp_valid(p_config->'promotion'->'endsAt') THEN RETURN false; END IF;
  starts_at:=saas.storefront_design_timestamp_value(p_config->'promotion'->'startsAt');
  ends_at:=saas.storefront_design_timestamp_value(p_config->'promotion'->'endsAt');
  RETURN starts_at<ends_at;
EXCEPTION WHEN others THEN RETURN false;
END
$function$;

CREATE FUNCTION saas.storefront_design_publishable(p_store_id uuid,p_config jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE slide jsonb;
BEGIN
  IF NOT saas.storefront_design_document_valid(p_store_id,p_config,false) THEN RETURN false; END IF;
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
EXCEPTION WHEN others THEN RETURN false;
END
$function$;

ALTER TABLE saas.storefront_designs DROP CONSTRAINT storefront_designs_schema_version_check;
ALTER TABLE saas.storefront_designs ALTER COLUMN schema_version SET DEFAULT 2;
UPDATE saas.storefront_designs
SET schema_version=2,
    draft_config=saas.storefront_design_upgrade_v2(draft_config,true),
    published_config=saas.storefront_design_upgrade_v2(published_config,false);
ALTER TABLE saas.storefront_designs ADD CONSTRAINT storefront_designs_schema_version_check CHECK(schema_version=2);

CREATE OR REPLACE FUNCTION saas.storefront_design_public_payload(p_store_id uuid,p_config jsonb,p_version bigint,p_published_at timestamptz)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
  WITH public_slides AS (
    SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'headline',selected.slide->>'headline',
      'body',selected.slide->>'body',
      'desktopImage',saas.storefront_design_public_media(p_store_id,selected.slide->'desktopImage'),
      'mobileImage',saas.storefront_design_public_media(p_store_id,selected.slide->'mobileImage'),
      'destination',saas.storefront_design_public_destination(p_store_id,selected.slide->'destination')
    ) ORDER BY selected.ordinal),'[]'::jsonb) slides
    FROM pg_catalog.jsonb_array_elements(p_config->'hero'->'slides') WITH ORDINALITY selected(slide,ordinal)
    WHERE (selected.slide->>'enabled')::boolean
  )
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',2,
    'publicationVersion',p_version,
    'publishedAt',saas.storefront_design_timestamp(p_published_at),
    'brand',pg_catalog.jsonb_build_object(
      'logo',saas.storefront_design_public_media(p_store_id,p_config->'brand'->'logo'),
      'favicon',saas.storefront_design_public_media(p_store_id,p_config->'brand'->'favicon'),
      'primaryColor',p_config->'brand'->>'primaryColor','accentColor',p_config->'brand'->>'accentColor',
      'backgroundColor',p_config->'brand'->>'backgroundColor','textColor',p_config->'brand'->>'textColor',
      'fontFamily',p_config->'brand'->>'fontFamily'
    ),
    'hero',pg_catalog.jsonb_build_object('enabled',p_config->'hero'->'enabled','slides',public_slides.slides),
    'promotion',pg_catalog.jsonb_build_object(
      'headline',p_config->'promotion'->>'headline','body',p_config->'promotion'->>'body',
      'destination',saas.storefront_design_public_destination(p_store_id,p_config->'promotion'->'destination'),
      'startsAt',p_config->'promotion'->'startsAt','endsAt',p_config->'promotion'->'endsAt','enabled',p_config->'promotion'->'enabled'
    ),
    'announcement',p_config->'announcement'
  ) FROM public_slides
$function$;

CREATE OR REPLACE FUNCTION saas.storefront_design_workspace_payload(p_store_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',2,'draftVersion',design.draft_version,'publishedVersion',design.published_version,
    'draftUpdatedAt',saas.storefront_design_timestamp(design.draft_updated_at),
    'publishedAt',saas.storefront_design_timestamp(design.published_at),
    'draft',design.draft_config,
    'published',saas.storefront_design_public_payload(design.store_id,design.published_config,design.published_version,design.published_at),
    'store',pg_catalog.jsonb_build_object(
      'name',store.name,
      'timezone',COALESCE((SELECT setting.config->>'timezone' FROM saas.merchant_admin_records setting WHERE setting.store_id=store.id AND setting.record_kind='general_setting' AND setting.status='active' AND setting.config?'timezone' ORDER BY setting.updated_at DESC,setting.id DESC LIMIT 1),'Europe/Istanbul')
    ),
    'media',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',media.id,'url',media.public_url,'altText',media.alt_text,'mediaType',media.media_type,'width',media.width,'height',media.height) ORDER BY media.created_at DESC,media.id) FROM saas.storefront_design_media media WHERE media.store_id=design.store_id AND media.status='active'),'[]'::jsonb),
    'destinations',COALESCE((
      SELECT pg_catalog.jsonb_agg(choice.payload ORDER BY choice.label,choice.resource_id)
      FROM (
        SELECT product.title label,product.id resource_id,pg_catalog.jsonb_build_object('kind','product','resourceId',product.id,'label',product.title,'path','/products/'||product.slug) payload FROM saas.products product WHERE product.store_id=design.store_id AND product.status='active'
        UNION ALL
        SELECT category.name,category.id,pg_catalog.jsonb_build_object('kind','collection','resourceId',category.id,'label',category.name,'path','/collections/'||category.slug) FROM saas.catalog_categories category WHERE category.store_id=design.store_id AND category.status='active'
        UNION ALL
        SELECT page.name,page.id,pg_catalog.jsonb_build_object('kind','page','resourceId',page.id,'label',page.name,'path','/pages/'||(page.config->>'slug')) FROM saas.merchant_admin_records page WHERE page.store_id=design.store_id AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true'
      ) choice
    ),'[]'::jsonb)
  )
  FROM saas.storefront_designs design JOIN saas.stores store ON store.id=design.store_id
  WHERE design.store_id=p_store_id
$function$;

CREATE OR REPLACE FUNCTION saas.storefront_design_publish(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_expected_draft_version bigint,p_expected_published_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.storefront_design_operations%ROWTYPE; current_design saas.storefront_designs%ROWTYPE; result jsonb;
BEGIN
  authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_draft_version<1 OR p_expected_published_version<1 THEN RETURN QUERY SELECT 'design_input_invalid',NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.storefront_design_operations operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=p_store_id AND existing.operation_kind='publish' AND existing.payload_fingerprint=p_payload_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
    RETURN;
  END IF;
  SELECT * INTO current_design FROM saas.storefront_designs design WHERE design.store_id=p_store_id FOR UPDATE;
  authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF current_design.store_id IS NULL THEN RETURN QUERY SELECT 'design_not_found',NULL::jsonb; RETURN; END IF;
  IF current_design.draft_version<>p_expected_draft_version THEN RETURN QUERY SELECT 'draft_version_conflict',pg_catalog.jsonb_build_object('draftVersion',current_design.draft_version); RETURN; END IF;
  IF current_design.published_version<>p_expected_published_version THEN RETURN QUERY SELECT 'published_version_conflict',pg_catalog.jsonb_build_object('publishedVersion',current_design.published_version); RETURN; END IF;
  IF NOT saas.storefront_design_publishable(p_store_id,current_design.draft_config) THEN RETURN QUERY SELECT 'design_publish_invalid',NULL::jsonb; RETURN; END IF;
  UPDATE saas.storefront_designs SET published_config=draft_config,published_version=published_version+1,published_at=p_now,published_by=p_principal_id WHERE store_id=p_store_id
  RETURNING * INTO current_design;
  result:=pg_catalog.jsonb_build_object('draftVersion',current_design.draft_version,'publishedVersion',current_design.published_version,'publishedAt',saas.storefront_design_timestamp(current_design.published_at),'published',saas.storefront_design_public_payload(p_store_id,current_design.published_config,current_design.published_version,current_design.published_at));
  INSERT INTO saas.storefront_design_operations VALUES(p_operation_id,p_store_id,'publish',p_payload_fingerprint,result,p_now);
  INSERT INTO saas.storefront_design_events VALUES(p_operation_id,p_store_id,p_principal_id,'published',current_design.draft_version,current_design.published_version,pg_catalog.jsonb_build_object('operationId',p_operation_id),p_now);
  RETURN QUERY SELECT 'published',result;
END
$function$;

REVOKE ALL ON FUNCTION
  saas.storefront_design_upgrade_v2(jsonb,boolean),
  saas.storefront_design_publishable(uuid,jsonb),
  saas.storefront_design_document_valid(uuid,jsonb,boolean),
  saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamptz),
  saas.storefront_design_workspace_payload(uuid),
  saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,bigint)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

GRANT EXECUTE ON FUNCTION saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,bigint) TO celebix_saas_app;

COMMIT;
