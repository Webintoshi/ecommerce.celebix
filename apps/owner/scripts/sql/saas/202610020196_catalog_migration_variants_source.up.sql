BEGIN;
SET LOCAL ROLE celebix_saas_owner;

-- Raw imported records retain fields for which the live catalogue has no native column.
CREATE TABLE saas.catalog_product_import_sources (
 store_id uuid NOT NULL, product_id uuid NOT NULL, job_id uuid NOT NULL,
 source_product_id text NOT NULL, source_digest char(64) NOT NULL,
 provider text NOT NULL CHECK(provider='qukasoft'), source_metadata jsonb NOT NULL,
 created_at timestamptz NOT NULL,
 PRIMARY KEY(store_id,product_id),
 FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
 FOREIGN KEY(store_id,job_id) REFERENCES saas.catalog_product_migration_jobs(store_id,id) ON DELETE RESTRICT,
 CHECK(source_product_id~'^[1-9][0-9]{0,19}$' AND source_digest~'^[a-f0-9]{64}$'),
 CHECK(jsonb_typeof(source_metadata)='object' AND octet_length(source_metadata::text)<=65536)
);
ALTER TABLE saas.catalog_product_import_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_product_import_sources FORCE ROW LEVEL SECURITY;
CREATE POLICY catalog_product_import_sources_owner ON saas.catalog_product_import_sources TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.catalog_product_import_sources FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.catalog_migration_extended_variant_valid(v jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $fn$
BEGIN
 IF NOT saas.catalog_migration_json_exact(v,ARRAY['variantId','title','priceCents','stockQuantity','attributes'],ARRAY['sku','barcode','compareAtCents','measurements'])
  OR v->>'variantId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  OR jsonb_typeof(v->'title')<>'string' OR v->>'title'<>btrim(v->>'title') OR char_length(v->>'title') NOT BETWEEN 1 AND 120 OR v->>'title'~'[[:cntrl:]]'
  OR jsonb_typeof(v->'priceCents')<>'number' OR (v->>'priceCents')::numeric NOT BETWEEN 0 AND 9007199254740991 OR (v->>'priceCents')::numeric<>trunc((v->>'priceCents')::numeric)
  OR jsonb_typeof(v->'stockQuantity')<>'number' OR (v->>'stockQuantity')::numeric NOT BETWEEN 0 AND 2147483647 OR (v->>'stockQuantity')::numeric<>trunc((v->>'stockQuantity')::numeric)
  OR (v ? 'sku' AND (jsonb_typeof(v->'sku')<>'string' OR v->>'sku'!~'^[A-Z0-9][A-Z0-9._-]{0,63}$'))
  OR (v ? 'barcode' AND (jsonb_typeof(v->'barcode')<>'string' OR v->>'barcode'!~'^[A-Za-z0-9._-]{1,128}$'))
  OR (v ? 'compareAtCents' AND (jsonb_typeof(v->'compareAtCents')<>'number' OR (v->>'compareAtCents')::numeric NOT BETWEEN (v->>'priceCents')::numeric AND 9007199254740991 OR (v->>'compareAtCents')::numeric<>trunc((v->>'compareAtCents')::numeric)))
  OR NOT saas.catalog_attributes_are_valid((v->'attributes')-'Ağırlık (g)')
  OR (v->'attributes' ? 'Ağırlık (g)' AND (v->'attributes'->>'Ağırlık (g)'!~'^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$' OR (v->'attributes'->>'Ağırlık (g)')::numeric NOT BETWEEN 0.001 AND 1000000))
  OR (v ? 'measurements' AND NOT saas.catalog_measurements_valid(v->'measurements'))
 THEN RETURN false; END IF;
 RETURN true;
EXCEPTION WHEN OTHERS THEN RETURN false;
END $fn$;
REVOKE ALL ON FUNCTION saas.catalog_migration_extended_variant_valid(jsonb) FROM PUBLIC,celebix_saas_app;

CREATE FUNCTION saas.catalog_migration_import_batch_v2(
 p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,
 p_plan_version bigint,p_products_limit bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,
 p_job_id uuid,p_source_digest text,p_products jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE authority_error text; p jsonb; v jsonb; base_products jsonb; prior_outcome text; prior_payload jsonb;
 selected_product uuid; selected_variant uuid; source_data jsonb; desi numeric;
BEGIN
 authority_error:=saas.catalog_migration_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
 IF authority_error IS NOT NULL THEN RETURN QUERY SELECT authority_error,NULL::jsonb; RETURN; END IF;
 IF jsonb_typeof(p_products) IS DISTINCT FROM 'array' OR jsonb_array_length(p_products) NOT BETWEEN 1 AND 25 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 FOR p IN SELECT value FROM jsonb_array_elements(p_products) LOOP
  IF NOT saas.catalog_migration_json_exact(p,ARRAY['sourceProductId','productId','title','slug','status','categorySlugs','brandSlugs','variant','sourceImageDigests'],ARRAY['description','additionalVariants','sourceMetadata'])
    OR NOT saas.catalog_migration_extended_variant_valid(p->'variant')
    OR (p ? 'additionalVariants' AND (jsonb_typeof(p->'additionalVariants')<>'array' OR jsonb_array_length(p->'additionalVariants')>49))
  THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  FOR v IN SELECT value FROM jsonb_array_elements(coalesce(p->'additionalVariants','[]'::jsonb)) LOOP
   IF NOT saas.catalog_migration_extended_variant_valid(v) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  END LOOP;
  IF p ? 'sourceMetadata' THEN
   source_data:=p->'sourceMetadata';
   IF NOT saas.catalog_migration_json_exact(source_data,ARRAY['provider','rawXml','fields','attributes','variants','weightCandidates','issues'],ARRAY[]::text[])
    OR source_data->>'provider'<>'qukasoft' OR jsonb_typeof(source_data->'rawXml')<>'string' OR length(source_data->>'rawXml')=0
    OR jsonb_typeof(source_data->'fields')<>'object' OR jsonb_typeof(source_data->'attributes')<>'array' OR jsonb_typeof(source_data->'variants')<>'array'
    OR jsonb_typeof(source_data->'weightCandidates')<>'array' OR jsonb_typeof(source_data->'issues')<>'array' OR octet_length(source_data::text)>65536
    OR source_data->'fields'->>'id' IS DISTINCT FROM p->>'sourceProductId'
    OR source_data->'fields'->>'currency' IS DISTINCT FROM (SELECT currency FROM saas.stores WHERE id=p_store_id)
   THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_products) p CROSS JOIN LATERAL jsonb_array_elements(jsonb_build_array(p.value->'variant')||coalesce(p.value->'additionalVariants','[]'::jsonb)) v GROUP BY v.value->>'variantId' HAVING count(*)>1)
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(p_products) p CROSS JOIN LATERAL jsonb_array_elements(jsonb_build_array(p.value->'variant')||coalesce(p.value->'additionalVariants','[]'::jsonb)) v WHERE v.value ? 'barcode' GROUP BY v.value->>'barcode' HAVING count(*)>1)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT jsonb_agg((p.value-ARRAY['additionalVariants','sourceMetadata']::text[])||jsonb_build_object('variant',(p.value->'variant')-'measurements') ORDER BY p.ordinality)
 INTO base_products FROM jsonb_array_elements(p_products) WITH ORDINALITY p(value,ordinality);
 BEGIN
  SELECT s.outcome,s.result_payload INTO prior_outcome,prior_payload FROM saas.catalog_migration_import_batch(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_job_id,p_source_digest,base_products) s;
  IF prior_outcome IS DISTINCT FROM 'batch_imported' THEN RETURN QUERY SELECT prior_outcome,prior_payload; RETURN; END IF;
  PERFORM set_config('saas.inventory.source_marker','catalog_adjustment',true);
  PERFORM set_config('saas.inventory.source_id',p_operation_id::text,true);
  PERFORM set_config('saas.inventory.source_time',p_now::text,true);
  FOR p IN SELECT value FROM jsonb_array_elements(p_products) LOOP
   selected_product:=(p->>'productId')::uuid;
   FOR v IN SELECT value FROM jsonb_array_elements(coalesce(p->'additionalVariants','[]'::jsonb)) LOOP
    selected_variant:=(v->>'variantId')::uuid;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,barcode,price_cents,compare_at_cents,stock_tracking,stock_quantity,status,attributes,measurements,version,created_at,updated_at)
    VALUES(selected_variant,selected_product,p_store_id,v->>'title',v->>'sku',v->>'barcode',(v->>'priceCents')::bigint,(v->>'compareAtCents')::bigint,true,(v->>'stockQuantity')::bigint,'active',(v->'attributes')-'Ağırlık (g)',v->'measurements',1,p_now,p_now);
    INSERT INTO saas.catalog_variant_commerce_profiles(variant_id,product_id,store_id,version,created_at,updated_at) VALUES(selected_variant,selected_product,p_store_id,1,p_now,p_now);
   END LOOP;
   FOR v IN SELECT value FROM jsonb_array_elements(jsonb_build_array(p->'variant')||coalesce(p->'additionalVariants','[]'::jsonb)) LOOP
    IF v ? 'measurements' THEN UPDATE saas.product_variants SET measurements=v->'measurements',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=(v->>'variantId')::uuid; END IF;
   END LOOP;
   IF p ? 'sourceMetadata' THEN
    source_data:=p->'sourceMetadata';
    INSERT INTO saas.catalog_product_import_sources VALUES(p_store_id,selected_product,p_job_id,p->>'sourceProductId',p_source_digest,'qukasoft',source_data,p_now);
    desi:=CASE WHEN source_data->'fields'->>'desi'~'^[0-9]+(\.[0-9]{1,3})?$' THEN (source_data->'fields'->>'desi')::numeric*1000 ELSE NULL END;
    IF desi NOT BETWEEN 0 AND 9007199254740991 THEN RAISE EXCEPTION 'invalid_source_desi'; END IF;
    UPDATE saas.catalog_variant_commerce_profiles SET
     measured_quantity_milli=CASE WHEN source_data->'fields'->>'unit'='Adet' THEN 1000 ELSE measured_quantity_milli END,
     measured_unit=CASE WHEN source_data->'fields'->>'unit'='Adet' THEN 'piece' ELSE measured_unit END,
     base_quantity_milli=CASE WHEN source_data->'fields'->>'unit'='Adet' THEN 1000 ELSE base_quantity_milli END,
     base_unit=CASE WHEN source_data->'fields'->>'unit'='Adet' THEN 'piece' ELSE base_unit END,
     shipping_desi_milli=desi::bigint,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND product_id=selected_product;
   END IF;
  END LOOP;
  PERFORM set_config('saas.inventory.source_marker','',true);
  PERFORM set_config('saas.inventory.source_id','',true);
  PERFORM set_config('saas.inventory.source_time','',true);
  RETURN QUERY SELECT prior_outcome,prior_payload;
 EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'import_conflict',NULL::jsonb;
 END;
