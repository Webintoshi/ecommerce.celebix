-- Reviewed package revision248. Stage with activation disabled; deploy readers before switching.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.commercial.release248',0));
DO $predecessor$BEGIN
 IF to_regclass('saas.cart_empty_247_backup') IS NULL OR encode(sha256(convert_to(pg_get_functiondef('saas.sync_durable_abandoned_cart(uuid,uuid,timestamptz)'::regprocedure),'UTF8')),'hex')<>'42e013dd90e0825199dfa8481ed98a85f033d677a9f5512059722174da0ca2bc' THEN RAISE EXCEPTION 'COMMERCIAL248_REQUIRES_REVIEWED247';END IF;
 IF(SELECT count(*)FROM saas.plans p JOIN saas.platform_plan_prices prices ON prices.plan_id=p.id JOIN saas.commercial_plan_policies policy ON policy.plan_id=p.id WHERE p.id=ANY(ARRAY['00000000-0000-4000-8000-000000000003'::uuid,'00000000-0000-4000-8000-000000000004'::uuid,'00000000-0000-4000-8000-000000000005'::uuid,'00000000-0000-4000-8000-000000000006'::uuid])AND p.status='active'AND(SELECT count(*)FROM saas.plan_features WHERE plan_id=p.id)=13 AND(SELECT count(*)FROM saas.plan_limits WHERE plan_id=p.id)=5)<>4 THEN RAISE EXCEPTION 'COMMERCIAL248_REQUIRES_REVIEWED246';END IF;
END $predecessor$;
CREATE TABLE saas.commercial248_release_state(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),enabled boolean NOT NULL DEFAULT false);
INSERT INTO saas.commercial248_release_state(singleton)VALUES(true);
CREATE TABLE saas.commercial248_original_functions(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text NOT NULL,function_oid oid NOT NULL,function_owner oid NOT NULL,function_acl aclitem[],function_config text[],function_security boolean NOT NULL,function_volatility char NOT NULL,function_strict boolean NOT NULL,function_parallel char NOT NULL);
DO $private$DECLARE t text;r record;BEGIN
 FOREACH t IN ARRAY ARRAY['commercial248_release_state','commercial248_original_functions'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY commercial248_owner ON saas.%I TO celebix_saas_owner USING(true) WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC',t);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON saas.%I FROM %I',t,r.rolname);END LOOP;
 END LOOP;
END $private$;
INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)VALUES('00000000-0000-4000-8000-000000000007','free_starter',3,'active',clock_timestamp(),clock_timestamp(),clock_timestamp());
INSERT INTO saas.platform_plan_publications VALUES('00000000-0000-4000-8000-000000000007',txid_current());
INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)SELECT '00000000-0000-4000-8000-000000000007',feature_key,feature_ordinal,enabled FROM saas.plan_features WHERE plan_id='00000000-0000-4000-8000-000000000003';
INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value)SELECT '00000000-0000-4000-8000-000000000007',limit_key,limit_ordinal,CASE WHEN 'free_starter'='free_starter' AND limit_key='products' THEN 25 ELSE limit_value END FROM saas.plan_limits WHERE plan_id='00000000-0000-4000-8000-000000000003';
DELETE FROM saas.platform_plan_publications WHERE plan_id='00000000-0000-4000-8000-000000000007';
INSERT INTO saas.platform_plan_prices VALUES('00000000-0000-4000-8000-000000000007',0,0);
INSERT INTO saas.commercial_plan_policies(plan_id,capabilities,variant_limit,seats_include_owner)SELECT '00000000-0000-4000-8000-000000000007',CASE WHEN 'free_starter' IN('starter','growth') THEN array_remove(capabilities,'manual_orders') ELSE capabilities END,variant_limit,seats_include_owner FROM saas.commercial_plan_policies WHERE plan_id='00000000-0000-4000-8000-000000000003';
INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)VALUES('00000000-0000-4000-8000-000000000008','starter',2,'active',clock_timestamp(),clock_timestamp(),clock_timestamp());
INSERT INTO saas.platform_plan_publications VALUES('00000000-0000-4000-8000-000000000008',txid_current());
INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)SELECT '00000000-0000-4000-8000-000000000008',feature_key,feature_ordinal,enabled FROM saas.plan_features WHERE plan_id='00000000-0000-4000-8000-000000000004';
INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value)SELECT '00000000-0000-4000-8000-000000000008',limit_key,limit_ordinal,CASE WHEN 'starter'='free_starter' AND limit_key='products' THEN 25 ELSE limit_value END FROM saas.plan_limits WHERE plan_id='00000000-0000-4000-8000-000000000004';
DELETE FROM saas.platform_plan_publications WHERE plan_id='00000000-0000-4000-8000-000000000008';
INSERT INTO saas.platform_plan_prices VALUES('00000000-0000-4000-8000-000000000008',258700,2587000);
INSERT INTO saas.commercial_plan_policies(plan_id,capabilities,variant_limit,seats_include_owner)SELECT '00000000-0000-4000-8000-000000000008',CASE WHEN 'starter' IN('starter','growth') THEN array_remove(capabilities,'manual_orders') ELSE capabilities END,variant_limit,seats_include_owner FROM saas.commercial_plan_policies WHERE plan_id='00000000-0000-4000-8000-000000000004';
INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)VALUES('00000000-0000-4000-8000-000000000009','growth',2,'active',clock_timestamp(),clock_timestamp(),clock_timestamp());
INSERT INTO saas.platform_plan_publications VALUES('00000000-0000-4000-8000-000000000009',txid_current());
INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)SELECT '00000000-0000-4000-8000-000000000009',feature_key,feature_ordinal,enabled FROM saas.plan_features WHERE plan_id='00000000-0000-4000-8000-000000000005';
INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value)SELECT '00000000-0000-4000-8000-000000000009',limit_key,limit_ordinal,CASE WHEN 'growth'='free_starter' AND limit_key='products' THEN 25 ELSE limit_value END FROM saas.plan_limits WHERE plan_id='00000000-0000-4000-8000-000000000005';
DELETE FROM saas.platform_plan_publications WHERE plan_id='00000000-0000-4000-8000-000000000009';
INSERT INTO saas.platform_plan_prices VALUES('00000000-0000-4000-8000-000000000009',453700,4537000);
INSERT INTO saas.commercial_plan_policies(plan_id,capabilities,variant_limit,seats_include_owner)SELECT '00000000-0000-4000-8000-000000000009',CASE WHEN 'growth' IN('starter','growth') THEN array_remove(capabilities,'manual_orders') ELSE capabilities END,variant_limit,seats_include_owner FROM saas.commercial_plan_policies WHERE plan_id='00000000-0000-4000-8000-000000000005';
INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)VALUES('00000000-0000-4000-8000-000000000010','professional',2,'active',clock_timestamp(),clock_timestamp(),clock_timestamp());
INSERT INTO saas.platform_plan_publications VALUES('00000000-0000-4000-8000-000000000010',txid_current());
INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled)SELECT '00000000-0000-4000-8000-000000000010',feature_key,feature_ordinal,enabled FROM saas.plan_features WHERE plan_id='00000000-0000-4000-8000-000000000006';
INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value)SELECT '00000000-0000-4000-8000-000000000010',limit_key,limit_ordinal,CASE WHEN 'professional'='free_starter' AND limit_key='products' THEN 25 ELSE limit_value END FROM saas.plan_limits WHERE plan_id='00000000-0000-4000-8000-000000000006';
DELETE FROM saas.platform_plan_publications WHERE plan_id='00000000-0000-4000-8000-000000000010';
INSERT INTO saas.platform_plan_prices VALUES('00000000-0000-4000-8000-000000000010',778700,7787000);
INSERT INTO saas.commercial_plan_policies(plan_id,capabilities,variant_limit,seats_include_owner)SELECT '00000000-0000-4000-8000-000000000010',CASE WHEN 'professional' IN('starter','growth') THEN array_remove(capabilities,'manual_orders') ELSE capabilities END,variant_limit,seats_include_owner FROM saas.commercial_plan_policies WHERE plan_id='00000000-0000-4000-8000-000000000006';
CREATE FUNCTION saas.commercial248_plan_selectable(p_plan uuid)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ SELECT CASE WHEN enabled THEN p_plan=ANY(ARRAY['00000000-0000-4000-8000-000000000007'::uuid,'00000000-0000-4000-8000-000000000008'::uuid,'00000000-0000-4000-8000-000000000009'::uuid,'00000000-0000-4000-8000-000000000010'::uuid]) ELSE NOT(p_plan=ANY(ARRAY['00000000-0000-4000-8000-000000000007'::uuid,'00000000-0000-4000-8000-000000000008'::uuid,'00000000-0000-4000-8000-000000000009'::uuid,'00000000-0000-4000-8000-000000000010'::uuid])) END FROM saas.commercial248_release_state WHERE singleton $f$;
CREATE FUNCTION saas.commercial248_receipt_in_store_authority_error(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_location uuid DEFAULT NULL::uuid, p_owner_only boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE actor_role text;
BEGIN
 IF p_store IS NULL OR p_principal IS NULL OR p_member IS NULL OR p_plan IS NULL OR p_code IS NULL OR p_version IS NULL OR p_now IS NULL OR NOT isfinite(p_now) THEN RETURN 'unauthenticated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=p_store AND status='active' AND currency='TRY') THEN RETURN 'store_inactive'; END IF;
 SELECT role INTO actor_role FROM saas.platform_authorized_memberships WHERE id=p_member AND store_id=p_store AND principal_id=p_principal AND status='active';
 IF actor_role IS NULL OR actor_role NOT IN('store_owner','admin','cashier') OR (p_owner_only AND actor_role='cashier') THEN RETURN 'membership_denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version WHERE s.store_id=p_store AND s.plan_id=p_plan AND s.plan_code=p_code AND s.plan_version=p_version AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now) AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)) THEN RETURN 'unauthenticated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=p_plan AND enabled AND feature_key='orders') THEN RETURN 'feature_not_enabled'; END IF;
 IF p_location IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.inventory_locations WHERE store_id=p_store AND id=p_location AND status='active') THEN RETURN 'inventory_conflict'; END IF;
 IF actor_role='cashier' AND NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled AND cardinality(location_ids)>0 AND (p_location IS NULL OR p_location=ANY(location_ids))) THEN RETURN 'membership_denied'; END IF;
 RETURN NULL;
END $function$
;
CREATE FUNCTION saas.commercial248_receipt_quick_link_merchant_authority_error(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_required_action text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE
  mapped_action text;
  authority_error text;
BEGIN
  IF p_store_id IS NULL
     OR p_principal_id IS NULL
     OR p_membership_id IS NULL
     OR p_plan_id IS NULL
     OR p_plan_code IS NULL
     OR p_plan_version IS NULL
     OR p_now IS NULL
     OR p_required_action IS NULL
     OR p_required_action NOT IN ('quick_links.read','quick_links.manage') THEN
    RETURN 'durable_authority_invalid';
  END IF;

  mapped_action := CASE p_required_action
    WHEN 'quick_links.read' THEN 'orders.read'
    WHEN 'quick_links.manage' THEN 'orders.manage'
  END;

  authority_error := saas.merchant_action_authority_error(
    p_store_id,
    p_principal_id,
    p_membership_id,
    p_plan_id,
    p_plan_code,
    p_plan_version,
    p_now,
    'orders',
    mapped_action
  );
  IF authority_error IS NOT NULL THEN
    RETURN authority_error;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT feature.feature_key
      FROM saas.plan_features AS feature
      WHERE feature.plan_id = p_plan_id
        AND feature.enabled
      ORDER BY feature.feature_ordinal
    ) AS enabled_feature
    WHERE enabled_feature.feature_key = 'checkout'
  ) THEN
    RETURN 'feature_not_enabled';
  END IF;

  RETURN NULL;
END
$function$
;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.commercial_default_starter_version()
 RETURNS bigint
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$ SELECT CASE WHEN assignments_enabled THEN CASE WHEN(SELECT enabled FROM saas.commercial248_release_state WHERE singleton)THEN 3::bigint ELSE 2::bigint END ELSE 1::bigint END FROM saas.commercial_package_release_state WHERE singleton $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.commercial_default_starter_version()'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'811afd6e28e0d9e1dd9e9e96237ef90ac2314526c6cd80983cd3257918a127ef' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_bootstrap=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.commercial_default_starter_version()';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'915e8bd7f323eccddd2404676d379b42bea34adacc496ac9b5ba631897308c84' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.commercial_default_starter_version()',f.definition,'811afd6e28e0d9e1dd9e9e96237ef90ac2314526c6cd80983cd3257918a127ef','915e8bd7f323eccddd2404676d379b42bea34adacc496ac9b5ba631897308c84',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='915e8bd7f323eccddd2404676d379b42bea34adacc496ac9b5ba631897308c84' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.commercial_default_starter_version()';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.commercial_plan_has_capability(p_plan uuid, p_capability text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
 SELECT CASE WHEN p_capability IS NULL OR NOT(p_capability=ANY(ARRAY['manual_orders','coupons','growth_tools','email_marketing','advanced_analytics','google_connections','google_merchant','seo_tools','cashier','accounting','reference_pricing','ai','custom_domains','staff_management'])) THEN false
 WHEN EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=p_plan) THEN EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=p_plan AND p_capability=ANY(capabilities))
 ELSE p_plan=ANY(ARRAY['00000000-0000-4000-8000-000000000001'::uuid,'00000000-0000-4000-8000-000000000002'::uuid]) AND EXISTS(SELECT 1 FROM saas.plans WHERE id=p_plan) END
