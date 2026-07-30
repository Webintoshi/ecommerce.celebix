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

          assert.match(sql, /to_regprocedure\('saas[.]create_store_default_inventory_location\(\)'\) IS NOT NULL/);
          assert.match(sql, /tgname='stores_default_inventory_location'/);
          assert.match(sql, /AS inventory_default_location_lifecycle/);
          assert.match(sql, /pg_has_role\(current_user, 'celebix_saas_host_resolver', 'MEMBER'\) AS host_resolver_member/);
          assert.match(sql, /to_regclass\('saas\.admin_domains'\) IS NOT NULL/);
          assert.match(sql, /to_regclass\('saas\.cross_host_panel_handoffs'\) IS NOT NULL/);
          assert.match(sql, /to_regprocedure\('saas\.resolve_public_admin_brand\(text,timestamp with time zone\)'\) IS NOT NULL/);
          assert.match(sql, /to_regprocedure\('saas\.revoke_principal_panel_sessions\(text,text,text,timestamp with time zone\)'\) IS NOT NULL/);

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

test("approved staging preflight executes the provider lifecycle probes through the app role", async () => {
  const calls: string[] = [];
  let released = 0;
  let ended = 0;

  class NoInheritPool {
    on() { return this; }

    async connect() {
      return {
        async query(sql: string) {
          calls.push(sql);
          if (calls.length === 1) {
            assert.doesNotMatch(sql, /saas\.paytr_iframe_activation_preflight\(\)/);
            assert.match(
              sql,
              /has_function_privilege\(\s*'celebix_saas_app',\s*'saas\.payment_provider_keyed_lifecycle_preflight\(\)',\s*'EXECUTE'\s*\)/,
            );
            assert.match(
              sql,
              /has_function_privilege\(\s*'celebix_saas_app',\s*'saas\.iyzico_iframe_tenant_activation_runtime_preflight\(\)',\s*'EXECUTE'\s*\)/,
            );
            assert.match(
              sql,
              /has_function_privilege\(\s*'celebix_saas_app',\s*'saas\.quick_order_hosted_payment_authority_preflight\(\)',\s*'EXECUTE'\s*\)/,
            );
            const row = Object.fromEntries(
              [...sql.matchAll(/\sAS\s+([a-z][a-z0-9_]+)/gi)].map((match) => [match[1], true]),
            );
            Object.assign(row, {
              version_num: 160_014,
              database_name: "celebix_saas",
              is_superuser: false,
            });
            return { rowCount: 1, rows: [row] };
          }
          if (calls.length === 2) assert.equal(sql, "BEGIN READ ONLY");
          if (calls.length === 3) assert.equal(sql, "SET LOCAL ROLE celebix_saas_app");
          if (calls.length === 4) {
            assert.match(sql, /saas\.built_in_payment_methods_preflight\(\) AS built_in_payment_methods/);
            assert.match(sql, /saas\.payment_provider_keyed_lifecycle_preflight\(\) AS payment_provider_keyed_lifecycle/);
            assert.match(sql, /saas\.iyzico_iframe_tenant_activation_runtime_preflight\(\) AS iyzico_activation_runtime/);
            assert.match(sql, /saas\.quick_order_hosted_payment_authority_preflight\(\) AS quick_order_hosted_authority/);
            return {
              rowCount: 1,
              rows: [{
                built_in_payment_methods: false,
                payment_provider_keyed_lifecycle: true,
                iyzico_activation_runtime: true,
                quick_order_hosted_authority: true,
              }],
            };
          }
          if (calls.length === 5) assert.equal(sql, "ROLLBACK");
          return { rowCount: 0, rows: [] };
        },
        release() { released += 1; },
      };
    }

    async end() { ended += 1; }
  }

  const originalPool = Object.getOwnPropertyDescriptor(pg, "Pool");
  assert.ok(originalPool);
  Object.defineProperty(pg, "Pool", { configurable: true, value: NoInheritPool });
  try {
    const { initializeApprovedStagingServerPanelAccessRuntime } = await import(`./postgres-runtime.ts?noinherit=${Date.now()}`);
    await assert.rejects(
      initializeApprovedStagingServerPanelAccessRuntime({ database: { name: "celebix_saas" } } as CustomerPanelStagingAuthConfig),
      /server_panel_access_database_preflight_failed/,
    );
  } finally {
    Object.defineProperty(pg, "Pool", originalPool);
  }

  assert.equal(calls.length, 5);
  assert.equal(released, 1);
  assert.equal(ended, 1);
});
