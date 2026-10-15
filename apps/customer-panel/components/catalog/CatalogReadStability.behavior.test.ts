import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import {compile} from "../../lib/mira-final-test-support.ts";
import {withEditor} from "../settings/design/design-editor-test-utils.ts";

const ID="11111111-1111-4111-8111-111111111111";
const product={id:ID,title:"Örnek ürün",slug:"ornek",description:null,currency:"TRY",status:"active",version:1,createdAt:"2026-10-01T00:00:00Z",updatedAt:"2026-10-01T00:00:00Z"};
const summary={totalProducts:4,activeProducts:3,draftProducts:1,outOfStockVariants:0,productsWithoutMedia:1,activeMedia:4,activeVariants:4,productLimit:100};
function deferred<T=any>(){let resolve!:(value:T)=>void,reject!:(error:unknown)=>void;const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};}
function button(host:HTMLElement,label:string){const found=Array.from(host.querySelectorAll("button")).find(node=>node.getAttribute("aria-label")===label||node.textContent?.trim()===label);assert.ok(found,label);return found;}
function productConsole(listProducts:(input:any)=>Promise<any>){return compile("components/catalog/ProductListConsole.tsx",{
 "@/lib/catalog-ui/client":{catalogApi:{listProducts,getDashboardSummary:async()=>summary},CatalogApiError:class extends Error{}},
 "@/lib/catalog-onboarding-ui/client":{catalogOnboardingClient:{getOptions:async()=>({categories:[],resources:[],channels:[]})}},
 "@/components/catalog/ProductCategoryRankConsole":{ProductCategoryRankConsole:()=>null},
}).ProductListConsole;}

test("product refresh retains the same query rows and summary while a new cursor hides prior-page rows",async()=>{
 const refresh=deferred(),next=deferred();let calls=0;
 const Component=productConsole(async input=>{calls++;if(calls===1)return{items:[product],catalogTotal:4,nextCursor:"next-page"};return input.cursor?next.promise:refresh.promise;});
 await withEditor(async({container,render,click})=>{
  await render(React.createElement(Component,{canManage:true}));const row=container.querySelector("tbody tr");assert.ok(row);
  await click(container.querySelector('[aria-label="Örnek ürün ürününü seç"]')!);
  const metric=container.querySelector('[data-summary-filter="total"] .product-stat-value')?.textContent;
  await click(button(container,"Ürün listesini yenile"));assert.ok(container.querySelector("tbody tr")===row,"same-query row remains mounted");assert.equal(container.querySelector('[data-summary-filter="total"] .product-stat-value')?.textContent,metric);assert.match(container.textContent!,/görsel eksik/);
  await React.act(async()=>refresh.resolve({items:[product],catalogTotal:4,nextCursor:"next-page"}));assert.equal((container.querySelector('[aria-label="Örnek ürün ürününü seç"]') as HTMLInputElement).checked,true);await click(button(container,"Sonraki"));assert.equal(container.querySelector("tbody tr"),null,"a different page must not display old page rows");
  await React.act(async()=>next.resolve({items:[{...product,id:"22222222-2222-4222-8222-222222222222",title:"İkinci sayfa"}],catalogTotal:4}));assert.match(container.textContent!,/İkinci sayfa/);assert.doesNotMatch(container.textContent!,/Örnek ürün/);
 });
});

test("product query changes hide old rows immediately and a failed new read stays explicit",async()=>{
 const pending=deferred();let calls=0;const Component=productConsole(async()=>++calls===1?{items:[product],catalogTotal:4}:pending.promise);
 await withEditor(async({container,render,click})=>{
  await render(React.createElement(Component));await click(container.querySelector('[data-summary-filter="draft"]')!);assert.equal(container.querySelector("tbody tr"),null);
  await React.act(async()=>pending.reject(Error("unavailable")));assert.equal(container.querySelector("tbody tr"),null);assert.match(container.textContent!,/yüklenemedi|yüklenemedi|yüklenemedi/i);
 });
});

