-- Required store pages are ordinary merchant content with owner-controlled identity.
-- Existing tenant content is adopted without changing a single record/body/history byte.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
LOCK TABLE saas.stores,saas.merchant_admin_records IN SHARE ROW EXCLUSIVE MODE;
DO $precondition$ BEGIN
 IF to_regclass('saas.store_required_pages') IS NOT NULL OR to_regclass('saas.required_pages_213_backup') IS NOT NULL THEN RAISE EXCEPTION 'REQUIRED_PAGES_213_ALREADY_PRESENT';END IF;
 IF to_regprocedure('saas.restock_alerts_config_valid(jsonb)') IS NULL OR to_regprocedure('saas.merchant_content_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,jsonb)') IS NULL THEN RAISE EXCEPTION 'REQUIRED_PAGES_213_PREDECESSOR_MISSING';END IF;
END $precondition$;
CREATE TABLE saas.store_required_pages(
 store_id uuid NOT NULL REFERENCES saas.stores(id),page_key text NOT NULL CHECK(page_key IN('about','contact','blog')),
 record_id uuid NOT NULL,slug text NOT NULL CHECK(char_length(slug) BETWEEN 1 AND 100 AND slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),
 locale text NOT NULL CHECK(locale~'^[a-z]{2,3}(-[A-Z]{2})?$'),generated boolean NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,page_key),UNIQUE(store_id,record_id),FOREIGN KEY(store_id,record_id) REFERENCES saas.merchant_admin_records(store_id,id) ON DELETE RESTRICT
);
CREATE TABLE saas.required_pages_213_backup(identity text PRIMARY KEY,definition text NOT NULL,migrated_definition text NOT NULL,function_attributes jsonb NOT NULL);
ALTER TABLE saas.store_required_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.store_required_pages FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.required_pages_213_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.required_pages_213_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.store_required_pages,saas.required_pages_213_backup FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
-- No invented principal or idempotency operation for the initial system-authored blank version.
ALTER TABLE saas.merchant_content_versions ALTER COLUMN operation_id DROP NOT NULL,ALTER COLUMN principal_id DROP NOT NULL;
ALTER TABLE saas.merchant_content_versions DROP CONSTRAINT merchant_content_versions_write_source_check;
ALTER TABLE saas.merchant_content_versions ADD CONSTRAINT merchant_content_versions_write_source_check CHECK(
 (write_source='seed' AND operation_id IS NULL AND principal_id IS NULL AND version=1)
 OR (write_source IN('typed','generic','archive') AND operation_id IS NOT NULL AND principal_id IS NOT NULL));

CREATE FUNCTION saas.required_page_content_locale(p_store_id uuid,p_record_id uuid,p_default_locale text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(r.config->>'locale',q.locale,p_default_locale) FROM saas.merchant_admin_records r LEFT JOIN saas.store_required_pages q ON q.store_id=r.store_id AND q.record_id=r.id WHERE r.store_id=p_store_id AND r.id=p_record_id
$f$;
CREATE FUNCTION saas.required_page_content_path(p_store_id uuid,p_record_id uuid,p_default_locale text) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT (CASE WHEN q.page_key='blog' THEN '/blog' ELSE (CASE WHEN r.record_kind='page' THEN '/pages/' ELSE '/blog/' END)||coalesce(r.config->>'slug',r.id::text) END)
 ||CASE WHEN coalesce(r.config->>'locale',q.locale,p_default_locale)=p_default_locale THEN '' ELSE '?lang='||coalesce(r.config->>'locale',q.locale,p_default_locale) END
 FROM saas.merchant_admin_records r LEFT JOIN saas.store_required_pages q ON q.store_id=r.store_id AND q.record_id=r.id WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind IN('page','blog_post')
$f$;
CREATE FUNCTION saas.required_page_public_locale_allowed(p_store_id uuid,p_record_id uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT NOT EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=p_store_id AND q.record_id=p_record_id)
 OR EXISTS(SELECT 1 FROM saas.store_required_pages q CROSS JOIN LATERAL jsonb_array_elements_text(saas.public_content_locale_config(p_store_id)->'enabledLocales') enabled WHERE q.store_id=p_store_id AND q.record_id=p_record_id AND enabled.value=q.locale)
$f$;
CREATE FUNCTION saas.required_page_transition_valid(p_store_id uuid,p_record_id uuid,p_kind text,p_config jsonb,p_status text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT NOT EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=p_store_id AND q.record_id=p_record_id
 AND (p_kind IS DISTINCT FROM 'page' OR p_status IS NULL OR p_status NOT IN('draft','active') OR p_config->>'slug' IS DISTINCT FROM q.slug OR coalesce(p_config->>'locale',q.locale) IS DISTINCT FROM q.locale))
$f$;
CREATE FUNCTION saas.guard_required_page_record() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=OLD.store_id AND q.record_id=OLD.id) THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'REQUIRED_PAGE_IDENTITY_PROTECTED' USING ERRCODE='23514';END IF;
  IF NEW.store_id IS DISTINCT FROM OLD.store_id OR NEW.id IS DISTINCT FROM OLD.id OR NOT saas.required_page_transition_valid(OLD.store_id,OLD.id,NEW.record_kind,NEW.config,NEW.status) THEN RAISE EXCEPTION 'REQUIRED_PAGE_IDENTITY_PROTECTED' USING ERRCODE='23514';END IF;
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $f$;
CREATE FUNCTION saas.guard_required_page_mapping() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r saas.merchant_admin_records%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'REQUIRED_PAGE_MAPPING_IMMUTABLE' USING ERRCODE='23514';END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=NEW.store_id AND id=NEW.record_id FOR UPDATE;
 IF NOT FOUND OR r.record_kind<>'page' OR r.status='archived' OR r.config->>'slug' IS DISTINCT FROM NEW.slug OR coalesce(r.config->>'locale',NEW.locale) IS DISTINCT FROM NEW.locale THEN RAISE EXCEPTION 'REQUIRED_PAGE_MAPPING_INVALID' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER merchant_admin_required_pages_guard BEFORE UPDATE OR DELETE ON saas.merchant_admin_records FOR EACH ROW EXECUTE FUNCTION saas.guard_required_page_record();
CREATE TRIGGER store_required_pages_identity_guard BEFORE INSERT OR UPDATE OR DELETE ON saas.store_required_pages FOR EACH ROW EXECUTE FUNCTION saas.guard_required_page_mapping();

