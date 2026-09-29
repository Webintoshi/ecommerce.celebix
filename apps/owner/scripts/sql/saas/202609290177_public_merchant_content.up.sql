-- Public merchant content is resolved only through an active verified hostname.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

CREATE FUNCTION saas.public_content_locale_config(p_store_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.merchant_content_locale_config(p_store_id)
$f$;

CREATE FUNCTION saas.public_content_sitemap_config(p_store_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE settings jsonb;n integer;frequency text;
BEGIN
 SELECT count(*) INTO n FROM saas.merchant_admin_records
 WHERE store_id=p_store_id AND record_kind='sitemap' AND status='active';
 IF n>1 THEN RAISE EXCEPTION 'PUBLIC_CONTENT_SITEMAP_AMBIGUOUS';END IF;
 IF n=0 THEN RETURN jsonb_build_object('includeProducts',true,'includeContent',true,'changeFrequency','weekly');END IF;
 SELECT config INTO settings FROM saas.merchant_admin_records
 WHERE store_id=p_store_id AND record_kind='sitemap' AND status='active';
 frequency:=CASE WHEN settings?'changeFrequency' THEN settings->>'changeFrequency' ELSE 'weekly' END;
 IF (settings?'includeProducts' AND jsonb_typeof(settings->'includeProducts')<>'boolean')
 OR (settings?'includeContent' AND jsonb_typeof(settings->'includeContent')<>'boolean')
 OR frequency IS NULL OR frequency NOT IN('always','hourly','daily','weekly','monthly','yearly','never')
 THEN RAISE EXCEPTION 'PUBLIC_CONTENT_SITEMAP_INVALID';END IF;
 RETURN jsonb_build_object('includeProducts',coalesce((settings->>'includeProducts')::boolean,true),'includeContent',coalesce((settings->>'includeContent')::boolean,true),'changeFrequency',frequency);
END $f$;

CREATE FUNCTION saas.public_content_index_allowed(p_store_id uuid,p_hostname text,p_now timestamptz)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE enabled boolean;
BEGIN
 SELECT d.hostname_type='custom_domain' AND d.is_primary INTO enabled FROM saas.store_domains d
 WHERE d.store_id=p_store_id AND d.hostname=p_hostname AND d.status='active' AND d.verified_at<=p_now;
 IF enabled IS DISTINCT FROM true THEN RETURN false;END IF;
 RETURN coalesce((SELECT r.config->>'allowIndex'='true' FROM saas.merchant_admin_records r
 WHERE r.store_id=p_store_id AND r.record_kind='seo_control' AND r.status='active'
 ORDER BY r.updated_at DESC,r.id DESC LIMIT 1),false);
END $f$;

CREATE FUNCTION saas.public_content_projection(p_store_id uuid,p_record_id uuid,p_default_locale text,p_include_body boolean)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',r.id,'kind',r.record_kind,'slug',r.config->>'slug',
  'locale',coalesce(r.config->>'locale',p_default_locale),'title',r.name,
  'bodyFormat',coalesce(b.body_format,'legacy'),
  'excerpt',CASE WHEN b.record_id IS NULL THEN r.config->>'excerpt' ELSE b.excerpt END,'seoTitle',b.seo_title,'seoDescription',b.seo_description,
  'publishedAt',saas.merchant_admin_timestamp(r.updated_at),'updatedAt',saas.merchant_admin_timestamp(r.updated_at))
  || CASE WHEN p_include_body THEN jsonb_build_object('body',coalesce(b.body,r.config->>'body','')) ELSE '{}'::jsonb END
 FROM saas.merchant_admin_records r LEFT JOIN saas.merchant_content_bodies b ON b.store_id=r.store_id AND b.record_id=r.id
 WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind IN('page','blog_post')
$f$;

CREATE FUNCTION saas.public_content_locale_get(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now);
 IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',saas.public_content_locale_config(selected_store);
END $f$;

CREATE FUNCTION saas.public_content_get_v2(p_hostname text,p_now timestamptz,p_kind text,p_slug text,p_locale text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; language jsonb;selected_id uuid;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true
 OR p_kind NOT IN('page','blog_post') OR p_slug IS NULL OR char_length(p_slug) NOT BETWEEN 1 AND 100 OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$'
 OR p_locale IS NULL OR p_locale!~'^[a-z]{2,3}(-[A-Z]{2})?$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now);
 IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 language:=saas.public_content_locale_config(selected_store);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(language->'enabledLocales') enabled WHERE enabled.value=p_locale) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT r.id INTO selected_id FROM saas.merchant_admin_records r
 WHERE r.store_id=selected_store AND r.record_kind=p_kind AND r.status='active' AND r.config->>'published'='true'
 AND r.config->>'slug'=p_slug AND coalesce(r.config->>'locale',language->>'defaultLocale')=p_locale
 ORDER BY r.updated_at DESC,r.id DESC LIMIT 1;
 RETURN QUERY SELECT CASE WHEN selected_id IS NULL THEN 'not_found' ELSE 'found' END,
 CASE WHEN selected_id IS NULL THEN NULL::jsonb ELSE saas.public_content_projection(selected_store,selected_id,language->>'defaultLocale',true) END;
END $f$;

CREATE FUNCTION saas.public_content_page_get_v2(p_hostname text,p_now timestamptz,p_slug text,p_locale text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.public_content_get_v2(p_hostname,p_now,'page',p_slug,p_locale)
$f$;
CREATE FUNCTION saas.public_blog_get(p_hostname text,p_now timestamptz,p_slug text,p_locale text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT * FROM saas.public_content_get_v2(p_hostname,p_now,'blog_post',p_slug,p_locale)
$f$;

CREATE FUNCTION saas.public_blog_list(p_hostname text,p_now timestamptz,p_locale text,p_limit integer,p_cursor jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;language jsonb;cursor_at timestamptz;cursor_id uuid;cursor_text text;items jsonb;row_count integer;last_at timestamptz;last_id uuid;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true
 OR p_locale IS NULL OR p_locale!~'^[a-z]{2,3}(-[A-Z]{2})?$' OR p_limit NOT BETWEEN 1 AND 20
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_cursor IS NOT NULL THEN
  IF jsonb_typeof(p_cursor)<>'object' OR (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_cursor) k)<>ARRAY['id','kind','locale','updatedAt']
  OR p_cursor->>'kind'<>'blog_post' OR p_cursor->>'locale'<>p_locale OR p_cursor->>'id'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'
  OR p_cursor->>'updatedAt'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}[.][0-9]{3}Z$'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  BEGIN cursor_at:=(p_cursor->>'updatedAt')::timestamptz;cursor_id:=(p_cursor->>'id')::uuid;
  EXCEPTION WHEN others THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END;
  IF saas.merchant_admin_timestamp(cursor_at)<>p_cursor->>'updatedAt' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now);IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 language:=saas.public_content_locale_config(selected_store);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(language->'enabledLocales') enabled WHERE enabled.value=p_locale) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 WITH winners AS (
  SELECT DISTINCT ON (r.config->>'slug') r.id,r.updated_at,r.config->>'slug' slug FROM saas.merchant_admin_records r
  WHERE r.store_id=selected_store AND r.record_kind='blog_post' AND r.status='active' AND r.config->>'published'='true'
  AND r.config?'slug' AND char_length(r.config->>'slug') BETWEEN 1 AND 100
  AND r.config->>'slug'~'^[a-z0-9]+(-[a-z0-9]+)*$'
  AND coalesce(r.config->>'locale',language->>'defaultLocale')=p_locale
  ORDER BY r.config->>'slug',r.updated_at DESC,r.id DESC
 ), segment AS (
  SELECT * FROM winners w WHERE p_cursor IS NULL OR (w.updated_at,w.id)<(cursor_at,cursor_id)
  ORDER BY w.updated_at DESC,w.id DESC LIMIT p_limit+1
 ), page AS (SELECT * FROM segment ORDER BY updated_at DESC,id DESC LIMIT p_limit)
 SELECT coalesce(jsonb_agg(saas.public_content_projection(selected_store,p.id,language->>'defaultLocale',false) ORDER BY p.updated_at DESC,p.id DESC),'[]'::jsonb),
 (SELECT count(*) FROM segment)
 INTO items,row_count FROM page p;
 -- A stable cursor uses the final visible row, never the extra lookahead row.
 IF row_count>p_limit THEN
  SELECT p.updated_at,p.id INTO last_at,last_id FROM (
   SELECT DISTINCT ON (r.config->>'slug') r.id,r.updated_at,r.config->>'slug' slug FROM saas.merchant_admin_records r
   WHERE r.store_id=selected_store AND r.record_kind='blog_post' AND r.status='active' AND r.config->>'published'='true'
   AND r.config?'slug' AND char_length(r.config->>'slug') BETWEEN 1 AND 100
   AND r.config->>'slug'~'^[a-z0-9]+(-[a-z0-9]+)*$'
   AND coalesce(r.config->>'locale',language->>'defaultLocale')=p_locale
   ORDER BY r.config->>'slug',r.updated_at DESC,r.id DESC
  ) p WHERE p_cursor IS NULL OR (p.updated_at,p.id)<(cursor_at,cursor_id)
  ORDER BY p.updated_at DESC,p.id DESC OFFSET p_limit-1 LIMIT 1;
  cursor_text:=rtrim(translate(encode(convert_to(jsonb_build_object('kind','blog_post','locale',p_locale,'updatedAt',saas.merchant_admin_timestamp(last_at),'id',last_id)::text,'UTF8'),'base64'),'+/','-_'),'=');
 END IF;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',items,'nextCursor',cursor_text);
