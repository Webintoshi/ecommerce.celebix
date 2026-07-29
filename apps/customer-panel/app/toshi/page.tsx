import { ToshiWorkspace } from "@/components/toshi/ToshiWorkspace";
import { requireServerPanelAccess } from "@/lib/server-access";

export default async function ToshiPage() {
  await requireServerPanelAccess();
  return <ToshiWorkspace />;
}
