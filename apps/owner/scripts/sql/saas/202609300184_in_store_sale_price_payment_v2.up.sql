-- Additive POS v2 ABI. Prepared catalog/applied prices and payment remain immutable.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
CREATE TABLE saas.in_store_v2_migration_restore(signature text PRIMARY KEY,definition text NOT NULL,before_hash text NOT NULL,after_hash text);
ALTER TABLE saas.in_store_v2_migration_restore ENABLE ROW LEVEL SECURITY;
ALTER TABLE saas.in_store_v2_migration_restore FORCE ROW LEVEL SECURITY;
CREATE POLICY in_store_v2_restore_owner ON saas.in_store_v2_migration_restore TO celebix_saas_owner USING(true) WITH CHECK(true);
REVOKE ALL ON saas.in_store_v2_migration_restore FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_migrator;
DO $snapshot$
DECLARE sig text;definition text;
BEGIN
 FOR sig IN SELECT unnest(ARRAY[
 'saas.in_store_sales_mutate(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,jsonb)',
 'saas.in_store_sales_projection(uuid,uuid)',
 'saas.in_store_sales_get(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid)',
 'saas.in_store_sales_list(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,integer,text)',
 'saas.in_store_sales_bootstrap(uuid,uuid,uuid,uuid,text,bigint,timestamptz)',
 'saas.in_store_sales_set_staff(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,boolean,uuid[],integer)']) LOOP
  definition:=pg_get_functiondef(sig::regprocedure);
  INSERT INTO saas.in_store_v2_migration_restore VALUES(sig,definition,encode(sha256(convert_to(definition,'UTF8')),'hex'),NULL);
 END LOOP;
 IF (SELECT before_hash FROM saas.in_store_v2_migration_restore saved WHERE signature LIKE '%sales_mutate%')<>'2f4074c3eb6ab802144ff7dade9b3c63d2f17c897d8629a31609cc9a3095ace5' THEN RAISE EXCEPTION 'IN_STORE_V2_PREDECESSOR_DRIFT';END IF;
END $snapshot$;
ALTER TABLE saas.in_store_staff_grants ADD COLUMN can_edit_price boolean NOT NULL DEFAULT false;
ALTER TABLE saas.in_store_sales ADD COLUMN payment_method text CHECK(payment_method IN('card','cash')),
 ADD COLUMN contract_version integer NOT NULL DEFAULT 1 CHECK(contract_version IN(1,2)),
 ADD CONSTRAINT in_store_v2_payment_stage CHECK(contract_version=1 OR status NOT IN('payment_pending','payment_received','completed') OR payment_method IS NOT NULL);
ALTER TABLE saas.in_store_payment_attestations ADD COLUMN payment_method text CHECK(payment_method IN('card','cash'));
CREATE FUNCTION saas.in_store_can_edit_price(p_store uuid,p_member uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT saas.in_store_is_manager(p_store,p_member) OR EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled AND can_edit_price)
$fn$;
CREATE FUNCTION saas.in_store_payment_method_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog,saas AS $fn$
BEGIN
 IF OLD.payment_method IS DISTINCT FROM NEW.payment_method AND (OLD.status IN('payment_received','completed') OR OLD.status='payment_pending' AND OLD.payment_method IS NOT NULL) THEN RAISE EXCEPTION 'IN_STORE_PAYMENT_METHOD_IMMUTABLE';END IF;
 RETURN NEW;
