"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, BarChart3, ChevronDown, Copy, Eye, Gift, Layers, MoreHorizontal, Package, Pause, Pencil, Percent, Play, Plus, Search, SlidersHorizontal, Tag, Ticket, Truck, Archive, Trash2 } from "lucide-react";
import type { PromotionAdminEffectiveStatus, PromotionAdminListItem, PromotionOverviewResult } from "@celebix/saas-contracts";
import { PanelActionButton, PanelEmptyState, PanelPageHeader, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { DesignSettingsModal } from "@/components/settings/design/DesignSettingsDrawer";
import { PromotionListLoader, promotionApi as defaultPromotionApi, promotionErrorMessage, type ListQuery, type PromotionApiClient } from "@/lib/promotion-ui/client";
import { formatPromotionMinor, zonedCivilDayStartToIso } from "@/lib/promotion-ui/model";
import { useLuckyWheelPromotionSources, LuckyWheelPromotionSource } from "./LuckyWheelPromotionSource";
import { PromotionDeleteDialog } from "./PromotionDeleteDialog";
import { PromotionIllustration } from "./PromotionIllustration";
import emptyStyles from "./promotion-list-empty.module.css";
import styles from "./promotion-list.module.css";

const STATUS: Readonly<Record<string, string>> = Object.freeze({ draft: "Taslak", scheduled: "Planlandı", active: "Aktif", paused: "Duraklatıldı", archived: "Arşivlendi", ended: "Sona erdi", usage_exhausted: "Kullanım limiti doldu", budget_exhausted: "Bütçesi doldu" });
const STATUS_TONE: Readonly<Record<PromotionAdminEffectiveStatus, "neutral" | "success" | "danger">> = Object.freeze({ draft: "neutral", scheduled: "neutral", paused: "neutral", ended: "neutral", archived: "neutral", active: "success", usage_exhausted: "danger", budget_exhausted: "danger" });
const BENEFIT: Readonly<Record<string, string>> = Object.freeze({ percentage: "Yüzde indirimi", fixed_amount: "Sabit tutar", free_shipping: "Ücretsiz kargo", buy_x_get_y: "X al Y kazan", quantity_tiers: "Adet indirimi", bundle_price: "Paket fiyatı", gift: "Hediye ürün" });
const AUDIENCE: Readonly<Record<string, string>> = Object.freeze({ everyone: "Herkes", first_paid_order: "İlk sipariş", customer_segments: "Müşteri grubu", customer_tags: "Müşteri etiketi", masked_customers: "Seçili müşteriler", abandoned_cart: "Terk edilen sepet" });
function statusTone(status: PromotionAdminEffectiveStatus) { return STATUS_TONE[status]; }
function dateStart(value: string, timezone: string) { return value ? zonedCivilDayStartToIso(value, timezone) : undefined; }
function dateEnd(value: string, timezone: string) { if (!value) return undefined; const [year, month, day] = value.split("-").map(Number); const next = new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10); return zonedCivilDayStartToIso(next, timezone); }
function amounts(item: PromotionAdminListItem, field: "discountMinor" | "revenueMinor") { return item.financials.length ? item.financials.map((row) => formatPromotionMinor(row[field], row.currency)).join(" · ") : "Henüz yok"; }
function overviewMoney(value: PromotionOverviewResult | null, field: "discountMinor" | "revenueMinor" | "recoveredRevenueMinor") {
  const rows = value?.currencies.length ? value.currencies : [{ currency: "TRY", discountMinor: 0, revenueMinor: 0, recoveredRevenueMinor: 0 }];
  return rows.map(row => { const formatted = formatPromotionMinor(row[field], row.currency); return <span key={row.currency} className={styles.moneyLine}><span>{formatted.slice(0, -row.currency.length).trimEnd()}</span>{" "}<span className={styles.currency}>{row.currency}</span></span>; });
}
function dates(item: PromotionAdminListItem, timezone: string) { const formatter = new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: timezone }); return `${item.startsAt ? formatter.format(new Date(item.startsAt)) : "Yayınlandığında"} – ${item.endsAt ? formatter.format(new Date(item.endsAt)) : "Süresiz"}`; }

