import { redirect } from "next/navigation";

export default function LegacyNewInventoryPage() {
  redirect("/products/stock?tab=purchases&kind=purchase&new=1");
}
