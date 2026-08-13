"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import type { AbandonedCartDetail, AbandonedCartListItem, AbandonedCartSort, AbandonedCartStatus, AbandonedCartSummary } from "@celebix/saas-contracts";
import { Archive, ArrowDownUp, ArrowRight, CheckCircle2, Clock3, Filter, Mail, Package2, Phone, RefreshCcw, Search, ShoppingCart, UserRound, Wallet } from "lucide-react";

import { PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { AbandonedCartApiError, abandonedCartApi } from "@/lib/abandoned-cart-ui/client";
import styles from "./abandoned-cart-console.module.css";

type State = "loading" | "loaded" | "error";
const STATUS: Readonly<Record<AbandonedCartStatus, string>> = Object.freeze({ active: "Aktif", abandoned: "Terk edildi", recovered: "Kurtarıldı", archived: "Arşivlendi" });

function money(cents: number, currency: string) { return new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(cents / 100); }
function date(value: string) { return new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
function tone(status: AbandonedCartStatus): "neutral" | "success" | "warning" | "danger" { return status === "recovered" ? "success" : status === "abandoned" ? "danger" : status === "active" ? "warning" : "neutral"; }
function customer(cart: AbandonedCartListItem) { return cart.customerName ?? cart.customerEmail ?? cart.customerPhone ?? "Anonim sepet"; }
function customerDetail(cart: AbandonedCartListItem) {
  if (cart.customerName) return cart.customerEmail ?? cart.customerPhone ?? "İletişim bilgisi yok";
  if (cart.customerEmail) return cart.customerPhone ?? "E-posta ile tanımlı";
  if (cart.customerPhone) return "Telefon ile tanımlı";
  return "İletişim bilgisi yok";
}
function product(cart: AbandonedCartListItem) { return cart.firstProductName ?? "Ürün bilgisi yok"; }
function CustomerIdentity({ cart }: { cart: AbandonedCartListItem }) {
  const content = <><strong>{customer(cart)}</strong>{cart.customerId ? <span className={styles.accountBadge}>Kayıtlı müşteri</span> : null}<small>{customerDetail(cart)}</small></>;
  return cart.customerId ? <Link className={styles.customerLink} href={`/customers/${cart.customerId}`}>{content}</Link> : <div className={styles.customerIdentity}>{content}</div>;
}
function ProductIdentity({ cart }: { cart: AbandonedCartListItem }) {
  return <div className={styles.productIdentity}><strong>{product(cart)}</strong><small>{cart.itemCount > 1 ? `+ ${cart.itemCount - 1} ürün` : `${cart.itemCount} ürün`}</small></div>;
}
function message(error: unknown) { return error instanceof AbandonedCartApiError ? error.message : "Sepetler yüklenemedi. Lütfen yeniden deneyin."; }

function Metric({ label, value, detail, icon: Icon, emphasis = "neutral" }: {
  label: string;
  value: string;
  detail: string;
  icon: typeof ShoppingCart;
  emphasis?: "neutral" | "lost" | "recovered";
}) {
  return (
    <article className={`${styles.metric} ${styles[`metric-${emphasis}`]}`}>
      <div className={styles.metricLabel}><Icon aria-hidden="true" /><span>{label}</span></div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function CartCard({ cart }: { cart: AbandonedCartListItem }) {
  return (
    <article className={styles.cartCard}>
      <div className={styles.cardHeading}>
        <CustomerIdentity cart={cart} />
        <PanelStatusBadge tone={tone(cart.status)}>{STATUS[cart.status]}</PanelStatusBadge>
      </div>
      <dl>
        <div><dt>Toplam</dt><dd className={styles.cardTotal}>{money(cart.totalCents, cart.currency)}</dd></div>
        <div><dt>Ürün</dt><dd><ProductIdentity cart={cart} /></dd></div>
        <div><dt>Son etkinlik</dt><dd><time dateTime={cart.lastActivityAt}>{date(cart.lastActivityAt)}</time></dd></div>
      </dl>
      <Link className={styles.detailLink} href={`/orders/abandoned-carts/${cart.id}`}>İncele<ArrowRight aria-hidden="true" /></Link>
    </article>
  );
}

export function AbandonedCartListPresentation(props: Readonly<{ state: State; items: readonly AbandonedCartListItem[]; summary?: AbandonedCartSummary; error: string; search: string; status: AbandonedCartStatus | "all"; sort: AbandonedCartSort; nextCursor?: string; loadingMore: boolean; onRetry(): void; onSearch(value: string): void; onSubmit(): void; onStatus(value: AbandonedCartStatus | "all"): void; onSort(value: AbandonedCartSort): void; onLoadMore(): void }>) {
  const hasFilters = props.search.trim() !== "" || props.status !== "all";
  return (
    <PanelPageShell>
      <PanelPageHeader title="Terk Edilen Sepetler" description="Kayıp geliri görün, sepetleri önceliklendirin ve kurtarma sürecini yönetin." />

      {props.summary ? (
        <section className={styles.metrics} aria-label="Sepet özeti">
          <Metric label="Terk edilen" value={props.summary.abandoned.toLocaleString("tr-TR")} detail="Takip bekleyen sepet" icon={ShoppingCart} />
          <Metric label="Kurtarılan" value={props.summary.recovered.toLocaleString("tr-TR")} detail="Kalıcı kurtarma kaydı" icon={CheckCircle2} emphasis="recovered" />
          <Metric label="Kayıp değer" value={money(props.summary.lostValueCents, props.summary.currency)} detail="Terk edilmiş sepet toplamı" icon={Wallet} emphasis="lost" />
          <Metric label="Kurtarılan değer" value={money(props.summary.recoveredValueCents, props.summary.currency)} detail={`Son hesaplama ${date(props.summary.asOf)}`} icon={RefreshCcw} emphasis="recovered" />
        </section>
      ) : null}

      <section className={styles.surface} aria-label="Terk edilen sepet çalışma alanı">
        <form className={styles.toolbar} role="search" onSubmit={(event) => { event.preventDefault(); props.onSubmit(); }}>
          <label className={styles.search}>
            <span className="sr-only">Sepet ara</span>
            <Search aria-hidden="true" />
            <input value={props.search} onChange={(event) => props.onSearch(event.target.value)} placeholder="Müşteri, e-posta, telefon veya ürün" maxLength={200} />
            <button type="submit">Ara</button>
          </label>
          <label className={styles.selectControl}>
            <span className="sr-only">Sepet durumu</span><Filter aria-hidden="true" />
            <select value={props.status} onChange={(event) => props.onStatus(event.target.value as AbandonedCartStatus | "all")}>
              <option value="all">Tüm durumlar</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className={styles.selectControl}>
            <span className="sr-only">Sıralama</span><ArrowDownUp aria-hidden="true" />
            <select value={props.sort} onChange={(event) => props.onSort(event.target.value as AbandonedCartSort)}>
              <option value="newest">En yeni</option><option value="oldest">En eski</option><option value="highest">Tutar: yüksekten düşüğe</option><option value="lowest">Tutar: düşükten yükseğe</option>
            </select>
          </label>
        </form>

        {props.state === "loading" ? (
          <div className={styles.loading} role="status"><RefreshCcw aria-hidden="true" /><div><strong>Sepetler yükleniyor</strong><span>Gelir kurtarma kayıtları hazırlanıyor.</span></div></div>
        ) : props.state === "error" ? (
          <div className={styles.error} role="alert"><div><h2>Sepetler yüklenemedi</h2><p>{props.error}</p></div><button type="button" onClick={props.onRetry}>Tekrar dene</button></div>
        ) : props.items.length === 0 ? (
          <div className={styles.listEmpty}><span><ShoppingCart aria-hidden="true" /></span><strong>{hasFilters ? "Filtrelerle eşleşen sepet bulunamadı." : "Henüz terk edilmiş sepet yok"}</strong><p>{hasFilters ? "Arama veya durum filtresini değiştirerek yeniden deneyin." : "Yeni bir alışveriş yarım kaldığında kayıt burada görünecek."}</p></div>
        ) : (
          <>
            <div className={styles.desktopTable}>
              <table aria-label="Terk edilen sepet listesi">
                <thead><tr><th>Müşteri</th><th>Durum</th><th>Son etkinlik</th><th>Ürün</th><th className={styles.numericHeading}>Toplam</th><th className={styles.actionHeading}>İşlem</th></tr></thead>
                <tbody>{props.items.map((cart) => (
                  <tr key={cart.id}>
                    <td className={styles.customerCell}><CustomerIdentity cart={cart} /></td>
                    <td><PanelStatusBadge tone={tone(cart.status)}>{STATUS[cart.status]}</PanelStatusBadge></td>
                    <td className={styles.activityCell}><time dateTime={cart.lastActivityAt}>{date(cart.lastActivityAt)}</time></td>
                    <td><ProductIdentity cart={cart} /></td>
                    <td className={styles.totalCell}><strong>{money(cart.totalCents, cart.currency)}</strong></td>
                    <td className={styles.actionCell}><Link className={styles.rowAction} href={`/orders/abandoned-carts/${cart.id}`}>İncele<ArrowRight aria-hidden="true" /></Link></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
            <div className={styles.mobileCards}>{props.items.map((cart) => <CartCard key={cart.id} cart={cart} />)}</div>
            {props.nextCursor ? <button className={styles.loadMore} type="button" disabled={props.loadingMore} onClick={props.onLoadMore}>{props.loadingMore ? "Yükleniyor…" : "Daha fazla sepet yükle"}</button> : null}
          </>
        )}
      </section>
    </PanelPageShell>
  );
}

export function AbandonedCartConsole() {
  const [state, setState] = useState<State>("loading"); const [items, setItems] = useState<readonly AbandonedCartListItem[]>([]); const [summary, setSummary] = useState<AbandonedCartSummary>(); const [error, setError] = useState(""); const [searchInput, setSearchInput] = useState(""); const [search, setSearch] = useState(""); const [status, setStatus] = useState<AbandonedCartStatus | "all">("all"); const [sort, setSort] = useState<AbandonedCartSort>("newest"); const [nextCursor, setNextCursor] = useState<string>(); const [loadingMore, setLoadingMore] = useState(false); const sequence = useRef(0);
  const load = useCallback(async (cursor?: string) => { const current = ++sequence.current; cursor ? setLoadingMore(true) : setState("loading"); setError(""); try { const [list, latestSummary] = await Promise.all([abandonedCartApi.list({ pageSize: 20, ...(cursor ? { cursor } : {}), ...(status === "all" ? {} : { status }), ...(search ? { search } : {}), sort }), abandonedCartApi.getSummary()]); if (current !== sequence.current) return; setItems((existing) => cursor ? Object.freeze([...existing, ...list.items]) : list.items); setNextCursor(list.nextCursor); setSummary(latestSummary); setState("loaded"); } catch (failure) { if (current === sequence.current) { if (!cursor) { setItems([]); setSummary(undefined); setNextCursor(undefined); } setError(message(failure)); setState("error"); } } finally { if (current === sequence.current) setLoadingMore(false); } }, [search, sort, status]);
  useEffect(() => { void load(); return () => { sequence.current += 1; }; }, [load]);
  return <AbandonedCartListPresentation state={state} items={items} summary={summary} error={error} search={searchInput} status={status} sort={sort} nextCursor={nextCursor} loadingMore={loadingMore} onRetry={() => void load()} onSearch={setSearchInput} onSubmit={() => { const value = searchInput.trim(); if (value.length <= 200) setSearch(value); }} onStatus={setStatus} onSort={setSort} onLoadMore={() => { if (nextCursor) void load(nextCursor); }} />;
}

export function AbandonedCartDetailPresentation(props: Readonly<{ state: State; detail?: AbandonedCartDetail; error: string; notice: string; busy: boolean; canManage: boolean; onRetry(): void; onRecovered(): void; onArchive(): void }>) {
  if (props.state === "loading") return <div className={styles.loading} role="status">Sepet ayrıntısı yükleniyor…</div>;
  if (props.state === "error" || !props.detail) return <section className={styles.detailState}><div className={styles.error} role="alert"><div><h1>Sepet ayrıntısı açılamadı</h1><p>{props.error || "Sepet bulunamadı."}</p></div><button type="button" onClick={props.onRetry}>Tekrar dene</button></div></section>;
  const cart = props.detail;
  return <PanelPageShell><Link className={styles.back} href="/orders/abandoned-carts">Terk Edilen Sepetlere dön</Link><PanelPageHeader title="Sepet ayrıntısı" description={`${customer(cart)} · sürüm ${cart.version}`} actions={props.canManage && cart.status !== "archived" ? <div className={styles.actions}>{cart.status === "abandoned" ? <button type="button" disabled={props.busy} onClick={props.onRecovered}><CheckCircle2 aria-hidden="true" />Kurtarıldı olarak işaretle</button> : null}<button type="button" disabled={props.busy} onClick={props.onArchive}><Archive aria-hidden="true" />Arşivle</button></div> : null} />{props.error ? <div className={styles.inlineError} role="alert">{props.error}</div> : null}{props.notice ? <div className={styles.notice} role="status">{props.notice}</div> : null}
    <section className={styles.detailHero} aria-label="Sepet özeti"><div><ShoppingCart /><span>Durum</span><PanelStatusBadge tone={tone(cart.status)}>{STATUS[cart.status]}</PanelStatusBadge></div><div><Wallet /><span>Toplam</span><strong>{money(cart.totalCents, cart.currency)}</strong></div><div><Package2 /><span>Ürün</span><strong>{cart.itemCount}</strong></div><div><Clock3 /><span>Son etkinlik</span><strong>{date(cart.lastActivityAt)}</strong></div></section>
    <div className={styles.detailGrid}><section className={styles.panel}><header><div><h2>Sepet ürünleri</h2><p>Kalıcı katalog anlık görüntüsü</p></div></header><div className={styles.items}>{cart.items.map((item) => <article key={item.id}>{item.imageUrl ? <img src={item.imageUrl} alt="" /> : <i><Package2 /></i>}<div><strong>{item.productName}</strong><span>{item.variantName ?? "Standart"}{item.sku ? ` · ${item.sku}` : ""}</span></div><span>{item.quantity} × {money(item.unitPriceCents, cart.currency)}</span><b>{money(item.lineTotalCents, cart.currency)}</b></article>)}</div><dl className={styles.totals}><div><dt>Ara toplam</dt><dd>{money(cart.subtotalCents, cart.currency)}</dd></div><div><dt>İndirim</dt><dd>− {money(cart.discountCents, cart.currency)}</dd></div><div><dt>Toplam</dt><dd>{money(cart.totalCents, cart.currency)}</dd></div></dl></section>
      <section className={styles.panel}><header><div><h2>Müşteri ve zaman</h2><p>Sepette bırakılan gerçek iletişim bilgileri</p></div></header><dl className={styles.customer}><div><dt><UserRound />Müşteri</dt><dd>{cart.customerName ?? "Anonim sepet"}</dd></div><div><dt><Mail />E-posta</dt><dd>{cart.customerEmail ?? "Belirtilmedi"}</dd></div><div><dt><Phone />Telefon</dt><dd>{cart.customerPhone ?? "Belirtilmedi"}</dd></div><div><dt><Clock3 />Sepet başlangıcı</dt><dd>{date(cart.checkoutStartedAt)}</dd></div><div><dt><RefreshCcw />Son etkinlik</dt><dd>{date(cart.lastActivityAt)}</dd></div></dl></section></div>
  </PanelPageShell>;
}

export function AbandonedCartDetailConsole({ cartId, canManage }: { cartId: string; canManage: boolean }) {
  const [state, setState] = useState<State>("loading"); const [detail, setDetail] = useState<AbandonedCartDetail>(); const [error, setError] = useState(""); const [notice, setNotice] = useState(""); const [busy, setBusy] = useState(false);
  const load = useCallback(async () => { setError(""); try { setDetail(await abandonedCartApi.get(cartId)); setState("loaded"); } catch (failure) { setError(message(failure)); setState("error"); } }, [cartId]); useEffect(() => { void load(); }, [load]);
  async function mutate(kind: "recovered" | "archive") { if (!detail || !canManage || busy) return; setBusy(true); setError(""); setNotice(""); try { if (kind === "recovered") await abandonedCartApi.markRecovered(cartId, detail.version); else await abandonedCartApi.archive(cartId, detail.version); await load(); setNotice(kind === "recovered" ? "Sepet kurtarıldı olarak işaretlendi." : "Sepet arşivlendi."); } catch (failure) { setError(message(failure)); if (failure instanceof AbandonedCartApiError && failure.code === "version_conflict") await load(); } finally { setBusy(false); } }
  return <AbandonedCartDetailPresentation state={state} detail={detail} error={error} notice={notice} busy={busy} canManage={canManage} onRetry={() => { setState("loading"); void load(); }} onRecovered={() => void mutate("recovered")} onArchive={() => void mutate("archive")} />;
}
