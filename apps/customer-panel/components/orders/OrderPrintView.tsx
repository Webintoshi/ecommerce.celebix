"use client";

import { useEffect, useRef, useState } from "react";
import type { OrderDetail } from "@celebix/saas-contracts";

import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import styles from "./order-console.module.css";

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function message(error: unknown) {
  return error instanceof OrderApiError ? error.message : "Sipariş yazdırma görünümü hazırlanamadı.";
}

function OrderSnapshotTable({ order }: Readonly<{ order: OrderDetail }>) {
  return (
    <>
      <section className={styles.printSummary} aria-label="Sipariş teslimat özeti">
        <div><span>Müşteri</span><strong>{order.customerName}</strong></div>
        <div><span>Sipariş tarihi</span><strong>{date(order.createdAt)}</strong></div>
        <div><span>Teslimat adresi</span><strong>{order.shippingAddress.recipientName}<br />{order.shippingAddress.line1}<br />{[order.shippingAddress.district, order.shippingAddress.city, order.shippingAddress.postalCode].filter(Boolean).join(" / ")} · {order.shippingAddress.country}</strong></div>
      </section>
      <table className={styles.printTable}>
        <thead><tr><th scope="col">Ürün</th><th scope="col">Adet</th><th scope="col">Birim fiyat</th><th scope="col">Tutar</th></tr></thead>
        <tbody>{order.items.map((item) => <tr key={item.id}><td><strong>{item.productName}</strong>{item.variantName ? <small>{item.variantName}</small> : null}</td><td>{item.quantity}</td><td>{money(item.unitPriceCents, order.currency)}</td><td>{money(item.lineTotalCents, order.currency)}</td></tr>)}</tbody>
      </table>
      <dl className={styles.printTotals}>
        <div><dt>Ara toplam</dt><dd>{money(order.subtotalCents, order.currency)}</dd></div>
        <div><dt>Kargo</dt><dd>{money(order.shippingCents, order.currency)}</dd></div>
        <div><dt>İndirim</dt><dd>− {money(order.discountCents, order.currency)}</dd></div>
        <div><dt>Toplam</dt><dd>{money(order.totalCents, order.currency)}</dd></div>
      </dl>
    </>
  );
}

export function OrderPrintView({ orderId }: Readonly<{ orderId: string }>) {
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState("");
  const requestSequence = useRef(0);

  useEffect(() => {
    const sequence = requestSequence.current + 1;
    requestSequence.current = sequence;
    setOrder(null);
    setError("");
    void orderApi.getOrder(orderId).then(
      (result) => { if (requestSequence.current === sequence && result.id === orderId) setOrder(result); },
      (caught: unknown) => { if (requestSequence.current === sequence) setError(message(caught)); },
    );
    return () => { if (requestSequence.current === sequence) requestSequence.current += 1; };
  }, [orderId, requestSequence]);

  if (error) return <main className={styles.printPage}><p role="alert">{error}</p></main>;
  if (!order || order.id !== orderId) return <main className={styles.printPage}><p role="status">Sipariş hazırlanıyor…</p></main>;
  return (
    <main className={styles.printPage}>
      <div className={styles.printActions}><button type="button" onClick={() => window.print()}>Yazdır</button></div>
      <header className={styles.printHeading}><div><p>Sipariş belgesi</p><h1>Sipariş #{order.orderNumber}</h1></div><strong>{money(order.totalCents, order.currency)}</strong></header>
      <OrderSnapshotTable order={order} />
    </main>
  );
}
