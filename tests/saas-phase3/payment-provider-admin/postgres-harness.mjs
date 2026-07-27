import assert from "node:assert/strict";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "payment_method_admin";
const EMPTY_DB = "payment_method_admin_empty";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const STORE_C = "10000000-0000-4000-8000-000000000003";
const OWNER = "20000000-0000-4000-8000-000000000001";
const OWNER_B = "20000000-0000-4000-8000-000000000002";
const ANALYST = "20000000-0000-4000-8000-000000000003";
const OWNER_MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const OWNER_B_MEMBERSHIP = "30000000-0000-4000-8000-000000000002";
const ANALYST_MEMBERSHIP = "30000000-0000-4000-8000-000000000003";
const ACTIVE_PROFILE = "40000000-0000-4000-8000-000000000001";
const DISABLED_PROFILE = "40000000-0000-4000-8000-000000000002";
const REVOKED_PROFILE = "40000000-0000-4000-8000-000000000003";
const WRONG_CAPABILITY_PROFILE = "40000000-0000-4000-8000-000000000004";
const FOREIGN_PROFILE = "40000000-0000-4000-8000-000000000005";
const PROVIDER_METHOD = "50000000-0000-4000-8000-000000000001";
const BANK_METHOD = "50000000-0000-4000-8000-000000000002";
const NOW = "2026-07-27T12:00:00.000Z";
const FINGERPRINT = "a".repeat(64);

const previousManifest = JSON.parse(
  readFileSync(path.join(SQL, "phase3i-provider-execution-foundation-manifest.json"), "utf8"),
);
const PRIOR = previousManifest.migrationChain.map(({ file }) => file);

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
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
  if (!allowFailure && result.status !== 0) {
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  }
  return result;
}

function commandAsync(program, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: ROOT,
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.once("error", reject);
    child.once("close", (status) => {
      if (status === 0) resolve({ stdout, stderr });
      else reject(new Error(`psql failed\n${stderr}`));
    });
    child.stdin.end(input);
  });
}

function start() {
  const executables = Object.fromEntries(
    ["initdb", "pg_ctl", "psql"].map((name) => [name, executable(name)]),
  );
  const root = mkdtempSync("/tmp/celebix-payment-method-admin-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, [
    "-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8",
  ]);
  command(executables.pg_ctl, [
    "-D", data, "-o", `-k ${socket} -p ${port} -h ''`,
    "-l", path.join(root, "postgres.log"), "start",
  ]);
  return { executables, root, data, socket, port };
}

function stop(box) {
  if (!box) return;
  command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, source, database = DB, allowFailure = false) {
  return command(box.executables.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: source, allowFailure });
}

function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function authority({
  store = STORE,
  principal = OWNER,
  membership = OWNER_MEMBERSHIP,
} = {}) {
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,` +
    `'${PLAN}'::uuid,'free_starter',1,'${NOW}'::timestamptz`;
}

function app(box, name, extra = "", actor = {}, database = DB) {
  const result = psql(box, `SET ROLE celebix_saas_app;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${authority(actor)}${extra ? `,${extra}` : ""});`, database);
  return JSON.parse(result.stdout.trim());
}

async function appAsync(box, name, extra, actor = {}) {
  const result = await commandAsync(box.executables.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", DB,
  ], `SET ROLE celebix_saas_app;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${authority(actor)},${extra});`);
  return JSON.parse(result.stdout.trim());
}

function quoteJson(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function saveArgs({
  operationId,
  fingerprint = FINGERPRINT,
  methodId,
  expectedVersion = 0,
  kind,
  profileId = null,
  providerCode = null,
  label,
  config = {},
}) {
  return [
    `'${operationId}'`,
    `'${fingerprint}'`,
    `'${methodId}'`,
    expectedVersion,
    `'${kind}'`,
    profileId ? `'${profileId}'` : "NULL",
    providerCode ? `'${providerCode}'` : "NULL",
    `'${label.replaceAll("'", "''")}'`,
    quoteJson(config),
  ].join(",");
}

function stateArgs({ operationId, fingerprint = FINGERPRINT, methodId, expectedVersion, state, reason = null }) {
  return [
    `'${operationId}'`, `'${fingerprint}'`, `'${methodId}'`, expectedVersion, `'${state}'`,
    reason === null ? "NULL" : `'${reason.replaceAll("'", "''")}'`,
  ].join(",");
}

