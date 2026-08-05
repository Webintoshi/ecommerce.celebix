import { PanelShell } from "@/components/PanelShell";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function AuthenticatedPanelLayout({ children }: { children: React.ReactNode }) {
  const { session } = await requireServerPanelAccess();
  return <PanelShell session={session}>{children}</PanelShell>;
}