END $fn$;
CREATE TRIGGER in_store_payment_method_guard BEFORE UPDATE OF payment_method ON saas.in_store_sales FOR EACH ROW EXECUTE FUNCTION saas.in_store_payment_method_guard();
-- Lift historical snapshots by their own applied price; never infer historical payment.
CREATE FUNCTION saas.in_store_projection_v2_value(p_sale jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=pg_catalog,saas AS $fn$
 SELECT CASE WHEN p_sale IS NULL THEN NULL ELSE p_sale||jsonb_build_object('paymentMethod',p_sale->'paymentMethod','items',(SELECT coalesce(jsonb_agg(i||jsonb_build_object('catalogUnitPriceCents',coalesce(i->'catalogUnitPriceCents',i->'unitPriceCents'),'unitPriceOverrideCents',i->'unitPriceOverrideCents','priceOverrideActorMembershipId',i->'priceOverrideActorMembershipId') ORDER BY pos),'[]'::jsonb) FROM jsonb_array_elements(p_sale->'items') WITH ORDINALITY entries(i,pos))) END
$fn$;
CREATE FUNCTION saas.in_store_sales_projection_v2(p_store uuid,p_sale uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT saas.in_store_projection_v2_value(saas.in_store_sales_projection(p_store,p_sale)||jsonb_build_object('paymentMethod',s.payment_method,'items',s.items)) FROM saas.in_store_sales s WHERE s.store_id=p_store AND s.id=p_sale
$fn$;


CREATE FUNCTION saas.in_store_quote_v2(p_store uuid,p_member uuid,p_now timestamptz,p_intent jsonb,p_existing jsonb DEFAULT '[]'::jsonb) RETURNS TABLE(outcome text,result_payload jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE item jsonb; v record; price record; base_price record; provenance jsonb:='[]'; lines jsonb:='[]'; gross numeric:=0; eligible numeric:=0; deduction numeric:=0; limit_bps integer; line_gross bigint; share bigint; remainder bigint; idx integer; alloc jsonb:='[]'; eligible_line boolean; catalog_eligible numeric:=0; reductions numeric:=0; applied bigint; override_price bigint; override_actor uuid; previous jsonb;
BEGIN
 IF p_intent IS NULL OR jsonb_typeof(p_intent)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_intent))<>6 OR NOT(p_intent ?& ARRAY['locationId','items','discount','customerName','note','paymentMethod']) OR pg_column_size(p_intent)>65536 OR jsonb_typeof(p_intent->'items')<>'array' OR jsonb_array_length(p_intent->'items')>100 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF p_intent->'paymentMethod'<>'null'::jsonb AND (jsonb_typeof(p_intent->'paymentMethod')<>'string' OR p_intent->>'paymentMethod' NOT IN('card','cash')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF (p_intent->>'locationId')!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR (p_intent->'customerName'<>'null'::jsonb AND (jsonb_typeof(p_intent->'customerName')<>'string' OR length(p_intent->>'customerName') NOT BETWEEN 1 AND 200 OR p_intent->>'customerName'<>btrim(p_intent->>'customerName') OR p_intent->>'customerName'~'[[:cntrl:]]')) OR (p_intent->'note'<>'null'::jsonb AND (jsonb_typeof(p_intent->'note')<>'string' OR length(p_intent->>'note') NOT BETWEEN 1 AND 2000 OR p_intent->>'note'<>btrim(p_intent->>'note') OR regexp_replace(p_intent->>'note',E'[\n\r\t]','','g')~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_intent->'items') e GROUP BY e->>'variantId' HAVING count(*)>1) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_intent->'items') LOOP
  IF jsonb_typeof(item)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(item))<>3 OR NOT(item ?& ARRAY['variantId','quantity','unitPriceOverrideCents']) OR item->>'variantId'!~'^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' OR jsonb_typeof(item->'quantity')<>'number' OR (item->>'quantity')::numeric<>trunc((item->>'quantity')::numeric) OR (item->>'quantity')::numeric NOT BETWEEN 1 AND 9999 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb; RETURN; END IF;
  IF item->'unitPriceOverrideCents'<>'null'::jsonb AND (jsonb_typeof(item->'unitPriceOverrideCents')<>'number' OR (item->>'unitPriceOverrideCents')::numeric<>trunc((item->>'unitPriceOverrideCents')::numeric) OR (item->>'unitPriceOverrideCents')::numeric NOT BETWEEN 1 AND 9007199254740991) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  override_price:=(item->>'unitPriceOverrideCents')::bigint;
  SELECT i INTO previous FROM jsonb_array_elements(p_existing) i WHERE i->>'variantId'=item->>'variantId';
  override_actor:=NULL;
  IF override_price IS DISTINCT FROM (previous->>'unitPriceOverrideCents')::bigint AND NOT saas.in_store_can_edit_price(p_store,p_member) THEN RETURN QUERY SELECT 'price_denied',NULL::jsonb;RETURN;END IF;
  IF override_price IS NOT NULL THEN
   IF previous->>'unitPriceOverrideCents'=item->>'unitPriceOverrideCents' THEN override_actor:=(previous->>'priceOverrideActorMembershipId')::uuid;
   ELSE
    IF NOT saas.in_store_can_edit_price(p_store,p_member) THEN RETURN QUERY SELECT 'price_denied',NULL::jsonb;RETURN;END IF;
    override_actor:=p_member;
   END IF;
  END IF;
  SELECT variant.*,product.title AS product_name,product.version AS product_version INTO v FROM saas.product_variants variant JOIN saas.products product ON product.store_id=variant.store_id AND product.id=variant.product_id WHERE variant.store_id=p_store AND variant.id=(item->>'variantId')::uuid AND variant.status='active' AND product.status='active';
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb; RETURN; END IF;
  SELECT * INTO price FROM saas.resolve_effective_variant_price(p_store,v.id,'in_store',p_now,NULL);
  IF price.outcome<>'found' OR price.price_cents IS NULL THEN RETURN QUERY SELECT 'pricing_unavailable',NULL::jsonb; RETURN; END IF;
  SELECT * INTO base_price FROM saas.pricing_calculate_variant_price(p_store,v.id,NULL::uuid);
  applied:=coalesce(override_price,price.price_cents);
  provenance:=provenance||jsonb_build_array(jsonb_build_object('variantId',v.id,'unitPriceCents',applied,'catalogUnitPriceCents',price.price_cents,'appliedUnitPriceCents',applied,'unitPriceOverrideCents',override_price,'priceOverrideActorMembershipId',override_actor,'actorMembershipId',p_member,'sourceKind',price.source_kind,
   'priceListId',price.price_list_id,'priceListVersion',(SELECT version FROM saas.price_lists WHERE store_id=p_store AND id=price.price_list_id),
   'variantVersion',v.version,'productVersion',v.product_version,'policyVersion',base_price.policy_version,
   'referenceSetId',base_price.trace->'setId','referenceSetVersion',(SELECT version FROM saas.pricing_reference_sets WHERE store_id=p_store AND id=(base_price.trace->>'setId')::uuid),
   'referenceStateVersion',(SELECT version FROM saas.pricing_reference_state WHERE store_id=p_store),'trace',base_price.trace));
  line_gross:=(applied::numeric*(item->>'quantity')::numeric)::bigint;gross:=gross+line_gross;
  eligible_line:=saas.pricing_variant_discount_allowed(p_store,v.id);
  IF NOT eligible_line AND applied<price.price_cents THEN RETURN QUERY SELECT 'discount_denied',NULL::jsonb;RETURN;END IF;
  IF eligible_line THEN eligible:=eligible+line_gross;catalog_eligible:=catalog_eligible+price.price_cents::numeric*(item->>'quantity')::integer;END IF;
  reductions:=reductions+greatest(price.price_cents-applied,0)::numeric*(item->>'quantity')::integer;
  lines:=lines||jsonb_build_array(jsonb_build_object('productId',v.product_id,'variantId',v.id,'productName',v.product_name,'variantName',v.title,'sku',v.sku,'barcode',v.barcode,'imageUrl',NULL,'unitPriceCents',applied,'catalogUnitPriceCents',price.price_cents,'unitPriceOverrideCents',override_price,'priceOverrideActorMembershipId',override_actor,'quantity',(item->>'quantity')::integer,'discountEligible',eligible_line,'lineSubtotalCents',line_gross,'allocatedDiscountCents',0,'lineNetCents',line_gross));
 END LOOP;
 IF gross>9007199254740991 OR catalog_eligible>9007199254740991 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_intent->'discount'<>'null'::jsonb THEN
  IF jsonb_typeof(p_intent->'discount')<>'object' OR (SELECT count(*) FROM jsonb_object_keys(p_intent->'discount'))<>2 OR eligible<=0 THEN RETURN QUERY SELECT 'discount_invalid',NULL::jsonb; RETURN; END IF;
  IF p_intent->'discount'->>'kind'='percentage' AND jsonb_typeof(p_intent->'discount'->'percentageBps')='number' AND (p_intent->'discount'->>'percentageBps')::numeric=trunc((p_intent->'discount'->>'percentageBps')::numeric) AND (p_intent->'discount'->>'percentageBps')::numeric BETWEEN 1 AND 9999 THEN deduction:=floor(eligible*(p_intent->'discount'->>'percentageBps')::numeric/10000);
  ELSIF p_intent->'discount'->>'kind'='fixed_amount' AND jsonb_typeof(p_intent->'discount'->'amountCents')='number' AND (p_intent->'discount'->>'amountCents')::numeric=trunc((p_intent->'discount'->>'amountCents')::numeric) AND (p_intent->'discount'->>'amountCents')::numeric>0 THEN deduction:=(p_intent->'discount'->>'amountCents')::numeric;
  ELSE RETURN QUERY SELECT 'discount_invalid',NULL::jsonb;RETURN;END IF;
  IF deduction>=eligible THEN RETURN QUERY SELECT 'discount_invalid',NULL::jsonb;RETURN;END IF;
  limit_bps:=9999;IF NOT saas.in_store_is_manager(p_store,p_member) THEN SELECT discount_limit_bps INTO limit_bps FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled;END IF;
  IF coalesce(limit_bps,0)=0 OR deduction>floor(eligible*limit_bps/10000) OR (p_intent->'discount'->>'kind'='percentage' AND (p_intent->'discount'->>'percentageBps')::integer>limit_bps) THEN RETURN QUERY SELECT 'discount_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 limit_bps:=9999;IF NOT saas.in_store_is_manager(p_store,p_member) THEN SELECT discount_limit_bps INTO limit_bps FROM saas.in_store_staff_grants WHERE store_id=p_store AND membership_id=p_member AND enabled;END IF;
 IF reductions+deduction>floor(catalog_eligible*coalesce(limit_bps,0)/10000) THEN RETURN QUERY SELECT 'discount_denied',NULL::jsonb;RETURN;END IF;
 remainder:=deduction::bigint;
 FOR item IN SELECT value FROM jsonb_array_elements(lines) LOOP
  share:=CASE WHEN (item->>'discountEligible')::boolean AND eligible>0 THEN floor(deduction*(item->>'lineSubtotalCents')::numeric/eligible)::bigint ELSE 0 END;
  remainder:=remainder-share;alloc:=alloc||jsonb_build_array(item||jsonb_build_object('allocatedDiscountCents',share,'lineNetCents',(item->>'lineSubtotalCents')::bigint-share));
 END LOOP;
 idx:=0;WHILE remainder>0 AND idx<jsonb_array_length(alloc) LOOP
  item:=alloc->idx;IF (item->>'discountEligible')::boolean AND (item->>'lineSubtotalCents')::bigint>0 THEN share:=(item->>'allocatedDiscountCents')::bigint+1;alloc:=jsonb_set(alloc,ARRAY[idx::text],item||jsonb_build_object('allocatedDiscountCents',share,'lineNetCents',(item->>'lineSubtotalCents')::bigint-share));remainder:=remainder-1;END IF;idx:=idx+1;
 END LOOP;
 RETURN QUERY SELECT 'found',jsonb_build_object('items',alloc,'priceProvenance',provenance,'subtotalCents',gross,'eligibleSubtotalCents',eligible,'discountCents',deduction,'totalCents',gross-deduction);
