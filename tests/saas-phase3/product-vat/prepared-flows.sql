-- Disposable fixture: real merchant POS prepare/confirm/complete, including mixed-rate discount.
BEGIN;
SET LOCAL ROLE celebix_saas_owner;
DO $test$
DECLARE st uuid:='26800000-0000-4000-8000-000000000001';pr uuid:='26800000-0000-4000-8000-000000000002';mb uuid:='26800000-0000-4000-8000-000000000003';pl uuid:='00000000-0000-4000-8000-000000000010';pd uuid:='26800000-0000-4000-8000-000000000060';v1 uuid:='26800000-0000-4000-8000-000000000061';v2 uuid:='26800000-0000-4000-8000-000000000062';sale uuid:='26800000-0000-4000-8000-000000000063';loc uuid;r record;oid uuid;t timestamptz:=clock_timestamp();
BEGIN
 SELECT id INTO loc FROM saas.inventory_locations WHERE store_id=st AND is_default;
 INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at,tax_treatment,tax_rate_bps)VALUES(pd,st,'vat-pos','VAT POS','active','TRY',t,t,'taxable',1000);
 PERFORM set_config('saas.inventory.source_marker','catalog_adjustment',true);PERFORM set_config('saas.inventory.source_id',sale::text,true);PERFORM set_config('saas.inventory.source_time',t::text,true);
 INSERT INTO saas.product_variants(id,store_id,product_id,title,price_cents,stock_tracking,stock_quantity,status,created_at,updated_at,tax_treatment,tax_rate_bps)VALUES(v1,st,pd,'Ten',11000,true,5,'active',t,t,NULL,NULL),(v2,st,pd,'Twenty',12000,true,5,'active',t,t,'taxable',2000);
 SELECT * INTO r FROM saas.in_store_sales_create_v2(st,pr,mb,pl,'professional',2,t,gen_random_uuid(),repeat('a',64),sale,jsonb_build_object('locationId',loc,'items',jsonb_build_array(jsonb_build_object('variantId',v1,'quantity',1,'unitPriceOverrideCents',NULL),jsonb_build_object('variantId',v2,'quantity',1,'unitPriceOverrideCents',NULL)),'discount',jsonb_build_object('kind','fixed_amount','amountCents',2300),'customerName',NULL,'note',NULL,'paymentMethod','cash'));
 IF r.outcome<>'committed'THEN RAISE EXCEPTION 'VAT_POS_CREATE %',r;END IF;
 SELECT * INTO r FROM saas.in_store_sales_prepare_v2(st,pr,mb,pl,'professional',2,t,gen_random_uuid(),repeat('b',64),sale,1,20700);
 IF r.outcome<>'committed'OR r.result_payload#>>'{sale,status}'<>'payment_pending'THEN RAISE EXCEPTION 'VAT_POS_PREPARE %',r;END IF;
 IF(SELECT count(*)FROM saas.product_tax_prepared WHERE store_id=st AND source_kind='pos'AND variant_id IN(v1,v2))<>2 THEN RAISE EXCEPTION 'VAT_POS_PREPARE_NOT_CAPTURED';END IF;
 UPDATE saas.products SET tax_rate_bps=5000 WHERE id=pd;UPDATE saas.product_variants SET tax_rate_bps=5000 WHERE id=v2;
 SELECT * INTO r FROM saas.in_store_sales_confirm_payment_v2(st,pr,mb,pl,'professional',2,t,gen_random_uuid(),repeat('c',64),sale,2,NULL,NULL);
 IF r.outcome<>'committed'THEN RAISE EXCEPTION 'VAT_POS_CONFIRM %',r;END IF;
 SELECT * INTO r FROM saas.in_store_sales_complete_v2(st,pr,mb,pl,'professional',2,t,gen_random_uuid(),repeat('d',64),sale,3);
 IF r.outcome<>'committed'THEN RAISE EXCEPTION 'VAT_POS_COMPLETE %',r;END IF;
 oid:=(r.result_payload#>>'{sale,orderId}')::uuid;
 IF NOT EXISTS(SELECT 1 FROM saas.product_tax_order_revisions WHERE store_id=st AND order_id=oid AND total_gross_cents=20700 AND vat_cents=2700 AND taxable_base_cents=18000 AND unknown_gross_cents=0)THEN RAISE EXCEPTION 'VAT_POS_MIXED_DISCOUNT %',(SELECT to_jsonb(x)FROM saas.product_tax_order_revisions x WHERE store_id=st AND order_id=oid);END IF;
 IF(SELECT total_cents FROM saas.orders WHERE id=oid)<>20700 OR(SELECT sum(amount_cents)FROM saas.accounting_events WHERE store_id=st AND order_id=oid AND kind='sale')<>20700 THEN RAISE EXCEPTION 'VAT_POS_CHANGED_GROSS';END IF;
END $test$;
ROLLBACK;
