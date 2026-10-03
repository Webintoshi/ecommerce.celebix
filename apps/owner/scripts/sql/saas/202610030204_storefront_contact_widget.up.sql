-- A merchant-owned contact tool, independent of theme publication and the public shell contract.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $ready$
BEGIN
 IF to_regclass('saas.contact_widget_204_backup') IS NOT NULL
  OR to_regprocedure('saas.public_contact_widget_get(text,timestamptz)') IS NOT NULL
  OR to_regprocedure('saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NULL
  OR to_regprocedure('saas.merchant_admin_config_valid(text,jsonb)') IS NULL
  OR to_regprocedure('saas.store_policy_public_store(text,timestamptz)') IS NULL
  OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text)'::regprocedure AND prosrc LIKE '%merchant_admin_save_before_content_bodies%' AND prosrc LIKE '%content_authoring.store:%')
 THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_PREDECESSOR_INVALID'; END IF;
END $ready$;

CREATE TABLE saas.contact_widget_204_backup(identity text PRIMARY KEY,definition text NOT NULL,migrated_definition text,function_owner oid,function_acl text);
ALTER TABLE saas.contact_widget_204_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.contact_widget_204_backup FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE saas.contact_widget_204_backup FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

-- Keep the original function OIDs, owners and ACLs; private predecessor copies
-- retain all current content-authoring, SKU, delivery and campaign behavior.
DO $backup$
DECLARE row record; original text; cloned text; clone_name text;
BEGIN
 FOR row IN SELECT p.oid,p.proname,p.proowner,p.proacl FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace
  AND p.proname IN('merchant_admin_required_action','merchant_admin_config_valid','merchant_admin_list','merchant_admin_list_events','merchant_admin_get_record','merchant_admin_save') LOOP
  original:=pg_get_functiondef(row.oid);clone_name:=row.proname||'_before_contact_widget_204';
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname=clone_name) THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_PRIVATE_PREDECESSOR_EXISTS'; END IF;
  cloned:=replace(original,'CREATE OR REPLACE FUNCTION saas.'||row.proname||'(','CREATE FUNCTION saas.'||clone_name||'(');
  IF cloned=original THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_DEFINITION_ANCHOR_INVALID'; END IF;
  INSERT INTO saas.contact_widget_204_backup VALUES(row.oid::regprocedure::text,original,NULL,row.proowner,row.proacl::text);
  EXECUTE cloned;
  EXECUTE format('ALTER FUNCTION saas.%I(%s) OWNER TO %I',clone_name,pg_get_function_identity_arguments(row.oid),pg_get_userbyid(row.proowner));
  EXECUTE format('REVOKE ALL ON FUNCTION saas.%I(%s) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',clone_name,pg_get_function_identity_arguments(row.oid));
 END LOOP;
 IF (SELECT count(*) FROM saas.contact_widget_204_backup)<>6 THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_PREDECESSOR_COUNT_INVALID'; END IF;
 SELECT pg_get_constraintdef(oid) INTO original FROM pg_constraint WHERE conrelid='saas.merchant_admin_records'::regclass AND conname='merchant_admin_records_record_kind_check';
 IF original IS NULL OR original NOT LIKE '%starter_theme_composition%' OR original LIKE '%contact_widget%' THEN RAISE EXCEPTION 'CONTACT_WIDGET_204_KIND_CONSTRAINT_INVALID'; END IF;
 INSERT INTO saas.contact_widget_204_backup VALUES('constraint:merchant_admin_records_record_kind_check',original,NULL,NULL,NULL);
 EXECUTE 'ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check';
 EXECUTE 'ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind=''contact_widget'' OR ('||substring(original FROM 8 FOR char_length(original)-8)||'))';
END $backup$;
CREATE UNIQUE INDEX merchant_admin_contact_widget_singleton_204 ON saas.merchant_admin_records(store_id) WHERE record_kind='contact_widget' AND status<>'archived';

