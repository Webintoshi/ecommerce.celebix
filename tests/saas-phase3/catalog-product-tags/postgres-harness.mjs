import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  accessSync,
  constants,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const DB = "catalog_product_tags";
const STORE = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const PLAN = "00000000-0000-4000-8000-000000000001";
const OWNER = "20000000-0000-4000-8000-000000000001";
const EDITOR = "20000000-0000-4000-8000-000000000002";
const ANALYST = "20000000-0000-4000-8000-000000000003";
const OWNER_MEMBERSHIP = "30000000-0000-4000-8000-000000000001";
const EDITOR_MEMBERSHIP = "30000000-0000-4000-8000-000000000002";
const ANALYST_MEMBERSHIP = "30000000-0000-4000-8000-000000000003";
const PRODUCT_A = "40000000-0000-4000-8000-000000000001";
const PRODUCT_B = "40000000-0000-4000-8000-000000000002";
const CROSS_STORE_PRODUCT = "40000000-0000-4000-8000-000000000003";
const TAG = "50000000-0000-4000-8000-000000000001";
const TAG_TWO = "50000000-0000-4000-8000-000000000002";
const TAG_EDITOR = "50000000-0000-4000-8000-000000000003";
const NOW = "2026-07-22T18:00:00.000Z";
const LIST_SIGNATURE =
  "saas.catalog_admin_list_resources(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text)";
const SAVE_SIGNATURE =
  "saas.catalog_admin_save_resource(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text,text,text,text,jsonb,uuid[])";
const PRIOR = [
  "202607110001_roles.up.sql",
  "202607110002_foundation.up.sql",
  "202607110003_free_starter.seed.sql",
  "202607110003_plan_versions.freeze.sql",
  "202607110004_grants.sql",
  "202607110005_catalog_assertions.sql",
  "202607110007_identity_roles.up.sql",
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
  "202607200021_catalog_dashboard_summary.up.sql",
  "202607200021_catalog_dashboard_summary_assertions.sql",
  "202607210022_order_management.up.sql",
  "202607210022_order_management_assertions.sql",
  "202607210023_order_management_api.up.sql",
  "202607210023_order_management_api_assertions.sql",
  "202607220024_quick_order_links.up.sql",
  "202607220024_quick_order_links_assertions.sql",
  "202607220025_quick_order_links_api.up.sql",
  "202607220025_quick_order_links_api_assertions.sql",
  "202607220026_quick_order_checkout_runtime.up.sql",
  "202607220026_quick_order_checkout_runtime_assertions.sql",
  "202607220027_quick_order_checkout_api.up.sql",
  "202607220027_quick_order_checkout_api_assertions.sql",
  "202607220028_quick_order_redemption_expiry_authority.up.sql",
  "202607220028_quick_order_redemption_expiry_authority_assertions.sql",
  "202607220029_quick_order_settlement_authority.up.sql",
  "202607220029_quick_order_settlement_authority_assertions.sql",
  "202607220030_abandoned_carts.up.sql",
  "202607220030_abandoned_carts_assertions.sql",
  "202607220031_abandoned_cart_api.up.sql",
  "202607220031_abandoned_cart_api_assertions.sql",
  "202607220032_abandoned_cart_capture.up.sql",
  "202607220032_abandoned_cart_capture_assertions.sql",
  "202607220033_customer_management.up.sql",
  "202607220033_customer_management_assertions.sql",
  "202607220034_customer_management_api.up.sql",
  "202607220034_customer_management_api_assertions.sql",
  "202607220035_catalog_administration.up.sql",
  "202607220035_catalog_administration_assertions.sql",
  "202607220036_merchant_admin_modules.up.sql",
  "202607220036_merchant_admin_modules_assertions.sql",
  "202607220037_merchant_provider_preparation.up.sql",
  "202607220037_merchant_provider_preparation_assertions.sql",
  "202607220038_merchant_analytics.up.sql",
  "202607220038_merchant_analytics_assertions.sql",
  "202607220039_typed_storefront_settings.up.sql",
  "202607220039_typed_storefront_settings_assertions.sql",
  "202607220040_advanced_seo_preferences.up.sql",
  "202607220040_advanced_seo_preferences_assertions.sql",
  "202607220041_catalog_import_previews.up.sql",
  "202607220041_catalog_import_previews_assertions.sql",
];

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try {
      accessSync(candidate, constants.X_OK);
      return candidate;
    } catch {}
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

