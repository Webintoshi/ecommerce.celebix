"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PromotionBenefit, PromotionConflictCheck, PromotionLegacyReason, PromotionMarginCheck, PromotionPickerKind, PromotionStatus } from "@celebix/saas-contracts";
import { createDirtyNavigationGuard } from "@/lib/catalog-ui/dirty-navigation";
import { promotionApi, promotionErrorMessage } from "@/lib/promotion-ui/client";
import {
  changePromotionAudience, changePromotionBenefit, createPromotionDraft, decimalToHundredths, isoToZonedLocalInput, promotionDraftFromDetail,
  PROMOTION_TEMPLATES, promotionDraftSnapshot, promotionSummary, publishEligibility, synchronizePromotionBenefitTargets, updatePromotionDraft,
  UNSELECTED_GIFT_VARIANT, validatePromotionDraft, WIZARD_STEPS, zonedLocalInputToIso, type PromotionDraft, type PromotionTarget,
} from "@/lib/promotion-ui/model";
import { PromotionSimulator } from "./PromotionSimulator";
import { PromotionPicker, PromotionTargetPicker } from "./PromotionTargetPicker";
import styles from "./promotion-studio.module.css";

type EditorProps = Readonly<{ templateId?: typeof PROMOTION_TEMPLATES[number]["id"]; promotionId?: string; timezone: string; canManage: boolean; canPublish: boolean; canArchive: boolean; readOnly?: boolean }>;
type Checks = Readonly<{ conflicts: PromotionConflictCheck | null; margin: PromotionMarginCheck | null }>;
const EMPTY_CHECKS: Checks = Object.freeze({ conflicts: null, margin: null });
const BENEFITS: readonly Readonly<{ kind: PromotionBenefit["kind"]; title: string; help: string }>[] = Object.freeze([
  { kind: "percentage", title: "Yüzde indirimi", help: "Örnek: %10" },
  { kind: "fixed_amount", title: "Sabit tutar indirimi", help: "Örnek: 100 TL" },
  { kind: "free_shipping", title: "Ücretsiz kargo", help: "Kargo ücretini kaldırır" },
  { kind: "buy_x_get_y", title: "X al Y kazan", help: "Örnek: 2 al, 1 ücretsiz" },
  { kind: "quantity_tiers", title: "Adet arttıkça indirim", help: "Örnek: 3 üründe %15" },
  { kind: "bundle_price", title: "Paket fiyatı", help: "Birlikte alınca özel fiyat" },
  { kind: "gift", title: "Hediye ürün", help: "Sepete ücretsiz ürün ekler" },
]);
const AUDIENCES = Object.freeze([
  ["everyone", "Herkes"], ["first_paid_order", "İlk siparişini verecek müşteriler"], ["customer_segments", "Belirli müşteri grupları"],
  ["customer_tags", "Belirli müşteri etiketleri"], ["masked_customers", "Belirli müşteriler"], ["abandoned_cart", "Terk edilmiş sepeti olan müşteriler"],
] as const);
const CONFLICT_COPY: Readonly<Record<string, string>> = Object.freeze({
  benefit_currency_mismatch: "Kampanya para birimi mağazayla uyuşmuyor.", budget_zero: "Kampanya bütçesi sıfır olamaz.",
  coupon_code_conflict: "Bu kupon kodu başka bir kampanyada kullanılıyor.", customer_usage_limit_zero: "Müşteri kullanım sınırı sıfır olamaz.",
  gift_stock_unavailable: "Seçilen hediye şu anda stokta değil.", margin_percentage_zero: "Azami indirim oranı sıfır olamaz.",
  no_eligible_catalog_items: "Kampanyaya uygun aktif ürün bulunamadı.", order_maximum_zero: "Sipariş başına indirim sınırı sıfır olamaz.",
  reference_unavailable: "Seçtiğiniz kayıtlardan biri artık kullanılamıyor.", schedule_ended: "Kampanyanın bitiş tarihi geçmişte kalıyor.",
  target_include_exclude_conflict: "Aynı kayıt hem dahil edilmiş hem hariç tutulmuş.", usage_limit_zero: "Toplam kullanım sınırı sıfır olamaz.",
  schedule_target_overlap: "Aynı tarihlerde aynı ürünlere dokunan başka bir kampanya var.", discount_may_exceed_item_price: "İndirim bazı ürünlerin tutarını aşabilir.",
});
const LEGACY_REASON_COPY: Readonly<Record<PromotionLegacyReason, string>> = Object.freeze({
  adopted: "Bu eski kayıt yeni kampanyaya bağlandı.",
  unsupported_discount_type: "Bu indirim türü otomatik dönüştürülemiyor.",
  invalid_value: "İndirim tutarı güvenli biçimde dönüştürülemiyor.",
  invalid_minimum_order: "Minimum sipariş şartı güvenli biçimde dönüştürülemiyor.",
  invalid_usage_limit: "Kullanım sınırı güvenli biçimde dönüştürülemiyor.",
  invalid_code: "Kupon kodu güvenli biçimde dönüştürülemiyor.",
  code_conflict: "Kupon kodu başka bir kampanyayla çakışıyor.",
  invalid_legacy_record: "Eski kaydın bazı alanları eksik veya geçersiz.",
});

