"use client";

import Link from "next/link";
import { Archive, ArchiveRestore, ArrowLeft, Barcode, Bell, Check, ChevronDown, ChevronLeft, ChevronRight, Circle, CircleDot, CreditCard, ExternalLink, History, Info, Mail, MapPin, MoreHorizontal, Package2, Pencil, Phone, Printer, RefreshCw, Send, StickyNote, Store, Trash2, Truck, UserRound } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import {
  type OrderAddress,
  type OrderDetail,
  type OrderEmailDeliveryStatus,
  type OrderEmailDeliverySummary,
  type OrderEmailEventType,
  type OrderNeighbors,
  type OrderPaymentStatus,
  type OrderStatus,
  type OrderTracking,
  type PermanentDeletionImpact,
} from "@celebix/saas-contracts";

import { PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { OrderShipmentConsole } from "@/components/shipping/OrderShipmentConsole";
import { OrderApiError, orderApi } from "@/lib/order-ui/client";
import { OrderActionDialog } from "./OrderActionDialog";
import styles from "./order-detail.module.css";

export interface OrderUiCapabilities {
  readonly delete?: boolean;
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
  in_store: "Mağaza satışı",
});
const EMAIL_EVENT_LABELS: Readonly<Record<OrderEmailEventType, string>> = Object.freeze({
  order_received: "Sipariş alındı",
  payment_completed: "Ödeme tamamlandı",
  order_shipped: "Kargoya verildi",
  order_delivered: "Teslim edildi",
  order_cancelled: "Sipariş iptal edildi",
  refund_completed: "İade tamamlandı",
  merchant_new_order: "Yeni sipariş bildirimi",
});
const EMAIL_STATUS_LABELS: Readonly<Record<OrderEmailDeliveryStatus, string>> = Object.freeze({
  pending: "Hazırlanıyor",
  leased: "Gönderiliyor",
  accepted: "Gönderildi",
  delivered: "Teslim edildi",
  delayed: "Gecikti",
  failed: "Gönderilemedi",
  bounced: "Ulaşmadı",
  complained: "İstenmeyen olarak işaretlendi",
  suppressed: "Gönderim engellendi",
});
const ARCHIVE_EVIDENCE_REFERENCE = "merchant-panel/orders/archive";

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

function statusTone(status: OrderStatus): "neutral" | "success" | "warning" | "danger" {
  if (status === "delivered") return "success";
  if (status === "cancelled" || status === "refunded") return "danger";
  if (status === "pending" || status === "confirmed" || status === "preparing") return "warning";
  return "neutral";
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
  readonly notifications?: readonly OrderEmailDeliverySummary[];
  readonly error: string;
  readonly notice: string;
  readonly busy: string;
  readonly notificationBusy?: string;
  readonly successId?: number;
  readonly deletionImpact?: PermanentDeletionImpact;
  readonly capabilities: OrderUiCapabilities;
  readonly onRetry: () => void;
  readonly onArchiveSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  readonly onRestoreSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  readonly onDeletionImpactRequest?: () => void;
  readonly onDeleteSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  readonly onNotificationRetry?: (deliveryId: string) => void;
  readonly onStatusChange: (status: OrderStatus) => void;
  readonly onPaymentChange: (status: OrderPaymentStatus) => void;
  readonly onShippingSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onNoteSubmit: (event: FormEvent<HTMLFormElement>) => void;
  readonly onNoteArchive: (noteId: string) => void;
}

