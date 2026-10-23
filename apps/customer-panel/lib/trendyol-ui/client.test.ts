import assert from 'node:assert/strict';
import test from 'node:test';
const key='a2901e8a-a55a-4a5f-a09e-e041d5bcac94';
const variantId='947b39e9-f3f1-4a96-a101-4b4c46c1c383';
const pricing={commissionBps:1700,commissionVatIncluded:true,commissionVatBps:2000,averageShippingCents:9000,otherFeeCents:0,productVatBps:2000,withholdingBps:100,coverWithholding:false,rounding:'cent' as const};
test('order issues are bounded exact non-secret DTOs read without query or mutation',async()=>{
 const {parseTrendyolOrderIssues}=await import('../../../../packages/saas-contracts/src/trendyol/index.ts');
 const {createTrendyolClient}=await import('./client.ts');const requests:any[]=[];
 const row={orderId:null,externalOrderId:'TY-EXT-1',orderNumber:'TY-ORDER-1',state:'action_required',issue:'mapping_required'};
 const dto={items:[row,{...row,orderId:variantId,state:'imported',issue:null}]};
 assert.deepEqual(parseTrendyolOrderIssues(dto),dto);
 for(const invalid of [{...dto,secret:'no'}, {items:[{...row,email:'no'}]}, {items:Array(51).fill(row)}, {items:[{...row,orderId:'not-an-id'}]}, {items:[{...row,externalOrderId:'x'.repeat(201)}]}, {items:[{...row,orderNumber:'x'.repeat(201)}]}, {items:[{...row,state:'x'.repeat(81)}]}, {items:[{...row,issue:'provider raw text'}]}])assert.throws(()=>parseTrendyolOrderIssues(invalid));
 const client=createTrendyolClient(async(url,init)=>{requests.push({url:String(url),init});return Response.json(dto);});
 assert.deepEqual(await client.orderIssues(),dto);assert.equal(requests[0].url,'/api/marketplaces/trendyol/order-issues');assert.equal(requests[0].init.method,undefined);assert.equal(requests[0].init.cache,'no-store');
});
test('native reads use same-origin bounded local requests and exact cursor/options filters',async()=>{
 const {createTrendyolClient}=await import('./client.ts');const requests:any[]=[];
 const client=createTrendyolClient(async(url,init)=>{requests.push({url:String(url),init});return Response.json(String(url).includes('/options')?{items:[{id:42,name:'Kumaş',required:true,values:[{id:7,name:'Pamuk'}]}]}:{items:[],nextCursor:null});});
 await client.products(variantId);await client.options({kind:'attributes',categoryId:42});
 assert.equal(requests[0].url,`/api/marketplaces/trendyol/products?limit=25&cursor=${variantId}`);
 assert.equal(requests[1].url,'/api/marketplaces/trendyol/options?kind=attributes&categoryId=42');
 assert.equal(requests[0].init.credentials,'same-origin');assert.equal(requests[0].init.cache,'no-store');
});
test('category options accept provider trees above one thousand while other option lists remain bounded',async()=>{
 const {createTrendyolClient}=await import('./client.ts');const items=Array.from({length:1001},(_,index)=>({id:index+1,name:`Kategori ${index+1}`}));
 const client=createTrendyolClient(async()=>Response.json({items}));assert.equal((await client.options({kind:'categories'})).items.length,1001);
 await assert.rejects(client.options({kind:'brands'}),(error:any)=>error.code==='unavailable');
 const oversized=createTrendyolClient(async()=>Response.json({items:Array.from({length:20001},(_,index)=>({id:index+1,name:`Kategori ${index+1}`}))}));
 await assert.rejects(oversized.options({kind:'categories'}),(error:any)=>error.code==='unavailable');
});
test('settings retries retain caller operation and send only integer pricing and version',async()=>{
 const {createTrendyolClient}=await import('./client.ts');const requests:any[]=[];
 const client=createTrendyolClient(async(url,init)=>{requests.push({url:String(url),key:new Headers(init?.headers).get('idempotency-key'),body:JSON.parse(String(init?.body))});return Response.json({saved:true,replayed:true});});
 await client.settings({expectedVersion:3,pricing},key);await client.settings({expectedVersion:3,pricing},key);
 assert.deepEqual(requests.map(value=>value.key),[key,key]);assert.equal(requests[0].url,'/api/marketplaces/trendyol/settings');assert.deepEqual(requests[0].body,{expectedVersion:3,pricing});
 await assert.rejects(client.settings({expectedVersion:3,pricing},'not-a-key'),(error:any)=>error.code==='invalid_input');assert.equal(requests.length,2);
});
test('unknown provider errors and malformed option payloads cannot enter UI',async()=>{
 const {createTrendyolClient}=await import('./client.ts');
 const failed=createTrendyolClient(async()=>Response.json({code:'raw_secret_from_provider',secret:'redact'},{status:502}));
 await assert.rejects(failed.overview(),(error:any)=>error.code==='unavailable'&&!error.message.includes('secret'));
 const malformed=createTrendyolClient(async()=>Response.json({items:[{id:1,name:'Unknown',credential:'secret'}]}));
 await assert.rejects(malformed.options({kind:'brands'}),(error:any)=>error.code==='unavailable');
});

test('actual provider attribute DTO passes through native client with validated variation flags',async()=>{
 const {TrendyolProvider}=await import('../../../../packages/saas-data/src/trendyol/provider.ts');
 const {createTrendyolClient}=await import('./client.ts');
 const provider=new TrendyolProvider(async url=>new URL(String(url)).pathname.endsWith('/attributes')?Response.json({id:2,categoryAttributes:[{attribute:{id:10,name:'Beden'},required:true,allowCustom:false,varianter:true,slicer:false,allowMultipleAttributeValues:false}]}):Response.json({totalElements:1,totalPages:1,page:0,size:1000,content:[{attributeValueId:20,attributeValue:'M'}]}));
 const dto=await provider.options({sellerId:'123',apiKey:'TEST_KEY',apiSecret:'TEST_VALUE'},{kind:'attributes',categoryId:2});
 const client=createTrendyolClient(async()=>Response.json(dto));
 assert.deepEqual(await client.options({kind:'attributes',categoryId:2}),{items:[{id:10,name:'Beden',required:true,allowCustom:false,varianter:true,slicer:false,allowMultipleAttributeValues:false,values:[{id:20,name:'M'}]}]});
 for(const flag of ['varianter','slicer','allowMultipleAttributeValues']){
  const invalid=createTrendyolClient(async()=>Response.json({items:[{...dto.items[0],[flag]:'false'}]}));
  await assert.rejects(invalid.options({kind:'attributes',categoryId:2}),(error:any)=>error.code==='unavailable');
 }
});
