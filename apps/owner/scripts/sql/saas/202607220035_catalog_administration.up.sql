-- Phase 3C2 tenant-scoped catalog administration, moderation and durable imports.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;

CREATE OR REPLACE FUNCTION saas.merchant_action_authority_error(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_required_feature text,p_required_action text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE membership_role text;
BEGIN
  IF p_store_id IS NULL OR p_principal_id IS NULL OR p_membership_id IS NULL OR p_plan_id IS NULL OR p_plan_code IS NULL OR p_plan_version IS NULL OR p_now IS NULL OR p_required_feature IS NULL OR p_required_action IS NULL OR p_required_action NOT IN ('orders.read','orders.manage','orders.fulfill','orders.payment','orders.note','carts.read','carts.manage','customers.read','customers.manage','customers.archive','catalog_admin.read','catalog_admin.manage','catalog_admin.archive','catalog_admin.import','catalog_admin.moderate') THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.stores s WHERE s.id=p_store_id AND s.status='active') THEN RETURN 'store_inactive'; END IF;
  SELECT m.role INTO membership_role FROM saas.memberships m WHERE m.id=p_membership_id AND m.store_id=p_store_id AND m.principal_id=p_principal_id AND m.status='active';
  IF membership_role IS NULL THEN RETURN 'membership_denied'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.subscriptions s JOIN saas.plans p ON p.id=s.plan_id AND p.plan_code=s.plan_code AND p.version=s.plan_version WHERE s.store_id=p_store_id AND s.plan_id=p_plan_id AND s.plan_code=p_plan_code AND s.plan_version=p_plan_version AND s.status='active' AND s.valid_from<=p_now AND (s.valid_until IS NULL OR s.valid_until>p_now) AND p.status='active' AND p.valid_from<=p_now AND (p.valid_until IS NULL OR p.valid_until>p_now)) THEN RETURN 'durable_authority_invalid'; END IF;
  IF NOT EXISTS(SELECT 1 FROM saas.plan_features f WHERE f.plan_id=p_plan_id AND f.enabled AND f.feature_key=p_required_feature) THEN RETURN 'feature_not_enabled'; END IF;
  IF NOT (membership_role IN ('store_owner','admin') OR (membership_role='editor' AND p_required_action IN ('orders.read','orders.fulfill','orders.note','carts.read','customers.read','customers.manage','catalog_admin.read','catalog_admin.manage')) OR (membership_role='analyst' AND p_required_action IN ('orders.read','carts.read','customers.read','catalog_admin.read'))) THEN RETURN 'membership_denied'; END IF;
  RETURN NULL;
END $f$;

CREATE TABLE saas.catalog_admin_resources(
  id uuid NOT NULL, store_id uuid NOT NULL, resource_kind text NOT NULL, name text NOT NULL, slug text NOT NULL,
  description text, config jsonb NOT NULL DEFAULT '{}'::jsonb, status text NOT NULL DEFAULT 'active', version bigint NOT NULL DEFAULT 1,
  archived_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(id), UNIQUE(store_id,id), UNIQUE(store_id,resource_kind,slug),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(resource_kind IN('collection','brand','attribute','extra','definition')),
  CHECK(name=pg_catalog.btrim(name) AND pg_catalog.char_length(name) BETWEEN 1 AND 120 AND name!~'[[:cntrl:]]'),
  CHECK(slug=pg_catalog.lower(slug) AND pg_catalog.char_length(slug) BETWEEN 1 AND 120 AND slug~'^[a-z0-9]+(-[a-z0-9]+)*$'),
  CHECK(description IS NULL OR (description=pg_catalog.btrim(description) AND pg_catalog.char_length(description) BETWEEN 1 AND 2000 AND description!~'[[:cntrl:]]')),
  CHECK(pg_catalog.jsonb_typeof(config)='object' AND pg_catalog.pg_column_size(config)<=8192),
  CHECK(status IN('active','archived')), CHECK(version>0), CHECK(updated_at>=created_at),
  CHECK((status='archived' AND archived_at IS NOT NULL) OR (status='active' AND archived_at IS NULL))
);

