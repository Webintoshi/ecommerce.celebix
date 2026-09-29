-- Typed long content. Existing generic projections remain inert compatibility echoes.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.merchant_admin_records IN SHARE ROW EXCLUSIVE MODE;
-- A populated down migration retains this complete feature-owned set for safe reapply.
DO $f$ DECLARE retained boolean:=to_regclass('saas.merchant_content_bodies') IS NOT NULL; BEGIN
 IF retained IS DISTINCT FROM (to_regclass('saas.merchant_content_versions') IS NOT NULL)
 OR retained IS DISTINCT FROM (to_regprocedure('saas.merchant_admin_save_before_content_bodies(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NOT NULL)
 OR retained IS DISTINCT FROM (to_regprocedure('saas.merchant_admin_archive_before_content_bodies(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)') IS NOT NULL)
 OR (NOT retained AND EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'merchant_content_%')) THEN
  RAISE EXCEPTION 'MERCHANT_CONTENT_MIGRATION_PRECONDITION_FAILED';
 END IF;
END $f$;
CREATE TABLE IF NOT EXISTS saas.merchant_content_bodies(
 store_id uuid NOT NULL,record_id uuid NOT NULL,version bigint NOT NULL CHECK(version>0),
 body text NOT NULL CHECK(octet_length(body)<=80000),body_format text NOT NULL CHECK(body_format IN('legacy','normalized_html')),
 origins jsonb NOT NULL CHECK(jsonb_typeof(origins)='object'),excerpt text,seo_title text,seo_description text,
 PRIMARY KEY(store_id,record_id),FOREIGN KEY(store_id,record_id) REFERENCES saas.merchant_admin_records(store_id,id) ON DELETE RESTRICT
);
CREATE TABLE IF NOT EXISTS saas.merchant_content_versions(
 store_id uuid NOT NULL,record_id uuid NOT NULL,version bigint NOT NULL CHECK(version>0),
 operation_id uuid NOT NULL,principal_id uuid NOT NULL,write_source text NOT NULL CHECK(write_source IN('typed','generic','archive')),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object' AND octet_length(snapshot::text)<=262144),
 PRIMARY KEY(store_id,record_id,version),UNIQUE(operation_id),
 FOREIGN KEY(store_id,record_id) REFERENCES saas.merchant_admin_records(store_id,id) ON DELETE RESTRICT
);
DO $f$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='saas.merchant_content_versions'::regclass AND tgname='merchant_content_versions_immutable') THEN
  CREATE TRIGGER merchant_content_versions_immutable BEFORE UPDATE OR DELETE ON saas.merchant_content_versions FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();
 END IF;
END $f$;
ALTER TABLE saas.merchant_content_bodies ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_content_bodies FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_content_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.merchant_content_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.merchant_content_bodies,saas.merchant_content_versions FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

