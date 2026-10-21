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

type RequestButtonBrowser = Parameters<Parameters<typeof withProductBrowser>[0]>[0] & {
 requests:{input:unknown;resolve:(response:Response)=>void}[];
 show(props:Record<string,unknown>):Promise<void>;
 complete(index:number,preview:unknown):Promise<void>;
 message():string|null;
};
async function withRequestButton(run:(context:RequestButtonBrowser)=>Promise<void>, selectedPolicy = policy) {
 const load=componentLoader();const {CommercePolicyProvider:Provider}=load<{CommercePolicyProvider:Component}>(new URL('./CommercePolicyProvider.tsx',import.meta.url));const {WhatsAppOrderButton:Button}=load<{WhatsAppOrderButton:Component}>(new URL('./WhatsAppOrderButton.tsx',import.meta.url));
 const oldFetch=globalThis.fetch;const requests:{input:unknown;resolve:(response:Response)=>void}[]=[];
 globalThis.fetch=async(_url,init)=>new Promise<Response>(resolve=>requests.push({input:JSON.parse(String(init?.body)),resolve}));
 try { await withProductBrowser(async(browser)=>run({...browser,requests,show:(props:Record<string,unknown>)=>browser.render(React.createElement(Provider,{policy:selectedPolicy},React.createElement(Button,props))),complete:(index:number,preview:unknown)=>React.act(async()=>requests[index]!.resolve(Response.json({policy:selectedPolicy,storeName:'Örnek mağaza',...preview as object}))),message:()=>{const link=browser.container.querySelector<HTMLAnchorElement>('a');return link?new URL(link.href).searchParams.get('text'):null;}})); } finally {globalThis.fetch=oldFetch;}
}
const productRequest=(index:number,quantity:number)=>({product,variant:product.variants[index],quantity});
const productPreview=(index:number,quantity:number)=>({product,variantId:product.variants[index]!.id,quantity});
const requestCart=(version:number,quantity:number)=>({version,currency:'TRY',itemCount:quantity,subtotalCents:null,shippingCents:null,totalCents:null,pricesHidden:true,checkoutReady:false,checkoutBlocker:quantity?'whatsapp_only':'empty_cart',items:quantity?[{productId:product.id,variantId:product.variants[0]!.id,slug:product.slug,title:product.title,variantTitle:'Küçük',quantity,unitPriceCents:null,lineTotalCents:null,pricesHidden:true,available:true}]:[]});

const cartPreview=(version:number,quantity:number)=>{const cart=requestCart(version,quantity);return {cart,requestLines:cart.items.map(({title,variantTitle,slug,quantity,unitPriceCents,available})=>({title,variantTitle,slug,quantity,unitPriceCents,available}))};};

test('prepared product links disappear immediately when selected variant or quantity changes',async()=>{
 await withRequestButton(async({container,show,click,complete,message})=>{
  await show(productRequest(0,1));await click('button');await complete(0,productPreview(0,1));assert.match(message()??'',/Küçük — 1 adet/);
  await show(productRequest(1,1));assert.equal(container.querySelector('a')===null,true);assert.doesNotMatch(container.textContent??'',/Talebiniz hazır/);
  await click('button');await complete(1,productPreview(1,1));assert.match(message()??'',/Büyük — 1 adet/);
  await show(productRequest(1,2));assert.equal(container.querySelector('a')===null,true);await click('button');await complete(2,productPreview(1,2));assert.match(message()??'',/Büyük — 2 adet/);
 });
});

test('prepared cart requests disappear after a quantity change or the final removal',async()=>{
 await withRequestButton(async({container,show,click,complete,message})=>{
  await show({cart:requestCart(1,2)});await click('button');await complete(0,cartPreview(1,2));assert.match(message()??'',/2 adet/);
  await show({cart:requestCart(2,1)});assert.equal(container.querySelector('a')===null,true);await click('button');await complete(1,cartPreview(2,1));assert.match(message()??'',/1 adet/);
  await show({cart:requestCart(3,0)});assert.equal(container.querySelector('a')===null,true);assert.equal(container.querySelector<HTMLButtonElement>('button')?.disabled,true);
 });
});

