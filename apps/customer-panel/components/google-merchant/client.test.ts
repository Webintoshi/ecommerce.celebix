import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";

async function client(fetcher: typeof fetch) {
  assert.ok(existsSync(new URL("./client.ts", import.meta.url)), "Merchant transport is missing");
  return (await import("./client.ts")).createGoogleMerchantClient(fetcher);
}
const key = "b7ca0840-2b57-4d83-a49b-2c4dd55a84eb";
const productId = "f6d8029d-5456-4e82-85cf-e877d9bdaaa4";
const variantId = "947b39e9-f3f1-4a96-a101-4b4c46c1c383";
test("Merchant manual reads stay local, bounded and same-origin", async () => {
  const requests: any[] = [];
  const api = await client(async (url, init) => { requests.push({ url: String(url), init }); return Response.json({ items: [], nextCursor: null }); });
  await api.products(variantId);
  assert.equal(requests[0].url, `/api/marketplaces/google-merchant/products?limit=20&cursor=${variantId}`);
  assert.equal(requests[0].init.credentials, "same-origin");
  assert.equal(requests[0].init.cache, "no-store");
  assert.equal(requests.length, 1);
});
test("preference retry retains the caller operation and exports only the explicit row fields", async () => {
  const requests: any[] = [];
  const api = await client(async (url, init) => { requests.push({ url: String(url), key: new Headers(init?.headers).get("Idempotency-Key"), body: JSON.parse(String(init?.body)) }); return Response.json({ saved: true, replayed: false }); });
  const body = { productId, enabled: true, attributes: { gtin: "4006381333931" } };
  await api.preferences(variantId, body, key);
  await api.preferences(variantId, body, key);
  assert.equal(requests[0].url, `/api/marketplaces/google-merchant/products/${variantId}/preferences`);
  assert.deepEqual(requests.map(x => x.key), [key, key]);
  assert.deepEqual(requests[0].body, body);
});
test("unknown server errors cannot expose provider payloads; invalid barcode starts no mutation", async () => {
  let writes = 0;
  const api = await client(async () => { writes++; return Response.json({ code: "raw_provider_secret", details: "token" }, { status: 502 }); });
  await assert.rejects(api.sync(key), error => { assert.equal((error as any).code, "unavailable"); return true; });
  await assert.rejects(api.preferences(variantId, { productId, enabled: true, attributes: { gtin: "9900000000000" } }, key), error => { assert.equal((error as any).code, "invalid_input"); return true; });
  assert.equal(writes, 1);
});
test('identity retries retain operation and version while rejecting contradictory declarations before sending',async()=>{
 const requests:any[]=[];const api=await client(async(url,init)=>{requests.push({url,key:new Headers(init?.headers).get('Idempotency-Key'),body:JSON.parse(String(init?.body))});return Response.json({saved:true,replayed:true});}) as any;
 assert.equal(typeof api.identity,'function');const body={ownBrand:true,brandName:'Atölye',expectedVersion:3};
 await api.identity(body,key);await api.identity(body,key);
 assert.equal(requests[0].url,'/api/marketplaces/google-merchant/identity');assert.deepEqual(requests.map(x=>x.key),[key,key]);assert.deepEqual(requests[0].body,body);
 await assert.rejects(()=>api.identity({...body,ownBrand:false},key),(error:any)=>error.code==='invalid_input');assert.equal(requests.length,2);
});
