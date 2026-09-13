import { CustomerListConsole } from "@/components/customers/CustomerListConsole";
import { CustomerFormConsole } from "@/components/customers/CustomerFormConsole";
import { CustomerEditConsole } from "@/components/customers/CustomerEditConsole";
import { CustomerDetailConsole } from "@/components/customers/CustomerDetailConsole";
import { CustomerTaxonomyConsole } from "@/components/customers/CustomerTaxonomyConsole";
import { PanelLayoutClient } from "@/components/panel/PanelLayoutClient";
import { CustomerWorkspace } from "@/components/customers/CustomerWorkspace";

// Isolated acceptance app only. No production authentication or tenant path.
const model = { analyticsAvailable:false, storeSlug:"mira-qa-fixture", membershipLabel:"QA fixture — canlı değil", planCode:"growth", planVersion:3, entitlementStatus:"active" as const, storefrontHostname:"fixture.invalid", locale:"tr-TR" };
export default async function CustomerFixture({params}:{params:Promise<{view:string;customerId?:string}>}) {
  const {view,customerId}=await params;
  const id = customerId ?? "81000000-0000-4000-8000-000000000001";
  const page = view==="new" ? <CustomerFormConsole /> : view==="edit" ? <CustomerEditConsole customerId={id} /> : view==="detail" ? <CustomerDetailConsole customerId={id} canManage canArchive /> : <CustomerWorkspace canManage>{view==="tags" || view==="segments" ? <CustomerTaxonomyConsole kind={view} canManage embedded /> : <CustomerListConsole canManage embedded />}</CustomerWorkspace>;
  return <PanelLayoutClient model={model}><div data-evidence="isolated-fixture">{page}</div></PanelLayoutClient>;
}