-- Read-only preflight: ambiguous candidates are reported, never guessed or rewritten.
CREATE FUNCTION saas.required_page_seed_plan(p_store_id uuid)
RETURNS TABLE(page_key text,action text,reason text,candidate_id uuid,candidate_count integer,slug text,locale text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE target record; existing saas.store_required_pages%ROWTYPE; ids uuid[]; base text; next_slug text; suffix integer; selected_locale text;cross_key boolean;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id) THEN RETURN;END IF;
 selected_locale:=saas.merchant_content_locale_config(p_store_id)->>'defaultLocale';
 FOR target IN SELECT * FROM (VALUES('about','hakkimizda',ARRAY['hakkımızda','hakkimizda','about','about us'],ARRAY['hakkimizda','about','about-us'],0),('contact','iletisim',ARRAY['iletişim','iletisim','contact','contact us'],ARRAY['iletisim','contact','contact-us'],1),('blog','blog',ARRAY['blog'],ARRAY['blog'],2)) keys(key,canonical,names,slugs,position) ORDER BY position LOOP
  SELECT * INTO existing FROM saas.store_required_pages q WHERE q.store_id=p_store_id AND q.page_key=target.key;
  page_key:=target.key;locale:=selected_locale;
  IF FOUND THEN action:='present';reason:='mapped';candidate_id:=existing.record_id;candidate_count:=1;slug:=existing.slug;locale:=existing.locale;RETURN NEXT;CONTINUE;END IF;
  SELECT array_agg(r.id ORDER BY r.id) INTO ids FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='page' AND r.status IN('draft','active')
   AND coalesce(r.config->>'locale',selected_locale)=selected_locale AND char_length(r.config->>'slug') BETWEEN 1 AND 100 AND r.config->>'slug'~'^[a-z0-9]+(-[a-z0-9]+)*$' AND r.config->>'slug'<>r.id::text
   AND (lower(btrim(r.name))=ANY(target.names) OR r.config->>'slug'=ANY(target.slugs)) AND NOT EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=r.store_id AND q.record_id=r.id);
  candidate_count:=coalesce(cardinality(ids),0);
  cross_key:=false;
  IF candidate_count=1 THEN SELECT EXISTS(SELECT 1 FROM saas.merchant_admin_records r CROSS JOIN (VALUES('about',ARRAY['hakkımızda','hakkimizda','about','about us'],ARRAY['hakkimizda','about','about-us']),('contact',ARRAY['iletişim','iletisim','contact','contact us'],ARRAY['iletisim','contact','contact-us']),('blog',ARRAY['blog'],ARRAY['blog'])) other(key,names,slugs)
   WHERE r.store_id=p_store_id AND r.id=ids[1] AND other.key<>target.key AND (lower(btrim(r.name))=ANY(other.names) OR r.config->>'slug'=ANY(other.slugs))) INTO cross_key;END IF;
  IF candidate_count=1 AND NOT cross_key THEN SELECT EXISTS(SELECT 1 FROM saas.merchant_admin_records selected JOIN saas.merchant_admin_records duplicate ON duplicate.store_id=selected.store_id AND duplicate.id<>selected.id AND duplicate.record_kind='page' AND duplicate.config->>'slug'=selected.config->>'slug' AND coalesce(duplicate.config->>'locale',selected_locale)=selected_locale WHERE selected.store_id=p_store_id AND selected.id=ids[1]) INTO cross_key;END IF;
  IF candidate_count=1 AND NOT cross_key THEN action:='adopt';reason:='unambiguous';candidate_id:=ids[1];SELECT r.config->>'slug' INTO slug FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=candidate_id;RETURN NEXT;CONTINUE;END IF;
  action:='create';reason:=CASE WHEN candidate_count=0 THEN 'missing' ELSE 'ambiguous' END;candidate_id:=NULL;base:=target.canonical;next_slug:=base;suffix:=1;
  WHILE EXISTS(SELECT 1 FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='page' AND r.config->>'slug'=next_slug AND coalesce(r.config->>'locale',selected_locale)=selected_locale) LOOP
   suffix:=suffix+1;IF suffix>10000 THEN RAISE EXCEPTION 'REQUIRED_PAGE_SLUG_CAPACITY';END IF;next_slug:=base||'-'||suffix;
  END LOOP;
  slug:=next_slug;RETURN NEXT;
 END LOOP;
END $f$;
CREATE FUNCTION saas.seed_store_required_pages(p_store_id uuid,p_now timestamptz) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE item record;rid uuid;label text;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR NOT EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id) THEN RAISE EXCEPTION 'REQUIRED_PAGE_SEED_INPUT_INVALID';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 FOR item IN SELECT * FROM saas.required_page_seed_plan(p_store_id) LOOP
  IF item.action='present' THEN CONTINUE;END IF;
  rid:=item.candidate_id;
  IF item.action='create' THEN
   rid:=gen_random_uuid();label:=CASE item.page_key WHEN 'about' THEN 'Hakkımızda' WHEN 'contact' THEN 'İletişim' ELSE 'Blog' END;
   INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at) VALUES(rid,p_store_id,'page',label,jsonb_build_object('slug',item.slug,'locale',item.locale,'published',false),'draft',1,p_now,p_now);
  END IF;
  INSERT INTO saas.store_required_pages(store_id,page_key,record_id,slug,locale,generated,created_at) VALUES(p_store_id,item.page_key,rid,item.slug,item.locale,item.action='create',p_now);
  IF item.action='create' THEN
   INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins) VALUES(p_store_id,rid,1,'','normalized_html','{}');
   -- Snapshot shape stays legacy-compatible independently of session negotiation.
   INSERT INTO saas.merchant_content_versions(store_id,record_id,version,operation_id,principal_id,write_source,snapshot) VALUES(p_store_id,rid,1,NULL,NULL,'seed',saas.merchant_content_document(p_store_id,rid)-'requiredPageKey');
  END IF;
 END LOOP;
END $f$;
CREATE FUNCTION saas.create_store_required_pages() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN PERFORM saas.seed_store_required_pages(NEW.id,NEW.created_at);RETURN NEW;END $f$;
CREATE TRIGGER stores_required_pages AFTER INSERT ON saas.stores FOR EACH ROW EXECUTE FUNCTION saas.create_store_required_pages();

