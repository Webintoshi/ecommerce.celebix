import assert from "node:assert/strict";
import test from "node:test";
import { createDefaultWhatsAppOrderConfig } from "@celebix/saas-contracts";
import { PostgresPublicWhatsAppOrderRepository } from "./repository.ts";
import { StorefrontContentRepositoryError } from "../storefront-content/errors.ts";

const STORE = "33333333-3333-4333-8333-333333333333", NOW = new Date("2026-10-03T12:00:00.000Z");
const enabled = () => ({ ...createDefaultWhatsAppOrderConfig(), enabled: true, phone: "+905551112233" });
class Client {
  calls: Array<{ text: string; values: unknown[] }> = []; releases: unknown[] = [];
  constructor(readonly payload: unknown, readonly commitFails = false) {}
  async query(text: string, values: unknown[] = []) { this.calls.push({ text, values }); if (text === "COMMIT" && this.commitFails) throw new Error("connection lost"); const rows = text.includes("public_whatsapp_order_get") ? [this.payload] : []; return { rows, rowCount: rows.length, command: "", oid: 0, fields: [] }; }
  release(destroy?: unknown) { this.releases.push(destroy); }
}
function repository(client: Client) { return new PostgresPublicWhatsAppOrderRepository({ pool: { connect: async () => client as never }, role: "celebix_saas_host_resolver", timeouts: { poolCheckoutMs: 100, statementMs: 100, lockMs: 100, idleTransactionMs: 100 } }); }
test("public reader validates the independent scoped projection and uses only a read transaction", async () => {
  const config = enabled(), client = new Client({ outcome: "found", result_payload: { storeId: STORE, version: 3, config } });
  assert.deepEqual(await repository(client).getForHost({ hostname: "shop.example.test", now: NOW }), { storeId: STORE, version: 3, config });
  assert.equal(client.calls[0]?.text, "BEGIN READ ONLY"); assert.ok(client.calls.some(call => call.text === "SET LOCAL ROLE celebix_saas_host_resolver"));
  assert.deepEqual(client.calls.find(call => call.text.includes("public_whatsapp_order_get"))?.values, ["shop.example.test", NOW]);
  assert.equal(client.calls.at(-1)?.text, "COMMIT"); assert.deepEqual(client.releases, [undefined]);
  const empty = new Client({ outcome: "found", result_payload: null }); assert.equal(await repository(empty).getForHost({ hostname: "shop.example.test", now: NOW }), null);
});
test("invalid hosts never acquire a client; malformed output rolls back and commit failure destroys it", async () => {
  const badHost = new Client(null); await assert.rejects(() => repository(badHost).getForHost({ hostname: "EVIL.example.test", now: NOW }), (error: unknown) => error instanceof StorefrontContentRepositoryError && error.code === "invalid_input"); assert.equal(badHost.calls.length, 0);
  for (const payload of [{ storeId: STORE, version: -1, config: createDefaultWhatsAppOrderConfig() }, { storeId: "foreign", config: null }, { storeId: STORE, config: { ...enabled(), surprise: true } }, { storeId: STORE, config: null, secret: "private" }]) { const client = new Client({ outcome: "found", result_payload: payload }); await assert.rejects(() => repository(client).getForHost({ hostname: "shop.example.test", now: NOW }), (error: unknown) => error instanceof StorefrontContentRepositoryError && error.code === "unavailable"); assert.equal(client.calls.at(-1)?.text, "ROLLBACK"); }
  const failed = new Client({ outcome: "found", result_payload: null }, true); await assert.rejects(() => repository(failed).getForHost({ hostname: "shop.example.test", now: NOW })); assert.deepEqual(failed.releases, [true]);
});
