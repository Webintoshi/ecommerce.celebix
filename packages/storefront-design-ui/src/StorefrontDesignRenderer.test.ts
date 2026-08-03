import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import type { StorefrontDesignDocument } from "@celebix/saas-contracts";

import { createPreviewStorefrontDesign, isStorefrontPromotionActive } from "./model.ts";

const MEDIA = "70000000-0000-4000-8000-000000000001";
const DESTINATION = "80000000-0000-4000-8000-000000000001";
const NOW = "2026-08-03T09:00:00.000Z";
const DESIGN: StorefrontDesignDocument = { schemaVersion: 1, brand: { logo: { kind: "media", mediaId: MEDIA }, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" }, hero: { headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", image: { kind: "media", mediaId: MEDIA }, destination: { kind: "product", resourceId: DESTINATION }, enabled: true }, promotion: { headline: "Yaz fırsatı", body: "Seçili ürünlerde", destination: { kind: "none" }, startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-08-10T00:00:00.000Z", enabled: true }, announcement: { items: ["Ücretsiz kargo", "Güvenli ödeme"], icon: "truck", speed: "normal", direction: "left", animation: "continuous", enabled: true } };

test("preview resolves only tenant media and destination options into the public renderer contract", () => {
  const selected = createPreviewStorefrontDesign({ draft: DESIGN, publishedVersion: 3, publishedAt: NOW, media: [{ id: MEDIA, url: "https://media.example/guzide.png", altText: "Güzide", mediaType: "image/png", width: 1200, height: 800 }], destinations: [{ kind: "product", resourceId: DESTINATION, label: "Altın Kolye", path: "/products/altin-kolye" }] });
  assert.equal(selected.hero.image?.url, "https://media.example/guzide.png");
  assert.equal(selected.hero.destination?.path, "/products/altin-kolye");
  assert.equal(JSON.stringify(selected).includes(MEDIA), false);
  assert.equal(JSON.stringify(selected).includes(DESTINATION), false);
});

test("preview fails closed when a draft references deleted media or destination", () => {
  assert.throws(() => createPreviewStorefrontDesign({ draft: DESIGN, publishedVersion: 3, publishedAt: NOW, media: [], destinations: [] }), /storefront_design_preview_invalid/);
});

test("promotion activity uses the exact enabled UTC interval", () => {
  const publicDesign = createPreviewStorefrontDesign({ draft: { ...DESIGN, brand: { ...DESIGN.brand, logo: null }, hero: { ...DESIGN.hero, image: null, destination: { kind: "none" } } }, publishedVersion: 3, publishedAt: NOW, media: [], destinations: [] });
  assert.equal(isStorefrontPromotionActive(publicDesign.promotion, new Date(NOW)), true);
  assert.equal(isStorefrontPromotionActive(publicDesign.promotion, new Date("2026-08-20T00:00:00.000Z")), false);
  assert.equal(isStorefrontPromotionActive({ ...publicDesign.promotion, enabled: false }, new Date(NOW)), false);
});

test("renderer source owns exact brand tokens and no unsafe HTML path", async () => {
  const source = await readFile(new URL("./StorefrontDesignRenderer.tsx", import.meta.url), "utf8");
  for (const token of ["--store-primary", "--store-accent", "--store-background", "--store-text"]) assert.match(source, new RegExp(token));
  assert.match(source, /isStorefrontPromotionActive/);
  assert.match(source, /design[.]announcement[.]enabled/);
  assert.match(source, /design[.]hero[.]enabled/);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML|mediaId|resourceId/);
});
