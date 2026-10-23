-- Product VAT268: additive choices and immutable sales tax evidence. Existing gross prices are untouched.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.product_tax.release268',0));
ALTER TABLE saas.products ADD COLUMN tax_treatment text,ADD COLUMN tax_rate_bps integer,
 ADD CONSTRAINT products_tax_choice CHECK(((tax_treatment IS NULL AND tax_rate_bps IS NULL)OR(tax_treatment='taxable'AND tax_rate_bps BETWEEN 0 AND 10000)OR(tax_treatment='exempt'AND tax_rate_bps IS NULL))IS TRUE);
ALTER TABLE saas.product_variants ADD COLUMN tax_treatment text,ADD COLUMN tax_rate_bps integer,
 ADD CONSTRAINT product_variants_tax_choice CHECK(((tax_treatment IS NULL AND tax_rate_bps IS NULL)OR(tax_treatment='taxable'AND tax_rate_bps BETWEEN 0 AND 10000)OR(tax_treatment='exempt'AND tax_rate_bps IS NULL))IS TRUE);
CREATE TABLE saas.product_tax268_backup(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,owner_id oid NOT NULL,acl aclitem[],config text[],clone_signature text);
CREATE TABLE saas.product_tax_prepared(
 store_id uuid NOT NULL REFERENCES saas.stores(id),source_kind text NOT NULL,source_id uuid NOT NULL,order_id uuid NOT NULL,line_key text NOT NULL,
 product_id uuid,variant_id uuid,quantity integer NOT NULL CHECK(quantity>0),gross_cents bigint NOT NULL CHECK(gross_cents>=0),tax jsonb,tax_source text NOT NULL,
 product_version bigint,variant_version bigint,prepared_at timestamptz NOT NULL,PRIMARY KEY(store_id,source_kind,source_id,line_key)
);
CREATE INDEX product_tax_prepared_order ON saas.product_tax_prepared(store_id,order_id,line_key);
CREATE TABLE saas.product_tax_order_revisions(
 store_id uuid NOT NULL REFERENCES saas.stores(id),order_id uuid NOT NULL,revision_key text NOT NULL,order_version bigint NOT NULL,currency text NOT NULL,
 occurred_at timestamptz NOT NULL,lines jsonb NOT NULL,sale_lines jsonb NOT NULL,return_lines jsonb NOT NULL,total_gross_cents bigint NOT NULL,known_gross_cents bigint NOT NULL,unknown_gross_cents bigint NOT NULL,
 taxable_base_cents bigint NOT NULL,vat_cents bigint NOT NULL,exempt_gross_cents bigint NOT NULL,zero_rate_gross_cents bigint NOT NULL,
 known_line_count integer NOT NULL,unknown_line_count integer NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,order_id,revision_key)
);
CREATE INDEX product_tax_order_revisions_period ON saas.product_tax_order_revisions(store_id,occurred_at,order_id);
CREATE INDEX product_tax_order_revisions_history ON saas.product_tax_order_revisions(store_id,order_id,order_version,created_at);
CREATE TABLE saas.product_tax_recognition(store_id uuid NOT NULL REFERENCES saas.stores(id),order_id uuid NOT NULL,currency text NOT NULL,recognized_at timestamptz NOT NULL,source text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(store_id,order_id,currency));
CREATE INDEX product_tax_recognition_period ON saas.product_tax_recognition(store_id,recognized_at,order_id);
CREATE TABLE saas.product_tax_release(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),installed_at timestamptz NOT NULL);
INSERT INTO saas.product_tax_release VALUES(true,clock_timestamp());
DO $private$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['product_tax268_backup','product_tax_prepared','product_tax_order_revisions','product_tax_release','product_tax_recognition']LOOP
  EXECUTE format('ALTER TABLE saas.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE saas.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY product_tax_owner ON saas.%I TO celebix_saas_owner USING(true)WITH CHECK(true)',t);
  EXECUTE format('REVOKE ALL ON saas.%I FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability',t);
 END LOOP;
END $private$;
CREATE TRIGGER product_tax_recognition_immutable BEFORE UPDATE OR DELETE ON saas.product_tax_recognition FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable();
CREATE TRIGGER product_tax_prepared_immutable BEFORE UPDATE OR DELETE ON saas.product_tax_prepared FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable();
CREATE TRIGGER product_tax_order_revisions_immutable BEFORE UPDATE OR DELETE ON saas.product_tax_order_revisions FOR EACH ROW EXECUTE FUNCTION saas.accounting_immutable();

CREATE FUNCTION saas.product_tax_choice_valid(p jsonb)RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p IS NULL OR p='null'::jsonb THEN true WHEN jsonb_typeof(p)IS DISTINCT FROM 'object'THEN false
 ELSE p?&ARRAY['treatment','rateBps']AND(SELECT count(*)FROM jsonb_object_keys(p))=2 AND
 ((p->>'treatment'='exempt'AND p->'rateBps'='null'::jsonb)OR(p->>'treatment'='taxable'AND jsonb_typeof(p->'rateBps')='number'AND p->>'rateBps'~'^(0|[1-9][0-9]{0,4})$'AND(p->>'rateBps')::numeric BETWEEN 0 AND 10000))END
$f$;
CREATE FUNCTION saas.product_tax_choice(p_treatment text,p_rate integer)RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN p_treatment IS NULL THEN NULL ELSE jsonb_build_object('treatment',p_treatment,'rateBps',p_rate)END
$f$;
CREATE FUNCTION saas.catalog_effective_tax(p_store uuid,p_variant uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT saas.product_tax_choice(coalesce(v.tax_treatment,p.tax_treatment),CASE WHEN v.tax_treatment IS NOT NULL THEN v.tax_rate_bps ELSE p.tax_rate_bps END)
 FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id WHERE v.store_id=p_store AND v.id=p_variant
$f$;
CREATE FUNCTION saas.product_tax_resolution(p_store uuid,p_variant uuid)RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT jsonb_build_object('tax',saas.catalog_effective_tax(p_store,p_variant),'taxSource',CASE WHEN v.tax_treatment IS NOT NULL THEN 'variant'WHEN p.tax_treatment IS NOT NULL THEN 'product'ELSE 'unknown'END,'productVersion',p.version,'variantVersion',v.version)
 FROM saas.product_variants v JOIN saas.products p ON p.store_id=v.store_id AND p.id=v.product_id WHERE v.store_id=p_store AND v.id=p_variant
$f$;
CREATE FUNCTION saas.catalog_tax_read(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_product uuid)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;BEGIN
 err:=saas.merchant_action_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,'catalog','catalog_admin.read');IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.products WHERE store_id=p_store AND id=p_product)THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('productId',p.id,'productVersion',p.version,'tax',saas.product_tax_choice(p.tax_treatment,p.tax_rate_bps),'variants',coalesce((SELECT jsonb_agg(jsonb_build_object('variantId',v.id,'variantVersion',v.version,'tax',saas.product_tax_choice(v.tax_treatment,v.tax_rate_bps),'effectiveTax',saas.catalog_effective_tax(p_store,v.id),'taxSource',CASE WHEN v.tax_treatment IS NOT NULL THEN 'variant'WHEN p.tax_treatment IS NOT NULL THEN 'product'ELSE 'unknown'END)ORDER BY v.created_at,v.id)FROM saas.product_variants v WHERE v.store_id=p_store AND v.product_id=p.id),'[]'))FROM saas.products p WHERE p.store_id=p_store AND p.id=p_product;
