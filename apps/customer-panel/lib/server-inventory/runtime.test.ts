import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { InventoryRepository } from "@celebix/saas-data";

import { registerServerInventoryRepository, resolveServerInventoryRuntime } from "./runtime.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

const METHODS = [
  "listLocations", "listBalances", "listPurchaseOrders", "getPurchaseOrder", "savePurchaseOrder",
  "transitionPurchaseOrder", "receivePurchaseOrder", "listCounts", "getCount", "saveCount",
  "startCount", "commitCount", "cancelCount", "listTransfers", "getTransfer", "saveTransfer",
  "dispatchTransfer", "receiveTransfer", "cancelTransfer",
] as const;

function access(mode: "approved_staging" | "disabled" = "approved_staging"): ServerPanelAccessRuntime {
  return Object.freeze({
    readiness: Object.freeze({ mode }),
    panelOrigin: mode === "approved_staging" ? "https://panel.saas-staging.celebix.site" : null,
    async resolveCredential() { return Object.freeze({ kind: "unauthenticated" as const }); },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); },
  });
}

function repository(): InventoryRepository {
  const reject = async () => { throw new Error("unused"); };
  return Object.fromEntries(METHODS.map((method) => [method, reject])) as unknown as InventoryRepository;
}

test("approved access resolves only a frozen complete inventory facade", () => {
  const approved = access();
  registerServerInventoryRepository(approved, repository());
  const runtime = resolveServerInventoryRuntime(approved);
  assert.ok(runtime);
  assert.equal(runtime.access, approved);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(Object.isFrozen(runtime.inventory), true);
  assert.deepEqual(Object.keys(runtime.inventory).sort(), [...METHODS].sort());
  for (const forbidden of ["pool", "options", "database", "connectionString", "tenantContext"]) {
    assert.equal(forbidden in runtime.inventory, false);
  }
});

test("disabled, malformed, hostile, and duplicate inventory registration fail closed", () => {
  assert.equal(resolveServerInventoryRuntime(access("disabled")), null);
  assert.throws(() => registerServerInventoryRepository(access("disabled"), repository()), /server_inventory_runtime_invalid/);
  const approved = access();
  assert.throws(() => registerServerInventoryRepository(approved, {} as InventoryRepository), /server_inventory_runtime_invalid/);
  registerServerInventoryRepository(approved, repository());
  assert.throws(() => registerServerInventoryRepository(approved, repository()), /server_inventory_runtime_invalid/);
  const hostile = new Proxy({} as ServerPanelAccessRuntime, { get() { throw new Error("private"); } });
  assert.equal(resolveServerInventoryRuntime(hostile), null);
  assert.throws(() => registerServerInventoryRepository(hostile, repository()), /^Error: server_inventory_runtime_invalid$/);
});

test("approved staging checks all ten relations and twenty exact procedures before inventory registration", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.equal((source.match(/new Pool\(/g) ?? []).length, 1);
  for (const relation of [
    "inventory_locations", "inventory_balances", "inventory_movements", "purchase_orders",
    "purchase_order_lines", "inventory_operations", "inventory_counts", "inventory_count_lines",
    "inventory_transfers", "inventory_transfer_lines",
  ]) assert.match(source, new RegExp(`to_regclass\\('saas\\.${relation}'\\) IS NOT NULL`));
  for (const signature of [
    "inventory_list_locations(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
    "inventory_list_balances(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
    "purchasing_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
    "purchasing_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
    "purchasing_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,text,jsonb)",
    "purchasing_transition(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)",
    "purchasing_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)",
    "inventory_counts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
    "inventory_counts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
    "inventory_counts_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,jsonb)",
    "inventory_counts_start(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "inventory_counts_commit(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "inventory_counts_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "inventory_transfers_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
    "inventory_transfers_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
    "inventory_transfers_save(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,uuid,uuid,jsonb)",
    "inventory_transfers_dispatch(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "inventory_transfers_receive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "inventory_transfers_cancel(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "inventory_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)",
  ]) assert.equal(source.includes(`to_regprocedure('saas.${signature}') IS NOT NULL`), true, signature);
  assert.match(source, /new PostgresInventoryRepository\(\{[\s\S]*?pool,[\s\S]*?role: "celebix_saas_app"[\s\S]*?timeouts: TIMEOUTS,[\s\S]*?uuid: randomUUID,[\s\S]*?audit:/);
  assert.match(source, /registerServerInventoryRepository\(access, inventoryRepository\)/);
  assert.ok(source.indexOf("await preflight(pool, config.database.name)") < source.indexOf("new PostgresInventoryRepository"));
  assert.ok(source.indexOf("new PostgresInventoryRepository") < source.indexOf("registerServerInventoryRepository(access, inventoryRepository)"));
});
