"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import type {
  CustomerDetail,
  CustomerSegment,
  CustomerTag,
  CustomerWorkspace,
  OrderPaymentStatus,
  OrderStatus,
} from "@celebix/saas-contracts";

import { PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
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
      <header className={styles.customerDetailTopbar}>
        <Link className={styles.detailBack} href="/customers" aria-label="Müşteri listesine dön">←</Link>
        <div className={styles.detailIdentity}>
          <p>Müşteriler / {data.displayName}</p>
          <div className={styles.detailTitleRow}>
            <h1>{data.displayName}</h1>
            <PanelStatusBadge tone={data.status === "active" ? "success" : "neutral"}>
              {data.status === "active" ? "Aktif" : "Arşiv"}
            </PanelStatusBadge>
          </div>
          <span>Oluşturulma {dateTime(data.createdAt)} · sürüm {data.version}</span>
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

      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}

      <div className={styles.customerWorkspace}>
        <div className={styles.customerWorkspaceMain}>
          <section className={styles.detail} aria-label="Müşteri iletişim bilgileri">
            <div className={styles.heading}>
              <div><h2>İletişim bilgileri</h2><p>Mağaza müşterisinin güncel iletişim kaydı</p></div>
            </div>
            <dl className={styles.contactGrid}>
              <div><dt>E-posta</dt><dd>{data.email ? <a href={`mailto:${data.email}`}>{data.email}</a> : "—"}</dd></div>
              <div><dt>Telefon</dt><dd>{data.phone ? <a href={`tel:${data.phone}`}>{data.phone}</a> : "—"}</dd></div>
              <div><dt>Son sipariş</dt><dd>{data.lastOrderAt ? dateTime(data.lastOrderAt) : "Henüz yok"}</dd></div>
              <div><dt>Son güncelleme</dt><dd>{dateTime(data.updatedAt)}</dd></div>
            </dl>
          </section>

          <section className={styles.detail} aria-label="Sipariş geçmişi">
            <div className={styles.heading}>
              <div>
                <h2>Sipariş geçmişi</h2>
                <p>{partialHistory ? `Son 50 sipariş · toplam ${data.orderCount}` : `${data.orderCount} sipariş`}</p>
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
            ) : <p className={styles.inlineEmpty}>Bu müşteriye bağlı sipariş bulunmuyor.</p>}
          </section>

          <section className={styles.detail} aria-label="Müşteri adresleri">
            <div className={styles.heading}>
              <div><h2>Adresler</h2><p>{data.addresses.length} kayıt</p></div>
              {canManage && data.status === "active" ? <Link className={styles.linkButton} href={`/customers/${encodeURIComponent(data.id)}/edit`}>Adresleri düzenle</Link> : null}
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

          <section className={styles.detail} aria-label="Dahili notlar">
            <div className={styles.heading}><div><h2>Dahili notlar</h2><p>Yalnızca mağaza ekibi görür</p></div></div>
            {canManage && data.status === "active" ? (
              <form className={styles.noteForm} onSubmit={onAddNote}>
                <label>Yeni dahili not<textarea name="text" required maxLength={2000} placeholder="Müşteri hakkında not ekleyin" /></label>
                <button className={styles.primary} disabled={busy}>{busy ? "Kaydediliyor…" : "Not ekle"}</button>
              </form>
            ) : null}
            <div className={styles.noteList}>
              {data.notes.length ? data.notes.map((note) => (
                <article key={note.id}><p>{note.text}</p><small>{dateTime(note.createdAt)}</small></article>
              )) : <p className={styles.inlineEmpty}>Henüz dahili not yok.</p>}
            </div>
          </section>
        </div>

        <aside className={styles.customerSummaryRail} aria-label="Müşteri özeti ve işlemleri">
          <section className={styles.summaryCard} aria-label="Müşteri özeti">
            <span>Müşteri durumu</span>
            <PanelStatusBadge tone={data.status === "active" ? "success" : "neutral"}>{data.status === "active" ? "Aktif" : "Arşiv"}</PanelStatusBadge>
            <dl className={styles.summaryFacts}>
              <div><dt>Sipariş</dt><dd>{data.orderCount}</dd></div>
              <div><dt>Toplam harcama</dt><dd>{money(data.totalSpentCents, data.currency)}</dd></div>
              <div><dt>Etiket</dt><dd>{data.tags.length}</dd></div>
              <div><dt>Segment</dt><dd>{data.segments.length}</dd></div>
            </dl>
          </section>

          <section className={styles.summaryCard} aria-label="İletişim izinleri">
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

          <section className={styles.summaryCard} aria-label="Müşteri sınıflandırması">
            <div className={styles.summaryHeading}><h2>Etiketler</h2><Link href="/customers/tags">Yönet</Link></div>
            {tags.length ? <div className={styles.taxonomyChecks}>{tags.map((tag) => (
              <label key={tag.id}><input type="checkbox" disabled={!canManage || busy || data.status !== "active"} checked={data.tags.some((item) => item.id === tag.id)} onChange={(event) => onAssign("tags", event.target.checked ? [...data.tags.map((item) => item.id), tag.id] : data.tags.filter((item) => item.id !== tag.id).map((item) => item.id))} /><span className={styles.color} style={{ background: tag.color }} />{tag.name}</label>
            ))}</div> : <p className={styles.inlineEmpty}>Etiket yok.</p>}
            <div className={styles.summaryHeading}><h2>Segmentler</h2><Link href="/customers/segments">Yönet</Link></div>
            {segments.length ? <div className={styles.taxonomyChecks}>{segments.map((segment) => (
              <label key={segment.id}><input type="checkbox" disabled={!canManage || busy || data.status !== "active"} checked={data.segments.some((item) => item.id === segment.id)} onChange={(event) => onAssign("segments", event.target.checked ? [...data.segments.map((item) => item.id), segment.id] : data.segments.filter((item) => item.id !== segment.id).map((item) => item.id))} />{segment.name}</label>
            ))}</div> : <p className={styles.inlineEmpty}>Segment yok.</p>}
          </section>

          <section className={styles.summaryCard} aria-label="Müşteri işlemleri">
            <div className={styles.summaryHeading}><h2>İşlemler</h2><span>Yetkiye göre</span></div>
            {canManage && data.status === "active" ? <Link className={styles.primary} href={`/customers/${encodeURIComponent(data.id)}/edit`}>Müşteri bilgilerini düzenle</Link> : null}
            {canArchive && data.status === "active" ? (
              <details className={styles.archiveConfirm}>
                <summary>Müşteriyi Arşivle</summary>
                <p>Müşteri listeden kaldırılır; sipariş ve operasyon geçmişi korunur.</p>
                <button className={styles.danger} disabled={busy} type="button" onClick={onArchive}>{busy ? "İşleniyor…" : "Arşivlemeyi onayla"}</button>
              </details>
            ) : null}
          </section>
        </aside>
      </div>
    </PanelPageShell>
  );
}