END $f$;

CREATE FUNCTION saas.public_content_sitemap_rows(p_store_id uuid,p_kind text,p_now timestamptz,p_default_locale text,p_enabled_locales jsonb,p_product_locale text,p_frequency text)
RETURNS TABLE(path text,updated_at timestamptz,change_frequency text) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF p_kind='products' THEN
  RETURN QUERY SELECT (CASE WHEN p_product_locale='tr' OR p_product_locale LIKE 'tr-%' THEN '/urun/' ELSE '/products/' END)||p.slug,p.updated_at,p_frequency
  FROM saas.products p CROSS JOIN LATERAL (SELECT saas.public_effective_product_projection(p_store_id,p.id,p_now) payload) visible
  WHERE p.store_id=p_store_id AND p.status='active'
  AND char_length(p.slug) BETWEEN 3 AND 100 AND p.slug~'^[a-z0-9]+(-[a-z0-9]+)*$'
  AND visible.payload IS NOT NULL
  ORDER BY p.slug;
 ELSIF p_kind='content' THEN
  RETURN QUERY WITH winners AS (
   SELECT DISTINCT ON (r.record_kind,coalesce(r.config->>'locale',p_default_locale),r.config->>'slug')
    r.record_kind kind,coalesce(r.config->>'locale',p_default_locale) locale,r.config->>'slug' slug,r.updated_at,r.id
   FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind IN('page','blog_post')
   AND r.status='active' AND r.config->>'published'='true' AND r.config?'slug'
   AND char_length(r.config->>'slug') BETWEEN 1 AND 100
   AND r.config->>'slug'~'^[a-z0-9]+(-[a-z0-9]+)*$'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_enabled_locales) enabled WHERE enabled.value=coalesce(r.config->>'locale',p_default_locale))
   ORDER BY r.record_kind,coalesce(r.config->>'locale',p_default_locale),r.config->>'slug',r.updated_at DESC,r.id DESC
  ) SELECT (CASE WHEN w.kind='page' THEN '/pages/' ELSE '/blog/' END)||w.slug||
   (CASE WHEN w.locale=p_default_locale THEN '' ELSE '?lang='||w.locale END),w.updated_at,p_frequency FROM winners w
   ORDER BY w.kind,w.locale,w.slug;
 END IF;
