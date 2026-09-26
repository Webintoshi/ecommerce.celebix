BEGIN;
SET LOCAL ROLE celebix_saas_owner;

-- Metadata only: no quantity, reference-price, shipment or payment semantics change.
CREATE FUNCTION saas.catalog_measurements_valid(p_value jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
DECLARE item record; quantity numeric; units text[];
BEGIN
  IF p_value IS NULL OR pg_catalog.jsonb_typeof(p_value) IS DISTINCT FROM 'object'
    OR p_value='{}'::jsonb OR p_value-ARRAY['weight','volume','length','width','depth','height','area','packageCount']::text[]<>'{}'::jsonb
  THEN RETURN false; END IF;
  FOR item IN SELECT key,value FROM pg_catalog.jsonb_each(p_value) LOOP
    IF item.key='packageCount' THEN
      IF pg_catalog.jsonb_typeof(item.value) IS DISTINCT FROM 'number' THEN RETURN false; END IF;
      quantity:=(item.value#>>'{}')::numeric;
    ELSE
      IF NOT saas.catalog_onboarding_json_exact(item.value,ARRAY['valueMilli','unit'])
        OR pg_catalog.jsonb_typeof(item.value->'valueMilli') IS DISTINCT FROM 'number'
        OR pg_catalog.jsonb_typeof(item.value->'unit') IS DISTINCT FROM 'string'
      THEN RETURN false; END IF;
      units:=CASE item.key WHEN 'weight' THEN ARRAY['g','kg'] WHEN 'volume' THEN ARRAY['ml','l']
        WHEN 'area' THEN ARRAY['m2'] ELSE ARRAY['cm','m'] END;
      IF NOT (item.value->>'unit'=ANY(units)) THEN RETURN false; END IF;
      quantity:=(item.value->>'valueMilli')::numeric;
    END IF;
    IF quantity<>pg_catalog.trunc(quantity) OR quantity NOT BETWEEN 1 AND 9007199254740991 THEN RETURN false; END IF;
  END LOOP;
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION saas.catalog_measurements_valid(jsonb) FROM PUBLIC;

ALTER TABLE saas.product_variants ADD COLUMN measurements jsonb,
  ADD CONSTRAINT product_variants_measurements_valid CHECK(measurements IS NULL OR saas.catalog_measurements_valid(measurements));

-- Apply only verified single anchors. Drift aborts this entire transaction.
CREATE FUNCTION saas.catalog_measurements_patch_once(p_source text,p_before text,p_after text)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $function$
BEGIN
 IF (pg_catalog.length(p_source)-pg_catalog.length(pg_catalog.replace(p_source,p_before,'')))<>pg_catalog.length(p_before)
 THEN RAISE EXCEPTION 'MEASUREMENT_PREDECESSOR_DRIFT:%',p_before; END IF;
 RETURN pg_catalog.replace(p_source,p_before,p_after);
END $function$;
REVOKE ALL ON FUNCTION saas.catalog_measurements_patch_once(text,text,text) FROM PUBLIC;

CREATE FUNCTION saas.catalog_variant_projection_v2(p_variant_id uuid)
RETURNS jsonb LANGUAGE sql STABLE STRICT SET search_path=pg_catalog,saas AS $function$
 SELECT saas.catalog_variant_projection(p_variant_id) || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('measurements',variant.measurements))
 FROM saas.product_variants variant WHERE variant.id=p_variant_id
$function$;
REVOKE ALL ON FUNCTION saas.catalog_variant_projection_v2(uuid) FROM PUBLIC;

DO $result_projection$
DECLARE definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef('saas.catalog_onboarding_result_projection(uuid,uuid)'::regprocedure);
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_onboarding_result_projection(','saas.catalog_onboarding_result_projection_v2(');
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_variant_projection(variant.id)','saas.catalog_variant_projection_v2(variant.id)');
 EXECUTE definition;
END $result_projection$;
REVOKE ALL ON FUNCTION saas.catalog_onboarding_result_projection_v2(uuid,uuid) FROM PUBLIC;

CREATE FUNCTION saas.catalog_get_product_details_v3(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_product_id uuid,p_include_archived_variants boolean
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE prior_outcome text; prior_payload jsonb; variants jsonb;
BEGIN
 SELECT source.outcome,source.result_payload INTO prior_outcome,prior_payload
 FROM saas.catalog_get_product_details_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_product_id,p_include_archived_variants) source;
 IF prior_outcome IS DISTINCT FROM 'found' THEN RETURN QUERY SELECT prior_outcome,prior_payload; RETURN; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(item.value || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('measurements',variant.measurements)) ORDER BY item.position),'[]'::jsonb)
 INTO variants FROM pg_catalog.jsonb_array_elements(prior_payload->'variants') WITH ORDINALITY item(value,position)
 JOIN saas.product_variants variant ON variant.id=(item.value->>'id')::uuid AND variant.store_id=p_store_id AND variant.product_id=p_product_id;
 RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_set(prior_payload,'{variants}',variants);
END $function$;
REVOKE ALL ON FUNCTION saas.catalog_get_product_details_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_details_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,boolean) TO celebix_saas_app;

