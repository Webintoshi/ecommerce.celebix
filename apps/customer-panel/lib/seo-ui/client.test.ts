import assert from 'node:assert/strict';
import test from 'node:test';
import { createSeoClient, SeoApiError } from './client.ts';
const id='11111111-1111-4111-8111-111111111111';
test('resource filters use encoded same-origin reads and writes carry only resource version and operation identity',async()=>{
 const calls:{path:string,init:RequestInit|undefined}[]=[];
 const client=createSeoClient(async(path,init)=>{calls.push({path:String(path),init});return new Response(JSON.stringify(String(path).includes('/resources?')?{items:[],nextCursor:null,total:0}:{resource:{id},replayed:false}),{headers:{'content-type':'application/json'}});});
 await client.resources({kind:'category',query:'Gold & silver',missing:true,cursor:'next/1'});
 assert.equal(calls[0]?.path,'/api/seo/resources?kind=category&query=Gold+%26+silver&missing=1&cursor=next%2F1&limit=50');
 const body={expectedVersion:2,expectedSeoVersion:3,title:'Altın',description:null,canonicalPath:null,indexing:'inherit' as const};
 await client.saveResource('product',id,body,id);
 assert.equal(calls[1]?.path,`/api/seo/resources/product/${id}`);
 assert.equal(calls[1]?.init?.method,'PATCH');
 assert.equal(new Headers(calls[1]?.init?.headers).get('idempotency-key'),id);
 assert.deepEqual(JSON.parse(String(calls[1]?.init?.body)),body);
 assert.equal(calls[1]?.init?.credentials,'same-origin');
});
test('version conflict stays distinguishable for explicit reload; raw server detail never reaches user',async()=>{
 const client=createSeoClient(async()=>new Response(JSON.stringify({code:'version_conflict',message:'SQL private data'}),{status:409,headers:{'content-type':'application/json'}}));
 await assert.rejects(client.settings(),(error:unknown)=>error instanceof SeoApiError&&error.code==='version_conflict'&&!error.message.includes('SQL'));
});
