import assert from 'node:assert/strict';
import test from 'node:test';
import {DEFAULT_TRENDYOL_PRICING} from '@celebix/saas-contracts';
import {sealTrendyolCredential} from './credential.ts';
import {TrendyolProviderError} from './provider.ts';
import {processTrendyolJobs} from './worker.ts';
const ID='11111111-1111-4111-8111-111111111111',V='22222222-2222-4222-8222-222222222222';
const keyring={activeKeyId:'test',keys:[{keyId:'test',key:new Uint8Array(32).fill(4)}]},now=()=>new Date('2026-10-23T10:00:00.000Z');
const mapping={variantId:V,barcode:'SKU-1',categoryId:null,brandId:null,vatRate:20,dimensionalWeight:1,cargoProviderCode:null,attributes:[],enabled:true,mode:'existing'};
function fixture(kind='catalog',payload:any={items:[{variantId:V,productId:ID,title:'Product',sku:'SKU-1',barcode:'SKU-1',webPriceCents:10000,quantity:2,mapping,status:'queued',issue:null,updatedAt:now().toISOString(),mappingVersion:1,lastPayloadFingerprint:null,providerSubmitted:true,description:'Product',images:[]}]}){
 payload=structuredClone(payload);
 if(kind==='catalog')for(const item of payload.items)if(!Object.hasOwn(item,'tax'))item.tax={treatment:'taxable',rateBps:2000};
 const job:any={id:ID,storeId:ID,sellerId:'123',connectionVersion:1,credentialVersion:1,generation:1,leaseId:V,kind,payload,pricing:{...DEFAULT_TRENDYOL_PRICING,commissionBps:1700,averageShippingCents:9000,withholdingBps:0},credential:sealTrendyolCredential({storeId:ID,version:1,credential:{sellerId:'123',apiKey:'key',apiSecret:'secret',webhookSecret:'a'.repeat(64)},keyring})};
 const calls:any[]=[], repository:any={claim:async()=>[job],read:async()=>job,beginDispatch:async()=>true,complete:async(_f:any,r:any)=>{calls.push(['complete',r]);return{};},defer:async(_f:any,c:any)=>calls.push(['defer',c]),importPackages:async(_f:any,p:any)=>{calls.push(['import',p]);return{state:'imported'};}};
 const provider:any={submitInventory:async(_c:any,items:any)=>{calls.push(['inventory',items]);return{batchId:'batch-1'};},createProducts:async(_c:any,items:any)=>{calls.push(['create',items]);return{batchId:'batch-1'};},productOrNull:async()=>null,batch:async()=>({complete:true,items:[{barcode:'SKU-1',status:'success',errors:[]}]}),product:async()=>({barcode:'SKU-1',approved:true,archived:false,listingId:'l',contentId:'c'}),registerWebhook:async(_c:any,p:any)=>calls.push(['hook',p]),orderStream:async()=>({packages:[{orderNumber:'order-1'}],nextCursor:null,hasMore:false}),getOrder:async()=>({packages:[{orderNumber:'order-1'}]})};
 provider.getProductTax=async()=>20;
 return{job,calls,repository,provider,run:()=>processTrendyolJobs({repository,provider,keyring,panelOrigin:'https://panel.saas-staging.celebix.net',now})};
}
test('catalog gross-up is per tenant; lease is rechecked before POST and returned batch is durable',async()=>{
 const f=fixture();assert.equal((await f.run()).completed,1);assert.deepEqual(f.calls[0],['inventory',[{barcode:'SKU-1',quantity:2,salePriceCents:22892}]]);
 assert.equal(f.calls[1][1].batchId,'batch-1');assert.equal(f.calls[1][1].items[0].status,'submitted');assert.match(f.calls[1][1].items[0].fingerprint,/^[a-f0-9]{64}$/);
 assert.equal(f.calls[1][1].items[0].requiresApproval,false);
 const stale=fixture();stale.repository.read=async()=>null;assert.equal((await stale.run()).stale,1);assert.equal(stale.calls.length,0);
});
test('unchanged fingerprint sends nothing; disabling withdraws stock without inventing a price',async()=>{
 const f=fixture();await f.run();const fingerprint=f.calls[1][1].items[0].fingerprint;f.calls.length=0;f.job.payload.items[0].lastPayloadFingerprint=fingerprint;await f.run();assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'complete');
 const d=fixture();d.job.payload.items[0].mapping.enabled=false;d.job.payload.items[0].webPriceCents=null;await d.run();assert.deepEqual(d.calls[0],['inventory',[{barcode:'SKU-1',quantity:0}]]);
});
test('stream creates durable point-query work; full point-query imports before completion',async()=>{
 const f=fixture('orders',{start:'2026-10-22T00:00:00.123456Z',end:now().toISOString(),cursor:null});let filter:any;f.provider.orderStream=async(_c:any,p:any)=>{filter=p;return{packages:[{orderNumber:'a'},{orderNumber:'a'}],nextCursor:'cursor',hasMore:true};};await f.run();assert.equal(filter.start,'2026-10-22T00:00:00.123Z');assert.deepEqual(f.calls[0][1],{orderNumbers:['a'],cursor:'cursor'});
 const p=fixture('order',{orderNumber:'order-1'});await p.run();assert.deepEqual(p.calls.map(x=>x[0]),['import','complete']);
});
test('batch success waits for actual approval and keeps completed batch evidence for later polling',async()=>{
 const f=fixture('batch',{batchId:'batch-1',items:[{variantId:V,mapping,barcode:'SKU-1',mappingVersion:1,fingerprint:'f'.repeat(64)}]});f.provider.product=async()=>({barcode:'SKU-1',approved:false,archived:false});await f.run();assert.equal(f.calls[0][1].pending,true);assert.equal(f.calls[0][1].batchComplete,true);assert.equal(f.calls[0][1].items[0].status,'submitted');
 f.calls.length=0;f.job.payload.batchComplete=true;f.job.payload.outcomes=f.calls;f.provider.batch=async()=>{throw Error('expired batch must not be read');};f.provider.product=async()=>({approved:true,archived:false});await f.run();assert.equal(f.calls[0][1].items[0].status,'active');assert.equal(f.calls[0][1].pending,false);
});
test('fifty inventory batch successes settle in one pass without product approval lookups',async()=>{
 const inventory=Array.from({length:50},(_,index)=>{const variantId='22222222-2222-4222-8222-'+String(index+1).padStart(12,'0'),barcode='SKU-'+index;return{variantId,mapping:{...mapping,variantId,barcode},mappingVersion:1,requiresApproval:false,fingerprint:'f'.repeat(64)};});
 const f=fixture('batch',{batchId:'batch-1',items:inventory});let approvals=0;
 f.provider.batch=async()=>({complete:true,items:inventory.map(item=>({barcode:item.mapping.barcode,status:'success',errors:[]}))});
 f.provider.product=async()=>{approvals++;throw Error('inventory update must use its own batch result');};
 const result=await f.run();assert.equal(result.completed,1);assert.equal(result.deferred,0);assert.equal(approvals,0);
 const completion=f.calls[0][1];assert.equal(completion.pending,false);assert.equal(completion.batchComplete,true);assert.equal(completion.items.length,50);assert.ok(completion.items.every((item:any)=>item.status==='active'&&item.requiresApproval===false));
});
test('creation approval remains pending and limits product lookups to four per pass',async()=>{
 const creations=Array.from({length:5},(_,index)=>{const variantId='22222222-2222-4222-8222-'+String(index+1).padStart(12,'0'),barcode='SKU-'+index;return{variantId,mapping:{...mapping,variantId,barcode},mappingVersion:1,requiresApproval:true};});
 const f=fixture('batch',{batchId:'batch-1',items:creations});let approvals=0;
 f.provider.batch=async()=>({complete:true,items:creations.map(item=>({barcode:item.mapping.barcode,status:'success',errors:[]}))});
 f.provider.product=async()=>{approvals++;return{approved:false,archived:false};};
 await f.run();assert.equal(approvals,4);assert.equal(f.calls[0][1].pending,true);assert.ok(f.calls[0][1].items.every((item:any)=>item.status==='submitted'&&item.requiresApproval===true));
});
test('expired batch404 becomes terminal per-listing uncertainty without retrying a POST or hiding auth failures',async()=>{
 const f=fixture('batch',{batchId:'expired-batch',items:[{variantId:V,mapping,barcode:'SKU-1',mappingVersion:1,fingerprint:'f'.repeat(64)}]});
 f.provider.batch=async()=>{throw new TrendyolProviderError('provider_rejected',undefined,404);};
 const result=await f.run();assert.equal(result.completed,1);assert.equal(result.deferred,0);
 assert.deepEqual(f.calls,[['complete',{items:[{variantId:V,mappingVersion:1,status:'failed',fingerprint:'f'.repeat(64),issue:'provider_outcome_unknown'}],pending:false,batchComplete:true}]]);
 const denied=fixture('batch',{batchId:'batch-1',items:[{variantId:V,mapping,mappingVersion:1}]});denied.provider.batch=async()=>{throw new TrendyolProviderError('provider_denied',undefined,403);};
 await denied.run();assert.deepEqual(denied.calls,[['defer','provider_denied']]);
});
test('uncertain remote writes are terminal attention; not blindly retried',async()=>{
 const f=fixture();f.provider.submitInventory=async()=>{throw new TrendyolProviderError('provider_outcome_unknown');};await f.run();assert.deepEqual(f.calls,[['defer','provider_outcome_unknown']]);
});
test('a catalog POST conflict becomes terminal uncertainty without replay while a batch read conflict stays retryable',async()=>{
 const f=fixture();let posts=0;f.provider.submitInventory=async()=>{posts++;throw new TrendyolProviderError('provider_conflict',undefined,409);};
 await f.run();assert.deepEqual(f.calls,[['defer','provider_outcome_unknown']]);assert.equal(posts,1);
 f.job.payload.items[0].issue=f.calls[0][1];f.calls.length=0;await f.run();assert.equal(posts,1);assert.deepEqual(f.calls,[['complete',{items:[{variantId:V,mappingVersion:1,status:'failed',issue:'provider_outcome_unknown'}]}]]);
 const read=fixture('batch',{batchId:'batch-1',items:[{variantId:V,mapping,mappingVersion:1,requiresApproval:false}]});read.provider.batch=async()=>{throw new TrendyolProviderError('provider_conflict',undefined,409);};
 await read.run();assert.deepEqual(read.calls,[['defer','provider_conflict']]);
});
test('confirmed A then unknown B then target A preserves uncertainty despite the old confirmed fingerprint',async()=>{
 const f=fixture();await f.run();const confirmedA=f.calls[1][1].items[0].fingerprint;f.calls.length=0;
 Object.assign(f.job.payload.items[0],{lastPayloadFingerprint:confirmedA,webPriceCents:20000});
 f.provider.submitInventory=async()=>{throw new TrendyolProviderError('provider_outcome_unknown');};await f.run();assert.deepEqual(f.calls,[['defer','provider_outcome_unknown']]);f.calls.length=0;
 Object.assign(f.job.payload.items[0],{issue:'provider_outcome_unknown',webPriceCents:10000});let remoteReads=0;
 f.provider.getInventory=async()=>{remoteReads++;return{items:[{barcode:'SKU-1',quantity:2,salePriceCents:22892}]};};
 f.provider.submitInventory=async()=>{throw Error('unknown write must not authorize another POST');};
 await f.run();assert.equal(remoteReads,0);assert.deepEqual(f.calls,[['complete',{items:[{variantId:V,mappingVersion:1,status:'failed',issue:'provider_outcome_unknown'}]}]]);
});
test('a matching current inventory snapshot cannot settle an unknown earlier asynchronous write',async()=>{
 const f=fixture();Object.assign(f.job.payload.items[0],{issue:'provider_outcome_unknown',lastPayloadFingerprint:'a'.repeat(64)});let remoteReads=0,dispatches=0;
 f.provider.getInventory=async()=>{remoteReads++;return{items:[{barcode:'SKU-1',quantity:2,salePriceCents:22892}]};};
 f.repository.beginDispatch=async()=>{dispatches++;return true;};
 await f.run();assert.equal(remoteReads,0);assert.equal(dispatches,0);assert.deepEqual(f.calls,[['complete',{items:[{variantId:V,mappingVersion:1,status:'failed',issue:'provider_outcome_unknown'}]}]]);
});
test('create publication reconciles remote barcode first and only sends one bounded batch per lease',async()=>{
 const f=fixture();Object.assign(f.job.payload.items[0],{providerSubmitted:false,images:['https://cdn.celebix.net/a.jpg']});Object.assign(f.job.payload.items[0].mapping,{mode:'create',categoryId:1,brandId:2,cargoProviderCode:'TY',attributes:[{attributeId:1,valueId:2}]});await f.run();assert.equal(f.calls[0][0],'create');assert.equal(f.calls[0][1][0].salePrice,228.92);assert.deepEqual(f.calls[0][1][0].cargoProviders,['TY']);
 assert.equal(f.calls[1][1].items[0].requiresApproval,true);
 const existing=fixture();Object.assign(existing.job.payload.items[0].mapping,{mode:'create',categoryId:1,brandId:2,cargoProviderCode:'TY',attributes:[{attributeId:1,valueId:2}]});existing.job.payload.items[0].providerSubmitted=false;existing.provider.productOrNull=async()=>({approved:false,archived:false});await existing.run();assert.ok(!existing.calls.some(c=>c[0]==='create'));assert.equal(existing.calls[0][1].items[0].status,'submitted');
 assert.equal(existing.calls[0][1].items[0].requiresApproval,true);assert.equal(existing.calls[0][1].items[0].requiresInventory,true);
 const approved=fixture();Object.assign(approved.job.payload.items[0].mapping,{mode:'create',categoryId:1,brandId:2,cargoProviderCode:'TY',attributes:[{attributeId:1,valueId:2}]});approved.job.payload.items[0].providerSubmitted=false;approved.provider.productOrNull=async()=>({approved:true,archived:false});await approved.run();assert.equal(approved.calls[0][0],'inventory');assert.equal(approved.calls[1][1].items[0].requiresApproval,false);
});

