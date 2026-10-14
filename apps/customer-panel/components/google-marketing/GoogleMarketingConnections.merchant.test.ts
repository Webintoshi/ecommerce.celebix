import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, type ReactNode } from "react";
import { compile, mounted, click } from "../../lib/mira-final-test-support.ts";

const merchant = { service: "merchant", version: 1, status: "disconnected", googleEmail: "owner@example.test", selection: null, lastCheckedAt: null, errorCode: null };
const overview = { storeDomain: "store.example.test", oauthConfigured: true, connections: [merchant] };
const resources = { accounts: [{ id: "123", name: "Store Merchant" }], resources: [{ id: "123", name: "Store Merchant", parentId: "123" }] };
function component(client: Record<string, unknown>) {
  return compile("components/google-marketing/GoogleMarketingConnections.tsx", {
    "./client": { googleMarketingClient: client },
    "@/components/panel/PanelPageShell": { PanelSkeletonBlock: () => createElement("span", { "aria-hidden": true }), PanelStatusBadge: ({ children }: { children: ReactNode }) => createElement("span", null, children) },
  }).GoogleMarketingConnections;
}

test("Merchant is available only through an explicit service filter; existing marketing stays at three services", async () => {
  const Component = component({ overview: async () => overview });
  await mounted(Component, { canManage: true }, async (host: HTMLElement) => {
    assert.equal(host.querySelectorAll("article").length, 3);
    assert.doesNotMatch(host.textContent ?? "", /Google Merchant Center/);
  });
  await mounted(Component, { canManage: true, services: ["merchant"] }, async (host: HTMLElement) => {
    assert.equal(host.querySelectorAll("article").length, 1);
    assert.match(host.textContent ?? "", /Google Merchant Center/);
    assert.doesNotMatch(host.textContent ?? "", /Tag Manager/);
  });
});

test("Merchant chooses one account and applies once without a separate source or publish step", async () => {
  const calls: any[] = [];
  let changed = 0;
  const Component = component({ overview: async () => overview, resources: async () => resources, apply: async (input: any, operationId: string) => { calls.push({ input, operationId }); return { ...merchant, version: 2, status: "connected", selection: { ...input.selection, resourceId: "456" } }; } });
  await mounted(Component, { canManage: true, services: ["merchant"], onChange: () => { changed++; } }, async (host: HTMLElement) => {
    await click(host, "Google Merchant Center bağlantısını yönet");
    assert.ok(host.querySelector('select[aria-label="Merchant hesabı"]'));
    assert.equal(host.querySelectorAll("select").length, 1);
    await click(host, "Uygula");
    assert.deepEqual(calls[0].input.selection, { accountId: "123", resourceId: "123", resourceName: "Store Merchant" });
    assert.equal(changed, 1);
    assert.match(host.textContent ?? "", /Ürün aktarımı sıraya alındı/);
    assert.doesNotMatch(host.textContent ?? "", /ürünler.*onaylandı/i);
  });
});

test("Merchant domain prerequisite gives a safe Google setup link and preserves the selected account", async () => {
  const Component = component({ overview: async () => overview, resources: async () => resources, apply: async () => { throw Object.assign(new Error("verification"), { code: "merchant_domain_unverified" }); } });
  await mounted(Component, { canManage: true, services: ["merchant"] }, async (host: HTMLElement) => {
    await click(host, "Google Merchant Center bağlantısını yönet");
    await click(host, "Uygula");
    assert.match(host.textContent ?? "", /alan adını.*doğrulayın/i);
    const link = host.querySelector<HTMLAnchorElement>('a[data-merchant-setup]');
    assert.ok(link);
    assert.equal(new URL(link.href).origin, "https://merchants.google.com");
    assert.equal(host.querySelector<HTMLSelectElement>('select[aria-label="Merchant hesabı"]')?.value, "123");
    await act(async () => {});
  });
});
