BEGIN;
SET LOCAL ROLE celebix_saas_owner;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='120s';
SELECT pg_advisory_xact_lock(hashtextextended('saas.trendyol.release269',0));

CREATE TABLE saas.trendyol269_backup(signature text PRIMARY KEY,definition text NOT NULL,original_sha256 text NOT NULL,published_sha256 text,owner_id oid NOT NULL,acl aclitem[],config text[]);
ALTER TABLE saas.trendyol269_backup ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.trendyol269_backup FORCE ROW LEVEL SECURITY;
CREATE POLICY trendyol269_owner ON saas.trendyol269_backup TO celebix_saas_owner USING(true)WITH CHECK(true);
REVOKE ALL ON saas.trendyol269_backup FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability;

CREATE FUNCTION saas.trendyol_canonical_tax_issue(p_store uuid,p_variant uuid)RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN tax IS NULL THEN 'tax_required'WHEN tax->>'treatment'='exempt'THEN NULL WHEN(tax->>'rateBps')::integer IN(0,100,1000,2000)THEN NULL ELSE 'tax_unsupported'END FROM(SELECT saas.catalog_effective_tax(p_store,p_variant)tax)q
$f$;
CREATE FUNCTION saas.trendyol_canonical_vat_rate(p_store uuid,p_variant uuid)RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
 SELECT CASE WHEN tax->>'treatment'='exempt'THEN 0 WHEN(tax->>'rateBps')::integer IN(0,100,1000,2000)THEN(tax->>'rateBps')::integer/100 ELSE NULL END FROM(SELECT saas.catalog_effective_tax(p_store,p_variant)tax)q
$f$;
CREATE FUNCTION saas.trendyol_product_tax(p_store uuid,p_variant uuid,p_now timestamptz)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $f$
DECLARE result jsonb;tax jsonb;issue text;BEGIN
 result:=saas.trendyol_product(p_store,p_variant,p_now);IF result IS NULL THEN RETURN NULL;END IF;
 tax:=saas.catalog_effective_tax(p_store,p_variant);
 IF result->>'issue'='provider_outcome_unknown'THEN issue:='provider_outcome_unknown';
 ELSIF result->'mapping'->>'enabled'='true'THEN
  issue:=saas.trendyol_canonical_tax_issue(p_store,p_variant);
  IF issue IS NULL AND(result->'mapping'->>'vatRate')::integer IS DISTINCT FROM saas.trendyol_canonical_vat_rate(p_store,p_variant)THEN issue:='tax_conflict';END IF;
  issue:=coalesce(issue,result->>'issue');
 ELSE issue:=result->>'issue';END IF;
 RETURN result||jsonb_build_object('tax',tax,'issue',issue,'status',CASE WHEN issue IN('tax_required','tax_unsupported','tax_conflict')AND result->'mapping'->>'enabled'='true'THEN 'failed'ELSE result->>'status'END);
END $f$;
REVOKE ALL ON FUNCTION saas.trendyol_canonical_tax_issue(uuid,uuid),saas.trendyol_canonical_vat_rate(uuid,uuid),saas.trendyol_product_tax(uuid,uuid,timestamptz)FROM PUBLIC,celebix_saas_app,celebix_saas_workflow,celebix_saas_identity,celebix_saas_bootstrap,celebix_saas_host_resolver,celebix_saas_observability;

-- The existing queue trigger preserves dispatch uncertainty and increments the
-- mapping version. It does not change the saved gross product price.
CREATE TRIGGER trendyol_variant_tax_changed AFTER UPDATE OF tax_treatment,tax_rate_bps ON saas.product_variants FOR EACH ROW WHEN(OLD.tax_treatment IS DISTINCT FROM NEW.tax_treatment OR OLD.tax_rate_bps IS DISTINCT FROM NEW.tax_rate_bps)EXECUTE FUNCTION saas.trendyol_catalog_changed();
CREATE TRIGGER trendyol_product_tax_changed AFTER UPDATE OF tax_treatment,tax_rate_bps ON saas.products FOR EACH ROW WHEN(OLD.tax_treatment IS DISTINCT FROM NEW.tax_treatment OR OLD.tax_rate_bps IS DISTINCT FROM NEW.tax_rate_bps)EXECUTE FUNCTION saas.trendyol_catalog_changed();

