import assert from "node:assert/strict";
import test from "node:test";

import type { PostgresClientLike } from "@celebix/saas-data";

import type { OrderEmailConfig } from "./config.ts";
import { initializeOrderEmailProductionRuntime } from "./production.ts";

function config(): OrderEmailConfig {
  return Object.freeze({
    database: Object.freeze({ url: "postgresql://workflow:secret@postgres:5432/celebix_saas_production?sslmode=verify-full", name: "celebix_saas_production" }),
    deliveryMode: "test", workerId: "order-email-1", resendApiKey: "re_private_order_email_authority",
    senderEmail: "siparis@notify.celebix.co", webhookSecret: "whsec_private_order_email_authority",
    keyring: Object.freeze({ activeKeyId: "order_email_01", keys: Object.freeze({ order_email_01: Buffer.alloc(32, 4) }) }),
    testRecipient: "qa@celebix.co",
  });
}

class Client {
  readonly calls: string[] = [];
  constructor(readonly healthy = true) {}
  async query(text: string) {
    this.calls.push(text);
    const rows = text.includes("server_version_num") ? [{
      version_num: 160003, database_name: "celebix_saas_production", current_role: "celebix_saas_workflow",
      session_is_superuser: false, workflow_member: true, order_email_lifecycle: this.healthy,
    }] : text.includes("order_email_work_claim") ? [{ outcome: "empty", result_payload: { items: [] } }] : [];
    return { rowCount: rows.length, rows, command: "", oid: 0, fields: [] };
  }
  release() {}
}

test("production runtime preflights PostgreSQL 16 and performs one bounded empty claim", async () => {
  const client = new Client();
  let ended = 0;
  const runtime = await initializeOrderEmailProductionRuntime(config(), {
    createPool() { return { async connect() { return client as unknown as PostgresClientLike; }, async end() { ended += 1; } }; },
    fetch: async () => { throw new Error("unused"); }, uuid: () => "44444444-4444-4444-8444-444444444444", now: () => new Date("2026-08-05T12:00:00.000Z"),
  });
  assert.equal(await runtime.runOnce(), "empty");
  assert.equal(client.calls.some((text) => text === "SET LOCAL ROLE celebix_saas_workflow"), true);
  assert.equal(client.calls.some((text) => text.includes("order_email_work_claim")), true);
  await runtime.close();
  assert.equal(ended, 1);
});

test("failed lifecycle preflight closes the pool and starts no worker", async () => {
  const client = new Client(false);
  let ended = 0;
  await assert.rejects(initializeOrderEmailProductionRuntime(config(), {
    createPool() { return { async connect() { return client as unknown as PostgresClientLike; }, async end() { ended += 1; } }; },
    fetch: async () => { throw new Error("unused"); }, uuid: () => "44444444-4444-4444-8444-444444444444", now: () => new Date(),
  }), /order_email_production_preflight_failed/u);
  assert.equal(ended, 1);
});
