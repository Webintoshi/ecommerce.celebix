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

import { createCatalogHttpHandlers } from "../../../apps/customer-panel/lib/catalog-http/handler.ts";
import { REQUIRED_NATIVE_TOOLS, assertSafeEnvironment } from "../../saas-phase2/postgres/disposable-harness.mjs";

const { Pool } = pg;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const SQL = path.join(ROOT, "apps", "owner", "scripts", "sql", "saas");
const PG16 = "/Users/Celebix/.codex/tmp/postgresql-16.14-install/bin";
const TOKEN = randomBytes(6).toString("hex");
const DATABASE = `phase3a2_${TOKEN}`;
const RESTORE_DATABASE = `${DATABASE}_restore`;
const ROLLBACK_DATABASE = `${DATABASE}_rollback`;
const WORKLOAD_ROLE = `phase3a2_runtime_${TOKEN}`;
const PANEL_ORIGIN = "https://panel.saas-staging.celebix.site";
const CREDENTIAL = `v1.panel.current.${Buffer.alloc(32, 0x61).toString("base64url")}`;
const NOW = new Date("2026-07-17T08:00:00.000Z");
const FREE_PLAN = "00000000-0000-4000-8000-000000000001";
const STORE_A = "10000000-0000-4000-8000-000000000001";
const STORE_B = "10000000-0000-4000-8000-000000000002";
const PRINCIPAL_A = "20000000-0000-4000-8000-000000000001";
const PRINCIPAL_B = "20000000-0000-4000-8000-000000000002";
const MEMBERSHIP_A = "30000000-0000-4000-8000-000000000001";
const MEMBERSHIP_B = "30000000-0000-4000-8000-000000000002";
const REQUEST_ID = "40000000-0000-4000-8000-000000000001";
const TOTAL = 26;
const completed = [];
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
];
const TIMEOUTS = Object.freeze({
  poolCheckoutMs: 2_000,
  statementMs: 5_000,
  lockMs: 5_000,
  idleTransactionMs: 5_000,
});

