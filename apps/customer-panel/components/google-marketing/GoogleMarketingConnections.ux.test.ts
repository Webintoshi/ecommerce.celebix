import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement, type ReactNode } from "react";
import { compile, mounted, click } from "../../lib/mira-final-test-support.ts";

const email = "owner@example.test";
const storeDomain = "store.example.test";
const connectedGtm = {
  service: "gtm", version: 1, status: "connected", googleEmail: email,
  selection: { accountId: "12", resourceId: "34", resourceName: "Existing store", tagId: "GTM-AB1234" },
  lastCheckedAt: null, errorCode: null,
};
const initial = { storeDomain, oauthConfigured: true, connections: [
  connectedGtm,
  { service: "ads", version: 1, status: "disconnected", googleEmail: email, selection: null, lastCheckedAt: null, errorCode: null },
  { service: "search_console", version: 0, status: "disconnected", googleEmail: email, selection: null, lastCheckedAt: null, errorCode: null },
] };
const gtmResources = { accounts: [{ id: "12", name: "Store account" }], resources: [
  { id: "34", parentId: "12", name: "Existing store", tagId: "GTM-AB1234" },
  { id: "35", parentId: "12", name: "Replacement store", tagId: "GTM-CD5678" },
] };

function consumer(client: Record<string, unknown>) {
  return compile("components/google-marketing/GoogleMarketingConnections.tsx", {
    "./client": { googleMarketingClient: client },
    "@/components/panel/PanelPageShell": {
      PanelSkeletonBlock: () => createElement("span", { "aria-hidden": true }),
      PanelStatusBadge: ({ children }: { children: ReactNode }) => createElement("span", null, children),
    },
  }).GoogleMarketingConnections;
}
function button(host: HTMLElement, label: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>("button")].find(node => node.textContent === label || node.getAttribute("aria-label") === label);
  assert.ok(result, `Missing button ${label}`);
  return result;
}
function dialog(host: HTMLElement) {
  const result = host.querySelector<HTMLDialogElement>("dialog");
  assert.ok(result);
  return result;
}
async function select(host: HTMLElement, window: any, label: string, value: string) {
  const field = host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`);
  assert.ok(field, `Missing ${label}`);
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, "value")!.set!.call(field, value);
    field.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}
function apiError(code: string) { return Object.assign(new Error(code), { code }); }

test("Search Console hides its synthetic account decision and applies only an explicit store-site selection", async () => {
  const requests: { input: any; key: string }[] = [];
  const Component = consumer({
    overview: async () => initial,
    resources: async () => ({ accounts: [{ id: "site", name: "Search Console" }], resources: [
      { id: "https://other.example.test/", parentId: "site", name: "Other store" },
      { id: `https://${storeDomain}/`, parentId: "site", name: "Store URL" },
      { id: `sc-domain:${storeDomain}`, parentId: "site", name: "Store domain" },
    ] }),
    apply: async (input: any, key: string) => {
      requests.push({ input, key });
      return { ...initial.connections[2], status: "connected", version: 1, selection: input.selection };
    },
  });
  await mounted(Component, { canManage: true }, async (host: HTMLElement, window) => {
    await click(host, "Google Search Console bağlantısını yönet");
    assert.equal(dialog(host).querySelector('select[aria-label="Google hesabı"]'), null, "The internal site account must not become a user decision");
    assert.equal(requests.length, 0);
    assert.equal(button(host, "Uygula").disabled, true, "Discovery alone cannot start verification");
    const sites = dialog(host).querySelector<HTMLSelectElement>('select[aria-label="Site"]');
    assert.ok(sites);
    assert.doesNotMatch(sites.textContent ?? "", /Other store/);
    assert.match(sites.textContent ?? "", /Store URL/);
    assert.match(sites.textContent ?? "", /Store domain/);
    await select(host, window, "Site", "__create__");
    assert.equal(requests.length, 0, "Choosing verification still requires the final action");
    await click(host, "Uygula");
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].input, { service: "search_console", expectedVersion: 0, selection: {
      accountId: "site", resourceId: `https://${storeDomain}/`, resourceName: storeDomain, create: true,
    } });
  });
});

test("disconnect requires confirmation; cancelling preserves the live connection and a confirmed removal writes once", async () => {
  const requests: { input: any; key: string }[] = [];
  const Component = consumer({
    overview: async () => initial, resources: async () => gtmResources,
    disconnect: async (input: any, key: string) => {
      requests.push({ input, key });
      return { ...connectedGtm, version: 2, status: "disconnected", googleEmail: null, selection: null };
    },
  });
  await mounted(Component, { canManage: true }, async (host: HTMLElement) => {
    await click(host, "Google Tag Manager bağlantısını yönet");
    await click(host, "Bağlantıyı kaldır");
    assert.equal(requests.length, 0);
    assert.ok(button(host, "Evet, bağlantıyı kaldır"));
    await click(host, "Vazgeç");
    assert.equal(requests.length, 0);
    assert.match(host.querySelector("article")?.textContent ?? "", /Existing store/);
    await click(host, "Google Tag Manager bağlantısını yönet");
    assert.equal([...dialog(host).querySelectorAll("button")].some(node => node.textContent === "Evet, bağlantıyı kaldır"), false, "A previous cancelled confirmation must not remain active");
    await click(host, "Bağlantıyı kaldır");
    await click(host, "Evet, bağlantıyı kaldır");
    assert.equal(requests.length, 1);
    assert.deepEqual(requests[0].input, { service: "gtm", expectedVersion: 1 });
    assert.doesNotMatch(host.querySelector("article")?.textContent ?? "", /Existing store/);
  });
});