$function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.commercial_plan_has_capability(uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'548dd276be5a39ce4237fb0ca14f26c2cd715f40fa135930b43fb036e802fd5e' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.commercial_plan_has_capability(uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'870f9d8fa3057ee61696165b131ac7b17a047776128a503b11d2a9e3fea8d27b' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.commercial_plan_has_capability(uuid,text)',f.definition,'548dd276be5a39ce4237fb0ca14f26c2cd715f40fa135930b43fb036e802fd5e','870f9d8fa3057ee61696165b131ac7b17a047776128a503b11d2a9e3fea8d27b',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='870f9d8fa3057ee61696165b131ac7b17a047776128a503b11d2a9e3fea8d27b' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.commercial_plan_has_capability(uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_authority_error(p_store uuid, p_principal uuid, p_member uuid, p_plan uuid, p_code text, p_version bigint, p_now timestamp with time zone, p_location uuid DEFAULT NULL::uuid, p_owner_only boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE actor_role text;
BEGIN
 IF p_store IS NULL OR p_principal IS NULL OR p_member IS NULL OR p_plan IS NULL OR p_code IS NULL OR p_version IS NULL OR p_now IS NULL OR NOT isfinite(p_now) THEN RETURN 'unauthenticated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=p_store AND status='active' AND currency='TRY') THEN RETURN 'store_inactive'; END IF;
 SELECT role INTO actor_role FROM saas.platform_authorized_memberships WHERE id=p_member AND store_id=p_store AND principal_id=p_principal AND status='active';
 IF actor_role IS NULL OR actor_role NOT IN('store_owner','admin','cashier') OR (p_owner_only AND actor_role='cashier') THEN RETURN 'membership_denied'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version WHERE s.store_id=p_store AND s.plan_id=p_plan AND s.plan_code=p_code AND s.plan_version=p_version AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now) AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)) THEN RETURN 'unauthenticated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=p_plan AND enabled AND feature_key='orders') THEN RETURN 'feature_not_enabled'; END IF;
 IF NOT saas.commercial_plan_has_capability(p_plan,'manual_orders') OR(actor_role='cashier' AND NOT saas.commercial_plan_has_capability(p_plan,'cashier')) THEN RETURN 'feature_not_enabled';END IF;
 IF p_location IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.inventory_locations WHERE store_id=p_store AND id=p_location AND status='active') THEN RETURN 'inventory_conflict'; END IF;
 IF actor_role='cashier' AND NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled AND cardinality(location_ids)>0 AND (p_location IS NULL OR p_location=ANY(location_ids))) THEN RETURN 'membership_denied'; END IF;
 RETURN NULL;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,boolean)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'6c45b12c0d79018d94230f27ed8c31e1d5e7fffe086bf4c3c53e9acdacfe5bce' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,boolean)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'9570f4eaca3ee2c80063bee0ad4967a036f5b09a07f71c25ddb030c6077a19fa' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,boolean)',f.definition,'6c45b12c0d79018d94230f27ed8c31e1d5e7fffe086bf4c3c53e9acdacfe5bce','9570f4eaca3ee2c80063bee0ad4967a036f5b09a07f71c25ddb030c6077a19fa',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='9570f4eaca3ee2c80063bee0ad4967a036f5b09a07f71c25ddb030c6077a19fa' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,boolean)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.quick_link_merchant_authority_error(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_required_action text)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE
  mapped_action text;
  authority_error text;
BEGIN
  IF p_store_id IS NULL
     OR p_principal_id IS NULL
     OR p_membership_id IS NULL
     OR p_plan_id IS NULL
     OR p_plan_code IS NULL
     OR p_plan_version IS NULL
     OR p_now IS NULL
     OR p_required_action IS NULL
     OR p_required_action NOT IN ('quick_links.read','quick_links.manage') THEN
    RETURN 'durable_authority_invalid';
  END IF;

  mapped_action := CASE p_required_action
    WHEN 'quick_links.read' THEN 'orders.read'
    WHEN 'quick_links.manage' THEN 'orders.manage'
  END;

  authority_error := saas.merchant_action_authority_error(
    p_store_id,
    p_principal_id,
    p_membership_id,
    p_plan_id,
    p_plan_code,
    p_plan_version,
    p_now,
    'orders',
    mapped_action
  );
  IF authority_error IS NOT NULL THEN
    RETURN authority_error;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM (
      SELECT feature.feature_key
      FROM saas.plan_features AS feature
      WHERE feature.plan_id = p_plan_id
        AND feature.enabled
      ORDER BY feature.feature_ordinal
    ) AS enabled_feature
    WHERE enabled_feature.feature_key = 'checkout'
  ) THEN
    RETURN 'feature_not_enabled';
  END IF;

  IF NOT saas.commercial_plan_has_capability(p_plan_id,'manual_orders') THEN RETURN 'feature_not_enabled';END IF;
  RETURN NULL;
END
$function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.quick_link_merchant_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'1a935fb3322b392fed969c8f415b559b638bf6927003aa3069b21b899e42dc2b' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.quick_link_merchant_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'c013b010032503c9e707988588a30b169ba1956cb3f4c5a22428901e4e3d3540' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.quick_link_merchant_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)',f.definition,'1a935fb3322b392fed969c8f415b559b638bf6927003aa3069b21b899e42dc2b','c013b010032503c9e707988588a30b169ba1956cb3f4c5a22428901e4e3d3540',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='c013b010032503c9e707988588a30b169ba1956cb3f4c5a22428901e4e3d3540' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.quick_link_merchant_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.order_drafts_list(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_page_size integer, p_cursor_updated_at timestamp with time zone, p_cursor_id uuid)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; page_items jsonb; has_more boolean; last_updated_at timestamptz; last_id uuid;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF (true) AND NOT saas.commercial_plan_has_capability(p_plan_id,'manual_orders') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 OR (p_cursor_updated_at IS NULL)<>(p_cursor_id IS NULL) OR (p_cursor_updated_at IS NOT NULL AND NOT pg_catalog.isfinite(p_cursor_updated_at)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  WITH candidates AS (
    SELECT draft.id,draft.updated_at,pg_catalog.row_number() OVER(ORDER BY draft.updated_at DESC,draft.id DESC) AS page_position
    FROM saas.order_drafts AS draft
    WHERE draft.store_id=p_store_id AND (p_cursor_updated_at IS NULL OR (draft.updated_at,draft.id)<(p_cursor_updated_at,p_cursor_id))
    ORDER BY draft.updated_at DESC,draft.id DESC LIMIT p_page_size+1
  ), page AS (SELECT * FROM candidates WHERE page_position<=p_page_size)
  SELECT COALESCE(pg_catalog.jsonb_agg(saas.order_drafts_list_projection(p_store_id,page.id) ORDER BY page.page_position),'[]'::jsonb),
    (SELECT pg_catalog.count(*)>p_page_size FROM candidates),
    (SELECT tail.updated_at FROM page AS tail WHERE tail.page_position=p_page_size),
    (SELECT tail.id FROM page AS tail WHERE tail.page_position=p_page_size)
  INTO page_items,has_more,last_updated_at,last_id FROM page;
  result_payload:=pg_catalog.jsonb_build_object('items',page_items);
  IF has_more THEN result_payload:=result_payload||pg_catalog.jsonb_build_object('nextCursor',pg_catalog.jsonb_build_object('updatedAt',saas.orders_cursor_timestamp(last_updated_at),'id',last_id)); END IF;
  RETURN QUERY SELECT 'listed',result_payload;
END
$function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'5ae5fcb48aa2ed1d307b02915690a388e3bcba7dfaefe0928db327aecc3009c7' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'b07aadd0e4278fbdc5b115269005b5f3e4b7f0f782a435483ad48a1297966676' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)',f.definition,'5ae5fcb48aa2ed1d307b02915690a388e3bcba7dfaefe0928db327aecc3009c7','b07aadd0e4278fbdc5b115269005b5f3e4b7f0f782a435483ad48a1297966676',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='b07aadd0e4278fbdc5b115269005b5f3e4b7f0f782a435483ad48a1297966676' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.order_drafts_get(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_draft_id uuid)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text; projection jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','orders.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF (true) AND NOT saas.commercial_plan_has_capability(p_plan_id,'manual_orders') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 
  IF p_draft_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  projection:=saas.order_drafts_detail_projection(p_store_id,p_draft_id);
  IF projection IS NULL THEN RETURN QUERY SELECT 'draft_not_found',NULL::jsonb; ELSE RETURN QUERY SELECT 'found',projection; END IF;
END
$function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'c27af01c3dc8c92dab93a55af2b0c7ff1a848cbd0bb8876f0a4e29cd59d217cf' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'2d082751e28fbfd057f6e3b3cc650d91af5ca73ca7f8d999d5d926a990d0e3af' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)',f.definition,'c27af01c3dc8c92dab93a55af2b0c7ff1a848cbd0bb8876f0a4e29cd59d217cf','2d082751e28fbfd057f6e3b3cc650d91af5ca73ca7f8d999d5d926a990d0e3af',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='2d082751e28fbfd057f6e3b3cc650d91af5ca73ca7f8d999d5d926a990d0e3af' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.abandoned_carts_list(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_status text, p_search text, p_sort text, p_page_size bigint, p_cursor_total_cents bigint, p_cursor_last_activity_at timestamp with time zone, p_cursor_id uuid)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE authority_error text;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'orders','carts.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF (true) AND NOT saas.commercial_plan_has_capability(p_plan_id,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 PERFORM saas.reconcile_durable_abandoned_carts(p_store_id,p_now);
  RETURN QUERY SELECT * FROM saas.abandoned_carts_list_without_durable_reconciliation_v101(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,
    p_status,p_search,p_sort,p_page_size,p_cursor_total_cents,p_cursor_last_activity_at,p_cursor_id
  );
END
$function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'7335ffd6f4cd7af1f367b243c1fb064f66c90f5403660b04a6038a0cc379984a' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'v' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'16cf9621967b1ce3dadec3eb4097fcb425fc58a05ffac6e9fca2ed98ef5c0c23' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)',f.definition,'7335ffd6f4cd7af1f367b243c1fb064f66c90f5403660b04a6038a0cc379984a','16cf9621967b1ce3dadec3eb4097fcb425fc58a05ffac6e9fca2ed98ef5c0c23',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='16cf9621967b1ce3dadec3eb4097fcb425fc58a05ffac6e9fca2ed98ef5c0c23' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.abandoned_carts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.customer_segments_list(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$ DECLARE e text; BEGIN e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'customers','customers.read'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF; IF (true) AND NOT saas.commercial_plan_has_capability(p_plan_id,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',g.id,'name',g.name,'description',g.description,'kind',g.segment_kind,'customerCount',(SELECT pg_catalog.count(*) FROM saas.customer_segment_memberships m WHERE m.store_id=g.store_id AND m.segment_id=g.id),'version',g.version)) ORDER BY g.name,g.id),'[]'::jsonb)) FROM saas.customer_segments g WHERE g.store_id=p_store_id AND g.archived_at IS NULL; END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.customer_segments_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'2bf1a067c117ff53fa9c2eb6cded6a4f825c088e6b186db1e64e3d8d71335d50' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.customer_segments_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'bea13e21b9430457613d6211492a9c2a2d0279fe5ff591566c12a1c66bad7cd0' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.customer_segments_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)',f.definition,'2bf1a067c117ff53fa9c2eb6cded6a4f825c088e6b186db1e64e3d8d71335d50','bea13e21b9430457613d6211492a9c2a2d0279fe5ff591566c12a1c66bad7cd0',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='bea13e21b9430457613d6211492a9c2a2d0279fe5ff591566c12a1c66bad7cd0' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.customer_segments_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.customer_taxonomy_upsert(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_kind text, p_id uuid, p_name text, p_secondary text, p_expected_version bigint)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$ DECLARE e text; current_version bigint; result jsonb; customer_anchor uuid; BEGIN PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'customer_taxonomy_upsert');
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'customers','customers.manage'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 IF p_kind NOT IN('tag','segment') OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.char_length(p_name) NOT BETWEEN 1 AND (CASE WHEN p_kind='tag' THEN 64 ELSE 100 END) OR saas.customer_text_has_control(p_name) OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT id INTO customer_anchor FROM saas.customers WHERE store_id=p_store_id ORDER BY id LIMIT 1; IF customer_anchor IS NULL THEN RETURN QUERY SELECT 'customer_not_found',NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM saas.customer_operations WHERE store_id=p_store_id AND operation_id=p_operation_id) THEN RETURN QUERY SELECT CASE WHEN o.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,CASE WHEN o.payload_fingerprint=p_fingerprint THEN o.result_payload ELSE NULL END FROM saas.customer_operations o WHERE o.store_id=p_store_id AND o.operation_id=p_operation_id; RETURN; END IF;
 IF (p_kind='segment') AND NOT saas.commercial_plan_has_capability(p_plan_id,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 IF p_kind='tag' THEN SELECT version INTO current_version FROM saas.customer_tags WHERE store_id=p_store_id AND id=p_id FOR UPDATE; IF FOUND THEN IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF; UPDATE saas.customer_tags SET name=p_name,color=p_secondary,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_id; ELSE IF p_expected_version IS NOT NULL OR p_secondary!~'^#[0-9a-f]{6}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; INSERT INTO saas.customer_tags VALUES(p_id,p_store_id,p_name,p_secondary,1,NULL,p_now,p_now); END IF; SELECT pg_catalog.jsonb_build_object('id',id,'name',name,'color',color,'customerCount',(SELECT pg_catalog.count(*) FROM saas.customer_tag_assignments a WHERE a.store_id=p_store_id AND a.tag_id=p_id),'version',version) INTO result FROM saas.customer_tags WHERE store_id=p_store_id AND id=p_id;
 ELSE SELECT version INTO current_version FROM saas.customer_segments WHERE store_id=p_store_id AND id=p_id FOR UPDATE; IF FOUND THEN IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF; UPDATE saas.customer_segments SET name=p_name,description=p_secondary,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_id; ELSE IF p_expected_version IS NOT NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; INSERT INTO saas.customer_segments VALUES(p_id,p_store_id,p_name,p_secondary,'manual',1,NULL,p_now,p_now); END IF; SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',id,'name',name,'description',description,'kind',segment_kind,'customerCount',(SELECT pg_catalog.count(*) FROM saas.customer_segment_memberships m WHERE m.store_id=p_store_id AND m.segment_id=p_id),'version',version)) INTO result FROM saas.customer_segments WHERE store_id=p_store_id AND id=p_id; END IF;
 INSERT INTO saas.customer_operations VALUES(p_operation_id,p_store_id,customer_anchor,CASE WHEN p_kind='tag' THEN 'upsert_tag' ELSE 'upsert_segment' END,p_fingerprint,result,p_now); RETURN QUERY SELECT 'committed',result;
EXCEPTION WHEN unique_violation OR check_violation THEN RETURN QUERY SELECT 'customer_conflict',NULL::jsonb;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.customer_taxonomy_upsert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,uuid,text,text,bigint)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'8be4eeca64432415531d7f0437834cce7dfdb11c6d73aee88b3cd588d04ced2d' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'v' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.customer_taxonomy_upsert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,uuid,text,text,bigint)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'812b26582b0275c2594c6537db7ceb182ea15071e16583eac68e65913a04328e' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.customer_taxonomy_upsert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,uuid,text,text,bigint)',f.definition,'8be4eeca64432415531d7f0437834cce7dfdb11c6d73aee88b3cd588d04ced2d','812b26582b0275c2594c6537db7ceb182ea15071e16583eac68e65913a04328e',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='812b26582b0275c2594c6537db7ceb182ea15071e16583eac68e65913a04328e' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.customer_taxonomy_upsert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text,uuid,text,text,bigint)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.customer_set_taxonomy(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_customer_id uuid, p_kind text, p_ids uuid[])
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE
  authority_error text;
  result jsonb;
