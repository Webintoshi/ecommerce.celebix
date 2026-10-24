import assert from "node:assert/strict";
import test from "node:test";
import * as catalog from "./index.ts";
const productId="11111111-1111-4111-8111-111111111111", a="22222222-2222-4222-8222-222222222222", b="33333333-3333-4333-8333-333333333333";
test("variant order accepts an exact independent order snapshot and rejects ambiguous identities",()=>{
 assert.equal(typeof catalog.parseCatalogVariantOrder,"function");
 assert.deepEqual(catalog.parseCatalogVariantOrder({productId,version:0,orderedVariantIds:[b,a]}),{productId,version:0,orderedVariantIds:[b,a]});
 for(const value of [{productId,version:-1,orderedVariantIds:[a]},{productId,version:0,orderedVariantIds:[a,a]},{productId,version:0,orderedVariantIds:["bad"]},{productId,version:0,orderedVariantIds:[a],priceCents:1}])assert.throws(()=>catalog.parseCatalogVariantOrder(value));
});
