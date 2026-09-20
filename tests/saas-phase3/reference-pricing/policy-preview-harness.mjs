import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DB, NOW, STORE, USD, SET_1, USD_VARIANT, command, start, stop, psql,
  scalar, sqlString, jsonb, operation, define, saveSet, preview, activate,
  migrationsThrough128, apply, seed, call,
} from "./postgres-harness.mjs";

const policy = { method: "usd", referenceId: USD, sourceAmount: "125", upliftPercent: "10", laborMode: "per_item_try", laborAmount: "5" };
function candidate(box, variant, selected, options) {
  return call(box, "pricing_variant_policy_preview", `${sqlString(variant)}::uuid,${jsonb(selected)},'storefront'`, options);
}
function save(box, variant, expectedVariant, expectedPolicy, selected, digest, op, options) {
  return call(box, "pricing_variant_policy_save_v2", `${sqlString(op)}::uuid,'${"a".repeat(64)}',
    ${sqlString(variant)}::uuid,${expectedVariant},${expectedPolicy},${jsonb(selected)},${digest === null ? "NULL::text" : sqlString(digest)}`, options);
}
function main() {
  let box; let passed = 0;
  const scenario = (name, fn) => { fn(); process.stdout.write(`PASS ${++passed} ${name}\n`); };
  try {
    box = start();
    command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
    for (const file of migrationsThrough128()) apply(box, file);
    apply(box, "202609200130_reference_pricing.up.sql");
    apply(box, "202609200133_reference_pricing_policy_preview.up.sql");
    apply(box, "202609200133_reference_pricing_policy_preview_assertions.sql");
    scenario("history-free rollback restores legacy calculation and permissions before safe reapply", () => {
      apply(box,"202609200133_reference_pricing_policy_preview.down.sql");
      apply(box,"202609200133_reference_pricing_policy_preview.up.sql");
      apply(box,"202609200133_reference_pricing_policy_preview_assertions.sql");
    });
    seed(box);
    assert.equal(define(box,USD,"usd","USD satış",null,operation(1331)).outcome,"defined");
    scenario("unconfigured dynamic policy has no sale price and cannot be saved", () => {
      const projected = candidate(box,USD_VARIANT,policy);
      assert.equal(projected.outcome,"previewed",JSON.stringify(projected));
      assert.equal(projected.result.oldPriceCents,10000);
      assert.equal(projected.result.newPriceCents,null);
      assert.equal(save(box,USD_VARIANT,1,0,policy,projected.result.scopeDigest,operation(1330)).outcome,"unavailable");
    });
    scenario("only merchant role can read authorized tenant preview", () => {
      const denied = candidate(box,USD_VARIANT,policy,{ store:"10000000-0000-4000-8000-000000000131", membership:"30000000-0000-4000-8000-000000000132" });
      assert.notEqual(denied.outcome,"previewed");
      const raw = psql(box,`SET ROLE celebix_saas_app; SELECT * FROM saas.pricing_calculate_policy_candidate('${STORE}','${USD_VARIANT}',${jsonb(policy)},NULL::uuid);`,true);
      assert.notEqual(raw.status,0);
      const bypass = psql(box,`SET ROLE celebix_saas_app; SELECT * FROM saas.pricing_variant_policy_save('${STORE}'::uuid,NULL::uuid,NULL::uuid,NULL::uuid,'free_starter',1,'${NOW}'::timestamptz,NULL::uuid,NULL::text,'${USD_VARIANT}'::uuid,1,0,${jsonb(policy)});`,true);
      assert.notEqual(bypass.status,0);
    });
    assert.equal(saveSet(box,SET_1,0,[{referenceId:USD,rateTry:"40",active:true}],operation(1332)).outcome,"saved");
    assert.equal(activate(box,SET_1,0,preview(box,SET_1).result.scopeDigest,operation(1333)).outcome,"activated");
    const projected=candidate(box,USD_VARIANT,policy);
    scenario("manual USD policy calculation explains old/new price, rate and components", () => {
      assert.equal(projected.outcome,"previewed",JSON.stringify(projected));
      assert.equal(projected.result.oldPriceCents,10000);
      assert.equal(projected.result.newPriceCents,550500);
      assert.equal(projected.result.referenceRateTry,"40.00000000");
      assert.equal(projected.result.metalComponentTry,"5000.00000000");
      assert.equal(projected.result.laborTry,"5.00000000");
      assert.equal(projected.result.activeSetVersion,1);
      assert.equal(projected.result.policyVersion,0);
      assert.equal(projected.result.variantVersion,1);
      assert.match(projected.result.scopeDigest,/^[a-f0-9]{64}$/);
    });
    scenario("invalid, stale and replayed preview digests are not silently accepted", () => {
      assert.equal(save(box,USD_VARIANT,1,0,policy,"b".repeat(64),operation(1334)).outcome,"scope_conflict");
      assert.equal(save(box,USD_VARIANT,1,0,policy,null,operation(1340)).outcome,"invalid_input");
      const accepted=save(box,USD_VARIANT,1,0,policy,projected.result.scopeDigest,operation(1335));
      assert.equal(accepted.outcome,"policy_saved",JSON.stringify(accepted));
      assert.equal(accepted.result.version,1);
      assert.equal(save(box,USD_VARIANT,1,0,policy,projected.result.scopeDigest,operation(1335)).outcome,"operation_replayed");
      assert.equal(save(box,USD_VARIANT,1,0,policy,projected.result.scopeDigest,operation(1336)).outcome,"version_conflict");
      assert.equal(scalar(box,`SELECT price_cents FROM saas.resolve_effective_variant_price('${STORE}','${USD_VARIANT}','storefront','${NOW}',NULL);`),"550500");
    });
    scenario("same cents under another active set version changes the save scope", () => {
      const next="41000000-0000-4000-8000-000000000133";
      const before=candidate(box,USD_VARIANT,policy).result.scopeDigest;
      assert.equal(saveSet(box,next,1,[{referenceId:USD,rateTry:"40",active:true}],operation(1337)).outcome,"saved");
      assert.equal(activate(box,next,1,preview(box,next).result.scopeDigest,operation(1338)).outcome,"activated");
      const after=candidate(box,USD_VARIANT,policy).result.scopeDigest;
      assert.notEqual(after,before);
      assert.equal(save(box,USD_VARIANT,2,1,policy,before,operation(1339)).outcome,"scope_conflict");
    });
    scenario("fixed TL and an active price-list override show their effective before/after amounts", () => {
      const fixed={method:"fixed_try",fixedPriceCents:34567};
      const immediate=candidate(box,USD_VARIANT,fixed);
      assert.equal(immediate.result.oldPriceCents,550500);
      assert.equal(immediate.result.newPriceCents,34567);
      assert.equal(immediate.result.referenceId,null);
      assert.equal(immediate.result.activeSetVersion,null);
      assert.equal(save(box,USD_VARIANT,2,1,fixed,immediate.result.scopeDigest,operation(1341)).outcome,"policy_saved");
      psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;
        INSERT INTO saas.price_lists(id,store_id,name,status,version,activated_at,created_at,updated_at)
        VALUES('60000000-0000-4000-8000-000000000133','${STORE}','Override','active',1,'2026-01-01','2026-01-01','2026-01-01');
        INSERT INTO saas.price_list_items(store_id,price_list_id,variant_id,price_cents,created_at)
        VALUES('${STORE}','60000000-0000-4000-8000-000000000133','${USD_VARIANT}',99999,'2026-01-01');
        INSERT INTO saas.price_list_rules(id,store_id,price_list_id,channel,starts_at,priority,created_at)
        VALUES('61000000-0000-4000-8000-000000000133','${STORE}','60000000-0000-4000-8000-000000000133','storefront','2026-01-01',50,'2026-01-01');
        COMMIT;`);
      const overridden=candidate(box,USD_VARIANT,policy);
      assert.equal(overridden.result.sourceKind,"price_list");
      assert.equal(overridden.result.priceListId,"60000000-0000-4000-8000-000000000133");
      assert.equal(overridden.result.oldPriceCents,99999);
      assert.equal(overridden.result.newPriceCents,99999);
      assert.equal(overridden.result.metalComponentTry,"5000.00000000");
    });
    scenario("independent EUR and gold gram methods use the shared server-side formula", () => {
      const eur="40000000-0000-4000-8000-000000000131";
      const gold="40000000-0000-4000-8000-000000000132";
      const next="41000000-0000-4000-8000-000000000134";
      const eurVariant="51000000-0000-4000-8000-000000000132";
      const goldVariant="51000000-0000-4000-8000-000000000133";
      assert.equal(define(box,eur,"eur","EUR satış",null,operation(1342)).outcome,"defined");
      assert.equal(define(box,gold,"gold_gram","22 ayar gram satış","0.916667",operation(1343)).outcome,"defined");
      assert.equal(saveSet(box,next,2,[{referenceId:USD,rateTry:"40",active:true},
        {referenceId:eur,rateTry:"45",active:true},{referenceId:gold,rateTry:"5000",active:true}],operation(1344)).outcome,"saved");
      assert.equal(activate(box,next,2,preview(box,next).result.scopeDigest,operation(1345)).outcome,"activated");
      const eurPolicy={method:"eur",sourceAmount:"100",referenceId:eur};
      const eurCandidate=candidate(box,eurVariant,eurPolicy).result;
      assert.equal(eurCandidate.newPriceCents,450000);
      assert.equal(save(box,eurVariant,1,0,eurPolicy,eurCandidate.scopeDigest,operation(1346)).outcome,"policy_saved");
      const goldPolicy={method:"gold_gram",metalGrams:"2.500000",referenceId:gold,
        purityMode:"direct",laborMode:"per_item_try",laborAmount:"750",upliftPercent:"0"};
      const goldCandidate=candidate(box,goldVariant,goldPolicy).result;
      assert.equal(goldCandidate.newPriceCents,1325000);
      assert.equal(goldCandidate.metalComponentTry,"12500.00000000");
      assert.equal(save(box,goldVariant,1,0,goldPolicy,goldCandidate.scopeDigest,operation(1347)).outcome,"policy_saved");
      const ratio={...goldPolicy,purityMode:"ratio",productPurity:"0.750000",laborMode:"per_gram_try",laborAmount:"100"};
      const projected=candidate(box,goldVariant,ratio).result;
      assert.equal(projected.laborTry,"250.00000000");
      assert.equal(projected.newPriceCents,1047727);
      assert.equal(save(box,goldVariant,2,1,ratio,projected.scopeDigest,operation(1348)).outcome,"policy_saved");
      assert.equal(scalar(box,`SELECT price_cents FROM saas.pricing_calculate_variant_price('${STORE}','${goldVariant}',NULL::uuid);`),"1047727");
    });
    scenario("read-only preview cannot create versions, operations or orders", () => {
      const before=scalar(box,`SELECT count(*) FROM saas.pricing_reference_operations`);
      const read=psql(box,`BEGIN READ ONLY;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.pricing_variant_policy_preview('10000000-0000-4000-8000-000000000130','20000000-0000-4000-8000-000000000130','30000000-0000-4000-8000-000000000130','00000000-0000-4000-8000-000000000001','free_starter',1,'${NOW}','${USD_VARIANT}',${jsonb(policy)},'storefront');COMMIT;`,true);
      assert.equal(read.status,0,read.stderr);
      assert.equal(scalar(box,`SELECT count(*) FROM saas.pricing_reference_operations`),before);
    });
    scenario("rollback refuses to remove new guard with merchant history", () => {
      const denied=psql(box,readFileSync("apps/owner/scripts/sql/saas/202609200133_reference_pricing_policy_preview.down.sql","utf8"),true);
      assert.notEqual(denied.status,0);
      assert.match(denied.stderr,/REFERENCE_POLICY_PREVIEW_ROLLBACK_REQUIRES_EMPTY_HISTORY/);
    });
  } finally { stop(box); }
}
main();
