import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

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
  assert.match(dialog, /role="dialog"/);
  assert.match(dialog, /aria-modal="true"/);
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
  assert.match(dialog, /Ürün oluşturuldu, görsel yüklenemedi/);
  assert.match(dialog, /Görseli yeniden yükle/);
  assert.match(dialog, /Ürüne git/);
  assert.match(dialog, /publishAfterMedia/);
});

test("quick surface is a mobile sheet with 48px targets and reduced motion", async () => {
  const css = await source("components/catalog-onboarding/product-onboarding.module.css");
  assert.match(css, /min-height:\s*48px/);
  assert.match(css, /@media \(max-width:\s*1024px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:\s*reduce\)/);
  assert.match(css, /0\.01ms/);
});
