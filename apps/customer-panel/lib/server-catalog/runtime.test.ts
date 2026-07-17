import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CatalogRepository } from "@celebix/saas-data";

import {
  registerServerCatalogRepository,
  resolveServerCatalogRuntime,
} from "./runtime.ts";
import {
  createApprovedStagingServerPanelAccessRuntime,
  createDisabledServerPanelAccessRuntime,
} from "../server-panel-access/runtime.ts";

function sessionAuthority() {
  return {
    async resolveSession() { return { kind: "unauthenticated" as const }; },
    async rotateSession() { return { kind: "unauthenticated" as const }; },
    async recoverOperation() { return { kind: "operation_mismatch" as const }; },
    async revokeSession() { return { kind: "unauthenticated" as const }; },
  };
}

function catalog(): CatalogRepository {
  const reject = async () => { throw new Error("unused"); };
  return {
    createProduct: reject,
    getProduct: reject,
    getProductDetails: reject,
    listProducts: reject,
    updateProduct: reject,
    archiveProduct: reject,
    createVariant: reject,
    updateVariant: reject,
    archiveVariant: reject,
  } as CatalogRepository;
}

test("approved access runtime resolves a frozen catalog facade without exposing pool internals", () => {
  const access = createApprovedStagingServerPanelAccessRuntime(
    sessionAuthority(),
    "https://panel.saas-staging.celebix.site",
  );
  registerServerCatalogRepository(access, catalog());
  const runtime = resolveServerCatalogRuntime(access);
  assert.ok(runtime);
  assert.equal(runtime.access, access);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(Object.isFrozen(runtime.catalog), true);
  assert.deepEqual(Object.keys(runtime.catalog).sort(), [
    "archiveProduct", "archiveVariant", "createProduct", "createVariant", "getProduct",
    "getProductDetails", "listProducts", "updateProduct", "updateVariant",
  ]);
  for (const forbidden of ["pool", "options", "database", "keys", "connectionString"]) {
    assert.equal(forbidden in runtime.catalog, false);
  }
});

test("disabled runtime and duplicate registration fail closed", () => {
  assert.equal(resolveServerCatalogRuntime(createDisabledServerPanelAccessRuntime()), null);
  assert.throws(
    () => registerServerCatalogRepository(createDisabledServerPanelAccessRuntime(), catalog()),
    /server_catalog_runtime_invalid/,
  );
  const access = createApprovedStagingServerPanelAccessRuntime(
    sessionAuthority(),
    "https://panel.saas-staging.celebix.site",
  );
  registerServerCatalogRepository(access, catalog());
  assert.throws(() => registerServerCatalogRepository(access, catalog()), /server_catalog_runtime_invalid/);
});

test("approved staging initialization constructs one pool shared by session and catalog repositories", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.equal((source.match(/new Pool\(/g) ?? []).length, 1);
  assert.match(source, /createPostgresPanelSessionRepository[\s\S]*?pool,/);
  assert.match(source, /new PostgresCatalogRepository\([\s\S]*?pool,/);
  assert.match(source, /registerServerCatalogRepository/);
  assert.match(source, /pg_has_role\(current_user, 'celebix_saas_app', 'MEMBER'\)/);
  assert.match(source, /catalog_get_product_details/);
  assert.match(source, /catalog_recover_operation/);
  assert.doesNotMatch(source, /new Pool\([\s\S]*new Pool\(/);
});
