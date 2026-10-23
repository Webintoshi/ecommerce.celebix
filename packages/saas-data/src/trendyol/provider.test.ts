import assert from 'node:assert/strict';
import test from 'node:test';
import * as implementation from './provider.ts';
const credential = {sellerId:'123',apiKey:'SECRET_KEY',apiSecret:'SECRET_VALUE'};
function provider(transport:typeof fetch, options:Record<string,unknown> = {}) {
  assert.equal(typeof implementation.TrendyolProvider, 'function', 'current Trendyol provider must exist');
  return new implementation.TrendyolProvider(transport, options);
}
const errorCode = (code:string) => (error:unknown) => {
  const value=error as {code?:string;message?:string};
  assert.equal(value.code,code);
  assert.doesNotMatch(JSON.stringify(error)+String(value.message),/SECRET|private-provider-body/);
  return true;
};
const start='2026-10-01T00:00:00.000Z',end='2026-10-02T00:00:00.000Z';
function packageFixture(overrides:Record<string,unknown> = {}) {
  return {supplierId:123,shipmentPackageId:456,orderNumber:'ORDER-1',orderDate:1790812800000,lastModifiedDate:1790899200000,
    status:'Created',shipmentPackageStatus:'Created',currencyCode:'TRY',customerFirstName:'Ayşe',customerLastName:'Yılmaz',customerEmail:'relay@example.test',
    shipmentAddress:{address1:'Example street',city:'Istanbul',countryCode:'TR',phone:null},cargoTrackingNumber:123456789,cargoTrackingLink:'https://tracking.trendyol.com/?id=123',cargoProviderName:'Trendyol Express',
    packageTotalPrice:190,packageGrossAmount:200,packageTotalDiscount:10,createdBy:'order-creation',originPackageIds:null,
    lines:[{lineId:789,contentId:22,stockCode:'SKU-1',barcode:'BAR-1',productName:'Ürün',quantity:2,lineUnitPrice:95,lineGrossAmount:100,lineTotalDiscount:5,lineSellerDiscount:3,lineTyDiscount:2,orderLineItemStatusName:'Created',
      discountDetails:[{lineItemId:'UNIT-A',lineItemPrice:95,lineItemSellerDiscount:3,lineItemTyDiscount:2},{lineItemId:'UNIT-B',lineItemPrice:95,lineItemSellerDiscount:3,lineItemTyDiscount:2}]}],...overrides};
}
function productFixture() {
  return {barcode:'BAR-1',title:'Ürün',description:'Ürün açıklaması',productMainId:'MODEL-1',brandId:1,categoryId:2,quantity:3,stockCode:'SKU-1',vatRate:20,listPrice:110,salePrice:100,dimensionalWeight:1,
    images:[{url:'https://media.example.test/product.jpg'}],attributes:[{attributeId:10,attributeValueId:20},{attributeId:11,customAttributeValue:'Siyah'}]};
}

test('connection validation uses approved Product V2 with required Basic and User-Agent headers',async()=>{
  let call:any;
  const p=provider(async(url,init)=>{call={url:String(url),init};return Response.json({content:[],totalElements:0,totalPages:0,page:0,size:1});});
  await p.testConnection(credential);
  assert.equal(call.url,'https://apigw.trendyol.com/integration/product/sellers/123/products/approved?size=1');
  const headers=new Headers(call.init.headers);
  assert.equal(headers.get('authorization'),'Basic '+Buffer.from('SECRET_KEY:SECRET_VALUE').toString('base64'));
  assert.equal(headers.get('user-agent'),'123 - Celebix');
  assert.equal(call.init.redirect,'error');assert.equal(call.init.cache,'no-store');
  assert.ok(call.init.signal instanceof AbortSignal);
});

test('invalid seller and header credentials fail before transport and explicit stage never changes by caller URL',async()=>{
  let calls=0;
  const p=provider(async()=>{calls++;return Response.json({content:[]});});
  for(const bad of [{...credential,sellerId:'123/path'},{...credential,apiKey:'a\r\nsecret'},{...credential,apiSecret:''}])await assert.rejects(()=>p.testConnection(bad),errorCode('invalid_input'));
  assert.equal(calls,0);
  const stage=provider(async url=>{assert.equal(new URL(String(url)).origin,'https://stageapigw.trendyol.com');return Response.json({content:[]});},{stage:true});
  await stage.testConnection(credential);
});