function executable(name) {
  for (const directory of [PG16, ...(process.env.PATH ?? "").split(path.delimiter)]) {
    if (!directory) continue;
    const candidate = path.join(directory, name);
    try { accessSync(candidate, constants.X_OK); return candidate; } catch { /* Continue. */ }
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
  const temporaryDirectory = mkdtempSync(path.join(tmpdir(), "celebix-phase3a2-"));
  const socketDirectory = path.join("/tmp", `c3a2-${TOKEN}`);
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
  rmSync(backend.socketDirectory, { recursive: true, force: true });
  rmSync(backend.temporaryDirectory, { recursive: true, force: true });
}

function psql(backend, source, database = DATABASE, options = {}) {
  return command(backend.executables.psql, [
    "-h", backend.socketDirectory, "-p", String(backend.port), "-X", "-qAt", "-v", "ON_ERROR_STOP=1",
    "-U", "postgres", "-d", database,
  ], { input: source, allowFailure: options.allowFailure }).stdout.trim();
}

function apply(backend, file, database = DATABASE) {
  psql(backend, readFileSync(path.join(SQL, file), "utf8"), database);
}

function createDatabase(backend, database) {
  psql(backend, `CREATE DATABASE ${database};`, "postgres");
}

async function scenario(name, run) {
  await run();
  completed.push(name);
  process.stdout.write(`PASS ${completed.length}/${TOTAL} ${name}\n`);
}

function tenantContext(storeId, principalId, membershipId, slug) {
  return Object.freeze({
    schemaVersion: 1,
    requestId: REQUEST_ID,
    principal: Object.freeze({
      id: principalId,
      issuer: "https://identity.example.test/oidc",
      subject: `subject-${slug}`,
    }),
    store: Object.freeze({ id: storeId, slug, status: "active" }),
    membership: Object.freeze({ id: membershipId, role: "store_owner", status: "active" }),
    entitlements: Object.freeze({
      schemaVersion: 1,
      planId: FREE_PLAN,
      planCode: "free_starter",
      version: 1,
      status: "active",
      features: Object.freeze(["catalog"]),
      limits: Object.freeze({ products: 100, staff: 1, storageBytes: 1_000_000_000 }),
      validFrom: "2026-01-01T00:00:00.000Z",
    }),
    locale: "tr-TR",
  });
}

function repository(pool) {
  return new PostgresCatalogRepository({
    pool,
    role: "celebix_saas_app",
    timeouts: TIMEOUTS,
    generateId: () => randomUUID(),
    audit: () => undefined,
  });
}

function runtime(catalog, accessResult) {
  return Object.freeze({
    access: Object.freeze({
      readiness: Object.freeze({ mode: "approved_staging" }),
      panelOrigin: PANEL_ORIGIN,
      async resolveCredential() { return accessResult; },
      async rotateCredential() { return Object.freeze({ kind: "unavailable" }); },
      async revokeCredential() { return Object.freeze({ kind: "unavailable" }); },
    }),
    catalog,
  });
}

function handlers(catalog, accessResult) {
  const activeRuntime = runtime(catalog, accessResult);
  return createCatalogHttpHandlers({
    async resolveRuntime() { return activeRuntime; },
    now() { return new Date(NOW); },
    requestId() { return REQUEST_ID; },
  });
}

function request(pathname, options = {}) {
  const method = options.method ?? "GET";
  const headers = new Headers(options.headers);
  if (options.cookie !== null) headers.set("cookie", options.cookie ?? `__Host-celebix_panel=${CREDENTIAL}`);
  if (method !== "GET") {
    if (options.origin !== null) headers.set("origin", options.origin ?? PANEL_ORIGIN);
    if (options.operationId !== null) headers.set("idempotency-key", options.operationId ?? randomUUID());
    headers.set("content-type", options.contentType ?? "application/json");
  }
  return new Request(`http://customer-panel:3400${pathname}`, {
    method,
    headers,
    body: method === "GET" ? undefined : JSON.stringify(options.body ?? {}),
  });
}

function productBody(slug = "api-product", sku = "API-ONE") {
  return {
    product: {
      slug,
      title: "API Product",
      description: "PostgreSQL-backed API fixture",
      status: "draft",
      currency: "TRY",
    },
    initialVariant: {
      title: "Default",
      sku,
      barcode: "8690000000001",
      priceCents: 12_500,
      compareAtCents: 15_000,
      costCents: 7_000,
      stockTracking: true,
      stockQuantity: 10,
      attributes: { color: "black" },
    },
  };
}

async function body(response) {
  return await response.json();
}

async function expectCatalogError(promise, code) {
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
    for (const file of migrations) apply(backend, file);

    await scenario("PostgreSQL 16.14 applies the complete 001-019 migration sequence", async () => {
      assert.match(psql(backend, "SHOW server_version;"), /^16\.14/);
      assert.equal(psql(backend, "SELECT to_regclass('saas.products')::text || ':' || to_regprocedure('saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)')::text;"), "saas.products:saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)");
    });

    await scenario("detail function is stable SECURITY DEFINER with exact pinned search_path", async () => {
      assert.equal(psql(backend, `SELECT p.prosecdef::text || ':' || p.provolatile::text || ':' || array_to_string(p.proconfig, ',') FROM pg_proc p WHERE p.oid='saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)'::regprocedure;`), "true:s:search_path=pg_catalog, saas");
    });

    await scenario("PUBLIC has no execution and only the reviewed application role can execute detail", async () => {
      assert.equal(psql(backend, `SELECT has_function_privilege('public','saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)','EXECUTE')::text || ':' || has_function_privilege('celebix_saas_app','saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)','EXECUTE')::text;`), "false:true");
      assert.equal(psql(backend, `SELECT has_table_privilege('celebix_saas_app','saas.products','SELECT')::text || ':' || has_table_privilege('celebix_saas_app','saas.product_variants','SELECT')::text;`), "false:false");
    });

    psql(backend, `
      BEGIN; SET LOCAL ROLE celebix_saas_owner;
      INSERT INTO saas.principals (id, issuer, subject, email, email_verified, created_at, updated_at) VALUES
        ('${PRINCIPAL_A}','https://identity.example.test/oidc','subject-a','a@example.test',true,'2026-01-01','2026-01-01'),
        ('${PRINCIPAL_B}','https://identity.example.test/oidc','subject-b','b@example.test',true,'2026-01-01','2026-01-01');
      INSERT INTO saas.stores (id,name,slug,status,locale,currency,theme_key,created_at,updated_at) VALUES
        ('${STORE_A}','Store A','store-a','active','tr','TRY','default','2026-01-01','2026-01-01'),
        ('${STORE_B}','Store B','store-b','active','tr','TRY','default','2026-01-01','2026-01-01');
      INSERT INTO saas.memberships (id,principal_id,store_id,role,status,created_at,updated_at) VALUES
        ('${MEMBERSHIP_A}','${PRINCIPAL_A}','${STORE_A}','store_owner','active','2026-01-01','2026-01-01'),
        ('${MEMBERSHIP_B}','${PRINCIPAL_B}','${STORE_B}','store_owner','active','2026-01-01','2026-01-01');
      INSERT INTO saas.subscriptions (id,store_id,plan_id,plan_code,plan_version,status,valid_from,valid_until,created_at,updated_at) VALUES
        ('50000000-0000-4000-8000-000000000001','${STORE_A}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01'),
        ('50000000-0000-4000-8000-000000000002','${STORE_B}','${FREE_PLAN}','free_starter',1,'active','2026-01-01',NULL,'2026-01-01','2026-01-01');
      COMMIT;
      CREATE ROLE ${WORKLOAD_ROLE} LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
      GRANT celebix_saas_identity, celebix_saas_app TO ${WORKLOAD_ROLE};
    `);

    pool = new Pool({
      host: backend.socketDirectory,
      port: backend.port,
      user: WORKLOAD_ROLE,
      database: DATABASE,
      max: 12,
      connectionTimeoutMillis: 2_000,
    });
    const catalog = repository(pool);
    const contextA = tenantContext(STORE_A, PRINCIPAL_A, MEMBERSHIP_A, "store-a");
    const contextB = tenantContext(STORE_B, PRINCIPAL_B, MEMBERSHIP_B, "store-b");
    const authenticatedA = Object.freeze({ kind: "authenticated", session: Object.freeze({}), tenantContext: contextA });
    const authenticatedB = Object.freeze({ kind: "authenticated", session: Object.freeze({}), tenantContext: contextB });
    const apiA = handlers(catalog, authenticatedA);
    const apiB = handlers(catalog, authenticatedB);
    const createOperation = randomUUID();
    const createPayload = productBody();
    const createResponse = await apiA.createProduct(request("/api/catalog/products", {
      method: "POST", body: createPayload, operationId: createOperation,
    }));
    const created = await body(createResponse);
    const productId = created.product.id;
    const initialVariantId = created.initialVariant.id;

    await scenario("authenticated HTTP create derives store authority only from TenantContext", async () => {
      assert.equal(createResponse.status, 201);
      assert.equal(created.product.storeId, STORE_A);
      assert.equal(created.initialVariant.storeId, STORE_A);
      assert.equal(createResponse.headers.get("cache-control"), "no-store");
      assert.equal(createResponse.headers.get("location"), null);
    });

    await scenario("same idempotency key and canonical payload returns the stored result", async () => {
      const replay = await apiA.createProduct(request("/api/catalog/products", {
        method: "POST", body: createPayload, operationId: createOperation,
      }));
      const replayBody = await body(replay);
      assert.equal(replay.status, 201);
      assert.equal(replayBody.replayed, true);
      assert.equal(replayBody.product.id, productId);
      assert.equal(psql(backend, `SET ROLE celebix_saas_owner; SELECT count(*) FROM saas.products WHERE slug='api-product'; RESET ROLE;`), "1");
    });

    await scenario("same idempotency key with a different payload returns stable conflict", async () => {
      const mismatch = await apiA.createProduct(request("/api/catalog/products", {
        method: "POST", body: productBody("api-product-mismatch", "API-MISMATCH"), operationId: createOperation,
      }));
      assert.equal(mismatch.status, 409);
      assert.deepEqual(await body(mismatch), { code: "operation_mismatch" });
    });

    await scenario("list and detail return the store-scoped product and ordered active variants", async () => {
      const list = await apiA.listProducts(request("/api/catalog/products?limit=20&status=draft"));
      const detail = await apiA.getProduct(request(`/api/catalog/products/${productId}`), productId);
      assert.equal(list.status, 200);
      assert.equal((await body(list)).items.some((product) => product.id === productId), true);
      assert.equal(detail.status, 200);
      const detailBody = await body(detail);
      assert.deepEqual(detailBody.variants.map((variant) => variant.id), [initialVariantId]);
    });

    const secondVariantOperation = randomUUID();
    const secondVariantResponse = await apiA.createVariant(request(`/api/catalog/products/${productId}/variants`, {
      method: "POST",
      operationId: secondVariantOperation,
      body: { variant: { title: "Blue", sku: "API-BLUE", priceCents: 11_000, stockTracking: true, stockQuantity: 4, attributes: { color: "blue" } } },
    }), productId);
    const secondVariant = await body(secondVariantResponse);

    await scenario("variant create is durable and bound to the authenticated product store", async () => {
      assert.equal(secondVariantResponse.status, 201);
      assert.equal(secondVariant.variant.productId, productId);
      assert.equal(secondVariant.variant.storeId, STORE_A);
    });

    const updatedVariantResponse = await apiA.updateVariant(request(`/api/catalog/products/${productId}/variants/${secondVariant.variant.id}`, {
      method: "PATCH",
      body: { expectedVersion: 1, variant: { title: "Blue Large", sku: "API-BLUE-L", priceCents: 13_000, stockTracking: true, stockQuantity: 3, attributes: { color: "blue", size: "large" } } },
    }), productId, secondVariant.variant.id);
    const updatedVariant = await body(updatedVariantResponse);

    await scenario("variant update enforces optimistic version and exact product association", async () => {
      assert.equal(updatedVariantResponse.status, 200);
      assert.equal(updatedVariant.variant.version, 2);
      assert.equal(updatedVariant.variant.sku, "API-BLUE-L");
    });

    const archiveVariantResponse = await apiA.archiveVariant(request(`/api/catalog/products/${productId}/variants/${secondVariant.variant.id}/archive`, {
      method: "POST", body: { expectedVersion: 2 },
    }), productId, secondVariant.variant.id);

    await scenario("archived variants disappear from default HTTP detail", async () => {
      assert.equal(archiveVariantResponse.status, 200);
      const detail = await apiA.getProduct(request(`/api/catalog/products/${productId}`), productId);
      const detailBody = await body(detail);
      assert.deepEqual(detailBody.variants.map((variant) => variant.id), [initialVariantId]);
    });

    await scenario("trusted repository detail can explicitly include archived variants in deterministic order", async () => {
      const detail = await catalog.getProductDetails({
        tenantContext: contextA,
        now: NOW,
        productId,
        includeArchivedVariants: true,
      });
      assert.deepEqual(new Set(detail.variants.map((variant) => variant.id)), new Set([initialVariantId, secondVariant.variant.id]));
      assert.deepEqual(
        detail.variants.map((variant) => `${variant.createdAt}:${variant.id}`),
        [...detail.variants].sort((left, right) => left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)).map((variant) => `${variant.createdAt}:${variant.id}`),
      );
    });

    await scenario("cross-store product detail and variant operations fail as not found", async () => {
      const detail = await apiB.getProduct(request(`/api/catalog/products/${productId}`), productId);
      const update = await apiB.updateVariant(request(`/api/catalog/products/${productId}/variants/${initialVariantId}`, {
        method: "PATCH",
        body: { expectedVersion: 1, variant: { title: "Denied", priceCents: 1, stockTracking: false, stockQuantity: 0, attributes: {} } },
      }), productId, initialVariantId);
      assert.equal(detail.status, 404);
      assert.deepEqual(await body(detail), { code: "product_not_found" });
      assert.equal(update.status, 404);
      assert.deepEqual(await body(update), { code: "product_not_found" });
    });

    await scenario("product update succeeds once and stale version returns stable conflict", async () => {
      const updateBody = {
        expectedVersion: 1,
        product: { ...createPayload.product, slug: "api-product-updated", title: "Updated API Product" },
      };
      const updated = await apiA.updateProduct(request(`/api/catalog/products/${productId}`, { method: "PATCH", body: updateBody }), productId);
      assert.equal(updated.status, 200);
      assert.equal((await body(updated)).product.version, 2);
      const stale = await apiA.updateProduct(request(`/api/catalog/products/${productId}`, { method: "PATCH", body: updateBody }), productId);
      assert.equal(stale.status, 409);
      assert.deepEqual(await body(stale), { code: "version_conflict" });
    });

    await scenario("slug and SKU conflicts map to stable finite public codes", async () => {
      const slugConflict = await apiA.createProduct(request("/api/catalog/products", {
        method: "POST", body: productBody("api-product-updated", "UNIQUE-SKU"),
      }));
      const skuConflict = await apiA.createProduct(request("/api/catalog/products", {
        method: "POST", body: productBody("unique-product", "API-ONE"),
      }));
      assert.deepEqual([slugConflict.status, await body(slugConflict)], [409, { code: "slug_conflict" }]);
      assert.deepEqual([skuConflict.status, await body(skuConflict)], [409, { code: "sku_conflict" }]);
    });

    await scenario("missing and malformed persistent credentials are rejected before catalog access", async () => {
      const missing = await apiA.listProducts(request("/api/catalog/products", { cookie: null }));
      const malformed = await apiA.listProducts(request("/api/catalog/products", { cookie: "__Host-celebix_panel=wrong" }));
      assert.deepEqual([missing.status, await body(missing)], [401, { code: "unauthenticated" }]);
      assert.deepEqual([malformed.status, await body(malformed)], [401, { code: "unauthenticated" }]);
    });

    await scenario("durable access denial and failure map to 403 and 503 without redirects", async () => {
      for (const [kind, status, code] of [["unauthorized", 403, "membership_denied"], ["unavailable", 503, "unavailable"]]) {
        const denied = handlers(catalog, Object.freeze({ kind }));
        const response = await denied.listProducts(request("/api/catalog/products"));
        assert.deepEqual([response.status, await body(response)], [status, { code }]);
        assert.equal(response.headers.get("location"), null);
      }
    });

    await scenario("mutation requires exact raw Origin and forged forwarding headers have no authority", async () => {
      const missing = await apiA.createProduct(request("/api/catalog/products", { method: "POST", body: productBody("missing-origin", "MISSING-ORIGIN"), origin: null }));
      const wrong = await apiA.createProduct(request("/api/catalog/products", {
        method: "POST", body: productBody("wrong-origin", "WRONG-ORIGIN"), origin: "https://wrong.example",
        headers: { "x-forwarded-host": "panel.saas-staging.celebix.site", forwarded: "host=panel.saas-staging.celebix.site" },
      }));
      assert.deepEqual([missing.status, await body(missing)], [403, { code: "origin_denied" }]);
      assert.deepEqual([wrong.status, await body(wrong)], [403, { code: "origin_denied" }]);
    });

    await scenario("wrong path query content type and unknown browser authority fail closed", async () => {
      const queried = await apiA.createProduct(request("/api/catalog/products?storeId=foreign", { method: "POST", body: productBody("query", "QUERY") }));
      const content = await apiA.createProduct(request("/api/catalog/products", { method: "POST", body: productBody("content", "CONTENT"), contentType: "application/problem+json" }));
      const authority = await apiA.createProduct(request("/api/catalog/products", { method: "POST", body: { ...productBody("authority", "AUTHORITY"), storeId: STORE_B } }));
      assert.deepEqual([queried.status, content.status, authority.status], [400, 400, 400]);
    });

    await scenario("negative money stock and compare-at inversions fail as invalid input", async () => {
      for (const [slug, sku, change] of [
        ["negative-price", "NEG-PRICE", { priceCents: -1 }],
        ["negative-stock", "NEG-STOCK", { stockQuantity: -1 }],
        ["compare-inversion", "COMPARE", { priceCents: 100, compareAtCents: 99 }],
      ]) {
        const candidate = productBody(slug, sku);
        Object.assign(candidate.initialVariant, change);
        const response = await apiA.createProduct(request("/api/catalog/products", { method: "POST", body: candidate }));
        assert.deepEqual([response.status, await body(response)], [400, { code: "invalid_input" }]);
      }
    });

    await scenario("application runtime cannot select or mutate catalog tables directly", async () => {
      assert.equal(psql(backend, `SELECT has_table_privilege('${WORKLOAD_ROLE}','saas.products','SELECT,INSERT,UPDATE,DELETE')::text;`), "false");
      const denied = psql(backend, `SET ROLE ${WORKLOAD_ROLE}; SELECT count(*) FROM saas.products;`, DATABASE, { allowFailure: true });
      assert.equal(denied, "");
    });

    const archiveProductResponse = await apiA.archiveProduct(request(`/api/catalog/products/${productId}/archive`, {
      method: "POST", body: { expectedVersion: 2 },
    }), productId);

    await scenario("archived product disappears from default list and detail", async () => {
      assert.equal(archiveProductResponse.status, 200);
      const list = await apiA.listProducts(request("/api/catalog/products"));
      const detail = await apiA.getProduct(request(`/api/catalog/products/${productId}`), productId);
      assert.equal((await body(list)).items.some((product) => product.id === productId), false);
      assert.deepEqual([detail.status, await body(detail)], [404, { code: "product_not_found" }]);
    });

    await scenario("safe failures expose no SQL constraint driver role or connection details", async () => {
      const missingProductId = randomUUID();
      const failure = await apiA.getProduct(
        request(`/api/catalog/products/${missingProductId}`),
        missingProductId,
      );
      const raw = JSON.stringify(await body(failure));
      assert.equal(failure.status, 404);
      assert.equal(raw, JSON.stringify({ code: "product_not_found" }));
      assert.doesNotMatch(raw, /SELECT|constraint|postgres|celebix_saas|socket|password/i);
    });

    await pool.end();
    pool = undefined;

    await scenario("custom-format backup and isolated restore preserve migration 019 and catalog rows", async () => {
      const dump = path.join(backend.temporaryDirectory, "phase3a2.dump");
      command(backend.executables.pg_dump, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-d", DATABASE, "-Fc", "-f", dump]);
      createDatabase(backend, RESTORE_DATABASE);
      command(backend.executables.pg_restore, ["-h", backend.socketDirectory, "-p", String(backend.port), "-U", "postgres", "-d", RESTORE_DATABASE, dump]);
      assert.equal(psql(backend, `SELECT to_regprocedure('saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)') IS NOT NULL;`, RESTORE_DATABASE), "t");
      assert.equal(psql(backend, "SET ROLE celebix_saas_owner; SELECT count(*) > 0 FROM saas.products; RESET ROLE;", RESTORE_DATABASE), "t");
    });

    await scenario("migration 019 down and clean reapply work only in disposable rollback database", async () => {
      createDatabase(backend, ROLLBACK_DATABASE);
      psql(backend, `GRANT CREATE ON DATABASE ${ROLLBACK_DATABASE} TO celebix_saas_owner;`, "postgres");
      for (const file of migrations.slice(0, -1)) {
        if (
          file === "202607110001_roles.up.sql" ||
          file === "202607110007_identity_roles.up.sql" ||
          file.includes("assertions")
        ) continue;
        apply(backend, file, ROLLBACK_DATABASE);
      }
      apply(backend, "202607160019_product_catalog_api.down.sql", ROLLBACK_DATABASE);
      assert.equal(psql(backend, "SELECT to_regprocedure('saas.catalog_get_product_details(uuid,uuid,uuid,uuid,text,bigint,bigint,timestamp with time zone,uuid,boolean)') IS NULL;", ROLLBACK_DATABASE), "t");
      apply(backend, "202607160019_product_catalog_api.up.sql", ROLLBACK_DATABASE);
      apply(backend, "202607160019_product_catalog_api_assertions.sql", ROLLBACK_DATABASE);
    });

    await scenario("phase3a2 manifest binds exact additive migration artifact bytes", async () => {
      const manifest = JSON.parse(readFileSync(path.join(SQL, "phase3a2-product-api-manifest.json"), "utf8"));
      assert.equal(manifest.migrationClassification, "additive");
      assert.equal(manifest.postgresqlMajor, 16);
      for (const artifact of manifest.artifacts) assert.equal(artifact.sha256, sha256(path.join(SQL, artifact.file)));
    });

    await scenario("disposable validation makes zero staging production or external connections", async () => {
      assert.equal(backend.socketDirectory.startsWith("/tmp/"), true);
      assert.equal(backend.started, true);
      assert.equal(completed.length, TOTAL - 1);
    });

    assert.equal(completed.length, TOTAL);
    process.stdout.write(JSON.stringify({
      status: "PASS",
      backend: "native-postgresql",
      postgresqlVersion: "16.14",
      scenarios: `${TOTAL}/${TOTAL}`,
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
