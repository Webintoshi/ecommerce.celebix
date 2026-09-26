import { PanelShell } from "@/components/panel/PanelShell";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function Layout({ children }: { children: React.ReactNode }) {
  const { tenantContext } = await requireServerPanelAccess();
  return <PanelShell tenantContext={tenantContext}><SettingsWorkspace>{children}</SettingsWorkspace></PanelShell>;
}