CREATE TABLE saas.catalog_admin_resource_products(
  store_id uuid NOT NULL, resource_id uuid NOT NULL, product_id uuid NOT NULL, position integer NOT NULL,
  PRIMARY KEY(store_id,resource_id,product_id), UNIQUE(store_id,resource_id,position),
  FOREIGN KEY(store_id,resource_id) REFERENCES saas.catalog_admin_resources(store_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  CHECK(position BETWEEN 0 AND 9999)
);

CREATE TABLE saas.product_reviews(
  id uuid NOT NULL, store_id uuid NOT NULL, product_id uuid NOT NULL, reviewer_name text NOT NULL,
  rating integer NOT NULL, review_title text, review_body text NOT NULL, status text NOT NULL DEFAULT 'pending', merchant_reply text,
  version bigint NOT NULL DEFAULT 1, archived_at timestamptz, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(id), UNIQUE(store_id,id), FOREIGN KEY(store_id,product_id) REFERENCES saas.products(store_id,id) ON DELETE RESTRICT,
  CHECK(reviewer_name=pg_catalog.btrim(reviewer_name) AND pg_catalog.char_length(reviewer_name) BETWEEN 1 AND 120 AND reviewer_name!~'[[:cntrl:]]'),
  CHECK(rating BETWEEN 1 AND 5), CHECK(review_title IS NULL OR (review_title=pg_catalog.btrim(review_title) AND pg_catalog.char_length(review_title) BETWEEN 1 AND 200 AND review_title!~'[[:cntrl:]]')),
  CHECK(review_body=pg_catalog.btrim(review_body) AND pg_catalog.char_length(review_body) BETWEEN 1 AND 5000 AND review_body!~'[[:cntrl:]]'),
  CHECK(merchant_reply IS NULL OR (merchant_reply=pg_catalog.btrim(merchant_reply) AND pg_catalog.char_length(merchant_reply) BETWEEN 1 AND 2000 AND merchant_reply!~'[[:cntrl:]]')),
  CHECK(status IN('pending','approved','rejected','archived')), CHECK(version>0), CHECK(updated_at>=created_at), CHECK((status='archived')=(archived_at IS NOT NULL))
);

CREATE TABLE saas.catalog_import_jobs(
  id uuid NOT NULL, store_id uuid NOT NULL, file_name text NOT NULL, payload_digest char(64) NOT NULL, status text NOT NULL,
  total_rows integer NOT NULL, succeeded_rows integer NOT NULL, failed_rows integer NOT NULL, error_summary text,
  version bigint NOT NULL DEFAULT 1, created_at timestamptz NOT NULL, updated_at timestamptz NOT NULL,
  PRIMARY KEY(id), UNIQUE(store_id,id), FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(file_name=pg_catalog.btrim(file_name) AND pg_catalog.char_length(file_name) BETWEEN 1 AND 200 AND file_name!~'[[:cntrl:]]'),
  CHECK(payload_digest~'^[a-f0-9]{64}$'), CHECK(status IN('processing','completed','failed')),
  CHECK(total_rows BETWEEN 1 AND 100 AND succeeded_rows BETWEEN 0 AND total_rows AND failed_rows BETWEEN 0 AND total_rows AND succeeded_rows+failed_rows=total_rows),
  CHECK(error_summary IS NULL OR (error_summary=pg_catalog.btrim(error_summary) AND pg_catalog.char_length(error_summary) BETWEEN 1 AND 1000 AND error_summary!~'[[:cntrl:]]')),
  CHECK(version>0), CHECK(updated_at>=created_at)
);

CREATE TABLE saas.catalog_admin_operations(
  operation_id uuid NOT NULL, store_id uuid NOT NULL, operation_kind text NOT NULL, payload_fingerprint char(64) NOT NULL,
  result_payload jsonb NOT NULL, committed_at timestamptz NOT NULL, PRIMARY KEY(operation_id),
  FOREIGN KEY(store_id) REFERENCES saas.stores(id) ON DELETE RESTRICT,
  CHECK(operation_kind IN('save_resource','archive_resource','moderate_review','import_products')),
  CHECK(payload_fingerprint~'^[a-f0-9]{64}$'), CHECK(pg_catalog.jsonb_typeof(result_payload)='object' AND pg_catalog.pg_column_size(result_payload)<=32768)
);

CREATE INDEX catalog_admin_resources_list_idx ON saas.catalog_admin_resources(store_id,resource_kind,status,updated_at DESC,id DESC);
CREATE INDEX product_reviews_list_idx ON saas.product_reviews(store_id,status,created_at DESC,id DESC);
CREATE INDEX catalog_import_jobs_list_idx ON saas.catalog_import_jobs(store_id,created_at DESC,id DESC);

CREATE FUNCTION saas.guard_catalog_admin_operation_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $f$ BEGIN RAISE EXCEPTION 'CATALOG_ADMIN_OPERATION_IMMUTABLE'; END $f$;
CREATE TRIGGER catalog_admin_operations_immutable BEFORE UPDATE OR DELETE ON saas.catalog_admin_operations FOR EACH ROW EXECUTE FUNCTION saas.guard_catalog_admin_operation_mutation();

DO $f$ DECLARE table_name text; BEGIN FOREACH table_name IN ARRAY ARRAY['catalog_admin_resources','catalog_admin_resource_products','product_reviews','catalog_import_jobs','catalog_admin_operations'] LOOP EXECUTE pg_catalog.format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',table_name); EXECUTE pg_catalog.format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',table_name); EXECUTE pg_catalog.format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver',table_name); END LOOP; END $f$;