CREATE FUNCTION saas.public_required_page_get(p_hostname text,p_now timestamptz,p_key text,p_locale text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE sid uuid;language jsonb;rid uuid;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true OR p_key IS NULL OR p_key NOT IN('about','contact','blog') OR p_locale IS NULL OR p_locale!~'^[a-z]{2,3}(-[A-Z]{2})?$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 sid:=saas.store_policy_public_store(p_hostname,p_now);IF sid IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 language:=saas.public_content_locale_config(sid);IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(language->'enabledLocales') l WHERE l.value=p_locale) THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT r.id INTO rid FROM saas.store_required_pages q JOIN saas.merchant_admin_records r ON r.store_id=q.store_id AND r.id=q.record_id WHERE q.store_id=sid AND q.page_key=p_key AND q.locale=p_locale AND r.record_kind='page' AND r.status='active' AND r.config->>'published'='true';
 RETURN QUERY SELECT CASE WHEN rid IS NULL THEN 'not_found' ELSE 'found' END,CASE WHEN rid IS NULL THEN NULL::jsonb ELSE saas.public_content_projection(sid,rid,language->>'defaultLocale',true) END;
END $f$;

-- Source-exact edits keep every current wrapper, owner, ACL and argument intact.
DO $patch$ DECLARE target record;before pg_proc%ROWTYPE;after pg_proc%ROWTYPE;definition text; BEGIN
 FOR target IN SELECT * FROM (VALUES
('saas.merchant_admin_projection(uuid,uuid)','05e344b38ce12e5e447b08b23a11ff58feffe332f62a5037d44336e181fdbd53',$next_0$
 SELECT pg_catalog.jsonb_build_object('id',r.id,'kind',r.record_kind,'name',r.name,'config',r.config,'status',r.status,'version',r.version,'createdAt',saas.merchant_admin_timestamp(r.created_at),'updatedAt',saas.merchant_admin_timestamp(r.updated_at)) || CASE WHEN current_setting('saas.required_pages_projection_version',true)='1' AND EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=r.store_id AND q.record_id=r.id) THEN jsonb_build_object('requiredPageKey',(SELECT q.page_key FROM saas.store_required_pages q WHERE q.store_id=r.store_id AND q.record_id=r.id)) ELSE '{}'::jsonb END FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_id $next_0$),
('saas.merchant_content_document(uuid,uuid)','2c73397a0fd4e2e09f31dbda7539a4241cfae4c1158930fd0f70c3356bf5a15f',$next_1$
 SELECT jsonb_build_object('id',r.id,'kind',r.record_kind,'name',r.name,'slug',coalesce(r.config->>'slug',r.id::text),'locale',saas.required_page_content_locale(r.store_id,r.id,language.config->>'defaultLocale'),'body',coalesce(b.body,r.config->>'body',''),'excerpt',CASE WHEN b.record_id IS NULL THEN r.config->>'excerpt' ELSE b.excerpt END,'seoTitle',b.seo_title,'seoDescription',b.seo_description,'published',coalesce(r.config->>'published'='true',false) AND r.config?'slug','status',r.status,'version',r.version,'publishedAt',CASE WHEN r.status='active' AND r.config->>'published'='true' AND r.config?'slug' THEN saas.merchant_admin_timestamp(r.updated_at) ELSE NULL END,'createdAt',saas.merchant_admin_timestamp(r.created_at),'updatedAt',saas.merchant_admin_timestamp(r.updated_at),'bodyFormat',coalesce(b.body_format,'legacy'),'bodyDigest','sha256:'||encode(sha256(convert_to(coalesce(b.body,r.config->>'body',''),'UTF8')),'hex'),'origins',coalesce(b.origins,'{}'::jsonb)) || CASE WHEN current_setting('saas.required_pages_projection_version',true)='1' AND EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=r.store_id AND q.record_id=r.id) THEN jsonb_build_object('requiredPageKey',(SELECT q.page_key FROM saas.store_required_pages q WHERE q.store_id=r.store_id AND q.record_id=r.id)) ELSE '{}'::jsonb END
 FROM saas.merchant_admin_records r CROSS JOIN LATERAL (SELECT saas.merchant_content_locale_config(p_store_id) config) language LEFT JOIN saas.merchant_content_bodies b ON b.store_id=r.store_id AND b.record_id=r.id
 WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind IN('page','blog_post') AND saas.required_page_content_locale(r.store_id,r.id,language.config->>'defaultLocale')~'^[a-z]{2,3}(-[A-Z]{2})?$'
$next_1$),
('saas.public_content_projection(uuid,uuid,text,boolean)','e937a941d18e10f5c88585c83555d7a43d749d8812109f02289d672b9af384aa',$next_2$
 SELECT jsonb_build_object('id',r.id,'kind',r.record_kind,'slug',r.config->>'slug',
  'locale',saas.required_page_content_locale(r.store_id,r.id,p_default_locale),'title',r.name,
  'bodyFormat',coalesce(b.body_format,'legacy'),
  'excerpt',CASE WHEN b.record_id IS NULL THEN r.config->>'excerpt' ELSE b.excerpt END,'seoTitle',b.seo_title,'seoDescription',b.seo_description,
  'publishedAt',saas.merchant_admin_timestamp(r.updated_at),'updatedAt',saas.merchant_admin_timestamp(r.updated_at))
  || CASE WHEN current_setting('saas.required_pages_projection_version',true)='1' AND EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=r.store_id AND q.record_id=r.id) THEN jsonb_build_object('requiredPageKey',(SELECT q.page_key FROM saas.store_required_pages q WHERE q.store_id=r.store_id AND q.record_id=r.id)) ELSE '{}'::jsonb END || CASE WHEN p_include_body THEN jsonb_build_object('body',coalesce(b.body,r.config->>'body','')) ELSE '{}'::jsonb END
 FROM saas.merchant_admin_records r LEFT JOIN saas.merchant_content_bodies b ON b.store_id=r.store_id AND b.record_id=r.id
 WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind IN('page','blog_post')
$next_2$),
('saas.public_content_get_v2(text,timestamp with time zone,text,text,text)','8ac74625b6c17dbece688e5c94fff7e65dd68f0d84fc006509d286bd7842aa58',$next_3$
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
 AND r.config->>'slug'=p_slug AND saas.required_page_content_locale(r.store_id,r.id,language->>'defaultLocale')=p_locale
 ORDER BY r.updated_at DESC,r.id DESC LIMIT 1;
 RETURN QUERY SELECT CASE WHEN selected_id IS NULL THEN 'not_found' ELSE 'found' END,
 CASE WHEN selected_id IS NULL THEN NULL::jsonb ELSE saas.public_content_projection(selected_store,selected_id,language->>'defaultLocale',true) END;
END $next_3$),
('saas.merchant_content_versions(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid,integer,bigint)','342c2e2289ada52cfeb800a77ccd34647b5bdb288ea0740a62a96963a828bd1f',$next_4$
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
   item:=jsonb_build_object('recordId',p_record_id,'kind',p_kind,'version',n,'values',snapshot-'requiredPageKey'-'id'-'kind'-'version'-'status'-'publishedAt'-'createdAt'-'updatedAt'-'bodyFormat'-'bodyDigest'-'origins','status',snapshot->'status','bodyFormat',snapshot->'bodyFormat','origins',snapshot->'origins','savedAt',snapshot->'updatedAt');
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
END $next_4$),
('saas.merchant_content_route_available(uuid,uuid,text,jsonb,text,jsonb,text)','db9a18dbdc41c132e36caf06c9cf838eb50d75b610752d17e2fdb14f30e4b8f6',$next_5$
DECLARE route text; default_locale text; new_locale text; old_locale text; BEGIN
 default_locale:=saas.merchant_content_locale_config(p_store_id)->>'defaultLocale';new_locale:=coalesce(p_config->>'locale',(SELECT q.locale FROM saas.store_required_pages q WHERE q.store_id=p_store_id AND q.record_id=p_record_id),default_locale);old_locale:=coalesce(p_old_config->>'locale',(SELECT q.locale FROM saas.store_required_pages q WHERE q.store_id=p_store_id AND q.record_id=p_record_id),default_locale);
 FOR route IN SELECT DISTINCT key COLLATE "C" FROM unnest(ARRAY[p_kind||':'||new_locale||':'||coalesce(p_config->>'slug',''),p_kind||':'||old_locale||':'||coalesce(p_old_config->>'slug','')]) key ORDER BY key COLLATE "C" LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('saas.merchant.content.route:'||p_store_id::text||':'||route,0));
 END LOOP;
 IF p_status<>'active' OR coalesce(p_config->>'published','false')<>'true' THEN RETURN true;END IF;
 IF p_old_status='active' AND p_old_config->>'published'='true' AND p_old_config->>'slug'=p_config->>'slug' AND old_locale IS NOT DISTINCT FROM new_locale THEN RETURN true;END IF;
 RETURN NOT EXISTS(SELECT 1 FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id<>p_record_id AND r.record_kind=p_kind AND r.status='active' AND r.config->>'published'='true' AND r.config->>'slug'=p_config->>'slug' AND saas.required_page_content_locale(r.store_id,r.id,default_locale) IS NOT DISTINCT FROM new_locale);