function money(minor: number | null) { return minor === null ? "" : String(minor / 100); }
function minor(value: string): number | null | undefined {
  if (value === "") return null;
  return decimalToHundredths(value);
}
function positiveInteger(value: string): number | null | undefined {
  if (value === "") return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount >= 1 ? amount : undefined;
}
function localTime(value: string, timezone: string) { try { return value ? isoToZonedLocalInput(value, timezone) : ""; } catch { return ""; } }
function reference(kind: PromotionPickerKind, ids: readonly string[]): readonly PromotionTarget[] { return ids.map((id) => ({ kind, id, label: id, status: "active" })); }

function BenefitFields({ draft, change }: Readonly<{ draft: PromotionDraft; change(update: Partial<PromotionDraft>): void }>) {
  const benefit = draft.benefit;
  if (benefit.kind === "percentage") return <label>İndirim yüzdesi<span>Örnek: %10</span><input aria-label="İndirim yüzdesi" type="number" min="0.01" max="100" step="0.01" value={benefit.percentageBps / 100} onChange={(event) => { const value = decimalToHundredths(event.target.value); if (value !== undefined) change({ benefit: { ...benefit, percentageBps: value } }); }} /></label>;
  if (benefit.kind === "fixed_amount") return <label>Kaç TL indirim yapılsın?<span>Örnek: 100 TL</span><input type="number" min="0.01" step="0.01" value={money(benefit.amountMinor)} onChange={(event) => { const value = minor(event.target.value); if (typeof value === "number") change({ benefit: { ...benefit, amountMinor: value } }); }} /></label>;
  if (benefit.kind === "free_shipping") return <p className={styles.info}>Uygun sepette kargo ücreti güvenli olarak sıfırlanır. Kargo yöntemi sınırını gelişmiş ayarlardan seçebilirsiniz.</p>;
  if (benefit.kind === "buy_x_get_y") return <div className={styles.fieldGrid}>
    <label>Müşteri kaç ürün almalı?<span>Örnek: 2 ürün</span><input type="number" min="1" value={benefit.buyQuantity} onChange={(event) => change({ benefit: { ...benefit, buyQuantity: Number(event.target.value) } })} /></label>
    <label>Kaç ürün avantajlı olsun?<span>Örnek: 1 ürün</span><input type="number" min="1" value={benefit.receiveQuantity} onChange={(event) => change({ benefit: { ...benefit, receiveQuantity: Number(event.target.value) } })} /></label>
    <label>Bu ürünlere yüzde kaç indirim?<span>Ücretsiz olması için %100</span><input type="number" min="0.01" max="100" step="0.01" value={benefit.discountPercentageBps / 100} onChange={(event) => { const value = decimalToHundredths(event.target.value); if (value !== undefined) change({ benefit: { ...benefit, discountPercentageBps: value } }); }} /></label>
    <label>Avantaj hangi ürüne uygulansın?<select value={benefit.reward.strategy} onChange={(event) => change({ benefit: event.target.value === "same_product_cheapest"
      ? { ...benefit, reward: { strategy: "same_product_cheapest" } }
      : event.target.value === "selected_products_cheapest"
        ? { ...benefit, reward: { strategy: "selected_products_cheapest", productIds: draft.rewardTargets.map((item) => item.id) } }
        : { ...benefit, reward: { strategy: "specific_variant", variantId: benefit.reward.strategy === "specific_variant" ? benefit.reward.variantId : UNSELECTED_GIFT_VARIANT } },
    })}><option value="same_product_cheapest">Aynı ürünün en ucuzu</option><option value="selected_products_cheapest">Seçili ürünlerden en ucuzu</option><option value="specific_variant">Belirli bir varyant</option></select></label>
    {benefit.reward.strategy === "selected_products_cheapest" ? <PromotionPicker title="Ödül olarak seçilebilecek ürünler" help="Bu seçim, kampanyanın geçerli olduğu ürünlerden bağımsızdır." kinds={["product"]} selected={draft.rewardTargets} onChange={(items) => change({ rewardTargets: items, benefit: { ...benefit, reward: { strategy: "selected_products_cheapest", productIds: items.map((item) => item.id) } } })} /> : null}
    {benefit.reward.strategy === "specific_variant" ? <PromotionPicker title="Avantajlı varyantı seçin" help="Yalnız seçtiğiniz varyant avantajlı olur." kinds={["variant"]} selected={benefit.reward.variantId === UNSELECTED_GIFT_VARIANT ? [] : reference("variant", [benefit.reward.variantId])} onChange={(items) => change({ benefit: { ...benefit, reward: { strategy: "specific_variant", variantId: items[0]?.id ?? UNSELECTED_GIFT_VARIANT } } })} /> : null}
  </div>;
  if (benefit.kind === "quantity_tiers") return <div><div className={styles.tiers}>{draft.tiers.map((tier, index) => <div key={index} className={styles.inlineRow}>
    <label>Ürün adedi<input type="number" min="1" value={tier.minimumQuantity} onChange={(event) => change({ tiers: draft.tiers.map((item, row) => row === index ? { ...item, minimumQuantity: Number(event.target.value) } : item) })} /></label>
    <label>İndirim yüzdesi<input type="number" min="0.01" max="100" step="0.01" value={tier.percentageBps / 100} onChange={(event) => { const value = decimalToHundredths(event.target.value); if (value !== undefined) change({ tiers: draft.tiers.map((item, row) => row === index ? { ...item, percentageBps: value } : item) }); }} /></label>
    <button type="button" className={styles.textButton} disabled={draft.tiers.length === 1} onClick={() => change({ tiers: draft.tiers.filter((_, row) => row !== index) })}>Kaldır</button>
  </div>)}</div><button type="button" className={styles.secondaryButton} onClick={() => change({ tiers: [...draft.tiers, { minimumQuantity: (draft.tiers.at(-1)?.minimumQuantity ?? 0) + 1, percentageBps: draft.tiers.at(-1)?.percentageBps ?? 1_000 }] })}>Kademe ekle</button></div>;
  if (benefit.kind === "bundle_price") return <div className={styles.fieldGrid}><label>Paket toplam fiyatı<span>Örnek: 4.999 TL</span><input type="number" min="0.01" step="0.01" value={money(benefit.bundlePriceMinor)} onChange={(event) => { const value = minor(event.target.value); if (typeof value === "number") change({ benefit: { ...benefit, bundlePriceMinor: value } }); }} /></label><p className={styles.info}>Paketteki varyantları ve her birinden kaç adet gerektiğini bir sonraki adımda seçin.</p></div>;
  const giftSelection = benefit.giftVariantId === UNSELECTED_GIFT_VARIANT ? [] : reference("variant", [benefit.giftVariantId]);
  return <div><PromotionPicker title="Hediye ürünü seçin" help="Yalnız aktif ve stokta olan varyantlar listelenir." kinds={["variant"]} selected={giftSelection} onChange={(items) => change({ benefit: { ...benefit, giftVariantId: items[0]?.id ?? UNSELECTED_GIFT_VARIANT } })} /><div className={styles.fieldGrid}><label>Kaç adet hediye?<input type="number" min="1" value={benefit.quantity} onChange={(event) => change({ benefit: { ...benefit, quantity: Number(event.target.value) } })} /></label><label className={styles.checkLabel}><input type="checkbox" checked={benefit.autoAdd} onChange={(event) => change({ benefit: { ...benefit, autoAdd: event.target.checked } })} /> Uygunsa sepete otomatik eklensin</label></div></div>;
}

