import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DB, NOW, STORE, USD, SET_1, USD_VARIANT, command, start, stop, psql,
  scalar, sqlString, jsonb, operation, define, saveSet, preview, activate,
  policySave, migrationsThrough128, apply, seed,
} from "./postgres-harness.mjs";

const CART = "62000000-0000-4000-8000-000000000132";
const CART_KEY = "pricing-cart-v3";
const CART_DIGEST = "a".repeat(64);
const CANDIDATES = [{ keyId: CART_KEY, digest: CART_DIGEST }];
const SET_2 = "41000000-0000-4000-8000-000000000132";
const HOST = "pricing-a.saas-staging.celebix.site";
const HOSTED_METHOD = "66000000-0000-4000-8000-000000000132";
const HOSTED_CART="6c000000-0000-4000-8000-000000000132";
const HOSTED_CANDIDATES=[{keyId:"hosted-cart-v3",digest:"e".repeat(64)}];
const HOSTED_OPERATION="6d000000-0000-4000-8000-000000000132";
const HOSTED_ORDER="6e000000-0000-4000-8000-000000000132";
const ATTRIBUTION = { firstTouch: { source: "unknown", medium: "unknown" }, lastTouch: { source: "unknown", medium: "unknown" }, landingPathGroup: "/unknown", deviceGroup: "unknown" };
const DELIVERY = {contact:{firstName:"Ada",lastName:"Lovelace",email:"reference-pricing@example.test",phone:"+905551112233"},shippingAddress:{line1:"Fixture Caddesi 1",city:"Istanbul",country:"TR"}};
const HOSTED_DELIVERY = {contact:{...DELIVERY.contact,email:"hosted-pricing@example.test",phone:"+905551112234"},shippingAddress:DELIVERY.shippingAddress};

function context(box, candidates = CANDIDATES) {
  const result = psql(box, `SELECT pg_catalog.to_jsonb(selected) FROM saas.pricing_checkout_source_context('${STORE}'::uuid,'cart',${jsonb(candidates)},'${NOW}'::timestamptz) selected;`, true);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim() ? JSON.parse(result.stdout.trim().split("\n").at(-1)) : null;
}

function quote(box,candidates=CANDIDATES) {
  const result = psql(box, `BEGIN TRANSACTION READ ONLY; SET LOCAL ROLE celebix_saas_host_resolver;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.public_checkout_quote_v3('${HOST}','${NOW}'::timestamptz,'cart',
      ${jsonb(candidates)},'[]'::jsonb,ARRAY[]::text[],${jsonb(ATTRIBUTION)});
    COMMIT;`, true);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout.trim().split("\n").find((line) => line.startsWith("{")));
}

function complete(box, expectedDigest) {
  const next = (tail) => `67000000-0000-4000-8000-${String(tail).padStart(12,"0")}`;
  const sql = `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.public_checkout_complete_v3('${HOST}','${NOW}'::timestamptz,'cart',
      ${jsonb(CANDIDATES)},'[]'::jsonb,'${next(1)}'::uuid,'${"a".repeat(64)}',1,
      ${jsonb(DELIVERY)},'cash_on_delivery',
      '${next(2)}'::uuid,'${next(3)}'::uuid,'${next(4)}'::uuid,'${next(5)}'::uuid,
      '${next(6)}'::uuid,'receipt-key','${"b".repeat(64)}','2026-09-21'::timestamptz,
      '${next(7)}'::uuid,'customer-key','${"c".repeat(64)}','2026-10-01'::timestamptz,
      ARRAY[]::text[],'${expectedDigest}'); COMMIT;`;
  const result = psql(box,sql,true);
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout.trim().split("\n").find((line)=>line.startsWith("{")));
}