CREATE FUNCTION saas.catalog_admin_timestamp(p_value timestamptz) RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=pg_catalog,saas AS $f$ SELECT pg_catalog.to_char(p_value AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') $f$;
CREATE FUNCTION saas.catalog_admin_mutation_projection(p_id uuid,p_version bigint,p_status text,p_updated_at timestamptz) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$ SELECT pg_catalog.jsonb_build_object('id',p_id,'version',p_version,'status',p_status,'updatedAt',saas.catalog_admin_timestamp(p_updated_at)) $f$;
CREATE FUNCTION saas.catalog_admin_resource_projection(p_store_id uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',r.id,'kind',r.resource_kind,'name',r.name,'slug',r.slug,'description',r.description,'config',r.config,'status',r.status,'productIds',(SELECT COALESCE(pg_catalog.jsonb_agg(rp.product_id ORDER BY rp.position),'[]'::jsonb) FROM saas.catalog_admin_resource_products rp WHERE rp.store_id=r.store_id AND rp.resource_id=r.id),'productCount',(SELECT pg_catalog.count(*) FROM saas.catalog_admin_resource_products rp WHERE rp.store_id=r.store_id AND rp.resource_id=r.id),'version',r.version,'createdAt',saas.catalog_admin_timestamp(r.created_at),'updatedAt',saas.catalog_admin_timestamp(r.updated_at))) FROM saas.catalog_admin_resources r WHERE r.store_id=p_store_id AND r.id=p_id $f$;
CREATE FUNCTION saas.product_review_projection(p_store_id uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',r.id,'productId',r.product_id,'productTitle',p.title,'reviewerName',r.reviewer_name,'rating',r.rating,'title',r.review_title,'body',r.review_body,'status',r.status,'merchantReply',r.merchant_reply,'version',r.version,'createdAt',saas.catalog_admin_timestamp(r.created_at),'updatedAt',saas.catalog_admin_timestamp(r.updated_at))) FROM saas.product_reviews r JOIN saas.products p ON p.store_id=r.store_id AND p.id=r.product_id WHERE r.store_id=p_store_id AND r.id=p_id $f$;
CREATE FUNCTION saas.catalog_import_projection(p_store_id uuid,p_id uuid) RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,saas AS $f$
 SELECT pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object('id',j.id,'fileName',j.file_name,'status',j.status,'totalRows',j.total_rows,'succeededRows',j.succeeded_rows,'failedRows',j.failed_rows,'errorSummary',j.error_summary,'version',j.version,'createdAt',saas.catalog_admin_timestamp(j.created_at),'updatedAt',saas.catalog_admin_timestamp(j.updated_at))) FROM saas.catalog_import_jobs j WHERE j.store_id=p_store_id AND j.id=p_id $f$;

CREATE FUNCTION saas.catalog_admin_list_resources(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_kind text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 IF p_kind NOT IN('collection','brand','attribute','extra','definition') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.catalog_admin_resource_projection(p_store_id,r.id) ORDER BY r.updated_at DESC,r.id DESC) FROM (SELECT id,updated_at FROM saas.catalog_admin_resources WHERE store_id=p_store_id AND resource_kind=p_kind ORDER BY updated_at DESC,id DESC LIMIT 200) r),'[]'::jsonb));
END $f$;

