import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { compile, mounted, click, input } from "./mira-final-test-support.ts";

const NOW = "2026-09-26T10:00:00.000Z";
const initial = { id: "11111111-1111-4111-8111-111111111111", kind: "general_setting", name: "Genel Ayarlar", config: { storeDisplayName: "Kontrollü test mağazası", supportEmail: "test@example.test", timezone: "Europe/Istanbul", skuPrefix: "TEST" }, status: "active", version: 1, createdAt: NOW, updatedAt: NOW };

function consoleModule(api: any) {
  return compile("components/merchant-admin/MerchantModuleConsole.tsx", {
    "@/lib/merchant-admin-ui/client": { MerchantAdminApiError: Error, merchantAdminApi: api },
    "@/lib/provider-execution-ui/client": { providerExecutionApi: {} },
  });
}

test("settings save rejection preserves entered values, reset restores saved values, read-only disables editing", async () => {
  const api = { records: async () => [initial], events: async () => [], save: async () => { throw new Error("Reddedildi"); } };
  const { MerchantModuleConsole } = consoleModule(api);
  await mounted(MerchantModuleConsole, { kind: "general_setting", canManage: true }, async (host, window) => {
    assert.equal(host.querySelector('button[type=submit]')?.disabled ?? [...host.querySelectorAll("button")].find((button: any) => button.textContent === "Kaydet")?.disabled, true);
    await input(window, host.querySelector('[name="storeDisplayName"]'), "Korunacak değişiklik");
    assert.equal(host.querySelector("form")?.dataset.settingsDirty, "true");
    await click(host,"Kaydet");
    assert.match(host.textContent,/Reddedildi/);
    assert.equal(host.querySelector('[name="storeDisplayName"]')?.value,"Korunacak değişiklik");
    await click(host,"Vazgeç");
    assert.equal(host.querySelector('[name="storeDisplayName"]')?.value, initial.config.storeDisplayName);
    assert.equal(host.querySelector("form")?.dataset.settingsDirty,"false");
  });
  await mounted(MerchantModuleConsole, { kind: "general_setting", canManage: false }, async host => {
    assert.equal(host.querySelector("fieldset")?.disabled,true);
    assert.match(host.textContent,/Salt okunur/);
    assert.equal([...host.querySelectorAll("button")].some((button: any) => button.textContent === "Kaydet"),false);
  });
});

test("successful settings mutation advances version and clears dirty even if auxiliary read fails", async () => {
  let rejectRead = false;
  const versions: number[] = [];
  const api = {
    records: async () => { if (rejectRead) throw new Error("Yenileme başarısız"); return [initial]; },
    events: async () => [],
    save: async (_kind: string, payload: any) => { versions.push(payload.expectedVersion); rejectRead = true; return { id: initial.id, kind: initial.kind, status: "active", version: payload.expectedVersion+1, updatedAt: NOW, replayed: false }; },
  };
  const { MerchantModuleConsole } = consoleModule(api);
  await mounted(MerchantModuleConsole, { kind: "general_setting", canManage: true }, async (host, window) => {
    await input(window,host.querySelector('[name="storeDisplayName"]'),"Kaydedilen değişiklik");
    await click(host,"Kaydet");
    assert.equal(host.querySelector('[name="storeDisplayName"]')?.value,"Kaydedilen değişiklik");
    assert.equal(host.querySelector("form")?.dataset.settingsDirty,"false");
    assert.match(host.textContent,/Yenileme başarısız/);
    assert.equal([...host.querySelectorAll("button")].find((button: any) => button.textContent?.includes("Yenile"))?.disabled,false);
    await input(window,host.querySelector('[name="storeDisplayName"]'),"İkinci değişiklik");
    await click(host,"Kaydet");
    assert.deepEqual(versions,[1,2]);
  });
});

test("settings duplicate submit is locked until the first mutation completes", async () => {
  let calls = 0;
  let finish: (value: any) => void = () => {};
  const pending = new Promise(resolve => { finish = resolve; });
  const { MerchantModuleConsole } = consoleModule({ records: async () => [initial], events: async () => [], save: async () => { calls++; return pending; } });
  await mounted(MerchantModuleConsole, { kind: "general_setting", canManage: true }, async (host, window) => {
    await input(window,host.querySelector('[name="storeDisplayName"]'),"Bekleyen değişiklik");
    await act(async () => { const form = host.querySelector("form"); form.dispatchEvent(new window.Event("submit",{ bubbles:true,cancelable:true })); form.dispatchEvent(new window.Event("submit",{ bubbles:true,cancelable:true })); });
    assert.equal(calls,1);
    assert.equal(host.querySelector("fieldset")?.disabled,true);
    await act(async () => finish({ id:initial.id,kind:initial.kind,status:"active",version:2,updatedAt:NOW,replayed:false }));
  });
});

