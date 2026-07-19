import { PanelShell } from "@/components/panel/PanelShell";
import { createPanelChromeModel } from "@/lib/panel-ui/chrome-model";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function AuthenticatedPanelLayout({ children }: { children: React.ReactNode }) {
  const { tenantContext } = await requireServerPanelAccess();
  const model = createPanelChromeModel(tenantContext);
  return <PanelShell model={model}>{children}</PanelShell>;
}