test("review reconciliation keeps reply editor DOM and values mounted until the canonical response",async()=>{
 const pending=deferred();let reads=0;
 const review={id:ID,productTitle:"Örnek ürün",reviewerName:"Örnek kişi",rating:5,status:"pending",body:"Örnek yorum",verifiedPurchase:true,version:1};
 const Component=compile("components/catalog-admin/ProductReviewConsole.tsx",{
  "@/lib/catalog-admin-ui/client":{CatalogAdminApiError:class extends Error{},catalogAdminApi:{reviews:async()=>++reads===1?[review]:pending.promise,moderateReview:async()=>({})}},
  "./ReviewCollectionConsole":{ReviewCollectionConsole:()=>null},
 }).ProductReviewConsole;
 await withEditor(async({container,render,change,click})=>{
  await render(React.createElement(Component,{canModerate:true}));const textarea=container.querySelector("textarea")!;assert.ok(textarea);await change(textarea,"Yanıt taslağı");await click(button(container,"Yayınla"));
  assert.ok(container.querySelector("textarea")===textarea,"reply editor survives read refresh");assert.equal(textarea.value,"Yanıt taslağı");assert.ok(container.querySelector('[aria-label="Yorum özeti"]'));
  await React.act(async()=>pending.resolve([{...review,status:"approved",version:2}]));assert.equal(container.querySelector("textarea")?.value,"Yanıt taslağı");
 });
});

test("collection reconciliation keeps the same query row, while a publication filter hides it",async()=>{
 const pending=deferred(), filtered=deferred();let reads=0;
 const collection={id:ID,name:"Yaz koleksiyonu",slug:"yaz",description:null,status:"active",version:1,productCount:1,config:{mode:"manual",featured:false,publicationStatus:"published"}};
 const page={items:[collection],totalCount:1,page:1,pageSize:20,counts:{all:1,published:1,draft:0,archived:0}};
 const Component=compile("components/catalog-collections/CollectionConsole.tsx",{
  "@/lib/catalog-collections-ui/client":{collectionsApi:{list:async()=>++reads===1?page:reads===2?pending.promise:filtered.promise,archive:async()=>({})},collectionError:()=>"Koleksiyonlar yüklenemedi.",collectionState:()=>"published"},
 }).CollectionConsole;
 await withEditor(async({container,render,click})=>{
  await render(React.createElement(Component,{canManage:true}));const row=container.querySelector('[role="listitem"]');assert.ok(row);
  await click(button(container,"Yaz koleksiyonu işlemleri"));await click(button(container,"Arşivle"));await click(button(container,"Arşivle"));
  assert.ok(container.querySelector('[role="listitem"]')===row,"same-query collection row remains mounted");
  await React.act(async()=>pending.resolve(page));await click(Array.from(container.querySelectorAll("button")).find(node=>node.textContent?.startsWith("Taslak"))!);
  assert.equal(container.querySelector('[role="listitem"]'),null);
 });
});

test("product preview token changes hide the earlier preview until the new scope resolves",async()=>{
 const pending=deferred();let calls=0;const originalFetch=globalThis.fetch;
 const preview=(title:string)=>({product:{title,currency:"TRY"},variants:[],media:[],merchandising:{}});
 globalThis.fetch=(async()=>++calls===1?{ok:true,json:async()=>({preview:preview("İlk önizleme")})}:pending.promise) as typeof fetch;
 const Component=compile("components/catalog/ProductStorefrontPreview.tsx").ProductStorefrontPreview;
 try {await withEditor(async({container,render})=>{
  await render(React.createElement(Component,{productId:ID,token:"first"}));assert.match(container.textContent!,/İlk önizleme/);
  await render(React.createElement(Component,{productId:ID,token:"second"}));assert.doesNotMatch(container.textContent!,/İlk önizleme/);assert.ok(container.querySelector('[data-catalog-loading="preview"]'));
  await React.act(async()=>pending.resolve({ok:true,json:async()=>({preview:preview("İkinci önizleme")})}));assert.match(container.textContent!,/İkinci önizleme/);
 });} finally {globalThis.fetch=originalFetch;}
});