test('inventory writes integer cents once and returns only asynchronous batch identity',async()=>{
  let call:any;
  const p=provider(async(url,init)=>{call={url:String(url),body:JSON.parse(String(init?.body))};return Response.json({batchRequestId:'batch-1'});});
  assert.deepEqual(await p.submitInventory(credential,[{barcode:'BAR-1',quantity:2,salePriceCents:22892}]),{batchId:'batch-1'});
  assert.equal(new URL(call.url).pathname,'/integration/inventory/sellers/123/products/price-and-inventory');
  assert.deepEqual(call.body,{items:[{barcode:'BAR-1',quantity:2,salePrice:228.92,listPrice:228.92}]});
  await assert.rejects(()=>p.submitInventory(credential,[{barcode:'BAR-1',quantity:20001,salePriceCents:100}]),errorCode('invalid_input'));
});

test('stock-only withdrawal omits both price fields and retains quantity validation',async()=>{
  let body:unknown,calls=0;
  const p=provider(async(_url,init)=>{calls++;body=JSON.parse(String(init?.body));return Response.json({batchRequestId:'stock-only-1'});});
  assert.deepEqual(await p.submitInventory(credential,[{barcode:'ARCHIVED-1',quantity:0},{barcode:'STOCK-1',quantity:3,salePriceCents:undefined}]),{batchId:'stock-only-1'});
  assert.deepEqual(body,{items:[{barcode:'ARCHIVED-1',quantity:0},{barcode:'STOCK-1',quantity:3}]});
  await assert.rejects(()=>p.submitInventory(credential,[{barcode:'ARCHIVED-1',quantity:1.5}]),errorCode('invalid_input'));
  assert.equal(calls,1);
});

test('batch completion inspects every item and handles stock responses with no batch status',async()=>{
  const p=provider(async url=>{assert.equal(new URL(String(url)).pathname,'/integration/product/sellers/123/products/batch-requests/batch-1');return Response.json({batchRequestId:'batch-1',batchRequestType:'ProductInventoryUpdate',itemCount:2,failedItemCount:1,items:[{requestItem:{barcode:'A'},status:'SUCCESS',failureReasons:[]},{requestItem:{barcode:'B'},status:'FAILED',failureReasons:['private-provider-body SECRET_VALUE invalid price']}]});});
  assert.deepEqual(await p.batch(credential,'batch-1'),{complete:true,items:[{barcode:'A',status:'success',errors:[]},{barcode:'B',status:'failed',errors:['provider_item_rejected']}]});
  const pending=provider(async()=>Response.json({batchRequestId:'batch-1',status:'IN_PROGRESS',items:[{requestItem:{barcode:'A'},status:'SUCCESS',failureReasons:[]}]}));
  assert.equal((await pending.batch(credential,'batch-1')).complete,false);
});

test('malformed or mismatched batch identities never become completed delivery',async()=>{
  for(const result of [{batchRequestId:'foreign',items:[]},{batchRequestId:'batch-1',items:[]},{batchRequestId:'batch-1',status:'COMPLETED',items:[{requestItem:{barcode:'A'},status:'unexpected',failureReasons:[]}]}]){
    const p=provider(async()=>Response.json(result));await assert.rejects(()=>p.batch(credential,'batch-1'),errorCode('provider_unavailable'));
  }
});

test('Product V2 uses documented reference attribute shape and refuses hidden outbound credentials',async()=>{
  let call:any;
  const p=provider(async(url,init)=>{call={url:String(url),body:JSON.parse(String(init?.body))};return Response.json({batchRequestId:'create-1'});});
  assert.deepEqual(await p.createProducts(credential,[productFixture()]),{batchId:'create-1'});
  assert.equal(new URL(call.url).pathname,'/integration/product/sellers/123/v2/products');
  assert.deepEqual(call.body.items[0].attributes,[{attributeId:10,attributeValueIds:[20]},{attributeId:11,attributeValue:'Siyah'}]);
  await assert.rejects(()=>p.createProducts(credential,[{...productFixture(),apiSecret:'SECRET_VALUE'}]),errorCode('invalid_input'));
  await assert.rejects(()=>p.createProducts(credential,[{...productFixture(),listPrice:99}]),errorCode('invalid_input'));
});

