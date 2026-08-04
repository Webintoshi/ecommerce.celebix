import Link from "next/link";
import type { StorefrontAccountSnapshot } from "@celebix/saas-contracts";

import { AccountLogoutButton } from "./AccountLogoutButton";

const LINKS = Object.freeze([
  { href: "/account/orders", label: "Siparişler", detail: "Sipariş geçmişi ve durumları" },
  { href: "/account/addresses", label: "Adresler", detail: "Teslimat adresleri" },
  { href: "/favorites", label: "Favoriler", detail: "Kaydettiğiniz ürünler" },
  { href: "/account/profile", label: "Profil", detail: "İletişim bilgileri" },
  { href: "/account/security", label: "Güvenlik", detail: "Cihazlar ve oturumlar" },
]);

export function AccountDashboard({ snapshot }: Readonly<{ snapshot: StorefrontAccountSnapshot }>) {
  return <div className="account-dashboard">
    <header><div><span>HESABIM</span><h1>Merhaba, {snapshot.profile.firstName}</h1></div><AccountLogoutButton /></header>
    <nav className="account-dashboard-links" aria-label="Hesap menüsü">{LINKS.map((item) => <Link href={item.href} key={item.href}><span><strong>{item.label}</strong><small>{item.detail}</small></span><b aria-hidden="true">→</b></Link>)}</nav>
  </div>;
}
