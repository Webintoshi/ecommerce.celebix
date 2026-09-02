import assert from "node:assert/strict";
import test from "node:test";

import { PostgresAdminDomainOriginHealthRepository, PostgresAdminDomainWorkflowRepository } from "./repository.ts";

const NOW = new Date("2026-09-02T12:00:00.000Z");
const DOMAIN = "10000000-0000-4000-8000-000000000120";
const STORE = "20000000-0000-4000-8000-000000000120";
const LEASE = "30000000-0000-4000-8000-000000000120";
const TIMEOUTS = Object.freeze({ poolCheckoutMs: 1_000, statementMs: 1_000, lockMs: 1_000, idleTransactionMs: 1_000 });

test("claims leased admin-domain reconciliation through workflow-only authority", async () => {
  const calls: Array<Readonly<{ text: string; values: readonly unknown[] }>> = [];
  const claim = Object.freeze({
    domainId: DOMAIN, storeId: STORE, hostname: "admin.example.com", providerHostnameId: "cf-admin-1", attemptCount: 1,
    leaseId: LEASE, leaseOwner: "admin-worker-1", leaseExpiresAt: new Date(NOW.getTime() + 30_000).toISOString(), requestedRemoval: false,
  });
  const repository = new PostgresAdminDomainWorkflowRepository({
    role: "celebix_saas_workflow", timeouts: TIMEOUTS,
    pool: { async connect() { return {
      async query(text: string, values: readonly unknown[] = []) {
        calls.push({ text, values });
        return text.includes("admin_domain_work_claim")
          ? { rows: [{ outcome: "claimed", result_payload: { items: [claim] } }], rowCount: 1, command: "SELECT", oid: 0, fields: [] }
          : { rows: [], rowCount: 0, command: text.split(" ", 1)[0] ?? "", oid: 0, fields: [] };
      },
      release() {},
    }; } },
  });
  assert.deepEqual(await repository.claim({ workerId: "admin-worker-1", now: NOW, leaseExpiresAt: new Date(NOW.getTime() + 30_000), limit: 1 }), [claim]);
  assert.equal(calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_workflow"), true);
  const selected = calls.find(({ text }) => text.includes("admin_domain_work_claim"));
  assert.deepEqual(selected?.values.slice(0, 4), ["admin-worker-1", NOW, new Date(NOW.getTime() + 30_000), 1]);
});

test("defers transient admin-domain reconciliation through the state-preserving RPC", async () => {
  const calls: Array<Readonly<{ text: string; values: readonly unknown[] }>> = [];
  const retryAt = new Date(NOW.getTime() + 30_000);
  const repository = new PostgresAdminDomainWorkflowRepository({
    role: "celebix_saas_workflow", timeouts: TIMEOUTS,
    pool: { async connect() { return {
      async query(text: string, values: readonly unknown[] = []) {
        calls.push({ text, values });
        return text.includes("admin_domain_work_defer")
          ? { rows: [{ outcome: "retry_scheduled", result_payload: {} }], rowCount: 1, command: "SELECT", oid: 0, fields: [] }
          : { rows: [], rowCount: 0, command: text.split(" ", 1)[0] ?? "", oid: 0, fields: [] };
      },
      release() {},
    }; } },
  });
  await repository.defer({ domainId: DOMAIN, leaseId: LEASE, workerId: "admin-worker-1", now: NOW, retryAt });
  assert.deepEqual(calls.find(({ text }) => text.includes("admin_domain_work_defer"))?.values, [DOMAIN, LEASE, "admin-worker-1", NOW, retryAt]);
});

test("resolves exact custom admin origin health through host-resolver authority", async () => {
  const calls: Array<Readonly<{ text: string; values: readonly unknown[] }>> = [];
  const repository = new PostgresAdminDomainOriginHealthRepository({
    role: "celebix_saas_host_resolver", timeouts: TIMEOUTS,
    pool: { async connect() { return {
      async query(text: string, values: readonly unknown[] = []) {
        calls.push({ text, values });
        return text.includes("resolve_admin_domain_origin_health")
          ? { rows: [{ outcome: "found", result_payload: { schemaVersion: 1, status: "ok", storeId: STORE, hostname: "admin.example.com" } }], rowCount: 1, command: "SELECT", oid: 0, fields: [] }
          : { rows: [], rowCount: 0, command: text.split(" ", 1)[0] ?? "", oid: 0, fields: [] };
      },
      release() {},
    }; } },
  });
  assert.deepEqual(await repository.get({ hostname: "admin.example.com", now: NOW }), {
    schemaVersion: 1, status: "ok", storeId: STORE, hostname: "admin.example.com",
  });
  assert.equal(calls.some(({ text }) => text === "SET LOCAL ROLE celebix_saas_host_resolver"), true);
  assert.deepEqual(calls.find(({ text }) => text.includes("resolve_admin_domain_origin_health"))?.values, ["admin.example.com", NOW]);
});
