import { requireServerPanelAccess } from "@/lib/server-access";
import { redirect } from "next/navigation";

export default async function LegacyNewInventoryPage() {
  await requireServerPanelAccess();
  redirect("/products/stock?tab=transfers&kind=transfer&new=1");
}
