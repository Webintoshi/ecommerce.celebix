import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildCategoryAccordionGroups,
  presentCategoryAccordion,
  toggleCategoryAccordion,
} from "./catalog-onboarding-ui/category-accordion.ts";
import { buildCatalogCategoryHierarchy } from "./catalog-onboarding-ui/category-tree.ts";
import { buildVariantMatrix } from "./catalog-onboarding-ui/variant-matrix.ts";

const ROOT = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, ROOT), "utf8");

test("quick create exposes only two required merchant fields", async () => {
  const dialog = await source("components/catalog-onboarding/ProductQuickCreateDialog.tsx");
  assert.match(dialog, /name="title"[^>]*required/);
  assert.match(dialog, /name="price"[^>]*required/);
  assert.doesNotMatch(dialog, /name="slug"[^>]*required|name="sku"[^>]*required|name="barcode"[^>]*required/);
  for (const label of ["Taslak kaydet", "Kaydet ve satışa aç", "Gelişmiş ürün eklemeye geç"]) {
    assert.match(dialog, new RegExp(label));
  }
  assert.match(dialog, /Kategori \(satışa açmak için zorunlu\)/);
});

test("quick create makes category selection obvious before publishing", async () => {
  const dialog = await source("components/catalog-onboarding/ProductQuickCreateDialog.tsx");
  const css = await source("components/catalog-onboarding/product-onboarding.module.css");

  assert.match(dialog, /name="categoryId"[^>]*required/);
  assert.match(dialog, /fieldHint/);
  assert.match(dialog, /Kategori seçmeden satışa açılmaz/);
  assert.match(dialog, /role="group"[^>]*aria-label="Hızlı kategori seçimi"/);
  assert.match(dialog, /setCategoryId\(category[.]id\)/);
  assert.match(dialog, /categoryChipActive/);
  assert.match(css, /\.categoryChips/);
  assert.match(css, /\.categoryChip/);
  assert.match(css, /\.fieldHint/);
});

test("new product page opens a choice before either creation form", async () => {
  const page = await source("app/products/new/page.tsx");
  const create = await source("components/catalog/ProductCreateForm.tsx");
  assert.match(page, /mode === "advanced"/);
  assert.match(create, /Hızlı Ürün Yükle/);
  assert.match(create, /Detaylı Ürün Yükle/);
  assert.match(create, /mode === "choose"/);
});

test("product list launcher opens the same choice route as navigation", async () => {
  const list = await source("components/catalog/ProductListConsole.tsx");
  assert.match(list, /href="\/products\/new"[^>]*>[^<]*<Plus/);
  assert.doesNotMatch(list, /setQuickCreateOpen\(true\)/);
});

test("dialog preserves focus, keyboard, duplicate-submit and close safety", async () => {
  const [dialog, create] = await Promise.all([
    source("components/catalog-onboarding/ProductQuickCreateDialog.tsx"),
    source("components/catalog/ProductCreateForm.tsx"),
  ]);
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /submittingRef\.current/);
  assert.match(dialog, /beforeunload/);
  assert.match(dialog, /returnFocusRef\.current\?\.focus/);
  assert.match(dialog, /returnFocusTarget/);
  assert.match(create, /createDirtyNavigationGuard/);
  assert.match(dialog, /onMouseDown=.*event\.target === event\.currentTarget/);
});

test("media failure remains an honest draft with recovery links", async () => {
  const dialog = await source("components/catalog-onboarding/ProductQuickCreateDialog.tsx");
  assert.match(dialog, /Ürün oluşturuldu, bazı görseller yüklenemedi/);
  assert.match(dialog, /Görselleri yeniden yükle/);
  assert.match(dialog, /Ürüne git/);
  assert.match(dialog, /completeProductMedia/);
  assert.match(dialog, /İkinci yazma yapılmadı/);
});

test("quick surface is a mobile sheet with 48px targets and reduced motion", async () => {
  const css = await source("components/catalog-onboarding/product-onboarding.module.css");
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*1024px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /0\.01ms/);
});

