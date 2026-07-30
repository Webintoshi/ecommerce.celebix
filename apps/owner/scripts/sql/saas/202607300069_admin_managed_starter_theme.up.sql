-- Phase 3Y admin-managed starter-theme public presentation authority.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

DO $f$
BEGIN
  IF pg_catalog.to_regprocedure('saas.resolve_public_storefront(text,timestamp with time zone)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_required_action(text,boolean)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid(text,jsonb)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)') IS NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid)') IS NULL
    OR pg_catalog.to_regprocedure('saas.public_starter_presentation(uuid,timestamp with time zone)') IS NOT NULL
    OR pg_catalog.to_regprocedure('saas.public_starter_presentation(uuid,timestamp with time zone,boolean)') IS NOT NULL
    OR pg_catalog.to_regprocedure('saas.merchant_admin_config_valid_without_starter_theme(text,jsonb)') IS NOT NULL
  THEN
    RAISE EXCEPTION 'ADMIN_MANAGED_STARTER_THEME_SOURCE_INVALID';
  END IF;
END
$f$;

LOCK TABLE saas.merchant_admin_records IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_events IN ACCESS EXCLUSIVE MODE;
LOCK TABLE saas.merchant_admin_operations IN ACCESS EXCLUSIVE MODE;

ALTER TABLE saas.merchant_admin_records
  DROP CONSTRAINT merchant_admin_records_record_kind_check;
ALTER TABLE saas.merchant_admin_records
  ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind IN(
    'discount','lucky_wheel','email_campaign','phone_campaign','whatsapp_campaign','blog_post','page','policy',
    'marketplace_connection','general_setting','language_setting','payment_setting','shipping_setting','administrator_invite',
    'accounting_profile','invoice_integration','seo_control','sitemap','social_preview','code_integration','indexing_request',
    'notification_setting','theme_setting','hero_banner','promotion_banner','marquee_setting','seo_geo_profile',
    'seo_internal_link','seo_content_entry','seo_category_entry','seo_page_entry','seo_product_entry','ai_setting'
  ));

ALTER FUNCTION saas.merchant_admin_required_action(text,boolean)
  RENAME TO merchant_admin_required_action_without_starter_theme;
ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb)
  RENAME TO merchant_admin_config_valid_without_starter_theme;
ALTER FUNCTION saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text)
  RENAME TO merchant_admin_list_without_starter_theme;
ALTER FUNCTION saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text)
  RENAME TO merchant_admin_list_events_without_starter_theme;
ALTER FUNCTION saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid)
  RENAME TO merchant_admin_get_record_without_starter_theme;

