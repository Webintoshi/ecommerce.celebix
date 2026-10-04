import { redirect } from "next/navigation";

export default function LegacyInventoryPage() {
  redirect("/products/stock?tab=purchases");
}
