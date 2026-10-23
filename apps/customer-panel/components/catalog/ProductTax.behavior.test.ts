import assert from 'node:assert/strict';
import test from 'node:test';
import {act,createElement} from 'react';
import {compile,mounted,input,click} from '../../lib/mira-final-test-support.ts';
import {createEmptyProductDraftSession,updateProductDraft} from '../../lib/catalog-ui/product-draft-session.ts';
const category='11111111-1111-4111-8111-111111111111';
const options={categories:[{id:category,name:'Kategori',slug:'kategori',position:0}],resources:[],locations:[],channels:[]};
async function select(host:any,window:any,label:string,value:string){const field=host.querySelector(`select[aria-label="${label}"]`);assert.ok(field,label);await act(async()=>{field.value=value;field.dispatchEvent(new window.Event('change',{bubbles:true}));});}
test('new quick product requires an explicit VAT choice and preserves it after failed save',async()=>{
 const calls:any[]=[];const Component=compile('components/catalog-onboarding/ProductQuickCreateDialog.tsx',{
  '@/components/catalog/SkuInput':{SkuInput:()=>null},'@/components/catalog/BarcodeInput':{BarcodeInput:()=>null},'@/components/catalog/ProductMeasurementFields':{ProductMeasurementFields:()=>null},
 }).ProductQuickCreateDialog;
 await mounted(Component,{open:true,mode:'page',options,onClose(){},onAdvanced(){},onCreated(){},api:{createProduct:async(body:any)=>{calls.push(body);throw new Error('unavailable');}}},async(host,window)=>{
  const title=host.querySelector('input[name="title"]'),price=host.querySelector('input[name="price"]');await input(window,title,'Kupa');await input(window,price,'100,00');
  const categoryField=host.querySelector('select[name="categoryId"]');await act(async()=>{categoryField.value=category;categoryField.dispatchEvent(new window.Event('change',{bubbles:true}));});
  const submit=async()=>{await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));};
  await submit();assert.equal(calls.length,0,'VAT must be chosen before new product creation');
  await select(host,window,'KDV oranı','2000');await select(host,window,'Fiyat girişi','excluded');assert.match(host.textContent,/120,00/);await submit();
  assert.equal(calls.length,1);assert.deepEqual(calls[0].tax,{treatment:'taxable',rateBps:2000});assert.equal(calls[0].priceCents,12000);assert.equal(host.querySelector('select[aria-label="KDV oranı"]').value,'2000');assert.equal(price.value,'100,00');
 });
});
test('variant VAT defaults to product inheritance and offers explicit zero or exemption',async()=>{
 let current='';const {ProductTaxFields}=compile('components/catalog/ProductTaxFields.tsx');
 function View(){const [value,setValue]=requireReact.useState('');return createElement(ProductTaxFields,{value,onChange:(value:string)=>{current=value;setValue(value);},variant:true,productTax:{treatment:'taxable',rateBps:2000}});}
 const requireReact=await import('react');
 await mounted(View,{},async(host,window)=>{assert.match(host.textContent,/Üründen kullan.*%20/);assert.equal(current,'');await select(host,window,'KDV oranı','0');assert.equal(current,'0');await select(host,window,'KDV oranı','exempt');assert.equal(current,'exempt');});
});
test('detailed create sends one explicit product VAT and inherited variant without changing gross or cost',async()=>{
 const calls:any[]=[];const session=createEmptyProductDraftSession();const draft=updateProductDraft(session,{title:'Kupa',categoryIds:[category],variants:[{...session.current.variants[0]!,price:'100,00',cost:'40,00',stockQuantity:'2'}]});
 const Component=compile('components/catalog-onboarding/ProductAdvancedEditor.tsx',{
  '@/components/catalog/SkuInput':{SkuInput:()=>null},'@/components/catalog/BarcodeInput':{BarcodeInput:()=>null},'@/components/catalog/ProductMeasurementFields':{ProductMeasurementFields:()=>null},
  '@/components/catalog/ProductDescriptionField':{ProductDescriptionField:()=>createElement('textarea',{name:'description'})},
  './ProductClassificationPicker':{ProductClassificationPicker:({name,selected}:any)=>createElement('div',null,...selected.map((value:string)=>createElement('input',{key:value,type:'hidden',name,value})))},
 }).ProductAdvancedEditor;
 await mounted(Component,{options,draftSession:draft,onCancel(){},onCreated(){},api:{createProduct:async(body:any)=>{calls.push(body);throw new Error('unavailable');}}},async(host,window)=>{
  const submit=async()=>{await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));};
  await submit();assert.equal(calls.length,0);await select(host,window,'KDV oranı','1000');await submit();assert.equal(calls.length,1);assert.deepEqual(calls[0].tax,{treatment:'taxable',rateBps:1000});assert.equal(calls[0].variants[0].tax,null);assert.equal(calls[0].variants[0].priceCents,10000);assert.equal(calls[0].variants[0].costCents,4000);
 });
});
const productId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',variantId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
async function existing(verify:(host:any,window:any,calls:any[],releaseTax:()=>void)=>Promise<void>,tax:any=null,opts:{delayTax?:boolean;variantTax?:any}={}){
 const calls:any[]=[];const product={id:productId,storeId:category,slug:'kupa',title:'Kupa',status:'active',currency:'TRY',version:3,createdAt:'2026-10-23T00:00:00Z',updatedAt:'2026-10-23T00:00:00Z'};
 const variant={id:variantId,productId,storeId:category,title:'M',priceCents:10000,costCents:4000,sku:'SKU-1',attributes:{},stockTracking:true,stockQuantity:2,status:'active',version:2,createdAt:product.createdAt,updatedAt:product.updatedAt};
 const dto=()=>({productId,productVersion:product.version,tax,variants:[{variantId,variantVersion:variant.version,tax:opts.variantTax??null,effectiveTax:opts.variantTax??tax,taxSource:opts.variantTax?'variant':tax?'product':'unknown'}]});
 let releaseTax=()=>{};const ready=opts.delayTax?new Promise<void>(resolve=>{releaseTax=resolve;}):Promise.resolve();
 const api={getProduct:async()=>({product,variants:[variant]}),getProductTax:async()=>{await ready;return dto();},updateProduct:async(_id:string,body:any)=>{calls.push(body);if(body.product.tax)tax=body.product.tax;return{product:{...product,...body.product,version:4}};},updateVariant:async(_id:string,_variant:string,body:any)=>{calls.push(body);return{variant:{...variant,...body.variant,version:3}};}};
 const Component=compile('components/catalog/ProductDetailConsole.tsx',{
  '@/lib/catalog-ui/client':{catalogApi:api,CatalogApiError:Error},'@/lib/catalog-onboarding-ui/client':{CatalogOnboardingApiError:Error,catalogOnboardingClient:{getOptions:async()=>options,getProductEditor:async()=>({product,variants:[],profile:{version:1,productType:'physical',minimumPurchaseQuantity:1},categoryIds:[category],channelIds:[],resourceIds:{collections:[],tags:[],attributes:[],extras:[],definitions:[]}})}},
  '@/components/catalog-onboarding/ProductAdvancedEditor':{ProductAdvancedEditor:()=>null},'@/components/panel/PanelTopbarChrome':{usePanelTopbarChrome(){}},
  './ProductDescriptionField':{ProductDescriptionField:()=>createElement('textarea',{name:'description'}),ProductDescriptionPreview:()=>null},'./ProductMediaManager':{ProductMediaManager:()=>null},'./ProductVariantGalleryEditor':{ProductVariantGalleryEditor:({children}:any)=>children({thumbnail:()=>null})},
  '@/components/catalog/SkuInput':{SkuInput:({value,name}:any)=>createElement('input',{name,defaultValue:value})},'@/components/catalog/BarcodeInput':{BarcodeInput:({name,defaultValue}:any)=>createElement('input',{name,defaultValue})},'./ProductMeasurementFields':{ProductMeasurementFields:()=>null},
 }).ProductDetailConsole;
 await mounted(Component,{productId,canManage:true},async(host,window)=>verify(host,window,calls,releaseTax));
}
test('existing unknown VAT stays unspecified on an ordinary product edit and rate-only edit preserves selling amount',async()=>{
 await existing(async(host,window,calls)=>{
  assert.equal(host.querySelector('select[aria-label="Ürün KDV oranı"]').value,'');await input(window,host.querySelector('input[name="title"]'),'Kupa yeni');await click(host,'Bilgileri kaydet');assert.equal(Object.hasOwn(calls[0].product,'tax'),false);
  await select(host,window,'Ürün KDV oranı','2000');await click(host,'Bilgileri kaydet');assert.deepEqual(calls[1].product.tax,{treatment:'taxable',rateBps:2000});assert.match(host.textContent,/100,00/);assert.equal(Object.hasOwn(calls[1].product,'priceCents'),false);
 });
});
test('existing variant inherits product VAT until explicit override and tax edit leaves gross and cost unchanged',async()=>{
 await existing(async(host,window,calls)=>{
  await click(host,'M varyantını düzenle');const field=host.querySelector('select[aria-label="Varyant KDV oranı"]');assert.equal(field.value,'');assert.match(field.textContent,/Üründen kullan.*%20/);
  await select(host,window,'Varyant KDV oranı','0');await click(host,'Varyantı kaydet');assert.deepEqual(calls[0].variant.tax,{treatment:'taxable',rateBps:0});assert.equal(calls[0].variant.priceCents,10000);assert.equal(calls[0].variant.costCents,4000);
 },{treatment:'taxable',rateBps:2000});
});

