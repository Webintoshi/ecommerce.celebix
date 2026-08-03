BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $storefront_design_precondition$
BEGIN
  IF pg_catalog.to_regclass('saas.stores') IS NULL
     OR pg_catalog.to_regclass('saas.store_media_namespaces') IS NULL
     OR pg_catalog.to_regclass('saas.products') IS NULL
     OR pg_catalog.to_regclass('saas.catalog_categories') IS NULL
     OR pg_catalog.to_regclass('saas.merchant_admin_records') IS NULL
     OR pg_catalog.to_regclass('saas.store_domains') IS NULL
     OR pg_catalog.to_regprocedure('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text)') IS NULL THEN
    RAISE EXCEPTION 'STOREFRONT_DESIGN_WORKSPACE_PRECONDITION_FAILED';
  END IF;
END
$storefront_design_precondition$;

CREATE FUNCTION saas.storefront_design_timestamp(p_value timestamptz)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
$function$;

CREATE FUNCTION saas.storefront_design_exact_keys(p_value jsonb,p_keys text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_typeof(p_value)='object'
    AND (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.jsonb_object_keys(p_value) key)
      = (SELECT pg_catalog.array_agg(key ORDER BY key) FROM pg_catalog.unnest(p_keys) key)
$function$;

CREATE FUNCTION saas.storefront_design_text_valid(p_value jsonb,p_min integer,p_max integer)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT pg_catalog.jsonb_typeof(p_value)='string'
    AND pg_catalog.octet_length(p_value#>>'{}') BETWEEN p_min AND p_max
    AND p_value#>>'{}'=pg_catalog.btrim(p_value#>>'{}')
    AND p_value#>>'{}'!~'[[:cntrl:]]'
$function$;

CREATE FUNCTION saas.storefront_design_timestamp_value(p_value jsonb)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
BEGIN
  IF pg_catalog.jsonb_typeof(p_value)<>'string'
     OR p_value#>>'{}'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$' THEN
    RETURN NULL;
  END IF;
  RETURN (p_value#>>'{}')::timestamptz;
EXCEPTION WHEN others THEN RETURN NULL;
END
$function$;

CREATE FUNCTION saas.storefront_design_timestamp_valid(p_value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
  SELECT saas.storefront_design_timestamp_value(p_value) IS NOT NULL
    AND saas.storefront_design_timestamp(saas.storefront_design_timestamp_value(p_value))=p_value#>>'{}'
$function$;

CREATE TABLE saas.storefront_design_media(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  object_key text NOT NULL UNIQUE,
  public_url text NOT NULL UNIQUE,
  media_type text NOT NULL CHECK(media_type IN('image/jpeg','image/png','image/webp')),
  alt_text text NOT NULL,
  width integer NOT NULL CHECK(width BETWEEN 1 AND 8192),
  height integer NOT NULL CHECK(height BETWEEN 1 AND 8192),
  content_length bigint NOT NULL CHECK(content_length BETWEEN 1 AND 10485760),
  content_sha256 text NOT NULL CHECK(content_sha256~'^[a-f0-9]{64}$'),
  status text NOT NULL DEFAULT 'active' CHECK(status IN('active','deleted')),
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(store_id,id),
  CHECK(object_key~('^stores/'||store_id::text||'/design/'||id::text||'[.](jpg|png|webp)$')),
  CHECK(public_url='https://media.saas-staging.celebix.site/'||object_key),
  CHECK(alt_text=pg_catalog.btrim(alt_text) AND pg_catalog.octet_length(alt_text)<=500 AND alt_text!~'[[:cntrl:]]'),
  CHECK((media_type='image/jpeg' AND object_key~'[.]jpg$') OR (media_type='image/png' AND object_key~'[.]png$') OR (media_type='image/webp' AND object_key~'[.]webp$')),
  CHECK(updated_at>=created_at)
);

CREATE FUNCTION saas.storefront_design_media_reference_valid(p_store_id uuid,p_value jsonb,p_allow_legacy boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE media_id uuid;
BEGIN
  IF p_value='null'::jsonb THEN RETURN true; END IF;
  IF pg_catalog.jsonb_typeof(p_value)<>'object' OR NOT (p_value?'kind') THEN RETURN false; END IF;
  IF p_value->>'kind'='media' THEN
    IF NOT saas.storefront_design_exact_keys(p_value,ARRAY['kind','mediaId'])
       OR p_value->>'mediaId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false; END IF;
    media_id:=(p_value->>'mediaId')::uuid;
    RETURN EXISTS(SELECT 1 FROM saas.storefront_design_media media WHERE media.store_id=p_store_id AND media.id=media_id AND media.status='active');
  END IF;
  IF p_value->>'kind'='legacy_https' THEN
    RETURN p_allow_legacy
      AND saas.storefront_design_exact_keys(p_value,ARRAY['kind','url'])
      AND saas.storefront_design_text_valid(p_value->'url',1,2048)
      AND p_value->>'url'~'^https://[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+/[A-Za-z0-9._~!$&''()*+,;=:@%/-]*$'
      AND p_value->>'url'!~'(^|/)[.][.]?(/|$)';
  END IF;
  RETURN false;
EXCEPTION WHEN others THEN RETURN false;
END
$function$;

CREATE FUNCTION saas.storefront_design_destination_valid(p_store_id uuid,p_value jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE resource_id uuid; destination_kind text;
BEGIN
  IF pg_catalog.jsonb_typeof(p_value)<>'object' OR NOT (p_value?'kind') THEN RETURN false; END IF;
  destination_kind:=p_value->>'kind';
  IF destination_kind='none' THEN RETURN saas.storefront_design_exact_keys(p_value,ARRAY['kind']); END IF;
  IF destination_kind NOT IN('product','collection','page')
     OR NOT saas.storefront_design_exact_keys(p_value,ARRAY['kind','resourceId'])
     OR p_value->>'resourceId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN false; END IF;
  resource_id:=(p_value->>'resourceId')::uuid;
  IF destination_kind='product' THEN
    RETURN EXISTS(SELECT 1 FROM saas.products product WHERE product.store_id=p_store_id AND product.id=resource_id AND product.status='active');
  ELSIF destination_kind='collection' THEN
    RETURN EXISTS(SELECT 1 FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=resource_id AND category.status='active');
  END IF;
  RETURN EXISTS(SELECT 1 FROM saas.merchant_admin_records page WHERE page.store_id=p_store_id AND page.id=resource_id AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true');
EXCEPTION WHEN others THEN RETURN false;
END
$function$;

CREATE FUNCTION saas.storefront_design_document_valid(p_store_id uuid,p_config jsonb,p_allow_legacy boolean)
RETURNS boolean
LANGUAGE plpgsql
STABLE
STRICT
SET search_path=pg_catalog,saas
AS $function$
DECLARE item jsonb; starts_at timestamptz; ends_at timestamptz;
BEGIN
  IF pg_catalog.pg_column_size(p_config)>65536
     OR NOT saas.storefront_design_exact_keys(p_config,ARRAY['schemaVersion','brand','hero','promotion','announcement'])
     OR p_config->>'schemaVersion'<>'1'
     OR NOT saas.storefront_design_exact_keys(p_config->'brand',ARRAY['logo','favicon','primaryColor','accentColor','backgroundColor','textColor','fontFamily'])
     OR NOT saas.storefront_design_media_reference_valid(p_store_id,p_config->'brand'->'logo',p_allow_legacy)
     OR NOT saas.storefront_design_media_reference_valid(p_store_id,p_config->'brand'->'favicon',p_allow_legacy)
     OR p_config->'brand'->>'primaryColor'!~'^#[0-9A-F]{6}$'
     OR p_config->'brand'->>'accentColor'!~'^#[0-9A-F]{6}$'
     OR p_config->'brand'->>'backgroundColor'!~'^#[0-9A-F]{6}$'
     OR p_config->'brand'->>'textColor'!~'^#[0-9A-F]{6}$'
     OR p_config->'brand'->>'fontFamily' NOT IN('inter','manrope','playfair','montserrat')
     OR NOT saas.storefront_design_exact_keys(p_config->'hero',ARRAY['headline','body','image','destination','enabled'])
     OR NOT saas.storefront_design_text_valid(p_config->'hero'->'headline',1,120)
     OR NOT saas.storefront_design_text_valid(p_config->'hero'->'body',0,500)
     OR NOT saas.storefront_design_media_reference_valid(p_store_id,p_config->'hero'->'image',p_allow_legacy)
     OR NOT saas.storefront_design_destination_valid(p_store_id,p_config->'hero'->'destination')
     OR pg_catalog.jsonb_typeof(p_config->'hero'->'enabled')<>'boolean'
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

CREATE TABLE saas.storefront_designs(
  store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
  schema_version integer NOT NULL DEFAULT 1 CHECK(schema_version=1),
  draft_config jsonb NOT NULL,
  published_config jsonb NOT NULL,
  draft_version bigint NOT NULL DEFAULT 1 CHECK(draft_version>0),
  published_version bigint NOT NULL DEFAULT 1 CHECK(published_version>0),
  draft_updated_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL,
  draft_updated_by uuid NOT NULL,
  published_by uuid NOT NULL,
  CHECK(saas.storefront_design_document_valid(store_id,draft_config,true)),
  CHECK(saas.storefront_design_document_valid(store_id,published_config,true)),
  CHECK(draft_updated_at>=published_at OR draft_version=1)
);

CREATE TABLE saas.storefront_design_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  operation_kind text NOT NULL CHECK(operation_kind IN('save_draft','publish','media_reserve')),
  payload_fingerprint text NOT NULL CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  result_payload jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=131072),
  committed_at timestamptz NOT NULL
);
CREATE INDEX storefront_design_operations_store_idx ON saas.storefront_design_operations(store_id,committed_at DESC,operation_id DESC);

CREATE TABLE saas.storefront_design_events(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  actor_id uuid NOT NULL,
  event_kind text NOT NULL CHECK(event_kind IN('draft_saved','published','media_reserved')),
  draft_version bigint NOT NULL CHECK(draft_version>0),
  published_version bigint NOT NULL CHECK(published_version>0),
  summary jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(summary)='object' AND pg_catalog.pg_column_size(summary)<=65536),
  occurred_at timestamptz NOT NULL
);
CREATE INDEX storefront_design_events_store_idx ON saas.storefront_design_events(store_id,occurred_at DESC,id DESC);

CREATE FUNCTION saas.guard_storefront_design_operation_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN RAISE EXCEPTION 'STOREFRONT_DESIGN_OPERATION_IMMUTABLE'; END
$function$;
CREATE TRIGGER storefront_design_operations_immutable
BEFORE UPDATE OR DELETE ON saas.storefront_design_operations
FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_design_operation_immutability();

CREATE FUNCTION saas.guard_storefront_design_event_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN RAISE EXCEPTION 'STOREFRONT_DESIGN_EVENT_IMMUTABLE'; END
$function$;
CREATE TRIGGER storefront_design_events_immutable
BEFORE UPDATE OR DELETE ON saas.storefront_design_events
FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_design_event_immutability();

ALTER TABLE saas.storefront_designs ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_designs FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_design_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_design_media FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_design_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_design_operations FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_design_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_design_events FORCE ROW LEVEL SECURITY;

CREATE FUNCTION saas.storefront_design_authority_error(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_write boolean
)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF p_write THEN
    RETURN saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');
  END IF;
  RETURN saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');
END
$function$;

CREATE FUNCTION saas.storefront_design_public_media(p_store_id uuid,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE result jsonb;
BEGIN
  IF p_value='null'::jsonb THEN RETURN 'null'::jsonb; END IF;
  IF p_value->>'kind'='legacy_https' THEN RETURN pg_catalog.jsonb_build_object('url',p_value->>'url','altText',''); END IF;
  SELECT pg_catalog.jsonb_build_object('url',media.public_url,'altText',media.alt_text) INTO result
  FROM saas.storefront_design_media media
  WHERE media.store_id=p_store_id AND media.id=(p_value->>'mediaId')::uuid AND media.status='active';
  RETURN COALESCE(result,'null'::jsonb);
END
$function$;

CREATE FUNCTION saas.storefront_design_public_destination(p_store_id uuid,p_value jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE resource_id uuid; result jsonb;
BEGIN
  IF p_value->>'kind'='none' THEN RETURN 'null'::jsonb; END IF;
  resource_id:=(p_value->>'resourceId')::uuid;
  IF p_value->>'kind'='product' THEN
    SELECT pg_catalog.jsonb_build_object('path','/products/'||product.slug) INTO result FROM saas.products product WHERE product.store_id=p_store_id AND product.id=resource_id AND product.status='active';
  ELSIF p_value->>'kind'='collection' THEN
    SELECT pg_catalog.jsonb_build_object('path','/collections/'||category.slug) INTO result FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=resource_id AND category.status='active';
  ELSE
    SELECT pg_catalog.jsonb_build_object('path','/pages/'||(page.config->>'slug')) INTO result FROM saas.merchant_admin_records page WHERE page.store_id=p_store_id AND page.id=resource_id AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true';
  END IF;
  RETURN COALESCE(result,'null'::jsonb);
END
$function$;

CREATE FUNCTION saas.storefront_design_public_payload(p_store_id uuid,p_config jsonb,p_version bigint,p_published_at timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'publicationVersion',p_version,
    'publishedAt',saas.storefront_design_timestamp(p_published_at),
    'brand',pg_catalog.jsonb_build_object(
      'logo',saas.storefront_design_public_media(p_store_id,p_config->'brand'->'logo'),
      'favicon',saas.storefront_design_public_media(p_store_id,p_config->'brand'->'favicon'),
      'primaryColor',p_config->'brand'->>'primaryColor','accentColor',p_config->'brand'->>'accentColor',
      'backgroundColor',p_config->'brand'->>'backgroundColor','textColor',p_config->'brand'->>'textColor',
      'fontFamily',p_config->'brand'->>'fontFamily'
    ),
    'hero',pg_catalog.jsonb_build_object(
      'headline',p_config->'hero'->>'headline','body',p_config->'hero'->>'body',
      'image',saas.storefront_design_public_media(p_store_id,p_config->'hero'->'image'),
      'destination',saas.storefront_design_public_destination(p_store_id,p_config->'hero'->'destination'),
      'enabled',p_config->'hero'->'enabled'
    ),
    'promotion',pg_catalog.jsonb_build_object(
      'headline',p_config->'promotion'->>'headline','body',p_config->'promotion'->>'body',
      'destination',saas.storefront_design_public_destination(p_store_id,p_config->'promotion'->'destination'),
      'startsAt',p_config->'promotion'->'startsAt','endsAt',p_config->'promotion'->'endsAt','enabled',p_config->'promotion'->'enabled'
    ),
    'announcement',p_config->'announcement'
  )
$function$;

CREATE FUNCTION saas.storefront_design_workspace_payload(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',1,'draftVersion',design.draft_version,'publishedVersion',design.published_version,
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

INSERT INTO saas.storefront_designs(
  store_id,draft_config,published_config,draft_version,published_version,draft_updated_at,published_at,draft_updated_by,published_by
)
SELECT store.id,seed.config,seed.config,1,1,store.updated_at,store.updated_at,'00000000-0000-4000-8000-000000000000'::uuid,'00000000-0000-4000-8000-000000000000'::uuid
FROM saas.stores store
LEFT JOIN LATERAL(SELECT record.config FROM saas.merchant_admin_records record WHERE record.store_id=store.id AND record.record_kind='hero_banner' AND record.status='active' ORDER BY record.updated_at DESC,record.id DESC LIMIT 1) hero ON true
LEFT JOIN LATERAL(SELECT record.config FROM saas.merchant_admin_records record WHERE record.store_id=store.id AND record.record_kind='promotion_banner' AND record.status='active' ORDER BY record.updated_at DESC,record.id DESC LIMIT 1) promotion ON true
LEFT JOIN LATERAL(SELECT record.config FROM saas.merchant_admin_records record WHERE record.store_id=store.id AND record.record_kind='marquee_setting' AND record.status='active' ORDER BY record.updated_at DESC,record.id DESC LIMIT 1) marquee ON true
CROSS JOIN LATERAL(
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'brand',pg_catalog.jsonb_build_object('logo',NULL,'favicon',NULL,'primaryColor','#FF5A00','accentColor','#171717','backgroundColor','#FFFFFF','textColor','#171717','fontFamily','inter'),
    'hero',pg_catalog.jsonb_build_object('headline',COALESCE(hero.config->>'headline',store.name),'body',COALESCE(hero.config->>'body',''),'image',CASE WHEN hero.config?'imageUrl' THEN pg_catalog.jsonb_build_object('kind','legacy_https','url',hero.config->>'imageUrl') ELSE 'null'::jsonb END,'destination',pg_catalog.jsonb_build_object('kind','none'),'enabled',COALESCE((hero.config->>'enabled')::boolean,true)),
    'promotion',pg_catalog.jsonb_build_object('headline',COALESCE(promotion.config->>'headline','Ücretsiz kargo'),'body',COALESCE(promotion.config->>'body',''),'destination',pg_catalog.jsonb_build_object('kind','none'),'startsAt',COALESCE(promotion.config->'startsAt','null'::jsonb),'endsAt',COALESCE(promotion.config->'endsAt','null'::jsonb),'enabled',COALESCE((promotion.config->>'enabled')::boolean,false)),
    'announcement',pg_catalog.jsonb_build_object('items',COALESCE(marquee.config->'items',pg_catalog.jsonb_build_array(store.name)),'icon',COALESCE(marquee.config->>'icon','none'),'speed',COALESCE(marquee.config->>'speed','normal'),'direction',COALESCE(marquee.config->>'direction','left'),'animation',COALESCE(marquee.config->>'animation','continuous'),'enabled',COALESCE((marquee.config->>'enabled')::boolean,false))
  ) config
) seed
WHERE saas.storefront_design_document_valid(store.id,seed.config,true)
ON CONFLICT(store_id) DO NOTHING;

CREATE FUNCTION saas.storefront_design_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; payload jsonb;
BEGIN
  authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,false);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  payload:=saas.storefront_design_workspace_payload(p_store_id);
  IF payload IS NULL THEN RETURN QUERY SELECT 'design_not_found',NULL::jsonb; ELSE RETURN QUERY SELECT 'found',payload; END IF;
END
$function$;

CREATE FUNCTION saas.storefront_design_save_draft(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_expected_draft_version bigint,p_config jsonb
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.storefront_design_operations%ROWTYPE; current_design saas.storefront_designs%ROWTYPE; result jsonb;
BEGIN
  authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_draft_version<1 OR NOT saas.storefront_design_document_valid(p_store_id,p_config,false) THEN RETURN QUERY SELECT 'design_input_invalid',NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.storefront_design_operations operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=p_store_id AND existing.operation_kind='save_draft' AND existing.payload_fingerprint=p_payload_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
    RETURN;
  END IF;
  SELECT * INTO current_design FROM saas.storefront_designs design WHERE design.store_id=p_store_id FOR UPDATE;
  authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF current_design.store_id IS NULL THEN RETURN QUERY SELECT 'design_not_found',NULL::jsonb; RETURN; END IF;
  IF current_design.draft_version<>p_expected_draft_version THEN RETURN QUERY SELECT 'draft_version_conflict',pg_catalog.jsonb_build_object('draftVersion',current_design.draft_version); RETURN; END IF;
  UPDATE saas.storefront_designs SET draft_config=p_config,draft_version=draft_version+1,draft_updated_at=p_now,draft_updated_by=p_principal_id WHERE store_id=p_store_id
  RETURNING * INTO current_design;
  result:=pg_catalog.jsonb_build_object('draftVersion',current_design.draft_version,'draftUpdatedAt',saas.storefront_design_timestamp(current_design.draft_updated_at),'draft',current_design.draft_config);
  INSERT INTO saas.storefront_design_operations VALUES(p_operation_id,p_store_id,'save_draft',p_payload_fingerprint,result,p_now);
  INSERT INTO saas.storefront_design_events VALUES(p_operation_id,p_store_id,p_principal_id,'draft_saved',current_design.draft_version,current_design.published_version,pg_catalog.jsonb_build_object('operationId',p_operation_id),p_now);
  RETURN QUERY SELECT 'saved',result;
END
$function$;

CREATE FUNCTION saas.storefront_design_publish(
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
  IF NOT saas.storefront_design_document_valid(p_store_id,current_design.draft_config,false) THEN RETURN QUERY SELECT 'design_publish_invalid',NULL::jsonb; RETURN; END IF;
  UPDATE saas.storefront_designs SET published_config=draft_config,published_version=published_version+1,published_at=p_now,published_by=p_principal_id WHERE store_id=p_store_id
  RETURNING * INTO current_design;
  result:=pg_catalog.jsonb_build_object('draftVersion',current_design.draft_version,'publishedVersion',current_design.published_version,'publishedAt',saas.storefront_design_timestamp(current_design.published_at),'published',saas.storefront_design_public_payload(p_store_id,current_design.published_config,current_design.published_version,current_design.published_at));
  INSERT INTO saas.storefront_design_operations VALUES(p_operation_id,p_store_id,'publish',p_payload_fingerprint,result,p_now);
  INSERT INTO saas.storefront_design_events VALUES(p_operation_id,p_store_id,p_principal_id,'published',current_design.draft_version,current_design.published_version,pg_catalog.jsonb_build_object('operationId',p_operation_id),p_now);
  RETURN QUERY SELECT 'published',result;
END
$function$;

CREATE FUNCTION saas.storefront_design_media_reserve(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_payload_fingerprint text,p_media_id uuid,p_media_type text,p_alt_text text,p_width integer,p_height integer,p_content_length bigint,p_content_sha256 text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.storefront_design_operations%ROWTYPE; extension text; object_key text; public_url text; result jsonb; versions saas.storefront_designs%ROWTYPE;
BEGIN
  authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_media_id IS NULL OR p_payload_fingerprint!~'^[a-f0-9]{64}$' OR p_media_type NOT IN('image/jpeg','image/png','image/webp') OR p_alt_text<>pg_catalog.btrim(p_alt_text) OR pg_catalog.octet_length(p_alt_text)>500 OR p_alt_text~'[[:cntrl:]]' OR p_width NOT BETWEEN 1 AND 8192 OR p_height NOT BETWEEN 1 AND 8192 OR p_content_length NOT BETWEEN 1 AND 10485760 OR p_content_sha256!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'design_media_invalid',NULL::jsonb; RETURN; END IF;
  SELECT * INTO existing FROM saas.storefront_design_operations operation WHERE operation.operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id=p_store_id AND existing.operation_kind='media_reserve' AND existing.payload_fingerprint=p_payload_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',existing.result_payload; ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; END IF;
    RETURN;
  END IF;
  PERFORM 1 FROM saas.stores store WHERE store.id=p_store_id FOR UPDATE;
  authority_error:=saas.storefront_design_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,true);
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.store_media_namespaces namespace WHERE namespace.store_id=p_store_id AND namespace.status='active') THEN RETURN QUERY SELECT 'media_namespace_unavailable',NULL::jsonb; RETURN; END IF;
  extension:=CASE p_media_type WHEN 'image/jpeg' THEN 'jpg' WHEN 'image/png' THEN 'png' ELSE 'webp' END;
  object_key:='stores/'||p_store_id::text||'/design/'||p_media_id::text||'.'||extension;
  public_url:='https://media.saas-staging.celebix.site/'||object_key;
  INSERT INTO saas.storefront_design_media(id,store_id,object_key,public_url,media_type,alt_text,width,height,content_length,content_sha256,status,created_at,updated_at)
  VALUES(p_media_id,p_store_id,object_key,public_url,p_media_type,p_alt_text,p_width,p_height,p_content_length,p_content_sha256,'active',p_now,p_now);
  SELECT * INTO versions FROM saas.storefront_designs design WHERE design.store_id=p_store_id;
  result:=pg_catalog.jsonb_build_object('id',p_media_id,'url',public_url,'altText',p_alt_text,'mediaType',p_media_type,'width',p_width,'height',p_height,'objectKey',object_key);
  INSERT INTO saas.storefront_design_operations VALUES(p_operation_id,p_store_id,'media_reserve',p_payload_fingerprint,result,p_now);
  INSERT INTO saas.storefront_design_events VALUES(p_operation_id,p_store_id,p_principal_id,'media_reserved',versions.draft_version,versions.published_version,pg_catalog.jsonb_build_object('mediaId',p_media_id),p_now);
  RETURN QUERY SELECT 'reserved',result;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'design_media_conflict',NULL::jsonb;
END
$function$;

CREATE FUNCTION saas.storefront_design_get_public(p_store_id uuid,p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE current_design saas.storefront_designs%ROWTYPE;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname)
     OR NOT EXISTS(SELECT 1 FROM saas.store_domains domain WHERE domain.store_id=p_store_id AND domain.hostname=p_hostname AND domain.status='active') THEN RETURN QUERY SELECT 'storefront_not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO current_design FROM saas.storefront_designs design WHERE design.store_id=p_store_id;
  IF current_design.store_id IS NULL THEN RETURN QUERY SELECT 'storefront_not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',saas.storefront_design_public_payload(p_store_id,current_design.published_config,current_design.published_version,current_design.published_at);
END
$function$;

REVOKE ALL ON TABLE saas.storefront_designs,saas.storefront_design_media,saas.storefront_design_operations,saas.storefront_design_events FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
REVOKE ALL ON FUNCTION
  saas.storefront_design_timestamp(timestamptz),saas.storefront_design_exact_keys(jsonb,text[]),saas.storefront_design_text_valid(jsonb,integer,integer),
  saas.storefront_design_timestamp_value(jsonb),saas.storefront_design_timestamp_valid(jsonb),saas.storefront_design_media_reference_valid(uuid,jsonb,boolean),
  saas.storefront_design_destination_valid(uuid,jsonb),saas.storefront_design_document_valid(uuid,jsonb,boolean),
  saas.guard_storefront_design_operation_immutability(),saas.guard_storefront_design_event_immutability(),
  saas.storefront_design_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,boolean),saas.storefront_design_public_media(uuid,jsonb),
  saas.storefront_design_public_destination(uuid,jsonb),saas.storefront_design_public_payload(uuid,jsonb,bigint,timestamptz),saas.storefront_design_workspace_payload(uuid),
  saas.storefront_design_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz),
  saas.storefront_design_save_draft(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb),
  saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,bigint),
  saas.storefront_design_media_reserve(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,integer,integer,bigint,text),
  saas.storefront_design_get_public(uuid,text,timestamptz)
FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

GRANT EXECUTE ON FUNCTION saas.storefront_design_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.storefront_design_save_draft(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.storefront_design_publish(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,bigint,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.storefront_design_media_reserve(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,text,integer,integer,bigint,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.storefront_design_get_public(uuid,text,timestamp with time zone) TO celebix_saas_host_resolver;

COMMIT;
