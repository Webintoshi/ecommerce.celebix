import { requireServerPanelAccess } from "@/lib/server-access";
import { loadSetupStatus } from "@/lib/server-setup/default";
import { SetupChecklist } from "@/components/setup/SetupChecklist";
export default async function SetupPage() {
 const {tenantContext}=await requireServerPanelAccess();
 const status=await loadSetupStatus(tenantContext);
 return <section className="page-stack"><h1 className="sr-only">Kurulum durumu</h1><SetupChecklist status={status}/></section>;
}
