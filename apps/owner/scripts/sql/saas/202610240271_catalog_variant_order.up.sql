-- Independent variant display order. Business fields and variant versions are untouched.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.catalog-variant-order.release271',0));
DO $preflight$ BEGIN
 IF to_regclass('saas.catalog_variant_order_state') IS NOT NULL OR to_regclass('saas.catalog_variant_order271_backup') IS NOT NULL
 THEN RAISE EXCEPTION 'VARIANT_ORDER271_ALREADY_INSTALLED_OR_SOURCE_INVALID';END IF;
END $preflight$;
CREATE TABLE saas.catalog_variant_order271_backup(signature text PRIMARY KEY,definition text NOT NULL,predecessor_sha256 text NOT NULL,published_sha256 text,owner_oid oid NOT NULL,acl aclitem[],config text[],clone_signature text NOT NULL);
REVOKE ALL ON saas.catalog_variant_order271_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
DO $backup$ DECLARE r record;f record;d text;clone text;BEGIN
 FOR f IN SELECT * FROM(VALUES
 ('saas.catalog_get_product_details_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)','61e1a0de51d265be5177d56f6ec6fb0988ab521b4b829eb024476e69c0dc853f','catalog_get_product_details_v3'),
 ('saas.catalog_get_product_editor_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)','db4fdb131697bd9e530e667dfdc03f1762daf7b96044387bf598d64f6cff00f7','catalog_get_product_editor_with_origins'),
 ('saas.catalog_onboarding_result_projection_v2(uuid,uuid)','d738f6897a2f437b2357db4190afce4e48d2a55c767a6e31795a72bcad0286ad','catalog_onboarding_result_projection_v2'),
 ('saas.public_effective_product_projection(uuid,uuid,timestamp with time zone)','94206873968d66b188ed8a9ea360463781d468d016be714d9cdf1690b7e72954','public_effective_product_projection'),
 ('saas.public_campaign_product_projection(uuid,uuid,timestamp with time zone)','2381dbdd1183d175d0349f8a3c05d0dcb9c6786daea8f22274fd119d1ac94ada','public_campaign_product_projection'),
 ('saas.catalog_get_product_preview_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)','7327cd7087db50ff7e88d2ea166915112d240ff4d4d172df404af17324037158','catalog_get_product_preview_v2'),
 ('saas.catalog_onboard_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)','6d4fee75176bd57d16cdba630a0a5d160958eff04e631d4eca7ee220765cb359','catalog_onboard_product_with_origins'),
 ('saas.catalog_create_variants_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)','f96cbf8fe0edab2a9e1826427a30c4d77f05a837586e5ad1b0ae20026fa1355d','catalog_create_variants_batch_v2')
 )reviewed(signature,body_hash,function_name) LOOP
  SELECT pg_get_functiondef(p.oid)definition,p.proowner,p.proacl,p.proconfig,p.prosecdef INTO r FROM pg_proc p WHERE p.oid=to_regprocedure(f.signature);
  IF r.definition IS NULL OR encode(sha256(convert_to(r.definition,'UTF8')),'hex') IS DISTINCT FROM f.body_hash OR r.proowner<>'celebix_saas_owner'::regrole OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
   OR r.proacl::text IS DISTINCT FROM (CASE WHEN f.function_name IN('catalog_onboarding_result_projection_v2','public_effective_product_projection','public_campaign_product_projection')THEN '{celebix_saas_owner=X/celebix_saas_owner}' ELSE '{celebix_saas_owner=X/celebix_saas_owner,celebix_saas_app=X/celebix_saas_owner}' END)
   OR r.prosecdef IS DISTINCT FROM (f.function_name NOT IN('catalog_onboarding_result_projection_v2','public_effective_product_projection','public_campaign_product_projection'))
  THEN RAISE EXCEPTION 'VARIANT_ORDER271_PREDECESSOR_DRIFT:%',f.signature;END IF;
  clone:=replace(f.signature,'saas.'||f.function_name||'(','saas.variant_order271_'||f.function_name||'(');
  d:=replace(r.definition,'FUNCTION saas.'||f.function_name||'(','FUNCTION saas.variant_order271_'||f.function_name||'(');
  IF d=r.definition OR to_regprocedure(clone)IS NOT NULL THEN RAISE EXCEPTION 'VARIANT_ORDER271_CLONE_DRIFT';END IF;
  EXECUTE d;
  EXECUTE 'REVOKE ALL ON FUNCTION '||clone||' FROM PUBLIC';
  INSERT INTO saas.catalog_variant_order271_backup VALUES(f.signature,r.definition,f.body_hash,NULL,r.proowner,r.proacl,r.proconfig,clone);
 END LOOP;
