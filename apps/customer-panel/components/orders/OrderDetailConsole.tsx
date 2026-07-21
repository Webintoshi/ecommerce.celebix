"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  ORDER_PAYMENT_STATUSES,
  ORDER_STATUSES,
  type OrderAddress,
  type OrderDetail,
  type OrderPaymentStatus,
  type OrderStatus,
  type OrderTracking,
} from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import styles from "./order-console.module.css";

export interface OrderUiCapabilities {
  readonly fulfill: boolean;
  readonly payment: boolean;
  readonly shipping: boolean;
  readonly note: boolean;
}

type DetailState = "loading" | "loaded" | "error";
const STATUS_LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
  pending: "Oluşturuldu", confirmed: "Onaylandı", preparing: "Hazırlanıyor", shipped: "Kargolandı",
  delivered: "Teslim edildi", cancelled: "İptal", refunded: "İade",
});
const PAYMENT_LABELS: Readonly<Record<OrderPaymentStatus, string>> = Object.freeze({
  pending: "Ödeme bekleniyor", processing: "İşleniyor", completed: "Başarılı", failed: "Başarısız", refunded: "İade edildi",
});

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(cents / 100);
}

function date(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

function field(data: FormData, name: string): string {
  const value = data.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export interface OrderDetailPresentationProps {
  readonly state: DetailState;
  readonly detail?: OrderDetail;
  readonly error: string;
  readonly notice: string;
  readonly busy: string;
  readonly capabilities: OrderUiCapabilities;
  readonly onRetry: () => void;
  readonly onStatusChange: (status: OrderStatus) => void;
  readonly onPaymentChange: (status: OrderPaymentStatus) => void;
  readonly onShippingSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onNoteSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onNoteArchive: (noteId: string) => void;
}

export function OrderDetailPresentation(props: OrderDetailPresentationProps) {
  if (props.state === "loading") return <div className={styles.loading} role="status">Sipariş ayrıntıları yükleniyor…</div>;
  if (props.state === "error" || props.detail === undefined) return (
    <section className={styles.detailState}><div className={styles.errorState} role="alert"><div><h1>Sipariş açılamadı</h1><p>{props.error || "Sipariş bulunamadı."}</p></div><button type="button" onClick={props.onRetry}>Tekrar dene</button></div></section>
  );
  const order = props.detail;
  return (
    <PanelPageShell>
      <Link className={styles.backLink} href="/orders">Siparişlere dön</Link>
      <PanelPageHeader title={`#${order.orderNumber}`} description={`${date(order.createdAt)} · sürüm ${order.version}`} />
      {props.error ? <div className={styles.inlineError} role="alert">{props.error}</div> : null}
      {props.notice ? <div className={styles.notice} role="status">{props.notice}</div> : null}

      <section className={styles.detailHero} aria-label="Sipariş özeti">
        <div><span>Sipariş durumu</span><PanelStatusBadge>{STATUS_LABELS[order.status]}</PanelStatusBadge></div>
        <div><span>Ödeme durumu</span><strong>{PAYMENT_LABELS[order.paymentStatus]}</strong></div>
        <div><span>Müşteri</span><strong>{order.customerName}</strong><small>{order.customerEmail}</small></div>
        <div><span>Sipariş toplamı</span><strong>{money(order.totalCents, order.currency)}</strong></div>
      </section>

      {(props.capabilities.fulfill || props.capabilities.payment) ? (
        <section className={styles.operationBar} aria-label="Sipariş operasyonları">
          {props.capabilities.fulfill ? <label><span>Sipariş durumu</span><select aria-label="Sipariş durumunu güncelle" value={order.status} disabled={props.busy !== ""} onChange={(event) => props.onStatusChange(event.target.value as OrderStatus)}>{ORDER_STATUSES.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label> : null}
          {props.capabilities.payment ? <label><span>Ödeme durumu</span><select aria-label="Ödeme durumunu güncelle" value={order.paymentStatus} disabled={props.busy !== ""} onChange={(event) => props.onPaymentChange(event.target.value as OrderPaymentStatus)}>{ORDER_PAYMENT_STATUSES.map((status) => <option key={status} value={status}>{PAYMENT_LABELS[status]}</option>)}</select></label> : null}
        </section>
      ) : null}

      <section className={styles.itemsPanel} aria-labelledby="order-items-title">
        <div className={styles.sectionHeading}><div><h2 id="order-items-title">Sipariş ürünleri</h2><p>{order.itemCount} kalem</p></div></div>
        <div className={styles.itemList}>{order.items.map((item) => <article key={item.id}><div><strong>{item.productName}</strong><span>{item.variantName ?? "Standart"}{item.sku ? ` · ${item.sku}` : ""}</span></div><span>{item.quantity} × {money(item.unitPriceCents, order.currency)}</span><b>{money(item.lineTotalCents, order.currency)}</b></article>)}</div>
        <dl className={styles.totals}><div><dt>Ara toplam</dt><dd>{money(order.subtotalCents, order.currency)}</dd></div><div><dt>Kargo</dt><dd>{money(order.shippingCents, order.currency)}</dd></div><div><dt>İndirim</dt><dd>− {money(order.discountCents, order.currency)}</dd></div><div><dt>Toplam</dt><dd>{money(order.totalCents, order.currency)}</dd></div></dl>
      </section>

      <div className={styles.detailColumns}>
        <section className={styles.detailPanel} aria-labelledby="shipping-title">
          <div className={styles.sectionHeading}><div><h2 id="shipping-title">Kargo bilgileri</h2><p>Adres ve takip kaydı</p></div></div>
          <address>{order.shippingAddress.recipientName}<br />{order.shippingAddress.line1}{order.shippingAddress.line2 ? <><br />{order.shippingAddress.line2}</> : null}<br />{[order.shippingAddress.district, order.shippingAddress.city, order.shippingAddress.postalCode].filter(Boolean).join(" / ")} · {order.shippingAddress.country}</address>
          {order.tracking ? <p className={styles.tracking}><strong>{order.tracking.carrier}</strong><span>{order.tracking.trackingNumber}</span></p> : <p className={styles.muted}>Takip kaydı eklenmemiş.</p>}
          {props.capabilities.shipping ? <form className={styles.compactForm} onSubmit={props.onShippingSubmit}>
            <label><span>Alıcı</span><input name="recipientName" required maxLength={200} defaultValue={order.shippingAddress.recipientName} /></label>
            <label className={styles.wide}><span>Adres</span><input name="line1" required maxLength={300} defaultValue={order.shippingAddress.line1} /></label>
            <label><span>İlçe</span><input name="district" maxLength={200} defaultValue={order.shippingAddress.district ?? ""} /></label>
            <label><span>Şehir</span><input name="city" required maxLength={200} defaultValue={order.shippingAddress.city} /></label>
            <label><span>Posta kodu</span><input name="postalCode" maxLength={32} defaultValue={order.shippingAddress.postalCode ?? ""} /></label>
            <label><span>Ülke</span><input name="country" required minLength={2} maxLength={2} defaultValue={order.shippingAddress.country} /></label>
            <label><span>Kargo firması</span><input name="carrier" maxLength={100} defaultValue={order.tracking?.carrier ?? ""} /></label>
            <label><span>Takip numarası</span><input name="trackingNumber" maxLength={200} defaultValue={order.tracking?.trackingNumber ?? ""} /></label>
            <button className={styles.primaryButton} type="submit" disabled={props.busy !== ""}>{props.busy === "shipping" ? "Kaydediliyor…" : "Kargo bilgilerini kaydet"}</button>
          </form> : null}
        </section>

        <section className={styles.detailPanel} aria-labelledby="notes-title">
          <div className={styles.sectionHeading}><div><h2 id="notes-title">Dahili notlar</h2><p>Yalnızca mağaza ekibi görür</p></div></div>
          {props.capabilities.note ? <form className={styles.noteForm} onSubmit={props.onNoteSubmit}><label><span className="sr-only">Yeni dahili not</span><textarea name="body" required maxLength={2000} placeholder="Sipariş hakkında not ekleyin" /></label><button className={styles.primaryButton} type="submit" disabled={props.busy !== ""}>{props.busy === "note" ? "Ekleniyor…" : "Not ekle"}</button></form> : null}
          <div className={styles.noteList}>{order.notes.length === 0 ? <p className={styles.muted}>Dahili not bulunmuyor.</p> : order.notes.map((note) => <article key={note.id}><p>{note.body}</p><small>{date(note.createdAt)}</small>{props.capabilities.note ? <button type="button" onClick={() => props.onNoteArchive(note.id)} disabled={props.busy !== ""}>Notu arşivle</button> : null}</article>)}</div>
        </section>
      </div>

      <section className={styles.timeline} aria-labelledby="timeline-title"><div className={styles.sectionHeading}><div><h2 id="timeline-title">Sipariş geçmişi</h2><p>Değiştirilemez operasyon kayıtları</p></div></div>{order.events.length === 0 ? <p className={styles.muted}>Sipariş olayı bulunmuyor.</p> : <ol>{order.events.map((event) => <li key={event.id}><span aria-hidden="true" /><div><strong>{event.message}</strong><small>{date(event.createdAt)} · {event.type}</small></div></li>)}</ol>}</section>
    </PanelPageShell>
  );
}

function safeMessage(error: unknown) {
  return error instanceof OrderApiError ? error.message : "İşlem tamamlanamadı. Lütfen yeniden deneyin.";
}

export function OrderDetailConsole({ orderId, capabilities }: { orderId: string; capabilities: OrderUiCapabilities }) {
  const [detail, setDetail] = useState<OrderDetail>();
  const [state, setState] = useState<DetailState>("loading");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (conflict = false) => {
    setError("");
    try {
      const current = await orderApi.getOrder(orderId);
      setDetail(current);
      setState("loaded");
      if (conflict) setNotice("Başka bir güncelleme algılandı; en güncel veriler yeniden yüklendi. Değişiklikleriniz gönderilmedi.");
    } catch (failure) {
      setError(safeMessage(failure));
      setState("error");
    }
  }, [orderId]);

  useEffect(() => { void load(); }, [load]);

  async function mutation(name: string, operation: () => Promise<unknown>, success: string) {
    setBusy(name); setError(""); setNotice("");
    try { await operation(); await load(); setNotice(success); }
    catch (failure) {
      if (failure instanceof OrderApiError && failure.code === "version_conflict") await load(true);
      else setError(safeMessage(failure));
    } finally { setBusy(""); }
  }

  function transitionStatus(nextStatus: OrderStatus) {
    if (!detail || nextStatus === detail.status) return;
    void mutation("status", () => orderApi.transitionStatus(orderId, { expectedVersion: detail.version, nextStatus }), "Sipariş durumu güncellendi.");
  }

  function transitionPayment(nextPaymentStatus: OrderPaymentStatus) {
    if (!detail || nextPaymentStatus === detail.paymentStatus) return;
    void mutation("payment", () => orderApi.transitionPayment(orderId, { expectedVersion: detail.version, nextPaymentStatus }), "Ödeme durumu güncellendi.");
  }

  function updateShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const data = new FormData(event.currentTarget);
    const shippingAddress: OrderAddress = {
      recipientName: field(data, "recipientName"), line1: field(data, "line1"), city: field(data, "city"), country: field(data, "country").toUpperCase(),
      ...(field(data, "district") ? { district: field(data, "district") } : {}),
      ...(field(data, "postalCode") ? { postalCode: field(data, "postalCode") } : {}),
    };
    const carrier = field(data, "carrier");
    const trackingNumber = field(data, "trackingNumber");
    const tracking: OrderTracking | undefined = carrier && trackingNumber ? { carrier, trackingNumber } : undefined;
    void mutation("shipping", () => orderApi.updateShipping(orderId, { expectedVersion: detail.version, shippingAddress, ...(tracking ? { tracking } : {}) }), "Kargo bilgileri güncellendi.");
  }

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = field(new FormData(form), "body");
    if (!body) return;
    void mutation("note", () => orderApi.addNote(orderId, body), "Dahili not eklendi.").then(() => form.reset());
  }

  function archiveNote(noteId: string) {
    void mutation(`note-${noteId}`, () => orderApi.archiveNote(orderId, noteId), "Dahili not arşivlendi.");
  }

  return <OrderDetailPresentation state={state} detail={detail} error={error} notice={notice} busy={busy} capabilities={capabilities} onRetry={() => { setState("loading"); void load(); }} onStatusChange={transitionStatus} onPaymentChange={transitionPayment} onShippingSubmit={updateShipping} onNoteSubmit={addNote} onNoteArchive={archiveNote} />;
}
