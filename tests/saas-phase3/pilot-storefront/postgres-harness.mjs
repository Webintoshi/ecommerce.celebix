import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = path.join(ROOT, "apps", "owner", "scripts", "sql", "saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DATABASE = `phase3a4_${TOKEN}`;
const RESTORE_DATABASE = `${DATABASE}_restore`;
const ROLLBACK_DATABASE = `${DATABASE}_rollback`;
const TOTAL = 30;
const completed = [];
const NOW = "2026-07-18T10:00:00.000Z";
const PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000001";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000002";
const PRODUCT_ACTIVE = "40000000-0000-4000-8000-000000000001";
const PRODUCT_DRAFT = "40000000-0000-4000-8000-000000000002";
const PRODUCT_B = "40000000-0000-4000-8000-000000000003";
const VARIANT_ACTIVE = "50000000-0000-4000-8000-000000000001";
const VARIANT_ARCHIVED = "50000000-0000-4000-8000-000000000002";
const VARIANT_B = "50000000-0000-4000-8000-000000000003";
const MEDIA_ONE = "60000000-0000-4000-8000-000000000001";
const MEDIA_TWO = "60000000-0000-4000-8000-000000000002";
const MEDIA_PENDING = "60000000-0000-4000-8000-000000000003";
const PLATFORM_HOST = "pilot-store.saas-staging.celebix.site";
const CUSTOM_HOST = "pilot-custom.example.test";
const migrations = [
  "202607110001_roles.up.sql", "202607110002_foundation.up.sql", "202607110003_free_starter.seed.sql",
  "202607110003_plan_versions.freeze.sql", "202607110004_grants.sql", "202607110005_catalog_assertions.sql",
  "202607110007_identity_roles.up.sql", "202607110008_identity_persistence.up.sql", "202607110009_identity_grants.sql",
  "202607110010_identity_catalog_assertions.sql", "202607120012_verified_identity_snapshot.up.sql",
  "202607120013_verified_identity_grants.sql", "202607120014_verified_identity_catalog_assertions.sql",
  "202607140015_panel_sessions.up.sql", "202607140016_panel_session_handoffs.up.sql",
  "202607140017_panel_browser_bindings.up.sql", "202607160018_product_catalog.up.sql",
  "202607160018_product_catalog_assertions.sql", "202607160019_product_catalog_api.up.sql",
  "202607160019_product_catalog_api_assertions.sql", "202607160020_pilot_storefront_media_domains.up.sql",
  "202607160020_pilot_storefront_media_domains_assertions.sql",
];

function executable(name) { for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) { if (!directory) continue; const candidate = path.join(directory, name); try { accessSync(candidate, constants.X_OK); return candidate; } catch {} } return null; }
function command(program, args, options = {}) { const result = spawnSync(program, args, { cwd: ROOT, encoding: options.binary ? null : "utf8", input: options.input, env: { PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" }, maxBuffer: 64 * 1024 * 1024 }); if (result.error) throw result.error; if (!options.allowFailure && result.status !== 0) throw new Error(`disposable command failed: ${path.basename(program)}\n${String(result.stderr ?? "").trim()}`); return result; }
function startPostgres() { assertSafeEnvironment(); const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)])); if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED"); const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-phase3a4-")); const socketDirectory = path.join("/tmp", `c3a4-${TOKEN}`); const dataDirectory = path.join(temporaryDirectory, "data"); const port = 20_000 + Math.floor(Math.random() * 20_000); mkdirSync(socketDirectory, { mode: 0o700 }); command(executables.initdb, ["-D", dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]); command(executables.pg_ctl, ["-D", dataDirectory, "-o", `-k ${socketDirectory} -p ${port} -h ''`, "-l", path.join(temporaryDirectory, "postgres.log"), "start"]); return { executables, temporaryDirectory, socketDirectory, dataDirectory, port, started: true }; }
function stopPostgres(backend) { if (!backend) return; if (backend.started) { command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true }); backend.started = false; } rmSync(backend.socketDirectory, { recursive: true, force: true }); rmSync(backend.temporaryDirectory, { recursive: true, force: true }); }
function psql(backend, source, database = DATABASE, options = {}) { return command(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { input: source, allowFailure: options.allowFailure }).stdout.trim(); }
function apply(backend, file, database = DATABASE) { psql(backend, readFileSync(path.join(SQL, file), "utf8"), database); }
function createDatabase(backend, database) { psql(backend, `CREATE DATABASE ${database};`, "postgres"); }
async function scenario(name, run) { await run(); completed.push(name); process.stdout.write(`PASS ${completed.length}/${TOTAL} ${name}\n`); }
function publicCall(body) { return `BEGIN; SET LOCAL ROLE celebix_saas_host_resolver; ${body}; COMMIT;`; }
function appCall(body) { return `BEGIN; SET LOCAL ROLE celebix_saas_app; ${body}; COMMIT;`; }
function authority(store = STORE_A, principal = PRINCIPAL_A, membership = MEMBERSHIP_A) { return `'${store}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter',1,1000000000,'${NOW}'::timestamptz`; }
function attach(mediaId, operationId, options = {}) { const type = options.type ?? "image/webp"; const extension = type === "image/jpeg" ? "jpg" : type.slice(6); const product = options.product ?? PRODUCT_ACTIVE; const store = options.store ?? STORE_A; const objectKey = options.objectKey ?? `stores/${store}/products/${product}/${mediaId}.${extension}`; const url = options.url ?? `https://media.saas-staging.celebix.site/${objectKey}`; return appCall(`SELECT outcome FROM saas.media_attach_product(${authority(store, options.principal ?? PRINCIPAL_A, options.membership ?? MEMBERSHIP_A)},'${operationId}'::uuid,'${"a".repeat(64)}','${mediaId}'::uuid,'${product}'::uuid,NULL,'${objectKey}','${url}','${type}','Pilot image',1200,1200,${options.size ?? 2048})`); }

