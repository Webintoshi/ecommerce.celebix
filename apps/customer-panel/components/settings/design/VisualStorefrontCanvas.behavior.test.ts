import assert from "node:assert/strict";
import test from "node:test";
import React,{type ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {normalizeStorefrontDesignDocumentV5,type StorefrontDesignDocument,type PublicStarterHomeSection} from "@celebix/saas-contracts";
import {createPreviewStorefrontDesign} from "../../../../../packages/storefront-design-ui/src/model.ts";
import {normalizeProductDescriptionHtml} from "../../../../../packages/platform-config/src/product-description-rich-text.ts";
import {compile,DESIGN,withEditor} from "./design-editor-test-utils.ts";
const NOW="2026-09-30T10:00:00.000Z";
const options={
 "@celebix/storefront-design-ui":{createPreviewStorefrontDesign,StorefrontDesignRenderer:({children}:{children:ReactNode})=>React.createElement("div",{"data-renderer":true},children),ProductDetailPreview:()=>React.createElement("div",null,"Product preview"),RepresentativeCartPreview:()=>React.createElement("div",null,"Cart preview")},
 "@celebix/platform-config/src/product-description-rich-text.ts":{normalizeProductDescriptionHtml},
 "../../../../storefront-shared/components/CampaignSectionContent":{CampaignSectionContent:({section,productRows,presentation,renderProductRow}:{section:PublicStarterHomeSection;productRows:{key:string;items:unknown[]}[];presentation:unknown;renderProductRow:(props:unknown)=>ReactNode})=>section.kind==="product_row"?renderProductRow({section,presentation,locale:"tr",products:productRows.find(row=>row.key===section.key)?.items??[]}):React.createElement("article",{"data-shared-section":section.kind},"heading" in section?section.heading:section.kind)},
 "../../../../storefront-shared/components/ProductCardContent":{ProductCardContent:({product}:{product:{title:string;slug:string}})=>React.createElement("a",{href:`/products/${product.slug}`},product.title)},
 "../../../../storefront-shared/components/CampaignProductRowFrame":{CampaignProductRowFrame:({section,visualTheme,renderProductGrid}:{section:{heading:string};visualTheme:string;renderProductGrid:()=>ReactNode})=>React.createElement("section",{"data-shared-product-row":visualTheme},React.createElement("h2",null,section.heading),renderProductGrid())},
 "../../../../storefront-shared/themes/guzide/GuzideFooter":{GuzideFooter:({storefront,renderNewsletter}:{storefront:{hostname:string};renderNewsletter:()=>ReactNode})=>React.createElement("footer",{"data-shared-guzide-footer":true},storefront.hostname,renderNewsletter())},
};
const {VisualStorefrontCanvas}=compile<{VisualStorefrontCanvas:(props:Record<string,unknown>)=>ReactNode}>(new URL("./VisualStorefrontCanvas.tsx",import.meta.url),options);
function props(design:StorefrontDesignDocument,extra:Record<string,unknown>={}){return{design,storeName:"Fixture",publishedVersion:4,publishedAt:NOW,media:[],destinations:[],mode:"desktop",now:new Date(NOW),onSelectSurface:()=>{},...extra};}
const baseline=()=>normalizeStorefrontDesignDocumentV5(DESIGN);
test("enabled text-only overlay banner uses the live section renderer without requiring an image",()=>{
 const base=baseline(),design={...base,composition:{...base.composition,sections:[{kind:"banner" as const,sectionId:"home_text_banner" as const,enabled:true,layout:"single" as const,autoplay:false,presentation:"overlay" as const,slides:[{slideId:"slide_text_banner",enabled:true,headline:"Text-only banner",body:"Details",desktopImage:null,mobileImage:null,destination:{kind:"none" as const}}]}]}};
 const resources={schemaVersion:1,dependencyKey:"text-banner",productSources:[],assets:[],hotspots:[],categoryShowcase:{status:"empty"}};
 const markup=renderToStaticMarkup(React.createElement(VisualStorefrontCanvas,props(design,{previewResources:resources})));
 assert.match(markup,/data-shared-section="banner"/);
});
test("resolved Güzide identity scopes the real theme and uses shared rail/footer without subscription writes",async()=>withEditor(async({container,render})=>{
 const base=baseline(),identity={id:"a828862c-4cc1-475a-89cc-5fbee31eb43f",hostname:"www.guzidekuyumcu.com",canonicalUrl:"https://www.guzidekuyumcu.com/",locale:"tr",currency:"TRY"};
 const product={id:"40000000-0000-4000-8000-000000000001",slug:"product",title:"Real product",currency:"TRY",priceCents:10000,available:true,media:[]};
 const resources={schemaVersion:1,dependencyKey:"row",productSources:[{key:"latest",status:"ready",items:[product]}],assets:[],hotspots:[],categoryShowcase:{status:"empty"}};
 await render(React.createElement(VisualStorefrontCanvas,props(base,{storefront:identity,previewResources:resources})));
 assert.ok(container.querySelector('[data-storefront-theme="guzide-deniz"]'));assert.ok(container.querySelector('[data-campaign-home]'));assert.ok(container.querySelector('[data-shared-product-row="guzide-deniz"] .product-grid'));assert.ok(container.querySelector('[data-shared-guzide-footer]'));assert.equal(container.querySelector('.retail-newsletter-form button')?.getAttribute("disabled"),"");
 await render(React.createElement(VisualStorefrontCanvas,props(base,{storefront:{...identity,id:"another-store"},previewResources:resources})));
 assert.equal(container.querySelector('[data-storefront-theme="guzide-deniz"]'),null);assert.equal(container.querySelector('[data-shared-guzide-footer]'),null);
}));
test("canvas has insertion gaps at start, between all fifty sections and before footer",()=>{
 const base=baseline(),design={...base,composition:{...base.composition,sections:Array.from({length:50},(_,index)=>({kind:"brand_story" as const,sectionId:`home_story_${index}` as const,enabled:index!==2,heading:`Story ${index}`,body:"Body"}))}};
 const markup=renderToStaticMarkup(React.createElement(VisualStorefrontCanvas,props(design)));
 assert.equal((markup.match(/data-insert-index=/g)??[]).length,51);assert.match(markup,/data-insert-index="0"/);assert.match(markup,/data-insert-index="50"/);assert.equal((markup.match(/data-preview-section-id=/g)??[]).length,50);assert.match(markup,/data-section-hidden="true"/);assert.ok(markup.indexOf('data-insert-index="50"')<markup.indexOf('data-design-surface="footer"'));assert.doesNotMatch(markup,/Taslak önizlemesi/);
});
test("canvas selection passes stable section IDs and exact insertion indices with focus triggers",async()=>withEditor(async({container,render,click})=>{
 const inserted:number[]=[],selected:string[]=[],triggers:HTMLElement[]=[];
 await render(React.createElement(VisualStorefrontCanvas,props(baseline(),{onInsertSection:(index:number,trigger:HTMLElement)=>{inserted.push(index);triggers.push(trigger);},onSelectSection:(id:string,trigger:HTMLElement)=>{selected.push(id);triggers.push(trigger);}})));
 await click(container.querySelector('[data-insert-index="0"]')!);await click(container.querySelector('button[aria-label="Ürün satırı 1 bölümünü düzenle"]')!);await click(container.querySelector('button[aria-label="Footer öncesine bölüm ekle"]')!);
 assert.deepEqual(inserted,[0,1]);assert.deepEqual(selected,["home_product_row_1"]);assert.ok(triggers.every(trigger=>trigger.tagName==="BUTTON"));
}));
test("resolved product rows show real resources in configured order and preview blocks link navigation",async()=>withEditor(async({container,window,render,click})=>{
 const base=baseline(),design={...base,composition:{...base.composition,sections:[{kind:"product_row" as const,sectionId:"home_latest" as const,enabled:true,heading:"Latest",source:"latest" as const,limit:4 as const},{kind:"product_row" as const,sectionId:"home_sale" as const,enabled:true,heading:"Sale",source:"sale" as const,limit:4 as const}]}};
 const product=(number:number)=>({id:`40000000-0000-4000-8000-00000000000${number}`,slug:`product-${number}`,title:`Real ${number}`,currency:"TRY",status:"active",priceCents:10000,available:true,variants:[],media:[]});
 const resources={schemaVersion:1,dependencyKey:"rows",productSources:[{key:"latest",status:"ready",items:[product(1)]},{key:"sale",status:"ready",items:[product(2)]}],assets:[],hotspots:[],categoryShowcase:{status:"empty"}};
 await render(React.createElement(VisualStorefrontCanvas,props(design,{previewResources:resources})));assert.equal(container.querySelectorAll('[data-preview-product-card="true"]').length,2);assert.ok(container.innerHTML.indexOf("Real 1")<container.innerHTML.indexOf("Real 2"));const link=container.querySelector<HTMLAnchorElement>('a[href="/products/product-1"]')!;
 const event=new window.MouseEvent("click",{bubbles:true,cancelable:true});await React.act(async()=>link.dispatchEvent(event as unknown as Event));assert.equal(event.defaultPrevented,true);
}));
test("empty canvas offers one insertion point and keeps configured footer content",()=>{
 const base=baseline(),design={...base,composition:{...base.composition,sections:[],footer:{...base.composition.footer,newsletter:{...base.composition.footer.newsletter,enabled:true,heading:"Newsletter",body:"News",consentLabel:"Consent"}}}};
 const markup=renderToStaticMarkup(React.createElement(VisualStorefrontCanvas,props(design)));assert.equal((markup.match(/data-insert-index=/g)??[]).length,1);assert.match(markup,/data-empty-home="true"/);assert.match(markup,/Newsletter/);assert.match(markup,/Consent/);
});

test("fallback canvas describes selections by name and keeps routes and opaque IDs out of visible content",async()=>withEditor(async({container,render})=>{
 const base=baseline(),first="40000000-0000-4000-8000-000000000001",second="40000000-0000-4000-8000-000000000002";
 const design={...base,composition:{...base.composition,sections:[
  {kind:"split_campaign" as const,sectionId:"home_campaign" as const,enabled:true,panels:[{heading:"Yaz seçkisi",assetId:first,destination:"/categories/earrings"},{heading:"Özel seçki",assetId:second,destination:"/pages/old-selection"}]},
  {kind:"category_grid" as const,sectionId:"home_categories" as const,enabled:true,heading:"Kategoriler",categoryIds:[first,second],layout:"grid" as const},
  {kind:"brand_story" as const,sectionId:"home_story" as const,enabled:true,heading:"Hikâyemiz",body:"Mağazamızın hikâyesi",assetId:second},
  {kind:"product_row" as const,sectionId:"home_manual" as const,enabled:true,heading:"Seçtiklerimiz",source:"manual" as const,productIds:[first],limit:4 as const},
 ],footer:{...base.composition.footer,groups:[{heading:"Mağaza",links:[{kind:"system" as const,destination:"/products" as const},{kind:"fixed_policy" as const,policyKey:"privacy_security" as const},{kind:"category" as const,categoryId:first},{kind:"catalog_collection" as const,resourceId:first},{kind:"page" as const,pageId:second}]},{heading:"Bilgi",links:[{kind:"system" as const,destination:"/account" as const}]}],social:[{network:"instagram" as const,url:"https://www.instagram.com/magaza"}]}}};
 const original=structuredClone(design);
 await render(React.createElement(VisualStorefrontCanvas,props(design,{media:[{id:first,url:"https://cdn.fixture.invalid/campaign.webp",altText:"Yaz görseli",mediaType:"image/webp",width:1200,height:800}],destinations:[{kind:"collection",resourceId:first,label:"Küpeler",path:"/categories/earrings"},{kind:"catalog_collection",resourceId:first,label:"Yaz koleksiyonu",path:"/collections/summer"}]})));
 const text=container.textContent??"";
 assert.match(text,/Yaz görseli/);assert.match(text,/Küpeler/);assert.match(text,/Yaz koleksiyonu/);assert.match(text,/Gizlilik ve Güvenlik/);assert.match(text,/Mevcut bağlantı/);assert.match(text,/Seçili kategori/);assert.match(text,/Görsel seçildi/);assert.match(text,/Elle seçilen ürünler/);assert.match(text,/Instagram/);assert.match(text,/magaza/);
 assert.doesNotMatch(text,/40000000|https:|\/categories|\/collections|\/pages|\/products|kimliği|privacy_security|manual/);
 assert.deepEqual(design,original);
}));
