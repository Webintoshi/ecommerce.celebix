import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import test from "node:test";
import { act, createElement, type ReactNode } from "react";
import { compile, mounted, click } from "../../lib/mira-final-test-support.ts";

const email = "admin@example.test";
const initial = { storeDomain: "store.example.test", oauthConfigured: true, connections: [
  { service: "gtm", version: 1, status: "connected", googleEmail: email, selection: { accountId: "12", resourceId: "34", resourceName: "Existing store", tagId: "GTM-AB1234" }, lastCheckedAt: null, errorCode: null },
  { service: "ads", version: 1, status: "disconnected", googleEmail: email, selection: null, lastCheckedAt: null, errorCode: null },
  { service: "search_console", version: 0, status: "disconnected", googleEmail: null, selection: null, lastCheckedAt: null, errorCode: null },
] };
const resources = { accounts: [{ id: "12", name: "Store account" }], resources: [{ id: "34", parentId: "12", name: "Existing store", tagId: "GTM-AB1234" }, { id: "35", parentId: "12", name: "New store", tagId: "GTM-CD5678" }] };

function consumer(client: Record<string, unknown>) {
  assert.ok(existsSync(new URL("./GoogleMarketingConnections.tsx", import.meta.url)), "Google connection screen must exist");
  return compile("components/google-marketing/GoogleMarketingConnections.tsx", {
    "./client": { googleMarketingClient: client },
    "@/components/panel/PanelPageShell": {
      PanelSkeletonBlock: () => createElement("span", { "aria-hidden": true }),
      PanelStatusBadge: ({ children }: { children: ReactNode }) => createElement("span", null, children),
    },
  }).GoogleMarketingConnections;
}