CREATE FUNCTION saas.contact_widget_text_valid(p_value jsonb,p_min integer,p_max integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $f$
DECLARE value text; trim_chars CONSTANT text:=U&' \0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
 IF jsonb_typeof(p_value) IS DISTINCT FROM 'string' THEN RETURN false; END IF;
 value:=p_value#>>'{}';
 RETURN char_length(value) BETWEEN p_min AND p_max
  AND value!~'[<>]' AND value=btrim(value,trim_chars) AND value!~'[[:cntrl:]]' AND value!~U&'[\007F-\009F]';
END $f$;

CREATE FUNCTION saas.contact_widget_config_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE channel jsonb; value text; kind text; hours jsonb;
BEGIN
 IF p_config IS NULL OR NOT saas.catalog_onboarding_json_exact(p_config,ARRAY['schemaVersion','enabled','title','greeting','buttonLabel','position','icon','theme','devices','pages','whatsappMessage','includeProductLink','hours','channels'],ARRAY[]::text[])
  OR octet_length(p_config::text)>16384 OR p_config->'schemaVersion' IS DISTINCT FROM '1'::jsonb
  OR jsonb_typeof(p_config->'enabled') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_config->'includeProductLink') IS DISTINCT FROM 'boolean'
  OR NOT saas.contact_widget_text_valid(p_config->'title',1,80) OR NOT saas.contact_widget_text_valid(p_config->'greeting',0,240)
  OR NOT saas.contact_widget_text_valid(p_config->'buttonLabel',1,32) OR NOT saas.contact_widget_text_valid(p_config->'whatsappMessage',0,300)
  OR jsonb_typeof(p_config->'position') IS DISTINCT FROM 'string' OR jsonb_typeof(p_config->'icon') IS DISTINCT FROM 'string' OR jsonb_typeof(p_config->'theme') IS DISTINCT FROM 'string'
  OR p_config->>'position' NOT IN('bottom-right','bottom-left') OR p_config->>'icon' NOT IN('message','headset') OR p_config->>'theme' NOT IN('brand','light','dark')
  OR NOT saas.catalog_onboarding_json_exact(p_config->'devices',ARRAY['desktop','mobile'],ARRAY[]::text[])
  OR jsonb_typeof(p_config->'devices'->'desktop') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_config->'devices'->'mobile') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(p_config->'pages') IS DISTINCT FROM 'array' OR jsonb_typeof(p_config->'channels') IS DISTINCT FROM 'array'
  THEN RETURN false; END IF;
 IF jsonb_array_length(p_config->'pages')>6 OR jsonb_array_length(p_config->'channels')>9
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'pages') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' NOT IN('home','products','categories','content','cart','search'))
  OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(p_config->'pages') x)<>jsonb_array_length(p_config->'pages') THEN RETURN false; END IF;
 hours:=p_config->'hours';
 IF NOT saas.catalog_onboarding_json_exact(hours,ARRAY['enabled','timeZone','days','opensAt','closesAt','outsideBehavior','outsideMessage'],ARRAY[]::text[])
  OR jsonb_typeof(hours->'enabled') IS DISTINCT FROM 'boolean' OR NOT saas.contact_widget_text_valid(hours->'timeZone',1,80)
  OR hours->>'timeZone' ~* '^(posix/|right/|posixrules$|Factory$|localtime$|SystemV/)' OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE lower(name)=lower(hours->>'timeZone')) OR jsonb_typeof(hours->'days') IS DISTINCT FROM 'array'
  OR NOT saas.contact_widget_text_valid(hours->'opensAt',5,5) OR NOT saas.contact_widget_text_valid(hours->'closesAt',5,5)
  OR hours->>'opensAt'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR hours->>'closesAt'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'
  OR jsonb_typeof(hours->'outsideBehavior') IS DISTINCT FROM 'string' OR hours->>'opensAt'=hours->>'closesAt' OR hours->>'outsideBehavior' NOT IN('message','hide') OR NOT saas.contact_widget_text_valid(hours->'outsideMessage',0,240)
 THEN RETURN false; END IF;
 IF jsonb_array_length(hours->'days')>7 OR (hours->'enabled'='true'::jsonb AND jsonb_array_length(hours->'days')=0)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(hours->'days') x WHERE jsonb_typeof(x) IS DISTINCT FROM 'number' OR x::text!~'^[0-6]$')
  OR (SELECT count(DISTINCT x) FROM jsonb_array_elements(hours->'days') x)<>jsonb_array_length(hours->'days') THEN RETURN false; END IF;
 FOR channel IN SELECT x FROM jsonb_array_elements(p_config->'channels') x LOOP
  IF NOT saas.catalog_onboarding_json_exact(channel,ARRAY['type','enabled','label','value'],ARRAY[]::text[])
   OR jsonb_typeof(channel->'enabled') IS DISTINCT FROM 'boolean' OR NOT saas.contact_widget_text_valid(channel->'label',1,40)
   OR NOT saas.contact_widget_text_valid(channel->'value',0,320) OR jsonb_typeof(channel->'type') IS DISTINCT FROM 'string' OR channel->>'type' NOT IN('whatsapp','phone','sms','email','instagram','telegram','messenger','maps','contact_page') THEN RETURN false; END IF;
  value:=channel->>'value';kind:=channel->>'type';
  IF channel->'enabled'='true'::jsonb AND value='' THEN RETURN false; END IF;
  IF value<>'' AND (CASE
   WHEN kind IN('whatsapp','phone','sms') THEN value!~'^\+[1-9][0-9]{6,14}$'
   WHEN kind='email' THEN char_length(value)>254 OR char_length(split_part(value,'@',1))>64 OR value!~$regex$^[A-Za-z0-9!#$%&'*+/=^_`{|}~-]+([.][A-Za-z0-9!#$%&'*+/=^_`{|}~-]+)*@[a-z0-9]([a-z0-9-]*[a-z0-9])?([.][a-z0-9]([a-z0-9-]*[a-z0-9])?)+$$regex$
   WHEN kind='instagram' THEN value!~'^[A-Za-z0-9_][A-Za-z0-9_.]{0,29}$' OR value LIKE '%..%' OR right(value,1)='.'
   WHEN kind='telegram' THEN value!~'^[A-Za-z][A-Za-z0-9_]{4,31}$'
   WHEN kind='messenger' THEN value!~'^[A-Za-z0-9][A-Za-z0-9.]{0,49}$'
   WHEN kind='maps' THEN char_length(value)<3 OR value~'^[A-Za-z0-9_]+:' OR value LIKE '//%'
   WHEN kind='contact_page' THEN value!~'^/pages/[a-z0-9]+(-[a-z0-9]+)*$' OR char_length(value)>107
   ELSE true END) THEN RETURN false; END IF;
 END LOOP;
 IF (SELECT count(DISTINCT x->>'type') FROM jsonb_array_elements(p_config->'channels') x)<>jsonb_array_length(p_config->'channels') THEN RETURN false; END IF;
 RETURN p_config->'enabled'='false'::jsonb OR (
  (p_config->'devices'->'desktop'='true'::jsonb OR p_config->'devices'->'mobile'='true'::jsonb) AND jsonb_array_length(p_config->'pages')>0
  AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'channels') x WHERE x->'enabled'='true'::jsonb AND x->>'value'<>''));
