import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DB = `tenant_r2_media_${TOKEN}`;
const RESTORE = `${DB}_restore`;
const ROLLBACK = `${DB}_rollback`;
const STORE_A = "10000000-0000-4000-8000-000000000058";
const STORE_B = "10000000-0000-4000-8000-000000000059";
const STORE_C = "10000000-0000-4000-8000-000000000060";
const STORE_SUSPENDED = "10000000-0000-4000-8000-000000000061";
const PRINCIPAL = "20000000-0000-4000-8000-000000000058";
const MEMBERSHIP = "30000000-0000-4000-8000-000000000058";
const DOMAIN = "32000000-0000-4000-8000-000000000058";
const SUBSCRIPTION = "31000000-0000-4000-8000-000000000058";
const TENANT_OPERATION = "33000000-0000-4000-8000-000000000058";
const PLAN = "00000000-0000-4000-8000-000000000001";
const PRODUCT_A = "40000000-0000-4000-8000-000000000058";
const PRODUCT_B = "40000000-0000-4000-8000-000000000059";
const MEDIA_A = "50000000-0000-4000-8000-000000000058";
const MEDIA_CLEANUP = "50000000-0000-4000-8000-000000000059";
const OPERATION_A = "60000000-0000-4000-8000-000000000058";
const OPERATION_CLEANUP = "60000000-0000-4000-8000-000000000059";
const NOW = "2026-07-28T12:00:00.000Z";
const LATER = "2026-07-28T12:00:01.000Z";
const LATEST = "2026-07-28T12:00:02.000Z";
const AFTER_LATEST = "2026-07-28T12:00:03.000Z";
const UP = "202607280058_store_media_namespace_exports.up.sql";
const DOWN = "202607280058_store_media_namespace_exports.down.sql";
const ASSERTIONS = "202607280058_store_media_namespace_exports_assertions.sql";
const MANIFEST_FILE = "phase3-tenant-r2-media-manifest.json";
const PRIOR = JSON.parse(readFileSync(path.join(SQL, "phase3n-hosted-callback-lifecycle-manifest.json"), "utf8"));
const ONBOARDING = JSON.parse(readFileSync(path.join(SQL, "phase3-product-onboarding-manifest.json"), "utf8"));
const MANIFEST = JSON.parse(readFileSync(path.join(SQL, MANIFEST_FILE), "utf8"));
const TOTAL = 24;
let completed = 0;

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* continue */ }
  }
  return null;
}

function command(program, args, options = {}) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input: options.input,
    env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}

function commandAsync(program, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(program, args, {
      cwd: ROOT,
      env: { ...process.env, PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.once("error", reject);
    child.once("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(options.input ?? "");
  });
}

function start() {
  assertSafeEnvironment();
  const names = [...new Set([...REQUIRED_NATIVE_TOOLS, "pg_dump", "pg_restore", "createdb", "dropdb"])];
  const executables = Object.fromEntries(names.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-tenant-r2-media-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, ["-D", data, "--auth=trust", "--username=postgres", "--no-locale", "--encoding=UTF8"]);
  command(executables.pg_ctl, ["-D", data, "-o", `-k ${socket} -p ${port} -h ''`, "-l", path.join(root, "postgres.log"), "start"]);
  return { executables, root, data, socket, port, started: true };
}

function stop(box) {
  if (!box) return;
  if (box.started) command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], { allowFailure: true });
  rmSync(box.root, { recursive: true, force: true });
}

function psql(box, source, database = DB, allowFailure = false) {
  return command(box.executables.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
  ], { input: source, allowFailure });
}

async function psqlAsync(box, source, database = DB) {
  const result = await commandAsync(box.executables.psql, [
    "-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database,
  ], { input: source });
  if (result.status !== 0) throw new Error(`psql failed\n${result.stderr}`);
  return result;
}

function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(path.join(SQL, file))).digest("hex");
}

async function scenario(name, run) {
  await run();
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}

