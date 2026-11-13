BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout = '5s';

DO $restore$
DECLARE
  writer record;
  definition text;
  predecessor text;
  editor_signature constant text := 'saas.catalog_product_editor_projection(uuid,uuid)';
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
    predecessor := replace(definition, add_profile, '');
    IF encode(sha256(convert_to(predecessor, 'UTF8')), 'hex') IS DISTINCT FROM writer.predecessor_hash
      OR length(definition) - length(predecessor) <> length(add_profile)
    THEN
      RAISE EXCEPTION 'CATALOG_VARIANT_COMMERCE_WRITER_ROLLBACK_DRIFT: %', writer.signature;
    END IF;
    EXECUTE predecessor;
  END LOOP;

  SELECT pg_get_functiondef(to_regprocedure(editor_signature)) INTO definition;
  predecessor := replace(
    replace(definition, 'COALESCE(commerce.continue_selling_when_out_of_stock, false),', 'commerce.continue_selling_when_out_of_stock,'),
    'LEFT JOIN saas.catalog_variant_commerce_profiles AS commerce',
    'JOIN saas.catalog_variant_commerce_profiles AS commerce'
  );
  IF definition IS NOT DISTINCT FROM predecessor
    OR encode(sha256(convert_to(predecessor, 'UTF8')), 'hex')
      IS DISTINCT FROM 'a34893ae4d75a486b0d929bd9c8884628371473d95127257b068eb5444aebb34'
  THEN
    RAISE EXCEPTION 'CATALOG_VARIANT_COMMERCE_EDITOR_ROLLBACK_DRIFT';
  END IF;
  EXECUTE predecessor;
END
$restore$;

-- Keep valid profiles and any merchant edits made after installation.
COMMIT;
