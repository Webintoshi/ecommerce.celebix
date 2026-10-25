import assert from 'node:assert/strict';
import test from 'node:test';
import React,{act,createElement}from'react';
import{Window}from'happy-dom';
import{compile}from'../../lib/mira-final-test-support.ts';
import{CatalogApiError}from'../../lib/catalog-ui/client.ts';
import{dragCatalogItem,installCatalogSortRects}from'./catalog-sort-test-utils.ts';
const p='11111111-1111-4111-8111-111111111111',a='22222222-2222-4222-8222-222222222222',b='33333333-3333-4333-8333-333333333333';
const variants=[a,b].map((id,index)=>({id,productId:p,storeId:p,title:index?'Mavi':'Kırmızı',priceCents:100,stockTracking:true,stockQuantity:3,status:'active',attributes:{},version:1,createdAt:'2026-10-24T00:00:00Z',updatedAt:'2026-10-24T00:00:00Z'}));
async function fixture(run:(h:{host:HTMLElement;browser:Window;requests:any[];fail(code:string):void;finish():void;replay(ids:string[]):void;delayReads():void;resolveRead(index:number):void;reads:any[]})=>Promise<void>){
 const browser=new Window({url:'https://panel.example.test/products/'+p});const prior=new Map<string,PropertyDescriptor|undefined>();
 for(const[key,value]of Object.entries({window:browser,document:browser.document,navigator:browser.navigator,HTMLElement:browser.HTMLElement,HTMLInputElement:browser.HTMLInputElement,HTMLButtonElement:browser.HTMLButtonElement,Element:browser.Element,Node:browser.Node,Document:browser.Document,MouseEvent:browser.MouseEvent,KeyboardEvent:browser.KeyboardEvent,Event:browser.Event,FormData:browser.FormData,MutationObserver:browser.MutationObserver,ResizeObserver:browser.ResizeObserver,getComputedStyle:browser.getComputedStyle.bind(browser),requestAnimationFrame:browser.requestAnimationFrame.bind(browser),cancelAnimationFrame:browser.cancelAnimationFrame.bind(browser),IS_REACT_ACT_ENVIRONMENT:true})){prior.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{configurable:true,writable:true,value});}
 const requests:any[]=[];let fail='',finish:()=>void=()=>{},version=0,ids=[a,b],replayIds:string[]|null=null,delayReads=false;const reads:{snapshot:any;resolve(value:any):void}[]=[];let currentVariants=[...variants];
 const product={id:p,title:'Ürün',slug:'urun',status:'active',currency:'TRY',version:1,updatedAt:'2026-10-24T00:00:00Z'};
 const api={getProduct:async()=>({product,variants:currentVariants}),getProductTax:async()=>({productId:p,tax:null,variants:[]}),getVariantOrder:async()=>{const snapshot={productId:p,version,orderedVariantIds:[...ids]};if(delayReads)return new Promise<any>(resolve=>reads.push({snapshot,resolve}));return snapshot;},createVariant:async(_productId:string,input:any)=>{const id=currentVariants.length===2?'44444444-4444-4444-8444-444444444444':'55555555-5555-4555-8555-555555555555';const variant={...variants[0],...input.variant,id};currentVariants=[...currentVariants,variant];ids=[...ids,id];return{variant,replayed:false};},reorderVariants:async(_id:string,intent:any)=>{requests.push(intent);if(fail){const code=fail;fail='';if(code==='version_conflict'){ids=[a,b];version++;}throw new CatalogApiError(code as any,409);}await new Promise<void>(resolve=>{finish=resolve;});if(replayIds){ids=[...replayIds];version=intent.expectedVersion+2;return{productId:p,version:intent.expectedVersion+1,orderedVariantIds:[...intent.orderedVariantIds],replayed:true};}ids=[...intent.orderedVariantIds];version++;return{productId:p,version,orderedVariantIds:ids,replayed:false};}};
 const empty=()=>null,field=(props:any)=>createElement('input',{name:props.name,defaultValue:props.value??props.defaultValue});
 const {ProductDetailConsole}=compile('components/catalog/ProductDetailConsole.tsx',{
 '@/lib/catalog-ui/client':{catalogApi:api,CatalogApiError},'@/lib/catalog-admin-ui/client':{catalogAdminApi:{resources:async()=>[]}},
 '@/lib/catalog-onboarding-ui/client':{CatalogOnboardingApiError:Error,catalogOnboardingClient:{getOptions:async()=>({categories:[],channels:[],resources:[]}),getProductEditor:async()=>({product,variants:[],profile:{productType:'physical',minimumPurchaseQuantity:1,version:1},resourceIds:{collections:[],tags:[],attributes:[]},categoryIds:[],channelIds:[]})}},
 '@/components/catalog-onboarding/ProductAdvancedEditor':{ProductAdvancedEditor:empty},'@/components/catalog-onboarding/AttributeVariantPicker':{AttributeVariantPicker:empty},'@/components/catalog-onboarding/ProductVariantBuilder':{ProductVariantBuilder:empty},
 '@/components/catalog/SkuInput':{SkuInput:field},'@/components/catalog/BarcodeInput':{BarcodeInput:field},
 './ProductDescriptionField':{ProductDescriptionField:()=>createElement('textarea',{name:'description'}),ProductDescriptionPreview:empty},
 './ProductVariantGalleryEditor':{ProductVariantGalleryEditor:({children}:any)=>children({thumbnail:empty})},'./ProductMediaManager':{ProductMediaManager:empty,restoreArchiveFocus(){}},
 '@/components/reference-pricing/VariantPricingPolicyControl':{VariantPricingPolicyControl:empty},'@/components/shared/PermanentDeleteDialog':{PermanentDeleteDialog:empty},'@/components/panel/PanelTopbarChrome':{usePanelTopbarChrome(){}},
 });
 const host=browser.document.createElement('div')as unknown as HTMLElement;browser.document.body.append(host as never);const{createRoot}=await import('react-dom/client');const root=createRoot(host);const restoreRects=installCatalogSortRects(browser,host,'list');
 try{await act(async()=>root.render(createElement(ProductDetailConsole,{productId:p,canManage:true})));await run({host,browser,requests,fail:code=>{fail=code;},finish:()=>finish(),replay:value=>{replayIds=value;},delayReads:()=>{delayReads=true;},resolveRead:index=>{reads[index].resolve(reads[index].snapshot);},reads});}
 finally{await act(async()=>root.unmount());restoreRects();for(const[key,value]of prior)value?Object.defineProperty(globalThis,key,value):Reflect.deleteProperty(globalThis,key);browser.happyDOM.abort();}
}
test('saved variant drop saves once and keeps the same unsaved edit form',()=>fixture(async({host,browser,requests,finish})=>{
 const edit=host.querySelector<HTMLButtonElement>('button[aria-label="Kırmızı varyantını düzenle"]')!;await act(async()=>edit.click());
 const input=host.querySelector<HTMLInputElement>('input[name="title"][value="Kırmızı"]')??host.querySelector<HTMLInputElement>('[data-sort-id="'+a+'"] input[name="title"]');assert.ok(input);input.value='Kaydedilmemiş ad';
 assert.ok(host.querySelector('[data-sort-id="'+a+'"]'),'saved variant has shared drag identity');
 await dragCatalogItem(browser,host,a,b);assert.equal(requests.length,1);assert.deepEqual(requests[0].orderedVariantIds,[b,a]);
 assert.equal(host.querySelector<HTMLInputElement>('[data-sort-id="'+a+'"] input[name="title"]'),input);assert.equal(input.value,'Kaydedilmemiş ad');
 await dragCatalogItem(browser,host,b,a);assert.equal(requests.length,1);await act(async()=>finish());
 assert.deepEqual([...host.querySelectorAll('[data-sort-id]')].map(row=>row.getAttribute('data-sort-id')),[b,a]);assert.equal(input.value,'Kaydedilmemiş ad');
}));
test('unknown response retries the exact order intent while a stale order loads canonical order',()=>fixture(async({host,browser,requests,fail,finish})=>{
 fail('unavailable');await dragCatalogItem(browser,host,a,b);assert.equal(requests.length,1);await act(async()=>{await new Promise(resolve=>setTimeout(resolve,60));});
 const retry=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Sıralamayı tekrar kaydet');assert.ok(retry);
 await act(async()=>retry.click());assert.deepEqual(requests[1],requests[0]);await act(async()=>finish());
 fail('version_conflict');await dragCatalogItem(browser,host,b,a);assert.equal(requests.length,3);assert.deepEqual([...host.querySelectorAll('[data-sort-id]')].map(row=>row.getAttribute('data-sort-id')),[a,b]);
}));

