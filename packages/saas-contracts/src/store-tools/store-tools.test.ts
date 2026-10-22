import assert from 'node:assert/strict';
import test from 'node:test';
import {STORE_TOOL_OFFERS, parseStoreToolPurchaseIntent, parseStoreToolPurchase, parseStoreToolWorkspace, hasStoreToolLicense} from './index.ts';
test('one-time offers freeze approved prices, tax and bundle saving',()=>{
 assert.deepEqual(STORE_TOOL_OFFERS.map(o=>[o.id,o.netCents]),[['contact_widget',99000],['whatsapp_ordering',249000],['cart_capture',349000],['restock',449000],['order_bump',599000],['all_tools',1399000]]);
 assert.equal(STORE_TOOL_OFFERS.slice(0,5).reduce((sum,o)=>sum+o.netCents,0)-STORE_TOOL_OFFERS[5]!.netCents,346000);
 for(const o of STORE_TOOL_OFFERS){assert.equal(o.totalCents,o.netCents+o.vatCents);assert.equal(o.vatCents,o.netCents/5);assert.equal(o.vatBps,2000);assert.equal(o.quoteFingerprint.length,64);assert.ok(Object.isFrozen(o));}
});
test('browser cannot submit paid, price or grant fields',()=>{
 const intent={operationId:'00000000-0000-4000-8000-000000000001',offerId:'all_tools',quoteFingerprint:STORE_TOOL_OFFERS[5]!.quoteFingerprint};
 assert.deepEqual(parseStoreToolPurchaseIntent(intent),intent);
 for(const extra of [{paid:true},{netCents:1},{toolKeys:['restock']},{storeId:intent.operationId}])assert.throws(()=>parseStoreToolPurchaseIntent({...intent,...extra}));
});
test('purchase receipt must match frozen total and settlement state',()=>{
 const o=STORE_TOOL_OFFERS[0]!;const p={id:'00000000-0000-4000-8000-000000000001',storeId:'00000000-0000-4000-8000-000000000002',storeName:'Fixture',offerId:o.id,offerName:o.name,status:'pending',version:1,createdAt:'2026-10-22T00:00:00.000Z',netCents:o.netCents,vatBps:o.vatBps,vatCents:o.vatCents,totalCents:o.totalCents,currency:'TRY',toolKeys:o.toolKeys,settledAt:null,receipt:null};
 assert.equal(parseStoreToolPurchase(p).status,'pending');
 assert.throws(()=>parseStoreToolPurchase({...p,status:'settled'}));
 assert.throws(()=>parseStoreToolPurchase({...p,status:'settled',settledAt:p.createdAt,receipt:{method:'cash',reference:'fixture',amountCents:1}}));
 assert.equal(parseStoreToolPurchase({...p,status:'settled',settledAt:p.createdAt,receipt:{method:'cash',reference:'fixture',amountCents:p.totalCents}}).status,'settled');
});
test('tool rights are store-bound projected rights without plan inheritance or expiry',()=>{
 const w=parseStoreToolWorkspace({storeId:'00000000-0000-4000-8000-000000000001',timezone:'Europe/Istanbul',offers:STORE_TOOL_OFFERS,licenses:[{toolKey:'restock',source:'grandfathered',grantedAt:'2026-10-22T00:00:00.000Z'}],purchases:[],canRequestPurchase:true});
 assert.equal(hasStoreToolLicense(w,'restock'),true);assert.equal(hasStoreToolLicense(w,'order_bump'),false);
 assert.throws(()=>parseStoreToolWorkspace({...w,licenses:[...w.licenses,...w.licenses]}));
});