export function CustomerDetailConsole({ customerId, canManage, canArchive }: Readonly<{ customerId: string; canManage: boolean; canArchive: boolean }>) {
  const [data, setData] = useState<CustomerDetail | null>(null);
  const [workspace, setWorkspace] = useState<CustomerWorkspace | null>(null);
  const [tags, setTags] = useState<readonly CustomerTag[]>([]);
  const [segments, setSegments] = useState<readonly CustomerSegment[]>([]);
  const [state, setState] = useState<"loading" | "loaded" | "error">("loading");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (refresh = false) => {
    if (!refresh) setState("loading");
    setError("");
    try {
      const [detail, customerWorkspace, availableTags, availableSegments] = await Promise.all([
        customerApi.get(customerId),
        customerApi.workspace(customerId),
        customerApi.tags(),
        customerApi.segments(),
      ]);
      setData(detail);
      setWorkspace(customerWorkspace);
      setTags(availableTags);
      setSegments(availableSegments);
      setState("loaded");
    } catch (caught) {
      setError(message(caught));
      if (!refresh) setState("error");
    }
  }, [customerId]);

  useEffect(() => { void load(); }, [load]);

  async function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const text = String(new FormData(form).get("text") ?? "").trim();
    if (!data || !text || busy) return;
    setBusy(true);
    setError("");
    try {
      await customerApi.addNote(customerId, text);
      form.reset();
      setNotice("Not kaydedildi.");
      await load(true);
    } catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  async function assign(kind: "tags" | "segments", ids: readonly string[]) {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      if (kind === "tags") await customerApi.setTags(customerId, ids);
      else await customerApi.setSegments(customerId, ids);
      setNotice(kind === "tags" ? "Etiketler güncellendi." : "Segmentler güncellendi.");
      await load(true);
    } catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  async function archive() {
    if (!data || busy) return;
    setBusy(true);
    setError("");
    try {
      await customerApi.archive(customerId, data.version);
      setNotice("Müşteri arşivlendi.");
      await load(true);
    } catch (caught) { setError(message(caught)); }
    finally { setBusy(false); }
  }

  if (state === "loading") return <PanelPageShell><div className={styles.state} role="status">Müşteri yükleniyor…</div></PanelPageShell>;
  if (state === "error" || !data || !workspace) return (
    <PanelPageShell><div className={styles.state} role="alert"><div><p className={styles.error}>{error}</p><button className={styles.button} onClick={() => void load()}>Tekrar dene</button></div></div></PanelPageShell>
  );
  return <CustomerDetailPresentation data={data} workspace={workspace} tags={tags} segments={segments} canManage={canManage} canArchive={canArchive} busy={busy} notice={notice} error={error} onAddNote={addNote} onAssign={(kind, ids) => void assign(kind, ids)} onArchive={() => void archive()} />;
}