EXCEPTION WHEN invalid_text_representation OR numeric_value_out_of_range THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;
END $fn$;

CREATE OR REPLACE FUNCTION saas.in_store_sales_mutate_v2(p_store_id uuid, p_principal_id uuid, p_membership_id uuid, p_plan_id uuid, p_plan_code text, p_plan_version bigint, p_now timestamp with time zone, p_operation_id uuid, p_fingerprint text, p_sale_id uuid, p_expected_version bigint, p_kind text, p_args jsonb)
 RETURNS TABLE(outcome text, result_payload jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'saas'
AS $function$
DECLARE actual_order_number text; err text; prior saas.in_store_operations%ROWTYPE; selected saas.in_store_sales%ROWTYPE; quote record; intent_payload jsonb; line jsonb; variant record; amount bigint; selected_location_name text; manager boolean; changed boolean:=false; projected jsonb; target_order uuid; target_item uuid; position integer:=0; selected_location uuid;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,p_kind='takeover');
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_sale_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_kind NOT IN('create','update','hold','prepare','confirm_payment','complete','cancel','takeover') OR p_args IS NULL OR jsonb_typeof(p_args)<>'object' OR pg_column_size(p_args)>65536 OR (p_kind<>'create' AND (p_expected_version IS NULL OR p_expected_version NOT BETWEEN 1 AND 9007199254740990)) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id<>p_store_id OR prior.operation_kind<>p_kind OR prior.payload_fingerprint<>p_fingerprint OR prior.sale_id IS DISTINCT FROM p_sale_id OR (prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id)) THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
  IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  projected:=prior.result_payload||jsonb_build_object('replayed',true);
  IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
  RETURN QUERY SELECT 'operation_replayed',projected;RETURN;
 END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);
 IF p_kind='create' THEN
  IF p_expected_version IS NOT NULL OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') OR EXISTS(SELECT 1 FROM saas.in_store_sales WHERE id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  intent_payload:=p_args->'intent';
 ELSE
  SELECT * INTO selected FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id FOR UPDATE;
  IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
  IF selected.owner_membership_id<>p_membership_id AND NOT manager THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
  IF selected.version<>p_expected_version OR p_now<selected.updated_at THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
  intent_payload:=CASE WHEN p_kind='update' THEN p_args->'intent' ELSE selected.intent END;
 END IF;
 IF p_kind IN('create','update','prepare') THEN
  IF p_kind='prepare' AND selected.contract_version=1 AND NOT (intent_payload ? 'paymentMethod') THEN
   intent_payload:=intent_payload||jsonb_build_object('paymentMethod',selected.payment_method,'items',(SELECT coalesce(jsonb_agg(i||jsonb_build_object('unitPriceOverrideCents',NULL)),'[]'::jsonb) FROM jsonb_array_elements(intent_payload->'items') i));
  END IF;
  IF p_kind='prepare' AND intent_payload->>'paymentMethod' IS NULL THEN RETURN QUERY SELECT 'payment_method_required',NULL::jsonb;RETURN;END IF;
  SELECT * INTO quote FROM saas.in_store_quote_v2(p_store_id,p_membership_id,p_now,intent_payload,coalesce(selected.items,'[]'::jsonb));
  IF quote.outcome<>'found' THEN RETURN QUERY SELECT quote.outcome::text,NULL::jsonb;RETURN;END IF;
 END IF;
 selected_location:=CASE WHEN p_kind IN('create','update') THEN (intent_payload->>'locationId')::uuid ELSE selected.location_id END;
 -- Payment already received can always be recovered by a manager, even if a location was archived.
 IF p_kind<>'complete' OR selected.status<>'payment_received' THEN
  err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,selected_location,false);
  IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 ELSIF NOT manager THEN
  IF NOT EXISTS(SELECT 1 FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id AND enabled AND selected_location=ANY(location_ids)) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 END IF;
 SELECT name INTO selected_location_name FROM saas.inventory_locations WHERE store_id=p_store_id AND id=selected_location;
 IF p_kind='create' THEN
  INSERT INTO saas.in_store_sales(id,store_id,sale_number,status,owner_membership_id,location_id,location_name,intent,price_provenance,items,subtotal_cents,eligible_subtotal_cents,discount_cents,total_cents,created_at,updated_at)
  VALUES(p_sale_id,p_store_id,'POS-'||upper(replace(p_sale_id::text,'-','')),'draft',p_membership_id,selected_location,selected_location_name,intent_payload,quote.result_payload->'priceProvenance',quote.result_payload->'items',(quote.result_payload->>'subtotalCents')::bigint,(quote.result_payload->>'eligibleSubtotalCents')::bigint,(quote.result_payload->>'discountCents')::bigint,(quote.result_payload->>'totalCents')::bigint,p_now,p_now);
  UPDATE saas.in_store_sales SET contract_version=2,payment_method=intent_payload->>'paymentMethod' WHERE id=p_sale_id;
 ELSIF p_kind='update' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR NOT(p_args ? 'intent') THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET contract_version=2,payment_method=intent_payload->>'paymentMethod',location_id=selected_location,location_name=selected_location_name,intent=intent_payload,price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
 ELSIF p_kind='hold' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'held')<>'boolean' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET status=CASE WHEN (p_args->>'held')::boolean THEN 'held' ELSE 'draft' END WHERE id=p_sale_id;
 ELSIF p_kind='prepare' THEN
  IF selected.status NOT IN('draft','held') OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>1 OR jsonb_typeof(p_args->'expectedTotalCents')<>'number' OR (p_args->>'expectedTotalCents')::numeric<>trunc((p_args->>'expectedTotalCents')::numeric) OR (p_args->>'expectedTotalCents')::numeric<=0 OR (quote.result_payload->>'totalCents')::bigint<=0 OR jsonb_array_length(selected.items)=0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  changed:=selected.items IS DISTINCT FROM quote.result_payload->'items' OR selected.total_cents<>(p_args->>'expectedTotalCents')::numeric;
  IF changed THEN
   UPDATE saas.in_store_sales SET status='draft',price_provenance=quote.result_payload->'priceProvenance',items=quote.result_payload->'items',subtotal_cents=(quote.result_payload->>'subtotalCents')::bigint,eligible_subtotal_cents=(quote.result_payload->>'eligibleSubtotalCents')::bigint,discount_cents=(quote.result_payload->>'discountCents')::bigint,total_cents=(quote.result_payload->>'totalCents')::bigint WHERE id=p_sale_id;
  ELSE
   -- Global inventory and selected location are checked under the same store lock as online/count/transfer.
   FOR line IN SELECT value FROM jsonb_array_elements(selected.items) ORDER BY value->>'variantId' LOOP
    SELECT * INTO variant FROM saas.product_variants WHERE store_id=p_store_id AND id=(line->>'variantId')::uuid FOR UPDATE;
    IF variant.stock_tracking THEN
     SELECT coalesce(quantity,0) INTO amount FROM saas.inventory_balances WHERE store_id=p_store_id AND location_id=selected.location_id AND variant_id=variant.id FOR UPDATE;
     IF coalesce(amount,0)-saas.in_store_held_quantity(p_store_id,variant.id,selected.location_id,p_sale_id)<(line->>'quantity')::integer OR variant.stock_quantity-saas.in_store_held_quantity(p_store_id,variant.id,NULL,p_sale_id)<(line->>'quantity')::integer THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
    END IF;
   END LOOP;
   INSERT INTO saas.in_store_inventory_reservations(id,store_id,sale_id,location_id,product_id,variant_id,quantity,stock_tracked,status,held_at,updated_at)
   SELECT saas.inventory_deterministic_uuid('in-store-reservation',p_sale_id::text||':'||v.id::text),p_store_id,p_sale_id,selected.location_id,v.product_id,v.id,(i->>'quantity')::integer,v.stock_tracking,'held',p_now,p_now
   FROM jsonb_array_elements(selected.items) i JOIN saas.product_variants v ON v.store_id=p_store_id AND v.id=(i->>'variantId')::uuid
   ON CONFLICT(sale_id,variant_id) DO UPDATE SET location_id=excluded.location_id,quantity=excluded.quantity,stock_tracked=excluded.stock_tracked,status='held',held_at=p_now,consumed_at=NULL,released_at=NULL,updated_at=p_now,version=saas.in_store_inventory_reservations.version+1;
   INSERT INTO saas.in_store_price_snapshots(store_id,sale_id,prepare_operation_id,variant_id,provenance,prepared_at) SELECT p_store_id,p_sale_id,p_operation_id,(value->>'variantId')::uuid,value,p_now FROM jsonb_array_elements(quote.result_payload->'priceProvenance');
   UPDATE saas.in_store_sales SET status='payment_pending',price_provenance=quote.result_payload->'priceProvenance' WHERE id=p_sale_id;
  END IF;
 ELSIF p_kind='confirm_payment' THEN
  IF selected.status<>'payment_pending' OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>2 OR NOT(p_args ? 'slipReference') OR (p_args->'slipReference'<>'null'::jsonb AND (jsonb_typeof(p_args->'slipReference')<>'string' OR length(p_args->>'slipReference') NOT BETWEEN 1 AND 100 OR p_args->>'slipReference'<>btrim(p_args->>'slipReference') OR p_args->>'slipReference'~'[[:cntrl:]]')) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF NOT(p_args ? 'paymentMethod') OR (p_args->'paymentMethod'<>'null'::jsonb AND (jsonb_typeof(p_args->'paymentMethod')<>'string' OR p_args->>'paymentMethod' NOT IN('card','cash'))) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.payment_method IS NOT NULL AND p_args->>'paymentMethod' IS NOT NULL AND selected.payment_method<>p_args->>'paymentMethod' THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF selected.payment_method IS NULL THEN
   IF p_args->>'paymentMethod' IS NULL THEN RETURN QUERY SELECT 'payment_method_required',NULL::jsonb;RETURN;END IF;
   UPDATE saas.in_store_sales SET payment_method=p_args->>'paymentMethod',contract_version=2 WHERE id=p_sale_id;
  END IF;
  INSERT INTO saas.in_store_payment_attestations(sale_id,store_id,actor_membership_id,amount_cents,slip_reference,received_at,payment_method) VALUES(p_sale_id,p_store_id,p_membership_id,selected.total_cents,p_args->>'slipReference',p_now,coalesce(selected.payment_method,p_args->>'paymentMethod'));
  UPDATE saas.in_store_sales SET status='payment_received',payment_received_at=p_now WHERE id=p_sale_id;
 ELSIF p_kind='complete' THEN
  IF (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  IF selected.status='completed' THEN
   projected:=jsonb_build_object('sale',saas.in_store_sales_projection_v2(p_store_id,p_sale_id),'replayed',false,'priceChanged',false);
   INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
   RETURN QUERY SELECT 'committed',projected;RETURN;
  END IF;
  IF selected.status<>'payment_received' OR NOT EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id AND store_id=p_store_id AND amount_cents=selected.total_cents) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  IF EXISTS(SELECT 1 FROM saas.in_store_inventory_reservations r LEFT JOIN saas.inventory_balances b ON b.store_id=r.store_id AND b.location_id=r.location_id AND b.variant_id=r.variant_id WHERE r.sale_id=p_sale_id AND r.status='held' AND r.stock_tracked AND coalesce(b.quantity,0)<r.quantity) OR (SELECT count(*) FROM saas.in_store_inventory_reservations WHERE sale_id=p_sale_id AND status='held')<>jsonb_array_length(selected.items) THEN RETURN QUERY SELECT 'inventory_conflict',NULL::jsonb;RETURN;END IF;
  target_order:=saas.inventory_deterministic_uuid('in-store-order',p_store_id::text||':'||p_sale_id::text);
  -- ORDER_NUMBER_CREATOR_V161
  actual_order_number := saas.order_number_allocate(p_store_id,target_order,'POS',p_now);
  INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,customer_phone,customer_id,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at,paid_at)
  VALUES(target_order,p_store_id,actual_order_number,'in_store',selected.intent->>'customerName',NULL,NULL,NULL,'TRY',selected.subtotal_cents,0,selected.discount_cents,selected.total_cents,'delivered','completed',NULL,selected.created_at,p_now,selected.payment_received_at)
  RETURNING orders.order_number INTO actual_order_number;
  FOR line IN SELECT value FROM jsonb_array_elements(selected.items) LOOP
   target_item:=saas.inventory_deterministic_uuid('in-store-order-item',p_sale_id::text||':'||(line->>'variantId'));
   INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,variant_name,sku,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
   VALUES(target_item,p_store_id,target_order,(line->>'productId')::uuid,(line->>'variantId')::uuid,position,line->>'productName',line->>'variantName',line->>'sku',(line->>'unitPriceCents')::bigint,(line->>'quantity')::integer,0,(line->>'lineSubtotalCents')::bigint,p_now);
   INSERT INTO saas.in_store_discount_allocations VALUES(p_store_id,p_sale_id,(line->>'variantId')::uuid,target_item,(line->>'quantity')::integer,(line->>'lineSubtotalCents')::bigint,(line->>'allocatedDiscountCents')::bigint,(line->>'lineNetCents')::bigint,(line->>'allocatedDiscountCents')::bigint/(line->>'quantity')::integer,((line->>'allocatedDiscountCents')::bigint%(line->>'quantity')::integer)::integer);
   position:=position+1;
  END LOOP;
  UPDATE saas.in_store_inventory_reservations SET status='consumed',consumed_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  PERFORM set_config('saas.inventory.source_marker','inventory_managed',true);
  FOR variant IN SELECT r.* FROM saas.in_store_inventory_reservations r WHERE r.sale_id=p_sale_id AND r.stock_tracked AND r.status='consumed' ORDER BY r.variant_id LOOP
   UPDATE saas.inventory_balances SET quantity=quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND location_id=variant.location_id AND variant_id=variant.variant_id;
   INSERT INTO saas.inventory_movements(id,store_id,location_id,variant_id,movement_kind,direction,quantity_delta,source_kind,source_id,occurred_at,created_at)
   VALUES(saas.inventory_deterministic_uuid('in-store-inventory',p_sale_id::text||':'||variant.variant_id::text),p_store_id,variant.location_id,variant.variant_id,'in_store_sale','out',-variant.quantity,'in_store_sale',p_sale_id,p_now,p_now);
   UPDATE saas.product_variants SET stock_quantity=stock_quantity-variant.quantity,version=version+1,updated_at=p_now WHERE store_id=p_store_id AND id=variant.variant_id;
  END LOOP;
  INSERT INTO saas.order_events(id,store_id,order_id,actor_membership_id,event_type,message,payload,created_at) VALUES(saas.inventory_deterministic_uuid('in-store-order-event',p_sale_id::text),p_store_id,target_order,p_membership_id,'order_created','Mağaza satışı tamamlandı',jsonb_build_object('source','in_store','saleId',p_sale_id,'paymentMethod',selected.payment_method),p_now);
  UPDATE saas.in_store_sales SET status='completed',completed_at=p_now,order_id=target_order,order_number=actual_order_number WHERE id=p_sale_id;
 ELSIF p_kind='cancel' THEN
  IF selected.status NOT IN('draft','held','payment_pending') OR p_args<>jsonb_build_object('confirmUnpaid',true) OR EXISTS(SELECT 1 FROM saas.in_store_payment_attestations WHERE sale_id=p_sale_id) THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_inventory_reservations SET status='released',released_at=p_now,updated_at=p_now,version=version+1 WHERE sale_id=p_sale_id AND status='held';
  UPDATE saas.in_store_sales SET status='draft' WHERE id=p_sale_id;
 ELSIF p_kind='takeover' THEN
  IF selected.status='completed' OR (SELECT count(*) FROM jsonb_object_keys(p_args))<>0 THEN RETURN QUERY SELECT 'invalid_transition',NULL::jsonb;RETURN;END IF;
  UPDATE saas.in_store_sales SET owner_membership_id=p_membership_id WHERE id=p_sale_id;
 END IF;
 IF p_kind<>'create' THEN UPDATE saas.in_store_sales SET version=version+1,updated_at=p_now WHERE id=p_sale_id;END IF;
 projected:=jsonb_build_object('sale',saas.in_store_sales_projection_v2(p_store_id,p_sale_id),'replayed',false,'priceChanged',changed);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,p_sale_id,p_kind,p_fingerprint,projected,p_now);
 INSERT INTO saas.in_store_sale_events VALUES(saas.inventory_deterministic_uuid('in-store-event',p_operation_id::text),p_store_id,p_sale_id,p_membership_id,p_kind,jsonb_build_object('version',projected->'sale'->'version','operationId',p_operation_id),p_now);
 RETURN QUERY SELECT 'committed',projected;