test('V2 metadata preserves leaf categories, separate attribute values and string carrier codes',async()=>{
  const paths:string[]=[];
  const p=provider(async url=>{const u=new URL(String(url));paths.push(u.pathname);if(u.pathname.endsWith('/product-categories'))return Response.json({categories:[{id:1,name:'Parent',subCategories:[{id:2,name:'Leaf',parentId:1,subCategories:[]}]}]});if(u.pathname.endsWith('/attributes'))return Response.json({id:2,categoryAttributes:[{attribute:{id:10,name:'Beden'},required:true,allowCustom:false,varianter:true,slicer:false,allowMultipleAttributeValues:false}]});if(u.pathname.endsWith('/values'))return Response.json({totalElements:1,totalPages:1,page:0,size:1000,content:[{attributeValueId:20,attributeValue:'M'}]});if(u.pathname.endsWith('/cargo-providers'))return Response.json([{code:'YKMP',name:'Yurtiçi Kargo'}]);return Response.json([{id:3,name:'Brand'}]);});
  assert.deepEqual(await p.options(credential,{kind:'categories'}),{items:[{id:2,name:'Leaf',parentId:1}]});
  assert.deepEqual((await p.options(credential,{kind:'attributes',categoryId:2})).items[0],{id:10,name:'Beden',required:true,allowCustom:false,varianter:true,slicer:false,allowMultipleAttributeValues:false,values:[{id:20,name:'M'}]});
  assert.deepEqual(await p.options(credential,{kind:'cargo'}),{items:[{id:'YKMP',name:'Yurtiçi Kargo'}]});
  assert.deepEqual(await p.options(credential,{kind:'brands',search:'Brand'}),{items:[{id:3,name:'Brand'}]});
  assert.ok(paths.includes('/integration/product/categories/2/attributes/10/values'));
});

test('stream converts ISO bounds to millisecond filters while preserving opaque cursor and real unit identities',async()=>{
  let query:URL|undefined;
  const p=provider(async url=>{query=new URL(String(url));return Response.json({hasMore:true,nextCursor:'cursor+next/==',size:50,content:[packageFixture()]});});
  const result=await p.orderStream(credential,{start,end,cursor:'cursor+previous/=='});
  assert.equal(query!.pathname,'/integration/order/sellers/123/orders/stream');
  assert.equal(query!.searchParams.get('lastModifiedStartDate'),'1790812800000');
  assert.equal(query!.searchParams.get('lastModifiedEndDate'),'1790899200000');
  assert.equal(query!.searchParams.get('nextCursor'),'cursor+previous/==');
  assert.equal(result.nextCursor,'cursor+next/==');assert.equal(result.hasMore,true);
  assert.deepEqual(result.packages[0],{packageId:'456',externalOrderId:'ORDER-1',orderNumber:'ORDER-1',modifiedAt:end,orderedAt:start,status:'Created',currency:'TRY',customer:{name:'Ayşe Yılmaz',email:'relay@example.test',phone:null},shippingAddress:{address1:'Example street',city:'Istanbul',countryCode:'TR',phone:null},tracking:{code:'123456789',url:'https://tracking.trendyol.com/?id=123',carrier:'Trendyol Express'},totalCents:19000,shippingCents:0,discountCents:1000,lines:[{lineId:'789',barcode:'BAR-1',sku:'SKU-1',title:'Ürün',quantity:2,unitPriceCents:9500,discountCents:1000,totalCents:19000,status:'Created',unitIds:['UNIT-A','UNIT-B']}]});
});