CREATE FUNCTION saas.catalog_get_product_editor_v2(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_product_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE prior_outcome text; prior_payload jsonb; variants jsonb;
BEGIN
 SELECT source.outcome,source.result_payload INTO prior_outcome,prior_payload
 FROM saas.catalog_get_product_editor(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_product_id) source;
 IF prior_outcome IS DISTINCT FROM 'found' THEN RETURN QUERY SELECT prior_outcome,prior_payload; RETURN; END IF;
 SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_set(item.value,'{variant}',(item.value->'variant') || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('measurements',variant.measurements))) ORDER BY item.position),'[]'::jsonb)
 INTO variants FROM pg_catalog.jsonb_array_elements(prior_payload->'variants') WITH ORDINALITY item(value,position)
 JOIN saas.product_variants variant ON variant.id=(item.value->'variant'->>'id')::uuid AND variant.store_id=p_store_id AND variant.product_id=p_product_id;
 RETURN QUERY SELECT 'found'::text,pg_catalog.jsonb_set(prior_payload,'{variants}',variants);
END $function$;
REVOKE ALL ON FUNCTION saas.catalog_get_product_editor_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_product_editor_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid) TO celebix_saas_app;

DO $clone_create_product$
DECLARE definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef('saas.catalog_create_product_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure);
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_create_product_implementation_v1(','saas.catalog_create_product_measurements_implementation(');
 definition:=saas.catalog_measurements_patch_once(definition,'p_attributes jsonb)','p_attributes jsonb, p_measurements jsonb)');
 definition:=saas.catalog_measurements_patch_once(definition,'OR p_fingerprint !~ ''^[a-f0-9]{64}$''',
   'OR (p_measurements IS NOT NULL AND p_measurements<>''null''::jsonb AND NOT saas.catalog_measurements_valid(p_measurements)) OR p_fingerprint !~ ''^[a-f0-9]{64}$''');
 definition:=saas.catalog_measurements_patch_once(definition,'  projection := pg_catalog.jsonb_build_object(',E'  UPDATE saas.product_variants SET measurements=NULLIF(p_measurements,''null''::jsonb) WHERE id=p_variant_id AND store_id=p_store_id AND product_id=p_product_id;
  projection := pg_catalog.jsonb_build_object(');
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_variant_projection(p_variant_id)','saas.catalog_variant_projection_v2(p_variant_id)');
 EXECUTE definition;
END $clone_create_product$;
REVOKE ALL ON FUNCTION saas.catalog_create_product_measurements_implementation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb) FROM PUBLIC,celebix_saas_app;

DO $wrapper_create_product$
DECLARE definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef('saas.catalog_create_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure);
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_create_product(','saas.catalog_create_product_measurements(');
 definition:=saas.catalog_measurements_patch_once(definition,'p_attributes jsonb)','p_attributes jsonb, p_measurements jsonb)');
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_create_product_implementation_v1(','saas.catalog_create_product_measurements_implementation(');
 definition:=saas.catalog_measurements_patch_once(definition,'p_stock_quantity,p_attributes);','p_stock_quantity,p_attributes,p_measurements);');
 EXECUTE definition;
END $wrapper_create_product$;
REVOKE ALL ON FUNCTION saas.catalog_create_product_measurements(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_create_product_measurements(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,text,text,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb) TO celebix_saas_app;

DO $clone_create_variant$
DECLARE definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef('saas.catalog_create_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure);
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_create_variant_implementation_v1(','saas.catalog_create_variant_measurements_implementation(');
 definition:=saas.catalog_measurements_patch_once(definition,'p_attributes jsonb)','p_attributes jsonb, p_measurements jsonb)');
 definition:=saas.catalog_measurements_patch_once(definition,'OR p_fingerprint !~ ''^[a-f0-9]{64}$''',
   'OR (p_measurements IS NOT NULL AND p_measurements<>''null''::jsonb AND NOT saas.catalog_measurements_valid(p_measurements)) OR p_fingerprint !~ ''^[a-f0-9]{64}$''');
 definition:=saas.catalog_measurements_patch_once(definition,'  projection := pg_catalog.jsonb_build_object(',E'  UPDATE saas.product_variants SET measurements=NULLIF(p_measurements,''null''::jsonb) WHERE id=p_variant_id AND store_id=p_store_id AND product_id=p_product_id;
  projection := pg_catalog.jsonb_build_object(');
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_variant_projection(p_variant_id)','saas.catalog_variant_projection_v2(p_variant_id)');
 EXECUTE definition;
END $clone_create_variant$;
REVOKE ALL ON FUNCTION saas.catalog_create_variant_measurements_implementation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb) FROM PUBLIC,celebix_saas_app;

DO $wrapper_create_variant$
DECLARE definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef('saas.catalog_create_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure);
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_create_variant(','saas.catalog_create_variant_measurements(');
 definition:=saas.catalog_measurements_patch_once(definition,'p_attributes jsonb)','p_attributes jsonb, p_measurements jsonb)');
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_create_variant_implementation_v1(','saas.catalog_create_variant_measurements_implementation(');
 definition:=saas.catalog_measurements_patch_once(definition,'p_stock_quantity,p_attributes);','p_stock_quantity,p_attributes,p_measurements);');
 EXECUTE definition;
END $wrapper_create_variant$;
REVOKE ALL ON FUNCTION saas.catalog_create_variant_measurements(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_create_variant_measurements(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb) TO celebix_saas_app;

DO $clone_update_variant$
DECLARE definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef('saas.catalog_update_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure);
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_update_variant_implementation_v1(','saas.catalog_update_variant_measurements_implementation(');
 definition:=saas.catalog_measurements_patch_once(definition,'p_attributes jsonb)','p_attributes jsonb, p_measurements jsonb)');
 definition:=saas.catalog_measurements_patch_once(definition,'OR p_fingerprint !~ ''^[a-f0-9]{64}$''',
   'OR (p_measurements IS NOT NULL AND p_measurements<>''null''::jsonb AND NOT saas.catalog_measurements_valid(p_measurements)) OR p_fingerprint !~ ''^[a-f0-9]{64}$''');
 definition:=saas.catalog_measurements_patch_once(definition,'      attributes = p_attributes,','      attributes = p_attributes, measurements = CASE WHEN p_measurements IS NULL THEN current_variant.measurements WHEN p_measurements=''null''::jsonb THEN NULL ELSE p_measurements END,');
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_variant_projection(p_variant_id)','saas.catalog_variant_projection_v2(p_variant_id)');
 EXECUTE definition;
END $clone_update_variant$;
REVOKE ALL ON FUNCTION saas.catalog_update_variant_measurements_implementation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb) FROM PUBLIC,celebix_saas_app;

DO $wrapper_update_variant$
DECLARE definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef('saas.catalog_update_variant(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure);
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_update_variant(','saas.catalog_update_variant_measurements(');
 definition:=saas.catalog_measurements_patch_once(definition,'p_attributes jsonb)','p_attributes jsonb, p_measurements jsonb)');
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_update_variant_implementation_v1(','saas.catalog_update_variant_measurements_implementation(');
 definition:=saas.catalog_measurements_patch_once(definition,'p_stock_quantity,p_attributes);','p_stock_quantity,p_attributes,p_measurements);');
 EXECUTE definition;
END $wrapper_update_variant$;
REVOKE ALL ON FUNCTION saas.catalog_update_variant_measurements(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_update_variant_measurements(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb) TO celebix_saas_app;

DO $onboarding$
DECLARE definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef('saas.catalog_onboard_product_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)'::regprocedure);
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_onboard_product_v2(','saas.catalog_onboard_product_v3(');
 definition:=saas.catalog_measurements_patch_once(definition,'ARRAY[''stockQuantity'',''categoryId'',''sku'']','ARRAY[''stockQuantity'',''categoryId'',''sku'',''measurements'']');
 definition:=saas.catalog_measurements_patch_once(definition,'OR pg_catalog.cardinality(p_variant_ids)<>1 THEN',
  'OR (p_intent ? ''measurements'' AND NOT saas.catalog_measurements_valid(p_intent->''measurements'')) OR pg_catalog.cardinality(p_variant_ids)<>1 THEN');
 definition:=saas.catalog_measurements_patch_once(definition,'ARRAY[''sku'',''barcode'',''compareAtCents'',''costCents'',''unitPricing'',''shippingDesiMilli'',''hsCode'']',
  'ARRAY[''sku'',''barcode'',''compareAtCents'',''costCents'',''unitPricing'',''shippingDesiMilli'',''hsCode'',''measurements'']');
 definition:=saas.catalog_measurements_patch_once(definition,'OR NOT saas.catalog_attributes_are_valid(variant_value->''attributes'')',
  'OR (variant_value ? ''measurements'' AND NOT saas.catalog_measurements_valid(variant_value->''measurements'')) OR NOT saas.catalog_attributes_are_valid(variant_value->''attributes'')');
 definition:=saas.catalog_measurements_patch_once(definition,E'
      INSERT INTO saas.catalog_variant_commerce_profiles(',
  E'
      UPDATE saas.product_variants SET measurements=p_intent->''measurements'' WHERE id=p_variant_ids[1] AND store_id=p_store_id AND product_id=p_product_id;\n      INSERT INTO saas.catalog_variant_commerce_profiles(');
 definition:=saas.catalog_measurements_patch_once(definition,E'
        INSERT INTO saas.catalog_variant_commerce_profiles(',
  E'
        UPDATE saas.product_variants SET measurements=variant_value->''measurements'' WHERE id=requested_variant_id AND store_id=p_store_id AND product_id=p_product_id;\n        INSERT INTO saas.catalog_variant_commerce_profiles(');
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_onboarding_result_projection(p_store_id,p_product_id)','saas.catalog_onboarding_result_projection_v2(p_store_id,p_product_id)');
 EXECUTE definition;
END $onboarding$;
REVOKE ALL ON FUNCTION saas.catalog_onboard_product_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_onboard_product_v3(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) TO celebix_saas_app;

DO $batch$
DECLARE definition text;
BEGIN
 definition:=pg_catalog.pg_get_functiondef('saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)'::regprocedure);
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_create_variants_batch(','saas.catalog_create_variants_batch_v2(');
 definition:=saas.catalog_measurements_patch_once(definition,'ARRAY[''title'',''sku'',''barcode'',''priceCents'',''compareAtCents'',''costCents'',''stockTracking'',''stockQuantity'',''attributes'']',
  'ARRAY[''title'',''sku'',''barcode'',''priceCents'',''compareAtCents'',''costCents'',''stockTracking'',''stockQuantity'',''attributes'',''measurements'']');
 definition:=saas.catalog_measurements_patch_once(definition,'OR pg_catalog.jsonb_typeof(candidate->''priceCents'') IS DISTINCT FROM ''number''',
  'OR (candidate ? ''measurements'' AND candidate->''measurements''<>''null''::jsonb AND NOT saas.catalog_measurements_valid(candidate->''measurements'')) OR pg_catalog.jsonb_typeof(candidate->''priceCents'') IS DISTINCT FROM ''number''');
 definition:=saas.catalog_measurements_patch_once(definition,'    INSERT INTO saas.catalog_variant_commerce_profiles(',
  E'    UPDATE saas.product_variants SET measurements=NULLIF(candidate->''measurements'',''null''::jsonb) WHERE id=p_variant_ids[position::integer] AND store_id=p_store_id AND product_id=p_product_id;\n    INSERT INTO saas.catalog_variant_commerce_profiles(');
 definition:=saas.catalog_measurements_patch_once(definition,'saas.catalog_variant_projection(p_variant_ids[position::integer])','saas.catalog_variant_projection_v2(p_variant_ids[position::integer])');
 EXECUTE definition;
END $batch$;
REVOKE ALL ON FUNCTION saas.catalog_create_variants_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_create_variants_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) TO celebix_saas_app;

-- Profile/publish commands share fingerprints with legacy clients. Keep their ledger
-- snapshots on the legacy ABI and enrich only the new RPC response after authorization.
CREATE FUNCTION saas.catalog_measurements_enrich_result(p_store_id uuid,p_product_id uuid,p_payload jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $function$
 SELECT pg_catalog.jsonb_set(p_payload,'{variants}',COALESCE(pg_catalog.jsonb_agg((item.value-'measurements') || pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('measurements',CASE WHEN variant.version=(item.value->>'version')::bigint THEN variant.measurements ELSE NULL END)) ORDER BY item.position),'[]'::jsonb))
 FROM pg_catalog.jsonb_array_elements(p_payload->'variants') WITH ORDINALITY item(value,position)
 LEFT JOIN saas.product_variants variant ON variant.id=(item.value->>'id')::uuid AND variant.store_id=p_store_id AND variant.product_id=p_product_id
$function$;
REVOKE ALL ON FUNCTION saas.catalog_measurements_enrich_result(uuid,uuid,jsonb) FROM PUBLIC;
CREATE FUNCTION saas.catalog_update_merchandising_v2(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_profile_version bigint,p_payload jsonb
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE prior_outcome text; prior_payload jsonb;
BEGIN
 SELECT source.outcome,source.result_payload INTO prior_outcome,prior_payload
 FROM saas.catalog_update_merchandising(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_expected_profile_version,p_payload) source;
 RETURN QUERY SELECT prior_outcome,CASE WHEN prior_outcome IN('updated','operation_replayed') THEN saas.catalog_measurements_enrich_result(p_store_id,p_product_id,prior_payload) ELSE prior_payload END;
END $function$;
REVOKE ALL ON FUNCTION saas.catalog_update_merchandising_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_update_merchandising_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,jsonb) TO celebix_saas_app;
CREATE FUNCTION saas.catalog_publish_after_media_v2(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_product_id uuid,p_expected_product_version bigint,p_expected_media_count integer
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE prior_outcome text; prior_payload jsonb;
BEGIN
 SELECT source.outcome,source.result_payload INTO prior_outcome,prior_payload
 FROM saas.catalog_publish_after_media(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_expected_product_version,p_expected_media_count) source;
 RETURN QUERY SELECT prior_outcome,CASE WHEN prior_outcome IN('published','operation_replayed') THEN saas.catalog_measurements_enrich_result(p_store_id,p_product_id,prior_payload) ELSE prior_payload END;
END $function$;
REVOKE ALL ON FUNCTION saas.catalog_publish_after_media_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_publish_after_media_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,bigint,integer) TO celebix_saas_app;
DROP FUNCTION saas.catalog_measurements_patch_once(text,text,text);
COMMIT;
