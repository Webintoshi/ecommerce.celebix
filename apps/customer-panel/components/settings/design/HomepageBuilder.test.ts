import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = () => readFile(new URL("./HomepageBuilder.tsx", import.meta.url), "utf8");

test("homepage builder exposes a single novice-friendly modular flow", async () => {
  const value = await source();
  for (const label of ["Ana banner", "Bölüm ekle", "Kalite puanı", "Yukarı taşı", "Aşağı taşı", "Gizle", "Sil", "Geri al"]) {
    assert.match(value, new RegExp(label, "i"));
  }
  assert.match(value, /draggable=\{canManage\}/);
  assert.match(value, /onDragStart/);
  assert.match(value, /moveHomepageSection/);
  assert.match(value, /scoreHomepageQuality/);
});

test("homepage builder retains server authority and never persists derived score", async () => {
  const value = await source();
  assert.doesNotMatch(value, /qualityScore\s*:/);
  assert.doesNotMatch(value, /tenantId|storeId|x-store-id|localStorage|sessionStorage|dangerouslySetInnerHTML/);
  assert.match(value, /onChange\(\{\s*[.][.][.]design,\s*composition:\s*next/);
  assert.match(value, /normalizeStarterThemeCompositionV3/);
});
