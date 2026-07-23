"use client";

import type { CustomerTag, PriceChannel, PriceList, PriceListItem, PriceListRule, Product, ProductVariant } from "@celebix/saas-contracts";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PanelActionButton, PanelPageHeader, PanelPageShell, PanelStatusBadge } from "@/components/panel/PanelPageShell";
import { catalogApi } from "@/lib/catalog-ui/client";
import { customerApi } from "@/lib/customer-ui/client";
import { buildPriceListIntent, createPricingMutationController, pricingApi, pricingErrorState, pricingRuleDraft, type PricingErrorState, type PricingRuleDraft } from "@/lib/pricing-ui/client";
import styles from "./price-list-console.module.css";

type ViewPhase = "loading" | "loaded" | "empty" | PricingErrorState;
const STATUS = Object.freeze({ draft: "Taslak", active: "Aktif", archived: "Arşivlendi" } as const);
const CHANNEL = Object.freeze({ storefront: "Mağaza", quick_order: "Hızlı sipariş" } as const);
const money = (value: number) => new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value / 100);
const date = (value: string) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
function tone(status: PriceList["status"]): "neutral" | "success" | "warning" { return status === "active" ? "success" : status === "archived" ? "neutral" : "warning"; }
function target(rule: PriceListRule, tags: readonly CustomerTag[]) { return rule.customerTagId ? tags.find((tag) => tag.id === rule.customerTagId)?.name ?? `Etiket ${rule.customerTagId.slice(0, 8)}` : "Tüm müşteriler"; }
function period(rule: PriceListRule) { return `${rule.startsAt ? date(rule.startsAt) : "Hemen"} – ${rule.endsAt ? date(rule.endsAt) : "Süresiz"}`; }
function summaries(item: PriceList, tags: readonly CustomerTag[]) { return Object.freeze({ channels: [...new Set(item.rules.map((rule) => CHANNEL[rule.channel]))].join(", "), targets: [...new Set(item.rules.map((rule) => target(rule, tags)))].join(", "), periods: item.rules.map(period).join("; ") }); }

function TruthState(props: Readonly<{ phase: ViewPhase; list?: boolean; onRetry?(): void }>) {
  if (props.phase === "denied") return <div className={styles.denied} role="status">Bu fiyat listelerini görüntüleme yetkiniz yok.</div>;
  if (props.phase === "not_found") return <div className={styles.error} role="alert">Fiyat listesi bulunamadı.</div>;
  if (props.phase === "verification_unavailable") return <div className={styles.conflict} role="alert">İşlem sonucu doğrulanamıyor. Yeni bir yazma isteği göndermeden önce sayfayı tamamen yenileyin.</div>;
  if (props.phase === "unavailable") return <div className={styles.error} role="alert">Fiyatlandırma hizmeti kullanılamıyor.</div>;
  if (props.phase === "conflict") return <div className={styles.conflict} role="alert">Fiyat listesi başka bir işlemle çakıştı.</div>;
  if (props.phase === "error") return <div className={styles.error} role="alert">{props.list ? "Fiyat listeleri yüklenemedi." : "Fiyat listesi işlemi tamamlanamadı."}{props.onRetry ? <button type="button" onClick={props.onRetry}>Yeniden dene</button> : null}</div>;
  if (props.phase === "loading") return <div className={styles.state} role="status">{props.list ? "Fiyat listeleri yükleniyor…" : "Fiyat listesi yükleniyor…"}</div>;
  return null;
}

