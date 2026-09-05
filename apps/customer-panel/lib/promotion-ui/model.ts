import { normalizePromotionCode, parsePromotionRuleDocument, type PromotionBenefit, type PromotionPickerKind, type PromotionRuleDocument } from "@celebix/saas-contracts";

export const UNSELECTED_GIFT_VARIANT = "__gift_variant_required__";

export type PromotionTemplateId =
  | "first_paid_order_percentage" | "basket_threshold_fixed_amount" | "free_shipping" | "buy_x_get_y"
  | "quantity_tiers" | "category_percentage" | "bundle_price" | "gift" | "abandoned_cart" | "vip"
  | "influencer_code" | "custom";
export type PromotionTarget = Readonly<{ kind: PromotionPickerKind; id: string; label: string; status: "active" | "unavailable" }>;
export type PromotionDraft = Readonly<{
  templateId: PromotionTemplateId; step: number; name: string; benefit: PromotionBenefit; selectedTargets: readonly PromotionTarget[]; excludedTargets: readonly PromotionTarget[]; rewardTargets: readonly PromotionTarget[];
  audience: "everyone" | "first_paid_order" | "customer_segments" | "customer_tags" | "masked_customers" | "abandoned_cart";
  audienceIds: readonly string[]; triggerKind: "automatic" | "code"; codeInput: string; primaryCodeBaseline: string; codes: readonly string[]; startsAt: string; endsAt: string; timezone: string;
  totalUsage: number | null; perCustomerUsage: number | null; budgetMinor: number | null; orderMaximumMinor: number | null;
  minimumBasketMinor: number; minimumQuantity: number; minimumProductQuantity: number; priority: number;
  tiers: readonly Readonly<{ minimumQuantity: number; percentageBps: number }>[]; advancedOpen: boolean;
  combinationKind: "none" | "shipping_only" | "benefit_classes"; combinationBenefitClasses: readonly PromotionBenefit["kind"][];
  marginPolicy: "warn" | "floor_at_cost" | "maximum_percentage"; maximumMarginPercentageBps: number;
  paymentMethodIds: readonly string[]; shippingMethodIds: readonly string[]; salesChannels: readonly string[]; progressMessages: boolean;
}>;
export type PromotionCheckState = Readonly<{ conflictsReady: boolean; conflictsBlocking: boolean; marginReady: boolean }>;

export const WIZARD_STEPS = Object.freeze([
  "Müşteri ne kazanacak?", "Nerede geçerli olacak?", "Kimler kullanabilecek?", "Ne zaman ve hangi sınırlarla?", "Sonucu kontrol edin ve yayınlayın",
] as const);

const benefit = (kind: PromotionBenefit["kind"], percentageBps = 1_000): PromotionBenefit => {
  switch (kind) {
    case "percentage": return Object.freeze({ kind, percentageBps });
    case "fixed_amount": return Object.freeze({ kind, amountMinor: 10_000, currency: "TRY" });
    case "free_shipping": return Object.freeze({ kind });
    case "buy_x_get_y": return Object.freeze({ kind, buyQuantity: 2, receiveQuantity: 1, discountPercentageBps: 10_000, reward: { strategy: "same_product_cheapest" as const } });
    case "quantity_tiers": return Object.freeze({ kind, tiers: Object.freeze([{ minimumQuantity: 3, percentageBps: 1_500 }]) });
    case "bundle_price": return Object.freeze({ kind, items: Object.freeze([]), bundlePriceMinor: 0, currency: "TRY" });
    case "gift": return Object.freeze({ kind, giftVariantId: UNSELECTED_GIFT_VARIANT, quantity: 1, autoAdd: true });
  }
};

