import assert from 'node:assert/strict';
import test from 'node:test';
import {googleMerchantGtinValid,parseGoogleMerchantAttributes,parseGoogleMerchantProduct,parseGoogleMerchantProducts} from './index.ts';
import * as merchant from './index.ts';
const id='11111111-1111-4111-8111-111111111111';
test('manufacturer GTIN accepts checksum-valid codes and rejects store-only, corrupt and fabricated zeros',()=>{assert.equal(googleMerchantGtinValid('4006381333931'),true);assert.equal(googleMerchantGtinValid('4006381333932'),false);assert.equal(googleMerchantGtinValid('9800000000004'),false);assert.equal(googleMerchantGtinValid('0000000000000'),false);assert.throws(()=>parseGoogleMerchantAttributes({gtin:'9800000000004'}));assert.throws(()=>parseGoogleMerchantAttributes({gtin:'4006381333931',identifierExists:false}));assert.deepEqual(parseGoogleMerchantAttributes({identifierExists:false}),{identifierExists:false});});
test('product prefs and panel projections reject hidden credentials and cross-contract pollution',()=>{assert.throws(()=>parseGoogleMerchantAttributes({credential:'secret'}));assert.throws(()=>parseGoogleMerchantAttributes({mpn:'<script>'}));const row={productId:id,variantId:id,title:'Gerçek ürün',sku:null,productUrl:`https://example.com/urun/ring?variant=${id}`,status:'limited',enabled:true,attributes:{color:'Mavi',size:'M'},issues:[{code:'color_missing',message:'Renk ekleyin.'}],priceCents:1000,lastSubmittedAt:null,updatedAt:'2026-10-14T12:00:00Z'};assert.equal(parseGoogleMerchantProduct(row).status,'limited');assert.throws(()=>parseGoogleMerchantProduct({...row,credential:'secret'}));assert.throws(()=>parseGoogleMerchantProducts({items:[row],nextCursor:'other-tenant'}));});
test('identity declarations require a real named own brand and reject hidden or contradictory fields',()=>{
 const parse=(merchant as any).parseGoogleMerchantIdentityProfile;assert.equal(typeof parse,'function');
 assert.deepEqual(parse({ownBrand:false,brandName:null,version:0}),{ownBrand:false,brandName:null,version:0});
 assert.deepEqual(parse({ownBrand:true,brandName:'Atölye',version:2}),{ownBrand:true,brandName:'Atölye',version:2});
 for(const value of [{ownBrand:true,brandName:null,version:1},{ownBrand:false,brandName:'Other',version:0},{ownBrand:true,brandName:'<script>',version:1},{ownBrand:true,brandName:'Brand',version:-1},{ownBrand:false,brandName:null,version:0,credential:'secret'}])assert.throws(()=>parse(value));
});
test('checksum-valid restricted and coupon GTIN ranges are rejected including the 14-digit zero-padded representation',()=>{
 function gtin(prefix:string){const base=prefix.padEnd(12,'0');let sum=0;for(let i=base.length-1,weight=3;i>=0;i--,weight=weight===3?1:3)sum+=Number(base[i])*weight;return base+String((10-sum%10)%10);}
 for(const prefix of ['02','04','05','2','98','99']){const value=gtin(prefix);assert.equal(googleMerchantGtinValid(value),false);assert.equal(googleMerchantGtinValid('0'+value),false);}
 assert.equal(googleMerchantGtinValid('4006381333931'),true);assert.equal(googleMerchantGtinValid('04006381333931'),true);
});