export function PriceListListPresentation(props: Readonly<{ phase: ViewPhase; items: readonly PriceList[]; tags: readonly CustomerTag[]; canManage: boolean; onRetry(): void }>) {
  if (!["loaded", "empty"].includes(props.phase)) return <TruthState phase={props.phase} list onRetry={props.phase === "error" ? props.onRetry : undefined} />;
  if (props.phase === "empty" || props.items.length === 0) return <div className={styles.empty}><h2>Henüz fiyat listesi yok</h2><p>Kalıcı sabit fiyat kuralları oluşturduğunuzda burada görünecek.</p>{props.canManage ? <PanelActionButton primary href="/products/price-lists/new">İlk fiyat listesini oluştur</PanelActionButton> : null}</div>;
  return <><div className={styles.desktopTable}><table aria-label="Fiyat listeleri"><thead><tr><th>Ad</th><th>Durum</th><th>Kanal</th><th>Hedefleme</th><th>Aktif dönem</th><th>Kalem</th><th>Güncellendi</th></tr></thead><tbody>{props.items.map((item) => { const summary = summaries(item, props.tags); return <tr key={item.id}><td><Link href={`/products/price-lists/${item.id}`}>{item.name}</Link></td><td><PanelStatusBadge tone={tone(item.status)}>{STATUS[item.status]}</PanelStatusBadge></td><td>{summary.channels}</td><td>{summary.targets}</td><td>{summary.periods}</td><td>{item.items.length}</td><td>{date(item.updatedAt)}</td></tr>; })}</tbody></table></div><div className={styles.mobileCards}>{props.items.map((item) => { const summary = summaries(item, props.tags); return <article className={styles.mobileCard} key={item.id}><div className={styles.cardHeading}><Link className={styles.mobileRecordLink} href={`/products/price-lists/${item.id}`}>{item.name}</Link><PanelStatusBadge tone={tone(item.status)}>{STATUS[item.status]}</PanelStatusBadge></div><dl><div><dt>Kanal</dt><dd>{summary.channels}</dd></div><div><dt>Hedefleme</dt><dd>{summary.targets}</dd></div><div><dt>Aktif dönem</dt><dd>{summary.periods}</dd></div><div><dt>Kalem</dt><dd>{item.items.length}</dd></div><div><dt>Güncellendi</dt><dd>{date(item.updatedAt)}</dd></div><div><dt>Sürüm</dt><dd>{item.version}</dd></div></dl></article>; })}</div></>;
}

function useChoices(enabled: boolean) {
  const [products, setProducts] = useState<readonly Product[]>([]), [variants, setVariants] = useState<readonly ProductVariant[]>([]), [tags, setTags] = useState<readonly CustomerTag[]>([]), [failed, setFailed] = useState(false);
  useEffect(() => { if (!enabled) return; const controller = new AbortController(); void (async () => { try { const [page, safeTags] = await Promise.all([catalogApi.listProducts({ status: "active" }), customerApi.tags()]); const details = await Promise.all(page.items.map((product) => catalogApi.getProduct(product.id))); if (!controller.signal.aborted) { setProducts(page.items); setVariants(Object.freeze(details.flatMap((detail) => detail.variants.filter((variant) => variant.status === "active")))); setTags(safeTags); } } catch { if (!controller.signal.aborted) setFailed(true); } })(); return () => controller.abort(); }, [enabled]);
  return { products, variants, tags, failed };
}