test('late product previews cannot publish after a pending selection change or replace a newer request',async()=>{
 await withRequestButton(async({container,show,click,complete,message,requests})=>{
  await show(productRequest(0,1));await click('button');await show(productRequest(1,2));assert.equal(container.querySelector<HTMLButtonElement>('button')?.disabled,false);
  await click('button');assert.equal(requests.length,2);await complete(1,productPreview(1,2));assert.match(message()??'',/Büyük — 2 adet/);
  await complete(0,productPreview(0,1));assert.match(message()??'',/Büyük — 2 adet/);assert.doesNotMatch(message()??'',/Küçük — 1 adet/);
 });
});

test('a late cart preview cannot restore the request removed from the current cart',async()=>{
 await withRequestButton(async({container,show,click,complete})=>{
  await show({cart:requestCart(1,1)});await click('button');await show({cart:requestCart(2,0)});await complete(0,cartPreview(1,1));assert.equal(container.querySelector('a')===null,true);assert.doesNotMatch(container.textContent??'',/Talebiniz hazır/);
 });
});

for(const explicit of [false,true])test(`Siora production detail wrapper requires a chosen color unless query variant is explicit (${explicit})`,async()=>{
 const colorProduct:PublicProduct={...product,variants:product.variants.map((variant,index)=>({...variant,title:index?'Mavi':'Kırmızı',attributes:{color:index?'mavi':'kırmızı'}}))};
 const load=componentLoader({
  'next/link':{__esModule:true,default:({children,...props}:React.AnchorHTMLAttributes<HTMLAnchorElement>)=>React.createElement('a',props,children)},
  'next/navigation':{useRouter:()=>({push(){},back(){}}),usePathname:()=>'/products/ornek-urun'},
  '@/lib/product-description.ts':{renderStarterProductDescription(){return undefined;}},
  '@/lib/public-product-ordering.ts':{availableProductsFirst:(items:unknown)=>items},
  '@/lib/storefront-routes.ts':{productIndexPath:()=>'/products',categoryPath:()=>'/products'},
  '@/lib/cart/client.ts':{storefrontCartClient:{}},'@/lib/analytics/events.ts':{emitStorefrontCommerceEvent(){}},'@/lib/format.ts':{formatTry:(value:number|null)=>value===null?'':`₺${value}`},
  '../../components/CartStatusProvider':{useCartStatus:()=>({})},'../../components/FavoriteButton':{FavoriteButton:()=>null},
  '../../components/ProductCard':{ProductCard:()=>null},'../../components/ProductApprovedReviews':{ProductApprovedReviews:()=>null},
  './SioraProductGallery':{SioraProductGallery:()=>null},'./useCatalogScrollRestoration':{useCatalogScrollRestoration(){},sioraCatalogReturnRoute(){return null;}},
 });
 const {CommercePolicyProvider:Provider}=load<{CommercePolicyProvider:Component}>(new URL('./CommercePolicyProvider.tsx',import.meta.url));
 const {SioraProductDetailExperience:Detail}=load<{SioraProductDetailExperience:Component}>(new URL('../themes/siora/SioraProductDetailExperience.tsx',import.meta.url));
 await withProductBrowser(async({container,render,click})=>{
  await render(React.createElement(Provider,{policy},React.createElement(Detail,{product:colorProduct,initialVariantId:explicit?colorProduct.variants[1]!.id:undefined,storefrontId:'store',locale:'tr',relatedProducts:[],publishedPolicies:[],options:{...buildDefaultStarterPresentation({name:'Örnek'}).productDetail,mobileStickyPurchase:false},cardStyle:'compact',imageRatio:'portrait',showQuantitySelector:true})));
  const request=()=>Array.from(container.querySelectorAll<HTMLButtonElement>('button')).find(button=>button.textContent==='WhatsApp ile sipariş ver');assert.equal(request()?.disabled,!explicit);
  if(!explicit){await click('.swatches button[aria-label="Mavi"]');assert.equal(request()?.disabled,false);}assert.doesNotMatch(container.textContent??'',/₺|Sepete ekle|Şimdi satın al/);
 });
});