test("catalog onboarding owns its Mira palette and clears the fixed mobile navigation dock", async () => {
  const css = await source("components/catalog-onboarding/product-onboarding.module.css");
  assert.match(css, /--catalog-accent:\s*#FE6100/i);
  assert.match(css, /--catalog-text:\s*#2B2B2B/i);
  assert.match(css, /--catalog-canvas:\s*#F8F7F5/i);
  assert.match(css, /--catalog-surface:\s*#FFFDFC/i);
  assert.match(css, /--catalog-border:\s*#E7E2DD/i);
  assert.match(css, /@media \(max-width:\s*1024px\)[^]*padding-bottom:\s*calc\(76px/s);
});

test("advanced editor is one collapsible form, not a wizard", async () => {
  const editor = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");
  for (const label of ["Temel bilgiler ve kategori", "Fiyat ve varyantlar", "Görseller", "Diğer ayarlar", "SEO", "Satış kanalları"]) {
    assert.match(editor, new RegExp(label));
  }
  assert.ok(editor.indexOf('id="product-basics"') < editor.indexOf('id="product-commerce"'));
  assert.ok(editor.indexOf('id="product-commerce"') < editor.indexOf('id="product-media"'));
  assert.ok(editor.indexOf('id="product-media"') < editor.indexOf('id="product-advanced"'));
  assert.doesNotMatch(editor, /İleri|Önceki|stepIndex|currentStep/);
  assert.match(editor, /stickySummary/);
  assert.match(editor, /completeProductMedia/);
  assert.match(editor, /multiple accept="image\/jpeg,image\/png,image\/webp"/);
  assert.match(editor, /ProductDescriptionField/);
});

test("advanced editor locks native and rich fields while a versioned save is pending", async () => {
  const editor = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");
  assert.match(editor, /aria-busy=\{busy\}/);
  assert.match(editor, /<fieldset className=\{styles[.]editorFieldset\} disabled=\{busy\}>/);
  assert.match(editor, /<ProductDescriptionField[^>]*readOnly=\{busy\}/s);
  assert.match(editor, /<ProductDescriptionField[^>]*readOnly=\{busy \|\| editing\}/s);
});

test("variant rows prioritize price and stock while secondary fields stay disclosed", async () => {
  const builder = await source("components/catalog-onboarding/ProductVariantBuilder.tsx");
  const editor = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");
  assert.match(builder, /Satış fiyatı \*/);
  assert.match(builder, /Stok/);
  assert.ok(builder.indexOf("onboarding-variant-advanced") < builder.indexOf("Karşılaştırma fiyatı"));
  assert.ok(builder.indexOf("onboarding-variant-advanced") < builder.indexOf("<BarcodeInput"));
  assert.match(builder, /!simplified \? <div className="onboarding-variant-list-heading"/);
  assert.match(editor, /allowManualAdd=\{kind !== "variant"\} simplified/);
});

test("variant matrix rejects duplicate attributes and bounds combinations", () => {
  assert.equal(buildVariantMatrix([{ name: "Renk", values: ["Beyaz", "Beyaz"] }]).ok, false);
  assert.equal(buildVariantMatrix([{ name: "Renk", values: ["Beyaz", "Siyah"] }, { name: "Beden", values: ["S", "M"] }]).ok, true);
  assert.equal(buildVariantMatrix([{ name: "Boyut", values: Array.from({ length: 101 }, (_, index) => String(index)) }]).ok, false);
});

test("category manager uses durable client CRUD without browser store authority", async () => {
  const manager = await source("components/catalog-onboarding/CategoryManager.tsx");
  assert.match(manager, /listCategories/);
  assert.match(manager, /createCategory/);
  assert.match(manager, /updateCategory/);
  assert.match(manager, /archiveCategory/);
  assert.doesNotMatch(manager, /storeId|tenantId|document\.cookie|localStorage|sessionStorage/);
});

test("category manager presents hierarchy without exposing technical slugs", async () => {
  const manager = await source("components/catalog-onboarding/CategoryManager.tsx");

  assert.match(manager, /normalizedQuery \? label : `Seviye \$\{depth\} · Görünüm sırası \$\{category[.]position\}`/);
  assert.doesNotMatch(manager, /\/\{category[.]slug\}/);
});

test("category manager keeps create and refresh available at the shell mobile breakpoint with predictable drawer focus", async () => {
  const [manager, css] = await Promise.all([
    source("components/catalog-onboarding/CategoryManager.tsx"),
    source("components/catalog-onboarding/category-management.module.css"),
  ]);
  assert.match(manager, /function categoryCommands\(\)/);
  assert.match(manager, /<PanelTopbarBridge title="Kategoriler" actions=\{categoryCommands\(\)\}/);
  assert.match(manager, /<div className=\{styles[.]mobileHeaderActions\}>\{categoryCommands\(\)\}<\/div>/);
  assert.match(manager, /<h1 id="category-manager-title" className="sr-only">Kategoriler<\/h1>/);
  assert.doesNotMatch(manager, /<header className=\{styles[.]pageHeader\}>/);
  assert.doesNotMatch(manager, /className=\{styles[.]detailPlaceholder\}[^]*<button[^>]*>[^<]*<Plus[^>]*\/> Yeni kategori<\/button>/s);
  assert.match(css, /[.]mobileHeaderActions\s*\{[^}]*display:\s*none/s);
  assert.match(css, /@media \(max-width:\s*1024px\)[^]*[.]mobileHeaderActions\s*\{[^}]*display:\s*flex/s);
  assert.match(manager, /editorReturnFocusRef/);
  assert.match(manager, /editorNameRef[.]current\?[.]focus/);
  assert.match(manager, /event[.]key === "Escape"/);
});

test("category accordion groups descendants under roots and toggles roots independently", () => {
  const categories = [
    { id: "root-a", name: "Kolyeler", slug: "kolyeler", position: 0, status: "active", version: 1 },
    { id: "child-a", name: "Altın Kolyeler", slug: "altin-kolyeler", parentId: "root-a", position: 0, status: "active", version: 1 },
    { id: "root-b", name: "Saatler", slug: "saatler", position: 1, status: "active", version: 1 },
    { id: "child-b", name: "Kadın Saatleri", slug: "kadin-saatleri", parentId: "root-b", position: 0, status: "active", version: 1 },
    { id: "root-c", name: "Aksesuar", slug: "aksesuar", position: 2, status: "active", version: 1 },
  ] as const;
  const hierarchy = buildCatalogCategoryHierarchy(categories);
  assert.equal(hierarchy.valid, true);

  const groups = buildCategoryAccordionGroups(hierarchy.rows);
  assert.deepEqual(groups.map(({ root, descendants }) => [root.category.id, descendants.map(({ category }) => category.id)]), [
    ["root-a", ["child-a"]],
    ["root-b", ["child-b"]],
    ["root-c", []],
  ]);

  const openedA = toggleCategoryAccordion(new Set(), "root-a");
  const openedBoth = toggleCategoryAccordion(openedA, "root-b");
  const closedA = toggleCategoryAccordion(openedBoth, "root-a");
  assert.deepEqual([...openedBoth], ["root-a", "root-b"]);
  assert.deepEqual([...closedA], ["root-b"]);
  assert.equal(Object.isFrozen(groups), true);

  const initial = presentCategoryAccordion(groups, new Set());
  const bothOpen = presentCategoryAccordion(groups, openedBoth);
  assert.deepEqual(initial.map(({ expanded, visibleDescendants }) => [expanded, visibleDescendants.length]), [
    [false, 0], [false, 0], [false, 0],
  ]);
  assert.deepEqual(bothOpen.map(({ hasChildren, expanded, visibleDescendants }) => [hasChildren, expanded, visibleDescendants.length]), [
    [true, true, 1], [true, true, 1], [false, false, 0],
  ]);
  assert.equal(bothOpen[0]?.childrenId, "category-children-root-a");
  assert.equal(bothOpen[2]?.childrenId, undefined);
});