CREATE FUNCTION saas.catalog_admin_save_resource(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_resource_id uuid,p_expected_version bigint,p_kind text,p_name text,p_slug text,p_description text,p_config jsonb,p_product_ids uuid[])
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.catalog_admin_operations%ROWTYPE; current_resource saas.catalog_admin_resources%ROWTYPE; result jsonb;
BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.manage'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN; END IF;
 IF p_fingerprint!~'^[a-f0-9]{64}$' OR p_kind NOT IN('collection','brand','attribute','extra','definition') OR p_name IS NULL OR p_name<>pg_catalog.btrim(p_name) OR pg_catalog.char_length(p_name) NOT BETWEEN 1 AND 120 OR p_name~'[[:cntrl:]]' OR p_slug IS NULL OR p_slug!~'^[a-z0-9]+(-[a-z0-9]+)*$' OR pg_catalog.char_length(p_slug)>120 OR (p_description IS NOT NULL AND (p_description<>pg_catalog.btrim(p_description) OR pg_catalog.char_length(p_description) NOT BETWEEN 1 AND 2000 OR p_description~'[[:cntrl:]]')) OR pg_catalog.jsonb_typeof(p_config)<>'object' OR pg_catalog.pg_column_size(p_config)>8192 OR COALESCE(pg_catalog.array_length(p_product_ids,1),0)>100 OR COALESCE(pg_catalog.array_length(p_product_ids,1),0)<>COALESCE((SELECT pg_catalog.count(DISTINCT product_id) FROM pg_catalog.unnest(p_product_ids) AS product_ids(product_id)),0) OR EXISTS(SELECT 1 FROM pg_catalog.unnest(p_product_ids) AS product_ids(product_id) WHERE NOT EXISTS(SELECT 1 FROM saas.products p WHERE p.store_id=p_store_id AND p.id=product_ids.product_id AND p.status<>'archived')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 SELECT * INTO current_resource FROM saas.catalog_admin_resources WHERE store_id=p_store_id AND id=p_resource_id FOR UPDATE;
 IF FOUND THEN IF current_resource.resource_kind<>p_kind THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF; IF p_expected_version IS NULL OR current_resource.version<>p_expected_version OR current_resource.status<>'active' THEN RETURN QUERY SELECT CASE WHEN current_resource.status<>'active' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF; UPDATE saas.catalog_admin_resources SET name=p_name,slug=p_slug,description=p_description,config=p_config,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_resource_id;
 ELSE IF p_expected_version IS NOT NULL THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF; BEGIN INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,description,config,status,version,created_at,updated_at) VALUES(p_resource_id,p_store_id,p_kind,p_name,p_slug,p_description,p_config,'active',1,p_now,p_now); EXCEPTION WHEN unique_violation THEN RETURN QUERY SELECT 'slug_conflict',NULL::jsonb; RETURN; END; END IF;
 DELETE FROM saas.catalog_admin_resource_products WHERE store_id=p_store_id AND resource_id=p_resource_id;
 INSERT INTO saas.catalog_admin_resource_products(store_id,resource_id,product_id,position) SELECT p_store_id,p_resource_id,id,ordinality-1 FROM pg_catalog.unnest(p_product_ids) WITH ORDINALITY x(id,ordinality);
 SELECT saas.catalog_admin_mutation_projection(r.id,r.version,r.status,r.updated_at) INTO result FROM saas.catalog_admin_resources r WHERE r.store_id=p_store_id AND r.id=p_resource_id;
 INSERT INTO saas.catalog_admin_operations VALUES(p_operation_id,p_store_id,'save_resource',p_fingerprint,result,p_now); RETURN QUERY SELECT 'saved',result;
