import assert from "node:assert/strict";
import test from "node:test";
import {mapDraftVariantGalleries} from "./variant-media-completion.ts";
test("uploaded gallery IDs map to actual created variants by attributes despite repeated titles and reordered responses",()=>{
 const drafts=[{title:"Aynı",attributes:{renk:"Kırmızı",beden:"S"},mediaIds:["local-second","local-first"]},{title:"Aynı",attributes:{renk:"Mavi",beden:"S"},mediaIds:[]}];
 const created=[{id:"blue",title:"Aynı",attributes:{beden:"S",renk:"Mavi"}},{id:"red",title:"Aynı",attributes:{renk:"Kırmızı",beden:"S"}}];
 assert.deepEqual(mapDraftVariantGalleries(drafts,created,{"local-first":"actual-first","local-second":"actual-second"}),[{variantId:"red",mediaIds:["actual-second","actual-first"]},{variantId:"blue",mediaIds:[]}]);
});
test("ambiguous attribute matches and missing uploaded IDs abort gallery assignment",()=>{
 assert.throws(()=>mapDraftVariantGalleries([{attributes:{},mediaIds:["local"]}],[{id:"first",attributes:{}},{id:"second",attributes:{}}],{local:"real"}),/varyant/);
 assert.throws(()=>mapDraftVariantGalleries([{attributes:{},mediaIds:["missing"]}],[{id:"first",attributes:{}}],{}),/yüklen/);
});
test("variants without explicit gallery keep the general product gallery",()=>{
 assert.deepEqual(mapDraftVariantGalleries([{attributes:{renk:"Kırmızı"}}],[{id:"red",attributes:{renk:"Kırmızı"}}],{}),[]);
});
