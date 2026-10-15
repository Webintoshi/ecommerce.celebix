import { QuickOrderLinksConsole } from "@/components/orders/QuickOrderLinksConsole";
import { requireServerPanelAccess } from "@/lib/server-access";

export const dynamic = "force-dynamic";

export default async function PaymentLinksPage() {
  const access = await requireServerPanelAccess();
  return <><QuickOrderLinksConsole /></>;
}