END $backup$;
CREATE TABLE saas.catalog_variant_order_state(
 store_id uuid NOT NULL,product_id uuid NOT NULL,ordered_variant_ids uuid[] NOT NULL,created_variant_ids uuid[] NOT NULL DEFAULT '{}',
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740990),updated_at timestamptz NOT NULL CHECK(isfinite(updated_at)),
 PRIMARY KEY(store_id,product_id),FOREIGN KEY(store_id,product_id)REFERENCES saas.products(store_id,id)ON DELETE CASCADE,
 CHECK(cardinality(ordered_variant_ids)<=100 AND array_position(ordered_variant_ids,NULL::uuid)IS NULL),
 CHECK(cardinality(created_variant_ids)<=100 AND array_position(created_variant_ids,NULL::uuid)IS NULL)
);
CREATE TABLE saas.catalog_variant_order_operations(
 operation_id uuid PRIMARY KEY,store_id uuid NOT NULL,product_id uuid NOT NULL,fingerprint character(64)NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),
 result_payload jsonb NOT NULL CHECK(jsonb_typeof(result_payload)='object'AND pg_column_size(result_payload)<=16384),
 committed_at timestamptz NOT NULL CHECK(isfinite(committed_at)),FOREIGN KEY(store_id)REFERENCES saas.stores(id)ON DELETE RESTRICT
);
CREATE INDEX catalog_variant_order_operations_store_idx ON saas.catalog_variant_order_operations(store_id,product_id,committed_at);
ALTER TABLE saas.catalog_variant_order_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_variant_order_state FORCE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_variant_order_operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_variant_order_operations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.catalog_variant_order_state,saas.catalog_variant_order_operations FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
CREATE FUNCTION saas.catalog_variant_order_projection(p_store_id uuid,p_product_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('productId',p_product_id,'version',coalesce((SELECT version FROM saas.catalog_variant_order_state WHERE store_id=p_store_id AND product_id=p_product_id),0),
 'orderedVariantIds',coalesce((SELECT jsonb_agg(v.id ORDER BY array_position(s.ordered_variant_ids,v.id)NULLS LAST,v.created_at,v.id)
 FROM saas.product_variants v LEFT JOIN saas.catalog_variant_order_state s ON s.store_id=v.store_id AND s.product_id=v.product_id WHERE v.store_id=p_store_id AND v.product_id=p_product_id AND v.status='active'),'[]'))
$f$;
CREATE FUNCTION saas.catalog_variant_order_rank(p_store_id uuid,p_product_id uuid,p_variant_id uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT array_position(ordered_variant_ids,p_variant_id)FROM saas.catalog_variant_order_state WHERE store_id=p_store_id AND product_id=p_product_id
$f$;
CREATE FUNCTION saas.catalog_variant_order_sort_payload(p_store_id uuid,p_product_id uuid,p_payload jsonb,p_initial boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE ids uuid[];items jsonb;BEGIN
 IF p_payload IS NULL OR jsonb_typeof(p_payload->'variants')IS DISTINCT FROM 'array'THEN RETURN p_payload;END IF;
 SELECT CASE WHEN p_initial THEN created_variant_ids ELSE ordered_variant_ids END INTO ids FROM saas.catalog_variant_order_state WHERE store_id=p_store_id AND product_id=p_product_id;
 IF ids IS NULL OR cardinality(ids)=0 THEN RETURN p_payload;END IF;
 SELECT coalesce(jsonb_agg(item.value ORDER BY array_position(ids,coalesce(item.value->>'id',item.value->'variant'->>'id')::uuid)NULLS LAST,item.ordinality),'[]')INTO items FROM jsonb_array_elements(p_payload->'variants')WITH ORDINALITY item(value,ordinality);
 RETURN jsonb_set(p_payload,'{variants}',items);
END $f$;
CREATE FUNCTION saas.catalog_get_variant_order(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_product_id uuid) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;previous saas.catalog_variant_order_operations%ROWTYPE;current_version bigint;member_ids uuid[];result jsonb;BEGIN
 err:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
 IF err IS NULL THEN err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');END IF;
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_product_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id AND status<>'archived')THEN RETURN QUERY SELECT 'product_not_found',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',saas.catalog_variant_order_projection(p_store_id,p_product_id);
END $f$;
CREATE FUNCTION saas.catalog_reorder_variants(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_version bigint,p_variant_ids uuid[]) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;previous saas.catalog_variant_order_operations%ROWTYPE;current_version bigint;member_ids uuid[];result jsonb;BEGIN
 err:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
 IF err IS NULL THEN err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');END IF;
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_product_id IS NULL OR p_expected_version IS NULL OR p_expected_version<0 OR p_expected_version>=9007199254740990 OR p_variant_ids IS NULL OR cardinality(p_variant_ids)>100 OR array_position(p_variant_ids,NULL::uuid)IS NOT NULL OR(SELECT count(*)<>count(DISTINCT id)FROM unnest(p_variant_ids)t(id))THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog_variant_order:'||p_operation_id::text,0));
 SELECT * INTO previous FROM saas.catalog_variant_order_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
 IF previous.store_id<>p_store_id OR previous.fingerprint<>p_fingerprint OR previous.product_id<>p_product_id THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',jsonb_set(previous.result_payload,'{replayed}','true');END IF;RETURN;END IF;
 -- Product lock conflicts with concurrent variant insertion's FK key-share lock.
 PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=p_product_id AND status<>'archived'FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'product_not_found',NULL::jsonb;RETURN;END IF;
 PERFORM 1 FROM saas.product_variants WHERE store_id=p_store_id AND product_id=p_product_id ORDER BY id FOR UPDATE;
 SELECT coalesce(array_agg(id ORDER BY id),'{}'::uuid[])INTO member_ids FROM saas.product_variants WHERE store_id=p_store_id AND product_id=p_product_id AND status='active';
 IF cardinality(member_ids)<>cardinality(p_variant_ids)OR EXISTS(SELECT unnest(p_variant_ids)EXCEPT SELECT unnest(member_ids))THEN RETURN QUERY SELECT 'order_membership_changed',NULL::jsonb;RETURN;END IF;
 SELECT version INTO current_version FROM saas.catalog_variant_order_state WHERE store_id=p_store_id AND product_id=p_product_id FOR UPDATE;
 current_version:=coalesce(current_version,0);
 IF current_version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.catalog_variant_order_state(store_id,product_id,ordered_variant_ids,version,updated_at)VALUES(p_store_id,p_product_id,p_variant_ids,current_version+1,p_now)
 ON CONFLICT(store_id,product_id)DO UPDATE SET ordered_variant_ids=excluded.ordered_variant_ids,version=excluded.version,updated_at=excluded.updated_at;
 result:=saas.catalog_variant_order_projection(p_store_id,p_product_id)||jsonb_build_object('replayed',false);
 INSERT INTO saas.catalog_variant_order_operations VALUES(p_operation_id,p_store_id,p_product_id,p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'reordered',result;
END $f$;
CREATE FUNCTION saas.catalog_recover_variant_order(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;previous saas.catalog_variant_order_operations%ROWTYPE;current_version bigint;member_ids uuid[];result jsonb;BEGIN
 err:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
 IF err IS NULL THEN err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');END IF;
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO previous FROM saas.catalog_variant_order_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
 IF previous.store_id<>p_store_id OR previous.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'operation_replayed',jsonb_set(previous.result_payload,'{replayed}','true');END IF;RETURN;END IF;
 RETURN QUERY SELECT 'unavailable',NULL::jsonb;END $f$;
CREATE OR REPLACE FUNCTION saas.catalog_get_product_details_v3(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_product_id uuid,p_include_archived_variants boolean)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;BEGIN SELECT * INTO r FROM saas.variant_order271_catalog_get_product_details_v3(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_product_id,p_include_archived_variants);
 RETURN QUERY SELECT r.outcome,CASE WHEN r.outcome='found'THEN saas.catalog_variant_order_sort_payload(p_store_id,p_product_id,r.result_payload)ELSE r.result_payload END;END $f$;
CREATE OR REPLACE FUNCTION saas.catalog_get_product_editor_with_origins(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_product_id uuid)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;BEGIN SELECT * INTO r FROM saas.variant_order271_catalog_get_product_editor_with_origins(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_product_id);
 RETURN QUERY SELECT r.outcome,CASE WHEN r.outcome='found'THEN saas.catalog_variant_order_sort_payload(p_store_id,p_product_id,r.result_payload)ELSE r.result_payload END;END $f$;
CREATE OR REPLACE FUNCTION saas.catalog_onboarding_result_projection_v2(p_store_id uuid,p_product_id uuid)RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT saas.catalog_variant_order_sort_payload(p_store_id,p_product_id,saas.variant_order271_catalog_onboarding_result_projection_v2(p_store_id,p_product_id))
$f$;
CREATE OR REPLACE FUNCTION saas.public_effective_product_projection(p_store_id uuid,p_product_id uuid,p_now timestamptz)RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT saas.catalog_variant_order_sort_payload(p_store_id,p_product_id,saas.variant_order271_public_effective_product_projection(p_store_id,p_product_id,p_now))
$f$;
CREATE OR REPLACE FUNCTION saas.public_campaign_product_projection(p_store_id uuid,p_product_id uuid,p_now timestamptz)RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT saas.catalog_variant_order_sort_payload(p_store_id,p_product_id,saas.variant_order271_public_campaign_product_projection(p_store_id,p_product_id,p_now))
$f$;
-- Preview omits variant IDs; sort at its actual row source rather than guessing identity from title.
DO $preview$ DECLARE d text;old text:='ORDER BY variant.created_at,variant.id';BEGIN
 SELECT definition INTO d FROM saas.catalog_variant_order271_backup WHERE signature LIKE 'saas.catalog_get_product_preview_v2(%';
 IF(length(d)-length(replace(d,old,'')))/length(old)<>1 THEN RAISE EXCEPTION 'VARIANT_ORDER271_PREVIEW_PATCH_DRIFT';END IF;
 EXECUTE replace(d,old,'ORDER BY saas.catalog_variant_order_rank(p_store_id,p_product_id,variant.id) NULLS LAST,variant.created_at,variant.id');
END $preview$;
CREATE OR REPLACE FUNCTION saas.catalog_onboard_product_with_origins(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_variant_ids uuid[],p_intent jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;actual_product uuid;BEGIN
 SELECT * INTO r FROM saas.variant_order271_catalog_onboard_product_with_origins(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_ids,p_intent);
 IF r.outcome='created'THEN
 INSERT INTO saas.catalog_variant_order_state(store_id,product_id,ordered_variant_ids,created_variant_ids,version,updated_at)VALUES(p_store_id,p_product_id,p_variant_ids,p_variant_ids,1,p_now)ON CONFLICT DO NOTHING;END IF;
 actual_product:=(r.result_payload->'product'->>'id')::uuid;
 RETURN QUERY SELECT r.outcome,CASE WHEN r.outcome IN('created','operation_replayed')THEN saas.catalog_variant_order_sort_payload(p_store_id,actual_product,r.result_payload,true)ELSE r.result_payload END;
END $f$;
CREATE OR REPLACE FUNCTION saas.catalog_create_variants_batch_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_variant_ids uuid[],p_variants jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;ids uuid[];BEGIN
 SELECT * INTO r FROM saas.variant_order271_catalog_create_variants_batch_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_ids,p_variants);
 IF r.outcome='created'THEN
 SELECT coalesce(array_agg(v.id ORDER BY saas.catalog_variant_order_rank(p_store_id,p_product_id,v.id)NULLS LAST,v.created_at,v.id),'{}'::uuid[])INTO ids FROM saas.product_variants v WHERE v.store_id=p_store_id AND v.product_id=p_product_id AND v.status='active'AND NOT(v.id=ANY(p_variant_ids));
 INSERT INTO saas.catalog_variant_order_state(store_id,product_id,ordered_variant_ids,version,updated_at)VALUES(p_store_id,p_product_id,ids||p_variant_ids,1,p_now)
 ON CONFLICT(store_id,product_id)DO UPDATE SET ordered_variant_ids=excluded.ordered_variant_ids,version=catalog_variant_order_state.version+1,updated_at=excluded.updated_at;END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;END $f$;
DO $privileges$ DECLARE r record;BEGIN
 FOR r IN SELECT p.oid::regprocedure signature FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND p.proname IN('catalog_variant_order_projection','catalog_variant_order_rank','catalog_variant_order_sort_payload','catalog_get_variant_order','catalog_reorder_variants','catalog_recover_variant_order')LOOP
 EXECUTE 'REVOKE ALL ON FUNCTION '||r.signature||' FROM PUBLIC';END LOOP;
END $privileges$;
GRANT EXECUTE ON FUNCTION saas.catalog_get_variant_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid)TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_reorder_variants(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid[])TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.catalog_recover_variant_order(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text)TO celebix_saas_app;
CREATE TABLE saas.catalog_variant_order271_functions(signature text PRIMARY KEY,body_hash text NOT NULL,owner_oid oid NOT NULL,acl aclitem[],config text[],definer boolean NOT NULL,volatility "char" NOT NULL);
REVOKE ALL ON saas.catalog_variant_order271_functions FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
INSERT INTO saas.catalog_variant_order271_functions
 SELECT p.oid::regprocedure::text,encode(sha256(convert_to(pg_get_functiondef(p.oid),'UTF8')),'hex'),p.proowner,p.proacl,p.proconfig,p.prosecdef,p.provolatile
 FROM pg_proc p WHERE p.pronamespace='saas'::regnamespace AND(p.oid IN(SELECT signature::regprocedure::oid FROM saas.catalog_variant_order271_backup)OR p.oid IN(SELECT clone_signature::regprocedure::oid FROM saas.catalog_variant_order271_backup)OR p.proname IN('catalog_variant_order_projection','catalog_variant_order_rank','catalog_variant_order_sort_payload','catalog_get_variant_order','catalog_reorder_variants','catalog_recover_variant_order'));
UPDATE saas.catalog_variant_order271_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex');
COMMIT;
