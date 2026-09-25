BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE FUNCTION saas.barcode_label_next_numeric_internal(p_store_id uuid,p_now timestamptz)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE sequence_value bigint; internal_code text;
BEGIN
  LOOP
    INSERT INTO saas.barcode_label_sequences(store_id,last_value,updated_at)
      VALUES(p_store_id,1,p_now)
      ON CONFLICT(store_id) DO UPDATE
        SET last_value=saas.barcode_label_sequences.last_value+1,updated_at=EXCLUDED.updated_at
        WHERE saas.barcode_label_sequences.last_value<9999999
      RETURNING last_value INTO sequence_value;
    IF sequence_value IS NULL THEN RAISE EXCEPTION 'numeric_internal_barcode_sequence_exhausted'; END IF;
    internal_code:='97'||pg_catalog.lpad(sequence_value::text,7,'0');
    EXIT WHEN NOT EXISTS(SELECT 1 FROM saas.product_variants
      WHERE store_id=p_store_id AND barcode=internal_code);
  END LOOP;
  RETURN internal_code;
END
$function$;

CREATE FUNCTION saas.barcode_label_reserve_numeric_internal(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.barcode_label_operations%ROWTYPE;
  internal_code text; result jsonb;
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
      OR existing.operation_fingerprint<>pg_catalog.md5('reserve_internal') THEN
      RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
    ELSE
      RETURN QUERY SELECT 'reserved',pg_catalog.jsonb_set(existing.result_payload,'{replayed}','true'::jsonb);
    END IF;
    RETURN;
  END IF;

  internal_code:=saas.barcode_label_next_numeric_internal(p_store_id,p_now);
  result:=pg_catalog.jsonb_build_object('barcode',internal_code,'replayed',false);
  INSERT INTO saas.barcode_label_operations(operation_id,store_id,operation_kind,operation_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'reserve_internal',pg_catalog.md5('reserve_internal'),result,p_now);
  RETURN QUERY SELECT 'reserved',result;
END
$function$;

CREATE FUNCTION saas.barcode_label_generate_numeric_internal(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_targets jsonb
) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; fingerprint text; existing saas.barcode_label_operations%ROWTYPE;
  target jsonb; selected saas.product_variants%ROWTYPE; succeeded jsonb:='[]'::jsonb;
  failed jsonb:='[]'::jsonb; internal_code text; result jsonb; owned_count integer:=0;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL OR jsonb_typeof(p_targets) IS DISTINCT FROM 'array' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF jsonb_array_length(p_targets) NOT BETWEEN 1 AND 200 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_targets) item
      WHERE jsonb_typeof(item)<>'object' OR NOT(item?&ARRAY['variantId','expectedVersion']) OR item-(ARRAY['variantId','expectedVersion']::text[])<>'{}'::jsonb
        OR COALESCE(item->>'variantId','') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        OR COALESCE(item->>'expectedVersion','') !~ '^[1-9][0-9]{0,15}$')
    OR (SELECT count(*)<>count(DISTINCT item->>'variantId') FROM jsonb_array_elements(p_targets) item)
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  fingerprint:=md5(p_targets::text);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.barcode.generate:' || p_operation_id::text,0));
  SELECT * INTO existing FROM saas.barcode_label_operations WHERE operation_id=p_operation_id;
  IF FOUND THEN IF existing.store_id<>p_store_id OR existing.operation_kind<>'generate_internal' OR existing.operation_fingerprint<>fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',jsonb_set(existing.result_payload,'{replayed}','true'::jsonb); END IF; RETURN; END IF;
  PERFORM variant.id FROM saas.product_variants variant
    JOIN jsonb_array_elements(p_targets) target_row ON variant.id=(target_row->>'variantId')::uuid
    WHERE variant.store_id=p_store_id AND variant.status='active' ORDER BY variant.id FOR UPDATE;
  GET DIAGNOSTICS owned_count=ROW_COUNT;
  IF owned_count<>jsonb_array_length(p_targets) THEN RETURN QUERY SELECT 'variant_not_found',NULL::jsonb; RETURN; END IF;
  FOR target IN SELECT value FROM jsonb_array_elements(p_targets) LOOP
    SELECT * INTO selected FROM saas.product_variants WHERE store_id=p_store_id AND id=(target->>'variantId')::uuid AND status='active' FOR UPDATE;
    IF selected.barcode IS NOT NULL THEN failed:=failed||jsonb_build_array(jsonb_build_object('variantId',selected.id,'code','existing_barcode'));
    ELSIF selected.version<>(target->>'expectedVersion')::bigint THEN failed:=failed||jsonb_build_array(jsonb_build_object('variantId',selected.id,'code','version_conflict'));
    ELSE
      internal_code:=saas.barcode_label_next_numeric_internal(p_store_id,p_now);
      UPDATE saas.product_variants SET barcode=internal_code,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=selected.id AND barcode IS NULL;
      succeeded:=succeeded||jsonb_build_array(jsonb_build_object('variantId',selected.id,'barcode',internal_code,'version',selected.version+1));
    END IF;
  END LOOP;
  result:=jsonb_build_object('succeeded',succeeded,'failed',failed,'replayed',false);
  INSERT INTO saas.barcode_label_operations VALUES(p_operation_id,p_store_id,'generate_internal',fingerprint,result,p_now);
  RETURN QUERY SELECT 'generated',result;
END
$function$;

REVOKE ALL ON FUNCTION saas.barcode_label_next_numeric_internal(uuid,timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_reserve_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION saas.barcode_label_generate_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.barcode_label_reserve_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.barcode_label_generate_numeric_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,jsonb) TO celebix_saas_app;
COMMIT;
