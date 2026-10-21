-- Independent WhatsApp requests and host-bound commerce policy. No tariff snapshots are modified.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DO $ready$
BEGIN
 IF to_regclass('saas.whatsapp_order_256_backup') IS NOT NULL
  OR to_regprocedure('saas.public_whatsapp_order_get(text,timestamptz)') IS NOT NULL
  OR to_regprocedure('saas.merchant_admin_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,jsonb,text)') IS NULL
  OR to_regprocedure('saas.merchant_admin_config_valid(text,jsonb)') IS NULL
  OR to_regprocedure('saas.store_policy_public_store(text,timestamptz)') IS NULL
  THEN RAISE EXCEPTION 'WHATSAPP_ORDER_256_PREDECESSOR_INVALID'; END IF;
END $ready$;

CREATE TABLE saas.whatsapp_order_256_backup(identity text PRIMARY KEY,definition text NOT NULL,migrated_definition text,function_owner oid,function_acl text);
ALTER TABLE saas.whatsapp_order_256_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.whatsapp_order_256_backup FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_order_backup_owner ON saas.whatsapp_order_256_backup TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON TABLE saas.whatsapp_order_256_backup FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;

-- Keep the original function OIDs, owners and ACLs; private predecessor copies
-- retain all current content-authoring, SKU, delivery and campaign behavior.
DO $backup$
DECLARE row record; original text; cloned text; clone_name text;
BEGIN
 FOR row IN SELECT p.oid,p.proname,p.proargtypes,p.proowner,p.proacl FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace
  AND p.proname IN('merchant_admin_required_action','merchant_admin_config_valid','merchant_admin_list','merchant_admin_list_events','merchant_admin_get_record','merchant_admin_save','merchant_admin_authority_error') LOOP
  original:=pg_get_functiondef(row.oid);clone_name:=row.proname||'_before_whatsapp_order_256';
  IF EXISTS(SELECT 1 FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname=clone_name) THEN RAISE EXCEPTION 'WHATSAPP_ORDER_256_PRIVATE_PREDECESSOR_EXISTS'; END IF;
  cloned:=replace(original,'CREATE OR REPLACE FUNCTION saas.'||row.proname||'(','CREATE FUNCTION saas.'||clone_name||'(');
  IF cloned=original THEN RAISE EXCEPTION 'WHATSAPP_ORDER_256_DEFINITION_ANCHOR_INVALID'; END IF;
  -- A combined release may inherit saas in search_path; keep identities portable
  -- so a later assertions or rollback connection resolves the same functions.
  INSERT INTO saas.whatsapp_order_256_backup VALUES(format('saas.%I(%s)',row.proname,oidvectortypes(row.proargtypes)),original,NULL,row.proowner,row.proacl::text);
  EXECUTE cloned;
  EXECUTE format('ALTER FUNCTION saas.%I(%s) OWNER TO %I',clone_name,pg_get_function_identity_arguments(row.oid),pg_get_userbyid(row.proowner));
  EXECUTE format('REVOKE ALL ON FUNCTION saas.%I(%s) FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',clone_name,pg_get_function_identity_arguments(row.oid));
 END LOOP;
 IF (SELECT count(*) FROM saas.whatsapp_order_256_backup)<>7 THEN RAISE EXCEPTION 'WHATSAPP_ORDER_256_PREDECESSOR_COUNT_INVALID'; END IF;
 SELECT pg_get_constraintdef(oid) INTO original FROM pg_constraint WHERE conrelid='saas.merchant_admin_records'::regclass AND conname='merchant_admin_records_record_kind_check';
 IF original IS NULL OR original NOT LIKE '%starter_theme_composition%' OR original LIKE '%whatsapp_order_setting%' THEN RAISE EXCEPTION 'WHATSAPP_ORDER_256_KIND_CONSTRAINT_INVALID'; END IF;
 INSERT INTO saas.whatsapp_order_256_backup VALUES('constraint:merchant_admin_records_record_kind_check',original,NULL,NULL,NULL);
 EXECUTE 'ALTER TABLE saas.merchant_admin_records DROP CONSTRAINT merchant_admin_records_record_kind_check';
 EXECUTE 'ALTER TABLE saas.merchant_admin_records ADD CONSTRAINT merchant_admin_records_record_kind_check CHECK(record_kind=''whatsapp_order_setting'' OR ('||substring(original FROM 8 FOR char_length(original)-8)||'))';
