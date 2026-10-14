import assert from "node:assert/strict";
import test from "node:test";
import { act } from "react";
import { compile, input, mounted } from "../../lib/mira-final-test-support.ts";

const record = {
  id: "71000000-0000-4000-8000-000000000001", kind: "marketplace_connection", name: "Mağazam",
  config: { provider: "Pazaryerim", merchantReference: "MAGAZA-42", syncEnabled: true },
  status: "draft", version: 7, createdAt: "2026-10-14T00:00:00Z", updatedAt: "2026-10-14T00:00:00Z",
};

test("editing a closed marketplace retains its status and inputs after failure, then saves once without activating an external job", async () => {
  const saves: unknown[] = [];
  const destinations: string[] = [];
  let refreshed = 0;
  const Component = compile("components/merchant-admin/MerchantRecordEditor.tsx", {
    "next/navigation": { useRouter: () => ({ push: (path: string) => destinations.push(path), refresh: () => { refreshed++; } }) },
    "@/components/settings/SettingsRecordForm": { SettingsRecordForm: () => null },
    "@/components/marketplaces/MarketplaceArtwork": { MarketplaceArtwork: () => null },
    "@/lib/merchant-admin-ui/client": {
      MerchantAdminApiError: class MerchantAdminApiError extends Error {},
      merchantAdminApi: {
        record: async () => record,
        save: async (_kind: string, value: unknown) => { saves.push(value); if (saves.length === 1) throw new Error("unavailable"); },
      },
    },
  }).MerchantRecordEditor;
  await mounted(Component, { kind: "marketplace_connection", recordId: record.id, returnTo: "/marketplaces", canManage: true }, async (host, window) => {
    const status = host.querySelector('select[name="status"]');
    assert.equal(status?.value, "draft");
    const name = host.querySelector('input[name="name"]');
    assert.ok(name);
    await input(window, name, "Yenilenen mağazam");
    const submit = async () => { await act(async () => host.querySelector("form").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }))); };
    await submit();
    assert.equal(saves.length, 1);
    assert.equal(name.value, "Yenilenen mağazam");
    assert.equal(status.value, "draft");
    assert.equal(host.querySelector('input[name="merchantReference"]')?.value, "MAGAZA-42");
    assert.match(host.querySelector('[role="alert"]')?.textContent ?? "", /Bilgileriniz korundu/);
    assert.deepEqual(destinations, []);
    await submit();
    assert.equal(saves.length, 2);
    assert.deepEqual(saves[1], {
      recordId: record.id, expectedVersion: 7, name: "Yenilenen mağazam",
      config: record.config, status: "draft",
    });
    assert.deepEqual(destinations, ["/marketplaces"]);
    assert.equal(refreshed, 1);
  });
});
