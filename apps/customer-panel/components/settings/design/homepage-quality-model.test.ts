import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultStarterThemeComposition,
  type HomepageSectionId,
  type StorefrontDesignDestinationOption,
  type StorefrontDesignAssetOption,
  type StorefrontDesignDocument,
  type StorefrontDesignMediaOption,
} from "@celebix/saas-contracts";

import { scoreHomepageQuality } from "./homepage-quality-model.ts";

const IMAGE = "40000000-0000-4000-8000-000000000001";
const HERO_ASSET = "40000000-0000-4000-8000-000000000002";
const CATEGORY_ASSET = "40000000-0000-4000-8000-000000000003";
const assets: readonly StorefrontDesignAssetOption[] = [{id:HERO_ASSET,kind:"hero",url:"https://fixture.invalid/hero.webp",altText:"Kampanya görseli",mediaType:"image/webp",width:1600,height:900},{id:CATEGORY_ASSET,kind:"category",url:"https://fixture.invalid/category.webp",altText:"Kategori görseli",mediaType:"image/webp",width:1200,height:800}];
const CATEGORY = "30000000-0000-4000-8000-000000000001";
const id = (value: string) => `home_${value}` as HomepageSectionId;

const media: readonly StorefrontDesignMediaOption[] = Object.freeze([
  Object.freeze({ id: IMAGE, url: "https://media.example.test/hero.webp", altText: "Altın takı koleksiyonu", mediaType: "image/webp", width: 1600, height: 900 }),
]);
const destinations: readonly StorefrontDesignDestinationOption[] = Object.freeze([
  Object.freeze({ kind: "collection", resourceId: CATEGORY, label: "Kolyeler", path: "/categories/kolyeler" }),
]);

function emptyDesign(): StorefrontDesignDocument {
  return Object.freeze({
    schemaVersion: 4,
    brand: Object.freeze({ logo: null, favicon: null, primaryColor: "#FFFFFF", accentColor: "#FFFFFF", backgroundColor: "#FFFFFF", textColor: "#FFFFFF", fontFamily: "inter" }),
    hero: Object.freeze({ enabled: false, slides: Object.freeze([{ headline: "", body: "", desktopImage: null, mobileImage: null, destination: Object.freeze({ kind: "none" as const }), enabled: false }]) }),
    promotion: Object.freeze({ headline: "Kampanya", body: "", destination: Object.freeze({ kind: "none" as const }), startsAt: null, endsAt: null, enabled: false }),
    announcement: Object.freeze({ items: Object.freeze(["Güvenli alışveriş"]), icon: "none", speed: "normal", direction: "left", animation: "continuous", enabled: false }),
    typography: Object.freeze({ headingFont: Object.freeze({ family: "Montserrat", category: "sans-serif", availableWeights: Object.freeze(["400", "700"]), source: "google" }), bodyFont: Object.freeze({ family: "Inter", category: "sans-serif", availableWeights: Object.freeze(["400", "700"]), source: "google" }), headingWeight: "700", bodyWeight: "400", headingSizePx: 48, bodySizePx: 16 }),
    composition: Object.freeze({ ...createDefaultStarterThemeComposition(), sections: Object.freeze([]) }),
  }) as StorefrontDesignDocument;
}

function completeDesign(): StorefrontDesignDocument {
  const base = emptyDesign();
  return Object.freeze({
    ...base,
    brand: Object.freeze({ ...base.brand, textColor: "#171717" }),
    hero: Object.freeze({ enabled: true, slides: Object.freeze([{ headline: "Yeni koleksiyon", body: "Zamansız tasarımlar", desktopImage: Object.freeze({ kind: "media" as const, mediaId: IMAGE }), mobileImage: null, destination: Object.freeze({ kind: "collection" as const, resourceId: CATEGORY }), enabled: true }]) }),
    composition: Object.freeze({
      ...base.composition,
      schemaVersion: 3,
      sections: Object.freeze([
        Object.freeze({ sectionId: id("categories_10"), kind: "category_grid" as const, enabled: true, heading: "Kategorileri keşfedin", categoryIds: Object.freeze([CATEGORY]), categoryImages: Object.freeze([{categoryId:CATEGORY,assetId:CATEGORY_ASSET}]), layout: "grid" as const }),
        Object.freeze({ sectionId: id("products_10"), kind: "product_row" as const, enabled: true, heading: "Yeni ürünler", source: "latest" as const, limit: 8 as const }),
        Object.freeze({ sectionId: id("values_100"), kind: "value_propositions" as const, enabled: true, items: Object.freeze([Object.freeze({ icon: "shield" as const, heading: "Güvenli alışveriş", body: "Güvenli mağaza akışı" }), Object.freeze({ icon: "truck" as const, heading: "Özenli teslimat", body: "Özenli paketleme" })]) }),
        Object.freeze({ sectionId: id("reviews_10"), kind: "testimonials" as const, enabled: true, heading: "Müşteri yorumları", source: "approved_product_reviews" as const, limit: 3 as const, minimumRating: 5 as const }),
        Object.freeze({ sectionId: id("story_100"), kind: "brand_story" as const, enabled: true, heading: "Hikâyemiz", body: "Markamızın zamansız hikâyesi", assetId: HERO_ASSET, destination: "/categories/kolyeler" }),
        Object.freeze({ sectionId: id("campaign_10"), kind: "split_campaign" as const, enabled: true, panels: Object.freeze([Object.freeze({ heading: "Kolyeleri keşfedin", assetId: HERO_ASSET, destination: "/categories/kolyeler" })]) }),
      ]),
    }),
  }) as StorefrontDesignDocument;
}