function applyBase(box, database = DB) {
  for (const artifact of PRIOR.migrationChain) {
    assert.equal(sha256(artifact.file), artifact.sha256, `prior checksum ${artifact.file}`);
    apply(box, artifact.file, database);
  }
  for (const artifact of ONBOARDING.artifacts) {
    if (artifact.direction === "up" || artifact.direction === "verify") {
      assert.equal(sha256(artifact.file), artifact.sha256, `onboarding checksum ${artifact.file}`);
      apply(box, artifact.file, database);
    }
  }
}

function namespace(store, database = DB) {
  return psql(nullBox, `SELECT store_id||'|'||namespace_prefix||'|'||status||'|'||version||'|'||to_char(created_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')||'|'||to_char(updated_at AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"') FROM saas.store_media_namespaces WHERE store_id='${store}';`, database).stdout.trim();
}

function digest(marker) { return createHash("sha256").update(marker).digest("hex"); }
function tenantPayload(operationId, mediaStorage) {
  return {
    schemaVersion: 1,
    operationId,
    replayed: false,
    store: { id: STORE_A, slug: "r2-existing", status: "active" },
    primaryDomain: { schemaVersion: 1, hostname: "r2-existing.stores.example.test", domainId: DOMAIN, domainType: "platform_subdomain", storeId: STORE_A, storeSlug: "r2-existing", canonicalHostname: "r2-existing.stores.example.test", status: "active", cacheVersion: 1 },
    membership: { schemaVersion: 1, id: MEMBERSHIP, principalId: PRINCIPAL, storeId: STORE_A, role: "store_owner", status: "active", createdAt: NOW, updatedAt: NOW },
    plan: { schemaVersion: 1, planId: PLAN, planCode: "free_starter", version: 1, status: "active", features: ["catalog","orders","customers","content","media","analytics","checkout"], limits: { products: 100, staff: 1, storageBytes: 1_000_000_000, monthlyOrders: 100, customDomains: 0 }, validFrom: "2026-01-01T00:00:00.000Z" },
    ...(mediaStorage ? { mediaStorage } : {}),
    provisioningStatus: "ready",
    panelUrl: "https://panel.example.test/",
    storefrontUrl: "https://r2-existing.stores.example.test",
  };
}
function authority(now = NOW, overrides = {}) {
  return `'${overrides.storeId ?? STORE_A}','${overrides.principalId ?? PRINCIPAL}','${overrides.membershipId ?? MEMBERSHIP}','${overrides.planId ?? PLAN}','${overrides.planCode ?? "free_starter"}',${overrides.planVersion ?? 1},${overrides.storageBytes ?? 1000000000},'${now}'`;
}
function functionOutcome(box, expression, database = DB) {
  const raw = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`, database).stdout.trim();
  return JSON.parse(raw);
}
function reserveExpression(operationId, mediaId, productId = PRODUCT_A, now = NOW, fingerprint = digest(`reserve-${operationId}`), payload = digest(`payload-${mediaId}`), variantId = null, authoritySql = authority(now), byteSize = 2048) {
  return `saas.media_reserve_product(${authoritySql},'${operationId}','${fingerprint}','${mediaId}','${productId}',${variantId ? `'${variantId}'` : "NULL"},'stores/${STORE_A}/products/${productId}/${mediaId}.webp','https://media.saas-staging.celebix.site/stores/${STORE_A}/products/${productId}/${mediaId}.webp','image/webp','Pilot',1200,1200,${byteSize},'${payload}')`;
}
function lifecycleExpression(name, operationId, mediaId, now, payload = digest(`payload-${mediaId}`)) {
  return `saas.${name}(${authority(now)},'${operationId}','${mediaId}','${PRODUCT_A}','${payload}')`;
}
function archiveReserveExpression(operationId, now = AFTER_LATEST) {
  return `saas.media_reserve_product_archive(${authority(now)},'${operationId}','${digest("archive-media-a")}','${PRODUCT_A}','${MEDIA_A}',1)`;
}
function archiveFinalizeExpression(operationId, now = AFTER_LATEST) {
  return `saas.media_finalize_product_archive(${authority(now)},'${operationId}','${digest("archive-media-a")}','${PRODUCT_A}','${MEDIA_A}',1)`;
}
function archiveRecoverExpression(operationId, now = AFTER_LATEST) {
  return `saas.media_recover_product_archive(${authority(now)},'${operationId}','${digest("archive-media-a")}','${PRODUCT_A}','${MEDIA_A}',1)`;
}
function legacyArchiveExpression(operationId, now = AFTER_LATEST) {
  return `saas.media_archive_product(${authority(now)},'${operationId}','${digest("archive-media-a")}','${PRODUCT_A}','${MEDIA_A}',1)`;
}
function archiveDeletionExpression(operationId, objectKey, now = AFTER_LATEST) {
  return `saas.media_mark_archived_object_deleted(${authority(now)},'${operationId}','${MEDIA_A}','${PRODUCT_A}','${objectKey}')`;
}

async function functionOutcomeAsync(box, expression, database = DB) {
  const result = await psqlAsync(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression};COMMIT;`, database);
  return JSON.parse(result.stdout.trim());
}