function PriceListEditor(props: Readonly<{ resourceId?: string; canManage: boolean }>) {
  const [phase, setPhase] = useState<ViewPhase>(props.resourceId ? "loading" : "loaded");
  const [record, setRecord] = useState<PriceList | undefined>();
  const [name, setName] = useState("");
  const [draftRules, setDraftRules] = useState<readonly PricingRuleDraft[]>(() => Object.freeze([pricingRuleDraft()]));
  const [draftItems, setDraftItems] = useState<readonly PriceListItem[]>([]);
  const [message, setMessage] = useState("");
  const choices = useChoices(props.canManage);
  const mutations = useMemo(() => createPricingMutationController(pricingApi), []);
  const readOnly = !props.canManage || record?.status === "active" || record?.status === "archived";
  useEffect(() => () => mutations.dispose(), [mutations]);
  useEffect(() => { if (!props.resourceId) return; const controller = new AbortController(); void pricingApi.get(props.resourceId, controller.signal).then((item) => { setRecord(item); setName(item.name); setDraftItems(item.items); setDraftRules(Object.freeze(item.rules.map(pricingRuleDraft))); setPhase("loaded"); }).catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setPhase(pricingErrorState(error)); }); return () => controller.abort(); }, [props.resourceId]);
  const selectedVariants = useMemo(() => new Map(choices.variants.map((variant) => [variant.id, variant])), [choices.variants]);
  const productNames = useMemo(() => new Map(choices.products.map((product) => [product.id, product.title])), [choices.products]);
  const addVariant = useCallback((variantId: string) => { const variant = selectedVariants.get(variantId); if (!variant || draftItems.some((item) => item.variantId === variantId)) return; setDraftItems((items) => Object.freeze([...items, { variantId, priceCents: variant.priceCents }])); }, [draftItems, selectedVariants]);
  const updateRule = useCallback((index: number, update: Partial<PricingRuleDraft>) => setDraftRules((rules) => Object.freeze(rules.map((rule, candidate) => candidate === index ? Object.freeze({ ...rule, ...update }) : rule))), []);
  async function run(action: "save" | "activate" | "archive") {
    if (readOnly && action === "save") return;
    if (mutations.state() === "verification_unavailable") { setPhase("verification_unavailable"); return; }
    setMessage("İşlem gönderiliyor…");
    try {
      const next = action === "save" ? await mutations.save(buildPriceListIntent({ ...(record ? { priceListId: record.id, expectedVersion: record.version } : {}), name, items: draftItems, rules: draftRules })) : action === "activate" ? await mutations.activate(record!.id, record!.version) : await mutations.archive(record!.id, record!.version);
      setRecord(next); setName(next.name); setDraftItems(next.items); setDraftRules(Object.freeze(next.rules.map(pricingRuleDraft))); setPhase("loaded"); setMessage(action === "save" ? "Fiyat listesi kalıcı olarak kaydedildi." : action === "activate" ? "Fiyat listesi PostgreSQL tarafından doğrulanıp etkinleştirildi." : "Fiyat listesi arşivlendi.");
    } catch (error) { const next = pricingErrorState(error); setPhase(next); setMessage(next === "conflict" ? "Kayıt sizden önce değişti veya fiyat kuralları çakıştı." : next === "verification_unavailable" ? "İşlem sonucu doğrulanamıyor. Tam sayfa yenileme gereklidir." : "Fiyat listesi işlemi tamamlanamadı."); }
  }
  if (!props.canManage && !props.resourceId) return <div className={styles.denied} role="status">Fiyat listesi oluşturma yetkiniz yok.</div>;
  if (phase !== "loaded" && !record) return <TruthState phase={phase} />;
  return <div className={styles.editor}>
    {phase !== "loaded" ? <TruthState phase={phase} /> : message ? <p className={styles.notice} role="status">{message}</p> : null}
    {record ? <div className={styles.summary}><span>Durum <PanelStatusBadge tone={tone(record.status)}>{STATUS[record.status]}</PanelStatusBadge></span><span>Sürüm <strong>{record.version}</strong></span></div> : null}
    <fieldset disabled={readOnly}><legend>Liste ayrıntıları</legend><label>Ad<input value={name} maxLength={200} onChange={(event) => setName(event.target.value)} /></label></fieldset>
    <fieldset disabled={readOnly}><legend>Fiyat kuralları</legend><div className={styles.ruleRows}>{draftRules.map((rule, index) => <div className={styles.ruleRow} key={index}><label>Kanal<select value={rule.channel} onChange={(event) => updateRule(index, { channel: event.target.value as PriceChannel })}><option value="storefront">Mağaza</option><option value="quick_order">Hızlı sipariş</option></select></label><label>Hedefleme<select value={rule.customerTagId} onChange={(event) => updateRule(index, { customerTagId: event.target.value })}><option value="">Tüm müşteriler (global)</option>{choices.tags.map((tag) => <option key={tag.id} value={tag.id}>{tag.name}</option>)}</select></label><label>Başlangıç (UTC)<input type="datetime-local" value={rule.startsAt} onChange={(event) => updateRule(index, { startsAt: event.target.value })} /></label><label>Bitiş (UTC)<input type="datetime-local" value={rule.endsAt} onChange={(event) => updateRule(index, { endsAt: event.target.value })} /></label><label>Öncelik<input type="number" min="0" max="1000" value={rule.priority} onChange={(event) => updateRule(index, { priority: event.target.value })} /></label>{draftRules.length > 1 ? <button type="button" onClick={() => setDraftRules((rules) => Object.freeze(rules.filter((_, candidate) => candidate !== index)))}>Kuralı kaldır</button> : null}</div>)}</div><button type="button" onClick={() => setDraftRules((rules) => Object.freeze([...rules, pricingRuleDraft()]))}>Kural ekle</button></fieldset>
    <fieldset disabled={readOnly}><legend>Sabit varyant fiyatları</legend><label>Varyant ekle<select defaultValue="" onChange={(event) => { addVariant(event.target.value); event.target.value = ""; }}><option value="" disabled>Ürün / varyant seçin</option>{choices.variants.map((variant) => <option key={variant.id} value={variant.id}>{productNames.get(variant.productId)} — {variant.title} ({variant.sku ?? variant.id.slice(0, 8)})</option>)}</select></label>{choices.failed ? <p className={styles.errorNotice} role="alert">Ürün veya müşteri etiketi seçenekleri yüklenemedi.</p> : null}<div className={styles.itemRows}>{draftItems.map((item) => { const variant = selectedVariants.get(item.variantId); return <div className={styles.itemRow} key={item.variantId}><span>{variant ? `${productNames.get(variant.productId)} — ${variant.title}` : item.variantId}</span><label>Fiyat (kuruş)<input type="number" min="0" max="8000000000" value={item.priceCents} onChange={(event) => { const priceCents = Number(event.target.value); setDraftItems((items) => Object.freeze(items.map((candidate) => candidate.variantId === item.variantId ? { ...candidate, priceCents } : candidate))); }} /></label><button type="button" onClick={() => setDraftItems((items) => Object.freeze(items.filter((candidate) => candidate.variantId !== item.variantId)))}>Kaldır</button></div>; })}</div></fieldset>
    <section className={styles.preview}><h2>Açıklayıcı önizleme</h2><p>Bu tablo tarayıcıdaki taslağı açıklar; etkinleştirme anında PostgreSQL kalıcı varyant, etiket, dönem ve çakışma yetkisini yeniden doğrular.</p><table><thead><tr><th>Varyant</th><th>Taban fiyat</th><th>Liste fiyatı</th></tr></thead><tbody>{draftItems.map((item) => <tr key={item.variantId}><td>{selectedVariants.get(item.variantId)?.title ?? item.variantId}</td><td>{selectedVariants.has(item.variantId) ? money(selectedVariants.get(item.variantId)!.priceCents) : "—"}</td><td>{Number.isSafeInteger(item.priceCents) ? money(item.priceCents) : "Geçersiz"}</td></tr>)}</tbody></table></section>
    <div className={styles.actions}>{!readOnly ? <button className={styles.primary} type="button" onClick={() => void run("save")}>Kaydet</button> : null}{record?.status === "draft" && props.canManage ? <button type="button" onClick={() => void run("activate")}>Etkinleştir</button> : null}{record && record.status !== "archived" && props.canManage ? <button type="button" onClick={() => void run("archive")}>Arşivle</button> : null}</div>
  </div>;
}