END $function$;


CREATE FUNCTION saas.in_store_sales_create_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_intent jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,NULL::bigint,'create',jsonb_build_object('intent',p_intent))
$fn$;

CREATE FUNCTION saas.in_store_sales_update_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_intent jsonb) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'update',jsonb_build_object('intent',p_intent))
$fn$;

CREATE FUNCTION saas.in_store_sales_hold_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_held boolean) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'hold',jsonb_build_object('held',p_held))
$fn$;

CREATE FUNCTION saas.in_store_sales_prepare_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_expected_total bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'prepare',jsonb_build_object('expectedTotalCents',p_expected_total))
$fn$;

CREATE FUNCTION saas.in_store_sales_confirm_payment_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_slip_reference text,p_payment_method text) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'confirm_payment',jsonb_build_object('slipReference',p_slip_reference,'paymentMethod',p_payment_method))
$fn$;

CREATE FUNCTION saas.in_store_sales_complete_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'complete','{}'::jsonb)
$fn$;

CREATE FUNCTION saas.in_store_sales_cancel_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint,p_confirm_unpaid boolean) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'cancel',jsonb_build_object('confirmUnpaid',p_confirm_unpaid))
$fn$;

CREATE FUNCTION saas.in_store_sales_takeover_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_sale_id uuid,p_expected_version bigint) RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT * FROM saas.in_store_sales_mutate_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_operation_id,p_fingerprint,p_sale_id,p_expected_version,'takeover','{}'::jsonb)
$fn$;

