import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { compile, mounted, click, input } from "../../lib/mira-final-test-support.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const product = { id: ID, title: "Örnek ürün", slug: "ornek", currency: "TRY", status: "active", version: 3, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" };
const impact = { resourceKind: "product", resourceId: ID, confirmationLabel: "Örnek ürün", expectedVersion: 4, effects: [{ kind: "variants", count: 1, disposition: "delete" }, { kind: "order_line_snapshots", count: 2, disposition: "retain_snapshot" }] };
const summary = { totalProducts: 1, activeProducts: 1, draftProducts: 0, outOfStockVariants: 0, productsWithoutMedia: 1, activeMedia: 0, activeVariants: 1, productLimit: 100 };
class ApiError extends Error { constructor(readonly code: string) { super(code); } }
function deferred() { let resolve!: (value: any) => void; const promise = new Promise(resolveValue => { resolve = resolveValue; }); return { promise, resolve }; }
function component(api: Record<string, unknown>) {
  return compile("components/catalog/ProductListConsole.tsx", {
    "@/lib/catalog-ui/client": { CatalogApiError: ApiError, catalogApi: { listProducts: async () => ({ items: [product], catalogTotal: 1 }), getDashboardSummary: async () => summary, ...api } },
    "@/lib/catalog-onboarding-ui/client": { catalogOnboardingClient: { getOptions: async () => ({ categories: [], resources: [], channels: [] }) } },
    "@/components/catalog/ProductCategoryRankConsole": { ProductCategoryRankConsole: () => null },
  }).ProductListConsole;
}
async function confirm(host: any, window: any) {
  await input(window, host.querySelector('[role="alertdialog"] input:not([type="checkbox"])'), "Örnek ürün");
  await React.act(async () => host.querySelector('[role="alertdialog"] input[type="checkbox"]').click());
}

test("list trash requires remove capability while archive remains an explicit independent action", async () => {
  for (const canDelete of [false, true]) {
    await mounted(component({}), { canArchive: true, canDelete }, async host => {
      const trash = host.querySelector('[data-test-icon="Trash2"]');
      assert.equal(Boolean(trash), canDelete);
      assert.ok(host.querySelector('[aria-label="Örnek ürün ürününü arşivle"] [data-test-icon="Archive"]'));
    });
  }
});

test("list trash loads audited impact and permanently deletes only after exact name and acknowledgement", async () => {
  const writes: any[] = []; const pending = deferred(); let deleted = false, reads = 0;
  const Component = component({
    listProducts: async () => { reads++; return { items: deleted ? [] : [product], catalogTotal: deleted ? 0 : 1 }; },
    getProductDeletionImpact: async (id: string) => { assert.equal(id, ID); return impact; },
    archiveProduct: async () => { assert.fail("trash must use permanent deletion"); },
    deleteProduct: async (id: string, command: any) => { writes.push([id, command]); await pending.promise; deleted = true; return { resourceKind: "product", resourceId: ID, deleted: true, auditId: command.operationId, replayed: false }; },
  });
  await mounted(Component, { canDelete: true }, async (host, window) => {
    await click(host, "Örnek ürün ürününü kalıcı sil");
    assert.match(host.querySelector('[role="alertdialog"]').textContent, /Geçmiş sipariş ürün görüntüleri: 2 kayıt geçmiş kaydı korunacak/);
    assert.equal(writes.length, 0);
    assert.equal(host.querySelector('button[type="submit"]').disabled, true);
    await input(window, host.querySelector('[role="alertdialog"] input:not([type="checkbox"])'), "Yanlış ad");
    await React.act(async () => host.querySelector('[role="alertdialog"] input[type="checkbox"]').click());
    assert.equal(host.querySelector('button[type="submit"]').disabled, true);
    await input(window, host.querySelector('[role="alertdialog"] input:not([type="checkbox"])'), "Örnek ürün");
    await click(host, "Kalıcı olarak sil");
    assert.equal(writes.length, 1);
    assert.equal(writes[0][0], ID);
    assert.equal(writes[0][1].expectedVersion, 4, "delete uses authoritative impact version");
    assert.equal(writes[0][1].confirmation, "Örnek ürün");
    assert.match(writes[0][1].operationId, /^[0-9a-f-]{36}$/);
    assert.ok(host.querySelector('[role="alertdialog"]'));
    assert.equal([...host.querySelectorAll("button")].find((node: any) => node.textContent === "Vazgeç").disabled, true);
    await React.act(async () => pending.resolve(null));
    assert.equal(host.querySelector('[role="alertdialog"]'), null);
    assert.equal(host.querySelector("tbody tr"), null);
    assert.equal(reads, 2, "successful delete reconciles list and totals");
    assert.equal(window.document.activeElement?.getAttribute("aria-label"), "Ürün listesini yenile");
  });
});

test("failed deletion keeps the row and confirmation and reuses the same audited command on retry", async () => {
  const writes: any[] = []; let deleted = false;
  const Component = component({
    listProducts: async () => ({ items: deleted ? [] : [product], catalogTotal: deleted ? 0 : 1 }),
    getProductDeletionImpact: async () => impact,
    deleteProduct: async (id: string, command: any) => {
      writes.push([id, command]);
      if (writes.length === 1) throw new ApiError("cleanup_failed");
      deleted = true;
      return { resourceKind: "product", resourceId: ID, deleted: true, auditId: command.operationId, replayed: true };
    },
  });
  await mounted(Component, { canDelete: true }, async (host, window) => {
    await click(host, "Örnek ürün ürününü kalıcı sil"); await confirm(host, window); await click(host, "Kalıcı olarak sil");
    assert.ok(host.querySelector("tbody tr"));
    assert.match(host.querySelector('[role="alertdialog"] [role="alert"]').textContent, /cleanup_failed/);
    assert.equal(host.querySelector('[role="alertdialog"] input:not([type="checkbox"])').value, "Örnek ürün");
    assert.equal(host.querySelector('[role="alertdialog"] input[type="checkbox"]').checked, true);
    await click(host, "Kalıcı olarak sil");
    assert.deepEqual(writes[1], writes[0], "recovery must reuse the original operation and payload");
    assert.equal(host.querySelector("tbody tr"), null);
  });
});

