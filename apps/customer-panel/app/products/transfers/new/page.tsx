import { redirect } from "next/navigation";

export default function LegacyNewInventoryPage() {
  redirect("/products/stock?tab=transfers&kind=transfer&new=1");
}
