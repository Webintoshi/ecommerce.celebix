import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const base = new URL(".", import.meta.url);

function source(kind: "up" | "down" | "assertions"): string {
  const suffix = kind === "assertions" ? "_assertions.sql" : `.${kind}.sql`;
  return readFileSync(new URL(`202609220142_permanent_record_deletion${suffix}`, base), "utf8");
}

function ledgerDefinition(sql: string): string {
  const match = sql.match(/CREATE TABLE saas[.]record_deletion_operations\s*[(]([\s\S]*?)[)][;]\s/iu);
  assert.ok(match, "record_deletion_operations definition must exist");
  return match[1] ?? "";
}

test("142 creates an immutable PII-free deletion ledger", () => {
  const up = source("up");
  const table = ledgerDefinition(up);

  assert.match(up, /BEGIN[;]/u);
  assert.match(up, /SET LOCAL ROLE celebix_saas_owner[;]/u);
  assert.match(up, /SET LOCAL lock_timeout\s*=\s*'5s'[;]/u);
  assert.match(up, /CREATE TABLE saas[.]record_deletion_operations/u);
  assert.match(up, /PRIMARY KEY\s*[(]\s*store_id\s*,\s*operation_id\s*[)]/iu);
  assert.match(table, /resource_kind\s+text\s+NOT NULL\s+CHECK\s*[(]\s*resource_kind\s+IN\s*[(]\s*'order'\s*,\s*'product'\s*,\s*'category'\s*[)]\s*[)]/iu);
  assert.match(table, /outcome\s+text\s+NOT NULL\s+CHECK\s*[(]\s*outcome\s*=\s*'deleted'\s*[)]/iu);
  assert.match(table, /replay_count\s+bigint\s+NOT NULL\s+DEFAULT\s+0\s+CHECK\s*[(]\s*replay_count\s*>=\s*0\s*[)]/iu);
  assert.match(up, /CREATE TRIGGER record_deletion_operations_immutable[\s\S]*BEFORE UPDATE OR DELETE OR TRUNCATE/iu);
  assert.match(up, /REVOKE ALL ON TABLE saas[.]record_deletion_operations FROM PUBLIC\s*,\s*celebix_saas_app\s*,\s*celebix_saas_workflow/iu);

  for (const forbidden of ["email", "phone", "address", "title", "reason", "total", "payload", "credential"]) {
    assert.doesNotMatch(table, new RegExp(`\\b${forbidden}\\b`, "iu"));
  }
});

test("142 exposes only owner-scoped operation helpers", () => {
  const up = source("up");

  assert.match(up, /CREATE FUNCTION saas[.]record_deletion_operation_lock\s*[(]/u);
  assert.match(up, /pg_advisory_xact_lock/u);
  assert.match(up, /CREATE FUNCTION saas[.]record_deletion_operation_replay\s*[(]/u);
  assert.match(up, /RETURNS TABLE\s*[(]\s*outcome text\s*,\s*audit_id uuid\s*,\s*replay_count bigint\s*[)]/iu);
  assert.match(up, /SECURITY DEFINER\s+SET search_path\s*=\s*pg_catalog\s*,\s*saas/iu);
  assert.match(up, /operation_mismatch/u);
  assert.match(up, /operation_replayed/u);
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]record_deletion_operation_lock/iu);
  assert.match(up, /REVOKE ALL ON FUNCTION saas[.]record_deletion_operation_replay/iu);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*record_deletion_operations[\s\S]*celebix_saas_app/iu);
  assert.doesNotMatch(up, /(?:postgres(?:ql)?:\/\/|DATABASE_URL|PGPASSWORD)/u);
});

test("142 assertions freeze ownership ACL trigger and constraints", () => {
  const assertions = source("assertions");

  assert.match(assertions, /record_deletion_operations_immutable/u);
  assert.match(assertions, /has_table_privilege\s*[(]\s*'celebix_saas_app'\s*,\s*'saas[.]record_deletion_operations'/iu);
  assert.match(assertions, /relowner\s*=\s*[(]\s*SELECT oid FROM pg_catalog[.]pg_roles WHERE rolname='celebix_saas_owner'/iu);
  assert.match(assertions, /pg_get_constraintdef/iu);
  assert.match(assertions, /resource_kind/iu);
  assert.match(assertions, /outcome/iu);
  assert.match(assertions, /replay_count/iu);
});

test("142 rollback refuses to erase committed deletion audit rows", () => {
  const down = source("down");

  assert.match(down, /IF EXISTS\s*[(]\s*SELECT 1 FROM saas[.]record_deletion_operations\s*[)]/iu);
  assert.match(down, /RAISE EXCEPTION 'PERMANENT_RECORD_DELETION_ROLLBACK_BLOCKED'/u);
  assert.match(down, /DROP TABLE saas[.]record_deletion_operations/u);
  assert.match(down, /COMMIT[;]/u);
});
