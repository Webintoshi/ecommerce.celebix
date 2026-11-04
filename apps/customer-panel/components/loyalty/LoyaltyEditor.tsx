"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { LoyaltyConfig, LoyaltyProgram, LoyaltyTemplate } from "@celebix/saas-contracts";
import type { PromotionTarget } from "../../lib/promotion-ui/model";
import { createDirtyNavigationGuard } from "../../lib/catalog-ui/dirty-navigation";
import { promotionApi } from "../../lib/promotion-ui/client";
import { PanelPageHeader } from "../panel/PanelPageShell";
import { PanelInitialDataGate } from "../panel/PanelInitialDataGate";
import { PromotionPicker } from "../promotions/PromotionTargetPicker";
import { createLoyaltyDraft, draftForProgram, formatLoyaltyMoney, LOYALTY_TEMPLATES, loyaltyConfigFor, loyaltyReturnPolicy, loyaltySummary, type LoyaltyDraft } from "./model";
import { listLoyaltyPrograms, loyaltyError, LoyaltyRequestError, mutateLoyaltyProgram, pendingLoyaltyOperation } from "./client";
import { LoyaltyRecovery, LoyaltyTemplatePicker, useLoyaltyPending, type LoyaltyPermissions } from "./LoyaltyPrograms";
import styles from "./loyalty.module.css";
import checkboxStyles from "../shared/selection-checkbox.module.css";

const STEPS = ["Hedef ve ödül", "Kullanım koşulları", "Önizleme ve başlatma"];
const PRODUCT_KINDS = ["product"] as const, VARIANT_KINDS = ["variant"] as const, SHIPPING_KINDS = ["shipping_method"] as const;
const CHANNELS = [{ id: "storefront", label: "Online mağaza" }, { id: "in_store", label: "Fiziksel mağaza" }, { id: "manual", label: "Manuel satış" }] as const;
function references(kind: PromotionTarget["kind"], ids: readonly string[]): readonly PromotionTarget[] { return ids.map(id => ({ kind, id, label: "Seçili kayıt", status: "active" })); }

