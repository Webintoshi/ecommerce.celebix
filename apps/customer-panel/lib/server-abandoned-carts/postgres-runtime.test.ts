import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("abandoned-cart preflight requires only session and abandoned-cart authority", async () => {
  const runtimeUrl = new URL("./postgres-runtime.ts", import.meta.url).href;
  const script = `
    import assert from "node:assert/strict";
    import pg from "pg";
    let released = 0;
    let ended = 0;
    class PreflightPool {
      on() { return this; }
      async connect() {
        return {
          async query(sql) {
            for (const required of [
              "saas.panel_sessions",
              "resolve_panel_session",
              "rotate_panel_session",
              "revoke_principal_panel_sessions",
              "recover_panel_session_operation",
              "saas.abandoned_carts_summary",
              "saas.abandoned_carts_list",
              "saas.abandoned_carts_get",
              "saas.abandoned_carts_mark_recovered",
              "saas.abandoned_carts_archive",
              "saas.abandoned_carts_recover_operation",
              "saas.public_cart_mutate_without_customer_identity_v103",
              "saas.abandoned_carts_projection",
              "customer_id",
              "firstProductName",
              "customerId",
            ]) assert.match(sql, new RegExp(required.replaceAll(".", "\\\\.")));
            assert.match(sql, /has_function_privilege\\(\\s*'celebix_saas_identity'/);
            assert.match(sql, /has_function_privilege\\(\\s*'celebix_saas_app'/);
            for (const unrelated of [
              "shipping_provider_profiles",
              "toshi_provider_configs",
              "catalog_onboarding_operations",
              "iyzico_iframe_tenant_activation_runtime_preflight",
              "quick_order_hosted_payment_authority_preflight",
            ]) assert.doesNotMatch(sql, new RegExp(unrelated));
            const row = Object.fromEntries(
              [...sql.matchAll(/\\sAS\\s+([a-z][a-z0-9_]+)/gi)].map((match) => [match[1], true]),
            );
            return {
              rowCount: 1,
              rows: [Object.assign(row, {
                version_num: 160_014,
                database_name: "celebix_saas_staging_auth",
                is_superuser: false,
                identity_member: false,
              })],
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
      const { initializeApprovedStagingServerAbandonedCartRuntime } = await import(${JSON.stringify(runtimeUrl)} + "?preflight=" + Date.now());
      await assert.rejects(
        initializeApprovedStagingServerAbandonedCartRuntime({ database: { name: "celebix_saas_staging_auth" } }),
        /server_abandoned_cart_database_contract_preflight_failed:identity_member/,
      );
    } finally {
      Object.defineProperty(pg, "Pool", originalPool);
    }
    assert.equal(released, 1);
    assert.equal(ended, 1);
  `;
  const result = spawnSync(process.execPath, ["--conditions=react-server", "--experimental-transform-types", "--input-type=module", "-e", script], {
    cwd: new URL("../../../..", import.meta.url),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
});