test('native dispatch intent is durable before remote POST and rejected leases cannot write',async()=>{
 const f=fixture();let dispatched=false;f.repository.beginDispatch=async()=>{dispatched=true;return true;};f.provider.submitInventory=async()=>{assert.equal(dispatched,true);return{batchId:'b'};};await f.run();
 const lost=fixture();lost.repository.beginDispatch=async()=>false;await lost.run();assert.equal(lost.calls.length,0);
});
test('an already pending remote creation is priced only after approval and a new catalog pass',async()=>{
 const f=fixture('batch',{batchComplete:true,items:[{variantId:V,mapping,mappingVersion:1,requiresApproval:true,requiresInventory:true,fingerprint:'f'.repeat(64)}]});f.provider.product=async()=>({approved:false,archived:false});await f.run();assert.equal(f.calls[0][1].items[0].status,'submitted');assert.equal(f.calls[0][1].items[0].requeue,undefined);f.calls.length=0;f.provider.product=async()=>({approved:true,archived:false});await f.run();const outcome=f.calls[0][1].items[0];assert.equal(outcome.requeue,true);assert.equal(outcome.fingerprint,undefined);assert.equal(outcome.requiresApproval,true);assert.equal(outcome.requiresInventory,true);
});

test('an existing remote mapping withdraws stock even before its first local batch',async()=>{
 const f=fixture();Object.assign(f.job.payload.items[0],{providerSubmitted:false,webPriceCents:null});await f.run();assert.deepEqual(f.calls[0],['inventory',[{barcode:'SKU-1',quantity:0}]]);
});
test('missing unsupported or conflicting canonical VAT blocks catalog sends without a guessed rate',async()=>{
 for(const [tax,issue]of[[null,'tax_required'],[{treatment:'taxable',rateBps:500},'tax_unsupported'],[{treatment:'taxable',rateBps:1000},'tax_conflict']]as const){const f=fixture();f.job.payload.items[0].tax=tax;await f.run();assert.deepEqual(f.calls,[['complete',{items:[{variantId:V,mappingVersion:1,status:'failed',issue}]}]]);}
});
test('remote VAT drift stays actionable even if the stock-price target matches a confirmed fingerprint',async()=>{
 const f=fixture();await f.run();f.job.payload.items[0].lastPayloadFingerprint=f.calls[1][1].items[0].fingerprint;f.calls.length=0;f.provider.getProductTax=async()=>10;
 await f.run();assert.deepEqual(f.calls,[['complete',{items:[{variantId:V,mappingVersion:1,status:'failed',issue:'tax_conflict'}]}]]);
});
test('explicit exemption uses provider zero while unknown tax still permits a stock-zero withdrawal',async()=>{
 const exempt=fixture();exempt.job.payload.items[0].tax={treatment:'exempt',rateBps:null};exempt.job.payload.items[0].mapping.vatRate=0;exempt.provider.getProductTax=async()=>0;await exempt.run();assert.equal(exempt.calls[0][0],'inventory');
 const withdraw=fixture();Object.assign(withdraw.job.payload.items[0],{tax:null,quantity:0});withdraw.provider.getProductTax=async()=>{throw Error('withdrawal must not look up VAT');};await withdraw.run();assert.deepEqual(withdraw.calls[0],['inventory',[{barcode:'SKU-1',quantity:0}]]);
});
