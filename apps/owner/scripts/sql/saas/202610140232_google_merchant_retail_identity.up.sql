-- Publish the common retail TRY amount and confirmed own-brand identifiers.
-- No tenant is declared a manufacturer by this migration.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='120s';
CREATE TABLE saas.google_merchant_232_backup(signature text PRIMARY KEY,definition text NOT NULL,installed_at timestamptz NOT NULL DEFAULT clock_timestamp());
INSERT INTO saas.google_merchant_232_backup SELECT p.oid::regprocedure::text,pg_get_functiondef(p.oid),clock_timestamp()
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname IN('google_merchant_command','google_merchant_projection','google_merchant_claim','google_merchant_job_projection','google_merchant_read','google_merchant_finish','google_merchant_defer','google_merchant_gtin_valid');
CREATE TABLE saas.google_merchant_identity_profiles(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id),own_brand boolean NOT NULL DEFAULT false,brand_name text,
 version bigint NOT NULL CHECK(version BETWEEN 1 AND 9007199254740991),updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK((own_brand AND brand_name IS NOT NULL AND brand_name=btrim(brand_name) AND length(brand_name) BETWEEN 1 AND 70 AND brand_name!~'[<>[:cntrl:]]') OR(NOT own_brand AND brand_name IS NULL))
);
CREATE TABLE saas.google_merchant_catalog_revisions(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id),revision bigint NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991)
);
CREATE TABLE saas.google_merchant_catalog_batches(
 store_id uuid PRIMARY KEY REFERENCES saas.stores(id),include_fixed boolean NOT NULL DEFAULT false,
 cursor_variant uuid,processed boolean NOT NULL DEFAULT false,updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX google_merchant_catalog_batches_pending_idx ON saas.google_merchant_catalog_batches(store_id) WHERE NOT processed;
ALTER TABLE saas.google_merchant_outbox ADD COLUMN lease_catalog_revision bigint CHECK(lease_catalog_revision IS NULL OR lease_catalog_revision BETWEEN 0 AND 9007199254740991);
DO $private$ DECLARE tab text;BEGIN
 FOREACH tab IN ARRAY ARRAY['google_merchant_232_backup','google_merchant_identity_profiles','google_merchant_catalog_revisions','google_merchant_catalog_batches'] LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',tab);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability',tab);
 END LOOP;
 CREATE TRIGGER platform_support_atomic_journal AFTER INSERT OR UPDATE OR DELETE ON saas.google_merchant_identity_profiles FOR EACH ROW EXECUTE FUNCTION saas.platform_support_journal_write();
END $private$;

CREATE OR REPLACE FUNCTION saas.google_merchant_gtin_valid(p_value text) RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog AS $f$
DECLARE total integer:=0;weight integer:=3;i integer;unpadded text;
BEGIN
 IF p_value IS NULL OR p_value!~'^([0-9]{8}|[0-9]{12}|[0-9]{13}|[0-9]{14})$' OR p_value~'^0+$' THEN RETURN false;END IF;
 unpadded:=CASE WHEN length(p_value)=14 AND left(p_value,1)='0' THEN substring(p_value,2) ELSE p_value END;
 IF unpadded~'^(02|04|05|2|98|99)' THEN RETURN false;END IF;
 FOR i IN REVERSE length(p_value)-1..1 LOOP total:=total+substring(p_value,i,1)::integer*weight;weight:=CASE weight WHEN 3 THEN 1 ELSE 3 END;END LOOP;
 RETURN(10-total%10)%10=right(p_value,1)::integer;
END $f$;

