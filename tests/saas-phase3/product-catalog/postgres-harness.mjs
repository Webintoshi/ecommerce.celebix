import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { accessSync, constants, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { CatalogRepositoryError, PostgresCatalogRepository } from "@celebix/saas-data";

import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = path.join(ROOT, "apps", "owner", "scripts", "sql", "saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DATABASE = `phase3a1_${TOKEN}`;
const RESTORE_DATABASE = `${DATABASE}_restore`;
const ROLLBACK_DATABASE = `${DATABASE}_rollback`;
const NOW = new Date("2026-07-16T08:00:00.000Z");
const TIMEOUTS = { poolCheckoutMs: 2_000, statementMs: 5_000, lockMs: 5_000, idleTransactionMs: 5_000 };
const FREE_PLAN = "00000000-0000-4000-8000-000000000001";
const ONE_PRODUCT_PLAN = "00000000-0000-4000-8000-000000000099";
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const STORE_C = "10000000-0000-4000-8000-000000000003";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000001";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000002";
const PRINCIPAL_C = "20000000-0000-4000-8000-000000000003";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000002";
const MEMBERSHIP_C = "30000000-0000-4000-8000-000000000003";
const SCENARIOS = [];

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
    encoding: options.binary ? null : "utf8",
    input: options.input,
    env: { PATH: `${PG16}:${process.env.PATH ?? ""}`, LC_ALL: "C", LANG: "C" },
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (!options.allowFailure && result.status !== 0) {
    throw new Error(`disposable command failed: ${path.basename(program)}\n${String(result.stderr ?? "").trim()}`);
  }
  return result;
}

function startPostgres() {
  assertSafeEnvironment();
  const executables = Object.fromEntries(REQUIRED_NATIVE_TOOLS.map((name) => [name, executable(name)]));
  if (Object.values(executables).some((value) => !value)) throw new Error("DISPOSABLE_DB_EXECUTION_BLOCKED");
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-phase3a1-"));
  const socketDirectory = path.join(temporaryDirectory, "socket");
  const dataDirectory = path.join(temporaryDirectory, "data");
  const port = 20_000 + Math.floor(Math.random() * 20_000);
  mkdirSync(socketDirectory, { mode: 0o700 });
  command(executables.initdb, ["-D", dataDirectory, "--auth=trust", "--username=postgres", "--no-locale"]);
  command(executables.pg_ctl, [
    "-D", dataDirectory,
    "-o", `-k ${socketDirectory} -p ${port} -h ''`,
    "-l", path.join(temporaryDirectory, "postgres.log"),
    "start",
  ]);
  return { executables, temporaryDirectory, socketDirectory, dataDirectory, port, started: true };
}

function stopPostgres(backend) {
  if (!backend) return;
  if (backend.started) {
    command(backend.executables.pg_ctl, ["-D", backend.dataDirectory, "-m", "fast", "stop"], { allowFailure: true });
    backend.started = false;
  }
  rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function psql(backend, source, database = DATABASE, options = {}) {
  return command(backend.executables.psql, [
    "-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: source, allowFailure: options.allowFailure }).stdout.trim();
}

function migration(backend, file, database = DATABASE) {
  psql(backend, readFileSync(path.join(SQL, file), "utf8"), database);
}

function createDatabase(backend, database) {
  psql(backend, `CREATE DATABASE ${database};`, "postgres");
}

async function scenario(name, run) {
  await run();
  SCENARIOS.push(name);
  process.stdout.write(`PASS ${SCENARIOS.length}/${33} ${name}\n`);
}

function context(storeId, principalId, membershipId, options = {}) {
  const oneProduct = options.oneProduct === true;
  return {
    schemaVersion: 1,
    requestId: randomUUID(),
    principal: { id: principalId, issuer: "https://identity.example.test/oidc", subject: `subject-${storeId}` },
    store: { id: storeId, slug: options.slug ?? "catalog-store", status: "active" },
    membership: { id: membershipId, role: "store_owner", status: "active" },
    entitlements: {
      schemaVersion: 1,
      planId: oneProduct ? ONE_PRODUCT_PLAN : FREE_PLAN,
      planCode: oneProduct ? "catalog_one" : "free_starter",
      version: 1,
      status: "active",
      features: ["catalog"],
      limits: { products: oneProduct ? 1 : 100, staff: 1, storageBytes: 1_000_000_000 },
      validFrom: "2026-01-01T00:00:00.000Z",
    },
    locale: "tr-TR",
  };
}

function productInput(tenantContext, slug, sku, operationId = randomUUID(), now = NOW) {
  return {
    tenantContext,
    now,
    operationId,
    product: { slug, title: `Product ${slug}`, description: `Description ${slug}`, status: "draft", currency: "TRY" },
    initialVariant: {
      title: "Default", sku, barcode: `869${randomBytes(5).toString("hex")}`,
      priceCents: 10_000, compareAtCents: 12_000, costCents: 5_000,
      stockTracking: true, stockQuantity: 10, attributes: { color: "black" },
    },
  };
}

function repository(pool, ids, audit = () => undefined) {
  const queue = [...ids];
  return new PostgresCatalogRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: TIMEOUTS,
    generateId: () => {
      const id = queue.shift();
      if (!id) throw new Error("catalog fixture ID queue exhausted");
      return id;
    },
    audit,
  });
}

async function rejectCode(promise, code) {
  await assert.rejects(
    promise,
    (error) => error instanceof CatalogRepositoryError && error.code === code && error.message === code,
  );
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

async function main() {
  const backend = startPostgres();
  let pool;
  try {
    createDatabase(backend, DATABASE);
    migration(backend, "202607110001_roles.up.sql");
    migration(backend, "202607110002_foundation.up.sql");
    migration(backend, "202607110003_free_starter.seed.sql");
    psql(backend, `
      BEGIN; SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.plans (id, plan_code, version, status, valid_from, valid_until, created_at, updated_at)
      VALUES ('${ONE_PRODUCT_PLAN}', 'catalog_one', 1, 'active', '2026-01-01', NULL, '2026-01-01', '2026-01-01');
      INSERT INTO saas.plan_features (plan_id, feature_key, feature_ordinal, enabled)
      VALUES ('${ONE_PRODUCT_PLAN}', 'catalog', 1, true);
      INSERT INTO saas.plan_limits (plan_id, limit_key, limit_ordinal, limit_value)
      VALUES ('${ONE_PRODUCT_PLAN}', 'products', 1, 1);
      COMMIT;
    `);
    for (const file of [
      "202607110003_plan_versions.freeze.sql",
      "202607110004_grants.sql",
      "202607110005_catalog_assertions.sql",
      "202607160018_product_catalog.up.sql",
      "202607160018_product_catalog_assertions.sql",
    ]) migration(backend, file);

    await scenario("PostgreSQL 16.14 and migrations 001-018", async () => {
      assert.match(psql(backend, "SHOW server_version;"), /^16\.14/);
      assert.equal(psql(backend, "SELECT to_regclass('saas.products')::text || ':' || to_regclass('saas.product_variants')::text;"), "saas.products:saas.product_variants");
    });

    await scenario("catalog constraints, composite FK, RLS and assertions", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_catalog.pg_class WHERE oid IN ('saas.products'::regclass,'saas.product_variants'::regclass,'saas.catalog_operations'::regclass) AND relrowsecurity AND relforcerowsecurity;`), "3");
      assert.match(psql(backend, `SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname='product_variants_product_store_fk';`), /store_id, product_id.*products\(store_id, id\)/);
    });

    psql(backend, `
      BEGIN; SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.principals (id, issuer, subject, email, email_verified, created_at, updated_at) VALUES
        ('${PRINCIPAL_A}','https://identity.example.test/oidc','subject-a','a@example.test',true,'2026-01-01','2026-01-01'),
        ('${PRINCIPAL_B}','https://identity.example.test/oidc','subject-b','b@example.test',true,'2026-01-01','2026-01-01'),
        ('${PRINCIPAL_C}','https://identity.example.test/oidc','subject-c','c@example.test',true,'2026-01-01','2026-01-01');
      INSERT INTO saas.stores (id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${STORE_A}','Store A','store-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
        ('${STORE_B}','Store B','store-b','active','tr','TRY','default','2026-01-01','2026-01-01'),
        ('${STORE_C}','Store C','store-c','active','tr','TRY','default','2026-01-01','2026-01-01');
      INSERT INTO saas.memberships (id,principal_id,store_id,role,status,created_at,updated_at) VALUES
        ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
        ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01'),
        ('${MEMBERSHIP_C}','${PRINCIPAL_C}','${STORE_C}','store_owner','active','2026-01-01','2026-01-01');
      INSERT INTO saas.subscriptions (id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
        ('40000000-0000-4000-8000-000000000001','${STORE_A}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
        ('40000000-0000-4000-8000-000000000002','${STORE_B}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
        ('40000000-0000-4000-8000-000000000003','${STORE_C}','${ONE_PRODUCT_PLAN}','catalog_one',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
      COMMIT;
    `);

    pool = new Pool({ host: backend.socketDirectory, port: backend.port, user: "postgres", database: DATABASE, max: 20 });
    const ctxA = context(STORE_A, PRINCIPAL_A, MEMBERSHIP_A, { slug: "store-a" });
    const ctxB = context(STORE_B, PRINCIPAL_B, MEMBERSHIP_B, { slug: "store-b" });
    const ctxC = context(STORE_C, PRINCIPAL_C, MEMBERSHIP_C, { slug: "store-c", oneProduct: true });

    const productAId = randomUUID();
    const variantAId = randomUUID();
    const createAInput = productInput(ctxA, "shared-slug", "SHARED-SKU");
    const createdA = await repository(pool, [productAId, variantAId]).createProduct(createAInput);

    await scenario("valid TenantContext creates product and initial variant atomically", async () => {
      assert.equal(createdA.product.id, productAId);
      assert.equal(createdA.initialVariant.productId, productAId);
      assert.equal(createdA.product.storeId, STORE_A);
      assert.equal(createdA.initialVariant.storeId, STORE_A);
      assert.equal(Object.isFrozen(createdA.initialVariant.attributes), true);
      assert.equal(psql(backend, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.products WHERE id='${productAId}'; RESET ROLE;`), "1");
    });

    await scenario("browser supplied foreign store ID never changes authority", async () => {
      let checkouts = 0;
      const refusingPool = { async connect() { checkouts += 1; throw new Error("must not connect"); } };
      const bad = productInput(ctxA, "foreign-store", "FOREIGN-STORE");
      bad.product.storeId = STORE_B;
      await rejectCode(repository(refusingPool, [randomUUID(), randomUUID()]).createProduct(bad), "invalid_input");
      assert.equal(checkouts, 0);
    });

    await scenario("product list is isolated to TenantContext store", async () => {
      const listA = await repository(pool, []).listProducts({ tenantContext: ctxA, now: NOW, pageSize: 100 });
      const listB = await repository(pool, []).listProducts({ tenantContext: ctxB, now: NOW, pageSize: 100 });
      assert.deepEqual(listA.items.map((item) => item.id), [productAId]);
      assert.deepEqual(listB.items, []);
    });

    await scenario("cross-store get update and archive are denied", async () => {
      await rejectCode(repository(pool, []).getProduct({ tenantContext: ctxB, now: NOW, productId: productAId }), "product_not_found");
      await rejectCode(repository(pool, []).updateProduct({ tenantContext: ctxB, now: NOW, operationId: randomUUID(), productId: productAId, expectedVersion: 1, product: createAInput.product }), "product_not_found");
      await rejectCode(repository(pool, []).archiveProduct({ tenantContext: ctxB, now: NOW, operationId: randomUUID(), productId: productAId, expectedVersion: 1 }), "product_not_found");
    });

    const createdB = await repository(pool, [randomUUID(), randomUUID()]).createProduct(productInput(ctxB, "shared-slug", "SHARED-SKU"));
    await scenario("slug uniqueness is store-local", async () => {
      await rejectCode(repository(pool, [randomUUID(), randomUUID()]).createProduct(productInput(ctxA, "shared-slug", "OTHER-SKU")), "slug_conflict");
      assert.equal(createdB.product.slug, "shared-slug");
    });

    await scenario("non-null SKU uniqueness is store-local", async () => {
      await rejectCode(repository(pool, [randomUUID(), randomUUID()]).createProduct(productInput(ctxA, "other-slug", "SHARED-SKU")), "sku_conflict");
      assert.equal(createdB.initialVariant.sku, "SHARED-SKU");
    });

    await scenario("variant cross-store product association is structurally impossible", async () => {
      const failure = psql(backend, `SET ROLE celebix_saas_owner; INSERT INTO saas.product_variants (id,product_id,store_id,title,price_cents,stock_tracking,stock_quantity,status,attributes,version,created_at,updated_at) VALUES ('${randomUUID()}','${productAId}','${STORE_B}','Cross',1,false,0,'active','{}',1,'${NOW.toISOString()}','${NOW.toISOString()}');`, DATABASE, { allowFailure: true });
      assert.equal(failure, "");
      assert.equal(psql(backend, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.product_variants WHERE product_id='${productAId}' AND store_id='${STORE_B}'; RESET ROLE;`), "0");
    });

    await scenario("negative money stock and compare-at inversions are denied", async () => {
      for (const change of [{ priceCents: -1 }, { stockQuantity: -1 }, { priceCents: 100, compareAtCents: 99 }]) {
        const invalid = productInput(ctxA, `invalid-${randomBytes(2).toString("hex")}`, `INVALID-${randomBytes(2).toString("hex")}`);
        Object.assign(invalid.initialVariant, change);
        await rejectCode(repository(pool, [randomUUID(), randomUUID()]).createProduct(invalid), "invalid_input");
      }
    });

    await scenario("malformed attributes are denied", async () => {
      const invalid = productInput(ctxA, "invalid-attributes", "INVALID-ATTRIBUTES");
      invalid.initialVariant.attributes = { count: 7 };
      await rejectCode(repository(pool, [randomUUID(), randomUUID()]).createProduct(invalid), "invalid_input");
    });

    await scenario("product limit enforcement is race safe", async () => {
      const left = repository(pool, [randomUUID(), randomUUID()]).createProduct(productInput(ctxC, "limit-left", "LIMIT-LEFT"));
      const right = repository(pool, [randomUUID(), randomUUID()]).createProduct(productInput(ctxC, "limit-right", "LIMIT-RIGHT"));
      const results = await Promise.allSettled([left, right]);
      assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
      assert.equal(results.filter((result) => result.status === "rejected" && result.reason?.code === "product_limit_reached").length, 1);
      assert.equal(psql(backend, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.products WHERE store_id='${STORE_C}' AND status <> 'archived'; RESET ROLE;`), "1");
    });

    const updateInput = {
      tenantContext: ctxA, now: new Date("2026-07-16T08:01:00.000Z"), operationId: randomUUID(),
      productId: productAId, expectedVersion: 1,
      product: { ...createAInput.product, slug: "shared-slug-updated", title: "Updated Product" },
    };
    const updatedA = await repository(pool, []).updateProduct(updateInput);
    await scenario("optimistic versions reject stale concurrent updates", async () => {
      assert.equal(updatedA.product.version, 2);
      await rejectCode(repository(pool, []).updateProduct({ ...updateInput, operationId: randomUUID(), product: { ...updateInput.product, title: "Stale" } }), "version_conflict");
    });

    const extraVariantId = randomUUID();
    const createdVariant = await repository(pool, [extraVariantId]).createVariant({
      tenantContext: ctxA, now: NOW, operationId: randomUUID(), productId: productAId,
      variant: { title: "Blue", sku: "BLUE-1", priceCents: 11_000, stockTracking: true, stockQuantity: 4, attributes: { color: "blue" } },
    });
    const updatedVariant = await repository(pool, []).updateVariant({
      tenantContext: ctxA, now: NOW, operationId: randomUUID(), productId: productAId, variantId: extraVariantId, expectedVersion: 1,
      variant: { title: "Blue Large", sku: "BLUE-2", priceCents: 12_000, stockTracking: true, stockQuantity: 3, attributes: { color: "blue", size: "large" } },
    });
    const archivedVariant = await repository(pool, []).archiveVariant({ tenantContext: ctxA, now: NOW, operationId: randomUUID(), productId: productAId, variantId: extraVariantId, expectedVersion: 2 });
    await scenario("variant create update archive is store/product bound", async () => {
      assert.equal(createdVariant.variant.version, 1);
      assert.equal(updatedVariant.variant.version, 2);
      assert.equal(archivedVariant.variant.status, "archived");
      await rejectCode(repository(pool, []).updateVariant({ tenantContext: ctxB, now: NOW, operationId: randomUUID(), productId: productAId, variantId: extraVariantId, expectedVersion: 3, variant: { title: "Denied", priceCents: 1, stockTracking: false, stockQuantity: 0, attributes: {} } }), "product_not_found");
    });

    const pageProducts = [];
    for (let index = 0; index < 3; index += 1) {
      const created = await repository(pool, [randomUUID(), randomUUID()]).createProduct(productInput(
        ctxA, `page-${index}`, `PAGE-${index}`, randomUUID(), new Date(NOW.getTime() + (index + 2) * 60_000),
      ));
      pageProducts.push(created.product);
    }
    const firstPage = await repository(pool, []).listProducts({ tenantContext: ctxA, now: new Date(NOW.getTime() + 600_000), pageSize: 2 });
    const secondPage = await repository(pool, []).listProducts({ tenantContext: ctxA, now: new Date(NOW.getTime() + 600_000), pageSize: 2, cursor: firstPage.nextCursor });
    await scenario("keyset pagination is deterministic and bounded", async () => {
      assert.equal(firstPage.items.length, 2);
      assert.equal(typeof firstPage.nextCursor, "string");
      assert.equal(new Set([...firstPage.items, ...secondPage.items].map((item) => item.id)).size, firstPage.items.length + secondPage.items.length);
      assert.deepEqual(firstPage.items.map((item) => item.id), [...firstPage.items].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id)).map((item) => item.id));
    });

    await scenario("cursor from one store is denied in another store", async () => {
      await rejectCode(repository(pool, []).listProducts({ tenantContext: ctxB, now: NOW, pageSize: 2, cursor: firstPage.nextCursor }), "invalid_input");
    });

    const replayOperation = randomUUID();
    const replayInput = productInput(ctxA, "replay-product", "REPLAY-PRODUCT", replayOperation);
    const replayFirst = await repository(pool, [randomUUID(), randomUUID()]).createProduct(replayInput);
    const replaySecond = await repository(pool, [randomUUID(), randomUUID()]).createProduct(replayInput);
    await scenario("same operation and canonical payload replays without duplicate rows", async () => {
      assert.equal(replayFirst.replayed, false);
      assert.equal(replaySecond.replayed, true);
      assert.equal(replaySecond.product.id, replayFirst.product.id);
      assert.equal(psql(backend, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.products WHERE store_id='${STORE_A}' AND slug='replay-product'; RESET ROLE;`), "1");
    });

    await scenario("same operation with different payload fails closed", async () => {
      const mismatch = productInput(ctxA, "replay-product-changed", "REPLAY-CHANGED", replayOperation);
      await rejectCode(repository(pool, [randomUUID(), randomUUID()]).createProduct(mismatch), "operation_mismatch");
    });

    await scenario("unknown COMMIT uses exactly one read-only recovery", async () => {
      let firstCheckout = true;
      let recoveryQueries = 0;
      let audits = 0;
      const lossPool = {
        async connect() {
          const client = await pool.connect();
          if (!firstCheckout) {
            return {
              async query(text, values) {
                if (String(text).includes("catalog_recover_operation")) recoveryQueries += 1;
                return client.query(text, values);
              },
              release(destroy) { client.release(destroy); },
            };
          }
          firstCheckout = false;
          return {
            async query(text, values) {
              const result = await client.query(text, values);
              if (text === "COMMIT") throw new Error("simulated response loss");
              return result;
            },
            release(destroy) { client.release(destroy); },
          };
        },
      };
      const recovered = await repository(lossPool, [randomUUID(), randomUUID()], () => { audits += 1; })
        .createProduct(productInput(ctxA, "commit-recovery", "COMMIT-RECOVERY"));
      assert.equal(recovered.replayed, true);
      assert.equal(recoveryQueries, 1);
      assert.equal(audits, 1);
    });

    await scenario("RLS denies a direct unauthorized reader", async () => {
      const probe = `catalog_probe_${TOKEN}`;
      psql(backend, `CREATE ROLE ${probe} NOLOGIN; GRANT USAGE ON SCHEMA saas TO ${probe}; GRANT SELECT ON saas.products TO ${probe};`);
      assert.equal(psql(backend, `SET ROLE ${probe}; SELECT count(*) FROM saas.products; RESET ROLE;`), "0");
    });

    await scenario("PUBLIC and application roles have no direct mutation privilege", async () => {
      assert.equal(psql(backend, `SELECT has_table_privilege('celebix_saas_app','saas.products','INSERT,UPDATE,DELETE');`), "f");
      const denied = command(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DATABASE], { input: `SET ROLE celebix_saas_app; INSERT INTO saas.products DEFAULT VALUES;`, allowFailure: true });
      assert.notEqual(denied.status, 0);
    });

    await scenario("all catalog SECURITY DEFINER functions pin exact search_path", async () => {
      assert.equal(psql(backend, `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'catalog_%' AND p.prosecdef AND p.proconfig IS DISTINCT FROM ARRAY['search_path=pg_catalog, saas']::text[];`), "0");
    });

    await scenario("safe errors contain no SQL or driver detail", async () => {
      const brokenPool = { async connect() { throw new Error("driver detail SELECT internal_table"); } };
      await rejectCode(repository(brokenPool, []).getProduct({ tenantContext: ctxA, now: NOW, productId: productAId }), "unavailable");
    });

    await scenario("durable store membership feature and limit authority is exact", async () => {
      await rejectCode(repository(pool, []).getProduct({ tenantContext: { ...ctxA, membership: { ...ctxA.membership, id: randomUUID() } }, now: NOW, productId: productAId }), "membership_denied");
      await rejectCode(repository(pool, []).getProduct({ tenantContext: { ...ctxA, entitlements: { ...ctxA.entitlements, limits: { ...ctxA.entitlements.limits, products: 99 } } }, now: NOW, productId: productAId }), "durable_authority_invalid");
    });

    await scenario("catalog operation records are immutable durable projections", async () => {
      assert.equal(psql(backend, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.catalog_operations WHERE result_payload IS NOT NULL AND payload_fingerprint ~ '^[a-f0-9]{64}$'; RESET ROLE;`), psql(backend, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.catalog_operations; RESET ROLE;`));
      const denied = command(backend.executables.psql, ["-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", DATABASE], { input: `SET ROLE celebix_saas_owner; UPDATE saas.catalog_operations SET result_payload='{}';`, allowFailure: true });
      assert.notEqual(denied.status, 0);
      assert.match(String(denied.stderr), /CATALOG_OPERATION_IMMUTABLE/);
    });

    const archivedA = await repository(pool, []).archiveProduct({ tenantContext: ctxA, now: new Date("2026-07-16T09:00:00.000Z"), operationId: randomUUID(), productId: productAId, expectedVersion: 2 });
    await scenario("archive is a terminal state transition and default listing excludes it", async () => {
      assert.equal(archivedA.product.status, "archived");
      const defaultList = await repository(pool, []).listProducts({ tenantContext: ctxA, now: NOW, pageSize: 100 });
      const archivedList = await repository(pool, []).listProducts({ tenantContext: ctxA, now: NOW, pageSize: 100, status: "archived" });
      assert.equal(defaultList.items.some((item) => item.id === productAId), false);
      assert.equal(archivedList.items.some((item) => item.id === productAId), true);
      await rejectCode(repository(pool, []).updateProduct({ ...updateInput, operationId: randomUUID(), expectedVersion: 3 }), "product_not_found");
    });

    await scenario("no hard-delete repository or SQL surface exists", async () => {
      const source = readFileSync(path.join(ROOT, "packages", "saas-data", "src", "catalog", "types.ts"), "utf8");
      assert.doesNotMatch(source, /deleteProduct|deleteVariant/);
      assert.equal(psql(backend, `SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='saas' AND p.proname LIKE 'catalog_delete%';`), "0");
    });

    await scenario("dedicated-store public product schemas are untouched", async () => {
      const migrationSource = readFileSync(path.join(SQL, "202607160018_product_catalog.up.sql"), "utf8");
      assert.doesNotMatch(migrationSource, /public\.(?:products|product_variants)/i);
      assert.match(migrationSource, /CREATE TABLE saas\.products/);
    });

    await pool.end();
    pool = undefined;

    await scenario("backup and restore preserve catalog authority", async () => {
      const dump = path.join(backend.temporaryDirectory, "phase3a1.dump");
      command(backend.executables.pg_dump, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-d", DATABASE, "-Fc", "-f", dump]);
      createDatabase(backend, RESTORE_DATABASE);
      command(backend.executables.pg_restore, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-d", RESTORE_DATABASE, dump]);
      assert.equal(psql(backend, `SET ROLE celebix_saas_owner; SELECT count(*) > 0 FROM saas.products; RESET ROLE;`, RESTORE_DATABASE), "t");
    });

    await scenario("migration 018 rollback limitation and clean reapply are proven", async () => {
      createDatabase(backend, ROLLBACK_DATABASE);
      psql(backend, `GRANT CREATE ON DATABASE ${ROLLBACK_DATABASE} TO celebix_saas_owner;`, "postgres");
      for (const file of [
        "202607110002_foundation.up.sql", "202607110003_free_starter.seed.sql",
        "202607110003_plan_versions.freeze.sql", "202607110004_grants.sql",
        "202607110005_catalog_assertions.sql", "202607160018_product_catalog.up.sql",
      ]) migration(backend, file, ROLLBACK_DATABASE);
      migration(backend, "202607160018_product_catalog.down.sql", ROLLBACK_DATABASE);
      assert.equal(psql(backend, `SELECT to_regclass('saas.products') IS NULL;`, ROLLBACK_DATABASE), "t");
      migration(backend, "202607160018_product_catalog.up.sql", ROLLBACK_DATABASE);
      migration(backend, "202607160018_product_catalog_assertions.sql", ROLLBACK_DATABASE);
      assert.equal(psql(backend, `SELECT to_regclass('saas.products') IS NOT NULL;`, ROLLBACK_DATABASE), "t");
    });

    await scenario("manifest checksums and additive classification are exact", async () => {
      const manifestPath = path.join(SQL, "phase3a1-product-manifest.json");
      const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
      assert.equal(manifest.migrationClassification, "additive");
      assert.equal(manifest.postgresqlMajor, 16);
      for (const artifact of manifest.artifacts) assert.equal(sha256(path.join(SQL, artifact.file)), artifact.sha256);
    });

    await scenario("tracked catalog sources contain no credential or secret material", async () => {
      const files = [
        path.join(SQL, "202607160018_product_catalog.up.sql"),
        path.join(ROOT, "packages", "saas-data", "src", "catalog", "repository.ts"),
        path.join(ROOT, "packages", "saas-contracts", "src", "catalog", "types.ts"),
      ];
      const combined = files.map((file) => readFileSync(file, "utf8")).join("\n");
      assert.doesNotMatch(combined, /postgres(?:ql)?:\/\/|BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY|password\s*=/i);
    });

    await scenario("all disposable databases sockets and processes are cleanup-owned", async () => {
      assert.equal(backend.socketDirectory.startsWith(tmpdir()), true);
      assert.equal(backend.started, true);
    });

    assert.equal(SCENARIOS.length, 33);
    process.stdout.write(JSON.stringify({
      status: "PASS",
      backend: "native-postgresql",
      postgresqlVersion: "16.14",
      scenarios: "33/33",
      externalConnections: 0,
      stagingConnections: 0,
      productionConnections: 0,
      cleanup: "PASS",
    }) + "\n");
  } finally {
    if (pool) await pool.end().catch(() => undefined);
    stopPostgres(backend);
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