REVOKE ALL ON FUNCTION
  saas.merchant_admin_required_action_without_starter_theme(text,boolean),
  saas.merchant_admin_config_valid_without_starter_theme(text,jsonb),
  saas.merchant_admin_list_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_list_events_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_get_record_without_starter_theme(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

CREATE FUNCTION saas.merchant_admin_required_action(p_kind text,p_mutation boolean)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_kind='theme_setting'
   THEN CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END
   ELSE saas.merchant_admin_required_action_without_starter_theme(p_kind,p_mutation)
 END
$f$;

CREATE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_kind='theme_setting' THEN
   pg_catalog.jsonb_typeof(p_config)='object'
   AND pg_catalog.octet_length(p_config::text)<=16384
   AND NOT EXISTS(
     SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) AS field(key)
     WHERE field.key NOT IN(
       'colorScheme','headingStyle','productCardStyle','productImageRatio',
       'homeProductLimit','showBrandStory'
     )
   )
   AND (NOT p_config?'colorScheme' OR p_config->>'colorScheme' IN('neutral','warm','dark','ocean'))
   AND (NOT p_config?'headingStyle' OR p_config->>'headingStyle' IN('serif','sans'))
   AND (NOT p_config?'productCardStyle' OR p_config->>'productCardStyle' IN('editorial','compact'))
   AND (NOT p_config?'productImageRatio' OR p_config->>'productImageRatio' IN('portrait','square'))
   AND (NOT p_config?'homeProductLimit' OR (
     pg_catalog.jsonb_typeof(p_config->'homeProductLimit')='number'
     AND (p_config->>'homeProductLimit')::numeric=pg_catalog.trunc((p_config->>'homeProductLimit')::numeric)
     AND (p_config->>'homeProductLimit')::integer IN(4,8,12)
   ))
   AND (NOT p_config?'showBrandStory' OR pg_catalog.jsonb_typeof(p_config->'showBrandStory')='boolean')
 WHEN p_kind='hero_banner' THEN
   NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) AS field(key) WHERE field.key NOT IN('headline','body','assetId','destination','enabled'))
   AND saas.merchant_admin_config_valid_without_starter_theme(p_kind,p_config-'assetId')
   AND (NOT p_config?'assetId' OR (pg_catalog.jsonb_typeof(p_config->'assetId')='string' AND p_config->>'assetId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
   AND (NOT p_config?'body' OR pg_catalog.char_length(p_config->>'body')<=1000)
   AND (NOT p_config?'destination' OR (pg_catalog.char_length(p_config->>'destination')<=512 AND pg_catalog.strpos(p_config->>'destination','?')=0 AND pg_catalog.strpos(p_config->>'destination','#')=0 AND pg_catalog.strpos(p_config->>'destination','\\')=0 AND pg_catalog.strpos(p_config->>'destination','//')=0))
 WHEN p_kind='promotion_banner' THEN
   saas.merchant_admin_config_valid_without_starter_theme(p_kind,p_config)
   AND (NOT p_config?'body' OR pg_catalog.char_length(p_config->>'body')<=1000)
   AND (NOT p_config?'destination' OR (pg_catalog.char_length(p_config->>'destination')<=512 AND pg_catalog.strpos(p_config->>'destination','?')=0 AND pg_catalog.strpos(p_config->>'destination','#')=0 AND pg_catalog.strpos(p_config->>'destination','\\')=0 AND pg_catalog.strpos(p_config->>'destination','//')=0))
   AND (p_config->'enabled' IS DISTINCT FROM 'true'::jsonb OR p_config?'headline')
 WHEN p_kind='marquee_setting' THEN
   saas.merchant_admin_config_valid_without_starter_theme(p_kind,p_config)
   AND (p_config->'enabled' IS DISTINCT FROM 'true'::jsonb OR p_config?'items')
 WHEN p_kind='seo_control' THEN
   saas.merchant_admin_config_valid_without_starter_theme(p_kind,p_config)
   AND (NOT p_config?'metaDescription' OR pg_catalog.char_length(p_config->>'metaDescription')<=500)
 WHEN p_kind='social_preview' THEN
   NOT EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(p_config) AS field(key) WHERE field.key NOT IN('title','description','assetId'))
   AND saas.merchant_admin_config_valid_without_starter_theme(p_kind,p_config-'assetId')
   AND (NOT p_config?'assetId' OR (pg_catalog.jsonb_typeof(p_config->'assetId')='string' AND p_config->>'assetId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'))
 ELSE saas.merchant_admin_config_valid_without_starter_theme(p_kind,p_config) END
$f$;

CREATE FUNCTION saas.merchant_admin_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
  IF p_kind IS DISTINCT FROM 'theme_setting' THEN
    RETURN QUERY SELECT * FROM saas.merchant_admin_list_without_starter_theme(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind
    );
    RETURN;
  END IF;
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object(
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(saas.merchant_admin_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC)
      FROM (
        SELECT id,updated_at FROM saas.merchant_admin_records
        WHERE store_id=p_store_id AND record_kind=p_kind AND status<>'archived'
        ORDER BY updated_at DESC,id DESC LIMIT 200
      ) r
    ),'[]'::jsonb)
  );
END
$f$;

