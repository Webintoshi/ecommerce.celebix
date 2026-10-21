import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { resolveStorefrontCommercePolicy, buildDefaultStarterPresentation, type PublicProduct } from '@celebix/saas-contracts';
import { componentLoader, withProductBrowser } from './product-variant-media-test-utils.ts';
const product:PublicProduct={id:'20000000-0000-4000-8000-000000000001',slug:'ornek-urun',title:'Gül & Çiçek',currency:'TRY',status:'active',priceCents:null,pricesHidden:true,available:true,variants:[{id:'30000000-0000-4000-8000-000000000001',title:'Küçük',priceCents:null,pricesHidden:true,stockTracking:true,stockQuantity:5,available:true,attributes:{}},{id:'30000000-0000-4000-8000-000000000002',title:'Büyük',priceCents:null,pricesHidden:true,stockTracking:true,stockQuantity:5,available:true,attributes:{}}],media:[]};
const policy=resolveStorefrontCommercePolicy({schemaVersion:1,enabled:true,phone:'+905551112233',hidePrices:true,hideAddToCart:true,messageIntro:'Merhaba'});
type Component=React.ComponentType<Record<string,unknown>>;
for(const [name,path] of [['shared','./ProductPurchasePanel.tsx'],['Güzide','../themes/guzide/GuzideProductPurchase.tsx'],['Lilyum','../themes/lilyum/LilyumProductPurchase.tsx'],['Siora','../themes/siora/SioraProductPurchase.tsx']] as const) {
 test(`${name} hides money and new purchase actions, and requires a deliberate variant for WhatsApp`,async()=>{
 const load=componentLoader({'next/link':{__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>React.createElement('a',props,children)},'next/navigation':{useRouter:()=>({push(){}}),usePathname:()=>'/products/ornek-urun'},'@/lib/storefront-routes.ts':{productIndexPath:()=>'/products'},'@/lib/cart/client.ts':{storefrontCartClient:{}},'@/lib/analytics/events.ts':{emitStorefrontCommerceEvent(){}},'@/lib/format.ts':{formatTry:(value:number|null)=>value===null?'':`₺${value}`},'./CartStatusProvider':{useCartStatus:()=>({})},'../../components/CartStatusProvider':{useCartStatus:()=>({})},'../../components/FavoriteButton':{FavoriteButton:()=>null},'./useCatalogScrollRestoration':{useCatalogScrollRestoration(){},sioraCatalogReturnRoute(){return null;}}});
 const {CommercePolicyProvider:Provider}=load<{CommercePolicyProvider:Component}>(new URL('./CommercePolicyProvider.tsx',import.meta.url));
 const {ProductVariantMediaProvider:Variants}=load<{ProductVariantMediaProvider:Component}>(new URL('./ProductVariantMedia.tsx',import.meta.url));
 const purchaseModule=load<Record<string,Component>>(new URL(path,import.meta.url));const Purchase=Object.values(purchaseModule)[0]!;
 await withProductBrowser(async({container,render,click})=>{await render(React.createElement(Provider,{policy},React.createElement(Variants,{product},React.createElement(Purchase,{product,available:true,showQuantitySelector:true,options:{...buildDefaultStarterPresentation({name:'Örnek'}).productDetail,mobileStickyPurchase:false},storefrontId:'example',locale:'tr'}))));
 assert.doesNotMatch(container.textContent??'',/₺|Sepete ekle|SEPETE EKLE|Şimdi satın al/);
 assert.equal(container.querySelector<HTMLInputElement>('input[type="radio"]:checked'),null);
 const button=Array.from(container.querySelectorAll('button')).find(item=>item.textContent==='WhatsApp ile sipariş ver');assert.ok(button);assert.equal(button.disabled,true);
 if(name!=='Siora'){await click(`input[value="${product.variants[1]!.id}"]`);assert.equal(Array.from(container.querySelectorAll('button')).find(item=>item.textContent==='WhatsApp ile sipariş ver')?.disabled,false);}
 });
 });
}

test('fresh preview prepares a normal WhatsApp link with full message and does not mutate the cart',async()=>{
 const calls:unknown[]=[];const oldFetch=globalThis.fetch;globalThis.fetch=async(input,init)=>{calls.push({input,body:JSON.parse(String(init?.body))});return Response.json({policy,storeName:'Örnek mağaza',product,variantId:product.variants[1]!.id,quantity:2});};
 const load=componentLoader();const {CommercePolicyProvider:Provider}=load<{CommercePolicyProvider:Component}>(new URL('./CommercePolicyProvider.tsx',import.meta.url));const {WhatsAppOrderButton:Button}=load<{WhatsAppOrderButton:Component}>(new URL('./WhatsAppOrderButton.tsx',import.meta.url));
 try{await withProductBrowser(async({container,render,click})=>{await render(React.createElement(Provider,{policy},React.createElement(Button,{product,variant:product.variants[1],quantity:2})));await click('button');const link=container.querySelector<HTMLAnchorElement>('a');assert.ok(link);assert.equal(new URL(link.href).hostname,'wa.me');const message=new URL(link.href).searchParams.get('text')!;assert.match(message,/Büyük — 2 adet/);assert.doesNotMatch(message,/₺|TRY/);assert.equal(calls.length,1);assert.deepEqual(calls[0],{input:'/api/whatsapp-order/preview',body:{kind:'product',productId:product.id,variantId:product.variants[1]!.id,quantity:2}});});}finally{globalThis.fetch=oldFetch;}
});

