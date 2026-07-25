import assert from "node:assert/strict";
import { accessSync, constants, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "provider_execution_foundation";
const RESTORED = "provider_execution_foundation_restored";
const PLAN = "00000000-0000-4000-8000-000000000101";
const DENIED_PLAN = "00000000-0000-4000-8000-000000000102";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const STORE_C = "10000000-0000-4000-8000-000000000003";
const OWNER = "20000000-0000-4000-8000-000000000001";
const OWNER_B = "20000000-0000-4000-8000-000000000002";
const ANALYST = "20000000-0000-4000-8000-000000000003";
const OWNER_C = "20000000-0000-4000-8000-000000000004";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000002";
const ANALYST_MEMBERSHIP = "30000000-0000-4000-8000-000000000003";
const MEMBERSHIP_C = "30000000-0000-4000-8000-000000000004";
const PROFILE = "40000000-0000-4000-8000-000000000001";
const DISABLED_PROFILE = "40000000-0000-4000-8000-000000000002";
const VALIDATION_PROFILE = "40000000-0000-4000-8000-000000000003";
const UNKNOWN_PROFILE = "40000000-0000-4000-8000-000000000004";
const NOW = "2026-07-25T12:00:00.000Z";
const MARK_NOW = NOW;
const LEASE_EXPIRES = "2026-07-25T12:05:00.000Z";
const RAW_CREDENTIAL = "never-print-provider-credential";

const priceListsHarness = readFileSync(path.join(ROOT, "tests/saas-phase3/price-lists/postgres-harness.mjs"), "utf8");
const pricingHarness = readFileSync(path.join(ROOT, "tests/saas-phase3/pricing-preview/postgres-harness.mjs"), "utf8");
function migrationArray(sourceFile, name) {
  const source = new RegExp(`const ${name} = (\\[[\\s\\S]*?\\]);`).exec(sourceFile)?.[1];
  if (!source) throw new Error(`${name}_MIGRATION_LIST_MISSING`);
  return [...source.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}
const BEFORE_049 = [
  ...migrationArray(priceListsHarness, "PRIOR"),
  ...migrationArray(pricingHarness, "AFTER"),
  "202607240048_exact_record_lookups_analytics.up.sql",
];

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
function commandAsync(program, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: ROOT,
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "", stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (value) => { stdout += value; });
    child.stderr.on("data", (value) => { stderr += value; });
    child.once("error", reject);
    child.once("close", (status) => status === 0 ? resolve({ stdout, stderr }) : reject(new Error(`psql failed\n${stderr}`)));
    child.stdin.end(input);
  });
}
function start() {
  const executables = Object.fromEntries(["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore"].map((name) => [name, executable(name)]));
  const root = mkdtempSync("/tmp/celebix-provider-execution-");
  const data = path.join(root, "data"), socket = path.join(root, "socket");
  const port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { executables, root, data, socket, port };
}
function stop(box) {
  if (!box) return;
  command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}
