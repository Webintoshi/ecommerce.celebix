-- Independent recommendation settings. No predecessor function, grant or table is modified.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $ready$ BEGIN
 IF to_regclass('saas.order_bump_settings') IS NOT NULL OR to_regclass('saas.order_bump_operations') IS NOT NULL
 OR to_regprocedure('saas.store_engagement_popup_delete(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint)') IS NULL
 OR to_regprocedure('saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text)') IS NULL
 OR to_regprocedure('saas.resolve_effective_variant_price(uuid,uuid,text,timestamptz,text)') IS NULL
 OR to_regprocedure('saas.storefront_available_stock(uuid,uuid,timestamptz,uuid)') IS NULL
 OR to_regprocedure('saas.variant_primary_media_id(uuid,uuid,uuid)') IS NULL
 OR to_regprocedure('saas.public_effective_product_projection(uuid,uuid,timestamptz)') IS NULL
 THEN RAISE EXCEPTION 'ORDER_BUMP_223_PREDECESSOR_INVALID';END IF;
END $ready$;

CREATE FUNCTION saas.order_bump_ids_valid(p_ids jsonb,p_min integer,p_max integer)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF jsonb_typeof(p_ids) IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 RETURN jsonb_array_length(p_ids) BETWEEN p_min AND p_max
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_ids) x WHERE saas.store_engagement_uuid_valid(x) IS DISTINCT FROM true)
 AND (SELECT count(DISTINCT x) FROM jsonb_array_elements(p_ids) x)=jsonb_array_length(p_ids);
