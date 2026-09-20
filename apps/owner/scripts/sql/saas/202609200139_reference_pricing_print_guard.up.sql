-- Keep the established print-job writer and operation replay semantics, but
-- reject a newly requested label batch before insertion if any price cannot
-- be resolved. The shared catalog lock spans the entire batch snapshot.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';

ALTER FUNCTION saas.barcode_print_job_create(uuid,uuid,uuid,uuid,text,bigint,
  timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,jsonb)
RENAME TO barcode_print_job_create_without_price_guard;
REVOKE ALL ON FUNCTION saas.barcode_print_job_create_without_price_guard(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,
  text,text,integer,jsonb) FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.barcode_print_job_legacy_projection(p_payload jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE STRICT SECURITY DEFINER
SET search_path=pg_catalog,saas AS $fn$
  SELECT pg_catalog.jsonb_set(p_payload,'{items}',COALESCE(
    (SELECT pg_catalog.jsonb_agg(
      (item.value-'snapshot')||pg_catalog.jsonb_build_object('snapshot',
        (item.value->'snapshot')-'priceContext') ORDER BY item.ordinality)
     FROM pg_catalog.jsonb_array_elements(p_payload->'items')
       WITH ORDINALITY item(value,ordinality)),'[]'::jsonb))
$fn$;
REVOKE ALL ON FUNCTION saas.barcode_print_job_legacy_projection(jsonb)
  FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.barcode_print_job_create(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_job_id uuid,p_template_id uuid,p_template_version bigint,
  p_template_name text,p_template_config jsonb,p_output_type text,
  p_printer_profile text,p_start_cell integer,p_targets jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; target jsonb; priced jsonb; prior record;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,
    p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage');
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  -- An idempotent replay must return its frozen historical job even after a
  -- reference changes; the original writer verifies the operation fingerprint.
  IF p_operation_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.barcode.operation:'||p_operation_id::text,0));
  END IF;
  IF p_operation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM saas.barcode_label_operations operation
    WHERE operation.operation_id=p_operation_id) THEN
    SELECT * INTO prior FROM saas.barcode_print_job_create_without_price_guard(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
      p_now,p_operation_id,p_job_id,p_template_id,p_template_version,p_template_name,
      p_template_config,p_output_type,p_printer_profile,p_start_cell,p_targets);
    RETURN QUERY SELECT prior.outcome::text,CASE WHEN prior.result_payload IS NULL
      THEN NULL::jsonb ELSE saas.barcode_print_job_legacy_projection(
        prior.result_payload::jsonb) END;
    RETURN;
  END IF;
  IF pg_catalog.jsonb_typeof(p_targets)='array' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.catalog.store:'||p_store_id::text,0));
    FOR target IN SELECT value FROM pg_catalog.jsonb_array_elements(p_targets) LOOP
      IF pg_catalog.jsonb_typeof(target)='object' AND
        COALESCE(target->>'variantId','')~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        SELECT saas.barcode_label_variant_projection_v2(
          p_store_id,(target->>'variantId')::uuid) INTO priced;
        IF priced IS NULL OR priced->>'priceCents' IS NULL THEN
          RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
        END IF;
        IF EXISTS (SELECT 1 FROM saas.pricing_variant_policy_state state
          JOIN saas.pricing_variant_policy_versions policy
            ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id
              AND policy.version=state.current_version
          WHERE state.store_id=p_store_id
            AND state.variant_id=(target->>'variantId')::uuid
            AND policy.method<>'fixed_try') THEN
          RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
        END IF;
      END IF;
    END LOOP;
  END IF;
  SELECT * INTO prior FROM saas.barcode_print_job_create_without_price_guard(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,p_operation_id,p_job_id,p_template_id,p_template_version,p_template_name,
    p_template_config,p_output_type,p_printer_profile,p_start_cell,p_targets);
  RETURN QUERY SELECT prior.outcome::text,CASE WHEN prior.result_payload IS NULL
    THEN NULL::jsonb ELSE saas.barcode_print_job_legacy_projection(
      prior.result_payload::jsonb) END;
END $fn$;

REVOKE ALL ON FUNCTION saas.barcode_print_job_create(uuid,uuid,uuid,uuid,text,
  bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,jsonb)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.barcode_print_job_create(uuid,uuid,uuid,uuid,text,
  bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,jsonb)
  TO celebix_saas_app;

CREATE FUNCTION saas.barcode_print_job_create_v2(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_operation_id uuid,p_job_id uuid,p_template_id uuid,p_template_version bigint,
  p_template_name text,p_template_config jsonb,p_output_type text,
  p_printer_profile text,p_start_cell integer,p_targets jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; target jsonb; priced jsonb; snapshots jsonb:='{}'::jsonb;
  created record; changed integer;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,
    p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog',
    'catalog_admin.manage');
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN;
  END IF;
  IF p_operation_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.barcode.operation:'||p_operation_id::text,0));
  END IF;
  IF p_operation_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM saas.barcode_label_operations operation
    WHERE operation.operation_id=p_operation_id) THEN
    RETURN QUERY SELECT * FROM saas.barcode_print_job_create_without_price_guard(
      p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
      p_now,p_operation_id,p_job_id,p_template_id,p_template_version,p_template_name,
      p_template_config,p_output_type,p_printer_profile,p_start_cell,p_targets);
    RETURN;
  END IF;
  IF pg_catalog.jsonb_typeof(p_targets)='array' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
      'saas.catalog.store:'||p_store_id::text,0));
    FOR target IN SELECT value FROM pg_catalog.jsonb_array_elements(p_targets) LOOP
      IF pg_catalog.jsonb_typeof(target)='object' AND
        COALESCE(target->>'variantId','')~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' THEN
        SELECT saas.barcode_label_variant_projection_v2(
          p_store_id,(target->>'variantId')::uuid) INTO priced;
        IF priced IS NULL OR priced->>'priceCents' IS NULL THEN
          RETURN QUERY SELECT 'unavailable',NULL::jsonb; RETURN;
        END IF;
        snapshots:=snapshots||pg_catalog.jsonb_build_object(target->>'variantId',priced);
      END IF;
    END LOOP;
  END IF;
  SELECT * INTO created FROM saas.barcode_print_job_create_without_price_guard(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,p_operation_id,p_job_id,p_template_id,p_template_version,p_template_name,
    p_template_config,p_output_type,p_printer_profile,p_start_cell,p_targets);
  IF created.outcome IS DISTINCT FROM 'created' THEN
    RETURN QUERY SELECT created.outcome::text,created.result_payload::jsonb; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM saas.barcode_print_job_items item
    WHERE item.store_id=p_store_id AND item.job_id=p_job_id
      AND (NOT snapshots ? item.variant_id::text OR
        item.snapshot->>'priceCents' IS DISTINCT FROM
          (snapshots->(item.variant_id::text))->>'priceCents')) THEN
    RAISE EXCEPTION 'BARCODE_PRICE_SNAPSHOT_RACE';
  END IF;
  UPDATE saas.barcode_print_job_items item
  SET snapshot=snapshots->(item.variant_id::text)
  WHERE item.store_id=p_store_id AND item.job_id=p_job_id;
  GET DIAGNOSTICS changed=ROW_COUNT;
  IF changed<>pg_catalog.jsonb_array_length(p_targets) THEN
    RAISE EXCEPTION 'BARCODE_PRICE_SNAPSHOT_INCOMPLETE';
  END IF;
  RETURN QUERY SELECT 'created',saas.barcode_print_job_projection(p_store_id,p_job_id);
