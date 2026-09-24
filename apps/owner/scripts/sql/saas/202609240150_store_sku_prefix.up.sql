BEGIN;
SET LOCAL ROLE celebix_saas_owner;

-- Keep the old validator callable by owner functions, but expose only the new contract to the app.
ALTER FUNCTION saas.merchant_admin_config_valid(text,jsonb) RENAME TO merchant_admin_config_valid_without_sku_prefix;
REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid_without_sku_prefix(text,jsonb)
  FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_host_resolver;
CREATE FUNCTION saas.merchant_admin_config_valid(p_kind text,p_config jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $function$
  SELECT CASE WHEN p_kind='general_setting' THEN
    (NOT p_config ? 'skuPrefix' OR
      (pg_catalog.jsonb_typeof(p_config->'skuPrefix')='string' AND p_config->>'skuPrefix' ~ '^[A-Z0-9]{1,20}$'))
    AND saas.merchant_admin_config_valid_without_sku_prefix(p_kind,p_config-'skuPrefix')
  ELSE saas.merchant_admin_config_valid_without_sku_prefix(p_kind,p_config) END
$function$;
REVOKE ALL ON FUNCTION saas.merchant_admin_config_valid(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.merchant_admin_config_valid(text,jsonb) TO celebix_saas_app;

-- A versioned read leaves the old panel's exact four-key payload unchanged.
CREATE FUNCTION saas.catalog_get_onboarding_options_v2(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,
  p_plan_code text,p_plan_version bigint,p_products_limit bigint,p_now timestamptz
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $function$
DECLARE base_outcome text; base_payload jsonb; prefix text;
BEGIN
  SELECT source.outcome,source.result_payload INTO base_outcome,base_payload
  FROM saas.catalog_get_onboarding_options(p_store_id,p_principal_id,p_membership_id,p_plan_id,
    p_plan_code,p_plan_version,p_products_limit,p_now) AS source;
  IF base_outcome IS DISTINCT FROM 'found' THEN
    RETURN QUERY SELECT base_outcome,base_payload; RETURN;
  END IF;
  SELECT record.config->>'skuPrefix' INTO prefix
  FROM saas.merchant_admin_records AS record
  WHERE record.store_id=p_store_id AND record.record_kind='general_setting' AND record.status='active'
  ORDER BY record.updated_at DESC,record.id DESC LIMIT 1;
  RETURN QUERY SELECT 'found'::text,base_payload || pg_catalog.jsonb_build_object('skuPrefix',prefix);
END
$function$;
REVOKE ALL ON FUNCTION saas.catalog_get_onboarding_options_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_get_onboarding_options_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz) TO celebix_saas_app;

-- Clone the existing authorized creation function so SKU-bearing quick requests retain
-- quick_create audit semantics and the old function remains available to old panels.
DO $clone$
DECLARE definition text; old_parts text[]; new_parts text[]; item integer; fragment text;
BEGIN
  definition:=pg_catalog.pg_get_functiondef(
    'saas.catalog_onboard_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)'::regprocedure);
  old_parts:=ARRAY[
    'saas.catalog_onboard_product(',
    E'DECLARE\n  authority_error text;',
    'ARRAY[''stockQuantity'',''categoryId'']',
    'OR pg_catalog.cardinality(p_variant_ids)<>1 THEN',
    'id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at',
    'p_variant_ids[1],p_product_id,p_store_id,''Standart'',(p_intent->>''priceCents'')::bigint,true,',
    E'WHEN unique_violation THEN\n      RETURN QUERY SELECT ''catalog_conflict'',NULL::jsonb;'
  ];
  new_parts:=ARRAY[
    'saas.catalog_onboard_product_v2(',
    E'DECLARE\n  authority_error text;\n  sku_violation_constraint text;',
    'ARRAY[''stockQuantity'',''categoryId'',''sku'']',
    'OR (p_intent ? ''sku'' AND (pg_catalog.jsonb_typeof(p_intent->''sku'')<>''string'' OR p_intent->>''sku''!~''^[A-Z0-9][A-Z0-9._-]{0,63}$'')) OR pg_catalog.cardinality(p_variant_ids)<>1 THEN',
    'id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at',
    'p_variant_ids[1],p_product_id,p_store_id,''Standart'',p_intent->>''sku'',(p_intent->>''priceCents'')::bigint,true,',
    E'WHEN unique_violation THEN\n      GET STACKED DIAGNOSTICS sku_violation_constraint = CONSTRAINT_NAME;\n      RETURN QUERY SELECT CASE WHEN sku_violation_constraint=''product_variants_store_sku_owner_key'' THEN ''sku_conflict'' ELSE ''catalog_conflict'' END,NULL::jsonb;'
  ];
  FOR item IN 1..pg_catalog.array_length(old_parts,1) LOOP
    fragment:=old_parts[item];
    IF pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,fragment,''))<>pg_catalog.length(fragment) THEN
      RAISE EXCEPTION 'ONBOARDING_FUNCTION_SOURCE_CHANGED: %',item;
    END IF;
    definition:=pg_catalog.replace(definition,fragment,new_parts[item]);
  END LOOP;
  EXECUTE definition;
