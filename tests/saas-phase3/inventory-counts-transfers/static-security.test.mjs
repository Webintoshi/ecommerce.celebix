import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const read = (file) => readFileSync(path.join(ROOT, file), "utf8");
const up = read("apps/owner/scripts/sql/saas/202607220044_inventory_counts_transfers.up.sql");
const down = read("apps/owner/scripts/sql/saas/202607220044_inventory_counts_transfers.down.sql");
const assertions = read(
  "apps/owner/scripts/sql/saas/202607220044_inventory_counts_transfers_assertions.sql",
);
const harness = read(
  "tests/saas-phase3/inventory-counts-transfers/postgres-harness.mjs",
);

test("044 creates four closed store-composite count and transfer relations", () => {
  for (const table of [
    "inventory_counts",
    "inventory_count_lines",
    "inventory_transfers",
    "inventory_transfer_lines",
  ]) {
    assert.match(up, new RegExp(`CREATE TABLE saas[.]${table}`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} ENABLE ROW LEVEL SECURITY`));
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} FORCE ROW LEVEL SECURITY`));
  }
  assert.match(up, /UNIQUE \(store_id,inventory_count_id,variant_id\)/);
  assert.match(up, /UNIQUE \(store_id,inventory_transfer_id,variant_id\)/);
  assert.match(up, /FOREIGN KEY \(store_id,inventory_count_id\)/);
  assert.match(up, /FOREIGN KEY \(store_id,inventory_transfer_id\)/);
  assert.match(up, /FOREIGN KEY \(store_id,variant_id\)/);
  assert.doesNotMatch(up, /CREATE POLICY/);
  assert.doesNotMatch(`${up}\n${down}`, /apps\/admin|production|credential|https?:\/\//i);
});

test("count commit freezes expected quantity and locks every authority row in order", () => {
  assert.match(up, /expected_quantity bigint NOT NULL/);
  assert.match(up, /counted_quantity bigint/);
  assert.match(up, /expected_quantity BETWEEN 0 AND 2147483647/);
  assert.match(up, /counted_quantity IS NULL OR counted_quantity BETWEEN 0 AND 2147483647/);
  const start = up.indexOf("CREATE FUNCTION saas.inventory_counts_commit");
  const end = up.indexOf("CREATE FUNCTION saas.inventory_counts_cancel", start);
  assert.ok(start > -1 && end > start);
  const body = up.slice(start, end);
  const count = body.indexOf("FOR UPDATE;");
  const location = body.indexOf("ORDER BY location.id FOR UPDATE");
  const variant = body.indexOf("ORDER BY variant.id FOR UPDATE");
  const balance = body.indexOf("ORDER BY balance.variant_id FOR UPDATE");
  assert.ok(count > -1 && count < location && location < variant && variant < balance);
  assert.match(body, /balance[.]quantity<>line[.]expected_quantity/);
  assert.match(body, /inventory_conflict/);
  assert.match(body, /active_hold_conflict/);
  assert.match(body, /inventory_managed/);
  assert.match(body, /count_adjustment/);
  assert.match(body, /counted_quantity-line[.]expected_quantity/);
  assert.match(body, /ORDER BY line[.]variant_id/);
});

test("transfer transitions use one deterministic location variant balance lock order", () => {
  for (const functionName of [
    "inventory_transfers_dispatch",
    "inventory_transfers_receive",
    "inventory_transfers_cancel",
  ]) {
    const start = up.indexOf(`CREATE FUNCTION saas.${functionName}`);
    const next = up.indexOf("CREATE FUNCTION", start + 20);
    const body = up.slice(start, next === -1 ? undefined : next);
    const entity = body.indexOf("FOR UPDATE;");
    const locations = body.indexOf("ORDER BY location.id FOR UPDATE");
    const variants = body.indexOf("ORDER BY variant.id FOR UPDATE");
    const balances = body.indexOf("ORDER BY balance.location_id,balance.variant_id FOR UPDATE");
    assert.ok(entity > -1 && entity < locations && locations < variants && variants < balances, functionName);
    assert.match(body, /inventory_managed/, functionName);
  }
  assert.match(up, /transfer_out/);
  assert.match(up, /transfer_in/);
  assert.match(up, /transfer_return/);
  assert.match(up, /insufficient_stock/);
  assert.match(up, /active_hold_conflict/);
  assert.match(up, /inventory checkout store lock begin/);
  assert.match(up, /inventory checkout store lock end/);
  assert.match(up, /saas[.]catalog[.]store:/);
  assert.match(up, /quick_checkout_settle_success_core/);
  assert.match(up, /INVENTORY_CHECKOUT_STORE_LOCK_PATCH_DRIFT/);
  assert.match(down, /INVENTORY_CHECKOUT_STORE_LOCK_RESTORE_DRIFT/);
  assert.match(down, /INVENTORY_CHECKOUT_STORE_LOCK_RESTORE_RESIDUE/);
  assert.match(down, /EXECUTE stripped/);
  assert.match(assertions, /INVENTORY_CHECKOUT_STORE_LOCK_INVALID/);
});