function StepOne({ draft, change }: Readonly<{ draft: PromotionDraft; change(update: Partial<PromotionDraft>): void }>) {
  return <section className={styles.stepPanel} aria-labelledby="promotion-step-title"><div><span className={styles.eyebrow}>1 / 5</span><h2 id="promotion-step-title">Müşteriye ne kazandırmak istiyorsunuz?</h2><p>Bir avantaj seçin; ayrıntıları daha sonra değiştirebilirsiniz.</p></div>
    <label>Kampanya adı<span>Örnek: Hafta sonu kargo avantajı</span><input value={draft.name} maxLength={200} onChange={(event) => change({ name: event.target.value })} /></label>
    <div className={styles.choiceGrid}>{BENEFITS.map((item) => <button type="button" key={item.kind} className={draft.benefit.kind === item.kind ? styles.selectedChoice : styles.choice} aria-pressed={draft.benefit.kind === item.kind} onClick={() => { const next = changePromotionBenefit(draft, item.kind); change({ benefit: next.benefit, templateId: next.templateId, ...(item.kind === "quantity_tiers" ? { tiers: next.tiers } : {}) }); }}><strong>{item.title}</strong><span>{item.help}</span></button>)}</div>
    <BenefitFields draft={draft} change={change} />
    <fieldset><legend>Kampanya nasıl çalışsın?</legend><label className={styles.radioLabel}><input type="radio" name="trigger" checked={draft.triggerKind === "automatic"} onChange={() => change({ triggerKind: "automatic" })} /> Koşullar sağlanınca otomatik uygulansın</label><label className={styles.radioLabel}><input type="radio" name="trigger" checked={draft.triggerKind === "code"} onChange={() => change({ triggerKind: "code" })} /> Müşteri kod girince çalışsın</label>{draft.triggerKind === "code" ? <label>Müşterinin yazacağı kod<span>Örnek: HOSGELDIN10</span><input value={draft.codeInput} autoCapitalize="characters" onChange={(event) => change({ codeInput: event.target.value })} /></label> : null}</fieldset>
  </section>;
}

function StepTwo({ draft, replace }: Readonly<{ draft: PromotionDraft; replace(next: PromotionDraft): void }>) {
  const sync = (next: PromotionDraft) => replace(synchronizePromotionBenefitTargets(draft, next));
  return <section className={styles.stepPanel} aria-labelledby="promotion-step-title"><div><span className={styles.eyebrow}>2 / 5</span><h2 id="promotion-step-title">İndirim nerede geçerli olsun?</h2><p>Hiç seçim yapmazsanız tüm mağazada geçerli olur.</p></div><PromotionTargetPicker draft={draft} mode="include" onChange={sync} />{draft.benefit.kind === "bundle_price" && draft.benefit.items.length > 0 ? <fieldset><legend>Paket içindeki varyant adetleri</legend><div className={styles.tiers}>{draft.benefit.items.map((item) => <label key={item.variantId}>{draft.selectedTargets.find((target) => target.kind === "variant" && target.id === item.variantId)?.label ?? item.variantId}<input aria-label={`${item.variantId} paket adedi`} type="number" min="1" max="1000000" value={item.quantity} onChange={(event) => { const quantity = positiveInteger(event.target.value); if (typeof quantity === "number" && draft.benefit.kind === "bundle_price") replace(updatePromotionDraft(draft, { benefit: { ...draft.benefit, items: draft.benefit.items.map((current) => current.variantId === item.variantId ? { ...current, quantity } : current) } })); }} /></label>)}</div></fieldset> : null}<PromotionTargetPicker draft={draft} mode="exclude" onChange={sync} /></section>;
}

