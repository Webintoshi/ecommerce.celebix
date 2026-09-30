-- Durable store-scoped SEO. Public data is resolved through verified hosts; all writes retain native content.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE IF NOT EXISTS saas.seo_resource_options (
 store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,kind text NOT NULL CHECK(kind IN('product','category','page','blog')),resource_id uuid NOT NULL,
 version bigint NOT NULL CHECK(version>0),canonical_path text,indexing text NOT NULL CHECK(indexing IN('inherit','index','noindex')),updated_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,kind,resource_id)
);
CREATE TABLE IF NOT EXISTS saas.seo_settings (
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,version bigint NOT NULL CHECK(version>0),meta_title text,meta_description text,allow_index boolean NOT NULL,
 social_title text,social_description text,social_asset_id uuid,google_verification text,bing_verification text,indexnow_enabled boolean NOT NULL DEFAULT false,
 indexnow_key text NOT NULL CHECK(indexnow_key~'^[a-f0-9]{32}$'),updated_at timestamptz NOT NULL,
 FOREIGN KEY(store_id,social_asset_id) REFERENCES saas.storefront_assets(store_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS saas.seo_links (
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,version bigint NOT NULL CHECK(version>0),source_kind text NOT NULL,source_id uuid NOT NULL,target_kind text NOT NULL,target_id uuid NOT NULL,
 anchor_text text NOT NULL CHECK(char_length(anchor_text) BETWEEN 1 AND 160 AND anchor_text=btrim(anchor_text) AND anchor_text!~'[[:cntrl:]]'),enabled boolean NOT NULL,updated_at timestamptz NOT NULL,
 CHECK(source_kind IN('product','category','page','blog') AND target_kind IN('product','category','page','blog')),CHECK(source_kind<>target_kind OR source_id<>target_id),UNIQUE(store_id,source_kind,source_id,target_kind,target_id)
);
CREATE TABLE IF NOT EXISTS saas.seo_operations (
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,principal_id uuid NOT NULL,action text NOT NULL,fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),result_payload jsonb NOT NULL CHECK(octet_length(result_payload::text)<=32768),created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS saas.seo_legacy_reconciliation (
 source_id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,source_kind text NOT NULL,resource_kind text,resource_id uuid,
 outcome text NOT NULL CHECK(outcome IN('applied','conflict')),reason text,created_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS saas.seo_notifications (
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,hostname text NOT NULL,path text NOT NULL CHECK(char_length(path)<=2048),
 status text NOT NULL CHECK(status IN('queued','received','verification_pending','retrying','failed')),http_status integer CHECK(http_status BETWEEN 100 AND 599),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 5),
 requested_at timestamptz NOT NULL,next_attempt_at timestamptz,error text CHECK(char_length(error)<=1000),lease_id uuid,lease_until timestamptz,worker_id text,
 CHECK((lease_id IS NULL)=(lease_until IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_notifications_pending_path ON saas.seo_notifications(store_id,hostname,path) WHERE status IN('queued','retrying','verification_pending');
CREATE INDEX IF NOT EXISTS seo_notifications_due ON saas.seo_notifications(next_attempt_at,requested_at) WHERE status IN('queued','retrying','verification_pending');
CREATE TABLE IF NOT EXISTS saas.seo_check_runs (
 id uuid PRIMARY KEY,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,total integer NOT NULL CHECK(total BETWEEN 0 AND 20002),checked integer NOT NULL DEFAULT 0 CHECK(checked>=0),status text NOT NULL CHECK(status IN('running','completed','failed')),created_at timestamptz NOT NULL,last_checked_at timestamptz,
 CHECK(checked<=total)
);
CREATE UNIQUE INDEX IF NOT EXISTS seo_check_running_store ON saas.seo_check_runs(store_id) WHERE status='running';
CREATE TABLE IF NOT EXISTS saas.seo_check_urls (
 id uuid PRIMARY KEY,run_id uuid NOT NULL REFERENCES saas.seo_check_runs(id) ON DELETE RESTRICT,store_id uuid NOT NULL REFERENCES saas.stores(id) ON DELETE RESTRICT,hostname text NOT NULL,path text NOT NULL,kind text,resource_id uuid,status text NOT NULL CHECK(status IN('queued','completed','failed')),attempts integer NOT NULL DEFAULT 0 CHECK(attempts BETWEEN 0 AND 3),
 issues jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(issues)='array' AND jsonb_array_length(issues)<=20 AND octet_length(issues::text)<=32768),error text CHECK(char_length(error)<=1000),lease_id uuid,lease_until timestamptz,worker_id text,checked_at timestamptz,
 CHECK((lease_id IS NULL)=(lease_until IS NULL)),UNIQUE(run_id,path)
);
DO $f$ DECLARE tab text;BEGIN FOREACH tab IN ARRAY ARRAY['seo_resource_options','seo_settings','seo_links','seo_operations','seo_legacy_reconciliation','seo_notifications','seo_check_runs','seo_check_urls'] LOOP
 EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',tab);
 EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',tab);
END LOOP;END $f$;
CREATE OR REPLACE FUNCTION saas.seo_path_valid(p_path text) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT p_path IS NOT NULL AND char_length(p_path)<=2048 AND p_path~'^/(urunler|products|blog|((urun|products|kategori|categories|pages|blog)/[a-z0-9]+(-[a-z0-9]+)*))?([?]lang=[a-z]{2,3}(-[A-Z]{2})?)?$'
$f$;
CREATE OR REPLACE FUNCTION saas.seo_text_valid(p_value jsonb,p_max integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT p_value='null'::jsonb OR (jsonb_typeof(p_value)='string' AND char_length(p_value#>>'{}') BETWEEN 1 AND p_max AND p_value#>>'{}'=btrim(p_value#>>'{}') AND p_value#>>'{}'!~'[[:cntrl:]]')
$f$;
CREATE OR REPLACE FUNCTION saas.seo_primary_host(p_store_id uuid,p_now timestamptz) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT d.hostname FROM saas.store_domains d JOIN saas.stores s ON s.id=d.store_id AND s.status='active'
 WHERE d.store_id=p_store_id AND d.hostname_type='custom_domain' AND d.is_primary AND d.status='active' AND d.verified_at<=p_now ORDER BY d.hostname LIMIT 1
$f$;
CREATE OR REPLACE FUNCTION saas.seo_settings_projection(p_store_id uuid,p_now timestamptz,p_hostname text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE s saas.seo_settings%ROWTYPE;legacy jsonb;social jsonb;host text;image text;asset_id uuid;BEGIN
 SELECT * INTO s FROM saas.seo_settings WHERE store_id=p_store_id;
 host:=saas.seo_primary_host(p_store_id,p_now);
 SELECT config INTO legacy FROM saas.merchant_admin_records WHERE store_id=p_store_id AND record_kind='seo_control' AND status='active' ORDER BY updated_at DESC,id DESC LIMIT 1;
 SELECT config INTO social FROM saas.merchant_admin_records WHERE store_id=p_store_id AND record_kind='social_preview' AND status='active' ORDER BY updated_at DESC,id DESC LIMIT 1;
 IF s.version IS NOT NULL THEN asset_id:=s.social_asset_id;ELSIF social->>'assetId'~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN asset_id:=(social->>'assetId')::uuid;END IF;
 SELECT a.public_url,a.id INTO image,asset_id FROM saas.storefront_assets a WHERE a.store_id=p_store_id AND a.id=asset_id AND a.status='active';
 RETURN jsonb_build_object('version',coalesce(s.version,0),'metaTitle',CASE WHEN s.version IS NULL THEN coalesce(legacy->>'metaTitle',legacy->>'title') ELSE s.meta_title END,
 'metaDescription',CASE WHEN s.version IS NULL THEN coalesce(legacy->>'metaDescription',legacy->>'description') ELSE s.meta_description END,
 'allowIndex',coalesce(s.allow_index,legacy->>'allowIndex'='true',false),'socialTitle',CASE WHEN s.version IS NULL THEN social->>'title' ELSE s.social_title END,'socialDescription',CASE WHEN s.version IS NULL THEN social->>'description' ELSE s.social_description END,
 'socialAssetId',asset_id,'socialImageUrl',image,'googleVerification',CASE WHEN s.version IS NULL THEN legacy->>'googleVerification' ELSE s.google_verification END,'bingVerification',CASE WHEN s.version IS NULL THEN legacy->>'bingVerification' ELSE s.bing_verification END,
 'indexNowEnabled',coalesce(s.indexnow_enabled,false),'hostname',host,'eligible',host IS NOT NULL AND (p_hostname IS NULL OR p_hostname=host));
END $f$;
-- Canonicals are native paths owned by this store; a draft may keep its own future path.
CREATE OR REPLACE FUNCTION saas.seo_canonical_owned(p_store_id uuid,p_now timestamptz,p_path text,p_kind text,p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT p_path IS NULL OR (saas.seo_path_valid(p_path) AND (
 p_path IN('/','/blog',(SELECT CASE WHEN locale='tr' OR locale LIKE 'tr-%' THEN '/urunler' ELSE '/products' END FROM saas.stores WHERE id=p_store_id))
 OR EXISTS(SELECT 1 FROM saas.products p JOIN saas.stores s ON s.id=p.store_id WHERE p.store_id=p_store_id AND p.status<>'archived' AND p_path=(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/urun/' ELSE '/products/' END)||p.slug AND (p_kind='product' AND p.id=p_id OR p.status='active' AND saas.public_effective_product_projection(p_store_id,p.id,p_now) IS NOT NULL))
 OR EXISTS(SELECT 1 FROM saas.catalog_categories c JOIN saas.stores s ON s.id=c.store_id WHERE c.store_id=p_store_id AND c.status='active' AND p_path=(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/kategori/' ELSE '/categories/' END)||c.slug)
 OR EXISTS(SELECT 1 FROM saas.merchant_admin_records r CROSS JOIN LATERAL(SELECT saas.public_content_locale_config(p_store_id) value) language WHERE r.store_id=p_store_id AND r.record_kind IN('page','blog_post') AND r.status<>'archived'
 AND p_path=(CASE WHEN r.record_kind='page' THEN '/pages/' ELSE '/blog/' END)||coalesce(r.config->>'slug',r.id::text)||(CASE WHEN coalesce(r.config->>'locale',language.value->>'defaultLocale')=language.value->>'defaultLocale' THEN '' ELSE '?lang='||coalesce(r.config->>'locale',language.value->>'defaultLocale') END)
 AND (r.id=p_id AND (p_kind='page' AND r.record_kind='page' OR p_kind='blog' AND r.record_kind='blog_post') OR r.status='active' AND r.config->>'published'='true'
 AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(language.value->'enabledLocales') enabled WHERE enabled.value=coalesce(r.config->>'locale',language.value->>'defaultLocale'))
 AND NOT EXISTS(SELECT 1 FROM saas.merchant_admin_records newer WHERE newer.store_id=r.store_id AND newer.record_kind=r.record_kind AND newer.status='active' AND newer.config->>'published'='true' AND newer.config->>'slug'=r.config->>'slug' AND coalesce(newer.config->>'locale',language.value->>'defaultLocale')=coalesce(r.config->>'locale',language.value->>'defaultLocale') AND (newer.updated_at,newer.id)>(r.updated_at,r.id)) ))
 ))
$f$;
-- Internal unified projection. Publication follows the same catalog/locale/winner rules as public readers.
CREATE OR REPLACE FUNCTION saas.seo_resource_rows(p_store_id uuid,p_now timestamptz)
RETURNS TABLE(kind text,id uuid,published boolean,payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 WITH settings AS (SELECT saas.seo_settings_projection(p_store_id,p_now) value), language AS (SELECT saas.public_content_locale_config(p_store_id) value), native AS (
 SELECT 'product'::text kind,p.id,p.title name,(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/urun/' ELSE '/products/' END)||p.slug path,s.locale,p.status,p.version,pr.seo_title title,pr.seo_description description,coalesce(p.description,'') fallback,
 (SELECT m.public_url FROM saas.product_media m WHERE m.store_id=p_store_id AND m.product_id=p.id AND m.status='active' ORDER BY m.sort_order,m.id LIMIT 1) image,p.updated_at,
 p.status='active' AND saas.public_effective_product_projection(p_store_id,p.id,p_now) IS NOT NULL AND p.slug~'^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(p.slug) BETWEEN 3 AND 100 published
 FROM saas.products p JOIN saas.stores s ON s.id=p.store_id LEFT JOIN saas.catalog_product_profiles pr ON pr.store_id=p.store_id AND pr.product_id=p.id WHERE p.store_id=p_store_id AND p.status<>'archived'
 UNION ALL SELECT 'category',c.id,c.name,(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/kategori/' ELSE '/categories/' END)||c.slug,s.locale,c.status,c.version,legacy.config->>'metaTitle',legacy.config->>'metaDescription','',a.public_url,greatest(c.updated_at,legacy.updated_at),c.status='active'
 FROM saas.catalog_categories c JOIN saas.stores s ON s.id=c.store_id LEFT JOIN saas.storefront_assets a ON a.store_id=c.store_id AND a.id=c.image_asset_id AND a.status='active' LEFT JOIN LATERAL (SELECT r.config,r.updated_at FROM saas.merchant_admin_records r WHERE r.store_id=c.store_id AND r.record_kind='seo_category_entry' AND r.status='active' AND r.config->>'resourceId'=c.id::text ORDER BY r.updated_at DESC,r.id DESC LIMIT 1) legacy ON true WHERE c.store_id=p_store_id AND c.status<>'archived'
 UNION ALL SELECT CASE WHEN r.record_kind='page' THEN 'page' ELSE 'blog' END,r.id,r.name,(CASE WHEN r.record_kind='page' THEN '/pages/' ELSE '/blog/' END)||coalesce(r.config->>'slug',r.id::text)||(CASE WHEN coalesce(r.config->>'locale',language.value->>'defaultLocale')=language.value->>'defaultLocale' THEN '' ELSE '?lang='||coalesce(r.config->>'locale',language.value->>'defaultLocale') END),coalesce(r.config->>'locale',language.value->>'defaultLocale'),r.status,r.version,b.seo_title,b.seo_description,coalesce(b.excerpt,r.config->>'excerpt',''),NULL,r.updated_at,
 r.status='active' AND r.config->>'published'='true' AND r.config->>'slug'~'^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(r.config->>'slug') BETWEEN 1 AND 100
 AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(language.value->'enabledLocales') x WHERE x.value=coalesce(r.config->>'locale',language.value->>'defaultLocale'))
 AND NOT EXISTS(SELECT 1 FROM saas.merchant_admin_records newer WHERE newer.store_id=r.store_id AND newer.record_kind=r.record_kind AND newer.status='active' AND newer.config->>'published'='true' AND newer.config->>'slug'=r.config->>'slug' AND coalesce(newer.config->>'locale',language.value->>'defaultLocale')=coalesce(r.config->>'locale',language.value->>'defaultLocale') AND (newer.updated_at,newer.id)>(r.updated_at,r.id))
 FROM saas.merchant_admin_records r CROSS JOIN language LEFT JOIN saas.merchant_content_bodies b ON b.store_id=r.store_id AND b.record_id=r.id WHERE r.store_id=p_store_id AND r.record_kind IN('page','blog_post') AND r.status<>'archived'
 ) SELECT n.kind,n.id,coalesce(n.published,false),jsonb_build_object('id',n.id,'kind',n.kind,'name',n.name,'path',n.path,'locale',n.locale,'status',n.status,'version',n.version,'seoVersion',coalesce(o.version,0),'title',n.title,'description',n.description,'canonicalPath',coalesce(o.canonical_path,CASE WHEN n.kind='category' AND saas.seo_canonical_owned(p_store_id,p_now,category_seo.config->>'canonicalPath',n.kind,n.id) THEN category_seo.config->>'canonicalPath' ELSE NULL END),'indexing',coalesce(o.indexing,'inherit'),
 'effectiveTitle',coalesce(n.title,n.name),'effectiveDescription',coalesce(n.description,n.fallback,''),'effectiveCanonicalPath',coalesce(CASE WHEN saas.seo_canonical_owned(p_store_id,p_now,o.canonical_path,n.kind,n.id) THEN o.canonical_path ELSE NULL END,CASE WHEN n.kind='category' AND saas.seo_canonical_owned(p_store_id,p_now,category_seo.config->>'canonicalPath',n.kind,n.id) THEN category_seo.config->>'canonicalPath' ELSE NULL END,n.path),'allowIndex',coalesce(n.published,false) AND coalesce(o.indexing,'inherit')<>'noindex' AND settings.value->>'allowIndex'='true','imageUrl',n.image,'updatedAt',saas.merchant_admin_timestamp(greatest(n.updated_at,o.updated_at)))
 FROM native n CROSS JOIN settings LEFT JOIN saas.seo_resource_options o ON o.store_id=p_store_id AND o.kind=n.kind AND o.resource_id=n.id LEFT JOIN LATERAL (SELECT r.config FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='seo_category_entry' AND r.status='active' AND r.config->>'resourceId'=n.id::text ORDER BY r.updated_at DESC,r.id DESC LIMIT 1) category_seo ON n.kind='category'
$f$;
CREATE OR REPLACE FUNCTION saas.seo_links_projection(p_store_id uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'version',l.version,'sourceKind',l.source_kind,'sourceId',l.source_id,'targetKind',l.target_kind,'targetId',l.target_id,'sourcePath',src.payload->>'path','targetPath',dst.payload->>'effectiveCanonicalPath','anchorText',l.anchor_text,'enabled',l.enabled) ORDER BY l.updated_at DESC,l.id),'[]'::jsonb)
 FROM saas.seo_links l JOIN saas.seo_resource_rows(p_store_id,p_now) src ON src.kind=l.source_kind AND src.id=l.source_id JOIN saas.seo_resource_rows(p_store_id,p_now) dst ON dst.kind=l.target_kind AND dst.id=l.target_id WHERE l.store_id=p_store_id
$f$;
CREATE OR REPLACE FUNCTION saas.seo_notifications_projection(p_store_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'path',n.path,'status',n.status,'httpStatus',n.http_status,'attempts',n.attempts,'requestedAt',saas.merchant_admin_timestamp(n.requested_at),'nextAttemptAt',saas.merchant_admin_timestamp(n.next_attempt_at),'error',n.error) ORDER BY n.requested_at DESC,n.id),'[]'::jsonb) FROM (SELECT * FROM saas.seo_notifications WHERE store_id=p_store_id ORDER BY requested_at DESC,id LIMIT 100) n
$f$;
CREATE OR REPLACE FUNCTION saas.seo_enqueue(p_store_id uuid,p_path text,p_now timestamptz) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE host text;n integer;BEGIN
 IF saas.seo_path_valid(p_path) IS DISTINCT FROM true THEN RETURN 0;END IF;
 host:=saas.seo_primary_host(p_store_id,p_now);
 IF host IS NULL OR NOT EXISTS(SELECT 1 FROM saas.seo_settings WHERE store_id=p_store_id AND indexnow_enabled AND allow_index) THEN RETURN 0;END IF;
 INSERT INTO saas.seo_notifications(id,store_id,hostname,path,status,requested_at,next_attempt_at) VALUES(gen_random_uuid(),p_store_id,host,p_path,'queued',p_now,p_now) ON CONFLICT DO NOTHING;GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_admin_read(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text,p_request jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;settings jsonb;items jsonb;issues jsonb;check_state jsonb;run_record saas.seo_check_runs%ROWTYPE;n integer;pub integer;entries integer;lim integer;off integer;host text;sitemap_config jsonb;BEGIN
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'seo_control',false);
 IF e IS NOT NULL THEN RETURN QUERY SELECT CASE WHEN e='durable_authority_invalid' THEN 'feature_not_enabled' ELSE e END,NULL::jsonb;RETURN;END IF;
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_action NOT IN('overview','resources','settings','links','notifications') OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>4096 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_action='settings' THEN RETURN QUERY SELECT 'found',saas.seo_settings_projection(p_store_id,p_now);RETURN;END IF;
 IF p_action='links' THEN RETURN QUERY SELECT 'listed',jsonb_build_object('items',saas.seo_links_projection(p_store_id,p_now));RETURN;END IF;
 IF p_action='notifications' THEN RETURN QUERY SELECT 'listed',jsonb_build_object('items',saas.seo_notifications_projection(p_store_id));RETURN;END IF;
 IF p_action='resources' THEN
 IF p_request->>'kind' IS NOT NULL AND p_request->>'kind' NOT IN('product','category','page','blog') OR jsonb_typeof(p_request->'missing') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_request->'limit') IS DISTINCT FROM 'number' OR (p_request->>'limit')!~'^[0-9]{1,3}$' OR coalesce(p_request->>'cursor','0')!~'^[0-9]{1,9}$' OR char_length(coalesce(p_request->>'query',''))>200 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 lim:=(p_request->>'limit')::integer;off:=coalesce(p_request->>'cursor','0')::integer;IF lim NOT BETWEEN 1 AND 100 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 WITH filtered AS(SELECT * FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE (p_request->>'kind' IS NULL OR x.kind=p_request->>'kind') AND (p_request->>'query' IS NULL OR position(lower(p_request->>'query') IN lower((x.payload->>'name')||' '||(x.payload->>'path')||' '||(x.payload->>'effectiveCanonicalPath')||' '||x.id::text))>0) AND (p_request->>'missing'<>'true' OR x.payload->>'title' IS NULL OR x.payload->>'description' IS NULL)), page AS(SELECT * FROM filtered ORDER BY kind,id OFFSET off LIMIT lim)
 SELECT (SELECT count(*) FROM filtered),coalesce(jsonb_agg(payload ORDER BY kind,id),'[]'::jsonb) INTO n,items FROM page;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',items,'nextCursor',CASE WHEN off+lim<n THEN (off+lim)::text ELSE NULL END,'total',n);RETURN;END IF;
 settings:=saas.seo_settings_projection(p_store_id,p_now);host:=settings->>'hostname';
 SELECT count(*),count(*) FILTER(WHERE x.published) INTO n,pub FROM saas.seo_resource_rows(p_store_id,p_now) x;
 sitemap_config:=saas.public_content_sitemap_config(p_store_id);
 SELECT count(*) INTO entries FROM (
 SELECT * FROM saas.public_content_sitemap_rows(p_store_id,'products',p_now,NULL,NULL,NULL,sitemap_config->>'changeFrequency') WHERE sitemap_config->>'includeProducts'='true'
 UNION ALL SELECT * FROM saas.public_content_sitemap_rows(p_store_id,'content',p_now,NULL,NULL,NULL,sitemap_config->>'changeFrequency') WHERE sitemap_config->>'includeContent'='true') sitemap_entries;

 SELECT coalesce(jsonb_agg(issue),'[]'::jsonb) INTO issues FROM (
 SELECT jsonb_build_object('code','missing_title','severity','warning','message','SEO başlığı eksik.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) issue FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.published AND x.payload->>'title' IS NULL
 UNION ALL SELECT jsonb_build_object('code','missing_description','severity','warning','message','SEO açıklaması eksik.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.published AND x.payload->>'description' IS NULL
 UNION ALL SELECT jsonb_build_object('code','duplicate_title','severity','warning','message','SEO başlığı birden fazla içerikte kullanılıyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.published AND EXISTS(SELECT 1 FROM saas.seo_resource_rows(p_store_id,p_now) y WHERE y.published AND (y.kind,y.id)<>(x.kind,x.id) AND lower(y.payload->>'effectiveTitle')=lower(x.payload->>'effectiveTitle'))
 UNION ALL SELECT jsonb_build_object('code','legacy_seo_conflict','severity','warning','message','Bu kategori için birden fazla etkin SEO kaydı var.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind=category&resourceId='||x.id::text) FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.kind='category' AND (SELECT count(*) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='seo_category_entry' AND r.status='active' AND r.config->>'resourceId'=x.id::text)>1
 UNION ALL SELECT jsonb_build_object('code','legacy_seo_conflict','severity','warning','message',CASE l.reason
 WHEN 'native_metadata_retained' THEN 'Mevcut SEO alanları korundu; önceki kaydı kontrol edin.'
 WHEN 'native_options_retained' THEN 'Mevcut kanonik adres ve indeksleme tercihi korundu.'
 WHEN 'missing_resource' THEN 'Önceki SEO kaydının hedef içeriği bulunamadı.'
 WHEN 'missing_or_foreign_resource' THEN 'Önceki SEO kaydı bu mağazada yayımlanmış bir içerikle eşleşmiyor.'
 WHEN 'ambiguous_metadata' THEN 'Aynı içerik için birden fazla etkin SEO kaydı var.'
 WHEN 'metadata_exceeds_native_limit' THEN 'Önceki SEO alanı izin verilen uzunluğu aşıyor.'
 WHEN 'invalid_canonical' THEN 'Önceki kanonik adres bu mağazada yayımlanmış bir içerikle eşleşmiyor.'
 WHEN 'native_options_retained' THEN 'Mevcut kanonik adres ve indeksleme tercihi korundu.'
 WHEN 'ambiguous_or_unpublished_link_target' THEN 'Önceki bağlantı bu mağazada yayımlanmış tek bir içerikle eşleşmiyor.'
 WHEN 'duplicate_link' THEN 'Aynı içerikler arasında birden fazla bağlantı kaydı var.'
 WHEN 'self_link' THEN 'Önceki bağlantının kaynak ve hedef içeriği aynı.'
 WHEN 'link_limit' THEN 'Önceki bağlantı, mağazanın bağlantı sınırını aşıyor.'
 ELSE 'Önceki SEO kaydını kontrol edin; bazı alanları otomatik uygulanamadı.' END,'path',NULL,'kind',l.resource_kind,'resourceId',l.resource_id,'fixHref',CASE WHEN l.resource_kind IS NULL OR l.resource_id IS NULL THEN '/seo?tab=checks' ELSE '/seo/content?kind='||l.resource_kind||'&resourceId='||l.resource_id::text END) FROM saas.seo_legacy_reconciliation l WHERE l.store_id=p_store_id AND l.outcome='conflict'
 UNION ALL SELECT jsonb_build_object('code','invalid_canonical','severity','error','message','Kanonik adres mağazada yayımlanmış bir içerikle eşleşmiyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.payload->>'canonicalPath' IS NOT NULL AND saas.seo_canonical_owned(p_store_id,p_now,x.payload->>'canonicalPath',x.kind,x.id) IS DISTINCT FROM true
 UNION ALL SELECT jsonb_build_object('code','invalid_canonical','severity','error','message','Önceki kategori kanonik adresi mağazada yayımlanmış bir içerikle eşleşmiyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind=category&resourceId='||x.id::text) FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.kind='category' AND EXISTS(SELECT 1 FROM saas.merchant_admin_records legacy WHERE legacy.store_id=p_store_id AND legacy.record_kind='seo_category_entry' AND legacy.status='active' AND legacy.config->>'resourceId'=x.id::text AND legacy.config->>'canonicalPath' IS NOT NULL AND saas.seo_canonical_owned(p_store_id,p_now,legacy.config->>'canonicalPath',x.kind,x.id) IS DISTINCT FROM true)
 UNION ALL SELECT jsonb_build_object('code','domain_required','severity','warning','message','Doğrulanmış birincil alan adı gerekli.','path',NULL,'kind',NULL,'resourceId',NULL,'fixHref','/seo/settings') WHERE host IS NULL
 UNION ALL SELECT jsonb_build_object('code','indexing_disabled','severity','warning','message','Arama motoru indekslemesi kapalı.','path',NULL,'kind',NULL,'resourceId',NULL,'fixHref','/seo/settings') WHERE settings->>'allowIndex'<>'true'
 UNION ALL SELECT issue.value FROM saas.seo_check_urls u CROSS JOIN LATERAL jsonb_array_elements(u.issues) issue WHERE u.run_id=(SELECT id FROM saas.seo_check_runs WHERE store_id=p_store_id ORDER BY created_at DESC,id DESC LIMIT 1)
 LIMIT 200) all_issues;
 SELECT * INTO run_record FROM saas.seo_check_runs WHERE store_id=p_store_id ORDER BY created_at DESC,id DESC LIMIT 1;
 check_state:=jsonb_build_object('checked',coalesce(run_record.checked,0),'total',coalesce(run_record.total,0),'status',coalesce(run_record.status,'idle'),'lastCheckedAt',saas.merchant_admin_timestamp(run_record.last_checked_at));
 RETURN QUERY SELECT 'found',jsonb_build_object('totalResources',n,'publishedResources',pub,'issues',issues,'sitemap',jsonb_build_object('url',CASE WHEN host IS NULL THEN NULL ELSE 'https://'||host||'/sitemap.xml' END,'robotsUrl',CASE WHEN host IS NULL THEN NULL ELSE 'https://'||host||'/robots.txt' END,'entryCount',CASE WHEN host IS NOT NULL AND settings->>'allowIndex'='true' THEN entries ELSE 0 END),'check',check_state,'notifications',saas.seo_notifications_projection(p_store_id),'settings',settings);
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_admin_overview(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.seo_admin_read(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'overview','{}'::jsonb)
$f$;
CREATE OR REPLACE FUNCTION saas.seo_admin_recover(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_action text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;op saas.seo_operations%ROWTYPE;BEGIN
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'seo_control',true);IF e IS NOT NULL THEN RETURN QUERY SELECT CASE WHEN e='durable_authority_invalid' THEN 'feature_not_enabled' ELSE e END,NULL::jsonb;RETURN;END IF;
 SELECT * INTO op FROM saas.seo_operations WHERE operation_id=p_operation_id AND store_id=p_store_id AND principal_id=p_principal_id AND fingerprint=p_fingerprint AND action=p_action;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'operation_replayed',op.result_payload;
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_admin_mutate(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_action text,p_request jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;op saas.seo_operations%ROWTYPE;resource jsonb;src jsonb;dst jsonb;result jsonb;selected_kind text;rid uuid;native_version bigint;options_version bigint;settings_version bigint;body_version bigint;link_id uuid;link saas.seo_links%ROWTYPE;candidate record;queued integer:=0;host text;run_id uuid;total integer;allowed jsonb;keys text[];category_record saas.merchant_admin_records%ROWTYPE;category_config jsonb;BEGIN
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'seo_control',true);
 IF e IS NOT NULL THEN RETURN QUERY SELECT CASE WHEN e='durable_authority_invalid' THEN 'feature_not_enabled' ELSE e END,NULL::jsonb;RETURN;END IF;
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_action IS NULL OR p_action NOT IN('resource','settings','link','notify','check') OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>32768 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.seo.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.seo_operations WHERE operation_id=p_operation_id) THEN RETURN QUERY SELECT * FROM saas.seo_admin_recover(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_action);RETURN;END IF;
 PERFORM 1 FROM saas.stores WHERE id=p_store_id FOR UPDATE;
 SELECT array_agg(k ORDER BY k) INTO keys FROM jsonb_object_keys(p_request) k;
 IF p_action='resource' THEN
 IF keys IS DISTINCT FROM ARRAY['canonicalPath','description','expectedSeoVersion','expectedVersion','id','indexing','kind','title'] OR p_request->>'kind' IS NULL OR p_request->>'kind' NOT IN('product','category','page','blog') OR jsonb_typeof(p_request->'id') IS DISTINCT FROM 'string' OR p_request->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR jsonb_typeof(p_request->'expectedVersion') IS DISTINCT FROM 'number' OR p_request->>'expectedVersion'!~'^[0-9]{1,16}$' OR jsonb_typeof(p_request->'expectedSeoVersion') IS DISTINCT FROM 'number' OR p_request->>'expectedSeoVersion'!~'^[0-9]{1,16}$' OR p_request->>'indexing' IS NULL OR p_request->>'indexing' NOT IN('inherit','index','noindex')
 OR (p_request->>'kind'<>'product' AND (octet_length(p_request->>'title')>160 OR octet_length(p_request->>'description')>4000)) OR saas.seo_text_valid(p_request->'title',CASE WHEN p_request->>'kind'='product' THEN 200 ELSE 160 END) IS DISTINCT FROM true OR saas.seo_text_valid(p_request->'description',CASE WHEN p_request->>'kind'='product' THEN 500 ELSE 4000 END) IS DISTINCT FROM true OR (p_request->'canonicalPath'<>'null'::jsonb AND (jsonb_typeof(p_request->'canonicalPath')<>'string' OR saas.seo_path_valid(p_request->>'canonicalPath') IS DISTINCT FROM true)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_kind:=p_request->>'kind';rid:=(p_request->>'id')::uuid;
 IF selected_kind='product' THEN SELECT p.version INTO native_version FROM saas.products p WHERE p.store_id=p_store_id AND p.id=rid AND p.status<>'archived' FOR UPDATE;
 ELSIF selected_kind='category' THEN SELECT c.version INTO native_version FROM saas.catalog_categories c WHERE c.store_id=p_store_id AND c.id=rid AND c.status<>'archived' FOR UPDATE;
 ELSE SELECT r.version INTO native_version FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=rid AND r.record_kind=CASE WHEN selected_kind='blog' THEN 'blog_post' ELSE 'page' END AND r.status<>'archived' FOR UPDATE;END IF;
 IF native_version IS NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 IF saas.seo_canonical_owned(p_store_id,p_now,p_request->>'canonicalPath',selected_kind,rid) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT version INTO options_version FROM saas.seo_resource_options WHERE store_id=p_store_id AND kind=selected_kind AND resource_id=rid FOR UPDATE;
 IF native_version<>(p_request->>'expectedVersion')::bigint OR coalesce(options_version,0)<>(p_request->>'expectedSeoVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 SELECT x.payload INTO resource FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.kind=selected_kind AND x.id=rid;
 IF selected_kind='product' THEN
 UPDATE saas.products SET version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=rid;
 INSERT INTO saas.catalog_product_profiles(product_id,store_id,product_type,seo_title,seo_description,version,created_at,updated_at) VALUES(rid,p_store_id,'physical',p_request->>'title',p_request->>'description',1,p_now,p_now)
 ON CONFLICT(product_id) DO UPDATE SET seo_title=excluded.seo_title,seo_description=excluded.seo_description,version=saas.catalog_product_profiles.version+1,updated_at=p_now;
 ELSIF selected_kind='category' THEN
 IF (SELECT count(*) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='seo_category_entry' AND r.status='active' AND r.config->>'resourceId'=rid::text)>1 THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 SELECT * INTO category_record FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='seo_category_entry' AND r.status='active' AND r.config->>'resourceId'=rid::text FOR UPDATE;
 category_config:=(coalesce(category_record.config,'{}'::jsonb)-ARRAY['metaTitle','metaDescription','canonicalPath'])||jsonb_build_object('resourceId',rid);
 IF p_request->>'title' IS NOT NULL THEN category_config:=category_config||jsonb_build_object('metaTitle',p_request->>'title');END IF;
 IF p_request->>'description' IS NOT NULL THEN category_config:=category_config||jsonb_build_object('metaDescription',p_request->>'description');END IF;
 IF p_request->>'canonicalPath' IS NOT NULL THEN category_config:=category_config||jsonb_build_object('canonicalPath',p_request->>'canonicalPath');END IF;
 IF category_record.id IS NULL THEN INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES(gen_random_uuid(),p_store_id,'seo_category_entry',left(resource->>'name',160),category_config,'active',1,p_now,p_now);
 ELSE UPDATE saas.merchant_admin_records SET config=category_config,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=category_record.id;END IF;
 -- The shared legacy metadata trigger advances the category resource version.

 ELSE
 UPDATE saas.merchant_admin_records SET version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=rid;
 INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins,excerpt,seo_title,seo_description)
 SELECT p_store_id,r.id,native_version+1,coalesce(r.config->>'body',''),'legacy','{}'::jsonb,r.config->>'excerpt',p_request->>'title',p_request->>'description' FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=rid
 ON CONFLICT(store_id,record_id) DO UPDATE SET version=excluded.version,seo_title=excluded.seo_title,seo_description=excluded.seo_description,
 origins=saas.merchant_content_bodies.origins||jsonb_build_object('seoTitle',jsonb_build_object('state','manual'),'seoDescription',jsonb_build_object('state','manual'));
 INSERT INTO saas.merchant_content_versions(store_id,record_id,version,operation_id,principal_id,write_source,snapshot) VALUES(p_store_id,rid,native_version+1,p_operation_id,p_principal_id,'generic',saas.merchant_content_document(p_store_id,rid));
 END IF;
 INSERT INTO saas.seo_resource_options(store_id,kind,resource_id,version,canonical_path,indexing,updated_at) VALUES(p_store_id,selected_kind,rid,1,p_request->>'canonicalPath',p_request->>'indexing',p_now)
 ON CONFLICT(store_id,kind,resource_id) DO UPDATE SET version=saas.seo_resource_options.version+1,canonical_path=excluded.canonical_path,indexing=excluded.indexing,updated_at=p_now;
 -- Notify both canonical destinations when an override moves; deletion events use the old native path too.
 IF resource->>'allowIndex'='true' THEN PERFORM saas.seo_enqueue(p_store_id,resource->>'effectiveCanonicalPath',p_now);END IF;
 SELECT x.payload INTO resource FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.kind=selected_kind AND x.id=rid;
 IF resource->>'allowIndex'='true' THEN PERFORM saas.seo_enqueue(p_store_id,resource->>'effectiveCanonicalPath',p_now);END IF;
 result:=jsonb_build_object('resource',resource);
 ELSIF p_action='settings' THEN
 IF keys IS DISTINCT FROM ARRAY['allowIndex','bingVerification','expectedVersion','googleVerification','indexNowEnabled','metaDescription','metaTitle','socialAssetId','socialDescription','socialTitle'] OR jsonb_typeof(p_request->'expectedVersion') IS DISTINCT FROM 'number' OR p_request->>'expectedVersion'!~'^[0-9]{1,16}$'
 OR octet_length(p_request->>'metaTitle')>160 OR octet_length(p_request->>'metaDescription')>500 OR octet_length(p_request->>'socialTitle')>160 OR octet_length(p_request->>'socialDescription')>500 OR jsonb_typeof(p_request->'allowIndex') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_request->'indexNowEnabled') IS DISTINCT FROM 'boolean' OR saas.seo_text_valid(p_request->'metaTitle',160) IS DISTINCT FROM true OR saas.seo_text_valid(p_request->'metaDescription',500) IS DISTINCT FROM true OR saas.seo_text_valid(p_request->'socialTitle',160) IS DISTINCT FROM true OR saas.seo_text_valid(p_request->'socialDescription',500) IS DISTINCT FROM true
 OR (p_request->'socialAssetId'<>'null'::jsonb AND (jsonb_typeof(p_request->'socialAssetId')<>'string' OR p_request->>'socialAssetId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'))
 OR EXISTS(SELECT 1 FROM jsonb_each(p_request) x WHERE x.key IN('googleVerification','bingVerification') AND x.value<>'null'::jsonb AND (jsonb_typeof(x.value)<>'string' OR (char_length(x.value#>>'{}') NOT BETWEEN 1 AND 256 OR x.value#>>'{}'!~'^[a-zA-Z0-9_-]+$'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_request->>'socialAssetId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.storefront_assets a WHERE a.store_id=p_store_id AND a.id=(p_request->>'socialAssetId')::uuid AND a.status='active') THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 SELECT version INTO settings_version FROM saas.seo_settings WHERE store_id=p_store_id FOR UPDATE;
 IF coalesce(settings_version,0)<>(p_request->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.seo_settings(store_id,version,meta_title,meta_description,allow_index,social_title,social_description,social_asset_id,google_verification,bing_verification,indexnow_enabled,indexnow_key,updated_at)
 VALUES(p_store_id,1,p_request->>'metaTitle',p_request->>'metaDescription',(p_request->>'allowIndex')::boolean,p_request->>'socialTitle',p_request->>'socialDescription',(p_request->>'socialAssetId')::uuid,p_request->>'googleVerification',p_request->>'bingVerification',(p_request->>'indexNowEnabled')::boolean,replace(gen_random_uuid()::text,'-',''),p_now)
 ON CONFLICT(store_id) DO UPDATE SET version=saas.seo_settings.version+1,meta_title=excluded.meta_title,meta_description=excluded.meta_description,allow_index=excluded.allow_index,social_title=excluded.social_title,social_description=excluded.social_description,social_asset_id=excluded.social_asset_id,google_verification=excluded.google_verification,bing_verification=excluded.bing_verification,indexnow_enabled=excluded.indexnow_enabled,updated_at=p_now;
 result:=jsonb_build_object('settings',saas.seo_settings_projection(p_store_id,p_now));
 ELSIF p_action='link' THEN
 IF keys IS DISTINCT FROM ARRAY['anchorText','enabled','expectedVersion','id','sourceId','sourceKind','targetId','targetKind'] AND keys IS DISTINCT FROM ARRAY['anchorText','enabled','expectedVersion','id','remove','sourceId','sourceKind','targetId','targetKind'] OR jsonb_typeof(p_request->'enabled') IS DISTINCT FROM 'boolean' OR (p_request?'remove' AND jsonb_typeof(p_request->'remove') IS DISTINCT FROM 'boolean') OR saas.seo_text_valid(p_request->'anchorText',160) IS DISTINCT FROM true OR p_request->'anchorText'='null'::jsonb
 OR p_request->>'sourceKind' IS NULL OR p_request->>'sourceKind' NOT IN('product','category','page','blog') OR p_request->>'targetKind' IS NULL OR p_request->>'targetKind' NOT IN('product','category','page','blog')
 OR jsonb_typeof(p_request->'sourceId') IS DISTINCT FROM 'string' OR p_request->>'sourceId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(p_request->'targetId') IS DISTINCT FROM 'string' OR p_request->>'targetId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
 OR (p_request->'id'='null'::jsonb) IS DISTINCT FROM (p_request->'expectedVersion'='null'::jsonb)
 OR (p_request->'id'<>'null'::jsonb AND (jsonb_typeof(p_request->'id')<>'string' OR p_request->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(p_request->'expectedVersion')<>'number' OR p_request->>'expectedVersion'!~'^[0-9]{1,16}$'))
 OR p_request->>'sourceKind'=p_request->>'targetKind' AND p_request->>'sourceId'=p_request->>'targetId' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT x.payload INTO src FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.kind=p_request->>'sourceKind' AND x.id=(p_request->>'sourceId')::uuid;
 SELECT x.payload INTO dst FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.kind=p_request->>'targetKind' AND x.id=(p_request->>'targetId')::uuid;
 IF src IS NULL OR dst IS NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 link_id:=coalesce((p_request->>'id')::uuid,gen_random_uuid());
 IF p_request->>'id' IS NOT NULL THEN SELECT * INTO link FROM saas.seo_links WHERE store_id=p_store_id AND id=link_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;IF link.version<>(p_request->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;END IF;
 IF coalesce(p_request->>'remove','false')='true' THEN DELETE FROM saas.seo_links WHERE store_id=p_store_id AND id=link_id;result:=jsonb_build_object('link',NULL);
 ELSE
 IF EXISTS(SELECT 1 FROM saas.seo_links l WHERE l.store_id=p_store_id AND l.source_kind=p_request->>'sourceKind' AND l.source_id=(p_request->>'sourceId')::uuid AND l.target_kind=p_request->>'targetKind' AND l.target_id=(p_request->>'targetId')::uuid AND l.id<>link_id) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF p_request->>'id' IS NULL AND (SELECT count(*) FROM saas.seo_links WHERE store_id=p_store_id)>=500 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.seo_links(id,store_id,version,source_kind,source_id,target_kind,target_id,anchor_text,enabled,updated_at) VALUES(link_id,p_store_id,1,p_request->>'sourceKind',(p_request->>'sourceId')::uuid,p_request->>'targetKind',(p_request->>'targetId')::uuid,p_request->>'anchorText',(p_request->>'enabled')::boolean,p_now)
 ON CONFLICT(id) DO UPDATE SET version=saas.seo_links.version+1,source_kind=excluded.source_kind,source_id=excluded.source_id,target_kind=excluded.target_kind,target_id=excluded.target_id,anchor_text=excluded.anchor_text,enabled=excluded.enabled,updated_at=p_now;
 SELECT jsonb_build_object('link',x.value) INTO result FROM jsonb_array_elements(saas.seo_links_projection(p_store_id,p_now)) x WHERE x.value->>'id'=link_id::text;
 END IF;
 IF src->>'allowIndex'='true' THEN PERFORM saas.seo_enqueue(p_store_id,src->>'effectiveCanonicalPath',p_now);END IF;
 ELSIF p_action='notify' THEN
 IF keys IS DISTINCT FROM ARRAY['resources'] OR jsonb_typeof(p_request->'resources') IS DISTINCT FROM 'array' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF jsonb_array_length(p_request->'resources') NOT BETWEEN 1 AND 100 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'resources') x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'object') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'resources') x WHERE (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x.value) k) IS DISTINCT FROM ARRAY['id','kind'] OR x.value->>'kind' IS NULL OR x.value->>'kind' NOT IN('product','category','page','blog') OR jsonb_typeof(x.value->'id') IS DISTINCT FROM 'string' OR x.value->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') OR (SELECT count(*) FROM jsonb_array_elements(p_request->'resources'))<>(SELECT count(DISTINCT x.value) FROM jsonb_array_elements(p_request->'resources') x) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF saas.seo_primary_host(p_store_id,p_now) IS NULL OR NOT EXISTS(SELECT 1 FROM saas.seo_settings WHERE store_id=p_store_id AND indexnow_enabled AND allow_index) THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'resources') x WHERE NOT EXISTS(SELECT 1 FROM saas.seo_resource_rows(p_store_id,p_now) r WHERE r.kind=x.value->>'kind' AND r.id=(x.value->>'id')::uuid AND r.published AND r.payload->>'allowIndex'='true')) THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 FOR candidate IN SELECT DISTINCT r.payload->>'effectiveCanonicalPath' path FROM saas.seo_resource_rows(p_store_id,p_now) r JOIN jsonb_array_elements(p_request->'resources') x ON x.value->>'kind'=r.kind AND (x.value->>'id')::uuid=r.id LOOP queued:=queued+saas.seo_enqueue(p_store_id,candidate.path,p_now);END LOOP;
 result:=jsonb_build_object('queued',queued);
 ELSIF p_action='check' THEN
 IF p_request<>'{}'::jsonb THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 host:=saas.seo_primary_host(p_store_id,p_now);IF host IS NULL THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
 SELECT id INTO run_id FROM saas.seo_check_runs WHERE store_id=p_store_id AND status='running';
 IF run_id IS NULL THEN
 SELECT count(DISTINCT x.payload->>'path') INTO total FROM saas.seo_resource_rows(p_store_id,p_now) x WHERE x.published AND saas.seo_path_valid(x.payload->>'path');IF total>20000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 run_id:=gen_random_uuid();INSERT INTO saas.seo_check_runs(id,store_id,total,status,created_at) VALUES(run_id,p_store_id,total+2,'running',p_now);
 INSERT INTO saas.seo_check_urls(id,run_id,store_id,hostname,path,kind,resource_id,status)
 SELECT gen_random_uuid(),run_id,p_store_id,host,x.path,x.kind,x.id,'queued' FROM (SELECT DISTINCT ON (r.payload->>'path') r.payload->>'path' path,r.kind,r.id FROM saas.seo_resource_rows(p_store_id,p_now) r WHERE r.published AND saas.seo_path_valid(r.payload->>'path') ORDER BY r.payload->>'path',r.kind,r.id) x;
 INSERT INTO saas.seo_check_urls(id,run_id,store_id,hostname,path,status) VALUES(gen_random_uuid(),run_id,p_store_id,host,'/','queued'),(gen_random_uuid(),run_id,p_store_id,host,(SELECT CASE WHEN locale='tr' OR locale LIKE 'tr-%' THEN '/urunler' ELSE '/products' END FROM saas.stores WHERE id=p_store_id),'queued');
 END IF;
 SELECT jsonb_build_object('checked',r.checked,'total',r.total,'status',r.status) INTO result FROM saas.seo_check_runs r WHERE r.id=run_id;
 END IF;
 INSERT INTO saas.seo_operations(operation_id,store_id,principal_id,action,fingerprint,result_payload,created_at) VALUES(p_operation_id,p_store_id,p_principal_id,p_action,p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'saved',result;
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_public_settings(p_hostname text,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE sid uuid;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 sid:=saas.store_policy_public_store(p_hostname,p_now);IF sid IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',saas.seo_settings_projection(sid,p_now,p_hostname);
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_public_get(p_hostname text,p_now timestamptz,p_kind text,p_id uuid) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE sid uuid;resource jsonb;links jsonb;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_id IS NULL OR p_kind IS NULL OR p_kind NOT IN('product','category','page','blog') OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 sid:=saas.store_policy_public_store(p_hostname,p_now);IF sid IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT x.payload INTO resource FROM saas.seo_resource_rows(sid,p_now) x WHERE x.kind=p_kind AND x.id=p_id AND x.published;
 IF resource IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('anchorText',l.anchor_text,'path',r.payload->>'effectiveCanonicalPath') ORDER BY l.updated_at DESC,l.id),'[]'::jsonb) INTO links FROM saas.seo_links l JOIN saas.seo_resource_rows(sid,p_now) r ON r.kind=l.target_kind AND r.id=l.target_id AND r.published AND r.payload->>'indexing'<>'noindex' WHERE l.store_id=sid AND l.source_kind=p_kind AND l.source_id=p_id AND l.enabled;
 RETURN QUERY SELECT 'found',jsonb_build_object('resource',resource,'links',links,'settings',saas.seo_settings_projection(sid,p_now,p_hostname));
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_public_key(p_hostname text,p_now timestamptz) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE sid uuid;k text;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 sid:=saas.store_policy_public_store(p_hostname,p_now);IF sid IS NULL OR saas.seo_primary_host(sid,p_now) IS DISTINCT FROM p_hostname THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT indexnow_key INTO k FROM saas.seo_settings WHERE store_id=sid AND indexnow_enabled AND allow_index;
 RETURN QUERY SELECT 'found',jsonb_build_object('key',k);
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_worker_claim(p_now timestamptz,p_limit integer,p_worker_id text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE notifications jsonb;checks jsonb;BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 OR p_worker_id IS NULL OR p_worker_id!~'^[a-zA-Z0-9_.:-]{1,100}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Expired terminal retries are visible failures. Host changes are never sent to the previous host.
 UPDATE saas.seo_notifications n SET status='failed',error=CASE WHEN n.attempts>=5 THEN 'retry_limit' ELSE 'host_ineligible' END,lease_id=NULL,lease_until=NULL,next_attempt_at=NULL
 WHERE n.status IN('queued','retrying','verification_pending') AND (n.lease_until IS NULL OR n.lease_until<=p_now) AND (n.attempts>=5 OR saas.seo_primary_host(n.store_id,p_now) IS DISTINCT FROM n.hostname OR NOT EXISTS(SELECT 1 FROM saas.seo_settings s WHERE s.store_id=n.store_id AND s.indexnow_enabled AND s.allow_index));
 WITH selected AS(SELECT n.id FROM saas.seo_notifications n WHERE n.status IN('queued','retrying','verification_pending') AND n.attempts<5 AND n.next_attempt_at<=p_now AND (n.lease_until IS NULL OR n.lease_until<=p_now) AND saas.seo_primary_host(n.store_id,p_now)=n.hostname AND saas.seo_path_valid(n.path) AND EXISTS(SELECT 1 FROM saas.seo_settings s WHERE s.store_id=n.store_id AND s.indexnow_enabled AND s.allow_index) ORDER BY n.requested_at,n.id FOR UPDATE SKIP LOCKED LIMIT p_limit),leased AS(
 UPDATE saas.seo_notifications n SET lease_id=gen_random_uuid(),lease_until=p_now+interval '15 minutes',worker_id=p_worker_id,attempts=n.attempts+1 FROM selected x WHERE n.id=x.id RETURNING n.*)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'storeId',n.store_id,'hostname',n.hostname,'key',s.indexnow_key,'path',n.path,'attempts',n.attempts,'leaseId',n.lease_id) ORDER BY n.requested_at,n.id),'[]'::jsonb) INTO notifications FROM leased n JOIN saas.seo_settings s ON s.store_id=n.store_id;
 UPDATE saas.seo_check_urls u SET status='failed',error=CASE WHEN u.attempts>=3 THEN 'retry_limit' ELSE 'host_ineligible' END,lease_id=NULL,lease_until=NULL,checked_at=p_now
 WHERE u.status='queued' AND (u.lease_until IS NULL OR u.lease_until<=p_now) AND (u.attempts>=3 OR saas.seo_primary_host(u.store_id,p_now) IS DISTINCT FROM u.hostname);
 UPDATE saas.seo_check_runs r SET checked=(SELECT count(*) FROM saas.seo_check_urls u WHERE u.run_id=r.id AND u.status<>'queued'),status=CASE WHEN NOT EXISTS(SELECT 1 FROM saas.seo_check_urls u WHERE u.run_id=r.id AND u.status='queued') THEN CASE WHEN EXISTS(SELECT 1 FROM saas.seo_check_urls u WHERE u.run_id=r.id AND u.status='failed') THEN 'failed' ELSE 'completed' END ELSE 'running' END,last_checked_at=p_now
 WHERE r.status='running';
 WITH selected AS(SELECT u.id FROM saas.seo_check_urls u JOIN saas.seo_check_runs r ON r.id=u.run_id AND r.status='running' WHERE u.status='queued' AND u.attempts<3 AND (u.lease_until IS NULL OR u.lease_until<=p_now) AND saas.seo_primary_host(u.store_id,p_now)=u.hostname AND saas.seo_path_valid(u.path) ORDER BY r.created_at,u.path,u.id FOR UPDATE OF u SKIP LOCKED LIMIT greatest(0,p_limit-jsonb_array_length(notifications))),leased AS(
 UPDATE saas.seo_check_urls u SET lease_id=gen_random_uuid(),lease_until=p_now+interval '15 minutes',worker_id=p_worker_id,attempts=u.attempts+1 FROM selected x WHERE u.id=x.id RETURNING u.*)
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'storeId',u.store_id,'hostname',u.hostname,'path',u.path,'kind',u.kind,'resourceId',u.resource_id,'leaseId',u.lease_id) ORDER BY u.path,u.id),'[]'::jsonb) INTO checks FROM leased u;
 RETURN QUERY SELECT 'claimed',jsonb_build_object('notifications',notifications,'checks',checks);
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_worker_finish_notification(p_id uuid,p_lease_id uuid,p_now timestamptz,p_result jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE n saas.seo_notifications%ROWTYPE;next_at timestamptz;selected_status text;BEGIN
 IF p_id IS NULL OR p_lease_id IS NULL OR p_now IS NULL OR NOT isfinite(p_now) OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR octet_length(p_result::text)>4096 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_result) k) IS DISTINCT FROM ARRAY['error','httpStatus','nextAttemptAt','status'] OR p_result->>'status' IS NULL OR p_result->>'status' NOT IN('received','verification_pending','retrying','failed') OR (p_result->'error'<>'null'::jsonb AND saas.seo_text_valid(p_result->'error',1000) IS DISTINCT FROM true) OR (p_result->'httpStatus'<>'null'::jsonb AND (jsonb_typeof(p_result->'httpStatus')<>'number' OR p_result->>'httpStatus'!~'^[1-5][0-9]{2}$')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 BEGIN next_at:=(p_result->>'nextAttemptAt')::timestamptz;EXCEPTION WHEN others THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END;
 selected_status:=p_result->>'status';IF selected_status IN('retrying','verification_pending') AND (next_at IS NULL OR NOT isfinite(next_at) OR next_at<=p_now OR next_at>p_now+interval '7 days') OR selected_status IN('received','failed') AND next_at IS NOT NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO n FROM saas.seo_notifications WHERE id=p_id AND lease_id=p_lease_id AND lease_until>p_now FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF saas.seo_primary_host(n.store_id,p_now) IS DISTINCT FROM n.hostname OR NOT EXISTS(SELECT 1 FROM saas.seo_settings s WHERE s.store_id=n.store_id AND s.indexnow_enabled AND s.allow_index) THEN selected_status:='failed';p_result:=p_result||jsonb_build_object('error','host_ineligible');next_at:=NULL;
 ELSIF n.attempts>=5 AND selected_status IN('retrying','verification_pending') THEN selected_status:='failed';p_result:=p_result||jsonb_build_object('error','retry_limit');next_at:=NULL;END IF;
 UPDATE saas.seo_notifications SET status=selected_status,http_status=(p_result->>'httpStatus')::integer,error=p_result->>'error',next_attempt_at=next_at,lease_id=NULL,lease_until=NULL WHERE id=p_id;
 RETURN QUERY SELECT 'finished','{}'::jsonb;
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_worker_finish_check(p_id uuid,p_lease_id uuid,p_now timestamptz,p_result jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE u saas.seo_check_urls%ROWTYPE;failed boolean;BEGIN
 IF p_id IS NULL OR p_lease_id IS NULL OR p_now IS NULL OR NOT isfinite(p_now) OR jsonb_typeof(p_result) IS DISTINCT FROM 'object' OR octet_length(p_result::text)>32768 OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_result) k) IS DISTINCT FROM ARRAY['error','issues'] OR jsonb_typeof(p_result->'issues') IS DISTINCT FROM 'array' OR (p_result->'error'<>'null'::jsonb AND saas.seo_text_valid(p_result->'error',1000) IS DISTINCT FROM true) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF jsonb_array_length(p_result->'issues')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_result->'issues') x WHERE jsonb_typeof(x.value) IS DISTINCT FROM 'object') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_result->'issues') x WHERE (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(x.value) k) IS DISTINCT FROM ARRAY['code','fixHref','kind','message','path','resourceId','severity'] OR x.value->>'severity' IS NULL OR x.value->>'severity' NOT IN('warning','error') OR saas.seo_text_valid(x.value->'code',100) IS DISTINCT FROM true OR x.value->'code'='null'::jsonb OR saas.seo_text_valid(x.value->'message',1000) IS DISTINCT FROM true OR x.value->'message'='null'::jsonb OR x.value->>'fixHref' NOT IN('/seo?tab=checks','/seo/settings') AND x.value->>'fixHref'!~'^/seo/content[?]kind=(product|category|page|blog)(&resourceId=[a-f0-9-]{36})?$') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO u FROM saas.seo_check_urls WHERE id=p_id AND lease_id=p_lease_id AND lease_until>p_now AND status='queued' FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 -- Worker findings can only describe the leased URL and resource.
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_result->'issues') x WHERE x.value->>'path' IS DISTINCT FROM u.path OR x.value->>'kind' IS DISTINCT FROM u.kind OR x.value->>'resourceId' IS DISTINCT FROM u.resource_id::text) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 failed:=p_result->>'error' IS NOT NULL OR saas.seo_primary_host(u.store_id,p_now) IS DISTINCT FROM u.hostname;
 UPDATE saas.seo_check_urls SET status=CASE WHEN failed THEN 'failed' ELSE 'completed' END,issues=p_result->'issues',error=CASE WHEN saas.seo_primary_host(u.store_id,p_now) IS DISTINCT FROM u.hostname THEN 'host_ineligible' ELSE p_result->>'error' END,checked_at=p_now,lease_id=NULL,lease_until=NULL WHERE id=p_id;
 PERFORM 1 FROM saas.seo_check_runs WHERE id=u.run_id FOR UPDATE;
 UPDATE saas.seo_check_runs r SET checked=(SELECT count(*) FROM saas.seo_check_urls c WHERE c.run_id=r.id AND c.status<>'queued'),status=CASE WHEN NOT EXISTS(SELECT 1 FROM saas.seo_check_urls c WHERE c.run_id=r.id AND c.status='queued') THEN CASE WHEN EXISTS(SELECT 1 FROM saas.seo_check_urls c WHERE c.run_id=r.id AND c.status='failed') THEN 'failed' ELSE 'completed' END ELSE 'running' END,last_checked_at=p_now WHERE r.id=u.run_id;
 RETURN QUERY SELECT 'finished','{}'::jsonb;
END $f$;
-- Import each active legacy source once. Native values win, and every unresolved source remains reviewable.
-- Source records (including drafts) are retained verbatim; reapply never resurrects metadata cleared in the hub.
DO $f$ DECLARE legacy record;target_kind text;rid uuid;native_title text;native_description text;source_title text;source_description text;next_title text;next_description text;canonical text;indexing text;reason text;matches integer;native_version bigint;now_at timestamptz;actor uuid;src record;dst record;src_count integer;dst_count integer;BEGIN
 FOR legacy IN SELECT r.* FROM saas.merchant_admin_records r WHERE r.status='active' AND r.record_kind IN('seo_product_entry','seo_page_entry','seo_content_entry','seo_internal_link') AND NOT EXISTS(SELECT 1 FROM saas.seo_legacy_reconciliation l WHERE l.source_id=r.id) ORDER BY r.store_id,r.updated_at,r.id LOOP
 reason:=NULL;target_kind:=NULL;rid:=NULL;now_at:=legacy.updated_at;
 IF legacy.record_kind='seo_internal_link' THEN
  IF saas.seo_path_valid(legacy.config->>'sourcePath') IS DISTINCT FROM true OR saas.seo_path_valid(legacy.config->>'targetPath') IS DISTINCT FROM true OR saas.seo_text_valid(legacy.config->'anchorText',160) IS DISTINCT FROM true OR legacy.config->>'anchorText' IS NULL THEN reason:='invalid_link';
  ELSE
   SELECT count(*) INTO src_count FROM saas.seo_resource_rows(legacy.store_id,now_at) r WHERE r.published AND (r.payload->>'path'=legacy.config->>'sourcePath' OR r.payload->>'effectiveCanonicalPath'=legacy.config->>'sourcePath');
   SELECT count(*) INTO dst_count FROM saas.seo_resource_rows(legacy.store_id,now_at) r WHERE r.published AND (r.payload->>'path'=legacy.config->>'targetPath' OR r.payload->>'effectiveCanonicalPath'=legacy.config->>'targetPath');
   IF src_count<>1 OR dst_count<>1 THEN reason:='ambiguous_or_unpublished_link_target';
   ELSE
    SELECT r.kind,r.id INTO src FROM saas.seo_resource_rows(legacy.store_id,now_at) r WHERE r.published AND (r.payload->>'path'=legacy.config->>'sourcePath' OR r.payload->>'effectiveCanonicalPath'=legacy.config->>'sourcePath');
    SELECT r.kind,r.id INTO dst FROM saas.seo_resource_rows(legacy.store_id,now_at) r WHERE r.published AND (r.payload->>'path'=legacy.config->>'targetPath' OR r.payload->>'effectiveCanonicalPath'=legacy.config->>'targetPath');
    IF src.kind=dst.kind AND src.id=dst.id THEN reason:='self_link';
    ELSIF EXISTS(SELECT 1 FROM saas.seo_links l WHERE l.store_id=legacy.store_id AND l.source_kind=src.kind AND l.source_id=src.id AND l.target_kind=dst.kind AND l.target_id=dst.id) THEN reason:='duplicate_link';
    ELSIF (SELECT count(*) FROM saas.seo_links WHERE store_id=legacy.store_id)>=500 THEN reason:='link_limit';
    ELSE INSERT INTO saas.seo_links(id,store_id,version,source_kind,source_id,target_kind,target_id,anchor_text,enabled,updated_at) VALUES(legacy.id,legacy.store_id,1,src.kind,src.id,dst.kind,dst.id,legacy.config->>'anchorText',coalesce(legacy.config->>'enabled'='true',true),legacy.updated_at);END IF;
   END IF;
  END IF;
 ELSE
  IF legacy.config->>'resourceId' IS NULL OR legacy.config->>'resourceId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN reason:='missing_resource';
  ELSE
   rid:=(legacy.config->>'resourceId')::uuid;
   IF legacy.record_kind='seo_product_entry' AND EXISTS(SELECT 1 FROM saas.products WHERE store_id=legacy.store_id AND id=rid AND status='active') THEN target_kind:='product';
   ELSE SELECT CASE WHEN r.record_kind='page' THEN 'page' ELSE 'blog' END INTO target_kind FROM saas.merchant_admin_records r WHERE r.store_id=legacy.store_id AND r.id=rid AND r.record_kind IN('page','blog_post') AND r.status='active' AND r.config->>'published'='true' AND r.config->>'slug'~'^[a-z0-9]+(-[a-z0-9]+)*$' AND (legacy.record_kind='seo_content_entry' OR legacy.record_kind='seo_page_entry' AND r.record_kind='page');END IF;
   IF target_kind IS NULL THEN reason:='missing_or_foreign_resource';rid:=NULL;
   ELSE
    SELECT count(*) INTO matches FROM saas.merchant_admin_records r WHERE r.store_id=legacy.store_id AND r.status='active' AND r.config->>'resourceId'=rid::text AND (target_kind='product' AND r.record_kind='seo_product_entry' OR target_kind IN('page','blog') AND r.record_kind='seo_content_entry' OR target_kind='page' AND r.record_kind='seo_page_entry');
    IF matches<>1 THEN reason:='ambiguous_metadata';
    ELSE
     IF target_kind='product' THEN SELECT pr.seo_title,pr.seo_description,p.version INTO native_title,native_description,native_version FROM saas.products p LEFT JOIN saas.catalog_product_profiles pr ON pr.store_id=p.store_id AND pr.product_id=p.id WHERE p.store_id=legacy.store_id AND p.id=rid;
     ELSE SELECT b.seo_title,b.seo_description,r.version INTO native_title,native_description,native_version FROM saas.merchant_admin_records r LEFT JOIN saas.merchant_content_bodies b ON b.store_id=r.store_id AND b.record_id=r.id WHERE r.store_id=legacy.store_id AND r.id=rid;END IF;
     source_title:=legacy.config->>'metaTitle';source_description:=legacy.config->>'metaDescription';next_title:=native_title;next_description:=native_description;
     IF source_title IS NOT NULL THEN
      IF saas.seo_text_valid(legacy.config->'metaTitle',CASE WHEN target_kind='product' THEN 200 ELSE 160 END) IS DISTINCT FROM true OR target_kind<>'product' AND octet_length(source_title)>160 THEN reason:='invalid_metadata';
      ELSIF nullif(btrim(native_title),'') IS NULL THEN next_title:=source_title;ELSIF source_title<>native_title THEN reason:='native_metadata_retained';END IF;
     END IF;
     IF source_description IS NOT NULL THEN
      IF saas.seo_text_valid(legacy.config->'metaDescription',CASE WHEN target_kind='product' THEN 500 ELSE 4000 END) IS DISTINCT FROM true OR target_kind<>'product' AND octet_length(source_description)>4000 THEN reason:='metadata_exceeds_native_limit';
      ELSIF nullif(btrim(native_description),'') IS NULL THEN next_description:=source_description;ELSIF source_description<>native_description THEN reason:='native_metadata_retained';END IF;
     END IF;
     IF next_title IS DISTINCT FROM native_title OR next_description IS DISTINCT FROM native_description THEN
      IF target_kind='product' THEN
       UPDATE saas.products SET version=version+1,updated_at=greatest(updated_at,now_at) WHERE store_id=legacy.store_id AND id=rid;
       INSERT INTO saas.catalog_product_profiles(product_id,store_id,product_type,seo_title,seo_description,version,created_at,updated_at) VALUES(rid,legacy.store_id,'physical',next_title,next_description,1,now_at,now_at) ON CONFLICT(product_id) DO UPDATE SET seo_title=excluded.seo_title,seo_description=excluded.seo_description,version=saas.catalog_product_profiles.version+1,updated_at=greatest(saas.catalog_product_profiles.updated_at,now_at);
      ELSE
       UPDATE saas.merchant_admin_records SET version=version+1,updated_at=greatest(updated_at,now_at) WHERE store_id=legacy.store_id AND id=rid;
       INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins,excerpt,seo_title,seo_description) SELECT legacy.store_id,r.id,native_version+1,coalesce(r.config->>'body',''),'legacy','{}'::jsonb,r.config->>'excerpt',next_title,next_description FROM saas.merchant_admin_records r WHERE r.store_id=legacy.store_id AND r.id=rid
       ON CONFLICT(store_id,record_id) DO UPDATE SET version=excluded.version,seo_title=excluded.seo_title,seo_description=excluded.seo_description;
       SELECT m.principal_id INTO actor FROM saas.memberships m WHERE m.store_id=legacy.store_id AND m.status='active' AND m.role IN('store_owner','admin') ORDER BY m.created_at,m.id LIMIT 1;
       IF actor IS NOT NULL THEN PERFORM saas.merchant_content_snapshot(legacy.store_id,rid,gen_random_uuid(),actor,'generic');END IF;
      END IF;
     END IF;
     canonical:=legacy.config->>'canonicalPath';indexing:=CASE WHEN legacy.config->>'indexing'='noindex' OR legacy.config->>'allowIndex'='false' OR legacy.config->>'noindex'='true' THEN 'noindex' WHEN legacy.config->>'indexing'='index' THEN 'index' ELSE 'inherit' END;
     IF canonical IS NOT NULL AND saas.seo_canonical_owned(legacy.store_id,clock_timestamp(),canonical,target_kind,rid) IS DISTINCT FROM true THEN reason:='invalid_canonical';canonical:=NULL;END IF;
     IF canonical IS NOT NULL OR indexing<>'inherit' THEN
      IF EXISTS(SELECT 1 FROM saas.seo_resource_options o WHERE o.store_id=legacy.store_id AND o.kind=target_kind AND o.resource_id=rid) THEN
       IF EXISTS(SELECT 1 FROM saas.seo_resource_options o WHERE o.store_id=legacy.store_id AND o.kind=target_kind AND o.resource_id=rid AND (o.canonical_path IS DISTINCT FROM canonical OR o.indexing<>indexing)) THEN reason:='native_options_retained';END IF;
      ELSE INSERT INTO saas.seo_resource_options(store_id,kind,resource_id,version,canonical_path,indexing,updated_at) VALUES(legacy.store_id,target_kind,rid,1,canonical,indexing,legacy.updated_at);END IF;
     END IF;
    END IF;
   END IF;
  END IF;
 END IF;
 INSERT INTO saas.seo_legacy_reconciliation(source_id,store_id,source_kind,resource_kind,resource_id,outcome,reason,created_at) VALUES(legacy.id,legacy.store_id,legacy.record_kind,target_kind,rid,CASE WHEN reason IS NULL THEN 'applied' ELSE 'conflict' END,reason,clock_timestamp());
 END LOOP;
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_category_metadata_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE previous jsonb;current jsonb;metadata jsonb;rid uuid;sid uuid;now_at timestamptz;BEGIN
 previous:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;current:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 IF coalesce(current->>'record_kind',previous->>'record_kind')<>'seo_category_entry' THEN RETURN coalesce(NEW,OLD);END IF;
 -- Draft metadata remains a draft; only public changes advance public category metadata.
 IF (current->>'status'='active' OR previous->>'status'='active') IS DISTINCT FROM true THEN RETURN coalesce(NEW,OLD);END IF;
 metadata:=coalesce(current,previous);sid:=(metadata->>'store_id')::uuid;
 IF metadata#>>'{config,resourceId}'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN coalesce(NEW,OLD);END IF;
 rid:=(metadata#>>'{config,resourceId}')::uuid;now_at:=coalesce((current->>'updated_at')::timestamptz,clock_timestamp());
 UPDATE saas.catalog_categories c SET version=c.version+1,updated_at=greatest(c.updated_at,now_at) WHERE c.store_id=sid AND c.id=rid AND c.status='active';
 RETURN coalesce(NEW,OLD);
END $f$;
DROP TRIGGER IF EXISTS seo_category_metadata ON saas.merchant_admin_records;
CREATE TRIGGER seo_category_metadata AFTER INSERT OR UPDATE OR DELETE ON saas.merchant_admin_records FOR EACH ROW EXECUTE FUNCTION saas.seo_category_metadata_trigger();
-- Native mutations enqueue in the caller's transaction. OLD paths survive slug changes/archive/deletion.
CREATE OR REPLACE FUNCTION saas.seo_resource_notify_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE old_data jsonb;new_data jsonb;sid uuid;rid uuid;k text;locale text;default_locale text;old_path text;old_canonical text;now_at timestamptz;resource jsonb;old_published boolean;BEGIN
 old_data:=CASE WHEN TG_OP='INSERT' THEN NULL ELSE to_jsonb(OLD) END;new_data:=CASE WHEN TG_OP='DELETE' THEN NULL ELSE to_jsonb(NEW) END;
 sid:=coalesce(new_data->>'store_id',old_data->>'store_id')::uuid;
 now_at:=coalesce((new_data->>'updated_at')::timestamptz,clock_timestamp());
 IF TG_TABLE_NAME='products' THEN k:='product';rid:=coalesce(new_data->>'id',old_data->>'id')::uuid;
 ELSIF TG_TABLE_NAME='catalog_categories' THEN k:='category';rid:=coalesce(new_data->>'id',old_data->>'id')::uuid;
 ELSIF TG_TABLE_NAME IN('catalog_product_profiles','product_variants','product_media') THEN k:='product';rid:=coalesce(new_data->>'product_id',old_data->>'product_id')::uuid;
 ELSIF TG_TABLE_NAME='merchant_content_bodies' THEN SELECT CASE WHEN r.record_kind='page' THEN 'page' ELSE 'blog' END INTO k FROM saas.merchant_admin_records r WHERE r.store_id=sid AND r.id=coalesce(new_data->>'record_id',old_data->>'record_id')::uuid;rid:=coalesce(new_data->>'record_id',old_data->>'record_id')::uuid;
 ELSE
 IF coalesce(new_data->>'record_kind',old_data->>'record_kind') NOT IN('page','blog_post') THEN RETURN coalesce(NEW,OLD);END IF;
 k:=CASE WHEN coalesce(new_data->>'record_kind',old_data->>'record_kind')='page' THEN 'page' ELSE 'blog' END;rid:=coalesce(new_data->>'id',old_data->>'id')::uuid;
 END IF;
 IF TG_TABLE_NAME IN('products','catalog_categories','merchant_admin_records') AND old_data IS NOT NULL THEN
 SELECT s.locale INTO locale FROM saas.stores s WHERE s.id=sid;
 IF k='product' THEN old_path:=(CASE WHEN locale='tr' OR locale LIKE 'tr-%' THEN '/urun/' ELSE '/products/' END)||(old_data->>'slug');old_published:=old_data->>'status'='active';
 ELSIF k='category' THEN old_path:=(CASE WHEN locale='tr' OR locale LIKE 'tr-%' THEN '/kategori/' ELSE '/categories/' END)||(old_data->>'slug');old_published:=old_data->>'status'='active';
 ELSE
 default_locale:=saas.public_content_locale_config(sid)->>'defaultLocale';locale:=coalesce(old_data#>>'{config,locale}',default_locale);
 old_path:=(CASE WHEN k='page' THEN '/pages/' ELSE '/blog/' END)||(old_data#>>'{config,slug}')||(CASE WHEN locale=default_locale THEN '' ELSE '?lang='||locale END);
 old_published:=old_data->>'status'='active' AND old_data#>>'{config,published}'='true';END IF;
 SELECT canonical_path INTO old_canonical FROM saas.seo_resource_options WHERE store_id=sid AND kind=k AND resource_id=rid AND indexing<>'noindex';
 IF old_published AND NOT EXISTS(SELECT 1 FROM saas.seo_resource_options WHERE store_id=sid AND kind=k AND resource_id=rid AND indexing='noindex') THEN PERFORM saas.seo_enqueue(sid,old_path,now_at);IF old_canonical IS NOT NULL THEN PERFORM saas.seo_enqueue(sid,old_canonical,now_at);END IF;END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN SELECT x.payload INTO resource FROM saas.seo_resource_rows(sid,now_at) x WHERE x.kind=k AND x.id=rid AND x.published;
 IF resource->>'allowIndex'='true' THEN PERFORM saas.seo_enqueue(sid,resource->>'effectiveCanonicalPath',now_at);END IF;END IF;
 RETURN coalesce(NEW,OLD);
END $f$;
DO $f$ DECLARE tab text;BEGIN FOREACH tab IN ARRAY ARRAY['products','catalog_product_profiles','catalog_categories','merchant_admin_records','merchant_content_bodies','product_variants','product_media'] LOOP
 EXECUTE format('DROP TRIGGER IF EXISTS seo_resource_notification ON saas.%I',tab);
 EXECUTE format('CREATE TRIGGER seo_resource_notification AFTER INSERT OR UPDATE OR DELETE ON saas.%I FOR EACH ROW EXECUTE FUNCTION saas.seo_resource_notify_trigger()',tab);
END LOOP;END $f$;
-- Keep the two established sitemap shard types; the content shard also contains home/catalog/categories.
DO $f$ BEGIN
 IF to_regprocedure('saas.public_content_sitemap_rows_before_seo_hub(uuid,text,timestamptz,text,jsonb,text,text)') IS NULL THEN ALTER FUNCTION saas.public_content_sitemap_rows(uuid,text,timestamptz,text,jsonb,text,text) RENAME TO public_content_sitemap_rows_before_seo_hub;END IF;
 IF to_regprocedure('saas.public_content_index_allowed_before_seo_hub(uuid,text,timestamptz)') IS NULL THEN ALTER FUNCTION saas.public_content_index_allowed(uuid,text,timestamptz) RENAME TO public_content_index_allowed_before_seo_hub;END IF;
END $f$;
CREATE OR REPLACE FUNCTION saas.public_content_index_allowed(p_store_id uuid,p_hostname text,p_now timestamptz) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.seo_primary_host(p_store_id,p_now)=p_hostname AND saas.seo_settings_projection(p_store_id,p_now,p_hostname)->>'allowIndex'='true'
$f$;
CREATE OR REPLACE FUNCTION saas.public_content_sitemap_rows(p_store_id uuid,p_kind text,p_now timestamptz,p_default_locale text,p_enabled_locales jsonb,p_product_locale text,p_frequency text) RETURNS TABLE(path text,updated_at timestamptz,change_frequency text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT candidate.path,max(candidate.updated_at),p_frequency FROM (
 SELECT r.payload->>'effectiveCanonicalPath' path,(r.payload->>'updatedAt')::timestamptz updated_at FROM saas.seo_resource_rows(p_store_id,p_now) r WHERE r.published AND r.payload->>'allowIndex'='true' AND (p_kind='products' AND r.kind='product' OR p_kind='content' AND r.kind IN('category','page','blog'))
 UNION ALL SELECT '/',s.updated_at FROM saas.stores s WHERE s.id=p_store_id AND p_kind='content'
 UNION ALL SELECT CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/urunler' ELSE '/products' END,s.updated_at FROM saas.stores s WHERE s.id=p_store_id AND p_kind='content'
 ) candidate WHERE saas.seo_path_valid(candidate.path) GROUP BY candidate.path ORDER BY candidate.path
$f$;
-- Grant only entry points; helper functions and tables remain private.
DO $f$ DECLARE fn record;BEGIN FOR fn IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'seo_%' LOOP
 EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',fn.signature);
END LOOP;END $f$;
REVOKE ALL ON FUNCTION saas.public_content_index_allowed(uuid,text,timestamptz),saas.public_content_sitemap_rows(uuid,text,timestamptz,text,jsonb,text,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.seo_admin_read(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb),saas.seo_admin_overview(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.seo_admin_recover(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text),saas.seo_admin_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.seo_public_get(text,timestamptz,text,uuid),saas.seo_public_settings(text,timestamptz),saas.seo_public_key(text,timestamptz) TO celebix_saas_host_resolver;
GRANT EXECUTE ON FUNCTION saas.seo_worker_claim(timestamptz,integer,text),saas.seo_worker_finish_notification(uuid,uuid,timestamptz,jsonb),saas.seo_worker_finish_check(uuid,uuid,timestamptz,jsonb) TO celebix_saas_workflow;
COMMIT;
