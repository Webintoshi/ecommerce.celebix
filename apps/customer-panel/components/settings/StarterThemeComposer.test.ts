import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = (path: string) => readFile(new URL(path, import.meta.url), "utf8");

test("composer source contains no raw store or tenant authority", async () => { const value = await source("StarterThemeComposer.tsx"); assert.doesNotMatch(value, /storeId|tenantId|x-forwarded|localStorage|sessionStorage/); assert.match(value, /credentials:\s*"same-origin"/); });
test("composer is controlled by the unified storefront design document", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.match(value, /value:\s*StarterThemeCompositionConfigV2/);
  assert.match(value, /onChange:\s*\(value:\s*StarterThemeCompositionConfigV2\)\s*=>\s*void/);
  assert.doesNotMatch(value, /merchantAdminApi[.]records\("starter_theme_composition"\)/);
  assert.doesNotMatch(value, /merchantAdminApi[.]save\("starter_theme_composition"/);
});
test("composer loads canonical category product and R2 asset pickers", async () => { const value = await source("StarterThemeComposer.tsx"); for (const token of ["catalogOnboardingClient.listCategories", "catalogApi.listProducts", "/api/storefront-assets", "parseStorefrontAsset"]) assert.match(value, new RegExp(token.replace(/[().]/g, "\\$&"))); });
test("composer exposes truthful resource loading and error states", async () => { const value = await source("StarterThemeComposer.tsx"); for (const token of ["Yükleniyor", "yüklenemiyor"]) assert.match(value, new RegExp(token)); });
test("composer preserves disabled role authority", async () => { const value = await source("StarterThemeComposer.tsx"); assert.match(value, /const disabled = !canManage/); assert.match(value, /Yalnız görüntüleme/); });
test("composer delegates draft autosave and publishing to its parent workspace", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.doesNotMatch(value, /Taslak kaydet|>Yayınla<\/button>|expectedVersion:\s*current[.]version/);
  assert.match(value, /onChange\(buildStarterThemeComposition/);
});
test("section order works without drag and has accessible labels", async () => { const value = await source("StarterThemeComposer.tsx"); assert.match(value, /moveStarterSection/); assert.match(value, /yukarı taşı/); assert.match(value, /aşağı taşı/); });
test("composer provides bounded visual product detail and cart controls", async () => { const value = await source("StarterThemeComposer.tsx"); for (const token of ["Renk paleti", "Başlık stili", "Ürün detayı", "Sepet deneyimi"]) assert.match(value, new RegExp(token)); });
test("composer exposes the two existing header modes with explicit placement labels", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.match(value, /Banner üzerinde \(şeffaf\)/);
  assert.match(value, /Banner dışında \(düz zemin\)/);
  assert.doesNotMatch(value, /fixedHeader|headerPosition/);
});
test("composer controls side-cart quantity visibility from the unified composition", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.match(value, /Miktar seçiciyi göster/);
  assert.match(value, /state[.]cart[.]showQuantitySelector/);
});
test("composer exposes accessible bounded editors for every hero slide and split panel", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.match(value, /section[.]slides[.]map/);
  assert.match(value, /section[.]panels[.]map/);
  for (const token of ["Hero slaytı ekle", "Hero slaytını kaldır", "Kampanya paneli ekle", "Kampanya panelini kaldır"]) assert.match(value, new RegExp(token));
  assert.match(value, /slides[.]length\s*>=\s*3/);
  assert.match(value, /panels[.]length\s*>=\s*2/);
});
test("composer preserves featured navigation authority and disables unavailable shipping threshold control", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.match(value, /updateStarterNavigationRoots/);
  assert.match(value, /Kargo ilerlemesi için doğrulanmış ücretsiz kargo eşiği gerekli/);
  assert.match(value, /aria-describedby="shipping-progress-authority"/);
  assert.match(value, /checked=\{false\}/);
});
test("preview consumes parsed composition, real catalog titles, category image slots, and responsive modes", async () => { const value = await source("StarterThemePreview.tsx"); assert.match(value, /desktop/); assert.match(value, /mobile/); assert.match(value, /presentation/); assert.match(value, /productTitles/); assert.match(value, /starterThemeCategoryPlaceholderLabels/); assert.match(value, /previewCategoryPlaceholders/); });
test("composition preview applies the persisted header style to one full-width hero surface", async () => {
  const [value, css] = await Promise.all([source("StarterThemePreview.tsx"), source("starter-theme-preview.module.css")]);
  assert.match(value, /composition[.]visual[.]headerStyle/);
  assert.match(value, /previewHeroShell/);
  assert.match(value, /data-header-style=\{previewHeaderStyle\}/);
  assert.match(value, /aria-label="Tam genişlik banner önizlemesi"/);
  assert.match(css, /previewHeroShell\[data-header-style="overlay"\][\s\S]*?position:\s*absolute/);
  assert.match(css, /previewHeroShell\[data-header-style="solid"\][\s\S]*?position:\s*relative/);
});
test("preview CSS module defines every static class consumed by the rendered component", async () => {
  const value = await source("StarterThemePreview.tsx");
  const stylesheet = value.match(/import styles from "([.][^"]+[.]module[.]css)"/);
  assert.ok(stylesheet, "preview must own an explicit CSS module");
  const css = await source(stylesheet[1]);
  const referenced = new Set([...value.matchAll(/styles[.]([A-Za-z][A-Za-z0-9_-]*)/g)].map((match) => match[1]));
  const defined = new Set([...css.matchAll(/[.]([A-Za-z][A-Za-z0-9_-]*)/g)].map((match) => match[1]));
  assert.deepEqual([...referenced].filter((className) => !defined.has(className)).sort(), []);
});
test("theme composer stays subordinate to the shared page topbar", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.doesNotMatch(value, /<h1|KAMPANYA STARTER|Yayın yetkisi etkin/);
});
test("composer keeps one editor state while the submenu exposes one settings group", async () => {
  const value = await source("StarterThemeComposer.tsx");
  assert.match(value, /StarterThemeSubnavigation/);
  assert.match(value, /useState<ThemePanelKey>\(DEFAULT_THEME_PANEL\)/);
  assert.match(value, /role="tabpanel"/);
  for (const key of ["visual", "navigation", "home", "product", "cart", "footer"]) {
    assert.match(value, new RegExp(`activePanel === "${key}"`));
  }
  assert.equal((value.match(/useState<StarterThemeEditorState>/g) ?? []).length, 0);
});
test("composer columns can shrink inside the design rail without horizontal clipping", async () => {
  const value = await source("starter-theme-composer.module.css");
  assert.match(value, /grid-template-columns:\s*minmax\(0,\s*1[.]12fr\)\s+minmax\(380px,\s*[.]88fr\)/);
  assert.doesNotMatch(value, /minmax\((?:440|520)px/);
});
test("composition preview truthfully renders configurable corners announcement destination gallery and cart settings", async () => {
  const value = await source("StarterThemePreview.tsx");
  for (const token of ["cornerStyle", "announcement.destination", "galleryStyle", "showCheckoutReadiness", "trustMessage", "mobileStickyPurchase"]) assert.match(value, new RegExp(token.replace(".", "[.]")));
  assert.doesNotMatch(value, /showShippingProgress\s*\?\s*<[^>]*(progress|shipping)/i);
  assert.match(value, /canonical ücretsiz kargo eşiği/);
});
test("composition preview renders a selector or truthful quantity fallback", async () => {
  const value = await source("StarterThemePreview.tsx");
  assert.match(value, /showQuantitySelector/);
  assert.match(value, /previewQuantity/);
  assert.match(value, /1 adet/);
});
test("legacy theme route stays server-authorized and redirects into the unified design workspace", async () => {
  const value = await source("../../app/settings/theme/page.tsx");
  assert.match(value, /requireServerPanelAccess\(\)/);
  assert.match(value, /redirect\("\/settings\/design[?]section=theme"\)/);
  assert.doesNotMatch(value, /StarterThemeComposer|tenantContext=|storeId=|membershipId=/);
});