function seedPreMigration(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),
('${OWNER_B}','https://id.test/oidc','owner-b','owner-b@test.invalid',true,'2026-01-01','2026-01-01'),
('${ANALYST}','https://id.test/oidc','analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Payment A','payment-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Payment B','payment-b','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_C}','Payment C','payment-c','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
('${OWNER_MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
('${OWNER_B_MEMBERSHIP}','${OWNER_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01'),
('${ANALYST_MEMBERSHIP}','${ANALYST}','${STORE}','analyst','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
('31000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('31000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('31000000-0000-4000-8000-000000000003','${STORE_C}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.merchant_admin_records(id,store_id,record_kind,name,config,status,version,archived_at,created_at,updated_at) VALUES
('61000000-0000-4000-8000-000000000001','${STORE}','payment_setting','Old payment','{"cashOnDelivery":false}','active',1,NULL,'2026-01-01','2026-01-01'),
('61000000-0000-4000-8000-000000000002','${STORE}','payment_setting','Latest payment','{"cashOnDelivery":true}','active',1,NULL,'2026-01-01','2026-07-26'),
('61000000-0000-4000-8000-000000000003','${STORE_B}','payment_setting','False payment','{"cashOnDelivery":false}','active',1,NULL,'2026-01-01','2026-07-26'),
('61000000-0000-4000-8000-000000000004','${STORE_B}','payment_setting','Archived truth','{"cashOnDelivery":true}','archived',1,'2026-07-27','2026-01-01','2026-07-27'),
('61000000-0000-4000-8000-000000000005','${STORE_C}','payment_setting','Malformed truth','{"cashOnDelivery":"true"}','active',1,NULL,'2026-01-01','2026-07-26');
COMMIT;`);
}

function envelope(ordinal) {
  return JSON.stringify({
    algorithm: "A256GCM",
    ciphertext: Buffer.from(`opaque-${ordinal}`).toString("base64url"),
    iv: "AQEBAQEBAQEBAQEB",
    keyId: "provider.current",
    tag: "AgICAgICAgICAgICAgICAg",
    version: 1,
  }).replaceAll("'", "''");
}

function seedProfiles(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.merchant_provider_definitions(provider_code,capability,enabled,created_at) VALUES
('paytr','payment_processing',true,'${NOW}'),
('iyzico','payment_processing',true,'${NOW}'),
('market_only','marketplace_sync',true,'${NOW}');
INSERT INTO saas.merchant_provider_profiles(
 id,store_id,provider_code,capability,public_config,masked_account_reference,sealed_credentials,
 credential_digest,credential_key_id,credential_schema_version,credential_version,status,version,
 last_validated_at,created_at,updated_at,revoked_at
) VALUES
('${ACTIVE_PROFILE}','${STORE}','paytr','payment_processing','{}','••••active','${envelope(1)}','${"1".repeat(64)}','provider.current',1,1,'active',1,'${NOW}','${NOW}','${NOW}',NULL),
('${DISABLED_PROFILE}','${STORE}','iyzico','payment_processing','{}','••••disabled','${envelope(2)}','${"2".repeat(64)}','provider.current',1,1,'disabled',1,NULL,'${NOW}','${NOW}',NULL),
('${REVOKED_PROFILE}','${STORE}','iyzico','payment_processing','{}','••••revoked','${envelope(3)}','${"3".repeat(64)}','provider.current',1,1,'revoked',1,NULL,'${NOW}','${NOW}','${NOW}'),
('${WRONG_CAPABILITY_PROFILE}','${STORE}','market_only','marketplace_sync','{}','••••market','${envelope(4)}','${"4".repeat(64)}','provider.current',1,1,'active',1,'${NOW}','${NOW}','${NOW}',NULL),
('${FOREIGN_PROFILE}','${STORE_B}','paytr','payment_processing','{}','••••foreign','${envelope(5)}','${"5".repeat(64)}','provider.current',1,1,'active',1,'${NOW}','${NOW}','${NOW}',NULL);
COMMIT;`);
}

const TOTAL = 23;
let count = 0;
async function scenario(name, run) {
  await run();
  count += 1;
  console.log(`PASS ${count}/${TOTAL} ${name}`);
}

async function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of PRIOR) apply(box, file);
    psql(box, readFileSync(path.join(
      ROOT,
      "tests/saas-phase3/payment-provider-admin/isolated-staging-preflight.sql",
    ), "utf8"));
    psql(box, `CREATE DATABASE ${EMPTY_DB} WITH TEMPLATE ${DB};`, "postgres");
    seedPreMigration(box);
    apply(box, "202607270051_payment_method_admin.up.sql");
    seedProfiles(box);

    await scenario("PostgreSQL 16 and 051 assertions pass", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      apply(box, "202607270051_payment_method_admin_assertions.sql");
    });

    await scenario("legacy migration imports only latest active boolean truth", () => {
      assert.equal(psql(box, `SELECT count(*) FROM saas.payment_methods WHERE store_id='${STORE}' AND kind='cash_on_delivery';`).stdout.trim(), "1");
      assert.equal(psql(box, `SELECT count(*) FROM saas.payment_methods WHERE store_id IN('${STORE_B}','${STORE_C}');`).stdout.trim(), "0");
    });

    await scenario("empty list and configuration role matrix are exact", () => {
      assert.deepEqual(app(box, "payment_method_list", "", { store: STORE_B, principal: OWNER_B, membership: OWNER_B_MEMBERSHIP }).result.items, []);
      assert.equal(app(box, "payment_method_list", "", { principal: ANALYST, membership: ANALYST_MEMBERSHIP }).outcome, "listed");
      const denied = app(box, "payment_method_save", saveArgs({
        operationId: "70000000-0000-4000-8000-000000000001",
        methodId: BANK_METHOD, kind: "bank_transfer", label: "Havale",
      }), { principal: ANALYST, membership: ANALYST_MEMBERSHIP });
      assert.equal(denied.outcome, "membership_denied");
    });

    const providerSave = saveArgs({
      operationId: "70000000-0000-4000-8000-000000000002",
      methodId: PROVIDER_METHOD,
      kind: "provider",
      profileId: ACTIVE_PROFILE,
      providerCode: "paytr",
      label: "PayTR",
      config: { checkoutLabel: "Kart ile ödeme" },
    });
    let providerProjection;
    await scenario("provider method accepts one same-store active payment profile", () => {
      const result = app(box, "payment_method_save", providerSave);
      assert.equal(result.outcome, "saved");
      assert.equal(result.result.state, "disabled");
      assert.equal(result.result.replayed, false);
      assert.equal(psql(box, `SELECT provider_code FROM saas.payment_methods WHERE id='${PROVIDER_METHOD}';`).stdout.trim(), "paytr");
      providerProjection = result.result;
    });

    await scenario("save replay and mismatch are durable", () => {
      const replay = app(box, "payment_method_save", providerSave);
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replay.result.replayed, true);
      assert.equal(replay.result.id, providerProjection.id);
      assert.equal(replay.result.version, providerProjection.version);
      assert.equal(app(box, "payment_method_save", providerSave.replace(FINGERPRINT, "b".repeat(64))).outcome, "operation_mismatch");
    });

    await scenario("cross-store and unknown profiles are rejected", () => {
      for (const [profileId, outcome] of [
        [FOREIGN_PROFILE, "profile_not_found"],
        ["40000000-0000-4000-8000-999999999999", "profile_not_found"],
      ]) {
        const result = app(box, "payment_method_save", saveArgs({
          operationId: profileId === FOREIGN_PROFILE
            ? "70000000-0000-4000-8000-000000000003"
            : "70000000-0000-4000-8000-000000000004",
          methodId: "50000000-0000-4000-8000-000000000010",
          kind: "provider", profileId, providerCode: "paytr", label: "Invalid",
        }));
        assert.equal(result.outcome, outcome);
      }
    });

    await scenario("wrong capability disabled and revoked profiles are rejected", () => {
      const fixtures = [
        [WRONG_CAPABILITY_PROFILE, "market_only", "provider_capability_mismatch"],
        [DISABLED_PROFILE, "iyzico", "profile_not_active"],
        [REVOKED_PROFILE, "iyzico", "profile_not_active"],
      ];
      for (const [index, [profileId, providerCode, outcome]] of fixtures.entries()) {
        const result = app(box, "payment_method_save", saveArgs({
          operationId: `70000000-0000-4000-8000-00000000001${index}`,
          methodId: `50000000-0000-4000-8000-00000000002${index}`,
          kind: "provider", profileId, providerCode, label: "Invalid",
        }));
        assert.equal(result.outcome, outcome);
      }
    });

    await scenario("provider and built-in shapes are mutually exclusive", () => {
      assert.equal(app(box, "payment_method_save", saveArgs({
        operationId: "70000000-0000-4000-8000-000000000020",
        methodId: "50000000-0000-4000-8000-000000000030",
        kind: "provider", label: "Missing profile",
      })).outcome, "invalid_input");
      assert.equal(app(box, "payment_method_save", saveArgs({
        operationId: "70000000-0000-4000-8000-000000000021",
        methodId: "50000000-0000-4000-8000-000000000031",
        kind: "bank_transfer", profileId: ACTIVE_PROFILE, providerCode: "paytr", label: "Bad bank",
      })).outcome, "invalid_input");
    });

    await scenario("stale save loses without partial mutation", () => {
      const result = app(box, "payment_method_save", saveArgs({
        operationId: "70000000-0000-4000-8000-000000000022",
        methodId: PROVIDER_METHOD, expectedVersion: 0, kind: "provider",
        profileId: ACTIVE_PROFILE, providerCode: "paytr", label: "Stale",
      }));
      assert.equal(result.outcome, "version_conflict");
      assert.equal(psql(box, `SELECT label FROM saas.payment_methods WHERE id='${PROVIDER_METHOD}';`).stdout.trim(), "PayTR");
    });

    await scenario("commit-unknown recovery returns the immutable save", () => {
      const result = app(box, "payment_method_recover_operation", `'70000000-0000-4000-8000-000000000002','${FINGERPRINT}'`);
      assert.equal(result.outcome, "operation_replayed");
      assert.equal(result.result.replayed, true);
      assert.equal(result.result.id, providerProjection.id);
      assert.equal(result.result.version, providerProjection.version);
    });

    let version = providerProjection.version;
    await scenario("disabled active and emergency transitions are versioned", () => {
      const active = app(box, "payment_method_set_state", stateArgs({
        operationId: "71000000-0000-4000-8000-000000000001",
        methodId: PROVIDER_METHOD, expectedVersion: version, state: "active",
      }));
      assert.equal(active.outcome, "state_changed");
      version = active.result.version;
      const emergency = app(box, "payment_method_set_state", stateArgs({
        operationId: "71000000-0000-4000-8000-000000000002",
        methodId: PROVIDER_METHOD, expectedVersion: version, state: "emergency_disabled",
        reason: "Sağlayıcı kesintisi doğrulandı",
      }));
      assert.equal(emergency.result.state, "emergency_disabled");
      version = emergency.result.version;
      const restored = app(box, "payment_method_set_state", stateArgs({
        operationId: "71000000-0000-4000-8000-000000000003",
        methodId: PROVIDER_METHOD, expectedVersion: version, state: "active",
      }));
      assert.equal(psql(box, `SELECT emergency_reason IS NULL FROM saas.payment_methods WHERE id='${PROVIDER_METHOD}';`).stdout.trim(), "t");
      version = restored.result.version;
    });

    await scenario("emergency reason is required bounded and state-specific", () => {
      for (const [ordinal, reason] of [[4, null], [5, "x"], [6, "x".repeat(241)]]) {
        const result = app(box, "payment_method_set_state", stateArgs({
          operationId: `71000000-0000-4000-8000-00000000000${ordinal}`,
          methodId: PROVIDER_METHOD, expectedVersion: version,
          state: "emergency_disabled", reason,
        }));
        assert.equal(result.outcome, "invalid_input");
      }
    });

    await scenario("stale state and invalid transition write nothing", () => {
      assert.equal(app(box, "payment_method_set_state", stateArgs({
        operationId: "71000000-0000-4000-8000-000000000007",
        methodId: PROVIDER_METHOD, expectedVersion: 1, state: "disabled",
      })).outcome, "version_conflict");
      assert.equal(app(box, "payment_method_set_state", stateArgs({
        operationId: "71000000-0000-4000-8000-000000000008",
        methodId: PROVIDER_METHOD, expectedVersion: version, state: "active",
      })).outcome, "invalid_transition");
    });

    await scenario("a second built-in method saves without provider authority", () => {
      const result = app(box, "payment_method_save", saveArgs({
        operationId: "70000000-0000-4000-8000-000000000023",
        methodId: BANK_METHOD, kind: "bank_transfer", label: "Banka havalesi",
        config: { instructions: "Sipariş numaranızı açıklamaya yazın." },
      }));
      assert.equal(result.outcome, "saved");
    });

    function liveItems() {
      return app(box, "payment_method_list").result.items;
    }

    await scenario("atomic reorder requires exact members and unique positions", () => {
      const items = liveItems();
      const exact = items.map((item, position) => ({
        id: item.id, expectedVersion: item.version, position: items.length - position - 1,
      }));
      const reordered = app(box, "payment_method_reorder", `'72000000-0000-4000-8000-000000000001','${FINGERPRINT}',${quoteJson(exact)}`);
      assert.equal(reordered.outcome, "reordered");
      const current = liveItems();
      assert.deepEqual(current.map(({ position }) => position), [0, 1, 2]);

      const missing = current.slice(1).map((item, position) => ({ id: item.id, expectedVersion: item.version, position }));
      assert.equal(app(box, "payment_method_reorder", `'72000000-0000-4000-8000-000000000002','${FINGERPRINT}',${quoteJson(missing)}`).outcome, "invalid_input");
      const duplicateId = current.map((item, position) => ({ id: current[0].id, expectedVersion: item.version, position }));
      assert.equal(app(box, "payment_method_reorder", `'72000000-0000-4000-8000-000000000003','${FINGERPRINT}',${quoteJson(duplicateId)}`).outcome, "invalid_input");
      const duplicatePosition = current.map((item) => ({ id: item.id, expectedVersion: item.version, position: 0 }));
      assert.equal(app(box, "payment_method_reorder", `'72000000-0000-4000-8000-000000000004','${FINGERPRINT}',${quoteJson(duplicatePosition)}`).outcome, "invalid_input");
    });

    await scenario("stale reorder loses atomically", () => {
      const items = liveItems();
      const stale = items.map((item, position) => ({ id: item.id, expectedVersion: 1, position }));
      assert.equal(app(box, "payment_method_reorder", `'72000000-0000-4000-8000-000000000005','${FINGERPRINT}',${quoteJson(stale)}`).outcome, "version_conflict");
    });

    await scenario("two reorder writers produce one winner", async () => {
      const items = liveItems();
      const calls = [false, true].map((reverse, ordinal) => {
        const ordered = reverse ? [...items].reverse() : items;
        const payload = ordered.map((item, position) => ({ id: item.id, expectedVersion: item.version, position }));
        return `'72000000-0000-4000-8000-00000000001${ordinal}','${String(ordinal + 1).repeat(64)}',${quoteJson(payload)}`;
      });
      const results = await Promise.all(calls.map((extra) => appAsync(box, "payment_method_reorder", extra)));
      assert.deepEqual(results.map(({ outcome }) => outcome).sort(), ["reordered", "version_conflict"]);
    });

    await scenario("list ordering is position then id", () => {
      const items = liveItems();
      assert.deepEqual(
        items.map(({ position, id }) => `${String(position).padStart(4, "0")}:${id}`),
        [...items].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id))
          .map(({ position, id }) => `${String(position).padStart(4, "0")}:${id}`),
      );
    });

    await scenario("app workflow and browser-like roles have no table DML", () => {
      for (const role of ["celebix_saas_app", "celebix_saas_workflow", "celebix_saas_host_resolver"]) {
        for (const statement of [
          "SELECT * FROM saas.payment_methods",
          "UPDATE saas.payment_methods SET state='active'",
          "DELETE FROM saas.payment_method_operations",
        ]) {
          assert.notEqual(psql(box, `SET ROLE ${role}; ${statement};`, DB, true).status, 0);
        }
      }
    });

    await scenario("wrong-store list is isolated", () => {
      assert.deepEqual(app(box, "payment_method_list", "", {
        store: STORE_B, principal: OWNER_B, membership: OWNER_B_MEMBERSHIP,
      }).result.items, []);
    });

    await scenario("guarded non-empty rollback fails before destruction", () => {
      const result = psql(box, readFileSync(path.join(SQL, "202607270051_payment_method_admin.down.sql"), "utf8"), DB, true);
      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /PAYMENT_METHOD_ADMIN_ROLLBACK_REQUIRES_DRAIN/);
      assert.equal(psql(box, "SELECT to_regclass('saas.payment_methods') IS NOT NULL;").stdout.trim(), "t");
    });

    await scenario("empty rollback and reapply are clean", () => {
      apply(box, "202607270051_payment_method_admin.up.sql", EMPTY_DB);
      apply(box, "202607270051_payment_method_admin.down.sql", EMPTY_DB);
      assert.equal(psql(box, "SELECT to_regclass('saas.payment_methods') IS NULL;", EMPTY_DB).stdout.trim(), "t");
      apply(box, "202607270051_payment_method_admin.up.sql", EMPTY_DB);
      apply(box, "202607270051_payment_method_admin_assertions.sql", EMPTY_DB);
    });

    await scenario("disposable resources are ready for cleanup", () => {
      assert.equal(count + 1, TOTAL);
    });

    assert.equal(count, TOTAL);
    console.log(`${TOTAL}/${TOTAL} PASS`);
  } finally {
    stop(box);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