function psql(box, input, database = DB, allowFailure = false) {
  return command(box.executables.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input, allowFailure });
}
function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}
function authority({ store = STORE, principal = OWNER, membership = MEMBERSHIP, plan = PLAN, planCode = "provider_fixture" } = {}) {
  return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${plan}'::uuid,'${planCode}',1,'${NOW}'::timestamptz`;
}
function app(box, name, extra = "", actor = {}, database = DB) {
  const output = psql(box, `SET ROLE celebix_saas_app;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${authority(actor)}${extra ? `,${extra}` : ""});`, database).stdout.trim();
  return JSON.parse(output);
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
function workflow(box, name, extra, database = DB) {
  const output = psql(box, `SET ROLE celebix_saas_workflow;
SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload)
FROM saas.${name}(${extra});`, database).stdout.trim();
  return JSON.parse(output);
}
function quoteJson(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}
function envelope(ciphertext = Buffer.from("opaque-ciphertext", "utf8").toString("base64url"), keyId = "provider.current") {
  return { algorithm: "A256GCM", ciphertext, iv: "AQEBAQEBAQEBAQEB", keyId, tag: "AgICAgICAgICAgICAgICAg", version: 1 };
}
function saveArgs({
  operationId,
  fingerprint,
  profileId,
  providerCode,
  capability,
  expectedVersion = 0,
  accountReference = "merchant-42",
  maskedReference = "••••nt-42",
  credentialDigest = "a".repeat(64),
  sealed = envelope(),
} = {}) {
  return `'${operationId}','${fingerprint}','${profileId}','${providerCode}','${capability}',${quoteJson({ accountReference })},'${maskedReference}',${quoteJson(sealed)},'${credentialDigest}','${sealed.keyId}',1,${expectedVersion}`;
}
function mutationArgs(operationId, fingerprint, profileId, expectedVersion) {
  return `'${operationId}','${fingerprint}','${profileId}',${expectedVersion}`;
}
function claim(box, workerId, leaseId) {
  return workflow(box, "merchant_provider_profile_claim_validation", `'${workerId}','${NOW}'::timestamptz,'${LEASE_EXPIRES}'::timestamptz,'${leaseId}'`);
}
function mark(box, { profileId, workerId, leaseId, credentialVersion, profileVersion, outcome, outcomeCode }) {
  return workflow(box, "merchant_provider_profile_mark_validation", `'${profileId}','${workerId}','${MARK_NOW}'::timestamptz,'${leaseId}',${credentialVersion},${profileVersion},'${outcome}','${outcomeCode}'`);
}
function seedPlanFixtures(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.plans(id,plan_code,version,status,valid_from,created_at,updated_at) VALUES
('${PLAN}','provider_fixture',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('${DENIED_PLAN}','provider_denied',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.plan_features(plan_id,feature_key,feature_ordinal,enabled) VALUES
('${PLAN}','integrations',1,true),('${DENIED_PLAN}','integrations',1,false);
COMMIT;`);
}
function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),
('${OWNER_B}','https://id.test/oidc','owner-b','owner-b@test.invalid',true,'2026-01-01','2026-01-01'),
('${ANALYST}','https://id.test/oidc','analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01'),
('${OWNER_C}','https://id.test/oidc','owner-c','owner-c@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Provider A','provider-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Provider B','provider-b','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_C}','Provider C','provider-c','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
('${MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
('${MEMBERSHIP_B}','${OWNER_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01'),
('${ANALYST_MEMBERSHIP}','${ANALYST}','${STORE}','analyst','active','2026-01-01','2026-01-01'),
('${MEMBERSHIP_C}','${OWNER_C}','${STORE_C}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
('31000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','provider_fixture',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('31000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','provider_fixture',1,'active','2026-01-01','2026-01-01','2026-01-01'),
('31000000-0000-4000-8000-000000000003','${STORE_C}','${DENIED_PLAN}','provider_denied',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.merchant_provider_definitions(provider_code,capability,enabled,created_at) VALUES
('fixture_provider','marketplace_sync',true,'2026-01-01'),
('disabled_provider','email_delivery',true,'2026-01-01'),
('validation_provider','phone_delivery',true,'2026-01-01'),
('unknown_validation_provider','whatsapp_delivery',true,'2026-01-01'),
('race_provider','marketplace_sync',true,'2026-01-01'),
('rotation_provider','indexing',true,'2026-01-01'),
('market_only','marketplace_sync',true,'2026-01-01');
COMMIT;`);
}

const TOTAL = 25;
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
    for (const file of BEFORE_049) {
      if (file === "202607110003_plan_versions.freeze.sql") seedPlanFixtures(box);
      apply(box, file);
    }
    apply(box, "202607250049_merchant_provider_profiles.up.sql");
    seed(box);

    await scenario("provider definitions are owner-only and application read-only", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      apply(box, "202607250049_merchant_provider_profiles_assertions.sql");
      assert.equal(psql(box, "SELECT count(*) FROM saas.merchant_provider_definitions;").stdout.trim(), "7");
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app; UPDATE saas.merchant_provider_definitions SET enabled=false;", DB, true).status, 0);
    });

    const initialSave = saveArgs({ operationId: "50000000-0000-4000-8000-000000000001", fingerprint: "1".repeat(64), profileId: PROFILE, providerCode: "fixture_provider", capability: "marketplace_sync" });
    let initialProjection;
    await scenario("profile save persists ciphertext without raw credential", () => {
      const result = app(box, "merchant_provider_profile_save", initialSave);
      assert.equal(result.outcome, "saved");
      initialProjection = result.result;
      assert.equal(result.result.status, "pending_validation");
      const stored = psql(box, `SELECT sealed_credentials::text FROM saas.merchant_provider_profiles WHERE id='${PROFILE}';`).stdout.trim();
      assert.doesNotMatch(stored, new RegExp(RAW_CREDENTIAL));
      assert.match(stored, /ciphertext/);
    });
    await scenario("profile projection omits store and envelope authority", () => {
      const result = app(box, "merchant_provider_profile_list", "NULL");
      assert.equal(result.outcome, "listed");
      const profile = result.result.items.find(({ id }) => id === PROFILE);
      assert.deepEqual(Object.keys(profile).sort(), ["capability", "createdAt", "credentialVersion", "id", "lastValidatedAt", "maskedAccountReference", "providerCode", "publicConfig", "status", "updatedAt", "version"]);
      assert.doesNotMatch(JSON.stringify(profile), /storeId|sealed|cipher|digest|keyId|credential.*value/i);
    });
    await scenario("profile replay returns the original projection", () => {
      const replay = app(box, "merchant_provider_profile_save", initialSave);
      assert.equal(replay.outcome, "operation_replayed");
      assert.deepEqual(replay.result, initialProjection);
    });
    await scenario("profile operation mismatch writes nothing", () => {
      const mismatch = app(box, "merchant_provider_profile_save", initialSave.replace("1".repeat(64), "2".repeat(64)));
      assert.equal(mismatch.outcome, "operation_mismatch");
      assert.equal(psql(box, `SELECT version FROM saas.merchant_provider_profiles WHERE id='${PROFILE}';`).stdout.trim(), "1");
    });
    const rotationSave = saveArgs({ operationId: "50000000-0000-4000-8000-000000000002", fingerprint: "3".repeat(64), profileId: PROFILE, providerCode: "fixture_provider", capability: "marketplace_sync", expectedVersion: 1, credentialDigest: "b".repeat(64), sealed: envelope(Buffer.from("rotated-ciphertext").toString("base64url"), "provider.rotated") });
    await scenario("profile rotation increments credential and row versions", () => {
      const rotated = app(box, "merchant_provider_profile_save", rotationSave);
      assert.equal(rotated.outcome, "saved");
      assert.equal(rotated.result.credentialVersion, 2);
      assert.equal(rotated.result.version, 2);
      assert.equal(rotated.result.status, "pending_validation");
    });
    await scenario("stale rotation loses without partial write", () => {
      const stale = app(box, "merchant_provider_profile_save", saveArgs({ operationId: "50000000-0000-4000-8000-000000000003", fingerprint: "4".repeat(64), profileId: PROFILE, providerCode: "fixture_provider", capability: "marketplace_sync", expectedVersion: 1, credentialDigest: "c".repeat(64) }));
      assert.equal(stale.outcome, "version_conflict");
      assert.equal(psql(box, `SELECT credential_version||':'||version FROM saas.merchant_provider_profiles WHERE id='${PROFILE}';`).stdout.trim(), "2:2");
    });
    const revokeArgs = mutationArgs("50000000-0000-4000-8000-000000000004", "5".repeat(64), PROFILE, 2);
    await scenario("revocation is terminal and idempotent by operation", () => {
      const revoked = app(box, "merchant_provider_profile_revoke", revokeArgs);
      assert.equal(revoked.outcome, "revoked");
      assert.equal(revoked.result.status, "revoked");
      assert.equal(app(box, "merchant_provider_profile_revoke", revokeArgs).outcome, "operation_replayed");
      assert.equal(app(box, "merchant_provider_profile_revoke", mutationArgs("50000000-0000-4000-8000-000000000005", "6".repeat(64), PROFILE, 3)).outcome, "invalid_transition");
    });
    await scenario("disable is versioned and requires credential rotation to reactivate", () => {
      const create = app(box, "merchant_provider_profile_save", saveArgs({ operationId: "51000000-0000-4000-8000-000000000001", fingerprint: "7".repeat(64), profileId: DISABLED_PROFILE, providerCode: "disabled_provider", capability: "email_delivery" }));
      assert.equal(create.outcome, "saved");
      const lease = claim(box, "worker.disable", "61000000-0000-4000-8000-000000000001").result;
      assert.equal(mark(box, { profileId: lease.profileId, workerId: lease.leaseOwner, leaseId: lease.leaseId, credentialVersion: lease.credentialVersion, profileVersion: lease.profileVersion, outcome: "validated", outcomeCode: "validated" }).outcome, "validated");
      const disabled = app(box, "merchant_provider_profile_disable", mutationArgs("51000000-0000-4000-8000-000000000002", "8".repeat(64), DISABLED_PROFILE, 2));
      assert.equal(disabled.result.status, "disabled");
      const rotated = app(box, "merchant_provider_profile_save", saveArgs({ operationId: "51000000-0000-4000-8000-000000000003", fingerprint: "9".repeat(64), profileId: DISABLED_PROFILE, providerCode: "disabled_provider", capability: "email_delivery", expectedVersion: 3, credentialDigest: "d".repeat(64) }));
      assert.equal(rotated.result.status, "pending_validation");
      assert.equal(rotated.result.credentialVersion, 2);
      const reactivationLease = claim(box, "worker.reactivate", "61000000-0000-4000-8000-000000000002").result;
      const reactivated = mark(box, { profileId: reactivationLease.profileId, workerId: reactivationLease.leaseOwner, leaseId: reactivationLease.leaseId, credentialVersion: reactivationLease.credentialVersion, profileVersion: reactivationLease.profileVersion, outcome: "validated", outcomeCode: "validated" });
      assert.equal(reactivated.result.status, "active");
    });
    await scenario("unknown provider is rejected before profile write", () => {
      const result = app(box, "merchant_provider_profile_save", saveArgs({ operationId: "52000000-0000-4000-8000-000000000001", fingerprint: "a".repeat(64), profileId: "42000000-0000-4000-8000-000000000001", providerCode: "missing_provider", capability: "indexing" }));
      assert.equal(result.outcome, "provider_not_found");
    });
    await scenario("provider capability mismatch is rejected", () => {
      const result = app(box, "merchant_provider_profile_save", saveArgs({ operationId: "52000000-0000-4000-8000-000000000002", fingerprint: "b".repeat(64), profileId: "42000000-0000-4000-8000-000000000002", providerCode: "market_only", capability: "indexing" }));
      assert.equal(result.outcome, "provider_capability_mismatch");
    });
    await scenario("analyst cannot save or revoke profiles", () => {
      const actor = { principal: ANALYST, membership: ANALYST_MEMBERSHIP };
      assert.equal(app(box, "merchant_provider_profile_save", saveArgs({ operationId: "52000000-0000-4000-8000-000000000003", fingerprint: "c".repeat(64), profileId: "42000000-0000-4000-8000-000000000003", providerCode: "fixture_provider", capability: "marketplace_sync" }), actor).outcome, "membership_denied");
      assert.equal(app(box, "merchant_provider_profile_revoke", mutationArgs("52000000-0000-4000-8000-000000000004", "d".repeat(64), DISABLED_PROFILE, 4), actor).outcome, "membership_denied");
    });
    await scenario("wrong store cannot read rotate or revoke profile", () => {
      const actor = { store: STORE_B, principal: OWNER_B, membership: MEMBERSHIP_B };
      assert.deepEqual(app(box, "merchant_provider_profile_list", "NULL", actor).result.items, []);
      assert.equal(app(box, "merchant_provider_profile_save", saveArgs({ operationId: "52000000-0000-4000-8000-000000000005", fingerprint: "e".repeat(64), profileId: DISABLED_PROFILE, providerCode: "disabled_provider", capability: "email_delivery", expectedVersion: 4 }), actor).outcome, "profile_not_found");
      assert.equal(app(box, "merchant_provider_profile_revoke", mutationArgs("52000000-0000-4000-8000-000000000006", "f".repeat(64), DISABLED_PROFILE, 4), actor).outcome, "profile_not_found");
    });
    await scenario("inactive store is denied", () => {
      psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='suspended',updated_at='${NOW}' WHERE id='${STORE}';`);
      assert.equal(app(box, "merchant_provider_profile_list", "NULL").outcome, "store_inactive");
      psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.stores SET status='active',updated_at='${NOW}' WHERE id='${STORE}';`);
    });
    await scenario("missing integration feature is denied", () => {
      assert.equal(app(box, "merchant_provider_profile_list", "NULL", {
        store: STORE_C, principal: OWNER_C, membership: MEMBERSHIP_C,
        plan: DENIED_PLAN, planCode: "provider_denied",
      }).outcome, "feature_not_enabled");
    });
    await scenario("application cannot select or mutate profile tables", () => {
      for (const statement of [
        "SELECT * FROM saas.merchant_provider_profiles",
        `UPDATE saas.merchant_provider_profiles SET status='active' WHERE id='${DISABLED_PROFILE}'`,
        "DELETE FROM saas.merchant_provider_profile_operations",
      ]) assert.notEqual(psql(box, `SET ROLE celebix_saas_app; ${statement};`, DB, true).status, 0);
    });
    await scenario("workflow cannot create rotate revoke or directly mutate", () => {
      assert.equal(psql(box, "SELECT has_function_privilege('celebix_saas_workflow','saas.merchant_provider_profile_save(uuid,uuid,uuid,uuid,text,bigint,timestamptz,uuid,text,uuid,text,text,jsonb,text,jsonb,text,text,integer,bigint)','EXECUTE');").stdout.trim(), "f");
      assert.notEqual(psql(box, `SET ROLE celebix_saas_workflow; UPDATE saas.merchant_provider_profiles SET status='active' WHERE id='${DISABLED_PROFILE}';`, DB, true).status, 0);
    });
    await scenario("workflow validation binds profile and credential version", () => {
      assert.equal(app(box, "merchant_provider_profile_save", saveArgs({ operationId: "53000000-0000-4000-8000-000000000001", fingerprint: "1".repeat(64), profileId: VALIDATION_PROFILE, providerCode: "validation_provider", capability: "phone_delivery" })).outcome, "saved");
      const unclaimed = mark(box, { profileId: VALIDATION_PROFILE, workerId: "worker.unclaimed", leaseId: "63000000-0000-4000-8000-000000000099", credentialVersion: 1, profileVersion: 1, outcome: "validated", outcomeCode: "validated" });
      assert.equal(unclaimed.outcome, "lease_lost");
      const lease = claim(box, "worker.validation", "63000000-0000-4000-8000-000000000001").result;
      const wrong = mark(box, { profileId: lease.profileId, workerId: lease.leaseOwner, leaseId: lease.leaseId, credentialVersion: lease.credentialVersion + 1, profileVersion: lease.profileVersion, outcome: "validated", outcomeCode: "validated" });
      assert.equal(wrong.outcome, "lease_lost");
      const exact = mark(box, { profileId: lease.profileId, workerId: lease.leaseOwner, leaseId: lease.leaseId, credentialVersion: lease.credentialVersion, profileVersion: lease.profileVersion, outcome: "validated", outcomeCode: "validated" });
      assert.equal(exact.outcome, "validated");
      assert.equal(exact.result.status, "active");
    });
    await scenario("unknown validation outcome leaves pending profile unchanged", () => {
      assert.equal(app(box, "merchant_provider_profile_save", saveArgs({ operationId: "53000000-0000-4000-8000-000000000002", fingerprint: "2".repeat(64), profileId: UNKNOWN_PROFILE, providerCode: "unknown_validation_provider", capability: "whatsapp_delivery" })).outcome, "saved");
      const lease = claim(box, "worker.unknown", "63000000-0000-4000-8000-000000000002").result;
      const unknown = mark(box, { profileId: lease.profileId, workerId: lease.leaseOwner, leaseId: lease.leaseId, credentialVersion: lease.credentialVersion, profileVersion: lease.profileVersion, outcome: "unknown", outcomeCode: "provider_timeout" });
      assert.equal(unknown.outcome, "invalid_input");
      assert.equal(psql(box, `SELECT status||':'||(validation_lease_id IS NOT NULL)::text FROM saas.merchant_provider_profiles WHERE id='${UNKNOWN_PROFILE}';`).stdout.trim(), "pending_validation:true");
    });
    await scenario("concurrent create keeps one active-capability profile", async () => {
      const calls = [1, 2].map((ordinal) => saveArgs({ operationId: `54000000-0000-4000-8000-00000000000${ordinal}`, fingerprint: String(ordinal + 2).repeat(64), profileId: `44000000-0000-4000-8000-00000000000${ordinal}`, providerCode: "race_provider", capability: "marketplace_sync" }));
      const results = await Promise.all(calls.map((extra) => appAsync(box, "merchant_provider_profile_save", extra)));
      assert.deepEqual(results.map(({ outcome }) => outcome).sort(), ["invalid_transition", "saved"]);
      assert.equal(psql(box, "SELECT count(*) FROM saas.merchant_provider_profiles WHERE provider_code='race_provider' AND status<>'revoked';").stdout.trim(), "1");
    });
    await scenario("concurrent rotation keeps one credential version", async () => {
      const profile = "45000000-0000-4000-8000-000000000001";
      assert.equal(app(box, "merchant_provider_profile_save", saveArgs({ operationId: "55000000-0000-4000-8000-000000000001", fingerprint: "5".repeat(64), profileId: profile, providerCode: "rotation_provider", capability: "indexing" })).outcome, "saved");
      const calls = [2, 3].map((ordinal) => saveArgs({ operationId: `55000000-0000-4000-8000-00000000000${ordinal}`, fingerprint: String(ordinal + 4).repeat(64), profileId: profile, providerCode: "rotation_provider", capability: "indexing", expectedVersion: 1, credentialDigest: String(ordinal).repeat(64) }));
      const results = await Promise.all(calls.map((extra) => appAsync(box, "merchant_provider_profile_save", extra)));
      assert.deepEqual(results.map(({ outcome }) => outcome).sort(), ["saved", "version_conflict"]);
      assert.equal(psql(box, `SELECT credential_version||':'||version FROM saas.merchant_provider_profiles WHERE id='${profile}';`).stdout.trim(), "2:2");
    });
    await scenario("backup contains no plaintext credential", () => {
      const dump = path.join(box.root, "provider.sql");
      command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fp", "-f", dump, DB]);
      const content = readFileSync(dump, "utf8");
      assert.doesNotMatch(content, new RegExp(RAW_CREDENTIAL));
      assert.doesNotMatch(content, /apiSecret|apiPassword|accessToken/);
    });
    await scenario("restore preserves profile projections", () => {
      const dump = path.join(box.root, "provider.dump");
      command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]);
      psql(box, `CREATE DATABASE ${RESTORED};`, "postgres");
      command(box.executables.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORED, dump]);
      assert.deepEqual(app(box, "merchant_provider_profile_list", "NULL", {}, RESTORED), app(box, "merchant_provider_profile_list", "NULL"));
    });
    await scenario("migration 049 rolls back and reapplies cleanly", () => {
      apply(box, "202607250049_merchant_provider_profiles.down.sql");
      assert.equal(psql(box, "SELECT to_regclass('saas.merchant_provider_profiles') IS NULL;").stdout.trim(), "t");
      apply(box, "202607250049_merchant_provider_profiles.up.sql");
      apply(box, "202607250049_merchant_provider_profiles_assertions.sql");
    });
    await scenario("disposable PostgreSQL resources are removed", () => {
      const root = box.root;
      stop(box);
      box = undefined;
      assert.equal(existsSync(root), false);
    });
    assert.equal(count, TOTAL);
    console.log(`${TOTAL}/${TOTAL} PASS`);
  } finally {
    stop(box);
  }
}

main().catch((error) => {
  console.error(error?.stack ?? error);
  process.exitCode = 1;
});