END $f$;

CREATE FUNCTION saas.catalog_admin_archive_resource(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_resource_id uuid,p_expected_version bigint)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; op saas.catalog_admin_operations%ROWTYPE; r saas.catalog_admin_resources%ROWTYPE; result jsonb; BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.archive'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF; SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN; END IF;
 SELECT * INTO r FROM saas.catalog_admin_resources WHERE store_id=p_store_id AND id=p_resource_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'resource_not_found',NULL::jsonb; RETURN; END IF; IF r.status<>'active' OR r.version<>p_expected_version THEN RETURN QUERY SELECT CASE WHEN r.status<>'active' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF;
 UPDATE saas.catalog_admin_resources SET status='archived',archived_at=p_now,updated_at=p_now,version=version+1 WHERE store_id=p_store_id AND id=p_resource_id RETURNING saas.catalog_admin_mutation_projection(id,version,status,updated_at) INTO result; INSERT INTO saas.catalog_admin_operations VALUES(p_operation_id,p_store_id,'archive_resource',p_fingerprint,result,p_now); RETURN QUERY SELECT 'archived',result;
END $f$;

CREATE FUNCTION saas.catalog_admin_list_reviews(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_status text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; BEGIN e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF; IF p_status IS NOT NULL AND p_status NOT IN('pending','approved','rejected','archived') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.product_review_projection(p_store_id,r.id) ORDER BY r.created_at DESC,r.id DESC) FROM (SELECT id,created_at FROM saas.product_reviews WHERE store_id=p_store_id AND (p_status IS NULL OR status=p_status) ORDER BY created_at DESC,id DESC LIMIT 200) r),'[]'::jsonb)); END $f$;

