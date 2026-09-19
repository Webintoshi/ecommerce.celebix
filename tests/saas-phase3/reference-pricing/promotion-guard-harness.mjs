import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DB,NOW,STORE,command,start,stop,psql,scalar,jsonb,operation,define,policySave,
  migrationsThrough128,apply,seed,
} from "./postgres-harness.mjs";

const GOLD="40000000-0000-4000-8000-000000000132";
const GOLD_VARIANT="51000000-0000-4000-8000-000000000133";
const FIXED="51000000-0000-4000-8000-000000000130";
const PRODUCT="50000000-0000-4000-8000-000000000130";
const line=(variant,position)=>({lineId:`90000000-0000-4000-8000-${String(position).padStart(12,"0")}`,
  productId:PRODUCT,variantId:variant,unitPriceMinor:10000,unitCostMinor:1000,
  quantity:1,position});
const targets={mode:"all",include:[],exclude:[]};
const bundle={items:[{variantId:GOLD_VARIANT,quantity:1},{variantId:FIXED,quantity:1}]};
const giftRule={schemaVersion:1,benefit:{kind:"gift",giftVariantId:GOLD_VARIANT,quantity:1,autoAdd:true},
  targets,audience:{mode:"everyone"},trigger:{kind:"automatic"},schedule:{timezone:"Europe/Istanbul"},
  limits:{totalUsage:null,perCustomerUsage:null,budgetMinor:null,orderMaximumMinor:null},
  conditions:{minimumBasketMinor:0,minimumQuantity:0,minimumProductQuantity:0},
  combinationPolicy:{kind:"none"},priority:0,marginPolicy:{kind:"warn"},
  progressMessagePolicy:{enabled:false}};
const evaluationContext={storeId:STORE,customerId:null,paidOrderCount:0,customerSegmentIds:[],customerTagIds:[],
  cartLines:[{...line(FIXED,0),currency:"TRY",categoryIds:[],brandId:null,collectionIds:[]}],
  shippingMethodId:null,paymentMethodId:null,shippingBeforeDiscountMinor:0,currency:"TRY",
  storeLocalTime:NOW,salesChannel:"storefront",submittedCodes:[],abandonedCart:null};

let box;
try {
  box=start();
  command(box.tools.psql,["-h",box.socket,"-p",String(box.port),"-X","-qAt","-v","ON_ERROR_STOP=1","-U","postgres","-d","postgres"],`CREATE DATABASE ${DB};`);
  for (const file of migrationsThrough128()) apply(box,file);
  apply(box,"202609200130_reference_pricing.up.sql");
  apply(box,"202609200135_reference_pricing_promotion_guard.up.sql");
  seed(box);
  const cleanRollback=psql(box,readFileSync("apps/owner/scripts/sql/saas/202609200135_reference_pricing_promotion_guard.down.sql","utf8"),true);
  assert.equal(cleanRollback.status,0,cleanRollback.stderr);
  apply(box,"202609200135_reference_pricing_promotion_guard.up.sql");
  process.stdout.write("PASS promotion guard can roll back and reapply before policies exist\n");
  const matched=(variant)=>scalar(box,`SELECT saas.promotion_evaluator_catalog_line_matches(
    '${STORE}'::uuid,'TRY',${jsonb(targets)},${jsonb(line(variant,1))});`);
  const bundled=()=>JSON.parse(scalar(box,`SELECT pg_catalog.to_jsonb(facts)
    FROM saas.promotion_bundle_facts_v1(${jsonb(bundle)},${jsonb([line(GOLD_VARIANT,1),line(FIXED,2)])}) facts;`));
  assert.equal(matched(GOLD_VARIANT),"t");
  assert.equal(bundled().bundle_count,1);
  assert.equal(define(box,GOLD,"gold_gram","22 ayar gram satış","0.916667",operation(136)).outcome,"defined");
  const goldPolicy={method:"gold_gram",metalGrams:"2.500000",referenceId:GOLD,
    purityMode:"direct",laborMode:"per_item_try",laborAmount:"750",upliftPercent:"0",allowFullDiscount:false};
  assert.equal(policySave(box,GOLD_VARIANT,1,0,goldPolicy,operation(137)).outcome,"policy_saved");
  assert.equal(matched(GOLD_VARIANT),"f");
  assert.equal(matched(FIXED),"t");
  assert.equal(bundled().bundle_count,0);
  process.stdout.write("PASS protected gold excludes line discounts and bundles while fixed TRY remains eligible\n");
  assert.equal(scalar(box,`SELECT saas.promotion_rule_document_valid(${jsonb(giftRule)})`),"t");
  psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.promotions(id,store_id,name,status,version,rule_document,created_at,updated_at)
    VALUES('92000000-0000-4000-8000-000000000135','${STORE}','Protected gold gift','active',1,
      ${jsonb(giftRule)},'${NOW}','${NOW}');COMMIT;`);
  const evaluated=()=>JSON.parse(scalar(box,`SELECT saas.promotion_evaluate_v1(
    '${STORE}',${jsonb(evaluationContext)},'${NOW}'::timestamptz);`));
  assert.deepEqual(evaluated().gifts,[]);
  process.stdout.write("PASS protected gold cannot be auto-added as a free promotion gift\n");
  assert.equal(policySave(box,GOLD_VARIANT,2,1,{...goldPolicy,allowFullDiscount:true},operation(138)).outcome,"policy_saved");
  assert.equal(matched(GOLD_VARIANT),"t");
  assert.equal(bundled().bundle_count,1);
  assert.equal(evaluated().gifts.length,1);
  process.stdout.write("PASS explicit merchant full-discount opt-in restores gold eligibility\n");
  assert.equal(scalar(box,`SELECT pg_catalog.has_function_privilege('celebix_saas_app',
    'saas.pricing_variant_discount_allowed(uuid,uuid)','EXECUTE')`),"f");
  process.stdout.write("PASS tenant-bound policy reader is private to trusted evaluator\n");
  const rollback=psql(box,readFileSync("apps/owner/scripts/sql/saas/202609200135_reference_pricing_promotion_guard.down.sql","utf8"),true);
  assert.notEqual(rollback.status,0);
  assert.match(rollback.stderr,/REFERENCE_PRICING_PROMOTION_ROLLBACK_REQUIRES_NO_GOLD_POLICIES/);
  process.stdout.write("PASS rollback cannot restore unguarded gold promotions with live policies\n");
} finally { stop(box); }