test("an unknown disconnect result remains directly retryable with the exact saved operation after closing", async () => {
  const requests: { input: any; key: string }[] = [];
  const Component = consumer({
    overview: async () => initial, resources: async () => gtmResources,
    disconnect: async (input: any, key: string) => {
      requests.push({ input, key });
      if (requests.length === 1) throw apiError("unavailable");
      return { ...connectedGtm, version: 2, status: "disconnected", googleEmail: null, selection: null };
    },
  });
  await mounted(Component, { canManage: true }, async (host: HTMLElement, window) => {
    await click(host, "Google Tag Manager bağlantısını yönet");
    await click(host, "Bağlantıyı kaldır");
    await click(host, "Evet, bağlantıyı kaldır");
    assert.equal(requests.length, 1);
    assert.equal(button(host, "Uygula").disabled, true);
    const stored = window.sessionStorage.getItem(`celebix-google:${storeDomain}:${email}:gtm`);
    assert.ok(stored);
    assert.deepEqual(JSON.parse(stored).disconnect, { operationId: requests[0].key, input: requests[0].input });
    await click(host, "Vazgeç");
    await click(host, "Google Tag Manager bağlantısını yönet");
    assert.equal(dialog(host).querySelector<HTMLSelectElement>('select[aria-label="Web konteyneri"]')?.disabled, true);
    await click(host, "Kaldırmayı tekrar dene");
    assert.equal(requests.length, 2, "A retry does not require another confirmation click");
    assert.deepEqual(requests[1], requests[0], "The unknown result must replay the original input and operation ID");
    assert.equal(window.sessionStorage.getItem(`celebix-google:${storeDomain}:${email}:gtm`), null);
  });
});

test("conflict recovery keeps the selected resource and uses the freshly read connection version", async () => {
  let reads = 0;
  const requests: { input: any; key: string }[] = [];
  const Component = consumer({
    overview: async () => {
      reads++;
      return reads === 1 ? initial : { ...initial, connections: [{ ...connectedGtm, version: 4 }, ...initial.connections.slice(1)] };
    },
    resources: async () => gtmResources,
    apply: async (input: any, key: string) => {
      requests.push({ input, key });
      if (requests.length === 1) throw apiError("version_conflict");
      return { ...connectedGtm, version: 5, selection: input.selection };
    },
  });
  await mounted(Component, { canManage: true }, async (host: HTMLElement, window) => {
    await click(host, "Google Tag Manager bağlantısını yönet");
    await select(host, window, "Web konteyneri", "35");
    await click(host, "Uygula");
    assert.equal(requests[0].input.expectedVersion, 1);
    assert.equal(button(host, "Tekrar uygula").disabled, true, "A stale version cannot be retried before recovery");
    assert.equal(dialog(host).querySelector<HTMLSelectElement>('select[aria-label="Web konteyneri"]')?.value, "35");
    await click(host, "Güncel bağlantıyı yükle");
    assert.equal(reads, 2);
    assert.equal(requests.length, 1, "Reading the new version is not itself a save");
    assert.equal(dialog(host).querySelector<HTMLSelectElement>('select[aria-label="Web konteyneri"]')?.value, "35");
    await click(host, "Uygula");
    assert.equal(requests.length, 2);
    assert.equal(requests[1].input.expectedVersion, 4);
    assert.deepEqual(requests[1].input.selection, requests[0].input.selection);
    assert.notEqual(requests[1].key, requests[0].key, "A deliberate recovery starts a new operation for the fresh version");
  });
});

test("a late discovery response cannot replace the currently open service's accounts or resources", async () => {
  let finishGtm!: (value: typeof gtmResources) => void;
  const firstGtm = new Promise<typeof gtmResources>(resolve => { finishGtm = resolve; });
  let gtmCalls = 0;
  const adsResources = { accounts: [{ id: "77", name: "Ads account" }], resources: [
    { id: "99", parentId: "77", name: "Orders conversion", tagId: "AW-12345678", conversionLabel: "paid_orders" },
  ] };
  const Component = consumer({
    overview: async () => initial,
    resources: async (service: string) => service === "gtm" ? (++gtmCalls === 1 ? firstGtm : gtmResources) : adsResources,
  });
  await mounted(Component, { canManage: true }, async (host: HTMLElement) => {
    await click(host, "Google Tag Manager bağlantısını yönet");
    await click(host, "Vazgeç");
    await click(host, "Google Ads bağlantısını yönet");
    await act(async () => { finishGtm(gtmResources); await firstGtm; });
    assert.match(dialog(host).querySelector("h2")?.textContent ?? "", /Google Ads/);
    const account = dialog(host).querySelector<HTMLSelectElement>('select[aria-label="Google hesabı"]');
    const conversion = dialog(host).querySelector<HTMLSelectElement>('select[aria-label="Satın alma dönüşümü"]');
    assert.ok(account);
    assert.ok(conversion);
    assert.equal(account.value, "77");
    assert.match(account.textContent ?? "", /Ads account/);
    assert.match(conversion.textContent ?? "", /Orders conversion/);
    assert.doesNotMatch(`${account.textContent} ${conversion.textContent}`, /Store account|Existing store|Replacement store/);
    assert.equal(dialog(host).querySelector('select[aria-label="Web konteyneri"]'), null);
  });
});
