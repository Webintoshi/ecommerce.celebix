import { redirect } from "next/navigation";

export default function LegacyManualSalesPage() {
  redirect("/orders/quick-links");
}