export const PROMOTION_TEMPLATES = Object.freeze([
  { id: "first_paid_order_percentage", title: "İlk alışveriş indirimi", help: "İlk ücretli siparişte yüzde indirim.", benefit: "percentage", audience: "first_paid_order" },
  { id: "basket_threshold_fixed_amount", title: "Sepet tutarına indirim", help: "Belirlediğiniz sepet tutarından sonra sabit indirim.", benefit: "fixed_amount", audience: "everyone" },
  { id: "free_shipping", title: "Ücretsiz kargo", help: "Müşterinin kargo ücretini kaldırın.", benefit: "free_shipping", audience: "everyone" },
  { id: "buy_x_get_y", title: "Alana bedava veya indirimli", help: "İstenen adet alındığında ödül verin.", benefit: "buy_x_get_y", audience: "everyone" },
  { id: "quantity_tiers", title: "Adet kademesi", help: "Adet arttıkça indirimi büyütün.", benefit: "quantity_tiers", audience: "everyone" },
  { id: "category_percentage", title: "Kategori indirimi", help: "Seçtiğiniz kategoride yüzde indirim.", benefit: "percentage", audience: "everyone" },
  { id: "bundle_price", title: "Paket fiyatı", help: "Seçili ürünleri tek paket fiyatına sunun.", benefit: "bundle_price", audience: "everyone" },
  { id: "gift", title: "Ücretsiz hediye", help: "Siparişe seçtiğiniz hediyeyi ekleyin.", benefit: "gift", audience: "everyone" },
  { id: "abandoned_cart", title: "Yarım kalan sepet", help: "Sepetini tamamlamayan müşterilere özel teklif.", benefit: "percentage", audience: "abandoned_cart" },
  { id: "vip", title: "VIP grup veya etiket", help: "Seçili müşteri gruplarına özel teklif.", benefit: "percentage", audience: "customer_segments" },
  { id: "influencer_code", title: "Influencer kodu", help: "Paylaşılabilir kupon koduyla indirim.", benefit: "percentage", audience: "everyone" },
  { id: "custom", title: "Özel kampanya", help: "Kampanyayı baştan kendiniz kurun.", benefit: "percentage", audience: "everyone" },
] as const satisfies readonly Readonly<{ id: PromotionTemplateId; title: string; help: string; benefit: PromotionBenefit["kind"]; audience: PromotionDraft["audience"] }>[]);

function template(id: PromotionTemplateId) { const found = PROMOTION_TEMPLATES.find((item) => item.id === id); if (!found) throw new TypeError("promotion_template_invalid"); return found; }
function frozen<T>(value: T): T { return Object.freeze(value); }
function templateBenefit(templateId: PromotionTemplateId, kind: PromotionBenefit["kind"]): PromotionBenefit { return benefit(kind, templateId === "category_percentage" ? 2_000 : 1_000); }

export function createPromotionDraft(templateId: PromotionTemplateId, timezone = "Europe/Istanbul"): PromotionDraft {
  const selected = template(templateId);
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }); } catch { throw new TypeError("promotion_timezone_invalid"); }
  const codeInput = templateId === "influencer_code" ? "INFLUENCER10" : "";
  const minimumBasketMinor = templateId === "basket_threshold_fixed_amount" ? 100_000 : templateId === "free_shipping" ? 75_000 : templateId === "gift" ? 500_000 : 0;
  return frozen({ templateId, step: 0, name: selected.title, benefit: templateBenefit(templateId, selected.benefit), selectedTargets: frozen([]), excludedTargets: frozen([]), rewardTargets: frozen([]), audience: selected.audience, audienceIds: frozen([]), triggerKind: templateId === "influencer_code" ? "code" : "automatic", codeInput, primaryCodeBaseline: "", codes: frozen([]), startsAt: "", endsAt: "", timezone, totalUsage: null, perCustomerUsage: 1, budgetMinor: null, orderMaximumMinor: null, minimumBasketMinor, minimumQuantity: 0, minimumProductQuantity: 0, priority: 0, tiers: selected.benefit === "quantity_tiers" ? frozen([{ minimumQuantity: 3, percentageBps: 1_500 }]) : frozen([]), advancedOpen: false, combinationKind: "none", combinationBenefitClasses: frozen([]), marginPolicy: "warn", maximumMarginPercentageBps: 0, paymentMethodIds: frozen([]), shippingMethodIds: frozen([]), salesChannels: frozen([]), progressMessages: true });
}

