import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "quick_order_hosted_authority";
const ROLLBACK_DB = "quick_order_hosted_authority_rollback";
const UP = "202607270057_quick_order_hosted_payment_authority.up.sql";
const DOWN = "202607270057_quick_order_hosted_payment_authority.down.sql";
const ASSERTIONS = "202607270057_quick_order_hosted_payment_authority_assertions.sql";
const prior = JSON.parse(readFileSync(path.join(SQL, "phase3o-payment-provider-keyed-lifecycle-manifest.json"), "utf8"));
const FIXTURE = readFileSync(path.join(import.meta.dirname, "fixture.sql"), "utf8");
const STORE = "10000000-0000-4000-8000-000000000057";
const OTHER_STORE = "10000000-0000-4000-8000-000000000058";
const PRINCIPAL = "20000000-0000-4000-8000-000000000057";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000057";
const PLAN = "00000000-0000-4000-8000-000000000001";
const VARIANT = "41000000-0000-4000-8000-000000000057";
const METHOD = "50000000-0000-4000-8000-000000000057";
const OTHER_METHOD = "50000000-0000-4000-8000-000000000058";
const NOW = "2026-07-27T12:00:00.000Z";
const TOTAL = 12;
let completed = 0;

const envelope = (key = "quick.current") => `{"algorithm":"A256GCM","ciphertext":"AQ","iv":"AAAAAAAAAAAAAAAA","keyId":"${key}","tag":"AAAAAAAAAAAAAAAAAAAAAA","version":1}`;
const address = `{"recipientName":"Ada Lovelace","phone":"+905551112233","line1":"Test 1","city":"Istanbul","postalCode":"34710","country":"TR"}`;