test('variant opened before VAT read resolves retains its explicit override and entered price',async()=>{
 await existing(async(host,window,calls,releaseTax)=>{
  await click(host,'M varyantını düzenle');await input(window,host.querySelector('input[name="price"]'),'105,00');
  await act(async()=>{releaseTax();});
  assert.equal(host.querySelector('select[aria-label="Varyant KDV oranı"]').value,'0');
  assert.equal(host.querySelector('input[name="price"]').value,'105,00');
  await click(host,'Varyantı kaydet');assert.deepEqual(calls[0].variant.tax,{treatment:'taxable',rateBps:0});assert.equal(calls[0].variant.priceCents,10500);
 },{treatment:'taxable',rateBps:2000},{delayTax:true,variantTax:{treatment:'taxable',rateBps:0}});
});
test('invalid custom variant VAT opens its detail group and never shows an invented final charge',async()=>{
 const {ProductVariantBuilder}=compile('components/catalog-onboarding/ProductVariantBuilder.tsx',{'@/components/catalog/SkuInput':{SkuInput:()=>null},'@/components/catalog/BarcodeInput':{BarcodeInput:()=>null},'@/components/catalog/ProductMeasurementFields':{ProductMeasurementFields:()=>null}});
 const row={...createEmptyProductDraftSession().current.variants[0]!,title:'M',price:'100,00',taxChoice:'custom:',priceBasis:'excluded'};
 await mounted(ProductVariantBuilder,{variants:[row],onChange(){},productTax:{treatment:'taxable',rateBps:2000},allowMultiple:true,presentation:'create',showValidation:true},async(host)=>{
  assert.equal(host.querySelector('details').open,true);
  assert.match(host.textContent,/Toplam için KDV seçin/);
  assert.doesNotMatch(host.textContent,/120,00/);
  assert.match(host.textContent,/Girilen maliyete KDV eklenmez/);
 });
});
