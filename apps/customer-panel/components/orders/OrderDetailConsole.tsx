"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  type OrderAddress,
  type OrderDetail,
  type OrderNeighbors,
  type OrderPaymentStatus,
  type OrderStatus,
  type OrderTracking,
} from "@celebix/saas-contracts";

import { PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import styles from "./order-console.module.css";

export interface OrderUiCapabilities {
  readonly fulfill: boolean;
  readonly manage: boolean;
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
const SOURCE_LABELS: Readonly<Record<OrderDetail["source"], string>> = Object.freeze({
  storefront: "Online mağaza",
  quick_link: "Hızlı sipariş",
  marketplace: "Pazar yeri",
  manual_import: "Manuel aktarım",
  manual: "Manuel sipariş",
});

export function getAuthorizedOrderStatusOptions(
  current: OrderStatus,
  capabilities: Pick<OrderUiCapabilities, "fulfill" | "manage">,
): readonly OrderStatus[] {
  const next: OrderStatus[] = [];
  if (current === "pending") {
    if (capabilities.fulfill) next.push("confirmed");
    if (capabilities.manage) next.push("cancelled");
  } else if (current === "confirmed") {
    if (capabilities.fulfill) next.push("preparing");
    if (capabilities.manage) next.push("cancelled");
  } else if (current === "preparing") {
    if (capabilities.fulfill) next.push("shipped");
    if (capabilities.manage) next.push("cancelled");
  } else if (current === "shipped" && capabilities.fulfill) {
    next.push("delivered");
  } else if (current === "delivered" && capabilities.manage) {
    next.push("refunded");
  }
  return next.length === 0 ? Object.freeze([]) : Object.freeze([current, ...next]);
}

export function getAuthorizedOrderPaymentOptions(
  current: OrderPaymentStatus,
  allowed: boolean,
): readonly OrderPaymentStatus[] {
  if (!allowed) return Object.freeze([]);
  const next: readonly OrderPaymentStatus[] = current === "pending"
    ? ["processing", "failed"]
    : current === "processing"
      ? ["completed", "failed"]
      : current === "failed"
        ? ["processing"]
        : current === "completed"
          ? ["refunded"]
          : [];
  return next.length === 0 ? Object.freeze([]) : Object.freeze([current, ...next]);
}

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

export type OrderMutationOutcome =
  | Readonly<{ state: "success" }>
  | Readonly<{ state: "conflict" }>
  | Readonly<{ state: "error"; failure: unknown }>;

export async function executeOrderMutation(
  operation: () => Promise<unknown>,
  reload: (conflict: boolean) => Promise<unknown>,
): Promise<OrderMutationOutcome> {
  try {
    await operation();
    await reload(false);
    return Object.freeze({ state: "success" as const });
  } catch (failure) {
    if (failure instanceof OrderApiError && failure.code === "version_conflict") {
      await reload(true);
      return Object.freeze({ state: "conflict" as const });
    }
    return Object.freeze({ state: "error" as const, failure });
  }
}

export function resetNoteFormAfterSuccess(outcome: OrderMutationOutcome, form: Pick<HTMLFormElement, "reset">) {
  if (outcome.state === "success") form.reset();
}

export function buildOrderShippingUpdate(order: OrderDetail, data: FormData) {
  const line2 = field(data, "line2");
  const district = field(data, "district");
  const postalCode = field(data, "postalCode");
  const shippingAddress: OrderAddress = Object.freeze({
    recipientName: field(data, "recipientName"),
    line1: field(data, "line1"),
    ...(line2 ? { line2 } : {}),
    ...(district ? { district } : {}),
    city: field(data, "city"),
    ...(postalCode ? { postalCode } : {}),
    country: field(data, "country").toUpperCase(),
  });
  const carrier = field(data, "carrier");
  const trackingNumber = field(data, "trackingNumber");
  const trackingUrl = field(data, "trackingUrl");
  const shippedAt = field(data, "shippedAt");
  const tracking: OrderTracking | undefined = carrier && trackingNumber ? Object.freeze({
    carrier,
    trackingNumber,
    ...(trackingUrl ? { trackingUrl } : {}),
    ...(shippedAt ? { shippedAt } : {}),
  }) : undefined;
  return Object.freeze({
    expectedVersion: order.version,
    shippingAddress,
    ...(tracking ? { tracking } : {}),
  });
}

export interface OrderDetailPresentationProps {
  readonly state: DetailState;
  readonly detail?: OrderDetail;
  readonly neighbors?: OrderNeighbors;
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
  const statusOptions = getAuthorizedOrderStatusOptions(order.status, props.capabilities);
  const paymentOptions = getAuthorizedOrderPaymentOptions(order.paymentStatus, props.capabilities.payment);
  return (
    <PanelPageShell>
      <header className={styles.orderTopbar}>
        <div className={styles.orderIdentity}>
          <Link className={styles.backLink} href="/orders" aria-label="Sipariş listesine dön">←</Link>
          <div><p>Siparişler / {order.orderNumber}</p><h1>#{order.orderNumber}</h1><span>{date(order.createdAt)} · sürüm {order.version}</span></div>
        </div>
        <div className={styles.orderTopbarActions}>
          <nav className={styles.neighborNavigation} aria-label="Siparişler arasında gezinme">
            {props.neighbors?.previous ? <Link href={`/orders/${encodeURIComponent(props.neighbors.previous.id)}`} title={`Önceki sipariş: ${props.neighbors.previous.orderNumber}`}>← <span>Önceki</span></Link> : <span aria-disabled="true">← <span>Önceki</span></span>}
            {props.neighbors?.next ? <Link href={`/orders/${encodeURIComponent(props.neighbors.next.id)}`} title={`Sonraki sipariş: ${props.neighbors.next.orderNumber}`}><span>Sonraki</span> →</Link> : <span aria-disabled="true"><span>Sonraki</span> →</span>}
          </nav>
          <Link className={styles.printLink} href={`/orders/${encodeURIComponent(order.id)}/print`}>Yazdır</Link>
        </div>
      </header>
      {props.error ? <div className={styles.inlineError} role="alert">{props.error}</div> : null}
      {props.notice ? <div className={styles.notice} role="status">{props.notice}</div> : null}

      <div className={styles.orderWorkspace}>
        <main className={styles.workspaceMain}>
      <div className={styles.orderInfoGrid}>
        <section className={styles.orderInfoCard} aria-labelledby="order-information-title">
          <div className={styles.sectionHeading}><div><h2 id="order-information-title">Sipariş bilgileri</h2><p>Kaynak ve kayıt bilgileri</p></div></div>
          <dl>
            <div><dt>Kanal</dt><dd>{SOURCE_LABELS[order.source]}</dd></div>
            <div><dt>Oluşturulma</dt><dd>{date(order.createdAt)}</dd></div>
            <div><dt>Son güncelleme</dt><dd>{date(order.updatedAt)}</dd></div>
            <div><dt>Kayıt sürümü</dt><dd>{order.version}</dd></div>
          </dl>
        </section>
        <section className={styles.orderInfoCard} aria-labelledby="customer-contact-title">
          <div className={styles.sectionHeading}><div><h2 id="customer-contact-title">Müşteri iletişimi</h2><p>Siparişe ait iletişim bilgileri</p></div></div>
          <dl>
            <div><dt>Müşteri</dt><dd>{order.customerName}</dd></div>
            <div><dt>E-posta</dt><dd><a href={`mailto:${order.customerEmail}`}>{order.customerEmail}</a></dd></div>
            <div><dt>Telefon</dt><dd>{order.customerPhone ? <a href={`tel:${order.customerPhone}`}>{order.customerPhone}</a> : "Belirtilmemiş"}</dd></div>
          </dl>
        </section>
      </div>

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
            <label className={styles.wide}><span>Adres devamı</span><input name="line2" maxLength={300} defaultValue={order.shippingAddress.line2 ?? ""} /></label>
            <label><span>İlçe</span><input name="district" maxLength={200} defaultValue={order.shippingAddress.district ?? ""} /></label>
            <label><span>Şehir</span><input name="city" required maxLength={200} defaultValue={order.shippingAddress.city} /></label>
            <label><span>Posta kodu</span><input name="postalCode" maxLength={32} defaultValue={order.shippingAddress.postalCode ?? ""} /></label>
            <label><span>Ülke</span><input name="country" required minLength={2} maxLength={2} defaultValue={order.shippingAddress.country} /></label>
            <label><span>Kargo firması</span><input name="carrier" maxLength={100} defaultValue={order.tracking?.carrier ?? ""} /></label>
            <label><span>Takip numarası</span><input name="trackingNumber" maxLength={200} defaultValue={order.tracking?.trackingNumber ?? ""} /></label>
            <label className={styles.wide}><span>Takip bağlantısı</span><input name="trackingUrl" inputMode="url" maxLength={2048} defaultValue={order.tracking?.trackingUrl ?? ""} /></label>
            <label className={styles.wide}><span>Kargoya veriliş zamanı</span><input name="shippedAt" maxLength={24} defaultValue={order.tracking?.shippedAt ?? ""} /></label>
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
        </main>

        <aside className={styles.workspaceRail} aria-label="Sipariş özeti ve işlemleri">
          <section className={styles.detailHero} aria-label="Sipariş özeti">
            <div><span>Sipariş durumu</span><PanelStatusBadge>{STATUS_LABELS[order.status]}</PanelStatusBadge></div>
            <div><span>Ödeme durumu</span><strong>{PAYMENT_LABELS[order.paymentStatus]}</strong></div>
            <div><span>Kanal</span><strong>{SOURCE_LABELS[order.source]}</strong></div>
            <div><span>Müşteri</span><strong>{order.customerName}</strong><small>{order.customerEmail}</small></div>
            <div className={styles.summaryTotal}><span>Sipariş toplamı</span><strong>{money(order.totalCents, order.currency)}</strong></div>
          </section>

          {(statusOptions.length > 0 || paymentOptions.length > 0) ? (
            <section className={styles.operationBar} aria-label="Sipariş operasyonları">
              <div><h2>İşlemler</h2><p>Yalnızca izin verilen geçişler gösterilir.</p></div>
              {statusOptions.length > 0 ? <label><span>Sipariş durumu</span><select aria-label="Sipariş durumunu güncelle" value={order.status} disabled={props.busy !== ""} onChange={(event) => props.onStatusChange(event.target.value as OrderStatus)}>{statusOptions.map((status) => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label> : null}
              {paymentOptions.length > 0 ? <label><span>Ödeme durumu</span><select aria-label="Ödeme durumunu güncelle" value={order.paymentStatus} disabled={props.busy !== ""} onChange={(event) => props.onPaymentChange(event.target.value as OrderPaymentStatus)}>{paymentOptions.map((status) => <option key={status} value={status}>{PAYMENT_LABELS[status]}</option>)}</select></label> : null}
            </section>
          ) : null}
        </aside>
      </div>
    </PanelPageShell>
  );
}

function safeMessage(error: unknown) {
  return error instanceof OrderApiError ? error.message : "İşlem tamamlanamadı. Lütfen yeniden deneyin.";
}

export function OrderDetailConsole({ orderId, capabilities }: { orderId: string; capabilities: OrderUiCapabilities }) {
  const [detail, setDetail] = useState<OrderDetail>();
  const [neighbors, setNeighbors] = useState<OrderNeighbors>();
  const [state, setState] = useState<DetailState>("loading");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async (conflict = false) => {
    setError("");
    try {
      const [current, adjacent] = await Promise.all([
        orderApi.getOrder(orderId),
        orderApi.getOrderNeighbors(orderId).catch(() => undefined),
      ]);
      setDetail(current);
      setNeighbors(adjacent);
      setState("loaded");
      if (conflict) setNotice("Başka bir güncelleme algılandı; en güncel veriler yeniden yüklendi. Değişiklikleriniz gönderilmedi.");
    } catch (failure) {
      setError(safeMessage(failure));
      setState("error");
    }
  }, [orderId]);

  useEffect(() => {
    setDetail(undefined);
    setNeighbors(undefined);
    setState("loading");
    void load();
  }, [load]);

  async function mutation(name: string, operation: () => Promise<unknown>, success: string): Promise<OrderMutationOutcome> {
    setBusy(name); setError(""); setNotice("");
    const outcome = await executeOrderMutation(operation, load);
    if (outcome.state === "success") setNotice(success);
    else if (outcome.state === "error") setError(safeMessage(outcome.failure));
    setBusy("");
    return outcome;
  }

  function transitionStatus(nextStatus: OrderStatus) {
    if (!detail || nextStatus === detail.status || !getAuthorizedOrderStatusOptions(detail.status, capabilities).includes(nextStatus)) return;
    void mutation("status", () => orderApi.transitionStatus(orderId, { expectedVersion: detail.version, nextStatus }), "Sipariş durumu güncellendi.");
  }

  function transitionPayment(nextPaymentStatus: OrderPaymentStatus) {
    if (!detail || nextPaymentStatus === detail.paymentStatus || !getAuthorizedOrderPaymentOptions(detail.paymentStatus, capabilities.payment).includes(nextPaymentStatus)) return;
    void mutation("payment", () => orderApi.transitionPayment(orderId, { expectedVersion: detail.version, nextPaymentStatus }), "Ödeme durumu güncellendi.");
  }

  function updateShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail) return;
    const data = new FormData(event.currentTarget);
    const update = buildOrderShippingUpdate(detail, data);
    void mutation("shipping", () => orderApi.updateShipping(orderId, update), "Kargo bilgileri güncellendi.");
  }

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body = field(new FormData(form), "body");
    if (!body) return;
    void mutation("note", () => orderApi.addNote(orderId, body), "Dahili not eklendi.").then((outcome) => resetNoteFormAfterSuccess(outcome, form));
  }

  function archiveNote(noteId: string) {
    void mutation(`note-${noteId}`, () => orderApi.archiveNote(orderId, noteId), "Dahili not arşivlendi.");
  }

  return <OrderDetailPresentation state={state} detail={detail} neighbors={neighbors} error={error} notice={notice} busy={busy} capabilities={capabilities} onRetry={() => { setState("loading"); void load(); }} onStatusChange={transitionStatus} onPaymentChange={transitionPayment} onShippingSubmit={updateShipping} onNoteSubmit={addNote} onNoteArchive={archiveNote} />;
}
