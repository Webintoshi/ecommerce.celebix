import assert from 'node:assert/strict';
import test from 'node:test';
import { readCatalogMutationInput } from './request-input.ts';
import { readCatalogMerchandisingUpdateInput } from '../catalog-onboarding-http/request-input.ts';
const origin={generationId:'a0000000-0000-4000-8000-000000000001',draftId:'b0000000-0000-4000-8000-000000000001'};
const request=(body:unknown)=>new Request('https://panel.example.test/api',{method:'PATCH',headers:{'content-type':'application/json','idempotency-key':origin.generationId},body:JSON.stringify(body)});
const product={slug:'product',title:'Product',description:'<p>Text</p>',status:'draft',currency:'TRY'};
const profile={expectedProfileVersion:7,profile:{minimumPurchaseQuantity:1,seoTitle:'SEO'},categoryIds:[],resourceIds:{collections:[],tags:[],attributes:[],extras:[],definitions:[]},channelIds:[]};
test('normal product save parses references, retains CAS and legacy bodies, rejects unowned fields safely',async()=>{
 for(const extra of [{},{contentOrigins:{description:origin}},{contentOrigins:{description:null}}]) {
  const parsed=await readCatalogMutationInput(request({expectedVersion:4,product,...extra}),'update_product');
  assert.equal(parsed.kind,'valid');if(parsed.kind==='valid')assert.deepEqual(parsed.value,{expectedVersion:4,product,...extra});
 }
 for(const contentOrigins of [{seoTitle:origin},null,{description:{...origin,generatedContentHash:'fake'}}])assert.equal((await readCatalogMutationInput(request({expectedVersion:4,product,contentOrigins}),'update_product')).kind,'invalid');
});
test('merchandising save accepts only SEO lineage with independent profile CAS',async()=>{
 for(const extra of [{},{contentOrigins:{seoTitle:origin,seoDescription:null}}]){
  const parsed=await readCatalogMerchandisingUpdateInput(request({...profile,...extra}));assert.equal(parsed.kind,'valid');if(parsed.kind==='valid'){assert.equal(parsed.expectedProfileVersion,7);assert.deepEqual(parsed.contentOrigins,extra.contentOrigins);}
 }
 assert.equal((await readCatalogMerchandisingUpdateInput(request({...profile,contentOrigins:{description:origin}}))).kind,'invalid');
});
