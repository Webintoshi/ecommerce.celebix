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
    constructor(private response: unknown, private failCommit = false, private images: unknown = { images: [] }) { }
    async query(text: string, values?: unknown[]): Promise<QueryResult<Record<string, unknown>>> { this.queries.push({ text, values }); if (text === "COMMIT" && this.failCommit)
        throw new Error("private socket detail"); const rows = text.includes("FROM saas.in_store_sales_") ? [this.response] : text.includes("FROM saas.merchant_product_images") ? [{ outcome: "found", result_payload: this.images }] : []; return { rows, rowCount: rows.length } as QueryResult<Record<string, unknown>>; }
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

test('v2 create uses separate durable RPC and carries price and payment without changing legacy SQL', async()=>{
 const old=sale();const saleV2={...old,paymentMethod:'cash',items:old.items.map(line=>({...line,catalogUnitPriceCents:10000,unitPriceOverrideCents:null,priceOverrideActorMembershipId:null}))};
 const c=new Client({outcome:'committed',result_payload:{sale:saleV2,replayed:false,priceChanged:false}});
 const result=await repo(c).createSale({...authority(),contractVersion:2,operationId:OP,saleId:SALE,intent:{...intent,paymentMethod:'cash',items:[{variantId:VARIANT,quantity:1,unitPriceOverrideCents:null}]}});
 assert.equal(result.sale.paymentMethod,'cash');
 const call=c.queries.find(q=>q.text.includes('FROM saas.in_store_sales_create_v2'));
 assert.ok(call);assert.equal(JSON.parse(call.values?.at(-1) as string).paymentMethod,'cash');
});

const PHOTO = `https://media.celebix.site/stores/${STORE}/products/${PRODUCT}/30000000-0000-4000-8000-000000000001.webp`;
const thumbnailKey = `${PRODUCT}:${VARIANT}`;
test("POS product search receives photos with one authorized batch and preserves stock and price", async () => {
 const product = {productId:PRODUCT,variantId:VARIANT,productName:"Ürün",variantName:"M",sku:null,barcode:"000123",imageUrl:null,unitPriceCents:10000,pricingUnavailable:false,availableQuantity:5,stockTracking:true,discountEligible:true};
 const client = new Client({outcome:"found",result_payload:{products:[product]}},false,{images:[{key:thumbnailKey,imageUrl:PHOTO}]});
 const result = await repo(client).searchProducts({...authority("cashier"),locationId:LOCATION,query:"Ürün",limit:20});
 assert.deepEqual(result.products[0],{...product,imageUrl:PHOTO});
 const imageQueries=client.queries.filter(q=>q.text.includes("FROM saas.merchant_product_images"));
 assert.equal(imageQueries.length,1);
 assert.deepEqual(imageQueries[0]!.values?.slice(0,8),[STORE,PRINCIPAL,MEMBERSHIP,PLAN,"growth",2,NOW,"pos"]);
 assert.equal(client.queries.at(-1)?.text,"COMMIT");
});
test("POS read hydration keeps v1 and v2 prices exact while operation replay stays immutable", async () => {
 for (const contractVersion of [1,2] as const) {
  const original = contractVersion===1?sale():{...sale(),paymentMethod:"cash",items:sale().items.map(line=>({...line,catalogUnitPriceCents:11000,unitPriceOverrideCents:10000,priceOverrideActorMembershipId:MEMBERSHIP}))};
  const images={images:[{key:thumbnailKey,imageUrl:PHOTO}]};
  const read=new Client({outcome:"found",result_payload:original},false,images);
  const value=await repo(read).getSale({...authority(),contractVersion,saleId:SALE});
  assert.deepEqual(value,{...original,items:original.items.map(line=>({...line,imageUrl:PHOTO}))});
  const page=new Client({outcome:"found",result_payload:{sales:[original],nextCursor:null}},false,images);
  assert.equal((await repo(page).listSales({...authority(),contractVersion,status:"draft",pageSize:50})).sales[0]?.items[0]?.imageUrl,PHOTO);
  const replay=new Client({outcome:"found",result_payload:{sale:original,replayed:true,priceChanged:false}},false,images);
  assert.deepEqual((await repo(replay).getOperation({...authority(),contractVersion,operationId:OP}))?.sale,original);
  assert.ok(!replay.queries.some(q=>q.text.includes("merchant_product_images")));
 }
});
test("POS bootstrap hydrates every sale group once for a repeated product variant", async () => {
 const completed={...sale("completed"),paymentReceivedAt:NOW.toISOString(),completedAt:NOW.toISOString(),orderId:OP,orderNumber:"POS-0001"};
 const original={scopeKey:`${STORE}:${MEMBERSHIP}`,locations:[{id:LOCATION,name:"Mağaza",isDefault:true}],permissions:{canSell:true,canDiscount:true,discountLimitBps:9999,canResolve:true,canManageStaff:true},activeDraft:sale(),heldSales:[sale("held")],pendingSales:[sale("payment_pending")],recentSales:[completed],summary:{completedCount:1,grossCents:10000,discountCents:0,netCents:10000,pendingPaymentCount:1}};
 const client=new Client({outcome:"found",result_payload:original},false,{images:[{key:thumbnailKey,imageUrl:PHOTO}]});
 const result=await repo(client).bootstrap(authority());
 assert.equal(result.activeDraft?.items[0]?.imageUrl,PHOTO);
 for(const group of [result.heldSales,result.pendingSales,result.recentSales])assert.equal(group[0]?.items[0]?.imageUrl,PHOTO);
 const images=client.queries.filter(q=>q.text.includes("merchant_product_images"));assert.equal(images.length,1);
 assert.deepEqual(JSON.parse(images[0]!.values?.at(-1) as string),[{key:thumbnailKey,productId:PRODUCT,variantId:VARIANT}]);
 assert.deepEqual(result.summary,original.summary);
});

