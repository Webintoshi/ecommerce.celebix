import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePricedPublicCart } from './priced.ts';
const cart={version:0,currency:'TRY',itemCount:0,subtotalCents:0,shippingCents:0,totalCents:0,checkoutReady:false,checkoutBlocker:'empty_cart',items:[]};
test('authoritative checkout reader accepts numeric money and rejects public hidden projection',()=>{
 assert.equal(parsePricedPublicCart(cart).totalCents,0);
 assert.throws(()=>parsePricedPublicCart({...cart,pricesHidden:true,subtotalCents:null,shippingCents:null,totalCents:null}),/priced_storefront_required/);
});