END $backup$;
CREATE UNIQUE INDEX merchant_admin_whatsapp_order_singleton_256 ON saas.merchant_admin_records(store_id) WHERE record_kind='whatsapp_order_setting' AND status<>'archived';


CREATE TABLE saas.whatsapp_order_release_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),readers_ready boolean NOT NULL DEFAULT false);
ALTER TABLE saas.whatsapp_order_release_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.whatsapp_order_release_state FORCE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_order_release_owner ON saas.whatsapp_order_release_state TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.whatsapp_order_release_state FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
INSERT INTO saas.whatsapp_order_release_state(singleton) VALUES(true);

CREATE FUNCTION saas.whatsapp_order_config_valid(p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT coalesce(saas.catalog_onboarding_json_exact(p_config,ARRAY['schemaVersion','enabled','phone','hidePrices','hideAddToCart','messageIntro'],ARRAY[]::text[])
 AND p_config->'schemaVersion'='1'::jsonb
 AND jsonb_typeof(p_config->'enabled')='boolean' AND jsonb_typeof(p_config->'hidePrices')='boolean' AND jsonb_typeof(p_config->'hideAddToCart')='boolean'
 AND jsonb_typeof(p_config->'phone')='string' AND ((p_config->'enabled'='false'::jsonb AND p_config->>'phone'='') OR p_config->>'phone'~'^\+[1-9][0-9]{6,14}$')
 AND saas.contact_widget_text_valid(p_config->'messageIntro',0,300)
 AND p_config->>'messageIntro'!~*'(https?:|www[.]|//)',false)
$f$;
-- Additive entitlement outside immutable plans, prices, limits and capability snapshots.
CREATE FUNCTION saas.whatsapp_order_plan_eligible(p_plan uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT EXISTS(SELECT 1 FROM saas.plans p JOIN saas.commercial_plan_policies c ON c.plan_id=p.id JOIN saas.platform_plan_prices price ON price.plan_id=p.id
 WHERE p.id=p_plan AND p.status='active' AND p.plan_code IN('starter','growth','professional') AND price.monthly_price_cents>0
 AND EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=p.id AND feature_key='catalog' AND enabled)
 AND EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=p.id AND feature_key='orders' AND enabled))