END $f$;
CREATE FUNCTION saas.product_tax_apply_product(p_store uuid,p_product uuid,p_tax jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF saas.product_tax_choice_valid(p_tax)IS NOT TRUE THEN RAISE EXCEPTION 'PRODUCT_TAX_INVALID' USING ERRCODE='22023';END IF;
 UPDATE saas.products SET tax_treatment=p_tax->>'treatment',tax_rate_bps=(p_tax->>'rateBps')::integer WHERE store_id=p_store AND id=p_product;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_TAX_SCOPE' USING ERRCODE='22023';END IF;
END $f$;
CREATE FUNCTION saas.product_tax_apply_variant(p_store uuid,p_product uuid,p_variant uuid,p_tax jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF saas.product_tax_choice_valid(p_tax)IS NOT TRUE THEN RAISE EXCEPTION 'PRODUCT_TAX_INVALID' USING ERRCODE='22023';END IF;
 UPDATE saas.product_variants SET tax_treatment=p_tax->>'treatment',tax_rate_bps=(p_tax->>'rateBps')::integer WHERE store_id=p_store AND product_id=p_product AND id=p_variant;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_TAX_SCOPE' USING ERRCODE='22023';END IF;
END $f$;
CREATE FUNCTION saas.product_tax_strip(p jsonb)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE clean jsonb:=p-'tax';k text;x jsonb;children jsonb;BEGIN
 IF p?'tax'AND saas.product_tax_choice_valid(p->'tax')IS NOT TRUE THEN RAISE EXCEPTION 'PRODUCT_TAX_INVALID' USING ERRCODE='22023';END IF;
 IF p?'variant'THEN
  IF p->'variant'?'tax'AND saas.product_tax_choice_valid(p->'variant'->'tax')IS NOT TRUE THEN RAISE EXCEPTION 'PRODUCT_TAX_INVALID' USING ERRCODE='22023';END IF;
  clean:=jsonb_set(clean,'{variant}',(p->'variant')-'tax');
 END IF;
 FOREACH k IN ARRAY ARRAY['variants','additionalVariants']LOOP
  IF p?k AND jsonb_typeof(p->k)='array'THEN
   children:='[]';FOR x IN SELECT value FROM jsonb_array_elements(p->k)LOOP
    IF x?'tax'AND saas.product_tax_choice_valid(x->'tax')IS NOT TRUE THEN RAISE EXCEPTION 'PRODUCT_TAX_INVALID' USING ERRCODE='22023';END IF;children:=children||jsonb_build_array(x-'tax');
   END LOOP;clean:=jsonb_set(clean,ARRAY[k],children);
  END IF;
 END LOOP;RETURN clean;
END $f$;
CREATE FUNCTION saas.product_tax_apply_tree(p_store uuid,p_product uuid,p jsonb,p_variant_ids uuid[] DEFAULT NULL)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE x jsonb;n integer:=0;items jsonb;BEGIN
 IF p?'tax'THEN PERFORM saas.product_tax_apply_product(p_store,p_product,p->'tax');END IF;
 items:=CASE WHEN p?'variant'THEN jsonb_build_array(p->'variant')||coalesce(p->'additionalVariants','[]')ELSE coalesce(p->'variants','[]')END;
 FOR x IN SELECT value FROM jsonb_array_elements(items)LOOP n:=n+1;IF x?'tax'THEN PERFORM saas.product_tax_apply_variant(p_store,p_product,coalesce((x->>'variantId')::uuid,p_variant_ids[n]),x->'tax');END IF;END LOOP;
END $f$;

CREATE FUNCTION saas.catalog_create_product_with_tax(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_products_limit bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_product_id uuid, p_variant_id uuid, p_slug text, p_title text, p_description text, p_status text, p_currency text, p_variant_title text, p_sku text, p_barcode text, p_price_cents bigint, p_compare_at_cents bigint, p_cost_cents bigint, p_stock_tracking boolean, p_stock_quantity bigint, p_attributes jsonb,p_tax jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;k text;BEGIN
 IF jsonb_typeof(p_tax)IS DISTINCT FROM 'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_tax)keys(key) WHERE keys.key<>ALL(ARRAY['productTax','variantTax','measurements']))THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOREACH k IN ARRAY ARRAY['tax','productTax','variantTax']LOOP IF p_tax?k AND saas.product_tax_choice_valid(p_tax->k)IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;END LOOP;
 IF p_tax?'measurements'THEN SELECT * INTO r FROM saas.catalog_create_product_measurements(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_slug,p_title,p_description,p_status,p_currency,p_variant_title,p_sku,p_barcode,p_price_cents,p_compare_at_cents,p_cost_cents,p_stock_tracking,p_stock_quantity,p_attributes,p_tax->'measurements');ELSE SELECT * INTO r FROM saas.catalog_create_product(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_slug,p_title,p_description,p_status,p_currency,p_variant_title,p_sku,p_barcode,p_price_cents,p_compare_at_cents,p_cost_cents,p_stock_tracking,p_stock_quantity,p_attributes);END IF;
 IF r.outcome='created'THEN IF p_tax?'productTax'THEN PERFORM saas.product_tax_apply_product(p_store_id,p_product_id,p_tax->'productTax');END IF;IF p_tax?'variantTax'THEN PERFORM saas.product_tax_apply_variant(p_store_id,p_product_id,p_variant_id,p_tax->'variantTax');END IF;END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
EXCEPTION WHEN SQLSTATE '22023'OR check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;

CREATE FUNCTION saas.catalog_update_product_with_tax(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_products_limit bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_product_id uuid, p_expected_version bigint, p_slug text, p_title text, p_description text, p_status text, p_currency text, p_origins jsonb,p_tax jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;k text;BEGIN
 IF jsonb_typeof(p_tax)IS DISTINCT FROM 'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_tax)keys(key) WHERE keys.key<>ALL(ARRAY['tax']))THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOREACH k IN ARRAY ARRAY['tax','productTax','variantTax']LOOP IF p_tax?k AND saas.product_tax_choice_valid(p_tax->k)IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;END LOOP;
 SELECT * INTO r FROM saas.catalog_update_product_with_origins(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_expected_version,p_slug,p_title,p_description,p_status,p_currency,p_origins);
 IF r.outcome='updated'THEN IF p_tax?'tax'THEN PERFORM saas.product_tax_apply_product(p_store_id,p_product_id,p_tax->'tax');END IF;END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
EXCEPTION WHEN SQLSTATE '22023'OR check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;

CREATE FUNCTION saas.catalog_create_variant_with_tax(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_products_limit bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_product_id uuid, p_variant_id uuid, p_title text, p_sku text, p_barcode text, p_price_cents bigint, p_compare_at_cents bigint, p_cost_cents bigint, p_stock_tracking boolean, p_stock_quantity bigint, p_attributes jsonb,p_tax jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;k text;BEGIN
 IF jsonb_typeof(p_tax)IS DISTINCT FROM 'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_tax)keys(key) WHERE keys.key<>ALL(ARRAY['tax','measurements']))THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOREACH k IN ARRAY ARRAY['tax','productTax','variantTax']LOOP IF p_tax?k AND saas.product_tax_choice_valid(p_tax->k)IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;END LOOP;
 IF p_tax?'measurements'THEN SELECT * INTO r FROM saas.catalog_create_variant_measurements(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_title,p_sku,p_barcode,p_price_cents,p_compare_at_cents,p_cost_cents,p_stock_tracking,p_stock_quantity,p_attributes,p_tax->'measurements');ELSE SELECT * INTO r FROM saas.catalog_create_variant(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_title,p_sku,p_barcode,p_price_cents,p_compare_at_cents,p_cost_cents,p_stock_tracking,p_stock_quantity,p_attributes);END IF;
 IF r.outcome='created'THEN IF p_tax?'tax'THEN PERFORM saas.product_tax_apply_variant(p_store_id,p_product_id,p_variant_id,p_tax->'tax');END IF;END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
EXCEPTION WHEN SQLSTATE '22023'OR check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;

CREATE FUNCTION saas.catalog_update_variant_with_tax(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_products_limit bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_product_id uuid, p_variant_id uuid, p_expected_version bigint, p_title text, p_sku text, p_barcode text, p_price_cents bigint, p_compare_at_cents bigint, p_cost_cents bigint, p_stock_tracking boolean, p_stock_quantity bigint, p_attributes jsonb,p_tax jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;k text;BEGIN
 IF jsonb_typeof(p_tax)IS DISTINCT FROM 'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_tax)keys(key) WHERE keys.key<>ALL(ARRAY['tax','measurements']))THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 FOREACH k IN ARRAY ARRAY['tax','productTax','variantTax']LOOP IF p_tax?k AND saas.product_tax_choice_valid(p_tax->k)IS NOT TRUE THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;END LOOP;
 IF p_tax?'measurements'THEN SELECT * INTO r FROM saas.catalog_update_variant_measurements(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_expected_version,p_title,p_sku,p_barcode,p_price_cents,p_compare_at_cents,p_cost_cents,p_stock_tracking,p_stock_quantity,p_attributes,p_tax->'measurements');ELSE SELECT * INTO r FROM saas.catalog_update_variant(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_id,p_expected_version,p_title,p_sku,p_barcode,p_price_cents,p_compare_at_cents,p_cost_cents,p_stock_tracking,p_stock_quantity,p_attributes);END IF;
 IF r.outcome='updated'THEN IF p_tax?'tax'THEN PERFORM saas.product_tax_apply_variant(p_store_id,p_product_id,p_variant_id,p_tax->'tax');END IF;END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
EXCEPTION WHEN SQLSTATE '22023'OR check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;

DO $backup$DECLARE d text;r record;BEGIN
 SELECT pg_get_functiondef(oid)definition,proowner,proacl,proconfig INTO r FROM pg_proc WHERE oid='saas.catalog_onboard_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)'::regprocedure;
 IF encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM '7c2f68215f2a09030c82b8fc6382c4f5800b7dab4009a2e1ee3279014ceef5be'OR r.proowner<>'celebix_saas_owner'::regrole OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]THEN RAISE EXCEPTION 'PRODUCT_TAX268_PREDECESSOR_DRIFT_catalog_onboard_product_with_origins';END IF;
 d:=replace(r.definition,'FUNCTION saas.catalog_onboard_product_with_origins(','FUNCTION saas.tax268_catalog_onboard_product_with_origins(');IF d=r.definition THEN RAISE EXCEPTION 'PRODUCT_TAX268_CLONE_DRIFT';END IF;EXECUTE d;
 INSERT INTO saas.product_tax268_backup VALUES('saas.catalog_onboard_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)',r.definition,'7c2f68215f2a09030c82b8fc6382c4f5800b7dab4009a2e1ee3279014ceef5be',NULL,r.proowner,r.proacl,r.proconfig,replace('saas.catalog_onboard_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)','.catalog_onboard_product_with_origins(','.tax268_catalog_onboard_product_with_origins('));
END $backup$;
CREATE OR REPLACE FUNCTION saas.catalog_onboard_product_with_origins(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_products_limit bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_product_id uuid, p_variant_ids uuid[], p_intent jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;clean jsonb;x jsonb;n integer;BEGIN
 clean:=saas.product_tax_strip(p_intent);
 SELECT * INTO r FROM saas.tax268_catalog_onboard_product_with_origins(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_ids,clean);
 IF r.outcome='created'THEN PERFORM saas.product_tax_apply_tree(p_store_id,p_product_id,p_intent,p_variant_ids);END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
EXCEPTION WHEN SQLSTATE '22023'OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;
UPDATE saas.product_tax268_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')WHERE signature='saas.catalog_onboard_product_with_origins(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)';

DO $backup$DECLARE d text;r record;BEGIN
 SELECT pg_get_functiondef(oid)definition,proowner,proacl,proconfig INTO r FROM pg_proc WHERE oid='saas.catalog_create_variants_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)'::regprocedure;
 IF encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM '326b9d6fc59c8a52b29582c03debb4a8baad6e7fe2ed672713aac647513d4f58'OR r.proowner<>'celebix_saas_owner'::regrole OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]THEN RAISE EXCEPTION 'PRODUCT_TAX268_PREDECESSOR_DRIFT_catalog_create_variants_batch_v2';END IF;
 d:=replace(r.definition,'FUNCTION saas.catalog_create_variants_batch_v2(','FUNCTION saas.tax268_catalog_create_variants_batch_v2(');IF d=r.definition THEN RAISE EXCEPTION 'PRODUCT_TAX268_CLONE_DRIFT';END IF;EXECUTE d;
 INSERT INTO saas.product_tax268_backup VALUES('saas.catalog_create_variants_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)',r.definition,'326b9d6fc59c8a52b29582c03debb4a8baad6e7fe2ed672713aac647513d4f58',NULL,r.proowner,r.proacl,r.proconfig,replace('saas.catalog_create_variants_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)','.catalog_create_variants_batch_v2(','.tax268_catalog_create_variants_batch_v2('));
END $backup$;
CREATE OR REPLACE FUNCTION saas.catalog_create_variants_batch_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_products_limit bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_product_id uuid, p_variant_ids uuid[], p_variants jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;clean jsonb;x jsonb;n integer;BEGIN
 clean:='[]';FOR x IN SELECT value FROM jsonb_array_elements(p_variants)LOOP clean:=clean||jsonb_build_array(saas.product_tax_strip(x));END LOOP;
 SELECT * INTO r FROM saas.tax268_catalog_create_variants_batch_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_product_id,p_variant_ids,clean);
 IF r.outcome='created'THEN n:=0;FOR x IN SELECT value FROM jsonb_array_elements(p_variants)LOOP n:=n+1;IF x?'tax'THEN PERFORM saas.product_tax_apply_variant(p_store_id,p_product_id,p_variant_ids[n],x->'tax');END IF;END LOOP;END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
EXCEPTION WHEN SQLSTATE '22023'OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;
UPDATE saas.product_tax268_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')WHERE signature='saas.catalog_create_variants_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid[],jsonb)';

DO $backup$DECLARE d text;r record;BEGIN
 SELECT pg_get_functiondef(oid)definition,proowner,proacl,proconfig INTO r FROM pg_proc WHERE oid='saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM 'f5b18c3b270a7a50381dead0c02d9b5fdffe3107898ea746b761a2b3189a8f9b'OR r.proowner<>'celebix_saas_owner'::regrole OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]THEN RAISE EXCEPTION 'PRODUCT_TAX268_PREDECESSOR_DRIFT_catalog_migration_import_batch_v2';END IF;
 d:=replace(r.definition,'FUNCTION saas.catalog_migration_import_batch_v2(','FUNCTION saas.tax268_catalog_migration_import_batch_v2(');IF d=r.definition THEN RAISE EXCEPTION 'PRODUCT_TAX268_CLONE_DRIFT';END IF;EXECUTE d;
 INSERT INTO saas.product_tax268_backup VALUES('saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)',r.definition,'f5b18c3b270a7a50381dead0c02d9b5fdffe3107898ea746b761a2b3189a8f9b',NULL,r.proowner,r.proacl,r.proconfig,replace('saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)','.catalog_migration_import_batch_v2(','.tax268_catalog_migration_import_batch_v2('));
END $backup$;
CREATE OR REPLACE FUNCTION saas.catalog_migration_import_batch_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_products_limit bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_job_id uuid, p_source_digest text, p_products jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;clean jsonb;x jsonb;n integer;BEGIN
 clean:='[]';FOR x IN SELECT value FROM jsonb_array_elements(p_products)LOOP clean:=clean||jsonb_build_array(saas.product_tax_strip(x));END LOOP;
 SELECT * INTO r FROM saas.tax268_catalog_migration_import_batch_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_products_limit,p_now,p_operation_id,p_fingerprint,p_job_id,p_source_digest,clean);
 IF r.outcome='batch_imported'THEN FOR x IN SELECT value FROM jsonb_array_elements(p_products)LOOP PERFORM saas.product_tax_apply_tree(p_store_id,(x->>'productId')::uuid,x);END LOOP;END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
EXCEPTION WHEN SQLSTATE '22023'OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;
UPDATE saas.product_tax268_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')WHERE signature='saas.catalog_migration_import_batch_v2(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,text,jsonb)';

DO $backup$DECLARE d text;r record;BEGIN
 SELECT pg_get_functiondef(oid)definition,proowner,proacl,proconfig INTO r FROM pg_proc WHERE oid='saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(r.definition,'UTF8')),'hex')NOT IN('f24733281472575b9ceaef88e69936596d8c467d03fd9b638f54378e9070cd7e','1bfda76fa438f7ea6dc3b544f3da154961893255995383999e5552034b9d3f6a')OR r.proowner<>'celebix_saas_owner'::regrole OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]THEN RAISE EXCEPTION 'PRODUCT_TAX268_PREDECESSOR_DRIFT_catalog_admin_import_products';END IF;
 d:=replace(r.definition,'FUNCTION saas.catalog_admin_import_products(','FUNCTION saas.tax268_catalog_admin_import_products(');IF d=r.definition THEN RAISE EXCEPTION 'PRODUCT_TAX268_CLONE_DRIFT';END IF;EXECUTE d;
 INSERT INTO saas.product_tax268_backup VALUES('saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)',r.definition,encode(sha256(convert_to(r.definition,'UTF8')),'hex'),NULL,r.proowner,r.proacl,r.proconfig,replace('saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)','.catalog_admin_import_products(','.tax268_catalog_admin_import_products('));
END $backup$;
CREATE OR REPLACE FUNCTION saas.catalog_admin_import_products(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_products_limit bigint, p_operation_id uuid, p_fingerprint text, p_job_id uuid, p_file_name text, p_rows jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;clean jsonb;x jsonb;n integer;old_marker text:=current_setting('saas.inventory.source_marker',true);old_id text:=current_setting('saas.inventory.source_id',true);old_time text:=current_setting('saas.inventory.source_time',true);BEGIN
 clean:='[]';FOR x IN SELECT value FROM jsonb_array_elements(p_rows)LOOP clean:=clean||jsonb_build_array(saas.product_tax_strip(x));END LOOP;
 -- The reviewed deployed predecessor relies on caller inventory context; retain its stricter validation unchanged.
 PERFORM set_config('saas.inventory.source_marker','catalog_adjustment',true);PERFORM set_config('saas.inventory.source_id',p_operation_id::text,true);PERFORM set_config('saas.inventory.source_time',p_now::text,true);
 SELECT * INTO r FROM saas.tax268_catalog_admin_import_products(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_products_limit,p_operation_id,p_fingerprint,p_job_id,p_file_name,clean);
 PERFORM set_config('saas.inventory.source_marker',coalesce(old_marker,''),true);PERFORM set_config('saas.inventory.source_id',coalesce(old_id,''),true);PERFORM set_config('saas.inventory.source_time',coalesce(old_time,''),true);
 IF r.outcome='imported'THEN FOR x IN SELECT value FROM jsonb_array_elements(p_rows)LOOP PERFORM saas.product_tax_apply_tree(p_store_id,(x->>'productId')::uuid,x);END LOOP;END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
EXCEPTION WHEN SQLSTATE '22023'OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;
UPDATE saas.product_tax268_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')WHERE signature='saas.catalog_admin_import_products(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)';

DO $backup$DECLARE d text;r record;BEGIN
 SELECT pg_get_functiondef(oid)definition,proowner,proacl,proconfig INTO r FROM pg_proc WHERE oid='saas.catalog_admin_import_products_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)'::regprocedure;
 IF encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM '8ae0557663eb0ad8ca8c66ec87304b4aaa2c035d9436ecff5bbd610f5d037a9f'OR r.proowner<>'celebix_saas_owner'::regrole OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]THEN RAISE EXCEPTION 'PRODUCT_TAX268_PREDECESSOR_DRIFT_catalog_admin_import_products_v2';END IF;
 d:=replace(r.definition,'FUNCTION saas.catalog_admin_import_products_v2(','FUNCTION saas.tax268_catalog_admin_import_products_v2(');IF d=r.definition THEN RAISE EXCEPTION 'PRODUCT_TAX268_CLONE_DRIFT';END IF;EXECUTE d;
 INSERT INTO saas.product_tax268_backup VALUES('saas.catalog_admin_import_products_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)',r.definition,'8ae0557663eb0ad8ca8c66ec87304b4aaa2c035d9436ecff5bbd610f5d037a9f',NULL,r.proowner,r.proacl,r.proconfig,replace('saas.catalog_admin_import_products_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)','.catalog_admin_import_products_v2(','.tax268_catalog_admin_import_products_v2('));
END $backup$;
CREATE OR REPLACE FUNCTION saas.catalog_admin_import_products_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_products_limit bigint, p_operation_id uuid, p_fingerprint text, p_job_id uuid, p_file_name text, p_products jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE r record;clean jsonb;x jsonb;n integer;BEGIN
 clean:='[]';FOR x IN SELECT value FROM jsonb_array_elements(p_products)LOOP clean:=clean||jsonb_build_array(saas.product_tax_strip(x));END LOOP;
 SELECT * INTO r FROM saas.tax268_catalog_admin_import_products_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_products_limit,p_operation_id,p_fingerprint,p_job_id,p_file_name,clean);
 IF r.outcome='imported'THEN FOR x IN SELECT value FROM jsonb_array_elements(p_products)LOOP PERFORM saas.product_tax_apply_tree(p_store_id,(x->>'productId')::uuid,x);END LOOP;END IF;
 RETURN QUERY SELECT r.outcome,r.result_payload;
EXCEPTION WHEN SQLSTATE '22023'OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;
UPDATE saas.product_tax268_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')WHERE signature='saas.catalog_admin_import_products_v2(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,bigint,uuid,text,uuid,text,jsonb)';

CREATE FUNCTION saas.product_tax_prepare(p_store uuid,p_source text,p_source_id uuid,p_order uuid,p_lines jsonb,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE x jsonb;r jsonb;BEGIN
 IF jsonb_typeof(p_lines)IS DISTINCT FROM 'array'OR jsonb_array_length(p_lines)>1000 OR p_now IS NULL THEN RAISE EXCEPTION 'PRODUCT_TAX_PREPARE_INVALID' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_lines)LOOP
  r:=saas.product_tax_resolution(p_store,(x->>'variantId')::uuid);
  INSERT INTO saas.product_tax_prepared(store_id,source_kind,source_id,order_id,line_key,product_id,variant_id,quantity,gross_cents,tax,tax_source,product_version,variant_version,prepared_at)
  VALUES(p_store,p_source,p_source_id,p_order,x->>'lineKey',(x->>'productId')::uuid,(x->>'variantId')::uuid,(x->>'quantity')::integer,(x->>'grossCents')::bigint,nullif(r->'tax','null'),coalesce(r->>'taxSource','unknown'),(r->>'productVersion')::bigint,(r->>'variantVersion')::bigint,p_now)
  ON CONFLICT(store_id,source_kind,source_id,line_key)DO NOTHING;
 END LOOP;
END $f$;
CREATE FUNCTION saas.product_tax_external_prepare(p_store uuid,p_order uuid,p_lines jsonb,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE x jsonb;BEGIN
 IF jsonb_typeof(p_lines)IS DISTINCT FROM 'array'OR jsonb_array_length(p_lines)>1000 THEN RAISE EXCEPTION 'PRODUCT_TAX_EXTERNAL_INVALID' USING ERRCODE='22023';END IF;
 FOR x IN SELECT value FROM jsonb_array_elements(p_lines)LOOP
  IF saas.product_tax_choice_valid(x->'tax')IS NOT TRUE THEN RAISE EXCEPTION 'PRODUCT_TAX_EXTERNAL_INVALID' USING ERRCODE='22023';END IF;
  INSERT INTO saas.product_tax_prepared(store_id,source_kind,source_id,order_id,line_key,product_id,variant_id,quantity,gross_cents,tax,tax_source,prepared_at)
  VALUES(p_store,'provider',p_order,p_order,x->>'lineId',(x->>'productId')::uuid,(x->>'variantId')::uuid,coalesce((x->>'quantity')::integer,1),coalesce((x->>'grossCents')::bigint,0),nullif(x->'tax','null'),'provider',p_now)ON CONFLICT DO NOTHING;
 END LOOP;
END $f$;
CREATE FUNCTION saas.product_tax_prepare_trigger()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE items jsonb:='[]';x jsonb;line_no integer:=0;target uuid;BEGIN
 IF(CASE WHEN TG_TABLE_NAME='in_store_price_snapshots'THEN(to_jsonb(NEW)->>'prepared_at')::timestamptz ELSE(to_jsonb(NEW)->>'created_at')::timestamptz END)<(SELECT installed_at FROM saas.product_tax_release)THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='storefront_hosted_checkout_sessions'THEN
  FOR x IN SELECT value FROM jsonb_array_elements(NEW.item_snapshot)LOOP
   items:=items||jsonb_build_array(jsonb_build_object('lineKey',line_no::text,'productId',x->'productId','variantId',x->'variantId','quantity',x->'quantity','grossCents',greatest(coalesce((x->>'payableCents')::bigint,(x->>'lineNetCents')::bigint,coalesce((x->>'lineTotalCents')::bigint,(x->>'unitPriceCents')::bigint*(x->>'quantity')::integer)-coalesce((x->>'discountCents')::bigint,(x->>'allocatedDiscountCents')::bigint,0)),0)));line_no:=line_no+1;
  END LOOP;PERFORM saas.product_tax_prepare(NEW.store_id,'storefront',NEW.id,NEW.order_id,items,NEW.created_at);
 ELSIF TG_TABLE_NAME='in_store_price_snapshots'THEN
  SELECT * INTO x FROM(SELECT i FROM saas.in_store_sales s CROSS JOIN LATERAL jsonb_array_elements(s.items)i WHERE s.store_id=NEW.store_id AND s.id=NEW.sale_id AND i->>'variantId'=NEW.variant_id::text LIMIT 1)q;
  IF x IS NOT NULL THEN
   target:=saas.inventory_deterministic_uuid('in-store-order',NEW.store_id::text||':'||NEW.sale_id::text);
   PERFORM saas.product_tax_prepare(NEW.store_id,'pos',NEW.prepare_operation_id,target,jsonb_build_array(jsonb_build_object('lineKey',NEW.variant_id::text,'productId',x->'productId','variantId',NEW.variant_id,'quantity',x->'quantity','grossCents',coalesce((x->>'lineNetCents')::bigint,(x->>'lineSubtotalCents')::bigint))),NEW.prepared_at);
  END IF;
 ELSIF TG_TABLE_NAME='quick_order_hosted_payment_bridges'THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('lineKey',i.position::text,'productId',i.product_id,'variantId',i.variant_id,'quantity',i.quantity,'grossCents',i.unit_price_cents*i.quantity)ORDER BY i.position),'[]')INTO items FROM saas.quick_order_link_items i WHERE i.store_id=NEW.store_id AND i.quick_order_link_id=NEW.quick_order_link_id;
  PERFORM saas.product_tax_prepare(NEW.store_id,'quick_link',NEW.attempt_id,NEW.order_id,items,NEW.created_at);
 END IF;RETURN NEW;
