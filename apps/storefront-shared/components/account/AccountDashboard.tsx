import Link from "next/link";
import type { StorefrontAccountOrder, StorefrontAccountSnapshot } from "@celebix/saas-contracts";

import { formatTry } from "@/lib/format.ts";

import { AccountLogoutButton } from "./AccountLogoutButton";

const LINKS = Object.freeze([
  { href: "/account/orders", label: "Siparişler", detail: "Sipariş geçmişi ve durumları" },
  { href: "/account/addresses", label: "Adresler", detail: "Teslimat adresleri" },
  { href: "/favorites", label: "Favoriler", detail: "Kaydettiğiniz ürünler" },
  { href: "/account/profile", label: "Profil", detail: "İletişim bilgileri" },
  { href: "/account/security", label: "Güvenlik", detail: "Cihazlar ve oturumlar" },
]);

export function AccountDashboard({ snapshot, recentOrders }: Readonly<{ snapshot: StorefrontAccountSnapshot; recentOrders: readonly StorefrontAccountOrder[] }>) {
  return <div className="account-dashboard">
    <header><div><span>HESABIM</span><h1>Merhaba, {snapshot.profile.firstName}</h1></div><AccountLogoutButton /></header>
    <nav className="account-dashboard-links" aria-label="Hesap menüsü">{LINKS.map((item) => <Link href={item.href} key={item.href}><span><strong>{item.label}</strong><small>{item.detail}</small></span><b aria-hidden="true">→</b></Link>)}</nav>
    {recentOrders.length > 0 ? <section className="account-recent-orders" aria-labelledby="recent-orders-title">
      <header><h2 id="recent-orders-title">Son siparişler</h2><Link href="/account/orders">Tümü</Link></header>
      {recentOrders.map((order) => <Link href={`/account/orders/${order.orderReference}`} key={order.orderReference}>
        <span><strong>{order.orderReference}</strong><small>{order.status}</small></span><b>{formatTry(order.totalCents)}</b>
      </Link>)}
    </section> : null}
  </div>;
}
