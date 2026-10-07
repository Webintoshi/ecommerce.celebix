import assert from "node:assert/strict";
import test from "node:test";
import { createInStoreSalesUiClient } from "../../../../../../apps/customer-panel/lib/in-store-sales-ui/client.ts";
import { createPosFixtureTransport, FIXTURE_CUSTOMERS, FIXTURE_PRODUCTS, LOCATION_ID } from "./fixture-transport.ts";

const operation = (suffix: number) => `a7100000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;

test("POS fixture has valid V3 envelopes for every visible state and blocks foreign requests", async () => {
  for (const scenario of ["filled", "empty", "readonly", "partial", "pending", "received", "completed"] as const) {
    const transport = createPosFixtureTransport({ scenario, latency: 0 });
    const api = createInStoreSalesUiClient({ fetch: transport.fetch, contractVersion: 3 });
    const bootstrap = await api.bootstrap();
    assert.ok(bootstrap.locations.length);
    assert.equal(bootstrap.activeDraft?.status ?? "draft", "draft");
    if (transport.recoveryMarker) {
      const result = await api.getOperation(transport.recoveryMarker.operationId);
      assert.ok(result);
      assert.equal(result.sale.status, scenario === "pending" ? "payment_pending" : scenario === "received" ? "payment_received" : "completed");
    }
    assert.equal((await transport.fetch("https://live.example.test/api/orders/in-store/bootstrap")).status, 403);
    assert.equal((await transport.fetch("/api/unhandled-local-write", { method: "POST", body: "{}" })).status, 404);
  }
});

test("local controller transport recalculates edits, reserves a payment state and completes once", async () => {
  const transport = createPosFixtureTransport({ scenario: "empty", latency: 0 });
  const api = createInStoreSalesUiClient({ fetch: transport.fetch, contractVersion: 3 });
  const intent = { locationId: LOCATION_ID, items: [{ variantId: FIXTURE_PRODUCTS[0].variantId, quantity: 2, unitPriceOverrideCents: null }], discount: null, customerName: null, note: null, customerId: null, initialCollectionCents: null, dueDate: null, paymentMethod: "cash" as const };
  let result = await api.createSale({ saleId: operation(101), intent }, operation(102));
  assert.equal(result.sale.totals.totalCents, FIXTURE_PRODUCTS[0].unitPriceCents! * 2);
  result = await api.updateSale(result.sale.id, { expectedVersion: result.sale.version, intent: { ...intent, discount: { kind: "percentage", percentageBps: 1000 } } }, operation(103));
  assert.equal(result.sale.totals.discountCents, Math.floor(result.sale.totals.subtotalCents / 10));
  result = await api.prepareSale(result.sale.id, { expectedVersion: result.sale.version, expectedTotalCents: result.sale.totals.totalCents }, operation(104));
  assert.equal(result.sale.status, "payment_pending");
  result = await api.confirmPayment(result.sale.id, { expectedVersion: result.sale.version, slipReference: null, paymentMethod: null }, operation(105));
  assert.equal(result.sale.status, "payment_received");
  const version = result.sale.version;
  result = await api.completeSale(result.sale.id, { expectedVersion: version }, operation(106));
  assert.equal(result.sale.status, "completed");
  assert.ok(result.sale.orderId);
  const repeated = await api.completeSale(result.sale.id, { expectedVersion: version }, operation(106));
  assert.equal(repeated.replayed, true);
  assert.equal(repeated.sale.version, result.sale.version);
  assert.equal((await api.searchProducts({ locationId: LOCATION_ID, barcode: FIXTURE_PRODUCTS[0].barcode! }))[0].availableQuantity, FIXTURE_PRODUCTS[0].availableQuantity - 2);
});

test("zero collection completes without payment and subsequent collection changes only its order", async () => {
  const transport = createPosFixtureTransport({ scenario: "empty", latency: 0 });
  const api = createInStoreSalesUiClient({ fetch: transport.fetch, contractVersion: 3 });
  const customer = FIXTURE_CUSTOMERS[0];
  let result = await api.createSale({ saleId: operation(201), intent: { locationId: LOCATION_ID, items: [{ variantId: FIXTURE_PRODUCTS[0].variantId, quantity: 1, unitPriceOverrideCents: null }], discount: null, customerName: customer.name, note: "Yerel test", customerId: customer.id, initialCollectionCents: 0, dueDate: "2026-10-15", paymentMethod: null } }, operation(202));
  result = await api.prepareSale(result.sale.id, { expectedVersion: result.sale.version, expectedTotalCents: result.sale.totals.totalCents }, operation(203));
  result = await api.completeSale(result.sale.id, { expectedVersion: result.sale.version }, operation(204));
  assert.equal(result.sale.paymentReceivedAt, null);
  assert.equal(result.sale.finance?.status, "unpaid");
  const untouched = transport.snapshot().sales.find(sale => sale.status === "completed" && sale.id !== result.sale.id)!;
  const account = await (await transport.fetch(`/api/accounting/customers/${customer.id}?currency=TRY`)).json();
  const response = await transport.fetch("/api/accounting/collections", { method: "POST", headers: { "idempotency-key": operation(205) }, body: JSON.stringify({ customerId: customer.id, orderId: result.sale.orderId, amountCents: 50000, currency: "TRY", paymentMethod: "cash", accountId: null, expectedVersion: account.data.version, note: null }) });
  assert.equal(response.status, 200);
  const collected = await api.getSale(result.sale.id);
  assert.equal(collected.finance?.collectedCents, 50000);
  assert.deepEqual(transport.snapshot().sales.find(sale => sale.id === untouched.id), untouched);
});

test("error and held list states retain safe local retry and cursor behavior", async () => {
  const transport = createPosFixtureTransport({ scenario: "error", latency: 0 });
  const api = createInStoreSalesUiClient({ fetch: transport.fetch, contractVersion: 3 });
  await assert.rejects(api.bootstrap());
  assert.ok(await api.bootstrap());
  const first = await api.listSales({ status: "completed", pageSize: 20 });
  assert.equal(first.sales.length, 20);
  assert.ok(first.nextCursor);
  const next = await api.listSales({ status: "completed", pageSize: 20, cursor: first.nextCursor! });
  assert.ok(next.sales.length > 0);
  assert.ok(!next.sales.some(sale => first.sales.some(previous => previous.id === sale.id)));
});

test("V4 browser fixture supplies additive defaults while retaining every V3 stored sale",async()=>{for(const scenario of ["filled","empty","pending","completed"] as const){const transport=createPosFixtureTransport({scenario,latency:0});const legacy=createInStoreSalesUiClient({fetch:transport.fetch,contractVersion:3}),modern=createInStoreSalesUiClient({fetch:transport.fetch,contractVersion:4});const before=await legacy.bootstrap(),after=await modern.bootstrap();assert.equal(after.permissions.manualSalesV4Available,false);assert.equal(after.activeDraft?.salesChannel??"manual","manual");assert.equal(after.activeDraft?.fulfillmentMethod??"pickup","pickup");assert.equal(after.activeDraft?.contractVersion,before.activeDraft?.contractVersion);assert.deepEqual(await legacy.bootstrap(),before);}});

test("manual V4 fixture independently receives split parts before a single completion",async()=>{const transport=createPosFixtureTransport({scenario:"manual" as never,latency:0});const api=createInStoreSalesUiClient({fetch:transport.fetch,contractVersion:4});const b=await api.bootstrap();assert.equal(b.permissions.manualSalesV4Available,true);const original=b.activeDraft!;assert.equal(original.contractVersion,4);const intent={locationId:LOCATION_ID,items:original.items.map(row=>({variantId:row.variantId,quantity:row.quantity,unitPriceOverrideCents:null})),discount:original.discount,customerName:null,note:null,customerId:null,dueDate:null,salesChannel:"social" as const,socialPlatform:"instagram" as const,socialReference:"@fixture",fulfillmentMethod:"pickup" as const,shippingAddress:null,billingAddress:null,shippingCents:0,paymentParts:[{partId:operation(801),paymentMethod:"cash" as const,amountCents:60000},{partId:operation(802),paymentMethod:"card" as const,amountCents:original.totals.totalCents-60000}]};let r=await api.updateSale(original.id,{expectedVersion:original.version,intent},operation(803));r=await api.prepareSale(r.sale.id,{expectedVersion:r.sale.version,expectedTotalCents:r.sale.totals.totalCents},operation(804));r=await api.confirmPayment(r.sale.id,{expectedVersion:r.sale.version,prepareOperationId:operation(804),partId:operation(801),slipReference:null},operation(805));assert.equal(r.sale.status,"payment_pending");assert.ok(r.sale.paymentParts?.[0].receiptId);r=await api.confirmPayment(r.sale.id,{expectedVersion:r.sale.version,prepareOperationId:operation(804),partId:operation(802),slipReference:null},operation(806));assert.equal(r.sale.status,"payment_received");r=await api.completeSale(r.sale.id,{expectedVersion:r.sale.version},operation(807));assert.equal(r.sale.finance?.receipts.length,2);assert.equal(r.sale.status,"completed");});