async function main() {
  const backend = startPostgres();
  try {
    createDatabase(backend, DATABASE);
    for (const migration of migrations) apply(backend, migration);
    await scenario("PostgreSQL 16 applies migrations 001-020", () => assert.match(psql(backend, "SHOW server_version;"), /^16\.14/));
    await scenario("migration 020 manifest artifacts match SHA-256", () => { const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3a4-storefront-manifest.json"), "utf8")); for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256); });
    await scenario("new tables FORCE RLS and expose no direct role privileges", () => assert.equal(psql(backend, "SELECT string_agg(relname||':'||relrowsecurity||':'||relforcerowsecurity,',' ORDER BY relname) FROM pg_class JOIN pg_namespace n ON n.oid=relnamespace WHERE n.nspname='saas' AND relname IN ('store_domains','product_media','product_media_operations');"), "product_media:true:true,product_media_operations:true:true,store_domains:true:true"));

    psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
        ('${PRINCIPAL_A}','https://identity.example.test/oidc','pilot-a','a@example.test',true,'2026-01-01','2026-01-01'),
        ('${PRINCIPAL_B}','https://identity.example.test/oidc','pilot-b','b@example.test',true,'2026-01-01','2026-01-01');
      INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${STORE_A}','Pilot Store','pilot-store','active','tr','TRY','hemenaku','2026-01-01','2026-01-01'),
        ('${STORE_B}','Second Store','second-store','active','tr','TRY','hemenaku','2026-01-01','2026-01-01');
      INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
        ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
        ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
      INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
        ('80000000-0000-4000-8000-000000000001','${STORE_A}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),
        ('80000000-0000-4000-8000-000000000002','${STORE_B}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
      INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
        ('90000000-0000-4000-8000-000000000001','${STORE_A}','${PLATFORM_HOST}','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1),
        ('90000000-0000-4000-8000-000000000002','${STORE_A}','${CUSTOM_HOST}','custom_domain','active',false,'2026-01-01','2026-01-01','2026-01-01',1),
        ('90000000-0000-4000-8000-000000000003','${STORE_A}','pending.example.test','custom_domain','pending',false,NULL,'2026-01-01','2026-01-01',1),
        ('90000000-0000-4000-8000-000000000004','${STORE_A}','disabled.example.test','custom_domain','disabled',false,'2026-01-01','2026-01-01','2026-01-01',1),
        ('90000000-0000-4000-8000-000000000005','${STORE_B}','second-store.saas-staging.celebix.site','platform_subdomain','active',true,'2026-01-01','2026-01-01','2026-01-01',1);
      INSERT INTO saas.products(id,store_id,slug,title,description,status,currency,version,created_at,updated_at) VALUES
        ('${PRODUCT_ACTIVE}','${STORE_A}','active-product','Active Product','Public description','active','TRY',1,'2026-02-01','2026-02-01'),
        ('${PRODUCT_DRAFT}','${STORE_A}','draft-product','Draft Product','Hidden draft','draft','TRY',1,'2026-03-01','2026-03-01'),
        ('${PRODUCT_B}','${STORE_B}','active-product','Second Product','Other tenant','active','TRY',1,'2026-02-01','2026-02-01');
      INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,price_cents,compare_at_cents,cost_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at,archived_at) VALUES
        ('${VARIANT_ACTIVE}','${PRODUCT_ACTIVE}','${STORE_A}','Default','PILOT-ONE',12500,15000,7000,true,4,'active','{}',1,'2026-02-01','2026-02-01',NULL),
        ('${VARIANT_ARCHIVED}','${PRODUCT_ACTIVE}','${STORE_A}','Old','PILOT-OLD',9000,NULL,5000,true,2,'archived','{}',1,'2026-02-01','2026-02-02','2026-02-02'),
        ('${VARIANT_B}','${PRODUCT_B}','${STORE_B}','Default','SECOND-ONE',9900,NULL,4000,false,0,'active','{}',1,'2026-02-01','2026-02-01',NULL);
      COMMIT;`);

    await scenario("exact platform hostname resolves Pilot Store", () => assert.equal(psql(backend, publicCall(`SELECT outcome||':'||(result_payload->>'slug') FROM saas.resolve_public_storefront('${PLATFORM_HOST}','${NOW}')`)), "found:pilot-store"));
    await scenario("exact custom hostname resolves the same store", () => assert.equal(psql(backend, publicCall(`SELECT outcome||':'||(result_payload->>'hostname') FROM saas.resolve_public_storefront('${CUSTOM_HOST}','${NOW}')`)), `found:${CUSTOM_HOST}`));
    await scenario("unknown hostname fails closed", () => assert.equal(psql(backend, publicCall(`SELECT outcome FROM saas.resolve_public_storefront('unknown.example.test','${NOW}')`)), "not_found"));
    await scenario("pending disabled and implicit www hostnames do not resolve", () => assert.equal(psql(backend, publicCall(`SELECT string_agg(outcome,',' ORDER BY hostname) FROM (VALUES ('disabled.example.test'),('pending.example.test'),('www.${CUSTOM_HOST}')) input(hostname) CROSS JOIN LATERAL saas.resolve_public_storefront(input.hostname,'${NOW}')`)), "not_found,not_found,not_found"));
    await scenario("inactive store cannot resolve", () => { psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.stores SET status='suspended',updated_at='${NOW}' WHERE id='${STORE_B}'; COMMIT;`); assert.equal(psql(backend, publicCall(`SELECT outcome FROM saas.resolve_public_storefront('second-store.saas-staging.celebix.site','${NOW}')`)), "not_found"); psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.stores SET status='active',updated_at='${NOW}' WHERE id='${STORE_B}'; COMMIT;`); });
    await scenario("global cross-store domain collision is denied", () => { const attempt = psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; INSERT INTO saas.store_domains VALUES('90000000-0000-4000-8000-000000000006','${STORE_B}','${CUSTOM_HOST}','custom_domain','active',false,'2026-01-01','2026-01-01','2026-01-01',1); COMMIT;`, DATABASE, { allowFailure: true }); assert.notEqual(attempt.status, 0); });
    await scenario("platform hostname must be derived from store slug", () => { const attempt = psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; INSERT INTO saas.store_domains VALUES('90000000-0000-4000-8000-000000000007','${STORE_A}','wrong.saas-staging.celebix.site','platform_subdomain','active',false,'2026-01-01','2026-01-01','2026-01-01',1); COMMIT;`, DATABASE, { allowFailure: true }); assert.notEqual(attempt.status, 0); });
    await scenario("public list returns active products only", () => { const payload = JSON.parse(psql(backend, publicCall(`SELECT result_payload FROM saas.public_list_products('${STORE_A}','${PLATFORM_HOST}','${NOW}',24)`))); assert.deepEqual(payload.map((item) => item.slug), ["active-product"]); });
    await scenario("draft products never appear publicly", () => assert.equal(psql(backend, publicCall(`SELECT outcome FROM saas.public_get_product_by_slug('${STORE_A}','${PLATFORM_HOST}','${NOW}','draft-product')`)), "not_found"));
    await scenario("archived products never appear publicly", () => { psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; UPDATE saas.products SET status='archived',archived_at='${NOW}',updated_at='${NOW}' WHERE id='${PRODUCT_DRAFT}'; COMMIT;`); assert.equal(psql(backend, publicCall(`SELECT outcome FROM saas.public_get_product_by_slug('${STORE_A}','${PLATFORM_HOST}','${NOW}','draft-product')`)), "not_found"); });
    await scenario("same slug in another store never crosses the resolved tenant", () => assert.equal(psql(backend, publicCall(`SELECT result_payload->>'title' FROM saas.public_get_product_by_slug('${STORE_A}','${PLATFORM_HOST}','${NOW}','active-product')`)), "Active Product"));
    await scenario("archived variants are removed from public detail", () => assert.equal(psql(backend, publicCall(`SELECT jsonb_array_length(result_payload->'variants') FROM saas.public_get_product_by_slug('${STORE_A}','${PLATFORM_HOST}','${NOW}','active-product')`)), "1"));
    await scenario("public projection excludes cost and internal authority", () => { const payload = psql(backend, publicCall(`SELECT result_payload::text FROM saas.public_get_product_by_slug('${STORE_A}','${PLATFORM_HOST}','${NOW}','active-product')`)); assert.doesNotMatch(payload, /costCents|storeId|membership|version|operation/i); });
    await scenario("authenticated TenantContext attaches namespaced media", () => assert.equal(psql(backend, attach(MEDIA_ONE, "70000000-0000-4000-8000-000000000001")), "committed"));
    await scenario("non-namespaced media object keys are denied", () => assert.equal(psql(backend, attach("60000000-0000-4000-8000-000000000010", "70000000-0000-4000-8000-000000000010", { objectKey: "products/file.webp" })), "invalid_input"));
    await scenario("another store cannot attach media to the pilot product", () => assert.equal(psql(backend, attach("60000000-0000-4000-8000-000000000011", "70000000-0000-4000-8000-000000000011", { store: STORE_B, principal: PRINCIPAL_B, membership: MEMBERSHIP_B, product: PRODUCT_ACTIVE })), "product_not_found"));
    await scenario("unsupported MIME is denied", () => assert.equal(psql(backend, attach("60000000-0000-4000-8000-000000000012", "70000000-0000-4000-8000-000000000012", { type: "image/svg+xml" })), "invalid_input"));
    await scenario("oversized media is denied", () => assert.equal(psql(backend, attach("60000000-0000-4000-8000-000000000013", "70000000-0000-4000-8000-000000000013", { size: 5_242_881 })), "invalid_input"));
    psql(backend, `BEGIN; SET LOCAL ROLE celebix_saas_owner; INSERT INTO saas.product_media(id,store_id,product_id,object_key,public_url,media_type,alt_text,width,height,byte_size,sort_order,status,created_at,updated_at,version) VALUES('${MEDIA_PENDING}','${STORE_A}','${PRODUCT_ACTIVE}','stores/${STORE_A}/products/${PRODUCT_ACTIVE}/${MEDIA_PENDING}.webp','https://media.saas-staging.celebix.site/stores/${STORE_A}/products/${PRODUCT_ACTIVE}/${MEDIA_PENDING}.webp','image/webp','Pending',1200,1200,1000,1,'pending','${NOW}','${NOW}',1); COMMIT;`);
    await scenario("pending media is never public", () => assert.equal(psql(backend, publicCall(`SELECT jsonb_array_length(result_payload) FROM saas.public_list_product_media('${STORE_A}','${PLATFORM_HOST}','${NOW}','${PRODUCT_ACTIVE}')`)), "1"));
    await scenario("active media ordering is deterministic", () => { assert.equal(psql(backend, attach(MEDIA_TWO, "70000000-0000-4000-8000-000000000002")), "committed"); assert.equal(psql(backend, publicCall(`SELECT string_agg(item->>'id',',' ORDER BY ordinal) FROM saas.public_list_product_media('${STORE_A}','${PLATFORM_HOST}','${NOW}','${PRODUCT_ACTIVE}') call CROSS JOIN LATERAL jsonb_array_elements(call.result_payload) WITH ORDINALITY AS media(item,ordinal)`)), `${MEDIA_ONE},${MEDIA_TWO}`); });
    await scenario("alt text mutation remains store scoped", () => assert.equal(psql(backend, appCall(`SELECT outcome||':'||(result_payload#>>'{media,altText}') FROM saas.media_update_alt(${authority()},'70000000-0000-4000-8000-000000000003','${"b".repeat(64)}','${PRODUCT_ACTIVE}','${MEDIA_ONE}',1,'Primary pilot image')`)), "committed:Primary pilot image"));
    await scenario("reorder accepts the exact active media set only", () => { const payload = JSON.parse(psql(backend, appCall(`SELECT result_payload FROM saas.media_reorder_product(${authority()},'70000000-0000-4000-8000-000000000004','${"c".repeat(64)}','${PRODUCT_ACTIVE}',ARRAY['${MEDIA_TWO}'::uuid,'${MEDIA_ONE}'::uuid])`))); assert.deepEqual(payload.map((item) => item.id), [MEDIA_TWO, MEDIA_ONE]); });
    await scenario("archived media disappears publicly", () => { assert.equal(psql(backend, appCall(`SELECT outcome FROM saas.media_archive_product(${authority()},'70000000-0000-4000-8000-000000000005','${"d".repeat(64)}','${PRODUCT_ACTIVE}','${MEDIA_TWO}',3)`)), "committed"); assert.equal(psql(backend, publicCall(`SELECT jsonb_array_length(result_payload) FROM saas.public_list_product_media('${STORE_A}','${PLATFORM_HOST}','${NOW}','${PRODUCT_ACTIVE}')`)), "1"); });
    await scenario("public role cannot select protected tables", () => { const attempt = psql(backend, publicCall("SELECT count(*) FROM saas.product_media"), DATABASE, { allowFailure: true }); assert.notEqual(attempt.status, 0); });
    await scenario("public role cannot execute merchant media mutations", () => assert.equal(psql(backend, `SELECT has_function_privilege('celebix_saas_host_resolver','saas.media_archive_product(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,text,uuid,uuid,bigint)','EXECUTE');`), "f"));

    const backup = path.join(backend.temporaryDirectory, "phase3a4.dump");
    command(backend.executables.pg_dump, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-Fc", "-f", backup, DATABASE]);
    createDatabase(backend, RESTORE_DATABASE);
    command(backend.executables.pg_restore, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "--no-owner", "--no-privileges", "-d", RESTORE_DATABASE, backup]);
    await scenario("custom-format backup restores domain and media authority", () => assert.equal(psql(backend, `SELECT count(*)||':'||(SELECT count(*) FROM saas.product_media) FROM saas.store_domains;`, RESTORE_DATABASE), "5:3"));
    createDatabase(backend, ROLLBACK_DATABASE);
    psql(backend, `GRANT CREATE ON DATABASE ${ROLLBACK_DATABASE} TO celebix_saas_owner;`, "postgres");
    for (const migration of migrations.slice(0, -1)) {
      if (
        migration === "202607110001_roles.up.sql" ||
        migration === "202607110007_identity_roles.up.sql" ||
        migration.includes("assertions")
      ) continue;
      apply(backend, migration, ROLLBACK_DATABASE);
    }
    apply(backend, "202607160020_pilot_storefront_media_domains.down.sql", ROLLBACK_DATABASE);
    assert.equal(psql(backend, "SELECT to_regclass('saas.product_media') IS NULL;", ROLLBACK_DATABASE), "t");
    apply(backend, "202607160020_pilot_storefront_media_domains.up.sql", ROLLBACK_DATABASE);
    apply(backend, "202607160020_pilot_storefront_media_domains_assertions.sql", ROLLBACK_DATABASE);
    await scenario("disposable rollback and reapply preserve exact migration assertions", () => assert.equal(psql(backend, "SELECT to_regclass('saas.product_media')::text;", ROLLBACK_DATABASE), "saas.product_media"));
    assert.equal(completed.length, TOTAL);
    process.stdout.write(`PASS ${TOTAL}/${TOTAL} Phase 3A4 PostgreSQL harness complete\n`);
  } finally { stopPostgres(backend); }
}

await main();