END $fn$;
REVOKE ALL ON FUNCTION saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,jsonb) TO celebix_saas_app;

-- Restore source image order only after the complete gallery is committed.
DO $order_patch$
DECLARE definition text; anchor text;
BEGIN
 definition:=pg_get_functiondef('saas.catalog_migration_record_media(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamptz,uuid,text,uuid,text,integer,text,text,uuid,text)'::regprocedure);
 anchor:=E'  next_status:=CASE\n';
 IF (length(definition)-length(replace(definition,anchor,'')))<>length(anchor) THEN RAISE EXCEPTION 'MIGRATION196_MEDIA_PREDECESSOR_DRIFT'; END IF;
 definition:=replace(definition,E'job.status=''processing'' OR p_now<job.updated_at',E'job.status=''processing''');
 definition:=replace(definition,E'  SELECT * INTO media_item FROM saas.catalog_product_migration_media_items',E'  p_now:=greatest(p_now,job.updated_at);\n  SELECT * INTO media_item FROM saas.catalog_product_migration_media_items');
 definition:=replace(definition,anchor,$ordering$
  -- migration196-order-start
  IF p_outcome='committed' AND NOT EXISTS(SELECT 1 FROM saas.catalog_product_migration_media_items WHERE store_id=p_store_id AND job_id=p_job_id AND source_product_id=p_source_product_id AND status<>'committed') THEN
    IF (SELECT count(*) FROM saas.product_media WHERE store_id=p_store_id AND product_id=migration_item.product_id AND status='active')=(SELECT count(*) FROM saas.catalog_product_migration_media_items WHERE store_id=p_store_id AND job_id=p_job_id AND source_product_id=p_source_product_id)
      AND NOT EXISTS(SELECT 1 FROM saas.catalog_product_migration_media_items source WHERE source.store_id=p_store_id AND source.job_id=p_job_id AND source.source_product_id=p_source_product_id AND NOT EXISTS(SELECT 1 FROM saas.product_media media WHERE media.store_id=p_store_id AND media.product_id=migration_item.product_id AND media.id=source.committed_media_id AND media.status='active')) THEN
      UPDATE saas.product_media SET status='pending',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND product_id=migration_item.product_id AND status='active';
      UPDATE saas.product_media media SET status='active',sort_order=source.ordinal,version=media.version+1,updated_at=p_now
      FROM saas.catalog_product_migration_media_items source WHERE source.store_id=p_store_id AND source.job_id=p_job_id AND source.source_product_id=p_source_product_id AND source.committed_media_id=media.id AND media.store_id=p_store_id AND media.product_id=migration_item.product_id AND media.status='pending';
    END IF;
  END IF;
  -- migration196-order-end
  next_status:=CASE
$ordering$);
 EXECUTE definition;
END $order_patch$;
COMMIT;
