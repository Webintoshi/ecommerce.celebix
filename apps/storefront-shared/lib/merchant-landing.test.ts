import assert from 'node:assert/strict';
import test from 'node:test';
import {merchantLandingProduct} from './merchant-landing.ts';
const ID='11111111-1111-4111-8111-111111111111',OTHER='22222222-2222-4222-8222-222222222222';
const product:any={id:OTHER,priceCents:100,available:true,media:[{id:'fallback',url:'https://img.test/a.jpg'}],variants:[{id:ID,priceCents:250,available:false,media:[],title:'Mavi / S'},{id:OTHER,priceCents:100,available:true,media:[],title:'Kırmızı / M'}]};
test('merchant landing preserves exact out-of-stock variant and its real price without disabling other variants',()=>{const result=merchantLandingProduct(product,{variant:ID});assert.equal(result.variantId,ID);assert.equal(result.product.priceCents,250);assert.equal(result.product.variants.find(v=>v.id===ID)?.available,false);assert.equal(result.product.available,true);assert.equal(result.product.media,product.media);assert.equal(product.priceCents,100);});
test('ordinary product visits keep existing defaults and unknown/multiple ids fail closed',()=>{assert.equal(merchantLandingProduct(product,{}).product,product);for(const value of ['bad','33333333-3333-4333-8333-333333333333',[ID,OTHER]])assert.throws(()=>merchantLandingProduct(product,{variant:value}),/merchant_variant_invalid/);});
