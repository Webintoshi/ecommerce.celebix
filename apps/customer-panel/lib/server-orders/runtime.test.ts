import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import type { OrderRepository } from "@celebix/saas-data";

import {
  registerServerOrderRepository,
  resolveServerOrdersRuntime,
} from "./runtime.ts";
import type { ServerPanelAccessRuntime } from "../server-panel-access/runtime.ts";

function approvedAccess(): ServerPanelAccessRuntime {
  return Object.freeze({
    readiness: Object.freeze({ mode: "approved_staging" as const }),
    panelOrigin: "https://panel.saas-staging.celebix.site",
    async resolveCredential() { return Object.freeze({ kind: "unauthenticated" as const }); },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); },
  });
}

function disabledAccess(): ServerPanelAccessRuntime {
  return Object.freeze({
    readiness: Object.freeze({ mode: "disabled" as const }),
    panelOrigin: null,
    async resolveCredential() { return Object.freeze({ kind: "unauthenticated" as const }); },
    async rotateCredential() { return Object.freeze({ kind: "unavailable" as const }); },
    async revokeCredential() { return Object.freeze({ kind: "unavailable" as const }); },
  });
}

function orders(): OrderRepository {
  const reject = async () => { throw new Error("unused"); };
  return {
    getDashboardSummary: reject,
    listOrders: reject,
    getOrder: reject,
    getOrderNeighbors: reject,
    listEmailDeliveries: reject,
    retryEmailDelivery: reject,
    transitionStatus: reject,
    transitionPayment: reject,
    updateShipping: reject,
    addNote: reject,
    archiveNote: reject,
    listDrafts: reject,
    getDraft: reject,
    createDraft: reject,
    updateDraft: reject,
    archiveDraft: reject,
    convertDraft: reject,
  } as OrderRepository;
}

test("approved access resolves an immutable order-only repository facade", () => {
  const access = approvedAccess();
  registerServerOrderRepository(access, orders());
  const runtime = resolveServerOrdersRuntime(access);
  assert.ok(runtime);
  assert.equal(runtime.access, access);
  assert.equal(Object.isFrozen(runtime), true);
  assert.equal(Object.isFrozen(runtime.orders), true);
  assert.deepEqual(Object.keys(runtime.orders).sort(), [
    "addNote", "archiveDraft", "archiveNote", "convertDraft", "createDraft", "getDashboardSummary",
    "getDraft", "getOrder", "getOrderNeighbors", "listDrafts", "listEmailDeliveries", "listOrders",
    "retryEmailDelivery", "transitionPayment", "transitionStatus", "updateDraft", "updateShipping",
  ]);
  for (const forbidden of ["pool", "options", "database", "connectionString", "tenantContext"]) {
    assert.equal(forbidden in runtime.orders, false);
  }
});

test("disabled access, invalid repositories, and duplicate registration fail closed", () => {
  assert.equal(resolveServerOrdersRuntime(disabledAccess()), null);
  assert.throws(
    () => registerServerOrderRepository(disabledAccess(), orders()),
    /server_orders_runtime_invalid/,
  );
  const access = approvedAccess();
  assert.throws(
    () => registerServerOrderRepository(access, {} as OrderRepository),
    /server_orders_runtime_invalid/,
  );
  registerServerOrderRepository(access, orders());
  assert.throws(() => registerServerOrderRepository(access, orders()), /server_orders_runtime_invalid/);
  const throwing = new Proxy({} as ServerPanelAccessRuntime, {
    get() { throw new Error("private getter detail"); },
  });
  assert.equal(resolveServerOrdersRuntime(throwing), null);
  assert.throws(() => registerServerOrderRepository(throwing, orders()), /^Error: server_orders_runtime_invalid$/);
});

test("approved staging preflight gates one shared pool on exact order tables and functions", () => {
  const source = readFileSync(new URL("../server-panel-access/postgres-runtime.ts", import.meta.url), "utf8");
  assert.equal((source.match(/new Pool\(/g) ?? []).length, 1);
  assert.match(source, /new PostgresOrderRepository\([\s\S]*?pool,/);
  assert.match(source, /registerServerOrderRepository\(access, orderRepository\)/);
  for (const table of ["orders", "order_items", "order_events", "order_notes", "order_operations", "order_email_deliveries"]) {
    assert.match(source, new RegExp(`to_regclass\\('saas\\.${table}'\\) IS NOT NULL`));
  }
  for (const table of ["order_drafts", "order_draft_lines", "order_draft_operations", "manual_order_inventory_commitments"]) {
    assert.match(source, new RegExp(`to_regclass\\('saas\\.${table}'\\) IS NOT NULL`));
  }
  for (const signature of [
    "orders_get_dashboard_summary(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone)",
    "orders_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,text,text,text,bigint,bigint,timestamp with time zone,uuid)",
    "orders_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
    "orders_get_neighbors(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
    "order_email_admin_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
    "order_email_admin_retry(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,uuid)",
    "orders_transition_status(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)",
    "orders_transition_payment(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,text)",
    "orders_update_shipping(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb,jsonb)",
    "orders_add_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid,text)",
    "orders_archive_note(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,uuid)",
    "orders_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)",
    "order_drafts_list(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,integer,timestamp with time zone,uuid)",
    "order_drafts_get(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid)",
    "order_drafts_create(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,jsonb)",
    "order_drafts_update(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint,jsonb)",
    "order_drafts_archive(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "order_drafts_convert(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text,uuid,bigint)",
    "order_drafts_recover_operation(uuid,uuid,uuid,uuid,text,bigint,timestamp with time zone,uuid,text)",
  ]) {
    assert.equal(source.includes(`to_regprocedure('saas.${signature}') IS NOT NULL`), true);
  }
});
