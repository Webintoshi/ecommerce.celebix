import { redirect } from "next/navigation";

export default function HeroBannerRedirectPage() {
  redirect("/admin/ayarlar/tasarim#hero-banner");
}
