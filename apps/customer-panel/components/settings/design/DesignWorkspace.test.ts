import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { createDefaultStarterThemeComposition } from "@celebix/saas-contracts";
import { applyDesignEdit, beginDesignSave, completeDesignSave, createDesignEditorState } from "./workspace-model.ts";

const NOW = "2026-08-03T09:00:00.000Z";
const TYPOGRAPHY = { headingFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" }, bodyFont: { family: "Manrope", category: "sans-serif", availableWeights: ["400", "500", "600", "700", "800"], source: "google" }, headingWeight: "700", bodyWeight: "400", headingSizePx: 40, bodySizePx: 16 } as const;
const DESIGN = { schemaVersion: 3, brand: { logo: null, favicon: null, primaryColor: "#FF5A00", accentColor: "#171717", backgroundColor: "#FFFFFF", textColor: "#171717", fontFamily: "manrope" }, typography: TYPOGRAPHY, hero: { enabled: true, slides: [{ headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", desktopImage: null, mobileImage: null, destination: { kind: "none" }, enabled: true }] }, promotion: { headline: "Yeni sezon", body: "", destination: { kind: "none" }, startsAt: null, endsAt: null, enabled: false }, announcement: { items: ["Ücretsiz kargo"], icon: "truck", speed: "normal", direction: "left", animation: "continuous", enabled: true }, composition: createDefaultStarterThemeComposition() } as const;
const PUBLIC = { schemaVersion: 2, publicationVersion: 1, publishedAt: NOW, brand: DESIGN.brand, hero: { enabled: true, slides: [{ headline: "Güzide Kuyumcu", body: "Zamansız tasarımlar", desktopImage: null, mobileImage: null, destination: null }] }, promotion: { ...DESIGN.promotion, destination: null }, announcement: DESIGN.announcement, typography: TYPOGRAPHY } as const;
const WORKSPACE = { schemaVersion: 3, draftVersion: 1, publishedVersion: 1, draftUpdatedAt: NOW, publishedAt: NOW, draft: DESIGN, published: PUBLIC, store: { name: "Güzide Kuyumcu", timezone: "Europe/Istanbul" }, media: [], destinations: [] } as const;

test("editor state never reports a newer local edit as saved by an older request", () => {
  const initial = createDesignEditorState(WORKSPACE);
  const first = applyDesignEdit(initial, { ...DESIGN, hero: { ...DESIGN.hero, slides: [{ ...DESIGN.hero.slides[0], headline: "İlk" }] } });
  const saving = beginDesignSave(first);
  const newer = applyDesignEdit(saving.state, { ...DESIGN, hero: { ...DESIGN.hero, slides: [{ ...DESIGN.hero.slides[0], headline: "Daha yeni" }] } });
  const completed = completeDesignSave(newer, saving.token, { draftVersion: 2, draftUpdatedAt: NOW, draft: saving.token.design });
  assert.equal(completed.status, "dirty");
  assert.equal(completed.draftVersion, 2);
  assert.equal(completed.design.hero.slides[0]?.headline, "Daha yeni");
});

test("workspace source exposes child-friendly sections, truthful save states and one shared preview", async () => {
  const [workspace, inspector, preview, css] = await Promise.all([
    readFile(new URL("./DesignWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("./DesignInspector.tsx", import.meta.url), "utf8"),
    readFile(new URL("./DesignPreview.tsx", import.meta.url), "utf8"),
    readFile(new URL("../design-settings.module.css", import.meta.url), "utf8"),
  ]);
  for (const label of ["Marka", "Renkler", "Yazı", "Ana sayfa", "Promosyon", "Duyuru", "Vitrin görselleri"]) assert.match(workspace, new RegExp(`"${label}"`));
  for (const state of ["Kaydediliyor", "Taslak kaydedildi", "Yayınlanmamış değişiklik", "Kaydedilemedi"]) assert.match(workspace, new RegExp(state));
  assert.match(workspace, /PanelTopbarBridge/);
  assert.match(workspace, /Masaüstü/);
  assert.match(workspace, /Mobil/);
  assert.match(workspace, /Yayınla/);
  assert.match(preview, /StorefrontDesignRenderer/);
  assert.match(inspector, /Yeni görsel yükle/);
  assert.match(inspector, /Banner ekle/);
  assert.match(inspector, /Masaüstü görseli/);
  assert.match(inspector, /Mobil görseli/);
  assert.doesNotMatch(inspector, /showUpload={false}/);
  assert.match(inspector, /Varsayılana dön/);
  assert.match(inspector, /Bağlantı yok/);
  assert.match(inspector, /TypographyEditor/);
  assert.match(inspector, /design[.]typography/);
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /\.workspace\s*\{[^}]*grid-template-columns:\s*320px minmax\(0, 1fr\)/s);
  assert.match(css, /\.sectionRail\s*\{[^}]*flex-direction:\s*row/s);
  assert.doesNotMatch(css, /\.sectionRail\s*\{[^}]*border-right:/s);
  assert.doesNotMatch(`${workspace}\n${inspector}\n${preview}`, /localStorage|sessionStorage|x-store-id|tenantContext|dangerouslySetInnerHTML/);
});

test("storefront asset and category-showcase authorities are reachable from the design workspace", async () => {
  const workspace = await readFile(new URL("./DesignWorkspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /import \{ CategoryShowcaseEditor \}/);
  assert.match(workspace, /import \{ StorefrontAssetManager \}/);
  assert.match(workspace, /<StorefrontAssetManager canManage=\{canManage\} \/>/);
  assert.match(workspace, /<CategoryShowcaseEditor canManage=\{canManage\} \/>/);
  assert.match(workspace, /section === "assets"/);
  assert.doesNotMatch(workspace, /x-store-id|localStorage|sessionStorage/);
});

test("theme section edits the same draft and keeps the one workspace publish action", async () => {
  const [workspace, composer] = await Promise.all([
    readFile(new URL("./DesignWorkspace.tsx", import.meta.url), "utf8"),
    readFile(new URL("../StarterThemeComposer.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(workspace, /<StarterThemeComposer\s+canManage=\{canManage\}\s+value=\{editor[.]design[.]composition\}/);
  assert.match(workspace, /composition:\s*value/);
  assert.doesNotMatch(workspace, /section\s*===\s*"theme"\s*\?\s*null/);
  assert.equal((workspace.match(/>Yayınla<\/button>/g) ?? []).length, 1);
  const visualPanel = composer.slice(composer.indexOf('activePanel === "visual"'), composer.indexOf('activePanel === "navigation"'));
  const navigationPanel = composer.slice(composer.indexOf('activePanel === "navigation"'), composer.indexOf('activePanel === "home"'));
  assert.doesNotMatch(visualPanel, /Header düzeni|Header genişliği|>Header</);
  assert.match(navigationPanel, /Header düzeni/);
  assert.match(navigationPanel, /Menü solda · logo ortada/);
  assert.match(navigationPanel, /Logo solda · menü yanında/);
  assert.match(navigationPanel, /Logo üstte · menü altta/);
  assert.match(navigationPanel, /Header genişliği/);
});

test("design page loads durable workspace server-side and legacy appearance pages only redirect", async () => {
  const page = await readFile(new URL("../../../app/settings/design/page.tsx", import.meta.url), "utf8");
  assert.match(page, /requireServerPanelAccess\(\)/);
  assert.match(page, /resolveDefaultServerStorefrontDesignRuntime/);
  assert.match(page, /repository[.]getWorkspace/);
  assert.match(page, /<DesignWorkspace/);
  assert.doesNotMatch(page, /storeId=|tenantContext=|localStorage|sessionStorage/);
  for (const [name, section] of [["hero-banner", "hero"], ["promotion-banner", "promotion"], ["marquee", "announcement"]] as const) {
    const legacy = await readFile(new URL(`../../../app/settings/${name}/page.tsx`, import.meta.url), "utf8");
    assert.match(legacy, new RegExp(`redirect\\(\"/settings/design\\?section=${section}\"\\)`));
    assert.doesNotMatch(legacy, /MerchantSingletonWorkspace|MerchantModuleConsole|kind=/);
  }
});
