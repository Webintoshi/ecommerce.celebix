import { PanelShell } from "@/components/panel/PanelShell";
import { ToshiWorkspace } from "@/components/toshi/ToshiWorkspace";

const MODEL = Object.freeze({
  storeSlug: "toshi-browser-test-store",
  membershipLabel: "Tarayıcı testi mağaza sahibi",
  planCode: "browser-test",
  planVersion: 1,
  entitlementStatus: "active" as const,
  storefrontHostname: "toshi-browser-test-store.example.test",
  locale: "tr-TR",
});

export default function ToshiBrowserFixturePage() {
  return <PanelShell model={MODEL}><ToshiWorkspace /></PanelShell>;
}
