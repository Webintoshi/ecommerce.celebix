import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

test("an empty favorite list offers a localized product link instead of product preparation text",async()=>{
  const load=componentLoader({
    'next/link':{__esModule:true,default:({children,...props}:any)=>React.createElement('a',props,children)},
    './ProductGrid':{ProductGrid:()=>React.createElement('div',null,'Ürünler hazırlanıyor')},
    '@/lib/favorites.ts':{favoritesStorageKey:()=> 'favorites',parseFavoriteProductIds:()=>[],parseFavoriteResolutionResponse:()=>[],reconcileFavoriteProductIds:()=>[]}
  });
  const {FavoritesPageClient:Favorites}=load<{FavoritesPageClient:React.ComponentType<any>}>(new URL('./FavoritesPageClient.tsx',import.meta.url));
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({outcome:'anonymous'});
  try{await withProductBrowser(async({container,render})=>{
    await render(React.createElement(Favorites,{locale:'tr',cardStyle:'compact',imageRatio:'portrait'}));
    assert.ok(!container.textContent?.includes('Ürünler hazırlanıyor'));
    assert.equal(container.querySelector('a')?.textContent,'Tüm ürünleri gör');
    assert.equal(container.querySelector('a')?.getAttribute('href'),'/urunler');
  });}finally{globalThis.fetch=previous;}
});
