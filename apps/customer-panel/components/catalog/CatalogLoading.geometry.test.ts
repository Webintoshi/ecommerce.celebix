import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { compile, effectiveCss } from "../../lib/mira-final-test-support.ts";
import { withEditor } from "../settings/design/design-editor-test-utils.ts";

test("catalog loading fixtures reserve matching list, editor and preview regions at all panel widths",async()=>{
 const Component=compile("components/catalog/CatalogWorkspaceLoading.tsx").CatalogWorkspaceLoading;
 await withEditor(async({container,render})=>{
  for(const [layout,height] of [["list","360px"],["editor","640px"],["product","640px"],["preview","480px"]] as const){
   await render(React.createElement(Component,{layout,label:"Yükleniyor"}));
   assert.equal(container.querySelector('[role="status"]')?.getAttribute("aria-label"),"Yükleniyor");
   assert.equal(container.querySelectorAll('input,button,textarea,select').length,0);
   for(const width of [1440,1024,390]){
    const css=effectiveCss("components/catalog/catalog-workspace-loading.module.css",container.innerHTML,`[data-catalog-loading="${layout}"]`,width);
    assert.equal(css.minHeight,height);assert.notEqual(css.overflow,"hidden");
    if(layout==="list"){
     assert.equal(container.querySelectorAll('.row').length,5);
     const row=effectiveCss("components/catalog/catalog-workspace-loading.module.css",container.innerHTML,'.row',width);
     assert.equal(row.minHeight,width===390?"112px":"64px");
    }
   }
  }
 });
});

test("product list wrapper can shrink at 1024px while the table keeps its local horizontal scroller",()=>{
 const html='<section class="catalogRoot catalog-page product-operations-page"><div class="listBody"><div class="catalog-table-shell"><table class="catalog-table"><tbody><tr><td>Ürün</td></tr></tbody></table></div></div></section>';
 const wrapper=effectiveCss("components/catalog/catalog-operations.module.css",html,'.listBody',1024);
 assert.equal(wrapper.minWidth,"0");
 assert.equal(wrapper.minHeight,"600px");
 assert.notEqual(wrapper.overflow,"hidden");
 assert.equal(effectiveCss("app/globals.css",html,'.catalog-page',1024).display,"grid");
 assert.equal(effectiveCss("app/globals.css",html,'.catalog-table-shell',1024).overflowX,"auto");
 assert.equal(effectiveCss("components/catalog/catalog-operations.module.css",html,'.catalog-table',1024).minWidth,"1120px");
});
