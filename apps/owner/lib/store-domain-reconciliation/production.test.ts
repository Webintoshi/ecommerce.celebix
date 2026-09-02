import assert from "node:assert/strict";
import test from "node:test";

import { initializeStoreDomainProductionRuntime } from "./production.ts";
import type { StoreDomainWorkerConfig } from "./config.ts";

const CONFIG: StoreDomainWorkerConfig = Object.freeze({
  database: Object.freeze({ url: "postgresql://worker:secret@postgres:5432/celebix_saas_production", name: "celebix_saas_production" }),
  cloudflare: Object.freeze({ zoneId: "zone_123", apiToken: "cloudflare-secret-token", apiBaseUrl: "https://api.cloudflare.com/client/v4", minimumTlsVersion: "1.2", timeoutMs: 5_000 }),
  hostnamePolicy: Object.freeze({ reservedSuffixes: Object.freeze(["celebix.site"]), cnameTarget: "shops.celebix.site" }),
  adminHostnamePolicy: Object.freeze({ reservedSuffixes: Object.freeze(["celebix.site"]), cnameTarget: "customers.celebix.site" }),
  workerId: "owner.domains.1",
});

class Client {
  readonly calls: string[] = [];
  async query(text: string) {
    this.calls.push(text);
    const rows: Record<string, unknown>[] = text.includes("server_version_num")
      ? [{ version_num: 160002, database_name: "celebix_saas_production", current_role: "celebix_saas_workflow", session_is_superuser: false, workflow_member: true, domain_lifecycle: true, admin_domain_lifecycle: true }]
      : text.includes("store_domain_work_claim") || text.includes("admin_domain_work_claim") ? [{ outcome: "claimed", result_payload: { items: [] } }] : [];
    return { rowCount: rows.length, rows, command: "", oid: 0, fields: [] };
  }
  release() {}
}

test("production runtime preflights PostgreSQL 16 and performs one bounded empty claim", async () => {
  const client = new Client();
  let ended = 0;
  const runtime = await initializeStoreDomainProductionRuntime(CONFIG, {
    createPool() { return { async connect() { return client; }, async end() { ended += 1; } }; },
    fetch: async () => { throw new Error("unused"); }, resolveCname: async () => [], now: () => new Date("2026-08-05T12:00:00.000Z"),
  });
  assert.equal(await runtime.runOnce(), "empty");
  assert.equal(client.calls.some((text) => text === "SET LOCAL ROLE celebix_saas_workflow"), true);
  assert.equal(client.calls.some((text) => text.includes("store_domain_work_claim")), true);
  assert.equal(client.calls.some((text) => text.includes("admin_domain_work_claim")), true);
  await runtime.close();
  assert.equal(ended, 1);
});
