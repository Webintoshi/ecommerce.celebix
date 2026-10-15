import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { compile, mounted, click } from "../../lib/mira-final-test-support.ts";

function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const workspace = {
  connection: { providerCode: "basit_kargo", displayName: "Basit Kargo", status: "active", credentialVersion: 1, selectedBrandLabel: "Test marka", selectedAddressLabel: "Test depo", codDeliveredMarksPaid: false, verifiedAt: "2026-10-15T00:00:00Z", version: 3 },
  resources: [
    { id: "brand", kind: "brand", label: "Test marka", active: true },
    { id: "address", kind: "address", label: "Test depo", active: true },
  ],
};

test("shipping refresh retains the known workspace in place, locks changes and reports read failure", async () => {
  const refresh = deferred<any>(); let reads = 0, writes = 0;
  const { ShippingSettingsConsole } = compile("components/shipping/ShippingSettingsConsole.tsx", {
    "@/lib/shipping-ui/client": {
      ShippingSettingsApiError: class extends Error {},
      shippingSettingsApi: {
        current: () => ++reads === 1 ? Promise.resolve(workspace) : refresh.promise,
        saveConnection: () => { writes++; }, selectResources: () => { writes++; }, revoke: () => { writes++; },
      },
    },
  });
  await mounted(ShippingSettingsConsole, { canManage: true }, async host => {
    const sender = host.querySelector("select"); assert.ok(sender);
    await click(host, "Kargo bağlantısını yenile");
    assert.ok(host.querySelector("select") === sender, "refresh must not unmount the known form");
    assert.equal(sender.disabled, true, "retained controls must not authorize a stale write");
    assert.match(host.textContent, /Test marka/);
    await act(async () => refresh.reject(new Error("unavailable")));
    assert.ok(host.querySelector("select") === sender);
    assert.match(host.textContent, /İşlem tamamlanamadı/);
    assert.equal(writes, 0);
  });
});

test("asset archive reconciliation keeps existing image cards visible until its fresh list arrives", async () => {
  const refresh = deferred<Response>(); let reads = 0;
  const asset = { id: "71000000-0000-4000-8000-000000000001", storeId: "71000000-0000-4000-8000-000000000002", kind: "hero", objectKey: "stores/71000000-0000-4000-8000-000000000002/storefront/hero/71000000-0000-4000-8000-000000000001.png", publicUrl: "https://media.example.test/stores/71000000-0000-4000-8000-000000000002/storefront/hero/71000000-0000-4000-8000-000000000001.png", mediaType: "image/png", altText: "Test banner", width: 1600, height: 900, byteSize: 1024, status: "active", createdAt: "2026-10-15T00:00:00.000Z", updatedAt: "2026-10-15T00:00:00.000Z", version: 1 };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => init?.method === "DELETE" ? Response.json({}) : ++reads === 1 ? Response.json({ assets: [asset] }) : refresh.promise) as typeof fetch;
  try {
    const { StorefrontAssetManager } = compile("components/settings/StorefrontAssetManager.tsx", {
      "@/lib/merchant-admin-ui/client": { merchantAdminApi: {} },
    });
    await mounted(StorefrontAssetManager, { canManage: true }, async host => {
      const card = host.querySelector("li"); assert.ok(card);
      await act(async () => [...host.querySelectorAll("button")].find(button => button.textContent.trim() === "Arşivle")!.click());
      assert.ok(host.querySelector("li") === card, "same-scope reconciliation must not blank image cards");
      assert.equal(card.querySelector("button").disabled, true);
      await act(async () => refresh.resolve(Response.json({ assets: [] })));
      assert.equal(host.querySelector("li"), null);
      assert.match(host.textContent, /Henüz vitrin görseli yok/);
    });
  } finally { globalThis.fetch = originalFetch; }
});
