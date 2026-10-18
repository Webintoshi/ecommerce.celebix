-- Native254 email builder. No table, row, role, queue or sealed-payload rewrites.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $pre$ BEGIN
 IF encode(sha256(convert_to(pg_get_functiondef('saas.native_marketing_branding(uuid,timestamptz)'::regprocedure),'UTF8')),'hex')<>'686c8b97440f8272daa8e0336571bf8f9cc2a5ac2bea026c51b98c73735c6803' THEN RAISE EXCEPTION 'NATIVE254_REQUIRES253';END IF;
END $pre$;
CREATE FUNCTION saas.native_marketing_builder_text_valid(p jsonb,p_max integer,p_visible boolean) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_typeof(p)='string' AND length(p#>>'{}')+length(regexp_replace(p#>>'{}',U&'[\0001-\FFFF]','','g'))<=p_max AND (NOT p_visible OR length(btrim(p#>>'{}',E' \t\r\n'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'))>0) AND (p#>>'{}')!~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]',false)
$f$;
CREATE FUNCTION saas.native_marketing_builder_path_valid(p jsonb,p_empty boolean) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(jsonb_typeof(p)='string' AND length(p#>>'{}')<=500 AND ((p_empty AND p#>>'{}'='') OR (p#>>'{}')~'^/($|[^/])') AND (p#>>'{}')!~'[[:space:][:cntrl:]\\]' AND (p#>>'{}')!~*'%(2f|5c|0[ad])',false)
$f$;
CREATE FUNCTION saas.native_marketing_builder_json_bytes(p jsonb) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE n integer;BEGIN
 IF jsonb_typeof(p)='object' THEN SELECT 2+coalesce(sum(octet_length(to_jsonb(k)::text)+1+saas.native_marketing_builder_json_bytes(v)),0)+greatest(count(*)-1,0) INTO n FROM jsonb_each(p) e(k,v);
 ELSIF jsonb_typeof(p)='array' THEN SELECT 2+coalesce(sum(saas.native_marketing_builder_json_bytes(v)),0)+greatest(count(*)-1,0) INTO n FROM jsonb_array_elements(p) e(v);
 ELSE n:=octet_length(p::text);END IF;RETURN n;
END $f$;
CREATE FUNCTION saas.native_marketing_builder_block_valid(p jsonb) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE keys text[];k text;n integer;BEGIN
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR jsonb_typeof(p->'id') IS DISTINCT FROM 'string' OR (p->>'id')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN false;END IF;
 CASE p->>'type'
 WHEN 'heading' THEN keys:=ARRAY['id','type','text','align','color','size'];
 WHEN 'text' THEN keys:=ARRAY['id','type','text','align','color'];
 WHEN 'image' THEN keys:=ARRAY['id','type','assetId','alt','linkPath'];
 WHEN 'image_text' THEN keys:=ARRAY['id','type','assetId','alt','heading','text','buttonLabel','buttonPath','imagePosition'];
 WHEN 'products' THEN keys:=ARRAY['id','type','productIds','columns'];
 WHEN 'button' THEN keys:=ARRAY['id','type','label','path','color','align'];
 WHEN 'banner' THEN keys:=ARRAY['id','type','heading','text','backgroundColor','textColor'];
 WHEN 'divider' THEN keys:=ARRAY['id','type','color'];
 WHEN 'spacer' THEN keys:=ARRAY['id','type','height'];
 ELSE RETURN false;END CASE;
 IF NOT saas.campaign_starter_exact_keys(p,keys) THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['color','backgroundColor','textColor'] LOOP IF p?k AND (jsonb_typeof(p->k) IS DISTINCT FROM 'string' OR (p->>k)!~'^#[a-fA-F0-9]{6}$') THEN RETURN false;END IF;END LOOP;
 IF p?'align' AND (p->>'align' IS NULL OR p->>'align' NOT IN('left','center','right')) THEN RETURN false;END IF;
 IF p?'size' AND (p->>'size' IS NULL OR p->>'size' NOT IN('small','medium','large')) THEN RETURN false;END IF;
 IF p?'imagePosition' AND (p->>'imagePosition' IS NULL OR p->>'imagePosition' NOT IN('left','right')) THEN RETURN false;END IF;
 IF p?'assetId' AND (jsonb_typeof(p->'assetId') IS DISTINCT FROM 'string' OR (p->>'assetId')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') THEN RETURN false;END IF;
 FOREACH k IN ARRAY ARRAY['heading','text','label','buttonLabel','alt'] LOOP
 IF p?k THEN n:=CASE k WHEN 'heading' THEN 160 WHEN 'alt' THEN 200 WHEN 'label' THEN 80 WHEN 'buttonLabel' THEN 80 ELSE CASE p->>'type' WHEN 'heading' THEN 160 WHEN 'text' THEN 4000 ELSE 2000 END END;
 IF NOT saas.native_marketing_builder_text_valid(p->k,n,k<>'alt') THEN RETURN false;END IF;END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['linkPath','path','buttonPath'] LOOP IF p?k AND NOT saas.native_marketing_builder_path_valid(p->k,k='linkPath') THEN RETURN false;END IF;END LOOP;
 IF p->>'type'='products' THEN
 IF jsonb_typeof(p->'columns') IS DISTINCT FROM 'number' OR p->>'columns' NOT IN('1','2') OR jsonb_typeof(p->'productIds') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF jsonb_array_length(p->'productIds') NOT BETWEEN 1 AND 8 OR EXISTS(SELECT 1 FROM jsonb_array_elements(p->'productIds') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR (x#>>'{}')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$') OR (SELECT count(*)<>count(DISTINCT x) FROM jsonb_array_elements(p->'productIds') x) THEN RETURN false;END IF;END IF;
 IF p->>'type'='spacer' AND (jsonb_typeof(p->'height') IS DISTINCT FROM 'number' OR p->>'height' NOT IN('8','16','24','32')) THEN RETURN false;END IF;
 RETURN true;
END $f$;
CREATE FUNCTION saas.native_marketing_builder_product_ids(p jsonb) RETURNS uuid[] LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(array_agg(id::uuid ORDER BY first_block,first_item),'{}'::uuid[]) FROM(
 SELECT DISTINCT ON(id) id,bn first_block,pn first_item FROM jsonb_array_elements(p->'blocks') WITH ORDINALITY b(block,bn)
 CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN block->>'type'='products' THEN block->'productIds' ELSE '[]'::jsonb END) WITH ORDINALITY i(id,pn) ORDER BY id,bn,pn) ids
$f$;
CREATE FUNCTION saas.native_marketing_builder_block_images(p_store uuid,p jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE refs uuid[];images jsonb;BEGIN
 SELECT coalesce(array_agg(asset::uuid ORDER BY first_block),'{}'::uuid[]) INTO refs FROM(SELECT DISTINCT ON(block->>'assetId') block->>'assetId' asset,bn first_block FROM jsonb_array_elements(p->'blocks') WITH ORDINALITY b(block,bn) WHERE block->>'type' IN('image','image_text') ORDER BY block->>'assetId',bn) ids;
 SELECT coalesce(jsonb_agg(jsonb_build_object('assetId',a.id,'url',a.public_url) ORDER BY ids.n),'[]'::jsonb) INTO images FROM unnest(refs) WITH ORDINALITY ids(id,n)
 JOIN saas.storefront_assets a ON a.store_id=p_store AND a.id=ids.id AND a.status='active' AND a.asset_kind='hero'
 WHERE a.media_type IN('image/jpeg','image/png','image/webp') AND a.object_key='stores/'||p_store::text||'/storefront/hero/'||a.id::text||CASE a.media_type WHEN 'image/jpeg' THEN '.jpg' WHEN 'image/png' THEN '.png' WHEN 'image/webp' THEN '.webp' END
 AND a.public_url~'^https://(media[.]celebix[.]site|media[.]saas-staging[.]celebix[.]site)/' AND a.public_url!~'[?#[:space:][:cntrl:]\\]' AND right(a.public_url,length(a.object_key)+1)='/'||a.object_key;
 IF jsonb_array_length(images)<>cardinality(refs) THEN RETURN NULL;END IF;RETURN images;
END $f$;
REVOKE ALL ON FUNCTION saas.native_marketing_builder_text_valid(jsonb,integer,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.native_marketing_builder_path_valid(jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.native_marketing_builder_json_bytes(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.native_marketing_builder_block_valid(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.native_marketing_builder_product_ids(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.native_marketing_builder_block_images(uuid,jsonb) FROM PUBLIC;
DO $patch$
DECLARE before pg_proc%ROWTYPE;after pg_proc%ROWTYPE;definition text;needle text;replacement text;target text;expected text;
BEGIN
 target:='saas.native_marketing_content_valid(jsonb)';expected:='3a34cff17bfe96be09492695190e788a80e762d6eadce5942d1a05ba67762029';
 SELECT * INTO STRICT before FROM pg_proc WHERE oid=target::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(before.oid),'UTF8')),'hex')<>expected OR before.proowner<>'celebix_saas_owner'::regrole OR before.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_SOURCE_DRIFT %',target;END IF;
 definition:=pg_get_functiondef(before.oid);
 needle:=$old_0$ SELECT coalesce(jsonb_typeof(p)='object' AND saas.campaign_starter_exact_keys(p,ARRAY['subject','heading','body','buttonLabel','buttonPath'])
 AND jsonb_typeof(p->'subject')='string' AND length(p->>'subject') BETWEEN 1 AND 200 AND p->>'subject'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'heading')='string' AND length(p->>'heading') BETWEEN 1 AND 160 AND p->>'heading'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'body')='string' AND length(p->>'body') BETWEEN 1 AND 4000 AND p->>'body'!~'[\x00-\x09\x0b-\x1f\x7f]'
 AND jsonb_typeof(p->'buttonLabel')='string' AND length(p->>'buttonLabel') BETWEEN 1 AND 80 AND p->>'buttonLabel'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'buttonPath')='string' AND length(p->>'buttonPath') BETWEEN 1 AND 500 AND p->>'buttonPath'~'^/($|[^/])' AND p->>'buttonPath'!~'[[:space:][:cntrl:]\\]',false)
$old_0$;replacement:=$new_0$ SELECT CASE WHEN p?'schemaVersion' THEN
 coalesce(saas.campaign_starter_exact_keys(p,ARRAY['subject','heading','body','buttonLabel','buttonPath','schemaVersion','blocks']) AND p->'schemaVersion'='2'::jsonb
 AND jsonb_typeof(p->'subject')='string' AND length(p->>'subject')+length(regexp_replace(p->>'subject',U&'[\0001-\FFFF]','','g')) BETWEEN 1 AND 200 AND (p->>'subject')!~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' AND jsonb_typeof(p->'heading')='string' AND length(p->>'heading')+length(regexp_replace(p->>'heading',U&'[\0001-\FFFF]','','g')) BETWEEN 1 AND 160 AND (p->>'heading')!~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' AND jsonb_typeof(p->'body')='string' AND length(p->>'body')+length(regexp_replace(p->>'body',U&'[\0001-\FFFF]','','g')) BETWEEN 1 AND 4000 AND (p->>'body')!~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' AND jsonb_typeof(p->'buttonLabel')='string' AND length(p->>'buttonLabel')+length(regexp_replace(p->>'buttonLabel',U&'[\0001-\FFFF]','','g')) BETWEEN 1 AND 80 AND (p->>'buttonLabel')!~'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]' AND (p->>'subject')!~'[\r\n]' AND jsonb_typeof(p->'buttonPath')='string' AND length(p->>'buttonPath') BETWEEN 1 AND 500 AND (p->>'buttonPath')~'^/($|[^/])' AND (p->>'buttonPath')!~'[[:space:][:cntrl:]\\]'
 AND CASE WHEN jsonb_typeof(p->'blocks')='array' THEN jsonb_array_length(p->'blocks') BETWEEN 1 AND 20 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'blocks') b WHERE NOT saas.native_marketing_builder_block_valid(b)) AND (SELECT count(*)=count(DISTINCT b->>'id') FROM jsonb_array_elements(p->'blocks') b) AND CASE WHEN NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p->'blocks') b WHERE NOT saas.native_marketing_builder_block_valid(b)) THEN cardinality(saas.native_marketing_builder_product_ids(p))<=8 ELSE false END ELSE false END
 AND saas.native_marketing_builder_json_bytes(p)<=12288,false)
 ELSE coalesce(jsonb_typeof(p)='object' AND saas.campaign_starter_exact_keys(p,ARRAY['subject','heading','body','buttonLabel','buttonPath'])
 AND jsonb_typeof(p->'subject')='string' AND length(p->>'subject') BETWEEN 1 AND 200 AND p->>'subject'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'heading')='string' AND length(p->>'heading') BETWEEN 1 AND 160 AND p->>'heading'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'body')='string' AND length(p->>'body') BETWEEN 1 AND 4000 AND p->>'body'!~'[\x00-\x09\x0b-\x1f\x7f]'
 AND jsonb_typeof(p->'buttonLabel')='string' AND length(p->>'buttonLabel') BETWEEN 1 AND 80 AND p->>'buttonLabel'!~'[[:cntrl:]]'
 AND jsonb_typeof(p->'buttonPath')='string' AND length(p->>'buttonPath') BETWEEN 1 AND 500 AND p->>'buttonPath'~'^/($|[^/])' AND p->>'buttonPath'!~'[[:space:][:cntrl:]\\]',false) END
