import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseSavedSet, parsePreview, parseActivated, parseList, parseSet } from "../../../packages/saas-data/src/reference-pricing/validation.ts";
import { SQL, DB, NOW, STORE, OWNER, MEMBERSHIP, PLAN, USD, SET_1, FIXED,
  command, start, stop, psql, scalar, operation, define, saveSet, preview,
  jsonb, effective, migrationsThrough128, apply, seed, call } from "./postgres-harness.mjs";

const GOLD = "40000000-0000-4000-8000-000000000198";
const PRODUCT = "50000000-0000-4000-8000-000000000130";
const SET_2 = "41000000-0000-4000-8000-000000000198";
const SET_INACTIVE = "41000000-0000-4000-8000-000000000199";
const SET_CHANGED = "41000000-0000-4000-8000-000000000200";
const SET_TINY = "41000000-0000-4000-8000-000000000201";
const LIST = "60000000-0000-4000-8000-000000000198";
const LIST_RULE = "61000000-0000-4000-8000-000000000198";
const UP = "202610020198_reference_pricing_catalog_grams.up.sql";
const DOWN = "202610020198_reference_pricing_catalog_grams.down.sql";
const id = (n) => `52000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
function previewGrams(box, set = SET_1, size = 100, after = null, ref = GOLD, options = {}) {
  return call(box, "pricing_reference_set_preview_v2", `'${set}'::uuid,'storefront',${size},${after ? `'${after}'::uuid` : "NULL::uuid"},${ref ? `'${ref}'::uuid` : "NULL::uuid"}`, options);
}
function activateGrams(box, digest, op = operation(19804), version = 0, set = SET_1, ref = GOLD, options = {}, fingerprint = "a".repeat(64)) {
  return call(box, "pricing_reference_set_activate_v2", `'${op}'::uuid,'${fingerprint}','${set}'::uuid,${version},'${digest}',${ref ? `'${ref}'::uuid` : "NULL::uuid"}`, options);
}
let box;
try {
  box = start();
  command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"], `CREATE DATABASE ${DB};`);
  for (const file of migrationsThrough128()) apply(box, file);
  for (const file of ["202609200130_reference_pricing.up.sql", "202609200133_reference_pricing_policy_preview.up.sql", "202609200137_reference_pricing_inactive_activation.up.sql"]) apply(box, file);
  // Execute the actual measurements DDL/validator. Later 162 editor wrappers are unrelated to this RPC.
  psql(box, readFileSync(path.join(SQL, "202609260162_catalog_optional_measurements.up.sql"), "utf8").split("-- Apply only verified single anchors.")[0] + "\nCOMMIT;");
  seed(box);
  assert.equal(define(box, GOLD, "gold_gram", "Gram satış", null, operation(19801)).outcome, "defined");
  assert.equal(define(box, USD, "usd", "USD satış", null, operation(19802)).outcome, "defined");
  const authority = `'${STORE}'::uuid,'${OWNER}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
  const brokenDraft = psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_app;
    SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.pricing_reference_set_save(${authority},'${operation(19803)}'::uuid,'${"a".repeat(64)}','${SET_1}'::uuid,0,${jsonb([{referenceId:GOLD,rateTry:"5",active:true},{referenceId:USD,rateTry:"40",active:true}])});
    SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.pricing_reference_list(${authority},100,NULL::bigint);
    SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM saas.pricing_reference_get(${authority},'${SET_1}'::uuid);
    ROLLBACK;`).stdout.trim().split("\n").filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
  assert.equal(brokenDraft[0].result.isActive, null, "baseline reproduces the rejected first draft");
  assert.throws(() => parseSavedSet(brokenDraft[0].result));
  assert.throws(() => parseList(brokenDraft[1].result));
  assert.throws(() => parseSet(brokenDraft[2].result));
  if (existsSync(path.join(SQL, UP))) apply(box, UP);
  assert.equal(scalar(box, "SELECT to_regprocedure('saas.pricing_reference_set_preview_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,integer,uuid,uuid)') IS NOT NULL;"), "t", "catalog gram preview RPC must exist");
  const aclSql = `SELECT jsonb_agg(jsonb_build_object('name',procedure.proname,'owner',procedure.proowner,
      'acl',procedure.proacl,'definer',procedure.prosecdef,'config',procedure.proconfig) ORDER BY procedure.proname)
    FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='saas' AND procedure.proname IN ('pricing_catalog_gram_candidates',
      'pricing_catalog_gram_scope_digest','pricing_reference_set_preview_v2','pricing_reference_set_activate_v2');`;
  const aclBeforeReapply = scalar(box, aclSql);
  apply(box, UP);
  assert.equal(scalar(box, aclSql), aclBeforeReapply, "reapplying SQL198 preserves owner, helper isolation, entrypoint ACL and secure search paths");
  apply(box, "202610020198_reference_pricing_catalog_grams_assertions.sql");
  const firstDraft = saveSet(box, SET_1, 0, [{ referenceId: GOLD, rateTry: "5", active: true }, { referenceId: USD, rateTry: "40", active: true }], operation(19803));
  assert.equal(firstDraft.outcome, "saved");
  assert.equal(firstDraft.result.isActive, false, "a first draft before any activation returns a boolean, never null");
  assert.equal(parseSavedSet(firstDraft.result).isActive, false, "real SQL payload passes the repository validator that previously rolled back the save");
  const draftList = call(box, "pricing_reference_list", "100,NULL::bigint");
  assert.equal(parseList(draftList.result).items[0].isActive, false, "draft history reload also returns a boolean before first activation");
  const draftGet = call(box, "pricing_reference_get", `'${SET_1}'::uuid`);
  assert.equal(parseSet(draftGet.result).isActive, false);
  psql(box, `SET ROLE celebix_saas_owner;
    ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.product_variants(id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,measurements,version,created_at,updated_at)
    SELECT ('52000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'${PRODUCT}','${STORE}','Gram '||n,12345,false,7,'active','{}',jsonb_build_object('weight',jsonb_build_object('unit',CASE WHEN n=2 THEN 'kg' ELSE 'g' END,'valueMilli',CASE WHEN n=1 THEN 1 WHEN n=2 THEN 1 ELSE 14890 END)),1,'2026-01-01','2026-01-01' FROM generate_series(1,1127) n;
    ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;
    INSERT INTO saas.catalog_variant_commerce_profiles(variant_id,product_id,store_id,measured_quantity_milli,measured_unit,base_quantity_milli,base_unit,created_at,updated_at)
    VALUES('${id(1)}','${PRODUCT}','${STORE}',1000,'piece',1000,'piece','2026-01-01','2026-01-01');
    INSERT INTO saas.orders(id,store_id,order_number,source,customer_name,customer_email,currency,subtotal_cents,shipping_cents,discount_cents,total_cents,status,payment_status,shipping_address,created_at,updated_at)
    VALUES('58000000-0000-4000-8000-000000000198','${STORE}','HISTORY198','manual_import','Fixture','fixture@example.invalid','TRY',24690,0,0,24690,'confirmed','completed','{}','2026-01-01','2026-01-01');
    INSERT INTO saas.order_items(id,store_id,order_id,product_id,variant_id,position,product_name,unit_price_cents,quantity,discount_cents,line_total_cents,created_at)
    VALUES('59000000-0000-4000-8000-000000000198','${STORE}','58000000-0000-4000-8000-000000000198','${PRODUCT}','${id(1)}',0,'Historical',12345,2,0,24690,'2026-01-01');`);
  const fixedPolicy = jsonb({ method: "fixed_try", fixedPriceCents: 12345 });
  const fixedPreview = call(box, "pricing_variant_policy_preview", `'${id(1127)}'::uuid,${fixedPolicy},'storefront'`);
  assert.equal(call(box, "pricing_variant_policy_save_v2", `'${operation(19807)}'::uuid,'${"f".repeat(64)}','${id(1127)}'::uuid,1,0,${fixedPolicy},'${fixedPreview.result.scopeDigest}'`).outcome, "policy_saved");
  assert.deepEqual(previewGrams(box, SET_1, 100, null, null).result, preview(box, SET_1).result);
  let first = previewGrams(box, SET_1, 1);
  assert.equal(first.outcome, "previewed");
  assert.equal(parsePreview(first.result).affectedVariants, 1127);
  assert.equal(first.result.affectedVariants, 1127);
  assert.equal(first.result.affectedProducts, 1);
  assert.equal(first.result.entries[0].newPriceCents, 1, "0.001g × 5 TL/g is half a kuruş, rounded once upwards");
  assert.equal(first.result.nextCursor, id(1));
  const second = previewGrams(box, SET_1, 1, first.result.nextCursor);
  assert.equal(second.result.entries[0].newPriceCents, 500, "0.001kg is exactly 1g");
  assert.equal(second.result.affectedVariants, 1127);
  assert.equal(second.result.scopeDigest, first.result.scopeDigest);
  const paginatedIds = [];
  let cursor = null;
  do {
    const page = previewGrams(box, SET_1, 100, cursor);
    assert.equal(page.result.affectedVariants, 1127);
    assert.equal(page.result.scopeDigest, first.result.scopeDigest);
    paginatedIds.push(...page.result.entries.map((entry) => entry.variantId));
    cursor = page.result.nextCursor;
  } while (cursor);
  assert.equal(paginatedIds.length, 1127);
  assert.equal(new Set(paginatedIds).size, 1127, "every eligible variant appears once across complete pagination");
  assert.equal(previewGrams(box, SET_1, 1, null, USD).outcome, "invalid_input");
  assert.equal(saveSet(box, SET_INACTIVE, 0, [{ referenceId: GOLD, rateTry: null, active: false }, { referenceId: USD, rateTry: "40", active: true }], operation(19808)).outcome, "saved");
  assert.equal(previewGrams(box, SET_INACTIVE).outcome, "invalid_input", "catalog adoption requires the selected reference active in the candidate set");
  const merchantDraft = saveSet(box, SET_CHANGED, 0, [{ referenceId: GOLD, rateTry: "6600", active: true }, { referenceId: USD, rateTry: "40", active: true }], operation(19809));
  assert.equal(merchantDraft.outcome, "saved");
  assert.equal(parseSavedSet(merchantDraft.result).isActive, false, "merchant 6600 TL rate is a valid first-activation draft");
  assert.equal(activateGrams(box, first.result.scopeDigest, operation(19804), 0, SET_CHANGED).outcome, "scope_conflict", "a different candidate reference version invalidates preview");
  assert.equal(saveSet(box, SET_TINY, 0, [{ referenceId: GOLD, rateTry: "0.00000001", active: true }, { referenceId: USD, rateTry: "40", active: true }], operation(19810)).outcome, "saved");
  const tiny = previewGrams(box, SET_TINY, 1);
  assert.equal(tiny.result.entries[0].newPriceCents, 0, "tiny positive reference values retain the existing calculator's exact rounded cents");
  assert.equal(tiny.result.unavailableVariants, 0);
  assert.equal(scalar(box, "SELECT count(*) FROM saas.pricing_variant_policy_versions"), "1", "preview writes no policies");
  psql(box, `SET ROLE celebix_saas_owner;
    INSERT INTO saas.price_lists(id,store_id,name,status,version,activated_at,created_at,updated_at) VALUES('${LIST}','${STORE}','Native override','active',1,'2026-01-01','2026-01-01','2026-01-01');
    INSERT INTO saas.price_list_items(store_id,price_list_id,variant_id,price_cents,created_at) VALUES('${STORE}','${LIST}','${id(5)}',999,'2026-01-01');
    INSERT INTO saas.price_list_rules(id,store_id,price_list_id,channel,starts_at,priority,created_at) VALUES('${LIST_RULE}','${STORE}','${LIST}','storefront','2026-01-01',50,'2026-01-01');`);
  assert.equal(activateGrams(box, first.result.scopeDigest).outcome, "scope_conflict", "new list overrides on fixed candidates are included in the digest");
  first = previewGrams(box, SET_1, 100);
  assert.equal(first.result.fixedOverrideVariants, 1);
  assert.equal(first.result.entries.find((entry) => entry.variantId === id(5)).newPriceCents, 999);
  psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.price_list_items SET price_cents=998 WHERE store_id='${STORE}' AND price_list_id='${LIST}';`);
  assert.equal(activateGrams(box, first.result.scopeDigest).outcome, "scope_conflict", "same-version override amount changes invalidate preview");
  first = previewGrams(box, SET_1, 1);
  psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET measurements='{"weight":{"unit":"g","valueMilli":14891}}' WHERE id='${id(3)}';`);
  assert.equal(activateGrams(box, first.result.scopeDigest).outcome, "scope_conflict", "changed weight without a version bump still invalidates preview");
  assert.equal(scalar(box, "SELECT count(*) FROM saas.pricing_variant_policy_versions"), "1");
  first = previewGrams(box, SET_1, 1);
  psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET version=version+1 WHERE id='${id(4)}';`);
  assert.equal(activateGrams(box, first.result.scopeDigest).outcome, "scope_conflict");
  first = previewGrams(box, SET_1, 1);
  assert.equal(activateGrams(box, first.result.scopeDigest, operation(19804), 0, SET_1, GOLD, { principal: "20000000-0000-4000-8000-000000000131", membership: "30000000-0000-4000-8000-000000000131" }).outcome, "membership_denied");
  assert.equal(previewGrams(box, SET_1, 1, null, GOLD, { store: "10000000-0000-4000-8000-000000000131", membership: "30000000-0000-4000-8000-000000000132" }).outcome, "resource_not_found");
  psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.pricing_dynamic_activation SET enabled=false WHERE store_id='${STORE}';`);
  assert.equal(activateGrams(box, first.result.scopeDigest).outcome, "unavailable");
  psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.pricing_dynamic_activation SET enabled=true WHERE store_id='${STORE}';`);
  psql(box, `SET ROLE celebix_saas_owner;
    CREATE FUNCTION saas.test_catalog_gram_failure() RETURNS trigger LANGUAGE plpgsql AS $failure$
      BEGIN IF NEW.variant_id='${id(1127)}' AND NEW.method='gold_gram' THEN RAISE EXCEPTION 'fixture late write failure'; END IF; RETURN NEW; END $failure$;
    CREATE TRIGGER test_catalog_gram_failure BEFORE INSERT ON saas.pricing_variant_policy_versions FOR EACH ROW EXECUTE FUNCTION saas.test_catalog_gram_failure();`);
  assert.equal(activateGrams(box, first.result.scopeDigest).outcome, "unavailable");
  assert.equal(scalar(box, `SELECT version||':'||COALESCE(active_set_id::text,'none') FROM saas.pricing_reference_state WHERE store_id='${STORE}'`), "0:none", "late batch failure rolls back the activated pointer");
  assert.equal(scalar(box, "SELECT count(*) FROM saas.pricing_reference_operations WHERE operation_kind='activate'"), "0", "late batch failure rolls back its operation ledger");
  assert.equal(scalar(box, "SELECT count(*) FROM saas.pricing_variant_policy_versions"), "1", "late batch failure rolls back every native policy");
  psql(box, `SET ROLE celebix_saas_owner;
    DROP TRIGGER test_catalog_gram_failure ON saas.pricing_variant_policy_versions;
    DROP FUNCTION saas.test_catalog_gram_failure();
    UPDATE saas.product_variants SET measurements='{"weight":{"unit":"kg","valueMilli":9007199254740991}}' WHERE id='${id(6)}';`);
  const overflow = previewGrams(box, SET_1, 1);
  assert.equal(overflow.result.unavailableVariants, 1);
  assert.equal(activateGrams(box, overflow.result.scopeDigest).outcome, "unavailable", "an exact calculator overflow aborts all adoption");
  assert.equal(scalar(box, "SELECT count(*) FROM saas.pricing_variant_policy_versions"), "1");
  psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.product_variants SET measurements='{"weight":{"unit":"g","valueMilli":14890}}' WHERE id='${id(6)}';`);
  const previewStarted = performance.now();
  first = previewGrams(box, SET_CHANGED, 100);
  const previewMs = performance.now() - previewStarted;
  const activationStarted = performance.now();
  const result = activateGrams(box, first.result.scopeDigest, operation(19804), 0, SET_CHANGED);
  const activationMs = performance.now() - activationStarted;
  assert.equal(result.outcome, "activated");
  assert.equal(parseActivated(result.result).stateVersion, 1);
  assert.equal(result.result.stateVersion, 1);
  assert.equal(scalar(box, "SELECT count(*) FROM saas.pricing_variant_policy_versions WHERE method='gold_gram'"), "1127");
  assert.equal(scalar(box, `SELECT method||':'||version FROM saas.pricing_variant_policy_versions WHERE variant_id='${id(1127)}' ORDER BY version LIMIT 1`), "fixed_try:1", "old fixed policy is immutable history");
  assert.equal(effective(box, id(1)).price_cents, 660);
  assert.equal(effective(box, id(2)).price_cents, 660000);
  assert.equal(effective(box, id(5)).price_cents, 998, "native policies preserve authoritative list overrides");
  assert.equal(effective(box, FIXED).price_cents, 12345, "missing variant measurement stays fixed despite weighted siblings in the same product");
  assert.equal(scalar(box, `SELECT price_cents||':'||stock_quantity||':'||version FROM saas.product_variants WHERE id='${id(1)}'`), "12345:7:2");
  assert.equal(scalar(box, `SELECT measured_unit||':'||base_unit FROM saas.catalog_variant_commerce_profiles WHERE variant_id='${id(1)}'`), "piece:piece");
  assert.equal(scalar(box, "SELECT unit_price_cents||':'||quantity||':'||line_total_cents FROM saas.order_items WHERE id='59000000-0000-4000-8000-000000000198'"), "12345:2:24690");
  assert.equal(activateGrams(box, first.result.scopeDigest, operation(19804), 0, SET_CHANGED).outcome, "operation_replayed", "retry precedes changed eligibility/state");
  assert.equal(scalar(box, "SELECT count(*) FROM saas.pricing_variant_policy_versions"), "1128");
  assert.equal(activateGrams(box, first.result.scopeDigest, operation(19804), 0, SET_CHANGED, GOLD, {}, "b".repeat(64)).outcome, "operation_mismatch");
  assert.equal(saveSet(box, SET_2, 1, [{ referenceId: GOLD, rateTry: "10", active: true }, { referenceId: USD, rateTry: "40", active: true }], operation(19805)).outcome, "saved");
  const next = previewGrams(box, SET_2, 1);
  assert.equal(next.result.affectedVariants, 1127, "already dynamic policies stay in subsequent previews");
  assert.equal(activateGrams(box, next.result.scopeDigest, operation(19806), 0, SET_2).outcome, "version_conflict");
  assert.equal(activateGrams(box, next.result.scopeDigest, operation(19806), 1, SET_2).outcome, "activated");
  assert.equal(effective(box, id(2)).price_cents, 1000);
  assert.equal(scalar(box, "SELECT count(*) FROM saas.pricing_variant_policy_versions"), "1128", "existing dynamic policies are not copied or overwritten");
  assert.equal(scalar(box, "SELECT total_cents FROM saas.orders WHERE id='58000000-0000-4000-8000-000000000198'"), "24690");
  assert.equal(scalar(box, "SELECT has_function_privilege('celebix_saas_host_resolver','saas.pricing_reference_set_activate_v2(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,bigint,text,uuid)','EXECUTE')"), "f");
  if (existsSync(path.join(SQL, "202610020198_reference_pricing_catalog_grams_assertions.sql"))) apply(box, "202610020198_reference_pricing_catalog_grams_assertions.sql");
  const rollback = psql(box, readFileSync(path.join(SQL, DOWN), "utf8"), true);
  assert.equal(rollback.status, 0, rollback.stderr);
  assert.equal(effective(box, id(2)).price_cents, 1000, "rollback removes only new entrypoints, preserves canonical policies/history");
  process.stdout.write(`TIMING 1127 native variants at 6600 TL/g: full-count preview ${previewMs.toFixed(1)}ms; atomic activation ${activationMs.toFixed(1)}ms (includes local client launch)\n`);
  process.stdout.write("PASS catalog gram exact rounding/kg conversion, 1127 pagination, authority/gate/stale guards, atomic native policies, retries and frozen history\n");
} finally { stop(box); }