export function PriceListConsole(props: Readonly<{ mode?: "list" | "new" | "detail"; resourceId?: string; canRead: boolean; canManage: boolean }>) {
  const mode = props.mode ?? "list"; const [phase, setPhase] = useState<ViewPhase>(props.canRead ? "loading" : "denied"); const [items, setItems] = useState<readonly PriceList[]>([]), [tags, setTags] = useState<readonly CustomerTag[]>([]); const [nonce, setNonce] = useState(0);
  useEffect(() => { if (mode !== "list" || !props.canRead) return; const controller = new AbortController(); setPhase("loading"); void Promise.all([pricingApi.list(controller.signal), customerApi.tags()]).then(([next, safeTags]) => { if (!controller.signal.aborted) { setItems(next); setTags(safeTags); setPhase(next.length ? "loaded" : "empty"); } }).catch((error: unknown) => { if (!(error instanceof DOMException && error.name === "AbortError")) setPhase(pricingErrorState(error)); }); return () => controller.abort(); }, [mode, nonce, props.canRead]);
  if (mode !== "new" && !props.canRead) return <PanelPageShell><PanelPageHeader title="Fiyat listeleri" /><div className={styles.denied} role="status">Bu fiyat listelerini görüntüleme yetkiniz yok.</div></PanelPageShell>;
  const title = mode === "list" ? "Fiyat listeleri" : mode === "new" ? "Yeni fiyat listesi" : "Fiyat listesi";
  return <PanelPageShell><PanelPageHeader title={title} description="Mağaza ve hızlı sipariş kanallarında kalıcı, sürümlü sabit fiyat kurallarını yönetin." actions={mode === "list" && props.canManage ? <PanelActionButton primary href="/products/price-lists/new">Yeni fiyat listesi</PanelActionButton> : undefined} />{mode === "list" ? <PriceListListPresentation phase={phase} items={items} tags={tags} canManage={props.canManage} onRetry={() => setNonce((value) => value + 1)} /> : <PriceListEditor resourceId={props.resourceId} canManage={props.canManage} />}</PanelPageShell>;
}
