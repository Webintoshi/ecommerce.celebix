import type { CheckoutStatus } from "@celebix/saas-contracts";
import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { StorefrontAnalyticsEvent } from "@/components/StorefrontAnalyticsEvent.tsx";
import {
  createCheckoutCommerceEvent,
  type PublicCommerceEvent,
} from "@/lib/analytics/events.ts";
import { resolveCheckoutResult } from "@/lib/checkout/result-state.ts";
import { resolveDefaultPublicStorefrontRuntime } from "@/lib/default-runtime.ts";
import {
  resolveStorefrontTracker,
  type StorefrontTrackerContext,
} from "@/lib/page-context.ts";
import { selectTrustedStorefrontHostAuthority } from "@/lib/trusted-host-authority.ts";

import styles from "../checkout.module.css";
import { CheckoutResultRefresh } from "./CheckoutResultRefresh.tsx";

export const metadata: Metadata = Object.freeze({
  title: "Ödeme sonucu",
  robots: Object.freeze({ index: false, follow: false }),
  referrer: "no-referrer",
});
export const dynamic = "force-dynamic";
export const revalidate = 0;

function ResultOrderNumber({ value }: Readonly<{ value: string }>) {
  return <p className="checkout-result-order">
    Sipariş numarası <strong>{value}</strong>
  </p>;
}

function ResultStatus({ status }: Readonly<{ status: CheckoutStatus }>) {
  if (status.kind === "processing") {
    return <>
      <div aria-hidden="true" className="checkout-result-mark checkout-result-mark-pending" />
      <h1>Ödemeniz doğrulanıyor</h1>
      <p>Bu sayfa ödemenizi onaylamaz. Kesin durum güvenli sağlayıcı bildirimiyle güncellenir.</p>
      <ResultOrderNumber value={status.orderNumber} />
      <CheckoutResultRefresh />
    </>;
  }
  if (status.kind === "paid") {
    return <>
      <div aria-hidden="true" className="checkout-result-mark checkout-result-mark-success">✓</div>
      <h1>Ödemeniz onaylandı</h1>
      <p>Siparişiniz güvenle alındı. Hazırlık süreci başladığında mağaza sizi bilgilendirecektir.</p>
      <ResultOrderNumber value={status.orderNumber} />
      <a className="checkout-result-action" href="/">Mağazaya dön</a>
    </>;
  }
  if (status.kind === "placed") {
    const bankTransfer = status.method.kind === "bank_transfer";
    return <>
      <div aria-hidden="true" className="checkout-result-mark checkout-result-mark-success">✓</div>
      <h1>Siparişiniz alındı</h1>
      <p>{bankTransfer
        ? "Siparişiniz ayrıldı. Ödeme, havale mağaza tarafından doğrulanana kadar beklemededir."
        : "Siparişiniz alındı. Ödemenizi teslimat sırasında yapabilirsiniz."}</p>
      <ResultOrderNumber value={status.orderNumber} />
      <section aria-labelledby="checkout-pending-instructions" className="checkout-result-instructions">
        <h2 id="checkout-pending-instructions">{status.method.label}</h2>
        {bankTransfer
          ? <dl>
              <div><dt>Banka</dt><dd>{status.method.bankName}</dd></div>
              <div><dt>Hesap sahibi</dt><dd>{status.method.accountHolder}</dd></div>
              <div><dt>IBAN</dt><dd><code>{status.method.iban}</code></dd></div>
            </dl>
          : null}
        <p>{status.method.instructions}</p>
      </section>
      <a className="checkout-result-action" href="/">Mağazaya dön</a>
    </>;
  }
  if (status.kind === "failed") {
    return <>
      <div aria-hidden="true" className="checkout-result-mark checkout-result-mark-failed">!</div>
      <h1>Ödeme tamamlanamadı</h1>
      <p>Siparişiniz için başarılı ödeme kaydı oluşmadı. Bilgilerinizi kontrol ederek yeniden deneyebilirsiniz.</p>
      <ResultOrderNumber value={status.orderNumber} />
      <a className="checkout-result-action checkout-result-action-primary" href="/odeme">Ödemeyi yeniden dene</a>
    </>;
  }
  return <>
    <div aria-hidden="true" className="checkout-result-mark">?</div>
    <h1>Ödeme sonucu henüz bulunamadı</h1>
    <p>Sepetiniz ödeme için hazır olabilir. İşleme ödeme sayfasından güvenle devam edin.</p>
    <a className="checkout-result-action checkout-result-action-primary" href="/odeme">Ödemeye dön</a>
  </>;
}

function analyticsEvent(status: CheckoutStatus): PublicCommerceEvent | null {
  if (status.kind === "paid") {
    return createCheckoutCommerceEvent({
      name: "checkout_completed",
      data: { resultCode: "paid" },
    });
  }
  if (status.kind === "placed") {
    return createCheckoutCommerceEvent({
      name: "checkout_completed",
      data: { methodKind: status.method.kind, resultCode: "placed" },
    });
  }
  if (status.kind === "failed") {
    return createCheckoutCommerceEvent({
      name: "checkout_failed",
      data: { resultCode: "failed" },
    });
  }
  return null;
}

function ResultUnavailable({
  kind,
}: Readonly<{ kind: "not_found" | "unavailable" }>) {
  return <main className={styles.resultPage}>
    <section className="checkout-result-card">
      <div aria-hidden="true" className="checkout-result-mark">?</div>
      <h1>{kind === "not_found"
        ? "Ödeme sonucu bulunamadı"
        : "Ödeme sonucu şu anda kullanılamıyor"}</h1>
      <p>{kind === "not_found"
        ? "Bu tarayıcıda doğrulanabilecek bir sepet veya sipariş bulunamadı."
        : "Güvenli durum bilgisine şu anda ulaşılamıyor. Lütfen daha sonra yeniden deneyin."}</p>
      <a className="checkout-result-action" href="/">Mağazaya dön</a>
    </section>
  </main>;
}

export default async function CheckoutResultPage() {
  const now = new Date();
  const [requestHeaders, cookieStore, runtime] = await Promise.all([
    headers(),
    cookies(),
    resolveDefaultPublicStorefrontRuntime(),
  ]);
  const authority = selectTrustedStorefrontHostAuthority(requestHeaders);
  if (authority.kind !== "trusted" || runtime === null) {
    return <ResultUnavailable kind="unavailable" />;
  }
  const [selected, tracker] = await Promise.all([
    resolveCheckoutResult({
      hostname: authority.hostname,
      cookieHeader: cookieStore.toString() || null,
      now,
      repository: runtime.publicCheckout,
    }),
    resolveStorefrontTracker(runtime, authority.hostname, now).catch(
      (): StorefrontTrackerContext | null => null,
    ),
  ]);
  if (selected.kind !== "resolved") {
    return <ResultUnavailable kind={selected.kind} />;
  }
  const event = analyticsEvent(selected.status);
  return <main className={styles.resultPage}>
    <section className="checkout-result-card">
      <ResultStatus status={selected.status} />
    </section>
    {event === null
      ? null
      : <StorefrontAnalyticsEvent
          event={event}
          key={selected.status.kind}
          tracker={tracker}
          trigger="mount"
        />}
  </main>;
}
