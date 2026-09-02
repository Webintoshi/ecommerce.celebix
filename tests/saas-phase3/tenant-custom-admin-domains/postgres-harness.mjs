import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import {
  accessSync,
  constants,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  REQUIRED_APPLY_ORDER,
  REQUIRED_NATIVE_TOOLS,
  assertSafeEnvironment,
} from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = `admin_domains_${randomBytes(5).toString("hex")}`;
const NOW = "2026-09-02T12:00:00.000Z";
const STORE = "20000000-0000-4000-8000-000000000120",
  OTHER = "20000000-0000-4000-8000-000000000121",
  PRINCIPAL = "10000000-0000-4000-8000-000000000120",
  MEMBERSHIP = "30000000-0000-4000-8000-000000000120",
  PLAN = "00000000-0000-4000-8000-000000000001",
  PLATFORM = "40000000-0000-4000-8000-000000000120",
  CUSTOM = "40000000-0000-4000-8000-000000000121";
let completed = 0;
function executable(name) {
  for (const directory of [
    PG16,
    ...(process.env.PATH ?? "").split(path.delimiter),
  ]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
  }
  return null;
}
function command(program, args, input = "", allowFailure = false) {
  const result = spawnSync(program, args, {
    cwd: ROOT,
    encoding: "utf8",
    input,
    env: {
      ...process.env,
      PATH: `${PG16}:${process.env.PATH ?? ""}`,
      LC_ALL: "C",
      LANG: "C",
    },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!allowFailure && result.status !== 0)
    throw new Error(`${path.basename(program)} failed\n${result.stderr}`);
  return result;
}
function start() {
  assertSafeEnvironment();
  const tools = Object.fromEntries(
    REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]),
  );
  if (Object.values(tools).some((value) => !value))
    throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync("/tmp/celebix-admin-domain-");
  const data = path.join(root, "data"),
    socket = path.join(root, "socket"),
    port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(tools.initdb, [
    "-D",
    data,
    "--auth=trust",
    "--username=postgres",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  command(tools.pg_ctl, [
    "-D",
    data,
    "-o",
    `-k ${socket} -p ${port} -h ''`,
    "-l",
    path.join(root, "postgres.log"),
    "start",
  ]);
  return { tools, root, data, socket, port };
}
function stop(box) {
  if (!box) return;
  command(box.tools.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], "", true);
  rmSync(box.root, { recursive: true, force: true });
}
function psql(box, sql, database = DB, allowFailure = false) {
  return command(
    box.tools.psql,
    [
      "-h",
      box.socket,
      "-p",
      String(box.port),
      "-X",
      "-qAt",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
    ],
    sql,
    allowFailure,
  ).stdout.trim();
}
function apply(box, file, owner = false) {
  const sql = readFileSync(path.join(SQL, file), "utf8");
  try {
    psql(
      box,
      owner
        ? sql
        : `SET SESSION AUTHORIZATION celebix_saas_migrator;\n${sql}\nRESET SESSION AUTHORIZATION;`,
    );
  } catch (caught) {
    throw new Error(
      `${file}: ${caught instanceof Error ? caught.message : "failed"}`,
    );
  }
}
function base(box) {
  apply(box, REQUIRED_APPLY_ORDER[0], true);
  for (const file of REQUIRED_APPLY_ORDER.slice(1)) apply(box, file);
  apply(box, "202607110007_identity_roles.up.sql", true);
  for (const file of [
    "202607110008_identity_persistence.up.sql",
    "202607110009_identity_grants.sql",
    "202607110010_identity_catalog_assertions.sql",
    "202607120012_verified_identity_snapshot.up.sql",
    "202607120013_verified_identity_grants.sql",
    "202607120014_verified_identity_catalog_assertions.sql",
    "202607140015_panel_sessions.up.sql",
    "202607140016_panel_session_handoffs.up.sql",
    "202607140017_panel_browser_bindings.up.sql",
    "202607160018_product_catalog.up.sql",
    "202607160018_product_catalog_assertions.sql",
    "202607160019_product_catalog_api.up.sql",
    "202607160019_product_catalog_api_assertions.sql",
    "202607160020_pilot_storefront_media_domains.up.sql",
    "202607160020_pilot_storefront_media_domains_assertions.sql",
    "202607300069_tenant_admin_domains_and_principal_logout.up.sql",
    "202607300069_tenant_admin_domains_and_principal_logout_assertions.sql",
    "202607300071_returning_login_admin_host.up.sql",
    "202607300071_returning_login_admin_host_assertions.sql",
    "202607300072_panel_store_options.up.sql",
    "202607300072_panel_store_options_assertions.sql",
  ])
    apply(
      box,
      file,
      file === "202607160020_pilot_storefront_media_domains_assertions.sql",
    );
  psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_owner;CREATE FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text) RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,saas AS $$ SELECT NULL::text $$;REVOKE ALL ON FUNCTION saas.merchant_action_authority_error(uuid,uuid,uuid,uuid,text,bigint,timestamptz,text,text) FROM PUBLIC;COMMIT;`,
  );
}
function scenario(name, run) {
  run();
  completed += 1;
  process.stdout.write(`PASS ${completed} ${name}\n`);
}
function resolve(box, host) {
  const raw = psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_host_resolver;SELECT jsonb_build_object('outcome',outcome,'authority',authority) FROM saas.resolve_public_admin_brand('${host}','${NOW}');COMMIT;`,
  );
  return JSON.parse(raw);
}
function authority() {
  return `'${STORE}'::uuid,'${PRINCIPAL}'::uuid,'${MEMBERSHIP}'::uuid,'${PLAN}'::uuid,'free_starter'::text,1::bigint,'${NOW}'::timestamptz`;
}