test("a resource editor changes entity without exposing the earlier form or its values",async()=>{
 const pending=deferred();const nextId="22222222-2222-4222-8222-222222222222";
 const resource=(id:string,name:string)=>({id,name,kind:"attribute",slug:"renk",version:1,status:"active",config:{values:["Siyah"]},productIds:[],productCount:0});
 const Component=compile("components/catalog-admin/CatalogResourceEditor.tsx",{
  "next/navigation":{useRouter:()=>({push(){},refresh(){}})},
  "@/components/catalog-admin/CatalogBrandLogoPicker":{CatalogBrandLogoPicker:()=>null},
  "@/lib/catalog-admin-ui/client":{catalogAdminApi:{resource:async(_kind:string,id:string)=>id===ID?resource(id,"İlk nitelik"):pending.promise},CatalogAdminApiError:class extends Error{}},
 }).CatalogResourceEditor;
 await withEditor(async({container,render})=>{
  await render(React.createElement(Component,{kind:"attribute",resourceId:ID,canManage:true}));assert.equal((container.querySelector('[name="name"]') as HTMLInputElement)?.value,"İlk nitelik");
  await render(React.createElement(Component,{kind:"attribute",resourceId:nextId,canManage:true}));assert.equal(container.querySelector('[name="name"]'),null);assert.ok(container.querySelector('[data-catalog-loading="editor"]'));
  await React.act(async()=>pending.resolve(resource(nextId,"İkinci nitelik")));assert.equal((container.querySelector('[name="name"]') as HTMLInputElement)?.value,"İkinci nitelik");
 });
});

test("import history keeps its rows on refresh and a failed first read does not claim an empty history",async()=>{
 const pending=deferred();let reads=0;
 const overrides={
  "@/lib/catalog-admin-ui/client":{catalogAdminApi:{imports:async()=>++reads===1?[{id:ID,fileName:"katalog.csv",succeededRows:2,totalRows:2,failedRows:0,status:"completed"}]:pending.promise},CatalogAdminApiError:class extends Error{}},
  "@/lib/catalog-import/woocommerce-migration":{},"@/lib/catalog-import/qukasoft-migration":{},"@/lib/catalog-migration-http/client":{WooCommerceMigrationApiError:class extends Error{}},"@/lib/catalog-migration-http/workflow":{},"@/lib/catalog-import/providers":{CATALOG_IMPORT_PROVIDERS:[]},
 };
 const Component=compile("components/catalog-admin/CatalogBulkImportConsole.tsx",overrides).CatalogBulkImportConsole;
 await withEditor(async({container,render,click})=>{
  await render(React.createElement(Component,{canImport:false}));const row=container.querySelector('[aria-labelledby="history-heading"] article');assert.ok(row);
  await click(button(container,"Yenile"));assert.ok(container.querySelector('[aria-labelledby="history-heading"] article')===row,"same history row remains mounted");
  await React.act(async()=>pending.resolve([]));assert.match(container.textContent!,/Henüz toplu yükleme yok/);
 });
 const Failed=compile("components/catalog-admin/CatalogBulkImportConsole.tsx",{...overrides,"@/lib/catalog-admin-ui/client":{catalogAdminApi:{imports:async()=>{throw Error("offline")}},CatalogAdminApiError:class extends Error{}}}).CatalogBulkImportConsole;
 await withEditor(async({container,render})=>{
  await render(React.createElement(Failed,{canImport:false}));assert.match(container.textContent!,/Yükleme geçmişi alınamadı/);assert.doesNotMatch(container.textContent!,/Henüz toplu yükleme yok/);
 });
});