BEGIN PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'customer_set_taxonomy');
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'customers','customers.manage'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;
  IF p_kind NOT IN('tag','segment')
    OR COALESCE(pg_catalog.array_length(p_ids,1),0)>50
    OR p_fingerprint!~'^[a-f0-9]{64}$'
  THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;
  IF EXISTS(
    SELECT 1 FROM saas.customer_operations
    WHERE store_id=p_store_id AND operation_id=p_operation_id
  ) THEN
    RETURN QUERY
      SELECT
        CASE WHEN operation.payload_fingerprint=p_fingerprint THEN 'operation_replayed' ELSE 'operation_mismatch' END,
        CASE WHEN operation.payload_fingerprint=p_fingerprint THEN operation.result_payload ELSE NULL END
      FROM saas.customer_operations AS operation
      WHERE operation.store_id=p_store_id AND operation.operation_id=p_operation_id;
    RETURN;
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM saas.customers
    WHERE store_id=p_store_id AND id=p_customer_id AND status='active'
  ) OR COALESCE(pg_catalog.array_length(p_ids,1),0)<>COALESCE((
    SELECT pg_catalog.count(DISTINCT id) FROM pg_catalog.unnest(p_ids) AS id
  ),0) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;
  IF (p_kind='segment') AND NOT saas.commercial_plan_has_capability(p_plan_id,'growth_tools') THEN RETURN QUERY SELECT 'feature_not_enabled'::text,NULL::jsonb;RETURN;END IF;
 IF p_kind='tag' THEN
    IF EXISTS(
      SELECT 1 FROM pg_catalog.unnest(p_ids) AS id
      WHERE NOT EXISTS(
        SELECT 1 FROM saas.customer_tags AS tag
        WHERE tag.store_id=p_store_id AND tag.id=id AND tag.archived_at IS NULL
      )
    ) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
    END IF;
    DELETE FROM saas.customer_tag_assignments
    WHERE store_id=p_store_id AND customer_id=p_customer_id;
    INSERT INTO saas.customer_tag_assignments
      SELECT p_store_id,p_customer_id,id,p_now FROM pg_catalog.unnest(p_ids) AS id;
  ELSE
    IF EXISTS(
      SELECT 1 FROM pg_catalog.unnest(p_ids) AS id
      WHERE NOT EXISTS(
        SELECT 1 FROM saas.customer_segments AS segment
        WHERE segment.store_id=p_store_id AND segment.id=id AND segment.archived_at IS NULL
      )
    ) THEN
      RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
      RETURN;
    END IF;
    DELETE FROM saas.customer_segment_memberships
    WHERE store_id=p_store_id AND customer_id=p_customer_id;
    INSERT INTO saas.customer_segment_memberships
      SELECT p_store_id,p_customer_id,id,p_now FROM pg_catalog.unnest(p_ids) AS id;
  END IF;
  UPDATE saas.customers
  SET version=version+1,updated_at=p_now
  WHERE store_id=p_store_id AND id=p_customer_id;
  result:=saas.customer_mutation_projection(p_store_id,p_customer_id);
  INSERT INTO saas.customer_operations
    VALUES(
      p_operation_id,p_store_id,p_customer_id,
      CASE WHEN p_kind='tag' THEN 'set_tags' ELSE 'set_segments' END,
      p_fingerprint,result,p_now
    );
  RETURN QUERY SELECT 'committed',result;
