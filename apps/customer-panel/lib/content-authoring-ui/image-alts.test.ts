import assert from 'node:assert/strict';
import test from 'node:test';
import {selectedImageBatches,imageSignature} from './image-alts.ts';
import {createContentAuthoringClient,ContentAuthoringApiError} from './client.ts';
const id='10000000-0000-4000-8000-000000000001';
test('selected image batching caps four and maps by stable ID after reorder while preserving unselected existing alts',()=>{
 const images=Array.from({length:11},(_,index)=>({id:`image-${index}`,altText:index===0?'Retain me':''}));
 const selected=images.filter(image=>!image.altText).map(image=>image.id);const batches=selectedImageBatches([...images].reverse(),selected);
 assert.deepEqual(batches.map(batch=>batch.length),[4,4,2]);assert.equal(batches.flat().some(image=>image.id==='image-0'),false);assert.deepEqual(new Set(batches.flat().map(image=>image.id)),new Set(selected));
 assert.notEqual(imageSignature(images),imageSignature(images.map(image=>image.id==='image-1'?{...image,altText:'Manual edit'}:image)));
});
test('image client sends exact stable IDs, thumbnail payload and operation id; failed entries remain separate',async()=>{
 let seen:any;const api=createContentAuthoringClient(async(url,init)=>{seen={url,init};return Response.json({results:[{id:'local-b',altText:'Mavi deri kordon'}],failedIds:['saved-a'],chargedCredits:1,wallet:{balance:9,reserved:0,available:9}});});
 const request={draftId:id,productId:null,context:{title:'Kordon'},images:[{id:'saved-a',dataUrl:'data:image/jpeg;base64,eA=='},{id:'local-b',dataUrl:'data:image/jpeg;base64,eA=='}]};const response=await api.imageAlts(request,id);
 assert.equal(seen.url,'/api/content-ai/image-alts');assert.equal(seen.init.headers['idempotency-key'],id);assert.deepEqual(JSON.parse(seen.init.body),request);assert.deepEqual(response.results,[{id:'local-b',altText:'Mavi deri kordon'}]);assert.deepEqual(response.failedIds,['saved-a']);
});
test('image client refuses foreign or duplicate result IDs before exposing content to the editor',async()=>{
 for(const results of [[{id:'foreign',altText:'Wrong'}],[{id:'image',altText:'One'},{id:'image',altText:'Two'}]]){
  const api=createContentAuthoringClient(async()=>Response.json({results,failedIds:[],chargedCredits:1,wallet:{balance:9,reserved:0,available:9}}));
  await assert.rejects(api.imageAlts({draftId:id,productId:null,context:{title:'Kordon'},images:[{id:'image',dataUrl:'data:image/jpeg;base64,eA=='}]},id),error=>error instanceof ContentAuthoringApiError&&error.code==='invalid_response');
 }
});

test('thumbnail fetch uses same-origin credentials only for the authenticated source route and rejects failed reads',async()=>{
 const {createAuthoringThumbnail}=await import('./image-alts.ts');const previous=globalThis.fetch;const calls:{source:string;credentials:RequestCredentials|undefined}[]=[];
 globalThis.fetch=async(source,init)=>{calls.push({source:String(source),credentials:init?.credentials});return new Response('unavailable',{status:503});};
 try{
  await assert.rejects(createAuthoringThumbnail('/api/content-ai/image-source/product/media'),/image_unavailable/);
  await assert.rejects(createAuthoringThumbnail('https://media.example.test/image.jpg'),/image_unavailable/);
  await assert.rejects(createAuthoringThumbnail('https://panel.example.test/api/content-ai/image-source/product/media'),/image_unavailable/);
  assert.deepEqual(calls.map(call=>call.credentials),['same-origin','omit','omit']);
 }finally{globalThis.fetch=previous;}
});
