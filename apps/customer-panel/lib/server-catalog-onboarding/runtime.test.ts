import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { CatalogOnboardingRepository } from "@celebix/saas-data";

import {
  createApprovedStagingServerPanelAccessRuntime,
  createDisabledServerPanelAccessRuntime,
} from "../server-panel-access/runtime.ts";
import {
  registerServerCatalogOnboardingRepository,
  resolveServerCatalogOnboardingRuntime,
} from "./runtime.ts";

function sessionAuthority() {
  return {
    async resolveSession() { return { kind: "unauthenticated" as const }; },
    async rotateSession() { return { kind: "unauthenticated" as const }; },
    async recoverOperation() { return { kind: "operation_mismatch" as const }; },
    async revokeSession() { return { kind: "unauthenticated" as const }; },
  };
}

function repository(): CatalogOnboardingRepository {
  const reject = async () => { throw new Error("unused"); };
  return { getOptions: reject, createProduct: reject, getProductEditor: reject, updateMerchandising: reject, publishAfterMedia: reject } as CatalogOnboardingRepository;
}

test("approved access resolves only the frozen onboarding facade", () => {
  const access = createApprovedStagingServerPanelAccessRuntime(sessionAuthority(), "https://panel.saas-staging.celebix.site");
  registerServerCatalogOnboardingRepository(access, repository());
  const runtime = resolveServerCatalogOnboardingRuntime(access);
  assert.ok(runtime);
  assert.equal(runtime.access, access);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(Object.isFrozen(runtime.onboarding), true);
  assert.deepEqual(Object.keys(runtime.onboarding).sort(), ["createProduct", "getOptions", "getProductEditor", "publishAfterMedia", "updateMerchandising"]);
  for (const key of ["pool", "options", "database", "connectionString"]) assert.equal(key in runtime.onboarding, false);
});

test("disabled and duplicate registration fail closed", () => {
  assert.equal(resolveServerCatalogOnboardingRuntime(createDisabledServerPanelAccessRuntime()), null);
  assert.throws(() => registerServerCatalogOnboardingRepository(createDisabledServerPanelAccessRuntime(), repository()), /server_catalog_onboarding_runtime_invalid/);
  const access = createApprovedStagingServerPanelAccessRuntime(sessionAuthority(), "https://panel.saas-staging.celebix.site");
  registerServerCatalogOnboardingRepository(access, repository());
  assert.throws(() => registerServerCatalogOnboardingRepository(access, repository()), /server_catalog_onboarding_runtime_invalid/);
});

test("approved staging registers onboarding on the shared preflighted pool", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.equal((source.match(/new Pool\(/g) ?? []).length, 1);
  assert.match(source, /new PostgresCatalogOnboardingRepository\([\s\S]*?pool,/);
  assert.match(source, /registerServerCatalogOnboardingRepository\(access, catalogOnboardingRepository\)/);
  for (const authority of [
    "catalog_get_onboarding_options",
    "catalog_onboard_product",
    "catalog_get_product_editor",
    "catalog_update_merchandising",
    "catalog_publish_after_media",
    "catalog_recover_onboarding_operation",
  ]) assert.match(source, new RegExp(authority));
});
