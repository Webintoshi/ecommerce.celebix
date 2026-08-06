import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202608060094_shipping_fulfillment_runtime.up.sql",
  down: "202608060094_shipping_fulfillment_runtime.down.sql",
  assertions: "202608060094_shipping_fulfillment_runtime_assertions.sql",
  manifest: "phase4n-shipping-fulfillment-runtime-manifest.json",
});

function source(name: keyof typeof files): string {
  const selected = new URL(files[name], root);
  return existsSync(selected) ? readFileSync(selected, "utf8") : "";
}

test("094 creates forced-RLS quote shipment job event and operation authority", () => {
  const up = source("up");
  for (const table of [
    "shipping_quote_sessions", "shipping_quote_options", "shipping_shipments", "shipping_shipment_items",
    "shipping_fulfillment_jobs", "shipping_shipment_events", "shipping_fulfillment_operations",
    "shipping_shipment_action_jobs", "shipping_shipment_action_operations", "shipping_shipment_labels", "shipping_shipment_returns",
  ]) {
    assert.match(up, new RegExp(`CREATE TABLE saas[.]${table}`, "u"), table);
    assert.match(up, new RegExp(`ALTER TABLE saas[.]${table} FORCE ROW LEVEL SECURITY`, "u"), table);
  }
  assert.match(up, /p_now[+]pg_catalog[.]make_interval[(]mins=>10[)]/u);
  assert.match(up, /FOREIGN KEY[(]store_id,order_id[)]/u);
  assert.match(up, /FOREIGN KEY[(]store_id,profile_id[)]/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE)[\s\S]*shipping_/iu);
});

test("094 exposes exact app quote and shipment commands", () => {
  const up = source("up");
  for (const name of [
    "shipping_quote_begin", "shipping_quote_current", "shipping_shipment_begin",
    "shipping_shipment_current", "shipping_shipment_for_order", "shipping_fulfillment_recover_operation",
    "shipping_shipment_action_begin", "shipping_shipment_action_recover", "shipping_shipment_label_current",
  ]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}[(]`, "u"), name);
  assert.match(up, /'orders[.]fulfill'/u);
  assert.match(up, /FOR UPDATE/u);
  assert.match(up, /order_version_mismatch/u);
  assert.match(up, /quote_expired/u);
  assert.match(up, /shipment_exists/u);
  const appGrant = [...up.matchAll(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO (celebix_saas_(?:app|workflow));/gu)]
    .find((match) => match[1] === "celebix_saas_app")?.[0] ?? "";
  assert.match(appGrant, /shipping_quote_begin/u);
  assert.match(appGrant, /shipping_shipment_begin/u);
  assert.doesNotMatch(appGrant, /shipping_fulfillment_claim|shipping_fulfillment_open/u);
});

test("094 gives workflow only fenced provider job authority", () => {
  const up = source("up");
  for (const name of [
    "shipping_fulfillment_claim", "shipping_fulfillment_claim_job", "shipping_fulfillment_open", "shipping_quote_complete",
    "shipping_fulfillment_fail", "shipping_shipment_complete", "shipping_shipment_mark_unknown",
    "shipping_shipment_action_claim", "shipping_shipment_action_open", "shipping_shipment_action_complete",
    "shipping_shipment_action_fail", "shipping_shipment_action_mark_unknown",
  ]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}[(]`, "u"), name);
  assert.match(up, /FOR UPDATE OF candidate SKIP LOCKED LIMIT 1/u);
  for (const token of ["lease_id", "fence_token", "credential_version"]) assert.match(up, new RegExp(token, "u"));
  assert.match(up, /provider_outcome_unknown/u);
  const workflowGrant = [...up.matchAll(/GRANT EXECUTE ON FUNCTION[\s\S]*?TO (celebix_saas_(?:app|workflow));/gu)]
    .find((match) => match[1] === "celebix_saas_workflow")?.[0] ?? "";
  assert.match(workflowGrant, /shipping_fulfillment_claim/u);
  assert.match(workflowGrant, /shipping_fulfillment_claim_job/u);
  assert.doesNotMatch(workflowGrant, /shipping_quote_begin|shipping_shipment_begin/u);
});

test("094 rollback is guarded and every artifact is digest pinned", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  assert.match(source("down"), /SHIPPING_FULFILLMENT_RUNTIME_DOWN_BLOCKED/u);
  assert.match(source("assertions"), /SHIPPING_FULFILLMENT_RUNTIME_CONTRACT_INVALID/u);
  const manifest = JSON.parse(source("manifest")) as { phase: string; postgresqlMajor: number; externalConnections: number; productionMutations: number; artifacts: Array<{ file: string; direction: string; sha256: string }> };
  assert.deepEqual([manifest.phase, manifest.postgresqlMajor, manifest.externalConnections, manifest.productionMutations], ["phase4n-shipping-fulfillment-runtime", 16, 0, 0]);
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [[files.up, "up"], [files.down, "down"], [files.assertions, "verify"]]);
  for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
});
