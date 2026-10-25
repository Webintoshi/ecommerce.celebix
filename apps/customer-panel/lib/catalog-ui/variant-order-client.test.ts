import assert from "node:assert/strict";
import test from "node:test";
import {createCatalogApiClient} from "./client.ts";
const p="11111111-1111-4111-8111-111111111111",a="22222222-2222-4222-8222-222222222222",b="33333333-3333-4333-8333-333333333333",op="44444444-4444-4444-8444-444444444444";
test("variant order reads independently and preserves the operation key across an explicit retry",async()=>{
 const calls:{path:string;init:RequestInit}[]=[];let failed=false;
 const api=createCatalogApiClient({fetch:async(path,init)=>{calls.push({path:String(path),init:init!});if(init?.method==="POST"&&!failed){failed=true;throw new Error("connection lost");}return Response.json({productId:p,version:init?.method==="GET"?0:1,orderedVariantIds:[b,a],...(init?.method==="POST"?{replayed:true}:{})});}});
 assert.equal(typeof api.getVariantOrder,"function");
 assert.deepEqual(await api.getVariantOrder(p),{productId:p,version:0,orderedVariantIds:[b,a]});
 const intent={expectedVersion:0,orderedVariantIds:[b,a],operationId:op};
 await assert.rejects(api.reorderVariants(p,intent));
 assert.equal((await api.reorderVariants(p,intent)).replayed,true);
 assert.equal(new Headers(calls[1]!.init.headers).get("idempotency-key"),op);assert.deepEqual(calls[1],calls[2]);
 assert.equal(calls[0].path,`/api/catalog/products/${p}/variant-order`);
 assert.equal(JSON.stringify(calls).includes("priceCents"),false);
 await assert.rejects(api.reorderVariants(p,{...intent,orderedVariantIds:[a,a]}));assert.equal(calls.length,3);
});
