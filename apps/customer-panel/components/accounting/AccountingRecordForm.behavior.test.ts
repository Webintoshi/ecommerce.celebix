import assert from "node:assert/strict";
import test from "node:test";
import { act, createElement } from "react";
import { compile, input, mounted } from "../../lib/mira-final-test-support.ts";

const date = "2026-10-15T12:00:00Z";
const invoice = { id: "71000000-0000-4000-8000-000000000001", kind: "invoice_integration", name: "Fatura hesabım", config: { provider: "Sağlayıcım", accountReference: "HESAP-42", enabled: true }, status: "draft", version: 7, createdAt: date, updatedAt: date };
const profile = { ...invoice, kind: "accounting_profile", name: "Merkez", config: { legalName: "Örnek Ticaret", taxOffice: "Kadıköy", taxNumber: "1234567890", invoiceEmail: "fatura@example.test" }, status: "active" };
const submit = async (host: any, window: any) => { await act(async () => host.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); };

test("invoice editing retains the closed status, version and every field after a failed save without starting reconciliation", async () => {
  const saves: any[] = [], destinations: string[] = [];
  const Component = compile("components/merchant-admin/MerchantRecordEditor.tsx", {
    "next/navigation": { useRouter: () => ({ push: (path: string) => destinations.push(path), refresh() {} }) },
    "@/lib/merchant-admin-ui/client": {
      MerchantAdminApiError: class extends Error {},
      merchantAdminApi: { record: async () => invoice, save: async (kind: string, value: unknown) => { saves.push({ kind, value }); if (saves.length === 1) throw new Error("offline"); } },
    },
  }).MerchantRecordEditor;
  await mounted(Component, { kind: "invoice_integration", recordId: invoice.id, returnTo: "/accounting/invoicing-integration", canManage: true }, async (host, window) => {
    assert.equal(host.querySelector('nav[aria-label="Muhasebe bölümleri"]'), null);
    const name = host.querySelector('[name="name"]');
    await input(window, name, "Yeni bağlantı adım");
    assert.equal(host.querySelector('[name="status"]').value, "draft");
    assert.match(host.textContent, /API anahtarı veya şifre yazmayın/);
    await submit(host, window);
    assert.equal(name.value, "Yeni bağlantı adım");
    assert.equal(host.querySelector('[name="provider"]').value, invoice.config.provider);
    assert.equal(host.querySelector('[name="accountReference"]').value, "HESAP-42");
    assert.equal(host.querySelector('[name="enabled"]').checked, true);
    assert.match(host.querySelector('[role="alert"]').textContent, /Bilgileriniz korundu/);
    assert.deepEqual(destinations, []);
    await submit(host, window);
    assert.deepEqual(saves[1], { kind: "invoice_integration", value: { recordId: invoice.id, expectedVersion: 7, name: "Yeni bağlantı adım", config: invoice.config, status: "draft" } });
    assert.deepEqual(destinations, ["/accounting/invoicing-integration"]);
  });
});

const panel = {
  PanelPageShell: ({ children }: any) => createElement("section", null, children),
  PanelPageHeader: ({ actions }: any) => createElement("header", null, actions),
  PanelStatusBadge: ({ children, tone }: any) => createElement("span", { "data-tone": tone }, children),
  PanelDataTable: ({ children }: any) => createElement("table", null, children),
  PanelMetricCard: () => null, PanelEmptyState: () => null, PanelSkeletonBlock: () => null,
};
function consoleWith(api: any, profiles: any[] = []) {
  return compile("components/merchant-admin/MerchantModuleConsole.tsx", {
    "@/components/panel/PanelPageShell": panel,
    "@/components/merchant-admin/ProviderConnectionPanel": { ProviderConnectionPanel: () => createElement("details", { "data-provider-panel": true }, createElement("summary", null, "Sağlayıcı bağlantıları")) },
    "@/lib/provider-execution-ui/client": { providerExecutionApi: { profiles: async () => profiles } },
    "@/lib/merchant-admin-ui/client": { MerchantAdminApiError: class extends Error {}, merchantAdminApi: api },
  }).MerchantModuleConsole;
}

test("business profiles remain a collection and edit all legal fields using the selected record version", async () => {
  const second = { ...profile, id: "71000000-0000-4000-8000-000000000002", name: "Şube" }, saves: any[] = [];
  const Component = consoleWith({ records: async () => [profile, second], events: async () => [], save: async (kind: string, value: any) => { saves.push({ kind, value }); return { ...profile, ...value, version: 8 }; } });
  await mounted(Component, { kind: "accounting_profile", canManage: true }, async (host, window) => {
    assert.equal(host.querySelectorAll("table tbody tr").length, 2);
    assert.ok(host.querySelector('[aria-label="Merkez kaydını arşivle"]'));
    assert.ok([...host.querySelectorAll("button")].find((button: any) => button.textContent.includes("İşletme ekle")));
    await act(async () => host.querySelector('[aria-label="Merkez kaydını düzenle"]').click());
    const dialog = host.querySelector('[role="dialog"]');
    await input(window, dialog.querySelector('[name="taxNumber"]'), "9876543210");
    await submit(dialog, window);
    assert.deepEqual(saves, [{ kind: "accounting_profile", value: { recordId: profile.id, expectedVersion: 7, name: "Merkez", status: "active", config: { ...profile.config, taxNumber: "9876543210" } } }]);
  });
});

test("invoice unknown outcome keeps external actions blocked and provider management remains reachable below the list", async () => {
  const record = { ...invoice, status: "active" };
  const Component = consoleWith({ records: async () => [record], events: async () => [], providerJobs: async () => [{ id: "job", recordId: record.id, status: "provider_outcome_unknown", updatedAt: date, version: 1 }] });
  await mounted(Component, { kind: "invoice_integration", canManage: true }, async host => {
    assert.match(host.textContent, /Sonuç doğrulanıyor/);
    assert.doesNotMatch(host.textContent, /Uzlaştırma hazırlığı oluştur|Sıraya al/);
    const table = host.querySelector("table"), providers = host.querySelector("[data-provider-panel]");
    assert.ok(table && providers);
    assert.ok(table.compareDocumentPosition(providers) & 4);
    assert.equal(host.querySelector('[data-tone="neutral"]')?.textContent, "Hazırlığa açık");
    assert.ok(host.querySelector('a[href="/accounting/invoicing-integration/new"]'));
    assert.ok(host.querySelector(`a[href="/accounting/invoicing-integration/${record.id}/edit"]`));
  });
});


test("readonly invoice list does not add finance navigation or edit actions", async () => {
  const Component = consoleWith({ records: async () => [invoice], events: async () => [], providerJobs: async () => [] });
  await mounted(Component, { kind: "invoice_integration", canManage: false }, async host => {
    assert.equal(host.querySelector('nav[aria-label="Muhasebe bölümleri"]'), null);
    assert.equal(host.querySelector('a[href="/accounting/accounts"]'), null);
    assert.equal(host.querySelector('a[href="/accounting/invoicing-integration/new"]'), null);
    assert.equal(host.querySelector('[data-record-actions]'), null);
  });
});
