import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
});

test("launcher opens the quick dialog instead of navigating away", async () => {
  const list = await source("components/catalog/ProductListConsole.tsx");
  const dialog = await source("components/catalog-onboarding/ProductQuickCreateDialog.tsx");
  assert.match(list, /setQuickCreateOpen\(true\)/);
  assert.match(list, /ProductQuickCreateDialog/);
  assert.match(dialog, /role=\{mode === "dialog" \? "dialog" : "region"\}/);
  assert.match(dialog, /aria-modal=\{mode === "dialog" \? "true" : undefined\}/);
});

test("dialog preserves focus, keyboard, duplicate-submit and close safety", async () => {
  const dialog = await source("components/catalog-onboarding/ProductQuickCreateDialog.tsx");
  assert.match(dialog, /event\.key === "Escape"/);
  assert.match(dialog, /event\.key !== "Tab"/);
  assert.match(dialog, /submittingRef\.current/);
  assert.match(dialog, /beforeunload/);
  assert.match(dialog, /returnFocusRef\.current\?\.focus/);
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

test("advanced editor is one collapsible form, not a wizard", async () => {
  const editor = await source("components/catalog-onboarding/ProductAdvancedEditor.tsx");
  for (const label of ["Temel bilgiler", "Fiyat ve stok", "Varyantlar", "Medya", "Kategori, koleksiyon, marka ve etiket", "Kargo ve gümrük", "SEO", "Satış kanalları", "Nitelikler ve ekstralar"]) {
    assert.match(editor, new RegExp(label));
  }
  assert.doesNotMatch(editor, /İleri|Önceki|stepIndex|currentStep/);
  assert.match(editor, /stickySummary/);
  assert.match(editor, /completeProductMedia/);
  assert.match(editor, /multiple accept="image\/jpeg,image\/png,image\/webp"/);
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