test('stream rejects overlong ranges, foreign sellers and nonprogressing cursors',async()=>{
  let calls=0;
  const p=provider(async()=>{calls++;return Response.json({hasMore:true,nextCursor:'same',size:50,content:[]});});
  await assert.rejects(()=>p.orderStream(credential,{start,end:'2026-10-16T00:00:00.000Z',cursor:null}),errorCode('invalid_input'));assert.equal(calls,0);
  await assert.rejects(()=>p.orderStream(credential,{start,end,cursor:'same'}),errorCode('provider_unavailable'));
  const foreign=provider(async()=>Response.json({hasMore:false,nextCursor:null,content:[packageFixture({supplierId:999})]}));
  await assert.rejects(()=>foreign.orderStream(credential,{start,end,cursor:null}),errorCode('order_evidence_invalid'));
});

test('order evidence fails closed on inconsistent totals, duplicate units, fractional quantities and unsupported currency',async()=>{
  const line=packageFixture().lines[0];
  const invalid=[{packageTotalPrice:189.99},{currencyCode:'USD'},{lines:[{...line,quantity:1.5}]},{lines:[{...line,discountDetails:[{lineItemId:'UNIT-A',lineItemPrice:95,lineItemSellerDiscount:3,lineItemTyDiscount:2},{lineItemId:'UNIT-A',lineItemPrice:95,lineItemSellerDiscount:3,lineItemTyDiscount:2}]}]}, {shipmentPackageId:9007199254740992}];
  for(const changes of invalid){const p=provider(async()=>Response.json({hasMore:false,nextCursor:null,content:[packageFixture(changes)]}));await assert.rejects(()=>p.orderStream(credential,{start,end,cursor:null}),errorCode('order_evidence_invalid'));}
});

test('absent individual unit evidence stays absent and logical order identity survives package splits',async()=>{
  const line=packageFixture().lines[0];
  const p=provider(async()=>Response.json({hasMore:false,nextCursor:null,content:[packageFixture({shipmentPackageId:457,customerEmail:undefined,createdBy:'split',originPackageIds:[456],lines:[{...line,discountDetails:undefined}]})]}));
  const result=(await p.orderStream(credential,{start,end,cursor:null})).packages[0];
  assert.equal(result.externalOrderId,'ORDER-1');assert.equal(result.packageId,'457');assert.equal(result.customer.email,'');assert.deepEqual(result.lines[0].unitIds,[]);
});

test('point lookup uses current Order V2, collects pages and refuses a foreign order response',async()=>{
  const pages:string[]=[];
  const p=provider(async url=>{const u=new URL(String(url));assert.equal(u.pathname,'/integration/order/sellers/123/v2/orders');assert.equal(u.searchParams.get('orderNumber'),'ORDER-1');pages.push(u.searchParams.get('page')!);return Response.json({totalPages:2,totalElements:2,page:Number(u.searchParams.get('page')),content:[packageFixture({shipmentPackageId:456+pages.length})]});});
  assert.equal((await p.getOrder(credential,'ORDER-1')).packages.length,2);assert.deepEqual(pages,['0','1']);
  const foreign=provider(async()=>Response.json({totalPages:1,page:0,content:[packageFixture({orderNumber:'OTHER'})]}));await assert.rejects(()=>foreign.getOrder(credential,'ORDER-1'),errorCode('order_evidence_invalid'));
});

test('webhook registration uses API_KEY without provider name in callback and reconciles owned existing callback',async()=>{
  const callback='https://store.example.test/api/hooks/marketplace/store-id';let posts=0;
  const p=provider(async(url,init)=>{assert.equal(new URL(String(url)).pathname,'/integration/webhook/sellers/123/webhooks');if(init?.method==='POST'){posts++;assert.deepEqual(JSON.parse(String(init.body)),{url:callback,authenticationType:'API_KEY',apiKey:'callback-secret-12345678901234567890',subscribedStatuses:[]});return Response.json({id:'hook-1'});}return Response.json([]);});
  await p.registerWebhook(credential,{url:callback,secret:'callback-secret-12345678901234567890'});assert.equal(posts,1);
  await assert.rejects(()=>p.registerWebhook(credential,{url:'https://store.example.test/api/trendyol/hook',secret:'callback-secret-12345678901234567890'}),errorCode('invalid_input'));
});

