import assert from "node:assert/strict";
import test from "node:test";
import { loyaltyCommand, LoyaltyRequestError, pendingLoyaltyOperation } from "./client.ts";
import { loyaltyConfigFor, createLoyaltyDraft } from "./model.ts";

const ID = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
const config = loyaltyConfigFor(createLoyaltyDraft("purchase_shipping"), "Europe/Istanbul");
const payload = { programId: ID, expectedVersion: 1, name: "Kargo", enabled: true, config };
function stored() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); }, removeItem: (key: string) => { values.delete(key); } };
}
function result(id: string, operationId: string) { return { operationId, program: { id, version: 2, name: "Kargo", status: "active", config, createdAt: "2026-11-04T00:00:00Z", updatedAt: "2026-11-04T00:00:00Z" } }; }
test("unknown save outcome retains its operation key and blocks changed intent until the same operation recovers", async () => {
  const oldFetch = globalThis.fetch, descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: stored() });
  const writes: Array<{ operationId: string; payload: unknown }> = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body)); writes.push(body);
    if (writes.length === 1) throw new Error("connection lost");
    return Response.json(result(ID, body.operationId));
  };
  try {
    await assert.rejects(loyaltyCommand("save", payload), error => error instanceof LoyaltyRequestError && error.uncertain);
    const key = pendingLoyaltyOperation()?.operationId; assert.ok(key);
    await assert.rejects(loyaltyCommand("save", { ...payload, name: "Değişti" })); assert.equal(writes.length, 1);
    await loyaltyCommand("save", payload, true); assert.equal(writes[1]?.operationId, key); assert.equal(pendingLoyaltyOperation(), null);
  } finally { globalThis.fetch = oldFetch; if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor); else Reflect.deleteProperty(globalThis, "sessionStorage"); }
});
test("a successful response for another program cannot clear an unresolved write", async () => {
  const oldFetch = globalThis.fetch, descriptor = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
  Object.defineProperty(globalThis, "sessionStorage", { configurable: true, value: stored() });
  globalThis.fetch = async (_input, init) => Response.json(result(OTHER, JSON.parse(String(init?.body)).operationId));
  try { await assert.rejects(loyaltyCommand("save", payload), error => error instanceof LoyaltyRequestError && error.uncertain); assert.ok(pendingLoyaltyOperation()); }
  finally { globalThis.fetch = oldFetch; if (descriptor) Object.defineProperty(globalThis, "sessionStorage", descriptor); else Reflect.deleteProperty(globalThis, "sessionStorage"); }
});