$f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_required_action(p_kind text,p_mutation boolean)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_kind='whatsapp_order_setting' THEN CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END ELSE saas.merchant_admin_required_action_before_whatsapp_order_256(p_kind,p_mutation) END
$f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE plpgsql VOLATILE STRICT SET search_path=pg_catalog,saas AS $f$
BEGIN
 RETURN CASE WHEN p_kind='whatsapp_order_setting' THEN saas.whatsapp_order_config_valid(p_config) ELSE saas.merchant_admin_config_valid_before_whatsapp_order_256(p_kind,p_config) END;
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_mutation boolean)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'whatsapp_order_setting' THEN RETURN saas.merchant_admin_authority_error_before_whatsapp_order_256(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,p_mutation); END IF;
 denied:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog',CASE WHEN p_mutation THEN 'configuration.manage' ELSE 'configuration.read' END);
 IF denied IS NOT NULL THEN RETURN denied; END IF;
 IF NOT saas.whatsapp_order_plan_eligible(p_plan_id) THEN RETURN 'feature_not_enabled'; END IF;
 RETURN NULL;
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_list(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'whatsapp_order_setting' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_before_whatsapp_order_256(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind); RETURN; END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(saas.merchant_admin_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC) FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind=p_kind AND r.status<>'archived'),'[]'::jsonb));
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_list_events(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'whatsapp_order_setting' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_list_events_before_whatsapp_order_256(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind);RETURN;END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'listed',jsonb_build_object('items',COALESCE((SELECT jsonb_agg(saas.merchant_admin_event_projection(p_store_id,r.id) ORDER BY r.occurred_at DESC,r.id DESC) FROM (SELECT id,occurred_at FROM saas.merchant_admin_events WHERE store_id=p_store_id AND record_kind=p_kind ORDER BY occurred_at DESC,id DESC LIMIT 200) r),'[]'::jsonb));
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_get_record(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_record_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;payload jsonb;
BEGIN
 IF p_kind IS DISTINCT FROM 'whatsapp_order_setting' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_get_record_before_whatsapp_order_256(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,p_record_id);RETURN;END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,false);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 SELECT saas.merchant_admin_projection(p_store_id,r.id) INTO payload FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.id=p_record_id AND r.record_kind=p_kind AND r.status<>'archived';
 RETURN QUERY SELECT CASE WHEN payload IS NULL THEN 'record_not_found' ELSE 'found' END,payload;
END $f$;
CREATE OR REPLACE FUNCTION saas.merchant_admin_save(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_record_id uuid,p_expected_version bigint,p_kind text,p_name text,p_config jsonb,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE denied text;
BEGIN
 IF p_kind IS DISTINCT FROM 'whatsapp_order_setting' THEN RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_whatsapp_order_256(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;END IF;
 denied:=saas.merchant_admin_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_kind,true);IF denied IS NOT NULL THEN RETURN QUERY SELECT denied,NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.whatsapp_order_setting.store:'||p_store_id::text,256));
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_operations o WHERE o.store_id=p_store_id AND o.operation_id=p_operation_id) THEN
  RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_whatsapp_order_256(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);RETURN;
 END IF;
 IF p_record_id IS NULL OR p_operation_id IS NULL OR p_status IS DISTINCT FROM 'active' OR saas.whatsapp_order_config_valid(p_config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_config->'enabled'='true'::jsonb AND NOT coalesce((SELECT readers_ready FROM saas.whatsapp_order_release_state WHERE singleton),false) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
 IF EXISTS(SELECT 1 FROM saas.merchant_admin_records r WHERE r.store_id=p_store_id AND r.record_kind=p_kind AND r.status<>'archived' AND r.id<>p_record_id) THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT * FROM saas.merchant_admin_save_before_whatsapp_order_256(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_record_id,p_expected_version,p_kind,p_name,p_config,p_status);
END $f$;

CREATE FUNCTION saas.public_whatsapp_order_get(p_hostname text,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE st uuid;r saas.merchant_admin_records;total integer;
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.store_policy_public_store(p_hostname,p_now);IF st IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT count(*) INTO total FROM saas.merchant_admin_records WHERE store_id=st AND record_kind='whatsapp_order_setting' AND status<>'archived';
 IF total=0 THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF total<>1 THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 SELECT * INTO r FROM saas.merchant_admin_records WHERE store_id=st AND record_kind='whatsapp_order_setting' AND status<>'archived';
 IF r.status<>'active' OR saas.whatsapp_order_config_valid(r.config) IS DISTINCT FROM true THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('storeId',st,'version',r.version,'config',r.config);
END $f$;
DO $privileges$
DECLARE row record;
BEGIN
 FOR row IN SELECT oid::regprocedure identity FROM pg_proc WHERE pronamespace='saas'::regnamespace AND (proname LIKE 'whatsapp_order_%' OR proname='public_whatsapp_order_get') LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',row.identity);
 END LOOP;
END $privileges$;
GRANT EXECUTE ON FUNCTION saas.public_whatsapp_order_get(text,timestamptz) TO celebix_saas_host_resolver;
UPDATE saas.whatsapp_order_256_backup b SET migrated_definition=pg_get_functiondef(to_regprocedure(b.identity)) WHERE b.function_owner IS NOT NULL;
UPDATE saas.whatsapp_order_256_backup SET migrated_definition=(SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.merchant_admin_records'::regclass AND conname='merchant_admin_records_record_kind_check') WHERE identity='constraint:merchant_admin_records_record_kind_check';
COMMIT;