export function LoyaltyProgramEditor({ programId, timezone, canManage, canPublish }: LoyaltyPermissions & Readonly<{ programId?: string; timezone: string }>) {
  const [template, setTemplate] = useState<LoyaltyTemplate | null>(programId ? "product_gift" : null);
  const [draft, setDraft] = useState<LoyaltyDraft>(() => createLoyaltyDraft("product_gift"));
  const [program, setProgram] = useState<LoyaltyProgram | null>(null), [loading, setLoading] = useState(Boolean(programId));
  const [message, setMessage] = useState(""), [missing, setMissing] = useState(false), [busy, setBusy] = useState(false), [step, setStep] = useState(0), [retry, setRetry] = useState(0);
  const [saved, setSaved] = useState(""), [selectedProducts, setSelectedProducts] = useState<readonly PromotionTarget[]>([]), [selectedGift, setSelectedGift] = useState<readonly PromotionTarget[]>([]), [selectedShipping, setSelectedShipping] = useState<readonly PromotionTarget[]>([]);
  const [conflict, setConflict] = useState(false), [fresh, setFresh] = useState<LoyaltyProgram | null>(null);
  const draftRef = useRef(draft), pending = useRef(false), heading = useRef<HTMLHeadingElement>(null), clean = useRef(false);
  draftRef.current = draft;
  const readonly = !canManage || !canPublish;
  const unresolved = useLoyaltyPending();
  function adopt(value: LoyaltyProgram) {
    const next = draftForProgram(value); setProgram(value); setDraft(next); setTemplate(next.template); setSaved(JSON.stringify(next));
    setSelectedProducts(references("product", next.eligibleProductIds)); setSelectedGift(references("variant", next.variantId ? [next.variantId] : [])); setSelectedShipping(references("shipping_method", next.shippingMethodIds));
  }
  useEffect(() => {
    if (!programId) return;
    const controller = new AbortController(); setLoading(true); setMissing(false);
    void listLoyaltyPrograms(controller.signal).then(result => {
      if (controller.signal.aborted) return;
      const found = result.programs.find(row => row.id === programId);
      if (found) { adopt(found); setMessage(""); } else setMissing(true);
    }).catch(error => { if (!controller.signal.aborted) setMessage(loyaltyError(error)); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [programId, retry]);
  useEffect(() => {
    const guard = createDirtyNavigationGuard({ isDirty: () => !clean.current && !readonly && Boolean(template) && (!programId || Boolean(program)) && JSON.stringify(draftRef.current) !== saved, confirm: () => window.confirm("Kaydedilmemiş değişiklikleriniz var. Ayrılmak istiyor musunuz?") });
    const unload = guard.bindBeforeUnload(window), links = guard.bindApplicationNavigation(document, () => window.location.href);
    return () => { unload(); links(); };
  }, [saved, readonly, template, programId, Boolean(program)]);
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, [step]);
  useEffect(() => {
    if (!program) return;
    const controller = new AbortController();
    void Promise.all([
      promotionApi.resolveTargets("product", draftRef.current.eligibleProductIds, controller.signal),
      promotionApi.resolveTargets("variant", draftRef.current.variantId ? [draftRef.current.variantId] : [], controller.signal),
      promotionApi.resolveTargets("shipping_method", draftRef.current.shippingMethodIds, controller.signal),
    ]).then(([products, gifts, shipping]) => {
      if (controller.signal.aborted) return;
      setSelectedProducts(products); setSelectedGift(gifts); setSelectedShipping(shipping);
    }).catch(() => { if (!controller.signal.aborted) setMessage("Seçili ürün bilgileri yüklenemedi. Seçim alanlarını açıp kontrol edin."); });
    return () => controller.abort();
  }, [program?.id, program?.version]);
  function change(update: Partial<LoyaltyDraft>) { setDraft(current => ({ ...current, ...update })); setMessage(""); }
  function choose(value: LoyaltyTemplate) { const next = createLoyaltyDraft(value); setTemplate(value); setDraft(next); setSaved(JSON.stringify(next)); }
  function nextStep() {
    if (step === 0) {
      if (!draft.name.trim()) { setMessage("Program adını girin."); return; }
      try { loyaltyConfigFor(draft, timezone); } catch (error) { setMessage(error instanceof Error ? error.message : "Bilgileri kontrol edin."); return; }
    }
    if (step === 1) { try { loyaltyConfigFor(draft, timezone); } catch (error) { setMessage(error instanceof Error ? error.message : "Bilgileri kontrol edin."); return; } }
    setMessage(""); setStep(current => Math.min(2, current + 1));
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (step < 2) { nextStep(); return; }
    if (readonly || pending.current || conflict || (programId && !program)) return;
    let config: LoyaltyConfig;
    try { config = loyaltyConfigFor(draft, timezone); if (!draft.name.trim()) throw new Error("Program adını girin."); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Bilgileri kontrol edin."); return; }
    pending.current = true; setBusy(true); setMessage("");
    try {
      const result = await mutateLoyaltyProgram("save", { ...(program ? { programId: program.id, expectedVersion: program.version } : {}), name: draft.name.trim(), enabled: draft.enabled, config });
      adopt(result.program); clean.current = true;
      window.location.assign(`/discounts/loyalty/${result.program.id}/report`);
    } catch (error) { setMessage(loyaltyError(error)); if (error instanceof LoyaltyRequestError && error.code === "version_conflict") { setConflict(true); setFresh(null); } }
    finally { pending.current = false; setBusy(false); }
  }
  let preview: LoyaltyConfig | null = null;
  if (step === 2) { try { preview = loyaltyConfigFor(draft, timezone); } catch { /* Validation is shown before advancing. */ } }
  return <section className={styles.workspace}>
    <h1 className="sr-only">{programId ? "Sadakat programını düzenle" : "Sadakat programı oluştur"}</h1>
    <PanelPageHeader title={programId ? "Sadakat programı" : "Program oluştur"} actions={<Link className={styles.secondary} href="/discounts/loyalty">Programlara dön</Link>}/>
    <LoyaltyRecovery onRecovered={value => { if (value) { clean.current = true; window.location.assign(`/discounts/loyalty/${value.id}/report`); } else setRetry(current => current + 1); }}/>
    {message ? <div className={styles.notice} role="alert"><p>{message}</p>{programId && !program && !loading ? <button className={styles.secondary} type="button" onClick={() => setRetry(current => current + 1)}>Yeniden yükle</button> : null}</div> : null}
    {conflict ? <div className={styles.notice}><p>{fresh ? `Güncel kayıt: ${fresh.name}. Girdiğiniz bilgiler korunuyor. Kaydetmek bu sürümdeki ayarların yerine geçer.` : "Girdiğiniz bilgiler korunuyor. Yeniden kaydetmeden önce güncel kaydı kontrol edin."}</p><div className={styles.rowActions}><button type="button" className={styles.secondary} disabled={busy} onClick={() => {
      setBusy(true); void listLoyaltyPrograms().then(result => { const value = result.programs.find(row => row.id === programId); if (!value) throw new Error(); setFresh(value); }).catch(error => setMessage(loyaltyError(error))).finally(() => setBusy(false));
    }}>Güncel kaydı yükle</button>{fresh ? <button type="button" className={styles.secondary} onClick={() => { setProgram(fresh); setConflict(false); setFresh(null); setMessage(""); }}>Güncel sürümle devam et</button> : null}</div></div> : null}
    <PanelInitialDataGate pending={loading}>
      {missing ? <div className={styles.empty}><h2>Program bulunamadı</h2><p>Program listesinden güncel bir kayıt seçin.</p></div> : programId && !program ? null : template === null ? readonly ? <p>Bu rol programları görüntüleyebilir. Program oluşturma yetkisi gerekiyor.</p> : <LoyaltyTemplatePicker onSelect={choose}/> : <>
        <div className={styles.sectionHeading}><div><h2>{program?.name || LOYALTY_TEMPLATES.find(item => item.id === template)?.title}</h2>{readonly ? <p>Görüntüleme erişimi</p> : null}</div>{!programId ? <button className={styles.secondary} type="button" onClick={() => { if (JSON.stringify(draft) === saved || window.confirm("Bu formdaki değişiklikleri bırakıp başka şablon seçmek istiyor musunuz?")) { setTemplate(null); setStep(0); } }}>Şablonu değiştir</button> : null}</div>
        <ol className={styles.steps} aria-label="Program oluşturma adımları">{STEPS.map((label, index) => <li key={label} aria-current={index === step ? "step" : undefined}><span>{index + 1}</span>{label}</li>)}</ol>
        <form className={styles.form} onSubmit={event => void save(event)}>
          <h2 className={styles.stepTitle} ref={heading} tabIndex={-1}>{STEPS[step]}</h2>
          {step === 0 ? <fieldset disabled={readonly || busy || Boolean(unresolved)}>
            <label className={styles.field}>Program adı<input required maxLength={120} value={draft.name} onChange={event => change({ name: event.target.value })} autoComplete="off"/></label>
            <div className={styles.columns}><label className={styles.field}>{template === "spend_discount" ? "Harcama hedefi (TL)" : template === "product_gift" ? "Biriktirilecek ürün adedi" : "Tamamlanacak alışveriş sayısı"}<input required inputMode={template === "spend_discount" ? "decimal" : "numeric"} value={draft.target} onChange={event => change({ target: event.target.value })}/></label><label className={styles.field}>Geçerli en az ürün tutarı (TL)<input required inputMode="decimal" value={draft.minimumBasket} onChange={event => change({ minimumBasket: event.target.value })}/><small>Kargo ve hediyeler bu tutara katılmaz. Sınır yoksa 0 yazın.</small></label></div>
            <PromotionPicker title={template === "product_gift" ? "Biriktirilecek ürünler" : "Geçerli ürünler"} help={template === "product_gift" ? "Satın alınan her uygun adet hedefe eklenir." : "Seçmezseniz mağazanın tüm uygun ürünleri sayılır."} kinds={PRODUCT_KINDS} selected={selectedProducts} onChange={items => { setSelectedProducts(items); change({ eligibleProductIds: items.map(item => item.id) }); }}/>
            {template === "spend_discount" ? <label className={styles.field}>Kazanılacak indirim (TL)<input required inputMode="decimal" value={draft.amount} onChange={event => change({ amount: event.target.value })}/></label> : template === "purchase_shipping" ? <PromotionPicker title="Ücretsiz kargo yöntemleri" help="Boş bırakırsanız uygun standart kargo yöntemleri kullanılır." kinds={SHIPPING_KINDS} selected={selectedShipping} onChange={items => { setSelectedShipping(items); change({ shippingMethodIds: items.map(item => item.id) }); }}/> : <>
              <PromotionPicker title="Hediye ürün ve varyant" help="Bir varyant seçin. Stoğu biterse müşterinin hakkı korunur." kinds={VARIANT_KINDS} selected={selectedGift} onChange={items => { const next = items.filter(item => !selectedGift.some(old => old.id === item.id)).slice(-1); const chosen = next.length ? next : items.slice(-1); setSelectedGift(chosen); change({ variantId: chosen[0]?.id ?? "" }); }}/>
            <label className={styles.field}>Hediye adedi<input required type="number" min={1} max={20} step={1} inputMode="numeric" value={draft.quantity} onChange={event => change({ quantity: event.target.value })}/></label>
            </>}
          </fieldset> : step === 1 ? <fieldset disabled={readonly || busy || Boolean(unresolved)}>
            <label className={styles.field}>Ödülü kullanmak için en az ürün tutarı (TL)<input required inputMode="decimal" value={draft.rewardMinimumBasket} onChange={event => change({ rewardMinimumBasket: event.target.value })}/><small>Hediye tek başına kullanılabilsin istiyorsanız 0 bırakın.</small></label>
            <p className={styles.helper}>{loyaltyReturnPolicy(draft)}</p>
            <fieldset className={styles.checkGroup}><legend>Geçerli satış kanalları</legend>{CHANNELS.map(channel => <label className={styles.check} key={channel.id}><input className={checkboxStyles.checkbox} type="checkbox" checked={draft.channels.includes(channel.id)} onChange={event => change({ channels: event.target.checked ? [...draft.channels, channel.id] : draft.channels.filter(value => value !== channel.id) })}/>{channel.label}</label>)}</fieldset>
            <div className={styles.columns}><label className={styles.field}>Başlangıç tarihi<input type="date" value={draft.startsOn} onChange={event => change({ startsOn: event.target.value })}/><small>Boşsa kaydettiğinizde başlar.</small></label><label className={styles.field}>Son kazanım tarihi<input type="date" value={draft.endsOn} min={draft.startsOn || undefined} onChange={event => change({ endsOn: event.target.value })}/><small>Boşsa süresiz. Kazanılmış ödüller korunur.</small></label></div>
            <label className={styles.check}><input className={checkboxStyles.checkbox} type="checkbox" checked={draft.repeat} onChange={event => change({ repeat: event.target.checked })}/>Hedef her tamamlandığında yeniden ödül kazanılsın</label>
            {template !== "product_gift" && template !== "spend_discount" ? <label className={styles.check}><input className={checkboxStyles.checkbox} type="checkbox" checked={draft.maxOncePerDay} onChange={event => change({ maxOncePerDay: event.target.checked })}/>Günde en fazla bir alışveriş sayılsın</label> : null}
            <details className={styles.details}><summary>Diğer koşullar</summary><div className={styles.form}><label className={styles.check}><input className={checkboxStyles.checkbox} type="checkbox" checked={draft.allowMultiplePrograms} onChange={event => change({ allowMultiplePrograms: event.target.checked })}/>Aynı alışveriş başka sadakat programlarını da ilerletsin</label><label className={styles.check}><input className={checkboxStyles.checkbox} type="checkbox" checked={draft.allowCombination} onChange={event => change({ allowCombination: event.target.checked })}/>Ödül diğer indirimlerle birlikte kullanılabilsin</label><div className={styles.columns}><label className={styles.field}>İlerlemenin geçerliliği (gün)<input inputMode="numeric" value={draft.progressExpiryDays} onChange={event => change({ progressExpiryDays: event.target.value })}/><small>Boşsa süresiz.</small></label><label className={styles.field}>Kazanılan ödülün geçerliliği (gün)<input inputMode="numeric" value={draft.rewardExpiryDays} onChange={event => change({ rewardExpiryDays: event.target.value })}/><small>Boşsa süresiz.</small></label></div></div></details>
            <label className={styles.check}><input className={checkboxStyles.checkbox} type="checkbox" checked={draft.enabled} onChange={event => change({ enabled: event.target.checked })}/>Program etkin olsun</label>
          </fieldset> : preview ? <div className={styles.preview}>
            <strong>{loyaltySummary(preview)}</strong>
            <dl><div><dt>Geçerli ürünler</dt><dd>{selectedProducts.length ? selectedProducts.map(item => item.label).join(", ") : "Tüm uygun ürünler"}</dd></div><div><dt>Ödül</dt><dd>{preview.reward.kind === "gift" ? `${selectedGift[0]?.label || "Seçili varyant"} · ${preview.reward.quantity} adet` : preview.reward.kind === "discount" ? formatLoyaltyMoney(preview.reward.amountMinor) : selectedShipping.length ? selectedShipping.map(item => item.label).join(", ") : "Standart kargo"}</dd></div><div><dt>Satış kanalları</dt><dd>{CHANNELS.filter(channel => preview.channels.includes(channel.id)).map(channel => channel.label).join(", ")}</dd></div><div><dt>Ödülü kullanmak için</dt><dd>{preview.rewardMinimumBasketMinor ? `${formatLoyaltyMoney(preview.rewardMinimumBasketMinor)} ürün alışverişi` : "Alt limit yok"}</dd></div><div><dt>Başlangıç</dt><dd>{draft.enabled ? draft.startsOn || "Kaydedildiğinde" : "Duraklatılmış olarak kaydedilir"}</dd></div></dl>
            <div className={styles.notice}><strong>Müşteriniz ne görür?</strong><p>{preview.template === "product_gift" ? `${Math.max(0, preview.target - 2)}/${preview.target} tamamlandı. Hediyen için ${Math.min(2, preview.target)} ürün daha!` : preview.template === "spend_discount" ? `${formatLoyaltyMoney(preview.target)} hedefini tamamla, sonraki alışverişinde ${preview.reward.kind === "discount" ? formatLoyaltyMoney(preview.reward.amountMinor) : "indirim"} kazan.` : `${preview.target} alışverişi tamamla, sonraki alışverişinde ${preview.reward.kind === "gift" ? "hediyeni" : "ücretsiz kargo hakkını"} kullan.`}</p></div>
            <ul className={styles.explanation}><li>Ödül, hedef tamamlandıktan sonraki alışverişte kullanılır. Siparişte bir ödül kullanılabilir.</li><li>{preview.repeat ? "Fazla ilerleme bir sonraki hedefe taşınır." : "Müşteri bu programdan bir kez ödül kazanır."}{preview.template === "product_gift" && preview.repeat ? ` Örneğin ${preview.target + 2} adet ürün, bir ödül ve 2 adet ilerleme sağlar.` : ""}</li><li>{loyaltyReturnPolicy(preview)} Kullanılmış ödül geçmişi korunur; düzeltme sonraki ilerlemeye yansır.</li><li>Yalnız gerçek ödemesi tamamlanan uygun satışlar sayılır. Eski siparişler ve ücretsiz hediyeler sayılmaz.</li></ul>
          </div> : null}
          <footer className={styles.formActions}><button className={styles.secondary} type="button" disabled={step === 0 || busy} onClick={() => { setStep(current => current - 1); setMessage(""); }}>Geri</button>{step < 2 ? <button className={styles.primary} type="button" onClick={nextStep}>Devam et</button> : !readonly ? <button className={styles.primary} type="submit" disabled={busy || conflict || Boolean(pendingLoyaltyOperation())}>{busy ? "Kaydediliyor…" : programId ? "Değişiklikleri kaydet" : draft.enabled ? "Kaydet ve başlat" : "Kaydet"}</button> : null}</footer>
        </form>
      </>}
    </PanelInitialDataGate>
  </section>;
}
