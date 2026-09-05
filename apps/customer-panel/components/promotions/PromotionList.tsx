"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PromotionAdminListItem, PromotionOverviewResult } from "@celebix/saas-contracts";
import { PanelActionButton, PanelEmptyState, PanelLoadingState, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { PromotionListLoader, promotionApi, promotionErrorMessage, type ListQuery } from "@/lib/promotion-ui/client";
import { formatPromotionMinor, zonedCivilDayStartToIso } from "@/lib/promotion-ui/model";
import styles from "./promotion-studio.module.css";

const STATUS: Readonly<Record<string, string>> = Object.freeze({ draft: "Taslak", scheduled: "Planlandı", active: "Aktif", paused: "Duraklatıldı", archived: "Arşivlendi", ended: "Sona erdi", usage_exhausted: "Kullanım limiti doldu", budget_exhausted: "Bütçesi doldu" });
const BENEFIT: Readonly<Record<string, string>> = Object.freeze({ percentage: "Yüzde indirimi", fixed_amount: "Sabit tutar", free_shipping: "Ücretsiz kargo", buy_x_get_y: "X al Y kazan", quantity_tiers: "Adet indirimi", bundle_price: "Paket fiyatı", gift: "Hediye ürün" });
const AUDIENCE: Readonly<Record<string, string>> = Object.freeze({ everyone: "Herkes", first_paid_order: "İlk sipariş", customer_segments: "Müşteri grubu", customer_tags: "Müşteri etiketi", masked_customers: "Seçili müşteriler", abandoned_cart: "Terk edilen sepet" });
function dateStart(value: string, timezone: string) { return value ? zonedCivilDayStartToIso(value, timezone) : undefined; }
function dateEnd(value: string, timezone: string) { if (!value) return undefined; const [year, month, day] = value.split("-").map(Number); const next = new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10); return zonedCivilDayStartToIso(next, timezone); }
function amounts(item: PromotionAdminListItem, field: "discountMinor" | "revenueMinor") { return item.financials.length ? item.financials.map((row) => formatPromotionMinor(row[field], row.currency)).join(" · ") : "Henüz yok"; }
function overviewMoney(value: PromotionOverviewResult | null, field: "discountMinor" | "revenueMinor" | "recoveredRevenueMinor") { return value?.currencies.length ? value.currencies.map((row) => formatPromotionMinor(row[field], row.currency)).join(" · ") : "0,00 TRY"; }
function dates(item: PromotionAdminListItem, timezone: string) { const formatter = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: timezone }); return `${item.startsAt ? formatter.format(new Date(item.startsAt)) : "Yayınlandığında"} – ${item.endsAt ? formatter.format(new Date(item.endsAt)) : "Süresiz"}`; }