CREATE OR REPLACE FUNCTION saas.merchant_content_text_valid(p_text text,p_max integer) RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT p_text IS NOT NULL AND octet_length(p_text)<=p_max AND p_text!~U&'[\0001-\0008\000B\000C\000E-\001F\007F-\009F]'
$f$;
-- Deliberately portable supported-link grammar, mirrored by both TypeScript validators.
CREATE OR REPLACE FUNCTION saas.merchant_content_href_valid(p_href text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE parts text[]; authority text[]; host text;
BEGIN
 IF p_href IS NULL OR p_href='' OR p_href~U&'[\0001-\0020\007F-\009F\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR position(chr(92) IN p_href)>0 THEN RETURN false;END IF;
 IF left(p_href,1)='/' THEN RETURN left(p_href,2)<>'//';END IF;
 IF left(p_href,1)='#' THEN RETURN length(p_href)>1;END IF;
 IF p_href~*'^mailto:[^@]+@[^@]+$' OR p_href~*'^tel:[+]?[0-9().-]+(;ext=[0-9]+)?$' THEN RETURN true;END IF;
 parts:=regexp_match(p_href,'^https?://([^/?#]+)([/?#].*)?$','i');IF parts IS NULL THEN RETURN false;END IF;
 authority:=regexp_match(parts[1],'^([^:]+)(:([0-9]{1,5}))?$');IF authority IS NULL THEN RETURN false;END IF;
 host:=authority[1];
 RETURN octet_length(host)<=253 AND host COLLATE "C"~'^(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)*[A-Za-z](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$' AND (authority[3] IS NULL OR authority[3]::integer<=65535);
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_content_html_valid(p_text text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE remaining text:=p_text; part text; matched text[]; tag text; attrs text; parent text; stack text[]:=ARRAY[]::text[]; href text; tags integer:=0;
BEGIN
 IF saas.merchant_content_text_valid(p_text,80000) IS DISTINCT FROM true THEN RETURN false; END IF;
 IF p_text='' THEN RETURN true; END IF;
 WHILE remaining<>'' LOOP
  matched:=regexp_match(remaining,'^(<[^>]*>|[^<]+)'); IF matched IS NULL THEN RETURN false; END IF;
  part:=matched[1];remaining:=substr(remaining,length(part)+1);parent:=stack[array_length(stack,1)];
  IF left(part,1)<>'<' THEN
   IF regexp_replace(part,'&(amp|lt|gt|quot|#39);','','g')~'[<>&"'']' OR (parent IN('ul','ol','table','thead','tbody','tr') AND part!~U&'^[\0009-\000D\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]*$') THEN RETURN false; END IF;
   CONTINUE;
  END IF;
  matched:=regexp_match(part,'^</([a-z0-9]+)>$');
  IF matched IS NOT NULL THEN IF parent IS DISTINCT FROM matched[1] THEN RETURN false; END IF;stack:=stack[1:array_length(stack,1)-1];CONTINUE;END IF;
  matched:=regexp_match(part,'^<([a-z0-9]+)([^>]*)>$');IF matched IS NULL THEN RETURN false;END IF;
  tag:=matched[1];attrs:=matched[2];
  IF tag NOT IN('p','br','strong','em','u','del','ul','ol','li','h2','h3','h4','blockquote','a','pre','code','hr','table','thead','tbody','tr','th','td') THEN RETURN false;END IF;
  IF tag IN('br','hr') THEN IF attrs<>' /' THEN RETURN false;END IF;
  ELSIF tag='a' AND attrs<>'' THEN
   matched:=regexp_match(attrs,'^ href="([^"]+)"( target="_blank" rel="noopener noreferrer nofollow")?$');IF matched IS NULL THEN RETURN false;END IF;
   href:=matched[1];IF regexp_replace(href,'&(amp|lt|gt|quot|#39);','','g')~'[<>&"'']' THEN RETURN false;END IF;
   href:=replace(replace(replace(replace(replace(href,'&quot;','"'),'&#39;',chr(39)),'&lt;','<'),'&gt;','>'),'&amp;','&');
   IF saas.merchant_content_href_valid(href) IS DISTINCT FROM true OR (href~*'^https?://') IS DISTINCT FROM (matched[2] IS NOT NULL) THEN RETURN false;END IF;
  ELSIF attrs<>'' THEN RETURN false;END IF;
  IF parent IN('p','h2','h3','h4','pre','strong','em','u','del','a','code') AND tag NOT IN('br','strong','em','u','del','a','code') THEN RETURN false;END IF;
  IF (parent IN('ul','ol') AND tag<>'li') OR (parent='table' AND tag NOT IN('thead','tbody','tr')) OR (parent IN('thead','tbody') AND tag<>'tr') OR (parent='tr' AND tag NOT IN('th','td')) THEN RETURN false;END IF;
  IF (tag='li' AND coalesce(parent,'') NOT IN('ul','ol')) OR (tag IN('thead','tbody') AND parent IS DISTINCT FROM 'table') OR (tag='tr' AND coalesce(parent,'') NOT IN('table','thead','tbody')) OR (tag IN('th','td') AND parent IS DISTINCT FROM 'tr') OR (tag='a' AND 'a'=ANY(stack)) THEN RETURN false;END IF;
  tags:=tags+1;IF tag NOT IN('br','hr') THEN stack:=array_append(stack,tag);IF cardinality(stack)>64 THEN RETURN false;END IF;END IF;
 END LOOP;
 RETURN cardinality(stack)=0 AND tags>0;
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_content_document(p_store_id uuid,p_record_id uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('id',r.id,'kind',r.record_kind,'name',r.name,'slug',coalesce(r.config->>'slug',r.id::text),'locale',coalesce(r.config->>'locale',s.locale),'body',coalesce(b.body,r.config->>'body',''),'excerpt',CASE WHEN b.record_id IS NULL THEN r.config->>'excerpt' ELSE b.excerpt END,'seoTitle',b.seo_title,'seoDescription',b.seo_description,'published',coalesce(r.config->>'published'='true',false) AND r.config?'slug','status',r.status,'version',r.version,'publishedAt',CASE WHEN r.status='active' AND r.config->>'published'='true' AND r.config?'slug' THEN saas.merchant_admin_timestamp(r.updated_at) ELSE NULL END,'createdAt',saas.merchant_admin_timestamp(r.created_at),'updatedAt',saas.merchant_admin_timestamp(r.updated_at),'bodyFormat',coalesce(b.body_format,'legacy'),'bodyDigest','sha256:'||encode(sha256(convert_to(coalesce(b.body,r.config->>'body',''),'UTF8')),'hex'),'origins',coalesce(b.origins,'{}'::jsonb))
 FROM saas.merchant_admin_records r JOIN saas.stores s ON s.id=r.store_id LEFT JOIN saas.merchant_content_bodies b ON b.store_id=r.store_id AND b.record_id=r.id
 WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind IN('page','blog_post') AND coalesce(r.config->>'locale',s.locale)~'^[a-z]{2,3}(-[A-Z]{2})?$'
$f$;
CREATE OR REPLACE FUNCTION saas.merchant_content_snapshot(p_store_id uuid,p_record_id uuid,p_operation_id uuid,p_principal_id uuid,p_source text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 INSERT INTO saas.merchant_content_versions(store_id,record_id,version,operation_id,principal_id,write_source,snapshot)
 SELECT p_store_id,p_record_id,r.version,p_operation_id,p_principal_id,p_source,saas.merchant_content_document(p_store_id,p_record_id) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_record_id
$f$;
-- All writers lock a record before taking the sorted old/new route locks. No peer-record locks.
CREATE OR REPLACE FUNCTION saas.merchant_content_route_available(p_store_id uuid,p_record_id uuid,p_kind text,p_config jsonb,p_status text,p_old_config jsonb,p_old_status text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE route text; store_locale text; new_locale text; old_locale text; BEGIN
 SELECT locale INTO store_locale FROM saas.stores WHERE id=p_store_id;new_locale:=coalesce(p_config->>'locale',store_locale);old_locale:=coalesce(p_old_config->>'locale',store_locale);
 FOR route IN SELECT DISTINCT key COLLATE "C" FROM unnest(ARRAY[p_kind||':'||new_locale||':'||coalesce(p_config->>'slug',''),p_kind||':'||old_locale||':'||coalesce(p_old_config->>'slug','')]) key ORDER BY key COLLATE "C" LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.merchant.content.route:'||p_store_id::text||':'||route,0));
 END LOOP;
 IF p_status<>'active' OR coalesce(p_config->>'published','false')<>'true' THEN RETURN true;END IF;
 IF p_old_status='active' AND p_old_config->>'published'='true' AND p_old_config->>'slug'=p_config->>'slug' AND old_locale IS NOT DISTINCT FROM new_locale THEN RETURN true;END IF;
 RETURN NOT EXISTS(SELECT 1 FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id<>p_record_id AND r.record_kind=p_kind AND r.status='active' AND r.config->>'published'='true' AND r.config->>'slug'=p_config->>'slug' AND coalesce(r.config->>'locale',store_locale) IS NOT DISTINCT FROM new_locale);
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_content_get(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_record_id uuid) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; d jsonb; BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('page','blog_post') OR p_record_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 d:=saas.merchant_content_document(p_store_id,p_record_id);
 IF d->>'kind' IS DISTINCT FROM p_kind THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;ELSE RETURN QUERY SELECT 'found',d;END IF;
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_content_recover_operation(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.merchant_admin_operations%ROWTYPE; v saas.merchant_content_versions%ROWTYPE; BEGIN
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'page',true);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO op FROM saas.merchant_admin_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;RETURN;END IF;
 SELECT * INTO v FROM saas.merchant_content_versions WHERE store_id=p_store_id AND operation_id=p_operation_id AND principal_id=p_principal_id AND write_source='typed';
 IF NOT FOUND OR op.payload_fingerprint<>p_fingerprint OR op.result_payload->>'contentDomain' IS DISTINCT FROM 'merchant_content' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'operation_replayed',v.snapshot;
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_content_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_request jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; r saas.merchant_admin_records%ROWTYPE; b saas.merchant_content_bodies%ROWTYPE; old_doc jsonb; v jsonb; origins jsonb; cfg jsonb; result jsonb; rid uuid; kind text; expected bigint; action text; body_format text; exists_record boolean; BEGIN
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'page',true);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>262144 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id) THEN RETURN QUERY SELECT * FROM saas.merchant_content_recover_operation(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint);RETURN;END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_request) k)<>ARRAY['bodyAction','draftId','expectedBodyDigest','expectedVersion','kind','origins','recordId','values'] THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 kind:=p_request->>'kind';action:=p_request->>'bodyAction';v:=p_request->'values';origins:=p_request->'origins';
 IF kind IS NULL OR kind NOT IN('page','blog_post') OR action IS NULL OR action NOT IN('replace','preserve') OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(origins) IS DISTINCT FROM 'object' OR jsonb_typeof(p_request->'draftId') IS DISTINCT FROM 'string' OR p_request->>'draftId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k)<>ARRAY['body','excerpt','locale','name','published','seoDescription','seoTitle','slug','status'] OR EXISTS(SELECT 1 FROM jsonb_each(origins) o WHERE o.key NOT IN('name','body','excerpt','seoTitle','seoDescription') OR (o.value='{"state":"manual"}'::jsonb OR (jsonb_typeof(o.value)='object' AND o.value-ARRAY['generationId','state']='{}'::jsonb AND o.value->>'state' IN('ai','edited_ai') AND jsonb_typeof(o.value->'generationId')='string' AND o.value->>'generationId'~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')) IS DISTINCT FROM true) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(v) x WHERE (x.key IN('body','locale','name','slug','status') AND jsonb_typeof(x.value)<>'string') OR (x.key IN('excerpt','seoTitle','seoDescription') AND jsonb_typeof(x.value) NOT IN('string','null'))) OR jsonb_typeof(v->'published')<>'boolean' OR v->>'status' NOT IN('draft','active') OR (v->>'published'='true' AND v->>'status'<>'active') OR v->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR octet_length(v->>'slug')>100 OR v->>'locale'!~'^[a-z]{2,3}(-[A-Z]{2})?$' OR v->>'name'<>btrim(v->>'name') OR octet_length(v->>'name') NOT BETWEEN 1 AND 160 OR v->>'name'~'[[:cntrl:]]' OR saas.merchant_content_text_valid(v->>'body',80000) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(v) x WHERE x.key IN('name','excerpt','seoTitle','seoDescription') AND x.value IS NOT NULL AND (saas.merchant_content_text_valid(x.value,CASE WHEN x.key IN('name','seoTitle') THEN 160 ELSE 4000 END) IS DISTINCT FROM true OR x.value~U&'[\0001-\001F\007F-\009F]' OR left(x.value,1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR right(x.value,1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR x.value~*'</?[a-z!].*>')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(origins) o WHERE o.value->>'state' IN('ai','edited_ai')) THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 IF action='replace' AND saas.merchant_content_html_valid(v->>'body') IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_request->'recordId'='null'::jsonb THEN
  IF p_request->'expectedVersion'<>'null'::jsonb OR p_request->'expectedBodyDigest'<>'null'::jsonb OR action<>'replace' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;rid:=gen_random_uuid();
 ELSE
  IF jsonb_typeof(p_request->'recordId')<>'string' OR p_request->>'recordId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(p_request->'expectedVersion')<>'number' OR p_request->>'expectedVersion'!~'^[1-9][0-9]{0,15}$' OR (p_request->>'expectedVersion')::numeric>9007199254740991 OR jsonb_typeof(p_request->'expectedBodyDigest') IS DISTINCT FROM 'string' OR p_request->>'expectedBodyDigest'!~'^sha256:[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  rid:=(p_request->>'recordId')::uuid;expected:=(p_request->>'expectedVersion')::bigint;
 END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=rid FOR UPDATE;exists_record:=FOUND;
 IF exists_record THEN
  IF r.record_kind<>kind THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
  IF r.status='archived' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  old_doc:=saas.merchant_content_document(p_store_id,rid);
  IF r.version IS DISTINCT FROM expected OR old_doc->>'bodyDigest' IS DISTINCT FROM p_request->>'expectedBodyDigest' THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  IF action='preserve' AND (v->>'body' IS DISTINCT FROM old_doc->>'body' OR (origins?'body' AND origins->'body' IS DISTINCT FROM old_doc->'origins'->'body')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  origins:=coalesce(old_doc->'origins','{}')||origins;
 ELSIF expected IS NOT NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 cfg:=jsonb_build_object('slug',v->'slug','locale',v->'locale','published',v->'published');IF kind='blog_post' AND v->'excerpt'<>'null'::jsonb THEN cfg:=cfg||jsonb_build_object('excerpt',v->'excerpt');END IF;
 IF exists_record AND r.config?'body' THEN cfg:=cfg||jsonb_build_object('body',r.config->'body');END IF;
 IF NOT saas.merchant_content_route_available(p_store_id,rid,kind,cfg,v->>'status',r.config,r.status) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF exists_record THEN UPDATE saas.merchant_admin_records SET name=v->>'name',config=cfg,status=v->>'status',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=rid;
 ELSE INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES(rid,p_store_id,kind,v->>'name',cfg,v->>'status',p_now,p_now);END IF;
 body_format:=CASE WHEN action='preserve' THEN old_doc->>'bodyFormat' ELSE 'normalized_html' END;
 INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins,excerpt,seo_title,seo_description)
 SELECT p_store_id,rid,version,v->>'body',body_format,origins,v->>'excerpt',v->>'seoTitle',v->>'seoDescription' FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=rid
 ON CONFLICT(store_id,record_id) DO UPDATE SET version=excluded.version,body=excluded.body,body_format=excluded.body_format,origins=excluded.origins,excerpt=excluded.excerpt,seo_title=excluded.seo_title,seo_description=excluded.seo_description;
 result:=saas.merchant_content_document(p_store_id,rid);
 PERFORM saas.merchant_content_snapshot(p_store_id,rid,p_operation_id,p_principal_id,'typed');
 cfg:=jsonb_build_object('id',rid,'kind',kind,'status',result->'status','version',result->'version','updatedAt',result->'updatedAt','bodyDigest',result->'bodyDigest','contentDomain','merchant_content');
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,rid,kind,'saved',cfg,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'save',p_fingerprint,cfg,p_now);
 RETURN QUERY SELECT 'saved',result;
END
$f$;

DO $f$ BEGIN
 IF to_regprocedure('saas.merchant_admin_save_before_content_bodies(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NULL THEN ALTER FUNCTION saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) RENAME TO merchant_admin_save_before_content_bodies;END IF;
 IF to_regprocedure('saas.merchant_admin_archive_before_content_bodies(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)') IS NULL THEN ALTER FUNCTION saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) RENAME TO merchant_admin_archive_before_content_bodies;END IF;
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text,p_name text,p_config jsonb,p_status text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; r saas.merchant_admin_records%ROWTYPE; b saas.merchant_content_bodies%ROWTYPE; cfg jsonb:=p_config; delegated record; BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('page','blog_post') THEN RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN
  IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations WHERE store_id=p_store_id AND operation_id=p_operation_id AND merchant_admin_operations.result_payload->>'contentDomain'='merchant_content') THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;
 END IF;
 IF saas.merchant_admin_config_valid(p_kind,p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE;
 SELECT * INTO b FROM saas.merchant_content_bodies WHERE store_id=p_store_id AND record_id=p_record_id FOR UPDATE;
 IF FOUND THEN
  IF r.record_kind<>p_kind THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
  IF r.version IS DISTINCT FROM p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  -- Preserve legacy literal metadata while requiring sidecar-backed route
  -- fields to remain readable. Refuse before the delegated generic mutation.
  IF (p_config?'slug' AND (jsonb_typeof(p_config->'slug')<>'string' OR p_config->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR octet_length(p_config->>'slug')>100))
    OR (p_config?'locale' AND (jsonb_typeof(p_config->'locale')<>'string' OR p_config->>'locale'!~'^[a-z]{2,3}(-[A-Z]{2})?$' OR octet_length(p_config->>'locale')>35))
    OR (p_config?'published' AND jsonb_typeof(p_config->'published')<>'boolean')
    OR (p_config->>'published'='true' AND (p_status IS DISTINCT FROM 'active' OR NOT (p_config?'slug'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF p_kind='blog_post' AND p_config?'excerpt' THEN
   IF jsonb_typeof(p_config->'excerpt') NOT IN('string','null') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
   IF jsonb_typeof(p_config->'excerpt')='string' AND (saas.merchant_content_text_valid(p_config->>'excerpt',4000) IS DISTINCT FROM true OR p_config->>'excerpt'~U&'[\0001-\001F\007F-\009F]' OR left(p_config->>'excerpt',1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR right(p_config->>'excerpt',1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  END IF;
  IF p_config?'body' AND (jsonb_typeof(p_config->'body')<>'string' OR (r.config?'body' AND p_config->'body' IS DISTINCT FROM r.config->'body') OR (NOT r.config?'body' AND p_config->>'body'<>'')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  cfg:=p_config-'body';IF r.config?'body' THEN cfg:=cfg||jsonb_build_object('body',r.config->'body');END IF;
 END IF;
 IF NOT saas.merchant_content_route_available(p_store_id,p_record_id,p_kind,cfg,p_status,r.config,r.status) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 SELECT * INTO delegated FROM saas.merchant_admin_save_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,cfg,p_status);
 IF delegated.outcome='saved' AND b.record_id IS NOT NULL THEN
  UPDATE saas.merchant_content_bodies SET version=(delegated.result_payload->>'version')::bigint,excerpt=CASE WHEN cfg?'excerpt' THEN cfg->>'excerpt' ELSE excerpt END WHERE store_id=p_store_id AND record_id=p_record_id;
  PERFORM saas.merchant_content_snapshot(p_store_id,p_record_id,p_operation_id,p_principal_id,'generic');
 END IF;
 RETURN QUERY SELECT delegated.outcome,delegated.result_payload;
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_archive(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.merchant_admin_records%ROWTYPE; b saas.merchant_content_bodies%ROWTYPE; e text; delegated record; BEGIN
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id;
 IF r.record_kind IS NULL OR r.record_kind NOT IN('page','blog_post') THEN RETURN QUERY SELECT * FROM saas.merchant_admin_archive_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version);RETURN;END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations WHERE store_id=p_store_id AND operation_id=p_operation_id AND merchant_admin_operations.result_payload->>'contentDomain'='merchant_content') THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE;
 PERFORM saas.merchant_content_route_available(p_store_id,p_record_id,r.record_kind,r.config,'archived',r.config,r.status);
 SELECT * INTO delegated FROM saas.merchant_admin_archive_before_content_bodies(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version);
 IF delegated.outcome='archived' AND EXISTS(SELECT 1 FROM saas.merchant_content_bodies WHERE store_id=p_store_id AND record_id=p_record_id) THEN
  UPDATE saas.merchant_content_bodies SET version=(delegated.result_payload->>'version')::bigint WHERE store_id=p_store_id AND record_id=p_record_id;
  PERFORM saas.merchant_content_snapshot(p_store_id,p_record_id,p_operation_id,p_principal_id,'archive');
 END IF;
 RETURN QUERY SELECT delegated.outcome,delegated.result_payload;
END
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_content_versions(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_record_id uuid,p_limit integer,p_before_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; r saas.merchant_admin_records%ROWTYPE; n bigint; first_version bigint; snapshot jsonb; event_row saas.merchant_admin_events%ROWTYPE; prior jsonb; item jsonb; result jsonb:='[]'; store_locale text;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('page','blog_post') OR p_record_id IS NULL OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 50 OR (p_before_version IS NOT NULL AND p_before_version<1) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id AND record_kind=p_kind;
 IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 SELECT locale INTO store_locale FROM saas.stores WHERE id=p_store_id;
 first_version:=least(r.version,coalesce(p_before_version-1,r.version));
 FOR n IN SELECT generate_series(first_version,greatest(1,first_version-p_limit+1),-1) LOOP
  SELECT v.snapshot INTO snapshot FROM saas.merchant_content_versions v WHERE v.store_id=p_store_id AND v.record_id=p_record_id AND v.version=n;
  IF snapshot IS NOT NULL THEN
   item:=jsonb_build_object('recordId',p_record_id,'kind',p_kind,'version',n,'values',snapshot-'id'-'kind'-'version'-'status'-'publishedAt'-'createdAt'-'updatedAt'-'bodyFormat'-'bodyDigest'-'origins','status',snapshot->'status','bodyFormat',snapshot->'bodyFormat','origins',snapshot->'origins','savedAt',snapshot->'updatedAt');
  ELSE
   SELECT * INTO event_row FROM saas.merchant_admin_events ev WHERE ev.store_id=p_store_id AND ev.record_id=p_record_id AND ev.summary->>'version'=n::text AND ev.event_kind IN('saved','archived') ORDER BY ev.id LIMIT 1;
   IF NOT FOUND THEN RETURN QUERY SELECT 'history_unavailable',NULL::jsonb;RETURN;END IF;
   prior:=event_row.summary;
   IF event_row.event_kind='archived' THEN
    SELECT ev.summary INTO prior FROM saas.merchant_admin_events ev WHERE ev.store_id=p_store_id AND ev.record_id=p_record_id AND ev.summary->>'version'=(n-1)::text AND ev.event_kind='saved' AND ev.summary?'config' ORDER BY ev.id LIMIT 1;
   END IF;
   IF prior IS NULL OR NOT prior?'config' THEN RETURN QUERY SELECT 'history_unavailable',NULL::jsonb;RETURN;END IF;
   item:=jsonb_build_object('recordId',p_record_id,'kind',p_kind,'version',n,'values',jsonb_build_object('name',prior->'name','slug',coalesce(prior->'config'->>'slug',p_record_id::text),'locale',coalesce(prior->'config'->>'locale',store_locale),'body',coalesce(prior->'config'->>'body',''),'excerpt',prior->'config'->>'excerpt','seoTitle',NULL,'seoDescription',NULL,'published',coalesce(prior->'config'->>'published'='true',false) AND prior->'config'?'slug'),'status',event_row.summary->'status','bodyFormat','legacy','origins','{}'::jsonb,'savedAt',saas.merchant_admin_timestamp(event_row.occurred_at));
  END IF;
  result:=result||jsonb_build_array(item);
 END LOOP;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',result);
END $f$;

CREATE OR REPLACE FUNCTION saas.public_content_page_get(p_hostname text,p_now timestamptz,p_slug text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid; projected jsonb;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true OR p_slug IS NULL OR char_length(p_slug) NOT BETWEEN 1 AND 100 OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now);IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT jsonb_build_object('id',page.id,'slug',page.config->>'slug','title',page.name,'body',coalesce(body.body,page.config->>'body',''),'updatedAt',saas.storefront_design_timestamp(page.updated_at)) INTO projected
 FROM saas.merchant_admin_records page LEFT JOIN saas.merchant_content_bodies body ON body.store_id=page.store_id AND body.record_id=page.id
 WHERE page.store_id=selected_store AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true' AND page.config->>'slug'=p_slug ORDER BY page.updated_at DESC,page.id DESC LIMIT 1;
 RETURN QUERY SELECT CASE WHEN projected IS NULL THEN 'not_found' ELSE 'found' END,projected;
END $f$;
REVOKE ALL ON FUNCTION saas.merchant_content_text_valid(text,integer) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_content_href_valid(text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_content_html_valid(text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_content_document(uuid,uuid) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_content_snapshot(uuid,uuid,uuid,uuid,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_content_route_available(uuid,uuid,text,jsonb,text,jsonb,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_content_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_content_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_content_versions(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid,integer,bigint) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_content_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_admin_save_before_content_bodies(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_admin_archive_before_content_bodies(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.merchant_content_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_content_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_content_versions(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid,integer,bigint) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_content_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_archive(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint) TO celebix_saas_app;
COMMIT;
