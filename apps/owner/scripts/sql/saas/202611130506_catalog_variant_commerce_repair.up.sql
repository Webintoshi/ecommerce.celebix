BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

DO $repair$
DECLARE
  writer record;
  definition text;
  editor_signature constant text := 'saas.catalog_product_editor_projection(uuid,uuid)';
  required_flag constant text := 'commerce.continue_selling_when_out_of_stock,';
  profile_join constant text := 'JOIN saas.catalog_variant_commerce_profiles AS commerce';
  patch_point constant text := '  projection := pg_catalog.jsonb_build_object(';
  add_profile constant text := $profile$  INSERT INTO saas.catalog_variant_commerce_profiles (
    variant_id, product_id, store_id, created_at, updated_at
  ) VALUES (p_variant_id, p_product_id, p_store_id, p_now, p_now);

$profile$;
BEGIN
  FOR writer IN
    SELECT * FROM (VALUES
      ('saas.catalog_create_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)',
       'd3d23a471026bc2e36a35aed761031922ff5b33f65618f3a075aab7003de8247'),
      ('saas.catalog_create_variant_measurements_implementation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb)',
       'b53358c7650879cd74a1d335724466d4a9feaf855145d416944555b2359b1215')
    ) AS writers(signature, predecessor_hash)
  LOOP
    SELECT pg_get_functiondef(to_regprocedure(writer.signature)) INTO definition;
    IF encode(sha256(convert_to(definition, 'UTF8')), 'hex') IS DISTINCT FROM writer.predecessor_hash
      OR length(definition) - length(replace(definition, patch_point, '')) <> length(patch_point)
    THEN
      RAISE EXCEPTION 'CATALOG_VARIANT_COMMERCE_WRITER_DRIFT: %', writer.signature;
    END IF;
    EXECUTE replace(definition, patch_point, add_profile || patch_point);
  END LOOP;

  -- A legacy or restored variant may lack optional commerce metadata.
  SELECT pg_get_functiondef(to_regprocedure(editor_signature)) INTO definition;
  IF encode(sha256(convert_to(definition, 'UTF8')), 'hex')
      IS DISTINCT FROM 'a34893ae4d75a486b0d929bd9c8884628371473d95127257b068eb5444aebb34'
    OR length(definition) - length(replace(definition, required_flag, '')) <> length(required_flag)
    OR length(definition) - length(replace(definition, profile_join, '')) <> length(profile_join)
  THEN
    RAISE EXCEPTION 'CATALOG_VARIANT_COMMERCE_EDITOR_DRIFT';
  END IF;
  definition := replace(definition, required_flag, 'COALESCE(commerce.continue_selling_when_out_of_stock, false),');
  EXECUTE replace(definition, profile_join, 'LEFT ' || profile_join);
END
$repair$;

INSERT INTO saas.catalog_variant_commerce_profiles (
  variant_id, product_id, store_id, created_at, updated_at
)
SELECT variant.id, variant.product_id, variant.store_id, variant.created_at, variant.created_at
FROM saas.product_variants AS variant
JOIN saas.products AS product
  ON product.store_id = variant.store_id AND product.id = variant.product_id
WHERE variant.status = 'active' AND product.status <> 'archived'
  AND NOT EXISTS (
    SELECT 1 FROM saas.catalog_variant_commerce_profiles AS profile
    WHERE profile.store_id = variant.store_id
      AND profile.product_id = variant.product_id
      AND profile.variant_id = variant.id
  )
ON CONFLICT (variant_id) DO NOTHING;

COMMIT;
