BEGIN READ ONLY;
SET LOCAL ROLE celebix_saas_owner;

DO $assert$
DECLARE
  writer record;
  definition text;
BEGIN
  FOR writer IN
    SELECT * FROM (VALUES
      ('saas.catalog_create_variant_implementation_v1(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb)'),
      ('saas.catalog_create_variant_measurements_implementation(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,uuid,text,text,text,bigint,bigint,bigint,boolean,bigint,jsonb,jsonb)')
    ) AS writers(signature)
  LOOP
    SELECT pg_get_functiondef(to_regprocedure(writer.signature)) INTO definition;
    IF definition IS NULL OR position('INSERT INTO saas.catalog_variant_commerce_profiles' IN definition) = 0 THEN
      RAISE EXCEPTION 'CATALOG_VARIANT_COMMERCE_WRITER_MISSING_PROFILE: %', writer.signature;
    END IF;
  END LOOP;

  SELECT pg_get_functiondef(to_regprocedure('saas.catalog_product_editor_projection(uuid,uuid)')) INTO definition;
  IF definition IS NULL
    OR position('LEFT JOIN saas.catalog_variant_commerce_profiles AS commerce' IN definition) = 0
    OR position('COALESCE(commerce.continue_selling_when_out_of_stock, false)' IN definition) = 0
  THEN
    RAISE EXCEPTION 'CATALOG_VARIANT_COMMERCE_EDITOR_REQUIRES_PROFILE';
  END IF;

  IF EXISTS (
    SELECT 1
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
  ) THEN
    RAISE EXCEPTION 'CATALOG_VARIANT_COMMERCE_ACTIVE_PROFILE_MISSING';
  END IF;
END
$assert$;

COMMIT;
