import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { CheckoutSummary } from "@/components/CheckoutSummary";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = {
  title: "Siparişlerim",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountPage() {
  const { runtime, storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  const cookieStore = await cookies();
  const orders = await runtime.cart
    .listAccountOrders(storefront.hostname, cookieStore.toString() || null, 20)
    .catch(() => Object.freeze([]));
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <section className="listing-hero">
        <div className="store-container">
          <span>BU TARAYICIDAKİ KAYITLAR</span>
          <h1>Siparişlerim</h1>
          <p>Bu mağazada oluşturduğunuz son siparişler.</p>
        </div>
      </section>
      <section className="store-section store-container account-orders">
        {orders.length ? (
          orders.map((order) => (
            <article className="account-order" key={order.orderReference}>
              <header>
                <div>
                  <span>SİPARİŞ</span>
                  <h2>{order.orderReference}</h2>
                </div>
                <time dateTime={order.createdAt}>
                  {new Intl.DateTimeFormat("tr-TR", {
                    dateStyle: "long",
                    timeZone: "Europe/Istanbul",
                  }).format(new Date(order.createdAt))}
                </time>
              </header>
              <CheckoutSummary summary={order} />
            </article>
          ))
        ) : (
          <div className="store-empty">
            <span>◇</span>
            <h2>Görüntülenecek sipariş yok</h2>
            <p>Bu tarayıcıya bağlı güncel bir müşteri kaydı bulunamadı.</p>
            <Link className="store-button" href="/products">
              Alışverişe başla
            </Link>
          </div>
        )}
      </section>
    </StorefrontFrame>
  );
}
