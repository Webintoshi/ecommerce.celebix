import { QuickOrderLinksConsole } from "@/components/orders/QuickOrderLinksConsole";
import { PanelShell } from "@/components/panel/PanelShell";
import { createPanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function QuickOrderLinksPage() {
  const access = await requireServerPanelAccess();
  return <PanelShell model={createPanelChromeModel(access.tenantContext)}><QuickOrderLinksConsole /></PanelShell>;
}