DO $patch$
DECLARE sig text;source text;old_fragment text;new_fragment text;fragments text[];n integer;r record;expected text;expected_count integer;
BEGIN
 IF to_regprocedure('saas.product_tax_external_prepare(uuid,uuid,jsonb,timestamptz)')IS NULL OR to_regprocedure('saas.catalog_effective_tax(uuid,uuid)')IS NULL THEN RAISE EXCEPTION 'TRENDYOL269_PRODUCT_TAX_REQUIRED';END IF;
 FOREACH sig IN ARRAY ARRAY['saas.trendyol_command(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,jsonb)','saas.trendyol_workflow(text,jsonb,timestamptz)','saas.trendyol_import(uuid,text,jsonb,boolean,timestamptz)']LOOP
  SELECT pg_get_functiondef(p.oid)definition,p.proowner,p.proacl,p.proconfig INTO r FROM pg_proc p WHERE p.oid=sig::regprocedure;
  IF sig LIKE 'saas.trendyol_import%'THEN expected:='52347a3415120f0260724bc5c5ef531a159dc0e55ff5f0522541da9167416433';
  ELSE SELECT published_sha256 INTO expected FROM saas.trendyol267_backup WHERE signature=sig;END IF;
  IF expected IS NULL OR encode(sha256(convert_to(r.definition,'UTF8')),'hex')IS DISTINCT FROM expected OR r.proowner<>'celebix_saas_owner'::regrole OR r.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[]THEN RAISE EXCEPTION 'TRENDYOL269_PREDECESSOR_DRIFT';END IF;
  IF sig NOT LIKE 'saas.trendyol_import%'AND NOT EXISTS(SELECT 1 FROM saas.trendyol267_backup WHERE signature=sig AND owner_id=r.proowner AND acl IS NOT DISTINCT FROM r.proacl AND config IS NOT DISTINCT FROM r.proconfig)THEN RAISE EXCEPTION 'TRENDYOL269_PREDECESSOR_AUTHORITY';END IF;
  INSERT INTO saas.trendyol269_backup VALUES(sig,r.definition,expected,NULL,r.proowner,r.proacl,r.proconfig);
  source:=r.definition;
  IF sig LIKE 'saas.trendyol_command%'THEN
   fragments:=ARRAY[
    $o$'overview','products','connect'$o$,$n$'overview','products','products_tax','connect'$n$,
    $o$('overview','products','order_issues')$o$,$n$('overview','products','products_tax','order_issues')$n$,
    $o$ELSIF p_action='products'THEN$o$,$n$ELSIF p_action IN('products','products_tax')THEN$n$,
    $o$saas.trendyol_product(p_store_id,id,p_now)$o$,$n$CASE WHEN p_action='products_tax'THEN saas.trendyol_product_tax(p_store_id,id,p_now)ELSE saas.trendyol_product(p_store_id,id,p_now)END $n$,
    $o$SELECT * INTO previous FROM saas.trendyol_listings WHERE store_id=p_store_id AND variant_id=v.id FOR UPDATE;$o$,$n$IF p_input->>'enabled'='true'THEN
    -- Lock catalog parents before the listing, matching catalog mutation order.
    PERFORM 1 FROM saas.products WHERE store_id=p_store_id AND id=v.product_id FOR SHARE;
    SELECT * INTO v FROM saas.product_variants WHERE store_id=p_store_id AND id=v.id FOR SHARE;
    err:=saas.trendyol_canonical_tax_issue(p_store_id,v.id);
    IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
    IF(p_input->>'vatRate')::numeric IS DISTINCT FROM saas.trendyol_canonical_vat_rate(p_store_id,v.id)THEN RETURN QUERY SELECT 'tax_conflict',NULL::jsonb;RETURN;END IF;
   END IF;
   SELECT * INTO previous FROM saas.trendyol_listings WHERE store_id=p_store_id AND variant_id=v.id FOR UPDATE;$n$
   ];
  ELSIF sig LIKE 'saas.trendyol_workflow%'THEN
   fragments:=ARRAY[
    $o$saas.trendyol_product(j.store_id,l.variant_id,p_now)$o$,$n$saas.trendyol_product_tax(j.store_id,l.variant_id,p_now)$n$,
    $o$IN('provider_outcome_unknown','mapping_required','stock_tracking_required','provider_rejected')$o$,$n$IN('provider_outcome_unknown','mapping_required','stock_tracking_required','provider_rejected','tax_required','tax_unsupported','tax_conflict')$n$
   ];
  ELSE
   fragments:=ARRAY[
    $o$fingerprint:=encode(sha256(convert_to(p_packages::text,'UTF8')),'hex');$o$,$n$-- Tax evidence is additive: preserve the installed legacy idempotency identity.
 fingerprint:=encode(sha256(convert_to((SELECT jsonb_agg(CASE WHEN jsonb_typeof(pkg.value->'lines')='array'THEN(pkg.value-'lines')||jsonb_build_object('lines',coalesce((SELECT jsonb_agg(line.value-'tax'ORDER BY line.ordinality)FROM jsonb_array_elements(pkg.value->'lines')WITH ORDINALITY line(value,ordinality)),'[]'))ELSE pkg.value END ORDER BY pkg.ordinality)FROM jsonb_array_elements(p_packages)WITH ORDINALITY pkg(value,ordinality))::text,'UTF8')),'hex');$n$,
    -- Each accepted provider revision can add or release stock again. The old
    -- order-only source identity collided on a second partial cancellation.
    $o$'checkout_sale',oid,p_now,p_now);remaining:=remaining-take;$o$,$n$'checkout_sale',saas.inventory_deterministic_uuid('trendyol-stock-source',oid::text||':'||fingerprint),p_now,p_now);remaining:=remaining-take;$n$,
    $o$'catalog_adjustment',oid,p_now,p_now);remaining:=remaining-take;$o$,$n$'catalog_adjustment',saas.inventory_deterministic_uuid('trendyol-stock-source',oid::text||':'||fingerprint),p_now,p_now);remaining:=remaining-take;$n$,
    $o$IF NOT existing_order THEN INSERT INTO saas.order_events$o$,$n$IF NOT existing_order OR EXISTS(SELECT 1 FROM saas.product_tax_order_revisions WHERE store_id=p_store AND order_id=oid)THEN
    PERFORM saas.product_tax_external_prepare(p_store,oid,coalesce((SELECT jsonb_agg(jsonb_build_object('lineId',saas.inventory_deterministic_uuid('trendyol-order-item',oid::text||':'||(x->>'packageId')||':'||(x->>'lineId')),'productId',x->'productId','variantId',x->'variantId','quantity',x->'quantity','grossCents',x->'totalCents','tax',coalesce(x->'tax','null'::jsonb)))FROM jsonb_array_elements(rows)x),'[]'),p_now);
   END IF;
   IF NOT existing_order THEN INSERT INTO saas.order_events$n$,
    $o$DELETE FROM saas.trendyol_writer_context WHERE backend_pid=pg_backend_pid()AND transaction_id=txid_current()AND order_id=oid;$o$,$n$IF EXISTS(SELECT 1 FROM saas.product_tax_order_revisions WHERE store_id=p_store AND order_id=oid)THEN
    PERFORM saas.product_tax_capture_order(p_store,oid,'provider:'||fingerprint,p_now);
   END IF;
   DELETE FROM saas.trendyol_writer_context WHERE backend_pid=pg_backend_pid()AND transaction_id=txid_current()AND order_id=oid;$n$
   ];
  END IF;
  FOR n IN 1..array_length(fragments,1)BY 2 LOOP
   old_fragment:=fragments[n];new_fragment:=fragments[n+1];expected_count:=CASE WHEN sig LIKE 'saas.trendyol_command%'AND n=3 THEN 2 ELSE 1 END;
   IF(length(source)-length(replace(source,old_fragment,'')))/length(old_fragment)<>expected_count THEN RAISE EXCEPTION 'TRENDYOL269_PATCH_FRAGMENT_%_%',sig,n;END IF;
   source:=replace(source,old_fragment,new_fragment);
  END LOOP;
  EXECUTE source;
  UPDATE saas.trendyol269_backup SET published_sha256=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex')WHERE signature=sig;
 END LOOP;
END $patch$;
COMMIT;
