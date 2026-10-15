import { requireServerPanelAccess } from "@/lib/server-access";
import { redirect } from "next/navigation";

export default async function LegacyManualSalesPage() {
  await requireServerPanelAccess();
  redirect("/orders/quick-links");
}