CREATE FUNCTION saas.merchant_admin_list_events(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
  IF p_kind IS DISTINCT FROM 'theme_setting' THEN
    RETURN QUERY SELECT * FROM saas.merchant_admin_list_events_without_starter_theme(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind
    );
    RETURN;
  END IF;
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object(
    'items',COALESCE((
      SELECT pg_catalog.jsonb_agg(saas.merchant_admin_event_projection(p_store_id,e.id) ORDER BY e.occurred_at DESC,e.id DESC)
      FROM (
        SELECT id,occurred_at FROM saas.merchant_admin_events
        WHERE store_id=p_store_id AND record_kind=p_kind
        ORDER BY occurred_at DESC,id DESC LIMIT 200
      ) e
    ),'[]'::jsonb)
  );
END
$f$;

CREATE FUNCTION saas.merchant_admin_get_record(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_record_id uuid
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; projected jsonb;
BEGIN
  IF p_kind IS DISTINCT FROM 'theme_setting' THEN
    RETURN QUERY SELECT * FROM saas.merchant_admin_get_record_without_starter_theme(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,p_record_id
    );
    RETURN;
  END IF;
  IF p_record_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT saas.merchant_admin_projection(p_store_id,record.id) INTO projected
  FROM saas.merchant_admin_records AS record
  WHERE record.store_id=p_store_id AND record.id=p_record_id AND record.record_kind=p_kind;
  IF projected IS NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',projected;
END
$f$;

CREATE TABLE saas.storefront_assets(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  asset_kind text NOT NULL,
  object_key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  media_type text NOT NULL,
  alt_text text NOT NULL DEFAULT '',
  width integer NOT NULL,
  height integer NOT NULL,
  byte_size bigint NOT NULL,
  status text NOT NULL,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  archived_at timestamptz,
  version bigint NOT NULL DEFAULT 1,
  CONSTRAINT storefront_assets_store_id_key UNIQUE(store_id,id),
  CONSTRAINT storefront_assets_kind_check CHECK(asset_kind IN('logo','hero','social','favicon')),
  CONSTRAINT storefront_assets_type_check CHECK(media_type IN('image/jpeg','image/png','image/webp')),
  CONSTRAINT storefront_assets_key_check CHECK(
    object_key='stores/'||store_id::text||'/storefront/'||asset_kind||'/'||id::text||
      CASE media_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' WHEN 'image/webp' THEN '.webp' ELSE '' END
  ),
  CONSTRAINT storefront_assets_url_check CHECK(
    public_url=pg_catalog.btrim(public_url) AND pg_catalog.char_length(public_url) BETWEEN 1 AND 2048
    AND public_url~'^https://[^/?#[:space:][:cntrl:]]+/' AND public_url!~'[?#[:space:][:cntrl:]]'
    AND pg_catalog.right(public_url,pg_catalog.char_length(object_key)+1)='/'||object_key
  ),
  CONSTRAINT storefront_assets_alt_check CHECK(alt_text=pg_catalog.btrim(alt_text) AND pg_catalog.char_length(alt_text)<=500 AND alt_text!~'[[:cntrl:]]'),
  CONSTRAINT storefront_assets_dimensions_check CHECK(width BETWEEN 1 AND 8192 AND height BETWEEN 1 AND 8192),
  CONSTRAINT storefront_assets_size_check CHECK(byte_size BETWEEN 1 AND 5242880),
  CONSTRAINT storefront_assets_status_check CHECK(status IN('active','archived')),
  CONSTRAINT storefront_assets_archive_check CHECK((status='archived' AND archived_at IS NOT NULL) OR (status='active' AND archived_at IS NULL)),
  CONSTRAINT storefront_assets_timestamp_check CHECK(updated_at>=created_at AND (archived_at IS NULL OR (archived_at>=created_at AND updated_at>=archived_at))),
  CONSTRAINT storefront_assets_version_check CHECK(version>0)
);
CREATE INDEX storefront_assets_store_kind_status_idx ON saas.storefront_assets(store_id,asset_kind,status,updated_at DESC,id DESC);

CREATE TABLE saas.storefront_asset_operations(
  operation_id uuid PRIMARY KEY,
  store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,
  operation_kind text NOT NULL,
  payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL,
  committed_at timestamptz NOT NULL,
  CONSTRAINT storefront_asset_operations_kind_check CHECK(operation_kind IN('create_asset','archive_asset')),
  CONSTRAINT storefront_asset_operations_fingerprint_check CHECK(payload_fingerprint~'^[a-f0-9]{64}$'),
  CONSTRAINT storefront_asset_operations_payload_check CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=16384)
);
CREATE INDEX storefront_asset_operations_store_idx ON saas.storefront_asset_operations(store_id,committed_at DESC,operation_id);

CREATE FUNCTION saas.guard_storefront_asset_authority()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
  IF TG_OP='UPDATE' AND (
    NEW.id<>OLD.id OR NEW.store_id<>OLD.store_id OR NEW.asset_kind<>OLD.asset_kind OR NEW.object_key<>OLD.object_key
    OR NEW.public_url<>OLD.public_url OR NEW.media_type<>OLD.media_type OR NEW.width<>OLD.width OR NEW.height<>OLD.height
    OR NEW.byte_size<>OLD.byte_size OR NEW.created_at<>OLD.created_at OR NEW.version<>OLD.version+1 OR OLD.status='archived'
  ) THEN RAISE EXCEPTION 'STOREFRONT_ASSET_AUTHORITY_IMMUTABLE'; END IF;
  RETURN NEW;
END
$f$;
REVOKE ALL ON FUNCTION saas.guard_storefront_asset_authority() FROM PUBLIC;
CREATE TRIGGER storefront_assets_authority_guard BEFORE INSERT OR UPDATE ON saas.storefront_assets FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_asset_authority();

CREATE FUNCTION saas.guard_storefront_asset_operation_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN RAISE EXCEPTION 'STOREFRONT_ASSET_OPERATION_IMMUTABLE'; END
$f$;
REVOKE ALL ON FUNCTION saas.guard_storefront_asset_operation_mutation() FROM PUBLIC;
CREATE TRIGGER storefront_asset_operations_immutable BEFORE UPDATE OR DELETE ON saas.storefront_asset_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_storefront_asset_operation_mutation();

ALTER TABLE saas.storefront_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_assets FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_asset_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.storefront_asset_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.storefront_assets,saas.storefront_asset_operations FROM PUBLIC,celebix_saas_app,celebix_saas_host_resolver;

CREATE FUNCTION saas.storefront_asset_projection(p_store_id uuid,p_asset_id uuid)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
   'id',asset.id,'storeId',asset.store_id,'kind',asset.asset_kind,'objectKey',asset.object_key,'publicUrl',asset.public_url,
   'mediaType',asset.media_type,'altText',asset.alt_text,'width',asset.width,'height',asset.height,'byteSize',asset.byte_size,
   'status',asset.status,'createdAt',saas.catalog_timestamp(asset.created_at),'updatedAt',saas.catalog_timestamp(asset.updated_at),
   'archivedAt',CASE WHEN asset.archived_at IS NULL THEN NULL ELSE saas.catalog_timestamp(asset.archived_at) END,'version',asset.version
 )) FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND asset.id=p_asset_id