END $f$;

CREATE FUNCTION saas.public_content_sitemap_index(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;language jsonb;settings jsonb;products_count bigint;content_count bigint;shards bigint;items jsonb;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now);IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 language:=saas.public_content_locale_config(selected_store);settings:=saas.public_content_sitemap_config(selected_store);
 IF saas.public_content_index_allowed(selected_store,p_hostname,p_now) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'found',jsonb_build_object('items','[]'::jsonb);RETURN;END IF;
 SELECT count(*) INTO products_count FROM saas.public_content_sitemap_rows(selected_store,'products',p_now,language->>'defaultLocale',language->'enabledLocales',(SELECT s.locale FROM saas.stores s WHERE s.id=selected_store),settings->>'changeFrequency');
 SELECT count(*) INTO content_count FROM saas.public_content_sitemap_rows(selected_store,'content',p_now,language->>'defaultLocale',language->'enabledLocales',(SELECT s.locale FROM saas.stores s WHERE s.id=selected_store),settings->>'changeFrequency');
 IF settings->>'includeProducts'<>'true' THEN products_count:=0;END IF;
 IF settings->>'includeContent'<>'true' THEN content_count:=0;END IF;
 shards:=ceil(products_count/1000.0)+ceil(content_count/1000.0);
 IF shards>10000 THEN RAISE EXCEPTION 'PUBLIC_CONTENT_SITEMAP_TOO_LARGE';END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'page',page) ORDER BY kind,page),'[]'::jsonb) INTO items FROM (
  SELECT 'products'::text kind,generate_series(0,ceil(products_count/1000.0)::integer-1) page
  UNION ALL SELECT 'content'::text,generate_series(0,ceil(content_count/1000.0)::integer-1)
 ) shards;
 RETURN QUERY SELECT 'found',jsonb_build_object('items',items);