test('a replay loads the later canonical order and retains the open editor buffer',()=>fixture(async({host,browser,requests,finish,replay})=>{
 await act(async()=>host.querySelector<HTMLButtonElement>('button[aria-label="Kırmızı varyantını düzenle"]')!.click());
 const field=host.querySelector<HTMLInputElement>('[data-sort-id="'+a+'"] input[name="title"]')!;field.value='Bekleyen düzenleme';
 replay([a,b]);await dragCatalogItem(browser,host,a,b);assert.equal(requests.length,1);assert.deepEqual(requests[0].orderedVariantIds,[b,a]);await act(async()=>finish());
 assert.deepEqual([...host.querySelectorAll('[data-sort-id]')].map(row=>row.getAttribute('data-sort-id')),[a,b]);assert.equal(host.querySelector('[data-sort-id="'+a+'"] input[name="title"]'),field);assert.equal(field.value,'Bekleyen düzenleme');
}));

test('a late membership order read cannot replace a newer read or an accepted drop',()=>fixture(async({host,browser,requests,finish,delayReads,resolveRead,reads})=>{
 const create=async(title:string)=>{
  const add=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent?.trim()==='Varyant ekle')!;await act(async()=>add.click());
  const submit=[...host.querySelectorAll<HTMLButtonElement>('button')].find(button=>button.textContent==='Varyantı oluştur')!;const form=submit.closest('form')!;
  for(const[name,value]of [['title',title],['price','1,00']]as const){const field=form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!;await act(async()=>{Object.getOwnPropertyDescriptor(browser.HTMLInputElement.prototype,'value')!.set!.call(field,value);field.dispatchEvent(new browser.Event('input',{bubbles:true}) as never);});}
  await act(async()=>form.dispatchEvent(new browser.Event('submit',{bubbles:true,cancelable:true}) as never));
 };
 delayReads();await create('Yeni C');assert.equal(reads.length,1);await create('Yeni D');assert.equal(reads.length,2);
 const disabledDuringRead=[...host.querySelectorAll<HTMLButtonElement>('button[aria-roledescription="Sıralanabilir öğe"]')].every(button=>button.disabled);
 await act(async()=>resolveRead(1));await dragCatalogItem(browser,host,a,b);assert.equal(requests.length,1);await act(async()=>finish());
 const accepted=[b,a,'44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555'];
 assert.deepEqual([...host.querySelectorAll('[data-sort-id]')].map(row=>row.getAttribute('data-sort-id')),accepted);
 await act(async()=>resolveRead(0));assert.deepEqual([...host.querySelectorAll('[data-sort-id]')].map(row=>row.getAttribute('data-sort-id')),accepted,'older GET cannot overwrite a successful drop');
 assert.equal(disabledDuringRead,true,'new mutation waits for canonical order readiness');
}));