test("failed impact stays visible in the dialog and can retry without issuing deletion", async () => {
  let reads = 0;
  const Component = component({ getProductDeletionImpact: async () => { if (++reads === 1) throw new ApiError("unavailable"); return impact; }, deleteProduct: async () => assert.fail("impact retry cannot delete") });
  await mounted(Component, { canDelete: true }, async host => {
    await click(host, "Örnek ürün ürününü kalıcı sil");
    assert.match(host.querySelector('[role="alertdialog"] [role="alert"]').textContent, /unavailable/);
    assert.equal(host.querySelector('[role="alertdialog"] [role="status"]'), null);
    await click(host, "Silme etkilerini yeniden yükle");
    assert.ok(host.querySelector('[role="alertdialog"] input'));
    assert.equal(reads, 2);
    await click(host, "Vazgeç"); assert.ok(host.querySelector("tbody tr"));
  });
});

test("version conflict requires refreshed impact and a new explicit confirmation", async () => {
  let reads = 0; const writes: any[] = [];
  const Component = component({
    getProductDeletionImpact: async () => ({ ...impact, expectedVersion: ++reads === 1 ? 4 : 5 }),
    deleteProduct: async (_id: string, command: any) => { writes.push(command); throw new ApiError("version_conflict"); },
  });
  await mounted(Component, { canDelete: true }, async (host, window) => {
    await click(host, "Örnek ürün ürününü kalıcı sil"); await confirm(host, window); await click(host, "Kalıcı olarak sil");
    assert.equal(host.querySelector('[role="alertdialog"] input'), null);
    await click(host, "Silme etkilerini yeniden yükle");
    assert.equal(host.querySelector('[role="alertdialog"] input:not([type="checkbox"])').value, "");
    assert.equal(host.querySelector('[role="alertdialog"] input[type="checkbox"]').checked, false);
    await confirm(host, window); await click(host, "Kalıcı olarak sil");
    assert.equal(writes[1].expectedVersion, 5);
    assert.notEqual(writes[1].operationId, writes[0].operationId);
  });
});

test("successful delete keeps removed row absent when canonical list refresh fails", async () => {
  let reads = 0;
  const Component = component({
    listProducts: async () => { if (++reads > 1) throw new ApiError("unavailable"); return { items: [product], catalogTotal: 1 }; },
    getProductDeletionImpact: async () => impact,
    deleteProduct: async (_id: string, command: any) => ({ resourceKind: "product", resourceId: ID, deleted: true, auditId: command.operationId, replayed: false }),
  });
  await mounted(Component, { canDelete: true }, async (host, window) => {
    await click(host, "Örnek ürün ürününü kalıcı sil"); await confirm(host, window); await click(host, "Kalıcı olarak sil");
    assert.equal(host.querySelector('[role="alertdialog"]'), null);
    assert.equal(host.querySelector("tbody tr"), null);
    assert.ok(host.querySelector('[role="alert"]'));
    assert.equal([...host.querySelectorAll("button")].find((node: any) => node.textContent === "Sonraki").disabled, true);
  });
});

test("archived rows retain permanent deletion and restore as independent capabilities", async () => {
  const Component = component({ listProducts: async () => ({ items: [{ ...product, status: "archived" }], catalogTotal: 1 }) });
  await mounted(Component, { canDelete: true, canArchive: true }, async host => {
    assert.ok(host.querySelector('[aria-label="Örnek ürün ürününü kalıcı sil"] [data-test-icon="Trash2"]'));
    assert.ok([...host.querySelectorAll("button")].find((node: any) => node.textContent === "Geri Yükle"));
    assert.equal(host.querySelector('[aria-label="Örnek ürün ürününü arşivle"]'), null);
  });
});

test("server product page derives deletion capability independently from archive and manage", async () => {
  for (const [role, expected] of [["store_owner", true], ["admin", true], ["editor", false], ["analyst", false], ["cashier", true]] as const) {
    const Page = compile("app/(panel)/products/page.tsx", {
      "@/lib/server-access": { requireServerPanelAccess: async () => ({ tenantContext: { membership: { role } } }) },
      "@/components/catalog/ProductListConsole": { ProductListConsole: () => null },
    }).default;
    const element = await Page({});
    assert.equal(element.props.canDelete, expected, role);
  }
});

test("deletion dialog owns keyboard focus while impact is loading and restores its trigger on cancel", async () => {
  const pending = deferred();
  await mounted(component({ getProductDeletionImpact: async () => pending.promise }), { canDelete: true }, async (host, window) => {
    const trigger = host.querySelector('[aria-label="Örnek ürün ürününü kalıcı sil"]');
    await React.act(async () => trigger.click());
    const dialog = host.querySelector('[role="alertdialog"]');
    assert.ok(dialog.contains(window.document.activeElement), "loading modal must own keyboard focus");
    await React.act(async () => pending.resolve(impact));
    await click(host, "Vazgeç");
    assert.equal(window.document.activeElement, trigger);
  });
});