END $next_5$),
('saas.merchant_content_snapshot(uuid,uuid,uuid,uuid,text)','cc6d7e0b0d60cd9f73bd6a33c2ef786a913f6f356d20b1eb7e6411e3c8551a81',$next_6$
 INSERT INTO saas.merchant_content_versions(store_id,record_id,version,operation_id,principal_id,write_source,snapshot)
 SELECT p_store_id,p_record_id,r.version,p_operation_id,p_principal_id,p_source,saas.merchant_content_document(p_store_id,p_record_id)-'requiredPageKey' FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_record_id
$next_6$),
('saas.merchant_content_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)','d936eb03a65e4dc233f9b22bcddf5cb1ce8f71d912047e8ffc2c81e80f1e1c0e',$next_7$
DECLARE e text; op saas.merchant_admin_operations%ROWTYPE; v saas.merchant_content_versions%ROWTYPE; BEGIN
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'page',true);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO op FROM saas.merchant_admin_operations WHERE store_id=p_store_id AND operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;RETURN;END IF;
 SELECT * INTO v FROM saas.merchant_content_versions WHERE store_id=p_store_id AND operation_id=p_operation_id AND principal_id=p_principal_id AND write_source='typed';
 IF NOT FOUND OR op.payload_fingerprint<>p_fingerprint OR op.result_payload->>'contentDomain' IS DISTINCT FROM 'merchant_content' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'operation_replayed',v.snapshot || CASE WHEN current_setting('saas.required_pages_projection_version',true)='1' AND EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=p_store_id AND q.record_id=v.record_id) THEN jsonb_build_object('requiredPageKey',(SELECT q.page_key FROM saas.store_required_pages q WHERE q.store_id=p_store_id AND q.record_id=v.record_id)) ELSE '{}'::jsonb END;
END
$next_7$),
('saas.merchant_content_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,jsonb)','90ed7c7e870feeea596f2916cca747b952a2b1dcb7f8d2d1e2c95fed290939f4',$next_8$
DECLARE e text; r saas.merchant_admin_records%ROWTYPE; b saas.merchant_content_bodies%ROWTYPE; old_doc jsonb; v jsonb; origins jsonb; cfg jsonb; result jsonb; rid uuid; kind text; expected bigint; action text; body_format text; exists_record boolean;resolved jsonb; BEGIN PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'merchant_content_save');
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'page',true);IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR octet_length(p_request::text)>262144 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('content_authoring.store:'||p_store_id::text,170));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id) THEN RETURN QUERY SELECT * FROM saas.merchant_content_recover_operation(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint);RETURN;END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(p_request) k)<>ARRAY['bodyAction','draftId','expectedBodyDigest','expectedVersion','kind','origins','recordId','values'] THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 kind:=p_request->>'kind';action:=p_request->>'bodyAction';v:=p_request->'values';origins:=p_request->'origins';
 IF kind IS NULL OR kind NOT IN('page','blog_post') OR action IS NULL OR action NOT IN('replace','preserve') OR jsonb_typeof(v) IS DISTINCT FROM 'object' OR jsonb_typeof(origins) IS DISTINCT FROM 'object' OR jsonb_typeof(p_request->'draftId') IS DISTINCT FROM 'string' OR p_request->>'draftId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF (SELECT array_agg(k ORDER BY k) FROM jsonb_object_keys(v) k)<>ARRAY['body','excerpt','locale','name','published','seoDescription','seoTitle','slug','status'] OR EXISTS(SELECT 1 FROM jsonb_each(origins) o WHERE o.key NOT IN('name','body','excerpt','seoTitle','seoDescription') OR (o.value='{"state":"manual"}'::jsonb OR (jsonb_typeof(o.value)='object' AND o.value-ARRAY['generationId','state']='{}'::jsonb AND o.value->>'state' IN('ai','edited_ai') AND jsonb_typeof(o.value->'generationId')='string' AND o.value->>'generationId'~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')) IS DISTINCT FROM true) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(v) x WHERE (x.key IN('body','locale','name','slug','status') AND jsonb_typeof(x.value)<>'string') OR (x.key IN('excerpt','seoTitle','seoDescription') AND jsonb_typeof(x.value) NOT IN('string','null'))) OR jsonb_typeof(v->'published')<>'boolean' OR v->>'status' NOT IN('draft','active') OR (v->>'published'='true' AND v->>'status'<>'active') OR v->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR octet_length(v->>'slug')>100 OR v->>'locale'!~'^[a-z]{2,3}(-[A-Z]{2})?$' OR v->>'name'<>btrim(v->>'name') OR octet_length(v->>'name') NOT BETWEEN 1 AND 160 OR v->>'name'~'[[:cntrl:]]' OR saas.merchant_content_text_valid(v->>'body',80000) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each_text(v) x WHERE x.key IN('name','excerpt','seoTitle','seoDescription') AND x.value IS NOT NULL AND (saas.merchant_content_text_valid(x.value,CASE WHEN x.key IN('name','seoTitle') THEN 160 ELSE 4000 END) IS DISTINCT FROM true OR x.value~U&'[\0001-\001F\007F-\009F]' OR left(x.value,1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR right(x.value,1)~U&'[\0020\00A0\1680\2000-\200A\2028\2029\202F\205F\3000\FEFF]' OR x.value~*'</?[a-z!].*>')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
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
 ELSIF expected IS NOT NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb;RETURN;END IF;
 resolved:=saas.content_resource_resolve_origins(p_store_id,p_principal_id,rid,(p_request->>'draftId')::uuid,kind,expected,v,origins,coalesce(old_doc->'origins','{}'),NOT exists_record);IF resolved->>'outcome'<>'valid' THEN RETURN QUERY SELECT resolved->>'outcome',NULL::jsonb;RETURN;END IF;origins:=resolved->'origins';
 cfg:=jsonb_build_object('slug',v->'slug','locale',v->'locale','published',v->'published');IF kind='blog_post' AND v->'excerpt'<>'null'::jsonb THEN cfg:=cfg||jsonb_build_object('excerpt',v->'excerpt');END IF;
 IF exists_record AND r.config?'body' THEN cfg:=cfg||jsonb_build_object('body',r.config->'body');END IF;
 IF NOT saas.merchant_content_route_available(p_store_id,rid,kind,cfg,v->>'status',r.config,r.status) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF exists_record AND NOT saas.required_page_transition_valid(p_store_id,rid,kind,cfg,v->>'status') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 IF exists_record THEN UPDATE saas.merchant_admin_records SET name=v->>'name',config=cfg,status=v->>'status',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=rid;
 ELSE INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES(rid,p_store_id,kind,v->>'name',cfg,v->>'status',p_now,p_now);END IF;
 body_format:=CASE WHEN action='preserve' THEN old_doc->>'bodyFormat' ELSE 'normalized_html' END;
 INSERT INTO saas.merchant_content_bodies(store_id,record_id,version,body,body_format,origins,excerpt,seo_title,seo_description)
 SELECT p_store_id,rid,version,v->>'body',body_format,origins,v->>'excerpt',v->>'seoTitle',v->>'seoDescription' FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=rid
 ON CONFLICT(store_id,record_id) DO UPDATE SET version=excluded.version,body=excluded.body,body_format=excluded.body_format,origins=excluded.origins,excerpt=excluded.excerpt,seo_title=excluded.seo_title,seo_description=excluded.seo_description;
 PERFORM saas.content_resource_append_history(p_store_id,p_principal_id,rid,(p_request->>'draftId')::uuid,p_now);
 result:=saas.merchant_content_document(p_store_id,rid);
 PERFORM saas.merchant_content_snapshot(p_store_id,rid,p_operation_id,p_principal_id,'typed');
 cfg:=jsonb_build_object('id',rid,'kind',kind,'status',result->'status','version',result->'version','updatedAt',result->'updatedAt','bodyDigest',result->'bodyDigest','contentDomain','merchant_content');
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,rid,kind,'saved',cfg,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'save',p_fingerprint,cfg,p_now);
 RETURN QUERY SELECT 'saved',result;
