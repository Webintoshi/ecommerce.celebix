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

CREATE FUNCTION saas.public_starter_presentation(p_store_id uuid, p_now timestamptz)
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
  hero jsonb;
  promotion jsonb;
  marquee jsonb;
BEGIN
  IF p_store_id IS NULL OR p_now IS NULL OR NOT pg_catalog.isfinite(p_now) THEN RETURN NULL; END IF;
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

  hero:=pg_catalog.jsonb_build_object(
    'enabled',COALESCE((hero_config->>'enabled')::boolean,true),
    'headline',COALESCE(hero_config->>'headline',store_name),
    'body',COALESCE(hero_config->>'body','Özenle seçilmiş ürünleri keşfedin.'),
    'destination',COALESCE(hero_config->>'destination','/products')
  );
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
      'allowIndex',COALESCE((seo_config->>'allowIndex')::boolean,false)
    ))
  ));
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
    'presentation',saas.public_starter_presentation(store.id,p_now)
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
  saas.resolve_public_storefront(text,timestamptz)
FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;

GRANT EXECUTE ON FUNCTION
  saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_list_events(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),
  saas.merchant_admin_get_record(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid)
TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.resolve_public_storefront(text,timestamptz)
TO celebix_saas_host_resolver;

COMMIT;
