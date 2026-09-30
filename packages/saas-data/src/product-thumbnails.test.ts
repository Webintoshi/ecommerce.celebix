import assert from "node:assert/strict";
import test from "node:test";
import type { QueryResult } from "pg";
import type { PostgresClientLike } from "./postgres/pool.ts";
import { resolveProductThumbnails } from "./product-thumbnails.ts";

const STORE="10000000-0000-4000-8000-000000000001",PRODUCT="20000000-0000-4000-8000-000000000001",VARIANT="20000000-0000-4000-8000-000000000002";
const auth=[STORE,"10000000-0000-4000-8000-000000000002","10000000-0000-4000-8000-000000000003","10000000-0000-4000-8000-000000000004","growth",2,new Date("2026-09-26T10:00:00Z")];
const PHOTO=`https://media.celebix.site/stores/${STORE}/products/${PRODUCT}/30000000-0000-4000-8000-000000000001.webp`;
class Client implements PostgresClientLike {
 queries:{text:string;values?:unknown[]}[]=[];
 constructor(private readonly payload:unknown={images:[]},private readonly outcome="found"){}
 async query(text:string,values?:unknown[]):Promise<QueryResult<Record<string,unknown>>>{this.queries.push({text,values});return {rows:[{outcome:this.outcome,result_payload:this.payload}],rowCount:1,command:"SELECT",oid:0,fields:[]};}
 release(){}
}
test("thumbnail lookup batches references with durable tenant authority and returns missing photos as null",async()=>{
 const client=new Client({images:[{key:"variant",imageUrl:PHOTO},{key:"missing",imageUrl:null}]});
 const result=await resolveProductThumbnails(client,auth,"pos",[{key:"variant",productId:PRODUCT,variantId:VARIANT},{key:"missing",productId:PRODUCT}]);
 assert.equal(result.get("variant"),PHOTO);assert.equal(result.get("missing"),null);
 assert.equal(client.queries.length,1);assert.deepEqual(client.queries[0]!.values?.slice(0,8),[...auth,"pos"]);
});
test("empty thumbnail lists need no database call",async()=>{const client=new Client();assert.equal((await resolveProductThumbnails(client,auth,"analytics",[])).size,0);assert.equal(client.queries.length,0);});
test("thumbnail responses reject unexpected keys, private fields and unsafe or cross-store URLs",async()=>{
 for(const images of [
  [{key:"foreign",imageUrl:PHOTO}],
  [{key:"variant",imageUrl:PHOTO,storeId:STORE}],
  [{key:"variant",imageUrl:"javascript:alert(1)"}],
  [{key:"variant",imageUrl:PHOTO.replace(STORE,"90000000-0000-4000-8000-000000000001")}],
  [{key:"variant",imageUrl:PHOTO+"?secret=1"}],
  [{key:"variant",imageUrl:PHOTO},{key:"variant",imageUrl:PHOTO}],
 ])await assert.rejects(()=>resolveProductThumbnails(new Client({images}),auth,"pos",[{key:"variant",productId:PRODUCT,variantId:VARIANT}]));
});
test("orders thumbnail references carry both order and item identity; malformed and oversized input is rejected",async()=>{
 const orderId="40000000-0000-4000-8000-000000000001",orderItemId="40000000-0000-4000-8000-000000000002";
 const client=new Client({images:[{key:"item",imageUrl:PHOTO}]});
 assert.equal((await resolveProductThumbnails(client,auth,"orders",[{key:"item",orderId,orderItemId}])).get("item"),PHOTO);
 assert.deepEqual(JSON.parse(client.queries[0]!.values?.at(-1) as string),[{key:"item",orderId,orderItemId}]);
 for(const refs of [[{key:"item",orderItemId}],Array.from({length:5001},(_,n)=>({key:String(n),productId:PRODUCT})),[{key:"same",productId:PRODUCT},{key:"same",productId:PRODUCT}]])await assert.rejects(()=>resolveProductThumbnails(new Client(),auth,"orders",refs as never));
});