END
$next_8$),
('saas.merchant_admin_save_without_category_showcase(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,jsonb,text)','69d3cbbe120588e7b15128b70a2ffd6fc5a0694001a35f8384445d09460a6196',$next_9$
DECLARE e text; op saas.merchant_admin_operations%ROWTYPE; current_record saas.merchant_admin_records%ROWTYPE; result jsonb; projection jsonb;
BEGIN PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'merchant_admin_save_without_category_showcase');
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 SELECT * INTO op FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id;
 IF FOUND THEN
  SELECT * INTO current_record FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=(op.result_payload->>'id')::uuid FOR UPDATE;
  IF NOT FOUND OR current_record.record_kind<>(op.result_payload->>'kind') THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,current_record.record_kind,true); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
  IF current_record.id<>p_record_id OR op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN;
 END IF;
 IF p_fingerprint!~'^[a-f0-9]{64}$' OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.octet_length(p_name) NOT BETWEEN 1 AND 160 OR p_name~'[[:cntrl:]]' OR NOT saas.merchant_admin_config_valid(p_kind,p_config) OR p_status NOT IN('draft','active') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO current_record FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE;
 IF FOUND THEN IF current_record.record_kind<>p_kind THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF; IF p_expected_version IS NULL OR current_record.version<>p_expected_version OR current_record.status='archived' THEN RETURN QUERY SELECT CASE WHEN current_record.status='archived' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF; IF NOT saas.required_page_transition_valid(p_store_id,p_record_id,p_kind,p_config,p_status) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF; UPDATE saas.merchant_admin_records SET name=p_name,config=p_config,status=p_status,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_record_id;
 ELSE IF p_expected_version IS NOT NULL THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF; INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,created_at,updated_at) VALUES(p_record_id,p_store_id,p_kind,p_name,p_config,p_status,p_now,p_now); END IF;
 SELECT saas.merchant_admin_mutation_projection(r.id,r.record_kind,r.status,r.version,r.updated_at),saas.merchant_admin_projection(p_store_id,r.id) INTO result,projection FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_record_id;
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,p_record_id,p_kind,'saved',projection,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'save',p_fingerprint,result,p_now); RETURN QUERY SELECT 'saved',result;
END $next_9$),
('saas.merchant_admin_archive_before_content_bodies(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)','d236832aa53df97798d1169e875b010604fd55fd69f47ce1eb0e78be3f83c1ae',$next_10$ DECLARE e text; op saas.merchant_admin_operations%ROWTYPE; r saas.merchant_admin_records%ROWTYPE; result jsonb; BEGIN PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'merchant_admin_archive_before_content_bodies');
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.merchant.admin.operation:'||p_operation_id::text,0));
 SELECT * INTO op FROM saas.merchant_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN
  SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=(op.result_payload->>'id')::uuid;
  IF NOT FOUND OR r.record_kind<>(op.result_payload->>'kind') THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
  e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
  IF r.id<>p_record_id OR op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN;
 END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=p_store_id AND id=p_record_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'record_not_found',NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,r.record_kind,true); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 IF r.status='archived' OR r.version<>p_expected_version THEN RETURN QUERY SELECT CASE WHEN r.status='archived' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=p_store_id AND q.record_id=p_record_id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 UPDATE saas.merchant_admin_records SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND id=p_record_id RETURNING saas.merchant_admin_mutation_projection(id,record_kind,status,version,updated_at) INTO result;
 INSERT INTO saas.merchant_admin_events(id,store_id,record_id,record_kind,event_kind,summary,occurred_at) VALUES(p_operation_id,p_store_id,p_record_id,r.record_kind,'archived',result,p_now);
 INSERT INTO saas.merchant_admin_operations VALUES(p_operation_id,p_store_id,'archive',p_fingerprint,result,p_now); RETURN QUERY SELECT 'archived',result;
END $next_10$),
('saas.merchant_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)','121e2e9f6eb94af9336926b139c42a38e2a6a21eb2aa513c0bab7d2157adfb7e',$next_11$
DECLARE denied text;
BEGIN
 IF p_kind='page' THEN
  denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
  RETURN QUERY SELECT 'listed',jsonb_build_object('items',coalesce((SELECT jsonb_agg(saas.merchant_admin_projection(p_store_id,x.id) ORDER BY x.required_order,x.updated_at DESC,x.id DESC) FROM (
   SELECT r.id,r.updated_at,CASE q.page_key WHEN 'about' THEN 0 WHEN 'contact' THEN 1 WHEN 'blog' THEN 2 ELSE 3 END required_order FROM saas.merchant_admin_records r LEFT JOIN saas.store_required_pages q ON q.store_id=r.store_id AND q.record_id=r.id
   WHERE r.store_id=p_store_id AND r.record_kind='page' AND r.status<>'archived' ORDER BY required_order,r.updated_at DESC,r.id DESC LIMIT 200
  ) x),'[]'::jsonb));RETURN;
 END IF;
 IF p_kind IS DISTINCT FROM 'restock_alerts' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_before_restock_alerts_207(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind); RETURN; END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(saas.merchant_admin_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind=p_kind AND r.status<>'archived'),'[]'::jsonb));