export function changePromotionBenefit(draft: PromotionDraft, kind: PromotionBenefit["kind"]): PromotionDraft {
  return updatePromotionDraft(draft, { benefit: benefit(kind), ...(template(draft.templateId).benefit === kind ? {} : { templateId: "custom" }), ...(kind === "quantity_tiers" && draft.tiers.length === 0 ? { tiers: [{ minimumQuantity: 3, percentageBps: 1_500 }] } : {}) });
}

export function changePromotionAudience(draft: PromotionDraft, audience: PromotionDraft["audience"]): PromotionDraft {
  return updatePromotionDraft(draft, { audience, audienceIds: [], ...(template(draft.templateId).audience === audience ? {} : { templateId: "custom" }) });
}

function zonedEpoch(value: Date, timezone: string): number {
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(value);
  } catch { throw new TypeError("promotion_timezone_invalid"); }
  const selected = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  if (!["year", "month", "day", "hour", "minute", "second"].every((key) => /^\d{2,4}$/.test(selected[key] ?? ""))) throw new TypeError("promotion_timezone_invalid");
  return Date.UTC(Number(selected.year), Number(selected.month) - 1, Number(selected.day), Number(selected.hour), Number(selected.minute), Number(selected.second));
}

export function zonedLocalInputToIso(value: string, timezone: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new TypeError("promotion_local_time_invalid");
  const [year, month, day, hour, minute] = match.slice(1).map(Number), desired = Date.UTC(year!, month! - 1, day, hour, minute, 0), probe = new Date(desired);
  if (probe.getUTCFullYear() !== year || probe.getUTCMonth() !== month! - 1 || probe.getUTCDate() !== day || probe.getUTCHours() !== hour || probe.getUTCMinutes() !== minute) throw new TypeError("promotion_local_time_invalid");
  let candidate = desired;
  for (let attempt = 0; attempt < 4; attempt += 1) { const delta = desired - zonedEpoch(new Date(candidate), timezone); candidate += delta; if (delta === 0) break; }
  if (zonedEpoch(new Date(candidate), timezone) !== desired) throw new TypeError("promotion_local_time_invalid");
  return new Date(candidate).toISOString();
}

export function zonedCivilDayStartToIso(value: string, timezone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new TypeError("promotion_local_date_invalid");
  for (let minute = 0; minute < 24 * 60; minute += 1) {
    const hour = String(Math.floor(minute / 60)).padStart(2, "0"), part = String(minute % 60).padStart(2, "0");
    try { return zonedLocalInputToIso(`${value}T${hour}:${part}`, timezone); } catch { /* scan through a daylight-saving gap */ }
  }
  throw new TypeError("promotion_local_date_invalid");
}

export function decimalToHundredths(value: string): number | undefined {
  const match = /^(0|[1-9][0-9]*)(?:[.]([0-9]{1,2}))?$/.exec(value);
  if (!match) return undefined;
  try {
    const scaled = BigInt(match[1]!) * 100n + BigInt((match[2] ?? "").padEnd(2, "0") || "0");
    return scaled <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(scaled) : undefined;
  } catch { return undefined; }
}