$f$;
REVOKE ALL ON FUNCTION saas.storefront_asset_projection(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION saas.public_storefront_asset(p_store_id uuid,p_kind text,p_config jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object('url',asset.public_url,'mediaType',asset.media_type,'altText',asset.alt_text,'width',asset.width,'height',asset.height)
 FROM saas.storefront_assets asset
 WHERE asset.store_id=p_store_id AND asset.asset_kind=p_kind AND asset.status='active'
   AND (asset.id=CASE
          WHEN p_config->>'assetId'~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            THEN (p_config->>'assetId')::uuid
          ELSE NULL
        END
     OR (NOT p_config?'assetId' AND p_config?'imageUrl' AND asset.public_url=p_config->>'imageUrl'))
 ORDER BY asset.updated_at DESC,asset.id DESC LIMIT 1
$f$;
REVOKE ALL ON FUNCTION saas.public_storefront_asset(uuid,text,jsonb) FROM PUBLIC;

CREATE FUNCTION saas.storefront_asset_operation_replay(p_operation_id uuid,p_store_id uuid,p_kind text,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN operation.operation_kind=p_kind AND operation.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,operation.result_payload
 FROM saas.storefront_asset_operations operation WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id
$f$;
REVOKE ALL ON FUNCTION saas.storefront_asset_operation_replay(uuid,uuid,text,text) FROM PUBLIC;

CREATE FUNCTION saas.storefront_asset_create(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,
 p_operation_id uuid,p_fingerprint text,p_asset_id uuid,p_kind text,p_object_key text,p_public_url text,p_media_type text,p_alt_text text,p_width integer,p_height integer,p_byte_size bigint
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing record; projection jsonb;
BEGIN
 authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 SELECT * INTO existing FROM saas.storefront_asset_operation_replay(p_operation_id,p_store_id,'create_asset',p_fingerprint);
 IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
 PERFORM 1 FROM saas.stores store WHERE store.id=p_store_id AND store.status='active' FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'store_inactive',NULL::jsonb; RETURN; END IF;
 SELECT * INTO existing FROM saas.storefront_asset_operation_replay(p_operation_id,p_store_id,'create_asset',p_fingerprint);
 IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
 IF p_operation_id IS NULL OR p_asset_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_kind IS NULL OR p_kind NOT IN('logo','hero','social','favicon') OR p_media_type IS NULL OR p_media_type NOT IN('image/jpeg','image/png','image/webp') OR p_width IS NULL OR p_width NOT BETWEEN 1 AND 8192 OR p_height IS NULL OR p_height NOT BETWEEN 1 AND 8192 OR p_byte_size IS NULL OR p_byte_size NOT BETWEEN 1 AND 5242880 OR p_object_key IS NULL OR p_public_url IS NULL OR p_alt_text IS NULL OR p_alt_text<>pg_catalog.btrim(p_alt_text) OR pg_catalog.char_length(p_alt_text)>500 OR p_alt_text~'[[:cntrl:]]' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF p_object_key<>'stores/'||p_store_id::text||'/storefront/'||p_kind||'/'||p_asset_id::text||(CASE p_media_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' ELSE '.webp' END) OR p_public_url!~'^https://media(\.saas-staging)?\.celebix\.site/' OR p_public_url~'[?#[:space:][:cntrl:]]' OR pg_catalog.right(p_public_url,pg_catalog.char_length(p_object_key)+1)<>'/'||p_object_key THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF (SELECT pg_catalog.count(*) FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id)>=64 OR (SELECT COALESCE(pg_catalog.sum(media.byte_size),0) FROM saas.product_media media WHERE media.store_id=p_store_id AND media.status IN('pending','active'))+(SELECT COALESCE(pg_catalog.sum(asset.byte_size),0) FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id)+p_byte_size>p_storage_bytes THEN RETURN QUERY SELECT 'asset_limit_reached',NULL::jsonb; RETURN; END IF;
 INSERT INTO saas.storefront_assets(id,store_id,asset_kind,object_key,public_url,media_type,alt_text,width,height,byte_size,status,created_at,updated_at,version) VALUES(p_asset_id,p_store_id,p_kind,p_object_key,p_public_url,p_media_type,p_alt_text,p_width,p_height,p_byte_size,'active',p_now,p_now,1);
 projection:=pg_catalog.jsonb_build_object('asset',saas.storefront_asset_projection(p_store_id,p_asset_id));
 INSERT INTO saas.storefront_asset_operations VALUES(p_operation_id,p_store_id,'create_asset',p_fingerprint,projection,p_now);
 RETURN QUERY SELECT 'committed',projection;
EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
END
$f$;

CREATE FUNCTION saas.storefront_asset_list(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_kind text,p_include_archived boolean
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text;
BEGIN
 authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_include_archived IS NULL OR (p_kind IS NOT NULL AND p_kind NOT IN('logo','hero','social','favicon')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'found',COALESCE(pg_catalog.jsonb_agg(saas.storefront_asset_projection(p_store_id,asset.id) ORDER BY asset.updated_at DESC,asset.id DESC),'[]'::jsonb) FROM saas.storefront_assets asset WHERE asset.store_id=p_store_id AND (p_kind IS NULL OR asset.asset_kind=p_kind) AND (p_include_archived OR asset.status='active');
END
$f$;

CREATE FUNCTION saas.storefront_asset_archive(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_asset_id uuid,p_expected_version bigint
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing record; current_version bigint; projection jsonb;
BEGIN
 authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_asset_id IS NULL OR p_expected_version IS NULL OR p_expected_version<1 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT * INTO existing FROM saas.storefront_asset_operation_replay(p_operation_id,p_store_id,'archive_asset',p_fingerprint); IF FOUND THEN RETURN QUERY SELECT existing.outcome,existing.result_payload; RETURN; END IF;
 SELECT asset.version INTO current_version FROM saas.storefront_assets asset WHERE asset.id=p_asset_id AND asset.store_id=p_store_id AND asset.status='active' FOR UPDATE;
 IF current_version IS NULL THEN RETURN QUERY SELECT 'asset_not_found',NULL::jsonb; RETURN; END IF; IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 UPDATE saas.storefront_assets SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE id=p_asset_id AND store_id=p_store_id;
 projection:=pg_catalog.jsonb_build_object('asset',saas.storefront_asset_projection(p_store_id,p_asset_id)); INSERT INTO saas.storefront_asset_operations VALUES(p_operation_id,p_store_id,'archive_asset',p_fingerprint,projection,p_now); RETURN QUERY SELECT 'committed',projection;
END
$f$;

CREATE FUNCTION saas.storefront_asset_recover(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_storage_bytes bigint,p_now timestamptz,p_operation_id uuid,p_kind text,p_fingerprint text
)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; existing record;
BEGIN
 authority_error:=saas.media_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_storage_bytes,p_now); IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF p_operation_id IS NULL OR p_kind IS NULL OR p_kind NOT IN('create_asset','archive_asset') OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT * INTO existing FROM saas.storefront_asset_operation_replay(p_operation_id,p_store_id,p_kind,p_fingerprint); IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT existing.outcome,existing.result_payload;
END
$f$;

REVOKE ALL ON FUNCTION saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint),saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean),saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint),saas.storefront_asset_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.storefront_asset_create(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,text,text,text,text,integer,integer,bigint),saas.storefront_asset_list(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,text,boolean),saas.storefront_asset_archive(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint),saas.storefront_asset_recover(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,text) TO celebix_saas_app;

CREATE FUNCTION saas.public_starter_presentation(p_store_id uuid, p_now timestamptz, p_allow_index boolean)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE
  store_name text;
  general_config jsonb;
  theme_config jsonb;
  hero_config jsonb;
  promotion_config jsonb;
  marquee_config jsonb;
  seo_config jsonb;
  social_config jsonb;
  hero jsonb;
  promotion jsonb;
  marquee jsonb;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_allow_index IS NULL THEN RETURN NULL; END IF;
  SELECT s.name INTO store_name FROM saas.stores s WHERE s.id=p_store_id AND s.status='active';
  IF store_name IS NULL THEN RETURN NULL; END IF;

  SELECT r.config INTO general_config FROM saas.merchant_admin_records r
   WHERE r.store_id=p_store_id AND r.record_kind='general_setting' AND r.status='active'
   ORDER BY r.updated_at DESC, r.id DESC LIMIT 1;
  SELECT r.config INTO theme_config FROM saas.merchant_admin_records r
   WHERE r.store_id=p_store_id AND r.record_kind='theme_setting' AND r.status='active'
   ORDER BY r.updated_at DESC, r.id DESC LIMIT 1;
  SELECT r.config INTO hero_config FROM saas.merchant_admin_records r
   WHERE r.store_id=p_store_id AND r.record_kind='hero_banner' AND r.status='active'
   ORDER BY r.updated_at DESC, r.id DESC LIMIT 1;
  SELECT r.config INTO promotion_config FROM saas.merchant_admin_records r
   WHERE r.store_id=p_store_id AND r.record_kind='promotion_banner' AND r.status='active'
   ORDER BY r.updated_at DESC, r.id DESC LIMIT 1;
  SELECT r.config INTO marquee_config FROM saas.merchant_admin_records r
   WHERE r.store_id=p_store_id AND r.record_kind='marquee_setting' AND r.status='active'
   ORDER BY r.updated_at DESC, r.id DESC LIMIT 1;
  SELECT r.config INTO seo_config FROM saas.merchant_admin_records r
   WHERE r.store_id=p_store_id AND r.record_kind='seo_control' AND r.status='active'
   ORDER BY r.updated_at DESC, r.id DESC LIMIT 1;
  SELECT r.config INTO social_config FROM saas.merchant_admin_records r
   WHERE r.store_id=p_store_id AND r.record_kind='social_preview' AND r.status='active'
   ORDER BY r.updated_at DESC, r.id DESC LIMIT 1;

  hero:=pg_catalog.jsonb_build_object(
    'enabled',COALESCE((hero_config->>'enabled')::boolean,true),
    'headline',COALESCE(hero_config->>'headline',store_name),
    'body',COALESCE(hero_config->>'body','Özenle seçilmiş ürünleri keşfedin.'),
    'destination',COALESCE(hero_config->>'destination','/products')
  );
  IF hero_config IS NOT NULL THEN
    hero:=hero||pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('image',saas.public_storefront_asset(p_store_id,'hero',hero_config)));
  END IF;
  IF promotion_config IS NOT NULL
    AND COALESCE((promotion_config->>'enabled')::boolean,false)
    AND (NOT promotion_config?'startsAt' OR saas.merchant_admin_setting_timestamp_value(promotion_config->'startsAt')<=p_now)
    AND (NOT promotion_config?'endsAt' OR saas.merchant_admin_setting_timestamp_value(promotion_config->'endsAt')>p_now)
  THEN
    promotion:=pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'headline',promotion_config->>'headline',
      'body',promotion_config->>'body',
      'destination',COALESCE(promotion_config->>'destination','/products')
    ));
  END IF;
  IF marquee_config IS NOT NULL AND COALESCE((marquee_config->>'enabled')::boolean,false) THEN
    marquee:=pg_catalog.jsonb_build_object(
      'items',COALESCE(marquee_config->'items','[]'::jsonb),
      'icon',COALESCE(marquee_config->>'icon','none'),
      'speed',COALESCE(marquee_config->>'speed','normal'),
      'direction',COALESCE(marquee_config->>'direction','left'),
      'animation',COALESCE(marquee_config->>'animation','continuous')
    );
  END IF;

  RETURN pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'schemaVersion',1,
    'displayName',COALESCE(general_config->>'storeDisplayName',store_name),
    'supportEmail',general_config->>'supportEmail',
    'theme',pg_catalog.jsonb_build_object(
      'colorScheme',COALESCE(theme_config->>'colorScheme','neutral'),
      'headingStyle',COALESCE(theme_config->>'headingStyle','serif'),
      'productCardStyle',COALESCE(theme_config->>'productCardStyle','editorial'),
      'productImageRatio',COALESCE(theme_config->>'productImageRatio','portrait'),
      'homeProductLimit',COALESCE((theme_config->>'homeProductLimit')::integer,8),
      'showBrandStory',COALESCE((theme_config->>'showBrandStory')::boolean,true)
    ),
    'hero',hero,
    'promotion',promotion,
    'marquee',marquee,
    'seo',pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
      'title',seo_config->>'metaTitle',
      'description',seo_config->>'metaDescription',
      'allowIndex',COALESCE((seo_config->>'allowIndex')::boolean,false) AND p_allow_index,
      'socialImage',saas.public_storefront_asset(p_store_id,'social',social_config)
    ))
  ));
