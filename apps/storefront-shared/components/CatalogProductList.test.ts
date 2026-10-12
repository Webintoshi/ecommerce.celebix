import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { componentLoader, withProductBrowser } from "./product-variant-media-test-utils.ts";

const product = (n: number) => ({ id: `10000000-0000-4000-8000-${String(n).padStart(12,"0")}`, slug: `product-${n}`, title: `Ürün ${n}`, currency: "TRY", status: "active", priceCents: n * 100, available: true, media: [], variants: [{ id: `20000000-0000-4000-8000-${String(n).padStart(12,"0")}`, title: "Standart", priceCents: n * 100, stockTracking: false, stockQuantity: 0, available: true, attributes: {} }] });
const base = { products: [product(1),product(2)], total: 4, nextOffset: 24, path: "/urunler", locale: "tr", cardStyle: "compact", imageRatio: "portrait", selection: { query: "", filter: "all", order: "featured", offset: 0 } };
async function withList(run: (b: any) => Promise<void>) {
  const load = componentLoader({ "./ProductGrid": { ProductGrid: ({ products, preserveOrder }: any) => React.createElement("div", {"data-test-products":products.map((p: any)=>p.title).join(","),"data-preserve-order":String(preserveOrder)}) } });
  const { CatalogProductList: List } = load<{ CatalogProductList: React.ComponentType<any> }>(new URL("./CatalogProductList.tsx",import.meta.url));
  await withProductBrowser(async b => {
    const oldFetch = globalThis.fetch;
    let observer: any;
    const requests: any[] = [];
    (window as any).IntersectionObserver = class { constructor(callback: any) { observer = callback; } observe() {} disconnect() {} };
    const queue: any[] = [];
    globalThis.fetch = async (url, options) => { requests.push({url:String(url),options}); return new Promise((resolve,reject)=>queue.push({resolve,reject})); };
    const render = (props: any = {}) => b.render(React.createElement(List,{...base,...props}));
    try { await render(); await run({...b,render,requests,queue,notify:async()=>React.act(async()=>observer([{isIntersecting:true}]))}); }
    finally { globalThis.fetch = oldFetch; }
  });
}
test("intersection loads the next page once, appends in server order and removes paging controls", async () => {
  await withList(async ({container,notify,requests,queue})=>{
    await notify(); await notify();
    assert.equal(requests.length,1);
    assert.match(requests[0].url,/offset=24/);
    await React.act(async()=>queue[0].resolve(Response.json({items:[product(2),product(3)],total:4,nextOffset:null})));
    assert.equal(container.querySelector('[data-test-products]')?.getAttribute('data-test-products'),'Ürün 1,Ürün 2,Ürün 3');
    assert.equal(container.querySelector('[data-test-products]')?.getAttribute('data-preserve-order'),'true');
    assert.equal(container.querySelector('nav[aria-label="Ürün sayfaları"]'),null);
    await notify(); assert.equal(requests.length,1);
  });
});
test("changing filters aborts the old page and rejects a late response",async()=>{
  await withList(async({container,notify,requests,queue,render})=>{
    await notify();
    await render({products:[product(8)],selection:{...base.selection,filter:'available'},nextOffset:24});
    assert.equal(requests[0].options.signal.aborted,true);
    await React.act(async()=>queue[0].resolve(Response.json({items:[product(3)],total:4,nextOffset:null})));
    assert.equal(container.querySelector('[data-test-products]')?.getAttribute('data-test-products'),'Ürün 8');
  });
});
test("network failure preserves products, stops automatic retries and offers a retry",async()=>{
  await withList(async({container,notify,requests,queue,click})=>{
    await notify(); await React.act(async()=>queue[0].reject(new Error('network')));
    assert.equal(container.querySelector('[data-test-products]')?.getAttribute('data-test-products'),'Ürün 1,Ürün 2');
    assert.match(container.textContent??'',/Yeniden dene/);
    await notify(); assert.equal(requests.length,1);
    await click('button[data-catalog-retry]'); assert.equal(requests.length,2);
  });
});
test("returning to the same list restores appended products without another request",async()=>{
  await withList(async({container,notify,requests,queue,render})=>{
    await notify(); await React.act(async()=>queue[0].resolve(Response.json({items:[product(3)],total:4,nextOffset:null})));
    await render({path:'/products'}); await render();
    assert.equal(container.querySelector('[data-test-products]')?.getAttribute('data-test-products'),'Ürün 1,Ürün 2,Ürün 3');
    assert.equal(requests.length,1);
  });
});
test("a non-advancing continuation cannot create an automatic request loop",async()=>{
  await withList(async({container,notify,requests,queue})=>{
    await notify(); await React.act(async()=>queue[0].resolve(Response.json({items:[product(3)],total:4,nextOffset:24})));
    assert.equal(container.querySelector('[data-test-products]')?.getAttribute('data-test-products'),'Ürün 1,Ürün 2');
    assert.match(container.textContent??'',/Yeniden dene/);
    await notify(); assert.equal(requests.length,1);
  });
});