test('hidden default and Siora drawers retain removal while suppressing totals checkout shipping and new quantities',async()=>{
 for(const path of ['./SideCartDrawer.tsx','../themes/siora/SioraSideCartDrawer.tsx']){
 const line={productId:product.id,variantId:product.variants[0]!.id,slug:product.slug,title:product.title,variantTitle:'Küçük',quantity:2,unitPriceCents:12345,lineTotalCents:24690,available:true};
 const cart={version:2,currency:'TRY',itemCount:2,subtotalCents:24690,shippingCents:1000,totalCents:25690,checkoutReady:true,checkoutBlocker:null,items:[line]};let removals=0;
 const state={cart,loading:false,unavailable:false,drawerOpen:true,closeDrawer(){},replaceCart(){},refresh:async()=>true};
 const load=componentLoader({'next/link':{__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>React.createElement('a',props,children)},'@/lib/cart/client.ts':{storefrontCartClient:{remove:async()=>{removals++;return cart;}}},'../../lib/cart/client.ts':{storefrontCartClient:{remove:async()=>{removals++;return cart;}}},'@/lib/format.ts':{formatTry:(value:number)=>`₺${value}`},'@/lib/storefront-routes.ts':{productIndexPath:()=>'/products',productPath:(_locale:string,slug:string)=>`/products/${slug}`},'./CartStatusProvider':{useCartStatus:()=>state},'../../components/CartStatusProvider':{useCartStatus:()=>state},'./OrderBumpOffers':{OrderBumpOffers:()=>null},'../../components/OrderBumpOffers':{OrderBumpOffers:()=>null},'./FreeShippingProgress':{FreeShippingProgress:()=>null},'../../components/FreeShippingProgress':{FreeShippingProgress:()=>null}});
 const {CommercePolicyProvider:Provider}=load<{CommercePolicyProvider:Component}>(new URL('./CommercePolicyProvider.tsx',import.meta.url));const drawerModule=load<Record<string,Component>>(new URL(path,import.meta.url));const Drawer=Object.values(drawerModule)[0]!;
 const oldFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({suggestions:[]});
 try{await withProductBrowser(async({container,render,click})=>{if(path.includes('siora')){const proto=Object.getPrototypeOf(window.document.createElement('dialog'));proto.showModal=function(){this.open=true;};proto.close=function(){this.open=false;};}await render(React.createElement(Provider,{policy},React.createElement(Drawer,{presentation:{showQuantitySelector:true,showShippingProgress:true,freeShippingThresholdCents:50000},locale:'tr'})));assert.doesNotMatch(container.textContent??'',/₺|Ara toplam|Toplam|Ücretsiz|Ödemeye geç/);assert.equal(container.querySelector('a[href="/checkout"]'),null);const increase=container.querySelector<HTMLButtonElement>('button[aria-label$="adet artır"]');assert.equal(increase?.disabled,true);const remove=Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(item=>/^(Sil|Kaldır)$/.test(item.textContent??''));assert.ok(remove);await click(path.includes('siora')?'button[aria-label$="ürününü sil"]':'.side-cart-remove');assert.equal(removals,1);});}finally{globalThis.fetch=oldFetch;}
 }
});


test('the product card suppresses stale numeric prices and sale badges under a hidden policy',async()=>{
 const load=componentLoader({'next/link':{__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>React.createElement('a',props,children)}});
 const {CommercePolicyProvider:Provider}=load<{CommercePolicyProvider:Component}>(new URL('./CommercePolicyProvider.tsx',import.meta.url));
 const {ProductCardContent:Card}=load<{ProductCardContent:Component}>(new URL('./ProductCardContent.tsx',import.meta.url));
 await withProductBrowser(async({container,render})=>{await render(React.createElement(Provider,{policy},React.createElement(Card,{product:{...product,priceCents:10000,compareAtCents:20000},locale:'tr',cardStyle:'compact',imageRatio:'portrait'})));assert.doesNotMatch(container.textContent??'',/₺|İndirim/);assert.equal(container.querySelector('.price-row')===null,true);});
});
