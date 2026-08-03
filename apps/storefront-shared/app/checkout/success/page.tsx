import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { CheckoutSummary } from "@/components/CheckoutSummary";
import { StorefrontFrame } from "@/components/StorefrontFrame";
import { resolveStorefrontPage } from "@/lib/page-context.ts";
import { requireStorefrontPage } from "@/lib/page-resolution.ts";

export const metadata: Metadata = {
  title: "Sipariş alındı",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CheckoutSuccessPage() {
  const { runtime, storefront, design } = requireStorefrontPage(
    await resolveStorefrontPage(),
  );
  const cookieStore = await cookies();
  const receipt = await runtime.cart
    .getReceipt(storefront.hostname, cookieStore.toString() || null)
    .catch(() => null);
  return (
    <StorefrontFrame storefront={storefront} design={design}>
      <section className="listing-hero">
        <div className="store-container">
          <span>SİPARİŞ DURUMU</span>
          <h1>{receipt ? "Sipariş alındı" : "Sipariş özeti bulunamadı"}</h1>
          <p>
            {receipt
              ? `Sipariş numaranız: ${receipt.orderReference}`
              : "Bu tarayıcıda görüntülenebilen güncel bir sipariş özeti yok."}
          </p>
        </div>
      </section>
      <section className="store-section store-container">
        {receipt ? (
          <div className="receipt-layout">
            <article className="receipt-card">
              <span>ÖDEME DURUMU</span>
              <h2>Ödeme bekleniyor</h2>
              <p>{receipt.paymentMethod.instructions}</p>
              {receipt.paymentMethod.kind === "bank_transfer" ? (
                <dl className="bank-details">
                  <div>
                    <dt>Banka</dt>
                    <dd>{receipt.paymentMethod.bankName}</dd>
                  </div>
                  <div>
                    <dt>Hesap sahibi</dt>
                    <dd>{receipt.paymentMethod.accountHolder}</dd>
                  </div>
                  <div>
                    <dt>IBAN</dt>
                    <dd>{receipt.paymentMethod.iban}</dd>
                  </div>
                  <div>
                    <dt>Açıklama</dt>
                    <dd>{receipt.orderReference}</dd>
                  </div>
                </dl>
              ) : null}
              <section
                className="delivery-summary"
                aria-labelledby="delivery-summary-title"
              >
                <span>TESLİMAT</span>
                <h3 id="delivery-summary-title">
                  {receipt.delivery.recipientName}
                </h3>
                <address>
                  {receipt.delivery.addressLine1}
                  {receipt.delivery.addressLine2 ? (
                    <>
                      <br />
                      {receipt.delivery.addressLine2}
                    </>
                  ) : null}
                  <br />
                  {[
                    receipt.delivery.district,
                    receipt.delivery.city,
                    receipt.delivery.postalCode,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                  <br />
                  Türkiye
                </address>
              </section>
              <Link className="store-button" href="/account">
                Siparişlerimi gör
              </Link>
            </article>
            <CheckoutSummary summary={receipt} />
          </div>
        ) : (
          <div className="store-empty">
            <span>◇</span>
            <h2>Makbuz kullanılamıyor</h2>
            <p>Yeni siparişinizi sepetten güvenle oluşturabilirsiniz.</p>
            <Link className="store-button" href="/products">
              Ürünleri keşfet
            </Link>
          </div>
        )}
      </section>
    </StorefrontFrame>
  );
}