test("failed rank save keeps the reordered rows and dirty order visible for correction or retry",async()=>{
 const otherId="22222222-2222-4222-8222-222222222222";
 const order={categoryId:ID,version:1,items:[{productId:ID,title:"Birinci ürün",slug:"bir",status:"active",storefrontPosition:0},{productId:otherId,title:"İkinci ürün",slug:"iki",status:"active",storefrontPosition:1}]};
 const calls:any[]=[];
 const Component=compile("components/catalog/ProductCategoryRankConsole.tsx",{
  "@/lib/catalog-ui/product-order-client":{moveProductOrder:(items:readonly any[],id:string,index:number)=>{const next=[...items],from=next.findIndex(item=>item.productId===id);next.splice(index,0,next.splice(from,1)[0]);return next;},productOrderClient:{get:async()=>order,save:async(...input:any[])=>{calls.push(input);throw Error("Sıra kaydedilemedi.");}}},
 }).ProductCategoryRankConsole;
 await withEditor(async({container,render,click})=>{
  await render(React.createElement(Component,{categories:[{id:ID,name:"Giyim"}],initialCategoryId:ID,knownImages:{},optionsState:"ready",onRetryOptions(){},onDirtyChange(){},onSavingChange(){},onClose(){}}));
  await click(button(container,"İkinci ürün ürününü bir sıra yukarı taşı"));const row=container.querySelector(`[data-rank-product-id="${otherId}"]`);assert.ok(row);
  await click(button(container,"Sırayı kaydet"));assert.ok(container.querySelector(`[data-rank-product-id="${otherId}"]`)===row,"failed save retains reordered DOM");assert.equal(container.querySelector('[data-rank-product-id]')?.getAttribute('data-rank-product-id'),otherId);assert.match(container.textContent!,/Sıra kaydedilemedi/);assert.deepEqual(calls[0],[ID,1,[otherId,ID]]);
 });
});


test("a failed second-page refresh retries the same cursor and preserves that page's rows",async()=>{
 const inputs:any[]=[];let calls=0;
 const Component=productConsole(async input=>{inputs.push(input);if(++calls===2)throw Error("offline");return {items:[product],catalogTotal:4};});
 await withEditor(async({container,render,click})=>{
  await render(React.createElement(Component,{initialCursor:"second-page"}));await click(button(container,"Ürün listesini yenile"));assert.match(container.textContent!,/yüklenemedi/);
  await click(button(container,"Tekrar dene"));assert.ok(inputs.every(input=>input.cursor==="second-page"));assert.match(container.textContent!,/Örnek ürün/);assert.ok(container.querySelector("tbody tr"));
 });
});

test("a late moderation reconciliation cannot overwrite the newer review list",async()=>{
 const otherId="22222222-2222-4222-8222-222222222222",writeA=deferred(),writeB=deferred(),readA=deferred(),readB=deferred();let reads=0;
 const review=(id:string)=>({id,productTitle:id===ID?"Birinci yorum":"İkinci yorum",reviewerName:"Kişi",rating:5,status:"pending",body:"Yorum",version:1});
 const first=review(ID),second=review(otherId);
 const Component=compile("components/catalog-admin/ProductReviewConsole.tsx",{
  "@/lib/catalog-admin-ui/client":{CatalogAdminApiError:class extends Error{},catalogAdminApi:{reviews:async()=>++reads===1?[first,second]:reads===2?readA.promise:readB.promise,moderateReview:async(id:string)=>id===ID?writeA.promise:writeB.promise}},
  "./ReviewCollectionConsole":{ReviewCollectionConsole:()=>null},
 }).ProductReviewConsole;
 await withEditor(async({container,render,click})=>{
  await render(React.createElement(Component,{canModerate:true}));const articles=container.querySelectorAll("article");await click(articles[0]!.querySelector("button")!);await click(articles[1]!.querySelector("button")!);
  await React.act(async()=>writeA.resolve({}));await React.act(async()=>writeB.resolve({}));
  await React.act(async()=>readB.resolve([{...first,status:"approved",version:2},{...second,status:"approved",version:2}]));
  await React.act(async()=>readA.resolve([{...first,status:"approved",version:2},second]));
  assert.equal(container.querySelectorAll("article")[1]?.querySelector(".status")?.textContent,"Yayında");
 });
});