END $next_11$),
('saas.seo_resource_rows_scoped(uuid,timestamp with time zone,text,uuid)','5daf4cfb3e370a8b97213c81ba29e6d3d20ff28321ec4747517776f1faeaebe5',$next_12$
 WITH settings AS MATERIALIZED (SELECT saas.seo_settings_projection(p_store_id,p_now) value), language AS MATERIALIZED (SELECT saas.public_content_locale_config(p_store_id) value), native AS (
 SELECT 'product'::text kind,p.id,p.title name,(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/urun/' ELSE '/products/' END)||p.slug path,s.locale,p.status,p.version,pr.seo_title title,pr.seo_description description,coalesce(p.description,'') fallback,
 (SELECT m.public_url FROM saas.product_media m WHERE m.store_id=p_store_id AND m.product_id=p.id AND m.status='active' ORDER BY m.sort_order,m.id LIMIT 1) image,p.updated_at,
 p.status='active' AND saas.public_effective_product_projection(p_store_id,p.id,p_now) IS NOT NULL AND p.slug~'^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(p.slug) BETWEEN 3 AND 100 published
 FROM saas.products p JOIN saas.stores s ON s.id=p.store_id LEFT JOIN saas.catalog_product_profiles pr ON pr.store_id=p.store_id AND pr.product_id=p.id WHERE p.store_id=p_store_id AND (p_kind IS NULL OR p_kind='product') AND (p_id IS NULL OR p.id=p_id) AND p.status<>'archived'
 UNION ALL SELECT 'category',c.id,c.name,(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/kategori/' ELSE '/categories/' END)||c.slug,s.locale,c.status,c.version,legacy.config->>'metaTitle',legacy.config->>'metaDescription','',a.public_url,greatest(c.updated_at,legacy.updated_at),c.status='active'
 FROM saas.catalog_categories c JOIN saas.stores s ON s.id=c.store_id LEFT JOIN saas.storefront_assets a ON a.store_id=c.store_id AND a.id=c.image_asset_id AND a.status='active' LEFT JOIN LATERAL (SELECT r.config,r.updated_at FROM saas.merchant_admin_records r WHERE r.store_id=c.store_id AND r.record_kind='seo_category_entry' AND r.status='active' AND r.config->>'resourceId'=c.id::text ORDER BY r.updated_at DESC,r.id DESC LIMIT 1) legacy ON true WHERE c.store_id=p_store_id AND (p_kind IS NULL OR p_kind='category') AND (p_id IS NULL OR c.id=p_id) AND c.status<>'archived'
 UNION ALL SELECT CASE WHEN r.record_kind='page' THEN 'page' ELSE 'blog' END,r.id,r.name,saas.required_page_content_path(r.store_id,r.id,language.value->>'defaultLocale'),saas.required_page_content_locale(r.store_id,r.id,language.value->>'defaultLocale'),r.status,r.version,b.seo_title,b.seo_description,coalesce(b.excerpt,r.config->>'excerpt',''),NULL,r.updated_at,
 r.status='active' AND r.config->>'published'='true' AND r.config->>'slug'~'^[a-z0-9]+(-[a-z0-9]+)*$' AND char_length(r.config->>'slug') BETWEEN 1 AND 100
 AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(language.value->'enabledLocales') x WHERE x.value=saas.required_page_content_locale(r.store_id,r.id,language.value->>'defaultLocale'))
 AND NOT EXISTS(SELECT 1 FROM saas.merchant_admin_records newer WHERE newer.store_id=r.store_id AND newer.record_kind=r.record_kind AND newer.status='active' AND newer.config->>'published'='true' AND newer.config->>'slug'=r.config->>'slug' AND saas.required_page_content_locale(newer.store_id,newer.id,language.value->>'defaultLocale')=saas.required_page_content_locale(r.store_id,r.id,language.value->>'defaultLocale') AND (newer.updated_at,newer.id)>(r.updated_at,r.id))
 FROM saas.merchant_admin_records r CROSS JOIN language LEFT JOIN saas.merchant_content_bodies b ON b.store_id=r.store_id AND b.record_id=r.id WHERE r.store_id=p_store_id AND (p_kind IS NULL OR p_kind='page' AND r.record_kind='page' OR p_kind='blog' AND r.record_kind='blog_post') AND (p_id IS NULL OR r.id=p_id) AND r.record_kind IN('page','blog_post') AND r.status<>'archived'
 ) SELECT n.kind,n.id,coalesce(n.published,false),jsonb_build_object('id',n.id,'kind',n.kind,'name',n.name,'path',n.path,'locale',n.locale,'status',n.status,'version',n.version,'seoVersion',coalesce(o.version,0),'title',n.title,'description',n.description,'canonicalPath',coalesce(o.canonical_path,CASE WHEN n.kind='category' AND saas.seo_canonical_owned(p_store_id,p_now,category_seo.config->>'canonicalPath',n.kind,n.id) THEN category_seo.config->>'canonicalPath' ELSE NULL END),'indexing',coalesce(o.indexing,'inherit'),
 'effectiveTitle',coalesce(n.title,n.name),'effectiveDescription',coalesce(n.description,n.fallback,''),'effectiveCanonicalPath',coalesce(CASE WHEN saas.seo_canonical_owned(p_store_id,p_now,o.canonical_path,n.kind,n.id) THEN o.canonical_path ELSE NULL END,CASE WHEN n.kind='category' AND saas.seo_canonical_owned(p_store_id,p_now,category_seo.config->>'canonicalPath',n.kind,n.id) THEN category_seo.config->>'canonicalPath' ELSE NULL END,n.path),'allowIndex',coalesce(n.published,false) AND coalesce(o.indexing,'inherit')<>'noindex' AND settings.value->>'allowIndex'='true','imageUrl',n.image,'updatedAt',saas.merchant_admin_timestamp(greatest(n.updated_at,o.updated_at)))
 FROM native n CROSS JOIN settings LEFT JOIN saas.seo_resource_options o ON o.store_id=p_store_id AND o.kind=n.kind AND o.resource_id=n.id LEFT JOIN LATERAL (SELECT r.config FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='seo_category_entry' AND r.status='active' AND r.config->>'resourceId'=n.id::text ORDER BY r.updated_at DESC,r.id DESC LIMIT 1) category_seo ON n.kind='category'
$next_12$),
('saas.seo_canonical_owned(uuid,timestamp with time zone,text,text,uuid)','64cbc4874df21f5a98e015abab2ecd9382ed7591862530db8d34c64411922d6f',$next_13$
 SELECT p_path IS NULL OR (saas.seo_path_valid(p_path) AND (
 p_path IN('/','/blog',(SELECT CASE WHEN locale='tr' OR locale LIKE 'tr-%' THEN '/urunler' ELSE '/products' END FROM saas.stores WHERE id=p_store_id))
 OR EXISTS(SELECT 1 FROM saas.products p JOIN saas.stores s ON s.id=p.store_id WHERE p.store_id=p_store_id AND p.status<>'archived' AND p_path=(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/urun/' ELSE '/products/' END)||p.slug AND (p_kind='product' AND p.id=p_id OR p.status='active' AND saas.public_effective_product_projection(p_store_id,p.id,p_now) IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.seo_resource_options o WHERE o.store_id=p_store_id AND o.kind='product' AND o.resource_id=p.id AND o.indexing='noindex')))
 OR EXISTS(SELECT 1 FROM saas.catalog_categories c JOIN saas.stores s ON s.id=c.store_id WHERE c.store_id=p_store_id AND c.status='active' AND p_path=(CASE WHEN s.locale='tr' OR s.locale LIKE 'tr-%' THEN '/kategori/' ELSE '/categories/' END)||c.slug AND (p_kind='category' AND c.id=p_id OR NOT EXISTS(SELECT 1 FROM saas.seo_resource_options o WHERE o.store_id=p_store_id AND o.kind='category' AND o.resource_id=c.id AND o.indexing='noindex')))
 OR EXISTS(SELECT 1 FROM saas.merchant_admin_records r CROSS JOIN LATERAL(SELECT saas.public_content_locale_config(p_store_id) value) language WHERE r.store_id=p_store_id AND r.record_kind IN('page','blog_post') AND r.status<>'archived'
 AND p_path=saas.required_page_content_path(r.store_id,r.id,language.value->>'defaultLocale')
 AND (r.id=p_id AND (p_kind='page' AND r.record_kind='page' OR p_kind='blog' AND r.record_kind='blog_post') OR r.status='active' AND r.config->>'published'='true' AND NOT EXISTS(SELECT 1 FROM saas.seo_resource_options o WHERE o.store_id=p_store_id AND o.kind=CASE WHEN r.record_kind='page' THEN 'page' ELSE 'blog' END AND o.resource_id=r.id AND o.indexing='noindex')
 AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(language.value->'enabledLocales') enabled WHERE enabled.value=saas.required_page_content_locale(r.store_id,r.id,language.value->>'defaultLocale'))
 AND NOT EXISTS(SELECT 1 FROM saas.merchant_admin_records newer WHERE newer.store_id=r.store_id AND newer.record_kind=r.record_kind AND newer.status='active' AND newer.config->>'published'='true' AND newer.config->>'slug'=r.config->>'slug' AND saas.required_page_content_locale(newer.store_id,newer.id,language.value->>'defaultLocale')=saas.required_page_content_locale(r.store_id,r.id,language.value->>'defaultLocale') AND (newer.updated_at,newer.id)>(r.updated_at,r.id)) ))
 ))
$next_13$),
('saas.seo_resource_notify_trigger()','5f84234add6150c3963262ffc6168cff74e3d93846db735a1df7b7f314a29e58',$next_14$
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
 default_locale:=saas.public_content_locale_config(sid)->>'defaultLocale';locale:=coalesce(old_data#>>'{config,locale}',(SELECT q.locale FROM saas.store_required_pages q WHERE q.store_id=sid AND q.record_id=rid),default_locale);
 old_path:=(CASE WHEN EXISTS(SELECT 1 FROM saas.store_required_pages q WHERE q.store_id=sid AND q.record_id=rid AND q.page_key='blog') THEN '/blog' ELSE (CASE WHEN k='page' THEN '/pages/' ELSE '/blog/' END)||(old_data#>>'{config,slug}') END)||(CASE WHEN locale=default_locale THEN '' ELSE '?lang='||locale END);
 old_published:=old_data->>'status'='active' AND old_data#>>'{config,published}'='true';END IF;
 SELECT canonical_path INTO old_canonical FROM saas.seo_resource_options WHERE store_id=sid AND kind=k AND resource_id=rid AND indexing<>'noindex';
 IF old_published AND NOT EXISTS(SELECT 1 FROM saas.seo_resource_options WHERE store_id=sid AND kind=k AND resource_id=rid AND indexing='noindex') THEN PERFORM saas.seo_enqueue(sid,old_path,now_at);IF old_canonical IS NOT NULL THEN PERFORM saas.seo_enqueue(sid,old_canonical,now_at);END IF;END IF;
 END IF;
 IF TG_OP<>'DELETE' THEN SELECT x.payload INTO resource FROM saas.seo_resource_rows_scoped(sid,now_at,k,rid) x WHERE x.kind=k AND x.id=rid AND x.published;
 IF resource->>'allowIndex'='true' THEN PERFORM saas.seo_enqueue(sid,resource->>'effectiveCanonicalPath',now_at);END IF;END IF;
 RETURN coalesce(NEW,OLD);
END $next_14$),
('saas.c183_public_destination_predecessor(uuid,jsonb)','2327c3aa475e760130a51eca119fdc37939bcf86161691212ec0bef7aba92cd3',$next_15$
DECLARE resource_id uuid; result jsonb;
BEGIN
  IF p_value->>'kind'='none' THEN RETURN 'null'::jsonb; END IF;
  resource_id:=(p_value->>'resourceId')::uuid;
  IF p_value->>'kind'='product' THEN
    SELECT pg_catalog.jsonb_build_object('path','/products/'||product.slug) INTO result FROM saas.products product WHERE product.store_id=p_store_id AND product.id=resource_id AND product.status='active';
  ELSIF p_value->>'kind'='collection' THEN
    SELECT pg_catalog.jsonb_build_object('path','/categories/'||category.slug) INTO result FROM saas.catalog_categories category WHERE category.store_id=p_store_id AND category.id=resource_id AND category.status='active';
  ELSE
    SELECT pg_catalog.jsonb_build_object('path',saas.required_page_content_path(page.store_id,page.id,saas.public_content_locale_config(page.store_id)->>'defaultLocale')) INTO result FROM saas.merchant_admin_records page WHERE page.store_id=p_store_id AND page.id=resource_id AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true' AND saas.required_page_public_locale_allowed(page.store_id,page.id);
  END IF;
  RETURN COALESCE(result,'null'::jsonb);
END
$next_15$),
('saas.c183_public_footer_predecessor(uuid,jsonb)','f26143026f43bcb2356185fdf70d85b8bfedf76ef178aea34209f684bff80065',$next_16$
DECLARE selected_key text; result jsonb;
BEGIN
  IF p_link->>'kind'='system' THEN RETURN pg_catalog.jsonb_build_object('label',CASE p_link->>'destination' WHEN '/' THEN 'Ana Sayfa' WHEN '/products' THEN 'Tüm Ürünler' WHEN '/favorites' THEN 'Favoriler' ELSE 'Hesabım' END,'destination',p_link->>'destination');
  ELSIF p_link->>'kind'='category' THEN SELECT pg_catalog.jsonb_build_object('label',c.name,'destination','/categories/'||c.slug) INTO result FROM saas.catalog_categories c WHERE c.store_id=p_store_id AND c.id=(p_link->>'categoryId')::uuid AND c.status='active';
  ELSIF p_link->>'kind'='page' THEN SELECT pg_catalog.jsonb_build_object('label',r.name,'destination',saas.required_page_content_path(r.store_id,r.id,saas.public_content_locale_config(r.store_id)->>'defaultLocale')) INTO result FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=(p_link->>'pageId')::uuid AND r.record_kind='page' AND r.status='active' AND r.config->'published'='true'::jsonb AND saas.required_page_public_locale_allowed(r.store_id,r.id);
  ELSE selected_key:=CASE p_link->>'policyKey' WHEN 'returns_exchange' THEN 'returns_exchanges' ELSE p_link->>'policyKey' END; SELECT pg_catalog.jsonb_build_object('label',p.label,'destination',p.route) INTO result FROM saas.store_policy_pages p WHERE p.store_id=p_store_id AND p.policy_key=selected_key AND p.status='published'; END IF;
  RETURN result;
END
$next_16$),
('saas.c183_workspace_predecessor(uuid)','57547aed094fb28bef3b8b241bb71e7927b0161669fe6a9390966a7c73464fa0',$next_17$
  SELECT pg_catalog.jsonb_build_object(
    'schemaVersion',3,'draftVersion',design.draft_version,'publishedVersion',design.published_version,
    'draftUpdatedAt',saas.storefront_design_timestamp(design.draft_updated_at),'publishedAt',saas.storefront_design_timestamp(design.published_at),
    'draft',design.draft_config,'publishedDraft',design.published_config,'published',saas.storefront_design_public_payload(design.store_id,design.published_config,design.published_version,design.published_at),
    'store',pg_catalog.jsonb_build_object('name',store.name,'timezone',COALESCE((SELECT setting.config->>'timezone' FROM saas.merchant_admin_records setting WHERE setting.store_id=store.id AND setting.record_kind='general_setting' AND setting.status='active' AND setting.config?'timezone' ORDER BY setting.updated_at DESC,setting.id DESC LIMIT 1),'Europe/Istanbul')),
    'media',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',media.id,'url',media.public_url,'altText',media.alt_text,'mediaType',media.media_type,'width',media.width,'height',media.height) ORDER BY media.created_at DESC,media.id) FROM saas.storefront_design_media media WHERE media.store_id=design.store_id AND media.status='active'),'[]'::jsonb),
    'assets',COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id',asset.id,'url',asset.public_url,'altText',asset.alt_text,'mediaType',asset.media_type,'width',asset.width,'height',asset.height,'kind',asset.asset_kind) ORDER BY asset.updated_at DESC,asset.id) FROM saas.storefront_assets asset WHERE asset.store_id=design.store_id AND asset.status='active'),'[]'::jsonb),
    'destinations',COALESCE((SELECT pg_catalog.jsonb_agg(choice.payload ORDER BY choice.label,choice.resource_id) FROM (
      SELECT product.title label,product.id resource_id,pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('kind','product','resourceId',product.id,'label',product.title,'path','/products/'||product.slug,
       'searchTerms',COALESCE((SELECT pg_catalog.jsonb_agg(term ORDER BY term) FROM (
         SELECT DISTINCT pg_catalog.btrim(term) term FROM saas.product_variants variant
         CROSS JOIN LATERAL pg_catalog.unnest(ARRAY[variant.sku,variant.barcode]) term
         WHERE variant.store_id=design.store_id AND variant.product_id=product.id AND variant.status='active'
         AND term IS NOT NULL AND pg_catalog.btrim(term)<>'' ORDER BY term LIMIT 100
       ) selected),'[]'::jsonb),
       'categoryIds',COALESCE((SELECT pg_catalog.jsonb_agg(category_id ORDER BY category_id) FROM saas.catalog_product_categories relation WHERE relation.store_id=design.store_id AND relation.product_id=product.id),'[]'::jsonb),
       'imageUrl',projected.payload->'media'->0->>'url','priceCents',projected.payload->'priceCents',
       'available',COALESCE((projected.payload->>'available')::boolean,false))) payload
       FROM saas.products product CROSS JOIN LATERAL (SELECT saas.public_effective_product_projection(design.store_id,product.id,pg_catalog.statement_timestamp()) payload) projected WHERE product.store_id=design.store_id AND product.status='active'
      UNION ALL SELECT category.name,category.id,pg_catalog.jsonb_build_object('kind','collection','resourceId',category.id,'label',category.name,'path','/categories/'||category.slug) FROM saas.catalog_categories category WHERE category.store_id=design.store_id AND category.status='active'
      UNION ALL SELECT page.name,page.id,pg_catalog.jsonb_build_object('kind','page','resourceId',page.id,'label',page.name,'path',saas.required_page_content_path(page.store_id,page.id,saas.public_content_locale_config(page.store_id)->>'defaultLocale')) FROM saas.merchant_admin_records page WHERE page.store_id=design.store_id AND page.record_kind='page' AND page.status='active' AND page.config->>'published'='true' AND saas.required_page_public_locale_allowed(page.store_id,page.id)
    ) choice),'[]'::jsonb)
  ) FROM saas.storefront_designs design JOIN saas.stores store ON store.id=design.store_id WHERE design.store_id=p_store_id
$next_17$),
('saas.public_content_sitemap_rows_before_seo_hub(uuid,text,timestamp with time zone,text,jsonb,text,text)','2b08910fa1117e4347a5c5902b485cfb29bb5906169aa653eac4f34351c7dee1',$next_18$
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
   SELECT DISTINCT ON (r.record_kind,saas.required_page_content_locale(r.store_id,r.id,p_default_locale),r.config->>'slug')
    r.record_kind kind,saas.required_page_content_locale(r.store_id,r.id,p_default_locale) locale,r.config->>'slug' slug,r.updated_at,r.id
   FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind IN('page','blog_post')
   AND r.status='active' AND r.config->>'published'='true' AND r.config?'slug'
   AND char_length(r.config->>'slug') BETWEEN 1 AND 100
   AND r.config->>'slug'~'^[a-z0-9]+(-[a-z0-9]+)*$'
   AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(p_enabled_locales) enabled WHERE enabled.value=saas.required_page_content_locale(r.store_id,r.id,p_default_locale))
   ORDER BY r.record_kind,saas.required_page_content_locale(r.store_id,r.id,p_default_locale),r.config->>'slug',r.updated_at DESC,r.id DESC
  ) SELECT saas.required_page_content_path(p_store_id,w.id,p_default_locale),w.updated_at,p_frequency FROM winners w
   ORDER BY w.kind,w.locale,w.slug;
 END IF;
END $next_18$)
 ) edits(identity,expected_source,next_source) LOOP
  SELECT * INTO before FROM pg_proc WHERE oid=to_regprocedure(target.identity);
  IF NOT FOUND OR before.proowner<>(SELECT oid FROM pg_roles WHERE rolname='celebix_saas_owner') OR encode(sha256(convert_to(before.prosrc,'UTF8')),'hex')<>target.expected_source THEN RAISE EXCEPTION 'REQUIRED_PAGES_213_SOURCE_DRIFT: %',target.identity;END IF;
  definition:=pg_get_functiondef(before.oid);IF strpos(definition,before.prosrc)=0 THEN RAISE EXCEPTION 'REQUIRED_PAGES_213_SOURCE_UNBOUND';END IF;
  EXECUTE replace(definition,before.prosrc,target.next_source);
  SELECT * INTO after FROM pg_proc WHERE oid=before.oid;
  IF to_jsonb(before)-ARRAY['prosrc','proargdefaults'] IS DISTINCT FROM to_jsonb(after)-ARRAY['prosrc','proargdefaults'] OR pg_get_expr(before.proargdefaults,0) IS DISTINCT FROM pg_get_expr(after.proargdefaults,0) OR after.prosrc IS DISTINCT FROM target.next_source THEN RAISE EXCEPTION 'REQUIRED_PAGES_213_AUTHORITY_CHANGED: %, attrs %, source %',target.identity,(SELECT array_agg(k) FROM jsonb_each(to_jsonb(before)-'prosrc') x(k,v) WHERE to_jsonb(after)->k IS DISTINCT FROM v),after.prosrc IS DISTINCT FROM target.next_source;END IF;
  INSERT INTO saas.required_pages_213_backup VALUES(target.identity,definition,pg_get_functiondef(after.oid),to_jsonb(before)-'prosrc');
 END LOOP;
END $patch$;
REVOKE ALL ON FUNCTION saas.required_page_public_locale_allowed(uuid,uuid),saas.required_page_content_locale(uuid,uuid,text),saas.required_page_content_path(uuid,uuid,text),saas.required_page_transition_valid(uuid,uuid,text,jsonb,text),saas.guard_required_page_record(),saas.guard_required_page_mapping(),saas.required_page_seed_plan(uuid),saas.seed_store_required_pages(uuid,timestamptz),saas.create_store_required_pages(),saas.public_required_page_get(text,timestamptz,text,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_required_page_get(text,timestamptz,text,text) TO celebix_saas_host_resolver;
DO $backfill$ DECLARE store_row record;captured_now timestamptz:=clock_timestamp();BEGIN FOR store_row IN SELECT id FROM saas.stores ORDER BY id LOOP PERFORM saas.seed_store_required_pages(store_row.id,captured_now);END LOOP;END $backfill$;
COMMIT;
