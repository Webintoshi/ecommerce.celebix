import { PanelShell } from "@/components/panel/PanelShell";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function ProductsLayout({ children }: { children: React.ReactNode }) {
  const { tenantContext } = await requireServerPanelAccess();
  return <PanelShell tenantContext={tenantContext}>{children}</PanelShell>;
}