CREATE FUNCTION saas.google_merchant_identity_profile(p_store uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('ownBrand',coalesce(p.own_brand,false),'brandName',p.brand_name,'version',coalesce(p.version,0)) FROM(SELECT 1) dummy LEFT JOIN saas.google_merchant_identity_profiles p ON p.store_id=p_store
$f$;
CREATE FUNCTION saas.google_merchant_editable_attributes(p_attrs jsonb) RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE key text;value jsonb;result jsonb:='{}';
BEGIN
 IF jsonb_typeof(p_attrs) IS DISTINCT FROM 'object' THEN RETURN result;END IF;
 FOREACH key IN ARRAY ARRAY['gtin','mpn','identifierExists','color','size','material','gender','ageGroup'] LOOP
  value:=p_attrs->key;IF value IS NULL THEN CONTINUE;END IF;
  IF key='identifierExists' THEN IF jsonb_typeof(value)='boolean' THEN result:=result||jsonb_build_object(key,value);END IF;CONTINUE;END IF;
  IF jsonb_typeof(value)<>'string' OR length(value#>>'{}') NOT BETWEEN 1 AND 70 OR value#>>'{}'<>btrim(value#>>'{}') OR value#>>'{}'~'[<>[:cntrl:]]' THEN CONTINUE;END IF;
  IF key='gtin' AND NOT saas.google_merchant_gtin_valid(value#>>'{}') OR key='gender' AND value#>>'{}' NOT IN('male','female','unisex') OR key='ageGroup' AND value#>>'{}' NOT IN('newborn','infant','toddler','kids','adult') THEN CONTINUE;END IF;
  result:=result||jsonb_build_object(key,value);
 END LOOP;
 IF result->>'identifierExists'='false' THEN result:=result-ARRAY['gtin','mpn'];END IF;
 RETURN result;
END $f$;
CREATE FUNCTION saas.google_merchant_variant_identifiers(p_store uuid,p_variant uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,saas AS $f$
DECLARE v saas.product_variants;profile saas.google_merchant_identity_profiles;attrs jsonb;brand_name text;gtin text;mpn text;own boolean;
BEGIN
 SELECT * INTO v FROM saas.product_variants WHERE store_id=p_store AND id=p_variant;
 IF NOT FOUND THEN RETURN '{}'::jsonb;END IF;
 SELECT coalesce(attributes,'{}') INTO attrs FROM saas.google_merchant_preferences WHERE store_id=p_store AND variant_id=p_variant;attrs:=coalesce(attrs,'{}');
 SELECT * INTO profile FROM saas.google_merchant_identity_profiles WHERE store_id=p_store;
 SELECT r.name INTO brand_name FROM saas.catalog_admin_resource_products a JOIN saas.catalog_admin_resources r ON r.store_id=a.store_id AND r.id=a.resource_id AND r.resource_kind='brand' AND r.status='active' WHERE a.store_id=p_store AND a.product_id=v.product_id ORDER BY a.position,r.id LIMIT 1;
 own:=coalesce(profile.own_brand,false) AND (brand_name IS NULL OR brand_name=profile.brand_name);
 IF own AND brand_name IS NULL THEN brand_name:=profile.brand_name;END IF;
 IF brand_name IS NOT NULL AND(length(brand_name) NOT BETWEEN 1 AND 70 OR brand_name<>btrim(brand_name) OR brand_name~'[<>[:cntrl:]]') THEN brand_name:=NULL;END IF;
 IF attrs->>'identifierExists'='false' THEN RETURN jsonb_strip_nulls(jsonb_build_object('brand',brand_name,'identifierExists',false));END IF;
 gtin:=CASE WHEN saas.google_merchant_gtin_valid(attrs->>'gtin') THEN attrs->>'gtin' END;
 mpn:=CASE WHEN length(attrs->>'mpn') BETWEEN 1 AND 70 AND attrs->>'mpn'=btrim(attrs->>'mpn') AND attrs->>'mpn'!~'[<>[:cntrl:]]' THEN attrs->>'mpn' END;
 -- Legacy store barcodes remain store barcodes; never pad/relabel them as GTIN.
 IF gtin IS NULL AND saas.google_merchant_gtin_valid(v.barcode) THEN gtin:=v.barcode;END IF;
 IF own AND gtin IS NULL AND mpn IS NULL THEN
  mpn:=coalesce(CASE WHEN length(v.sku) BETWEEN 1 AND 70 AND v.sku=btrim(v.sku) AND v.sku!~'[<>[:cntrl:]]' THEN v.sku END,CASE WHEN length(v.barcode) BETWEEN 1 AND 70 AND v.barcode=btrim(v.barcode) AND v.barcode!~'[<>[:cntrl:]]' THEN v.barcode END);
 END IF;
 RETURN jsonb_strip_nulls(jsonb_build_object('brand',brand_name,'gtin',gtin,'mpn',mpn,'identifierExists',CASE WHEN jsonb_typeof(attrs->'identifierExists')='boolean' THEN attrs->'identifierExists' END));
END $f$;

CREATE FUNCTION saas.google_merchant_catalog_changed() RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE s uuid:=CASE WHEN TG_OP='DELETE' THEN OLD.store_id ELSE NEW.store_id END;all_variants boolean:=TG_TABLE_NAME='google_merchant_identity_profiles';
BEGIN
 IF TG_TABLE_NAME='pricing_reference_state' THEN
  IF TG_OP='UPDATE' AND NEW.active_set_id IS NOT DISTINCT FROM OLD.active_set_id AND NEW.version=OLD.version THEN RETURN NULL;END IF;
 ELSIF TG_TABLE_NAME='pricing_dynamic_activation' THEN
  IF TG_OP='UPDATE' AND NEW.enabled=OLD.enabled THEN RETURN NULL;END IF;
 END IF;
 -- Reference activation already owns this lock. Identity writes use it too.
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||s::text,0));
 INSERT INTO saas.google_merchant_catalog_revisions(store_id,revision) VALUES(s,1) ON CONFLICT(store_id) DO UPDATE SET revision=saas.google_merchant_catalog_revisions.revision+1;
 IF EXISTS(SELECT 1 FROM saas.google_marketing_connections WHERE store_id=s AND service='merchant' AND status='connected' AND credential IS NOT NULL) THEN
  INSERT INTO saas.google_merchant_catalog_batches(store_id,include_fixed) VALUES(s,all_variants)
  ON CONFLICT(store_id) DO UPDATE SET include_fixed=EXCLUDED.include_fixed OR CASE WHEN saas.google_merchant_catalog_batches.processed THEN false ELSE saas.google_merchant_catalog_batches.include_fixed END,cursor_variant=NULL,processed=false,updated_at=clock_timestamp();
 END IF;RETURN NULL;
END $f$;
CREATE TRIGGER google_merchant_reference_changed AFTER INSERT OR UPDATE OF active_set_id,version OR DELETE ON saas.pricing_reference_state FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_catalog_changed();
CREATE TRIGGER google_merchant_dynamic_activation_changed AFTER INSERT OR UPDATE OR DELETE ON saas.pricing_dynamic_activation FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_catalog_changed();
CREATE TRIGGER google_merchant_identity_changed AFTER INSERT OR UPDATE OR DELETE ON saas.google_merchant_identity_profiles FOR EACH ROW EXECUTE FUNCTION saas.google_merchant_catalog_changed();
CREATE FUNCTION saas.google_merchant_advance_catalog_batches(p_now timestamptz) RETURNS void LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE batch record;v record;seen integer;last_id uuid;more boolean;
BEGIN
 -- Pending-index only; at most five stores and 100 variants per store. No full save-time scan.
 FOR batch IN SELECT * FROM saas.google_merchant_catalog_batches WHERE NOT processed ORDER BY store_id LIMIT 5 FOR UPDATE SKIP LOCKED LOOP
  IF NOT EXISTS(SELECT 1 FROM saas.google_marketing_connections WHERE store_id=batch.store_id AND service='merchant' AND status='connected' AND credential IS NOT NULL) THEN UPDATE saas.google_merchant_catalog_batches SET processed=true WHERE store_id=batch.store_id;CONTINUE;END IF;
  seen:=0;last_id:=batch.cursor_variant;more:=false;
  FOR v IN WITH chunk AS MATERIALIZED(SELECT id,product_id FROM saas.product_variants WHERE store_id=batch.store_id AND(batch.cursor_variant IS NULL OR id>batch.cursor_variant) ORDER BY id LIMIT 101)
   SELECT chunk.*,batch.include_fixed OR EXISTS(SELECT 1 FROM saas.pricing_variant_policy_state state JOIN saas.pricing_variant_policy_versions policy ON policy.store_id=state.store_id AND policy.variant_id=state.variant_id AND policy.version=state.current_version WHERE state.store_id=batch.store_id AND state.variant_id=chunk.id AND policy.method IN('usd','eur','gold_gram')) AS needs_enqueue FROM chunk ORDER BY chunk.id LOOP
   seen:=seen+1;IF seen>100 THEN more:=true;EXIT;END IF;
   IF v.needs_enqueue THEN PERFORM saas.google_merchant_enqueue(batch.store_id,v.product_id,v.id);END IF;last_id:=v.id;
  END LOOP;
  UPDATE saas.google_merchant_catalog_batches SET cursor_variant=last_id,processed=NOT more,updated_at=p_now WHERE store_id=batch.store_id;
 END LOOP;
END $f$;

-- Keep all legacy command/worker shapes usable during NET -> SITE rollout.
ALTER FUNCTION saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb) RENAME TO google_merchant_command_before_retail_identity;
REVOKE ALL ON FUNCTION saas.google_merchant_command_before_retail_identity(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver;
CREATE FUNCTION saas.google_merchant_command(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_action text,p_input jsonb)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE result record;err text;current_version bigint;operation saas.google_merchant_operations;op uuid;payload jsonb;
BEGIN
 IF p_action IS DISTINCT FROM 'identity' THEN
  IF p_action='overview' AND p_input?'includeIdentity' AND(jsonb_typeof(p_input->'includeIdentity') IS DISTINCT FROM 'boolean' OR p_input-ARRAY['includeIdentity']<>'{}') THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  SELECT * INTO result FROM saas.google_merchant_command_before_retail_identity(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_action,p_input-'includeIdentity');
  RETURN QUERY SELECT result.outcome::text,CASE WHEN p_action='overview' AND result.outcome='found' AND p_input->>'includeIdentity'='true' THEN result.result_payload||jsonb_build_object('identityProfile',saas.google_merchant_identity_profile(p_store_id)) ELSE result.result_payload END;RETURN;
 END IF;
 err:=saas.merchant_action_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'integrations','integrations.manage');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT saas.platform_membership_is_authorized(p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_now IS NULL OR NOT isfinite(p_now) OR jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR NOT(p_input?&ARRAY['operationId','fingerprint','ownBrand','brandName','expectedVersion']) OR p_input-ARRAY['operationId','fingerprint','ownBrand','brandName','expectedVersion']<>'{}'
  OR jsonb_typeof(p_input->'operationId') IS DISTINCT FROM 'string' OR jsonb_typeof(p_input->'fingerprint') IS DISTINCT FROM 'string' OR p_input->>'operationId'!~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' OR p_input->>'fingerprint'!~'^[a-f0-9]{64}$'
  OR jsonb_typeof(p_input->'ownBrand') IS DISTINCT FROM 'boolean' OR jsonb_typeof(p_input->'expectedVersion') IS DISTINCT FROM 'number' OR p_input->>'expectedVersion'!~'^[0-9]{1,16}$' OR(p_input->>'expectedVersion')::numeric>9007199254740991
  OR(CASE WHEN p_input->>'ownBrand'='true' THEN jsonb_typeof(p_input->'brandName') IS DISTINCT FROM 'string' OR p_input->>'brandName'<>btrim(p_input->>'brandName') OR length(p_input->>'brandName') NOT BETWEEN 1 AND 70 OR p_input->>'brandName'~'[<>[:cntrl:]]' ELSE p_input->'brandName'<>'null'::jsonb END)
 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.store_domains WHERE store_id=p_store_id AND is_primary AND status='active' AND verified_at<=clock_timestamp()) THEN RETURN QUERY SELECT 'wrong_domain',NULL::jsonb;RETURN;END IF;
 op:=(p_input->>'operationId')::uuid;
 PERFORM pg_advisory_xact_lock(hashtextextended('google.merchant.operation:'||op::text,232));
 PERFORM pg_advisory_xact_lock(hashtextextended('google.merchant:'||p_store_id::text,230));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO operation FROM saas.google_merchant_operations WHERE operation_id=op;
 IF FOUND THEN IF operation.store_id<>p_store_id OR operation.membership_id<>p_membership_id OR operation.fingerprint IS DISTINCT FROM p_input->>'fingerprint' THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;RETURN QUERY SELECT 'saved',operation.result_payload||jsonb_build_object('replayed',true);RETURN;END IF;
 SELECT version INTO current_version FROM saas.google_merchant_identity_profiles WHERE store_id=p_store_id;
 IF coalesce(current_version,0)<>(p_input->>'expectedVersion')::bigint THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 IF coalesce(current_version,0)>=9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM saas.platform_support_begin(p_store_id,p_principal_id,p_membership_id,'google_merchant.identity');
 INSERT INTO saas.google_merchant_identity_profiles(store_id,own_brand,brand_name,version) VALUES(p_store_id,(p_input->>'ownBrand')::boolean,p_input->>'brandName',1)
 ON CONFLICT(store_id) DO UPDATE SET own_brand=EXCLUDED.own_brand,brand_name=EXCLUDED.brand_name,version=saas.google_merchant_identity_profiles.version+1,updated_at=clock_timestamp();
 payload:=jsonb_build_object('saved',true,'replayed',false);
 INSERT INTO saas.google_merchant_operations VALUES(op,p_store_id,p_membership_id,p_input->>'fingerprint',payload,clock_timestamp());
 RETURN QUERY SELECT 'saved',payload;
END $f$;

DO $projection$ DECLARE definition text;old_identifiers text;BEGIN
 SELECT b.definition INTO definition FROM saas.google_merchant_232_backup b WHERE b.signature='saas.google_merchant_projection(uuid,uuid,timestamp with time zone)';
 -- regprocedure names may use canonical timestamptz spelling; bind by function name instead.
 IF definition IS NULL THEN SELECT b.definition INTO definition FROM saas.google_merchant_232_backup b WHERE b.signature LIKE 'saas.google_merchant_projection(%';END IF;
 IF position('IF method<>''fixed_try'' THEN' IN definition)=0 OR position('gtin:=attrs->>''gtin'';' IN definition)=0 OR position('DECLARE v saas.product_variants;' IN definition)=0 THEN RAISE EXCEPTION 'MERCHANT232_PROJECTION_DRIFT';END IF;
 definition:=replace(definition,'DECLARE v saas.product_variants;','DECLARE retail_ids jsonb;retail_edit_attrs jsonb;v saas.product_variants;');
 definition:=regexp_replace(definition,' IF method<>''fixed_try'' THEN[^\n]+\n','','g');
 definition:=replace(definition,'gtin:=attrs->>''gtin'';', 'retail_edit_attrs:=saas.google_merchant_editable_attributes(attrs); retail_ids:=saas.google_merchant_variant_identifiers(p_store,p_variant); IF NOT saas.google_merchant_attributes_valid(attrs) THEN issues:=issues||jsonb_build_array(jsonb_build_object(''code'',''manufacturer_attributes_invalid'',''message'',''Google ürün tanımlayıcılarını kontrol edin.''));END IF; IF attrs?''gtin'' AND NOT saas.google_merchant_gtin_valid(attrs->>''gtin'') THEN issues:=issues||jsonb_build_array(jsonb_build_object(''code'',''manufacturer_gtin_invalid'',''message'',''GTIN üretici tanımlayıcısı olarak geçerli değil.''));END IF; IF attrs?''mpn'' AND (jsonb_typeof(attrs->''mpn'') IS DISTINCT FROM ''string'' OR length(attrs->>''mpn'') NOT BETWEEN 1 AND 70 OR attrs->>''mpn''<>btrim(attrs->>''mpn'') OR attrs->>''mpn''~''[<>[:cntrl:]]'') THEN issues:=issues||jsonb_build_array(jsonb_build_object(''code'',''manufacturer_mpn_invalid'',''message'',''Üretici parça kodu geçerli değil.''));END IF; gtin:=retail_ids->>''gtin''; attrs:=(attrs-''mpn'')||CASE WHEN attrs->>''identifierExists''=''false'' THEN ''{}''::jsonb ELSE jsonb_strip_nulls(jsonb_build_object(''mpn'',retail_ids->>''mpn'')) END;');
 definition:=replace(definition,'''attributes'',attrs','''attributes'',retail_edit_attrs');
 definition:=replace(definition,'IF (attrs->>''mpn'' IS NOT NULL OR gtin IS NOT NULL) AND brand_name IS NULL THEN','brand_name:=coalesce(brand_name,retail_ids->>''brand''); IF (attrs->>''mpn'' IS NOT NULL OR gtin IS NOT NULL) AND brand_name IS NULL THEN');
 definition:=replace(definition,'IF profile.product_type=''digital'' THEN','IF profile.google_product_category_id=''7565'' THEN issues:=issues||jsonb_build_array(jsonb_build_object(''code'',''unsupported_bullion'',''message'',''Külçe/yatırım altını Google Shopping aktarımında desteklenmiyor.''));END IF; IF profile.product_type=''digital'' THEN');
 EXECUTE definition;
END $projection$;

-- Keep private lease revision in SQL; old workers do not need a new JSON field.
DO $fences$ DECLARE entry record;definition text;guard text;BEGIN
 FOR entry IN SELECT * FROM saas.google_merchant_232_backup WHERE signature NOT LIKE 'saas.google_merchant_command(%' AND signature NOT LIKE 'saas.google_merchant_projection(%' AND signature NOT LIKE 'saas.google_merchant_gtin_valid(%' LOOP
  definition:=entry.definition;
  IF entry.signature LIKE 'saas.google_merchant_claim(%' THEN
   IF position('PERFORM saas.google_merchant_advance_price_boundaries(moment);' IN definition)=0 OR position('lease_id=p_lease,lease_generation=generation' IN definition)=0 THEN RAISE EXCEPTION 'MERCHANT232_CLAIM_DRIFT';END IF;
   definition:=replace(definition,'PERFORM saas.google_merchant_advance_price_boundaries(moment);','PERFORM saas.google_merchant_advance_catalog_batches(moment); PERFORM saas.google_merchant_advance_price_boundaries(moment);');
   definition:=replace(definition,'lease_id=p_lease,lease_generation=generation','lease_catalog_revision=coalesce((SELECT revision FROM saas.google_merchant_catalog_revisions WHERE store_id=candidate.store_id),0),lease_id=p_lease,lease_generation=generation');
  ELSIF entry.signature LIKE 'saas.google_merchant_job_projection(%' THEN
   IF position('projection:=saas.google_merchant_projection(p_store,p_variant,p_now);' IN definition)=0 THEN RAISE EXCEPTION 'MERCHANT232_JOB_DRIFT';END IF;
   definition:=replace(definition,'projection:=saas.google_merchant_projection(p_store,p_variant,p_now);','IF coalesce(q.lease_catalog_revision,0)<>coalesce((SELECT revision FROM saas.google_merchant_catalog_revisions WHERE store_id=p_store),0) THEN RETURN NULL;END IF; projection:=saas.google_merchant_projection(p_store,p_variant,p_now);');
  ELSE
   -- This lock also prevents activation between the finish revision check and fingerprint.
   IF position('SELECT * INTO q FROM saas.google_merchant_outbox WHERE' IN definition)=0 OR position('IF q.generation<>p_generation OR q.connection_version<>p_connection_version' IN definition)=0 THEN RAISE EXCEPTION 'MERCHANT232_FENCE_DRIFT';END IF;
   definition:=replace(definition,'SELECT * INTO q FROM saas.google_merchant_outbox WHERE','PERFORM pg_advisory_xact_lock(hashtextextended(''saas.catalog.store:''||p_store::text,0)); SELECT * INTO q FROM saas.google_merchant_outbox WHERE');
   -- finish locks connection before q; acquire the store lock first to retain activation ordering.
   IF entry.signature LIKE 'saas.google_merchant_finish(%' OR entry.signature LIKE 'saas.google_merchant_defer(%' THEN
    definition:=replace(definition,'SELECT * INTO c FROM saas.google_marketing_connections WHERE','PERFORM pg_advisory_xact_lock(hashtextextended(''saas.catalog.store:''||p_store::text,0)); SELECT * INTO c FROM saas.google_marketing_connections WHERE');
   END IF;
   definition:=replace(definition,'IF q.generation<>p_generation OR q.connection_version<>p_connection_version','IF coalesce(q.lease_catalog_revision,0)<>coalesce((SELECT revision FROM saas.google_merchant_catalog_revisions WHERE store_id=p_store),0) OR q.generation<>p_generation OR q.connection_version<>p_connection_version');
  END IF;
  definition:=replace(definition,'lease_id=NULL,lease_generation=NULL','lease_catalog_revision=NULL,lease_id=NULL,lease_generation=NULL');
  EXECUTE definition;
 END LOOP;
END $fences$;

CREATE FUNCTION saas.google_merchant_public_product_identifiers(p_store uuid,p_product uuid,p_now timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE product jsonb;result jsonb;
BEGIN
 IF p_store IS NULL OR p_product IS NULL OR p_now IS NULL OR NOT isfinite(p_now) OR NOT EXISTS(SELECT 1 FROM saas.stores WHERE id=p_store AND status='active') OR NOT EXISTS(SELECT 1 FROM saas.products WHERE store_id=p_store AND id=p_product AND status='active') THEN RETURN '{}'::jsonb;END IF;
 product:=saas.public_effective_product_projection(p_store,p_product,p_now);
 IF product IS NULL THEN RETURN '{}'::jsonb;END IF;
 SELECT coalesce(jsonb_object_agg(v.id::text,saas.google_merchant_variant_identifiers(p_store,v.id)),'{}') INTO result FROM saas.product_variants v
 WHERE v.store_id=p_store AND v.product_id=p_product AND v.status='active' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(product->'variants','[]')) public_variant WHERE public_variant->>'id'=v.id::text);
 RETURN result;
END $f$;
REVOKE ALL ON FUNCTION saas.google_merchant_identity_profile(uuid),saas.google_merchant_editable_attributes(jsonb),saas.google_merchant_variant_identifiers(uuid,uuid),saas.google_merchant_catalog_changed(),saas.google_merchant_advance_catalog_batches(timestamptz),saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb),saas.google_merchant_public_product_identifiers(uuid,uuid,timestamptz) FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_observability;
GRANT EXECUTE ON FUNCTION saas.google_merchant_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb) TO celebix_saas_app;
GRANT EXECUTE ON FUNCTION saas.google_merchant_public_product_identifiers(uuid,uuid,timestamptz) TO celebix_saas_host_resolver;
COMMIT;