function StepThree({ draft, change }: Readonly<{ draft: PromotionDraft; change(update: Partial<PromotionDraft>): void }>) {
  const audienceKind: PromotionPickerKind | null = draft.audience === "customer_segments" ? "customer_segment" : draft.audience === "customer_tags" ? "customer_tag" : draft.audience === "masked_customers" ? "masked_customer" : null;
  const replaceAudience = (audience: PromotionDraft["audience"]) => { const next = changePromotionAudience(draft, audience); change({ audience: next.audience, audienceIds: next.audienceIds, templateId: next.templateId }); };
  return <section className={styles.stepPanel} aria-labelledby="promotion-step-title"><div><span className={styles.eyebrow}>3 / 5</span><h2 id="promotion-step-title">Kimler kullanabilsin?</h2><p>Varsayılan olarak kampanyayı herkes kullanabilir.</p></div><div className={styles.choiceGrid}>{AUDIENCES.map(([value, label]) => <button key={value} type="button" aria-pressed={draft.audience === value} className={draft.audience === value ? styles.selectedChoice : styles.choice} onClick={() => replaceAudience(value)}>{label}</button>)}</div>{audienceKind ? <PromotionPicker title="Müşteri hedefini seçin" help={audienceKind === "masked_customer" ? "Müşteri bilgileri gizlenmiş olarak gösterilir." : "Mevcut müşteri kayıtlarınız kullanılır."} kinds={[audienceKind]} selected={reference(audienceKind, draft.audienceIds)} onChange={(items) => change({ audienceIds: items.map((item) => item.id) })} /> : null}</section>;
}

function StepFour({ draft, change, onScheduleInvalid }: Readonly<{ draft: PromotionDraft; change(update: Partial<PromotionDraft>): void; onScheduleInvalid(invalid: boolean): void }>) {
  return <section className={styles.stepPanel} aria-labelledby="promotion-step-title"><div><span className={styles.eyebrow}>4 / 5</span><h2 id="promotion-step-title">Ne zaman çalışsın ve sınırları ne olsun?</h2><p>Sınır istemediğiniz alanları boş bırakın. Saatler mağazanızın saat dilimine göre kaydedilir.</p></div><div className={styles.fieldGrid}>
    <label>Ne zaman başlasın?<span>Boşsa taslak yayınlandığında başlar.</span><input type="datetime-local" value={localTime(draft.startsAt, draft.timezone)} onChange={(event) => { try { const startsAt = event.target.value ? zonedLocalInputToIso(event.target.value, draft.timezone) : ""; onScheduleInvalid(false); change({ startsAt }); } catch { onScheduleInvalid(true); } }} /></label>
    <label>Ne zaman bitsin?<span>Bitiş tarihi istemiyorsanız boş bırakın.</span><input type="datetime-local" value={localTime(draft.endsAt, draft.timezone)} onChange={(event) => { try { const endsAt = event.target.value ? zonedLocalInputToIso(event.target.value, draft.timezone) : ""; onScheduleInvalid(false); change({ endsAt }); } catch { onScheduleInvalid(true); } }} /></label>
    <label>Toplam kaç kez kullanılabilsin?<span>Sınırsız için boş bırakın.</span><input type="number" min="1" value={draft.totalUsage ?? ""} onChange={(event) => { const value = positiveInteger(event.target.value); if (value !== undefined) change({ totalUsage: value }); }} /></label>
    <label>Bir müşteri kaç kez kullanabilsin?<span>Önerilen: 1 kez</span><input type="number" min="1" value={draft.perCustomerUsage ?? ""} onChange={(event) => { const value = positiveInteger(event.target.value); if (value !== undefined) change({ perCustomerUsage: value }); }} /></label>
    <label>Kampanyanın toplam bütçesi<span>Örnek: 10.000 TL; sınırsız için boş.</span><input type="number" min="0.01" step="0.01" value={money(draft.budgetMinor)} onChange={(event) => { const value = minor(event.target.value); if (value !== undefined) change({ budgetMinor: value }); }} /></label>
    <label>Sipariş başına en fazla indirim<span>Örnek: 250 TL; sınır yoksa boş.</span><input type="number" min="0.01" step="0.01" value={money(draft.orderMaximumMinor)} onChange={(event) => { const value = minor(event.target.value); if (value !== undefined) change({ orderMaximumMinor: value }); }} /></label>
  </div></section>;
}

