import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { compile, mounted, click } from "../../lib/mira-final-test-support.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const product = { id: ID, title: "Örnek ürün", slug: "ornek", currency: "TRY", status: "active", version: 3, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const summary = { totalProducts: 1, activeProducts: 1, draftProducts: 0, outOfStockVariants: 0, productsWithoutMedia: 1, activeMedia: 0, activeVariants: 1, productLimit: 100 };
function component(status = "active", api: Record<string, unknown> = {}) {
  return compile(process.env.PRODUCTS_POLISH_TEST_SOURCE || "components/catalog/ProductListConsole.tsx", {
    "@/lib/catalog-ui/client": { CatalogApiError: class extends Error {}, catalogApi: {
      listProducts: async () => ({ items: [{ ...product, status }], catalogTotal: 1 }),
      getDashboardSummary: async () => summary,
      ...api,
    } },
    "@/lib/catalog-onboarding-ui/client": { catalogOnboardingClient: { getOptions: async () => ({ categories: [], resources: [], channels: [] }) } },
    "@/components/catalog/ProductCategoryRankConsole": { ProductCategoryRankConsole: () => null },
  }).ProductListConsole;
}

test("bulk choices appear after eligible selection while page size remains available without write permission", async () => {
  await mounted(component(), { canManage: true, canArchive: true }, async host => {
    assert.equal(Boolean(host.querySelector('[aria-label="Toplu İşlemler"]')), false);
    assert.ok(host.querySelector('[aria-label="Görüntülenen tüm ürünleri seç"]'));
    await React.act(async () => host.querySelector('[aria-label="Örnek ürün ürününü seç"]').click());
    assert.ok(host.querySelector('[aria-label="Toplu İşlemler"]'));
    assert.match(host.textContent, /1 ürün seçildi/);
    await React.act(async () => host.querySelector('[aria-label="Örnek ürün ürününü seç"]').click());
    assert.equal(Boolean(host.querySelector('[aria-label="Toplu İşlemler"]')), false);
  });
  await mounted(component(), {}, async host => {
    assert.ok(host.querySelector('[aria-label="Satır sayısı"]'), "read-only merchants can still size their view");
  });
});

test("product edit is labeled and secondary actions retain canonical routes and independent permission gates", async () => {
  await mounted(component(), { canManage: true, canArchive: true, canDelete: true }, async host => {
    const edit = host.querySelector('[aria-label="Örnek ürün ürününü düzenle"]');
    assert.ok(edit);
    assert.match(edit.textContent, /Düzenle/);
    assert.equal(edit.getAttribute("href"), `/products/${ID}`);
    const menu = host.querySelector('details[name="product-row-actions"]');
    assert.ok(menu);
    assert.equal(menu.contains(edit), false);
    assert.equal(menu.querySelector('[aria-label="Örnek ürün ürününü görüntüle"]').getAttribute("href"), `/products/${ID}`);
    assert.equal(menu.querySelector('[aria-label="Örnek ürün için barkod etiketi hazırla"]').getAttribute("href"), `/products/barcode-labels?productId=${ID}`);
    assert.ok(menu.querySelector('[aria-label="Örnek ürün ürününü arşivle"]'));
    assert.ok(menu.querySelector('[aria-label="Örnek ürün ürününü kalıcı sil"]'));
  });
  await mounted(component(), {}, async host => {
    assert.equal(host.querySelector('[aria-label="Örnek ürün ürününü düzenle"]'), null);
    assert.equal(host.querySelector('[aria-label="Örnek ürün ürününü arşivle"]'), null);
    assert.equal(host.querySelector('[aria-label="Örnek ürün ürününü kalıcı sil"]'), null);
    assert.ok(host.querySelector('[aria-label="Örnek ürün ürününü görüntüle"]'));
  });
});

test("native secondary disclosure closes on Escape and archive cancel restores its visible trigger", async () => {
  let writes = 0;
  await mounted(component("active", { archiveProduct: async () => { writes++; } }), { canArchive: true }, async (host, window) => {
    const menu = host.querySelector('details[name="product-row-actions"]');
    assert.ok(menu);
    menu.open = true;
    const summaryNode = menu.querySelector("summary");
    await React.act(async () => menu.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(menu.open, false);
    assert.ok(window.document.activeElement === summaryNode);
    menu.open = true;
    const opener = menu.querySelector('[aria-label="Örnek ürün ürününü arşivle"]');
    await click(host, "Örnek ürün ürününü arşivle");
    assert.ok(host.querySelector('[role="alertdialog"]'));
    assert.equal(writes, 0);
    await click(host, "Vazgeç");
    assert.equal(host.querySelector('[role="alertdialog"]'), null);
    assert.equal(menu.open, true, "original archive trigger remains in a visible disclosure");
    assert.ok(window.document.activeElement === opener);
    assert.equal(writes, 0);
  });
});

test("archived rows retain restore and deletion but cannot publish select edit or produce barcode labels", async () => {
  await mounted(component("archived"), { canManage: true, canArchive: true, canDelete: true }, async host => {
    assert.equal(host.querySelector('[aria-label="Örnek ürün ürününü seç"]').disabled, true);
    assert.equal(host.querySelector('[aria-label="Örnek ürün ürününü düzenle"]'), null);
    assert.equal(host.querySelector('[aria-label="Örnek ürün için barkod etiketi hazırla"]'), null);
    assert.equal(host.querySelector('[aria-label="Örnek ürün yayın durumunu değiştir"]'), null);
    assert.ok(host.querySelector('[aria-label="Örnek ürün ürününü kalıcı sil"]'));
    const menu = host.querySelector('details[name="product-row-actions"]');
    assert.ok(menu);
    assert.match(menu.textContent, /Geri Yükle/);
  });
});

test("bulk archive traps keyboard focus and restores the list after its selection controls unmount", async () => {
  let writes = 0;
  await mounted(component("active", { bulkMutateProducts: async () => { writes++; } }), { canArchive: true }, async (host, window) => {
    await React.act(async () => host.querySelector('[aria-label="Örnek ürün ürününü seç"]').click());
    const action = host.querySelector('[aria-label="Toplu İşlemler"]');
    await React.act(async () => {
      action.value = "archive";
      action.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    const apply = [...host.querySelectorAll("button")].find(button => button.textContent === "Uygula");
    apply.focus();
    await click(host, "Uygula");
    const dialog = host.querySelector('[role="alertdialog"]');
    const buttons = dialog.querySelectorAll("button");
    assert.ok(window.document.activeElement === buttons[0]);
    await React.act(async () => buttons[0].dispatchEvent(new window.KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true })));
    assert.ok(window.document.activeElement === buttons[1]);
    await click(host, "1 ürünü arşivle");
    assert.equal(writes, 1);
    assert.equal(Boolean(host.querySelector('[role="alertdialog"]')), false);
    assert.equal(Boolean(host.querySelector('[aria-label="Toplu İşlemler"]')), false);
    const active = window.document.activeElement;
    assert.ok(active === host.querySelector('[data-workspace="product-operations"]') || active === host.querySelector('[aria-label="Ürün listesini yenile"]'));
  });
});
