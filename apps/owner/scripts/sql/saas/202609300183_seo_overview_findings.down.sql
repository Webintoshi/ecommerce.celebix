-- Keep actionable SEO findings visible when metadata warnings exceed the overview cap.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
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
 WITH filtered AS(SELECT * FROM saas.seo_resource_rows_scoped(p_store_id,p_now,p_request->>'kind',NULL) x WHERE (p_request->>'kind' IS NULL OR x.kind=p_request->>'kind') AND (p_request->>'query' IS NULL OR position(lower(p_request->>'query') IN lower((x.payload->>'name')||' '||(x.payload->>'path')||' '||(x.payload->>'effectiveCanonicalPath')||' '||x.id::text))>0) AND (p_request->>'missing'<>'true' OR x.payload->>'title' IS NULL OR x.payload->>'description' IS NULL)), page AS(SELECT * FROM filtered ORDER BY kind,id OFFSET off LIMIT lim)
 SELECT (SELECT count(*) FROM filtered),coalesce(jsonb_agg(payload ORDER BY kind,id),'[]'::jsonb) INTO n,items FROM page;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',items,'nextCursor',CASE WHEN off+lim<n THEN (off+lim)::text ELSE NULL END,'total',n);RETURN;END IF;
 settings:=saas.seo_settings_projection(p_store_id,p_now);host:=settings->>'hostname';
 sitemap_config:=saas.public_content_sitemap_config(p_store_id);
 WITH resources AS MATERIALIZED(SELECT * FROM saas.seo_resource_rows(p_store_id,p_now)),
 duplicate_titles AS MATERIALIZED(SELECT lower(payload->>'effectiveTitle') title FROM resources WHERE published GROUP BY lower(payload->>'effectiveTitle') HAVING count(*)>1),
 duplicate_descriptions AS MATERIALIZED(SELECT lower(payload->>'effectiveDescription') description FROM resources WHERE published AND btrim(coalesce(payload->>'effectiveDescription',''))<>'' GROUP BY lower(payload->>'effectiveDescription') HAVING count(*)>1),
 duplicate_categories AS MATERIALIZED(SELECT config->>'resourceId' resource_id FROM saas.merchant_admin_records WHERE store_id=p_store_id AND record_kind='seo_category_entry' AND status='active' GROUP BY config->>'resourceId' HAVING count(*)>1),
 sitemap_candidates AS (
 SELECT CASE WHEN r.kind='product' THEN 'products' ELSE 'content' END shard,r.payload->>'effectiveCanonicalPath' path FROM resources r WHERE r.published AND r.payload->>'allowIndex'='true'
 UNION ALL SELECT 'content','/'
 UNION ALL SELECT 'content',CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/urunler' ELSE '/products' END FROM saas.stores s WHERE s.id=p_store_id
 ) SELECT (SELECT count(*) FROM resources),(SELECT count(*) FROM resources WHERE published),
 (SELECT count(*) FROM (SELECT shard,path FROM sitemap_candidates WHERE saas.seo_path_valid(path) AND (shard='products' AND sitemap_config->>'includeProducts'='true' OR shard='content' AND sitemap_config->>'includeContent'='true') GROUP BY shard,path) sitemap_entries),