test('transport retains safe Retry-After classification without response data or blind mutation retries',async()=>{
  let calls=0;
  const p=provider(async()=>{calls++;return Response.json({message:'private-provider-body SECRET_VALUE'},{status:429,headers:{'retry-after':'90'}});});
  await assert.rejects(()=>p.testConnection(credential),(error:any)=>{assert.equal(error.retryAfterSeconds,90);return errorCode('provider_limit')(error);});assert.equal(calls,1);
  const rejected=provider(async()=>Response.json({message:'private-provider-body SECRET_VALUE'},{status:400}));await assert.rejects(()=>rejected.submitInventory(credential,[{barcode:'B',quantity:1,salePriceCents:1}]),errorCode('provider_rejected'));
  const unknown=provider(async()=>{throw Error('private-provider-body SECRET_VALUE');});await assert.rejects(()=>unknown.submitInventory(credential,[{barcode:'B',quantity:1,salePriceCents:1}]),errorCode('provider_outcome_unknown'));
});

test('transport bounds streaming responses and times out through an abort signal',async()=>{
  const p=provider(async()=>new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('x'.repeat(1100)));controller.close();}})),{maxBytes:1024});
  await assert.rejects(()=>p.testConnection(credential),errorCode('provider_limit'));
  const slow=provider(async(_url,init)=>new Promise((_resolve,reject)=>init?.signal?.addEventListener('abort',()=>reject(Error('SECRET_VALUE')))),{timeoutMs:10});
  await assert.rejects(()=>slow.testConnection(credential),errorCode('provider_timeout'));
});

test('verified invoice, package and claim actions target dedicated contracts and accept empty success bodies',async()=>{
  const calls:{path:string;body:any}[]=[];
  const p=provider(async(url,init)=>{calls.push({path:new URL(String(url)).pathname,body:init?.body?JSON.parse(String(init.body)):null});return new Response(null,{status:201});});
  await p.sendInvoice(credential,{packageId:'456',url:'https://store.example.test/invoice.pdf',number:'CBX2026000000001',issuedAt:start});
  await p.updatePackage(credential,{packageId:'456',status:'Picking',lines:[{lineId:'789',quantity:2}]});
  await p.approveClaim(credential,{claimId:'claim-1',itemIds:['claim-item-1']});
  assert.equal(calls[0].path,'/integration/sellers/123/seller-invoice-links');assert.equal(calls[0].body.invoiceDateTime,1790812800000);
  assert.deepEqual(calls[1].body,{lines:[{lineId:789,quantity:2}],params:{},status:'Picking'});
  assert.equal(calls[2].path,'/integration/order/sellers/123/claims/claim-1/items/approve');
  await assert.rejects(()=>p.updatePackage(credential,{packageId:'456',status:'Shipped' as any,lines:[{lineId:'789',quantity:2}]}),errorCode('invalid_input'));
});

test('an existing owned webhook is updated and reactivated without creating or touching unrelated hooks',async()=>{
  const writes:string[]=[],callback='https://store.example.test/api/hooks/marketplace/store-id';
  const p=provider(async(url,init)=>{const path=new URL(String(url)).pathname;if(init?.method==='GET')return Response.json([{id:'foreign',url:'https://other.example.test/hook',authenticationType:'API_KEY',status:'ACTIVE'},{id:'owned',url:callback,authenticationType:'API_KEY',status:'PASSIVE'}]);writes.push(path);return new Response('200 OK');});
  await p.registerWebhook(credential,{url:callback,secret:'callback-secret-12345678901234567890'});
  assert.deepEqual(writes,['/integration/webhook/sellers/123/webhooks/owned','/integration/webhook/sellers/123/webhooks/owned/activate']);
});

test('empty, truncated and changing order snapshots never authorize a complete import',async()=>{
  for(const payload of [{totalPages:0,totalElements:0,page:0,content:[]},{totalPages:51,totalElements:10200,page:0,content:[packageFixture()]},{totalPages:2,totalElements:2,page:0,content:[]}]){
    const p=provider(async()=>Response.json(payload));await assert.rejects(()=>p.getOrder(credential,'ORDER-1'));
  }
});

