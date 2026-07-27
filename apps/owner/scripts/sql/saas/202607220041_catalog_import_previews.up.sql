-- Phase 3H durable catalog import previews. Raw CSV bytes never enter PostgreSQL.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

ALTER TABLE saas.catalog_admin_operations DROP CONSTRAINT catalog_admin_operations_operation_kind_check;
ALTER TABLE saas.catalog_admin_operations ADD CONSTRAINT catalog_admin_operations_operation_kind_check
  CHECK(operation_kind IN('save_resource','archive_resource','moderate_review','import_products','prepare_import_preview','commit_import_preview'));
ALTER TABLE saas.catalog_admin_operations DROP CONSTRAINT catalog_admin_operations_result_payload_check;
ALTER TABLE saas.catalog_admin_operations ADD CONSTRAINT catalog_admin_operations_result_payload_check
  CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=262144);

CREATE OR REPLACE FUNCTION saas.catalog_admin_import_products(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_products_limit bigint,p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_file_name text,p_rows jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.catalog_admin_operations%ROWTYPE; row_value jsonb; row_count integer; result jsonb; store_currency text;
BEGIN
 e:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF; e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.import'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN; END IF;
 IF p_fingerprint!~'^[a-f0-9]{64}$' OR p_file_name IS NULL OR p_file_name<>pg_catalog.btrim(p_file_name) OR pg_catalog.char_length(p_file_name) NOT BETWEEN 1 AND 200 OR p_file_name~'[[:cntrl:]]' OR pg_catalog.jsonb_typeof(p_rows)<>'array' OR pg_catalog.pg_column_size(p_rows)>131072 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 row_count:=pg_catalog.jsonb_array_length(p_rows); IF row_count NOT BETWEEN 1 AND 100 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0));
 IF (SELECT pg_catalog.count(*) FROM saas.products WHERE store_id=p_store_id AND status<>'archived')+row_count>p_products_limit THEN RETURN QUERY SELECT 'product_limit_reached',NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(p_rows) r WHERE pg_catalog.jsonb_typeof(r)<>'object' OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(r))<>7 OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(r) k WHERE k NOT IN('productId','variantId','title','slug','priceCents','sku','stockQuantity')) OR (r->>'productId')!~'^[0-9a-f-]{36}$' OR (r->>'variantId')!~'^[0-9a-f-]{36}$' OR (r->>'slug')!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(r->>'slug')>100 OR r->>'title' IS NULL OR r->>'title'<>pg_catalog.btrim(r->>'title') OR pg_catalog.char_length(r->>'title') NOT BETWEEN 1 AND 200 OR (r->>'title')~'[[:cntrl:]]' OR pg_catalog.jsonb_typeof(r->'priceCents')<>'number' OR (r->>'priceCents')::numeric<0 OR (r->>'priceCents')::numeric>9007199254740991 OR pg_catalog.jsonb_typeof(r->'stockQuantity')<>'number' OR (r->>'stockQuantity')::numeric<0 OR (r->>'stockQuantity')::numeric>9007199254740991 OR (r->'sku'<>'null'::jsonb AND ((r->>'sku')!~'^[A-Z0-9][A-Z0-9._-]{0,63}$'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT currency INTO store_currency FROM saas.stores WHERE id=p_store_id;
 BEGIN
  FOR row_value IN SELECT value FROM pg_catalog.jsonb_array_elements(p_rows) LOOP
   INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES((row_value->>'productId')::uuid,p_store_id,row_value->>'slug',row_value->>'title','draft',store_currency,1,p_now,p_now);
   INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES((row_value->>'variantId')::uuid,(row_value->>'productId')::uuid,p_store_id,'Varsayılan',NULLIF(row_value->>'sku',''),(row_value->>'priceCents')::bigint,true,(row_value->>'stockQuantity')::bigint,'active','{}'::jsonb,1,p_now,p_now);
  END LOOP;
 EXCEPTION WHEN unique_violation OR check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'import_conflict',NULL::jsonb; RETURN; END;
 INSERT INTO saas.catalog_import_jobs(id,store_id,file_name,payload_digest,status,total_rows,succeeded_rows,failed_rows,version,created_at,updated_at) VALUES(p_job_id,p_store_id,p_file_name,p_fingerprint,'completed',row_count,row_count,0,1,p_now,p_now);
 SELECT saas.catalog_admin_mutation_projection(j.id,j.version,j.status,j.updated_at) INTO result FROM saas.catalog_import_jobs j WHERE j.store_id=p_store_id AND j.id=p_job_id; INSERT INTO saas.catalog_admin_operations VALUES(p_operation_id,p_store_id,'import_products',p_fingerprint,result,p_now); RETURN QUERY SELECT 'imported',result;
END $f$;
REVOKE ALL ON FUNCTION saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,jsonb) TO celebix_saas_app;

CREATE TABLE saas.catalog_import_previews(
  id uuid PRIMARY KEY,
  store_id uuid NOT NULL,
  format text NOT NULL CHECK(format IN('native_csv','shopify_csv')),
  file_name text NOT NULL,
  payload_digest char(64) NOT NULL CHECK(payload_digest~'^[a-f0-9]{64}$'),
  rows jsonb NOT NULL CHECK(pg_catalog.jsonb_typeof(rows)='array' AND pg_catalog.jsonb_array_length(rows) BETWEEN 1 AND 100 AND pg_catalog.pg_column_size(rows)<=131072),
  status text NOT NULL CHECK(status IN('prepared','consumed','expired')),
  version bigint NOT NULL CHECK(version>0),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL,
  UNIQUE(store_id,id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(file_name=pg_catalog.btrim(file_name) AND pg_catalog.char_length(file_name) BETWEEN 1 AND 200 AND file_name!~'[[:cntrl:]]'),
  CHECK(updated_at>=created_at AND expires_at>created_at),
  CHECK((status='consumed')=(consumed_at IS NOT NULL))
);
CREATE INDEX catalog_import_previews_store_expiry_idx ON saas.catalog_import_previews(store_id,status,expires_at,id);
ALTER TABLE saas.catalog_import_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.catalog_import_previews FORCE ROW LEVEL SECURITY;
REVOKE ALL ON saas.catalog_import_previews FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;

CREATE FUNCTION saas.guard_catalog_import_preview_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'CATALOG_IMPORT_PREVIEW_IMMUTABLE'; END IF;
 IF OLD.id IS DISTINCT FROM NEW.id OR OLD.store_id IS DISTINCT FROM NEW.store_id
    OR OLD.format IS DISTINCT FROM NEW.format OR OLD.file_name IS DISTINCT FROM NEW.file_name
    OR OLD.payload_digest IS DISTINCT FROM NEW.payload_digest OR OLD.rows IS DISTINCT FROM NEW.rows
    OR OLD.expires_at IS DISTINCT FROM NEW.expires_at OR OLD.created_at IS DISTINCT FROM NEW.created_at
 THEN RAISE EXCEPTION 'CATALOG_IMPORT_PREVIEW_IDENTITY_IMMUTABLE'; END IF;
 IF OLD.status<>'prepared' OR NEW.version<>OLD.version+1 OR NEW.updated_at<OLD.updated_at
    OR NOT ((NEW.status='consumed' AND NEW.consumed_at IS NOT NULL AND NEW.updated_at=NEW.consumed_at)
         OR (NEW.status='expired' AND NEW.consumed_at IS NULL))
 THEN RAISE EXCEPTION 'CATALOG_IMPORT_PREVIEW_LIFECYCLE_INVALID'; END IF;
 RETURN NEW;
END $f$;
CREATE TRIGGER catalog_import_previews_immutable
BEFORE UPDATE OR DELETE ON saas.catalog_import_previews
FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_import_preview_mutation();

CREATE FUNCTION saas.catalog_import_preview_rows_valid(p_rows jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_typeof(p_rows)='array'
   AND pg_catalog.jsonb_array_length(p_rows) BETWEEN 1 AND 100
   AND pg_catalog.pg_column_size(p_rows)<=131072
   AND NOT EXISTS(
     SELECT 1 FROM pg_catalog.jsonb_array_elements(p_rows) row_value
     WHERE pg_catalog.jsonb_typeof(row_value)<>'object'
       OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_object_keys(row_value) key WHERE key NOT IN('title','slug','priceCents','sku','stockQuantity'))
       OR NOT (row_value ?& ARRAY['title','slug','priceCents','stockQuantity'])
       OR (SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_object_keys(row_value)) NOT IN(4,5)
       OR pg_catalog.jsonb_typeof(row_value->'title')<>'string'
       OR row_value->>'title'<>pg_catalog.btrim(row_value->>'title')
       OR pg_catalog.char_length(row_value->>'title') NOT BETWEEN 1 AND 200
       OR row_value->>'title'~'[[:cntrl:]]'
       OR pg_catalog.jsonb_typeof(row_value->'slug')<>'string'
       OR row_value->>'slug'!~'^[a-z0-9]+(-[a-z0-9]+)*$'
       OR pg_catalog.char_length(row_value->>'slug') NOT BETWEEN 3 AND 100
       OR pg_catalog.jsonb_typeof(row_value->'priceCents')<>'number'
       OR (row_value->>'priceCents')::numeric<>pg_catalog.trunc((row_value->>'priceCents')::numeric)
       OR (row_value->>'priceCents')::numeric NOT BETWEEN 0 AND 9007199254740991
       OR pg_catalog.jsonb_typeof(row_value->'stockQuantity')<>'number'
       OR (row_value->>'stockQuantity')::numeric<>pg_catalog.trunc((row_value->>'stockQuantity')::numeric)
       OR (row_value->>'stockQuantity')::numeric NOT BETWEEN 0 AND 9007199254740991
       OR (row_value ? 'sku' AND (pg_catalog.jsonb_typeof(row_value->'sku')<>'string' OR row_value->>'sku'!~'^[A-Z0-9][A-Z0-9._-]{0,63}$'))
   )
$f$;

CREATE FUNCTION saas.catalog_import_preview_projection(p_store_id uuid,p_id uuid,p_now timestamptz)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_build_object(
   'id',p.id,'format',p.format,'fileName',p.file_name,'digest',p.payload_digest,
   'status',CASE WHEN p.status='prepared' AND p.expires_at<=p_now THEN 'expired' ELSE p.status END,
   'rows',p.rows,'totalRows',pg_catalog.jsonb_array_length(p.rows),'version',p.version,
   'expiresAt',saas.catalog_admin_timestamp(p.expires_at),'createdAt',saas.catalog_admin_timestamp(p.created_at),
   'updatedAt',saas.catalog_admin_timestamp(p.updated_at)
 ) FROM saas.catalog_import_previews p WHERE p.store_id=p_store_id AND p.id=p_id
$f$;

CREATE FUNCTION saas.catalog_import_preview_uuid(p_preview_id uuid,p_position integer,p_kind text)
RETURNS uuid LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$
 SELECT (
   pg_catalog.substr(h,1,8)||'-'||pg_catalog.substr(h,9,4)||'-4'||pg_catalog.substr(h,14,3)||'-8'||pg_catalog.substr(h,18,3)||'-'||pg_catalog.substr(h,21,12)
 )::uuid
 FROM (SELECT pg_catalog.md5(p_preview_id::text||':'||p_position::text||':'||p_kind) h) digest
$f$;

CREATE FUNCTION saas.catalog_admin_prepare_import_preview(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_products_limit bigint,p_operation_id uuid,p_fingerprint text,p_preview_id uuid,p_format text,p_file_name text,p_digest text,p_rows jsonb
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.catalog_admin_operations%ROWTYPE; result jsonb;
BEGIN
 e:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.import');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.import.preview.operation:'||p_operation_id::text,0));
 SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
   IF op.store_id<>p_store_id OR op.operation_kind<>'prepare_import_preview' OR op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
   ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN;
 END IF;
 IF p_fingerprint!~'^[a-f0-9]{64}$' OR p_format NOT IN('native_csv','shopify_csv')
    OR p_file_name IS NULL OR p_file_name<>pg_catalog.btrim(p_file_name) OR pg_catalog.char_length(p_file_name) NOT BETWEEN 1 AND 200 OR p_file_name~'[[:cntrl:]]'
    OR p_digest!~'^[a-f0-9]{64}$' OR NOT saas.catalog_import_preview_rows_valid(p_rows)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0));
 IF (SELECT pg_catalog.count(*) FROM saas.products WHERE store_id=p_store_id AND status<>'archived')+pg_catalog.jsonb_array_length(p_rows)>p_products_limit
 THEN RETURN QUERY SELECT 'product_limit_reached',NULL::jsonb; RETURN; END IF;
 BEGIN
   INSERT INTO saas.catalog_import_previews(id,store_id,format,file_name,payload_digest,rows,status,version,expires_at,created_at,updated_at)
   VALUES(p_preview_id,p_store_id,p_format,p_file_name,p_digest,p_rows,'prepared',1,p_now+INTERVAL '15 minutes',p_now,p_now);
 EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'import_conflict',NULL::jsonb; RETURN; END;
 SELECT saas.catalog_import_preview_projection(p_store_id,p_preview_id,p_now) INTO result;
 INSERT INTO saas.catalog_admin_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
 VALUES(p_operation_id,p_store_id,'prepare_import_preview',p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'prepared',result;
END $f$;

CREATE FUNCTION saas.catalog_admin_get_import_preview(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_preview_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; result jsonb;
BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT saas.catalog_import_preview_projection(p_store_id,p_preview_id,p_now) INTO result;
 IF result IS NULL THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; ELSE RETURN QUERY SELECT 'found',result; END IF;
END $f$;

CREATE FUNCTION saas.catalog_admin_commit_import_preview(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,
  p_products_limit bigint,p_operation_id uuid,p_fingerprint text,p_preview_id uuid,p_expected_version bigint,p_format text,p_digest text,p_rows jsonb,p_job_id uuid
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.catalog_admin_operations%ROWTYPE; preview saas.catalog_import_previews%ROWTYPE; row_value jsonb; position integer:=0; result jsonb; store_currency text; row_count integer;
BEGIN
 e:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now);
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.import');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.import.preview.operation:'||p_operation_id::text,0));
 SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
   IF op.store_id<>p_store_id OR op.operation_kind<>'commit_import_preview' OR op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
 END IF;
 IF p_fingerprint!~'^[a-f0-9]{64}$' OR p_expected_version IS NULL OR p_expected_version<1 OR p_format IS NULL OR p_format NOT IN('native_csv','shopify_csv') OR p_digest IS NULL OR p_digest!~'^[a-f0-9]{64}$' OR p_rows IS NULL OR NOT saas.catalog_import_preview_rows_valid(p_rows) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('saas.catalog.store:' || p_store_id::text, 0));
 SELECT * INTO preview FROM saas.catalog_import_previews WHERE store_id=p_store_id AND id=p_preview_id FOR UPDATE;
 IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF;
 IF preview.format IS DISTINCT FROM p_format OR preview.payload_digest IS DISTINCT FROM p_digest OR preview.rows IS DISTINCT FROM p_rows THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; RETURN; END IF;
 IF op.operation_id IS NOT NULL THEN RETURN QUERY SELECT 'operation_replayed',op.result_payload; RETURN; END IF;
 IF preview.status<>'prepared' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN; END IF;
 IF preview.version<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb; RETURN; END IF;
 IF preview.expires_at<=p_now THEN
   UPDATE saas.catalog_import_previews SET status='expired',version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_preview_id;
   RETURN QUERY SELECT 'invalid_transition',NULL::jsonb; RETURN;
 END IF;
 row_count:=pg_catalog.jsonb_array_length(preview.rows);
 IF (SELECT pg_catalog.count(*) FROM saas.products WHERE store_id=p_store_id AND status<>'archived')+row_count>p_products_limit
 THEN RETURN QUERY SELECT 'product_limit_reached',NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(preview.rows) r JOIN saas.products p ON p.store_id=p_store_id AND p.slug=r->>'slug' AND p.status<>'archived')
    OR EXISTS(SELECT 1 FROM pg_catalog.jsonb_array_elements(preview.rows) r WHERE r ? 'sku' AND EXISTS(SELECT 1 FROM saas.product_variants v WHERE v.store_id=p_store_id AND v.sku=r->>'sku'))
    OR (SELECT pg_catalog.count(DISTINCT r->>'slug') FROM pg_catalog.jsonb_array_elements(preview.rows) r)<>row_count
    OR (SELECT pg_catalog.count(DISTINCT r->>'sku') FROM pg_catalog.jsonb_array_elements(preview.rows) r WHERE r ? 'sku')<>(SELECT pg_catalog.count(*) FROM pg_catalog.jsonb_array_elements(preview.rows) r WHERE r ? 'sku')
 THEN RETURN QUERY SELECT 'import_conflict',NULL::jsonb; RETURN; END IF;
 SELECT currency INTO store_currency FROM saas.stores WHERE id=p_store_id;
 BEGIN
   FOR row_value IN SELECT value FROM pg_catalog.jsonb_array_elements(preview.rows) LOOP
     position:=position+1;
     INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at)
     VALUES(saas.catalog_import_preview_uuid(p_preview_id,position,'product'),p_store_id,row_value->>'slug',row_value->>'title','draft',store_currency,1,p_now,p_now);
     INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at)
     VALUES(saas.catalog_import_preview_uuid(p_preview_id,position,'variant'),saas.catalog_import_preview_uuid(p_preview_id,position,'product'),p_store_id,'Varsayılan',CASE WHEN row_value ? 'sku' THEN row_value->>'sku' ELSE NULL END,(row_value->>'priceCents')::bigint,true,(row_value->>'stockQuantity')::bigint,'active','{}'::jsonb,1,p_now,p_now);
   END LOOP;
 EXCEPTION WHEN unique_violation OR check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
   RETURN QUERY SELECT 'import_conflict',NULL::jsonb; RETURN;
 END;
 INSERT INTO saas.catalog_import_jobs(id,store_id,file_name,payload_digest,status,total_rows,succeeded_rows,failed_rows,version,created_at,updated_at)
 VALUES(p_job_id,p_store_id,preview.file_name,preview.payload_digest,'completed',row_count,row_count,0,1,p_now,p_now);
 UPDATE saas.catalog_import_previews SET status='consumed',consumed_at=p_now,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_preview_id;
 SELECT saas.catalog_admin_mutation_projection(j.id,j.version,j.status,j.updated_at) INTO result FROM saas.catalog_import_jobs j WHERE j.store_id=p_store_id AND j.id=p_job_id;
 INSERT INTO saas.catalog_admin_operations(operation_id,store_id,operation_kind,payload_fingerprint,result_payload,committed_at)
 VALUES(p_operation_id,p_store_id,'commit_import_preview',p_fingerprint,result,p_now);
 RETURN QUERY SELECT 'imported',result;
END $f$;

CREATE FUNCTION saas.catalog_admin_recover_import_preview_operation(
  p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text
) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.catalog_admin_operations%ROWTYPE;
BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read');
 IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND OR op.store_id<>p_store_id OR op.operation_kind NOT IN('prepare_import_preview','commit_import_preview') THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb;
 ELSIF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;
 ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF;
END $f$;

REVOKE ALL ON FUNCTION saas.guard_catalog_import_preview_mutation(),saas.catalog_import_preview_rows_valid(jsonb),saas.catalog_import_preview_projection(uuid,uuid,timestamptz),saas.catalog_import_preview_uuid(uuid,integer,text) FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
REVOKE ALL ON FUNCTION saas.catalog_admin_prepare_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,text,text,jsonb),saas.catalog_admin_get_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.catalog_admin_commit_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,bigint,text,text,jsonb,uuid),saas.catalog_admin_recover_import_preview_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) FROM PUBLIC,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator;
GRANT EXECUTE ON FUNCTION saas.catalog_admin_prepare_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,text,text,jsonb),saas.catalog_admin_get_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid),saas.catalog_admin_commit_import_preview(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,bigint,text,text,jsonb,uuid),saas.catalog_admin_recover_import_preview_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;

COMMIT;
