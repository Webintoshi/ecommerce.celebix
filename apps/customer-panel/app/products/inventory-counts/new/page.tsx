import { redirect } from "next/navigation";

export default function LegacyNewInventoryPage() {
  redirect("/products/stock?tab=counts&kind=count&new=1");
}
