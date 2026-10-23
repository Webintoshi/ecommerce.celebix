import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import test from 'node:test';
import {act} from 'react';
import {compile,mounted,click,input} from '../../lib/mira-final-test-support.ts';
const productId='f6d8029d-5456-4e82-85cf-e877d9bdaaa4',variantId='947b39e9-f3f1-4a96-a101-4b4c46c1c383';
const pricing={commissionBps:1700,commissionVatIncluded:true,commissionVatBps:2000,averageShippingCents:9000,otherFeeCents:0,productVatBps:2000,withholdingBps:100,coverWithholding:false,rounding:'cent'};
const overview={connection:{connected:true,sellerId:'123456',status:'connected',version:2,settingsVersion:7,lastOrdersAt:null,lastErrorCode:null},pricing,counts:{mapped:1,pending:1,failed:0},webhookUrl:null};
const product={productId,variantId,title:'Pamuk gömlek',sku:'GOM-M',barcode:'GOM-M',webPriceCents:10000,quantity:3,mapping:null,status:'submitted',issue:null,updatedAt:'2026-10-23T00:00:00Z'};
function component(client:Record<string,unknown>){assert.ok(existsSync(new URL('./TrendyolConsole.tsx',import.meta.url)),'Native Trendyol screen is missing');return compile('components/trendyol/TrendyolConsole.tsx',{'@/lib/trendyol-ui/client':{trendyolClient:client}}).TrendyolConsole;}
const base={overview:async()=>overview,products:async()=>({items:[product],nextCursor:null}),orderIssues:async()=>({items:[]}),options:async()=>({items:[]})};
function field(host:HTMLElement,label:string){const result=host.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`);assert.ok(result,label);return result;}
test('action-required imports show order number and recovery without exposing other orders, then refresh explicitly',async()=>{
 let reads=0;const Component=component({...base,orderIssues:async()=>({items:++reads===1?[{orderId:null,externalOrderId:'EXT-1',orderNumber:'BEKLEYEN-123',state:'action_required',issue:'mapping_required'},{orderId:productId,externalOrderId:'EXT-2',orderNumber:'ALINMIS-456',state:'imported',issue:null}]:[]})});
 await mounted(Component,{canManage:false},async(host:HTMLElement)=>{
  const issues=host.querySelector('[aria-label="Trendyol sipariş aktarım sorunları"]');assert.ok(issues);assert.match(issues.textContent??'',/BEKLEYEN-123/);assert.match(issues.textContent??'',/eşleme/i);assert.doesNotMatch(host.textContent??'',/ALINMIS-456|EXT-1/);assert.equal(reads,1);
  await click(host,'Durumu yenile');assert.equal(reads,2);assert.equal(host.querySelector('[aria-label="Trendyol sipariş aktarım sorunları"]'),null);
 });
});
test('optional order issue read failure keeps main connection, products and pricing usable',async()=>{
 const Component=component({...base,orderIssues:async()=>{throw {code:'unavailable'};}});
 await mounted(Component,{canManage:false},async(host:HTMLElement)=>{
  assert.match(host.textContent??'',/Pamuk gömlek/);assert.match(host.textContent??'',/228,92/);assert.match(host.textContent??'',/Sipariş aktarım ayrıntıları yüklenemedi/);assert.doesNotMatch(host.textContent??'',/Trendyol bilgileri yüklenemedi/);
 });
});
test('read-only view shows honest provider state and protected pricing without mutation controls',async()=>{
 const Component=component(base);await mounted(Component,{canManage:false},async(host:HTMLElement)=>{
  assert.match(host.textContent??'',/Trendyol’a gönderildi/);assert.equal(host.querySelectorAll('input').length,0);
  assert.match(host.textContent??'',/228,92/);assert.equal(host.querySelector('[data-trendyol-map]'),null);
  assert.ok(host.querySelector(`a[href="/products/${productId}"]`));assert.ok(host.querySelector('a[href="/orders"]'));
 });
});
test('connection unknown result freezes preserved credentials and reuses the same operation',async()=>{
 const calls:any[]=[];const Component=component({...base,overview:async()=>({...overview,connection:{...overview.connection,connected:false,status:'disconnected',sellerId:null,version:0,settingsVersion:0}}),connect:async(body:unknown,key:string)=>{calls.push({body,key});if(calls.length===1)throw {code:'commit_unknown'};return {saved:true,replayed:true};}});
 await mounted(Component,{canManage:true},async(host:HTMLElement,window)=>{
  await input(window,field(host,'Satıcı ID'),'123456');await input(window,field(host,'API anahtarı'),'fixture-key');await input(window,field(host,'API sırrı'),'fixture-secret');
  await click(host,'Bağlan');assert.equal(field(host,'API sırrı').value,'fixture-secret');assert.equal(field(host,'API sırrı').disabled,true);
  assert.equal(window.localStorage.length,0);assert.equal(window.sessionStorage.length,0);
  await click(host,'Bağlantıyı tekrar dene');assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);assert.deepEqual(calls[0].body,calls[1].body);assert.equal(calls[0].body.expectedVersion,0);
 });
});
test('pricing save uses store values directly and retries without clearing or changing the command',async()=>{
 const calls:any[]=[];const Component=component({...base,settings:async(body:unknown,key:string)=>{calls.push({body,key});if(calls.length===1)throw {code:'unavailable'};return {saved:true,replayed:true};}});
 await mounted(Component,{canManage:true},async(host:HTMLElement,window)=>{
  await input(window,field(host,'Komisyon (%)'),'12');await input(window,field(host,'Ortalama kargo (TL)'),'90');await click(host,'Fiyat ayarlarını kaydet');
  assert.equal(field(host,'Komisyon (%)').value,'12');assert.equal(field(host,'Komisyon (%)').disabled,true);
  await click(host,'Fiyat kaydını tekrar dene');assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);assert.deepEqual(calls[0].body,{expectedVersion:7,pricing:{...pricing,commissionBps:1200}});assert.deepEqual(calls[0].body,calls[1].body);
 });
});
test('existing listing mapping applies immediately without requiring create-only category fields',async()=>{
 const calls:any[]=[];const Component=component({...base,map:async(body:unknown,key:string)=>{calls.push({body,key});return {saved:true,replayed:false};}});
 await mounted(Component,{canManage:true},async(host:HTMLElement,window)=>{
  await click(host,'Pamuk gömlek Trendyol eşlemesini düzenle');await input(window,field(host,'Trendyol barkodu'),'EXIST-1');await click(host,'Eşlemeyi kaydet');
  assert.equal(calls.length,1);assert.equal(calls[0].body.mode,'existing');assert.equal(calls[0].body.barcode,'EXIST-1');assert.equal(calls[0].body.variantId,variantId);assert.equal(calls[0].body.categoryId,null);
  await act(async()=>{});assert.match(host.textContent??'',/Eşleme kaydedildi/);
 });
});

test('uncertain mapping cannot be closed and discarded before retrying the same operation',async()=>{
 const calls:any[]=[];const Component=component({...base,map:async(body:unknown,key:string)=>{calls.push({body,key});if(calls.length===1)throw {code:'commit_unknown'};return {saved:true,replayed:true};}});
 await mounted(Component,{canManage:true},async(host:HTMLElement,window)=>{
  await click(host,'Pamuk gömlek Trendyol eşlemesini düzenle');await input(window,field(host,'Trendyol barkodu'),'KEEP-1');await click(host,'Eşlemeyi kaydet');
  await click(host,'Kapat');assert.ok(host.querySelector('form[id="trendyol-mapping-form"]'),'pending operation must survive closing attempt');assert.equal(field(host,'Trendyol barkodu').disabled,true);
  await click(host,'Eşlemeyi tekrar dene');assert.equal(calls.length,2);assert.equal(calls[0].key,calls[1].key);assert.deepEqual(calls[0].body,calls[1].body);
 });
});
async function select(window:any,host:HTMLElement,label:string,value:string){const field=host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);assert.ok(field,label);await act(async()=>{field.value=value;field.dispatchEvent(new window.Event('change',{bubbles:true}));});}
test('new listing sends selected category, brand, cargo code and provider-required attribute values',async()=>{
 const calls:any[]=[];const Component=component({...base,options:async(query:any)=>({items:query.kind==='categories'?[{id:42,name:'Gömlek'}]:query.kind==='brands'?[{id:5,name:'Marka'}]:query.kind==='cargo'?[{id:'YKMP',name:'Yurtiçi Kargo'}]:[{id:100,name:'Materyal',required:true,allowCustom:false,values:[{id:7,name:'Pamuk'}]}]}),map:async(body:unknown,key:string)=>{calls.push({body,key});return {saved:true,replayed:false};}});
 await mounted(Component,{canManage:true},async(host:HTMLElement,window)=>{
  await click(host,'Pamuk gömlek Trendyol eşlemesini düzenle');const mode=host.querySelector<HTMLInputElement>('input[name="listingMode"]:not(:checked)');assert.ok(mode);await act(async()=>mode.click());
  await select(window,host,'Kategori','42');await select(window,host,'Marka','5');await select(window,host,'Kargo firması','YKMP');
  await click(host,'Eşlemeyi kaydet');assert.equal(calls.length,0,'required provider attribute prevents premature submission');
  await select(window,host,'Materyal','7');await click(host,'Eşlemeyi kaydet');assert.equal(calls.length,1);assert.equal(calls[0].body.mode,'create');assert.equal(calls[0].body.categoryId,42);assert.equal(calls[0].body.brandId,5);assert.equal(calls[0].body.cargoProviderCode,'YKMP');assert.deepEqual(calls[0].body.attributes,[{attributeId:100,valueId:7}]);
 });
});
test('non-custom provider attributes never render a free-form value that the provider forbids',async()=>{
 const Component=component({...base,options:async(query:any)=>({items:query.kind==='attributes'?[{id:100,name:'Materyal',required:true,allowCustom:false,values:[]}]:[{id:42,name:'Kategori'}]})});
 await mounted(Component,{canManage:true},async(host:HTMLElement,window)=>{
  await click(host,'Pamuk gömlek Trendyol eşlemesini düzenle');const mode=host.querySelector<HTMLInputElement>('input[name="listingMode"]:not(:checked)');assert.ok(mode);await act(async()=>mode.click());await select(window,host,'Kategori','42');
  assert.ok(!host.querySelector('input[aria-label="Materyal"]'),'provider-forbidden custom field must not render');assert.match(host.textContent??'',/seçilebilir değer/i);
 });
});
test('settings version conflict preserves edits and asks the next explicit save to use refreshed authority',async()=>{
 const calls:any[]=[];let reads=0;const Component=component({...base,overview:async()=>({...overview,connection:{...overview.connection,settingsVersion:reads++?9:7}}),settings:async(body:unknown,key:string)=>{calls.push({body,key});if(calls.length===1)throw {code:'version_conflict'};return {saved:true,replayed:false};}});
 await mounted(Component,{canManage:true},async(host:HTMLElement,window)=>{
  await input(window,field(host,'Komisyon (%)'),'12');await click(host,'Fiyat ayarlarını kaydet');assert.equal(calls.length,1);assert.equal(field(host,'Komisyon (%)').value,'12');assert.equal(field(host,'Komisyon (%)').disabled,false);
  await click(host,'Fiyat ayarlarını kaydet');assert.equal(calls[1].body.expectedVersion,9);assert.equal(calls[1].body.pricing.commissionBps,1200);assert.notEqual(calls[0].key,calls[1].key);
 });
});

test('mapped product and editing preview use listing VAT for withholding coverage while the global example retains store VAT',async()=>{
 const mapping={variantId,barcode:'VAT-0',categoryId:null,brandId:null,vatRate:0,dimensionalWeight:1,cargoProviderCode:null,attributes:[],enabled:true,mode:'existing'};
 const Component=component({...base,overview:async()=>({...overview,pricing:{...pricing,coverWithholding:true}}),products:async()=>({items:[{...product,mapping}],nextCursor:null})});
 await mounted(Component,{canManage:true},async(host:HTMLElement,window)=>{
  assert.match(host.querySelector('tbody')?.textContent??'',/231,71/,'0% listing VAT gives a full 1% withholding base');
  assert.match(host.querySelector('[aria-label="Örnek fiyat hesaplaması"]')?.textContent??'',/231,24/,'global example retains the store VAT assumption');
  await click(host,'Pamuk gömlek Trendyol eşlemesini düzenle');assert.match(host.querySelector('#trendyol-mapping-form')?.textContent??'',/231,71/);
  await input(window,field(host,'Ürün KDV oranı (%)'),'20');assert.match(host.querySelector('#trendyol-mapping-form')?.textContent??'',/231,24/);
 });
});

test('new listing custom attributes reject more than the provider fifty-character limit before saving',async()=>{
 const calls:any[]=[];const Component=component({...base,options:async(query:any)=>({items:query.kind==='attributes'?[{id:100,name:'Renk',required:true,allowCustom:true,values:[]}]:query.kind==='cargo'?[{id:'YKMP',name:'Yurtiçi Kargo'}]:[{id:42,name:'Seçim'}]}),map:async(body:unknown,key:string)=>{calls.push({body,key});return {saved:true,replayed:false};}});
 await mounted(Component,{canManage:true},async(host:HTMLElement,window)=>{
  await click(host,'Pamuk gömlek Trendyol eşlemesini düzenle');const mode=host.querySelector<HTMLInputElement>('input[name="listingMode"]:not(:checked)');assert.ok(mode);await act(async()=>mode.click());
  await select(window,host,'Kategori','42');await select(window,host,'Marka','42');await select(window,host,'Kargo firması','YKMP');
  await input(window,field(host,'Renk'),'A'.repeat(51));await click(host,'Eşlemeyi kaydet');assert.equal(calls.length,0,'overlong custom value must not reach provider');
  assert.equal(field(host,'Renk').maxLength,50);await input(window,field(host,'Renk'),'A'.repeat(50));await click(host,'Eşlemeyi kaydet');assert.equal(calls.length,1);assert.deepEqual(calls[0].body.attributes,[{attributeId:100,value:'A'.repeat(50)}]);
 });
});