CREATE FUNCTION saas.in_store_sales_get_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_sale_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;selected saas.in_store_sales%ROWTYPE;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO selected FROM saas.in_store_sales WHERE store_id=p_store_id AND id=p_sale_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'not_found',NULL::jsonb;RETURN;END IF;
 IF selected.owner_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',saas.in_store_sales_projection_v2(p_store_id,p_sale_id);
END $fn$;

CREATE FUNCTION saas.in_store_sales_get_operation_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_expected_fingerprint text DEFAULT NULL)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;projected jsonb;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND OR prior.store_id<>p_store_id THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.actor_membership_id<>p_membership_id AND NOT saas.in_store_is_manager(p_store_id,p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 IF p_expected_fingerprint IS NOT NULL AND p_expected_fingerprint<>prior.payload_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 IF prior.sale_id IS NULL THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF NOT saas.in_store_is_manager(p_store_id,p_membership_id) AND NOT EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND id=prior.sale_id AND owner_membership_id=p_membership_id) THEN RETURN QUERY SELECT 'membership_denied',NULL::jsonb;RETURN;END IF;
 projected:=jsonb_set(prior.result_payload,'{sale}',saas.in_store_projection_v2_value(prior.result_payload->'sale'))||jsonb_build_object('replayed',true);
 IF projected->'sale'->>'status'='completed' AND NOT EXISTS(SELECT 1 FROM saas.orders WHERE store_id=p_store_id AND id=(projected->'sale'->>'orderId')::uuid) THEN projected:=jsonb_set(projected,'{sale,orderId}','null');END IF;
 RETURN QUERY SELECT 'found',projected;