export function PromotionList({ timezone, canManage, canPublish, canArchive }: Readonly<{ timezone: string; canManage: boolean; canPublish: boolean; canArchive: boolean }>) {
  const [range, setRange] = useState<7 | 30 | 90>(30);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [trigger, setTrigger] = useState("");
  const [benefit, setBenefit] = useState("");
  const [audience, setAudience] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [phase, setPhase] = useState<"loading" | "loaded" | "empty" | "error">("loading");
  const [items, setItems] = useState<readonly PromotionAdminListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [overview, setOverview] = useState<PromotionOverviewResult | null>(null);
  const [overviewPhase, setOverviewPhase] = useState<"loading" | "loaded" | "error">("loading");
  const [appliedQuery, setAppliedQuery] = useState<ListQuery>({});
  const appliedQueryRef = useRef<ListQuery>({});
  const loader = useMemo(() => new PromotionListLoader(promotionApi), []);
  const query = (): ListQuery => ({
    ...(search.trim() ? { search: search.trim() } : {}), ...(statusFilter ? { effectiveStatuses: [statusFilter] } : {}),
    ...(trigger ? { triggerKinds: [trigger] } : {}), ...(benefit ? { benefitKinds: [benefit] } : {}), ...(audience ? { audienceModes: [audience] } : {}),
    ...(from && to ? { scheduleFrom: dateStart(from, timezone), scheduleTo: dateEnd(to, timezone) } : {}),
  });
  const load = (selectedQuery: ListQuery, cursor?: string, preserveMessage = false) => {
    if (!cursor) setPhase("loading"); if (!preserveMessage) setMessage("");
    void loader.load({ ...selectedQuery, ...(cursor ? { cursor } : {}) }).then((page) => {
      if (!page) return;
      setItems((current) => cursor ? [...current, ...page.items] : page.items); setNextCursor(page.nextCursor); setPhase(cursor || page.items.length ? "loaded" : "empty");
    }).catch(() => setPhase("error"));
  };
  useEffect(() => { load({}); return () => loader.dispose(); }, []);
  useEffect(() => {
    const controller = new AbortController(); setOverviewPhase("loading");
    void promotionApi.overview(range, controller.signal).then((value) => { setOverview(value); setOverviewPhase("loaded"); }).catch(() => { if (!controller.signal.aborted) setOverviewPhase("error"); });
    return () => controller.abort();
  }, [range]);

  const action = (item: PromotionAdminListItem, selected: "pause" | "resume" | "archive" | "duplicate") => {
    if (busy) return;
    if (selected === "archive" && !window.confirm("Kampanya arşivlensin mi? Geçmiş siparişler korunur.")) return;
    const replacementCode = selected === "duplicate" && item.triggerKind === "code" ? window.prompt("Kopya kampanya için kullanılmamış yeni kupon kodunu yazın.", "") : "";
    if (replacementCode === null || (selected === "duplicate" && item.triggerKind === "code" && replacementCode.trim() === "")) { if (replacementCode !== null) setMessage("Kodlu kampanya kopyası için yeni bir kupon kodu gerekir."); return; }
    setBusy(item.id); setMessage("");
    const operation = selected === "duplicate" ? promotionApi.duplicate(item.id, item.version, `${item.name} — Kopya`, replacementCode ? [replacementCode] : []) : promotionApi.lifecycle(item.id, item.version, selected, item.startsAt && item.startsAt > new Date().toISOString() ? "scheduled" : "active");
    void operation.then((result) => {
      if (result.kind === "saved") {
        if (selected === "duplicate") { window.location.assign(`/discounts/${result.promotion.id}/edit`); return; }
        setMessage(selected === "archive" ? "Kampanya arşivlendi." : selected === "pause" ? "Kampanya duraklatıldı." : "Kampanya yeniden etkinleştirildi."); load(appliedQueryRef.current, undefined, true);
      } else if (result.kind === "version_conflict") { setMessage("Kampanya başka bir kullanıcı tarafından güncellendi. Liste yenilendi."); load(appliedQueryRef.current, undefined, true); }
      else if (result.kind === "publish_blocked") setMessage("Kampanya yeniden etkinleştirilemedi; ayarlarını kontrol edin.");
      else setMessage(result.message);
    }).catch((error: unknown) => setMessage(promotionErrorMessage(error instanceof Error ? error.message : "promotion_unavailable"))).finally(() => setBusy(null));
  };

  const rowActions = (item: PromotionAdminListItem) => <div className={styles.rowActions}><Link href={`/discounts/${item.id}`}>Görüntüle</Link><Link href={`/discounts/${item.id}/analytics`}>Analiz</Link><Link href={`/discounts/${item.id}/codes`}>Kuponlar</Link>{canManage && item.status !== "archived" ? <Link href={`/discounts/${item.id}/edit`}>Düzenle</Link> : null}{canManage ? <button type="button" disabled={busy === item.id} onClick={() => action(item, "duplicate")}>Çoğalt</button> : null}{canPublish && (item.status === "active" || item.status === "scheduled") ? <button type="button" disabled={busy === item.id} onClick={() => action(item, "pause")}>Duraklat</button> : null}{canPublish && item.status === "paused" ? <button type="button" disabled={busy === item.id} onClick={() => action(item, "resume")}>Devam ettir</button> : null}{canArchive && item.status !== "archived" ? <button type="button" disabled={busy === item.id} onClick={() => action(item, "archive")}>Arşivle</button> : null}</div>;

  return <section className={styles.list}>
    <header className={styles.pageHeader}><div><h1>İndirimler ve Kampanyalar</h1><p>Satışlarınızı artıracak kampanyaları kolayca oluşturun, takip edin ve yönetin.</p></div>{canManage ? <PanelActionButton primary href="/discounts/new">Yeni kampanya</PanelActionButton> : null}</header>
    <div className={styles.kpiHeader}><h2>Kampanya özeti</h2><div role="group" aria-label="Özet dönemi">{([7, 30, 90] as const).map((day) => <button key={day} type="button" value={day} aria-pressed={range === day} onClick={() => setRange(day)}>Son {day} gün</button>)}</div></div>
    <div className={styles.kpis} aria-label="Kampanya özeti">
      <article><span>Aktif kampanya</span><strong>{overviewPhase === "loaded" ? overview?.activePromotions ?? 0 : overviewPhase === "error" ? "—" : "…"}</strong><small>Şu anda müşterilere açık</small></article>
      <article><span>Kampanyalı sipariş</span><strong>{overviewPhase === "loaded" ? overview?.currencies.reduce((sum, row) => sum + row.affectedOrders, 0) ?? 0 : overviewPhase === "error" ? "—" : "…"}</strong><small>Son {range} günde ödemesi tamamlanan</small></article>
      <article><span>Sağlanan toplam indirim</span><strong>{overviewPhase === "loaded" ? overviewMoney(overview, "discountMinor") : overviewPhase === "error" ? "—" : "…"}</strong><small>Para birimine göre ayrı</small></article>
      <article><span>Kampanyalardan gelen ciro</span><strong>{overviewPhase === "loaded" ? overviewMoney(overview, "revenueMinor") : overviewPhase === "error" ? "—" : "…"}</strong><small>Ödemesi tamamlanan siparişler</small></article>
      <article><span>Geri kazanılan sepet cirosu</span><strong>{overviewPhase === "loaded" ? overviewMoney(overview, "recoveredRevenueMinor") : overviewPhase === "error" ? "—" : "…"}</strong><small>Dayanıklı sepet kaynağına bağlı</small></article>
    </div>
    {overviewPhase === "error" ? <p role="alert" className={styles.error}>Kampanya özeti yüklenemedi. Dönemi değiştirerek tekrar deneyin.</p> : null}
    <form className={styles.filters} onSubmit={(event) => { event.preventDefault(); if ((from && !to) || (!from && to) || (from && to && from > to)) { setMessage("Tarih filtresinde başlangıç ve bitişi doğru sırayla seçin."); return; } let selected: ListQuery; try { selected = query(); } catch { setMessage("Tarih filtresi mağaza saat diliminde geçerli değil."); return; } appliedQueryRef.current = selected; setAppliedQuery(selected); setItems([]); setNextCursor(null); load(selected); }}><label className={styles.search}>Kampanya ara<input type="search" value={search} placeholder="Kampanya adı veya kupon kodu ara" onChange={(event) => setSearch(event.target.value)} /></label><label>Durum<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="">Tümü</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Uygulama<select value={trigger} onChange={(event) => setTrigger(event.target.value)}><option value="">Tümü</option><option value="automatic">Otomatik</option><option value="code">Kodlu</option></select></label><label>Kampanya türü<select value={benefit} onChange={(event) => setBenefit(event.target.value)}><option value="">Tümü</option>{Object.entries(BENEFIT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Hedef kitle<select value={audience} onChange={(event) => setAudience(event.target.value)}><option value="">Tümü</option>{Object.entries(AUDIENCE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Başlangıç<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>Bitiş<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className={styles.secondaryButton} type="submit">Filtrele</button></form>
    {message ? <p role="status" className={styles.toast}>{message}</p> : null}
    {phase === "loading" ? <PanelLoadingState label="Kampanyalar yükleniyor…" /> : null}
    {phase === "error" ? <div role="alert" className={styles.error}>Kampanyalar yüklenemedi. <button type="button" onClick={() => load(appliedQuery)}>Yeniden dene</button></div> : null}
    {phase === "empty" ? <PanelEmptyState title="Henüz kampanya yok" description="İlk kampanyanızı 2 dakikada oluşturun." action={canManage ? <PanelActionButton primary href="/discounts/new">İlk kampanyayı oluştur</PanelActionButton> : undefined} /> : null}
    {phase === "loaded" ? <><div className={styles.desktopTable}><table aria-label="Kampanyalar"><thead><tr><th>Kampanya</th><th>Nasıl çalışır?</th><th>Durum</th><th>Kullanım</th><th>Sağlanan indirim</th><th>Kampanyalı ciro</th><th>Başlangıç / bitiş</th><th>Aksiyonlar</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><Link href={`/discounts/${item.id}`}>{item.name}</Link><small>{item.triggerKind === "code" ? `${item.activeCodeCount} aktif kod` : "Otomatik"}</small></td><td>{item.humanMechanic}</td><td><PanelStatusBadge tone={item.effectiveStatus === "active" ? "success" : item.effectiveStatus === "archived" ? "neutral" : "warning"}>{STATUS[item.effectiveStatus] ?? item.effectiveStatus}</PanelStatusBadge></td><td>{item.usage.used}</td><td>{amounts(item, "discountMinor")}</td><td>{amounts(item, "revenueMinor")}</td><td>{dates(item, timezone)}</td><td>{rowActions(item)}</td></tr>)}</tbody></table></div><div className={styles.mobileCards}>{items.map((item) => <article key={item.id}><div><Link href={`/discounts/${item.id}`}>{item.name}</Link><PanelStatusBadge tone={item.effectiveStatus === "active" ? "success" : "warning"}>{STATUS[item.effectiveStatus] ?? item.effectiveStatus}</PanelStatusBadge></div><p>{item.humanMechanic}</p><dl><div><dt>Kullanım</dt><dd>{item.usage.used}</dd></div><div><dt>İndirim</dt><dd>{amounts(item, "discountMinor")}</dd></div><div><dt>Ciro</dt><dd>{amounts(item, "revenueMinor")}</dd></div><div><dt>Tarih</dt><dd>{dates(item, timezone)}</dd></div></dl>{rowActions(item)}</article>)}</div>{nextCursor ? <button type="button" className={styles.secondaryButton} onClick={() => load(appliedQuery, nextCursor)}>Daha fazla göster</button> : null}</> : null}
  </section>;
}
