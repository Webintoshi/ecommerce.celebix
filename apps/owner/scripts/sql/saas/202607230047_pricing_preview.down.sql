BEGIN;
SET LOCAL ROLE celebix_saas_owner;

DO $pricing_preview_down$
DECLARE
  target regprocedure:=
    'saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,uuid[])'::regprocedure;
  definition text;
  expected_definition text:=$expected_function$
CREATE OR REPLACE FUNCTION saas.pricing_preview(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_channel text, p_variant_ids uuid[])
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE
  authority_error text;
  expected_count integer;
  active_count integer;
  resolved_count integer;
  entries jsonb;
BEGIN
  IF p_now IS NULL OR NOT pg_catalog.isfinite(p_now)
     OR p_channel IS NULL OR p_channel NOT IN('storefront','quick_order')
     OR p_variant_ids IS NULL
     OR pg_catalog.array_ndims(p_variant_ids) IS DISTINCT FROM 1
     OR pg_catalog.array_lower(p_variant_ids,1) IS DISTINCT FROM 1
     OR pg_catalog.cardinality(p_variant_ids) NOT BETWEEN 1 AND 100
     OR pg_catalog.array_position(p_variant_ids,NULL) IS NOT NULL THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  expected_count:=pg_catalog.cardinality(p_variant_ids);
  IF (
    SELECT pg_catalog.count(DISTINCT variant_id)
    FROM pg_catalog.unnest(p_variant_ids) AS selected(variant_id)
  )<>expected_count THEN
    RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
    RETURN;
  END IF;

  authority_error:=saas.merchant_action_authority_error(
    p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,
    p_plan_version,p_now,'catalog','pricing.read'
  );
  IF authority_error IS NOT NULL THEN
    RETURN QUERY SELECT authority_error,NULL::jsonb;
    RETURN;
  END IF;

  SELECT pg_catalog.count(*) INTO active_count
  FROM saas.product_variants AS variant
  JOIN saas.products AS product
    ON product.store_id=variant.store_id
   AND product.id=variant.product_id
   AND product.status='active'
  WHERE variant.store_id=p_store_id
    AND variant.id=ANY(p_variant_ids)
    AND variant.status='active';
  IF active_count<>expected_count THEN
    RETURN QUERY SELECT 'not_found',NULL::jsonb;
    RETURN;
  END IF;

  SELECT
    pg_catalog.count(*),
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'variantId',selected.variant_id,
        'channel',p_channel,
        'basePriceCents',variant.price_cents,
        'effectivePriceCents',resolved.price_cents,
        'sourceKind',resolved.source_kind,
        'priceListId',resolved.price_list_id
      ))
      ORDER BY selected.variant_id::text
    )
  INTO resolved_count,entries
  FROM pg_catalog.unnest(p_variant_ids) AS selected(variant_id)
  JOIN saas.product_variants AS variant
    ON variant.store_id=p_store_id
   AND variant.id=selected.variant_id
   AND variant.status='active'
  JOIN saas.products AS product
    ON product.store_id=variant.store_id
   AND product.id=variant.product_id
   AND product.status='active'
  CROSS JOIN LATERAL saas.resolve_effective_variant_price(
    p_store_id,selected.variant_id,p_channel,p_now,NULL::text
  ) AS resolved
  WHERE resolved.outcome='found'
    AND resolved.price_cents BETWEEN 0 AND 8000000000
    AND resolved.source_kind IN('base','price_list')
    AND (
      (resolved.source_kind='base' AND resolved.price_list_id IS NULL
        AND resolved.price_cents=variant.price_cents)
      OR (resolved.source_kind='price_list' AND resolved.price_list_id IS NOT NULL)
    );
  IF resolved_count<>expected_count OR entries IS NULL THEN
    RETURN QUERY SELECT 'unavailable',NULL::jsonb;
    RETURN;
  END IF;

  RETURN QUERY SELECT 'previewed',pg_catalog.jsonb_build_object(
    'entries',entries,
    'asOf',saas.pricing_json_timestamp(p_now)
  );
END
$function$
$expected_function$;
  owner_name text;
  language_name name;
  function_kind "char";
  volatility "char";
  parallel_safety "char";
  security_definer boolean;
  leakproof boolean;
  strict_mode boolean;
  returns_set boolean;
  argument_count smallint;
  default_count smallint;
  return_type oid;
  configuration text[];
  function_acl aclitem[];
BEGIN
  SELECT pg_catalog.pg_get_functiondef(proc.oid),role.rolname,proc.provolatile,
         language.lanname,proc.prokind,proc.proparallel,proc.prosecdef,
         proc.proleakproof,proc.proisstrict,proc.proretset,proc.pronargs,
         proc.pronargdefaults,proc.prorettype,proc.proconfig,proc.proacl
  INTO definition,owner_name,volatility,language_name,function_kind,
       parallel_safety,security_definer,leakproof,strict_mode,returns_set,
       argument_count,default_count,return_type,configuration,function_acl
  FROM pg_catalog.pg_proc AS proc
  JOIN pg_catalog.pg_roles AS role ON role.oid=proc.proowner
  JOIN pg_catalog.pg_language AS language ON language.oid=proc.prolang
  WHERE proc.oid=target;
  IF definition IS NULL
     OR owner_name<>'celebix_saas_owner'
     OR language_name<>'plpgsql'
     OR function_kind<>'f'
     OR volatility<>'s'
     OR parallel_safety<>'u'
     OR security_definer IS DISTINCT FROM true
     OR leakproof IS DISTINCT FROM false
     OR strict_mode IS DISTINCT FROM false
     OR returns_set IS DISTINCT FROM true
     OR argument_count<>9
     OR default_count<>0
     OR return_type<>'record'::pg_catalog.regtype
     OR configuration IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]
     OR function_acl IS DISTINCT FROM ARRAY[
       'celebix_saas_owner=X/celebix_saas_owner',
       'celebix_saas_app=X/celebix_saas_owner'
     ]::pg_catalog.aclitem[]
     OR pg_catalog.btrim(pg_catalog.regexp_replace(
       definition,'[[:space:]]+',' ','g'
     ))<>pg_catalog.btrim(pg_catalog.regexp_replace(
       expected_definition,'[[:space:]]+',' ','g'
     )) THEN
    RAISE EXCEPTION 'PRICING_PREVIEW_ROLLBACK_DRIFT';
  END IF;
END
$pricing_preview_down$;

REVOKE ALL ON FUNCTION
  saas.pricing_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[])
FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,
  celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,
  celebix_saas_migrator;
DROP FUNCTION saas.pricing_preview(
  uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,uuid[]
);

COMMIT;