END $f$;
CREATE TRIGGER product_tax_prepare AFTER INSERT ON saas.storefront_hosted_checkout_sessions FOR EACH ROW EXECUTE FUNCTION saas.product_tax_prepare_trigger();
CREATE TRIGGER product_tax_prepare AFTER INSERT ON saas.in_store_price_snapshots FOR EACH ROW EXECUTE FUNCTION saas.product_tax_prepare_trigger();
CREATE TRIGGER product_tax_prepare AFTER INSERT ON saas.quick_order_hosted_payment_bridges FOR EACH ROW EXECUTE FUNCTION saas.product_tax_prepare_trigger();

CREATE FUNCTION saas.product_tax_line(p_id text,p_product uuid,p_variant uuid,p_quantity integer,p_gross bigint,p_tax jsonb,p_source text)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,saas AS $f$
DECLARE base bigint;vat bigint;BEGIN
 IF p_gross<0 OR p_gross>9007199254740991 OR saas.product_tax_choice_valid(p_tax)IS NOT TRUE THEN RAISE EXCEPTION 'PRODUCT_TAX_AMOUNT_INVALID' USING ERRCODE='22023';END IF;
 IF p_tax IS NOT NULL AND p_tax<>'null'::jsonb THEN
  vat:=CASE WHEN p_tax->>'treatment'='exempt'THEN 0 ELSE round(p_gross::numeric*(p_tax->>'rateBps')::integer/(10000+(p_tax->>'rateBps')::integer))::bigint END;base:=p_gross-vat;
 END IF;
 RETURN jsonb_build_object('itemId',p_id,'productId',p_product,'variantId',p_variant,'quantity',p_quantity,'grossCents',p_gross,'tax',p_tax,'taxSource',p_source,'baseCents',base,'taxCents',vat);
