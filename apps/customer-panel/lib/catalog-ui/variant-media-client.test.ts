import assert from "node:assert/strict";
import test from "node:test";
import {createProductVariantMediaClient,ProductVariantMediaApiError} from "./variant-media-client.ts";
const productId="10000000-0000-4000-8000-000000000001",variantId="20000000-0000-4000-8000-000000000001",mediaId="30000000-0000-4000-8000-000000000001",operationId="40000000-0000-4000-8000-000000000001";
const gallery={productId,version:1,assignments:[{variantId,mediaIds:[mediaId]}]};
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});
test("variant gallery reads no-store and saves ordered batch with caller-retained key",async()=>{
 const requests: {path:unknown;init?:RequestInit}[]=[];const api=createProductVariantMediaClient({fetch:async(path,init)=>{requests.push({path,init});return json(init?.method==="GET"?{gallery}:{gallery,replayed:true});}});
 assert.deepEqual(await api.list(productId),gallery);
 assert.equal(requests[0]!.path,`/api/catalog/products/${productId}/variant-media`);assert.equal(requests[0]!.init?.cache,"no-store");
 const input={expectedVersion:1,assignments:gallery.assignments,operationId};
 assert.equal((await api.save(productId,input)).replayed,true);await api.save(productId,input);
 assert.equal(new Headers(requests[1]!.init?.headers).get("idempotency-key"),operationId);assert.deepEqual(requests[1],requests[2]);
 assert.deepEqual(JSON.parse(requests[1]!.init?.body as string),{expectedVersion:1,assignments:gallery.assignments});
});
test("invalid batch is rejected before any request and cross-product/malformed replies fail closed",async()=>{
 let requests=0;const api=createProductVariantMediaClient({fetch:async()=>{requests++;return json({gallery:{...gallery,productId:variantId}});}});
 await assert.rejects(()=>api.save(productId,{expectedVersion:0,assignments:[],operationId}),TypeError);
 await assert.rejects(()=>api.save(productId,{expectedVersion:1,assignments:[{variantId,mediaIds:[mediaId,mediaId]}],operationId}),TypeError);
 await assert.rejects(()=>api.save(productId,{expectedVersion:1,assignments:Array.from({length:101},()=>({variantId,mediaIds:[]})),operationId}),TypeError);
 assert.equal(requests,0);await assert.rejects(()=>api.list(productId),ProductVariantMediaApiError);
});
test("version conflicts expose a recoverable message without discarding caller inputs",async()=>{
 const api=createProductVariantMediaClient({fetch:async()=>json({code:"version_conflict"},409)});
 await assert.rejects(()=>api.save(productId,{expectedVersion:1,assignments:gallery.assignments,operationId}),(error:unknown)=>error instanceof ProductVariantMediaApiError&&error.code==="version_conflict"&&/seçiminiz korunuyor/i.test(error.message));
});
