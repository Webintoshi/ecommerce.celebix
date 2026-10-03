"use client";

import { useCallback, useEffect, useState } from "react";
import type { ProductReview } from "@celebix/saas-contracts";
import { Search } from "lucide-react";

import { PanelEmptyState, PanelPageHeader, PanelPageShell } from "@/components/panel/PanelPageShell";
import { CatalogAdminApiError, catalogAdminApi } from "@/lib/catalog-admin-ui/client";
import { ReviewCollectionConsole } from "./ReviewCollectionConsole";
import styles from "./catalog-admin-console.module.css";
import collectionStyles from "./review-collection.module.css";

const STATUS: Readonly<Record<string, string>> = Object.freeze({ pending: "İnceleme bekliyor", approved: "Yayında", rejected: "Reddedildi", archived: "Arşivlendi" });

export function ProductReviewConsole({ canModerate }: { canModerate: boolean }) {
  const [items, setItems] = useState<readonly ProductReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Readonly<Record<string, string>>>({});
  const [tab, setTab] = useState<"reviews" | "requests" | "settings">("reviews");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try { setItems(await catalogAdminApi.reviews()); }
    catch (caught) { setError(caught instanceof CatalogAdminApiError ? caught.message : "Yorumlar yüklenemedi."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function moderate(review: ProductReview, next: "approved" | "rejected" | "archived") {
    const reply = (document.getElementById(`reply-${review.id}`) as HTMLTextAreaElement | null)?.value.trim();
    setBusy(review.id);
    setError("");
    try {
      await catalogAdminApi.moderateReview(review.id, { expectedVersion: review.version, status: next, ...(reply ? { reply } : {}) });
      await load();
    } catch (caught) { setError(caught instanceof CatalogAdminApiError ? caught.message : "Yorum güncellenemedi."); }
    finally { setBusy(""); }
  }

  const query = search.trim().toLocaleLowerCase("tr-TR");
  const visible = items.filter((review) => (!status || review.status === status) && (!query || [review.productTitle, review.reviewerName, review.title ?? "", review.body].some((value) => value.toLocaleLowerCase("tr-TR").includes(query))));
  const published = items.filter(item => item.status === "approved");
  const average = published.length ? (published.reduce((sum, item) => sum + item.rating, 0) / published.length).toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) : "—";
  return <PanelPageShell>
    <PanelPageHeader title="Yorumlar" />
    <h1 className={styles.srOnly}>Ürün yorumları</h1>
    <section className={`${styles.surface} ${styles.workspace}`}>
      {!loading ? <div className={collectionStyles.metrics} aria-label="Yorum özeti"><div className={collectionStyles.metric}><span>Listelenen yorum</span><strong>{items.length}</strong></div><div className={collectionStyles.metric}><span>Yayındaki ortalama</span><strong>{average} <small>/ 5</small></strong></div><div className={collectionStyles.metric}><span>İnceleme bekliyor</span><strong>{items.filter(item => item.status === "pending").length}</strong></div><div className={collectionStyles.metric}><span>Doğrulanmış alışveriş</span><strong>{items.filter(item => item.verifiedPurchase).length}</strong></div></div> : null}
      <div className={collectionStyles.tabs} role="tablist" aria-label="Yorum yönetimi">{([{ key: "reviews", label: "Yorumlar" }, { key: "requests", label: "Yorum davetleri" }, { key: "settings", label: "Davet ayarları" }] as const).map(item => <button key={item.key} id={`review-tab-${item.key}`} role="tab" type="button" aria-controls="review-content" aria-selected={tab === item.key} tabIndex={tab === item.key ? 0 : -1} onClick={() => setTab(item.key)} onKeyDown={event => { const keys = ["reviews", "requests", "settings"] as const; const index = keys.indexOf(tab); const next = event.key === "ArrowRight" ? (index + 1) % 3 : event.key === "ArrowLeft" ? (index + 2) % 3 : event.key === "Home" ? 0 : event.key === "End" ? 2 : -1; if (next >= 0) { event.preventDefault(); setTab(keys[next]!); document.getElementById(`review-tab-${keys[next]}`)?.focus(); } }}>{item.label}</button>)}</div>
      <div id="review-content" role="tabpanel" aria-labelledby={`review-tab-${tab}`}>
      {tab !== "reviews" ? <ReviewCollectionConsole canManage={canModerate} view={tab} /> : <>
      {error ? <p className={styles.error} role="alert">{error} <button className={styles.button} type="button" disabled={loading} onClick={() => void load()}>Tekrar dene</button></p> : null}
      {!loading && items.length ? <div className={styles.resourceToolbar}>
        <label className={styles.resourceSearch}><Search aria-hidden="true" /><span className={styles.srOnly}>Ürün, müşteri veya yorum ara</span><input type="search" value={search} onChange={(event) => setSearch(event.currentTarget.value)} placeholder="Ürün, müşteri veya yorum ara" /></label>
        <label className={styles.filterField}><span className={styles.srOnly}>Yayın durumu</span><select value={status} onChange={(event) => setStatus(event.currentTarget.value)}><option value="">Tüm durumlar</option>{Object.entries(STATUS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <span className={styles.resultCount} role="status">{visible.length} / {items.length} yorum</span>
        {search || status ? <button className={styles.button} type="button" onClick={() => { setSearch(""); setStatus(""); }}>Temizle</button> : null}
      </div> : null}
      {loading ? <div className={styles.state} role="status">Yorumlar yükleniyor…</div> : items.length === 0 ? error ? null : <PanelEmptyState title="Henüz ürün yorumu yok" description="Müşteri yorumları burada görünecek." /> : !visible.length ? <PanelEmptyState title="Eşleşen yorum yok" description="Aramanızı veya durum seçiminizi değiştirin." /> : <div className={styles.list}>{visible.map((review) => <article className={`${styles.item} ${styles.review}`} key={review.id} aria-busy={busy === review.id}>
        <div className={styles.reviewHeading}><h2>{review.productTitle}</h2><span className={styles.status}>{STATUS[review.status] ?? review.status}</span></div>
        <div className={styles.reviewMeta}><span aria-label={`${review.rating} / 5 puan`}>{"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}</span><span>{review.reviewerName}</span>{review.verifiedPurchase ? <span className={collectionStyles.verified}>✓ Doğrulanmış alışveriş</span> : null}</div>
        <p>{review.title ? <strong>{review.title}: </strong> : null}{review.body}</p>
        {review.merchantReply ? <small>Mağaza yanıtı: {review.merchantReply}</small> : null}
        {canModerate ? <details className={styles.reviewEditor}><summary>Yanıt ve yayın işlemleri</summary><label htmlFor={`reply-${review.id}`}>Mağaza yanıtı <small>İsteğe bağlı</small></label><textarea id={`reply-${review.id}`} value={replyDrafts[review.id] ?? review.merchantReply ?? ""} onChange={(event) => { const reply = event.currentTarget.value; setReplyDrafts((drafts) => ({ ...drafts, [review.id]: reply })); }} maxLength={2000} /><div className={styles.actions}>
          <button className={styles.button} type="button" disabled={busy === review.id} onClick={() => void moderate(review, "approved")}>Yayınla</button>
          <button className={styles.button} type="button" disabled={busy === review.id} onClick={() => void moderate(review, "rejected")}>Reddet</button>
          <button className={styles.danger} type="button" disabled={busy === review.id} onClick={() => void moderate(review, "archived")}>Arşivle</button>
        </div></details> : null}
      </article>)}</div>}
      </>}
      </div>
    </section>
  </PanelPageShell>;
}
