import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { AccountNav } from "@/components/account/AccountNav";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveAccountPage } from "@/lib/account/page.ts";
import { formatTry } from "@/lib/format.ts";

export const metadata: Metadata = { title: "Sipariş detayı", robots: { index: false, follow: false } }; export const dynamic = "force-dynamic";
export default async function OrderPage({ params }: Readonly<{ params: Promise<{ orderReference: string }> }>) { const { orderReference } = await params; const { storefront, design, identity } = await resolveAccountPage(`/account/orders/${orderReference}`); const order = await identity.order({ hostname: storefront.hostname, cookieHeader: (await cookies()).toString() || null, orderReference }).catch(() => null); if (!order) notFound(); return <StorefrontFrame storefront={storefront} design={design}><section className="account-page store-container"><AccountNav /><header className="account-order-heading"><div><small>SİPARİŞ</small><h1>{order.orderReference}</h1></div><span>{order.status}</span></header><div className="account-order-detail"><div>{order.items.map((item) => <article key={`${item.name}-${item.quantity}`}><span><strong>{item.name}</strong><small>{item.quantity} adet</small></span><b>{formatTry(item.lineTotalCents)}</b></article>)}</div><dl><div><dt>Ara toplam</dt><dd>{formatTry(order.subtotalCents)}</dd></div><div><dt>Kargo</dt><dd>{order.shippingCents ? formatTry(order.shippingCents) : "Ücretsiz"}</dd></div><div><dt>Toplam</dt><dd>{formatTry(order.totalCents)}</dd></div></dl></div></section></StorefrontFrame>; }