export function formatPromotionMinor(minor: number, currency: string): string {
  if (!Number.isSafeInteger(minor) || minor < 0 || !/^[A-Z]{3}$/.test(currency)) throw new TypeError("promotion_money_invalid");
  const exact = BigInt(minor), whole = exact / 100n, fraction = (exact % 100n).toString().padStart(2, "0");
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 }).format(whole)},${fraction}\u00a0${currency}`;
}

export function isoToZonedLocalInput(value: string, timezone: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) throw new TypeError("promotion_timestamp_invalid");
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const selected = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  if (!["year", "month", "day", "hour", "minute"].every((key) => /^\d{2,4}$/.test(selected[key] ?? ""))) throw new TypeError("promotion_timezone_invalid");
  return `${selected.year}-${selected.month}-${selected.day}T${selected.hour}:${selected.minute}`;
}

export function promotionDraftFromDetail(detail: Readonly<{ name: string; ruleDocument: PromotionRuleDocument }>): PromotionDraft {
  const rule = detail.ruleDocument;
  const targets = rule.targets.include.map((target) => frozen({ ...target, label: target.id, status: "active" as const }));
  const excludedTargets = rule.targets.exclude.map((target) => frozen({ ...target, label: target.id, status: "active" as const }));
  const firstCode = rule.trigger.kind === "code" ? rule.trigger.codes[0] ?? "" : "";
  const rewardTargets = rule.benefit.kind === "buy_x_get_y" && rule.benefit.reward.strategy === "selected_products_cheapest" ? rule.benefit.reward.productIds.map((id) => frozen({ kind: "product" as const, id, label: id, status: "active" as const })) : [];
  return frozen({ ...createPromotionDraft("custom"), name: detail.name, benefit: rule.benefit, selectedTargets: frozen(targets), excludedTargets: frozen(excludedTargets), rewardTargets: frozen(rewardTargets), audience: rule.audience.mode, audienceIds: frozen(rule.audience.referenceIds ?? []), triggerKind: rule.trigger.kind, codeInput: firstCode, primaryCodeBaseline: firstCode, codes: frozen(rule.trigger.kind === "code" ? rule.trigger.codes : []), startsAt: rule.schedule.startsAt ?? "", endsAt: rule.schedule.endsAt ?? "", timezone: rule.schedule.timezone, totalUsage: rule.limits.totalUsage, perCustomerUsage: rule.limits.perCustomerUsage, budgetMinor: rule.limits.budgetMinor, orderMaximumMinor: rule.limits.orderMaximumMinor, minimumBasketMinor: rule.conditions.minimumBasketMinor, minimumQuantity: rule.conditions.minimumQuantity, minimumProductQuantity: rule.conditions.minimumProductQuantity, priority: rule.priority, tiers: rule.benefit.kind === "quantity_tiers" ? frozen(rule.benefit.tiers) : frozen([]), combinationKind: rule.combinationPolicy.kind, combinationBenefitClasses: frozen(rule.combinationPolicy.kind === "benefit_classes" ? rule.combinationPolicy.benefitClasses : []), marginPolicy: rule.marginPolicy.kind, maximumMarginPercentageBps: rule.marginPolicy.kind === "maximum_percentage" ? rule.marginPolicy.maximumPercentageBps : 0, paymentMethodIds: frozen(rule.conditions.paymentMethodIds ?? []), shippingMethodIds: frozen(rule.conditions.shippingMethodIds ?? []), salesChannels: frozen(rule.conditions.salesChannels ?? []), progressMessages: rule.progressMessagePolicy.enabled });
}

export function updatePromotionDraft(draft: PromotionDraft, update: Partial<PromotionDraft>): PromotionDraft {
  const step = update.step === undefined ? draft.step : update.step;
  if (!Number.isSafeInteger(step) || step < 0 || step > 4 || !Number.isSafeInteger(update.priority ?? draft.priority) || (update.priority ?? draft.priority) < 0 || (update.priority ?? draft.priority) > 1_000) throw new TypeError("promotion_draft_invalid");
  return frozen({ ...draft, ...update, step, selectedTargets: frozen([...(update.selectedTargets ?? draft.selectedTargets)]), excludedTargets: frozen([...(update.excludedTargets ?? draft.excludedTargets)]), rewardTargets: frozen([...(update.rewardTargets ?? draft.rewardTargets)]), audienceIds: frozen([...(update.audienceIds ?? draft.audienceIds)]), codes: frozen([...(update.codes ?? draft.codes)]), tiers: frozen([...(update.tiers ?? draft.tiers)]), combinationBenefitClasses: frozen([...(update.combinationBenefitClasses ?? draft.combinationBenefitClasses)]), paymentMethodIds: frozen([...(update.paymentMethodIds ?? draft.paymentMethodIds)]), shippingMethodIds: frozen([...(update.shippingMethodIds ?? draft.shippingMethodIds)]), salesChannels: frozen([...(update.salesChannels ?? draft.salesChannels)]) });
}

export function synchronizePromotionBenefitTargets(_previous: PromotionDraft, next: PromotionDraft): PromotionDraft {
  if (next.benefit.kind === "bundle_price") {
    const quantities = new Map(next.benefit.items.map((item) => [item.variantId, item.quantity]));
    return updatePromotionDraft(next, {
      benefit: {
        ...next.benefit,
        items: next.selectedTargets
          .filter((target) => target.kind === "variant")
          .map((target) => ({ variantId: target.id, quantity: quantities.get(target.id) ?? 1 })),
      },
    });
  }
  return next;
}

export function selectPromotionTarget(draft: PromotionDraft, candidate: PromotionTarget): PromotionDraft {
  if (candidate.status !== "active" || draft.selectedTargets.some((item) => item.kind === candidate.kind && item.id === candidate.id)) return draft;
  return updatePromotionDraft(draft, { selectedTargets: [...draft.selectedTargets, candidate] });
}

function canonicalCode(value: string) { try { return normalizePromotionCode(value); } catch { return value; } }
function targetIdentity(target: PromotionTarget) { return { kind: target.kind, id: target.id }; }
function byteOrder(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function effectiveCodes(draft: PromotionDraft): readonly string[] {
  if (draft.triggerKind !== "code") return frozen([]);
  const input = normalizePromotionCode(draft.codeInput);
  const stored = draft.codes.map(normalizePromotionCode);
  if (stored.length === 0) return frozen([input]);
  const baseline = draft.primaryCodeBaseline ? normalizePromotionCode(draft.primaryCodeBaseline) : "";
  if (baseline && stored.includes(baseline)) return frozen(stored.map((code) => code === baseline ? input : code));
  if (stored.includes(input)) return frozen(stored);
  return frozen([input, ...stored]);
}

function snapshotCodes(draft: PromotionDraft): readonly string[] {
  if (draft.triggerKind !== "code") return frozen([]);
  try { return effectiveCodes(draft); }
  catch {
    const stored = draft.codes.map(canonicalCode);
    const input = canonicalCode(draft.codeInput);
    const baseline = canonicalCode(draft.primaryCodeBaseline);
    if (stored.includes(input)) return frozen(stored);
    if (baseline && stored.includes(baseline)) return frozen(stored.map((code) => code === baseline ? input : code));
    return frozen([input, ...stored]);
  }
}

function canonicalBenefit(value: PromotionBenefit): PromotionBenefit {
  if (value.kind !== "bundle_price") return value;
  return frozen({ ...value, items: frozen([...value.items].sort((left, right) => byteOrder(left.variantId, right.variantId))) });
}

export function promotionDraftSnapshot(draft: PromotionDraft): string {
  return JSON.stringify({
    name: draft.name,
    benefit: draft.benefit.kind === "quantity_tiers" ? frozen({ kind: "quantity_tiers" as const, tiers: frozen([...draft.tiers]) }) : canonicalBenefit(draft.benefit),
    trigger: draft.triggerKind === "code" ? { kind: "code", codes: [...snapshotCodes(draft)].sort(byteOrder) } : { kind: "automatic" },
    selectedTargets: [...draft.selectedTargets].map(targetIdentity).sort((left, right) => byteOrder(`${left.kind}:${left.id}`, `${right.kind}:${right.id}`)),
    excludedTargets: [...draft.excludedTargets].map(targetIdentity).sort((left, right) => byteOrder(`${left.kind}:${left.id}`, `${right.kind}:${right.id}`)),
    audience: { mode: draft.audience, ...(["customer_segments", "customer_tags", "masked_customers"].includes(draft.audience) ? { referenceIds: [...draft.audienceIds].sort(byteOrder) } : {}) },
    schedule: { timezone: draft.timezone, startsAt: draft.startsAt, endsAt: draft.endsAt },
    limits: { totalUsage: draft.totalUsage, perCustomerUsage: draft.perCustomerUsage, budgetMinor: draft.budgetMinor, orderMaximumMinor: draft.orderMaximumMinor },
    conditions: { minimumBasketMinor: draft.minimumBasketMinor, minimumQuantity: draft.minimumQuantity, minimumProductQuantity: draft.minimumProductQuantity },
    combination: { kind: draft.combinationKind, ...(draft.combinationKind === "benefit_classes" ? { benefitClasses: [...draft.combinationBenefitClasses].sort(byteOrder) } : {}) },
    margin: { kind: draft.marginPolicy, ...(draft.marginPolicy === "maximum_percentage" ? { maximumPercentageBps: draft.maximumMarginPercentageBps } : {}) },
    paymentMethodIds: [...draft.paymentMethodIds].sort(byteOrder),
    shippingMethodIds: [...draft.shippingMethodIds].sort(byteOrder),
    salesChannels: [...draft.salesChannels].sort(byteOrder),
    progressMessages: draft.progressMessages,
    ...(draft.benefit.kind === "quantity_tiers" ? { tiers: [...draft.tiers] } : {}),
  });
}

export function validatePromotionDraft(draft: PromotionDraft): readonly string[] {
  const issues: string[] = [];
  if (draft.triggerKind === "code") {
    try {
      const codes = effectiveCodes(draft);
      if (new Set(codes).size !== codes.length) issues.push("Kupon kodları birbirinden farklı olmalı.");
    } catch { issues.push("Kupon kodunda yalnız büyük harf, rakam, tire ve alt çizgi kullanın."); }
  }
  if (draft.endsAt !== "" && (draft.startsAt === "" || draft.endsAt <= draft.startsAt)) issues.push("Bitiş zamanı başlangıçtan sonra olmalı.");
  if (draft.benefit.kind === "quantity_tiers" && draft.tiers.some((tier, index) => !Number.isSafeInteger(tier.minimumQuantity) || !Number.isSafeInteger(tier.percentageBps) || tier.minimumQuantity < 1 || tier.percentageBps < 1 || tier.percentageBps > 10_000 || (index > 0 && tier.minimumQuantity <= draft.tiers[index - 1]!.minimumQuantity))) issues.push("Kademe adetleri artan ve birbirinden farklı olmalı.");
  if (draft.totalUsage !== null && (!Number.isSafeInteger(draft.totalUsage) || draft.totalUsage < 1 || (draft.perCustomerUsage !== null && draft.totalUsage < draft.perCustomerUsage))) issues.push("Toplam kullanım sınırı müşteri başı sınırdan küçük olamaz.");
  if (draft.perCustomerUsage !== null && (!Number.isSafeInteger(draft.perCustomerUsage) || draft.perCustomerUsage < 1)) issues.push("Müşteri başı kullanım sınırı en az 1 olmalı.");
  if (draft.name.trim().length === 0 || draft.name !== draft.name.trim() || draft.name.length > 200) issues.push("Kampanya adı 1–200 karakter olmalı ve başında veya sonunda boşluk bulunmamalı.");
  try { new Intl.DateTimeFormat("en-US", { timeZone: draft.timezone }); } catch { issues.push("Geçerli bir saat dilimi seçin."); }
  if (draft.templateId === "category_percentage" && !draft.selectedTargets.some((target) => target.kind === "category")) issues.push("Kategori indirimi için en az bir kategori seçin.");
  if (draft.templateId === "vip" && draft.audienceIds.length === 0) issues.push("VIP kampanyası için en az bir müşteri grubu seçin.");
  if (["customer_segments", "customer_tags", "masked_customers"].includes(draft.audience) && draft.audienceIds.length === 0) issues.push("Seçtiğiniz müşteri hedefi için en az bir kayıt ekleyin.");
  if (draft.combinationKind === "benefit_classes" && draft.combinationBenefitClasses.length === 0) issues.push("Birlikte kullanılabilecek en az bir avantaj seçin.");
  if (draft.benefit.kind === "gift" && draft.benefit.giftVariantId === UNSELECTED_GIFT_VARIANT) issues.push("Hediye olarak gerçek bir varyant seçin.");
  if (draft.benefit.kind === "bundle_price" && (draft.benefit.items.length === 0 || draft.benefit.bundlePriceMinor < 1)) issues.push("Paket için ürünleri ve geçerli fiyatı seçin.");
  if (issues.length === 0) { try { promotionRuleDocument(draft); } catch { issues.push("Bazı kampanya ayarları geçersiz. İşaretli alanları yeniden kontrol edin."); } }
  return frozen(issues);
}

export function promotionSummary(draft: PromotionDraft): string {
  const who = draft.audience === "everyone" ? "herkes için" : draft.audience === "first_paid_order" ? "ilk alışverişte" : draft.audience === "abandoned_cart" ? "yarım kalan sepeti olan müşteriler için" : "seçtiğiniz müşteriler için";
  const reward = draft.benefit.kind === "free_shipping" ? "ücretsiz kargo" : draft.benefit.kind === "percentage" ? `%${draft.benefit.percentageBps / 100} indirim` : draft.benefit.kind === "fixed_amount" ? `${draft.benefit.amountMinor / 100} TL indirim` : draft.benefit.kind === "gift" ? "ücretsiz hediye" : "özel avantaj";
  return `${draft.name}: ${who} ${reward}.`;
}

export function publishEligibility(draft: PromotionDraft, checks: PromotionCheckState): Readonly<{ canPublish: boolean; reason: string | null }> {
  if (validatePromotionDraft(draft).length > 0) return frozen({ canPublish: false, reason: "Eksik veya hatalı alanları tamamlayın." });
  if (!checks.conflictsReady || !checks.marginReady) return frozen({ canPublish: false, reason: "Yayınlamadan önce kontrol sonuçlarını bekleyin." });
  if (checks.conflictsBlocking) return frozen({ canPublish: false, reason: "Çakışan bir kampanya varken yayınlayamazsınız." });
  return frozen({ canPublish: true, reason: null });
}

export function promotionRuleDocument(draft: PromotionDraft): PromotionRuleDocument {
  if (draft.benefit.kind === "gift" && draft.benefit.giftVariantId === UNSELECTED_GIFT_VARIANT) throw new TypeError("promotion_gift_reference_required");
  const codes = effectiveCodes(draft);
  const selectedTargets = draft.selectedTargets.filter((item) => ["product", "variant", "category", "brand", "collection"].includes(item.kind)).map(({ kind, id }) => frozen({ kind: kind as "product" | "variant" | "category" | "brand" | "collection", id }));
  const excludedTargets = draft.excludedTargets.filter((item) => ["product", "variant", "category", "brand", "collection"].includes(item.kind)).map(({ kind, id }) => frozen({ kind: kind as "product" | "variant" | "category" | "brand" | "collection", id }));
  const selectedBenefit = draft.benefit.kind === "quantity_tiers" ? frozen({ kind: "quantity_tiers" as const, tiers: frozen(draft.tiers.map((tier) => frozen({ ...tier }))) }) : draft.benefit;
  const raw = { schemaVersion: 1, benefit: selectedBenefit, targets: { mode: selectedTargets.length ? "selected" : "all", include: selectedTargets, exclude: excludedTargets }, audience: { mode: draft.audience, ...(["customer_segments", "customer_tags", "masked_customers"].includes(draft.audience) ? { referenceIds: draft.audienceIds } : {}) }, trigger: codes.length ? { kind: "code", codes } : { kind: "automatic" }, schedule: { timezone: draft.timezone, ...(draft.startsAt ? { startsAt: draft.startsAt } : {}), ...(draft.endsAt ? { endsAt: draft.endsAt } : {}) }, limits: { totalUsage: draft.totalUsage, perCustomerUsage: draft.perCustomerUsage, budgetMinor: draft.budgetMinor, orderMaximumMinor: draft.orderMaximumMinor }, conditions: { minimumBasketMinor: draft.minimumBasketMinor, minimumQuantity: draft.minimumQuantity, minimumProductQuantity: draft.minimumProductQuantity, ...(draft.paymentMethodIds.length ? { paymentMethodIds: draft.paymentMethodIds } : {}), ...(draft.shippingMethodIds.length ? { shippingMethodIds: draft.shippingMethodIds } : {}), ...(draft.salesChannels.length ? { salesChannels: draft.salesChannels } : {}) }, combinationPolicy: draft.combinationKind === "benefit_classes" ? { kind: "benefit_classes", benefitClasses: draft.combinationBenefitClasses } : { kind: draft.combinationKind }, priority: draft.priority, marginPolicy: draft.marginPolicy === "maximum_percentage" ? { kind: "maximum_percentage", maximumPercentageBps: draft.maximumMarginPercentageBps } : { kind: draft.marginPolicy }, progressMessagePolicy: { enabled: draft.progressMessages } };
  return parsePromotionRuleDocument(raw);
}