END $fn$;

CREATE FUNCTION saas.in_store_sales_list_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_status text,p_page_size integer,p_cursor text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;manager boolean;cursor_time timestamptz;cursor_id uuid;rows jsonb;next_cursor text;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_status IS NULL OR p_status NOT IN('draft','held','pending','completed') OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 50 THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 IF p_cursor IS NOT NULL THEN
  IF length(p_cursor)>100 OR split_part(p_cursor,'|',3)<>'' THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
  BEGIN cursor_time:=split_part(p_cursor,'|',1)::timestamptz;cursor_id:=split_part(p_cursor,'|',2)::uuid;EXCEPTION WHEN OTHERS THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END;
  IF cursor_time IS NULL OR NOT isfinite(cursor_time) OR cursor_id IS NULL THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);
 SELECT coalesce(jsonb_agg(saas.in_store_sales_projection_v2(p_store_id,id) ORDER BY updated_at DESC,id DESC),'[]'::jsonb) INTO rows FROM (SELECT id,updated_at FROM saas.in_store_sales WHERE store_id=p_store_id AND (manager OR owner_membership_id=p_membership_id) AND (status=p_status OR p_status='pending' AND status IN('payment_pending','payment_received')) AND (p_cursor IS NULL OR (updated_at,id)<(cursor_time,cursor_id)) ORDER BY updated_at DESC,id DESC LIMIT p_page_size+1) s;
 IF jsonb_array_length(rows)>p_page_size THEN rows:=rows-(p_page_size);next_cursor:=(rows->(p_page_size-1)->>'updatedAt')||'|'||(rows->(p_page_size-1)->>'id');END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('sales',rows,'nextCursor',next_cursor);
END $fn$;