test('v3 prepares bank transfer credit with a separate fingerprint and exact frozen collection fields',async()=>{
 const customer={id:PRODUCT,name:'Ali Veli',firstName:'Ali',lastName:'Veli',phone:'+905551234567',email:null,archived:false};const old=sale();
 const v3={...old,contractVersion:3,customerId:customer.id,customer,customerName:customer.name,initialCollectionCents:5000,dueDate:'2026-11-01',finance:null,paymentMethod:'bank_transfer',items:old.items.map(i=>({...i,catalogUnitPriceCents:i.unitPriceCents,unitPriceOverrideCents:null,priceOverrideActorMembershipId:null}))};
 const c=new Client({outcome:'committed',result_payload:{sale:v3,replayed:false,priceChanged:false}});
 const result=await repo(c).createSale({...authority('cashier'),contractVersion:3,operationId:OP,saleId:SALE,intent:{...intent,customerId:customer.id,customerName:null,initialCollectionCents:5000,dueDate:'2026-11-01',paymentMethod:'bank_transfer',items:[{variantId:VARIANT,quantity:1,unitPriceOverrideCents:null}]}});
 assert.equal(result.sale.initialCollectionCents,5000);const call=c.queries.find(q=>q.text.includes('in_store_sales_create_v3'))!;assert.ok(call);assert.equal(JSON.parse(call.values?.at(-1) as string).customerId,PRODUCT);
});
test('cashier customer creation is a narrow typed transaction and rejected malformed contacts never connect',async()=>{
 const customer={id:PRODUCT,name:'Ali Veli',firstName:'Ali',lastName:'Veli',phone:'+905551234567',email:null,archived:false};const c=new Client({outcome:'committed',result_payload:{customer,replayed:false}});
 assert.equal((await repo(c).createCustomer({...authority('cashier'),operationId:OP,intent:{firstName:customer.firstName,lastName:customer.lastName,phone:customer.phone,email:null}})).customer.id,PRODUCT);
 assert.ok(c.queries.some(q=>q.text.includes('in_store_sales_create_customer')));assert.ok(!c.queries.some(q=>q.text.includes('customers_save')));
 const pool=new Pool([]),r=new PostgresInStoreSalesRepository({pool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:100,statementMs:200,lockMs:100,idleTransactionMs:200}});
 await assert.rejects(()=>r.createCustomer({...authority('cashier'),operationId:OP,intent:{firstName:'Ali',lastName:'Veli',phone:'05551234567',email:null}}),e=>inStoreSalesRepositoryErrorCode(e)==='invalid_input');assert.equal(pool.calls,0);
});