END $f$;
CREATE FUNCTION saas.product_tax_snapshot(p_store uuid,p_order uuid,p_key text,p_version bigint,p_currency text,p_at timestamptz,p_total bigint,p_lines jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE prev saas.product_tax_order_revisions;current_line jsonb;old_line jsonb;sales jsonb:='[]';returns jsonb:='[]';delta bigint;known bigint:=0;unknown bigint:=0;base bigint:=0;vat bigint:=0;exempt bigint:=0;zero bigint:=0;known_count integer:=0;unknown_count integer:=0;line_sum bigint;BEGIN
 IF EXISTS(SELECT 1 FROM saas.product_tax_order_revisions WHERE store_id=p_store AND order_id=p_order AND revision_key=p_key)THEN RETURN;END IF;
 SELECT * INTO prev FROM saas.product_tax_order_revisions WHERE store_id=p_store AND order_id=p_order ORDER BY order_version DESC,created_at DESC LIMIT 1;
 SELECT coalesce(sum((x->>'grossCents')::bigint),0)INTO line_sum FROM jsonb_array_elements(p_lines)x;
 -- Unallocated order-level discounts cannot be assigned across mixed tax rates.
 IF line_sum>p_total THEN p_lines:=jsonb_build_array(saas.product_tax_line('__unallocated__',NULL,NULL,1,p_total,NULL,'unallocated_discount'));
 ELSIF line_sum<p_total THEN p_lines:=p_lines||jsonb_build_array(saas.product_tax_line('__shipping__',NULL,NULL,1,p_total-line_sum,NULL,'shipping_unknown'));END IF;
 IF prev.order_id IS NOT NULL AND prev.lines=p_lines THEN RETURN;END IF;
 FOR current_line IN SELECT value FROM jsonb_array_elements(p_lines)LOOP
  old_line:=NULL;SELECT x INTO old_line FROM jsonb_array_elements(coalesce(prev.lines,'[]'))x WHERE x->>'itemId'=current_line->>'itemId';
  IF old_line IS NOT NULL AND old_line->'tax'IS NOT DISTINCT FROM current_line->'tax'AND old_line->'variantId'IS NOT DISTINCT FROM current_line->'variantId'THEN
   delta:=(current_line->>'grossCents')::bigint-(old_line->>'grossCents')::bigint;
   IF delta>0 THEN sales:=sales||jsonb_build_array(current_line||jsonb_build_object('grossCents',delta,'baseCents',(current_line->>'baseCents')::bigint-(old_line->>'baseCents')::bigint,'taxCents',(current_line->>'taxCents')::bigint-(old_line->>'taxCents')::bigint));
   ELSIF delta<0 THEN returns:=returns||jsonb_build_array(old_line||jsonb_build_object('grossCents',-delta,'baseCents',(old_line->>'baseCents')::bigint-(current_line->>'baseCents')::bigint,'taxCents',(old_line->>'taxCents')::bigint-(current_line->>'taxCents')::bigint));END IF;
  ELSE
   sales:=sales||jsonb_build_array(current_line);IF old_line IS NOT NULL THEN returns:=returns||jsonb_build_array(old_line);END IF;
  END IF;
  IF current_line->'tax'IS NULL OR current_line->'tax'='null'::jsonb THEN unknown:=unknown+(current_line->>'grossCents')::bigint;unknown_count:=unknown_count+1;
  ELSE known:=known+(current_line->>'grossCents')::bigint;known_count:=known_count+1;
   IF current_line->'tax'->>'treatment'='exempt'THEN exempt:=exempt+(current_line->>'grossCents')::bigint;
   ELSE base:=base+(current_line->>'baseCents')::bigint;vat:=vat+(current_line->>'taxCents')::bigint;IF current_line->'tax'->>'rateBps'='0'THEN zero:=zero+(current_line->>'grossCents')::bigint;END IF;END IF;
  END IF;
 END LOOP;
 FOR old_line IN SELECT value FROM jsonb_array_elements(coalesce(prev.lines,'[]'))LOOP IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_lines)x WHERE x->>'itemId'=old_line->>'itemId')THEN returns:=returns||jsonb_build_array(old_line);END IF;END LOOP;
 INSERT INTO saas.product_tax_order_revisions(store_id,order_id,revision_key,order_version,currency,occurred_at,lines,sale_lines,return_lines,total_gross_cents,known_gross_cents,unknown_gross_cents,taxable_base_cents,vat_cents,exempt_gross_cents,zero_rate_gross_cents,known_line_count,unknown_line_count)
 VALUES(p_store,p_order,p_key,p_version,p_currency,p_at,p_lines,sales,returns,p_total,known,unknown,base,vat,exempt,zero,known_count,unknown_count);