CREATE FUNCTION saas.in_store_sales_bootstrap_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;manager boolean;cap integer;active jsonb;held jsonb;pending jsonb;recent jsonb;locations jsonb;summary jsonb;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 manager:=saas.in_store_is_manager(p_store_id,p_membership_id);cap:=9999;
 IF NOT manager THEN SELECT discount_limit_bps INTO cap FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_membership_id AND enabled;END IF;
 SELECT saas.in_store_sales_projection_v2(p_store_id,id) INTO active FROM saas.in_store_sales WHERE store_id=p_store_id AND owner_membership_id=p_membership_id AND status='draft' ORDER BY updated_at DESC,id DESC LIMIT 1;
 SELECT listing.result_payload->'sales' INTO held FROM saas.in_store_sales_list_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'held',50,NULL) listing;
 SELECT listing.result_payload->'sales' INTO pending FROM saas.in_store_sales_list_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'pending',50,NULL) listing;
 SELECT listing.result_payload->'sales' INTO recent FROM saas.in_store_sales_list_v2(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,'completed',10,NULL) listing;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'name',l.name,'isDefault',l.is_default) ORDER BY l.is_default DESC,l.name,l.id),'[]'::jsonb) INTO locations FROM saas.inventory_locations l WHERE l.store_id=p_store_id AND l.status='active' AND (manager OR EXISTS(SELECT 1 FROM saas.in_store_staff_grants g WHERE g.store_id=p_store_id AND g.membership_id=p_membership_id AND g.enabled AND l.id=ANY(g.location_ids)));
 SELECT jsonb_build_object('completedCount',count(*) FILTER(WHERE status='completed'),'grossCents',coalesce(sum(subtotal_cents) FILTER(WHERE status='completed'),0),'discountCents',coalesce(sum(discount_cents) FILTER(WHERE status='completed'),0),'netCents',coalesce(sum(total_cents) FILTER(WHERE status='completed'),0),'pendingPaymentCount',count(*) FILTER(WHERE status IN('payment_pending','payment_received'))) INTO summary FROM saas.in_store_sales WHERE store_id=p_store_id AND (manager OR owner_membership_id=p_membership_id) AND (status IN('payment_pending','payment_received') OR completed_at>=date_trunc('day',p_now AT TIME ZONE 'Europe/Istanbul') AT TIME ZONE 'Europe/Istanbul');
 RETURN QUERY SELECT 'found',jsonb_build_object('scopeKey',p_store_id::text||':'||p_membership_id::text,'locations',locations,'permissions',jsonb_build_object('canSell',true,'canDiscount',coalesce(cap,0)>0,'discountLimitBps',coalesce(cap,0),'canResolve',manager,'canManageStaff',manager,'canEditPrice',saas.in_store_can_edit_price(p_store_id,p_membership_id)),'activeDraft',active,'heldSales',held,'pendingSales',pending,'recentSales',recent,'summary',summary);
END $fn$;

CREATE FUNCTION saas.in_store_staff_projection_v2(p_store uuid,p_member uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
 SELECT saas.in_store_staff_projection(p_store,p_member)||jsonb_build_object('canEditPrice',saas.in_store_can_edit_price(p_store,p_member))
$fn$;

CREATE FUNCTION saas.in_store_sales_list_staff_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',jsonb_build_object('staff',coalesce(jsonb_agg(saas.in_store_staff_projection_v2(p_store_id,m.id) ORDER BY m.id),'[]'::jsonb)) FROM (SELECT id FROM saas.memberships WHERE store_id=p_store_id AND status='active' ORDER BY id LIMIT 100) m;
END $fn$;

CREATE FUNCTION saas.in_store_sales_recover_staff_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF NOT FOUND THEN RETURN QUERY SELECT 'found',NULL::jsonb;RETURN;END IF;
 IF prior.store_id<>p_store_id OR prior.operation_kind<>'set_staff' OR prior.payload_fingerprint<>p_fingerprint THEN RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;RETURN;END IF;
 RETURN QUERY SELECT 'found',prior.result_payload||jsonb_build_object('canEditPrice',coalesce((prior.result_payload->>'canEditPrice')::boolean,false));
END $fn$;

CREATE FUNCTION saas.in_store_sales_set_staff_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_operation_id uuid,p_fingerprint text,p_target_member uuid,p_expected_version bigint,p_enabled boolean,p_locations uuid[],p_discount_limit integer,p_can_edit_price boolean)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE err text;prior saas.in_store_operations%ROWTYPE;current_version bigint;projected jsonb;
BEGIN
 err:=saas.in_store_authority_error(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,NULL,true);
 IF err IS NOT NULL THEN RETURN QUERY SELECT err,NULL::jsonb;RETURN;END IF;
 IF p_operation_id IS NULL OR p_fingerprint IS NULL OR p_fingerprint!~'^[a-f0-9]{64}$' OR p_target_member IS NULL OR p_expected_version IS NULL OR p_expected_version NOT BETWEEN 0 AND 9007199254740990 OR p_can_edit_price IS NULL OR p_enabled IS NULL OR p_locations IS NULL OR cardinality(p_locations)>100 OR array_position(p_locations,NULL) IS NOT NULL OR p_discount_limit IS NULL OR p_discount_limit NOT BETWEEN 0 AND 9999 OR cardinality(p_locations)<>(SELECT count(DISTINCT id) FROM unnest(p_locations) id) OR (p_enabled AND cardinality(p_locations)=0) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.in_store.operation:'||p_operation_id::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('saas.catalog.store:'||p_store_id::text,0));
 SELECT * INTO prior FROM saas.in_store_operations WHERE operation_id=p_operation_id;
 IF FOUND THEN
  IF prior.store_id=p_store_id AND prior.operation_kind='set_staff' AND prior.payload_fingerprint=p_fingerprint THEN RETURN QUERY SELECT 'operation_replayed',prior.result_payload;ELSE RETURN QUERY SELECT 'operation_mismatch',NULL::jsonb;END IF;RETURN;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM saas.memberships WHERE id=p_target_member AND store_id=p_store_id AND status='active' AND role IN('store_owner','admin','cashier')) OR EXISTS(SELECT 1 FROM unnest(p_locations) assigned(id) WHERE NOT EXISTS(SELECT 1 FROM saas.inventory_locations WHERE id=assigned.id AND store_id=p_store_id AND status='active')) THEN RETURN QUERY SELECT 'invalid_input',NULL::jsonb;RETURN;END IF;
 SELECT version INTO current_version FROM saas.in_store_staff_grants WHERE store_id=p_store_id AND membership_id=p_target_member FOR UPDATE;
 IF coalesce(current_version,0)<>p_expected_version THEN RETURN QUERY SELECT 'version_conflict',NULL::jsonb;RETURN;END IF;
 INSERT INTO saas.in_store_staff_grants VALUES(p_store_id,p_target_member,p_enabled,p_locations,p_discount_limit,1,p_now,p_can_edit_price)
 ON CONFLICT(membership_id) DO UPDATE SET can_edit_price=excluded.can_edit_price,enabled=excluded.enabled,location_ids=excluded.location_ids,discount_limit_bps=excluded.discount_limit_bps,version=saas.in_store_staff_grants.version+1,updated_at=p_now;
 projected:=saas.in_store_staff_projection_v2(p_store_id,p_target_member);
 INSERT INTO saas.in_store_operations VALUES(p_operation_id,p_store_id,p_membership_id,NULL,'set_staff',p_fingerprint,projected,p_now);
 RETURN QUERY SELECT 'committed',projected;
END $fn$;