CREATE FUNCTION saas.catalog_admin_moderate_review(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_review_id uuid,p_expected_version bigint,p_status text,p_reply text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; op saas.catalog_admin_operations%ROWTYPE; r saas.product_reviews%ROWTYPE; result jsonb; BEGIN
 e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.moderate'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF; SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN; END IF;
 IF p_status NOT IN('approved','rejected','archived') OR (p_reply IS NOT NULL AND (p_reply<>pg_catalog.btrim(p_reply) OR pg_catalog.char_length(p_reply) NOT BETWEEN 1 AND 2000 OR p_reply~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; SELECT * INTO r FROM saas.product_reviews WHERE store_id=p_store_id AND id=p_review_id FOR UPDATE; IF NOT FOUND THEN RETURN QUERY SELECT 'review_not_found',NULL::jsonb; RETURN; END IF; IF r.status='archived' OR r.version<>p_expected_version THEN RETURN QUERY SELECT CASE WHEN r.status='archived' THEN 'invalid_transition' ELSE 'version_conflict' END,NULL::jsonb; RETURN; END IF;
 UPDATE saas.product_reviews SET status=p_status,merchant_reply=p_reply,archived_at=CASE WHEN p_status='archived' THEN p_now ELSE NULL END,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=p_review_id RETURNING saas.catalog_admin_mutation_projection(id,version,status,updated_at) INTO result; INSERT INTO saas.catalog_admin_operations VALUES(p_operation_id,p_store_id,'moderate_review',p_fingerprint,result,p_now); RETURN QUERY SELECT 'moderated',result;
END $f$;

CREATE FUNCTION saas.catalog_admin_list_imports(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; BEGIN e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF; RETURN QUERY SELECT 'listed',pg_catalog.jsonb_build_object('items',COALESCE((SELECT pg_catalog.jsonb_agg(saas.catalog_import_projection(p_store_id,j.id) ORDER BY j.created_at DESC,j.id DESC) FROM (SELECT id,created_at FROM saas.catalog_import_jobs WHERE store_id=p_store_id ORDER BY created_at DESC,id DESC LIMIT 100) j),'[]'::jsonb)); END $f$;

CREATE FUNCTION saas.catalog_admin_import_products(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_products_limit bigint,p_operation_id uuid,p_fingerprint text,p_job_id uuid,p_file_name text,p_rows jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE e text; op saas.catalog_admin_operations%ROWTYPE; row_value jsonb; row_count integer; result jsonb; store_currency text;
BEGIN
 e:=saas.catalog_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF; e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.import'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF;
 SELECT * INTO op FROM saas.catalog_admin_operations WHERE operation_id=p_operation_id AND store_id=p_store_id; IF FOUND THEN IF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; RETURN; END IF;
 IF p_fingerprint!~'^[a-f0-9]{64}$' OR p_file_name IS NULL OR p_file_name<>pg_catalog.btrim(p_file_name) OR pg_catalog.char_length(p_file_name) NOT BETWEEN 1 AND 200 OR p_file_name~'[[:cntrl:]]' OR pg_catalog.jsonb_typeof(p_rows)<>'array' OR pg_catalog.pg_column_size(p_rows)>131072 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF; row_count:=pg_catalog.jsonb_array_length(p_rows); IF row_count NOT BETWEEN 1 AND 100 OR (SELECT pg_catalog.count(*) FROM saas.products WHERE store_id=p_store_id AND status<>'archived')+row_count>p_products_limit THEN RETURN QUERY SELECT CASE WHEN row_count BETWEEN 1 AND 100 THEN 'product_limit_reached' ELSE 'invalid_input' END,NULL::jsonb; RETURN; END IF;
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

CREATE FUNCTION saas.catalog_admin_recover_operation(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$ DECLARE e text; op saas.catalog_admin_operations%ROWTYPE; BEGIN e:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'catalog','catalog_admin.read'); IF e IS NOT NULL THEN RETURN QUERY SELECT e,NULL::jsonb; RETURN; END IF; SELECT * INTO op FROM saas.catalog_admin_operations WHERE store_id=p_store_id AND operation_id=p_operation_id; IF NOT FOUND THEN RETURN QUERY SELECT 'operation_not_found',NULL::jsonb; ELSIF op.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb; ELSE RETURN QUERY SELECT 'operation_replayed',op.result_payload; END IF; END $f$;

GRANT EXECUTE ON FUNCTION saas.catalog_admin_list_resources(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[]),saas.catalog_admin_archive_resource(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint),saas.catalog_admin_list_reviews(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text),saas.catalog_admin_moderate_review(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,text),saas.catalog_admin_list_imports(uuid,uuid,uuid,uuid,text,bigint,timestamptz),saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamptz,bigint,uuid,text,uuid,text,jsonb),saas.catalog_admin_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text) TO celebix_saas_app;
REVOKE ALL ON FUNCTION saas.guard_catalog_admin_operation_mutation(),saas.catalog_admin_timestamp(timestamptz),saas.catalog_admin_mutation_projection(uuid,bigint,text,timestamptz),saas.catalog_admin_resource_projection(uuid,uuid),saas.product_review_projection(uuid,uuid),saas.catalog_import_projection(uuid,uuid) FROM PUBLIC;

COMMIT;
