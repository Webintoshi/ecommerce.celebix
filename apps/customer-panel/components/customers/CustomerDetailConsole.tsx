"use client";
import { CommercialFeatureLink } from "@/components/commercial-packages/CommercialFeatureLink";


import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type {
  CustomerDetail,
  CustomerSegment,
  CustomerTag,
  CustomerWorkspace,
  OrderPaymentStatus,
  OrderStatus,
} from "@celebix/saas-contracts";

import { PanelPageHeader, PanelPageShell, PanelSkeletonBlock, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { CustomerApiError, customerApi } from "@/lib/customer-ui/client";
import styles from "./customer-console.module.css";

const CONSENT_LABELS = Object.freeze({ email: "E-posta", phone: "Telefon", whatsapp: "WhatsApp" });
const ORDER_STATUS_LABELS: Readonly<Record<OrderStatus, string>> = Object.freeze({
  pending: "Bekliyor", confirmed: "Onaylandı", preparing: "Hazırlanıyor", shipped: "Kargoda",
  delivered: "Teslim edildi", cancelled: "İptal", refunded: "İade",
});
const PAYMENT_STATUS_LABELS: Readonly<Record<OrderPaymentStatus, string>> = Object.freeze({
  pending: "Bekliyor", processing: "İşleniyor", completed: "Başarılı", failed: "Başarısız", refunded: "İade edildi",
});

function money(cents: number, currency: string) {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(cents / 100);
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function message(error: unknown) {
  return error instanceof CustomerApiError ? error.message : "Müşteri kaydı yüklenemedi.";
}

type CustomerDetailPresentationProps = Readonly<{
  data: CustomerDetail;
  workspace: CustomerWorkspace;
  tags: readonly CustomerTag[];
  segments: readonly CustomerSegment[];
  segmentsAvailable?: boolean;
  canManage: boolean;
  canArchive: boolean;
  busy: boolean;
  notice: string;
  error: string;
  onAddNote: (event: FormEvent<HTMLFormElement>) => void;
  onAssign: (kind: "tags" | "segments", ids: readonly string[]) => void;
  onArchive: () => void;
}>;

export function CustomerDetailPresentation({
  data,
  workspace,
  tags,
  segments,
  segmentsAvailable = true,
  canManage,
  canArchive,
  busy,
  notice,
  error,
  onAddNote,
  onAssign,
  onArchive,
}: CustomerDetailPresentationProps) {
  const partialHistory = data.orderCount > workspace.orders.length;
  return (
    <PanelPageShell>
      <PanelPageHeader title="Müşteri ayrıntısı" />
      <section className={styles.profileSurface} aria-label="Müşteri profili">
        <header className={styles.customerDetailTopbar}>
          <Link className={styles.detailBack} href="/customers" aria-label="Müşteri listesine dön">←</Link>
          <div className={styles.detailIdentity}>
            <div className={styles.detailTitleRow}>
              <h1 className="sr-only">{data.displayName} müşteri kaydı</h1>
              <strong className={styles.detailName}>{data.displayName}</strong>
              <PanelStatusBadge tone={data.status === "active" ? "success" : "neutral"}>
                {data.status === "active" ? "Aktif" : "Arşiv"}
              </PanelStatusBadge>
            </div>
          </div>
          <nav className={styles.detailNavigation} aria-label="Müşteriler arasında gezinme">
            {workspace.neighbors.previous ? (
              <Link href={`/customers/${encodeURIComponent(workspace.neighbors.previous.id)}`} title={workspace.neighbors.previous.displayName}>← Önceki</Link>
            ) : <span aria-hidden="true">← Önceki</span>}
            {workspace.neighbors.next ? (
              <Link href={`/customers/${encodeURIComponent(workspace.neighbors.next.id)}`} title={workspace.neighbors.next.displayName}>Sonraki →</Link>
            ) : <span aria-hidden="true">Sonraki →</span>}
          </nav>
          {canManage && data.status === "active" ? (
            <Link className={styles.primary} href={`/customers/${encodeURIComponent(data.id)}/edit`}>Düzenle</Link>
          ) : null}
        </header>
        <section className={styles.profileContact} aria-label="Müşteri iletişim bilgileri">
          <dl className={styles.contactGrid}>
            <div><dt>E-posta</dt><dd>{data.email ? <a href={`mailto:${data.email}`}>{data.email}</a> : "—"}</dd></div>
            <div><dt>Telefon</dt><dd>{data.phone ? <a href={`tel:${data.phone}`}>{data.phone}</a> : "—"}</dd></div>
          </dl>
        </section>
        <dl className={styles.profileFacts} aria-label="Müşteri özeti">
          <div><dt>Sipariş</dt><dd>{data.orderCount}</dd></div>
          <div><dt>Toplam harcama</dt><dd>{money(data.totalSpentCents, data.currency)}</dd></div>
          <div><dt>Etiket</dt><dd>{data.tags.length}</dd></div>
          <div><dt>Segment</dt><dd>{data.segments.length}</dd></div>
        </dl>
        <dl className={styles.profileMetadata}>
          <div><dt>Oluşturulma</dt><dd>{dateTime(data.createdAt)}</dd></div>
          <div><dt>Son güncelleme</dt><dd>{dateTime(data.updatedAt)}</dd></div>
          <div><dt>Son sipariş</dt><dd>{data.lastOrderAt ? dateTime(data.lastOrderAt) : "Henüz yok"}</dd></div>
          <div><dt>Sürüm</dt><dd>{data.version}</dd></div>
        </dl>
      </section>

      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.customerWorkspace}>
        <div className={styles.activitySurface}>
          <section className={styles.detailSection} aria-label="Sipariş geçmişi">
            <div className={styles.heading}>
              <div>
                <h2>Sipariş geçmişi</h2>
                <p>{partialHistory ? `Son ${workspace.orders.length} sipariş · toplam ${data.orderCount}` : `${data.orderCount} sipariş`}</p>
              </div>
            </div>
            {workspace.orders.length ? (
              <div className={styles.orderHistoryList}>
                {workspace.orders.map((order) => (
                  <Link className={styles.orderHistoryRow} href={`/orders/${encodeURIComponent(order.id)}`} key={order.id}>
                    <div><strong>#{order.orderNumber}</strong><span>{dateTime(order.createdAt)}</span></div>
                    <div className={styles.orderHistoryStatuses}>
                      <span>{ORDER_STATUS_LABELS[order.status]}</span>
                      <span>{PAYMENT_STATUS_LABELS[order.paymentStatus]}</span>
                    </div>
                    <strong>{money(order.totalCents, order.currency)}</strong>
                    <span aria-hidden="true">→</span>
                  </Link>
                ))}
              </div>
            ) : <p className={styles.inlineEmpty}>{data.orderCount > 0 ? "Sipariş geçmişi şu anda alınamadı. Kayıtlı sipariş toplamı müşteri özetinde gösteriliyor." : "Bu müşteriye bağlı sipariş bulunmuyor."}</p>}
          </section>

          <section className={styles.detailSection} aria-label="Dahili notlar">
            <div className={styles.heading}><div><h2>Dahili notlar</h2><p>Yalnızca mağaza ekibi görür</p></div></div>
            {canManage && data.status === "active" ? (
              <form className={styles.noteForm} onSubmit={onAddNote}>
                <label>Yeni dahili not<textarea name="text" required maxLength={2000} placeholder="Müşteri hakkında not ekleyin" /></label>
                <button className={styles.button} disabled={busy}>{busy ? "Kaydediliyor…" : "Not ekle"}</button>
              </form>
            ) : null}
            <div className={styles.noteList}>
              {data.notes.length ? data.notes.map((note) => (
                <article key={note.id}><p>{note.text}</p><small>{dateTime(note.createdAt)}</small></article>
              )) : <p className={styles.inlineEmpty}>Henüz dahili not yok.</p>}
            </div>
          </section>
        </div>
        <aside className={styles.customerInfoSurface} aria-label="Müşteri bilgileri ve işlemleri">
          <section className={styles.infoSection} aria-label="Müşteri adresleri">
            <div className={styles.heading}>
              <div><h2>Adresler</h2><p>{data.addresses.length} kayıt</p></div>
            </div>
            <div className={styles.addressList}>
              {data.addresses.length ? data.addresses.map((address) => (
                <article key={address.id}>
                  <div className={styles.addressTitle}><strong>{address.label}</strong>{address.isDefault ? <span>Varsayılan</span> : null}</div>
                  <p>{address.recipientName}</p>
                  <p>{address.line1}{address.line2 ? `, ${address.line2}` : ""}</p>
                  <p>{address.district ? `${address.district}, ` : ""}{address.city} {address.postalCode ?? ""} · {address.country}</p>
                </article>
              )) : <p className={styles.inlineEmpty}>Adres kaydı yok.</p>}
            </div>
          </section>

          <section className={styles.infoSection} aria-label="İletişim izinleri">
            <div className={styles.summaryHeading}><h2>İletişim izinleri</h2><span>Güncel kayıt</span></div>
            <div className={styles.consentList}>
              {data.consents.length ? data.consents.map((consent) => (
                <div key={consent.channel}>
                  <span>{CONSENT_LABELS[consent.channel]}</span>
                  <PanelStatusBadge tone={consent.status === "granted" ? "success" : "neutral"}>{consent.status === "granted" ? "İzinli" : "Reddedildi"}</PanelStatusBadge>
                  <small>İzin tarihi: {dateTime(consent.recordedAt)}</small>
                </div>
              )) : <p className={styles.inlineEmpty}>İzin kaydı yok.</p>}
            </div>
          </section>

          <section className={styles.infoSection} aria-label="Müşteri sınıflandırması">
            <div className={styles.summaryHeading}><h2>Etiketler</h2><Link href="/customers/tags">Yönet</Link></div>
            {tags.length ? <div className={styles.taxonomyChecks}>{tags.map((tag) => (
              <label key={tag.id}><input type="checkbox" disabled={!canManage || busy || data.status !== "active"} checked={data.tags.some((item) => item.id === tag.id)} onChange={(event) => onAssign("tags", event.target.checked ? [...data.tags.map((item) => item.id), tag.id] : data.tags.filter((item) => item.id !== tag.id).map((item) => item.id))} /><span className={styles.color} style={{ background: tag.color }} />{tag.name}</label>
            ))}</div> : <p className={styles.inlineEmpty}>Etiket yok.</p>}
            <div className={styles.summaryHeading}><h2>Segmentler</h2>{segmentsAvailable ? <Link href="/customers/segments">Yönet</Link> : <CommercialFeatureLink capability="growth_tools"/>}</div>
            {segments.length ? <div className={styles.taxonomyChecks}>{segments.map((segment) => (
              <label key={segment.id}><input type="checkbox" disabled={!canManage || busy || data.status !== "active" || !segmentsAvailable} checked={data.segments.some((item) => item.id === segment.id)} onChange={(event) => onAssign("segments", event.target.checked ? [...data.segments.map((item) => item.id), segment.id] : data.segments.filter((item) => item.id !== segment.id).map((item) => item.id))} />{segment.name}</label>
            ))}</div> : <p className={styles.inlineEmpty}>Segment yok.</p>}
          </section>

          <footer className={styles.customerArchiveFooter}>
            {canArchive && data.status === "active" ? (
              <details className={styles.archiveConfirm}>
                <summary>Müşteriyi Arşivle</summary>
                <p>Müşteri listeden kaldırılır; sipariş ve operasyon geçmişi korunur.</p>
                <button className={styles.danger} disabled={busy} type="button" onClick={onArchive}>{busy ? "İşleniyor…" : "Arşivlemeyi onayla"}</button>
              </details>
            ) : null}
          </footer>
        </aside>
      </div>
    </PanelPageShell>
  );
}

export function CustomerDetailConsole({ customerId, canManage, canArchive, segmentsAvailable = true }: Readonly<{ customerId: string; canManage: boolean; canArchive: boolean; segmentsAvailable?: boolean }>) {
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [workspace, setWorkspace] = useState<CustomerWorkspace | null>(null);
  const [tags, setTags] = useState<readonly CustomerTag[]>([]);
  const [segments, setSegments] = useState<readonly CustomerSegment[]>([]);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  const customerScope = useRef(0);
  const currentCustomerId = useRef(customerId);
  const loadedCustomerId = useRef<string | null>(null);
  currentCustomerId.current = customerId;

  const load = useCallback(async (refresh = false) => {
    const request = ++sequence.current;
    const retainDetail = refresh && loadedCustomerId.current === customerId;
    if (!retainDetail) setState("loading");
    setError("");
    try {
      const [detail, customerWorkspace, availableTags, availableSegments] = await Promise.all([
        customerApi.get(customerId),
        customerApi.workspace(customerId),
        customerApi.tags(),
        segmentsAvailable ? customerApi.segments() : Promise.resolve([]),
      ]);
      if (request !== sequence.current || currentCustomerId.current !== customerId) return;
      if (detail.id !== customerId) throw new Error("invalid_customer_response");
      setData(detail);
      setWorkspace(customerWorkspace);
      setTags(availableTags);
      setSegments(availableSegments);
      loadedCustomerId.current = customerId;
      setState("loaded");
    } catch (caught) {
      if (request !== sequence.current || currentCustomerId.current !== customerId) return;
      setError(message(caught));
      if (!retainDetail) setState("error");
    }
  }, [customerId, segmentsAvailable]);

  useEffect(() => {
    customerScope.current += 1;
    setNotice(""); setBusy(false);
    void load();
    return () => { sequence.current += 1; customerScope.current += 1; };
  }, [load]);

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const rawText = String(new FormData(form).get("text") ?? "");
    const text = rawText.trim();
    if (!data || data.id !== customerId || !text || busy) return;
    const scope = customerScope.current;
    const isCurrent = () => scope === customerScope.current && currentCustomerId.current === customerId;
    setBusy(true);
    setError("");
    try {
      await customerApi.addNote(customerId, text);
      if (!isCurrent()) return;
      const noteInput = form.elements.namedItem("text") as HTMLTextAreaElement | null;
      if (!noteInput || noteInput.value === rawText) form.reset();
      setNotice("Not kaydedildi.");
      await load(true);
    } catch (caught) { if (isCurrent()) setError(message(caught)); }
    finally { if (isCurrent()) setBusy(false); }
  }

  async function assign(kind: "tags" | "segments", ids: readonly string[]) {
    if (kind === "segments" && !segmentsAvailable) return;
    if (!data || data.id !== customerId || busy) return;
    const scope = customerScope.current;
    const isCurrent = () => scope === customerScope.current && currentCustomerId.current === customerId;
    setBusy(true);
    setError("");
    try {
      if (kind === "tags") await customerApi.setTags(customerId, ids);
      else await customerApi.setSegments(customerId, ids);
      if (!isCurrent()) return;
      setNotice(kind === "tags" ? "Etiketler güncellendi." : "Segmentler güncellendi.");
      await load(true);
    } catch (caught) { if (isCurrent()) setError(message(caught)); }
    finally { if (isCurrent()) setBusy(false); }
  }

  async function archive() {
    if (!data || data.id !== customerId || busy) return;
    const scope = customerScope.current;
    const isCurrent = () => scope === customerScope.current && currentCustomerId.current === customerId;
    setBusy(true);
    setError("");
    try {
      await customerApi.archive(customerId, data.version);
      if (!isCurrent()) return;
      setNotice("Müşteri arşivlendi.");
      await load(true);
    } catch (caught) { if (isCurrent()) setError(message(caught)); }
    finally { if (isCurrent()) setBusy(false); }
  }

  if (state === "loading" || data && data.id !== customerId) return <PanelPageShell><PanelPageHeader title="Müşteri ayrıntısı" /><h1 className="sr-only">Müşteri ayrıntısı</h1><div className={styles.customerDetailSkeleton} role="status"><span className="sr-only">Müşteri yükleniyor…</span><PanelSkeletonBlock className={styles.customerIdentitySkeleton} /><div className={styles.customerWorkspace}><div className={styles.customerWorkspaceMain}>{Array.from({ length: 3 }, (_, i) => <PanelSkeletonBlock className={styles.customerSectionSkeleton} key={i} />)}</div><div className={styles.customerSummaryRail}>{Array.from({ length: 2 }, (_, i) => <PanelSkeletonBlock className={styles.customerSectionSkeleton} key={i} />)}</div></div></div></PanelPageShell>;
  if (state === "error" || !data || !workspace) return (
    <PanelPageShell><PanelPageHeader title="Müşteri ayrıntısı" /><h1 className="sr-only">Müşteri ayrıntısı</h1><div className={styles.state} role="alert"><div><p className={styles.error}>{error}</p><button className={styles.button} onClick={() => void load()}>Tekrar dene</button></div></div></PanelPageShell>
  );
  return <CustomerDetailPresentation segmentsAvailable={segmentsAvailable} data={data} workspace={workspace} tags={tags} segments={segments} canManage={canManage} canArchive={canArchive} busy={busy} notice={notice} error={error} onAddNote={addNote} onAssign={(kind, ids) => void assign(kind, ids)} onArchive={() => void archive()} />;
}