END $f$;
CREATE FUNCTION saas.product_tax_capture_order(p_store uuid,p_order uuid,p_key text,p_now timestamptz)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE o saas.orders;i saas.order_items;prepared saas.product_tax_prepared;lines jsonb:='[]';tax jsonb;source text;gross bigint;BEGIN
 SELECT * INTO STRICT o FROM saas.orders WHERE store_id=p_store AND id=p_order;
 FOR i IN SELECT * FROM saas.order_items WHERE store_id=p_store AND order_id=p_order ORDER BY position LOOP
  prepared:=NULL;SELECT * INTO prepared FROM saas.product_tax_prepared WHERE store_id=p_store AND order_id=p_order AND(line_key=i.id::text OR variant_id=i.variant_id)ORDER BY(line_key=i.id::text)DESC,prepared_at DESC LIMIT 1;
  tax:=prepared.tax;source:=coalesce(prepared.tax_source,'unknown_preparation');gross:=i.line_total_cents;
  IF o.source='in_store'THEN SELECT coalesce((SELECT net_cents FROM saas.in_store_discount_allocations WHERE store_id=p_store AND order_item_id=i.id),gross)INTO gross;END IF;
  IF prepared.order_id IS NULL AND o.source='manual'AND o.created_at>=(SELECT installed_at FROM saas.product_tax_release)THEN tax:=saas.catalog_effective_tax(p_store,i.variant_id);source:='instant_sale';END IF;
  lines:=lines||jsonb_build_array(saas.product_tax_line(i.id::text,i.product_id,i.variant_id,i.quantity,gross,tax,source));
 END LOOP;
 PERFORM saas.product_tax_snapshot(p_store,p_order,p_key,o.version,o.currency,p_now,greatest(o.total_cents-o.shipping_cents,0),lines);