type RowAction = "pause" | "resume" | "archive" | "duplicate" | "delete";
type FilterSnapshot = Readonly<{ status: string; trigger: string; benefit: string; audience: string; from: string; to: string }>;
const QUICK_STATUSES = [{ value: "", label: "Tümü" }, { value: "active", label: "Aktif" }, { value: "scheduled", label: "Planlandı" }, { value: "draft", label: "Taslak" }];
const BENEFIT_ICONS = { percentage: Percent, fixed_amount: Tag, free_shipping: Truck, buy_x_get_y: Gift, quantity_tiers: Layers, bundle_price: Package, gift: Gift };

function PromotionActions({ item, canManage, canPublish, canArchive, busy, onAction }: Readonly<{ item: PromotionAdminListItem; canManage: boolean; canPublish: boolean; canArchive: boolean; busy: boolean; onAction: (item: PromotionAdminListItem, action: RowAction, trigger?: HTMLElement | null) => void }>) {
  const id = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const run = (action: RowAction) => { menuRef.current?.hidePopover(); onAction(item, action, triggerRef.current); };
  return <div className={styles.rowActions}>
    <Link href={`/discounts/${item.id}`} className="button button-text icon-only-button" aria-label={`${item.name} görüntüle`} title="Görüntüle"><Eye size={18} aria-hidden="true" /></Link>
    <button ref={triggerRef} type="button" className="button button-text icon-only-button" aria-label={`${item.name} işlemleri`} title="İşlemler" aria-controls={id} aria-expanded={expanded} popoverTarget={id} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); setPosition({ left: Math.max(16, Math.min(rect.right - 232, window.innerWidth - 248)), top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 400)) }); }}><MoreHorizontal size={20} aria-hidden="true" /></button>
    <div ref={menuRef} id={id} popover="auto" className={styles.rowMenu} style={position} role="group" aria-label={`${item.name} işlemleri`} onToggle={event => setExpanded((event.nativeEvent as ToggleEvent).newState === "open")}>
      <Link href={`/discounts/${item.id}/analytics`}><BarChart3 size={16} aria-hidden="true" />Analiz</Link>
      <Link href={`/discounts/${item.id}/codes`}><Ticket size={16} aria-hidden="true" />Kuponlar</Link>
      {canManage && item.status !== "archived" ? <Link href={`/discounts/${item.id}/edit`}><Pencil size={16} aria-hidden="true" />Düzenle</Link> : null}
      {canManage ? <button type="button" disabled={busy} onClick={() => run("duplicate")}><Copy size={16} aria-hidden="true" />Çoğalt</button> : null}
      {canPublish && (item.status === "active" || item.status === "scheduled") ? <button type="button" disabled={busy} onClick={() => run("pause")}><Pause size={16} aria-hidden="true" />Duraklat</button> : null}
      {canPublish && item.status === "paused" ? <button type="button" disabled={busy} onClick={() => run("resume")}><Play size={16} aria-hidden="true" />Devam ettir</button> : null}
      {canArchive && item.status !== "archived" ? <button type="button" disabled={busy} onClick={() => run("archive")}><Archive size={16} aria-hidden="true" />Arşivle</button> : null}
      {canArchive ? <button type="button" disabled={busy} onClick={() => run("delete")}><Trash2 size={16} aria-hidden="true" />Sil</button> : null}
    </div>
  </div>;
}