END
$f$;

CREATE FUNCTION saas.public_starter_presentation(p_store_id uuid, p_now timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
  SELECT saas.public_starter_presentation(p_store_id,p_now,false)
$f$;

CREATE FUNCTION saas.merchant_admin_effective_starter_presentation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_hostname text
)
RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE authority_error text; projection jsonb;
BEGIN
  IF p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname)
     OR pg_catalog.char_length(p_hostname) NOT BETWEEN 3 AND 253
     OR p_hostname~'[*:/?#@[:space:][:cntrl:]]'
     OR p_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  authority_error:=saas.merchant_admin_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'theme_setting',false
  );
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  SELECT saas.public_starter_presentation(
    p_store_id,p_now,domain.hostname_type='custom_domain' AND domain.is_primary
  ) INTO projection
  FROM saas.store_domains domain
  WHERE domain.store_id=p_store_id AND domain.hostname=p_hostname
    AND domain.status='active' AND domain.verified_at<=p_now;
  IF projection IS NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  RETURN QUERY SELECT 'found',projection;
END
$f$;

CREATE OR REPLACE FUNCTION saas.resolve_public_storefront(p_hostname text, p_now timestamptz)
RETURNS TABLE(outcome text, result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas
AS $f$
DECLARE projection jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now) OR p_hostname IS NULL OR p_hostname<>pg_catalog.lower(p_hostname)
     OR pg_catalog.char_length(p_hostname) NOT BETWEEN 3 AND 253 OR p_hostname~'[*:/?#@[:space:][:cntrl:]]'
     OR p_hostname!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'
  THEN RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN; END IF;
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',2,'id',store.id,'name',store.name,'slug',store.slug,
    'hostname',domain.hostname,'primaryHostname',primary_domain.hostname,
    'canonicalUrl','https://'||domain.hostname||'/','currency',store.currency,
    'locale',store.locale,'themeKey',store.theme_key,
    'presentation',saas.public_starter_presentation(
      store.id,p_now,domain.hostname_type='custom_domain' AND domain.is_primary
    )
  ) INTO projection
  FROM saas.store_domains AS domain
  JOIN saas.stores AS store ON store.id=domain.store_id AND store.status='active'
  JOIN saas.store_domains AS primary_domain ON primary_domain.store_id=store.id
    AND primary_domain.status='active' AND primary_domain.is_primary AND primary_domain.verified_at<=p_now
  WHERE domain.hostname=p_hostname AND domain.status='active' AND domain.verified_at<=p_now;
  RETURN QUERY SELECT CASE WHEN projection IS NULL THEN 'not_found' ELSE 'found' END,projection;
END
$f$;

REVOKE ALL ON FUNCTION
  saas.merchant_admin_required_action(text,boolean),
  saas.merchant_admin_config_valid(text,jsonb),
  saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),
  saas.public_starter_presentation(uuid,timestamptz),
  saas.public_starter_presentation(uuid,timestamptz,boolean),
  saas.merchant_admin_effective_starter_presentation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.resolve_public_storefront(text,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid),
  saas.merchant_admin_effective_starter_presentation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text)
TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.resolve_public_storefront(text,timestamptz)
TO celebix_saas_host_resolver;

COMMIT;
