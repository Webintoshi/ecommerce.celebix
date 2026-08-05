import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("./", import.meta.url);
const files = Object.freeze({
  up: "202608050089_order_transactional_email.up.sql",
  down: "202608050089_order_transactional_email.down.sql",
  assertions: "202608050089_order_transactional_email_assertions.sql",
  manifest: "phase4i-order-transactional-email-manifest.json",
});

function source(name: keyof typeof files): string {
  const selected = new URL(files[name], root);
  return existsSync(selected) ? readFileSync(selected, "utf8") : "";
}

test("089 installs a private event-triggered transactional outbox", () => {
  const up = source("up");
  assert.match(up, /CREATE TABLE saas[.]order_email_deliveries/u);
  assert.match(up, /CREATE TABLE saas[.]order_email_provider_events/u);
  assert.match(up, /CREATE TRIGGER order_events_enqueue_email/u);
  assert.match(up, /AFTER INSERT ON saas[.]order_events/u);
  assert.match(up, /FOR UPDATE SKIP LOCKED/u);
  assert.match(up, /ALTER TABLE saas[.]order_email_deliveries FORCE ROW LEVEL SECURITY/u);
  assert.match(up, /ALTER TABLE saas[.]order_email_provider_events FORCE ROW LEVEL SECURITY/u);
  assert.doesNotMatch(up, /GRANT\s+(?:SELECT|INSERT|UPDATE|DELETE).*order_email/isu);
});

test("089 maps only the approved order and payment events", () => {
  const up = source("up");
  for (const event of [
    "order_received", "payment_completed", "order_shipped", "order_delivered",
    "order_cancelled", "refund_completed", "merchant_new_order",
  ]) assert.match(up, new RegExp(`'${event}'`, "u"), event);
  assert.match(up, /NEW[.]event_type='order_created'/u);
  assert.match(up, /NEW[.]event_type='status_transition'/u);
  assert.match(up, /NEW[.]event_type='payment_transition'/u);
  assert.match(up, /order_row[.]source='manual_import'/u);
  assert.doesNotMatch(up, /'order_preparing'/u);
});

test("089 exposes only bounded workflow and tenant-authorized admin RPCs", () => {
  const up = source("up");
  for (const name of [
    "order_email_work_claim", "order_email_work_seal", "order_email_work_accept",
    "order_email_work_fail", "order_email_provider_event_record",
    "order_email_admin_list", "order_email_admin_retry",
  ]) assert.match(up, new RegExp(`CREATE FUNCTION saas[.]${name}\\(`, "u"), name);
  assert.match(up, /GRANT EXECUTE ON FUNCTION saas[.]order_email_work_claim[\s\S]+TO celebix_saas_workflow/u);
  assert.match(up, /merchant_action_authority_error[\s\S]+'orders'[\s\S]+'orders[.]read'/u);
  assert.match(up, /merchant_action_authority_error[\s\S]+'orders'[\s\S]+'orders[.]manage'/u);
});

test("089 extends notification settings without making them customer-mail authority", () => {
  const up = source("up");
  assert.match(up, /orderNotificationsEnabled/u);
  assert.match(up, /notificationEmail/u);
  assert.match(up, /emailEnabled/u);
  assert.match(up, /replyToEmail/u);
  assert.doesNotMatch(up, /customerNotificationsEnabled/u);
});

test("089 guards rollback and pins every SQL artifact", () => {
  for (const name of Object.values(files)) assert.equal(existsSync(new URL(name, root)), true, `${name} missing`);
  const down = source("down");
  const assertions = source("assertions");
  assert.match(down, /ORDER_TRANSACTIONAL_EMAIL_DOWN_BLOCKED/u);
  assert.match(assertions, /ORDER_TRANSACTIONAL_EMAIL_CONTRACT_INVALID/u);
  const manifest = JSON.parse(source("manifest")) as {
    phase: string;
    postgresqlMajor: number;
    externalConnections: number;
    productionMutations: number;
    artifacts: Array<{ file: string; direction: string; sha256: string }>;
  };
  assert.deepEqual(
    {
      phase: manifest.phase,
      postgresqlMajor: manifest.postgresqlMajor,
      externalConnections: manifest.externalConnections,
      productionMutations: manifest.productionMutations,
    },
    {
      phase: "phase4i-order-transactional-email",
      postgresqlMajor: 16,
      externalConnections: 0,
      productionMutations: 0,
    },
  );
  assert.deepEqual(manifest.artifacts.map(({ file, direction }) => [file, direction]), [
    [files.up, "up"], [files.down, "down"], [files.assertions, "verify"],
  ]);
  for (const artifact of manifest.artifacts) {
    assert.equal(createHash("sha256").update(readFileSync(new URL(artifact.file, root))).digest("hex"), artifact.sha256, artifact.file);
  }
  for (const sql of [source("up"), down, assertions]) {
    assert.match(sql, /^BEGIN;\nSET LOCAL ROLE celebix_saas_owner;/u);
    assert.match(sql, /COMMIT;\s*$/u);
    assert.doesNotMatch(sql, /postgres(?:ql)?:\/\//iu);
  }
});