function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    base(box);
    scenario(
      "PostgreSQL 16 target base through tenant admin auth is available",
      () => assert.match(psql(box, "SHOW server_version;"), /^16[.]/),
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${PRINCIPAL}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01');INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${STORE}','Guzide','guzide-kuyumcu-4','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${OTHER}','Other','other-store','active','tr','TRY','starter','2026-01-01','2026-01-01');INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${MEMBERSHIP}','${PRINCIPAL}','${STORE}','store_owner','active','2026-01-01','2026-01-01');INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('a0000000-0000-4000-8000-000000000120','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');COMMIT;BEGIN;SET LOCAL ROLE celebix_saas_bootstrap;SELECT outcome FROM saas.provision_canonical_admin_domain('${PLATFORM}','${STORE}','guzide-kuyumcu-4.admin.saas-staging.celebix.site','${NOW}');COMMIT;`,
    );
    scenario(
      "old application and old schema resolve the platform admin host",
      () =>
        assert.equal(
          resolve(box, "guzide-kuyumcu-4.admin.saas-staging.celebix.site")
            .outcome,
          "resolved",
        ),
    );
    apply(box, "202609020120_tenant_custom_admin_domains.up.sql");
    apply(box, "202609020120_tenant_custom_admin_domains_assertions.sql", true);
    scenario(
      "old application and migration 120 schema preserve platform resolution",
      () =>
        assert.equal(
          resolve(box, "guzide-kuyumcu-4.admin.saas-staging.celebix.site")
            .authority.canonicalAdminOrigin,
          "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site",
        ),
    );
    const prepared = JSON.parse(
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.merchant_admin_domain_prepare_create(${authority()},'70000000-0000-4000-8000-000000000120','${"a".repeat(64)}','${CUSTOM}','admin.guzidekuyumcu.com.tr','cloudflare_for_saas','customers.saas-staging.celebix.site');COMMIT;`,
      ),
    );
    scenario(
      "new application prepares one store-bound custom admin hostname",
      () => {
        assert.equal(prepared.outcome, "prepared");
        assert.equal(prepared.payload.status, "pending_verification");
      },
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.merchant_admin_domain_bind_provider(${authority()},'${CUSTOM}',1,'cf-host-120','[]','[]');COMMIT;`,
    );
    const claim = JSON.parse(
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT result_payload FROM saas.admin_domain_work_claim('admin-worker-120','${NOW}','2026-09-02T12:00:30Z',1,'80000000-0000-4000-8000-000000000120');COMMIT;`,
      ),
    ).items[0];
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT outcome FROM saas.admin_domain_work_complete('${CUSTOM}','${claim.leaseId}','admin-worker-120','${NOW}','active','active','ready','ready',NULL,'2026-09-03');COMMIT;`,
    );
    scenario(
      "leased DNS TLS and origin readiness activate only the admin alias",
      () =>
        assert.equal(
          psql(
            box,
            `SELECT status||':'||dns_status||':'||ssl_status FROM saas.admin_domains WHERE id='${CUSTOM}';`,
          ),
          "active:ready:active",
        ),
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.merchant_admin_domain_make_primary(${authority()},'${CUSTOM}',4);COMMIT;`,
    );
    scenario(
      "one custom primary coexists with one active platform fallback",
      () =>
        assert.equal(
          psql(
            box,
            `SELECT count(*)||':'||count(*)FILTER(WHERE canonical)||':'||count(*)FILTER(WHERE kind='platform_subdomain' AND status='active') FROM saas.admin_domains WHERE store_id='${STORE}';`,
          ),
          "2:1:1",
        ),
    );
    scenario(
      "both requested hostnames resolve the same store and custom canonical origin",
      () => {
        for (const host of [
          "admin.guzidekuyumcu.com.tr",
          "guzide-kuyumcu-4.admin.saas-staging.celebix.site",
        ]) {
          const value = resolve(box, host);
          assert.equal(value.outcome, "resolved");
          assert.equal(value.authority.storeSlug, "guzide-kuyumcu-4");
          assert.equal(
            value.authority.canonicalAdminOrigin,
            "https://admin.guzidekuyumcu.com.tr",
          );
        }
      },
    );
    scenario("global admin hostname collision across tenants is denied", () =>
      assert.notEqual(
        command(
          box.tools.psql,
          [
            "-h",
            box.socket,
            "-p",
            String(box.port),
            "-X",
            "-qAt",
            "-v",
            "ON_ERROR_STOP=1",
            "-U",
            "postgres",
            "-d",
            DB,
          ],
          `BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.admin_domains(id,store_id,hostname,kind,status,canonical,version,created_at,updated_at)VALUES('40000000-0000-4000-8000-000000000122','${OTHER}','admin.guzidekuyumcu.com.tr','platform_subdomain','active',false,1,'${NOW}','${NOW}');COMMIT;`,
          true,
        ).status,
        0,
      ),
    );
    scenario("storefront hostname cannot be claimed as admin authority", () => {
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version)VALUES('50000000-0000-4000-8000-000000000120','${STORE}','admin.shop.example.test','custom_domain','active',true,'${NOW}','${NOW}','${NOW}',1);COMMIT;`,
      );
      const result = psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.merchant_admin_domain_prepare_create(${authority()},'70000000-0000-4000-8000-000000000121','${"b".repeat(64)}','40000000-0000-4000-8000-000000000123','admin.shop.example.test','cloudflare_for_saas','customers.saas-staging.celebix.site');COMMIT;`,
      );
      assert.equal(result, "hostname_already_claimed");
    });
    const recheckVersion = psql(
      box,
      `SELECT version FROM saas.admin_domains WHERE id='${CUSTOM}';`,
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.merchant_admin_domain_request_recheck(${authority()},'${CUSTOM}',${recheckVersion});COMMIT;`,
    );
    const degradationClaim = JSON.parse(
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT result_payload FROM saas.admin_domain_work_claim('admin-worker-degraded','${NOW}','2026-09-02T12:00:30Z',1,'80000000-0000-4000-8000-000000000121');COMMIT;`,
      ),
    ).items[0];
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT outcome FROM saas.admin_domain_work_complete('${CUSTOM}','${degradationClaim.leaseId}','admin-worker-degraded','${NOW}','failed','active','mismatch','failed','origin_unreachable','2026-09-03');COMMIT;`,
    );
    scenario("degraded primary fails closed and atomically restores fallback", () => {
      assert.equal(
        psql(
          box,
          `SELECT status||':'||canonical FROM saas.admin_domains WHERE id='${CUSTOM}';`,
        ),
        "pending_verification:false",
      );
      assert.equal(
        psql(
          box,
          `SELECT canonical FROM saas.admin_domains WHERE id='${PLATFORM}';`,
        ),
        "t",
      );
      assert.equal(
        resolve(box, "admin.guzidekuyumcu.com.tr").outcome,
        "admin_host_unknown",
      );
    });
    const restoreVersion = psql(
      box,
      `SELECT version FROM saas.admin_domains WHERE id='${CUSTOM}';`,
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.merchant_admin_domain_request_recheck(${authority()},'${CUSTOM}',${restoreVersion});COMMIT;`,
    );
    const restorationClaim = JSON.parse(
      psql(
        box,
        `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT result_payload FROM saas.admin_domain_work_claim('admin-worker-restored','${NOW}','2026-09-02T12:00:30Z',1,'80000000-0000-4000-8000-000000000122');COMMIT;`,
      ),
    ).items[0];
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_workflow;SELECT outcome FROM saas.admin_domain_work_complete('${CUSTOM}','${restorationClaim.leaseId}','admin-worker-restored','${NOW}','active','active','ready','ready',NULL,'2026-09-03');COMMIT;`,
    );
    const primaryVersion = psql(
      box,
      `SELECT version FROM saas.admin_domains WHERE id='${CUSTOM}';`,
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.merchant_admin_domain_make_primary(${authority()},'${CUSTOM}',${primaryVersion});COMMIT;`,
    );
    const disableVersion = psql(
      box,
      `SELECT version FROM saas.admin_domains WHERE id='${CUSTOM}';`,
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_app;SELECT outcome FROM saas.merchant_admin_domain_disable(${authority()},'${CUSTOM}',${disableVersion});COMMIT;`,
    );
    scenario("disabling the primary custom hostname atomically restores fallback", () => {
      assert.equal(
        psql(
          box,
          `SELECT status||':'||canonical||':'||(verified_at IS NULL) FROM saas.admin_domains WHERE id='${CUSTOM}';`,
        ),
        "disabled:false:true",
      );
      assert.equal(
        psql(
          box,
          `SELECT canonical FROM saas.admin_domains WHERE id='${PLATFORM}';`,
        ),
        "t",
      );
      assert.equal(
        resolve(box, "admin.guzidekuyumcu.com.tr").outcome,
        "admin_host_unknown",
      );
    });
    scenario(
      "code-only rollback remains operational on the new schema via fallback",
      () =>
        assert.equal(
          resolve(box, "guzide-kuyumcu-4.admin.saas-staging.celebix.site")
            .authority.canonicalAdminOrigin,
          "https://guzide-kuyumcu-4.admin.saas-staging.celebix.site",
        ),
    );
    process.stdout.write(
      "PASS 12/12 tenant custom admin domains PostgreSQL 16 rehearsal complete\n",
    );
  } finally {
    stop(box);
  }
}
main();
