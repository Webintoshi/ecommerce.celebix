import test from 'node:test';
import assert from 'node:assert/strict';
import { createWhatsAppOrderPreview } from './whatsapp-order-preview.ts';
const id='00000000-0000-4000-8000-000000000001', variantId='00000000-0000-4000-8000-000000000002';
const policy={schemaVersion:1,version:1,enabled:true,hidePrices:true,hideAddToCart:false,checkoutAllowed:false,phone:'+905551112233',messageIntro:'Merhaba'};
const item={id,title:'Kutu',status:'active',slug:'kutu',available:true,priceCents:100,variants:[{id:variantId,title:'Büyük',available:true,stockTracking:true,stockQuantity:3,priceCents:100}]};
const selected=(product:unknown=item)=>({kind:'active',context:{commercePolicy:policy,storefront:{hostname:'shop.example',id:'store',presentation:{displayName:'Mağaza'}},runtime:{content:{resolveProductIds:async()=>[product]},cart:{resolveCart:async()=>({cart:{itemCount:1,items:[{available:true}],totalCents:100}})}}}});
const request=(body:unknown,origin='https://shop.example')=>new Request('https://shop.example/api/whatsapp-order/preview',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
test('fresh selected variant and stock are checked; hidden price is not serialized',async()=>{
 const handler=createWhatsAppOrderPreview({resolve:async()=>selected() as never});
 const response=await handler(request({kind:'product',productId:id,variantId,quantity:2}));
 assert.equal(response.status,200);const result=await response.json();assert.equal(result.product.priceCents,null);assert.equal(result.product.variants[0].priceCents,null);assert.equal(result.quantity,2);
 assert.equal((await handler(request({kind:'product',productId:id,variantId,quantity:4}))).status,409);
 assert.equal((await handler(request({kind:'product',productId:id,variantId:id,quantity:1}))).status,409);
});
test('cross-origin request is rejected before catalog read',async()=>{
 let reads=0;const handler=createWhatsAppOrderPreview({resolve:async()=>{const value=selected();value.context.runtime.content.resolveProductIds=async()=>{reads++;return[item]};return value as never;}});
 assert.equal((await handler(request({kind:'cart'},'https://other.example'))).status,403);assert.equal(reads,0);
});
test('disabled setting, empty cart and unavailable store do not prepare a request',async()=>{
 const disabled=selected();disabled.context.commercePolicy={...policy,enabled:false};
 assert.equal((await createWhatsAppOrderPreview({resolve:async()=>disabled as never})(request({kind:'cart'}))).status,409);
 assert.equal((await createWhatsAppOrderPreview({resolve:async()=>({kind:'unavailable'})})(request({kind:'cart'}))).status,503);
 const empty=selected();empty.context.runtime.cart.resolveCart=async()=>({cart:{itemCount:0,items:[],totalCents:0}});
 assert.equal((await createWhatsAppOrderPreview({resolve:async()=>empty as never})(request({kind:'cart'}))).status,409);
});
test('cart WhatsApp preview refreshes price drift independently of checkout blockers and checks real stock',async()=>{
 const value=selected();
 value.context.runtime.cart.resolveCart=async()=>({cart:{itemCount:2,items:[{productId:id,variantId,quantity:2,available:false,unitPriceCents:40,lineTotalCents:80}],totalCents:80}} as never);
 const handler=createWhatsAppOrderPreview({resolve:async()=>value as never});
 const hidden=await handler(request({kind:'cart'}));assert.equal(hidden.status,200);
 const result=await hidden.json();assert.deepEqual(result.requestLines,[{title:'Kutu',variantTitle:'Büyük',slug:'kutu',quantity:2,unitPriceCents:null,available:true}]);
 assert.equal(result.cart.items[0].unitPriceCents,null);
 value.context.commercePolicy={...policy,hidePrices:false,checkoutAllowed:true};
 const visible=await handler(request({kind:'cart'}));assert.equal(visible.status,200);assert.equal((await visible.json()).requestLines[0].unitPriceCents,100);
 value.context.runtime.content.resolveProductIds=async()=>[{...item,variants:[{...item.variants[0],stockQuantity:1}]}];
 assert.equal((await handler(request({kind:'cart'}))).status,409);
 value.context.runtime.content.resolveProductIds=async()=>[];
 assert.equal((await handler(request({kind:'cart'}))).status,409);
});