test('an accepted mutation without a usable batch ID stays outcome unknown',async()=>{
  const p=provider(async()=>Response.json({}));
  await assert.rejects(()=>p.submitInventory(credential,[{barcode:'B',quantity:1,salePriceCents:100}]),errorCode('provider_outcome_unknown'));
  await assert.rejects(()=>p.createProducts(credential,[productFixture()]),errorCode('provider_outcome_unknown'));
});

test('product descriptions retain ordinary line breaks and non-color custom attributes support documented free text',async()=>{
  let sent:any;
  const p=provider(async(_url,init)=>{sent=JSON.parse(String(init?.body));return Response.json({batchRequestId:'batch-1'});});
  await p.createProducts(credential,[{...productFixture(),description:'First line\nSecond line',attributes:[{attributeId:12,attributeValue:'A'.repeat(100)}]}]);
  assert.equal(sent.items[0].description,'First line\nSecond line');assert.equal(sent.items[0].attributes[0].attributeValue.length,100);
});

test('optional package discount is derived from exact line evidence and actual shipping names can supply the buyer name',async()=>{
  const p=provider(async()=>Response.json({hasMore:false,nextCursor:null,content:[packageFixture({packageTotalDiscount:undefined,customerFirstName:undefined,customerLastName:undefined,shipmentAddress:{firstName:'Actual',lastName:'Buyer'}})]}));
  const result=(await p.orderStream(credential,{start,end,cursor:null})).packages[0];
  assert.equal(result.discountCents,1000);assert.equal(result.customer.name,'Actual Buyer');
});

test('product status reads the provider approval separately from accepted batch delivery',async()=>{
  const p=provider(async url=>{assert.equal(new URL(String(url)).pathname,'/integration/product/sellers/123/product/BAR-1');return Response.json({barcode:'BAR-1',approved:false,archived:false,listingId:'listing-1',contentId:22});});
  assert.deepEqual(await p.product(credential,'BAR-1'),{barcode:'BAR-1',approved:false,archived:false,listingId:'listing-1',contentId:'22'});
  const foreign=provider(async()=>Response.json({barcode:'OTHER',approved:true,archived:false}));await assert.rejects(()=>foreign.product(credential,'BAR-1'),errorCode('provider_unavailable'));
});

test('current approved inventory lookup returns exact requested prices for ambiguous-write reconciliation',async()=>{
  const p=provider(async url=>{const u=new URL(String(url));assert.equal(u.pathname,'/integration/product/sellers/123/products/approved/inventory-and-price');assert.deepEqual(u.searchParams.getAll('barcodes'),['BAR-1','BAR-2']);return Response.json({totalPages:1,totalElements:1,page:0,nextPageToken:'sample-token',content:[{contentId:22,variants:[{variantId:33,barcode:'BAR-1',salePrice:228.92,listPrice:228.92,quantity:2,stockLastModifiedDate:null}]}]});});
  assert.deepEqual(await p.getInventory(credential,['BAR-1','BAR-2']),{items:[{barcode:'BAR-1',quantity:2,salePriceCents:22892}]});
  await assert.rejects(()=>p.getInventory(credential,Array.from({length:51},(_,i)=>'BAR-'+i)),errorCode('invalid_input'));
});

test('product absence is distinct from invalid input and authorization failures before any create decision',async()=>{
  const missing=provider(async()=>new Response(null,{status:404}));assert.equal(await missing.productOrNull(credential,'BAR-1'),null);
  const denied=provider(async()=>new Response(null,{status:403}));await assert.rejects(()=>denied.productOrNull(credential,'BAR-1'),(error:any)=>error.httpStatus===403&&errorCode('provider_denied')(error));
  const bad=provider(async()=>new Response(null,{status:400}));await assert.rejects(()=>bad.productOrNull(credential,'BAR-1'),(error:any)=>error.httpStatus===400&&errorCode('provider_rejected')(error));
});

test('mutations with malformed or overlarge successful responses retain unknown outcome',async()=>{
  for(const transport of [async()=>new Response('not json'),async()=>new Response('x'.repeat(1100))] as typeof fetch[]){
    const p=provider(transport,{maxBytes:1024});await assert.rejects(()=>p.submitInventory(credential,[{barcode:'B',quantity:1,salePriceCents:1}]),errorCode('provider_outcome_unknown'));
  }
});