END $fn$;
REVOKE ALL ON FUNCTION saas.barcode_print_job_create_v2(uuid,uuid,uuid,uuid,
  text,bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,integer,
  jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.barcode_print_job_create_v2(uuid,uuid,uuid,
  uuid,text,bigint,timestamptz,uuid,uuid,uuid,bigint,text,jsonb,text,text,
  integer,jsonb) TO celebix_saas_app;

ALTER FUNCTION saas.barcode_print_job_get(uuid,uuid,uuid,uuid,text,bigint,
  timestamptz,uuid) RENAME TO barcode_print_job_get_unadapted_v1;
REVOKE ALL ON FUNCTION saas.barcode_print_job_get_unadapted_v1(uuid,uuid,uuid,
  uuid,text,bigint,timestamptz,uuid) FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.barcode_print_job_get_v2(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_job_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT * FROM saas.barcode_print_job_get_unadapted_v1(p_store_id,
    p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,
    p_now,p_job_id)
$fn$;
REVOKE ALL ON FUNCTION saas.barcode_print_job_get_v2(uuid,uuid,uuid,uuid,
  text,bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.barcode_print_job_get_v2(uuid,uuid,uuid,uuid,
  text,bigint,timestamptz,uuid) TO celebix_saas_app;

CREATE FUNCTION saas.barcode_print_job_get(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_now timestamptz,p_job_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE v_outcome text; v_payload jsonb;
BEGIN
  SELECT job.outcome,job.result_payload INTO v_outcome,v_payload
  FROM saas.barcode_print_job_get_v2(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,p_job_id) job;
  RETURN QUERY SELECT COALESCE(v_outcome,'unavailable'),
    CASE WHEN v_payload IS NULL THEN NULL::jsonb
      ELSE saas.barcode_print_job_legacy_projection(v_payload) END;
END $fn$;
REVOKE ALL ON FUNCTION saas.barcode_print_job_get(uuid,uuid,uuid,uuid,text,
  bigint,timestamptz,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.barcode_print_job_get(uuid,uuid,uuid,uuid,
  text,bigint,timestamptz,uuid) TO celebix_saas_app;
COMMIT;
