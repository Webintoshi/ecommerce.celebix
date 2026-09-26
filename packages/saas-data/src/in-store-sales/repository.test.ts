import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult } from "pg";
import type { TenantContext } from "@celebix/saas-contracts";
import type { PostgresClientLike, PostgresPoolLike } from "../postgres/pool.ts";
import { PostgresInStoreSalesRepository, inStoreSalesRepositoryErrorCode } from "./index.ts";
const STORE = "10000000-0000-4000-8000-000000000001", PRINCIPAL = "10000000-0000-4000-8000-000000000002", MEMBERSHIP = "10000000-0000-4000-8000-000000000003", PLAN = "10000000-0000-4000-8000-000000000004";
const SALE = "20000000-0000-4000-8000-000000000001", LOCATION = "20000000-0000-4000-8000-000000000002", VARIANT = "20000000-0000-4000-8000-000000000003", PRODUCT = "20000000-0000-4000-8000-000000000004", OP = "20000000-0000-4000-8000-000000000005";
const NOW = new Date("2026-09-26T10:00:00.000Z");
function authority(role = "store_owner") { return { tenantContext: { schemaVersion: 1, requestId: "private", principal: { id: PRINCIPAL, issuer: "https://identity.test/oidc", subject: "private" }, store: { id: STORE, slug: "test", status: "active" }, membership: { id: MEMBERSHIP, role, status: "active" }, entitlements: { schemaVersion: 1, planId: PLAN, planCode: "growth", version: 2, status: "active", features: ["orders", "catalog"], limits: { products: 100, staff: 5, storageBytes: 1024 }, validFrom: "2026-01-01T00:00:00.000Z" }, locale: "tr-TR" } as TenantContext, now: new Date(NOW) }; }
function sale(status = "draft", version = 1) { return { id: SALE, saleNumber: "POS-001", status, version, locationId: LOCATION, locationName: "Mağaza", ownerMembershipId: MEMBERSHIP, ownerLabel: "Kasiyer", customerName: null, note: null, discount: null, items: [{ productId: PRODUCT, variantId: VARIANT, productName: "Ürün", variantName: "M", sku: null, barcode: "000123", imageUrl: null, unitPriceCents: 10000, quantity: 1, discountEligible: true, lineSubtotalCents: 10000, allocatedDiscountCents: 0, lineNetCents: 10000 }], totals: { subtotalCents: 10000, eligibleSubtotalCents: 10000, discountCents: 0, totalCents: 10000 }, createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), paymentReceivedAt: status === "payment_received" ? NOW.toISOString() : null, completedAt: null, orderId: null, orderNumber: null }; }
class Client implements PostgresClientLike {
    queries: {
        text: string;
        values?: unknown[];
    }[] = [];
    released: (boolean | Error | undefined)[] = [];
    constructor(private response: unknown, private failCommit = false) { }
    async query(text: string, values?: unknown[]): Promise<QueryResult<Record<string, unknown>>> { this.queries.push({ text, values }); if (text === "COMMIT" && this.failCommit)
        throw new Error("private socket detail"); const rows = text.includes("FROM saas.in_store_sales_") ? [this.response] : []; return { rows, rowCount: rows.length } as QueryResult<Record<string, unknown>>; }
    release(destroy?: boolean | Error) { this.released.push(destroy); }
}
class Pool implements PostgresPoolLike {
    calls = 0;
    constructor(readonly clients: Client[]) { }
    async connect() { const next = this.clients[this.calls++]; if (!next)
        throw new Error("private pool"); return next; }
}
function repo(...clients: Client[]) { return new PostgresInStoreSalesRepository({ pool: new Pool(clients), role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 200, lockMs: 100, idleTransactionMs: 200 } }); }
const intent = { locationId: LOCATION, items: [{ variantId: VARIANT, quantity: 1 }], discount: null, customerName: null, note: null };
test("exact barcode lookup preserves leading zeros and uses tenant authority rather than browser tenant fields", async () => { const client = new Client({ outcome: "found", result_payload: { products: [{ productId: PRODUCT, variantId: VARIANT, productName: "Ürün", variantName: "M", sku: null, barcode: "000123", imageUrl: null, unitPriceCents: 10000, pricingUnavailable: false, availableQuantity: 5, stockTracking: true, discountEligible: true }] } }); const result = await repo(client).searchProducts({ ...authority(), locationId: LOCATION, barcode: "000123", limit: 20 }); assert.equal(result.products[0]?.barcode, "000123"); const query = client.queries.find(q => q.text.includes("FROM saas.in_store_sales_search_products"))!; assert.deepEqual(query.values?.slice(0, 7), [STORE, PRINCIPAL, MEMBERSHIP, PLAN, "growth", 2, NOW]); assert.ok(query.values?.includes("000123")); assert.equal(client.queries[0]?.text, "BEGIN READ ONLY"); });
test("ambiguous barcode and cashier denial are controlled errors with no commit", async () => { for (const code of ["ambiguous_barcode", "membership_denied"]) {
    const client = new Client({ outcome: code, result_payload: null });
    await assert.rejects(() => repo(client).searchProducts({ ...authority(), locationId: LOCATION, barcode: "000123", limit: 20 }), e => inStoreSalesRepositoryErrorCode(e) === code);
    assert.equal(client.queries.at(-1)?.text, "ROLLBACK");
} });
test("sale create rejects unknown caller authority and duplicate variants before opening a connection", async () => { const pool = new Pool([]); const instance = new PostgresInStoreSalesRepository({ pool, role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 200, lockMs: 100, idleTransactionMs: 200 } }); for (const extra of [{ storeId: STORE }, { intent: { ...intent, items: [{ variantId: VARIANT, quantity: 1 }, { variantId: VARIANT, quantity: 1 }] } }])
    await assert.rejects(() => instance.createSale({ ...authority(), operationId: OP, saleId: SALE, intent, ...extra } as never), e => inStoreSalesRepositoryErrorCode(e) === "invalid_input"); assert.equal(pool.calls, 0); });
