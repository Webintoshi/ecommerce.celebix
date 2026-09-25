BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.barcode_label_operations
  DROP CONSTRAINT barcode_label_operations_operation_kind_check;
ALTER TABLE saas.barcode_label_operations
  ADD CONSTRAINT barcode_label_operations_operation_kind_check
  CHECK (operation_kind IN ('save_template','archive_template','generate_internal','reserve_internal','create_job'));

CREATE FUNCTION saas.barcode_label_reserve_internal(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE authority_error text; existing saas.barcode_label_operations%ROWTYPE;
  sequence_value bigint; internal_code text; result jsonb;
BEGIN
  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_operation_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;

  -- Serialize the same idempotency key before reading its result. Different keys
  -- remain concurrent and share the existing per-store sequence atomically.
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

  LOOP
    INSERT INTO saas.barcode_label_sequences(store_id,last_value,updated_at)
      VALUES(p_store_id,1,p_now)
      ON CONFLICT(store_id) DO UPDATE
        SET last_value=saas.barcode_label_sequences.last_value+1,updated_at=EXCLUDED.updated_at
        WHERE saas.barcode_label_sequences.last_value<999999999999
      RETURNING last_value INTO sequence_value;
    IF sequence_value IS NULL THEN RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN; END IF;
    internal_code:='CXI-'||pg_catalog.lpad(sequence_value::text,12,'0');
    EXIT WHEN NOT EXISTS(SELECT 1 FROM saas.product_variants
      WHERE store_id=p_store_id AND barcode=internal_code);
  END LOOP;
  result:=pg_catalog.jsonb_build_object('barcode',internal_code,'replayed',false);
  INSERT INTO saas.barcode_label_operations(operation_id,store_id,operation_kind,operation_fingerprint,result_payload,committed_at)
    VALUES(p_operation_id,p_store_id,'reserve_internal',pg_catalog.md5('reserve_internal'),result,p_now);
  RETURN QUERY SELECT 'reserved',result;
END
$function$;

REVOKE ALL ON FUNCTION saas.barcode_label_reserve_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.barcode_label_reserve_internal(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid) TO celebix_saas_app;
COMMIT;
