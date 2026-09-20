import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DB,NOW,STORE,USD,USD_VARIANT,command,start,stop,psql,scalar,jsonb,
  operation,define,policySave,migrationsThrough128,apply,seed,
} from "./postgres-harness.mjs";

const draft="76000000-0000-4000-8000-000000000134";
const manual="77000000-0000-4000-8000-000000000134";
const PRODUCT="50000000-0000-4000-8000-000000000130";
const FIXED="51000000-0000-4000-8000-000000000130";
const address={recipientName:"Fixture User",line1:"Fixture Street 1",city:"Istanbul",country:"TR"};
const intent=(variant,id)=>({lines:[{lineId:id,productId:PRODUCT,variantId:variant,quantity:1,discountCents:0}]});
function replace(box,variant,id) {
  return JSON.parse(scalar(box,`SELECT pg_catalog.to_jsonb(result)
    FROM saas.order_drafts_replace_lines('${STORE}','${draft}',${jsonb(intent(variant,id))},'${NOW}') result;`));
}

let box;
try {
  box=start();
  command(box.tools.psql,["-h",box.socket,"-p",String(box.port),"-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],`CREATE DATABASE ${DB};`);
  for (const file of migrationsThrough128()) apply(box,file);
  apply(box,"202609200130_reference_pricing.up.sql");
  apply(box,"202609200134_reference_pricing_manual_order_guards.up.sql");
  seed(box);
  psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.order_drafts(id,store_id,draft_number,customer_name,customer_email,currency,
      subtotal_cents,shipping_cents,discount_cents,total_cents,shipping_address,billing_address,
      adjust_inventory,created_at,updated_at)
    VALUES('${draft}','${STORE}','MAN-PRICING-TEST','Fixture User','fixture@test.invalid','TRY',
      0,0,0,0,${jsonb(address)},${jsonb(address)},false,'${NOW}','${NOW}');
    COMMIT;`);
  const oldLine="78000000-0000-4000-8000-000000000134";
  assert.equal(replace(box,USD_VARIANT,oldLine).outcome,"saved");
  process.stdout.write("PASS legacy fixed draft can be saved without repricing\n");
  assert.equal(define(box,USD,"usd","USD satış",null,operation(134)).outcome,"defined");
  assert.equal(policySave(box,USD_VARIANT,1,0,{method:"usd",sourceAmount:"250",referenceId:USD},operation(135)).outcome,"policy_saved");
  assert.equal(replace(box,USD_VARIANT,"79000000-0000-4000-8000-000000000134").outcome,"catalog_conflict");
  assert.equal(scalar(box,`SELECT id FROM saas.order_draft_lines WHERE draft_id='${draft}'`),oldLine);
  process.stdout.write("PASS new dynamic draft is rejected without altering a previous snapshot\n");
  psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,
      subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at)
    VALUES('${manual}','${STORE}','MAN-PRICING-CONVERT','manual','Fixture User','fixture@test.invalid','TRY',
      10000,0,0,10000,'pending','pending',${jsonb(address)},'${NOW}','${NOW}');COMMIT;`);
  const attempted=psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,
      unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
    VALUES('80000000-0000-4000-8000-000000000134','${STORE}','${manual}','${PRODUCT}',
      '${USD_VARIANT}',0,'USD',10000,1,0,10000,'${NOW}');COMMIT;`,true);
  assert.notEqual(attempted.status,0);
  assert.match(attempted.stderr,/REFERENCE_PRICING_MANUAL_ORDER_REQUIRES_RECONFIRMATION/);
  assert.equal(scalar(box,`SELECT pg_catalog.count(*) FROM saas.order_items WHERE order_id='${manual}'`),"0");
  process.stdout.write("PASS pre-existing draft cannot convert stale dynamic cents into a manual order\n");
  assert.equal(replace(box,FIXED,"81000000-0000-4000-8000-000000000134").outcome,"saved");
  process.stdout.write("PASS fixed-TRY manual draft remains available\n");
  const rollback=psql(box,readFileSync("apps/owner/scripts/sql/saas/202609200134_reference_pricing_manual_order_guards.down.sql","utf8"),true);
  assert.notEqual(rollback.status,0);
  assert.match(rollback.stderr,/REFERENCE_PRICING_MANUAL_ROLLBACK_REQUIRES_NO_DYNAMIC_POLICIES/);
  process.stdout.write("PASS rollback retains active dynamic-policy guard\n");
} finally { stop(box); }