test("derives zero, partial and exact 100 point results without persisting a score", () => {
  const empty = scoreHomepageQuality({ design: emptyDesign(), media: [], destinations: [] });
  assert.equal(empty.score, 0);
  assert.equal(empty.label, "Başlangıç");
  assert.deepEqual(empty.categories.map(({ key, available }) => [key, available]), [["hero", 0], ["categories", 20], ["shopping", 20], ["trust", 15], ["content", 15], ["accessibility", 5]]);

  const partialDesign = emptyDesign();
  const partial = scoreHomepageQuality({ design: { ...partialDesign, brand: { ...partialDesign.brand, textColor: "#171717" }, composition: createDefaultStarterThemeComposition() }, media: [], destinations: [] });
  assert.equal(partial.score, 33);
  assert.equal(partial.label, "Başlangıç");

  const complete = scoreHomepageQuality({ design: completeDesign(), media, assets, destinations });
  assert.equal(complete.score, 100);
  assert.equal(complete.label, "Çok başarılı");
  assert.deepEqual(complete.recommendations, []);
  assert.equal(Object.hasOwn(completeDesign(), "qualityScore"), false);
});

test("hidden sections, missing resources and invalid destinations earn no misleading points", () => {
  const design = completeDesign();
  const hidden = {
    ...design,
    composition: { ...design.composition, sections: design.composition.sections.map((section) => ({ ...section, enabled: false })) },
  } as StorefrontDesignDocument;
  const result = scoreHomepageQuality({ design: hidden, media: [], destinations: [] });
  assert.equal(result.categories.find(({ key }) => key === "categories")?.earned, 0);
  assert.equal(result.categories.find(({ key }) => key === "shopping")?.earned, 0);
  assert.equal(result.categories.find(({ key }) => key === "trust")?.earned, 0);
  assert.equal(result.categories.find(({ key }) => key === "content")?.earned, 0);
  assert.equal(result.categories.find(({ key }) => key === "hero")?.earned, 0);
});

test("recommendations are deterministic, highest-value first and capped at five", () => {
  const first = scoreHomepageQuality({ design: emptyDesign(), media: [], destinations: [] });
  const second = scoreHomepageQuality({ design: emptyDesign(), media: [], destinations: [] });
  assert.deepEqual(first.recommendations, second.recommendations);
  assert.equal(first.recommendations.length, 5);
  assert.deepEqual(first.recommendations.map(({ points }) => points), [20, 20, 8, 8, 7]);
  assert.deepEqual(first.recommendations.slice(0, 3).map(({ code }) => code), ["homepage_add_categories", "homepage_add_products", "homepage_add_brand_story"]);
});

test("result is deeply frozen and scoring never mutates caller-owned inputs", () => {
  const design = completeDesign();
  const before = structuredClone(design);
  const result = scoreHomepageQuality({ design, media, assets, destinations });
  assert.deepEqual(design, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.categories), true);
  assert.equal(Object.isFrozen(result.categories[0]), true);
  assert.equal(Object.isFrozen(result.recommendations), true);
});


test("bannerless designs are scored against their applicable controls",()=>{
 const complete=completeDesign();const result=scoreHomepageQuality({design:{...complete,hero:{...complete.hero,enabled:false}},media,assets,destinations});
 assert.equal(result.score,100);assert.equal(result.categories.find(item=>item.key==="hero")?.available,0);assert.ok(!result.recommendations.some(item=>item.code==="homepage_add_hero"));
});

test("manual row quality requires available selected products and category quality requires mapped assets",()=>{
 const base=emptyDesign(),productId="50000000-0000-4000-8000-000000000001";
 const row={kind:"product_row" as const,sectionId:id("manual_1"),enabled:true,heading:"Seçtiklerim",source:"manual" as const,productIds:[],limit:12 as const};
 const score=(design:StorefrontDesignDocument,options:readonly StorefrontDesignDestinationOption[])=>scoreHomepageQuality({design,media:[],assets,destinations:options});
 const empty=score({...base,composition:{...base.composition,sections:[row]}},[]);assert.equal(empty.categories.find(item=>item.key==="shopping")?.earned,0);
 const product={kind:"product" as const,resourceId:productId,label:"Ürün",path:"/urun/urun",available:true};
 const selected={...base,composition:{...base.composition,sections:[{...row,productIds:[productId]}]}} as StorefrontDesignDocument;
 assert.equal(score(selected,[product]).categories.find(item=>item.key==="shopping")?.earned,20);assert.equal(score(selected,[{...product,available:false}]).categories.find(item=>item.key==="shopping")?.earned,0);
 const categorySection={kind:"category_grid" as const,sectionId:id("categories_1"),enabled:true,heading:"Kategoriler",layout:"grid" as const,categoryIds:[CATEGORY]};
 const categoryDesign={...base,composition:{...base.composition,sections:[categorySection]}} as StorefrontDesignDocument;
 assert.equal(score(categoryDesign,destinations).categories.find(item=>item.key==="categories")?.earned,0);
 assert.equal(score({...categoryDesign,composition:{...categoryDesign.composition,sections:[{...categorySection,categoryImages:[{categoryId:CATEGORY,assetId:CATEGORY_ASSET}]}]}},destinations).categories.find(item=>item.key==="categories")?.earned,20);
});

test("without referenced images quality does not request fictitious alternate text",()=>{
 const result=scoreHomepageQuality({design:emptyDesign(),media:[],assets:[],destinations:[]});assert.equal(result.categories.find(item=>item.key==="accessibility")?.available,5);assert.ok(!result.recommendations.some(item=>item.code==="homepage_add_alt_text"));
});
