BEGIN;
SET LOCAL ROLE celebix_saas_owner;

-- Existing product codes are kept. Protect this new internal range before
-- issuing codes from it, including codes entered manually before rollout.
DO $preflight$
BEGIN
  IF EXISTS(
    SELECT 1 FROM saas.product_variants
    WHERE barcode ~ '^(98|99)[0-9]{11}$'
    GROUP BY store_id,barcode HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'internal_ean13_existing_product_barcode_duplicate'; END IF;
  IF EXISTS(
    SELECT 1 FROM saas.barcode_label_operations
    WHERE operation_kind='reserve_internal'
      AND result_payload->>'barcode' ~ '^(98|99)[0-9]{11}$'
    GROUP BY store_id,(result_payload->>'barcode') HAVING count(*)>1
  ) THEN RAISE EXCEPTION 'internal_ean13_existing_reservation_duplicate'; END IF;
END
$preflight$;

CREATE UNIQUE INDEX product_variants_store_ean13_internal_barcode_key
  ON saas.product_variants(store_id,barcode)
  WHERE barcode ~ '^(98|99)[0-9]{11}$';

CREATE UNIQUE INDEX barcode_label_operations_store_ean13_reservation_key
  ON saas.barcode_label_operations(store_id,(result_payload->>'barcode'))
  WHERE operation_kind='reserve_internal'
    AND result_payload->>'barcode' ~ '^(98|99)[0-9]{11}$';

CREATE FUNCTION saas.barcode_label_next_ean13_internal(p_store_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE
  attempt integer;
  position integer;
  weighted_sum integer;
  base_code text;
  internal_code text;
BEGIN
  IF p_store_id IS NULL THEN RAISE EXCEPTION 'internal_ean13_store_required'; END IF;

  -- The lock spans allocation and the caller's insert/update. A pending
  -- reservation must be visible before another request chooses a candidate.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.barcode.ean13:' || p_store_id::text,0));
  FOR attempt IN 1..256 LOOP
    base_code:=(CASE WHEN pg_catalog.random()<0.5 THEN '98' ELSE '99' END)
      ||pg_catalog.lpad(pg_catalog.floor(pg_catalog.random()*10000000000)::bigint::text,10,'0');
    weighted_sum:=0;
    FOR position IN 1..12 LOOP
      weighted_sum:=weighted_sum+pg_catalog.substr(base_code,position,1)::integer
        *CASE WHEN position%2=1 THEN 1 ELSE 3 END;
    END LOOP;
    internal_code:=base_code||((10-weighted_sum%10)%10)::text;

    IF NOT EXISTS(
      SELECT 1 FROM saas.product_variants
      WHERE store_id=p_store_id AND barcode=internal_code
        AND barcode ~ '^(98|99)[0-9]{11}$'
    ) AND NOT EXISTS(
      SELECT 1 FROM saas.barcode_label_operations
      WHERE store_id=p_store_id AND operation_kind='reserve_internal'
        AND result_payload->>'barcode'=internal_code
        AND result_payload->>'barcode' ~ '^(98|99)[0-9]{11}$'
    ) THEN RETURN internal_code; END IF;
  END LOOP;
  RAISE EXCEPTION 'internal_ean13_barcode_allocation_exhausted';
END
$function$;

CREATE FUNCTION saas.barcode_label_reserve_ean13_internal(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE
  authority_error text;
  existing saas.barcode_label_operations%ROWTYPE;
  fingerprint text:=pg_catalog.md5('reserve_internal_ean13');
  internal_code text;
  result jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.barcode.reserve:' || p_operation_id::text,0));
  SELECT * INTO existing FROM saas.barcode_label_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id<>p_store_id OR existing.operation_kind<>'reserve_internal'
      OR existing.operation_fingerprint<>fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'reserved',pg_catalog.jsonb_set(existing.result_payload,'{replayed}','true'::jsonb);
    END IF;
    RETURN;
  END IF;

  internal_code:=saas.barcode_label_next_ean13_internal(p_store_id);
  result:=pg_catalog.jsonb_build_object('barcode',internal_code,'replayed',false);
  INSERT INTO saas.barcode_label_operations(
    operation_id,store_id,operation_kind,operation_fingerprint,result_payload,committed_at
  ) VALUES(p_operation_id,p_store_id,'reserve_internal',fingerprint,result,p_now);
  RETURN QUERY SELECT 'reserved',result;
END
$function$;

CREATE FUNCTION saas.barcode_label_generate_ean13_internal(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_targets jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE
  authority_error text;
  fingerprint text;
  existing saas.barcode_label_operations%ROWTYPE;
  target jsonb;
  selected saas.product_variants%ROWTYPE;
  succeeded jsonb:='[]'::jsonb;
  failed jsonb:='[]'::jsonb;
  internal_code text;
  result jsonb;
  owned_count integer:=0;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR pg_catalog.jsonb_typeof(p_targets) IS DISTINCT FROM 'array'
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF pg_catalog.jsonb_array_length(p_targets) NOT BETWEEN 1 AND 200
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_targets) item
      WHERE pg_catalog.jsonb_typeof(item)<>'object'
        OR NOT(item?&ARRAY['variantId','expectedVersion'])
        OR item-(ARRAY['variantId','expectedVersion']::text[])<>'{}'::jsonb
        OR COALESCE(item->>'variantId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR COALESCE(item->>'expectedVersion','') !~ '^[1-9][0-9]{0,15}$')
    OR (SELECT count(*)<>count(DISTINCT item->>'variantId')
        FROM pg_catalog.jsonb_array_elements(p_targets) item)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  -- Version the fingerprint so an in-flight legacy operation cannot replay a
  -- historical 9-digit result through the new API after a rolling deployment.
  fingerprint:=pg_catalog.md5('ean13_internal:'||p_targets::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.barcode.generate:' || p_operation_id::text,0));
  SELECT * INTO existing FROM saas.barcode_label_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN
    IF existing.store_id<>p_store_id OR existing.operation_kind<>'generate_internal'
      OR existing.operation_fingerprint<>fingerprint THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'operation_replayed',pg_catalog.jsonb_set(existing.result_payload,'{replayed}','true'::jsonb);
    END IF;
    RETURN;
  END IF;

  PERFORM variant.id FROM saas.product_variants variant
    JOIN pg_catalog.jsonb_array_elements(p_targets) target_row
      ON variant.id=(target_row->>'variantId')::uuid
    WHERE variant.store_id=p_store_id AND variant.status='active'
    ORDER BY variant.id FOR UPDATE;
  GET DIAGNOSTICS owned_count=ROW_COUNT;
  IF owned_count<>pg_catalog.jsonb_array_length(p_targets)
  THEN RETURN QUERY SELECT 'variant_not_found',NULL::jsonb; RETURN; END IF;

  FOR target IN SELECT value FROM pg_catalog.jsonb_array_elements(p_targets) LOOP
    SELECT * INTO selected FROM saas.product_variants
      WHERE store_id=p_store_id AND id=(target->>'variantId')::uuid
        AND status='active' FOR UPDATE;
    IF selected.barcode IS NOT NULL THEN
      failed:=failed||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'variantId',selected.id,'code','existing_barcode'));
    ELSIF selected.version<>(target->>'expectedVersion')::bigint THEN
      failed:=failed||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'variantId',selected.id,'code','version_conflict'));
    ELSE
      internal_code:=saas.barcode_label_next_ean13_internal(p_store_id);
      UPDATE saas.product_variants
        SET barcode=internal_code,version=version+1,updated_at=p_now
        WHERE store_id=p_store_id AND id=selected.id AND barcode IS NULL;
      succeeded:=succeeded||pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
        'variantId',selected.id,'barcode',internal_code,'version',selected.version+1));
    END IF;
  END LOOP;
  result:=pg_catalog.jsonb_build_object(
    'succeeded',succeeded,'failed',failed,'replayed',false);
  INSERT INTO saas.barcode_label_operations VALUES(
    p_operation_id,p_store_id,'generate_internal',fingerprint,result,p_now);
  RETURN QUERY SELECT 'generated',result;
END
$function$;

REVOKE ALL ON FUNCTION saas.barcode_label_next_ean13_internal(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_reserve_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_generate_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.barcode_label_reserve_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.barcode_label_generate_ean13_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb) TO celebix_saas_app;
COMMIT;