function bin(name) { const candidate = path.join(PG, name); accessSync(candidate, constants.X_OK); return candidate; }
function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, { cwd: ROOT, input, encoding: "utf8", env: { ...process.env, LC_ALL: "C", LANG: "C" }, maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function start() {
  const root = mkdtempSync("/tmp/celebix-quick-hosted-");
  const data = path.join(root, "data"); const socket = path.join(root, "socket");
  const port = 26000 + Math.floor(Math.random() * 5000); mkdirSync(socket, { mode: 0o700 });
  command(bin("initdb"), ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(bin("pg_ctl"), ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { root, data, socket, port };
}
function stop(box) { if (!box) return; command(bin("pg_ctl"), ["-D", box.data, "-m", "fast", "stop"], "", true); rmSync(box.root, { recursive: true, force: true }); }
function sql(box, input, database = DB, allowFailure = false) {
  return command(bin("psql"), ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], input, allowFailure);
}
function apply(box, file, database = DB) { sql(box, readFileSync(path.join(SQL, file), "utf8"), database); }
function pass(label, callback) { callback(); completed += 1; process.stdout.write(`PASS ${completed}/${TOTAL} ${label}\n`); }
function authority(store = STORE, principal = PRINCIPAL, membership = MEMBERSHIP) {
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
}
function hosted({ ordinal, method = METHOD, store = STORE, principal = PRINCIPAL, membership = MEMBERSHIP, identity = true, itemType = "PHYSICAL", fingerprint } = {}) {
  const suffix = String(ordinal).padStart(12, "0");
  const types = itemType === null ? "ARRAY[NULL]::text[]" : `ARRAY['${itemType}']::text[]`;
  const identityArgs = identity
    ? `'${"a".repeat(64)}','${types.slice("ARRAY".length)}'`
    : `NULL,${types}`;
  const args = [
    authority(store, principal, membership),
    `'60000000-0000-4000-8000-${suffix}'::uuid`,
    `ARRAY['80000000-0000-4000-8000-${suffix}'::uuid]`,
    `ARRAY['${VARIANT}'::uuid]`, "ARRAY[1]::bigint[]", `'${method}'::uuid`,
    identity ? `'${"a".repeat(64)}'` : "NULL", types,
    identity ? "'identity.current'" : "NULL", identity ? `'${envelope("identity.current")}'::jsonb` : "NULL",
    "'Ada Lovelace'", "'ada@example.com'", "'+905551112233'",
    `'${address}'::jsonb`, `'${address}'::jsonb`, "NULL", "'hosted'", "0", "0", "24",
    `'${String(ordinal).slice(-1).repeat(64)}'`, "'quick.current'", `'${envelope()}'::jsonb`,
    `'90000000-0000-4000-8000-${suffix}'::uuid`, `'${fingerprint ?? String(ordinal + 1).slice(-1).repeat(64)}'`,
  ].join(",");
  return `SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_create_hosted(${args});`;
}
function legacy(ordinal = 90) {
  const suffix = String(ordinal).padStart(12, "0");
  return `SET ROLE celebix_saas_app; SELECT outcome FROM saas.quick_links_create(
    ${authority()},'61000000-0000-4000-8000-${suffix}',ARRAY['81000000-0000-4000-8000-${suffix}'::uuid],
    ARRAY['${VARIANT}'::uuid],ARRAY[1]::bigint[],'52000000-0000-4000-8000-000000000057',
    'Legacy','legacy@example.com','+905551112233','${address}'::jsonb,'${address}'::jsonb,NULL,NULL,
    0,0,24,'${"e".repeat(64)}','quick.current','${envelope()}'::jsonb,
    '91000000-0000-4000-8000-${suffix}','${"f".repeat(64)}');`;
}

async function main() {
  let box;
  try {
    box = start();
    sql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file } of prior.migrationChain) apply(box, file);
    sql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    apply(box, UP); apply(box, ASSERTIONS); sql(box, FIXTURE);

    pass("PostgreSQL 16 migration, assertions, preflight, RLS and ACL pass", () => {
      assert.match(sql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.quick_order_hosted_payment_authority_preflight();").stdout.trim(), "t");
      assert.notEqual(sql(box, "SET ROLE celebix_saas_app; SELECT * FROM saas.quick_order_link_hosted_authorities;", DB, true).status, 0);
    });
    pass("legacy PayTR create remains compatible and has null hosted columns", () => {
      assert.equal(sql(box, legacy()).stdout.trim(), "committed");
      assert.equal(sql(box, "SELECT provider_config_id IS NOT NULL AND hosted_authority_id IS NULL FROM saas.quick_order_links WHERE customer_name='Legacy';").stdout.trim(), "t");
    });
    pass("exact active Iyzico method creates one sealed authority with preserved snapshot", () => {
      assert.equal(sql(box, hosted({ ordinal: 1 })).stdout.trim(), "committed");
      assert.equal(sql(box, `SELECT authority.provider_code||'|'||authority.execution_environment||'|'||item.item_type||'|'||
        (link.shipping_address->>'city')||'|'||(link.shipping_address->>'country')||'|'||(link.shipping_address->>'postalCode')
        FROM saas.quick_order_link_hosted_authorities authority
        JOIN saas.quick_order_links link ON link.id=authority.link_id
        JOIN saas.quick_order_link_items item ON item.quick_order_link_id=link.id
        WHERE authority.link_id='60000000-0000-4000-8000-000000000001';`).stdout.trim(), "iyzico_iframe|test|PHYSICAL|Istanbul|TR|34710");
    });
    pass("public detail contains item type but no identity or method authority", () => {
      const detail = sql(box, `SET ROLE celebix_saas_app; SELECT result_payload FROM saas.quick_links_get(
        ${authority()},'60000000-0000-4000-8000-000000000001');`).stdout.trim();
      assert.match(detail, /"providerKey": "iyzico_iframe"/); assert.match(detail, /"itemType": "PHYSICAL"/);
      assert.doesNotMatch(detail, /identity|paymentMethod|profile|evidence|sealed/i);
    });
    pass("cross-store method substitution fails before insert", () => {
      assert.equal(sql(box, hosted({ ordinal: 2, method: OTHER_METHOD })).stdout.trim(), "provider_not_ready");
    });
    pass("disabled and emergency-disabled methods fail closed", () => {
      sql(box, `UPDATE saas.payment_methods SET state='disabled',updated_at='2026-07-27' WHERE id='${METHOD}';`);
      assert.equal(sql(box, hosted({ ordinal: 3 })).stdout.trim(), "provider_not_ready");
      sql(box, `UPDATE saas.payment_methods SET state='emergency_disabled',emergency_reason='operator lock',updated_at='2026-07-27' WHERE id='${METHOD}';`);
      assert.equal(sql(box, hosted({ ordinal: 4 })).stdout.trim(), "provider_not_ready");
      sql(box, `UPDATE saas.payment_methods SET state='active',emergency_reason=NULL,updated_at='2026-07-27' WHERE id='${METHOD}';`);
    });
    pass("revoked execution evidence fails closed", () => {
      sql(box, "UPDATE saas.merchant_provider_execution_authorities SET enabled=false WHERE provider_code='iyzico_iframe';");
      assert.equal(sql(box, hosted({ ordinal: 5 })).stdout.trim(), "provider_not_ready");
      sql(box, "UPDATE saas.merchant_provider_execution_authorities SET enabled=true WHERE provider_code='iyzico_iframe';");
    });
    pass("missing identity or missing explicit item type is invalid", () => {
      assert.equal(sql(box, hosted({ ordinal: 6, identity: false, itemType: null })).stdout.trim(), "invalid_input");
      assert.equal(sql(box, hosted({ ordinal: 7, itemType: null })).stdout.trim(), "invalid_input");
    });
    pass("cross-store caller authority cannot use another store variant or method", () => {
      assert.equal(sql(box, hosted({ ordinal: 8, store: OTHER_STORE })).stdout.trim(), "membership_denied");
    });
    pass("operation replay is exact and a changed identity authority fingerprint mismatches", () => {
      assert.equal(sql(box, hosted({ ordinal: 9, fingerprint: "7".repeat(64) })).stdout.trim(), "committed");
      assert.equal(sql(box, hosted({ ordinal: 9, fingerprint: "7".repeat(64) })).stdout.trim(), "operation_replayed");
      assert.equal(sql(box, hosted({ ordinal: 9, fingerprint: "8".repeat(64) })).stdout.trim(), "operation_mismatch");
    });
    pass("hosted envelopes cannot be copied to a second link", () => {
      const copied = sql(box, `SET CONSTRAINTS ALL DEFERRED; INSERT INTO saas.quick_order_link_hosted_authorities
        SELECT '60000000-0000-4000-8000-000000000099',store_id,payment_method_id,profile_id,provider_code,
        execution_environment,execution_adapter_version,execution_evidence_digest,identity_authority,identity_key_id,sealed_identity,'${NOW}'
        FROM saas.quick_order_link_hosted_authorities WHERE link_id='60000000-0000-4000-8000-000000000001';`, DB, true);
      assert.notEqual(copied.status, 0);
    });
    pass("down is drain locked and clean down-up assertions restore exactly", () => {
      assert.notEqual(sql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true).status, 0);
      apply(box, UP, ROLLBACK_DB); apply(box, ASSERTIONS, ROLLBACK_DB); apply(box, DOWN, ROLLBACK_DB); apply(box, UP, ROLLBACK_DB); apply(box, ASSERTIONS, ROLLBACK_DB);
      assert.equal(sql(box, "SET ROLE celebix_saas_app; SELECT saas.quick_order_hosted_payment_authority_preflight();", ROLLBACK_DB).stdout.trim(), "t");
    });
    assert.equal(completed, TOTAL);
  } finally { stop(box); }
}

await main();
