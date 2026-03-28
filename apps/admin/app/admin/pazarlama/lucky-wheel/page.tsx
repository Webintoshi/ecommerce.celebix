import { permanentRedirect } from "next/navigation";

export default function DeprecatedLuckyWheelAdminRoute() {
  permanentRedirect("/admin/indirimler/sans-carki");
}
