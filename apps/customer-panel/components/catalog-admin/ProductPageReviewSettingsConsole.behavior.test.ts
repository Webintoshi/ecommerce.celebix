import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { compile, mounted, click } from "../../lib/mira-final-test-support.ts";

class ApiError extends Error { constructor(readonly code: string) { super(code); } }
const initial = { enabled: false, version: 0 };
function Component() {
  return compile("components/catalog-admin/ProductPageReviewSettingsConsole.tsx", {
    "@/lib/product-page-reviews-ui/client": { ProductPageReviewSettingsApiError: ApiError, productPageReviewSettingsApi: {} },
  }).ProductPageReviewSettingsConsole;
}
function deferred() { let resolve!: (value: any) => void; const promise = new Promise(res => { resolve = res; }); return { promise, resolve }; }
const toggle = (host: any) => host.querySelector('[role="switch"]');

test("product page review writing setting stays readable without moderation permission", async () => {
  await mounted(Component(), { canManage: false, api: { get: async () => ({ enabled: true, version: 3 }), save: async () => assert.fail("read only cannot save") } }, async host => {
    assert.match(host.textContent, /Ürün sayfasında yorum yazma/);
    assert.equal(toggle(host).checked, true);
    assert.equal(toggle(host).disabled, true);
    assert.equal(host.querySelector('button[type="submit"]'), null);
  });
});

test("cancel restores persisted value and apply sends one versioned command", async () => {
  const calls: any[] = []; const pending = deferred();
  await mounted(Component(), { canManage: true, api: { get: async () => initial, save: async (...args: any[]) => { calls.push(args); return pending.promise; } } }, async host => {
    await act(async () => toggle(host).click()); await click(host, "Vazgeç");
    assert.equal(toggle(host).checked, false); assert.equal(calls.length, 0);
    await act(async () => toggle(host).click()); await click(host, "Uygula");
    assert.equal(calls.length, 1); assert.deepEqual(calls[0][0], { expectedVersion: 0, enabled: true });
    assert.match(calls[0][1], /^[0-9a-f-]{36}$/);
    assert.equal(toggle(host).disabled, true);
    await act(async () => pending.resolve({ enabled: true, version: 1 }));
    assert.match(host.querySelector('[role="status"]').textContent, /uygulandı/);
    assert.equal(host.querySelector('button[type="submit"]').disabled, true);
  });
});

test("uncertain result preserves choice and retries the exact same operation", async () => {
  const calls: any[] = [];
  await mounted(Component(), { canManage: true, api: { get: async () => initial, save: async (...args: any[]) => { calls.push(args); if (calls.length === 1) throw new ApiError("unavailable"); return { enabled: true, version: 1 }; } } }, async host => {
    await act(async () => toggle(host).click()); await click(host, "Uygula");
    assert.ok(host.querySelector('[role="alert"]')); assert.equal(toggle(host).checked, true);
    assert.equal(toggle(host).disabled, true, "unresolved operation cannot change its payload");
    await click(host, "Uygula"); assert.deepEqual(calls[1].slice(0, 2), calls[0].slice(0, 2));
    assert.equal(toggle(host).checked, true); assert.equal(toggle(host).disabled, false);
  });
});

test("conflict reload is explicit and preserves the user's selected value for a new version", async () => {
  const calls: any[] = []; let reads = 0;
  await mounted(Component(), { canManage: true, api: { get: async () => ++reads === 1 ? initial : { enabled: false, version: 4 }, save: async (...args: any[]) => { calls.push(args); if (calls.length === 1) throw new ApiError("version_conflict"); return { enabled: true, version: 5 }; } } }, async host => {
    await act(async () => toggle(host).click()); await click(host, "Uygula");
    assert.equal(reads, 1); assert.equal(toggle(host).checked, true);
    await click(host, "Güncel ayarı yükle"); assert.equal(toggle(host).checked, true);
    await click(host, "Uygula");
    assert.deepEqual(calls[1][0], { expectedVersion: 4, enabled: true }); assert.notEqual(calls[0][1], calls[1][1]);
  });
});

test("failed initial read has a useful retry and does not expose an editable assumed default", async () => {
  let reads = 0;
  await mounted(Component(), { canManage: true, api: { get: async () => { if (++reads === 1) throw new Error("offline"); return { enabled: true, version: 2 }; }, save: async () => assert.fail("no implicit save") } }, async host => {
    assert.ok(host.querySelector('[role="alert"]')); assert.equal(toggle(host)?.disabled ?? true, true);
    await click(host, "Ayarı yeniden yükle"); assert.equal(toggle(host).checked, true); assert.equal(reads, 2);
  });
});

test("review page setting remains mounted across moderation and invitation tabs", async () => {
  const Console = compile("components/catalog-admin/ProductReviewConsole.tsx", {
    "@/lib/catalog-admin-ui/client": { CatalogAdminApiError: Error, catalogAdminApi: { reviews: async () => [] } },
    "@/lib/product-page-reviews-ui/client": { ProductPageReviewSettingsApiError: ApiError, productPageReviewSettingsApi: { get: async () => initial } },
    "./ReviewCollectionConsole": { ReviewCollectionConsole: () => React.createElement("p", null, "Davetler") },
  }).ProductReviewConsole;
  await mounted(Console, { canModerate: true }, async host => {
    const section = host.querySelector('[aria-labelledby="product-page-review-settings-title"]'); assert.ok(section);
    await act(async () => toggle(host).click());
    await click(host, "Yorum davetleri"); assert.equal(host.querySelector('[aria-labelledby="product-page-review-settings-title"]'), section);
    assert.equal(toggle(host).checked, true); await click(host, "Davet ayarları"); assert.equal(toggle(host).checked, true);
  });
});

test("cancel after a conflict keeps the reload affordance available", async () => {
  await mounted(Component(), { canManage: true, api: { get: async () => initial, save: async () => { throw new ApiError("version_conflict"); } } }, async host => {
    await act(async () => toggle(host).click()); await click(host, "Uygula"); await click(host, "Vazgeç");
    assert.ok([...host.querySelectorAll("button")].some((button: any) => button.textContent === "Güncel ayarı yükle"));
  });
});

test("a late initial read cannot replace a newer load and replaced reads are aborted", async () => {
  const first = deferred(); let signal: AbortSignal | undefined;
  const older = { get: async (value: AbortSignal) => { signal = value; return first.promise; } };
  const newer = { get: async () => ({ enabled: true, version: 7 }) };
  const Settings = Component();
  function Harness() { const [api, setApi] = React.useState<any>(older); return React.createElement(React.Fragment, null, React.createElement("button", { onClick: () => setApi(newer) }, "Bağlamı yenile"), React.createElement(Settings, { canManage: true, api })); }
  await mounted(Harness, {}, async host => {
    await click(host, "Bağlamı yenile"); assert.equal(signal?.aborted, true); assert.equal(toggle(host).checked, true);
    await act(async () => first.resolve(initial)); assert.equal(toggle(host).checked, true);
  });
});