export function PromotionList({ timezone, canManage, canPublish, canArchive, api = defaultPromotionApi }: Readonly<{ timezone: string; canManage: boolean; canPublish: boolean; canArchive: boolean; api?: PromotionApiClient }>) {
  const promotionApi = api;
  const wheelSources = useLuckyWheelPromotionSources();
  const [deleteItem, setDeleteItem] = useState<Readonly<{ id: string; name: string }> | null>(null);
  const [deletionRecovery, setDeletionRecovery] = useState(() => promotionApi.pendingDeletions());
  const deleteFocus = useRef<HTMLElement | null>(null);
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [appendError, setAppendError] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterError, setFilterError] = useState("");
  const filterTrigger = useRef<HTMLButtonElement>(null);
  const filterSnapshot = useRef<FilterSnapshot | null>(null);
  const fromInput = useRef<HTMLInputElement>(null);
  const toInput = useRef<HTMLInputElement>(null);
  const [overviewRetry, setOverviewRetry] = useState(0);
  const [busy, setBusy] = useState<readonly string[]>([]);
  const [message, setMessage] = useState("");
  const [overview, setOverview] = useState<PromotionOverviewResult | null>(null);
  const [overviewPhase, setOverviewPhase] = useState<"loading" | "loaded" | "error">("loading");
  const [appliedQuery, setAppliedQuery] = useState<ListQuery>({});
  const appliedQueryRef = useRef<ListQuery>({});
  const loader = useMemo(() => new PromotionListLoader(promotionApi), [promotionApi]);
  const query = (): ListQuery => ({
    ...(search.trim() ? { search: search.trim() } : {}), ...(statusFilter ? { effectiveStatuses: [statusFilter] } : {}),
    ...(trigger ? { triggerKinds: [trigger] } : {}), ...(benefit ? { benefitKinds: [benefit] } : {}), ...(audience ? { audienceModes: [audience] } : {}),
    ...(from && to ? { scheduleFrom: dateStart(from, timezone), scheduleTo: dateEnd(to, timezone) } : {}),
  });
  const load = (selectedQuery: ListQuery, cursor?: string, preserveMessage = false) => {
    if (cursor && loadingMore) return;
    if (!cursor) setPhase("loading"); else setLoadingMore(true);
    setAppendError(false); if (!preserveMessage) setMessage("");
    void loader.load({ ...selectedQuery, ...(cursor ? { cursor } : {}) }).then((page) => {
      if (!page) return;
      setItems((current) => cursor ? [...current, ...page.items] : page.items); setNextCursor(page.nextCursor); setPhase(cursor || page.items.length ? "loaded" : "empty");
    }).catch(() => { if (cursor) setAppendError(true); else setPhase("error"); }).finally(() => setLoadingMore(false));
  };
  useEffect(() => { load({}); return () => loader.dispose(); }, [loader]);
  useEffect(() => {
    const controller = new AbortController(); setOverviewPhase("loading");
    void promotionApi.overview(range, controller.signal).then((value) => { setOverview(value); setOverviewPhase("loaded"); }).catch(() => { if (!controller.signal.aborted) setOverviewPhase("error"); });
    return () => controller.abort();
  }, [range, overviewRetry, promotionApi]);

  const filterCount = Object.keys(appliedQuery).filter((key) => key !== "scheduleTo").length;
  const appliedLabels = [
    ...(appliedQuery.search ? [`“${appliedQuery.search}”`] : []),
    ...(appliedQuery.effectiveStatuses ?? []).map((value) => STATUS[value] ?? value),
    ...(appliedQuery.triggerKinds ?? []).map((value) => value === "automatic" ? "Otomatik" : "Kodlu"),
    ...(appliedQuery.benefitKinds ?? []).map((value) => BENEFIT[value] ?? value),
    ...(appliedQuery.audienceModes ?? []).map((value) => AUDIENCE[value] ?? value),
    ...(appliedQuery.scheduleFrom ? ["Tarih aralığı"] : []),
  ];
  const clearFilters = () => {
    setSearch(""); setStatusFilter(""); setTrigger(""); setBenefit(""); setAudience(""); setFrom(""); setTo("");
    appliedQueryRef.current = {}; setAppliedQuery({}); setNextCursor(null); load({});
  };

  function selectStatus(value: string) {
    setStatusFilter(value);
    const { effectiveStatuses: _statuses, ...rest } = appliedQueryRef.current;
    const selected: ListQuery = { ...rest, ...(value ? { effectiveStatuses: [value] } : {}) };
    appliedQueryRef.current = selected; setAppliedQuery(selected); setNextCursor(null); load(selected);
  }
  const closeFilters = useCallback(() => {
    const previous = filterSnapshot.current;
    if (previous) { setStatusFilter(previous.status); setTrigger(previous.trigger); setBenefit(previous.benefit); setAudience(previous.audience); setFrom(previous.from); setTo(previous.to); }
    setFiltersOpen(false); setFilterError("");
  }, []);
  function openFilters() { filterSnapshot.current = { status: statusFilter, trigger, benefit, audience, from, to }; setFilterError(""); setFiltersOpen(true); }
  function applyFilters() {
    if ((from && !to) || (!from && to) || (from && to && from > to)) { setFilterError("Başlangıç ve bitişi doğru sırayla seçin."); (!from ? fromInput : toInput).current?.focus(); return; }
    let selected: ListQuery;
    try { selected = query(); } catch { setMessage("Tarih filtresi mağaza saat diliminde geçerli değil."); setFilterError("Tarih filtresi mağaza saat diliminde geçerli değil."); fromInput.current?.focus(); return; }
    appliedQueryRef.current = selected; setAppliedQuery(selected); setItems([]); setNextCursor(null); load(selected); setFiltersOpen(false); setFilterError("");
  }

  const action = (item: PromotionAdminListItem, selected: RowAction, trigger?: HTMLElement | null) => {
    if (busy.includes(item.id) || wheelSources.phase !== "loaded" || wheelSources.sources.has(item.id)) return;
    if (selected === "delete") { if (canArchive) { deleteFocus.current = trigger ?? null; setDeleteItem(item); } return; }
    if (selected === "archive" && !window.confirm("Kampanya arşivlensin mi? Geçmiş siparişler korunur.")) return;
    const replacementCode = selected === "duplicate" && item.triggerKind === "code" ? window.prompt("Kopya kampanya için kullanılmamış yeni kupon kodunu yazın.", "") : "";
    if (replacementCode === null || (selected === "duplicate" && item.triggerKind === "code" && replacementCode.trim() === "")) { if (replacementCode !== null) setMessage("Kodlu kampanya kopyası için yeni bir kupon kodu gerekir."); return; }
    setBusy((current) => [...current, item.id]); setMessage("");
    const operation = selected === "duplicate" ? promotionApi.duplicate(item.id, item.version, `${item.name} — Kopya`, replacementCode ? [replacementCode] : []) : promotionApi.lifecycle(item.id, item.version, selected, item.startsAt && item.startsAt > new Date().toISOString() ? "scheduled" : "active");
    void operation.then((result) => {
      if (result.kind === "saved") {
        if (selected === "duplicate") { window.location.assign(`/discounts/${result.promotion.id}/edit`); return; }
        setMessage(selected === "archive" ? "Kampanya arşivlendi." : selected === "pause" ? "Kampanya duraklatıldı." : "Kampanya yeniden etkinleştirildi."); load(appliedQueryRef.current, undefined, true);
      } else if (result.kind === "version_conflict") { setMessage("Kampanya başka bir kullanıcı tarafından güncellendi. Liste yenilendi."); load(appliedQueryRef.current, undefined, true); }
      else if (result.kind === "publish_blocked") setMessage("Kampanya yeniden etkinleştirilemedi; ayarlarını kontrol edin.");
      else setMessage(result.message);
    }).catch((error: unknown) => setMessage(promotionErrorMessage(error instanceof Error ? error.message : "promotion_unavailable"))).finally(() => setBusy((current) => current.filter((id) => id !== item.id)));
  };

  const rowActions = (item: PromotionAdminListItem) => <PromotionActions item={item} canManage={canManage && wheelSources.phase === "loaded" && !wheelSources.sources.has(item.id)} canPublish={canPublish && wheelSources.phase === "loaded" && !wheelSources.sources.has(item.id)} canArchive={canArchive && wheelSources.phase === "loaded" && !wheelSources.sources.has(item.id)} busy={busy.includes(item.id)} onAction={action} />;
  const identity = (item: PromotionAdminListItem) => {
    const Icon = BENEFIT_ICONS[item.benefitKind];
    return <div className={styles.identity}><span className={styles.benefitIcon} aria-hidden="true"><Icon size={20} /></span><div><Link href={`/discounts/${item.id}`} className={styles.name}>{item.name}</Link><p>{item.humanMechanic}</p>{wheelSources.sources.has(item.id) ? <LuckyWheelPromotionSource source={wheelSources.sources.get(item.id)!} /> : <small>{item.triggerKind === "code" ? `${item.activeCodeCount} aktif kod` : "Otomatik"}</small>}</div></div>;
  };
  const appliedStatus = appliedQuery.effectiveStatuses?.[0] ?? "";

  return <section className={styles.list}>
    <PanelPageHeader title="İndirimler" />
    {wheelSources.phase === "error" ? <p role="alert">İndirim kaynakları doğrulanamadı. <button type="button" onClick={wheelSources.retry}>Kaynakları yeniden yükle</button></p> : null}
    <h1 className={styles.srOnly}>İndirimler ve Kampanyalar</h1>
    <section className={styles.summary} aria-label="Kampanya özeti">
      <div className={styles.summaryHeader}><h2 className={styles.srOnly}>Kampanya özeti</h2><div className={styles.range} role="group" aria-label="Özet dönemi">{([7, 30, 90] as const).map(day => <button key={day} type="button" aria-pressed={range === day} onClick={() => setRange(day)}>Son {day} gün</button>)}</div></div>
      <div className={styles.kpis} aria-busy={overviewPhase === "loading"}>
        <article><span>Aktif indirim</span><strong>{overviewPhase === "loaded" ? overview?.activePromotions ?? 0 : overviewPhase === "error" ? "—" : "…"}</strong><small>Şu anda</small></article>
        <article><span>İndirimli sipariş</span><strong>{overviewPhase === "loaded" ? overview?.currencies.reduce((sum, row) => sum + row.affectedOrders, 0) ?? 0 : overviewPhase === "error" ? "—" : "…"}</strong><small>Ödemesi tamamlanan</small></article>
        <article><span>Sağlanan indirim</span><strong className={styles.money}>{overviewPhase === "loaded" ? overviewMoney(overview, "discountMinor") : overviewPhase === "error" ? "—" : "…"}</strong><small>Son {range} gün</small></article>
        <article><span>Kampanyalı ciro</span><strong className={styles.money}>{overviewPhase === "loaded" ? overviewMoney(overview, "revenueMinor") : overviewPhase === "error" ? "—" : "…"}</strong><small>Son {range} gün</small></article>
        <article><span>Kurtarılan sepet cirosu</span><strong className={styles.money}>{overviewPhase === "loaded" ? overviewMoney(overview, "recoveredRevenueMinor") : overviewPhase === "error" ? "—" : "…"}</strong><small>Son {range} gün</small></article>
      </div>
    </section>
    {overviewPhase === "error" ? <div role="alert" className={styles.feedback}><span>Özet yüklenemedi.</span><button className="button button-text" type="button" onClick={() => setOverviewRetry(value => value + 1)}>Yeniden dene</button></div> : null}
    <div className={styles.toolbar}>
      <form className={styles.search} role="search" onSubmit={event => { event.preventDefault(); applyFilters(); }}><label className={styles.srOnly} htmlFor="promotion-search">İndirim adı veya kupon kodu ara</label><Search size={18} aria-hidden="true" /><input id="promotion-search" type="search" value={search} placeholder="İndirim adı veya kupon kodu" onChange={event => setSearch(event.target.value)} /><button type="submit" className="button button-text icon-only-button" aria-label="Ara"><ArrowRight size={18} aria-hidden="true" /></button></form>
      <button ref={filterTrigger} type="button" className="button button-secondary" aria-haspopup="dialog" aria-expanded={filtersOpen} onClick={openFilters}><SlidersHorizontal size={16} aria-hidden="true" />Filtreler{filterCount ? <span className={styles.filterCount}>{filterCount}</span> : null}</button>
      {canManage ? <Link className="button button-primary" href="/discounts/new"><Plus size={18} aria-hidden="true" />Yeni indirim</Link> : null}
    </div>
    <div className={styles.statusBar}>
      <div className={styles.statusTabs} role="group" aria-label="İndirim durumu">{QUICK_STATUSES.map(status => <button key={status.value} type="button" aria-pressed={appliedStatus === status.value} onClick={() => selectStatus(status.value)}>{status.label}</button>)}</div>
      {phase === "loaded" || phase === "empty" ? <span className={styles.count}>{items.length} indirim{nextCursor ? " · Devamı var" : ""}</span> : null}
    </div>
    {filterCount > 0 ? <div className={styles.appliedFilters}><span>{appliedLabels.join(" · ")}</span><button type="button" className="button button-text" onClick={clearFilters}>Temizle</button></div> : null}
    {message && !filtersOpen ? <p role="status" className={styles.feedback}>{message}</p> : null}
    {canArchive && deletionRecovery.length ? <section aria-label="Bekleyen silme doğrulamaları" className={styles.feedback}><p>Önceki silme işleminin sonucu doğrulanamadı.</p>{deletionRecovery.map((entry, index) => <button key={entry.id} type="button" className="button button-secondary" onClick={event => { deleteFocus.current = event.currentTarget; setDeleteItem({ id: entry.id, name: "Bu indirim" }); }}>Silmeyi doğrula{deletionRecovery.length > 1 ? ` ${index + 1}` : ""}</button>)}</section> : null}
    {phase === "loading" ? <div role="status" aria-label="Kampanyalar yükleniyor" className={styles.loading}><span className={styles.srOnly}>Kampanyalar yükleniyor…</span>{[0, 1, 2].map(row => <div key={row} aria-hidden="true"><span /><span /><span /></div>)}</div> : null}
    {phase === "error" ? <div role="alert" className={styles.feedback}><span>İndirimler yüklenemedi.</span><button type="button" className="button button-secondary" onClick={() => load(appliedQuery)}>Yeniden dene</button></div> : null}
    {phase === "empty" ? <div className={emptyStyles.empty}>
      <PromotionIllustration kind={filterCount ? "custom" : "first_paid_order_percentage"} className={emptyStyles.illustration} />
      <div className={emptyStyles.copy}><PanelEmptyState title={filterCount ? "Eşleşen indirim yok" : "İlk indiriminizle başlayın"} description={filterCount ? "Aramayı veya filtreleri değiştirin." : "Yeni bir indirim oluşturun; burada yönetin."} action={filterCount ? <button className="button button-secondary" type="button" onClick={clearFilters}>Filtreleri temizle</button> : canManage ? <PanelActionButton href="/discounts/new">İlk kampanyayı oluştur</PanelActionButton> : undefined} /></div>
    </div> : null}
    {phase === "loaded" ? <>
      <div className={styles.desktopTable} role="region" aria-label="Kampanya tablosu" tabIndex={0}><table aria-label="Kampanyalar"><thead><tr><th scope="col">İndirim</th><th scope="col">Durum</th><th scope="col">Kullanım</th><th scope="col">İndirim / ciro</th><th scope="col">Tarih</th><th scope="col"><span className={styles.srOnly}>İşlemler</span></th></tr></thead><tbody>{items.map(item => <tr key={item.id} aria-busy={busy.includes(item.id)}><td>{identity(item)}</td><td><PanelStatusBadge tone={statusTone(item.effectiveStatus)}>{STATUS[item.effectiveStatus] ?? item.effectiveStatus}</PanelStatusBadge></td><td className={styles.usage}>{item.usage.used}</td><td className={styles.financial}><span>{amounts(item, "discountMinor")}</span><small>{amounts(item, "revenueMinor")}</small></td><td className={styles.dates}>{dates(item, timezone)}</td><td>{rowActions(item)}</td></tr>)}</tbody></table></div>
      <div className={styles.mobileCards}>{items.map(item => <article key={item.id} aria-busy={busy.includes(item.id)}><div className={styles.cardHeader}>{identity(item)}{rowActions(item)}</div><div className={styles.cardMeta}><PanelStatusBadge tone={statusTone(item.effectiveStatus)}>{STATUS[item.effectiveStatus] ?? item.effectiveStatus}</PanelStatusBadge><span>{item.usage.used} kullanım</span></div><dl><div><dt>İndirim</dt><dd>{amounts(item, "discountMinor")}</dd></div><div><dt>Ciro</dt><dd>{amounts(item, "revenueMinor")}</dd></div></dl><p className={styles.dates}>{dates(item, timezone)}</p></article>)}</div>
      {appendError ? <p className={styles.feedback} role="alert">Sonraki indirimler yüklenemedi. Mevcut liste korunuyor.</p> : null}
      <div className={styles.listFooter}><p className={styles.count} role="status">{items.length} kampanya gösteriliyor{nextCursor ? " · Devamı var" : ""}</p>{nextCursor ? <button type="button" className="button button-secondary" disabled={loadingMore} onClick={() => load(appliedQuery, nextCursor)}>{loadingMore ? "Yükleniyor…" : appendError ? "Yeniden dene" : "Daha fazla göster"}<ChevronDown size={16} aria-hidden="true" /></button> : null}</div>
    </> : null}
    {deleteItem ? <PromotionDeleteDialog key={deleteItem.id} id={deleteItem.id} name={deleteItem.name} api={promotionApi} returnFocusRef={deleteFocus} onCancel={() => { setDeleteItem(null); setDeletionRecovery(promotionApi.pendingDeletions()); }} onDeleted={() => { setDeleteItem(null); window.setTimeout(() => filterTrigger.current?.focus(), 0); setDeletionRecovery(promotionApi.pendingDeletions()); setMessage("İndirim silindi."); setOverviewRetry(value => value + 1); load(appliedQueryRef.current, undefined, true); }} /> : null}
    <DesignSettingsModal open={filtersOpen} surface={{ label: "Filtreler", hint: "İndirimleri durum, tür, hedef kitle ve tarihe göre daraltın." }} onClose={closeFilters} onApply={applyFilters} applyLabel="Filtreleri uygula" returnFocusRef={filterTrigger} className={styles.filterModal}>
      <form className={styles.filterFields} onSubmit={event => { event.preventDefault(); applyFilters(); }}>
        <label>Durum<select value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">Tümü</option>{Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Uygulama<select value={trigger} onChange={event => setTrigger(event.target.value)}><option value="">Tümü</option><option value="automatic">Otomatik</option><option value="code">Kodlu</option></select></label>
        <label>İndirim türü<select value={benefit} onChange={event => setBenefit(event.target.value)}><option value="">Tümü</option>{Object.entries(BENEFIT).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Hedef kitle<select value={audience} onChange={event => setAudience(event.target.value)}><option value="">Tümü</option>{Object.entries(AUDIENCE).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label>Başlangıç<input ref={fromInput} type="date" value={from} aria-invalid={Boolean(filterError)} aria-describedby={filterError ? "promotion-date-error" : undefined} onChange={event => { setFrom(event.target.value); setFilterError(""); }} /></label>
        <label>Bitiş<input ref={toInput} type="date" value={to} aria-invalid={Boolean(filterError)} aria-describedby={filterError ? "promotion-date-error" : undefined} onChange={event => { setTo(event.target.value); setFilterError(""); }} /></label>
        {filterError ? <p id="promotion-date-error" className={styles.filterError} role="alert">{filterError}</p> : null}
        <button type="submit" hidden>Filtreleri uygula</button>
      </form>
    </DesignSettingsModal>
  </section>;
}
