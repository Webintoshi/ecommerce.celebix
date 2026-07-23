import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const up = read("apps/owner/scripts/sql/saas/202607220043_inventory_purchasing.up.sql");
const down = read("apps/owner/scripts/sql/saas/202607220043_inventory_purchasing.down.sql");
const assertions = read(
  "apps/owner/scripts/sql/saas/202607220043_inventory_purchasing_assertions.sql",
);
const harness = read(
  "tests/saas-phase3/inventory-purchasing/postgres-harness.mjs",
);

test("043 is a closed store-composite inventory authority", () => {
  for (const table of [
    "inventory_locations",
    "inventory_balances",
    "inventory_movements",
    "purchase_orders",
    "purchase_order_lines",
    "inventory_operations",
  ]) {
    assert.match(up, new RegExp(`CREATE TABLE saas[.]${table}`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(up, /FOREIGN KEY \(store_id,location_id\)/);
  assert.match(up, /FOREIGN KEY \(store_id,variant_id\)/);
  assert.match(up, /UNIQUE \(store_id,source_kind,source_id,variant_id,location_id,direction\)/);
  assert.match(up, /quantity_delta<>0 OR movement_kind='opening'/);
  assert.doesNotMatch(up, /CREATE POLICY/);
  assert.doesNotMatch(`${up}\n${down}`, /apps\/admin|production|credential|provider|https?:\/\//i);
});

test("variant reconciliation fails closed and preserves prior writers with finite markers", () => {
  assert.match(up, /AFTER INSERT OR UPDATE OF stock_quantity ON saas[.]product_variants/);
  assert.match(up, /INVENTORY_STOCK_SOURCE_REQUIRED/);
  for (const marker of ["catalog_adjustment", "checkout_sale", "inventory_managed"]) {
    assert.match(up, new RegExp(`'${marker}'`));
  }
  assert.match(up, /is_default DESC,balance[.]location_id/);
  assert.match(up, /status='held'/);
  assert.match(up, /inventory_managed[\s\S]*INVENTORY_BALANCE_AGGREGATE_MISMATCH/);
  assert.match(up, /pg_get_functiondef/);
  assert.match(up, /inventory marker begin/);
  assert.match(up, /inventory marker end/);
  assert.match(down, /inventory marker begin[\s\S]*inventory marker end/);
  assert.match(down, /p_expected_marker text/);
  assert.match(down, /p_expected_source_id text/);
  assert.match(down, /guc_call_count<>6/);
  assert.match(down, /prefix_fragment text/);
  assert.match(down, /suffix_fragment text/);
  assert.match(down, /prefix_residue text/);
  assert.match(down, /suffix_residue text/);
  assert.doesNotMatch(down, /\[\^\\\\r\\\\n\]\*/);
  assert.match(down, /INVENTORY_WRITER_RESTORE_RESIDUE/);
  assert.match(down, /EXECUTE stripped/);
  assert.ok(
    down.indexOf("INVENTORY_WRITER_RESTORE_RESIDUE") <
      down.indexOf("EXECUTE stripped"),
  );
  assert.match(assertions, /INVENTORY_WRITER_GUC_SHAPE_INVALID/);
});

test("purchasing receive uses exact deterministic lock and mutation order", () => {
  const start = up.indexOf("CREATE FUNCTION saas.purchasing_receive");
  const end = up.indexOf("CREATE FUNCTION saas.inventory_recover_operation", start);
  assert.ok(start > -1 && end > start);
  const body = up.slice(start, end);
  const purchase = body.indexOf(
    "WHERE purchase.store_id=p_store_id AND purchase.id=p_order_id FOR UPDATE",
  );
  const variants = body.indexOf(
    "WHERE variant.store_id=p_store_id AND variant.id=ANY(p_variant_ids)",
  );
  const balances = body.indexOf(
    "WHERE balance.store_id=p_store_id AND balance.location_id=p_location_id",
  );
  assert.ok(purchase > -1 && purchase < variants && variants < balances);
  assert.match(body, /ORDER BY variant[.]id FOR UPDATE/);
  assert.match(body, /ORDER BY balance[.]variant_id FOR UPDATE/);
  assert.match(body, /over_receipt/);
  assert.match(body, /checkout_inventory_reservations/);
  assert.match(body, /inventory_managed/);
  assert.match(body, /purchase_receipt/);
  assert.match(body, /operation_replayed/);
  assert.match(body, /operation_mismatch/);
});

test("actions ACL immutability and rollback remain finite", () => {
  for (const action of [
    "analytics.read",
    "inventory.read",
    "inventory.manage",
    "purchasing.read",
    "purchasing.manage",
    "pricing.read",
    "pricing.manage",
  ]) {
    assert.match(up, new RegExp(action.replace(".", "[.]")));
  }
  assert.match(up, /INVENTORY_MOVEMENT_IMMUTABLE/);
  assert.match(up, /INVENTORY_OPERATION_IMMUTABLE/);
  assert.match(assertions, /pg_catalog[.]aclexplode/);
  assert.match(assertions, /relforcerowsecurity/);
  assert.match(down, /INVENTORY_PURCHASING_ROLLBACK_BLOCKED/);
  assert.doesNotMatch(up, /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON/);
  assert.doesNotMatch(up, /GRANT EXECUTE.*(?:workflow|host_resolver|bootstrap)/s);
});

test("the disposable harness defines exactly 34 named scenarios and full recovery proof", () => {
  assert.equal((harness.match(/await scenario\(/g) ?? []).length, 34);
  for (const witness of [
    "PostgreSQL 16",
    "default location seed",
    "active checkout hold",
    "concurrent receipt",
    "backup and restore",
    "rollback refuses nondisposable",
    "cleanup removes disposable PostgreSQL",
  ]) {
    assert.ok(harness.includes(witness), witness);
  }
  assert.match(harness, /pg_dump/);
  assert.match(harness, /pg_restore/);
  assert.match(harness, /pg_stat_activity/);
  assert.match(harness, /pg_catalog[.]pg_locks/);
  assert.match(harness, /FOR UPDATE NOWAIT/);
  for (const writer of [
    "catalog_create_product",
    "catalog_create_variant",
    "catalog_update_variant",
    "catalog_admin_import_products",
    "catalog_admin_commit_import_preview",
    "checkout_settle_callback",
  ]) {
    assert.match(harness, new RegExp(`saas[.]${writer}[(]`));
  }
  assert.match(harness, /inventory_lock_receiver_[$][{]name[}]/);
  for (const lockStage of ["purchase", "variant_a", "variant_b", "balance_a", "balance_b"]) {
    assert.match(harness, new RegExp(`name: "${lockStage}"`));
  }
  assert.match(harness, /INVENTORY_ACTIVE_HOLD_VIOLATION/);
  assert.match(harness, /not-a-timestamp/);
  assert.match(harness, /INVENTORY_WRITER_RESTORE_RESIDUE/);
  assert.doesNotMatch(harness, /pg_sleep|127[.]0[.]0[.]1|localhost|PGHOST|DATABASE_URL/);
});

test("cumulative completion manifest has eighteen current checksums", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8"),
  );
  assert.equal(manifest.artifacts.length, 18);
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