test('returning to the same selection does not revive an earlier pending generation',async()=>{
 await withRequestButton(async({container,show,click,complete})=>{
  await show(productRequest(0,1));await click('button');await show(productRequest(1,2));await show(productRequest(0,1));await complete(0,productPreview(0,1));assert.equal(container.querySelector('a')===null,true);assert.doesNotMatch(container.textContent??'',/Talebiniz hazır/);
 });
});

for(const shared of [false,true])test(`enabling WhatsApp never promotes an automatic gallery selection to a chosen variant (provider ${shared})`,async()=>{
 const load=componentLoader();const {CommercePolicyProvider:Policy}=load<{CommercePolicyProvider:Component}>(new URL('./CommercePolicyProvider.tsx',import.meta.url));const {ProductVariantMediaProvider:Variants,useProductVariantSelection:useSelection}=load<{ProductVariantMediaProvider:Component;useProductVariantSelection:(product:PublicProduct)=>readonly[string,(id:string)=>void]}>(new URL('./ProductVariantMedia.tsx',import.meta.url));
 function Probe(){const [id,select]=useSelection(product);return React.createElement('div',null,React.createElement('output',null,id),React.createElement('button',{onClick:()=>select(product.variants[1]!.id)},'Choose'));}
 await withProductBrowser(async({container,render,click})=>{
  const show=(currentPolicy:typeof policy)=>render(React.createElement(Policy,{policy:currentPolicy},shared?React.createElement(Variants,{product,fallbackVariantId:product.variants[0]!.id},React.createElement(Probe)):React.createElement(Probe)));
  await show(resolveStorefrontCommercePolicy(undefined));assert.equal(container.querySelector('output')?.textContent,product.variants[0]!.id);
  await show(policy);assert.equal(container.querySelector('output')?.textContent,'');await click('button');assert.equal(container.querySelector('output')?.textContent,product.variants[1]!.id);
  await show(resolveStorefrontCommercePolicy(undefined));await show(policy);assert.equal(container.querySelector('output')?.textContent,product.variants[1]!.id);
 });
});


test('cart WhatsApp requests use freshly validated lines despite price-driven checkout unavailability',async()=>{
 await withRequestButton(async({container,show,click,complete,message})=>{
  const cart=requestCart(1,2);cart.items[0]!.available=false;
  await show({cart});assert.equal(container.querySelector<HTMLButtonElement>('button')?.disabled,false);await click('button');await complete(0,cartPreview(1,2));assert.match(message()??'',/Küçük — 2 adet/);assert.doesNotMatch(message()??'',/₺|TRY/);
 });
});

test('visible cart messages use fresh line prices instead of stale checkout prices',async()=>{
 const visiblePolicy=resolveStorefrontCommercePolicy({schemaVersion:1,enabled:true,phone:'+905551112233',hidePrices:false,hideAddToCart:false,messageIntro:'Merhaba'});
 await withRequestButton(async({show,click,complete,message})=>{
  const hidden=requestCart(1,1);const {pricesHidden:_cartMarker,...base}=hidden;const {pricesHidden:_lineMarker,...line}=base.items[0]!;
  const cart={...base,subtotalCents:100,shippingCents:0,totalCents:100,checkoutBlocker:'stock_unavailable',items:[{...line,unitPriceCents:100,lineTotalCents:100,available:false}]};
  await show({cart});await click('button');await complete(0,{cart,requestLines:[{title:line.title,variantTitle:line.variantTitle,slug:line.slug,quantity:1,unitPriceCents:500,available:true}]});assert.match(message()??'',/5,00/);assert.doesNotMatch(message()??'',/1,00/);
 },visiblePolicy);
});

test('cart preview rejects malformed request lines and personal fields instead of building a link',async()=>{
 await withRequestButton(async({container,show,click,complete})=>{
  const valid=cartPreview(1,1);const line=valid.requestLines[0]!;
  const invalid=[undefined,[],[{...line,quantity:'1'}],[{...line,slug:'https://other.example'}],[{...line,unitPriceCents:500}],[{...line,available:false}],[{...line,email:'private@example.com'}]];
  await show({cart:requestCart(1,1)});
  for(const [index,requestLines] of invalid.entries()){await click('button');await complete(index,{cart:valid.cart,requestLines});assert.equal(container.querySelector('a')===null,true);assert.doesNotMatch(container.textContent??'',/Talebiniz hazır/);}
 });
});
