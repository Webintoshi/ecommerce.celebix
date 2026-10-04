import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const ROOT = new URL("../../../tests/saas-phase3/hemenaku-admin-presentation/browser-fixture/app/", import.meta.url);
function compile(source: string, require: (name: string) => unknown = () => { throw Error("unexpected fixture import"); }) {
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const module = { exports: {} as Record<string, any> };
  new Function("require", "exports", "module", output)(require, module.exports, module);
  return module.exports;
}
async function setup() {
  const catalog = compile(await readFile(new URL("mira-catalog/catalog-fixture.ts", ROOT), "utf8"));
  const fixtures = compile(await readFile(new URL("mira-stock/stock-fixture.ts", ROOT), "utf8"), name => { assert.equal(name, "../mira-catalog/catalog-fixture.ts"); return catalog; });
  const transport = compile(await readFile(new URL("products/stock/transport.ts", ROOT), "utf8"), name => { assert.equal(name, "../../mira-stock/stock-fixture"); return fixtures; });
  const api = transport.createStockFixtureTransport("http://fixture.test", "loaded") as { fetch: typeof fetch };
  const call = async (path: string, body?: unknown) => {
    const response = await api.fetch(`/api/inventory/${path}`, body ? { method: "POST", body: JSON.stringify(body) } : undefined);
    return { status: response.status, body: await response.json() as Record<string, any> };
  };
  const quantity = async (location = fixtures.LOCATION_ID) => (await call(`balances?locationId=${location}`)).body.items.find((line: any) => line.variantId === fixtures.VARIANT_CHOICE.variantId).quantity;
  return { LOCATION_ID: String(fixtures.LOCATION_ID), DESTINATION_ID: String(fixtures.DESTINATION_ID), LINE_ID: String(fixtures.LINE_ID), call, quantity, variantId: String(fixtures.VARIANT_CHOICE.variantId) };
}
const operation = () => crypto.randomUUID();

test("local fixture direct purchase records an order and receives stock only on explicit receipt", async () => {
  const f = await setup();
  const body = { operationId: operation(), activation: "start", locationId: f.LOCATION_ID, supplierName: "Test", lines: [{ lineId: f.LINE_ID, variantId: f.variantId, orderedQuantity: 2, unitCostCents: 1489 }] };
  const saved = await f.call("purchase-orders", body);
  assert.equal(saved.body.status, "ordered"); assert.equal(saved.body.version, 2); assert.equal(await f.quantity(), 8);
  const receipt = { operationId: operation(), expectedVersion: 2, locationId: f.LOCATION_ID, lines: [{ lineId: f.LINE_ID, quantity: 2 }] };
  assert.equal((await f.call(`purchase-orders/${saved.body.id}/receive`, receipt)).body.status, "received");
  await f.call(`purchase-orders/${saved.body.id}/receive`, receipt); assert.equal(await f.quantity(), 10);
});

test("local fixture direct count captures the current snapshot and requires explicit physical commit", async () => {
  const f = await setup();
  const saved = await f.call("counts", { operationId: operation(), activation: "start", locationId: f.LOCATION_ID, lines: [{ lineId: f.LINE_ID, variantId: f.variantId }] });
  assert.equal(saved.body.status, "counting"); assert.equal(saved.body.version, 2);
  const record = (await f.call(`counts/${saved.body.id}`)).body;
  assert.equal(record.lines[0].expectedQuantity, 8); assert.equal(record.lines[0].countedQuantity, undefined);
  await f.call("counts", { operationId: operation(), countId: record.id, expectedVersion: 2, locationId: f.LOCATION_ID, lines: [{ lineId: f.LINE_ID, variantId: f.variantId, countedQuantity: 6 }] });
  assert.equal(await f.quantity(), 8);
  const commit = { operationId: operation(), expectedVersion: 3 };
  assert.equal((await f.call(`counts/${record.id}/commit`, commit)).body.status, "committed");
  await f.call(`counts/${record.id}/commit`, commit); assert.equal(await f.quantity(), 6);
});

test("local fixture direct transfer moves source once and receives target only once", async () => {
  const f = await setup();
  const body = { operationId: operation(), activation: "start", sourceLocationId: f.LOCATION_ID, destinationLocationId: f.DESTINATION_ID, lines: [{ lineId: f.LINE_ID, variantId: f.variantId, quantity: 2 }] };
  const saved = await f.call("transfers", body); assert.equal(saved.body.status, "in_transit"); assert.equal(saved.body.version, 2);
  await f.call("transfers", body); assert.equal(await f.quantity(), 6); assert.equal(await f.quantity(f.DESTINATION_ID), 3);
  const received = { operationId: operation(), expectedVersion: 2 };
  await f.call(`transfers/${saved.body.id}/receive`, received); await f.call(`transfers/${saved.body.id}/receive`, received);
  assert.equal(await f.quantity(f.DESTINATION_ID), 5);
});

test("local fixture rejects direct count values and insufficient transfers without persisting partial records", async () => {
  const f = await setup();
  const before = (await f.call("transfers")).body.items.length;
  assert.equal((await f.call("transfers", { operationId: operation(), activation: "start", sourceLocationId: f.LOCATION_ID, destinationLocationId: f.DESTINATION_ID, lines: [{ lineId: f.LINE_ID, variantId: f.variantId, quantity: 99 }] })).status, 409);
  assert.equal((await f.call("transfers")).body.items.length, before); assert.equal(await f.quantity(), 8);
  assert.equal((await f.call("counts", { operationId: operation(), activation: "start", locationId: f.LOCATION_ID, lines: [{ lineId: f.LINE_ID, variantId: f.variantId, countedQuantity: 0 }] })).status, 400);
});