CREATE FUNCTION saas.orders_get_with_archive_v2(p_store_id uuid,p_principal_id uuid,p_membership_id uuid,p_plan_id uuid,p_plan_code text,p_plan_version bigint,p_now timestamptz,p_order_id uuid)
RETURNS TABLE(outcome text,result_payload jsonb) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $fn$
DECLARE result record;
BEGIN
 SELECT * INTO result FROM saas.orders_get_with_archive(p_store_id,p_principal_id,p_membership_id,p_plan_id,p_plan_code,p_plan_version,p_now,p_order_id);
 IF result.outcome='found' AND result.result_payload->>'source'='in_store' THEN
  result.result_payload:=result.result_payload||jsonb_build_object('inStorePaymentMethod',(SELECT s.payment_method FROM saas.in_store_sales s WHERE s.store_id=p_store_id AND s.order_id=p_order_id));
 END IF;
 RETURN QUERY SELECT result.outcome::text,result.result_payload::jsonb;
END $fn$;
-- V1 can replay its existing operation but cannot mutate a V2 sale.
DO $legacy$
DECLARE definition text;patched text;anchor text;
BEGIN
 SELECT saved.definition INTO definition FROM saas.in_store_v2_migration_restore saved WHERE signature LIKE '%sales_mutate%';
 anchor:='  IF selected.owner_membership_id<>p_membership_id AND NOT manager THEN';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'IN_STORE_V2_LEGACY_GUARD_ANCHOR_DRIFT';END IF;
 EXECUTE replace(definition,anchor,E'  IF selected.contract_version=2 THEN RETURN QUERY SELECT ''client_upgrade_required'',NULL::jsonb;RETURN;END IF;\n'||anchor);
 SELECT saved.definition INTO definition FROM saas.in_store_v2_migration_restore saved WHERE signature LIKE '%sales_projection%';
 anchor:='''items'',s.items';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'IN_STORE_V2_LEGACY_PROJECTION_ANCHOR_DRIFT';END IF;
 EXECUTE replace(definition,anchor,$replacement$'items',(SELECT coalesce(jsonb_agg(i-'catalogUnitPriceCents'-'unitPriceOverrideCents'-'priceOverrideActorMembershipId' ORDER BY pos),'[]'::jsonb) FROM jsonb_array_elements(s.items) WITH ORDINALITY entries(i,pos))$replacement$);
 SELECT saved.definition INTO definition FROM saas.in_store_v2_migration_restore saved WHERE signature LIKE '%sales_set_staff%';
 anchor:='INSERT INTO saas.in_store_staff_grants VALUES';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'IN_STORE_V2_STAFF_ANCHOR_DRIFT';END IF;
 -- Preserve current configurable price permission when an old manager adjusts other fields.
 EXECUTE replace(definition,anchor,'INSERT INTO saas.in_store_staff_grants(store_id,membership_id,enabled,location_ids,discount_limit_bps,version,updated_at) VALUES');
 SELECT saved.definition INTO definition FROM saas.in_store_v2_migration_restore saved WHERE signature LIKE '%sales_get(%';
 anchor:=' RETURN QUERY SELECT ''found'',saas.in_store_sales_projection(p_store_id,p_sale_id);';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'IN_STORE_V2_LEGACY_GET_ANCHOR_DRIFT';END IF;
 EXECUTE replace(definition,anchor,E' IF selected.contract_version=2 AND selected.status IN(''draft'',''held'',''payment_pending'',''payment_received'') THEN RETURN QUERY SELECT ''client_upgrade_required'',NULL::jsonb;RETURN;END IF;
'||anchor);
 SELECT saved.definition INTO definition FROM saas.in_store_v2_migration_restore saved WHERE signature LIKE '%sales_list(%';
 anchor:=' manager:=saas.in_store_is_manager(p_store_id,p_membership_id);';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'IN_STORE_V2_LEGACY_LIST_ANCHOR_DRIFT';END IF;
 EXECUTE replace(definition,anchor,anchor||E'
 IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND contract_version=2 AND (manager OR owner_membership_id=p_membership_id) AND status IN(''draft'',''held'',''payment_pending'',''payment_received'') AND (status=p_status OR p_status=''pending'' AND status IN(''payment_pending'',''payment_received''))) THEN RETURN QUERY SELECT ''client_upgrade_required'',NULL::jsonb;RETURN;END IF;');
 SELECT saved.definition INTO definition FROM saas.in_store_v2_migration_restore saved WHERE signature LIKE '%sales_bootstrap(%';
 anchor:=' manager:=saas.in_store_is_manager(p_store_id,p_membership_id);cap:=9999;';
 IF (length(definition)-length(replace(definition,anchor,'')))/length(anchor)<>1 THEN RAISE EXCEPTION 'IN_STORE_V2_LEGACY_BOOTSTRAP_ANCHOR_DRIFT';END IF;
 EXECUTE replace(definition,anchor,anchor||E'
 IF EXISTS(SELECT 1 FROM saas.in_store_sales WHERE store_id=p_store_id AND contract_version=2 AND (manager OR owner_membership_id=p_membership_id) AND status IN(''draft'',''held'',''payment_pending'',''payment_received'')) THEN RETURN QUERY SELECT ''client_upgrade_required'',NULL::jsonb;RETURN;END IF;');
 UPDATE saas.in_store_v2_migration_restore SET after_hash=encode(sha256(convert_to(pg_get_functiondef(signature::regprocedure),'UTF8')),'hex');
END $legacy$;
DO $grants$
DECLARE entry record;
BEGIN
 FOR entry IN SELECT p.oid::regprocedure::text signature,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND (p.proname LIKE 'in_store%v2' OR p.proname IN('in_store_can_edit_price','in_store_payment_method_guard','in_store_projection_v2_value','orders_get_with_archive_v2')) LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,celebix_saas_app,celebix_saas_identity,celebix_saas_workflow,celebix_saas_host_resolver,celebix_saas_bootstrap,celebix_saas_observability,celebix_saas_migrator',entry.signature);
  IF entry.proname LIKE 'in_store_sales_%_v2' AND entry.proname NOT IN('in_store_sales_mutate_v2','in_store_sales_projection_v2') OR entry.proname='orders_get_with_archive_v2' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO celebix_saas_app',entry.signature);END IF;
 END LOOP;
END $grants$;
CREATE TRIGGER in_store_v2_restore_immutable BEFORE UPDATE OR DELETE ON saas.in_store_v2_migration_restore FOR EACH ROW EXECUTE FUNCTION saas.in_store_immutable();
COMMIT;
