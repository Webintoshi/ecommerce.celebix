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
  REQUIRED_NATIVE_TOOLS,
  assertSafeEnvironment,
} from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../.."),
  SQL = path.join(ROOT, "apps/owner/scripts/sql/saas"),
  PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin",
  DB = `barcode_studio_${randomBytes(5).toString("hex")}`;
const NOW = "2026-09-02T12:00:00.000Z",
  PLAN = "00000000-0000-4000-8000-000000000001",
  STORE = "10000000-0000-4000-8000-000000000123",
  OTHER = "10000000-0000-4000-8000-000000000124",
  OWNER = "20000000-0000-4000-8000-000000000123",
  ANALYST = "20000000-0000-4000-8000-000000000124",
  ADMIN = "20000000-0000-4000-8000-000000000125",
  EDITOR = "20000000-0000-4000-8000-000000000126",
  OWNER_MEMBERSHIP = "30000000-0000-4000-8000-000000000123",
  ANALYST_MEMBERSHIP = "30000000-0000-4000-8000-000000000124",
  ADMIN_MEMBERSHIP = "30000000-0000-4000-8000-000000000125",
  EDITOR_MEMBERSHIP = "30000000-0000-4000-8000-000000000126",
  TEMPLATE = "40000000-0000-4000-8000-000000000123",
  TEMPLATE_B = "40000000-0000-4000-8000-000000000124",
  VARIANT = "60000000-0000-4000-8000-000000000001",
  COLLISION_VARIANT = "60000000-0000-4000-8000-000000000002";