function AdvancedSettings({ draft, change, toggle }: Readonly<{ draft: PromotionDraft; change(update: Partial<PromotionDraft>): void; toggle(open: boolean): void }>) {
  return <details open={draft.advancedOpen} onToggle={(event) => toggle(event.currentTarget.open)} className={styles.advanced}><summary>Gelişmiş ayarlar</summary><div className={styles.advancedBody}>
    <div className={styles.fieldGrid}><label>Müşteri en az ne kadar alışveriş yapmalı?<span>Örnek: 1.000 TL</span><input type="number" min="0" step="0.01" value={money(draft.minimumBasketMinor)} onChange={(event) => { const value = minor(event.target.value); if (typeof value === "number") change({ minimumBasketMinor: value }); }} /></label><label>Sepette en az kaç ürün olmalı?<input type="number" min="0" value={draft.minimumQuantity} onChange={(event) => change({ minimumQuantity: Number(event.target.value) })} /></label><label>Seçili üründen en az kaç adet olmalı?<input type="number" min="0" value={draft.minimumProductQuantity} onChange={(event) => change({ minimumProductQuantity: Number(event.target.value) })} /></label></div>
    <fieldset><legend>Bu kampanya başka indirimlerle birlikte kullanılabilsin mi?</legend><label className={styles.radioLabel}><input type="radio" name="combine" checked={draft.combinationKind === "none"} onChange={() => change({ combinationKind: "none" })} /> Hayır — müşteriye en avantajlı olan uygulansın</label><label className={styles.radioLabel}><input type="radio" name="combine" checked={draft.combinationKind === "shipping_only"} onChange={() => change({ combinationKind: "shipping_only" })} /> Yalnız ücretsiz kargoyla birlikte</label><label className={styles.radioLabel}><input type="radio" name="combine" checked={draft.combinationKind === "benefit_classes"} onChange={() => change({ combinationKind: "benefit_classes" })} /> Seçtiğim avantajlarla birlikte</label>{draft.combinationKind === "benefit_classes" ? <div className={styles.inlineChecks}>{BENEFITS.map((item) => <label key={item.kind}><input type="checkbox" checked={draft.combinationBenefitClasses.includes(item.kind)} onChange={(event) => change({ combinationBenefitClasses: event.target.checked ? [...draft.combinationBenefitClasses, item.kind] : draft.combinationBenefitClasses.filter((kind) => kind !== item.kind) })} />{item.title}</label>)}</div> : null}</fieldset>
    <fieldset><legend>Kâr koruması</legend><label className={styles.radioLabel}><input type="radio" name="margin" checked={draft.marginPolicy === "warn"} onChange={() => change({ marginPolicy: "warn" })} /> Risk varsa beni uyar</label><label className={styles.radioLabel}><input type="radio" name="margin" checked={draft.marginPolicy === "floor_at_cost"} onChange={() => change({ marginPolicy: "floor_at_cost" })} /> Maliyet altına düşmesin</label><label className={styles.radioLabel}><input type="radio" name="margin" checked={draft.marginPolicy === "maximum_percentage"} onChange={() => change({ marginPolicy: "maximum_percentage" })} /> En fazla belirlediğim oranda indirim yap</label>{draft.marginPolicy === "maximum_percentage" ? <label>En yüksek indirim yüzdesi<input type="number" min="0.01" max="100" step="0.01" value={draft.maximumMarginPercentageBps / 100} onChange={(event) => { const value = decimalToHundredths(event.target.value); if (value !== undefined) change({ maximumMarginPercentageBps: value }); }} /></label> : null}</fieldset>
    <PromotionPicker title="Geçerli ödeme yöntemleri" help="Boş bırakırsanız tüm ödeme yöntemlerinde geçerli olur." kinds={["payment_method"]} selected={reference("payment_method", draft.paymentMethodIds)} onChange={(items) => change({ paymentMethodIds: items.map((item) => item.id) })} />
    <PromotionPicker title="Geçerli kargo yöntemleri" help="Boş bırakırsanız tüm kargo yöntemlerinde geçerli olur." kinds={["shipping_method"]} selected={reference("shipping_method", draft.shippingMethodIds)} onChange={(items) => change({ shippingMethodIds: items.map((item) => item.id) })} />
    <fieldset><legend>Satış kanalı</legend><div className={styles.inlineChecks}>{[["storefront", "Online mağaza"], ["quick_order", "Hızlı sipariş"]].map(([value, label]) => <label key={value}><input type="checkbox" checked={draft.salesChannels.includes(value)} onChange={(event) => change({ salesChannels: event.target.checked ? [...draft.salesChannels, value] : draft.salesChannels.filter((item) => item !== value) })} />{label}</label>)}</div></fieldset>
    <label>Eşit avantajlarda öne alınsın mı?<select value={draft.priority} onChange={(event) => change({ priority: Number(event.target.value) })}><option value={0}>Normal sırada</option><option value={100}>Öne al</option></select></label>
    <label className={styles.checkLabel}><input type="checkbox" checked={draft.progressMessages} onChange={(event) => change({ progressMessages: event.target.checked })} /> Sepette müşteriye ulaşabileceği avantajı göster</label>
  </div></details>;
}

function CheckResults({ checks }: Readonly<{ checks: Checks }>) {
  if (!checks.conflicts || !checks.margin) return <p className={styles.info}>Yayınlamadan önce çakışma ve kâr riskini kontrol edin.</p>;
  return <div className={styles.checkResults} aria-live="polite"><h3>Kontrol sonucu</h3>{checks.conflicts.findings.length === 0 ? <p className={styles.success}>Kampanyayı engelleyen bir çakışma bulunmadı.</p> : checks.conflicts.findings.map((finding) => <p key={`${finding.code}:${finding.relatedPromotionId ?? "self"}`} role={finding.severity === "blocking" ? "alert" : "status"}>{CONFLICT_COPY[finding.code] ?? "Kampanya ayarlarını yeniden kontrol edin."}{finding.relatedPromotionName ? ` İlgili kampanya: ${finding.relatedPromotionName}` : ""}</p>)}{checks.margin.status === "warning" ? <p role="status">Bazı ürünler maliyet fiyatının altına düşebilir. Kâr korumasını değerlendirin.</p> : checks.margin.status === "unknown" ? <p role="status">Bazı ürünlerde maliyet bilgisi olmadığı için kesin kâr hesabı gösterilemiyor.</p> : <p className={styles.success}>Bilinen maliyetlerde açık bir risk görünmüyor.</p>}</div>;
}