END $f$;

CREATE FUNCTION saas.contact_widget_page_exists(p_store_id uuid,p_value text)
RETURNS boolean LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.merchant_admin_records r
  CROSS JOIN LATERAL (SELECT saas.public_content_locale_config(p_store_id)->>'defaultLocale' value) language
  WHERE r.store_id=p_store_id AND r.record_kind='page' AND r.status='active' AND r.config->'published'='true'::jsonb
  AND r.config->>'slug'=substring(p_value FROM 8) AND coalesce(r.config->>'locale',language.value)=language.value)
$f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_required_action(p_kind text,p_mutation boolean)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_kind='contact_widget' THEN CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END ELSE saas.merchant_admin_required_action_before_contact_widget_204(p_kind,p_mutation) END
$f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE STRICT SET search_path=pg_catalog,saas AS $f$
BEGIN
 RETURN CASE WHEN p_kind='contact_widget' THEN saas.contact_widget_config_valid(p_config) ELSE saas.merchant_admin_config_valid_before_contact_widget_204(p_kind,p_config) END;
END $f$;

CREATE OR REPLACE FUNCTION saas.merchant_admin_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'contact_widget' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_before_contact_widget_204(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind); RETURN; END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(saas.merchant_admin_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind=p_kind AND r.status<>'archived'),'[]'::jsonb));
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_list_events(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'contact_widget' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_events_before_contact_widget_204(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind);RETURN;END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(saas.merchant_admin_event_projection(p_store_id,r.id) ORDER BY r.occurred_at DESC,r.id DESC) FROM (SELECT id,occurred_at FROM saas.merchant_admin_events WHERE store_id=p_store_id AND record_kind=p_kind ORDER BY occurred_at DESC,id DESC LIMIT 200) r),'[]'::jsonb));
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_get_record(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_record_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;payload jsonb;
BEGIN
 IF p_kind IS DISTINCT FROM 'contact_widget' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_get_record_before_contact_widget_204(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,p_record_id);RETURN;END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 SELECT saas.merchant_admin_projection(p_store_id,r.id) INTO payload FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind=p_kind AND r.status<>'archived';
 RETURN QUERY SELECT CASE WHEN payload IS NULL THEN 'record_not_found' ELSE 'found' END,payload;
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text,p_name text,p_config jsonb,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'contact_widget' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_contact_widget_204(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.contact_widget.store:'||p_store_id::text,204));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations o WHERE o.store_id=p_store_id AND o.operation_id=p_operation_id) THEN
  RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_contact_widget_204(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;
 END IF;
 IF p_record_id IS NULL OR p_operation_id IS NULL OR p_status IS DISTINCT FROM 'active' OR saas.contact_widget_config_valid(p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Reference locks exclude concurrent page archive until this save commits.
 PERFORM 1 FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind='page' AND r.status='active' AND r.config->'published'='true'::jsonb
  AND r.config->>'slug' IN(SELECT substring(x->>'value' FROM 8) FROM jsonb_array_elements(p_config->'channels') x WHERE x->>'type'='contact_page' AND x->'enabled'='true'::jsonb) ORDER BY r.id FOR SHARE;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_config->'channels') x WHERE x->>'type'='contact_page' AND x->'enabled'='true'::jsonb AND NOT saas.contact_widget_page_exists(p_store_id,x->>'value')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind=p_kind AND r.status<>'archived' AND r.id<>p_record_id) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_contact_widget_204(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);
END $f$;

CREATE FUNCTION saas.public_contact_widget_get(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE selected_store uuid;config jsonb;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 selected_store:=saas.store_policy_public_store(p_hostname,p_now);IF selected_store IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT r.config INTO config FROM saas.merchant_admin_records r WHERE r.store_id=selected_store AND r.record_kind='contact_widget' AND r.status='active' AND r.config->'enabled'='true'::jsonb;
 IF config IS NOT NULL AND (saas.contact_widget_config_valid(config) IS DISTINCT FROM true OR EXISTS(SELECT 1 FROM jsonb_array_elements(config->'channels') x WHERE x->>'type'='contact_page' AND x->'enabled'='true'::jsonb AND NOT saas.contact_widget_page_exists(selected_store,x->>'value'))) THEN config:=NULL;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('storeId',selected_store,'config',config);
END $f$;
REVOKE ALL ON FUNCTION saas.contact_widget_text_valid(jsonb,integer,integer),saas.contact_widget_config_valid(jsonb),saas.contact_widget_page_exists(uuid,text),saas.public_contact_widget_get(text,timestamptz) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.public_contact_widget_get(text,timestamptz) TO celebix_saas_host_resolver;
UPDATE saas.contact_widget_204_backup b SET migrated_definition=pg_get_functiondef(to_regprocedure(b.identity)) WHERE b.function_owner IS NOT NULL;
UPDATE saas.contact_widget_204_backup SET migrated_definition=(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.merchant_admin_records'::regclass AND conname='merchant_admin_records_record_kind_check') WHERE identity='constraint:merchant_admin_records_record_kind_check';
COMMIT;