function button(host: HTMLElement, label: string) {
  const target = [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label);
  assert.ok(target, `Missing ${label}`);
  return target;
}
async function select(host: HTMLElement, window: any, label: string, value: string) {
  const target = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  assert.ok(target, `Missing ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!.call(target, value);
    target.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

test("missing central OAuth setup is explicit and starts no account discovery or connect", async () => {
  let discovers = 0, connects = 0;
  const Component = consumer({ overview: async () => ({ ...initial, oauthConfigured: false }), resources: async () => { discovers++; return resources; }, connect: async () => { connects++; } });
  await mounted(Component, { canManage: true }, async (host: HTMLElement) => {
    assert.match(host.textContent ?? "", /Google bağlantısı platformda henüz yapılandırılmadı/);
    assert.equal(host.querySelectorAll("article").length, 3);
    assert.equal(discoverers(host), 0);
    assert.equal([...host.querySelectorAll("button")].filter(node => node.textContent === "Bağlan").every(node => node.disabled), true);
    assert.equal(discovers, 0);
    assert.equal(connects, 0);
  });
});
function discoverers(host: HTMLElement) { return host.querySelectorAll('select[aria-label="Google hesabı"]').length; }

test("accounts load only after setup opens; cancellation leaves the existing connection untouched", async () => {
  let discovers = 0, applies = 0;
  const Component = consumer({ overview: async () => initial, resources: async () => { discovers++; return resources; }, apply: async () => { applies++; } });
  await mounted(Component, { canManage: true }, async (host: HTMLElement, window) => {
    assert.equal(discovers, 0);
    await click(host, "Google Tag Manager bağlantısını yönet");
    assert.ok(discovers >= 1);
    await select(host, window, "Web konteyneri", "35");
    await click(host, "Vazgeç");
    assert.equal(applies, 0);
    assert.match(host.querySelector("article")?.textContent ?? "", /Existing store/);
    await click(host, "Google Tag Manager bağlantısını yönet");
    assert.equal(host.querySelector<HTMLSelectElement>('select[aria-label="Web konteyneri"]')?.value, "35", "Modal buffer must survive closing");
  });
});

test("GTM account creation stays available before authorization and with empty or existing accounts", async () => {
  for (const state of ["unauthorized", "empty", "existing"]) {
    const connections = initial.connections.map(item => item.service === "gtm" && state !== "existing" ? { ...item, status: "disconnected", googleEmail: state === "unauthorized" ? null : email, selection: null } : item);
    const Component = consumer({ overview: async () => ({ ...initial, connections }), resources: async () => state === "empty" ? { accounts: [], resources: [] } : resources });
    await mounted(Component, { canManage: true }, async (host: HTMLElement) => {
      await click(host, "Google Tag Manager bağlantısını yönet");
      const link = host.querySelector<HTMLAnchorElement>('a[href="https://tagmanager.google.com/"]');
      assert.ok(link, `Account creation must be available in ${state} setup`);
      assert.match(link.textContent ?? "", /Yeni Tag Manager hesabı oluştur/);
      assert.equal(link.target, "_blank");
      assert.deepEqual(link.rel.split(/\s+/).sort(), ["noopener", "noreferrer"]);
      if (state === "unauthorized") assert.ok(button(host, "Google ile bağlan"));
      else assert.ok(host.querySelector('select[aria-label="Tag Manager hesabı"]'));
    });
  }
});

test("refreshing GTM accounts after external creation preserves the selected container and its local buffer", async () => {
  let refreshed = false;
  const Component = consumer({ overview: async () => initial, resources: async () => ({ ...resources, accounts: refreshed ? [...resources.accounts, { id: "56", name: "New account" }] : resources.accounts }) });
  await mounted(Component, { canManage: true }, async (host: HTMLElement, window) => {
    await click(host, "Google Tag Manager bağlantısını yönet");
    await select(host, window, "Web konteyneri", "35");
    const stored = window.sessionStorage.getItem(`celebix-google:store.example.test:${email}:gtm`);
    refreshed = true;
    await click(host, "Listeyi yenile");
    assert.equal(host.querySelector<HTMLSelectElement>('select[aria-label="Tag Manager hesabı"]')?.value, "12");
    assert.equal(host.querySelector<HTMLSelectElement>('select[aria-label="Web konteyneri"]')?.value, "35");
    assert.match(host.querySelector('select[aria-label="Tag Manager hesabı"]')?.textContent ?? "", /New account/);
    assert.equal(window.sessionStorage.getItem(`celebix-google:store.example.test:${email}:gtm`), stored);
    await click(host, "Vazgeç");
    await click(host, "Google Tag Manager bağlantısını yönet");
    assert.equal(host.querySelector<HTMLSelectElement>('select[aria-label="Web konteyneri"]')?.value, "35");
  });
});

test("all Google setup dialogs expose the privacy policy while GTM actions stay scoped to GTM", async () => {
  const Component = consumer({ overview: async () => initial, resources: async () => resources });
  await mounted(Component, { canManage: true }, async (host: HTMLElement) => {
    for (const service of ["Google Tag Manager", "Google Ads", "Google Search Console"]) {
      await click(host, `${service} bağlantısını yönet`);
      const link = host.querySelector<HTMLAnchorElement>('a[href="https://celebix.net/tr/gizlilik"]');
      assert.ok(link);
      assert.equal(link.target, "_blank");
      assert.deepEqual(link.rel.split(/\s+/).sort(), ["noopener", "noreferrer"]);
      assert.equal(Boolean(host.querySelector('a[href="https://tagmanager.google.com/"]')), service === "Google Tag Manager");
      if (service === "Google Ads") assert.ok(host.querySelector('select[aria-label="Google hesabı"]'));
      await click(host, "Vazgeç");
    }
  });
});

test("failed apply preserves resource and repeats the same operation until successful activation", async () => {
  const requests: { input: any; key: string }[] = [];
  const Component = consumer({ overview: async () => initial, resources: async () => resources, apply: async (input: any, key: string) => { requests.push({ input, key }); if (requests.length === 1) throw Object.assign(new Error("unavailable"), { code: "unavailable" }); return { ...initial.connections[0], version: 2, selection: input.selection }; } });
  await mounted(Component, { canManage: true }, async (host: HTMLElement, window) => {
    await click(host, "Google Tag Manager bağlantısını yönet");
    await select(host, window, "Web konteyneri", "35");
    await click(host, "Uygula");
    assert.equal(host.querySelector<HTMLSelectElement>('select[aria-label="Web konteyneri"]')?.value, "35");
    assert.match(host.textContent ?? "", /Seçiminiz korundu/);
    await click(host, "Tekrar uygula");
    assert.equal(requests.length, 2);
    assert.equal(requests[0].key, requests[1].key);
    assert.deepEqual(requests[0].input, requests[1].input);
    assert.equal(requests[1].input.expectedVersion, 1);
    assert.match(host.querySelector("article")?.textContent ?? "", /New store/);
  });
});

test("read access keeps cards readable and never exposes connection mutation", async () => {
  const Component = consumer({ overview: async () => initial });
  await mounted(Component, { canManage: false }, async (host: HTMLElement) => {
    assert.match(host.textContent ?? "", /Existing store/);
    assert.match(host.textContent ?? "", /Bağlantıları değiştirmek için/);
    assert.equal(host.querySelectorAll('button[data-service]').length, 0);
  });
});

test("Ads without purchase actions offers Google's creation link and explicit refresh", async () => {
  const Component = consumer({ overview: async () => initial, resources: async () => ({ accounts: [{ id: "1234567890", name: "Store Ads" }], resources: [] }) });
  await mounted(Component, { canManage: true }, async (host: HTMLElement) => {
    await click(host, "Google Ads bağlantısını yönet");
    const link = host.querySelector<HTMLAnchorElement>('a[href="https://ads.google.com/aw/conversions"]');
    assert.ok(link);
    assert.equal(link.target, "_blank");
    assert.ok(button(host, "Listeyi yenile"));
    assert.equal(button(host, "Uygula").disabled, true);
  });
});

test("Search Console offers only this store's matching properties and creates its canonical URL", async () => {
  let applied: any;
  const connections = initial.connections.map(item => item.service === "search_console" ? { ...item, googleEmail: email } : item);
  const Component = consumer({ overview: async () => ({ ...initial, connections }), resources: async () => ({ accounts: [{ id: "site", name: "Search Console" }], resources: [
    { id: "https://other.example.test/", name: "Other store", parentId: "site" },
    { id: "https://store.example.test/", name: "Current store", parentId: "site" },
    { id: "sc-domain:store.example.test", name: "Current domain", parentId: "site" },
  ] }), apply: async (input: any) => { applied = input; return { ...connections[2], status: "connected", version: 1, selection: input.selection }; } });
  await mounted(Component, { canManage: true }, async (host: HTMLElement, window) => {
    await click(host, "Google Search Console bağlantısını yönet");
    const sites = host.querySelector<HTMLSelectElement>('select[aria-label="Site"]');
    assert.ok(sites);
    assert.doesNotMatch(sites.textContent ?? "", /Other store/);
    assert.match(sites.textContent ?? "", /Current store/);
    assert.match(sites.textContent ?? "", /Current domain/);
    await select(host, window, "Site", "__create__");
    await click(host, "Uygula");
    assert.deepEqual(applied.selection, { accountId: "site", resourceId: "https://store.example.test/", resourceName: "store.example.test", create: true });
  });
});

test("provider permission failure repeats its existing operation and preserves selected values", async () => {
  const requests: { input: any; key: string }[] = [];
  const Component = consumer({ overview: async () => initial, resources: async () => resources, apply: async (input: any, key: string) => { requests.push({ input, key }); if (requests.length === 1) throw Object.assign(new Error("provider_denied"), { code: "provider_denied" }); return { ...initial.connections[0], version: 2, selection: input.selection }; } });
  await mounted(Component, { canManage: true }, async (host: HTMLElement, window) => {
    await click(host, "Google Tag Manager bağlantısını yönet");
    await select(host, window, "Web konteyneri", "__create__");
    await click(host, "Uygula");
    assert.equal(host.querySelector<HTMLSelectElement>('select[aria-label="Web konteyneri"]')?.disabled, true);
    await click(host, "Tekrar uygula");
    assert.equal(requests[0].key, requests[1].key);
    assert.deepEqual(requests[0].input.selection, { accountId: "12", resourceId: "store.example.test", resourceName: "store.example.test", create: true });
  });
});

test("incremental GTM authorization preserves the apply attempt across Google navigation", async () => {
  const requests: { input: any; key: string }[] = [];
  let redirected = "";
  const Component = consumer({ overview: async () => initial, resources: async () => resources, connect: async () => ({ authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth?client_id=fixture" }), apply: async (input: any, key: string) => { requests.push({ input, key }); if (requests.length === 1) throw Object.assign(new Error("incremental_authorization_required"), { code: "incremental_authorization_required" }); return { ...initial.connections[0], version: 2, selection: input.selection }; } });
  await mounted(Component, { canManage: true, onAuthorize: (url: string) => { redirected = url; } }, async (host: HTMLElement, window) => {
    await click(host, "Google Tag Manager bağlantısını yönet");
    await select(host, window, "Web konteyneri", "35");
    await click(host, "Uygula");
    await click(host, "Google’da yetkiyi tamamla");
    assert.match(redirected, /^https:\/\/accounts.google.com\//);
    const saved = window.sessionStorage.getItem(`celebix-google:store.example.test:${email}:gtm`);
    assert.ok(saved);
    assert.equal(JSON.parse(saved).apply.operationId, requests[0].key);
    assert.equal(JSON.parse(saved).selection.resourceId, "35");
  });
});
