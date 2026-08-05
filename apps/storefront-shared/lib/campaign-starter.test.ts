import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../../..");
const read = (file: string) => readFile(path.join(ROOT, file), "utf8");
const CAMPAIGN_SOURCES = Object.freeze([
  "apps/storefront-shared/components/CampaignHeader.tsx",
  "apps/storefront-shared/components/CampaignHeaderClient.tsx",
  "apps/storefront-shared/components/CampaignHero.tsx",
  "apps/storefront-shared/components/CampaignHome.tsx",
  "apps/storefront-shared/components/CampaignPanels.tsx",
  "apps/storefront-shared/components/CampaignProductRow.tsx",
  "apps/storefront-shared/components/ProductCard.tsx",
  "apps/storefront-shared/components/ProductQuickView.tsx",
  "apps/storefront-shared/components/ProductDetailExperience.tsx",
  "apps/storefront-shared/components/SideCartDrawer.tsx",
]);

async function campaignSources(): Promise<readonly string[]> {
  return Promise.all(CAMPAIGN_SOURCES.map(read));
}

test("campaign starter keeps every application-owned destination same-store relative", async () => {
  for (const source of await campaignSources()) {
    assert.doesNotMatch(source, /https?:\/\//u);
    assert.doesNotMatch(source, /(?:href|destination)\s*=\s*["'`]\/\//u);
  }
});

test("responsive campaign controls preserve the exact 320 1024 and 1025 boundaries", async () => {
  const [globalCss, headerCss, headerClient, homeCss] = await Promise.all([
    read("apps/storefront-shared/app/globals.css"),
    read("apps/storefront-shared/components/campaign-header.module.css"),
    read("apps/storefront-shared/components/CampaignHeaderClient.tsx"),
    read("apps/storefront-shared/components/campaign-home.module.css"),
  ]);
  assert.match(globalCss, /body\s*\{[^}]*min-width:\s*320px/u);
  assert.match(headerCss, /[.]desktopNav\{[^}]*display:flex/u);
  assert.match(headerCss, /@media\(max-width:1024px\)\{[^}]*[\s\S]*?[.]desktopNav\{display:none/u);
  assert.match(headerCss, /@media\(max-width:1024px\)\{[.]container\[data-header-layout\]\{[^}]*grid-template-areas:"logo actions"[^}]*gap:3px/u);
  assert.match(headerCss, /[.]wordmark\{[^}]*min-width:0[^}]*overflow:hidden/u);
  assert.match(headerClient, /pathname\s*===\s*["']\/["']\s*\?\s*["']["']\s*:\s*styles[.]nonHome/u);
  assert.match(headerCss, /[.]header\[data-header-style=["']overlay["']\]\s+[.]bar[.]nonHome\{[^}]*position:relative/u);
  assert.match(`${globalCss}\n${headerCss}\n${homeCss}`, /min-(?:width|height):\s*48px/u);
  assert.match(globalCss, /[.]footer-grid a\s*\{[^}]*min-height:\s*48px/u);
  assert.match(`${globalCss}\n${headerCss}\n${homeCss}`, /prefers-reduced-motion/u);
  assert.match(`${globalCss}\n${headerCss}\n${homeCss}`, /[.]01ms/u);
});

test("campaign browser sources contain no private tenant or donor authority", async () => {
  const source = (await campaignSources()).join("\n");
  assert.doesNotMatch(source, /tenantId|storeId|objectKey|x-forwarded|document[.]cookie|localStorage|sessionStorage/iu);
  assert.doesNotMatch(source, /shopify|impulse|archetype/iu);
  assert.doesNotMatch(source, /dangerouslySetInnerHTML/u);
});

test("empty sections and missing media resolve to truthful bounded fallbacks", async () => {
  const [home, row, card, quickView] = await Promise.all([
    read("apps/storefront-shared/components/CampaignHome.tsx"),
    read("apps/storefront-shared/components/CampaignProductRow.tsx"),
    read("apps/storefront-shared/components/ProductCard.tsx"),
    read("apps/storefront-shared/components/ProductQuickView.tsx"),
  ]);
  assert.match(home, /section[.]slides[.]length\s*\?[^:]+:\s*null/u);
  assert.match(home, /section[.]items[.]length\s*\?[^:]+:\s*null/u);
  assert.match(home, /section[.]panels[.]length\s*\?[^:]+:\s*null/u);
  assert.match(row, /if\s*\(!products[.]length\)\s*return null/u);
  assert.match(card, /Görsel yakında/u);
  assert.match(quickView, /Görsel yakında/u);
});
