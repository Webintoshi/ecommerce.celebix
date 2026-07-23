import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const read = (name) => readFileSync(path.join(SQL, name), "utf8");
const upName = "202607230046_inventory_locations.up.sql";
const downName = "202607230046_inventory_locations.down.sql";
const assertionsName = "202607230046_inventory_locations_assertions.sql";

test("migration 046 is immutable, FORCE-RLS and execute-only", () => {
  const up = read(upName);
  assert.match(up, /CREATE TABLE saas\.inventory_location_operations/);
  assert.match(up, /PRIMARY KEY \(store_id,operation_id\)/);
  assert.match(up, /ENABLE ROW LEVEL SECURITY/);
  assert.match(up, /FORCE ROW LEVEL SECURITY/);
  assert.match(up, /CREATE FUNCTION saas\.inventory_locations_save/);
  assert.match(up, /CREATE FUNCTION saas\.inventory_locations_archive/);
  assert.match(up, /CREATE FUNCTION saas\.inventory_locations_recover/);
  assert.match(up, /merchant_action_authority_error[\s\S]*'inventory\.manage'/);
  assert.match(up, /pg_advisory_xact_lock[\s\S]*saas\.catalog\.store:/);
  assert.match(up, /REVOKE ALL ON saas\.inventory_location_operations/);
  assert.match(up, /GRANT EXECUTE ON FUNCTION[\s\S]*inventory_locations_save/);
  assert.doesNotMatch(up, /GRANT (?:INSERT|UPDATE|DELETE|SELECT) ON saas\.inventory_location_operations TO celebix_saas_app/);
});

test("migration 046 archive is fail-closed for default balances and nonterminal work", () => {
  const up = read(upName);
  for (const proof of [
    /is_default/, /inventory_balances/, /quantity<>0/, /checkout_inventory_reservations/,
    /purchase_orders[\s\S]*partially_received/, /inventory_counts[\s\S]*counting/,
    /inventory_transfers[\s\S]*in_transit/, /status='active'/,
  ]) assert.match(up, proof);
});

test("migration 046 guarded rollback and catalog assertions are complete", () => {
  const down = read(downName), assertions = read(assertionsName);
  assert.match(down, /INVENTORY_LOCATION_ROLLBACK_BLOCKED/);
  assert.match(down, /DROP FUNCTION saas\.inventory_locations_recover/);
  assert.match(down, /DROP TABLE saas\.inventory_location_operations/);
  assert.match(assertions, /inventory_locations_save/);
  assert.match(assertions, /inventory_locations_archive/);
  assert.match(assertions, /inventory_locations_recover/);
  assert.match(assertions, /relforcerowsecurity/);
});

test("phase3h manifest pins all 27 artifacts including migration 046", () => {
  const manifest = JSON.parse(read("phase3h-merchant-completion-manifest.json"));
  assert.equal(manifest.artifacts.length, 27);
  for (const name of [upName, downName, assertionsName]) {
    const entry = manifest.artifacts.find((item) => item.file === name);
    assert.ok(entry, name);
    assert.equal(entry.sha256, createHash("sha256").update(read(name)).digest("hex"));
  }
});

test("migrations 001 through 045 remain byte-identical to the starting commit", async () => {
  const { execFileSync } = await import("node:child_process");
  const changed = execFileSync("git", ["diff", "--name-only", "ca719b4cdb4694c06f2601af5a31cfdec6610cc0", "--", "apps/owner/scripts/sql/saas"], { cwd: ROOT, encoding: "utf8" })
    .trim().split("\n").filter(Boolean);
  assert.deepEqual(changed.filter((file) => /202607.*(?:00[1-9]|0[1-3][0-9]|04[0-5])_/.test(file)), []);
});
