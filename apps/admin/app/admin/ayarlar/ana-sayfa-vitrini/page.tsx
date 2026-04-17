import { redirect } from "next/navigation";

export default function HomepageCurationRedirectPage() {
  redirect("/admin/urunler/koleksiyonlar");
}
