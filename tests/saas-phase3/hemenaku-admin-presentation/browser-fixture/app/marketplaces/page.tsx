import { MerchantModuleConsole } from "@/components/merchant-admin/MerchantModuleConsole";
import { PanelShell } from "@/components/panel/PanelShell";

const model = Object.freeze({
  storeSlug: "browser-kabul-magazasi",
  membershipLabel: "Mağaza sahibi",
  planCode: "growth",
  planVersion: 3,
  entitlementStatus: "active" as const,
  storefrontHostname: "store.browser.test",
  locale: "tr-TR",
});

export default function MerchantAdminBrowserFixture() {
  return <PanelShell model={model}><MerchantModuleConsole kind="marketplace_connection" canManage /></PanelShell>;
}