const migrations = [
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
  "202607220042_catalog_product_tags.up.sql",
  "202607220042_catalog_product_tags_assertions.sql",
  "202607220043_inventory_purchasing.up.sql",
  "202607220043_inventory_purchasing_assertions.sql",
  "202607220044_inventory_counts_transfers.up.sql",
  "202607220044_inventory_counts_transfers_assertions.sql",
  "202607220045_price_lists.up.sql",
  "202607220045_price_lists_assertions.sql",
  "202607230046_inventory_locations.up.sql",
  "202607230046_inventory_locations_assertions.sql",
  "202607230047_pricing_preview.up.sql",
  "202607230047_pricing_preview_assertions.sql",
  "202607240048_exact_record_lookups_analytics.up.sql",
  "202607250049_merchant_provider_profiles.up.sql",
  "202607250049_merchant_provider_profiles_assertions.sql",
  "202607250050_merchant_provider_execution.up.sql",
  "202607250050_merchant_provider_execution_assertions.sql",
  "202607270051_payment_method_admin.up.sql",
  "202607270051_payment_method_admin_assertions.sql",
  "202607270052_payment_adapter_runtime.up.sql",
  "202607270052_payment_adapter_runtime_assertions.sql",
  "202607270053_paytr_iframe_activation_authority.up.sql",
  "202607270053_paytr_iframe_activation_authority_assertions.sql",
  "202607270054_paytr_iframe_sandbox_evidence_history.up.sql",
  "202607270054_paytr_iframe_sandbox_evidence_history_assertions.sql",
  "202607270055_hosted_callback_lifecycle.up.sql",
  "202607270055_hosted_callback_lifecycle_assertions.sql",
  "202607280056_catalog_product_onboarding.up.sql",
  "202607280056_catalog_product_onboarding_assertions.sql",
  "202607280058_store_media_namespace_exports.up.sql",
  "202607280058_store_media_namespace_exports_assertions.sql",
  "202607290065_catalog_featured_image_listing.up.sql",
  "202607290065_catalog_featured_image_listing_assertions.sql",
  "202608250114_catalog_product_lifecycle_authorization.up.sql",
  "202608250114_catalog_product_lifecycle_authorization_assertions.sql",
  "202608260115_catalog_product_list_projection.up.sql",
  "202608260115_catalog_product_list_projection_assertions.sql",
  "202608260116_catalog_product_global_query.up.sql",
  "202608260116_catalog_product_global_query_assertions.sql",
  "202608300117_catalog_product_bulk_safe_removal.up.sql",
  "202608300117_catalog_product_bulk_safe_removal_assertions.sql",
  "202608300118_catalog_media_retention_restore.up.sql",
  "202608300118_catalog_media_retention_restore_assertions.sql",
  "202609010119_catalog_media_reorder_lifecycle_guard.up.sql",
  "202609010119_catalog_media_reorder_lifecycle_guard_assertions.sql",
  "202607300069_tenant_admin_domains_and_principal_logout.up.sql",
  "202607300069_tenant_admin_domains_and_principal_logout_assertions.sql",
  "202607300071_returning_login_admin_host.up.sql",
  "202607300071_returning_login_admin_host_assertions.sql",
  "202607300072_panel_store_options.up.sql",
  "202607300072_panel_store_options_assertions.sql",
  "202608050088_storefront_custom_domains.up.sql",
  "202609020120_tenant_custom_admin_domains.up.sql",
  "202609020120_tenant_custom_admin_domains_assertions.sql",
  "202609020121_auto_admin_domain_bundles.up.sql",
  "202609020121_auto_admin_domain_bundles_assertions.sql",
  "202609020122_domain_reconciliation_defer.up.sql",
  "202609020122_domain_reconciliation_defer_assertions.sql",
];
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
  const root = mkdtempSync("/tmp/celebix-barcode-studio-"),
    data = path.join(root, "data"),
    socket = path.join(root, "socket"),
    port = 20000 + Math.floor(Math.random() * 18000);
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
function psql(box, source, database = DB, allowFailure = false) {
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
    source,
    allowFailure,
  );
}
function apply(box, file) {
  const source = readFileSync(path.join(SQL, file), "utf8");
  try {
    const result = psql(box, source);
    return result.stdout.trim();
  } catch (error) {
    throw new Error(
      `migration failed: ${file}\n${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
function authority(
  principal = OWNER,
  membership = OWNER_MEMBERSHIP,
  store = STORE,
) {
  return `'${store}','${principal}','${membership}','${PLAN}','free_starter',1,'${NOW}'`;
}
function call(box, sql, allowFailure = false) {
  const raw = psql(
    box,
    `BEGIN;SET LOCAL ROLE celebix_saas_app;${sql};COMMIT;`,
    DB,
    allowFailure,
  );
  return allowFailure ? raw : JSON.parse(raw.stdout.trim());
}
function scenario(name, fn) {
  fn();
  completed += 1;
  process.stdout.write(`PASS ${completed}/21 ${name}\n`);
}
function config() {
  return JSON.stringify({
    sectorProfile: "retail",
    paperType: "thermal-roll",
    widthMm: 50,
    heightMm: 30,
    orientation: "portrait",
    rows: 1,
    columns: 1,
    marginsMm: { top: 1, right: 1, bottom: 1, left: 1 },
    gapMm: { horizontal: 0, vertical: 0 },
    barcodeFormat: "code128",
    barcodeSource: "barcode",
    barcodeHeightMm: 10,
    showHumanReadable: true,
    currencyDisplay: "symbol",
    fields: [
      {
        key: "productTitle",
        visible: true,
        order: 0,
        align: "center",
        fontSizePt: 9,
        maxLines: 2,
        autoShrink: true,
      },
      {
        key: "barcodeSymbol",
        visible: true,
        order: 1,
        align: "center",
        fontSizePt: 8,
        maxLines: 1,
        autoShrink: false,
      },
    ],
  });
}
function malformedConfig() {
  const value = JSON.parse(config());
  delete value.fields;
  return JSON.stringify(value);
}
function list(
  box,
  query = "NULL",
  principal = OWNER,
  membership = OWNER_MEMBERSHIP,
  store = STORE,
) {
  return call(
    box,
    `SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.barcode_label_list(${authority(principal, membership, store)},${query},NULL,NULL,NULL,NULL,NULL,NULL,'updated-desc',100,NULL,NULL,NULL,NULL)`,
  );
}
function listPage(box, sort, anchor) {
  const text =
    typeof anchor?.sortValue === "string"
      ? `'${anchor.sortValue.replaceAll("'", "''")}'`
      : "NULL";
  const number =
    typeof anchor?.sortValue === "number" ? String(anchor.sortValue) : "NULL";
  const variant = anchor ? `'${anchor.variantId}'` : "NULL";
  const nullRank = anchor ? String(anchor.sortNullRank) : "NULL";
  return call(
    box,
    `SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.barcode_label_list(${authority()},NULL,NULL,NULL,NULL,NULL,NULL,NULL,'${sort}',20,${nullRank},${text},${number},${variant})`,
  );
}

function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const migration of migrations) apply(box, migration);
    scenario("PostgreSQL 16 target schema through 122 is ready", () =>
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/),
    );
    psql(
      box,
      "ALTER TABLE saas.product_variants DISABLE TRIGGER product_variants_inventory_reconcile;",
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${OWNER}','https://id.test/oidc','owner','owner@test.invalid',true,'2026-01-01','2026-01-01'),('${ANALYST}','https://id.test/oidc','analyst','analyst@test.invalid',true,'2026-01-01','2026-01-01');INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at)VALUES('${STORE}','Barcode A','barcode-a','active','tr','TRY','starter','2026-01-01','2026-01-01'),('${OTHER}','Barcode B','barcode-b','active','tr','TRY','starter','2026-01-01','2026-01-01');INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${OWNER_MEMBERSHIP}','${OWNER}','${STORE}','store_owner','active','2026-01-01','2026-01-01'),('${ANALYST_MEMBERSHIP}','${ANALYST}','${STORE}','analyst','active','2026-01-01','2026-01-01');INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,created_at,updated_at)VALUES('70000000-0000-4000-8000-000000000123','${STORE}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01'),('70000000-0000-4000-8000-000000000124','${OTHER}','${PLAN}','free_starter',1,'active','2026-01-01','2026-01-01','2026-01-01');INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at) SELECT ('50000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'${STORE}',CASE WHEN g=601 THEN 'special-global-search' ELSE 'product-'||g END,CASE WHEN g=601 THEN 'Özel Global Arama' ELSE 'Ürün '||g END,'active','TRY','2026-01-01','2026-01-01' FROM generate_series(1,601) g;INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,barcode,price_cents,stock_tracking,stock_quantity,status,attributes,created_at,updated_at) SELECT ('60000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,('50000000-0000-4000-8000-'||lpad(g::text,12,'0'))::uuid,'${STORE}','Varyant '||g,'SKU-'||g,CASE WHEN g IN(1,2) THEN NULL ELSE 'CODE-'||g END,1000,true,g,'active','{}','2026-01-01','2026-01-01' FROM generate_series(1,601) g;INSERT INTO saas.products(id,store_id,slug,title,status,currency,created_at,updated_at)VALUES('50000000-0000-4000-8000-000000009999','${OTHER}','foreign','Foreign','active','TRY','2026-01-01','2026-01-01');INSERT INTO saas.product_variants(id,product_id,store_id,title,sku,barcode,price_cents,stock_tracking,stock_quantity,status,attributes,created_at,updated_at)VALUES('60000000-0000-4000-8000-000000009999','50000000-0000-4000-8000-000000009999','${OTHER}','Foreign','FOREIGN','FOREIGN',1000,true,1,'active','{}','2026-01-01','2026-01-01');COMMIT;`,
    ).stdout;
    psql(
      box,
      "ALTER TABLE saas.product_variants ENABLE TRIGGER product_variants_inventory_reconcile;",
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_owner;INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at)VALUES('${ADMIN}','https://id.test/oidc','admin','admin@test.invalid',true,'2026-01-01','2026-01-01'),('${EDITOR}','https://id.test/oidc','editor','editor@test.invalid',true,'2026-01-01','2026-01-01');INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at)VALUES('${ADMIN_MEMBERSHIP}','${ADMIN}','${STORE}','admin','active','2026-01-01','2026-01-01'),('${EDITOR_MEMBERSHIP}','${EDITOR}','${STORE}','editor','active','2026-01-01','2026-01-01');COMMIT;`,
    );
    psql(
      box,
      `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.products SET title='100% Saf_A\\B' WHERE store_id='${STORE}' AND id='50000000-0000-4000-8000-000000000600';UPDATE saas.product_variants SET sku=CASE WHEN id='60000000-0000-4000-8000-000000000001' THEN NULL WHEN id='60000000-0000-4000-8000-000000000003' THEN 'ALPHA' ELSE 'ZETA' END WHERE store_id='${STORE}' AND id IN('60000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','60000000-0000-4000-8000-000000000004');COMMIT;`,
    );
    apply(box, "202609020123_barcode_label_studio.up.sql");
    apply(box, "202609020123_barcode_label_studio_assertions.sql");
    scenario("migration 123 up and assertions pass", () =>
      assert.equal(
        psql(
          box,
          "SELECT to_regclass('saas.barcode_label_templates') IS NOT NULL;",
        ).stdout.trim(),
        "t",
      ),
    );
    scenario("owner admin editor and analyst follow the canonical manage matrix", () => {
      for (const [principal, membership, expected] of [
        [OWNER, OWNER_MEMBERSHIP, "invalid_input"],
        [ADMIN, ADMIN_MEMBERSHIP, "invalid_input"],
        [EDITOR, EDITOR_MEMBERSHIP, "invalid_input"],
        [ANALYST, ANALYST_MEMBERSHIP, "membership_denied"],
      ]) {
        assert.equal(
          call(
            box,
            `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_label_generate_internal(${authority(principal, membership)},'80000000-0000-4000-8000-000000000199','[]')`,
          ).outcome,
          expected,
        );
      }
    });
    const first = list(box);
    scenario(
      "new application uses one bounded page without the former 500 cap",
      () => {
        assert.equal(first.outcome, "listed");
        assert.equal(first.payload.catalogTotal, 601);
        assert.equal(first.payload.items.length, 100);
        assert.ok(first.payload.nextAnchor);
      },
    );
    scenario("global product SKU and barcode search stay server-side", () => {
      assert.equal(list(box, "'Özel Global Arama'").payload.catalogTotal, 1);
      assert.equal(list(box, "'SKU-601'").payload.catalogTotal, 1);
      assert.equal(list(box, "'CODE-601'").payload.catalogTotal, 1);
      assert.equal(list(box, "'100% Saf_A\\B'").payload.catalogTotal, 1);
      assert.equal(list(box, "'%'").payload.catalogTotal, 1);
      assert.equal(list(box, "'_'").payload.catalogTotal, 1);
      assert.equal(list(box, "E'\\\\'").payload.catalogTotal, 1);
    });
    scenario("tenant isolation excludes every foreign variant", () =>
      assert.equal(JSON.stringify(first).includes("000000009999"), false),
    );
    scenario("SKU and barcode keysets keep NULL last across every boundary", () => {
      for (const [sort, field] of [
        ["sku-asc", "sku"],
        ["barcode-asc", "barcode"],
      ]) {
        const rows = [];
        let anchor;
        for (let page = 0; page < 40; page += 1) {
          const selected = listPage(box, sort, anchor);
          rows.push(...selected.payload.items);
          anchor = selected.payload.nextAnchor;
          if (!anchor) break;
        }
        assert.equal(rows.length, 601);
        assert.equal(new Set(rows.map(({ variantId }) => variantId)).size, 601);
        assert.equal(rows.at(-1)?.[field], undefined);
      }
    });
    scenario("all sorts use deletion-safe keyset cursors without page repeats", () => {
      for (const sort of [
        "name-asc",
        "name-desc",
        "updated-desc",
        "sku-asc",
        "barcode-asc",
        "stock-desc",
      ]) {
        const pageOne = listPage(box, sort);
        const firstIds = new Set(pageOne.payload.items.map((item) => item.variantId));
        const anchor = pageOne.payload.nextAnchor;
        assert.ok(anchor);
        psql(
          box,
          `BEGIN;SET LOCAL ROLE celebix_saas_owner;UPDATE saas.product_variants SET status='archived',archived_at='${NOW}',updated_at='${NOW}' WHERE store_id='${STORE}' AND id='${anchor.variantId}';COMMIT;`,
        );
        const pageTwo = listPage(box, sort, anchor);
        assert.equal(
          pageTwo.payload.items.some((item) => firstIds.has(item.variantId)),
          false,
        );
      }
    });
    const saved = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.barcode_label_template_save(${authority()},'${TEMPLATE}','${TEMPLATE}',NULL,'Mağaza Etiketi','${config().replaceAll("'", "''")}'::jsonb,true)`,
    );
    scenario("owner saves one store-bound default custom template", () => {
      assert.equal(saved.outcome, "saved");
      assert.equal(saved.payload.isDefault, true);
      const malformed = call(
        box,
        `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_label_template_save(${authority()},'40000000-0000-4000-8000-000000000129','40000000-0000-4000-8000-000000000129',NULL,'Bozuk Etiket','${malformedConfig().replaceAll("'", "''")}'::jsonb,false)`,
      );
      assert.equal(malformed.outcome, "invalid_input");
      assert.equal(
        psql(box, "SELECT count(*) FROM saas.barcode_label_templates WHERE name='Bozuk Etiket';").stdout.trim(),
        "0",
      );
      const nullConfig = call(
        box,
        `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_label_template_save(${authority()},'40000000-0000-4000-8000-000000000130','40000000-0000-4000-8000-000000000130',NULL,'Null Etiket',NULL,NULL)`,
      );
      assert.equal(nullConfig.outcome, "invalid_input");
    });
    const switched = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.barcode_label_template_save(${authority()},'${TEMPLATE_B}','${TEMPLATE_B}',NULL,'İkinci Mağaza Etiketi','${config().replaceAll("'", "''")}'::jsonb,true)`,
    );
    scenario("store default switches atomically from template A to B", () => {
      assert.equal(switched.outcome, "saved");
      assert.equal(switched.payload.isDefault, true);
      assert.deepEqual(
        JSON.parse(
          psql(box, `SELECT jsonb_agg(jsonb_build_object('id',id,'default',is_default,'version',version) ORDER BY id) FROM saas.barcode_label_templates WHERE store_id='${STORE}';`).stdout.trim(),
        ),
        [
          { id: TEMPLATE, default: false, version: 2 },
          { id: TEMPLATE_B, default: true, version: 1 },
        ],
      );
      const nullArchive = call(
        box,
        `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_label_template_archive(${authority()},'40000000-0000-4000-8000-000000000131','${TEMPLATE}',NULL)`,
      );
      assert.equal(nullArchive.outcome, "invalid_input");
      assert.equal(
        psql(box, `SELECT status FROM saas.barcode_label_templates WHERE id='${TEMPLATE}';`).stdout.trim(),
        "active",
      );
    });
    const analyst = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_label_generate_internal(${authority(ANALYST, ANALYST_MEMBERSHIP)},'80000000-0000-4000-8000-000000000123','[{"variantId":"${VARIANT}","expectedVersion":1}]')`,
    );
    scenario("analyst mutation is denied at SQL authority", () =>
      assert.equal(analyst.outcome, "membership_denied"),
    );
    const mixedInternal = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_label_generate_internal(${authority()},'80000000-0000-4000-8000-000000000122','[{"variantId":"${VARIANT}","expectedVersion":1},{"variantId":"60000000-0000-4000-8000-000000009999","expectedVersion":1}]')`,
    );
    scenario("mixed-tenant internal generation is atomic and opaque", () => {
      assert.equal(mixedInternal.outcome, "variant_not_found");
      assert.equal(
        psql(box, `SELECT barcode IS NULL AND version=1 FROM saas.product_variants WHERE store_id='${STORE}' AND id='${VARIANT}';`).stdout.trim(),
        "t",
      );
    });
    const generated = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.barcode_label_generate_internal(${authority()},'80000000-0000-4000-8000-000000000124','[{"variantId":"${VARIANT}","expectedVersion":1}]')`,
    );
    scenario(
      "internal Code 128 identifier is unique and never presented as GTIN",
      () => {
        assert.equal(generated.outcome, "generated");
        assert.match(generated.payload.succeeded[0].barcode, /^CXI-[0-9]{12}$/);
        assert.doesNotMatch(
          generated.payload.succeeded[0].barcode,
          /^\d{12,13}$/,
        );
      },
    );
    const collisionSafe = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.barcode_label_generate_internal(${authority()},'80000000-0000-4000-8000-000000000126','[{"variantId":"${COLLISION_VARIANT}","expectedVersion":1}]')`,
    );
    scenario("full UUID keeps same-prefix internal identifiers collision-free", () => {
      assert.equal(collisionSafe.outcome, "generated");
      assert.notEqual(
        collisionSafe.payload.succeeded[0].barcode,
        generated.payload.succeeded[0].barcode,
      );
    });
    const replay = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.barcode_label_generate_internal(${authority()},'80000000-0000-4000-8000-000000000124','[{"variantId":"${VARIANT}","expectedVersion":1}]')`,
    );
    scenario(
      "idempotent replay returns the same barcode without overwrite",
      () => {
        assert.equal(replay.outcome, "operation_replayed");
        assert.equal(replay.payload.replayed, true);
        assert.equal(
          replay.payload.succeeded[0].barcode,
          generated.payload.succeeded[0].barcode,
        );
      },
    );
    const foreign = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_label_generate_internal(${authority()},'80000000-0000-4000-8000-000000000125','[{"variantId":"60000000-0000-4000-8000-000000009999","expectedVersion":1}]')`,
    );
    scenario("cross-tenant variant mutation fails as not found", () =>
      assert.equal(foreign.outcome, "variant_not_found"),
    );
    const rejectedJob = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_print_job_create(${authority()},'81000000-0000-4000-8000-000000000123','81000000-0000-4000-8000-000000000124',NULL,NULL,'Sistem etiketi','${config().replaceAll("'", "''")}'::jsonb,'pdf','thermal',0,'[{"variantId":"${VARIANT}","expectedVersion":2,"quantity":1},{"variantId":"60000000-0000-4000-8000-000000009999","expectedVersion":1,"quantity":1}]')`,
    );
    const malformedJob = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_print_job_create(${authority()},'81000000-0000-4000-8000-000000000129','81000000-0000-4000-8000-000000000129',NULL,NULL,'Bozuk Sistem Etiketi','${malformedConfig().replaceAll("'", "''")}'::jsonb,'pdf','thermal',0,'[{"variantId":"${VARIANT}","expectedVersion":2,"quantity":1}]')`,
    );
    const nullJob = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_print_job_create(${authority()},'81000000-0000-4000-8000-000000000130','81000000-0000-4000-8000-000000000130',NULL,NULL,'Null Sistem Etiketi',NULL,'pdf','thermal',0,NULL)`,
    );
    const jobSql = `SELECT jsonb_build_object('outcome',outcome,'payload',result_payload) FROM saas.barcode_print_job_create(${authority()},'81000000-0000-4000-8000-000000000125','81000000-0000-4000-8000-000000000125','${TEMPLATE_B}',1,'ignored','${config().replaceAll("'", "''")}'::jsonb,'pdf','thermal',0,'[{"variantId":"${VARIANT}","expectedVersion":2,"quantity":1}]')`;
    const createdJob = call(box, jobSql);
    call(box, `SELECT jsonb_build_object('outcome',outcome) FROM saas.barcode_label_template_archive(${authority()},'82000000-0000-4000-8000-000000000125','${TEMPLATE_B}',1)`);
    const replayedJob = call(box, jobSql);
    scenario("compact job replay survives later template archive", () => {
      assert.equal(createdJob.outcome, "created");
      assert.equal(createdJob.payload.templateName, "İkinci Mağaza Etiketi");
      assert.equal(replayedJob.outcome, "operation_replayed");
      assert.equal(replayedJob.payload.id, createdJob.payload.id);
      assert.equal(
        psql(box, "SELECT pg_column_size(result_payload)<100 FROM saas.barcode_label_operations WHERE operation_kind='create_job';").stdout.trim(),
        "t",
      );
    });
    scenario(
      "invalid mixed-tenant print job leaves no partial job metadata",
      () => {
        assert.equal(rejectedJob.outcome, "variant_not_found");
        assert.equal(malformedJob.outcome, "invalid_input");
        assert.equal(nullJob.outcome, "invalid_input");
        assert.equal(
          psql(
            box,
            "SELECT count(*) FROM saas.barcode_print_jobs WHERE id='81000000-0000-4000-8000-000000000124';",
          ).stdout.trim(),
          "0",
        );
        assert.equal(
          psql(box, "SELECT count(*) FROM saas.barcode_print_jobs WHERE id='81000000-0000-4000-8000-000000000129';").stdout.trim(),
          "0",
        );
      },
    );
    const oldCode = call(
      box,
      `SELECT jsonb_build_object('outcome',outcome) FROM saas.catalog_list_products_v3('${STORE}','${OWNER}','${OWNER_MEMBERSHIP}','${PLAN}','free_starter',1,100,'${NOW}',NULL,NULL,NULL,NULL,NULL,NULL,'updated-desc',20,NULL,NULL,NULL)`,
    );
    scenario(
      "code-only rollback keeps the pre-123 catalog application contract",
      () => assert.equal(oldCode.outcome, "listed"),
    );
    const down = psql(
      box,
      readFileSync(
        path.join(SQL, "202609020123_barcode_label_studio.down.sql"),
        "utf8",
      ),
      DB,
      true,
    );
    scenario(
      "down migration fails closed while merchant templates or history exist",
      () => {
        assert.notEqual(down.status, 0);
        assert.match(
          down.stderr,
          /barcode_label_studio_down_blocked_data_exists/,
        );
      },
    );
    psql(
      box,
      "BEGIN;SET LOCAL ROLE celebix_saas_owner;DELETE FROM saas.barcode_print_job_items;DELETE FROM saas.barcode_print_jobs;DELETE FROM saas.barcode_label_operations;DELETE FROM saas.barcode_label_templates;UPDATE saas.product_variants SET barcode=NULL WHERE barcode LIKE 'CXI-%';DELETE FROM saas.barcode_label_sequences;COMMIT;",
    );
    apply(box, "202609020123_barcode_label_studio.down.sql");
    scenario("empty migration 123 down removes the additive surface cleanly", () =>
      assert.equal(
        psql(box, "SELECT to_regclass('saas.barcode_label_templates') IS NULL;").stdout.trim(),
        "t",
      ),
    );
    process.stdout.write(
      "PASS 21/21 barcode label studio PostgreSQL 16 rehearsal complete\n",
    );
  } finally {
    stop(box);
  }
}
main();