function hostedAuthority(box,candidates=CANDIDATES,orderId="68000000-0000-4000-8000-000000000132",operationId="6a000000-0000-4000-8000-000000000132") {
  const result=psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.public_storefront_hosted_checkout_authority_v3('${HOST}','${NOW}'::timestamptz,'cart',
      ${jsonb(candidates)},1,${jsonb(HOSTED_DELIVERY)},'${HOSTED_METHOD}'::uuid,
      '[]'::jsonb,'[]'::jsonb,'${orderId}'::uuid,
      '69000000-0000-4000-8000-000000000132'::uuid,
      '${operationId}'::uuid);COMMIT;`,true);
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout.trim().split("\n").find((line)=>line.startsWith("{")));
}

function hostedBegin(box,authority,quoteDigest) {
  const invocation=`BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;
    SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
    FROM saas.public_storefront_hosted_checkout_begin_v3('${HOST}','${NOW}'::timestamptz,'cart',
      ${jsonb(HOSTED_CANDIDATES)},1,${jsonb(HOSTED_DELIVERY)},'${HOSTED_METHOD}'::uuid,
      '${authority.authorityDigest}','${HOSTED_OPERATION}'::uuid,'${"d".repeat(64)}',
      '6f000000-0000-4000-8000-000000000132'::uuid,'${"a".repeat(64)}',
      '${HOSTED_ORDER}'::uuid,'${authority.customerId}'::uuid,
      '6f000000-0000-4000-8000-000000000133'::uuid,'6f000000-0000-4000-8000-000000000134'::uuid,
      '6f000000-0000-4000-8000-000000000135'::uuid,'6f000000-0000-4000-8000-000000000136'::uuid,
      'payment-session-v3','${"1".repeat(64)}','receipt-v3','${"2".repeat(64)}',
      'customer-v3','${"3".repeat(64)}','[]'::jsonb,'[]'::jsonb,
      '${authority.evaluatorAuthorityDigest}','${quoteDigest}');COMMIT;`;
  const result=psql(box,invocation,true);
  assert.equal(result.status,0,result.stderr);
  return JSON.parse(result.stdout.trim().split("\n").find((line)=>line.startsWith("{")));
}

function main() {
  let box;
  try {
    box = start();
    command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
    for (const file of migrationsThrough128()) apply(box, file);
    apply(box, "202609200130_reference_pricing.up.sql");
    apply(box, "202609200132_reference_pricing_checkout.up.sql");
    apply(box, "202609200132_reference_pricing_checkout_assertions.sql");
    seed(box);
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
      VALUES('${CART}','${STORE}','active',1,'2026-10-20','${NOW}','${NOW}');
      INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
      VALUES('${CART}','${STORE}','${CART_KEY}','${CART_DIGEST}','2026-10-20');
      INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)
      SELECT '${CART}','${STORE}',variant.product_id,variant.id,2,variant.price_cents,0,'${NOW}','${NOW}'
      FROM saas.product_variants variant WHERE variant.store_id='${STORE}' AND variant.id='${USD_VARIANT}';
      INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)
      VALUES('63000000-0000-4000-8000-000000000132','${STORE}','${HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
      INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,emergency_reason,position,config,version,created_at,updated_at)
      VALUES('64000000-0000-4000-8000-000000000132','${STORE}','cash_on_delivery',NULL,NULL,'Kapıda ödeme','active',NULL,1,'{"instructions":"Teslimatta ödeyin."}'::jsonb,1,'2026-01-01','2026-01-01');
      INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,created_at,updated_at)
      VALUES('65000000-0000-4000-8000-000000000132','${STORE}','shipping_setting','Standart kargo',
        '{"regions":["TR"],"estimatedDays":3,"shippingPriceCents":40}'::jsonb,'active',1,'2026-01-01','2026-01-01');
      INSERT INTO saas.merchant_provider_execution_authorities(provider_code,capability,environment,adapter_version,evidence_digest,readiness,enabled,approved_at)
      VALUES('paytr_iframe','payment_processing','test',1,'sha256:${"8".repeat(64)}','sandbox_ready',true,'${NOW}')
      ON CONFLICT(provider_code,environment) DO UPDATE SET capability=EXCLUDED.capability,
        adapter_version=EXCLUDED.adapter_version,evidence_digest=EXCLUDED.evidence_digest,
        readiness=EXCLUDED.readiness,enabled=true,approved_at=EXCLUDED.approved_at;
      INSERT INTO saas.merchant_provider_profiles(id,store_id,provider_code,capability,public_config,masked_account_reference,
        sealed_credentials,credential_digest,credential_key_id,credential_schema_version,credential_version,status,
        version,last_validated_at,created_at,updated_at,execution_environment,execution_adapter_version,
        execution_evidence_digest,validation_environment,validation_adapter_version)
      VALUES('6b000000-0000-4000-8000-000000000132','${STORE}','paytr_iframe','payment_processing',
        '{"environment":"test"}','fixture-***',
        '{"algorithm":"A256GCM","ciphertext":"AA","iv":"AAAAAAAAAAAAAAAA","keyId":"fixture-profile","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}'::jsonb,
        '${"7".repeat(64)}','fixture-profile',1,1,'active',1,'${NOW}','${NOW}','${NOW}',
        'test',1,'sha256:${"8".repeat(64)}','test',1);
      INSERT INTO saas.payment_methods(id,store_id,kind,profile_id,provider_code,label,state,position,config,version,created_at,updated_at)
      VALUES('${HOSTED_METHOD}','${STORE}','provider','6b000000-0000-4000-8000-000000000132','paytr_iframe',
        'Fixture card','active',2,
        '{"environment":"test","locale":"tr","threeDSecure":"provider_managed","installmentMode":"all","maxInstallment":0}',
        1,'${NOW}','${NOW}');
      COMMIT;`);
    const fixed = context(box);
    assert.equal(fixed.requires_quote_confirmation, false);
    assert.match(fixed.digest, /^[a-f0-9]{64}$/);
    process.stdout.write("PASS fixed TRY cart has an opaque source digest\n");
    const fixedQuote = quote(box);
    assert.equal(fixedQuote.outcome, "quoted", JSON.stringify(fixedQuote));
    assert.match(fixedQuote.result.quoteDigest, /^[a-f0-9]{64}$/);
    assert.notEqual(fixedQuote.result.quoteDigest, fixed.digest);
    assert.equal(Object.hasOwn(fixedQuote.result.quote, "authorityDigest"), false);
    process.stdout.write("PASS read-only public quote V3 seals public totals and private lineage without merchant trace\n");
    const hostedFixed=hostedAuthority(box);
    assert.equal(hostedFixed.outcome,"found",JSON.stringify(hostedFixed));
    assert.equal(hostedFixed.result.pricingDigest,fixedQuote.result.quoteDigest);
    process.stdout.write("PASS hosted authority uses the identical customer-visible quote seal\n");

    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      UPDATE saas.merchant_admin_records SET config=jsonb_set(config,'{shippingPriceCents}','50'::jsonb)
      WHERE store_id='${STORE}' AND record_kind='shipping_setting';COMMIT;`);
    assert.equal(context(box).digest,fixed.digest,"shipping changes must not mutate the price-source lineage");
    const changedShipping=quote(box);
    assert.equal(changedShipping.outcome,"quoted",JSON.stringify(changedShipping));
    assert.notEqual(changedShipping.result.quoteDigest,fixedQuote.result.quoteDigest);
    assert.equal(hostedAuthority(box).result.pricingDigest,changedShipping.result.quoteDigest);
    assert.equal(complete(box,fixedQuote.result.quoteDigest).outcome,"price_changed");
    assert.equal(scalar(box, `SELECT pg_catalog.count(*) FROM saas.storefront_checkout_operations WHERE store_id='${STORE}'`),"0");
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      UPDATE saas.merchant_admin_records SET config=jsonb_set(config,'{shippingPriceCents}','40'::jsonb)
      WHERE store_id='${STORE}' AND record_kind='shipping_setting';COMMIT;`);
    process.stdout.write("PASS same-price shipping drift requires new confirmation without an order\n");

    assert.equal(define(box, USD, "usd", "USD satış", null, operation(101)).outcome, "defined");
    assert.equal(saveSet(box, SET_1, 0, [{ referenceId: USD, rateTry: "40", active: true }], operation(102)).outcome, "saved");
    assert.equal(activate(box, SET_1, 0, preview(box, SET_1).result.scopeDigest, operation(103)).outcome, "activated");
    assert.equal(context(box).digest, fixed.digest, "unrelated set activation must not invalidate a fixed cart");
    assert.equal(policySave(box, USD_VARIANT, 1, 0, { method: "usd", sourceAmount: "250", referenceId: USD }, operation(104)).outcome, "policy_saved");
    const dynamic = context(box);
    assert.equal(dynamic.requires_quote_confirmation, true);
    assert.notEqual(dynamic.digest, fixed.digest);
    process.stdout.write("PASS dynamic policy, unlike fixed carts, changes the quote lineage\n");
    const staleCompletion = complete(box, fixedQuote.result.quoteDigest);
    assert.equal(staleCompletion.outcome,"price_changed",JSON.stringify(staleCompletion));
    assert.equal(scalar(box, `SELECT pg_catalog.count(*) FROM saas.storefront_checkout_operations WHERE store_id='${STORE}'`), "0");
    process.stdout.write("PASS stale browser-confirmed digest cannot create an offline order\n");

    assert.equal(saveSet(box, SET_2, 1, [{ referenceId: USD, rateTry: "40.00000000", active: true }], operation(105)).outcome, "saved");
    assert.equal(activate(box, SET_2, 1, preview(box, SET_2).result.scopeDigest, operation(106)).outcome, "activated");
    const equalCents = context(box);
    assert.equal(equalCents.requires_quote_confirmation, true);
    assert.notEqual(equalCents.digest, dynamic.digest, "new active version must invalidate a quote even when rounded cents match");
    process.stdout.write("PASS same-cents reference activation changes the quote digest\n");

    const freshQuote = quote(box);
    assert.equal(freshQuote.outcome,"price_changed",JSON.stringify(freshQuote));
    assert.equal(scalar(box, `SELECT pg_catalog.count(*) FROM saas.pricing_checkout_bindings WHERE store_id='${STORE}'`),"0");
    process.stdout.write("PASS active rate drift invalidates stale cart quote without creating payment or order\n");

    const canonicalCents = scalar(box, `SELECT price_cents FROM saas.resolve_effective_variant_price('${STORE}','${USD_VARIANT}','storefront','${NOW}',NULL);`);
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.storefront_cart_items SET unit_price_cents=${canonicalCents} WHERE store_id='${STORE}' AND cart_id='${CART}';COMMIT;`);
    const acceptedQuote = quote(box);
    assert.equal(acceptedQuote.outcome,"quoted",JSON.stringify(acceptedQuote));
    assert.match(acceptedQuote.result.quoteDigest,/^[a-f0-9]{64}$/);
    const completed = complete(box,acceptedQuote.result.quoteDigest);
    assert.equal(completed.outcome,"committed",JSON.stringify(completed));
    for (const field of ["items", "appliedPromotions", "gifts", "promotionStatus",
      "lineDiscountCents", "shippingDiscountCents"]) {
      assert.deepEqual(completed.result.receipt[field],
        acceptedQuote.result.quote.cart[field] ?? acceptedQuote.result.quote[field],
        `committed ${field} must equal the confirmed customer quote`);
    }
    assert.equal(scalar(box, `SELECT pg_catalog.count(*) FROM saas.pricing_checkout_bindings WHERE store_id='${STORE}' AND operation_kind='offline'`),"1");
    process.stdout.write("PASS confirmed dynamic quote commits one immutable order lineage\n");
    const replay = complete(box, fixedQuote.result.quoteDigest);
    assert.equal(replay.outcome,"operation_replayed",JSON.stringify(replay));
    assert.equal(scalar(box, `SELECT pg_catalog.count(*) FROM saas.pricing_checkout_bindings WHERE store_id='${STORE}'`),"1");
    process.stdout.write("PASS bound order replay preserves historical amount despite an obsolete browser digest\n");

    psql(box,`BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.storefront_carts(id,store_id,status,version,expires_at,created_at,updated_at)
      VALUES('${HOSTED_CART}','${STORE}','active',1,'2026-10-20','${NOW}','${NOW}');
      INSERT INTO saas.storefront_cart_credentials(cart_id,store_id,key_id,credential_digest,expires_at)
      VALUES('${HOSTED_CART}','${STORE}','hosted-cart-v3','${"e".repeat(64)}','2026-10-20');
      INSERT INTO saas.storefront_cart_items(cart_id,store_id,product_id,variant_id,quantity,unit_price_cents,position,created_at,updated_at)
      SELECT '${HOSTED_CART}','${STORE}',variant.product_id,variant.id,1,
        (SELECT price_cents FROM saas.resolve_effective_variant_price('${STORE}',variant.id,'storefront','${NOW}',NULL)),
        0,'${NOW}','${NOW}' FROM saas.product_variants variant
      WHERE variant.store_id='${STORE}' AND variant.id='${USD_VARIANT}';COMMIT;`);
    const hostedQuote=quote(box,HOSTED_CANDIDATES);
    assert.equal(hostedQuote.outcome,"quoted",JSON.stringify(hostedQuote));
    const hostedPrepared=hostedAuthority(box,HOSTED_CANDIDATES,HOSTED_ORDER,HOSTED_OPERATION);
    assert.equal(hostedPrepared.outcome,"found",JSON.stringify(hostedPrepared));
    assert.equal(hostedPrepared.result.pricingDigest,hostedQuote.result.quoteDigest);
    const hostedStarted=hostedBegin(box,hostedPrepared.result,hostedQuote.result.quoteDigest);
    assert.equal(hostedStarted.outcome,"created",JSON.stringify(hostedStarted));
    assert.equal(scalar(box,`SELECT price_digest FROM saas.pricing_checkout_bindings WHERE operation_id='${HOSTED_OPERATION}'`),hostedQuote.result.quoteDigest);
    const hostedReplayAuthority=hostedAuthority(box,HOSTED_CANDIDATES,HOSTED_ORDER,HOSTED_OPERATION);
    assert.equal(hostedReplayAuthority.outcome,"found",JSON.stringify(hostedReplayAuthority));
    assert.equal(hostedReplayAuthority.result.pricingDigest,hostedQuote.result.quoteDigest);
    assert.equal(hostedBegin(box,hostedReplayAuthority.result,hostedQuote.result.quoteDigest).outcome,"operation_replayed");
    process.stdout.write("PASS hosted begin and retry preserve the original confirmed public quote seal\n");

    assert.equal(context(box, [{ keyId: CART_KEY, digest: "b".repeat(64) }]), null);
    assert.equal(scalar(box, `SELECT pg_catalog.count(*) FROM saas.storefront_checkout_operations WHERE store_id='${STORE}'`), "1");
    process.stdout.write("PASS wrong credential reveals no cart and digest reads create no additional operations\n");
    const rollback = psql(box, readFileSync("apps/owner/scripts/sql/saas/202609200132_reference_pricing_checkout.down.sql","utf8"), true);
    assert.notEqual(rollback.status,0,"rollback must fail once historical amount bindings exist");
    assert.match(rollback.stderr,/REFERENCE_PRICING_CHECKOUT_ROLLBACK_REQUIRES_NO_BINDINGS/);
    assert.equal(scalar(box, `SELECT pg_catalog.count(*) FROM saas.pricing_checkout_bindings WHERE store_id='${STORE}'`),"2");
    process.stdout.write("PASS rollback refuses to remove historical price bindings\n");
  } finally { stop(box); }
}

main();