// The actual link activation must run every editor's capture guard; the mobile
// chooser must not use a direct router.push that bypasses those handlers.
test("mobile settings selection respects an editor navigation veto", async () => {
  const pushes: string[] = [];
  const { SettingsWorkspace } = compile("components/settings/SettingsWorkspace.tsx", { "next/navigation": { usePathname: () => "/settings/design", useRouter: () => ({ push: (href: string) => pushes.push(href) }) } });
  await mounted(SettingsWorkspace, { children: createElement("p",null,"Editor") }, async (host, window) => {
    let intercepted = 0;
    const guard = (event: any) => { if (event.target.closest?.('a[href="/settings/language"]')) { intercepted++; event.preventDefault(); event.stopPropagation(); } };
    window.document.addEventListener("click",guard,true);
    await act(async () => { const select = host.querySelector("select"); select.value = "/settings/language"; select.dispatchEvent(new window.Event("change",{ bubbles:true })); });
    assert.equal(intercepted,1);
    assert.deepEqual(pushes,[]);
    assert.equal(host.querySelector("select").value,"/settings/design");
    (window.document as unknown as Document).removeEventListener("click",guard,true);
  });
});

test("settings workspace protects browser refresh only while an editor has unsaved changes", async () => {
  const { SettingsWorkspace } = compile("components/settings/SettingsWorkspace.tsx", { "next/navigation": { usePathname: () => "/settings/shipping", useRouter: () => ({ push: () => {} }) } });
  await mounted(SettingsWorkspace, { children: createElement("section", { "data-settings-dirty": "true" }, "Editor") }, async (host, window) => {
    const dirtyEvent = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(dirtyEvent);
    assert.equal(dirtyEvent.defaultPrevented, true);
    host.querySelector('[data-settings-dirty]').removeAttribute("data-settings-dirty");
    const cleanEvent = new window.Event("beforeunload", { cancelable: true });
    window.dispatchEvent(cleanEvent);
    assert.equal(cleanEvent.defaultPrevented, false);
  });
});

test("shipping refresh protects unsaved choices and resource save retains an unfinished API key", async () => {
  const workspace = { connection: { status: "active", selectedBrandLabel: "Birinci marka", selectedAddressLabel: "Merkez", codDeliveredMarksPaid: false }, resources: [{ id: "b1", kind: "brand", label: "Birinci marka", active: true }, { id: "b2", kind: "brand", label: "İkinci marka", active: true }, { id: "a1", kind: "address", label: "Merkez", active: true }] };
  let calls = 0;
  let finish: (value: any) => void = () => {};
  const pending = new Promise(resolve => { finish = resolve; });
  const { ShippingSettingsConsole } = compile("components/shipping/ShippingSettingsConsole.tsx", { "@/lib/shipping-ui/client": { ShippingSettingsApiError: Error, shippingSettingsApi: { current: async () => workspace, selectResources: async () => { calls++; return pending; } } } });
  await mounted(ShippingSettingsConsole, { canManage:true }, async (host, window) => {
    await click(host,"Basit Kargo API anahtarını değiştir");
    await input(window,host.querySelector('[type="password"]'),"not-an-actual-api-key");
    await act(async () => { const select = host.querySelector("select"); select.value = "b2"; select.dispatchEvent(new window.Event("change",{ bubbles:true })); });
    assert.equal(host.querySelector('[aria-label="Kargo bağlantısını yenile"]')?.disabled,true);
    await click(host,"Vazgeç");
    assert.equal(host.querySelector("select")?.value,"b1");
    assert.equal(host.querySelector('[aria-label="Kargo bağlantısını yenile"]')?.disabled,false);
    await act(async () => { const select = host.querySelector("select"); select.value = "b2"; select.dispatchEvent(new window.Event("change",{ bubbles:true })); });
    await act(async () => { const form = host.querySelector("form"); form.dispatchEvent(new window.Event("submit",{ bubbles:true,cancelable:true })); form.dispatchEvent(new window.Event("submit",{ bubbles:true,cancelable:true })); });
    assert.equal(calls,1);
    await act(async () => finish({ ...workspace, connection: { ...workspace.connection, selectedBrandLabel:"İkinci marka" } }));
    assert.equal(host.querySelector('[type="password"]')?.value,"not-an-actual-api-key");
    assert.equal(host.querySelector("select")?.value,"b2");
    assert.equal(host.querySelector('[aria-label="Kargo bağlantısını yenile"]')?.disabled,false);
  });
});