export function PromotionEditor({ templateId = "custom", promotionId, timezone, canManage, canPublish, canArchive, readOnly = false }: EditorProps) {
  const initial = useMemo(() => createPromotionDraft(templateId, timezone), [templateId, timezone]);
  const [draft, setDraft] = useState<PromotionDraft>(initial);
  const [savedSnapshot, setSavedSnapshot] = useState(() => promotionDraftSnapshot(initial));
  const [message, setMessage] = useState("");
  const [checks, setChecks] = useState<Checks>(EMPTY_CHECKS);
  const [checkKey, setCheckKey] = useState("");
  const [currentId, setCurrentId] = useState(promotionId);
  const [version, setVersion] = useState<number | null>(null);
  const [status, setStatus] = useState<PromotionStatus>("draft");
  const [loading, setLoading] = useState(Boolean(promotionId));
  const [mutating, setMutating] = useState(false);
  const [missing, setMissing] = useState(false);
  const [legacyReason, setLegacyReason] = useState<PromotionLegacyReason | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [scheduleInvalid, setScheduleInvalid] = useState(false);
  const simulationId = useRef(promotionId ?? crypto.randomUUID());
  const draftRef = useRef(draft); draftRef.current = draft;
  const versionRef = useRef(version); versionRef.current = version;
  const checksController = useRef<AbortController | null>(null);
  const stepFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!promotionId) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(promotionId)) { setMissing(true); setLoading(false); return; }
    const controller = new AbortController(); setLoading(true);
    void (async () => {
      try {
        const detail = await promotionApi.detail(promotionId, controller.signal);
        const next = promotionDraftFromDetail(detail); setDraft(next); setSavedSnapshot(promotionDraftSnapshot(next)); setVersion(detail.version); setStatus(detail.status); setCurrentId(detail.id); simulationId.current = detail.id;
      } catch (error) {
        if (controller.signal.aborted) return;
        if (!(error instanceof Error) || error.message !== "not_found") throw error;
        try {
          const legacy = await promotionApi.resolveLegacy(promotionId, controller.signal);
          if (legacy.promotionId) {
            window.location.replace(`/discounts/${legacy.promotionId}${readOnly ? "" : "/edit"}`);
            return;
          }
          setLegacyReason(legacy.reason);
        } catch (legacyError) {
          if (controller.signal.aborted) return;
          if (legacyError instanceof Error && legacyError.message === "not_found") setMissing(true);
          else throw legacyError;
        }
      }
    })().catch(() => { if (!controller.signal.aborted) { setLoadError(true); setMessage("Kampanya bilgileri yüklenemedi."); } }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [promotionId, readOnly]);

  useEffect(() => () => checksController.current?.abort(), []);

  useEffect(() => { stepFocusRef.current?.focus(); }, [draft.step]);

  useEffect(() => {
    const guard = createDirtyNavigationGuard({ isDirty: () => promotionDraftSnapshot(draftRef.current) !== savedSnapshot, confirm: () => window.confirm("Kaydedilmemiş kampanya değişiklikleriniz var. Ayrılmak istiyor musunuz?") });
    const unload = guard.bindBeforeUnload(window); const links = guard.bindApplicationNavigation(document, () => window.location.href);
    return () => { unload(); links(); };
  }, [savedSnapshot]);

  const resetChecks = () => { checksController.current?.abort(); setCheckKey(""); setChecks(EMPTY_CHECKS); };
  const change = (update: Partial<PromotionDraft>) => { resetChecks(); setDraft((current) => updatePromotionDraft(current, update)); };
  const changeUi = (update: Pick<PromotionDraft, "step"> | Pick<PromotionDraft, "advancedOpen">) => setDraft((current) => updatePromotionDraft(current, update));
  const replace = (next: PromotionDraft) => { resetChecks(); setDraft(next); };
  const currentSnapshot = promotionDraftSnapshot(draft);
  const effectiveReadOnly = readOnly || status === "archived";
  const dirty = currentSnapshot !== savedSnapshot;
  const errors = scheduleInvalid ? [...validatePromotionDraft(draft), "Bu yerel saat mağazanın saat diliminde mevcut değil."] : validatePromotionDraft(draft);
  const checksState = { conflictsReady: checks.conflicts !== null, conflictsBlocking: checks.conflicts?.blocking ?? false, marginReady: checks.margin !== null };
  const eligibility = publishEligibility(draft, checksState);
  const authorityKey = `${currentSnapshot}:${version ?? "new"}`;
  const publishReady = Boolean(currentId && version && currentSnapshot === savedSnapshot && checkKey === authorityKey && eligibility.canPublish && status === "draft");

  const save = () => {
    if (!canManage || effectiveReadOnly || mutating) return;
    if (errors.length > 0) { setMessage("Eksik veya hatalı alanları tamamlayın."); return; }
    setMutating(true); setMessage("Taslak kaydediliyor…");
    void promotionApi.save(draft, currentId, currentId ? version ?? undefined : undefined, currentId ? status : undefined).then((result) => {
      if (result.kind === "saved") {
        const next = promotionDraftFromDetail(result.promotion); setDraft(next); setSavedSnapshot(promotionDraftSnapshot(next)); setVersion(result.promotion.version); setStatus(result.promotion.status); setCurrentId(result.promotion.id); simulationId.current = result.promotion.id; window.history.replaceState(null, "", `/discounts/${result.promotion.id}/edit`); setMessage("Taslak güvenle kaydedildi.");
      } else if (result.kind === "version_conflict") setMessage("Bu kampanya başka bir kullanıcı tarafından güncellendi. Yaptığınız değişiklikler korunuyor; sayfayı yenilemeden önce kopyalayabilirsiniz.");
      else setMessage(result.message);
    }).catch((error: unknown) => setMessage(promotionErrorMessage(error instanceof Error ? error.message : "promotion_unavailable"))).finally(() => setMutating(false));
  };

  const runChecks = () => {
    if (errors.length > 0) { setMessage("Kontrol için önce eksik alanları tamamlayın."); return; }
    checksController.current?.abort(); const controller = new AbortController(); checksController.current = controller; const key = authorityKey; setChecks(EMPTY_CHECKS); setCheckKey(""); setMessage("Kampanya kontrol ediliyor…");
    void promotionApi.check(draft, currentId, currentId ? version ?? undefined : undefined, controller.signal).then((result) => {
      const liveKey = `${promotionDraftSnapshot(draftRef.current)}:${versionRef.current ?? "new"}`;
      if (key !== liveKey) return;
      setChecks(result); setCheckKey(key); setMessage(result.conflicts.blocking ? "Yayınlamadan önce engelleyici sorunları düzeltin." : "Kontroller tamamlandı.");
    }).catch(() => { const liveKey = `${promotionDraftSnapshot(draftRef.current)}:${versionRef.current ?? "new"}`; if (!controller.signal.aborted && key === liveKey) setMessage("Kontroller şu anda çalıştırılamadı. Biraz sonra tekrar deneyin."); });
  };

  const runLifecycle = (action: "publish" | "pause" | "resume" | "archive") => {
    if (!currentId || !version || (action === "archive" ? !canArchive : !canPublish) || effectiveReadOnly || mutating) return;
    if (dirty) { setMessage("Önce yaptığınız değişiklikleri taslak olarak kaydedin."); return; }
    const nextStatus = draft.startsAt && draft.startsAt > new Date().toISOString() ? "scheduled" : "active";
    setMutating(true); void promotionApi.lifecycle(currentId, version, action, nextStatus).then((result) => {
      if (result.kind === "saved") { const next = promotionDraftFromDetail(result.promotion); setDraft(next); setSavedSnapshot(promotionDraftSnapshot(next)); setVersion(result.promotion.version); setStatus(result.promotion.status); setChecks(EMPTY_CHECKS); setCheckKey(""); setMessage(action === "archive" ? "Kampanya arşivlendi." : action === "pause" ? "Kampanya duraklatıldı." : "Kampanya yayına alındı."); }
      else if (result.kind === "version_conflict") setMessage("Kampanya başka bir kullanıcı tarafından değiştirildi. Yerel bilgileriniz korunuyor.");
      else if (result.kind === "publish_blocked") { setChecks((current) => ({ ...current, conflicts: result.readiness })); setMessage("Yayınlamayı engelleyen sorunları düzeltin."); }
      else setMessage(result.message);
    }).catch((error: unknown) => setMessage(promotionErrorMessage(error instanceof Error ? error.message : "promotion_unavailable"))).finally(() => setMutating(false));
  };

  const leave = () => {
    const guard = createDirtyNavigationGuard({ isDirty: () => promotionDraftSnapshot(draftRef.current) !== savedSnapshot, confirm: () => window.confirm("Kaydedilmemiş kampanya değişiklikleriniz var. Ayrılmak istiyor musunuz?") });
    if (guard.canLeave()) window.location.assign("/discounts");
  };

  if (loading) return <div className={styles.skeleton} role="status">Kampanya bilgileri yükleniyor…</div>;
  if (legacyReason) return <section className={styles.warning} role="status"><h1>Eski indirim kaydı</h1><p>Bu kayıt yeni kampanyaya güvenle dönüştürülemedi. Mevcut veri korunuyor ve yalnız görüntülenebilir.</p><p>{LEGACY_REASON_COPY[legacyReason]}</p><a href="/discounts">Kampanyalara dön</a></section>;
  if (missing) return <section className={styles.warning} role="status"><h1>Bu kampanya bulunamadı</h1><p>Kayıt başka bir mağazaya ait olabilir veya artık kullanılamıyor olabilir.</p><a href="/discounts">Kampanyalara dön</a></section>;
  if (loadError) return <section className={styles.warning} role="alert"><h1>Kampanya açılamadı</h1><p>Bilgiler güvenli biçimde yüklenemediği için düzenleme kapatıldı.</p><button type="button" onClick={() => window.location.reload()}>Yeniden dene</button></section>;

  return <section className={styles.editor}>
    <header className={styles.editorHeader}><div><span className={styles.eyebrow}>{effectiveReadOnly ? "Kampanya görünümü" : currentId ? "Kampanyayı düzenle" : "Yeni kampanya"}</span><h1>{draft.name || "Adsız kampanya"}</h1><p>Durum: <strong>{status === "draft" ? "Taslak" : status === "active" ? "Aktif" : status === "scheduled" ? "Planlandı" : status === "paused" ? "Duraklatıldı" : "Arşivlendi"}</strong></p></div>{currentId && !effectiveReadOnly ? <a href={`/discounts/${currentId}`}>Salt okunur görünüm</a> : null}</header>
    <ol className={styles.steps} aria-label="Kampanya oluşturma adımları">{WIZARD_STEPS.length === 5 && WIZARD_STEPS.map((label, index) => <li key={label}><button type="button" onClick={() => changeUi({ step: index })} aria-current={draft.step === index ? "step" : undefined}><span>{index + 1}</span><em>{label}</em></button></li>)}</ol>
    <p className={styles.srOnly} role="status" aria-live="polite">Adım {draft.step + 1}: {WIZARD_STEPS[draft.step]}</p>
    <div className={styles.editorLayout}><section className={styles.editorWorkspace} ref={stepFocusRef} tabIndex={-1} aria-label="Kampanya düzenleme adımı"><fieldset className={styles.editorFieldset} disabled={effectiveReadOnly || mutating}>
      {draft.step === 0 ? <StepOne draft={draft} change={change} /> : null}
      {draft.step === 1 ? <StepTwo draft={draft} replace={replace} /> : null}
      {draft.step === 2 ? <StepThree draft={draft} change={change} /> : null}
      {draft.step === 3 ? <StepFour draft={draft} change={change} onScheduleInvalid={(invalid) => { setScheduleInvalid(invalid); if (invalid) setMessage("Bu yerel saat mağazanın saat diliminde mevcut değil."); }} /> : null}
      {draft.step === 4 ? <section className={styles.stepPanel} aria-labelledby="promotion-step-title"><div><span className={styles.eyebrow}>5 / 5</span><h2 id="promotion-step-title">Kontrol edin ve yayınlayın</h2><p>{promotionSummary(draft)}</p></div><AdvancedSettings draft={draft} change={change} toggle={(open) => changeUi({ advancedOpen: open })} /><CheckResults checks={checks} />{errors.length > 0 ? <div className={styles.errorSummary} role="alert"><h3>Tamamlanması gerekenler</h3><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}</section> : null}
      </fieldset>{draft.step === 4 ? <PromotionSimulator draft={draft} promotionId={simulationId.current} expectedVersion={currentId ? version : null} /> : null}<div className={styles.stepNavigation}>{draft.step > 0 ? <button type="button" className={styles.secondaryButton} onClick={() => changeUi({ step: draft.step - 1 })}>Geri</button> : <span />}{draft.step < 4 ? <button type="button" className={styles.primaryButton} onClick={() => changeUi({ step: draft.step + 1 })}>Devam et</button> : null}</div></section>
      <aside className={styles.sticky} aria-label="Canlı kampanya özeti"><span className={styles.eyebrow}>Kampanya özeti</span><strong>{promotionSummary(draft)}</strong><dl><div><dt>Kullanım</dt><dd>{draft.perCustomerUsage === null ? "Sınırsız" : `Müşteri başına ${draft.perCustomerUsage} kez`}</dd></div><div><dt>Tarih</dt><dd>{draft.startsAt || draft.endsAt ? "Belirlenen tarih aralığı" : "Yayınlandığında başlar"}</dd></div><div><dt>Diğer indirimlerle</dt><dd>{draft.combinationKind === "none" ? "Birleşmez" : draft.combinationKind === "shipping_only" ? "Yalnız ücretsiz kargoyla" : "Seçilen avantajlarla"}</dd></div></dl><button type="button" className={styles.secondaryButton} disabled={mutating} onClick={runChecks}>Yayın öncesi kontrol</button>{checkKey === authorityKey && checks.conflicts && !checks.conflicts.blocking ? <span className={styles.success}>Kontrol tamamlandı</span> : null}</aside>
    </div>
    {message ? <p role="status" className={styles.toast}>{message}</p> : null}
    <footer className={styles.actionBar}><button type="button" className={styles.textButton} disabled={mutating} onClick={leave}>Vazgeç</button>{canManage && !effectiveReadOnly ? <button type="button" className={styles.secondaryButton} disabled={mutating} onClick={save}>Taslak kaydet</button> : null}{canPublish && !effectiveReadOnly && currentId && (status === "active" || status === "scheduled") ? <button type="button" className={styles.secondaryButton} disabled={dirty || mutating} onClick={() => runLifecycle("pause")}>Duraklat</button> : null}{canPublish && !effectiveReadOnly && currentId && status === "paused" ? <button type="button" className={styles.secondaryButton} disabled={dirty || mutating} onClick={() => runLifecycle("resume")}>Devam ettir</button> : null}{canArchive && !effectiveReadOnly && currentId ? <button type="button" className={styles.dangerButton} disabled={dirty || mutating} onClick={() => window.confirm("Kampanya arşivlensin mi? Geçmiş siparişler korunur.") && runLifecycle("archive")}>Arşivle</button> : null}{canPublish && !effectiveReadOnly ? <button type="button" className={styles.primaryButton} disabled={!publishReady || mutating} onClick={() => runLifecycle("publish")}>Yayınla</button> : null}</footer>
    {!publishReady && draft.step === 4 && eligibility.reason ? <p className={styles.publishReason}>{currentId ? eligibility.reason : "Yayınlamadan önce taslağı kaydedin ve kontrolleri çalıştırın."}</p> : null}
  </section>;
}