END $f$;
CREATE FUNCTION saas.product_tax_legacy_quick()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE items jsonb;BEGIN
 IF TG_OP='INSERT'AND NEW.created_at>=(SELECT installed_at FROM saas.product_tax_release)THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('lineKey',i.position::text,'productId',i.product_id,'variantId',i.variant_id,'quantity',i.quantity,'grossCents',i.line_total_cents)ORDER BY i.position),'[]')INTO items FROM saas.quick_order_link_items i WHERE i.store_id=NEW.store_id AND i.quick_order_link_id=NEW.quick_order_link_id;
  PERFORM saas.product_tax_prepare(NEW.store_id,'quick_legacy',NEW.id,NEW.quick_order_link_id,items,NEW.created_at);
 ELSIF TG_OP='UPDATE'AND NEW.status='succeeded'AND OLD.status IS DISTINCT FROM 'succeeded'AND EXISTS(SELECT 1 FROM saas.product_tax_prepared WHERE store_id=NEW.store_id AND source_kind='quick_legacy'AND source_id=NEW.id)THEN
  INSERT INTO saas.product_tax_prepared(store_id,source_kind,source_id,order_id,line_key,product_id,variant_id,quantity,gross_cents,tax,tax_source,product_version,variant_version,prepared_at)
  SELECT store_id,'quick_bound',source_id,NEW.settled_order_id,line_key,product_id,variant_id,quantity,gross_cents,tax,tax_source,product_version,variant_version,prepared_at FROM saas.product_tax_prepared WHERE store_id=NEW.store_id AND source_kind='quick_legacy'AND source_id=NEW.id ON CONFLICT DO NOTHING;
  PERFORM saas.product_tax_capture_order(NEW.store_id,NEW.settled_order_id,'created',NEW.succeeded_at);
 END IF;RETURN NEW;
END $f$;
CREATE TRIGGER product_tax_prepare AFTER INSERT OR UPDATE OF status ON saas.checkout_payment_attempts FOR EACH ROW EXECUTE FUNCTION saas.product_tax_legacy_quick();
CREATE FUNCTION saas.product_tax_order_event()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE o saas.orders;items jsonb;BEGIN
 IF NEW.event_type='order_created'THEN
  SELECT * INTO STRICT o FROM saas.orders WHERE store_id=NEW.store_id AND id=NEW.order_id;
  -- Legacy quick checkout learns its native order ID only after the immutable preparation has settled.
  IF o.source='quick_link'AND EXISTS(SELECT 1 FROM saas.checkout_payment_attempts a JOIN saas.product_tax_prepared p ON p.store_id=a.store_id AND p.source_kind='quick_legacy'AND p.source_id=a.id WHERE a.store_id=o.store_id AND a.quick_order_link_id=o.quick_order_link_id AND a.status IN('reserved','provider_ready','initiation_unknown'))THEN RETURN NEW;END IF;
  -- Builtin checkout validates and charges the current catalog atomically at order creation.
  IF o.source='storefront'AND NEW.payload->>'paymentKind'IN('bank_transfer','cash_on_delivery')AND o.created_at>=(SELECT installed_at FROM saas.product_tax_release)AND NOT EXISTS(SELECT 1 FROM saas.storefront_hosted_checkout_sessions WHERE store_id=o.store_id AND order_id=o.id)THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('lineKey',i.id::text,'productId',i.product_id,'variantId',i.variant_id,'quantity',i.quantity,'grossCents',i.line_total_cents)ORDER BY i.position),'[]')INTO items FROM saas.order_items i WHERE i.store_id=o.store_id AND i.order_id=o.id;
   PERFORM saas.product_tax_prepare(o.store_id,'storefront_direct',NEW.id,o.id,items,NEW.created_at);
  END IF;
  PERFORM saas.product_tax_capture_order(NEW.store_id,NEW.order_id,'created',NEW.created_at);
 END IF;RETURN NEW;
END $f$;
CREATE TRIGGER product_tax_order_created AFTER INSERT ON saas.order_events FOR EACH ROW EXECUTE FUNCTION saas.product_tax_order_event();

CREATE FUNCTION saas.product_tax_edit_revision()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE prev saas.product_tax_order_revisions;x jsonb;old_line jsonb;lines jsonb:='[]';tax jsonb;source text;before_total bigint;BEGIN
 SELECT * INTO prev FROM saas.product_tax_order_revisions WHERE store_id=NEW.store_id AND order_id=NEW.order_id ORDER BY order_version DESC,created_at DESC LIMIT 1;
 IF prev.order_id IS NULL THEN
  before_total:=greatest((NEW.before_payload->>'total_cents')::bigint-coalesce((NEW.before_payload->>'shipping_cents')::bigint,0),0);
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(NEW.before_payload->'lines','[]'))LOOP lines:=lines||jsonb_build_array(saas.product_tax_line(x->>'lineId',(x->>'productId')::uuid,(x->>'variantId')::uuid,(x->>'quantity')::integer,(x->>'lineTotalCents')::bigint,NULL,'historical_unknown'));END LOOP;
  PERFORM saas.product_tax_snapshot(NEW.store_id,NEW.order_id,'historical_baseline',0,NEW.before_payload->>'currency',(NEW.before_payload->>'created_at')::timestamptz,before_total,lines);
  SELECT * INTO prev FROM saas.product_tax_order_revisions WHERE store_id=NEW.store_id AND order_id=NEW.order_id ORDER BY order_version DESC,created_at DESC LIMIT 1;
 END IF;
 lines:='[]';FOR x IN SELECT value FROM jsonb_array_elements(coalesce(NEW.after_payload->'lines','[]'))LOOP
  old_line:=NULL;SELECT i INTO old_line FROM jsonb_array_elements(prev.lines)i WHERE i->>'itemId'=x->>'lineId'AND i->'variantId'IS NOT DISTINCT FROM x->'variantId';
  IF old_line IS NOT NULL THEN tax:=old_line->'tax';source:=old_line->>'taxSource';
  ELSIF EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(NEW.before_payload->'lines','[]'))i WHERE i->>'lineId'=x->>'lineId'AND i->'variantId'IS NOT DISTINCT FROM x->'variantId')THEN tax:=NULL;source:='historical_unknown';
  ELSE tax:=saas.catalog_effective_tax(NEW.store_id,(x->>'variantId')::uuid);source:='new_edit_line';END IF;
  lines:=lines||jsonb_build_array(saas.product_tax_line(x->>'lineId',(x->>'productId')::uuid,(x->>'variantId')::uuid,(x->>'quantity')::integer,(x->>'lineTotalCents')::bigint,tax,source));
 END LOOP;
 PERFORM saas.product_tax_snapshot(NEW.store_id,NEW.order_id,'edit:'||NEW.operation_id,(NEW.after_payload->>'version')::bigint,NEW.after_payload->>'currency',NEW.created_at,greatest((NEW.after_payload->>'total_cents')::bigint-coalesce((NEW.after_payload->>'shipping_cents')::bigint,0),0),lines);RETURN NEW;
END $f$;
CREATE TRIGGER product_tax_edit_revision AFTER INSERT ON saas.order_edit_revisions FOR EACH ROW EXECUTE FUNCTION saas.product_tax_edit_revision();

