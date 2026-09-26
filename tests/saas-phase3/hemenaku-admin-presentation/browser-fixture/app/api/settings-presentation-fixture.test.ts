import assert from "node:assert/strict";
import test from "node:test";
import { createMerchantAdminApi } from "../../../../../../apps/customer-panel/lib/merchant-admin-ui/client.ts";
import { createStoreDomainApiClient } from "../../../../../../apps/customer-panel/lib/store-domain-ui/client.ts";
import { createAdminDomainApiClient } from "../../../../../../apps/customer-panel/lib/admin-domain-ui/client.ts";
import { createPaymentMethodApi } from "../../../../../../apps/customer-panel/lib/payment-method-ui/client.ts";
import { createShippingSettingsApi } from "../../../../../../apps/customer-panel/lib/shipping-ui/client.ts";
import { getSettingsMerchantFixture, getSettingsPresentationFixture, postSettingsMerchantFixture, postSettingsPresentationFixture } from "./settings-presentation-fixture.ts";

const fetcher: typeof fetch = async (input, init = {}) => {
  const request = input instanceof Request ? input : new Request(new URL(String(input), "http://fixture.test"), init);
  const path = new URL(request.url).pathname.slice("/api/".length);
  const merchant = path.startsWith("merchant-admin/");
  const route = merchant ? path.slice("merchant-admin/".length) : path;
  return (request.method === "POST"
    ? merchant ? await postSettingsMerchantFixture(route, request) : await postSettingsPresentationFixture(route, request)
    : merchant ? getSettingsMerchantFixture(route) : getSettingsPresentationFixture(route)) ?? Response.json({ code: "unavailable" }, { status: 503 });
};

test("settings browser fixture responses pass unchanged production clients", async () => {
  const merchant = createMerchantAdminApi(fetcher);
  for (const kind of ["general_setting", "language_setting", "notification_setting", "administrator_invite"] as const) {
    const records = await merchant.records(kind);
    assert.equal(records.length, 1);
    assert.equal((await merchant.record(kind, records[0]!.id)).id, records[0]!.id);
    assert.deepEqual(await merchant.events(kind), []);
  }
  assert.equal((await createStoreDomainApiClient(fetcher).list())[0]?.hostname, "store.browser.test");
  assert.deepEqual(await createStoreDomainApiClient(fetcher).listReplacements(), []);
  assert.equal((await createAdminDomainApiClient(fetcher).list())[0]?.hostname, "admin.store.browser.test");
  assert.equal((await createPaymentMethodApi(fetcher).catalog())[0]?.providerCode, "paytr_iframe");
  assert.equal((await createPaymentMethodApi(fetcher).list())[0]?.kind, "cash_on_delivery");
  assert.equal((await createShippingSettingsApi(fetcher).current()).resources.length, 2);
});

test("settings fixture supports explicit failed save then local retry and version advancement", async () => {
  const api = createMerchantAdminApi(fetcher);
  const initial = (await api.records("general_setting"))[0]!;
  const command = { recordId: initial.id, expectedVersion: initial.version, name: initial.name, status: "active" as const, config: { ...initial.config, storeDisplayName: "[kaydetme hatası]" } };
  await assert.rejects(() => api.save("general_setting", command), /Bu bölüm şu anda kullanılamıyor/);
  assert.equal((await api.records("general_setting"))[0]?.version, initial.version);
  const saved = await api.save("general_setting", { ...command, config: { ...initial.config, storeDisplayName: "Başarılı yerel test" } });
  assert.equal(saved.version, initial.version + 1);
  assert.equal((await api.records("general_setting"))[0]?.config.storeDisplayName, "Başarılı yerel test");
  assert.equal((await fetcher("/api/analytics/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: 1, candidateInactivityMinutes: 360 }) })).status, 503);
});
