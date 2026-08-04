import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { AccountNav } from "@/components/account/AccountNav";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveAccountPage } from "@/lib/account/page.ts";
import { formatTry } from "@/lib/format.ts";

export const metadata: Metadata = { title: "Siparişler", robots: { index: false, follow: false } }; export const dynamic = "force-dynamic";
export default async function OrdersPage() { const { storefront, design, identity } = await resolveAccountPage("/account/orders"); const orders = await identity.orders({ hostname: storefront.hostname, cookieHeader: (await cookies()).toString() || null, limit: 50 }); return <StorefrontFrame storefront={storefront} design={design}><section className="account-page store-container"><AccountNav /><header className="account-page-title"><h1>Siparişler</h1></header><div className="account-order-list">{orders.map((order) => <Link key={order.orderReference} href={`/account/orders/${order.orderReference}`}><span><strong>{order.orderReference}</strong><small>{new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" }).format(new Date(order.createdAt))}</small></span><span><small>{order.status}</small><strong>{formatTry(order.totalCents)}</strong></span><b aria-hidden="true">→</b></Link>)}{orders.length === 0 ? <p className="account-inline-empty">Henüz siparişiniz yok.</p> : null}</div></section></StorefrontFrame>; }
