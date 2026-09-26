import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { createDefaultStarterThemeComposition, type PublicProduct } from "@celebix/saas-contracts";

async function load() {
  const summary = await readFile(new URL("./ProductDetailSummary.tsx", import.meta.url), "utf8");
  const summaryCode = ts.transpileModule(summary, {compilerOptions: {jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`);
  const summaryUrl = `data:text/javascript;base64,${Buffer.from(summaryCode).toString("base64")}`;
  const source = await readFile(new URL("./ProductDetailPresentation.tsx", import.meta.url), "utf8");
  const code = ts.transpileModule(source, { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText.replace('from "./ProductDetailSummary.tsx"', `from "${summaryUrl}"`).replace('from "react"', `from "${import.meta.resolve("react")}"`).replace('from "react/jsx-runtime"', `from "${import.meta.resolve("react/jsx-runtime")}"`);
  return await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
}
const product: PublicProduct = { id: "11000000-0000-4000-8000-000000000001", slug: "gercek-urun", title: "Gerçek ürün", currency: "TRY", status: "active", priceCents: 12000, available: true,
  description: "Katalog açıklaması", brand: {name: "Atlas",slug: "atlas"}, categoryPath: [{name:"Kolyeler",slug:"kolyeler"}],
  variants: [{id:"11000000-0000-4000-8000-000000000002", title:"Mavi / M", sku:"AT-M",priceCents:12000,stockTracking:false,stockQuantity:0,available:true,attributes:{color:"Mavi",size:"M"}}],
  media: [{id:"11000000-0000-4000-8000-000000000003",productId:"11000000-0000-4000-8000-000000000001",url:"https://media.example/actual.webp",mediaType:"image/webp",altText:"Gerçek fotoğraf",sortOrder:0}],
  reviews:[{reviewerName:"Ada",rating:5,body:"Gerçek yorum"}], merchandising:{highlights:["Pamuk"],certifications:["GOTS"],materialsAndCare:"Yıkama",sizeGuide:{heading:"Beden",body:"M: 40 cm"}}
};
test("real-product preview consumes every product setting and keeps purchase controls inert", async () => {
  const { ProductDetailPreview } = await load(); const options = createDefaultStarterThemeComposition().productDetail;
  const full = renderToStaticMarkup(createElement(ProductDetailPreview,{product, options, cart: {showQuantitySelector:true,showCheckoutReadiness:true,showShippingProgress:true}, mode:"mobile",relatedProducts:[product]}));
  for (const value of ["Gerçek ürün", "actual.webp", "AT-M", "Atlas", "Kolyeler", "Mavi / M", "Katalog açıklaması", "GOTS", "Gerçek yorum", "Benzer ürünler", "Beden", "data-mobile-purchase=\"true\""]) assert.ok(full.includes(value),value);
  assert.match(full, /disabled=""[^>]*>Sepete ekle/);
  const reduced = renderToStaticMarkup(createElement(ProductDetailPreview,{product,options:{...options,galleryStyle:"rail",showSku:false,showBrand:false,showBreadcrumbs:false,showRelatedProducts:false,showApprovedReviews:false,showSizeGuide:false,informationSections:[],mobileStickyPurchase:false},cart:{showQuantitySelector:false},mode:"mobile",relatedProducts:[product]}));
  for (const value of ["AT-M", "Atlas", "Kolyeler", "Katalog açıklaması", "GOTS", "Gerçek yorum", "Benzer ürünler", "M: 40 cm", "data-mobile-purchase=\"true\""]) assert.ok(!reduced.includes(value),value);
  assert.match(reduced,/data-gallery="rail"/);
});
