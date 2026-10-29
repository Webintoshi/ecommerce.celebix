import { PanelShell } from "@/components/panel/PanelShell";
import { MarketplacePolishFixture } from "../screen";
const model={storeSlug:"visual-fixture",membershipLabel:"Mağaza sahibi",planCode:"growth",planVersion:3,entitlementStatus:"active" as const,storefrontHostname:"store.browser.test",locale:"tr-TR"};
export default async function Page({params}: {params: Promise<{view:string}>}) { const {view}=await params; return <PanelShell model={model}><MarketplacePolishFixture view={view}/></PanelShell>; }
