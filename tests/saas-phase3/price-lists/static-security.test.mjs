import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const up = read("apps/owner/scripts/sql/saas/202607220045_price_lists.up.sql");
const down = read("apps/owner/scripts/sql/saas/202607220045_price_lists.down.sql");
const assertions = read("apps/owner/scripts/sql/saas/202607220045_price_lists_assertions.sql");
const harness = readFileSync(
  path.join(ROOT, "tests/saas-phase3/price-lists/postgres-harness.mjs"),
  "utf8",
);

test("045 creates four closed store-composite pricing relations", () => {
  for (const relation of [
    "price_lists",
    "price_list_items",
    "price_list_rules",
    "price_list_operations",
  ]) {
    assert.match(up, new RegExp(`CREATE TABLE saas[.]${relation}`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${relation} ENABLE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${relation} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(up, /FOREIGN KEY \(store_id,price_list_id\)/);
  assert.match(up, /FOREIGN KEY \(store_id,variant_id\)/);
  assert.match(up, /FOREIGN KEY \(store_id,customer_tag_id\)/);
  assert.doesNotMatch(up, /CREATE POLICY/);
  assert.doesNotMatch(up, /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON/);
});

test("pricing operations use exact replay fingerprint version and immutable result authority", () => {
  for (const operation of ["save", "activate", "archive"]) {
    assert.match(up, new RegExp(`'${operation}'`));
  }
  assert.match(up, /payload_fingerprint/);
  assert.match(up, /operation_replayed/);
  assert.match(up, /operation_mismatch/);
  assert.match(up, /version_conflict/);
  assert.match(up, /PRICE_LIST_OPERATION_IMMUTABLE/);
  assert.match(up, /9007199254740991/);
  assert.match(assertions, /price_list_operations_immutable/);
});

test("activation serializes the shared store and deterministic conflict authority", () => {
  const start = up.indexOf("CREATE FUNCTION saas.pricing_activate");
  const end = up.indexOf("CREATE FUNCTION saas.pricing_archive", start);
  assert.ok(start > -1 && end > start);
  const body = up.slice(start, end);
  const operationLock = body.indexOf("saas.pricing.operation:");
  const storeLock = body.indexOf("saas.catalog.store:");
  const candidate = body.indexOf("FOR UPDATE;");
  const overlaps = body.indexOf("ORDER BY list.id FOR UPDATE");
  const variants = body.indexOf("ORDER BY variant.id FOR UPDATE");
  assert.ok(operationLock > -1 && operationLock < storeLock);
  assert.ok(storeLock < candidate && candidate < overlaps && overlaps < variants);
  assert.match(body, /tstzrange/);
  assert.match(body, /pricing_conflict/);
  assert.match(body, /priority/);
  assert.match(body, /customer_tag_id IS NOT DISTINCT FROM/);
});

test("one stable definer resolver owns finite channel time customer and cents decisions", () => {
  const declarations = up.match(
    /CREATE FUNCTION saas[.]resolve_effective_variant_price\(/g,
  ) ?? [];
  assert.equal(declarations.length, 1);
  const start = up.indexOf("CREATE FUNCTION saas.resolve_effective_variant_price");
  const next = up.indexOf("CREATE FUNCTION", start + 20);
  const body = up.slice(start, next);
  assert.match(body, /LANGUAGE plpgsql STABLE SECURITY DEFINER/);
  assert.match(body, /SET search_path=pg_catalog,saas/);
  assert.match(body, /p_channel NOT IN\('storefront','quick_order'\)/);
  assert.match(body, /pg_catalog[.]isfinite\(p_now\)/);
  assert.match(body, /customer[.]store_id=p_store_id/);
  assert.match(body, /customer[.]email=pg_catalog[.]lower\(p_customer_email\)/);
  assert.match(body, /customer_tag_assignments/);
  assert.match(body, /tag[.]archived_at IS NULL/);
  assert.match(body, /rule[.]priority DESC,rule[.]starts_at DESC,list[.]id/);
  assert.match(body, /variant[.]price_cents/);
  assert.doesNotMatch(body, /segment|cookie|forwarded|header/i);
});

test("all live pre-snapshot readers use the behavioral resolver authority and preserve snapshots", () => {
  for (const functionName of [
    "public_list_products",
    "public_get_product_by_slug",
    "abandoned_carts_capture",
  ]) {
    const start = up.indexOf(`CREATE OR REPLACE FUNCTION saas.${functionName}`);
    assert.ok(start > -1, functionName);
    const next = up.indexOf("CREATE OR REPLACE FUNCTION saas.", start + 30);
    const body = up.slice(start, next === -1 ? undefined : next);
    assert.match(body, /resolve_effective_variant_price/, functionName);
  }
  for (const [functionName, delegatedName] of [
    ["quick_links_create", "quick_links_create_025"],
    ["quick_links_duplicate", "quick_links_duplicate_025"],
  ]) {
    const start = up.indexOf(`CREATE OR REPLACE FUNCTION saas.${functionName}`);
    assert.ok(start > -1, functionName);
    const next = up.indexOf("CREATE OR REPLACE FUNCTION saas.", start + 30);
    const body = up.slice(start, next === -1 ? undefined : next);
    assert.match(body, new RegExp(`saas[.]${delegatedName}[(]`), functionName);
    assert.doesNotMatch(body, /PERFORM resolved[.]outcome/, functionName);
  }
  const patchStart = up.indexOf("DO $quick_reader_patch$");
  const patchEnd = up.indexOf("CREATE OR REPLACE FUNCTION saas.quick_links_create", patchStart);
  const behavioralPatch = up.slice(patchStart, patchEnd);
  assert.equal((behavioralPatch.match(/resolve_effective_variant_price/g) ?? []).length, 2);
  assert.equal((behavioralPatch.match(/saas[.]catalog[.]store:/g) ?? []).length, 2);
  assert.match(up, /unit_price_cents/);
  assert.match(up, /line_total_cents/);
  assert.match(up, /'storefront'/);
  assert.match(up, /'quick_order'/);
  assert.doesNotMatch(up, /customerSegment|customer_segment|x-customer|forwarded/i);
  assert.doesNotMatch(`${up}\n${down}`, /apps\/admin|production|https?:\/\/(?!www[.]paytr[.]com)/i);
});

test("resolver and RPC grants are least privilege and helpers remain owner-only", () => {
  assert.match(
    up,
    /GRANT EXECUTE ON FUNCTION[\s\S]*saas[.]resolve_effective_variant_price\([^;]+\)\s+TO celebix_saas_app,celebix_saas_host_resolver,celebix_saas_workflow;/,
  );
  for (const functionName of [
    "pricing_list",
    "pricing_get",
    "pricing_save",
    "pricing_activate",
    "pricing_archive",
    "pricing_recover_operation",
  ]) {
    assert.match(up, new RegExp(`GRANT EXECUTE ON FUNCTION[\\s\\S]*saas[.]${functionName}[^;]+\\s+TO celebix_saas_app;`));
  }
  assert.match(assertions, /pg_catalog[.]aclexplode/);
  assert.match(assertions, /celebix_saas_identity/);
  assert.match(assertions, /celebix_saas_bootstrap/);
  assert.match(assertions, /celebix_saas_observability/);
  assert.match(assertions, /celebix_saas_migrator/);
});

test("down has drift guards restores exact readers and refuses nondisposable rollback", () => {
  assert.match(down, /PRICE_LISTS_ROLLBACK_BLOCKED/);
  assert.match(down, /PRICE_LIST_READER_RESTORE_DRIFT/);
  assert.match(down, /DROP FUNCTION saas[.]resolve_effective_variant_price/);
  for (const relation of [
    "price_list_operations",
    "price_list_rules",
    "price_list_items",
    "price_lists",
  ]) {
    assert.match(down, new RegExp(`DROP TABLE saas[.]${relation}`));
  }
  assert.match(down, /CREATE OR REPLACE FUNCTION saas[.]public_list_products/);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas[.]public_get_product_by_slug/);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas[.]quick_links_create/);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas[.]quick_links_duplicate/);
  assert.match(down, /CREATE OR REPLACE FUNCTION saas[.]abandoned_carts_capture/);
});

test("the disposable PostgreSQL 16 harness defines exactly thirty eight named scenarios", () => {
  assert.equal((harness.match(/await scenario\(/g) ?? []).length, 38);
  for (const witness of [
    "PostgreSQL 16",
    "draft save",
    "draft update",
    "operation replay",
    "stale version",
    "active global storefront",
    "active global quick-order",
    "persisted-customer-tag",
    "anonymous tag rule ignored",
    "time boundary",
    "priority",
    "overlap rejection",
    "archive fallback",
    "missing variant",
    "archived variant",
    "wrong-store item",
    "wrong-store tag",
    "wrong-store customer",
    "overflow",
    "direct DML denial",
    "ACL and RLS",
    "public list and detail",
    "quick-link create",
    "quick-link duplicate",
    "abandoned-cart capture",
    "immutable snapshots",
    "concurrent activation",
    "operation recovery",
    "shared store lock",
    "backup and restore",
    "down restores exact pre-045 function definitions",
    "reapply",
    "cleanup removes disposable PostgreSQL",
  ]) {
    assert.ok(harness.includes(witness), witness);
  }
  assert.match(harness, /pg_dump/);
  assert.match(harness, /pg_restore/);
  assert.doesNotMatch(harness, /pg_sleep|127[.]0[.]0[.]1|localhost|PGHOST|DATABASE_URL/);
});

test("cumulative completion manifest has twenty four current checksums", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8"),
  );
  assert.equal(manifest.artifacts.length, 24);
  for (const artifact of manifest.artifacts) {
    assert.equal(
      createHash("sha256")
        .update(readFileSync(path.join(SQL, artifact.file)))
        .digest("hex"),
      artifact.sha256,
      artifact.file,
    );
  }
});