CREATE FUNCTION saas.product_tax_recognize_order(p_store uuid,p_order uuid)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE evidence record;BEGIN
 IF NOT EXISTS(SELECT 1 FROM saas.product_tax_order_revisions WHERE store_id=p_store AND order_id=p_order AND revision_key='created')THEN RETURN;END IF;
 SELECT * INTO evidence FROM(
  SELECT e.currency,e.occurred_at at,'ledger'::text source FROM saas.accounting_events e WHERE e.store_id=p_store AND coalesce(e.order_id,e.deleted_order_id)=p_order AND e.kind='sale'AND e.metadata->>'orderEditRevision'IS DISTINCT FROM 'true'
  UNION ALL SELECT w.currency,w.received_at,'web_payment'FROM saas.accounting_web_payment_evidence(p_store)w WHERE w.order_id=p_order
  UNION ALL SELECT o.currency,s.completed_at,'pos_complete'FROM saas.in_store_sales s JOIN saas.orders o ON o.store_id=s.store_id AND o.id=s.order_id WHERE s.store_id=p_store AND s.order_id=p_order AND s.status='completed'
  UNION ALL SELECT o.currency,o.created_at,'trendyol_import'FROM saas.trendyol_orders t JOIN saas.orders o ON o.store_id=t.store_id AND o.id=t.order_id AND o.source='marketplace'WHERE t.store_id=p_store AND t.order_id=p_order AND EXISTS(SELECT 1 FROM saas.order_events e WHERE e.store_id=t.store_id AND e.order_id=t.order_id AND e.event_type='order_created'AND e.payload->>'provider'='trendyol'AND e.payload->>'externalOrderNumber'=t.order_number)AND EXISTS(SELECT 1 FROM saas.trendyol_import_receipts receipt WHERE receipt.store_id=t.store_id AND receipt.seller_id=t.seller_id AND receipt.external_order_id=t.external_order_id AND receipt.result_payload->>'orderId'=t.order_id::text AND receipt.result_payload->>'state'IN('imported','updated'))
 )facts WHERE at IS NOT NULL ORDER BY at LIMIT 1;
 IF evidence.at IS NOT NULL THEN INSERT INTO saas.product_tax_recognition(store_id,order_id,currency,recognized_at,source)VALUES(p_store,p_order,evidence.currency,evidence.at,evidence.source)ON CONFLICT DO NOTHING;END IF;
END $f$;
CREATE FUNCTION saas.product_tax_recognition_trigger()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
BEGIN
 IF TG_TABLE_NAME='accounting_events'THEN
  IF NEW.kind='sale'THEN PERFORM saas.product_tax_recognize_order(NEW.store_id,coalesce(NEW.order_id,NEW.deleted_order_id));END IF;
 ELSIF TG_TABLE_NAME='order_events'THEN
  IF NEW.event_type='payment_transition'AND NEW.to_value='completed'THEN PERFORM saas.product_tax_recognize_order(NEW.store_id,NEW.order_id);END IF;
 ELSIF TG_TABLE_NAME='trendyol_import_receipts'THEN
  IF NEW.result_payload->>'state'IN('imported','updated')THEN PERFORM saas.product_tax_recognize_order(NEW.store_id,(NEW.result_payload->>'orderId')::uuid);END IF;
 ELSIF TG_TABLE_NAME='checkout_payment_attempts'THEN
  IF NEW.status='succeeded'THEN PERFORM saas.product_tax_recognize_order(NEW.store_id,NEW.settled_order_id);END IF;
 ELSE
  IF NEW.status IN('captured','completed')THEN PERFORM saas.product_tax_recognize_order(NEW.store_id,NEW.order_id);END IF;
 END IF;RETURN NEW;
END $f$;
CREATE TRIGGER product_tax_recognition AFTER INSERT ON saas.accounting_events FOR EACH ROW EXECUTE FUNCTION saas.product_tax_recognition_trigger();
CREATE TRIGGER product_tax_recognition AFTER INSERT ON saas.order_events FOR EACH ROW EXECUTE FUNCTION saas.product_tax_recognition_trigger();
CREATE TRIGGER product_tax_recognition AFTER INSERT ON saas.trendyol_import_receipts FOR EACH ROW EXECUTE FUNCTION saas.product_tax_recognition_trigger();
CREATE TRIGGER product_tax_recognition AFTER UPDATE OF status ON saas.storefront_hosted_checkout_sessions FOR EACH ROW EXECUTE FUNCTION saas.product_tax_recognition_trigger();
CREATE TRIGGER product_tax_recognition AFTER UPDATE OF status ON saas.quick_order_hosted_payment_bridges FOR EACH ROW EXECUTE FUNCTION saas.product_tax_recognition_trigger();
CREATE TRIGGER product_tax_recognition AFTER UPDATE OF status ON saas.checkout_payment_attempts FOR EACH ROW EXECUTE FUNCTION saas.product_tax_recognition_trigger();
CREATE TRIGGER product_tax_recognition AFTER UPDATE OF status ON saas.in_store_sales FOR EACH ROW EXECUTE FUNCTION saas.product_tax_recognition_trigger();

