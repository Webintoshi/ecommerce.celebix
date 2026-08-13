import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (name: string) => readFile(new URL(name, import.meta.url), "utf8");

test("home exhaustively renders the finite public retail section union", async () => { const source = await read("CampaignHome.tsx"); for (const kind of ["hero", "category_grid", "product_row", "split_campaign", "brand_story", "value_propositions", "testimonials"]) assert.match(source, new RegExp(`case [\"']${kind}[\"']`)); assert.match(source, /CampaignValuePropositions/); assert.match(source, /CampaignTestimonials/); assert.match(source, /assertNever/); });
test("empty optional sections do not create blank storefront bands", async () => { const module = await import("./campaign-home-sections.ts"); const presentation = { schemaVersion: 3, sections: [{ kind: "hero", slides: [{ heading: "Hero", destination: "/products" }] }, { kind: "category_grid", heading: "Kategoriler", layout: "grid", items: [] }, { kind: "product_row", key: "empty", heading: "Boş", source: "latest", limit: 4 }, { kind: "split_campaign", panels: [] }, { kind: "value_propositions", items: [] }, { kind: "testimonials", heading: "Yorumlar", items: [] }] }; assert.deepEqual(module.visibleCampaignSectionKinds({ presentation, productRows: [{ key: "empty", items: [] }] } as never), ["hero"]); });
test("an intentionally empty homepage exposes no visible campaign sections", async () => {
  const module = await import("./campaign-home-sections.ts");
  const presentation = { schemaVersion: 3, sections: [] };
  assert.deepEqual(module.visibleCampaignSectionKinds({ presentation, productRows: [] } as never), []);
  const source = await read("CampaignHome.tsx");
  assert.match(source, /aria-label="Mağaza ana sayfası"/);
  assert.match(source, /data-empty-home/);
});
test("hero uses stable desktop mobile media and canonical hotspot", async () => { const source = await read("CampaignHero.tsx"); for (const token of ["<picture", "mobileImage", "desktopImage", "width=", "height=", "hotspot.productSlug", "hotspot.priceCents"]) assert.match(source, new RegExp(token)); });
test("hero rotation is explicit scroll snap without autoplay", async () => { const [client, css] = await Promise.all([read("CampaignHeroClient.tsx"), read("campaign-home.module.css")]); assert.match(client, /scrollBy/); assert.match(client, /Önceki slayt/); assert.match(client, /Sonraki slayt/); assert.doesNotMatch(client, /setInterval|autoplay/); assert.match(css, /scroll-snap-type/); });
test("category and campaign panels use only locale-aware safe public destinations", async () => { const source = await read("CampaignPanels.tsx"); assert.match(source, /categoryPath\(locale, item[.]slug\)/); assert.match(source, /localizeStorefrontPath\(panel[.]destination, locale\)/); assert.doesNotMatch(source, /assetId|categoryId|storeId|tenantId/); });
test("category showcase renders only the persisted duo or grid layout with responsive image ratios", async () => {
  const [source, css] = await Promise.all([read("CampaignPanels.tsx"), read("campaign-home.module.css")]);
  assert.match(source, /section[.]layout === "duo"/);
  assert.match(source, /categoryGridDuo/);
  assert.match(source, /categoryGridGrid/);
  assert.match(source, /data-layout=\{section[.]layout\}/);
  assert.match(css, /[.]categoryGridDuo\s*\{[^}]*grid-template-columns:\s*repeat\(2,/u);
  assert.match(css, /[.]categoryGridGrid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/u);
  assert.match(css, /[.]categoryGridDuo\s*>\s*a\s*\{[^}]*aspect-ratio:\s*3\s*\/\s*2/u);
  assert.match(css, /[.]categoryGridGrid\s*>\s*a\s*\{[^}]*aspect-ratio:\s*1/u);
  assert.match(css, /[.]categoryGrid img\s*\{[^}]*height:\s*100%/u);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*[.]categoryGridDuo\s*\{[^}]*grid-template-columns:\s*1fr/u);
  assert.match(css, /@media\(max-width:700px\)[\s\S]*[.]categoryGridDuo\s*>\s*a\s*\{[^}]*aspect-ratio:\s*4\s*\/\s*3/u);
  assert.match(css, /@media\(max-width:339px\)[\s\S]*[.]categoryGridGrid\s*\{[^}]*grid-template-columns:\s*1fr/u);
});
test("campaign home mounts the durable category showcase once without navigation fallback", async () => {
  const source = await read("CampaignHome.tsx");
  assert.match(source, /composeCampaignHomeSections\(presentation/);
  assert.doesNotMatch(source, /presentation[.]navigation|deriveJewelryCategoryPlaceholders|JewelryCategoryPlaceholders|PLACEHOLDER/);
  assert.doesNotMatch(source, /tenantId|storeId|categoryId|assetId/);
});
test("durable category showcase replaces stale composition content and preserves exact order", async () => {
  const module = await import("./campaign-home-sections.ts");
  const image = Object.freeze({ url: "https://media.saas-staging.celebix.site/stores/10000000-0000-4000-8000-000000000001/storefront/category/70000000-0000-4000-8000-000000000001.webp", mediaType: "image/webp", altText: "Kategori", width: 896, height: 1195 });
  const presentation = {
    schemaVersion: 3,
    categoryShowcase: { heading: "Tek kaynak", layout: "duo", items: [
      { id: "60000000-0000-4000-8000-000000000002", name: "Yüzükler", slug: "yuzukler", image },
      { id: "60000000-0000-4000-8000-000000000001", name: "Kolyeler", slug: "kolyeler", image },
    ] },
    sections: [
      { kind: "product_row", key: "latest", heading: "Ürünler", source: "latest", limit: 4 },
      { kind: "category_grid", heading: "Eski içerik", layout: "grid", items: [{ name: "Menüden gelen", slug: "menu", image }] },
      { kind: "value_propositions", items: [] },
    ],
  };
  const sections = module.composeCampaignHomeSections(presentation as never, false);
  const categories = sections.filter(({ kind }) => kind === "category_grid");
  assert.equal(categories.length, 1);
  assert.deepEqual(categories[0], { kind: "category_grid", heading: "Tek kaynak", layout: "duo", items: [
    { name: "Yüzükler", slug: "yuzukler", image },
    { name: "Kolyeler", slug: "kolyeler", image },
  ] });
  assert.equal(Object.isFrozen(categories[0]), true);
});
test("durable showcase never invents a category section outside the merchant order", async () => {
  const module = await import("./campaign-home-sections.ts");
  const presentation = {
    schemaVersion: 3,
    categoryShowcase: { heading: "Kategori", layout: "grid", items: [{ name: "Kolyeler", slug: "kolyeler", image: { url: "https://media.saas-staging.celebix.site/category.webp", mediaType: "image/webp", altText: "Kategori", width: 800, height: 800 } }] },
    sections: [
      { kind: "product_row", sectionId: "home_product_row_one", key: "latest-one", heading: "Bir", source: "latest", limit: 4 },
      { kind: "product_row", sectionId: "home_product_row_two", key: "latest-two", heading: "İki", source: "latest", limit: 4 },
    ],
  };
  const sections = module.composeCampaignHomeSections(presentation as never, false);
  assert.deepEqual(sections.map(({ sectionId }) => sectionId), ["home_product_row_one", "home_product_row_two"]);
  assert.deepEqual(sections.map((section, index) => module.campaignHomeSectionKey(section, index)), ["home_product_row_one", "home_product_row_two"]);
  assert.equal(sections.some(({ kind }) => kind === "category_grid"), false);
});
test("product rows bind exact projection keys to canonical product cards", async () => { const source = await read("CampaignProductRow.tsx"); assert.match(source, /section[.]key/); assert.match(source, /ProductGrid/); assert.match(source, /products/); assert.doesNotMatch(source, /Math[.]random|fake|mock/); });
test("home page resolves campaign projection only through server page context", async () => { const [page, context, campaignResolution] = await Promise.all([read("../app/page.tsx"), read("../lib/page-context.ts"), read("../lib/campaign-page-resolution.ts")]); assert.match(page, /context[.]campaign/); assert.match(context, /resolveCampaignPageProjection/); assert.match(campaignResolution, /resolveCampaignHome/); assert.doesNotMatch(`${page}\n${context}\n${campaignResolution}`, /localStorage|sessionStorage|x-store-id|tenantId/); });
test("published design banner augments campaign sections without a duplicate hero", async () => {
  const [source, sections] = await Promise.all([
    read("CampaignHome.tsx"),
    read("campaign-home-sections.ts"),
  ]);
  assert.match(source, /designHeroActive\s*=\s*design[.]publicationVersion > 1/);
  assert.match(source, /composeCampaignHomeSections\(presentation, designHeroActive\)/);
  assert.match(sections, /designHeroActive\s*\?\s*presentation[.]sections[.]filter/);
  assert.match(sections, /section[.]kind !== "hero"/);
  assert.match(source, /<StorefrontDesignRenderer/);
  assert.match(source, /showHeader=\{false\}/);
  assert.match(source, /sections[.]map/);
  assert.doesNotMatch(source, /designHeroActive\s*\?\s*null\s*:\s*<CampaignHome/);
});
test("campaign announcement keeps its exact safe destination and visual controls reach the storefront", async () => {
  const [home, frame, model, css, campaignCss] = await Promise.all([read("CampaignHome.tsx"), read("StorefrontFrame.tsx"), read("campaign-ui-model.ts"), read("../app/globals.css"), read("campaign-home.module.css")]);
  assert.match(home, /announcement[.]destination/);
  assert.match(home, /href=\{localizeStorefrontPath\(announcement[.]destination, storefront[.]locale\)\}/);
  assert.match(home, /campaignAnnouncement\(presentation\)/);
  assert.match(frame, /campaignFrameSettings\(storefront[.]presentation\)/);
  assert.match(frame, /presentation=\{campaign[.]cart\}/);
  assert.match(model, /presentation[.]visual[.]cornerStyle/);
  assert.match(css, /--campaign-corner/);
  assert.match(css, /[.]campaign-storefront [.]product-card[.]card-compact [.]product-image-shell\s*\{[^}]*border-radius:\s*var\(--campaign-corner\)/u);
  assert.match(campaignCss, /var\(--campaign-corner/);
});
test("campaign home remains responsive stable and reduced-motion safe", async () => { const css = await read("campaign-home.module.css"); assert.match(css, /aspect-ratio/); assert.match(css, /@media\(max-width:700px\)/); assert.match(css, /prefers-reduced-motion/); assert.match(css, /min-height:\s*48px/); });
test("retail footer consumes only resolved links reviews and newsletter authority", async () => { const source = await read("RetailFooter.tsx"); assert.match(source, /presentation[.]footer/); assert.match(source, /NewsletterForm/); assert.match(source, /link[.]destination/); assert.doesNotMatch(source, /https:\/\/|instagram[.]com\/|FIXED_STOREFRONT_POLICIES|tenantId|storeId/); });
test("retail newsletter is a distinct full-width storefront band", async () => { const source = await read("RetailFooter.tsx"); assert.match(source, /retail-footer-newsletter-band/); assert.match(source, /retail-footer-newsletter-inner/); });
test("retail footer exposes accessible mobile disclosure groups", async () => { const [source, css] = await Promise.all([read("RetailFooter.tsx"), read("../app/globals.css")]); assert.match(source, /<details/); assert.match(source, /<summary/); assert.match(source, /retail-footer-mobile/); assert.match(css, /[.]retail-footer-mobile/); assert.match(css, /min-height:\s*48px/); });
