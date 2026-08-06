import assert from "node:assert/strict";
import { accessSync, constants, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "shipping_fulfillment_runtime";
const NOW = "2026-08-06T12:00:00.000Z";
const PLAN = "00000000-0000-4000-8000-000000000101";
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const OWNER_A = "20000000-0000-4000-8000-000000000001";
const OWNER_B = "20000000-0000-4000-8000-000000000002";
const MEMBER_A = "30000000-0000-4000-8000-000000000001";
const MEMBER_B = "30000000-0000-4000-8000-000000000002";
const PROFILE = "40000000-0000-4000-8000-000000000001";
const VALIDATION_JOB = "50000000-0000-4000-8000-000000000001";
const ORDER = "90000000-0000-4000-8000-000000000001";
const ORDER_ITEM = "91000000-0000-4000-8000-000000000001";
const QUOTE = "92000000-0000-4000-8000-000000000001";
const QUOTE_JOB = "93000000-0000-4000-8000-000000000001";
const OPTION = "94000000-0000-4000-8000-000000000001";
const SHIPMENT = "95000000-0000-4000-8000-000000000001";
const SHIPMENT_JOB = "96000000-0000-4000-8000-000000000001";
const HANDLER = "70000000-0000-4000-8000-000000000003";

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch {}
  }
  throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
}

function command(program, args, { input, allowFailure = false } = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: { ...process.env, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function start() {
  const names = ["initdb", "pg_ctl", "createdb", "psql"];
  const executables = Object.fromEntries(names.map((name) => [name, executable(name)]));
  const root = mkdtempSync("/tmp/celebix-shipping-fulfillment-");
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  const port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  command(executables.createdb, ["-h", socket, "-p", String(port), "-U", "postgres", DB]);
  return { executables, root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, input, allowFailure = false) {
  return command(box.executables.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DB], { input, allowFailure });
}

function apply(box, file) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"));
}

function json(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function authority(store = STORE_A, principal = OWNER_A, membership = MEMBER_A) {
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'shipping_fixture',1,'${NOW}'::timestamptz`;
}

function rpc(box, role, name, args) {
  const output = psql(box, `SET ROLE ${role};
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${args});`).stdout.trim();
  return JSON.parse(output);
}

function app(box, name, extra, actor = {}) {
  const base = authority(actor.store, actor.principal, actor.membership);
  return rpc(box, "celebix_saas_app", name, `${base}${extra ? `,${extra}` : ""}`);
}

function workflow(box, name, args) {
  return rpc(box, "celebix_saas_workflow", name, args);
}

function envelope() {
  return {
    algorithm: "A256GCM",
    ciphertext: Buffer.from("opaque-token", "utf8").toString("base64url"),
    iv: "AQEBAQEBAQEBAQEB",
    keyId: "shipping.current",
    tag: "AgICAgICAgICAgICAgICAg",
    version: 1,
  };
}

function install(box) {
  apply(box, "202607110001_roles.up.sql");
  apply(box, "202607110002_foundation.up.sql");
  apply(box, "202607110007_identity_roles.up.sql");
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
CREATE FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$ SELECT NULL::text $$;
CREATE TABLE saas.orders(
  id uuid PRIMARY KEY,store_id uuid NOT NULL,order_number text NOT NULL,customer_name text NOT NULL,
  customer_email text,customer_phone text,shipping_address jsonb NOT NULL,status text NOT NULL,
  currency text NOT NULL,version bigint NOT NULL,CONSTRAINT orders_store_id_key UNIQUE(store_id,id)
);
CREATE TABLE saas.order_items(
  id uuid PRIMARY KEY,store_id uuid NOT NULL,order_id uuid NOT NULL,position integer NOT NULL,
  product_name text NOT NULL,sku text,quantity integer NOT NULL,
  CONSTRAINT order_items_order_fk FOREIGN KEY(store_id,order_id) REFERENCES saas.orders(store_id,id)
);
REVOKE ALL ON FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text) FROM PUBLIC;
COMMIT;`);
  apply(box, "202608060093_shipping_provider_foundation.up.sql");
  apply(box, "202608060094_shipping_fulfillment_runtime.up.sql");
  apply(box, "202608060094_shipping_fulfillment_runtime_assertions.sql");
}

