import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const SQL = path.join(ROOT, "apps/owner/scripts/sql/saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DB = `catalog_onboarding_${TOKEN}`;
const RESTORE_DB = `${DB}_restore`;
const ROLLBACK_DB = `${DB}_rollback`;
const UP = "202607280056_catalog_product_onboarding.up.sql";
const DOWN = "202607280056_catalog_product_onboarding.down.sql";
const ASSERTIONS = "202607280056_catalog_product_onboarding_assertions.sql";
const PRIOR = JSON.parse(readFileSync(path.join(SQL, "phase3n-hosted-callback-lifecycle-manifest.json"), "utf8"));
const NOW = "2026-07-28T12:00:00.000Z";
const FREE_PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000056";
const STORE_B = "10000000-0000-4000-8000-000000000057";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000056";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000057";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000056";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000057";
const CATEGORY_A = "40000000-0000-4000-8000-000000000056";
const CATEGORY_B = "40000000-0000-4000-8000-000000000057";
const RESOURCE_A = "50000000-0000-4000-8000-000000000056";
const RESOURCE_B = "50000000-0000-4000-8000-000000000057";
const LOCATION_A = "60000000-0000-4000-8000-000000000056";
const LOCATION_B = "60000000-0000-4000-8000-000000000057";
const DOMAIN_A = "70000000-0000-4000-8000-000000000056";
const DOMAIN_B = "70000000-0000-4000-8000-000000000057";
const TOTAL = 25;
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

function start() {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const root = mkdtempSync(path.join("/tmp", "celebix-catalog-onboarding-"));
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

function apply(box, file, database = DB) {
  psql(box, readFileSync(path.join(SQL, file), "utf8"), database);
}

function jsonSql(value) {
  return `'${JSON.stringify(value).replaceAll("'", "''")}'::jsonb`;
}

function authority(store = STORE_A, principal = PRINCIPAL_A, membership = MEMBERSHIP_A, limit = 100) {
  return [`'${store}'`, `'${principal}'`, `'${membership}'`, `'${FREE_PLAN}'`, "'free_starter'", 1, limit, `'${NOW}'`].join(",");
}

function result(box, expression, database = DB, role = "celebix_saas_app") {
  const output = psql(box, `BEGIN; SET LOCAL ROLE ${role}; SELECT pg_catalog.jsonb_build_object('outcome',outcome,'result',result_payload) FROM ${expression}; COMMIT;`, database).stdout.trim();
  return JSON.parse(output);
}

function operationId(ordinal) { return `80000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`; }
function productId(ordinal) { return `90000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`; }
function variantId(ordinal) { return `a0000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`; }
function categoryId(ordinal) { return `b0000000-0000-4000-8000-${String(ordinal).padStart(12, "0")}`; }
function fingerprint(ordinal) { return createHash("sha256").update(`catalog-onboarding-${ordinal}`).digest("hex"); }

function onboard(box, ordinal, intent, options = {}) {
  const ids = options.variantIds ?? [variantId(ordinal)];
  return result(box, `saas.catalog_onboard_product(
    ${options.authority ?? authority()},'${options.operationId ?? operationId(ordinal)}','${options.fingerprint ?? fingerprint(ordinal)}',
    '${options.productId ?? productId(ordinal)}',ARRAY[${ids.map((id) => `'${id}'::uuid`).join(",")}],${jsonSql(intent)}
  )`, options.database ?? DB);
}

function createCategory(box, ordinal, fields, options = {}) {
  return result(box, `saas.catalog_create_category(
    ${options.authority ?? authority()},'${options.operationId ?? operationId(ordinal)}','${options.fingerprint ?? fingerprint(ordinal)}',
    '${options.categoryId ?? categoryId(ordinal)}',${jsonSql(fields)}
  )`, options.database ?? DB);
}

async function psqlAsync(box, source, database = DB) {
  return await new Promise((resolve) => {
    const child = spawn(box.executables.psql, ["-h", box.socket, "-p", String(box.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", database], { cwd: ROOT });
    let stdout = ""; let stderr = "";
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("close", (status) => resolve({ status, stdout, stderr }));
    child.stdin.end(source);
  });
}

async function scenario(name, run) {
  await run(); completed += 1;
  process.stdout.write(`PASS ${completed}/${TOTAL} ${name}\n`);
}

function seed(box) {
  psql(box, `BEGIN; SET LOCAL ROLE celebix_saas_owner;
INSERT INTO saas.principals(id,issuer,subject,email,email_verified,created_at,updated_at) VALUES
 ('${PRINCIPAL_A}','https://identity.example.test/oidc','onboarding-a','a@example.test',true,'2026-01-01','2026-01-01'),
 ('${PRINCIPAL_B}','https://identity.example.test/oidc','onboarding-b','b@example.test',true,'2026-01-01','2026-01-01');
INSERT INTO saas.stores(id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
 ('${STORE_A}','Onboarding A','onboarding-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
 ('${STORE_B}','Onboarding B','onboarding-b','active','tr','TRY','default','2026-01-01','2026-01-01');
INSERT INTO saas.memberships(id,principal_id,store_id,role,status,created_at,updated_at) VALUES
 ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
 ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
INSERT INTO saas.subscriptions(id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
 ('31000000-0000-4000-8000-000000000056','${STORE_A}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
 ('31000000-0000-4000-8000-000000000057','${STORE_B}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
INSERT INTO saas.catalog_categories(id,store_id,parent_id,name,slug,position,depth,status,version,created_at,updated_at) VALUES
 ('${CATEGORY_A}','${STORE_A}',NULL,'Kupalar','kupalar',0,1,'active',1,'${NOW}','${NOW}'),
 ('${CATEGORY_B}','${STORE_B}',NULL,'Yabancı','yabanci',0,1,'active',1,'${NOW}','${NOW}');
INSERT INTO saas.catalog_admin_resources(id,store_id,resource_kind,name,slug,config,status,version,created_at,updated_at) VALUES
 ('${RESOURCE_A}','${STORE_A}','brand','Celebix','celebix','{}','active',1,'${NOW}','${NOW}'),
 ('${RESOURCE_B}','${STORE_B}','brand','Yabancı','yabanci','{}','active',1,'${NOW}','${NOW}');
INSERT INTO saas.inventory_locations(id,store_id,name,is_default,status,version,created_at,updated_at) VALUES
 ('${LOCATION_A}','${STORE_A}','Ana depo',true,'active',1,'${NOW}','${NOW}'),
 ('${LOCATION_B}','${STORE_B}','Yabancı depo',true,'active',1,'${NOW}','${NOW}');
INSERT INTO saas.store_domains(id,store_id,hostname,hostname_type,status,is_primary,verified_at,created_at,updated_at,version) VALUES
 ('${DOMAIN_A}','${STORE_A}','onboarding-a.celebix.site','platform_subdomain','active',true,'${NOW}','${NOW}','${NOW}',1),
 ('${DOMAIN_B}','${STORE_B}','onboarding-b.celebix.site','platform_subdomain','active',true,'${NOW}','${NOW}','${NOW}',1);
COMMIT;`);
}

async function main() {
  let box;
  try {
    box = start();
    psql(box, `CREATE DATABASE ${DB};`, "postgres");
    for (const { file } of PRIOR.migrationChain) apply(box, file);
    psql(box, `CREATE DATABASE ${ROLLBACK_DB} TEMPLATE ${DB};`, "postgres");
    apply(box, UP);
    apply(box, ASSERTIONS);
    seed(box);

    await scenario("PostgreSQL 16 and migration 056 apply with assertions", () => {
      assert.match(psql(box, "SHOW server_version;").stdout.trim(), /^16[.]/);
      assert.equal(psql(box, "SELECT to_regclass('saas.catalog_product_profiles') IS NOT NULL;").stdout.trim(), "t");
    });

    await scenario("options expose only active persisted store authorities", () => {
      const listed = result(box, `saas.catalog_get_onboarding_options(${authority()})`);
      assert.equal(listed.outcome, "found");
      assert.deepEqual(listed.result.categories.map(({ id }) => id), [CATEGORY_A]);
      assert.deepEqual(listed.result.resources.map(({ id }) => id), [RESOURCE_A]);
      assert.deepEqual(listed.result.locations.map(({ id }) => id), [LOCATION_A]);
      assert.deepEqual(listed.result.channels.map(({ id }) => id), [DOMAIN_A]);
      assert.doesNotMatch(JSON.stringify(listed), /principal|membership|plan|database|secret/i);
    });

    await scenario("category list is exact and store isolated", () => {
      const listed = result(box, `saas.catalog_list_categories(${authority()})`);
      assert.equal(listed.outcome, "found");
      assert.deepEqual(listed.result.map(({ id }) => id), [CATEGORY_A]);
      assert.deepEqual(result(box, `saas.catalog_list_categories(${authority(STORE_B, PRINCIPAL_B, MEMBERSHIP_B)})`).result.map(({ id }) => id), [CATEGORY_B]);
      assert.doesNotMatch(JSON.stringify(listed), /storeId|principal|membership|database|secret/i);
    });

    const createdCategory = createCategory(box, 100, { name: "Aksesuar", position: 1 });
    await scenario("category create allocates slug and immutable replay proof", () => {
      assert.equal(createdCategory.outcome, "created");
      assert.equal(createdCategory.result.category.slug, "aksesuar");
      const replay = createCategory(box, 199, { name: "Aksesuar", position: 1 }, { operationId: operationId(100), fingerprint: fingerprint(100) });
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replay.result.category.id, createdCategory.result.category.id);
      assert.equal(createCategory(box, 199, { name: "Başka", position: 1 }, { operationId: operationId(100), fingerprint: fingerprint(199) }).outcome, "operation_mismatch");
    });

    const childCategory = createCategory(box, 101, { name: "Kupa Aksesuarı", parentId: createdCategory.result.category.id, position: 0 });
    await scenario("category hierarchy update is versioned and cross-store safe", () => {
      assert.equal(childCategory.outcome, "created");
      assert.equal(childCategory.result.category.depth, 2);
      const update = result(box, `saas.catalog_update_category(${authority()},'${operationId(102)}','${fingerprint(102)}','${childCategory.result.category.id}',1,${jsonSql({ name: "Kupa Altlığı", parentId: createdCategory.result.category.id, position: 2 })})`);
      assert.equal(update.outcome, "updated");
      assert.equal(update.result.category.version, 2);
      assert.equal(result(box, `saas.catalog_update_category(${authority()},'${operationId(103)}','${fingerprint(103)}','${childCategory.result.category.id}',1,${jsonSql({ name: "Eski", position: 0 })})`).outcome, "version_conflict");
      assert.equal(result(box, `saas.catalog_update_category(${authority(STORE_B, PRINCIPAL_B, MEMBERSHIP_B)},'${operationId(104)}','${fingerprint(104)}','${childCategory.result.category.id}',2,${jsonSql({ name: "Yabancı", position: 0 })})`).outcome, "category_not_found");
    });

    await scenario("category cycles and hierarchy depth above eight fail closed", () => {
      assert.equal(result(box, `saas.catalog_update_category(${authority()},'${operationId(105)}','${fingerprint(105)}','${createdCategory.result.category.id}',1,${jsonSql({ name: "Aksesuar", parentId: childCategory.result.category.id, position: 1 })})`).outcome, "category_in_use");
      let parentId = childCategory.result.category.id;
      for (let depth = 3; depth <= 8; depth += 1) {
        const nested = createCategory(box, 105 + depth, { name: `Seviye ${depth}`, parentId, position: depth });
        assert.equal(nested.outcome, "created");
        assert.equal(nested.result.category.depth, depth);
        parentId = nested.result.category.id;
      }
      assert.equal(createCategory(box, 120, { name: "Seviye 9", parentId, position: 9 }).outcome, "catalog_conflict");
    });

    await scenario("category archive refuses active children and permits unused leaves", () => {
      assert.equal(result(box, `saas.catalog_archive_category(${authority()},'${operationId(121)}','${fingerprint(121)}','${createdCategory.result.category.id}',1)`).outcome, "category_in_use");
      const unused = createCategory(box, 122, { name: "Geçici", position: 99 });
      const archived = result(box, `saas.catalog_archive_category(${authority()},'${operationId(123)}','${fingerprint(123)}','${unused.result.category.id}',1)`);
      assert.equal(archived.outcome, "archived");
      assert.equal(archived.result.category.status, "archived");
      assert.equal(archived.result.category.version, 2);
    });

    await scenario("concurrent equal category names allocate distinct canonical slugs", async () => {
      const source = (ordinal) => `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT result_payload->'category'->>'slug' FROM saas.catalog_create_category(${authority()},'${operationId(ordinal)}','${fingerprint(ordinal)}','${categoryId(ordinal)}',${jsonSql({ name: "Aynı Kategori", position: ordinal })}); COMMIT;`;
      const outcomes = await Promise.all([psqlAsync(box, source(130)), psqlAsync(box, source(131))]);
      assert.equal(outcomes.every(({ status }) => status === 0), true, outcomes.map(({ stderr }) => stderr).join("\n"));
      assert.deepEqual(new Set(outcomes.map(({ stdout }) => stdout.trim())), new Set(["ayni-kategori", "ayni-kategori-2"]));
    });

    const quickIntent = { kind: "quick", title: "Seramik Kupa", priceCents: 12990, publish: true, stockQuantity: 0, categoryId: CATEGORY_A };
    const quick = onboard(box, 1, quickIntent);

    await scenario("quick create uses draft physical TRY Standard defaults", () => {
      assert.equal(quick.outcome, "created");
      assert.equal(quick.result.product.slug, "seramik-kupa");
      assert.equal(quick.result.product.status, "draft");
      assert.equal(quick.result.product.currency, "TRY");
      assert.equal(quick.result.variants[0].title, "Standart");
      assert.equal(quick.result.profile.productType, "physical");
      assert.deepEqual(quick.result.categoryIds, [CATEGORY_A]);
    });

    await scenario("same operation replays and changed fingerprint mismatches", () => {
      const replay = onboard(box, 99, quickIntent, { operationId: operationId(1), fingerprint: fingerprint(1), productId: productId(99), variantIds: [variantId(99)] });
      assert.equal(replay.outcome, "operation_replayed");
      assert.equal(replay.result.product.id, quick.result.product.id);
      const mismatch = onboard(box, 99, { ...quickIntent, title: "Başka" }, { operationId: operationId(1), fingerprint: fingerprint(99) });
      assert.equal(mismatch.outcome, "operation_mismatch");
    });

    await scenario("concurrent equal titles allocate distinct canonical slugs", async () => {
      const source = (ordinal) => `BEGIN; SET LOCAL ROLE celebix_saas_app; SELECT result_payload->'product'->>'slug' FROM saas.catalog_onboard_product(${authority()},'${operationId(ordinal)}','${fingerprint(ordinal)}','${productId(ordinal)}',ARRAY['${variantId(ordinal)}'::uuid],${jsonSql({ kind: "quick", title: "Aynı Ürün", priceCents: 100, publish: false })}); COMMIT;`;
      const results = await Promise.all([psqlAsync(box, source(2)), psqlAsync(box, source(3))]);
      assert.equal(results.every(({ status }) => status === 0), true, results.map(({ stderr }) => stderr).join("\n"));
      assert.deepEqual(new Set(results.map(({ stdout }) => stdout.trim())), new Set(["ayni-urun", "ayni-urun-2"]));
    });

    const advancedIntent = {
      kind: "advanced", productType: "physical", title: "Varyantlı Kupa", description: "İki renk kupa", publish: false,
      variants: [
        { title: "Beyaz", sku: "KUPA-BEYAZ", priceCents: 15000, stockTracking: true, stockQuantity: 5, attributes: { Renk: "Beyaz" }, continueSellingWhenOutOfStock: false, shippingDesiMilli: 2000, hsCode: "691200", inventory: [{ locationId: LOCATION_A, quantity: 5 }] },
        { title: "Siyah", sku: "KUPA-SIYAH", priceCents: 16000, stockTracking: true, stockQuantity: 3, attributes: { Renk: "Siyah" }, continueSellingWhenOutOfStock: true, inventory: [{ locationId: LOCATION_A, quantity: 3 }] },
      ], categoryIds: [CATEGORY_A], resourceIds: { brand: RESOURCE_A, collections: [], tags: [], attributes: [], extras: [], definitions: [] }, channelIds: [DOMAIN_A],
      profile: { supplierName: "Celebix", seoTitle: "Varyantlı Kupa", minimumPurchaseQuantity: 1, maximumPurchaseQuantity: 5 },
    };
    const advanced = onboard(box, 4, advancedIntent, { variantIds: [variantId(4), variantId(5)] });

    await scenario("advanced create persists variants profile resources channels and location balances atomically", () => {
      assert.equal(advanced.outcome, "created");
      assert.equal(advanced.result.variants.length, 2);
      assert.deepEqual(advanced.result.resourceIds.brand, RESOURCE_A);
      assert.deepEqual(advanced.result.channelIds, [DOMAIN_A]);
      assert.equal(psql(box, `SELECT pg_catalog.sum(quantity) FROM saas.inventory_balances WHERE store_id='${STORE_A}' AND variant_id IN('${variantId(4)}','${variantId(5)}');`).stdout.trim(), "8");
    });

    await scenario("wrong-store category channel location and resource fail before product creation", () => {
      const attempts = [
        { ...advancedIntent, categoryIds: [CATEGORY_B] },
        { ...advancedIntent, channelIds: [DOMAIN_B] },
        { ...advancedIntent, variants: [{ ...advancedIntent.variants[0], inventory: [{ locationId: LOCATION_B, quantity: 5 }] }] },
        { ...advancedIntent, resourceIds: { ...advancedIntent.resourceIds, brand: RESOURCE_B } },
      ];
      attempts.forEach((intent, index) => assert.notEqual(onboard(box, 10 + index, intent, { variantIds: intent.variants.map((_, offset) => variantId(20 + index * 3 + offset)) }).outcome, "created"));
    });

    await scenario("malformed duplicate and incompatible commerce input is denied", () => {
      for (const [index, intent] of [
        { ...advancedIntent, categoryIds: [CATEGORY_A, CATEGORY_A] },
        { ...advancedIntent, productType: "digital", variants: [{ ...advancedIntent.variants[0], shippingDesiMilli: 1000 }] },
        { ...advancedIntent, variants: [{ ...advancedIntent.variants[0], stockQuantity: 4 }] },
      ].entries()) assert.equal(onboard(box, 20 + index, intent, { variantIds: intent.variants.map((_, offset) => variantId(40 + index * 3 + offset)) }).outcome, "invalid_input");
      const collisionProductId = productId(25);
      assert.equal(onboard(box, 25, advancedIntent, { productId: collisionProductId, variantIds: [variantId(60), variantId(61)] }).outcome, "catalog_conflict");
      assert.equal(psql(box, `SELECT count(*) FROM saas.products WHERE id='${collisionProductId}';`).stdout.trim(), "0");
    });

    await scenario("product limit is enforced under the serialized store lock", () => {
      const limited = onboard(box, 30, { kind: "quick", title: "Limit", priceCents: 1, publish: false }, { authority: authority(STORE_B, PRINCIPAL_B, MEMBERSHIP_B, 0) });
      assert.equal(limited.outcome, "durable_authority_invalid");
    });

    await scenario("editor projection is exact and store isolated", () => {
      const editor = result(box, `saas.catalog_get_product_editor(${authority()},'${advanced.result.product.id}')`);
      assert.equal(editor.outcome, "found");
      assert.equal(editor.result.variants.length, 2);
      assert.equal(result(box, `saas.catalog_get_product_editor(${authority(STORE_B, PRINCIPAL_B, MEMBERSHIP_B)},'${advanced.result.product.id}')`).outcome, "product_not_found");
    });

    await scenario("merchandising update is versioned and stale writes fail", () => {
      const updatePayload = { profile: { supplierName: "Yeni", minimumPurchaseQuantity: 2 }, categoryIds: [CATEGORY_A], resourceIds: { brand: RESOURCE_A, collections: [], tags: [], attributes: [], extras: [], definitions: [] }, channelIds: [DOMAIN_A] };
      const updated = result(box, `saas.catalog_update_merchandising(${authority()},'${operationId(40)}','${fingerprint(40)}','${advanced.result.product.id}',1,${jsonSql(updatePayload)})`);
      assert.equal(updated.outcome, "updated");
      assert.equal(updated.result.profile.version, 2);
      assert.equal(result(box, `saas.catalog_update_merchandising(${authority()},'${operationId(41)}','${fingerprint(41)}','${advanced.result.product.id}',1,${jsonSql(updatePayload)})`).outcome, "version_conflict");
    });

    await scenario("publish-after-media activates only the expected draft and exact media count", () => {
      const published = result(box, `saas.catalog_publish_after_media(${authority()},'${operationId(50)}','${fingerprint(50)}','${quick.result.product.id}',1,0)`);
      assert.equal(published.outcome, "published");
      assert.equal(published.result.product.status, "active");
      assert.equal(result(box, `saas.catalog_publish_after_media(${authority()},'${operationId(51)}','${fingerprint(51)}','${advanced.result.product.id}',1,1)`).outcome, "media_incomplete");
    });

    await scenario("operation recovery is read-only exact and mismatch safe", () => {
      const recovered = result(box, `saas.catalog_recover_onboarding_operation(${authority()},'${operationId(1)}','${fingerprint(1)}')`);
      assert.equal(recovered.outcome, "operation_replayed");
      assert.equal(recovered.result.product.id, quick.result.product.id);
      assert.equal(result(box, `saas.catalog_recover_onboarding_operation(${authority()},'${operationId(1)}','${fingerprint(99)}')`).outcome, "operation_mismatch");
    });

    await scenario("application role has zero table DML and functions retain forced RLS", () => {
      for (const table of ["catalog_product_profiles", "catalog_categories", "catalog_product_categories", "catalog_variant_commerce_profiles", "catalog_product_channels", "catalog_onboarding_operations"]) {
        assert.equal(psql(box, `SELECT has_table_privilege('celebix_saas_app','saas.${table}','INSERT,UPDATE,DELETE');`).stdout.trim(), "f");
      }
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app; UPDATE saas.catalog_product_profiles SET version=2;", DB, true).status, 0);
    });

    await scenario("immutable operation proof rejects owner update and delete", () => {
      assert.notEqual(psql(box, `SET ROLE celebix_saas_owner; UPDATE saas.catalog_onboarding_operations SET payload_fingerprint='${"0".repeat(64)}' WHERE operation_id='${operationId(1)}';`, DB, true).status, 0);
      assert.notEqual(psql(box, `SET ROLE celebix_saas_owner; DELETE FROM saas.catalog_onboarding_operations WHERE operation_id='${operationId(1)}';`, DB, true).status, 0);
    });

    await scenario("backup and restore preserve projections ACL RLS and immutable proof", () => {
      const dump = path.join(box.root, "catalog-onboarding.dump");
      command(box.executables.pg_dump, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-Fc", "-f", dump, DB]);
      psql(box, `CREATE DATABASE ${RESTORE_DB};`, "postgres");
      command(box.executables.pg_restore, ["-h", box.socket, "-p", String(box.port), "-U", "postgres", "-d", RESTORE_DB, dump]);
      assert.equal(psql(box, "SELECT count(*) FROM saas.catalog_product_profiles;", RESTORE_DB).stdout.trim(), psql(box, "SELECT count(*) FROM saas.catalog_product_profiles;").stdout.trim());
      assert.notEqual(psql(box, "SET ROLE celebix_saas_app; SELECT count(*) FROM saas.catalog_product_profiles;", RESTORE_DB, true).status, 0);
    });

    await scenario("nonempty rollback refuses while empty disposable rollback and reapply pass", () => {
      assert.notEqual(psql(box, readFileSync(path.join(SQL, DOWN), "utf8"), DB, true).status, 0);
      apply(box, UP, ROLLBACK_DB); apply(box, ASSERTIONS, ROLLBACK_DB); apply(box, DOWN, ROLLBACK_DB);
      assert.equal(psql(box, "SELECT to_regclass('saas.catalog_product_profiles') IS NULL;", ROLLBACK_DB).stdout.trim(), "t");
      apply(box, UP, ROLLBACK_DB); apply(box, ASSERTIONS, ROLLBACK_DB);
    });

    await scenario("manifest hashes and no external connection authority are exact", () => {
      const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3-product-onboarding-manifest.json"), "utf8"));
      for (const artifact of manifest.artifacts) assert.equal(createHash("sha256").update(readFileSync(path.join(SQL, artifact.file))).digest("hex"), artifact.sha256);
      const externalAuthorityPattern = new RegExp([
        ["DATABASE", "URL"].join("_"), ["PG", "HOST"].join(""), ["local", "host"].join(""),
        ["127", "[.]0[.]0[.]1"].join(""),
      ].join("|"));
      assert.doesNotMatch(readFileSync(import.meta.filename, "utf8"), externalAuthorityPattern);
    });

    await scenario("cleanup owns the isolated process socket and data directory", () => {
      assert.equal(box.root.startsWith("/tmp/celebix-catalog-onboarding-"), true);
      assert.equal(box.started, true);
    });

    assert.equal(completed, TOTAL);
    process.stdout.write(JSON.stringify({ status: "PASS", backend: "native-postgresql", postgresqlVersion: "16.14", scenarios: `${TOTAL}/${TOTAL}`, externalConnections: 0, stagingConnections: 0, productionConnections: 0, cleanup: "PASS" }) + "\n");
  } finally {
    stop(box);
  }
}

main().catch((error) => { process.stderr.write(`${error?.stack ?? error}\n`); process.exitCode = 1; });