let nullBox;

async function main() {
  let box;
  let root;
  let failure;
  try {
    box = start();
    nullBox = box;
    root = box.root;
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    applyBase(box);
    psql(box, `CREATE DATABASE ${ROLLBACK} TEMPLATE ${DB};`, "postgres");
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
      VALUES
        ('${STORE_A}','R2 Existing','r2-existing','active','tr','TRY','default','${NOW}','${NOW}'),
        ('${STORE_SUSPENDED}','R2 Suspended','r2-suspended','suspended','tr','TRY','default','${NOW}','${NOW}');
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)
      VALUES('${PRINCIPAL}','https://identity.example.test/oidc','tenant-r2-owner','owner@example.test',true,'${NOW}','${NOW}');
      INSERT INTO saas.domains(id,store_id,normalized_hostname,domain_type,status,canonical,cache_version,created_at,updated_at)
      VALUES('${DOMAIN}','${STORE_A}','r2-existing.stores.example.test','platform_subdomain','active',true,1,'${NOW}','${NOW}');
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)
      VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE_A}','store_owner','active','${NOW}','${NOW}');
      INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)
      VALUES('${SUBSCRIPTION}','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01T00:00:00.000Z','${NOW}','${NOW}');
      INSERT INTO saas.tenant_operations(
        id,idempotency_key,payload_fingerprint,status,result_store_id,result_domain_id,
        result_membership_id,result_principal_id,result_subscription_id,result_plan_id,
        result_payload,requested_at,committed_at,created_at,updated_at
      ) VALUES(
        '${TENANT_OPERATION}','pre-058-tenant-snapshot','${digest("pre-058-tenant-snapshot")}',
        'committed','${STORE_A}','${DOMAIN}','${MEMBERSHIP}','${PRINCIPAL}','${SUBSCRIPTION}','${PLAN}',
        $json$${JSON.stringify(tenantPayload(TENANT_OPERATION))}$json$::jsonb,
        '${NOW}','${NOW}','${NOW}','${NOW}'
      );COMMIT;`);
    apply(box, UP);
    apply(box, ASSERTIONS);
    psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)
      VALUES('${STORE_B}','R2 New','r2-new','active','tr','TRY','default','${NOW}','${NOW}');
      INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
      ('${PRODUCT_A}','${STORE_A}','tenant-r2-a','Tenant R2 A','active','TRY',1,'${NOW}','${NOW}'),
      ('${PRODUCT_B}','${STORE_B}','tenant-r2-b','Tenant R2 B','active','TRY',1,'${NOW}','${NOW}');
      COMMIT;`);

    await scenario("PostgreSQL 16 applies the complete reviewed chain through 058", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.equal(psql(box, "SELECT to_regclass('saas.store_media_namespaces') IS NOT NULL;").stdout.trim(), "t");
    });

    await scenario("migration manifest hashes are exact", () => {
      assert.equal(MANIFEST.postgresqlMajor, 16);
      for (const artifact of MANIFEST.artifacts) assert.equal(sha256(artifact.file), artifact.sha256, artifact.file);
    });

    await scenario("pre-058 committed tenant snapshots gain an exact durable media readiness proof", () => {
      assert.equal(
        psql(box, `SELECT (result_payload #>> '{mediaStorage,schemaVersion}') || '|' || (result_payload #>> '{mediaStorage,status}') || '|' || (result_payload #>> '{mediaStorage,version}') FROM saas.tenant_operations WHERE id='${TENANT_OPERATION}';`).stdout.trim(),
        "1|ready|1",
      );
    });

    await scenario("processing tenant completion rejects a media snapshot version not backed by the active namespace", () => {
      const operationId = "33000000-0000-4000-8000-000000000059";
      psql(box, `SET ROLE celebix_saas_owner;INSERT INTO saas.tenant_operations(id,idempotency_key,payload_fingerprint,status,requested_at,created_at,updated_at) VALUES('${operationId}','wrong-media-snapshot','${digest("wrong-media-snapshot")}','processing','${NOW}','${NOW}','${NOW}');`);
      const rejected = psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.tenant_operations SET
        status='committed',result_store_id='${STORE_A}',result_domain_id='${DOMAIN}',
        result_membership_id='${MEMBERSHIP}',result_principal_id='${PRINCIPAL}',
        result_subscription_id='${SUBSCRIPTION}',result_plan_id='${PLAN}',
        result_payload=$json$${JSON.stringify(tenantPayload(operationId, { schemaVersion: 1, status: "ready", version: 2 }))}$json$::jsonb,
        committed_at='${NOW}',updated_at='${LATER}' WHERE id='${operationId}';`, DB, true);
      assert.notEqual(rejected.status, 0);
      assert.match(rejected.stderr, /TENANT_OPERATION_MEDIA_SNAPSHOT_MISMATCH/);
      assert.equal(psql(box, `SELECT status FROM saas.tenant_operations WHERE id='${operationId}';`).stdout.trim(), "processing");
    });

    await scenario("existing stores receive one exact active namespace", () => {
      assert.equal(namespace(STORE_A), `${STORE_A}|stores/${STORE_A}/|active|1|${NOW}|${NOW}`);
    });

    await scenario("non-active stores are backfilled suspended without freezing later lifecycle transitions", () => {
      assert.equal(namespace(STORE_SUSPENDED), `${STORE_SUSPENDED}|stores/${STORE_SUSPENDED}/|suspended|1|${NOW}|${NOW}`);
      psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.store_media_namespaces SET status='active',version=2,updated_at='${LATER}' WHERE store_id='${STORE_SUSPENDED}';`);
      assert.equal(namespace(STORE_SUSPENDED), `${STORE_SUSPENDED}|stores/${STORE_SUSPENDED}/|active|2|${NOW}|${LATER}`);
    });

    await scenario("bootstrap creates a second store namespace with parameter-equivalent authority", () => {
      psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_bootstrap;
        INSERT INTO saas.store_media_namespaces(store_id,namespace_prefix,status,version,created_at,updated_at)
        VALUES('${STORE_B}','stores/${STORE_B}/','active',1,'${NOW}','${NOW}');COMMIT;`);
      assert.equal(namespace(STORE_B), `${STORE_B}|stores/${STORE_B}/|active|1|${NOW}|${NOW}`);
    });

    await scenario("duplicate store and prefix authority are denied", () => {
      const duplicate = psql(box, `SET ROLE celebix_saas_bootstrap;INSERT INTO saas.store_media_namespaces(store_id,namespace_prefix,status,version,created_at,updated_at) VALUES('${STORE_B}','stores/${STORE_B}/','active',1,'${NOW}','${NOW}');`, DB, true);
      assert.notEqual(duplicate.status, 0);
    });

    await scenario("mismatched and malformed prefixes fail closed", () => {
      psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES('${STORE_C}','R2 Wrong Prefix','r2-wrong-prefix','active','tr','TRY','default','${NOW}','${NOW}');COMMIT;`);
      const wrong = psql(box, `SET ROLE celebix_saas_bootstrap;INSERT INTO saas.store_media_namespaces(store_id,namespace_prefix,status,version,created_at,updated_at) VALUES('${STORE_C}','stores/${STORE_A}/','active',1,'${NOW}','${NOW}');`, DB, true);
      assert.notEqual(wrong.status, 0);
      assert.equal(namespace(STORE_C), "");
      psql(box, `SET ROLE celebix_saas_bootstrap;INSERT INTO saas.store_media_namespaces(store_id,namespace_prefix,status,version,created_at,updated_at) VALUES('${STORE_C}','stores/${STORE_C}/','active',1,'${NOW}','${NOW}');`);
    });

    await scenario("immutable authority trigger rejects prefix and timestamp rewrites", () => {
      const update = psql(box, `SET ROLE celebix_saas_owner;UPDATE saas.store_media_namespaces SET namespace_prefix='stores/forged/',version=2,updated_at=updated_at+interval '1 second' WHERE store_id='${STORE_A}';`, DB, true);
      assert.notEqual(update.status, 0);
      assert.equal(namespace(STORE_A), `${STORE_A}|stores/${STORE_A}/|active|1|${NOW}|${NOW}`);
    });

    await scenario("app identity workflow host and PUBLIC have zero namespace DML", () => {
      const privileges = psql(box, `SELECT role_name||'|'||string_agg(privilege||':'||allowed,',' ORDER BY privilege)
        FROM (SELECT role_name,privilege,has_table_privilege(role_name,'saas.store_media_namespaces',privilege)::text AS allowed
          FROM unnest(ARRAY['celebix_saas_app','celebix_saas_identity','celebix_saas_workflow','celebix_saas_host_resolver']) role_name
          CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege) checks
        GROUP BY role_name ORDER BY role_name;`).stdout.trim();
      assert.doesNotMatch(privileges, /:true/);
      assert.equal(psql(box, `SELECT count(*) FROM pg_catalog.aclexplode((SELECT relacl FROM pg_class WHERE oid='saas.store_media_namespaces'::regclass)) WHERE grantee=0;`).stdout.trim(), "0");
    });

    await scenario("catalog assertions prove owner FORCE RLS grants and guarded search path", () => {
      apply(box, ASSERTIONS);
    });

    await scenario("media reservation derives exact key and persists one immutable digest", () => {
      const result = functionOutcome(box, reserveExpression(OPERATION_A, MEDIA_A));
      assert.equal(result.outcome, "reserved");
      assert.deepEqual(result.result, {
        operationId: OPERATION_A,
        mediaId: MEDIA_A,
        productId: PRODUCT_A,
        objectKey: `stores/${STORE_A}/products/${PRODUCT_A}/${MEDIA_A}.webp`,
        publicUrl: `https://media.saas-staging.celebix.site/stores/${STORE_A}/products/${PRODUCT_A}/${MEDIA_A}.webp`,
        mediaType: "image/webp",
        byteSize: 2048,
        payloadSha256: digest(`payload-${MEDIA_A}`),
        state: "reserved",
        version: 1,
      });
      assert.equal(functionOutcome(box, reserveExpression(OPERATION_A, MEDIA_A)).outcome, "operation_replayed");
    });

    await scenario("concurrent quota-boundary reservations serialize to one durable winner", async () => {
      psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;
        INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at)
        SELECT ('71000000-0000-4000-8000-' || lpad(series::text,12,'0'))::uuid,'${STORE_A}',
          'quota-' || series,'Quota ' || series,'active','TRY',1,'${NOW}','${NOW}'
        FROM generate_series(1,13) AS series;
        INSERT INTO saas.product_media(
          id,store_id,product_id,object_key,public_url,media_type,alt_text,width,height,
          byte_size,sort_order,status,created_at,updated_at,version
        )
        SELECT
          media_id,'${STORE_A}',product_id,
          'stores/${STORE_A}/products/' || product_id::text || '/' || media_id::text || '.webp',
          'https://media.saas-staging.celebix.site/stores/${STORE_A}/products/' || product_id::text || '/' || media_id::text || '.webp',
          'image/webp','Quota fixture',1200,1200,5000000,(series-1)%16,'active','${NOW}','${NOW}',1
        FROM (
          SELECT series,
            ('81000000-0000-4000-8000-' || lpad(series::text,12,'0'))::uuid AS media_id,
            ('71000000-0000-4000-8000-' || lpad((((series-1)/16)+1)::text,12,'0'))::uuid AS product_id
          FROM generate_series(1,198) AS series
        ) fixture;
        COMMIT;`);
      const operations = [
        ["60000000-0000-4000-8000-000000000061", "50000000-0000-4000-8000-000000000061"],
        ["60000000-0000-4000-8000-000000000062", "50000000-0000-4000-8000-000000000062"],
      ];
      const results = await Promise.all(operations.map(([operationId, mediaId]) => functionOutcomeAsync(
        box,
        reserveExpression(operationId, mediaId, PRODUCT_A, LATER, digest(`reserve-${operationId}`), digest(`payload-${mediaId}`), null, authority(LATER), 5000000),
      )));
      assert.deepEqual(results.map((result) => result.outcome).sort(), ["media_limit_reached", "reserved"]);
      assert.equal(psql(box, `SELECT count(*) FROM saas.store_media_operations WHERE operation_id IN ('${operations[0][0]}','${operations[1][0]}');`).stdout.trim(), "1");
      const winner = results.find((result) => result.outcome === "reserved").result;
      assert.equal(functionOutcome(box, lifecycleExpression("media_require_product_cleanup", winner.operationId, winner.mediaId, LATEST)).outcome, "cleanup_required");
      assert.equal(functionOutcome(box, lifecycleExpression("media_mark_product_deleted", winner.operationId, winner.mediaId, AFTER_LATEST)).outcome, "deleted");
    });

    await scenario("membership subscription feature version and limit authority fail before reservation", () => {
      const cases = [
        reserveExpression("60000000-0000-4000-8000-000000000063", "50000000-0000-4000-8000-000000000063", PRODUCT_A, LATER, undefined, undefined, null, authority(LATER, { membershipId: "30000000-0000-4000-8000-000000000099" })),
        reserveExpression("60000000-0000-4000-8000-000000000064", "50000000-0000-4000-8000-000000000064", PRODUCT_A, LATER, undefined, undefined, null, authority(LATER, { planVersion: 2 })),
        reserveExpression("60000000-0000-4000-8000-000000000065", "50000000-0000-4000-8000-000000000065", PRODUCT_A, "2025-12-31T23:59:59.000Z", undefined, undefined, null, authority("2025-12-31T23:59:59.000Z")),
        reserveExpression("60000000-0000-4000-8000-000000000066", "50000000-0000-4000-8000-000000000066", PRODUCT_A, LATER, undefined, undefined, null, authority(LATER, { storageBytes: 999 })),
        reserveExpression("60000000-0000-4000-8000-000000000067", "50000000-0000-4000-8000-000000000067", PRODUCT_A, LATER, undefined, undefined, null, authority(LATER, { planId: "00000000-0000-4000-8000-000000000099" })),
      ];
      assert.deepEqual(cases.map((expression) => functionOutcome(box, expression).outcome), [
        "membership_denied", "feature_not_enabled", "feature_not_enabled", "feature_not_enabled", "feature_not_enabled",
      ]);
      assert.equal(psql(box, `SELECT count(*) FROM saas.store_media_operations WHERE operation_id BETWEEN '60000000-0000-4000-8000-000000000063' AND '60000000-0000-4000-8000-000000000067';`).stdout.trim(), "0");
    });

    await scenario("wrong variant and changed operation fingerprint fail closed", () => {
      const wrongVariant = functionOutcome(box, reserveExpression(
        "60000000-0000-4000-8000-000000000068",
        "50000000-0000-4000-8000-000000000068",
        PRODUCT_A,
        LATER,
        undefined,
        undefined,
        "70000000-0000-4000-8000-000000000068",
      ));
      assert.equal(wrongVariant.outcome, "variant_not_found");
      assert.equal(functionOutcome(box, reserveExpression(OPERATION_A, MEDIA_A, PRODUCT_A, NOW, digest("changed-operation"))).outcome, "operation_mismatch");
    });

    await scenario("cross-store substitution and skipped lifecycle transitions fail closed", () => {
      const cross = functionOutcome(box, reserveExpression("60000000-0000-4000-8000-000000000060", "50000000-0000-4000-8000-000000000060", PRODUCT_B));
      assert.equal(cross.outcome, "product_not_found");
      const skipped = functionOutcome(box, lifecycleExpression("media_finalize_product", OPERATION_A, MEDIA_A, LATER));
      assert.equal(skipped.outcome, "operation_mismatch");
      assert.equal(psql(box, `SELECT count(*) FROM saas.product_media WHERE id='${MEDIA_A}';`).stdout.trim(), "0");
    });

    await scenario("uploaded media finalizes once and creates one active product row", () => {
      assert.equal(functionOutcome(box, lifecycleExpression("media_mark_product_uploaded", OPERATION_A, MEDIA_A, LATER)).outcome, "uploaded");
      assert.equal(functionOutcome(box, lifecycleExpression("media_finalize_product", OPERATION_A, MEDIA_A, LATEST)).outcome, "committed");
      assert.equal(functionOutcome(box, lifecycleExpression("media_finalize_product", OPERATION_A, MEDIA_A, LATEST)).outcome, "operation_replayed");
      assert.equal(psql(box, `SELECT count(*) FROM saas.product_media WHERE id='${MEDIA_A}' AND store_id='${STORE_A}' AND status='active';`).stdout.trim(), "1");
    });

    await scenario("read-only recovery returns exact durable state and rejects a wrong digest", () => {
      const recovered = functionOutcome(box, lifecycleExpression("media_recover_product_operation", OPERATION_A, MEDIA_A, LATEST));
      assert.equal(recovered.outcome, "found");
      assert.equal(recovered.result.state, "committed");
      const wrong = functionOutcome(box, lifecycleExpression("media_recover_product_operation", OPERATION_A, MEDIA_A, LATEST, digest("wrong")));
      assert.equal(wrong.outcome, "operation_mismatch");
    });

    await scenario("archived media stays charged until exact R2 deletion proof is persisted", async () => {
      const archiveOperations = [
        "60000000-0000-4000-8000-000000000069",
        "60000000-0000-4000-8000-000000000070",
      ];
      const objectKey = `stores/${STORE_A}/products/${PRODUCT_A}/${MEDIA_A}.webp`;
      assert.equal(functionOutcome(box, archiveReserveExpression(OPERATION_A)).outcome, "invalid_input");
      const reservations = await Promise.all(archiveOperations.map((operationId) =>
        functionOutcomeAsync(box, archiveReserveExpression(operationId)),
      ));
      assert.deepEqual(reservations.map((result) => result.outcome).sort(), ["media_not_found", "reserved"]);
      const winnerIndex = reservations.findIndex((result) => result.outcome === "reserved");
      const archiveOperation = archiveOperations[winnerIndex];
      const reservation = reservations[winnerIndex];
      assert.equal(reservation.result.media.status, "pending");
      assert.equal(psql(box, `SELECT count(*) FROM saas.product_media_archive_operations WHERE store_id='${STORE_A}' AND media_id='${MEDIA_A}' AND state='reserved';`).stdout.trim(), "1");
      const blockedAlt = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT * FROM saas.media_update_alt(${authority(AFTER_LATEST)},'60000000-0000-4000-8000-000000000072','${digest("blocked-archive-alt")}','${PRODUCT_A}','${MEDIA_A}',2,'Blocked during archive');COMMIT;`, DB, true);
      assert.notEqual(blockedAlt.status, 0);
      assert.match(blockedAlt.stderr, /PRODUCT_MEDIA_ARCHIVE_RESERVED/);
      const blockedReorderRestore = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.product_media SET status='active',updated_at='${AFTER_LATEST}',version=version+1 WHERE id='${MEDIA_A}';COMMIT;`, DB, true);
      assert.notEqual(blockedReorderRestore.status, 0);
      assert.match(blockedReorderRestore.stderr, /PRODUCT_MEDIA_ARCHIVE_RESERVED/);
      assert.equal(psql(box, `SELECT status||'|'||version||'|'||alt_text FROM saas.product_media WHERE id='${MEDIA_A}';`).stdout.trim(), "pending|2|Pilot");
      const recovered = functionOutcome(box, archiveRecoverExpression(archiveOperation));
      assert.equal(recovered.outcome, "found");
      assert.equal(recovered.result.media.status, "pending");
      assert.equal(functionOutcome(box, archiveFinalizeExpression(archiveOperation)).outcome, "committed");
      assert.equal(functionOutcome(box, archiveFinalizeExpression(archiveOperation)).outcome, "operation_replayed");
      const legacy = psql(box, `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT * FROM ${legacyArchiveExpression("60000000-0000-4000-8000-000000000071")};COMMIT;`, DB, true);
      assert.notEqual(legacy.status, 0);
      assert.match(legacy.stderr, /permission denied for function media_archive_product/);
      assert.equal(psql(box, `SELECT object_deleted_at IS NULL FROM saas.product_media WHERE id='${MEDIA_A}';`).stdout.trim(), "t");
      assert.equal(functionOutcome(box, archiveDeletionExpression(archiveOperation, objectKey)).outcome, "deleted");
      assert.equal(functionOutcome(box, archiveDeletionExpression(archiveOperation, objectKey)).outcome, "operation_replayed");
      assert.equal(psql(box, `SELECT object_deleted_at IS NOT NULL FROM saas.product_media WHERE id='${MEDIA_A}';`).stdout.trim(), "t");
      assert.equal(psql(box, `SELECT state FROM saas.product_media_archive_operations WHERE operation_id='${archiveOperation}';`).stdout.trim(), "deleted");
      const wrongKey = functionOutcome(box, archiveDeletionExpression(archiveOperation, `stores/${STORE_A}/products/${PRODUCT_A}/50000000-0000-4000-8000-000000000099.webp`));
      assert.equal(wrongKey.outcome, "operation_mismatch");
    });

    await scenario("cleanup proof follows reserved to cleanup-required to deleted only", () => {
      assert.equal(functionOutcome(box, reserveExpression(OPERATION_CLEANUP, MEDIA_CLEANUP)).outcome, "reserved");
      assert.equal(functionOutcome(box, lifecycleExpression("media_require_product_cleanup", OPERATION_CLEANUP, MEDIA_CLEANUP, LATER)).outcome, "cleanup_required");
      assert.equal(functionOutcome(box, lifecycleExpression("media_mark_product_deleted", OPERATION_CLEANUP, MEDIA_CLEANUP, LATEST)).outcome, "deleted");
      assert.equal(functionOutcome(box, lifecycleExpression("media_mark_product_uploaded", OPERATION_CLEANUP, MEDIA_CLEANUP, LATEST)).outcome, "operation_mismatch");
    });

    await scenario("backup and restore preserve exact namespace authority", () => {
      const dump = path.join(box.root, "tenant-r2-media.dump");
      command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]);
      command(box.executables.createdb, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", RESTORE]);
      command(box.executables.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORE, dump]);
      apply(box, ASSERTIONS, RESTORE);
      assert.equal(namespace(STORE_A, RESTORE), `${STORE_A}|stores/${STORE_A}/|active|1|${NOW}|${NOW}`);
    });

    await scenario("empty disposable rollback and reapply are dependency safe", () => {
      apply(box, UP, ROLLBACK);
      apply(box, ASSERTIONS, ROLLBACK);
      apply(box, DOWN, ROLLBACK);
      assert.equal(psql(box, "SELECT to_regclass('saas.store_media_namespaces') IS NULL;", ROLLBACK).stdout.trim(), "t");
      apply(box, UP, ROLLBACK);
      apply(box, ASSERTIONS, ROLLBACK);
    });
  } catch (error) {
    failure = error;
  } finally {
    stop(box);
  }
  if (failure) throw failure;
  assert.ok(root);
  try { accessSync(root); assert.fail("disposable root remains"); } catch (error) {
    assert.equal(error.code, "ENOENT");
  }
  completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} disposable PostgreSQL cleanup is complete\n`);
  assert.equal(completed, TOTAL);
  process.stdout.write(`PASS — TENANT_R2_MEDIA_POSTGRES ${completed}/${TOTAL}\n`);
}

await main();