test("lost create commit recovers the same durable sale instead of producing another one", async () => { const result = { sale: sale(), replayed: false, priceChanged: false }; const client = new Client({ outcome: "committed", result_payload: result }, true); const recovery = new Client({ outcome: "found", result_payload: { ...result, replayed: true } }); const value = await repo(client, recovery).createSale({ ...authority(), operationId: OP, saleId: SALE, intent }); assert.equal(value.sale.id, SALE); assert.equal(value.replayed, true); assert.equal(client.released[0], true); assert.ok(recovery.queries.some(q => q.text.includes("in_store_sales_get_operation"))); });
test("malformed public sale cannot commit or leak a database-private field", async () => { const client = new Client({ outcome: "committed", result_payload: { sale: { ...sale(), storeId: STORE }, replayed: false, priceChanged: false } }); await assert.rejects(() => repo(client).createSale({ ...authority(), operationId: OP, saleId: SALE, intent }), e => inStoreSalesRepositoryErrorCode(e) === "unavailable"); assert.equal(client.queries.at(-1)?.text, "ROLLBACK"); });
test("payment attestation and completion are distinct durable operations", async () => { const payment = new Client({ outcome: "committed", result_payload: { sale: sale("payment_received", 2), replayed: false, priceChanged: false } }); const result = await repo(payment).confirmPayment({ ...authority(), operationId: OP, saleId: SALE, expectedVersion: 1, slipReference: null }); assert.equal(result.sale.status, "payment_received"); assert.ok(payment.queries.some(q => q.text.includes("in_store_sales_confirm_payment"))); assert.ok(!payment.queries.some(q => q.text.includes("in_store_sales_complete"))); assert.equal(payment.queries.at(-1)?.text, "COMMIT"); });
test("cashier tenant context is accepted for POS while forbidden roles are rejected before database access", async () => { const allowed = new Client({ outcome: "found", result_payload: sale() }); assert.equal((await repo(allowed).getSale({ ...authority("cashier"), saleId: SALE })).id, SALE); const pool = new Pool([]), instance = new PostgresInStoreSalesRepository({ pool, role: "celebix_saas_app", timeouts: { poolCheckoutMs: 100, statementMs: 200, lockMs: 100, idleTransactionMs: 200 } }); await assert.rejects(() => instance.getSale({ ...authority("analyst"), saleId: SALE }), e => inStoreSalesRepositoryErrorCode(e) === "membership_denied"); assert.equal(pool.calls, 0); });


test("staff grant recovers an unknown commit using the restricted staff projection", async () => {
 const grant={membershipId:MEMBERSHIP,label:"Kasiyer",role:"cashier",enabled:true,locationIds:[LOCATION],discountLimitBps:500,version:1};
 const first=new Client({outcome:"committed",result_payload:grant},true);
 const recovered=new Client({outcome:"found",result_payload:grant});
 const result=await repo(first,recovered).setStaffGrant({...authority(),operationId:OP,membershipId:MEMBERSHIP,expectedVersion:0,enabled:true,locationIds:[LOCATION],discountLimitBps:500});
 assert.equal(result.version,1);
 assert.ok(recovered.queries.some(query=>query.text.includes("in_store_sales_recover_staff")));
});

test("mutation rejects input accessors without invoking them", async () => {
 let reads=0;
 const input={...authority(),operationId:OP,saleId:SALE,expectedVersion:1,get held(){reads++;return true;}};
 await assert.rejects(()=>repo().holdSale(input),error=>inStoreSalesRepositoryErrorCode(error)==="invalid_input");
 assert.equal(reads,0);
});