END
$clone$;
REVOKE ALL ON FUNCTION saas.catalog_onboard_product_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_onboard_product_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb) TO celebix_saas_app;

-- An exact store/SKU lock makes the cross-product guard safe under concurrent transactions.
CREATE FUNCTION saas.guard_product_variant_sku_owner() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $function$
BEGIN
  IF NEW.sku IS NULL THEN RETURN NEW; END IF;
  IF pg_catalog.current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION USING ERRCODE='serialization_failure',MESSAGE='sku_owner_requires_read_committed';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'saas.catalog.sku:' || NEW.store_id::text || ':' || NEW.sku,0));
  IF EXISTS(SELECT 1 FROM saas.product_variants AS other
      WHERE other.store_id=NEW.store_id AND other.sku=NEW.sku AND other.product_id<>NEW.product_id) THEN
    RAISE EXCEPTION USING ERRCODE='unique_violation',CONSTRAINT='product_variants_store_sku_owner_key',
      MESSAGE='sku_conflict';
  END IF;
  RETURN NEW;
END
$function$;
CREATE TRIGGER product_variants_sku_owner_guard BEFORE INSERT OR UPDATE OF store_id,product_id,sku
  ON saas.product_variants FOR EACH ROW EXECUTE FUNCTION saas.guard_product_variant_sku_owner();
DROP INDEX saas.product_variants_store_sku_key;
CREATE INDEX product_variants_store_sku_lookup_idx ON saas.product_variants(store_id,sku) WHERE sku IS NOT NULL;

-- Narrow the three catalog prechecks; new-product create stays store-wide by definition.
DO $rewrite$
DECLARE target regprocedure; definition text; old_text text; new_text text;
BEGIN
  FOR target,old_text,new_text IN
    SELECT 'saas.catalog_create_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
      'variant.store_id = p_store_id AND variant.sku = p_sku',
      'variant.store_id = p_store_id AND variant.sku = p_sku AND variant.product_id <> p_product_id'
    UNION ALL SELECT 'saas.catalog_update_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,bigint,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'::regprocedure,
      'variant.store_id = p_store_id AND variant.sku = p_sku AND variant.id <> p_variant_id',
      'variant.store_id = p_store_id AND variant.sku = p_sku AND variant.product_id <> p_product_id'
    UNION ALL SELECT 'saas.catalog_create_variants_batch(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid[],jsonb)'::regprocedure,
      'selected_sku=ANY(seen_skus) OR EXISTS(SELECT 1 FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.sku=selected_sku)',
      'EXISTS(SELECT 1 FROM saas.product_variants AS variant WHERE variant.store_id=p_store_id AND variant.sku=selected_sku AND variant.product_id<>p_product_id)'
  LOOP
    definition:=pg_catalog.pg_get_functiondef(target);
    IF pg_catalog.length(definition)-pg_catalog.length(pg_catalog.replace(definition,old_text,''))<>pg_catalog.length(old_text) THEN
      RAISE EXCEPTION 'SKU_FUNCTION_SOURCE_CHANGED: %',target;
    END IF;
    EXECUTE pg_catalog.replace(definition,old_text,new_text);
  END LOOP;
END
$rewrite$;

COMMIT;
