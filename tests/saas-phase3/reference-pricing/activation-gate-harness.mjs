import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SQL, DB, STORE, USD, SET_1, USD_VARIANT, FIXED, command, start, stop,
  psql, scalar, operation, define, saveSet, preview, activate, policySave, effective,
  migrationsThrough128, apply, seed } from "./postgres-harness.mjs";

const SET_2 = "41000000-0000-4000-8000-000000000132";
let box;
try {
  box = start();
  command(box.tools.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt",
    "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    `CREATE DATABASE ${DB};`);
  for (const file of migrationsThrough128()) apply(box, file);
  apply(box, "202609200130_reference_pricing.up.sql");
  const compat = [
    "202609200136_reference_pricing_legacy_consumers",
    "202609200137_reference_pricing_inactive_activation",
    "202609200138_reference_pricing_catalog_summary",
    "202609200139_reference_pricing_print_guard",
    "202609200140_reference_pricing_catalog_detail",
    "202609200141_reference_pricing_catalog_preview",
  ];
  for (const name of compat) apply(box, `${name}.up.sql`);
  for (const name of [...compat].reverse()) apply(box, `${name}.down.sql`);
  for (const name of compat) apply(box, `${name}.up.sql`);
  seed(box, { dynamicPricingEnabled: false });
  const appGateWrite = psql(box, `SET ROLE celebix_saas_app;
    UPDATE saas.pricing_dynamic_activation SET enabled=true WHERE store_id='${STORE}'::uuid;`, true);
  assert.notEqual(appGateWrite.status, 0, "merchant app role cannot flip the owner-only gate");
  assert.equal(define(box, USD, "usd", "USD satış", null, operation(301)).outcome, "defined");
  assert.equal(saveSet(box, SET_1, 0,
    [{ referenceId: USD, rateTry: "40", active: true }], operation(302)).outcome, "saved");
  assert.equal(policySave(box, FIXED, 1, 0,
    { method: "fixed_try", fixedPriceCents: 12345 }, operation(303)).outcome,
    "policy_saved", "fixed TRY remains writable with dynamic activation off");
  assert.equal(policySave(box, USD_VARIANT, 1, 0,
    { method: "usd", sourceAmount: "125", referenceId: USD }, operation(304)).outcome,
    "unavailable", "direct merchant SQL cannot attach the first dynamic policy while locked");
  const digest = preview(box, SET_1).result.scopeDigest;
  assert.equal(activate(box, SET_1, 0, digest, operation(305)).outcome,
    "unavailable", "direct merchant SQL cannot activate a tariff while locked");
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    INSERT INTO saas.pricing_dynamic_activation(store_id,enabled)
    VALUES('${STORE}'::uuid,true);COMMIT;`);
  assert.equal(activate(box, SET_1, 0, digest, operation(306)).outcome, "activated");
  const gateCloser = spawn(box.tools.psql, ["-h", box.socket, "-p", String(box.port),
    "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB]);
  const gateCloserDone = new Promise((resolve, reject) => gateCloser.on("close", (code) =>
    code === 0 ? resolve() : reject(new Error("gate closer failed"))));
  gateCloser.stdin.end(`BEGIN;SET LOCAL ROLE celebix_saas_owner;
    UPDATE saas.pricing_dynamic_activation SET enabled=false WHERE store_id='${STORE}'::uuid;
    SELECT 'LOCKED';SELECT pg_catalog.pg_sleep(1);COMMIT;`);
  await new Promise((resolve, reject) => {
    gateCloser.stdout.on("data", (chunk) => {
      if (String(chunk).includes("LOCKED")) resolve();
    });
    gateCloser.on("error", reject);
    gateCloser.on("exit", (code) => { if (code !== 0) reject(new Error("gate closer failed before lock")); });
  });
  assert.equal(policySave(box, USD_VARIANT, 1, 0,
    { method: "usd", sourceAmount: "125", referenceId: USD }, operation(310)).outcome,
    "unavailable", "policy assignment waits for the gate lock and observes the closed state");
  await gateCloserDone;
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    UPDATE saas.pricing_dynamic_activation SET enabled=true
    WHERE store_id='${STORE}'::uuid;COMMIT;`);
  assert.equal(policySave(box, USD_VARIANT, 1, 0,
    { method: "usd", sourceAmount: "125", referenceId: USD }, operation(307)).outcome,
    "policy_saved");
  psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
    UPDATE saas.pricing_dynamic_activation SET enabled=false
    WHERE store_id='${STORE}'::uuid;COMMIT;`);
  assert.equal(effective(box, USD_VARIANT).price_cents, 500000,
    "closing the write gate cannot reveal the stale stored base amount");
  assert.equal(saveSet(box, SET_2, 1,
    [{ referenceId: USD, rateTry: null, active: false }], operation(308)).outcome,
    "saved");
  assert.equal(activate(box, SET_2, 1, preview(box, SET_2).result.scopeDigest,
    operation(309)).outcome, "activated", "an inactive set may safely stop new sales");
  const definitionDigestSql = `SELECT md5(pg_catalog.pg_get_functiondef(procedure.oid))
    FROM pg_catalog.pg_proc procedure JOIN pg_catalog.pg_namespace namespace
      ON namespace.oid=procedure.pronamespace
    WHERE namespace.nspname='saas'
      AND procedure.proname='pricing_reference_set_activate';`;
  const before = scalar(box, definitionDigestSql);
  const rollback = psql(box, readFileSync(path.join(SQL,
    "202609200137_reference_pricing_inactive_activation.down.sql"), "utf8"), true);
  assert.notEqual(rollback.status, 0);
  assert.match(rollback.stderr, /REFERENCE_INACTIVE_ACTIVATION_ROLLBACK_UNSAFE/);
  assert.equal(scalar(box, definitionDigestSql), before,
    "blocked schema down must leave the activation function unchanged");
  assert.equal(scalar(box, `SELECT count(*) FROM saas.pricing_reference_operations
    WHERE store_id='${STORE}'::uuid AND operation_kind='activate';`), "2");
  for (const migration of ["202609200141_reference_pricing_catalog_preview",
    "202609200140_reference_pricing_catalog_detail",
    "202609200139_reference_pricing_print_guard",
    "202609200138_reference_pricing_catalog_summary",
    "202609200136_reference_pricing_legacy_consumers"]) {
    const attempt = psql(box, readFileSync(path.join(SQL, `${migration}.down.sql`), "utf8"), true);
    assert.notEqual(attempt.status, 0, `${migration} must reject rollback with dynamic policy history`);
    assert.match(attempt.stderr, /ROLLBACK_UNSAFE/);
  }
  process.stdout.write("PASS default-off SQL activation gate, fixed flow, and independent read safety\n");
  process.stdout.write("PASS concurrent gate close serializes before dynamic policy assignment\n");
  process.stdout.write("PASS clean mixed-version schema down and reapply\n");
  process.stdout.write("PASS inactive activation blocks schema down before any partial change\n");
} finally { stop(box); }
