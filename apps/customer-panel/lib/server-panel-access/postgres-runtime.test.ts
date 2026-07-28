import assert from "node:assert/strict";
import test from "node:test";

import pg from "pg";

import type { CustomerPanelStagingAuthConfig } from "../panel-auth-authority/config.ts";

test("approved staging preflight targets the exact migration 056 onboarding relations", async () => {
  let checkedOut = 0;
  let released = 0;
  let ended = 0;

  class PreflightPool {
    on() { return this; }

    async connect() {
      checkedOut += 1;
      return {
        async query(sql: string) {
          for (const relation of [
            "saas.catalog_product_profiles",
            "saas.catalog_categories",
            "saas.catalog_product_categories",
            "saas.catalog_variant_commerce_profiles",
            "saas.catalog_product_channels",
            "saas.catalog_onboarding_operations",
          ]) assert.match(sql, new RegExp(`to_regclass\\('${relation.replaceAll(".", "\\.")}\\'\\)`));

          for (const obsoleteRelation of [
            "catalog_product_category_assignments",
            "catalog_product_resource_assignments",
            "catalog_sales_channels",
            "catalog_product_channel_assignments",
          ]) assert.doesNotMatch(sql, new RegExp(`saas\\.${obsoleteRelation}`));

          return {
            rowCount: 1,
            rows: [{
              version_num: 160_014,
              database_name: "celebix_saas",
              is_superuser: false,
              identity_member: false,
            }],
          };
        },
        release() { released += 1; },
      };
    }

    async end() { ended += 1; }
  }

  const originalPool = Object.getOwnPropertyDescriptor(pg, "Pool");
  assert.ok(originalPool);
  Object.defineProperty(pg, "Pool", { configurable: true, value: PreflightPool });
  try {
    const { initializeApprovedStagingServerPanelAccessRuntime } = await import(`./postgres-runtime.ts?preflight=${Date.now()}`);
    await assert.rejects(
      initializeApprovedStagingServerPanelAccessRuntime({ database: { name: "celebix_saas" } } as CustomerPanelStagingAuthConfig),
      /server_panel_access_database_preflight_failed/,
    );
  } finally {
    Object.defineProperty(pg, "Pool", originalPool);
  }

  assert.equal(checkedOut, 1);
  assert.equal(released, 1);
  assert.equal(ended, 1);
});
