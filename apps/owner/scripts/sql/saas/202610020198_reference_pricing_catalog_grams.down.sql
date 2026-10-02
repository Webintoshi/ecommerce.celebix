-- Canonical policies and historical snapshots remain readable by the existing engine.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
DROP FUNCTION saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid);
DROP FUNCTION saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,integer,uuid,uuid);
DROP FUNCTION saas.pricing_catalog_gram_scope_digest(uuid,uuid,uuid,timestamptz);
DROP FUNCTION saas.pricing_catalog_gram_candidates(uuid,uuid);
CREATE OR REPLACE FUNCTION saas.pricing_reference_set_projection(p_store_id uuid,p_set_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
  SELECT pg_catalog.jsonb_build_object(
    'setId',selected.id,'version',selected.version,'stateVersion',COALESCE(state.version,0),
    'isActive',state.active_set_id=selected.id,
    'createdAt',saas.pricing_json_timestamp(selected.created_at),
    'values',COALESCE((SELECT pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object('referenceId',definition.id,'kind',definition.kind,
        'label',definition.label,'rateTry',CASE WHEN value.rate_try IS NULL THEN NULL ELSE value.rate_try::text END,
        'active',value.active)
        || CASE WHEN definition.reference_purity IS NULL THEN '{}'::jsonb
           ELSE pg_catalog.jsonb_build_object('referencePurity',definition.reference_purity::text) END
      ORDER BY definition.kind,definition.id)
      FROM saas.pricing_reference_set_values value JOIN saas.pricing_reference_definitions definition
        ON definition.store_id=value.store_id AND definition.id=value.reference_id
      WHERE value.store_id=selected.store_id AND value.set_id=selected.id),'[]'::jsonb))
  FROM saas.pricing_reference_sets selected
  LEFT JOIN saas.pricing_reference_state state ON state.store_id=selected.store_id
  WHERE selected.store_id=p_store_id AND selected.id=p_set_id
$fn$;
CREATE OR REPLACE FUNCTION saas.pricing_reference_list(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
  p_plan_version bigint,p_now timestamptz,p_page_size integer,p_after_set_version bigint
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; selected_state saas.pricing_reference_state%ROWTYPE;
  items jsonb; has_more boolean; cursor_version bigint;
BEGIN
  authority_error:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,
    p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','pricing.read');
  IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
  IF p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
    OR (p_after_set_version IS NOT NULL AND p_after_set_version<1) THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN;
  END IF;
  SELECT * INTO selected_state FROM saas.pricing_reference_state state WHERE state.store_id=p_store_id;
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'setId',page.id,'version',page.version,
    'createdAt',saas.pricing_json_timestamp(page.created_at),
    'isActive',page.id=selected_state.active_set_id) ORDER BY page.version DESC),'[]'::jsonb),
    MIN(page.version)
  INTO items,cursor_version
  FROM (SELECT selected.id,selected.version,selected.created_at
    FROM saas.pricing_reference_sets selected WHERE selected.store_id=p_store_id
      AND (p_after_set_version IS NULL OR selected.version<p_after_set_version)
    ORDER BY selected.version DESC LIMIT p_page_size) page;
  SELECT EXISTS(SELECT 1 FROM saas.pricing_reference_sets selected
    WHERE selected.store_id=p_store_id AND selected.version<cursor_version) INTO has_more;
  RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object(
    'activeSetId',selected_state.active_set_id,'stateVersion',COALESCE(selected_state.version,0),
    'items',items,'nextCursor',CASE WHEN has_more THEN cursor_version ELSE NULL::bigint END);
END $fn$;
COMMIT;