type OrderDialog = "" | "status" | "payment" | "shipping" | "archive" | "restore" | "delete" | "metadata" | "note";
const PROGRESS_ACTIONS: Partial<Record<OrderStatus, Readonly<{ next: OrderStatus; label: string }>>> = {
  pending: { next: "confirmed", label: "Siparişi onayla" },
  confirmed: { next: "preparing", label: "Hazırlamaya başla" },
  preparing: { next: "shipped", label: "Kargolandı olarak işaretle" },
  shipped: { next: "delivered", label: "Teslim edildi olarak işaretle" },
};
const DELETION_LABELS: Readonly<Record<string, string>> = {
  notes: "Notlar", notifications: "Bildirimler", shipping_records: "Kargo kayıtları", draft_links: "Taslak bağlantıları", cart_links: "Sepet bağlantıları", analytics_events: "Analiz kayıtları", external_payment: "Dış ödeme kayıtları", external_fulfillment: "Dış kargo kayıtları",
  order_items: "Ürün satırları", order_events: "Geçmiş", order_notes: "Notlar", order_email_deliveries: "Bildirimler",
  order_email_delivery_attempts: "Bildirim denemeleri", shipments: "Gönderiler", shipment_events: "Kargo geçmişi",
  inventory_movements: "Stok hareketleri", payment_transactions: "Ödeme kayıtları", orders: "Sipariş",
};
function trackingHref(value?: string) {
  if (!value) return undefined;
  try { const parsed = new URL(value); return ["https:", "http:"].includes(parsed.protocol) ? parsed.href : undefined; } catch { return undefined; }
}
function localDateTime(value?: string) {
  if (!value) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(parsed.getTime() - parsed.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
function ShippingFields({ order }: { order: OrderDetail }) {
  const address = order.shippingAddress;
  return <>
    <div className={styles.formGrid}>
      <label>Alıcı<input name="recipientName" required maxLength={200} defaultValue={address?.recipientName ?? order.customerName ?? ""} /></label>
      <label>Şehir<input name="city" required maxLength={200} defaultValue={address?.city ?? ""} /></label>
      <label className={styles.wide}>Adres<input name="line1" required maxLength={300} defaultValue={address?.line1 ?? ""} /></label>
      <label className={styles.wide}>Adres devamı<input name="line2" maxLength={300} defaultValue={address?.line2 ?? ""} /></label>
      <label>İlçe<input name="district" maxLength={200} defaultValue={address?.district ?? ""} /></label>
      <label>Posta kodu<input name="postalCode" maxLength={32} defaultValue={address?.postalCode ?? ""} /></label>
      <label>Ülke kodu<input name="country" required minLength={2} maxLength={2} pattern="[A-Za-z]{2}" defaultValue={address?.country ?? "TR"} /></label>
    </div>
    <details className={styles.trackingEditor}>
      <summary>Takip bilgisi <ChevronDown size={16} aria-hidden="true" /></summary>
      <div className={styles.formGrid}>
        <label>Kargo firması<input name="carrier" maxLength={100} defaultValue={order.tracking?.carrier ?? ""} /></label>
        <label>Takip numarası<input name="trackingNumber" maxLength={200} defaultValue={order.tracking?.trackingNumber ?? ""} /></label>
        <label className={styles.wide}>Takip bağlantısı<input name="trackingUrl" type="url" maxLength={2048} defaultValue={order.tracking?.trackingUrl ?? ""} /></label>
        <label className={styles.wide}>Gönderim zamanı<input name="shippedAt" type="datetime-local" defaultValue={localDateTime(order.tracking?.shippedAt)} /></label>
      </div>
    </details>
  </>;
}

export function OrderDetailPresentation(props: OrderDetailPresentationProps) {
  const [dialog, setDialog] = useState<OrderDialog>("");
  const [statusChoice, setStatusChoice] = useState<OrderStatus | "">("");
  const [paymentChoice, setPaymentChoice] = useState<OrderPaymentStatus | "">("");
  const [noteId, setNoteId] = useState("");
  const formId = useId();
  const previousSuccess = useRef(props.successId);
  const menuRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => { setDialog(""); setNoteId(""); }, [props.detail?.id]);
  useEffect(() => {
    if (props.successId !== previousSuccess.current && props.successId !== undefined && !props.error) setDialog("");
    previousSuccess.current = props.successId;
  }, [props.successId, props.error]);
  const closeDialog = () => { if (!props.busy) setDialog(""); };
  if (props.state === "loading") return <PanelPageShell><section className={styles.detailRoot} aria-label="Sipariş çalışma alanı"><h1 className="sr-only">Sipariş detayı</h1><div className={styles.loading} role="status"><span className="sr-only">Sipariş ayrıntıları yükleniyor…</span><div /><div /><div /></div></section></PanelPageShell>;
  if (props.detail === undefined) return <PanelPageShell><section className={styles.detailRoot}><h1 className="sr-only">Sipariş detayı</h1><Link className={styles.backLink} href="/orders"><ArrowLeft size={18} aria-hidden="true" />Siparişlere dön</Link><div className={styles.errorState} role="alert"><h2>Sipariş açılamadı</h2><p>{props.error || "Sipariş bulunamadı."}</p><button className={styles.secondaryButton} type="button" onClick={props.onRetry}>Tekrar dene</button></div></section></PanelPageShell>;
  const order = props.detail;
  const inStore = order.source === "in_store";
  const statusOptions = inStore ? [] : getAuthorizedOrderStatusOptions(order.status, props.capabilities).filter(status => status !== order.status);
  const paymentOptions = inStore ? [] : getAuthorizedOrderPaymentOptions(order.paymentStatus, props.capabilities.payment).filter(status => status !== order.paymentStatus);
  const progress = !order.archive?.archived ? PROGRESS_ACTIONS[order.status] : undefined;
  const primary = progress && statusOptions.includes(progress.next) ? progress : undefined;
  const notifications = props.notifications ?? [];
  const trackingUrl = trackingHref(order.tracking?.trackingUrl);
  const stages: OrderStatus[] = ["pending", "confirmed", "preparing", "shipped", "delivered"];
  const stage = stages.indexOf(order.status);
  function openDialog(next: OrderDialog) {
    if (menuRef.current?.open) { menuRef.current.querySelector("summary")?.focus(); menuRef.current.open = false; }
    if (next === "status") setStatusChoice(primary?.next ?? statusOptions[0] ?? "");
    if (next === "payment") setPaymentChoice(paymentOptions[0] ?? "");
    setDialog(next);
    if (next === "delete" && props.deletionImpact === undefined) props.onDeletionImpactRequest?.();
  }
  const modalTitle: Record<Exclude<OrderDialog, "">, string> = { status: "Sipariş durumunu güncelle", payment: "Ödeme durumunu güncelle", shipping: "Adres ve takip", archive: "Siparişi arşivle", restore: "Arşivden çıkar", delete: "Kalıcı sil", metadata: "Kayıt bilgisi", note: "Notu arşivle" };
  const modalBusy = props.busy !== "";
  const statusValid = statusChoice !== "" && statusOptions.includes(statusChoice);
  const paymentValid = paymentChoice !== "" && paymentOptions.includes(paymentChoice);
  const modalSubmit = dialog === "metadata" ? null : <button className={dialog === "delete" ? styles.dangerButton : styles.primaryButton} type="submit" form={formId} disabled={modalBusy || dialog === "status" && !statusValid || dialog === "payment" && !paymentValid || dialog === "delete" && !props.deletionImpact}>{modalBusy ? "İşleniyor…" : dialog === "shipping" ? "Kaydet" : dialog === "archive" || dialog === "note" ? "Arşivle" : dialog === "restore" ? "Arşivden çıkar" : dialog === "delete" ? "Kalıcı sil" : "Güncelle"}</button>;

  return <PanelPageShell><section className={styles.detailRoot} aria-label="Sipariş çalışma alanı">
    <h1 className="sr-only">{order.orderNumber} sipariş detayı</h1>
    <header className={styles.orderTopbar}>
      <div className={styles.orderIdentity}><Link className={styles.iconButton} href="/orders" aria-label="Sipariş listesine dön"><ArrowLeft size={20} aria-hidden="true" /></Link><div><div className={styles.identityLine}><strong>{order.orderNumber}</strong><PanelStatusBadge tone={statusTone(order.status)}>{STATUS_LABELS[order.status]}</PanelStatusBadge>{order.archive?.archived ? <span className={styles.archiveState}>Arşivlenmiş sipariş</span> : null}</div><time dateTime={order.createdAt}>{date(order.createdAt)}</time></div></div>
      <div className={styles.headerActions}>
        <nav className={styles.neighbors} aria-label="Siparişler arasında gezinme">{props.neighbors?.previous ? <Link className={styles.iconButton} href={`/orders/${encodeURIComponent(props.neighbors.previous.id)}`} aria-label={`Önceki sipariş: ${props.neighbors.previous.orderNumber}`}><ChevronLeft size={18} aria-hidden="true" /></Link> : <span className={styles.disabledIcon} aria-disabled="true"><ChevronLeft size={18} aria-hidden="true" /></span>}{props.neighbors?.next ? <Link className={styles.iconButton} href={`/orders/${encodeURIComponent(props.neighbors.next.id)}`} aria-label={`Sonraki sipariş: ${props.neighbors.next.orderNumber}`}><ChevronRight size={18} aria-hidden="true" /></Link> : <span className={styles.disabledIcon} aria-disabled="true"><ChevronRight size={18} aria-hidden="true" /></span>}</nav>
        <Link className={styles.iconButton} href={`/orders/${encodeURIComponent(order.id)}/print`} aria-label="Siparişi yazdır"><Printer size={18} aria-hidden="true" /></Link>
        <details className={styles.moreMenu} ref={menuRef} onKeyDown={event => { if (event.key === "Escape" && menuRef.current) { menuRef.current.open = false; menuRef.current.querySelector("summary")?.focus(); } }}><summary className={styles.iconButton} aria-label="Diğer sipariş işlemleri"><MoreHorizontal size={20} aria-hidden="true" /></summary><div>
          {statusOptions.length ? <button type="button" disabled={modalBusy} onClick={() => openDialog("status")}><RefreshCw size={16} aria-hidden="true" />Sipariş durumu</button> : null}
          <button type="button" onClick={() => openDialog("metadata")}><Info size={16} aria-hidden="true" />Kayıt bilgisi</button>
          {!order.archive?.archived && props.capabilities.manage && props.onArchiveSubmit ? <button type="button" disabled={modalBusy} onClick={() => openDialog("archive")}><Archive size={16} aria-hidden="true" />Siparişi arşivle</button> : null}
          {order.archive?.archived && props.capabilities.manage && props.onRestoreSubmit ? <button type="button" disabled={modalBusy} onClick={() => openDialog("restore")}><ArchiveRestore size={16} aria-hidden="true" />Arşivden çıkar</button> : null}
          {props.capabilities.delete === true && props.onDeletionImpactRequest && props.onDeleteSubmit ? <button type="button" className={styles.dangerText} disabled={modalBusy} onClick={() => openDialog("delete")}><Trash2 size={16} aria-hidden="true" />Kalıcı sil</button> : null}
        </div></details>
        {primary ? <button className={`${styles.primaryButton} ${styles.nextAction}`} type="button" disabled={modalBusy} onClick={() => openDialog("status")}><Check size={16} aria-hidden="true" />{primary.label}</button> : null}
      </div>
    </header>
    {!dialog && props.error ? <div className={styles.inlineError} role="alert">{props.error}<button type="button" className={styles.quietButton} onClick={props.onRetry}>Yenile</button></div> : null}
    {!dialog && props.notice ? <p className={styles.notice} role="status">{props.notice}</p> : null}
    {!inStore && stage >= 0 ? <ol className={styles.journey} aria-label="Sipariş akışı">{stages.map((status, index) => <li key={status} data-stage={index < stage ? "done" : index === stage ? "current" : "future"} aria-current={index === stage ? "step" : undefined}><span>{index < stage ? <Check size={12} aria-hidden="true" /> : index === stage ? <CircleDot size={12} aria-hidden="true" /> : <Circle size={12} aria-hidden="true" />}</span><span>{STATUS_LABELS[status]}</span></li>)}</ol> : inStore ? <p className={styles.storeDelivery}><Store size={16} aria-hidden="true" />Mağazadan teslim · manuel POS</p> : null}
    <div className={styles.workspace}>
      <div className={styles.main}>
        <section className={styles.itemsPanel} aria-labelledby="order-items-title"><header className={styles.sectionHeading}><h2 id="order-items-title">Ürünler <span>{order.itemCount}</span></h2><span className={styles.source}><Store size={14} aria-hidden="true" />{SOURCE_LABELS[order.source]}</span></header>
          <table className={styles.itemsTable}><thead><tr><th scope="col">Ürün</th><th scope="col">Adet</th><th scope="col" className={styles.unitPrice}>Birim fiyat</th><th scope="col">Toplam</th></tr></thead><tbody>{order.items.map(item => <tr key={item.id}><td><div className={styles.itemIdentity}><span className={styles.productPlaceholder}><Package2 size={20} aria-hidden="true" /></span><div><strong>{item.productName}</strong><small>{item.variantName ?? "Standart"}{item.sku ? ` · ${item.sku}` : ""}</small><small className={styles.mobileUnit}>Birim: {money(item.unitPriceCents, order.currency)}</small>{item.discountCents > 0 ? <small>İndirim: {money(item.discountCents, order.currency)}</small> : null}</div></div></td><td>{item.quantity}</td><td className={styles.unitPrice}>{money(item.unitPriceCents, order.currency)}</td><td>{money(item.lineTotalCents, order.currency)}</td></tr>)}</tbody></table>
          <dl className={styles.totals}><div><dt>Ara toplam</dt><dd>{money(order.subtotalCents, order.currency)}</dd></div><div><dt>Kargo</dt><dd>{money(order.shippingCents, order.currency)}</dd></div><div><dt>İndirim</dt><dd>− {money(order.discountCents, order.currency)}</dd></div><div className={styles.grandTotal}><dt>Toplam</dt><dd>{money(order.totalCents, order.currency)}</dd></div></dl>
          <footer className={styles.paymentLine}><div><CreditCard size={16} aria-hidden="true" /><strong>Ödeme</strong><span className={styles.paymentStatus} data-state={order.paymentStatus}>{PAYMENT_LABELS[order.paymentStatus]}</span></div>{paymentOptions.length ? <button className={styles.quietButton} type="button" disabled={modalBusy} onClick={() => openDialog("payment")}>Durumu güncelle <ChevronRight size={16} aria-hidden="true" /></button> : null}</footer>
        </section>
        {!inStore ? <section className={styles.section} aria-labelledby="shipping-title"><header className={styles.sectionHeading}><h2 id="shipping-title"><Truck size={16} aria-hidden="true" />Kargo</h2>{props.capabilities.shipping ? <button className={styles.quietButton} type="button" disabled={modalBusy} onClick={() => openDialog("shipping")}><Pencil size={16} aria-hidden="true" />Elle düzenle</button> : null}</header>
          {order.tracking ? <div className={styles.tracking}><strong>{order.tracking.carrier}</strong><span><Barcode size={16} aria-hidden="true" />{order.tracking.trackingNumber}</span>{order.tracking.shippedAt ? <time dateTime={order.tracking.shippedAt}>{date(order.tracking.shippedAt)}</time> : null}{trackingUrl ? <a href={trackingUrl} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" />Takip bağlantısı</a> : null}</div> : null}
          {order.shippingAddress ? props.capabilities.shipping ? <OrderShipmentConsole key={order.id} orderId={order.id} orderVersion={order.version} /> : !order.tracking ? <p className={styles.muted}>Takip kaydı yok.</p> : null : <p className={styles.muted}>Teslimat adresi yok.</p>}
        </section> : null}
        <section className={styles.section} aria-labelledby="notes-title"><header className={styles.sectionHeading}><h2 id="notes-title"><StickyNote size={16} aria-hidden="true" />Notlar</h2></header>
          <div className={styles.notes}>{order.notes.map(note => <article key={note.id}><div><p>{note.body}</p><time dateTime={note.createdAt}>{date(note.createdAt)}</time></div>{props.capabilities.note ? <button className={styles.iconButton} type="button" aria-label="Notu arşivle" disabled={modalBusy} onClick={() => { setNoteId(note.id); openDialog("note"); }}><Archive size={16} aria-hidden="true" /></button> : null}</article>)}</div>
          {props.capabilities.note ? <form className={styles.noteForm} onSubmit={props.onNoteSubmit}><label><span className="sr-only">Yeni dahili not</span><textarea name="body" required maxLength={2000} placeholder="Dahili not ekle…" rows={2} /></label><button className={styles.secondaryButton} type="submit" disabled={modalBusy} aria-label="Not ekle"><Send size={18} aria-hidden="true" /></button></form> : order.notes.length === 0 ? <p className={styles.muted}>Not yok.</p> : null}
        </section>
        <section className={styles.section} aria-labelledby="timeline-title"><header className={styles.sectionHeading}><h2 id="timeline-title"><History size={16} aria-hidden="true" />Geçmiş</h2><span className={styles.muted}>{order.events.length} kayıt</span></header>{order.events.length ? <ol className={styles.timeline}>{order.events.map(event => <li key={event.id}><div><strong>{event.message}</strong><time dateTime={event.createdAt}>{date(event.createdAt)} · {event.type}</time></div></li>)}</ol> : <p className={styles.muted}>Geçmiş kaydı yok.</p>}</section>
      </div>
      <aside className={styles.rail} aria-label="Müşteri ve teslimat">
        <section className={styles.section} aria-labelledby="customer-title"><header className={styles.sectionHeading}><h2 id="customer-title"><UserRound size={16} aria-hidden="true" />Müşteri</h2></header><div className={styles.customerIdentity}><span aria-hidden="true">{order.customerName ? order.customerName.split(/\s+/).map(part => part[0]).slice(0, 2).join("") : <UserRound size={16} />}</span><strong>{order.customerName ?? "Mağaza müşterisi"}</strong></div>{order.customerEmail ? <a className={styles.contact} href={`mailto:${order.customerEmail}`}><Mail size={16} aria-hidden="true" /><span>{order.customerEmail}</span></a> : <p className={styles.muted}>E-posta belirtilmemiş.</p>}{order.customerPhone ? <a className={styles.contact} href={`tel:${order.customerPhone}`}><Phone size={16} aria-hidden="true" /><span>{order.customerPhone}</span></a> : null}</section>
        {!inStore ? <section className={styles.section} aria-labelledby="address-title"><header className={styles.sectionHeading}><h2 id="address-title"><MapPin size={16} aria-hidden="true" />Teslimat adresi</h2>{props.capabilities.shipping ? <button className={styles.iconButton} type="button" disabled={modalBusy} onClick={() => openDialog("shipping")} aria-label="Teslimat adresini düzenle"><Pencil size={16} aria-hidden="true" /></button> : null}</header>{order.shippingAddress ? <address><strong>{order.shippingAddress.recipientName}</strong><br />{order.shippingAddress.line1}{order.shippingAddress.line2 ? <><br />{order.shippingAddress.line2}</> : null}<br />{[order.shippingAddress.district, order.shippingAddress.city, order.shippingAddress.postalCode].filter(Boolean).join(" / ")}<br />{order.shippingAddress.country === "TR" ? "Türkiye" : order.shippingAddress.country}</address> : <p className={styles.muted}>Adres belirtilmemiş.</p>}</section> : null}
        {notifications.length ? <section className={styles.section}><details className={styles.notifications}><summary><h2><Bell size={16} aria-hidden="true" />Bildirimler</h2><span>{notifications.length}<ChevronDown size={14} aria-hidden="true" /></span></summary><div>{notifications.map(notification => <article key={notification.id}><div><strong>{EMAIL_EVENT_LABELS[notification.eventType]}</strong><span>{notification.recipientMask}</span><time dateTime={notification.occurredAt}>{date(notification.occurredAt)}</time></div><div><span className={styles.notificationStatus} data-state={notification.status}>{EMAIL_STATUS_LABELS[notification.status]}</span>{notification.canRetry && props.onNotificationRetry ? <button className={styles.quietButton} type="button" disabled={Boolean(props.notificationBusy)} onClick={() => props.onNotificationRetry?.(notification.id)}>{props.notificationBusy === notification.id ? "Gönderiliyor…" : "Tekrar dene"}</button> : null}</div></article>)}</div></details></section> : null}
      </aside>
    </div>
    <OrderActionDialog open={dialog !== ""} title={dialog ? modalTitle[dialog] : "Sipariş işlemi"} onClose={closeDialog} busy={modalBusy} footer={<><button type="button" className={styles.secondaryButton} disabled={modalBusy} onClick={closeDialog}>{dialog === "metadata" ? "Kapat" : "Vazgeç"}</button>{modalSubmit}</>}>
      {props.error ? <p className={styles.inlineError} role="alert">{props.error}</p> : null}{props.notice && dialog ? <p className={styles.notice} role="status">{props.notice}</p> : null}
      {dialog === "status" ? <form id={formId} className={styles.modalForm} onSubmit={event => { event.preventDefault(); if (statusChoice !== "" && statusOptions.includes(statusChoice)) props.onStatusChange(statusChoice); }}><label>Yeni durum<select aria-label="Sipariş durumunu güncelle" value={statusValid ? statusChoice : ""} onChange={event => setStatusChoice(event.target.value as OrderStatus)}><option value="" disabled>Durum seç</option>{statusOptions.map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}</select></label></form> : null}
      {dialog === "payment" ? <form id={formId} className={styles.modalForm} onSubmit={event => { event.preventDefault(); if (paymentChoice !== "" && paymentOptions.includes(paymentChoice)) props.onPaymentChange(paymentChoice); }}><label>Yeni durum<select aria-label="Ödeme durumunu güncelle" value={paymentValid ? paymentChoice : ""} onChange={event => setPaymentChoice(event.target.value as OrderPaymentStatus)}><option value="" disabled>Durum seç</option>{paymentOptions.map(status => <option key={status} value={status}>{PAYMENT_LABELS[status]}</option>)}</select></label><p>Bu işlem kayıt durumunu değiştirir; para tahsilatı veya para iadesi yapmaz.</p></form> : null}
      {dialog === "shipping" ? <form id={formId} className={styles.modalForm} onSubmit={props.onShippingSubmit}><ShippingFields order={order} /></form> : null}
      {dialog === "archive" ? <form id={formId} className={styles.modalForm} onSubmit={props.onArchiveSubmit}><label>Arşivleme nedeni<textarea name="reason" required maxLength={500} rows={3} /></label></form> : null}
      {dialog === "restore" ? <form id={formId} className={styles.modalForm} onSubmit={props.onRestoreSubmit}><label>Geri alma nedeni<textarea name="reason" required maxLength={500} rows={3} /></label><label>Kanıt referansı<input name="evidenceReference" required maxLength={500} /></label></form> : null}
      {dialog === "delete" ? props.deletionImpact ? <form id={formId} className={styles.modalForm} onSubmit={props.onDeleteSubmit}><p>Bu işlem geri alınamaz. Sipariş ve bağlı panel kayıtları silinir; dış ödeme ve kargo kayıtları değişmez.</p><dl className={styles.impact}>{props.deletionImpact.effects.map(effect => <div key={effect.kind}><dt>{DELETION_LABELS[effect.kind] ?? effect.kind}</dt><dd>{effect.count}{effect.disposition === "external_unchanged" ? " · Değişmez" : effect.disposition === "detach" ? " · Bağlantı kaldırılır" : effect.disposition === "retain_snapshot" ? " · Korunur" : ""}</dd></div>)}</dl><label>Onaylamak için <strong>{props.deletionImpact.confirmationLabel}</strong> yazın<input name="confirmation" required maxLength={200} autoComplete="off" /></label><label className={styles.check}><input name="acknowledged" type="checkbox" required />İşlemin geri alınamayacağını anlıyorum.</label></form> : <div className={styles.modalForm}>{props.busy === "deletion-impact" ? <p role="status">Silme etkisi yükleniyor…</p> : <button className={styles.secondaryButton} type="button" onClick={props.onDeletionImpactRequest}>Silme etkisini yeniden yükle</button>}</div> : null}
      {dialog === "metadata" ? <dl className={styles.metadata}><div><dt>Kanal</dt><dd>{SOURCE_LABELS[order.source]}</dd></div><div><dt>Oluşturulma</dt><dd>{date(order.createdAt)}</dd></div><div><dt>Son güncelleme</dt><dd>{date(order.updatedAt)}</dd></div><div><dt>Kayıt sürümü</dt><dd>{order.version}</dd></div>{order.archive?.archived ? <div><dt>Arşivlenme</dt><dd>{date(order.archive.changedAt)}</dd></div> : null}</dl> : null}
      {dialog === "note" ? <form id={formId} className={styles.modalForm} onSubmit={event => { event.preventDefault(); if (noteId) props.onNoteArchive(noteId); }}><p>{order.notes.find(note => note.id === noteId)?.body}</p></form> : null}
    </OrderActionDialog>
  </section></PanelPageShell>;
}

class ArchiveEligibilityError extends Error {}

function safeMessage(error: unknown) {
  if (error instanceof ArchiveEligibilityError) return "Bu sipariş şu anda arşivlenemez.";
  return error instanceof OrderApiError ? error.message : "İşlem tamamlanamadı. Lütfen yeniden deneyin.";
}

export function OrderDetailConsole({ orderId, capabilities }: { orderId: string; capabilities: OrderUiCapabilities }) {
  const [detail, setDetail] = useState<OrderDetail>();
  const [neighbors, setNeighbors] = useState<OrderNeighbors>();
  const [notifications, setNotifications] = useState<readonly OrderEmailDeliverySummary[]>(Object.freeze([]));
  const [state, setState] = useState<DetailState>("loading");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [successId, setSuccessId] = useState(0);
  const loadSequence = useRef(0);
  const orderScope = useRef(0);
  const currentOrderId = useRef(orderId);
  currentOrderId.current = orderId;
  const inFlight = useRef(false);
  const notificationInFlight = useRef(false);
  const [deletionImpact, setDeletionImpact] = useState<PermanentDeletionImpact>();
  const deletionIntent = useRef<Readonly<{ orderId: string; expectedVersion: number; confirmation: string; operationId: string }> | undefined>(undefined);
  const [notificationBusy, setNotificationBusy] = useState("");
  const archiveIntent = useRef<Readonly<{ orderId: string; reason: string; operationId: string }> | undefined>(undefined);
  const restoreIntent = useRef<Readonly<{ orderId: string; reason: string; evidenceReference: string; operationId: string }> | undefined>(undefined);

  const load = useCallback(async (conflict = false) => {
    if (currentOrderId.current !== orderId) return;
    const request = ++loadSequence.current;
    setError("");
    try {
      const [current, adjacent, deliveries] = await Promise.all([
        orderApi.getOrder(orderId),
        orderApi.getOrderNeighbors(orderId).catch(() => undefined),
        orderApi.getOrderNotifications(orderId).catch(() => undefined),
      ]);
      if (request !== loadSequence.current || currentOrderId.current !== orderId) return;
      if (current.id !== orderId) throw new Error("invalid order response");
      setDetail(current);
      setDeletionImpact(impact => impact?.resourceId === current.id && impact.expectedVersion === current.version ? impact : undefined);
      setNeighbors(adjacent);
      if (deliveries !== undefined) setNotifications(deliveries);
      setState("loaded");
      if (conflict) setNotice("Başka bir güncelleme algılandı; en güncel veriler yeniden yüklendi. Değişiklikleriniz gönderilmedi.");
    } catch (failure) {
      if (request !== loadSequence.current || currentOrderId.current !== orderId) return;
      setError(safeMessage(failure));
      setState(current => current === "loaded" ? "loaded" : "error");
    }
  }, [orderId]);

  useEffect(() => {
    currentOrderId.current = orderId;
    orderScope.current += 1;
    setDetail(undefined);
    setDeletionImpact(undefined);
    deletionIntent.current = undefined;
    setNeighbors(undefined);
    setNotifications(Object.freeze([]));
    setState("loading");
    setBusy(""); setError(""); setNotice(""); setSuccessId(0); setNotificationBusy("");
    archiveIntent.current = undefined; restoreIntent.current = undefined; inFlight.current = false; notificationInFlight.current = false;
    void load();
    return () => { orderScope.current += 1; loadSequence.current += 1; if (currentOrderId.current === orderId) currentOrderId.current = ""; };
  }, [load]);

  async function mutation(name: string, operation: () => Promise<unknown>, success: string): Promise<OrderMutationOutcome> {
    if (inFlight.current || currentOrderId.current !== orderId) return Object.freeze({ state: "error", failure: new Error("operation in progress") });
    inFlight.current = true;
    setBusy(name); setError(""); setNotice("");
    const scope = orderScope.current;
    const outcome = await executeOrderMutation(operation, conflict => scope === orderScope.current && currentOrderId.current === orderId ? load(conflict) : Promise.resolve());
    if (scope !== orderScope.current || currentOrderId.current !== orderId) return outcome;
    if (outcome.state === "success") { setNotice(success); setSuccessId(current => current + 1); }
    else if (outcome.state === "error") setError(safeMessage(outcome.failure));
    inFlight.current = false; setBusy("");
    return outcome;
  }

  function transitionStatus(nextStatus: OrderStatus) {
    if (!detail || detail.source === "in_store" || inFlight.current || nextStatus === detail.status || !getAuthorizedOrderStatusOptions(detail.status, capabilities).includes(nextStatus)) return;
    void mutation("status", () => orderApi.transitionStatus(orderId, { expectedVersion: detail.version, nextStatus }), "Sipariş durumu güncellendi.");
  }

  function transitionPayment(nextPaymentStatus: OrderPaymentStatus) {
    if (!detail || detail.source === "in_store" || inFlight.current || nextPaymentStatus === detail.paymentStatus || !getAuthorizedOrderPaymentOptions(detail.paymentStatus, capabilities.payment).includes(nextPaymentStatus)) return;
    void mutation("payment", () => orderApi.transitionPayment(orderId, { expectedVersion: detail.version, nextPaymentStatus }), "Ödeme durumu güncellendi.");
  }

  function updateShipping(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || detail.source === "in_store" || !capabilities.shipping || inFlight.current) return;
    const data = new FormData(event.currentTarget);
    if (Boolean(field(data, "carrier")) !== Boolean(field(data, "trackingNumber"))) { setError("Kargo firması ve takip numarasını birlikte girin."); return; }
    const shippedAt = field(data, "shippedAt");
    if (shippedAt && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(shippedAt)) {
      data.set("shippedAt", shippedAt === localDateTime(detail.tracking?.shippedAt)
        ? detail.tracking!.shippedAt!
        : new Date(shippedAt).toISOString());
    }
    const update = buildOrderShippingUpdate(detail, data);
    void mutation("shipping", () => orderApi.updateShipping(orderId, update), "Kargo bilgileri güncellendi.");
  }

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !capabilities.note || inFlight.current) return;
    const form = event.currentTarget;
    const body = field(new FormData(form), "body");
    if (!body) return;
    void mutation("note", () => orderApi.addNote(orderId, body), "Dahili not eklendi.").then((outcome) => resetNoteFormAfterSuccess(outcome, form));
  }

  function archiveNote(noteId: string) {
    if (!detail || !capabilities.note || inFlight.current) return;
    void mutation(`note-${noteId}`, () => orderApi.archiveNote(orderId, noteId), "Dahili not arşivlendi.");
  }

  function archiveOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || detail.archive?.archived || !capabilities.manage || busy || inFlight.current) return;
    const reason = field(new FormData(event.currentTarget), "reason");
    if (!reason) return;
    const operationId = archiveIntent.current?.orderId === orderId && archiveIntent.current.reason === reason
      ? archiveIntent.current.operationId
      : crypto.randomUUID();
    archiveIntent.current = Object.freeze({ orderId, reason, operationId });
    void mutation("archive", async () => {
      const eligibility = await orderApi.getArchiveEligibility(orderId);
      if (eligibility.id !== orderId || !eligibility.eligible || eligibility.archived) throw new ArchiveEligibilityError();
      return orderApi.archiveOrder(orderId, { operationId, reason, evidenceReference: ARCHIVE_EVIDENCE_REFERENCE });
    }, "Sipariş arşivlendi.").then((outcome) => {
      if (outcome.state === "success" && archiveIntent.current?.operationId === operationId) archiveIntent.current = undefined;
    });
  }

  async function loadDeletionImpact() {
    if (!detail || capabilities.delete !== true || busy || inFlight.current) return;
    inFlight.current = true;
    const scope = orderScope.current;
    setBusy("deletion-impact"); setError(""); setNotice("");
    try {
      const impact = await orderApi.getDeletionImpact(orderId);
      if (scope !== orderScope.current || currentOrderId.current !== orderId) return;
      if (impact.resourceId !== detail.id || impact.resourceKind !== "order") throw new Error("invalid deletion impact");
      setDeletionImpact(impact);
      deletionIntent.current = undefined;
    } catch (failure) {
      if (scope === orderScope.current && currentOrderId.current === orderId) setError(safeMessage(failure));
    } finally {
      if (scope === orderScope.current && currentOrderId.current === orderId) { inFlight.current = false; setBusy(""); }
    }
  }

  function deleteOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !deletionImpact || capabilities.delete !== true || busy || inFlight.current) return;
    const data = new FormData(event.currentTarget);
    const confirmation = field(data, "confirmation");
    const acknowledged = data.get("acknowledged") === "on";
    if (!acknowledged || confirmation !== deletionImpact.confirmationLabel) {
      setError("Silme onayı sipariş numarasıyla eşleşmiyor.");
      return;
    }
    const intent = deletionIntent.current;
    const operationId = intent?.orderId === orderId && intent.expectedVersion === deletionImpact.expectedVersion && intent.confirmation === confirmation
      ? intent.operationId
      : crypto.randomUUID();
    deletionIntent.current = Object.freeze({
      orderId,
      expectedVersion: deletionImpact.expectedVersion,
      confirmation,
      operationId,
    });
    inFlight.current = true;
    const scope = orderScope.current;
    setBusy("delete"); setError(""); setNotice("");
    void orderApi.deleteOrder(orderId, {
      operationId,
      expectedVersion: deletionImpact.expectedVersion,
      confirmation,
    }).then((result) => {
      if (!result.deleted || result.resourceId !== orderId || result.auditId !== operationId) throw new Error("invalid deletion result");
      if (scope === orderScope.current && currentOrderId.current === orderId) window.location.assign("/orders");
    }).catch((failure) => {
      if (scope !== orderScope.current || currentOrderId.current !== orderId) return;
      inFlight.current = false;
      setError(safeMessage(failure));
      setBusy("");
    });
  }

  async function retryNotification(deliveryId: string) {
    if (notificationInFlight.current || currentOrderId.current !== orderId) return;
    notificationInFlight.current = true;
    const scope = orderScope.current;
    setNotificationBusy(deliveryId);
    setError("");
    setNotice("");
    try {
      const retried = await orderApi.retryOrderNotification(orderId, deliveryId);
      if (scope !== orderScope.current || currentOrderId.current !== orderId) return;
      setNotifications((current) => Object.freeze(current.map((item) => item.id === retried.id ? retried : item)));
      setNotice("Bildirim yeniden gönderime alındı.");
    } catch (failure) {
      if (scope === orderScope.current && currentOrderId.current === orderId) setError(safeMessage(failure));
    } finally {
      if (scope === orderScope.current && currentOrderId.current === orderId) { notificationInFlight.current = false; setNotificationBusy(""); }
    }
  }

  function restoreOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail?.archive?.archived || !capabilities.manage || inFlight.current) return;
    const data = new FormData(event.currentTarget);
    const reason = field(data, "reason"), evidenceReference = field(data, "evidenceReference");
    if (!reason || !evidenceReference) return;
    const intent = restoreIntent.current;
    const operationId = intent?.orderId === orderId && intent.reason === reason && intent.evidenceReference === evidenceReference ? intent.operationId : crypto.randomUUID();
    restoreIntent.current = Object.freeze({ orderId, reason, evidenceReference, operationId });
    void mutation("restore", () => orderApi.restoreOrder(orderId, { operationId, reason, evidenceReference }), "Sipariş arşivden çıkarıldı.").then(outcome => {
      if (outcome.state === "success" && restoreIntent.current?.operationId === operationId) restoreIntent.current = undefined;
    });
  }

  return <OrderDetailPresentation state={detail && detail.id !== orderId ? "loading" : state} detail={detail?.id === orderId ? detail : undefined} neighbors={neighbors} notifications={notifications} deletionImpact={deletionImpact} error={error} notice={notice} busy={busy} successId={successId} notificationBusy={notificationBusy} capabilities={capabilities} onArchiveSubmit={archiveOrder} onDeletionImpactRequest={() => { void loadDeletionImpact(); }} onDeleteSubmit={deleteOrder} onRestoreSubmit={restoreOrder} onRetry={() => { if (!detail) setState("loading"); void load(); }} onNotificationRetry={(deliveryId) => { void retryNotification(deliveryId); }} onStatusChange={transitionStatus} onPaymentChange={transitionPayment} onShippingSubmit={updateShipping} onNoteSubmit={addNote} onNoteArchive={archiveNote} />;
}