END
$function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,uuid[])'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'16ed7cac28562a93dfc47970ff111dfb76d08a99e9c43827daf6879964d188ae' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'v' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,uuid[])';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'7d7a5b103b12a1209d85597faf812cf6f4ec8fc27d9f3dd2d832dea10d0e7840' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,uuid[])',f.definition,'16ed7cac28562a93dfc47970ff111dfb76d08a99e9c43827daf6879964d188ae','7d7a5b103b12a1209d85597faf812cf6f4ec8fc27d9f3dd2d832dea10d0e7840',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='7d7a5b103b12a1209d85597faf812cf6f4ec8fc27d9f3dd2d832dea10d0e7840' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.customer_set_taxonomy(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,text,uuid[])';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.merchant_whatsapp_command(p_action text, p_input jsonb)
 RETURNS TABLE(outcome text, authority jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE n timestamptz:=clock_timestamp();required text[];optional text[]:='{}';k text;v jsonb;sid uuid;pid uuid;actor uuid;session_row saas.panel_sessions;phone saas.merchant_phone_identities;pending saas.merchant_phone_pending;challenge saas.merchant_phone_challenges;staff saas.merchant_phone_staff;prior saas.merchant_phone_operations;op uuid;mid uuid;ver bigint;plan uuid;budget record;result record;body jsonb;out text;is_central boolean;target uuid;destination text;
BEGIN
 required:=CASE p_action
 WHEN 'prepare' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','operationId','purpose','phoneKeyId','phoneDigest','phoneCiphertext','phoneMasked','destinationHostname','ipDigest','recipientBudgetDigest','challengeId','codeDigest']
 WHEN 'resend' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','operationId','challengeId','codeDigest','ipDigest','recipientBudgetDigest']
 WHEN 'read' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment']
 WHEN 'finish_delivery' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','challengeId','status']
 WHEN 'verify' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','challengeId','codeDigest','operationId','sessionId','familyId','tokenKeyId','tokenDigest','completionCiphertext']
 WHEN 'claim_signup' THEN ARRAY['pendingId','pendingDigest','browserDigest','environment','operationId','storeId','sessionId','familyId','tokenKeyId','tokenDigest','completionCiphertext']
 WHEN 'self_state' THEN ARRAY['actorTokenKeyId','actorTokenDigest']
 WHEN 'staff_list' THEN ARRAY['actorTokenKeyId','actorTokenDigest']
 WHEN 'staff_create' THEN ARRAY['actorTokenKeyId','actorTokenDigest','operationId','expectedVersion','phoneKeyId','phoneDigest','phoneCiphertext','phoneMasked','displayName','role']
 WHEN 'staff_delete' THEN ARRAY['actorTokenKeyId','actorTokenDigest','operationId','staffId','expectedVersion']
 WHEN 'staff_update' THEN ARRAY['actorTokenKeyId','actorTokenDigest','operationId','staffId','expectedVersion','displayName','role','enabled'] END;
 optional:=CASE p_action WHEN 'prepare' THEN ARRAY['actorTokenKeyId','actorTokenDigest'] WHEN 'read' THEN ARRAY['actorTokenKeyId','actorTokenDigest'] WHEN 'resend' THEN ARRAY['actorTokenKeyId','actorTokenDigest'] WHEN 'verify' THEN ARRAY['actorTokenKeyId','actorTokenDigest'] WHEN 'staff_create' THEN ARRAY['existingMembershipId'] ELSE '{}'::text[] END;
 IF required IS NULL OR p_input IS NULL OR jsonb_typeof(p_input)<>'object' OR NOT(p_input?&required) OR p_input-(required||optional)<>'{}' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOR k,v IN SELECT * FROM jsonb_each(p_input) LOOP
  IF k='expectedVersion' THEN IF jsonb_typeof(v)<>'number' OR v::text!~'^[0-9]{1,16}$' OR(v::text)::numeric>9007199254740990 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  ELSIF k='ipDigest' AND v='null'::jsonb THEN NULL;
  ELSIF k='enabled' THEN IF jsonb_typeof(v)<>'boolean' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  ELSE
   IF jsonb_typeof(v)<>'string' OR length(p_input->>k)<1 OR p_input->>k<>btrim(p_input->>k) OR p_input->>k~'[[:cntrl:]]' OR length(p_input->>k)>(CASE k WHEN 'completionCiphertext' THEN 32768 WHEN 'phoneCiphertext' THEN 4096 WHEN 'displayName' THEN 100 ELSE 512 END)
    OR(k LIKE '%Digest' AND p_input->>k!~'^[a-f0-9]{64}$')
    OR(k=ANY(ARRAY['pendingId','operationId','challengeId','sessionId','familyId','staffId','storeId','existingMembershipId']) AND p_input->>k!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$')
    OR(k LIKE '%KeyId' AND p_input->>k!~'^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$')
    OR(k='role' AND p_input->>k NOT IN('admin','editor','analyst','cashier'))
    OR(k='purpose' AND p_input->>k NOT IN('login','bind_phone','signup'))
    OR(k='status' AND p_input->>k NOT IN('accepted','failed','ambiguous'))
    OR(k='environment' AND p_input->>k!~'^[A-Za-z0-9_-]{1,64}$')
    OR(k='destinationHostname' AND (length(p_input->>k)>253 OR p_input->>k!~'^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$'))
   THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  END IF;
 END LOOP;
 IF(p_input?'actorTokenKeyId')<>(p_input?'actorTokenDigest') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM saas.merchant_whatsapp_cleanup();
 op:=(p_input->>'operationId')::uuid;
 IF p_action='prepare' AND((p_input->>'purpose'='bind_phone') IS DISTINCT FROM(p_input?&ARRAY['actorTokenKeyId','actorTokenDigest']) OR(p_input->>'purpose'<>'bind_phone' AND(p_input?'actorTokenKeyId' OR p_input?'actorTokenDigest'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Private actor authority is always resolved from the credential, never request IDs.
 IF p_action='self_state' OR p_action LIKE 'staff_%' OR(p_action='prepare' AND p_input->>'purpose'='bind_phone') THEN
  SELECT * INTO session_row FROM saas.panel_sessions WHERE token_key_id=p_input->>'actorTokenKeyId' AND token_digest=p_input->>'actorTokenDigest' AND revoked_at IS NULL AND expires_at>n AND issued_at<=n FOR SHARE;
  IF NOT FOUND OR NOT saas.admin_login_session_allowed(session_row.token_key_id,session_row.token_digest) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  actor:=session_row.principal_id;sid:=session_row.active_store_id;
  IF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE principal_id=actor AND store_id=sid AND status='active' AND support_session_id IS NULL AND(p_action NOT LIKE 'staff_%' OR role='store_owner')) THEN RETURN QUERY SELECT 'owner_required',NULL::jsonb;RETURN;END IF;
 END IF;
 IF p_action='self_state' THEN RETURN QUERY SELECT 'listed',jsonb_build_object('phoneMasked',(SELECT phone_masked FROM saas.merchant_phone_identities WHERE principal_id=actor AND disabled_at IS NULL),'phoneVerified',EXISTS(SELECT 1 FROM saas.merchant_phone_identities WHERE principal_id=actor AND verified_at IS NOT NULL AND disabled_at IS NULL));RETURN;END IF;
 IF p_action LIKE 'staff_%' THEN
  IF p_action='staff_list' AND NOT saas.commercial_plan_has_capability(saas.commercial_current_plan(sid),'staff_management') THEN RETURN QUERY SELECT 'disabled'::text,NULL::jsonb;RETURN;END IF;
  IF p_action='staff_list' THEN RETURN QUERY SELECT 'listed',saas.merchant_phone_staff_projection(sid);RETURN;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('merchant.operation:'||op,0));
  IF p_action='staff_create' THEN PERFORM pg_advisory_xact_lock(hashtextextended('merchant.phone:'||(p_input->>'phoneKeyId')||':'||(p_input->>'phoneDigest'),0));END IF;
  INSERT INTO saas.platform_store_versions(store_id) VALUES(sid) ON CONFLICT DO NOTHING;
  PERFORM 1 FROM saas.platform_store_versions WHERE store_id=sid FOR UPDATE;
  PERFORM pg_advisory_xact_lock(hashtextextended('merchant.staff:'||sid,0));
  PERFORM 1 FROM saas.memberships WHERE principal_id=actor AND store_id=sid AND status='active' AND role='store_owner' AND support_session_id IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'owner_required',NULL::jsonb;RETURN;END IF;
  SELECT * INTO prior FROM saas.merchant_phone_operations WHERE operation_id=op;
  IF FOUND THEN IF prior.actor_id<>actor OR prior.store_id<>sid OR prior.action<>p_action OR prior.input<>p_input THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',CASE WHEN p_action='staff_delete' THEN prior.authority-'deletedStaff' ELSE prior.authority END;END IF;RETURN;END IF;
  SELECT s.plan_id INTO plan FROM saas.subscriptions s WHERE s.store_id=sid AND s.status='active' AND s.valid_from<=n AND(s.valid_until IS NULL OR s.valid_until>n) FOR SHARE;
  IF plan IS NULL OR NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan AND feature_key='staff_management' AND enabled) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF p_action IN('staff_create','staff_update') AND p_input->>'role'='cashier' AND coalesce((p_input->>'enabled')::boolean,true) AND NOT saas.commercial_plan_has_capability(plan,'cashier') THEN RETURN QUERY SELECT 'disabled'::text,NULL::jsonb;RETURN;END IF;
  INSERT INTO saas.merchant_phone_staff_versions(store_id) VALUES(sid) ON CONFLICT DO NOTHING;SELECT version INTO ver FROM saas.merchant_phone_staff_versions WHERE store_id=sid FOR UPDATE;
  IF p_action='staff_create' THEN
   IF ver<>(p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   SELECT * INTO phone FROM saas.merchant_phone_identities WHERE phone_key_id=p_input->>'phoneKeyId' AND phone_digest=p_input->>'phoneDigest' FOR UPDATE;
   IF FOUND AND phone.disabled_at IS NOT NULL THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;
   IF p_input?'existingMembershipId' THEN
    IF phone.principal_id IS NULL OR NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_input->>'existingMembershipId')::uuid AND principal_id=phone.principal_id AND store_id=sid AND role<>'store_owner' AND support_session_id IS NULL) THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;
    mid:=(p_input->>'existingMembershipId')::uuid;
   ELSIF phone.principal_id IS NOT NULL AND EXISTS(SELECT 1 FROM saas.memberships WHERE principal_id=phone.principal_id AND store_id=sid AND role='store_owner') THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;
   IF phone.id IS NOT NULL AND EXISTS(SELECT 1 FROM saas.merchant_phone_staff WHERE store_id=sid AND phone_id=phone.id) THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;
   IF NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=plan AND limit_key='staff' AND effective_limit>=
    (SELECT count(*) FROM saas.memberships WHERE store_id=sid AND status='active' AND role<>'store_owner' AND support_session_id IS NULL)+
    (SELECT count(*) FROM saas.merchant_phone_staff WHERE store_id=sid AND enabled AND membership_id IS NULL)+CASE WHEN mid IS NOT NULL AND EXISTS(SELECT 1 FROM saas.memberships WHERE id=mid AND status='active') THEN 0 ELSE 1 END)
   THEN RETURN QUERY SELECT 'staff_limit_reached',NULL::jsonb;RETURN;END IF;
   IF phone.id IS NULL THEN INSERT INTO saas.merchant_phone_identities(id,phone_key_id,phone_digest,phone_ciphertext,phone_masked) VALUES(gen_random_uuid(),p_input->>'phoneKeyId',p_input->>'phoneDigest',p_input->>'phoneCiphertext',p_input->>'phoneMasked') RETURNING * INTO phone;END IF;
   IF mid IS NOT NULL AND EXISTS(SELECT 1 FROM saas.merchant_phone_staff WHERE membership_id=mid AND phone_id IS NULL) THEN
    UPDATE saas.merchant_phone_staff SET phone_id=phone.id,display_name=p_input->>'displayName',role=p_input->>'role',created_by=actor,version=version+1,updated_at=n WHERE membership_id=mid;
   ELSE INSERT INTO saas.merchant_phone_staff(id,store_id,phone_id,membership_id,display_name,role,created_by) VALUES(gen_random_uuid(),sid,phone.id,mid,p_input->>'displayName',p_input->>'role',actor);END IF;out:='created';
  ELSIF p_action='staff_delete' THEN
   SELECT * INTO staff FROM saas.merchant_phone_staff WHERE id=(p_input->>'staffId')::uuid AND store_id=sid FOR UPDATE;
   IF NOT FOUND OR staff.version<>(p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   IF staff.enabled THEN RETURN QUERY SELECT 'staff_not_disabled',NULL::jsonb;RETURN;END IF;
   IF staff.membership_id IS NOT NULL THEN
    PERFORM 1 FROM saas.memberships WHERE id=staff.membership_id AND store_id=sid AND role<>'store_owner' AND support_session_id IS NULL FOR UPDATE;
    IF NOT FOUND THEN RETURN QUERY SELECT 'owner_required',NULL::jsonb;RETURN;END IF;
    UPDATE saas.memberships SET status='revoked',updated_at=n WHERE id=staff.membership_id AND status<>'revoked';
   END IF;
   DELETE FROM saas.merchant_phone_staff WHERE id=staff.id;out:='deleted';
  ELSE
   SELECT * INTO staff FROM saas.merchant_phone_staff WHERE id=(p_input->>'staffId')::uuid AND store_id=sid FOR UPDATE;
   IF NOT FOUND OR staff.version<>(p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
   IF staff.membership_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=staff.membership_id AND store_id=sid AND role<>'store_owner' AND support_session_id IS NULL) THEN RETURN QUERY SELECT 'owner_required',NULL::jsonb;RETURN;END IF;
   IF(p_input->>'enabled')::boolean AND NOT staff.enabled AND NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=plan AND limit_key='staff' AND effective_limit>(SELECT count(*) FROM saas.memberships WHERE store_id=sid AND status='active' AND role<>'store_owner' AND support_session_id IS NULL)+(SELECT count(*) FROM saas.merchant_phone_staff WHERE store_id=sid AND enabled AND membership_id IS NULL)) THEN RETURN QUERY SELECT 'staff_limit_reached',NULL::jsonb;RETURN;END IF;
   UPDATE saas.merchant_phone_staff SET display_name=p_input->>'displayName',role=p_input->>'role',enabled=(p_input->>'enabled')::boolean,version=version+1,updated_at=n WHERE id=staff.id;
   IF staff.membership_id IS NOT NULL THEN UPDATE saas.memberships SET role=p_input->>'role',status=CASE WHEN(p_input->>'enabled')::boolean THEN 'active' ELSE 'revoked' END,updated_at=n WHERE id=staff.membership_id;END IF;out:='updated';
  END IF;
  UPDATE saas.platform_store_versions SET version=version+1 WHERE store_id=sid;
  UPDATE saas.merchant_phone_staff_versions SET version=version+1 WHERE store_id=sid;body:=saas.merchant_phone_staff_projection(sid);
  INSERT INTO saas.merchant_phone_operations VALUES(op,actor,sid,p_action,p_input,out,CASE WHEN p_action='staff_delete' THEN body||jsonb_build_object('deletedStaff',to_jsonb(staff)) ELSE body END,n);RETURN QUERY SELECT out,body;RETURN;
 END IF;
 IF p_action='prepare' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('merchant.operation:'||op,0));
  SELECT * INTO pending FROM saas.merchant_phone_pending WHERE operation_id=op OR pending_id=(p_input->>'pendingId')::uuid FOR UPDATE;
  IF FOUND THEN IF pending.expires_at<=n THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;IF pending.prepare_input<>p_input THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'pending',saas.merchant_phone_projection(pending.pending_id);END IF;RETURN;END IF;
  SELECT store_id INTO target FROM saas.admin_domains WHERE hostname=p_input->>'destinationHostname' AND status='active' AND verified_at<=n;
  SELECT(p_input->>'destinationHostname')=ANY(central_hostnames) INTO is_central FROM saas.merchant_whatsapp_policy;
  IF target IS NULL AND NOT is_central THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF p_input->>'purpose'='bind_phone' AND(sid IS NULL OR target IS DISTINCT FROM sid) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF p_input->>'purpose'='signup' AND(NOT is_central OR NOT(SELECT signup_enabled FROM saas.merchant_whatsapp_policy)) THEN RETURN QUERY SELECT 'disabled',NULL::jsonb;RETURN;END IF;
  SELECT * INTO budget FROM saas.whatsapp_otp_reserve_send(op,'merchant',p_input->>'recipientBudgetDigest',p_input->>'ipDigest');
  IF budget.outcome<>'reserved' THEN RETURN QUERY SELECT budget.outcome,jsonb_build_object('retryAfterSeconds',budget.retry_after_seconds);RETURN;END IF;
  INSERT INTO saas.merchant_phone_pending(pending_id,operation_id,pending_digest,browser_digest,environment,purpose,phone_key_id,phone_digest,phone_ciphertext,phone_masked,destination_hostname,store_id,actor_id,actor_session_id,prepare_input,created_at,expires_at)
  VALUES((p_input->>'pendingId')::uuid,op,p_input->>'pendingDigest',p_input->>'browserDigest',p_input->>'environment',p_input->>'purpose',p_input->>'phoneKeyId',p_input->>'phoneDigest',p_input->>'phoneCiphertext',p_input->>'phoneMasked',p_input->>'destinationHostname',target,actor,session_row.session_id,p_input,n,n+interval '10 minutes') RETURNING * INTO pending;
  INSERT INTO saas.merchant_phone_challenges(challenge_id,operation_id,pending_id,code_digest,recipient_budget_digest,ip_digest,request_input,created_at) VALUES((p_input->>'challengeId')::uuid,op,pending.pending_id,p_input->>'codeDigest',p_input->>'recipientBudgetDigest',p_input->>'ipDigest',p_input,n);
  RETURN QUERY SELECT 'prepared',saas.merchant_phone_projection(pending.pending_id);RETURN;
 END IF;
 SELECT * INTO pending FROM saas.merchant_phone_pending WHERE pending_id=(p_input->>'pendingId')::uuid AND pending_digest=p_input->>'pendingDigest' AND browser_digest=p_input->>'browserDigest' AND environment=p_input->>'environment' AND expires_at>n FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
 -- Bind continuations require the current browser's authenticated ordinary actor.
 -- The persisted initiating actor alone never authorizes a later browser session.
 IF p_action IN('read','resend','verify') THEN
  IF pending.purpose='bind_phone' THEN
   IF NOT(p_input?&ARRAY['actorTokenKeyId','actorTokenDigest']) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
   SELECT * INTO session_row FROM saas.panel_sessions WHERE token_key_id=p_input->>'actorTokenKeyId' AND token_digest=p_input->>'actorTokenDigest' AND revoked_at IS NULL AND expires_at>n AND issued_at<=n FOR SHARE;
   IF NOT FOUND OR session_row.principal_id IS DISTINCT FROM pending.actor_id OR session_row.active_store_id IS DISTINCT FROM pending.store_id OR NOT saas.admin_login_session_allowed(session_row.token_key_id,session_row.token_digest) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
   PERFORM 1 FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id WHERE m.principal_id=session_row.principal_id AND m.store_id=pending.store_id AND m.status='active' AND m.support_session_id IS NULL AND s.status='active' FOR SHARE OF m,s;
   IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  ELSIF p_input?'actorTokenKeyId' OR p_input?'actorTokenDigest' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;
  END IF;
 END IF;
 IF pending.consumed_operation_id IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM saas.panel_sessions s WHERE s.session_id=(pending.consumed_input->>'sessionId')::uuid AND s.principal_id=pending.principal_id AND s.token_key_id=pending.consumed_input->>'tokenKeyId' AND s.token_digest=pending.consumed_input->>'tokenDigest' AND s.revoked_at IS NULL AND s.expires_at>n AND saas.admin_login_session_allowed(s.token_key_id,s.token_digest) AND EXISTS(SELECT 1 FROM saas.memberships m JOIN saas.stores st ON st.id=m.store_id AND st.status='active' WHERE m.principal_id=s.principal_id AND m.status='active' AND m.support_session_id IS NULL AND(s.active_store_id IS NULL OR m.store_id=s.active_store_id))) OR NOT EXISTS(SELECT 1 FROM saas.merchant_phone_identities WHERE principal_id=pending.principal_id AND phone_key_id=pending.phone_key_id AND phone_digest=pending.phone_digest AND disabled_at IS NULL AND verified_at IS NOT NULL) OR NOT(EXISTS(SELECT 1 FROM saas.admin_domains WHERE hostname=pending.destination_hostname AND store_id=pending.store_id AND status='active' AND verified_at<=n) OR EXISTS(SELECT 1 FROM saas.merchant_whatsapp_policy WHERE pending.destination_hostname=ANY(central_hostnames))) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  IF p_action='read' THEN RETURN QUERY SELECT 'completed',pending.consumed_authority;RETURN;END IF;
  IF pending.consumed_operation_id=op AND pending.consumed_input=p_input THEN RETURN QUERY SELECT 'operation_replayed',pending.consumed_authority;ELSE RETURN QUERY SELECT 'consumed',NULL::jsonb;END IF;RETURN;
 END IF;
 IF p_action='read' THEN RETURN QUERY SELECT CASE WHEN pending.verified_at IS NOT NULL THEN 'phone_verified' ELSE 'pending' END,saas.merchant_phone_projection(pending.pending_id);RETURN;END IF;
 IF p_action='resend' THEN
  SELECT * INTO challenge FROM saas.merchant_phone_challenges WHERE challenge_id=(p_input->>'challengeId')::uuid OR operation_id=op;
  IF FOUND THEN IF challenge.pending_id<>pending.pending_id OR challenge.request_input<>p_input THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT challenge.status,saas.merchant_phone_projection(pending.pending_id);END IF;RETURN;END IF;
  IF pending.verified_at IS NOT NULL OR p_input->>'recipientBudgetDigest'<>pending.prepare_input->>'recipientBudgetDigest' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO budget FROM saas.whatsapp_otp_reserve_send(op,'merchant',p_input->>'recipientBudgetDigest',p_input->>'ipDigest');
  IF budget.outcome<>'reserved' THEN RETURN QUERY SELECT budget.outcome,jsonb_build_object('retryAfterSeconds',budget.retry_after_seconds);RETURN;END IF;
  INSERT INTO saas.merchant_phone_challenges(challenge_id,operation_id,pending_id,code_digest,recipient_budget_digest,ip_digest,request_input,created_at) VALUES((p_input->>'challengeId')::uuid,op,pending.pending_id,p_input->>'codeDigest',p_input->>'recipientBudgetDigest',p_input->>'ipDigest',p_input,n);RETURN QUERY SELECT 'prepared',saas.merchant_phone_projection(pending.pending_id);RETURN;
 END IF;
 IF p_action IN('finish_delivery','verify') THEN
  SELECT * INTO challenge FROM saas.merchant_phone_challenges WHERE challenge_id=(p_input->>'challengeId')::uuid AND pending_id=pending.pending_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
  IF p_action='finish_delivery' THEN
   IF challenge.status<>'pending' THEN IF challenge.status<>p_input->>'status' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT challenge.status,saas.merchant_phone_projection(pending.pending_id);END IF;RETURN;END IF;
   IF p_input->>'status'='accepted' AND EXISTS(SELECT 1 FROM saas.merchant_phone_challenges WHERE pending_id=pending.pending_id AND status='accepted' AND created_at>challenge.created_at) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
   UPDATE saas.merchant_phone_challenges SET status=p_input->>'status' WHERE challenge_id=challenge.challenge_id;
   IF p_input->>'status'='accepted' THEN UPDATE saas.merchant_phone_challenges SET superseded=true WHERE pending_id=pending.pending_id AND challenge_id<>challenge.challenge_id AND created_at<=challenge.created_at;END IF;
   RETURN QUERY SELECT p_input->>'status',saas.merchant_phone_projection(pending.pending_id);RETURN;
  END IF;
  IF challenge.status<>'accepted' OR challenge.superseded OR pending.verified_at IS NOT NULL THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb;RETURN;END IF;
  IF challenge.attempts>=6 THEN RETURN QUERY SELECT 'locked',NULL::jsonb;RETURN;END IF;
  IF challenge.code_digest<>p_input->>'codeDigest' THEN UPDATE saas.merchant_phone_challenges SET attempts=attempts+1 WHERE challenge_id=challenge.challenge_id;RETURN QUERY SELECT CASE WHEN challenge.attempts=5 THEN 'locked' ELSE 'invalid_code' END,NULL::jsonb;RETURN;END IF;
  -- Factor precedes phone-row lock, matching webhook/support invalidation order.
  pid:=coalesce(pending.actor_id,(SELECT principal_id FROM saas.merchant_phone_identities WHERE phone_key_id=pending.phone_key_id AND phone_digest=pending.phone_digest));
  IF pid IS NOT NULL THEN INSERT INTO saas.admin_login_factors(principal_id) VALUES(pid) ON CONFLICT DO NOTHING;PERFORM 1 FROM saas.admin_login_factors WHERE principal_id=pid FOR UPDATE;END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('merchant.phone:'||pending.phone_key_id||':'||pending.phone_digest,0));
  SELECT * INTO phone FROM saas.merchant_phone_identities WHERE phone_key_id=pending.phone_key_id AND phone_digest=pending.phone_digest FOR UPDATE;
  IF phone.operator_enrolled_at IS NOT NULL AND pending.created_at<phone.operator_enrolled_at THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF; IF phone.disabled_at IS NOT NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF pending.purpose='bind_phone' THEN
   IF NOT EXISTS(SELECT 1 FROM saas.panel_sessions s JOIN saas.memberships m ON m.principal_id=s.principal_id AND m.store_id=pending.store_id AND m.status='active' AND m.support_session_id IS NULL WHERE s.session_id=pending.actor_session_id AND s.principal_id=pending.actor_id AND s.revoked_at IS NULL AND s.expires_at>n AND saas.admin_login_session_allowed(s.token_key_id,s.token_digest)) THEN RETURN QUERY SELECT 'unauthenticated',NULL::jsonb;RETURN;END IF;
   IF(phone.principal_id IS NOT NULL AND phone.principal_id<>pending.actor_id) OR EXISTS(SELECT 1 FROM saas.merchant_phone_identities WHERE principal_id=pending.actor_id AND id IS DISTINCT FROM phone.id) THEN RETURN QUERY SELECT 'phone_conflict',NULL::jsonb;RETURN;END IF;pid:=pending.actor_id;
  ELSE
   pid:=phone.principal_id;
   IF pending.purpose='login' AND NOT EXISTS(SELECT 1 FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id AND s.status='active' WHERE m.principal_id=pid AND m.status='active' AND m.support_session_id IS NULL AND(pending.store_id IS NULL OR m.store_id=pending.store_id)) AND NOT EXISTS(SELECT 1 FROM saas.merchant_phone_staff WHERE phone_id=phone.id AND enabled AND(pending.store_id IS NULL OR store_id=pending.store_id)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
   IF pid IS NULL THEN pid:=gen_random_uuid();INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at,authority_kind) VALUES(pid,'urn:celebix:merchant-phone',pid::text,NULL,false,n,n,'phone');END IF;
  END IF;
  IF phone.id IS NULL THEN INSERT INTO saas.merchant_phone_identities(id,phone_key_id,phone_digest,phone_ciphertext,phone_masked,principal_id,verified_at) VALUES(gen_random_uuid(),pending.phone_key_id,pending.phone_digest,pending.phone_ciphertext,pending.phone_masked,pid,n) RETURNING * INTO phone;
  ELSE UPDATE saas.merchant_phone_identities SET principal_id=pid,verified_at=coalesce(verified_at,n) WHERE id=phone.id;END IF;
  UPDATE saas.merchant_phone_staff SET phone_id=phone.id,version=version+1,updated_at=n WHERE phone_id IS NULL AND membership_id IN(SELECT id FROM saas.memberships WHERE principal_id=pid AND support_session_id IS NULL);
  sid:=pending.store_id;
  IF pending.purpose='login' THEN
   -- Activate only grants made by a still-active ordinary store owner.
   FOR staff IN SELECT * FROM saas.merchant_phone_staff WHERE phone_id=phone.id AND enabled AND(sid IS NULL OR store_id=sid) ORDER BY store_id LOOP
    INSERT INTO saas.platform_store_versions(store_id) VALUES(staff.store_id) ON CONFLICT DO NOTHING;
    PERFORM 1 FROM saas.platform_store_versions WHERE store_id=staff.store_id FOR UPDATE;
    PERFORM pg_advisory_xact_lock(hashtextextended('merchant.staff:'||staff.store_id,0));
    SELECT * INTO staff FROM saas.merchant_phone_staff WHERE id=staff.id FOR UPDATE;
    IF NOT staff.enabled OR NOT EXISTS(SELECT 1 FROM saas.memberships WHERE store_id=staff.store_id AND principal_id=staff.created_by AND role='store_owner' AND status='active' AND support_session_id IS NULL) THEN CONTINUE;END IF;
    IF staff.membership_id IS NULL THEN
     IF EXISTS(SELECT 1 FROM saas.memberships WHERE principal_id=pid AND store_id=staff.store_id AND role='store_owner') THEN CONTINUE;END IF;
     SELECT s.plan_id INTO plan FROM saas.subscriptions s WHERE s.store_id=staff.store_id AND s.status='active' AND s.valid_from<=n AND(s.valid_until IS NULL OR s.valid_until>n) FOR SHARE;
     IF NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan AND feature_key='staff_management' AND enabled) OR NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=plan AND limit_key='staff' AND effective_limit>=(SELECT count(*) FROM saas.memberships WHERE store_id=staff.store_id AND status='active' AND role<>'store_owner' AND support_session_id IS NULL)+(SELECT count(*) FROM saas.merchant_phone_staff WHERE store_id=staff.store_id AND enabled AND membership_id IS NULL)) THEN RETURN QUERY SELECT 'staff_limit_reached',NULL::jsonb;RETURN;END IF;
     INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES(gen_random_uuid(),pid,staff.store_id,staff.role,'active',n,n) ON CONFLICT(principal_id,store_id) WHERE support_session_id IS NULL DO UPDATE SET role=excluded.role,status='active',updated_at=n RETURNING id INTO mid;
     UPDATE saas.platform_store_versions SET version=version+1 WHERE store_id=staff.store_id;
     UPDATE saas.merchant_phone_staff SET membership_id=mid,version=version+1,updated_at=n WHERE id=staff.id;
    END IF;
   END LOOP;
  END IF;
  
   IF pending.purpose='login' AND pending.store_id IS NULL THEN
    SELECT s.id INTO sid FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id
    WHERE m.principal_id=pid AND m.status='active' AND m.support_session_id IS NULL AND s.status='active'
     AND EXISTS(SELECT 1 FROM saas.subscriptions sub JOIN saas.plans p ON p.id=sub.plan_id AND p.plan_code=sub.plan_code AND p.version=sub.plan_version
      WHERE sub.store_id=s.id AND sub.status='active' AND sub.valid_from<=n AND(sub.valid_until IS NULL OR sub.valid_until>n)
       AND p.status='active' AND p.valid_from<=n AND(p.valid_until IS NULL OR p.valid_until>n))
     AND EXISTS(SELECT 1 FROM saas.admin_domains ad WHERE ad.store_id=s.id AND ad.status='active' AND ad.canonical AND ad.verified_at<=n)
    ORDER BY s.slug,s.id LIMIT 1;
    IF sid IS NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
   END IF;
   UPDATE saas.merchant_phone_pending SET principal_id=pid,verified_at=n WHERE pending_id=pending.pending_id;
  IF pending.purpose='signup' THEN RETURN QUERY SELECT 'phone_verified',saas.merchant_phone_projection(pending.pending_id);RETURN;END IF;
 ELSE
  IF pending.purpose<>'signup' OR pending.verified_at IS NULL OR pending.principal_id IS NULL THEN RETURN QUERY SELECT 'not_ready',NULL::jsonb;RETURN;END IF;
  pid:=pending.principal_id;sid:=(p_input->>'storeId')::uuid;
  IF pending.signup_store_id IS DISTINCT FROM sid OR pending.signup_operation_id IS NULL THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE principal_id=pid AND store_id=sid AND role='store_owner' AND status='active' AND support_session_id IS NULL) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.memberships m JOIN saas.stores s ON s.id=m.store_id AND s.status='active' WHERE m.principal_id=pid AND m.status='active' AND m.support_session_id IS NULL AND(sid IS NULL OR m.store_id=sid)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.admin_login_factors(principal_id) VALUES(pid) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM saas.admin_login_factors WHERE principal_id=pid FOR UPDATE;
 INSERT INTO saas.admin_login_assurance(family_id,principal_id,security_version,expires_at,legacy,session_id,operation_id,token_key_id,token_digest,created_at,authentication_method)
 SELECT(p_input->>'familyId')::uuid,pid,f.security_version,n+interval '8 hours',false,(p_input->>'sessionId')::uuid,op,p_input->>'tokenKeyId',p_input->>'tokenDigest',n,'whatsapp' FROM saas.admin_login_factors f WHERE f.principal_id=pid;
 SELECT * INTO result FROM saas.issue_panel_session((p_input->>'sessionId')::uuid,(p_input->>'familyId')::uuid,op,p_input->>'tokenKeyId',p_input->>'tokenDigest',pid,sid,n,n+interval '8 hours');
 IF result.outcome NOT IN('issued','operation_replayed') THEN RAISE EXCEPTION 'MERCHANT_PHONE_SESSION_INVARIANT';END IF;
 destination:='https://'||pending.destination_hostname;
 IF pending.purpose='signup' OR(pending.purpose='login' AND pending.store_id IS NULL) THEN SELECT 'https://'||hostname INTO destination FROM saas.admin_domains WHERE store_id=sid AND status='active' AND verified_at<=n ORDER BY canonical DESC,created_at,hostname LIMIT 1;IF destination IS NULL THEN RAISE EXCEPTION 'MERCHANT_SIGNUP_DOMAIN_REQUIRED';END IF;END IF;
 body:=result.authority||jsonb_build_object('pendingId',pending.pending_id,'principalId',pid,'completedOperationId',op,'completionCiphertext',p_input->>'completionCiphertext','destinationOrigin',destination,'expiresAt',pending.expires_at);
 out:=CASE WHEN pending.purpose='bind_phone' THEN 'phone_bound' ELSE 'issued' END;
 UPDATE saas.merchant_phone_pending SET consumed_operation_id=op,consumed_input=p_input,consumed_outcome=out,consumed_authority=body WHERE pending_id=pending.pending_id;
 RETURN QUERY SELECT out,body;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.merchant_whatsapp_command(text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'0c9c87afde7ca167f7d17f0fde9a0113d74c575341821c416789375069f9bd89' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_identity=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'v' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.merchant_whatsapp_command(text,jsonb)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'ae4ad4fb22eb2e11b243df07c3d2426697c2867754f17559ff37afd9225b6c4d' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.merchant_whatsapp_command(text,jsonb)',f.definition,'0c9c87afde7ca167f7d17f0fde9a0113d74c575341821c416789375069f9bd89','ae4ad4fb22eb2e11b243df07c3d2426697c2867754f17559ff37afd9225b6c4d',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='ae4ad4fb22eb2e11b243df07c3d2426697c2867754f17559ff37afd9225b6c4d' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.merchant_whatsapp_command(text,jsonb)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.commercial_upgrade_request(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_target_plan_id uuid, p_operation_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE access jsonb;prior saas.commercial_upgrade_requests;target_price bigint;current_price bigint;BEGIN
 access:=saas.commercial_plan_read(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);IF access?'code' THEN RETURN access;END IF;
 IF p_operation_key IS NULL OR p_operation_key!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN RETURN jsonb_build_object('code','invalid_input');END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||p_store_id,0));
 access:=saas.commercial_plan_read(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);IF access?'code' THEN RETURN access;END IF;
 SELECT * INTO prior FROM saas.commercial_upgrade_requests WHERE operation_key=p_operation_key;
 IF FOUND THEN IF prior.store_id<>p_store_id OR prior.principal_id<>p_principal_id OR prior.plan_id<>p_target_plan_id THEN RETURN jsonb_build_object('code','operation_mismatch');END IF;RETURN saas.commercial_request_projection(prior.id,true);END IF;
 IF NOT saas.commercial248_plan_selectable(p_target_plan_id) THEN RETURN jsonb_build_object('code','invalid_input');END IF;
 SELECT price.monthly_price_cents INTO target_price FROM saas.commercial_plan_policies policy JOIN saas.plans plan ON plan.id=policy.plan_id JOIN saas.platform_plan_prices price ON price.plan_id=plan.id WHERE plan.id=p_target_plan_id AND plan.status='active';
 SELECT monthly_price_cents INTO current_price FROM saas.platform_plan_prices WHERE plan_id=p_plan_id;
 IF target_price IS NULL OR p_target_plan_id=p_plan_id OR(EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=p_plan_id) AND target_price<=coalesce(current_price,0)) THEN RETURN jsonb_build_object('code','invalid_input');END IF;
 INSERT INTO saas.commercial_upgrade_requests(id,store_id,principal_id,plan_id,operation_key)VALUES(gen_random_uuid(),p_store_id,p_principal_id,p_target_plan_id,p_operation_key) RETURNING * INTO prior;
 RETURN saas.commercial_request_projection(prior.id,false);
EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('code','operation_mismatch');END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.commercial_upgrade_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'d22c07c2c005751146740893f4b42b2dc71c09fcd879e673537d21b656ca3ff0' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'v' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.commercial_upgrade_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'78d49e3d655e7df187d18be751456fb4a40e9540f3484d9bb631be5287754aa9' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.commercial_upgrade_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'d22c07c2c005751146740893f4b42b2dc71c09fcd879e673537d21b656ca3ff0','78d49e3d655e7df187d18be751456fb4a40e9540f3484d9bb631be5287754aa9',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='78d49e3d655e7df187d18be751456fb4a40e9540f3484d9bb631be5287754aa9' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.commercial_upgrade_request(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.platform_read(p_operator uuid, p_resource text, p_query jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE items jsonb; sid uuid; envelope jsonb:=jsonb_build_object('available',true,'observedAt',statement_timestamp());BEGIN
 PERFORM saas.platform_operator_require_active(p_operator);IF p_query IS NULL OR jsonb_typeof(p_query)<>'object' OR pg_column_size(p_query)>8192 OR p_query-ARRAY['storeId','limit','email','q','status','from','to','after']<>'{}'::jsonb THEN RAISE EXCEPTION 'invalid_input';END IF;
 IF p_query ? 'limit' AND ((p_query->>'limit')!~'^[0-9]{1,3}$' OR (p_query->>'limit')::integer NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'invalid_input';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_each(p_query) WHERE jsonb_typeof(value) NOT IN('string','number')) THEN RAISE EXCEPTION 'invalid_input';END IF;
 sid:=(p_query->>'storeId')::uuid;
 IF p_resource='package-requests' THEN
 SELECT coalesce(jsonb_agg(payload ORDER BY created_at DESC,id DESC),'[]'::jsonb) INTO items FROM(SELECT r.id,r.created_at,jsonb_build_object('id',r.id,'storeId',r.store_id,'storeName',s.name,'planId',r.plan_id,'createdAt',saas.orders_json_timestamp(r.created_at),'status',CASE WHEN EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=r.store_id AND plan_id=r.plan_id AND created_at>=r.created_at) THEN 'applied' ELSE 'pending' END,'storeVersion',coalesce(v.version,0)) payload FROM saas.commercial_upgrade_requests r JOIN saas.stores s ON s.id=r.store_id LEFT JOIN saas.platform_store_versions v ON v.store_id=r.store_id WHERE(sid IS NULL OR r.store_id=sid) AND(p_query->>'after' IS NULL OR r.created_at<(p_query->>'after')::timestamptz) ORDER BY r.created_at DESC,r.id DESC LIMIT least(coalesce((p_query->>'limit')::integer,100),200)) page;
 RETURN envelope||jsonb_build_object('items',items,'nextCursor',CASE WHEN jsonb_array_length(items)=least(coalesce((p_query->>'limit')::integer,100),200) THEN items->(jsonb_array_length(items)-1)->>'createdAt' ELSE NULL END);
 ELSIF p_resource='store-detail' THEN RETURN envelope||jsonb_build_object('store',saas.platform_store_projection(sid,true));
 ELSIF p_resource='stores' THEN SELECT coalesce(jsonb_agg(saas.platform_store_projection(id,false) ORDER BY created_at DESC),'[]'::jsonb) INTO items FROM saas.stores WHERE (sid IS NULL OR id=sid) AND (p_query->>'q' IS NULL OR strpos(lower(name||' '||slug),lower(p_query->>'q'))>0) AND (p_query->>'status' IS NULL OR status=p_query->>'status');
 ELSIF p_resource='usage' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('storeId',id,'usage',saas.platform_store_usage(id))),'[]'::jsonb) INTO items FROM saas.stores WHERE sid IS NULL OR id=sid;
 ELSIF p_resource='memberships' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'storeId',m.store_id,'principalId',m.principal_id,'email',p.email,'role',m.role,'status',m.status,'version',coalesce(v.version,0))),'[]'::jsonb) INTO items FROM saas.memberships m JOIN saas.principals p ON p.id=m.principal_id LEFT JOIN saas.platform_store_versions v ON v.store_id=m.store_id WHERE (sid IS NULL OR m.store_id=sid) AND coalesce(to_jsonb(m)->>'support_session_id','')='';
 ELSIF p_resource='invitations' THEN
  IF p_query ? 'email' AND (jsonb_typeof(p_query->'email')<>'string' OR length(p_query->>'email') NOT BETWEEN 3 AND 320 OR p_query->>'email'<>lower(btrim(p_query->>'email'))) THEN RAISE EXCEPTION 'invalid_input';END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'storeId',store_id,'targetPrincipalId',target_principal_id,'role',role,'kind',kind,'expiresAt',expires_at,'acceptedAt',accepted_at)),'[]'::jsonb) INTO items FROM saas.platform_ownership_invitations WHERE sid IS NULL OR store_id=sid;
  RETURN envelope||jsonb_build_object('items',items,'candidates',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'email',email,'verified',email_verified)) FROM saas.principals WHERE email_verified AND email=p_query->>'email'),'[]'::jsonb));
 ELSIF p_resource='plans' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'code',p.plan_code,'version',p.version,'status',p.status,'monthlyPriceCents',(SELECT monthly_price_cents FROM saas.platform_plan_prices WHERE plan_id=p.id),'yearlyPriceCents',(SELECT yearly_price_cents FROM saas.platform_plan_prices WHERE plan_id=p.id),'features',(SELECT jsonb_object_agg(feature_key,enabled ORDER BY feature_ordinal) FROM saas.plan_features WHERE plan_id=p.id),'limits',(SELECT jsonb_object_agg(limit_key,effective_limit ORDER BY limit_ordinal) FROM saas.plan_limits WHERE plan_id=p.id)) ORDER BY p.plan_code,p.version),'[]'::jsonb) INTO items FROM saas.plans p WHERE saas.commercial248_plan_selectable(p.id);
 ELSIF p_resource='subscriptions' THEN SELECT coalesce(jsonb_agg(saas.platform_subscription_projection(id)) FILTER(WHERE saas.platform_subscription_projection(id) IS NOT NULL),'[]'::jsonb) INTO items FROM saas.stores WHERE sid IS NULL OR id=sid;
 ELSIF p_resource='billing' THEN SELECT coalesce(jsonb_agg(saas.platform_period_projection(id) ORDER BY starts_on DESC),'[]'::jsonb) INTO items FROM saas.platform_billing_periods WHERE (sid IS NULL OR store_id=sid) AND (p_query->>'q' IS NULL OR strpos(lower(label),lower(p_query->>'q'))>0) AND (p_query->>'from' IS NULL OR starts_on>=(p_query->>'from')::date) AND (p_query->>'to' IS NULL OR starts_on<=(p_query->>'to')::date);
 ELSIF p_resource='audit' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'operatorId',operator_id,'storeId',store_id,'action',action,'payload',payload,'createdAt',created_at) ORDER BY created_at DESC),'[]'::jsonb) INTO items FROM (SELECT * FROM saas.platform_audit WHERE (sid IS NULL OR store_id=sid) AND (p_query->>'q' IS NULL OR strpos(lower(action||' '||payload::text),lower(p_query->>'q'))>0) AND (p_query->>'from' IS NULL OR created_at>=(p_query->>'from')::timestamptz) AND (p_query->>'to' IS NULL OR created_at<(p_query->>'to')::date+interval '1 day') AND (p_query->>'after' IS NULL OR created_at<(p_query->>'after')::timestamptz) ORDER BY created_at DESC LIMIT least(coalesce((p_query->>'limit')::integer,100),200)) a;
 ELSIF p_resource='operations' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'storeId',result_store_id,'status',status,'createdAt',created_at,'updatedAt',updated_at,'retryable',false) ORDER BY created_at DESC),'[]'::jsonb) INTO items FROM (SELECT * FROM saas.tenant_operations WHERE sid IS NULL OR result_store_id=sid ORDER BY created_at DESC LIMIT 100) o;
 ELSIF p_resource='support-sessions' AND to_regprocedure('saas.platform_support_list(uuid,jsonb)') IS NOT NULL THEN EXECUTE 'SELECT saas.platform_support_list($1,$2)' INTO items USING p_operator,p_query;RETURN envelope||items;
 ELSIF p_resource='overview' THEN RETURN envelope||jsonb_build_object('storeCount',(SELECT count(*) FROM saas.stores),'activeStoreCount',(SELECT count(*) FROM saas.stores WHERE status='active'),'pendingSetupCount',(SELECT count(*) FROM saas.stores WHERE status='provisioning'),'attentionIssueCount',(SELECT count(*) FROM saas.registration_onboarding_jobs WHERE state='attention_required')+(SELECT count(*) FROM (SELECT store_id,hostname FROM saas.store_domains WHERE status='pending' UNION SELECT store_id,hostname FROM saas.admin_domains WHERE status='pending_verification' UNION SELECT store_id,normalized_hostname FROM saas.domains WHERE status='pending_verification') pending_domains),'upcomingDueCount',(SELECT count(*) FROM saas.platform_billing_periods WHERE due_on BETWEEN current_date AND current_date+7 AND (saas.platform_period_projection(id)->>'remainingCents')::numeric>0),'merchantSales',saas.platform_merchant_sales_projection(NULL),'currency','TRY','receivableCents',(SELECT coalesce(sum((saas.platform_period_projection(id)->>'remainingCents')::bigint),0) FROM saas.platform_billing_periods),'collectedCents',(SELECT coalesce(sum(amount_cents),0) FROM saas.platform_receipts r WHERE NOT EXISTS(SELECT 1 FROM saas.platform_receipt_reversals x WHERE x.receipt_id=r.id)),'overdueCents',(SELECT coalesce(sum((saas.platform_period_projection(id)->>'remainingCents')::bigint),0) FROM saas.platform_billing_periods WHERE due_on<current_date),'financialSetupRequired',(SELECT count(*) FROM saas.stores s WHERE NOT EXISTS(SELECT 1 FROM saas.platform_billing_periods WHERE store_id=s.id)));
 ELSE RAISE EXCEPTION 'invalid_input';END IF;RETURN envelope||jsonb_build_object('items',items);
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range THEN RAISE EXCEPTION 'invalid_input';
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.platform_read(uuid,text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'5916ac9b6b36f08ad4161153491a2c26d9b003f10bf42ba0be100692cac513c4' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_platform_operator=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.platform_read(uuid,text,jsonb)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'a8654c8cb0d22d560822b08dc00771dcac2a506b1dcb99140379e1610e8b69e1' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.platform_read(uuid,text,jsonb)',f.definition,'5916ac9b6b36f08ad4161153491a2c26d9b003f10bf42ba0be100692cac513c4','a8654c8cb0d22d560822b08dc00771dcac2a506b1dcb99140379e1610e8b69e1',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='a8654c8cb0d22d560822b08dc00771dcac2a506b1dcb99140379e1610e8b69e1' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.platform_read(uuid,text,jsonb)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.platform_command(p_operator uuid, p_action text, p_payload jsonb, p_expected_version bigint, p_idempotency_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE commercial_previous_subscription saas.subscriptions%ROWTYPE;sid uuid; ver bigint; request jsonb; prior saas.platform_command_results; result jsonb; entity uuid; period saas.platform_billing_periods; receipt saas.platform_receipts; amount bigint; plan saas.plans; target saas.principals; token text; usage jsonb; feature text; limits text[]:=ARRAY['products','staff','storageBytes','monthlyOrders','customDomains']; features text[]:=ARRAY['catalog','orders','customers','content','media','analytics','checkout','custom_domains','staff_management','promotions','integrations','accounting','marketplaces']; i integer;BEGIN
   IF p_action='ownership.invite' THEN RAISE EXCEPTION 'merchant_invitations_retired';END IF;
   IF p_action='membership.update' AND saas.merchant_whatsapp_policy_enabled((p_payload->>'storeId')::uuid) THEN RAISE EXCEPTION 'merchant_owner_required';END IF;
  
 PERFORM saas.platform_operator_require_active(p_operator);
 IF p_payload IS NULL OR jsonb_typeof(p_payload)<>'object' OR pg_column_size(p_payload)>16384 OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 128 OR p_idempotency_key<>btrim(p_idempotency_key) OR p_idempotency_key~'[[:cntrl:]]' THEN RAISE EXCEPTION 'invalid_input';END IF;
 request:=jsonb_build_object('action',p_action,'payload',CASE WHEN p_action='support.issue' THEN (p_payload-'handoff')||jsonb_build_object('handoffHash',encode(sha256(convert_to(p_payload->>'handoff','UTF8')),'hex')) ELSE p_payload END,'expectedVersion',p_expected_version);PERFORM pg_advisory_xact_lock(hashtextextended('platform-replay:'||p_operator::text||':'||p_idempotency_key,0));SELECT * INTO prior FROM saas.platform_command_results WHERE operator_id=p_operator AND idempotency_key=p_idempotency_key;
 IF FOUND THEN IF prior.request<>request THEN RAISE EXCEPTION 'operation_mismatch';END IF;result:=jsonb_set(prior.result,'{outcome}','"replayed"');IF p_action='support.issue' THEN result:=jsonb_set(result,'{result,handoff}',to_jsonb(p_payload->>'handoff'));END IF;RETURN result;END IF;
 IF p_action IN('support.issue','support.revoke','sales.pause','sales.resume') THEN
  IF p_action='support.issue' THEN IF p_payload-ARRAY['storeId','adminHost','host','reason','handoff']<>'{}' OR NOT(p_payload ?& ARRAY['storeId','reason','handoff']) OR NOT(p_payload ? 'adminHost' OR p_payload ? 'host') THEN RAISE EXCEPTION 'invalid_input';END IF;EXECUTE 'SELECT saas.platform_support_issue($1,$2,$3,$4,$5,$6,$7)' INTO result USING p_operator,(p_payload->>'storeId')::uuid,coalesce(p_payload->>'adminHost',p_payload->>'host'),p_payload->>'reason',p_expected_version,p_idempotency_key,p_payload->>'handoff';
  ELSIF p_action='support.revoke' THEN IF p_payload-ARRAY['sessionId']<>'{}' OR NOT(p_payload ? 'sessionId') THEN RAISE EXCEPTION 'invalid_input';END IF;EXECUTE 'SELECT saas.platform_support_revoke($1,$2,$3,$4)' INTO result USING p_operator,(p_payload->>'sessionId')::uuid,p_expected_version,p_idempotency_key;
  ELSE IF p_payload-ARRAY['storeId','reason']<>'{}' OR NOT(p_payload ?& ARRAY['storeId','reason']) THEN RAISE EXCEPTION 'invalid_input';END IF;EXECUTE 'SELECT saas.platform_sales_policy_set($1,$2,$3,$4,$5,$6)' INTO result USING p_operator,(p_payload->>'storeId')::uuid,p_action='sales.pause',p_payload->>'reason',p_expected_version,p_idempotency_key;END IF;
  result:=jsonb_build_object('outcome',CASE WHEN result->>'replayed'='true' THEN 'replayed' ELSE 'committed' END,'version',(result->>'version')::bigint,'result',result);
  INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result) VALUES(p_operator,p_idempotency_key,request,result#-ARRAY['result','handoff']);RETURN result;
 END IF;
 IF p_action='plan.publish' THEN
  IF p_payload-ARRAY['code','features','limits','monthlyPriceCents','yearlyPriceCents']<>'{}' OR NOT(p_payload ?& ARRAY['code','features','limits']) OR jsonb_typeof(p_payload->'features')<>'object' OR jsonb_typeof(p_payload->'limits')<>'object' OR NOT(p_payload->'features' ?& features) OR (p_payload->'features')-features<>'{}' OR NOT(p_payload->'limits' ?& limits) OR (p_payload->'limits')-limits<>'{}' THEN RAISE EXCEPTION 'invalid_input';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-plan:'||(p_payload->>'code'),0));SELECT coalesce(max(version),0) INTO ver FROM saas.plans WHERE plan_code=p_payload->>'code';IF ver<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;entity:=gen_random_uuid();
  INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at) VALUES(entity,p_payload->>'code',ver+1,'active',now(),now(),now());INSERT INTO saas.platform_plan_publications VALUES(entity,txid_current());
  FOR i IN 1..array_length(features,1) LOOP IF jsonb_typeof(p_payload->'features'->features[i])<>'boolean' THEN RAISE EXCEPTION 'invalid_input';END IF;INSERT INTO saas.plan_features VALUES(entity,features[i],i,(p_payload->'features'->>features[i])::boolean);END LOOP;
  FOR i IN 1..array_length(limits,1) LOOP IF jsonb_typeof(p_payload->'limits'->limits[i])<>'number' OR (p_payload->'limits'->>limits[i])::numeric<>trunc((p_payload->'limits'->>limits[i])::numeric) OR (p_payload->'limits'->>limits[i])::numeric NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'invalid_input';END IF;INSERT INTO saas.plan_limits(plan_id,limit_key,limit_ordinal,limit_value) VALUES(entity,limits[i],i,(p_payload->'limits'->>limits[i])::numeric);END LOOP;DELETE FROM saas.platform_plan_publications WHERE plan_id=entity;
  FOREACH feature IN ARRAY ARRAY['monthlyPriceCents','yearlyPriceCents'] LOOP IF p_payload ? feature AND p_payload->feature<>'null'::jsonb AND (jsonb_typeof(p_payload->feature)<>'number' OR (p_payload->>feature)::numeric<>trunc((p_payload->>feature)::numeric) OR (p_payload->>feature)::numeric NOT BETWEEN 0 AND 9007199254740991) THEN RAISE EXCEPTION 'invalid_input';END IF;END LOOP;
  INSERT INTO saas.platform_plan_prices VALUES(entity,(p_payload->>'monthlyPriceCents')::bigint,(p_payload->>'yearlyPriceCents')::bigint);ver:=ver+1;result:=jsonb_build_object('planId',entity);
 ELSE
  sid:=(p_payload->>'storeId')::uuid;IF NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=sid) THEN RAISE EXCEPTION 'record_not_found';END IF;INSERT INTO saas.platform_store_versions(store_id) VALUES(sid) ON CONFLICT DO NOTHING;SELECT version INTO ver FROM saas.platform_store_versions WHERE store_id=sid FOR UPDATE;IF ver<>p_expected_version THEN RAISE EXCEPTION 'version_conflict';END IF;
  IF p_action='billing.period.create' THEN
   IF p_payload-ARRAY['storeId','label','startsOn','endsOn','dueOn','amountCents']<>'{}' OR NOT(p_payload ?& ARRAY['label','startsOn','endsOn','dueOn','amountCents']) THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF jsonb_typeof(p_payload->'amountCents')<>'number' OR (p_payload->>'amountCents')::numeric<>trunc((p_payload->>'amountCents')::numeric) THEN RAISE EXCEPTION 'invalid_input';END IF;
   INSERT INTO saas.platform_billing_periods(store_id,label,starts_on,ends_on,due_on,amount_cents) VALUES(sid,p_payload->>'label',(p_payload->>'startsOn')::date,(p_payload->>'endsOn')::date,(p_payload->>'dueOn')::date,(p_payload->>'amountCents')::bigint) RETURNING id INTO entity;result:=jsonb_build_object('periodId',entity);
  ELSIF p_action='billing.period.adjust' THEN
   IF p_payload-ARRAY['storeId','periodId','deltaCents','reason']<>'{}' OR NOT(p_payload ?& ARRAY['periodId','deltaCents','reason']) OR jsonb_typeof(p_payload->'deltaCents')<>'number' OR (p_payload->>'deltaCents')::numeric<>trunc((p_payload->>'deltaCents')::numeric) OR (p_payload->>'deltaCents')::numeric NOT BETWEEN -9007199254740991 AND 9007199254740991 OR (p_payload->>'deltaCents')::numeric=0 OR jsonb_typeof(p_payload->'reason')<>'string' OR length(btrim(p_payload->>'reason')) NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'invalid_input';END IF;
   SELECT * INTO period FROM saas.platform_billing_periods WHERE store_id=sid AND id=(p_payload->>'periodId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;amount:=(p_payload->>'deltaCents')::bigint;
   IF (saas.platform_period_projection(period.id)->>'amountCents')::numeric+amount NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF (saas.platform_period_projection(period.id)->>'remainingCents')::numeric+amount<0 THEN RAISE EXCEPTION 'charge_below_collected';END IF;
   INSERT INTO saas.platform_billing_adjustments(store_id,period_id,delta_cents,reason) VALUES(sid,period.id,amount,btrim(p_payload->>'reason')) RETURNING id INTO entity;result:=jsonb_build_object('adjustmentId',entity,'periodId',period.id);
  ELSIF p_action='billing.receipt.record' THEN
   IF p_payload-ARRAY['storeId','periodId','amountCents','method','reference']<>'{}' OR NOT(p_payload ?& ARRAY['periodId','amountCents','method','reference']) OR jsonb_typeof(p_payload->'amountCents')<>'number' OR (p_payload->>'amountCents')::numeric<>trunc((p_payload->>'amountCents')::numeric) THEN RAISE EXCEPTION 'invalid_input';END IF;
   SELECT * INTO period FROM saas.platform_billing_periods WHERE store_id=sid AND id=(p_payload->>'periodId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;amount:=(p_payload->>'amountCents')::bigint;
   IF amount<1 OR amount>(saas.platform_period_projection(period.id)->>'remainingCents')::bigint THEN RAISE EXCEPTION 'overpayment';END IF;INSERT INTO saas.platform_receipts(store_id,period_id,amount_cents,method,reference) VALUES(sid,period.id,amount,p_payload->>'method',p_payload->>'reference') RETURNING id INTO entity;result:=jsonb_build_object('receiptId',entity,'periodId',period.id);
  ELSIF p_action='billing.receipt.reverse' THEN
   IF p_payload-ARRAY['storeId','receiptId','reason']<>'{}' OR NOT(p_payload ?& ARRAY['receiptId','reason']) THEN RAISE EXCEPTION 'invalid_input';END IF;SELECT * INTO receipt FROM saas.platform_receipts WHERE store_id=sid AND id=(p_payload->>'receiptId')::uuid;IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;IF EXISTS(SELECT 1 FROM saas.platform_receipt_reversals WHERE receipt_id=receipt.id) THEN RAISE EXCEPTION 'already_reversed';END IF;INSERT INTO saas.platform_receipt_reversals(store_id,receipt_id,reason) VALUES(sid,receipt.id,p_payload->>'reason') RETURNING id INTO entity;result:=jsonb_build_object('reversalId',entity,'periodId',receipt.period_id);
  ELSIF p_action='subscription.assign' THEN
   IF NOT saas.commercial248_plan_selectable((p_payload->>'planId')::uuid) THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=(p_payload->>'planId')::uuid) AND NOT(SELECT assignments_enabled FROM saas.commercial_package_release_state WHERE singleton) THEN RAISE EXCEPTION 'commercial_assignment_disabled';END IF;
   SELECT * INTO commercial_previous_subscription FROM saas.subscriptions WHERE store_id=sid AND status='active' FOR UPDATE;
   PERFORM pg_advisory_xact_lock(hashtextextended('saas.commercial.store:'||sid,0));
   IF EXISTS(SELECT 1 FROM saas.subscriptions WHERE store_id=sid AND status='active' AND valid_until<=clock_timestamp()) THEN RAISE EXCEPTION 'subscription_expired';END IF;
   IF p_payload-ARRAY['storeId','planId']<>'{}' OR NOT(p_payload ? 'planId') THEN RAISE EXCEPTION 'invalid_input';END IF;SELECT * INTO plan FROM saas.plans WHERE id=(p_payload->>'planId')::uuid AND status='active' AND valid_from<=now() AND (valid_until IS NULL OR valid_until>now());IF NOT FOUND THEN RAISE EXCEPTION 'record_not_found';END IF;
   IF EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=plan.id) AND (SELECT effective_limit FROM saas.plan_limits WHERE plan_id=plan.id AND limit_key='monthlyOrders')<(saas.commercial_usage(sid,clock_timestamp())->>'monthlyOrders')::bigint+(SELECT count(*) FROM saas.commercial_order_reservations WHERE store_id=sid AND state='reserved' AND month_start=saas.commercial_month(sid,clock_timestamp())) THEN RAISE EXCEPTION 'limit_below_usage';END IF;IF EXISTS(SELECT 1 FROM saas.commercial_plan_policies p WHERE p.plan_id=plan.id AND p.variant_limit<(saas.commercial_usage(sid,clock_timestamp())->>'variants')::bigint) THEN RAISE EXCEPTION 'limit_below_usage';END IF;usage:=CASE WHEN EXISTS(SELECT 1 FROM saas.commercial_plan_policies WHERE plan_id=plan.id) THEN saas.commercial_usage(sid,clock_timestamp())-'variants' ELSE saas.platform_store_usage(sid) END;FOR i IN 1..array_length(limits,1) LOOP IF NOT EXISTS(SELECT 1 FROM saas.plan_limits WHERE plan_id=plan.id AND limit_key=limits[i] AND effective_limit>=(usage->>limits[i])::bigint) THEN RAISE EXCEPTION 'limit_below_usage';END IF;END LOOP;
   IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=sid AND status IN('payment_pending','payment_received')) THEN FOREACH feature IN ARRAY ARRAY['orders','checkout','catalog'] LOOP IF NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan.id AND feature_key=feature AND enabled) THEN RAISE EXCEPTION 'pending_pos_blocks_downgrade';END IF;END LOOP;END IF;
   IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=sid AND status IN('payment_pending','payment_received') AND ((contract_version=4 AND NOT saas.commercial_plan_has_capability(plan.id,'manual_orders')) OR(contract_version<>4 AND NOT saas.commercial_plan_has_capability(plan.id,'cashier')))) THEN RAISE EXCEPTION 'pending_pos_blocks_downgrade';END IF;
   IF (EXISTS(SELECT 1 FROM saas.accounting_receivables WHERE store_id=sid AND sale_cents-return_cents-discount_cents-collected_cents>0) OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=sid AND status IN('payment_pending','payment_received') AND contract_version IN(3,4) AND initial_collection_cents<total_cents)) AND NOT EXISTS(SELECT 1 FROM saas.plan_features WHERE plan_id=plan.id AND feature_key='accounting' AND enabled) THEN RAISE EXCEPTION 'open_debt_blocks_downgrade';END IF;
   UPDATE saas.subscriptions SET status='inactive',updated_at=greatest(clock_timestamp(),updated_at) WHERE store_id=sid AND status='active';INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES(gen_random_uuid(),sid,plan.id,plan.plan_code,plan.version,'active',clock_timestamp(),commercial_previous_subscription.valid_until,clock_timestamp(),clock_timestamp()) RETURNING id INTO entity;result:=jsonb_build_object('subscriptionId',entity,'planId',plan.id);
  ELSIF p_action='membership.update' THEN
   IF p_payload-ARRAY['storeId','membershipId','role','status']<>'{}' OR NOT(p_payload ?& ARRAY['membershipId','role','status']) OR p_payload->>'role' NOT IN('store_owner','admin','editor','analyst','cashier') OR p_payload->>'status' NOT IN('active','invited','revoked') THEN RAISE EXCEPTION 'invalid_input';END IF;
   IF NOT EXISTS(SELECT 1 FROM saas.memberships m WHERE store_id=sid AND id=(p_payload->>'membershipId')::uuid AND coalesce(to_jsonb(m)->>'support_session_id','')='') THEN RAISE EXCEPTION 'record_not_found';END IF;
   IF p_payload->>'role'='store_owner' AND NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_payload->>'membershipId')::uuid AND role='store_owner' AND status='active') THEN RAISE EXCEPTION 'ownership_acceptance_required';END IF;
   IF p_payload->>'status'='active' AND EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_payload->>'membershipId')::uuid AND status='invited') THEN RAISE EXCEPTION 'invitation_acceptance_required';END IF;
   IF p_payload->>'role'<>'store_owner' AND p_payload->>'status'='active' AND EXISTS(SELECT 1 FROM saas.memberships WHERE id=(p_payload->>'membershipId')::uuid AND (role='store_owner' OR status<>'active')) AND NOT EXISTS(SELECT 1 FROM saas.plan_limits l JOIN saas.subscriptions sub ON sub.plan_id=l.plan_id WHERE sub.store_id=sid AND sub.status='active' AND l.limit_key='staff' AND l.effective_limit>(saas.platform_store_usage(sid)->>'staff')::bigint) THEN RAISE EXCEPTION 'staff_limit_reached';END IF;
   UPDATE saas.memberships SET role=p_payload->>'role',status=p_payload->>'status',updated_at=greatest(clock_timestamp(),updated_at) WHERE id=(p_payload->>'membershipId')::uuid AND store_id=sid RETURNING id INTO entity;result:=jsonb_build_object('membershipId',entity);
  ELSIF p_action='ownership.invite' THEN
   IF p_payload-ARRAY['storeId','targetPrincipalId','role','kind','previousOwnerDisposition']<>'{}' OR NOT(p_payload ?& ARRAY['targetPrincipalId','role','kind']) THEN RAISE EXCEPTION 'invalid_input';END IF;SELECT * INTO target FROM saas.principals WHERE id=(p_payload->>'targetPrincipalId')::uuid AND email_verified;IF NOT FOUND THEN RAISE EXCEPTION 'verified_identity_required';END IF;token:=gen_random_uuid()::text||gen_random_uuid()::text;
   INSERT INTO saas.platform_ownership_invitations(store_id,target_principal_id,target_issuer,target_subject,role,kind,previous_owner_disposition,created_by,token_hash,expires_at) VALUES(sid,target.id,target.issuer,target.subject,p_payload->>'role',p_payload->>'kind',p_payload->>'previousOwnerDisposition',p_operator,sha256(convert_to(token,'UTF8')),now()+interval '7 days') RETURNING id INTO entity;result:=jsonb_build_object('invitationId',entity,'acceptanceToken',token,'expiresAt',now()+interval '7 days');
  ELSE RAISE EXCEPTION 'invalid_input';END IF;
  ver:=ver+1;UPDATE saas.platform_store_versions SET version=ver WHERE store_id=sid;
 END IF;
 INSERT INTO saas.platform_audit(operator_id,store_id,action,payload) VALUES(p_operator,sid,p_action,p_payload);
 result:=jsonb_build_object('outcome','committed','version',ver,'result',result);INSERT INTO saas.platform_command_results(operator_id,idempotency_key,request,result) VALUES(p_operator,p_idempotency_key,request,result);RETURN result;
EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format OR numeric_value_out_of_range OR check_violation OR not_null_violation THEN RAISE EXCEPTION 'invalid_input';
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.platform_command(uuid,text,jsonb,bigint,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'e306033d48bfe43e65b52a63e48a9cd1bd33ba8a52c6600aeb6967d7a358cccc' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_platform_operator=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'v' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.platform_command(uuid,text,jsonb,bigint,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'1f514739f16bf26f9119fd9bf42930247bdd81802890c7e987ea601390f9ff85' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.platform_command(uuid,text,jsonb,bigint,text)',f.definition,'e306033d48bfe43e65b52a63e48a9cd1bd33ba8a52c6600aeb6967d7a358cccc','1f514739f16bf26f9119fd9bf42930247bdd81802890c7e987ea601390f9ff85',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='1f514739f16bf26f9119fd9bf42930247bdd81802890c7e987ea601390f9ff85' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.platform_command(uuid,text,jsonb,bigint,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_sales_get_operation_v4(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_expected_fingerprint text DEFAULT NULL::text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;projected jsonb;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND OR prior.store_id<>p_store_id THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_expected_fingerprint IS NOT NULL AND p_expected_fingerprint<>prior.payload_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 IF prior.sale_id IS NULL THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=prior.sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 projected:=jsonb_set(prior.result_payload,'{sale}',saas.in_store_projection_v4_value(prior.result_payload->'sale'))||jsonb_build_object('replayed',true);
 IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
 RETURN QUERY SELECT 'found',projected;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_sales_get_operation_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'42a459e5758c67d7e08afeb11a91e423a0d8904775554f6ebaee7884abf04bc0' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_sales_get_operation_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'932b1073f7a508d971c73b67c2372407c01b67edbf19260818f382420e816a7c' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_sales_get_operation_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'42a459e5758c67d7e08afeb11a91e423a0d8904775554f6ebaee7884abf04bc0','932b1073f7a508d971c73b67c2372407c01b67edbf19260818f382420e816a7c',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='932b1073f7a508d971c73b67c2372407c01b67edbf19260818f382420e816a7c' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_sales_get_operation_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_sales_get_operation_v3(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_expected_fingerprint text DEFAULT NULL::text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;projected jsonb;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND OR prior.store_id<>p_store_id THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_expected_fingerprint IS NOT NULL AND p_expected_fingerprint<>prior.payload_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 IF prior.result_payload#>>'{sale,contractVersion}'='4' THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
 IF prior.sale_id IS NULL THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=prior.sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 projected:=jsonb_set(prior.result_payload,'{sale}',saas.in_store_projection_v3_value(prior.result_payload->'sale'))||jsonb_build_object('replayed',true);
 IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
 RETURN QUERY SELECT 'found',projected;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_sales_get_operation_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'e710d087d8ca8b1e1daa7c924639b4fca27932abefd2221d657e31cdae72e1c5' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_sales_get_operation_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'96a5f43a406c0f029276f2235937465aefc108eebee0fa11ab9b66bb89acbe21' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_sales_get_operation_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'e710d087d8ca8b1e1daa7c924639b4fca27932abefd2221d657e31cdae72e1c5','96a5f43a406c0f029276f2235937465aefc108eebee0fa11ab9b66bb89acbe21',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='96a5f43a406c0f029276f2235937465aefc108eebee0fa11ab9b66bb89acbe21' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_sales_get_operation_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_sales_recover_staff_v3(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.store_id<>p_store_id OR prior.operation_kind<>'set_staff' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('canEditPrice',coalesce((prior.result_payload->>'canEditPrice')::boolean,false),'canSellOnCredit',coalesce((prior.result_payload->>'canSellOnCredit')::boolean,false),'canCollectReceivables',coalesce((prior.result_payload->>'canCollectReceivables')::boolean,false));
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_sales_recover_staff_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'91b46379b3d064c704981e3600e0def9a801a21b8ee4bfe9c48cdd7ea70915a5' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_sales_recover_staff_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'9f6fffa639369328bdef739ce4bf36cf25a984ba446b45a675531610707d8b44' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_sales_recover_staff_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'91b46379b3d064c704981e3600e0def9a801a21b8ee4bfe9c48cdd7ea70915a5','9f6fffa639369328bdef739ce4bf36cf25a984ba446b45a675531610707d8b44',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='9f6fffa639369328bdef739ce4bf36cf25a984ba446b45a675531610707d8b44' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_sales_recover_staff_v3(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_sales_recover_customer(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND OR prior.store_id<>p_store_id THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.operation_kind<>'create_customer' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 IF prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('replayed',true);
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_sales_recover_customer(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'8042c818008af008efa420ef23ab7ae3c3521b64ab9ceaaa63a26df85564f0f8' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_sales_recover_customer(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'06cc6760461b5bc4244e482c13f3ae4779f5222e815085dd7a4c5e5772629382' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_sales_recover_customer(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'8042c818008af008efa420ef23ab7ae3c3521b64ab9ceaaa63a26df85564f0f8','06cc6760461b5bc4244e482c13f3ae4779f5222e815085dd7a4c5e5772629382',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='06cc6760461b5bc4244e482c13f3ae4779f5222e815085dd7a4c5e5772629382' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_sales_recover_customer(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_sales_get_operation_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_expected_fingerprint text DEFAULT NULL::text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;projected jsonb;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND OR prior.store_id<>p_store_id THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_expected_fingerprint IS NOT NULL AND p_expected_fingerprint<>prior.payload_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 IF (prior.result_payload#>>'{sale,contractVersion}')::integer=3 THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
 IF prior.result_payload#>>'{sale,contractVersion}'='4' THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
 IF prior.sale_id IS NULL THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=prior.sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 projected:=jsonb_set(prior.result_payload,'{sale}',saas.in_store_projection_v2_value(prior.result_payload->'sale'))||jsonb_build_object('replayed',true);
 IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
 RETURN QUERY SELECT 'found',projected;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_sales_get_operation_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'08dc9c75162ad81df50cc2088e2354accfc5728d41852289b5b81fe0356879ca' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_sales_get_operation_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'532c143aaf20424dae4b255194c9e13c366cbea2655c119ee7e7607a7f06907b' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_sales_get_operation_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'08dc9c75162ad81df50cc2088e2354accfc5728d41852289b5b81fe0356879ca','532c143aaf20424dae4b255194c9e13c366cbea2655c119ee7e7607a7f06907b',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='532c143aaf20424dae4b255194c9e13c366cbea2655c119ee7e7607a7f06907b' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_sales_get_operation_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_sales_recover_staff(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.store_id<>p_store_id OR prior.operation_kind<>'set_staff' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_sales_recover_staff(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'8fe744faa6b836e98da23a01a79e6804521f9940673bd8ab077a5ba471f6dc86' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_sales_recover_staff(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'da851ca844b53083962a2541612577b7ddbb279d4ef25065e9a402c782757537' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_sales_recover_staff(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'8fe744faa6b836e98da23a01a79e6804521f9940673bd8ab077a5ba471f6dc86','da851ca844b53083962a2541612577b7ddbb279d4ef25065e9a402c782757537',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='da851ca844b53083962a2541612577b7ddbb279d4ef25065e9a402c782757537' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_sales_recover_staff(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.quick_links_recover_operation(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_operation_kind text, p_fingerprint text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE
  authority_error text;
  existing_operation saas.quick_order_link_operations%ROWTYPE;
BEGIN
  IF saas.quick_links_authority_time_is_valid(p_now) IS DISTINCT FROM TRUE THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb;
    RETURN;
  END IF;
  authority_error := saas.commercial248_receipt_quick_link_merchant_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'quick_links.manage'
  );
  IF authority_error = 'membership_denied' AND EXISTS (
    SELECT 1 FROM saas.platform_authorized_memberships AS membership
    WHERE membership.id=p_membership_id AND membership.store_id=p_store_id
      AND membership.principal_id=p_principal_id AND membership.status='active'
  ) THEN authority_error := 'action_denied'; END IF;
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR p_operation_kind IS NULL
     OR p_operation_kind<>ALL(ARRAY['create','cancel','duplicate'])
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN
    RETURN QUERY SELECT 'invalid_input'::text,NULL::jsonb; RETURN;
  END IF;
  SELECT operation.* INTO existing_operation
  FROM saas.quick_order_link_operations AS operation
  WHERE operation.operation_id=p_operation_id AND operation.store_id=p_store_id;
  IF NOT FOUND THEN RETURN QUERY SELECT 'quick_link_not_found'::text,NULL::jsonb; RETURN; END IF;
  IF existing_operation.operation_kind<>p_operation_kind OR existing_operation.payload_fingerprint<>p_fingerprint THEN
    RETURN QUERY SELECT 'operation_mismatch'::text,NULL::jsonb; RETURN;
  END IF;
  RETURN QUERY SELECT 'operation_replayed'::text,existing_operation.result_payload;
END
$function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'8179e2d9163a258f31705a9c7b5b33d36984352b02a99b29ab930f7156986592' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'96326b11fe04248f40274528c6efce128c6803b744253b822acd37c9891dbeeb' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)',f.definition,'8179e2d9163a258f31705a9c7b5b33d36984352b02a99b29ab930f7156986592','96326b11fe04248f40274528c6efce128c6803b744253b822acd37c9891dbeeb',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='96326b11fe04248f40274528c6efce128c6803b744253b822acd37c9891dbeeb' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.quick_links_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_sales_recover_staff_v4(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.store_id<>p_store_id OR prior.operation_kind<>'set_staff' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('canEditPrice',coalesce((prior.result_payload->>'canEditPrice')::boolean,false),'canSellOnCredit',coalesce((prior.result_payload->>'canSellOnCredit')::boolean,false),'canCollectReceivables',coalesce((prior.result_payload->>'canCollectReceivables')::boolean,false));
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_sales_recover_staff_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'e369fcb1bf2be9e627fe4c9ddeb98d4305b07faa7cb0f7c2f9effe72a3ab77f9' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_sales_recover_staff_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'bd9ace488920b7625dd5dd005d5b2a09c3c6c820744d17d88526171714a2944a' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_sales_recover_staff_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'e369fcb1bf2be9e627fe4c9ddeb98d4305b07faa7cb0f7c2f9effe72a3ab77f9','bd9ace488920b7625dd5dd005d5b2a09c3c6c820744d17d88526171714a2944a',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='bd9ace488920b7625dd5dd005d5b2a09c3c6c820744d17d88526171714a2944a' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_sales_recover_staff_v4(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_sales_recover_staff_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.store_id<>p_store_id OR prior.operation_kind<>'set_staff' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('canEditPrice',coalesce((prior.result_payload->>'canEditPrice')::boolean,false));
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_sales_recover_staff_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'438a4107693b83826e7664f44c6ab8b4ecf61a0420a180cd008ad9e30afeb24e' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_sales_recover_staff_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'3a83fb8c6e588db2d3432fd78fdd3e8db6e712e7d1ec056251ce3119e36b145f' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_sales_recover_staff_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'438a4107693b83826e7664f44c6ab8b4ecf61a0420a180cd008ad9e30afeb24e','3a83fb8c6e588db2d3432fd78fdd3e8db6e712e7d1ec056251ce3119e36b145f',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='3a83fb8c6e588db2d3432fd78fdd3e8db6e712e7d1ec056251ce3119e36b145f' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_sales_recover_staff_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $patch$DECLARE f record;revised text:=$reviewed$CREATE OR REPLACE FUNCTION saas.in_store_sales_get_operation(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_expected_fingerprint text DEFAULT NULL::text)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;projected jsonb;
BEGIN
 err:=saas.commercial248_receipt_in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND OR prior.store_id<>p_store_id THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_expected_fingerprint IS NOT NULL AND p_expected_fingerprint<>prior.payload_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 IF (prior.result_payload#>>'{sale,contractVersion}')::integer=3 THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
 IF prior.result_payload#>>'{sale,contractVersion}'='4' THEN RETURN QUERY SELECT 'client_upgrade_required',NULL::jsonb;RETURN;END IF;
 IF prior.sale_id IS NULL THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=prior.sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 projected:=prior.result_payload||jsonb_build_object('replayed',true);
 IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
 RETURN QUERY SELECT 'found',projected;
END $function$
$reviewed$;BEGIN
 SELECT p.*,pg_get_functiondef(p.oid)definition INTO STRICT f FROM pg_proc p WHERE p.oid='saas.in_store_sales_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)'::regprocedure;
 IF encode(sha256(convert_to(f.definition,'UTF8')),'hex')<>'a0912fe8665c185ba24933d00c57fdf2670162ba9aeb2911d33f4f9f27e3674b' OR f.proowner<>'celebix_saas_owner'::regrole OR f.proacl IS DISTINCT FROM '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}'::aclitem[] OR f.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[] OR f.prosecdef IS DISTINCT FROM true OR f.provolatile<>'s' OR f.proisstrict IS DISTINCT FROM false OR f.proparallel<>'u' THEN RAISE EXCEPTION 'COMMERCIAL248_PREDECESSOR_DRIFT:%','saas.in_store_sales_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
 IF encode(sha256(convert_to(revised,'UTF8')),'hex')<>'e5a44ca2f92d76c7cca1f887bf56dd9ef57afe96b1a42aa981d9973e0f0e1f02' THEN RAISE EXCEPTION 'COMMERCIAL248_PATCH_DIGEST';END IF;
 INSERT INTO saas.commercial248_original_functions VALUES('saas.in_store_sales_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)',f.definition,'a0912fe8665c185ba24933d00c57fdf2670162ba9aeb2911d33f4f9f27e3674b','e5a44ca2f92d76c7cca1f887bf56dd9ef57afe96b1a42aa981d9973e0f0e1f02',f.oid,f.proowner,f.proacl,f.proconfig,f.prosecdef,f.provolatile,f.proisstrict,f.proparallel);
 EXECUTE revised;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=f.oid AND encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex')='e5a44ca2f92d76c7cca1f887bf56dd9ef57afe96b1a42aa981d9973e0f0e1f02' AND p.proowner=f.proowner AND p.proacl IS NOT DISTINCT FROM f.proacl AND p.proconfig IS NOT DISTINCT FROM f.proconfig AND p.prosecdef=f.prosecdef AND p.provolatile=f.provolatile AND p.proisstrict=f.proisstrict AND p.proparallel=f.proparallel) THEN RAISE EXCEPTION 'COMMERCIAL248_POSTCONDITION:%','saas.in_store_sales_get_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)';END IF;
END $patch$;
DO $private$DECLARE f record;r record;BEGIN
 FOR f IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'commercial248_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC',f.signature);
  FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'celebix_saas_%' AND rolname<>'celebix_saas_owner' LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',f.signature,r.rolname);END LOOP;
 END LOOP;
END $private$;
DO $payment$BEGIN
 IF saas.built_in_payment_methods_preflight() IS DISTINCT FROM true OR saas.payment_provider_keyed_lifecycle_preflight() IS DISTINCT FROM true OR saas.iyzico_iframe_tenant_activation_runtime_preflight() IS DISTINCT FROM true OR saas.quick_order_hosted_payment_authority_preflight() IS DISTINCT FROM true OR saas.shipping_provider_preflight() IS DISTINCT FROM true THEN RAISE EXCEPTION 'COMMERCIAL248_PAYMENT_PREFLIGHT';END IF;
END $payment$;
COMMIT;
