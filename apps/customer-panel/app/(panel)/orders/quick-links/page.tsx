import { InStoreSalesConsole } from "@/components/orders/InStoreSalesConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function InStoreSalesPage() {
  const access = await requireServerPanelAccess();
  return <><InStoreSalesConsole /></>;
}