function start() {
  const executables = Object.fromEntries(
    ["initdb", "pg_ctl", "psql", "pg_dump", "pg_restore"].map((name) => [
      name,
      executable(name),
    ]),
  );
  const root = mkdtempSync("/tmp/celebix-catalog-tags-");
  const data = path.join(root, "data");
  const socket = path.join(root, "socket");
  const port = 20000 + Math.floor(Math.random() * 15000);
  mkdirSync(socket, { mode: 0o700 });
  command(executables.initdb, [
    "-D",
    data,
    "--auth=trust",
    "--username=postgres",
    "--no-locale",
    "--encoding=UTF8",
  ]);
  command(executables.pg_ctl, [
    "-D",
    data,
    "-o",
    `-k ${socket} -p ${port} -h ''`,
    "-l",
    path.join(root, "postgres.log"),
    "start",
  ]);
  return {
    executables,
    root,
    data,
    socket,
    port,
    pid: Number.parseInt(readFileSync(path.join(data, "postmaster.pid"), "utf8"), 10),
  };
}

function stop(box) {
  if (!box) return;
  command(box.executables.pg_ctl, ["-D", box.data, "-m", "fast", "stop"], {
    allowFailure: true,
  });
  rmSync(box.root, { recursive: true, force: true });
}

function absent(pid) {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

function psql(box, source, database = DB, allowFailure = false) {
  return command(
    box.executables.psql,
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
    { input: source, allowFailure },
  );
}

function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function authority({ principal = OWNER, membership = OWNER_MEMBERSHIP } = {}) {
  return `'${STORE}'::uuid,'${principal}'::uuid,'${membership}'::uuid,'${PLAN}'::uuid,'free_starter'::text,1::bigint,'${NOW}'::timestamptz`;
}

function result(box, functionCall, database = DB) {
  const output = psql(
    box,
    `SET ROLE celebix_saas_app;SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${functionCall};`,
    database,
  ).stdout.trim();
  return JSON.parse(output);
}

function saveCall({
  operation,
  fingerprint,
  resource = TAG,
  expected = "NULL",
  name = "Yaz",
  slug = "yaz",
  config = '{"color":"sari"}',
  products = [PRODUCT_A, PRODUCT_B],
  actor = {},
}) {
  const productIds = products.map((id) => `'${id}'::uuid`).join(",");
  return `saas.catalog_admin_save_resource(${authority(actor)},'${operation}'::uuid,'${fingerprint}'::text,'${resource}'::uuid,${expected}::bigint,'tag'::text,'${name}'::text,'${slug}'::text,NULL::text,'${config}'::jsonb,ARRAY[${productIds}]::uuid[])`;
}

function seed(box) {
  psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),
('${EDITOR}','https://id.test/oidc','editor','editor@test.invalid',true,'2026-01-01','2026-01-01'),
('${ANALYST}','https://id.test/oidc','analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
('${STORE}','Tags A','tags-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
('${STORE_B}','Tags B','tags-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
('${OWNER_MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),
('${EDITOR_MEMBERSHIP}','${EDITOR}','${STORE}','editor','active','2026-01-01','2026-01-01'),
('${ANALYST_MEMBERSHIP}','${ANALYST}','${STORE}','analyst','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at) VALUES
('70000000-0000-4000-8000-000000000001','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');
INSERT INTO saas.products(id,store_id,slug,title,status,currency,version,created_at,updated_at) VALUES
('${PRODUCT_A}','${STORE}','canta','Canta','active','TRY',1,'2026-01-01','2026-01-01'),
('${PRODUCT_B}','${STORE}','gomlek','Gomlek','active','TRY',1,'2026-01-01','2026-01-01'),
('${CROSS_STORE_PRODUCT}','${STORE_B}','baska','Baska','active','TRY',1,'2026-01-01','2026-01-01');
COMMIT;`,
  );
}

const TOTAL = 20;
let count = 0;
async function scenario(name, run) {
  await run();
  count += 1;
  console.log(`PASS ${count}/${TOTAL} ${name}`);
}

async function main() {
  let box;
  let cleanupReady = false;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const file of PRIOR) apply(box, file);
    const relationShapeBefore = psql(
      box,
      "SELECT pg_catalog.string_agg(attname||':'||atttypid::regtype||':'||attnotnull,',' ORDER BY attnum) FROM pg_attribute WHERE attrelid='saas.catalog_admin_resources'::regclass AND attnum>0 AND NOT attisdropped;",
    ).stdout.trim();
    const aclBefore = psql(
      box,
      `SELECT COALESCE(proacl::text,'') FROM pg_proc WHERE oid='${SAVE_SIGNATURE}'::regprocedure;`,
    ).stdout.trim();
    apply(box, "202607220042_catalog_product_tags.up.sql");
    apply(box, "202607220042_catalog_product_tags_assertions.sql");
    seed(box);

    await scenario("PostgreSQL 16 applies migration 042 after 001-041", () => {
      assert.match(psql(box, "SHOW server_version;").stdout, /^16\./);
      assert.match(
        psql(
          box,
          "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.catalog_admin_resources'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%resource_kind%';",
        ).stdout,
        /'tag'/,
      );
    });
    await scenario("cumulative manifest pins eighteen exact artifacts", () => {
      const manifest = JSON.parse(
        readFileSync(
          path.join(SQL, "phase3h-merchant-completion-manifest.json"),
          "utf8",
        ),
      );
      assert.equal(manifest.artifacts.length, 18);
      for (const artifact of manifest.artifacts) {
        assert.equal(
          createHash("sha256")
            .update(readFileSync(path.join(SQL, artifact.file)))
            .digest("hex"),
          artifact.sha256,
          artifact.file,
        );
      }
    });
    await scenario("042 preserves relation shape function signatures and exact ACL", () => {
      assert.equal(
        psql(
          box,
          "SELECT pg_catalog.string_agg(attname||':'||atttypid::regtype||':'||attnotnull,',' ORDER BY attnum) FROM pg_attribute WHERE attrelid='saas.catalog_admin_resources'::regclass AND attnum>0 AND NOT attisdropped;",
        ).stdout.trim(),
        relationShapeBefore,
      );
      assert.equal(
        psql(box, `SELECT to_regprocedure('${LIST_SIGNATURE}') IS NOT NULL AND to_regprocedure('${SAVE_SIGNATURE}') IS NOT NULL;`).stdout.trim(),
        "t",
      );
      assert.equal(
        psql(box, `SELECT COALESCE(proacl::text,'') FROM pg_proc WHERE oid='${SAVE_SIGNATURE}'::regprocedure;`).stdout.trim(),
        aclBefore,
      );
    });
    await scenario("application role has no table DML and catalog tables force RLS", () => {
      assert.equal(
        psql(
          box,
          "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='saas' AND c.relname IN('catalog_admin_resources','catalog_admin_resource_products','catalog_admin_operations') AND c.relrowsecurity AND c.relforcerowsecurity;",
        ).stdout.trim(),
        "3",
      );
      assert.notEqual(
        psql(
          box,
          `SET ROLE celebix_saas_app;INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,status,version,created_at,updated_at) VALUES(gen_random_uuid(),'${STORE}','tag','X','x','active',1,now(),now());`,
          DB,
          true,
        ).status,
        0,
      );
    });
    await scenario("catalog resource kind authority remains finite", () => {
      assert.equal(
        result(
          box,
          `saas.catalog_admin_list_resources(${authority()},'label')`,
        ).outcome,
        "invalid_input",
      );
    });

    const create = saveCall({
      operation: "80000000-0000-4000-8000-000000000001",
      fingerprint: "a".repeat(64),
    });
    await scenario("owner creates a tag through existing catalog authority", () => {
      assert.equal(result(box, create).outcome, "saved");
    });
    await scenario("tag list preserves product assignment order", () => {
      const listed = result(
        box,
        `saas.catalog_admin_list_resources(${authority()},'tag')`,
      );
      assert.equal(listed.outcome, "listed");
      assert.deepEqual(listed.result.items[0].productIds, [PRODUCT_A, PRODUCT_B]);
    });
    await scenario("owner updates a tag and reverses assignment order", () => {
      const updated = result(
        box,
        saveCall({
          operation: "80000000-0000-4000-8000-000000000002",
          fingerprint: "b".repeat(64),
          expected: "1",
          name: "Yaz Sezonu",
          products: [PRODUCT_B, PRODUCT_A],
        }),
      );
      assert.equal(updated.outcome, "saved");
      assert.equal(updated.result.version, 2);
      assert.deepEqual(
        result(box, `saas.catalog_admin_list_resources(${authority()},'tag')`)
          .result.items[0].productIds,
        [PRODUCT_B, PRODUCT_A],
      );
    });
    await scenario("same operation replays and mismatched fingerprint is denied", () => {
      assert.equal(result(box, create).outcome, "operation_replayed");
      assert.equal(
        result(box, create.replace("a".repeat(64), "c".repeat(64))).outcome,
        "operation_mismatch",
      );
    });
    await scenario("duplicate tag slug is denied", () => {
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-000000000003",
            fingerprint: "d".repeat(64),
            resource: TAG_TWO,
            name: "Tekrar",
          }),
        ).outcome,
        "slug_conflict",
      );
    });
    await scenario("malformed tag config is denied", () => {
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-000000000004",
            fingerprint: "e".repeat(64),
            resource: TAG_TWO,
            slug: "gecersiz",
            config: "[]",
          }),
        ).outcome,
        "invalid_input",
      );
    });
    await scenario("cross-store product assignment is denied", () => {
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-000000000005",
            fingerprint: "f".repeat(64),
            resource: TAG_TWO,
            slug: "capraz",
            products: [CROSS_STORE_PRODUCT],
          }),
        ).outcome,
        "invalid_input",
      );
    });
    await scenario("editor can manage tags", () => {
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-000000000006",
            fingerprint: "1".repeat(64),
            resource: TAG_EDITOR,
            slug: "editor",
            actor: { principal: EDITOR, membership: EDITOR_MEMBERSHIP },
          }),
        ).outcome,
        "saved",
      );
    });
    await scenario("analyst has read-only tag authority", () => {
      const actor = { principal: ANALYST, membership: ANALYST_MEMBERSHIP };
      assert.equal(
        result(box, `saas.catalog_admin_list_resources(${authority(actor)},'tag')`)
          .outcome,
        "listed",
      );
      assert.equal(
        result(
          box,
          saveCall({
            operation: "80000000-0000-4000-8000-000000000007",
            fingerprint: "2".repeat(64),
            resource: TAG_TWO,
            slug: "analyst",
            actor,
          }),
        ).outcome,
        "membership_denied",
      );
    });
    await scenario("owner archives a tag through existing replay authority", () => {
      assert.equal(
        result(
          box,
          `saas.catalog_admin_archive_resource(${authority()},'80000000-0000-4000-8000-000000000008','${"3".repeat(64)}','${TAG}',2)`,
        ).outcome,
        "archived",
      );
      assert.equal(
        result(
          box,
          `saas.catalog_admin_archive_resource(${authority()},'80000000-0000-4000-8000-000000000008','${"3".repeat(64)}','${TAG}',2)`,
        ).outcome,
        "operation_replayed",
      );
    });
    await scenario("catalog operation proofs remain immutable", () => {
      assert.notEqual(
        psql(
          box,
          `SET ROLE celebix_saas_owner;UPDATE saas.catalog_admin_operations SET payload_fingerprint='${"9".repeat(64)}' WHERE operation_id='80000000-0000-4000-8000-000000000001';`,
          DB,
          true,
        ).status,
        0,
      );
    });
    await scenario("backup and restore preserve tags ACL RLS and immutable proofs", () => {
      const restored = "catalog_product_tags_restore";
      const dump = path.join(box.root, "tags.dump");
      command(box.executables.pg_dump, [
        "-h",
        box.socket,
        "-p",
        String(box.port),
        "-U",
        "postgres",
        "-Fc",
        "-f",
        dump,
        DB,
      ]);
      psql(box, `CREATE DATABASE ${restored};`, "postgres");
      command(box.executables.pg_restore, [
        "-h",
        box.socket,
        "-p",
        String(box.port),
        "-U",
        "postgres",
        "-d",
        restored,
        dump,
      ]);
      assert.equal(
        psql(
          box,
          "SELECT count(*) FROM saas.catalog_admin_resources WHERE resource_kind='tag';",
          restored,
        ).stdout.trim(),
        "2",
      );
      assert.equal(
        result(
          box,
          `saas.catalog_admin_list_resources(${authority()},'tag')`,
          restored,
        ).outcome,
        "listed",
      );
      assert.notEqual(
        psql(
          box,
          `UPDATE saas.catalog_admin_operations SET payload_fingerprint='${"0".repeat(64)}' WHERE operation_id='80000000-0000-4000-8000-000000000001';`,
          restored,
          true,
        ).status,
        0,
      );
    });
    await scenario("rollback refuses non-disposable tag rows", () => {
      assert.notEqual(
        psql(
          box,
          readFileSync(
            path.join(SQL, "202607220042_catalog_product_tags.down.sql"),
            "utf8",
          ),
          DB,
          true,
        ).status,
        0,
      );
      assert.match(
        psql(
          box,
          "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.catalog_admin_resources'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%resource_kind%';",
        ).stdout,
        /'tag'/,
      );
    });
    await scenario("disposable cleanup rollback and reapply restore exact authority", () => {
      psql(
        box,
        `SET ROLE celebix_saas_owner;DELETE FROM saas.catalog_admin_resource_products WHERE resource_id IN('${TAG}','${TAG_EDITOR}');DELETE FROM saas.catalog_admin_resources WHERE id IN('${TAG}','${TAG_EDITOR}');`,
      );
      apply(box, "202607220042_catalog_product_tags.down.sql");
      assert.doesNotMatch(
        psql(
          box,
          "SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='saas.catalog_admin_resources'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%resource_kind%';",
        ).stdout,
        /'tag'/,
      );
      assert.equal(
        result(box, `saas.catalog_admin_list_resources(${authority()},'tag')`)
          .outcome,
        "invalid_input",
      );
      assert.equal(
        psql(box, `SELECT COALESCE(proacl::text,'') FROM pg_proc WHERE oid='${SAVE_SIGNATURE}'::regprocedure;`).stdout.trim(),
        aclBefore,
      );
      apply(box, "202607220042_catalog_product_tags.up.sql");
      apply(box, "202607220042_catalog_product_tags_assertions.sql");
      assert.equal(
        result(box, `saas.catalog_admin_list_resources(${authority()},'tag')`)
          .outcome,
        "listed",
      );
    });
    assert.equal(count, TOTAL - 1);
    cleanupReady = true;
  } finally {
    const root = box?.root;
    const data = box?.data;
    const socket = box?.socket;
    const pid = box?.pid;
    stop(box);
    if (cleanupReady) {
      await scenario("cleanup removes disposable PostgreSQL", () => {
        assert.equal(existsSync(root), false);
        assert.equal(existsSync(data), false);
        assert.equal(existsSync(socket), false);
        assert.equal(absent(pid), true);
      });
      assert.equal(count, TOTAL);
      console.log(`${TOTAL}/${TOTAL} PASS cleanup PASS`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