(SELECT coalesce(jsonb_agg(issue),'[]'::jsonb) FROM (
 SELECT jsonb_build_object('code','missing_title','severity','warning','message','SEO başlığı eksik.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) issue FROM resources x WHERE x.published AND x.payload->>'title' IS NULL
 UNION ALL SELECT jsonb_build_object('code','missing_description','severity','warning','message','SEO açıklaması eksik.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM resources x WHERE x.published AND x.payload->>'description' IS NULL
 UNION ALL SELECT jsonb_build_object('code','duplicate_title','severity','warning','message','SEO başlığı birden fazla içerikte kullanılıyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM resources x WHERE x.published AND EXISTS(SELECT 1 FROM duplicate_titles d WHERE d.title=lower(x.payload->>'effectiveTitle'))
 UNION ALL SELECT jsonb_build_object('code','duplicate_description','severity','warning','message','SEO açıklaması birden fazla içerikte kullanılıyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM resources x WHERE x.published AND btrim(coalesce(x.payload->>'effectiveDescription',''))<>'' AND EXISTS(SELECT 1 FROM duplicate_descriptions d WHERE d.description=lower(x.payload->>'effectiveDescription'))
 UNION ALL SELECT jsonb_build_object('code','legacy_seo_conflict','severity','warning','message','Bu kategori için birden fazla etkin SEO kaydı var.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind=category&resourceId='||x.id::text) FROM resources x WHERE x.kind='category' AND EXISTS(SELECT 1 FROM duplicate_categories d WHERE d.resource_id=x.id::text)
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
 UNION ALL SELECT jsonb_build_object('code','invalid_canonical','severity','error','message','Kanonik adres mağazada yayımlanmış bir içerikle eşleşmiyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind='||x.kind||'&resourceId='||x.id::text) FROM resources x WHERE x.payload->>'canonicalPath' IS NOT NULL AND saas.seo_canonical_owned(p_store_id,p_now,x.payload->>'canonicalPath',x.kind,x.id) IS DISTINCT FROM true
 UNION ALL SELECT jsonb_build_object('code','invalid_canonical','severity','error','message','Önceki kategori kanonik adresi mağazada yayımlanmış bir içerikle eşleşmiyor.','path',x.payload->>'path','kind',x.kind,'resourceId',x.id,'fixHref','/seo/content?kind=category&resourceId='||x.id::text) FROM resources x WHERE x.kind='category' AND EXISTS(SELECT 1 FROM saas.merchant_admin_records legacy WHERE legacy.store_id=p_store_id AND legacy.record_kind='seo_category_entry' AND legacy.status='active' AND legacy.config->>'resourceId'=x.id::text AND legacy.config->>'canonicalPath' IS NOT NULL AND saas.seo_canonical_owned(p_store_id,p_now,legacy.config->>'canonicalPath',x.kind,x.id) IS DISTINCT FROM true)
 UNION ALL SELECT jsonb_build_object('code','domain_required','severity','warning','message','Doğrulanmış birincil alan adı gerekli.','path',NULL,'kind',NULL,'resourceId',NULL,'fixHref','/seo/settings') WHERE host IS NULL
 UNION ALL SELECT jsonb_build_object('code','indexing_disabled','severity','warning','message','Arama motoru indekslemesi kapalı.','path',NULL,'kind',NULL,'resourceId',NULL,'fixHref','/seo/settings') WHERE settings->>'allowIndex'<>'true'
 UNION ALL SELECT issue.value FROM saas.seo_check_urls u CROSS JOIN LATERAL jsonb_array_elements(u.issues) issue WHERE u.run_id=(SELECT id FROM saas.seo_check_runs WHERE store_id=p_store_id ORDER BY created_at DESC,id DESC LIMIT 1)
 LIMIT 200) all_issues) INTO n,pub,entries,issues;
 SELECT * INTO run_record FROM saas.seo_check_runs WHERE store_id=p_store_id ORDER BY created_at DESC,id DESC LIMIT 1;
 check_state:=jsonb_build_object('checked',coalesce(run_record.checked,0),'total',coalesce(run_record.total,0),'status',coalesce(run_record.status,'idle'),'lastCheckedAt',saas.merchant_admin_timestamp(run_record.last_checked_at));
 RETURN QUERY SELECT 'found',jsonb_build_object('totalResources',n,'publishedResources',pub,'issues',issues,'sitemap',jsonb_build_object('url',CASE WHEN host IS NULL THEN NULL ELSE 'https://'||host||'/sitemap.xml' END,'robotsUrl',CASE WHEN host IS NULL THEN NULL ELSE 'https://'||host||'/robots.txt' END,'entryCount',CASE WHEN host IS NOT NULL AND settings->>'allowIndex'='true' THEN entries ELSE 0 END),'check',check_state,'notifications',saas.seo_notifications_projection(p_store_id),'settings',settings);
END $f$;
CREATE OR REPLACE FUNCTION saas.seo_links_projection(p_store_id uuid,p_now timestamptz) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'version',l.version,'sourceKind',l.source_kind,'sourceId',l.source_id,'targetKind',l.target_kind,'targetId',l.target_id,'sourcePath',src.payload->>'path','targetPath',dst.payload->>'effectiveCanonicalPath','anchorText',l.anchor_text,'enabled',l.enabled) ORDER BY l.updated_at DESC,l.id),'[]'::jsonb)
 FROM saas.seo_links l JOIN LATERAL saas.seo_resource_rows_scoped(p_store_id,p_now,l.source_kind,l.source_id) src ON true JOIN LATERAL saas.seo_resource_rows_scoped(p_store_id,p_now,l.target_kind,l.target_id) dst ON true WHERE l.store_id=p_store_id
$f$;

CREATE OR REPLACE FUNCTION saas.seo_admin_mutate(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_action text,p_request jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE check_candidates jsonb;e text;op saas.seo_operations%ROWTYPE;resource jsonb;src jsonb;dst jsonb;result jsonb;selected_kind text;rid uuid;native_version bigint;options_version bigint;settings_version bigint;body_version bigint;link_id uuid;link saas.seo_links%ROWTYPE;candidate record;queued integer:=0;host text;run_id uuid;total integer;allowed jsonb;keys text[];category_record saas.merchant_admin_records%ROWTYPE;category_config jsonb;BEGIN
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
 SELECT x.payload INTO resource FROM saas.seo_resource_rows_scoped(p_store_id,p_now,selected_kind,rid) x WHERE x.kind=selected_kind AND x.id=rid;
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
 SELECT x.payload INTO resource FROM saas.seo_resource_rows_scoped(p_store_id,p_now,selected_kind,rid) x WHERE x.kind=selected_kind AND x.id=rid;
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
 SELECT x.payload INTO src FROM saas.seo_resource_rows_scoped(p_store_id,p_now,p_request->>'sourceKind',(p_request->>'sourceId')::uuid) x WHERE x.kind=p_request->>'sourceKind' AND x.id=(p_request->>'sourceId')::uuid;
 SELECT x.payload INTO dst FROM saas.seo_resource_rows_scoped(p_store_id,p_now,p_request->>'targetKind',(p_request->>'targetId')::uuid) x WHERE x.kind=p_request->>'targetKind' AND x.id=(p_request->>'targetId')::uuid;
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
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_request->'resources') x WHERE NOT EXISTS(SELECT 1 FROM saas.seo_resource_rows_scoped(p_store_id,p_now,x.value->>'kind',(x.value->>'id')::uuid) r WHERE r.kind=x.value->>'kind' AND r.id=(x.value->>'id')::uuid AND r.published AND r.payload->>'allowIndex'='true')) THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 FOR candidate IN SELECT DISTINCT r.payload->>'effectiveCanonicalPath' path FROM jsonb_array_elements(p_request->'resources') x CROSS JOIN LATERAL saas.seo_resource_rows_scoped(p_store_id,p_now,x.value->>'kind',(x.value->>'id')::uuid) r LOOP queued:=queued+saas.seo_enqueue(p_store_id,candidate.path,p_now);END LOOP;
 result:=jsonb_build_object('queued',queued);
 ELSIF p_action='check' THEN
 IF p_request<>'{}'::jsonb THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 host:=saas.seo_primary_host(p_store_id,p_now);IF host IS NULL THEN RETURN QUERY SELECT 'feature_not_enabled',NULL::jsonb;RETURN;END IF;
 SELECT id INTO run_id FROM saas.seo_check_runs WHERE store_id=p_store_id AND status='running';
 IF run_id IS NULL THEN
 SELECT coalesce(jsonb_agg(jsonb_build_object('path',x.path,'kind',x.kind,'id',x.id)),'[]'::jsonb) INTO check_candidates FROM (SELECT DISTINCT ON (r.payload->>'path') r.payload->>'path' path,r.kind,r.id FROM saas.seo_resource_rows(p_store_id,p_now) r WHERE r.published AND saas.seo_path_valid(r.payload->>'path') ORDER BY r.payload->>'path',r.kind,r.id) x;total:=jsonb_array_length(check_candidates);IF total>20000 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 run_id:=gen_random_uuid();INSERT INTO saas.seo_check_runs(id,store_id,total,status,created_at) VALUES(run_id,p_store_id,total+2,'running',p_now);
 INSERT INTO saas.seo_check_urls(id,run_id,store_id,hostname,path,kind,resource_id,status)
 SELECT gen_random_uuid(),run_id,p_store_id,host,x.value->>'path',x.value->>'kind',(x.value->>'id')::uuid,'queued' FROM jsonb_array_elements(check_candidates) x;
 INSERT INTO saas.seo_check_urls(id,run_id,store_id,hostname,path,status) VALUES(gen_random_uuid(),run_id,p_store_id,host,'/','queued'),(gen_random_uuid(),run_id,p_store_id,host,(SELECT CASE WHEN locale='tr' OR locale LIKE 'tr-%' THEN '/urunler' ELSE '/products' END FROM saas.stores WHERE id=p_store_id),'queued');
 END IF;
 SELECT jsonb_build_object('checked',r.checked,'total',r.total,'status',r.status) INTO result FROM saas.seo_check_runs r WHERE r.id=run_id;
 END IF;
 INSERT INTO saas.seo_operations(operation_id,store_id,principal_id,action,fingerprint,result_payload,created_at) VALUES(p_operation_id,p_store_id,p_principal_id,p_action,p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'saved',result;
END $f$;
COMMIT;