$new_0$;
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'NATIVE254_PATCH_COUNT %',target;END IF;definition:=replace(definition,needle,replacement);
 EXECUTE definition;
 SELECT * INTO STRICT after FROM pg_proc WHERE oid=before.oid;
 IF(to_jsonb(before)-'prosrc') IS DISTINCT FROM(to_jsonb(after)-'prosrc') THEN RAISE EXCEPTION 'NATIVE254_FUNCTION_AUTHORITY_CHANGED %',target;END IF;
 target:='saas.native_marketing_projection(jsonb,jsonb,jsonb,text,text,boolean,boolean)';expected:='b93a26e3160355b495ad5cfffed8e01a8cd4387ee4fabaf7e12def637fb4e21f';
 SELECT * INTO STRICT before FROM pg_proc WHERE oid=target::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(before.oid),'UTF8')),'hex')<>expected OR before.proowner<>'celebix_saas_owner'::regrole OR before.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_SOURCE_DRIFT %',target;END IF;
 definition:=pg_get_functiondef(before.oid);
 needle:=$old_0$'recoveryNeeded',p_cart,'isTest',p_test))$old_0$;replacement:=$new_0$'recoveryNeeded',p_cart,'isTest',p_test)||CASE WHEN p_template->>'schemaVersion'='2' THEN jsonb_build_object('blockImages',p_brand->'blockImages') ELSE '{}'::jsonb END)$new_0$;
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'NATIVE254_PATCH_COUNT %',target;END IF;definition:=replace(definition,needle,replacement);
 EXECUTE definition;
 SELECT * INTO STRICT after FROM pg_proc WHERE oid=before.oid;
 IF(to_jsonb(before)-'prosrc') IS DISTINCT FROM(to_jsonb(after)-'prosrc') THEN RAISE EXCEPTION 'NATIVE254_FUNCTION_AUTHORITY_CHANGED %',target;END IF;
 target:='saas.native_marketing_command(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,jsonb)';expected:='f253ed6d55ae125fc79170a161e75e3774b8cfe205b275d2e0be603a220e39a4';
 SELECT * INTO STRICT before FROM pg_proc WHERE oid=target::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(before.oid),'UTF8')),'hex')<>expected OR before.proowner<>'celebix_saas_owner'::regrole OR before.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_SOURCE_DRIFT %',target;END IF;
 definition:=pg_get_functiondef(before.oid);
 needle:=$old_0$ SELECT version INTO old_version FROM saas.native_marketing_templates$old_0$;replacement:=$new_0$ IF tmpl->>'schemaVersion'='2' THEN
 IF tmpl->>'id'='cart' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 ids:=saas.native_marketing_builder_product_ids(tmpl);IF jsonb_array_length(saas.native_marketing_product_items(p_store,ids,p_now))<>cardinality(ids) THEN RETURN QUERY SELECT 'product_unavailable',NULL::jsonb;RETURN;END IF;
 IF saas.native_marketing_builder_block_images(p_store,tmpl) IS NULL THEN RETURN QUERY SELECT 'image_unavailable',NULL::jsonb;RETURN;END IF;
 END IF;
 SELECT version INTO old_version FROM saas.native_marketing_templates$new_0$;
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'NATIVE254_PATCH_COUNT %',target;END IF;definition:=replace(definition,needle,replacement);
 needle:=$old_1$ items:=saas.native_marketing_product_items(p_store,ids,p_now);IF jsonb_array_length(items)<>cardinality(ids)$old_1$;replacement:=$new_1$ IF tmpl->>'schemaVersion'='2' THEN
 IF tmpl->>'id'='cart' OR ids IS DISTINCT FROM saas.native_marketing_builder_product_ids(tmpl) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 payload:=saas.native_marketing_builder_block_images(p_store,tmpl);IF payload IS NULL THEN RETURN QUERY SELECT 'image_unavailable',NULL::jsonb;RETURN;END IF;
 brand:=brand||jsonb_build_object('blockImages',payload);
 END IF;
 items:=saas.native_marketing_product_items(p_store,ids,p_now);IF jsonb_array_length(items)<>cardinality(ids)$new_1$;
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'NATIVE254_PATCH_COUNT %',target;END IF;definition:=replace(definition,needle,replacement);
 EXECUTE definition;
 SELECT * INTO STRICT after FROM pg_proc WHERE oid=before.oid;
 IF(to_jsonb(before)-'prosrc') IS DISTINCT FROM(to_jsonb(after)-'prosrc') THEN RAISE EXCEPTION 'NATIVE254_FUNCTION_AUTHORITY_CHANGED %',target;END IF;
 target:='saas.native_marketing_work_authorize(uuid,uuid,text,timestamp with time zone)';expected:='c68de1507e1190983665cd9a9909c9a42037d0677bc26030231f668981c2010c';
 SELECT * INTO STRICT before FROM pg_proc WHERE oid=target::regprocedure;
 IF encode(sha256(convert_to(pg_get_functiondef(before.oid),'UTF8')),'hex')<>expected OR before.proowner<>'celebix_saas_owner'::regrole OR before.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] THEN RAISE EXCEPTION 'NATIVE254_SOURCE_DRIFT %',target;END IF;
 definition:=pg_get_functiondef(before.oid);
 needle:=$old_0$ OR NOT saas.native_marketing_delivery_eligible(d.id,p_now) THEN$old_0$;replacement:=$new_0$ OR NOT saas.native_marketing_delivery_eligible(d.id,p_now) OR (d.projection->'template'->>'schemaVersion'='2' AND (d.projection->'template'->>'id'='cart' OR saas.native_marketing_builder_block_images(d.store_id,d.projection->'template') IS DISTINCT FROM d.projection->'blockImages')) THEN$new_0$;
 IF length(definition)-length(replace(definition,needle,''))<>length(needle) THEN RAISE EXCEPTION 'NATIVE254_PATCH_COUNT %',target;END IF;definition:=replace(definition,needle,replacement);
 EXECUTE definition;
 SELECT * INTO STRICT after FROM pg_proc WHERE oid=before.oid;
 IF(to_jsonb(before)-'prosrc') IS DISTINCT FROM(to_jsonb(after)-'prosrc') THEN RAISE EXCEPTION 'NATIVE254_FUNCTION_AUTHORITY_CHANGED %',target;END IF;
END $patch$;
COMMIT;