END $f$;
CREATE FUNCTION saas.order_bump_config_valid(p_config jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE r jsonb;k text;
BEGIN
 IF saas.catalog_onboarding_json_exact(p_config,ARRAY['schemaVersion','enabled','heading','placements','maxOffers','rules'],ARRAY[]::text[]) IS DISTINCT FROM true
 OR p_config->'schemaVersion'<>'1'::jsonb OR jsonb_typeof(p_config->'enabled') IS DISTINCT FROM 'boolean'
 OR saas.store_engagement_text_valid(p_config->'heading',1,120) IS DISTINCT FROM true
 OR saas.catalog_onboarding_json_exact(p_config->'placements',ARRAY['sideCart','checkout'],ARRAY[]::text[]) IS DISTINCT FROM true
 OR jsonb_typeof(p_config->'placements'->'sideCart') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_config->'placements'->'checkout') IS DISTINCT FROM 'boolean'
 OR NOT(p_config->'placements'->'sideCart'='true'::jsonb OR p_config->'placements'->'checkout'='true'::jsonb)
 OR jsonb_typeof(p_config->'maxOffers') IS DISTINCT FROM 'number' OR p_config->>'maxOffers' NOT IN('1','2','3')
 OR jsonb_typeof(p_config->'rules') IS DISTINCT FROM 'array' THEN RETURN false;END IF;
 IF jsonb_array_length(p_config->'rules')>20 THEN RETURN false;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(p_config->'rules') LOOP
  IF saas.catalog_onboarding_json_exact(r,ARRAY['id','name','enabled','productIds','categoryIds','minSubtotalCents','maxSubtotalCents','variantIds'],ARRAY[]::text[]) IS DISTINCT FROM true
  OR saas.store_engagement_uuid_valid(r->'id') IS DISTINCT FROM true OR saas.store_engagement_text_valid(r->'name',1,160) IS DISTINCT FROM true
  OR jsonb_typeof(r->'enabled') IS DISTINCT FROM 'boolean'
  OR saas.order_bump_ids_valid(r->'productIds',0,20) IS DISTINCT FROM true OR saas.order_bump_ids_valid(r->'categoryIds',0,20) IS DISTINCT FROM true
  OR saas.order_bump_ids_valid(r->'variantIds',1,6) IS DISTINCT FROM true THEN RETURN false;END IF;
  FOREACH k IN ARRAY ARRAY['minSubtotalCents','maxSubtotalCents'] LOOP
   IF r->k<>'null'::jsonb AND(jsonb_typeof(r->k) IS DISTINCT FROM 'number' OR r->>k!~'^[0-9]+$' OR(r->>k)::numeric NOT BETWEEN 0 AND 8000000000) THEN RETURN false;END IF;
  END LOOP;
  IF r->'minSubtotalCents'<>'null'::jsonb AND r->'maxSubtotalCents'<>'null'::jsonb AND(r->>'minSubtotalCents')::bigint>(r->>'maxSubtotalCents')::bigint THEN RETURN false;END IF;
 END LOOP;
 RETURN(SELECT count(DISTINCT value->>'id') FROM jsonb_array_elements(p_config->'rules'))=jsonb_array_length(p_config->'rules');
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN false;
END $f$;
CREATE FUNCTION saas.order_bump_default_config()
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('schemaVersion',1,'enabled',false,'heading','Bunları da beğenebilirsiniz','placements',jsonb_build_object('sideCart',true,'checkout',true),'maxOffers',3,'rules','[]'::jsonb)
$f$;
CREATE TABLE saas.order_bump_settings(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id) ON DELETE RESTRICT,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),config jsonb NOT NULL CHECK(pg_column_size(config)<=65536 AND saas.order_bump_config_valid(config)),
 created_by uuid NOT NULL REFERENCES saas.principals(id),updated_by uuid NOT NULL REFERENCES saas.principals(id),
 created_at timestamptz NOT NULL,updated_at timestamptz NOT NULL,CHECK(isfinite(created_at) AND isfinite(updated_at) AND updated_at>=created_at)
);
CREATE TABLE saas.order_bump_operations(
 store_id uuid NOT NULL REFERENCES saas.stores(id),operation_id uuid NOT NULL,principal_id uuid NOT NULL REFERENCES saas.principals(id),membership_id uuid NOT NULL,
 fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),request_payload jsonb NOT NULL,result_payload jsonb NOT NULL,created_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,operation_id),FOREIGN KEY(store_id,membership_id) REFERENCES saas.memberships(store_id,id),FOREIGN KEY(membership_id,principal_id) REFERENCES saas.memberships(id,principal_id),
 CHECK(isfinite(created_at) AND pg_column_size(request_payload)<=70000 AND pg_column_size(result_payload)<=70000)
);
CREATE TRIGGER order_bump_operations_immutable BEFORE UPDATE OR DELETE ON saas.order_bump_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_merchant_admin_immutable();
DO $tables$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['order_bump_settings','order_bump_operations'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE saas.%I FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',t);
 END LOOP;
END $tables$;
CREATE FUNCTION saas.order_bump_workspace(p_settings saas.order_bump_settings)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_settings.store_id IS NULL THEN jsonb_build_object('version',0,'updatedAt',NULL,'config',saas.order_bump_default_config())
 ELSE jsonb_build_object('version',p_settings.version,'updatedAt',saas.storefront_design_timestamp(p_settings.updated_at),'config',p_settings.config) END
$f$;
CREATE FUNCTION saas.order_bump_settings_get(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;s saas.order_bump_settings;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 SELECT * INTO s FROM saas.order_bump_settings WHERE store_id=p_store;
 RETURN QUERY SELECT 'ok',saas.order_bump_workspace(s);
END $f$;
CREATE FUNCTION saas.order_bump_operation_get(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;op saas.order_bump_operations;BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT * INTO op FROM saas.order_bump_operations WHERE store_id=p_store AND operation_id=p_operation;
 IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;ELSIF op.principal_id<>p_principal OR op.fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;
END $f$;
CREATE FUNCTION saas.order_bump_settings_save(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation uuid,p_fingerprint text,p_expected_version bigint,p_config jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;s saas.order_bump_settings;op saas.order_bump_operations;request jsonb;result jsonb;r jsonb;k text;item jsonb;found_ref boolean;prior jsonb;
BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.manage');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_operation IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990
 OR p_now IS NULL OR NOT isfinite(p_now) OR saas.order_bump_config_valid(p_config) IS DISTINCT FROM true OR pg_column_size(p_config)>65536 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 request:=jsonb_build_object('action','save_order_bumps','expectedVersion',p_expected_version,'config',p_config);
 PERFORM pg_advisory_xact_lock(hashtextextended('order-bump-settings:'||p_store::text,223));
 SELECT * INTO op FROM saas.order_bump_operations WHERE store_id=p_store AND operation_id=p_operation;
 IF FOUND THEN IF op.principal_id<>p_principal OR op.fingerprint<>p_fingerprint OR op.request_payload<>request THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;ELSE RETURN QUERY SELECT 'replayed',op.result_payload;END IF;RETURN;END IF;
 SELECT * INTO s FROM saas.order_bump_settings WHERE store_id=p_store FOR UPDATE;
 IF coalesce(s.version,0)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF s.store_id IS NOT NULL AND p_now<s.updated_at THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 -- Existing unavailable selections may be retained while editing/disabling; new references must be active and same-store.
 FOR r IN SELECT value FROM jsonb_array_elements(p_config->'rules') LOOP
  FOREACH k IN ARRAY ARRAY['productIds','categoryIds','variantIds'] LOOP
   FOR item IN SELECT value FROM jsonb_array_elements(r->k) LOOP
    prior:=coalesce(s.config->'rules','[]'::jsonb);
    IF k='productIds' THEN SELECT EXISTS(SELECT 1 FROM saas.products x WHERE x.store_id=p_store AND x.id=(item#>>'{}')::uuid AND(x.status='active' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) old WHERE old->k @> jsonb_build_array(item)))) INTO found_ref;
    ELSIF k='categoryIds' THEN SELECT EXISTS(SELECT 1 FROM saas.catalog_categories x WHERE x.store_id=p_store AND x.id=(item#>>'{}')::uuid AND(x.status='active' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) old WHERE old->k @> jsonb_build_array(item)))) INTO found_ref;
    ELSE SELECT EXISTS(SELECT 1 FROM saas.product_variants x JOIN saas.products p ON p.store_id=x.store_id AND p.id=x.product_id WHERE x.store_id=p_store AND x.id=(item#>>'{}')::uuid AND(x.status='active' AND p.status='active' AND p.currency='TRY' OR EXISTS(SELECT 1 FROM jsonb_array_elements(prior) old WHERE old->k @> jsonb_build_array(item)))) INTO found_ref;END IF;
    IF NOT found_ref THEN RETURN QUERY SELECT 'invalid_reference',NULL::jsonb;RETURN;END IF;
   END LOOP;
  END LOOP;
 END LOOP;
 INSERT INTO saas.order_bump_settings(store_id,version,config,created_by,updated_by,created_at,updated_at)
 VALUES(p_store,p_expected_version+1,p_config,p_principal,p_principal,date_trunc('milliseconds',p_now),date_trunc('milliseconds',p_now))
 ON CONFLICT(store_id) DO UPDATE SET version=EXCLUDED.version,config=EXCLUDED.config,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at RETURNING * INTO s;
 result:=saas.order_bump_workspace(s);
 INSERT INTO saas.order_bump_operations(store_id,operation_id,principal_id,membership_id,fingerprint,request_payload,result_payload,created_at) VALUES(p_store,p_operation,p_principal,p_membership,p_fingerprint,request,result,date_trunc('milliseconds',p_now));
 RETURN QUERY SELECT 'saved',result;
END $f$;
CREATE FUNCTION saas.order_bump_options(p_store uuid,p_principal uuid,p_membership uuid,p_plan uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text,p_page integer,p_search text,p_product uuid,p_ids uuid[])
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text;items jsonb;total bigint;
BEGIN
 e:=saas.merchant_action_authority_error(p_store,p_principal,p_membership,p_plan,p_plan_code,p_plan_version,p_now,'catalog','configuration.read');IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb;RETURN;END IF;
 IF p_kind IS NULL OR p_kind NOT IN('product','category','variant') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 10000
 OR p_search IS NOT NULL AND(p_search<>btrim(p_search) OR char_length(p_search) NOT BETWEEN 1 AND 120 OR p_search~'[[:cntrl:]]')
 OR p_product IS NOT NULL AND p_kind<>'variant'
 OR p_ids IS NOT NULL AND(cardinality(p_ids) NOT BETWEEN 1 AND 400 OR array_position(p_ids,NULL) IS NOT NULL OR p_page<>1 OR p_search IS NOT NULL OR p_product IS NOT NULL OR(SELECT count(DISTINCT x) FROM unnest(p_ids) x)<>cardinality(p_ids))
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 WITH candidates AS MATERIALIZED(
  SELECT p.id,p.title label,NULL::uuid product_id,p.status='active' active_source FROM saas.products p WHERE p_kind='product' AND p.store_id=p_store AND(p_ids IS NOT NULL AND p.id=ANY(p_ids) OR p_ids IS NULL AND p.status='active')
  UNION ALL SELECT c.id,c.name,NULL::uuid,c.status='active' FROM saas.catalog_categories c WHERE p_kind='category' AND c.store_id=p_store AND(p_ids IS NOT NULL AND c.id=ANY(p_ids) OR p_ids IS NULL AND c.status='active')
  UNION ALL SELECT v.id,v.title,v.product_id,v.status='active' AND p.status='active' AND p.currency='TRY'
  FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id
  WHERE p_kind='variant' AND v.store_id=p_store AND(p_product IS NULL OR v.product_id=p_product) AND(p_ids IS NOT NULL AND v.id=ANY(p_ids) OR p_ids IS NULL AND v.status='active' AND p.status='active' AND p.currency='TRY')
 ),filtered AS MATERIALIZED(SELECT * FROM candidates WHERE p_ids IS NOT NULL OR p_search IS NULL OR strpos(lower(label),lower(p_search))>0),page AS MATERIALIZED(
  SELECT * FROM filtered ORDER BY CASE WHEN p_ids IS NOT NULL THEN array_position(p_ids,id) END,lower(label),id LIMIT CASE WHEN p_ids IS NULL THEN 20 ELSE 400 END OFFSET CASE WHEN p_ids IS NULL THEN(p_page-1)*20 ELSE 0 END
 ),projected AS(
  SELECT page.*,CASE WHEN p_kind='variant' AND r.outcome='found' AND r.price_cents BETWEEN 0 AND 8000000000 THEN r.price_cents END price_cents,
  coalesce(page.active_source AND(p_kind<>'variant' OR r.outcome='found' AND r.price_cents BETWEEN 0 AND 8000000000 AND coalesce(saas.storefront_available_stock(p_store,page.id,p_now,NULL),0)>0),false) available
  FROM page LEFT JOIN LATERAL saas.resolve_effective_variant_price(p_store,page.id,'storefront',p_now,NULL) r ON p_kind='variant'
 ) SELECT coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'label',label,'productId',product_id,'priceCents',price_cents,'available',available) ORDER BY CASE WHEN p_ids IS NOT NULL THEN array_position(p_ids,id) END,lower(label),id) FROM projected),'[]'::jsonb),(SELECT count(*) FROM filtered) INTO items,total;
 RETURN QUERY SELECT 'ok',jsonb_build_object('items',items,'page',p_page,'totalCount',total);
END $f$;
CREATE FUNCTION saas.order_bump_public_offers(p_hostname text,p_now timestamptz,p_credentials jsonb,p_placement text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE st uuid;cart saas.storefront_carts;config jsonb;product_payload jsonb;variant_payload jsonb;subtotal numeric;invalid_cart boolean;r jsonb;vid jsonb;v record;price record;offers jsonb:='[]'::jsonb;product_ids uuid[];offered_ids uuid[]:='{}'::uuid[];media jsonb;media_id uuid;empty jsonb:=jsonb_build_object('cartVersion',NULL,'heading',NULL,'offers','[]'::jsonb);
BEGIN
 IF p_now IS NULL OR NOT isfinite(p_now) OR saas.store_policy_hostname_valid(p_hostname) IS DISTINCT FROM true
 OR saas.storefront_credential_candidates_valid(p_credentials,true) IS DISTINCT FROM true OR p_placement IS NULL OR p_placement NOT IN('side_cart','checkout') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 st:=saas.storefront_public_store(p_hostname,p_now);IF st IS NULL THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 SELECT c.* INTO cart FROM saas.storefront_carts c JOIN saas.storefront_cart_credentials cred ON cred.store_id=c.store_id AND cred.cart_id=c.id
 WHERE c.store_id=st AND c.status='active' AND c.expires_at>p_now AND cred.expires_at>p_now AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_credentials) candidate WHERE candidate->>'keyId'=cred.key_id AND candidate->>'digest'=cred.credential_digest)
 ORDER BY c.created_at DESC,c.id LIMIT 1;
 IF NOT FOUND THEN RETURN QUERY SELECT 'ok',empty;RETURN;END IF;
 SELECT array_agg(DISTINCT i.product_id),sum(i.unit_price_cents::numeric*i.quantity),bool_or(p.id IS NULL OR p.status<>'active' OR p.currency<>'TRY' OR ci_variant.id IS NULL OR ci_variant.status<>'active' OR ci_price.outcome IS DISTINCT FROM 'found' OR ci_price.price_cents IS DISTINCT FROM i.unit_price_cents OR coalesce(saas.storefront_available_stock(st,i.variant_id,p_now,NULL),0)<i.quantity)
 INTO product_ids,subtotal,invalid_cart FROM saas.storefront_cart_items i LEFT JOIN saas.products p ON p.store_id=i.store_id AND p.id=i.product_id LEFT JOIN saas.product_variants ci_variant ON ci_variant.store_id=i.store_id AND ci_variant.id=i.variant_id AND ci_variant.product_id=i.product_id
 LEFT JOIN LATERAL saas.resolve_effective_variant_price(st,i.variant_id,'storefront',p_now,NULL) ci_price ON true WHERE i.store_id=st AND i.cart_id=cart.id;
 IF product_ids IS NULL OR invalid_cart OR subtotal>8000000000 THEN RETURN QUERY SELECT 'ok',empty;RETURN;END IF;
 SELECT s.config INTO config FROM saas.order_bump_settings s WHERE s.store_id=st;
 IF config IS NULL OR config->'enabled'<>'true'::jsonb OR config->'placements'->(CASE WHEN p_placement='side_cart' THEN 'sideCart' ELSE 'checkout' END)<>'true'::jsonb THEN RETURN QUERY SELECT 'ok',jsonb_build_object('cartVersion',cart.version,'heading',NULL,'offers','[]'::jsonb);RETURN;END IF;
 FOR r IN SELECT value FROM jsonb_array_elements(config->'rules') LOOP
  IF r->'enabled'<>'true'::jsonb OR r->'minSubtotalCents'<>'null'::jsonb AND subtotal<(r->>'minSubtotalCents')::bigint OR r->'maxSubtotalCents'<>'null'::jsonb AND subtotal>(r->>'maxSubtotalCents')::bigint THEN CONTINUE;END IF;
  IF jsonb_array_length(r->'productIds')>0 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'productIds') x WHERE x::uuid=ANY(product_ids)) THEN CONTINUE;END IF;
  IF jsonb_array_length(r->'categoryIds')>0 AND NOT EXISTS(SELECT 1 FROM saas.catalog_product_categories a JOIN saas.catalog_categories c ON c.store_id=a.store_id AND c.id=a.category_id AND c.status='active' WHERE a.store_id=st AND a.product_id=ANY(product_ids) AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(r->'categoryIds') x WHERE x::uuid=a.category_id)) THEN CONTINUE;END IF;
  FOR vid IN SELECT value FROM jsonb_array_elements(r->'variantIds') LOOP
   SELECT pv.*,p.slug,p.title product_title,p.currency,p.status product_status INTO v FROM saas.product_variants pv JOIN saas.products p ON p.store_id=pv.store_id AND p.id=pv.product_id WHERE pv.store_id=st AND pv.id=(vid#>>'{}')::uuid AND pv.status='active' AND p.status='active' AND p.currency='TRY';
   IF NOT FOUND OR v.product_id=ANY(product_ids) OR v.product_id=ANY(offered_ids) OR coalesce(saas.storefront_available_stock(st,v.id,p_now,NULL),0)<1 THEN CONTINUE;END IF;
   -- Publication and exact variant price come from the same canonical public product reader as catalog/detail.
   product_payload:=saas.public_effective_product_projection(st,v.product_id,p_now);
   IF product_payload IS NULL OR product_payload->>'currency' IS DISTINCT FROM 'TRY' THEN CONTINUE;END IF;
   SELECT value INTO variant_payload FROM jsonb_array_elements(product_payload->'variants') WHERE value->>'id'=v.id::text;
   IF variant_payload IS NULL OR variant_payload->'available' IS DISTINCT FROM 'true'::jsonb OR(variant_payload->>'priceCents')::numeric NOT BETWEEN 0 AND 8000000000 THEN CONTINUE;END IF;
   media_id:=saas.variant_primary_media_id(st,v.product_id,v.id);SELECT jsonb_strip_nulls(jsonb_build_object('url',m.public_url,'altText',coalesce(m.alt_text,''),'width',m.width,'height',m.height)) INTO media FROM saas.product_media m WHERE m.store_id=st AND m.product_id=v.product_id AND m.id=media_id AND m.status='active' AND m.object_deleted_at IS NULL AND m.media_type='image' AND m.public_url~'^https://[^/@# :]+([/?][^#]*)?$';
   offers:=offers||jsonb_build_array(jsonb_build_object('ruleId',r->>'id','productId',v.product_id,'variantId',v.id,'slug',product_payload->>'slug','title',product_payload->>'title','variantTitle',variant_payload->>'title','priceCents',(variant_payload->>'priceCents')::bigint,'currency','TRY','media',media));offered_ids:=array_append(offered_ids,v.product_id);
   IF jsonb_array_length(offers)>=(config->>'maxOffers')::integer THEN EXIT;END IF;
  END LOOP;
  IF jsonb_array_length(offers)>=(config->>'maxOffers')::integer THEN EXIT;END IF;
 END LOOP;
 RETURN QUERY SELECT 'ok',jsonb_build_object('cartVersion',cart.version,'heading',config->>'heading','offers',offers);
END $f$;
DO $grants$ DECLARE f record;BEGIN
 FOR f IN SELECT oid FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname LIKE 'order_bump_%' LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_identity,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',f.oid::regprocedure);
 END LOOP;
END $grants$;
GRANT EXECUTE ON FUNCTION saas.order_bump_settings_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.order_bump_operation_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text),saas.order_bump_settings_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,bigint,jsonb),saas.order_bump_options(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,integer,text,uuid,uuid[]) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.order_bump_public_offers(text,timestamptz,jsonb,text) TO celebix_saas_host_resolver;
COMMIT;