CREATE FUNCTION saas.accounting_tax_report(p_store uuid,p_principal uuid,p_member uuid,p_plan uuid,p_code text,p_version bigint,p_now timestamptz,p_filters jsonb)RETURNS TABLE(outcome text,result_payload jsonb)LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE err text;start_at timestamptz;end_at timestamptz;from_date date;to_date date;zone_name text;result jsonb;BEGIN
 err:=saas.accounting_authority_error(p_store,p_principal,p_member,p_plan,p_code,p_version,p_now,false);IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF jsonb_typeof(p_filters)IS DISTINCT FROM 'object'OR NOT(p_filters?&ARRAY['dateFrom','dateTo'])OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters)k WHERE k NOT IN('dateFrom','dateTo','currency'))OR coalesce(p_filters->>'dateFrom','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'OR coalesce(p_filters->>'dateTo','')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 from_date:=(p_filters->>'dateFrom')::date;to_date:=(p_filters->>'dateTo')::date;zone_name:=saas.accounting_timezone(p_store);
 IF from_date>to_date OR to_date-from_date>365 OR(p_filters?'currency'AND coalesce(p_filters->>'currency','')!~'^[A-Z]{3}$')THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 start_at:=from_date::timestamp AT TIME ZONE zone_name;end_at:=(to_date+1)::timestamp AT TIME ZONE zone_name;
 WITH recognized AS MATERIALIZED(
  SELECT order_id,currency,min(at)at FROM(
   SELECT order_id,currency,recognized_at at FROM saas.product_tax_recognition WHERE store_id=p_store
   UNION ALL SELECT coalesce(e.order_id,e.deleted_order_id)order_id,e.currency,e.occurred_at at FROM saas.accounting_events e WHERE e.store_id=p_store AND e.kind='sale'AND e.metadata->>'orderEditRevision'IS DISTINCT FROM 'true'AND coalesce(e.order_id,e.deleted_order_id)IS NOT NULL
   UNION ALL SELECT w.order_id,w.currency,w.received_at FROM saas.accounting_web_payment_evidence(p_store)w WHERE NOT EXISTS(SELECT 1 FROM saas.accounting_events e WHERE e.store_id=p_store AND e.kind='sale'AND coalesce(e.order_id,e.deleted_order_id)=w.order_id)
   UNION ALL SELECT s.order_id,o.currency,s.completed_at FROM saas.in_store_sales s JOIN saas.orders o ON o.store_id=s.store_id AND o.id=s.order_id WHERE s.store_id=p_store AND s.status='completed'AND NOT EXISTS(SELECT 1 FROM saas.accounting_events e WHERE e.store_id=p_store AND e.kind='sale'AND coalesce(e.order_id,e.deleted_order_id)=s.order_id)
   UNION ALL SELECT t.order_id,o.currency,o.created_at FROM saas.trendyol_orders t JOIN saas.orders o ON o.store_id=t.store_id AND o.id=t.order_id AND o.source='marketplace'WHERE t.store_id=p_store AND EXISTS(SELECT 1 FROM saas.order_events e WHERE e.store_id=t.store_id AND e.order_id=t.order_id AND e.event_type='order_created'AND e.payload->>'provider'='trendyol'AND e.payload->>'externalOrderNumber'=t.order_number)AND EXISTS(SELECT 1 FROM saas.trendyol_import_receipts receipt WHERE receipt.store_id=t.store_id AND receipt.seller_id=t.seller_id AND receipt.external_order_id=t.external_order_id AND receipt.result_payload->>'orderId'=t.order_id::text AND receipt.result_payload->>'state'IN('imported','updated'))
  )e GROUP BY order_id,currency
 ),sales AS MATERIALIZED(
  SELECT r.currency,x AS line FROM saas.product_tax_order_revisions r JOIN recognized proof ON proof.order_id=r.order_id AND proof.currency=r.currency CROSS JOIN LATERAL jsonb_array_elements(r.sale_lines)x
  WHERE r.store_id=p_store AND(CASE WHEN r.revision_key IN('created','historical_baseline')THEN proof.at ELSE r.occurred_at END)>=start_at AND(CASE WHEN r.revision_key IN('created','historical_baseline')THEN proof.at ELSE r.occurred_at END)<end_at
  UNION ALL SELECT o.currency,jsonb_build_object('grossCents',least(greatest(o.total_cents-o.shipping_cents,0),coalesce((SELECT sum(saas.in_store_order_item_net(i.id,i.line_total_cents))FROM saas.order_items i WHERE i.store_id=o.store_id AND i.order_id=o.id),0)),'tax',NULL,'baseCents',NULL,'taxCents',NULL)
  FROM saas.orders o JOIN recognized proof ON proof.order_id=o.id AND proof.currency=o.currency WHERE o.store_id=p_store AND proof.at>=start_at AND proof.at<end_at AND NOT EXISTS(SELECT 1 FROM saas.product_tax_order_revisions r WHERE r.store_id=o.store_id AND r.order_id=o.id)
 ),revision_returns AS MATERIALIZED(
  SELECT r.currency,x AS line FROM saas.product_tax_order_revisions r JOIN recognized proof ON proof.order_id=r.order_id AND proof.currency=r.currency CROSS JOIN LATERAL jsonb_array_elements(r.return_lines)x WHERE r.store_id=p_store AND r.occurred_at>=start_at AND r.occurred_at<end_at
 ),return_evidence AS MATERIALIZED(
  SELECT e.id,e.currency,e.amount_cents,e.occurred_at,r.total_gross_cents,r.unknown_gross_cents,r.vat_cents,
   CASE WHEN r.unknown_gross_cents=0 AND r.total_gross_cents=e.amount_cents THEN r.total_gross_cents ELSE e.amount_cents END gross,
   r.unknown_gross_cents=0 AND r.total_gross_cents=e.amount_cents known
  FROM saas.accounting_events e LEFT JOIN LATERAL(SELECT * FROM saas.product_tax_order_revisions r WHERE r.store_id=e.store_id AND r.order_id=coalesce(e.order_id,e.deleted_order_id)AND r.occurred_at<=e.occurred_at ORDER BY r.order_version DESC,r.created_at DESC LIMIT 1)r ON true
  WHERE e.store_id=p_store AND e.kind='return_credit'
 ),returns AS MATERIALIZED(
  SELECT * FROM revision_returns
  UNION ALL SELECT e.currency,jsonb_build_object('grossCents',e.gross,'tax',CASE WHEN e.known THEN jsonb_build_object('treatment','taxable','rateBps',0)ELSE NULL END,'taxCents',CASE WHEN e.known THEN e.vat_cents ELSE NULL END)FROM return_evidence e WHERE e.occurred_at>=start_at AND e.occurred_at<end_at
 ),reversals AS MATERIALIZED(
  SELECT e.currency,jsonb_build_object('grossCents',CASE WHEN e.amount_cents=original.amount_cents THEN original.gross ELSE e.amount_cents END,'tax',CASE WHEN original.known AND e.amount_cents=original.amount_cents THEN jsonb_build_object('treatment','taxable','rateBps',0)ELSE NULL END,'taxCents',CASE WHEN original.known AND e.amount_cents=original.amount_cents THEN original.vat_cents ELSE NULL END)line
  FROM saas.accounting_events e JOIN return_evidence original ON original.id=e.reverses_event_id WHERE e.store_id=p_store AND e.kind='reversal'AND e.occurred_at>=start_at AND e.occurred_at<end_at
 ),codes AS(SELECT currency FROM sales UNION SELECT currency FROM returns UNION SELECT currency FROM reversals),totals AS(
  SELECT currency,coalesce((SELECT sum((s.line->>'grossCents')::numeric)FROM sales s WHERE s.currency=c.currency),0)gross,
   coalesce((SELECT sum((s.line->>'grossCents')::numeric)FROM sales s WHERE s.currency=c.currency AND s.line->'tax'<>'null'::jsonb),0)known,
   coalesce((SELECT sum((s.line->>'baseCents')::numeric)FROM sales s WHERE s.currency=c.currency AND s.line->'tax'->>'treatment'='taxable'),0)base,
   coalesce((SELECT sum((s.line->>'taxCents')::numeric)FROM sales s WHERE s.currency=c.currency),0)vat,
   coalesce((SELECT sum((s.line->>'grossCents')::numeric)FROM sales s WHERE s.currency=c.currency AND s.line->'tax'->>'treatment'='exempt'),0)exempt,
   coalesce((SELECT sum((s.line->>'grossCents')::numeric)FROM sales s WHERE s.currency=c.currency AND s.line->'tax'->>'treatment'='taxable'AND s.line->'tax'->>'rateBps'='0'),0)zero,
   (SELECT count(*)FROM sales s WHERE s.currency=c.currency AND s.line->'tax'<>'null'::jsonb)known_count,(SELECT count(*)FROM sales s WHERE s.currency=c.currency AND(s.line->'tax'IS NULL OR s.line->'tax'='null'::jsonb))unknown_count,
   coalesce((SELECT sum((s.line->>'grossCents')::numeric)FROM returns s WHERE s.currency=c.currency),0)return_gross,
   coalesce((SELECT sum((s.line->>'grossCents')::numeric)FROM returns s WHERE s.currency=c.currency AND s.line->'tax'<>'null'::jsonb),0)return_known,
   coalesce((SELECT sum((s.line->>'taxCents')::numeric)FROM returns s WHERE s.currency=c.currency),0)return_vat,
   coalesce((SELECT sum((s.line->>'grossCents')::numeric)FROM reversals s WHERE s.currency=c.currency),0)reversal_gross,
   coalesce((SELECT sum((s.line->>'grossCents')::numeric)FROM reversals s WHERE s.currency=c.currency AND s.line->'tax'<>'null'::jsonb),0)reversal_known,
   coalesce((SELECT sum((s.line->>'taxCents')::numeric)FROM reversals s WHERE s.currency=c.currency),0)reversal_vat FROM codes c WHERE NOT(p_filters?'currency')OR c.currency=p_filters->>'currency'
 )SELECT coalesce(jsonb_agg(jsonb_build_object('currency',currency,'grossSalesCents',gross,'knownGrossCents',known,'unknownGrossCents',gross-known,'taxableBaseCents',base,'vatCents',vat,'exemptGrossCents',exempt,'zeroRateGrossCents',zero,'knownLineCount',known_count,'unknownLineCount',unknown_count,'returnGrossCents',return_gross,'knownReturnGrossCents',return_known,'returnVatCents',return_vat,'unknownReturnGrossCents',return_gross-return_known,'reversalGrossCents',reversal_gross,'knownReversalGrossCents',reversal_known,'reversalVatCents',reversal_vat,'unknownReversalGrossCents',reversal_gross-reversal_known)ORDER BY currency),'[]')INTO result FROM totals;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(result)x CROSS JOIN LATERAL jsonb_each(x)e WHERE e.key<>'currency'AND abs((e.value#>>'{}')::numeric)>9007199254740991)THEN RETURN QUERY SELECT 'report_unavailable',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('dateFrom',from_date::text,'dateTo',to_date::text,'timeZone',zone_name,'startAt',saas.orders_json_timestamp(start_at),'endAt',saas.orders_json_timestamp(end_at),'currencies',result,'limitations',jsonb_build_array('purchase_vat_not_tracked','unallocated_returns_unknown','deleted_order_breakdown_unavailable'));
EXCEPTION WHEN invalid_datetime_format OR datetime_field_overflow OR invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;END $f$;

DO $acl$DECLARE r record;BEGIN
 FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND(proname LIKE 'product_tax_%'OR proname LIKE 'tax268_%'OR proname IN('catalog_effective_tax','catalog_tax_read','accounting_tax_report','catalog_create_product_with_tax','catalog_update_product_with_tax','catalog_create_variant_with_tax','catalog_update_variant_with_tax'))LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability',r.signature);END LOOP;
 FOR r IN SELECT oid::regprocedure signature FROM pg_proc WHERE pronamespace='saas'::regnamespace AND proname IN('catalog_tax_read','accounting_tax_report','catalog_create_product_with_tax','catalog_update_product_with_tax','catalog_create_variant_with_tax','catalog_update_variant_with_tax')LOOP EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',r.signature);END LOOP;
END $acl$;
COMMIT;
