import assert from "node:assert/strict";
import test from "node:test";
import { buildDefaultStarterPresentation, type PublicStorefrontDesign, type PublicStarterThemePresentationV3, type PublicProduct } from "@celebix/saas-contracts";
import { LILYUM_STOREFRONT_ID, lilyumThemeFor } from "../themes/lilyum/theme.ts";
import { LILYUM_HERO_ASSET, LILYUM_COPY, lilyumHomeModel, lilyumAnnouncement, lilyumBrandTokens } from "../themes/lilyum/lilyum-model.ts";

const base = buildDefaultStarterPresentation({ name: "Lilyum Flora Ordu" });
const design = { publicationVersion: 2, hero: { enabled: false, slides: [] }, announcement: { enabled: true, items: ["Ordu İçerisine 60 Dakika İçinde Teslim"] } } as unknown as PublicStorefrontDesign;
const presentation = { ...base, announcement: { items: ["Ordu İçerisine 60 Dakika İçinde Teslim"] }, sections: [{ kind: "banner", slides: [{ enabled: true, headline: "Lilyum Flora Ordu", body: "", desktopImage: { url: "https://media.example/e89e5b56-0c5a-5a96-b33d-4daf6234c84c.jpg" }, mobileImage: null, destination: "/products" }] }, { kind: "product_row", key: "selection", heading: "Lilyumlar", source: "manual", limit: 4 }] } as unknown as PublicStarterThemePresentationV3;

test("Lilyum identity cannot match another tenant, a slug or an untrusted hostname", () => {
  assert.equal(lilyumThemeFor({ id: LILYUM_STOREFRONT_ID }), "lilyum-deniz");
  for (const id of ["lilyum-flora", "lilyumflora.net", "a828862c-4cc1-475a-89cc-5fbee31eb43f", "ff465e64-1491-40ef-8840-c66281155a1d"]) assert.equal(lilyumThemeFor({ id }), undefined);
});
test("accepted defaults replace only the original hero while composed banners survive an inactive design hero", () => {
  const model = lilyumHomeModel(presentation, design);
  assert.equal(model.hero.enabled, true);
  assert.equal(model.hero.image, LILYUM_HERO_ASSET);
  assert.equal(model.hero.heading, LILYUM_COPY.heading);
  assert.equal(lilyumAnnouncement(presentation, design), "Ordu’da aynı gün çiçek teslimatı");
});
test("a future admin image, headline, destination and announcement are authoritative", () => {
  const changed = { ...design, hero: { enabled: true, slides: [{ headline: "Yeni koleksiyon", body: "Admin açıklaması", desktopImage: { url: "https://media.example/new.webp", altText: "Yeni" }, mobileImage: { url: "https://media.example/mobile.webp", altText: "Mobil" }, destination: { path: "/kategori/guller" } }] }, announcement: { ...design.announcement, items: ["Özel gün seçkisi"] } };
  const model = lilyumHomeModel(presentation, changed);
  assert.equal(model.hero.image, "https://media.example/new.webp");
  assert.equal(model.hero.mobileImage, "https://media.example/mobile.webp");
  assert.equal(model.hero.heading, "Yeni koleksiyon");
  assert.equal(model.hero.body, "Admin açıklaması");
  assert.equal(model.hero.destination, "/kategori/guller");
  assert.equal(lilyumAnnouncement({ ...presentation, announcement: { items: ["Özel gün seçkisi"] } }, changed), "Özel gün seçkisi");
});
test("removed home sections do not reappear, and unavailable items are not advertised", () => {
  assert.equal(lilyumHomeModel({ ...presentation, sections: [] }, design).hero.enabled, false);
  const items = [{ id: "a", title: "Admin başlığı", priceCents: 177700, available: true }, { id: "b", available: false }] as unknown as PublicProduct[];
  const model = lilyumHomeModel(presentation, design, { presentation, productRows: [{ key: "selection", items }] });
  assert.equal(model.productRows[0].heading, "Bugünün çiçek seçkisi");
  assert.deepEqual(model.productRows[0].products, [items[0]]);
  assert.equal(model.productRows[0].products[0].title, "Admin başlığı");
  assert.equal(model.productRows[0].products[0].priceCents, 177700);
});

test("admin color changes and multi-slide campaigns survive the accepted defaults", () => {
  const branded = { ...design, brand: { primaryColor: "#123456", backgroundColor: "#FAFAFA", textColor: "#222222", accentColor: "#BB9944" } } as PublicStorefrontDesign;
  assert.equal(lilyumBrandTokens(branded)["--store-lilyum-primary"], "#123456");
  assert.equal(lilyumBrandTokens(branded)["--store-lilyum-background"], "#FAFAFA");
  const multi = { ...presentation, sections: presentation.sections.map(section => section.kind === "banner" ? { ...section, slides: [...section.slides, { ...section.slides[0], slideId: "new", headline: "New campaign" }] } : section) };
  const model = lilyumHomeModel(multi, design);
  assert.equal(model.multiHeroSection?.kind, "banner");
  if (model.multiHeroSection?.kind === "banner") assert.equal(model.multiHeroSection.slides.length, 2);
});

test("version four composition remains authoritative over retired generic hero fields", () => {
  const retired = { ...design, hero: { enabled: true, slides: [{ headline: "Retired generic hero", body: "Old", desktopImage: { url: "https://media.example/retired.jpg", altText: "Old" }, mobileImage: null, destination: null }] } };
  const model = lilyumHomeModel({ ...presentation, schemaVersion: 4 }, retired);
  assert.equal(model.hero.image, LILYUM_HERO_ASSET);
  assert.equal(model.hero.heading, LILYUM_COPY.heading);
});