function discardedSale(contractVersion:1|2|3) {
 const original=sale('cancelled',2);
 const v2={...original,paymentMethod:'cash',items:original.items.map(line=>({...line,catalogUnitPriceCents:line.unitPriceCents,unitPriceOverrideCents:null,priceOverrideActorMembershipId:null}))};
 return contractVersion===1?original:contractVersion===2?v2:{...v2,contractVersion:3,customerId:null,customer:null,initialCollectionCents:10000,dueDate:null,finance:null};
}
test('discard uses its own versioned native operation and leaves legacy cancel routing intact',async()=>{
 for(const contractVersion of [1,2,3] as const) {
  const c=new Client({outcome:'committed',result_payload:{sale:discardedSale(contractVersion),replayed:false,priceChanged:false}});
  const result=await repo(c).discardSale({...authority(),contractVersion,operationId:OP,saleId:SALE,expectedVersion:1,confirmUnpaid:true});
  assert.equal(result.sale.status,'cancelled');
  const suffix=contractVersion===1?'':`_v${contractVersion}`;
  const query=c.queries.find(q=>q.text.includes(`FROM saas.in_store_sales_discard${suffix}(`));assert.ok(query);
  assert.deepEqual(query.values?.slice(0,7),[STORE,PRINCIPAL,MEMBERSHIP,PLAN,'growth',2,NOW]);
  assert.deepEqual(query.values?.slice(-3),[SALE,1,true]);
  assert.ok(!c.queries.some(q=>q.text.includes('in_store_sales_cancel')));
  assert.equal(c.queries.at(-1)?.text,'COMMIT');
 }
 const c=new Client({outcome:'committed',result_payload:{sale:sale(),replayed:false,priceChanged:false}});
 await repo(c).cancelSale({...authority(),operationId:OP,saleId:SALE,expectedVersion:1,confirmUnpaid:true});
 assert.ok(c.queries.some(q=>q.text.includes('FROM saas.in_store_sales_cancel(')));
});
test('unknown discard commit recovers its same operation and rejects unpaid or caller authority bypass before access',async()=>{
 const contractVersion=3;const frozen=discardedSale(contractVersion);
 const first=new Client({outcome:'committed',result_payload:{sale:frozen,replayed:false,priceChanged:false}},true);
 const recovery=new Client({outcome:'found',result_payload:{sale:frozen,replayed:true,priceChanged:false}});
 const result=await repo(first,recovery).discardSale({...authority(),contractVersion,operationId:OP,saleId:SALE,expectedVersion:1,confirmUnpaid:true});
 assert.equal(result.replayed,true);assert.equal(result.sale.status,'cancelled');assert.equal(first.released[0],true);
 const query=recovery.queries.find(q=>q.text.includes('in_store_sales_get_operation_v3'));
 assert.ok(query);assert.ok(query.values?.includes(OP));
 const pool=new Pool([]),r=new PostgresInStoreSalesRepository({pool,role:'celebix_saas_app',timeouts:{poolCheckoutMs:100,statementMs:200,lockMs:100,idleTransactionMs:200}});
 for(const extra of [{confirmUnpaid:false},{storeId:STORE},{expectedVersion:0}])await assert.rejects(()=>r.discardSale({...authority(),operationId:OP,saleId:SALE,expectedVersion:1,confirmUnpaid:true,...extra} as never),e=>inStoreSalesRepositoryErrorCode(e)==='invalid_input');
 assert.equal(pool.calls,0);
});