END $f$;

CREATE FUNCTION saas.public_content_sitemap_page(p_hostname text,p_now timestamptz,p_kind text,p_page integer)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;language jsonb;settings jsonb;row_count bigint;items jsonb;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true OR p_kind NOT IN('products','content') OR p_page IS NULL OR p_page NOT BETWEEN 0 AND 9999 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now);IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 language:=saas.public_content_locale_config(selected_store);settings:=saas.public_content_sitemap_config(selected_store);
 IF saas.public_content_index_allowed(selected_store,p_hostname,p_now) IS DISTINCT FROM true OR
 (p_kind='products' AND settings->>'includeProducts'<>'true') OR (p_kind='content' AND settings->>'includeContent'<>'true')
 THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT count(*) INTO row_count FROM saas.public_content_sitemap_rows(selected_store,p_kind,p_now,language->>'defaultLocale',language->'enabledLocales',(SELECT s.locale FROM saas.stores s WHERE s.id=selected_store),settings->>'changeFrequency');
 IF p_page::bigint*1000>=row_count THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('path',row.path,'updatedAt',saas.merchant_admin_timestamp(row.updated_at),'changeFrequency',row.change_frequency) ORDER BY row.path),'[]'::jsonb) INTO items
 FROM (SELECT * FROM saas.public_content_sitemap_rows(selected_store,p_kind,p_now,language->>'defaultLocale',language->'enabledLocales',(SELECT s.locale FROM saas.stores s WHERE s.id=selected_store),settings->>'changeFrequency') ORDER BY path OFFSET p_page*1000 LIMIT 1000) row;
 RETURN QUERY SELECT 'found',jsonb_build_object('items',items);
END $f$;

REVOKE ALL ON FUNCTION saas.public_content_locale_config(uuid),saas.public_content_sitemap_config(uuid),saas.public_content_index_allowed(uuid,text,timestamptz),saas.public_content_projection(uuid,uuid,text,boolean),saas.public_content_get_v2(text,timestamptz,text,text,text),saas.public_content_sitemap_rows(uuid,text,timestamptz,text,jsonb,text,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.public_content_locale_get(text,timestamptz),saas.public_content_page_get_v2(text,timestamptz,text,text),saas.public_blog_get(text,timestamptz,text,text),saas.public_blog_list(text,timestamptz,text,integer,jsonb),saas.public_content_sitemap_index(text,timestamptz),saas.public_content_sitemap_page(text,timestamptz,text,integer) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_content_locale_get(text,timestamptz),saas.public_content_page_get_v2(text,timestamptz,text,text),saas.public_blog_get(text,timestamptz,text,text),saas.public_blog_list(text,timestamptz,text,integer,jsonb),saas.public_content_sitemap_index(text,timestamptz),saas.public_content_sitemap_page(text,timestamptz,text,integer) TO celebix_saas_host_resolver;
COMMIT;
