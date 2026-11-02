import assert from "node:assert/strict";
import test from "node:test";
import type { MerchantAdminRecord } from "@celebix/saas-contracts";
import { click, compile, input, mounted } from "../../lib/mira-final-test-support.ts";
import { MerchantAdminApiError } from "../../lib/merchant-admin-ui/client.ts";

const record = (id: string, name: string): MerchantAdminRecord => ({ id, name, kind: "page", config: { published: true }, status: "active", version: 1, createdAt: "2026-11-02T12:00:00.000Z", updatedAt: "2026-11-02T12:00:00.000Z" });

test("matching policy copies have a separate collapsed group with both saved-document destinations", async () => {
  const { ContentPagesList } = compile("components/content/ContentPagesList.tsx");
  const normal = record("71000000-0000-4000-8000-000000000001", "Hakkımızda");
  const policy = record("71000000-0000-4000-8000-000000000002", "Gizlilik Politikası");
  let archives = 0;
  await mounted(ContentPagesList, { records: [normal], policyRecords: [{ record: policy, policyKey: "privacy_security" }], canManage: true, busy: false, onArchive() { archives++; } }, async host => {
    const group = host.querySelector('details[aria-label="Politika metinleri"]');
    assert.ok(group, "matching policy copies must not remain mixed into the normal page list");
    assert.equal(group.open, false);
    assert.match(group.querySelector("summary")!.textContent!, /Politika metinleri \(1\)/);
    const normalPages = host.querySelector('ul[aria-label="Sayfalar"]')!;
    assert.equal(normalPages.children.length, 1);
    assert.match(normalPages.textContent!, /Hakkımızda/);
    assert.doesNotMatch(normalPages.textContent!, /Gizlilik Politikası/);
    assert.equal(group.querySelector(`a[aria-label="${policy.name} politikasını aç"]`)?.textContent, "Politikayı aç");
    assert.ok(group.querySelector(`a[href="/content/pages/${policy.id}/edit"]`), "the original page must remain accessible");
    assert.equal(group.querySelector("button"), null, "organizing cannot add a deletion action for the copies");
    assert.equal(archives, 0);
  });
});

test("read-only policy grouping preserves view access and renders no edit or archive control", async () => {
  const { ContentPagesList } = compile("components/content/ContentPagesList.tsx");
  const policy = record("71000000-0000-4000-8000-000000000002", "KVKK");
  await mounted(ContentPagesList, { records: [], policyRecords: [{ record: policy, policyKey: "kvkk" }], canManage: false, busy: false, onArchive() { throw new Error("unexpected mutation"); } }, async host => {
    const group = host.querySelector('details[aria-label="Politika metinleri"]');
    assert.ok(group);
    assert.equal(host.querySelector('ul[aria-label="Sayfalar"]'), null);
    assert.ok(group.querySelector(`a[aria-label="${policy.name} sayfa kaydını görüntüle"]`));
    assert.equal(host.querySelector("button"), null);
  });
});

test("the actual page console excludes associated policies from counts, filters both groups and restores changed copies", async () => {
  const normal = ["Hakkımızda", "İletişim", "Blog", "SSS"].map((name, index) => record(`71000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`, name));
  const keys = ["privacy_security", "distance_sales", "kvkk", "returns_exchanges"] as const;
  const copies = ["Gizlilik", "Mesafeli Satış", "KVKK", "İade"].map((name, index) => record(`71000000-0000-4000-8000-${String(index + 5).padStart(12, "0")}`, name));
  const associations = copies.map((item, index) => ({ recordId: item.id, recordVersion: item.version, policyKey: keys[index]! }));
  let records = [...normal, ...copies], reads = 0, writes = 0;
  const unexpected = async () => { writes++; throw new Error("unexpected mutation"); };
  const { MerchantModuleConsole } = compile("components/merchant-admin/MerchantModuleConsole.tsx", {
    "@/lib/merchant-admin-ui/client": { MerchantAdminApiError, merchantAdminApi: { async records() { reads++; return records; }, async events() { return []; }, save: unexpected, archive: unexpected } },
    "@/lib/provider-execution-ui/client": { providerExecutionApi: {} },
    "@/components/merchant-admin/ProviderConnectionPanel": { ProviderConnectionPanel: () => null },
    "@/components/accounting/AccountingRecordForm": { AccountingRecordForm: () => null },
    "@/components/accounting/AccountingNavigation": { AccountingNavigation: () => null },
    "@/components/accounting/AccountingEmptyState": { AccountingEmptyState: () => null },
    "@/components/settings/SettingsRecordForm": { SettingsRecordForm: () => null },
  });
  await mounted(MerchantModuleConsole, { kind: "page", canManage: true, embedded: true, policyPageAssociations: associations }, async (host, window) => {
    assert.match(host.textContent!, /4 \/ 4 sayfa/);
    assert.equal(host.querySelector('ul[aria-label="Sayfalar"]')?.children.length, 4);
    assert.equal(host.querySelector('ul[aria-label="Politika sayfa kayıtları"]')?.children.length, 4);
    const search = host.querySelector('input[aria-label="Sayfa ara"]')!;
    await input(window, search, "KVKK");
    assert.match(host.textContent!, /0 \/ 4 sayfa/);
    assert.equal(host.querySelector('ul[aria-label="Sayfalar"]'), null);
    const policies = host.querySelector('ul[aria-label="Politika sayfa kayıtları"]')!;
    assert.equal(policies.children.length, 1);
    assert.match(policies.textContent!, /KVKK/);
    await input(window, search, "");
    records = records.map(item => item.id === copies[0]!.id ? { ...item, version: 2 } : item);
    await click(host, "Sayfaları yenile");
    assert.match(host.textContent!, /5 \/ 5 sayfa/);
    assert.equal(host.querySelector('ul[aria-label="Sayfalar"]')?.children.length, 5);
    assert.equal(host.querySelector('ul[aria-label="Politika sayfa kayıtları"]')?.children.length, 3);
    assert.match(host.querySelector('ul[aria-label="Sayfalar"]')!.textContent!, /Gizlilik/);
    assert.equal(reads, 2, "grouping and filtering must not add row-by-row browser requests");
    assert.equal(writes, 0);
  });
});