function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
('${OWNER_A}','https://identity.test','owner-a','owner-a@test.invalid',true,'2026-01-01','2026-01-01'),
('${OWNER_B}','https://identity.test','owner-b','owner-b@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE_A}','Shipping A','shipping-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Shipping B','shipping-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
('${MEMBER_A}','${OWNER_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
('${MEMBER_B}','${OWNER_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at)
VALUES('${PLAN}','shipping_fixture',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled) VALUES
('${PLAN}','integrations',1,true),('${PLAN}','orders',2,true);
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
('31000000-0000-4000-8000-000000000001','${STORE_A}','${PLAN}','shipping_fixture',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('31000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','shipping_fixture',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.orders(id,store_id,order_number,customer_name,customer_email,customer_phone,shipping_address,status,currency,version)
VALUES('${ORDER}','${STORE_A}','1001','Celebix QA','qa@example.com','+905551112233','{"line1":"Test","city":"Istanbul"}','confirmed','TRY',3);
INSERT INTO saas.order_items(id,store_id,order_id,position,product_name,sku,quantity)
VALUES('${ORDER_ITEM}','${STORE_A}','${ORDER}',0,'Test Ürünü','SKU-1',2);
COMMIT;`);
}

function activateProvider(box) {
  const sealed = envelope();
  const save = app(box, "shipping_connection_save",
    `'61000000-0000-4000-8000-000000000001','${"a".repeat(64)}','${PROFILE}','${VALIDATION_JOB}','basit_kargo',${json(sealed)},'${"b".repeat(64)}','${sealed.keyId}',0`);
  assert.equal(save.outcome, "saved");
  const lease = "62000000-0000-4000-8000-000000000001";
  const claimed = workflow(box, "shipping_validation_claim", `'validation-worker','${NOW}',60,'${lease}'`);
  assert.equal(claimed.outcome, "claimed");
  const resources = [
    { id: "70000000-0000-4000-8000-000000000001", kind: "brand", providerResourceId: "brand", label: "Mağaza", active: true, digest: "1".repeat(64) },
    { id: "70000000-0000-4000-8000-000000000002", kind: "address", providerResourceId: "address", label: "Depo", active: true, digest: "2".repeat(64) },
    { id: HANDLER, kind: "handler", providerResourceId: "handler", label: "Kargo", active: true, digest: "3".repeat(64) },
  ];
  assert.equal(workflow(box, "shipping_validation_complete",
    `'${VALIDATION_JOB}','validation-worker','${lease}',${claimed.result.fenceToken},'${NOW}','${"c".repeat(64)}',${json(resources)}`).outcome, "completed");
  assert.equal(app(box, "shipping_connection_select_resources",
    `'61000000-0000-4000-8000-000000000002','${"d".repeat(64)}','${PROFILE}','${resources[0].id}','${resources[1].id}',true,2`).outcome, "selected");
}

let box;
try {
  box = start();
  install(box);
  seed(box);
  activateProvider(box);

  const packages = [{ heightCm: 10, widthCm: 20, depthCm: 30, weightKg: 1.5 }];
  const quoteArgs = `'${ORDER}',3,${json(packages)},'63000000-0000-4000-8000-000000000001','${"e".repeat(64)}','${QUOTE}','${QUOTE_JOB}','${"f".repeat(64)}'`;
  const queued = app(box, "shipping_quote_begin", quoteArgs);
  assert.equal(queued.outcome, "queued");
  assert.equal(queued.result.jobId, QUOTE_JOB);
  assert.equal(queued.result.quote.status, "queued");
  assert.equal(app(box, "shipping_quote_begin", quoteArgs).outcome, "operation_replayed");
  assert.equal(app(box, "shipping_quote_begin", quoteArgs.replace("'63000000-0000-4000-8000-000000000001'", "'63000000-0000-4000-8000-000000000099'").replace(",3,", ",2,")).outcome, "order_version_mismatch");

  const quoteLease = "64000000-0000-4000-8000-000000000001";
  const quoteClaim = workflow(box, "shipping_fulfillment_claim_job", `'${QUOTE_JOB}','quote-worker','${NOW}',60,'${quoteLease}'`);
  assert.equal(quoteClaim.outcome, "claimed");
  assert.equal(quoteClaim.result.jobKind, "quote");
  const openedQuote = workflow(box, "shipping_fulfillment_open",
    `'${QUOTE_JOB}','quote-worker','${quoteLease}',${quoteClaim.result.fenceToken},'${NOW}'`);
  assert.equal(openedQuote.outcome, "opened");
  assert.equal(openedQuote.result.credentialEnvelope.algorithm, "A256GCM");
  const options = [{ id: OPTION, handlerResourceId: HANDLER, handlerCode: "handler", handlerName: "Kargo", desiKg: 1.5, priceCents: 12900, codFeeCents: null, digest: "0".repeat(64) }];
  const completedQuote = workflow(box, "shipping_quote_complete",
    `'${QUOTE_JOB}','quote-worker','${quoteLease}',${quoteClaim.result.fenceToken},'${NOW}',${json(options)}`);
  assert.equal(completedQuote.outcome, "completed");
  assert.equal(completedQuote.result.options[0].priceCents, 12900);

  const shipmentArgs = `'${ORDER}',3,'${"f".repeat(64)}','${OPTION}','65000000-0000-4000-8000-000000000001','${"1".repeat(64)}','${SHIPMENT}','${SHIPMENT_JOB}','66000000-0000-4000-8000-000000000001'`;
  const shipment = app(box, "shipping_shipment_begin", shipmentArgs);
  assert.equal(shipment.outcome, "queued");
  assert.equal(shipment.result.jobId, SHIPMENT_JOB);
  assert.equal(shipment.result.shipment.items[0].quantity, 2);
  assert.equal(app(box, "shipping_shipment_begin", shipmentArgs).outcome, "operation_replayed");
  const duplicateArgs = shipmentArgs.replace("'65000000-0000-4000-8000-000000000001'", "'65000000-0000-4000-8000-000000000099'");
  assert.equal(app(box, "shipping_shipment_begin", duplicateArgs).outcome, "shipment_exists");
  assert.equal(app(box, "shipping_shipment_begin", shipmentArgs, { store: STORE_B, principal: OWNER_B, membership: MEMBER_B }).outcome, "operation_mismatch");

  const shipmentLease = "67000000-0000-4000-8000-000000000001";
  const shipmentClaim = workflow(box, "shipping_fulfillment_claim_job", `'${SHIPMENT_JOB}','shipment-worker','${NOW}',60,'${shipmentLease}'`);
  assert.equal(shipmentClaim.outcome, "claimed");
  assert.equal(shipmentClaim.result.jobKind, "create_shipment");
  const openedShipment = workflow(box, "shipping_fulfillment_open",
    `'${SHIPMENT_JOB}','shipment-worker','${shipmentLease}',${shipmentClaim.result.fenceToken},'${NOW}'`);
  assert.equal(openedShipment.outcome, "opened");
  assert.equal(openedShipment.result.order.items[0].quantity, 2);
  const completedShipment = workflow(box, "shipping_shipment_complete",
    `'${SHIPMENT_JOB}','shipment-worker','${shipmentLease}',${shipmentClaim.result.fenceToken},'${NOW}','68000000-0000-4000-8000-000000000001','provider-1','barcode-1','tracking-1','https://cargo.test/tracking-1','Test Kargo',12900`);
  assert.equal(completedShipment.outcome, "completed");
  assert.equal(completedShipment.result.status, "ready");
  assert.equal(completedShipment.result.trackingNumber, "tracking-1");

  assert.equal(psql(box, "SELECT pg_catalog.has_table_privilege('celebix_saas_app','saas.shipping_shipments','SELECT,INSERT,UPDATE,DELETE');").stdout.trim(), "f");
  assert.equal(psql(box, "SELECT saas.shipping_fulfillment_runtime_preflight();").stdout.trim(), "t");
  const blockedDown = psql(box, readFileSync(path.join(SQL, "202608060094_shipping_fulfillment_runtime.down.sql"), "utf8"), true);
  assert.notEqual(blockedDown.status, 0);
  assert.match(blockedDown.stderr, /SHIPPING_FULFILLMENT_RUNTIME_DOWN_BLOCKED/u);

  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
ALTER TABLE saas.shipping_fulfillment_operations DISABLE TRIGGER USER;
ALTER TABLE saas.shipping_shipment_events DISABLE TRIGGER USER;
DELETE FROM saas.shipping_fulfillment_operations;
DELETE FROM saas.shipping_shipment_events;
DELETE FROM saas.shipping_fulfillment_jobs;
DELETE FROM saas.shipping_shipment_items;
DELETE FROM saas.shipping_shipments;
DELETE FROM saas.shipping_quote_options;
DELETE FROM saas.shipping_quote_sessions;
COMMIT;`);
  apply(box, "202608060094_shipping_fulfillment_runtime.down.sql");
  assert.equal(psql(box, "SELECT pg_catalog.to_regclass('saas.shipping_shipments') IS NULL;").stdout.trim(), "t");
  assert.equal(psql(box, "SELECT pg_catalog.to_regclass('saas.shipping_provider_profiles') IS NOT NULL;").stdout.trim(), "t");

  console.log("shipping fulfillment PostgreSQL 16 harness passed");
} finally {
  stop(box);
}