test("finite operation entity constraints extend 043 and rollback restores them exactly", () => {
  for (const kind of [
    "purchase_save",
    "purchase_transition",
    "purchase_receive",
    "count_save",
    "count_start",
    "count_commit",
    "count_cancel",
    "transfer_save",
    "transfer_dispatch",
    "transfer_receive",
    "transfer_cancel",
  ]) {
    assert.match(up, new RegExp(`'${kind}'`));
  }
  assert.match(up, /inventory_operations_purchase_entity_fk/);
  assert.match(up, /inventory_operations_count_entity_fk/);
  assert.match(up, /inventory_operations_transfer_entity_fk/);
  assert.match(up, /inventory_operations_entity_check/);
  assert.match(down, /inventory_operations_purchase_store_fk/);
  assert.match(down, /operation_kind IN\('purchase_save','purchase_transition','purchase_receive'\)/);
  assert.match(down, /INVENTORY_COUNTS_TRANSFERS_ROLLBACK_BLOCKED/);
  assert.doesNotMatch(down, /DROP TABLE[^;]*inventory_operations/);
  assert.match(assertions, /INVENTORY_OPERATION_ENTITY_CONSTRAINT_INVALID/);
  assert.match(assertions, /operation_vocabulary/);
  assert.match(assertions, /entity_vocabulary/);
  assert.match(assertions, /movement_vocabulary/);
  assert.match(assertions, /movement_source_vocabulary/);
  assert.match(assertions, /IS DISTINCT FROM ARRAY/);
});

test("functions are app-only and tables have no application DML", () => {
  for (const functionName of [
    "inventory_counts_list",
    "inventory_counts_get",
    "inventory_counts_save",
    "inventory_counts_start",
    "inventory_counts_commit",
    "inventory_counts_cancel",
    "inventory_transfers_list",
    "inventory_transfers_get",
    "inventory_transfers_save",
    "inventory_transfers_dispatch",
    "inventory_transfers_receive",
    "inventory_transfers_cancel",
  ]) {
    assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${functionName}`));
  }
  assert.match(assertions, /pg_catalog[.]aclexplode/);
  assert.match(assertions, /relforcerowsecurity/);
  assert.doesNotMatch(up, /GRANT (?:INSERT|UPDATE|DELETE|ALL) ON/);
  assert.doesNotMatch(up, /GRANT EXECUTE.*(?:workflow|host_resolver|bootstrap)/s);
  assert.match(up, /INVENTORY_OPERATION_IMMUTABLE/);
  assert.match(up, /INVENTORY_MOVEMENT_IMMUTABLE/);
  assert.match(assertions, /celebix_saas_identity/);
  assert.match(assertions, /celebix_saas_observability/);
  assert.match(assertions, /celebix_saas_migrator/);
  assert.match(assertions, /table_privilege/);
  assert.match(assertions, /function_execute/);
});

test("the disposable harness defines exactly thirty named scenarios and full recovery", () => {
  assert.equal((harness.match(/await scenario\(/g) ?? []).length, 30);
  for (const witness of [
    "PostgreSQL 16",
    "count start freezes",
    "stale balance",
    "active checkout hold",
    "two simultaneous counts",
    "distinct active source",
    "insufficient source",
    "reverse input count transfer and purchasing writers",
    "checkout_settle_callback",
    "inventory_checkout_other_writer",
    "pg_stat_activity",
    "pg_catalog.pg_locks",
    "persistedRaw",
    "movementRows",
    "ownerProof",
    "received and cancelled transfer movements",
    "backup and restore",
    "rollback refuses nondisposable",
    "cleanup removes disposable PostgreSQL",
  ]) {
    assert.ok(harness.includes(witness), witness);
  }
  assert.match(harness, /pg_dump/);
  assert.match(harness, /pg_restore/);
  assert.match(harness, /inventory_count_concurrent_[ab]/);
  assert.match(harness, /inventory_transfer_reverse_[ab]/);
  assert.doesNotMatch(harness, /pg_sleep|127[.]0[.]0[.]1|localhost|PGHOST|DATABASE_URL/);
});

test("cumulative completion manifest has twenty one current checksums", () => {
  const manifest = JSON.parse(
    readFileSync(path.join(SQL, "phase3h-merchant-completion-manifest.json"), "utf8"),
  );
  assert.equal(manifest.artifacts.length, 21);
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
